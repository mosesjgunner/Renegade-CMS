import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { loadConfig } from '../../core/config'
import { uploadMedia } from '../../media/workflow'
import { inspectMedia, mediaStorage } from '../../media/storage'
import { legacyBodyToLexical } from './body'
import type { LayoutBlock, PageLayout } from '../../public/page-builder'
import type { MigrationReport, QuarantineRecord } from './types'

export interface LegacyMigrationStore {
  createSite(data: {
    name: string
    slug: string
    description?: string
  }): Promise<{ id: string; slug: string }>
  findSite(siteIdOrSlug: string): Promise<{ id: string; slug: string; name: string } | null>
  deleteSite(siteId: string): Promise<void>

  createAuthor(data: {
    siteId: string
    displayName: string
    slug: string
    email?: string
  }): Promise<{ id: string }>
  findAuthor(siteId: string, slug: string): Promise<{ id: string } | null>

  createCategory(data: {
    siteId: string
    name: string
    slug: string
    parentId?: string
    description?: string
  }): Promise<{ id: string }>
  findCategory(siteId: string, slug: string): Promise<{ id: string } | null>

  createTag(data: {
    siteId: string
    name: string
    slug: string
    description?: string
  }): Promise<{ id: string }>
  findTag(siteId: string, slug: string): Promise<{ id: string } | null>

  createMedia(data: {
    siteId: string
    fileName: string
    mimeType: string
    bytes: Uint8Array
    sha256: string
    title?: string
    altText?: string
    caption?: string
    width?: number
    height?: number
  }): Promise<{ id: string; url: string }>
  findMediaBySha256(siteId: string, sha256: string): Promise<{ id: string; url: string } | null>

  createContent(data: {
    siteId: string
    contentType: 'article' | 'page'
    title: string
    slug: string
    canonicalPath: string
    excerpt?: string
    body: string
    status: 'draft' | 'published'
    publishedAt?: string
    authorIds?: string[]
    categoryIds?: string[]
    tagIds?: string[]
    featuredMediaId?: string
    seoTitle?: string
    seoDescription?: string
    parentPageId?: string
  }): Promise<{ id: string }>
  findContent(siteId: string, slug: string, canonicalPath?: string): Promise<{ id: string } | null>

  createRedirect(data: {
    siteId: string
    fromPath: string
    toPath: string
    statusCode?: string
    enabled?: boolean
  }): Promise<{ id: string }>
  findRedirect(siteId: string, fromPath: string): Promise<{ id: string } | null>

  createLayout(data: {
    siteId: string
    path: string
    name?: string
    status: 'draft' | 'published'
    themeId: string
    surface: PageLayout['surface']
    slot: PageLayout['slot']
    templateId?: string
    templateMode?: PageLayout['templateMode']
    blocks: LayoutBlock[]
  }): Promise<{ id: string }>
  findLayout(siteId: string, path: string): Promise<{ id: string } | null>

  publishLayout(id: string): Promise<void>
  deleteEntity(collection: string, id: string): Promise<void>
  /**
   * Rollback preparation: clear the references a migration's own lifecycle
   * created between its content records — the article-family rows keyed to
   * the content and child-page parentPage links inside the created set —
   * so the native hierarchy guards can judge the rollback deletions on
   * their merits. References from anything outside the created set are
   * not touched.
   */
  clearContentRollbackReferences(contentIds: string[]): Promise<void>

  /**
   * Rollback preparation: remove the publication record(s) the site
   * lifecycle auto-created for the migration site (the Sites afterChange
   * hook creates one default publication for every new site). The
   * migration module never creates publications and imports no state
   * into them; they are rollback's own lifecycle artifacts, and the
   * site hierarchy guard rightly counts them as site records until
   * they are removed.
   */
  deleteSitePublications(siteId: string): Promise<void>

  /**
   * Rollback preparation: remove the physical blob records the media
   * lifecycle created for the migration's imported media (uploadMedia
   * creates one deduplicated blob per site + checksum for every imported
   * asset), once the created assets are deleted and no remaining asset
   * or variant references them. Blobs are system records (API create /
   * delete are denied); the product itself deletes them with access
   * override in its own lifecycle cleanup paths.
   */
  deleteSiteMediaBlobs(siteId: string): Promise<void>

  saveMigrationRun(report: MigrationReport): Promise<void>
  getMigrationRun(runId: string): Promise<MigrationReport | null>

  saveQuarantineRecords(records: QuarantineRecord[]): Promise<void>
  getQuarantineRecords(runId: string): Promise<QuarantineRecord[]>
}

/** In-memory store implementation for testing and dry-run preflight */
export class MemoryLegacyMigrationStore implements LegacyMigrationStore {
  sites = new Map<string, { id: string; slug: string; name: string }>()
  authors = new Map<string, { id: string; siteId: string; displayName: string; slug: string }>()
  categories = new Map<
    string,
    { id: string; siteId: string; name: string; slug: string; parentId?: string }
  >()
  tags = new Map<string, { id: string; siteId: string; name: string; slug: string }>()
  media = new Map<
    string,
    { id: string; siteId: string; url: string; sha256: string; fileName: string }
  >()
  content = new Map<string, Record<string, unknown>>()
  redirects = new Map<string, Record<string, unknown>>()
  layouts = new Map<string, Record<string, unknown>>()
  publications = new Map<string, { id: string; siteId: string; slug: string }>()
  blobs = new Map<string, { id: string; siteId: string; sha256: string }>()
  runs = new Map<string, MigrationReport>()
  quarantine = new Map<string, QuarantineRecord[]>()

  async createSite(data: {
    name: string
    slug: string
    description?: string
  }): Promise<{ id: string; slug: string }> {
    const id = `site-${randomUUID().slice(0, 8)}`
    const site = { id, slug: data.slug, name: data.name }
    this.sites.set(id, site)
    this.sites.set(data.slug, site)
    // Mirror the real site lifecycle: the Sites afterChange hook creates
    // one default publication for every new site.
    const publicationId = `pub-${randomUUID().slice(0, 8)}`
    this.publications.set(publicationId, { id: publicationId, siteId: id, slug: data.slug })
    return { id, slug: data.slug }
  }

  async findSite(siteIdOrSlug: string): Promise<{ id: string; slug: string; name: string } | null> {
    return this.sites.get(siteIdOrSlug) ?? null
  }

  async deleteSite(siteId: string): Promise<void> {
    const site = this.sites.get(siteId)
    if (site) {
      this.sites.delete(site.id)
      this.sites.delete(site.slug)
    }
  }

  async createAuthor(data: {
    siteId: string
    displayName: string
    slug: string
  }): Promise<{ id: string }> {
    const id = `auth-${randomUUID().slice(0, 8)}`
    this.authors.set(`${data.siteId}:${data.slug}`, { id, ...data })
    return { id }
  }

  async findAuthor(siteId: string, slug: string): Promise<{ id: string } | null> {
    const found = this.authors.get(`${siteId}:${slug}`)
    return found ? { id: found.id } : null
  }

  async createCategory(data: {
    siteId: string
    name: string
    slug: string
    parentId?: string
  }): Promise<{ id: string }> {
    const id = `cat-${randomUUID().slice(0, 8)}`
    this.categories.set(`${data.siteId}:${data.slug}`, { id, ...data })
    return { id }
  }

  async findCategory(siteId: string, slug: string): Promise<{ id: string } | null> {
    const found = this.categories.get(`${siteId}:${slug}`)
    return found ? { id: found.id } : null
  }

  async createTag(data: { siteId: string; name: string; slug: string }): Promise<{ id: string }> {
    const id = `tag-${randomUUID().slice(0, 8)}`
    this.tags.set(`${data.siteId}:${data.slug}`, { id, ...data })
    return { id }
  }

  async findTag(siteId: string, slug: string): Promise<{ id: string } | null> {
    const found = this.tags.get(`${siteId}:${slug}`)
    return found ? { id: found.id } : null
  }

  async createMedia(data: {
    siteId: string
    fileName: string
    mimeType: string
    bytes: Uint8Array
    sha256: string
  }): Promise<{ id: string; url: string }> {
    const id = `media-${randomUUID().slice(0, 8)}`
    const url = `/media/${id}`
    this.media.set(id, {
      id,
      siteId: data.siteId,
      url,
      sha256: data.sha256,
      fileName: data.fileName,
    })
    // Mirror uploadMedia: one deduplicated blob per site + checksum.
    const blobKey = `${data.siteId}:${data.sha256}`
    if (!this.blobs.has(blobKey))
      this.blobs.set(blobKey, {
        id: `blob-${randomUUID().slice(0, 8)}`,
        siteId: data.siteId,
        sha256: data.sha256,
      })
    return { id, url }
  }

  async findMediaBySha256(
    siteId: string,
    sha256: string,
  ): Promise<{ id: string; url: string } | null> {
    for (const m of this.media.values()) {
      if (m.siteId === siteId && m.sha256 === sha256) return { id: m.id, url: m.url }
    }
    return null
  }

  async createContent(data: Record<string, unknown> & { siteId: string }): Promise<{ id: string }> {
    const id = `content-${randomUUID().slice(0, 8)}`
    this.content.set(id, { id, ...data })
    return { id }
  }

  async findContent(
    siteId: string,
    slug: string,
    canonicalPath?: string,
  ): Promise<{ id: string } | null> {
    for (const c of this.content.values()) {
      if (
        c.siteId === siteId &&
        (canonicalPath ? c.canonicalPath === canonicalPath : c.slug === slug)
      )
        return { id: String(c.id) }
    }
    return null
  }

  async createRedirect(data: Record<string, unknown>): Promise<{ id: string }> {
    const id = `redir-${randomUUID().slice(0, 8)}`
    this.redirects.set(id, { id, ...data })
    return { id }
  }

  async findRedirect(siteId: string, fromPath: string): Promise<{ id: string } | null> {
    for (const r of this.redirects.values()) {
      if (r.siteId === siteId && r.fromPath === fromPath) return { id: String(r.id) }
    }
    return null
  }

  async createLayout(data: Record<string, unknown>): Promise<{ id: string }> {
    const id = `layout-${randomUUID().slice(0, 8)}`
    this.layouts.set(id, { id, ...data })
    return { id }
  }

  async findLayout(siteId: string, path: string): Promise<{ id: string } | null> {
    for (const l of this.layouts.values()) {
      if (l.siteId === siteId && l.path === path) return { id: String(l.id) }
    }
    return null
  }

  async publishLayout(id: string): Promise<void> {
    const layout = this.layouts.get(id)
    if (layout) layout.status = 'published'
  }

  async deleteEntity(collection: string, id: string): Promise<void> {
    if (collection === 'content') this.content.delete(id)
    else if (collection === 'authors') this.authors.delete(id)
    else if (collection === 'categories') this.categories.delete(id)
    else if (collection === 'tags') this.tags.delete(id)
    else if (collection === 'media-assets') this.media.delete(id)
    else if (collection === 'public-redirects') this.redirects.delete(id)
    else if (collection === 'page-layouts') this.layouts.delete(id)
  }

  async clearContentRollbackReferences(contentIds: string[]): Promise<void> {
    // The memory store does not model article-family rows; only the
    // child-page links inside the created set need detaching.
    const ids = new Set(contentIds)
    for (const doc of this.content.values()) {
      if (
        ids.has(String(doc.id)) &&
        typeof doc.parentPageId === 'string' &&
        ids.has(doc.parentPageId)
      )
        doc.parentPageId = undefined
    }
  }

  async deleteSitePublications(siteId: string): Promise<void> {
    for (const [id, publication] of this.publications) {
      if (publication.siteId === siteId) this.publications.delete(id)
    }
  }

  async deleteSiteMediaBlobs(siteId: string): Promise<void> {
    const liveKeys = new Set(
      [...this.media.values()]
        .filter((m) => m.siteId === siteId)
        .map((m) => `${m.siteId}:${m.sha256}`),
    )
    for (const [key, blob] of this.blobs) {
      if (blob.siteId === siteId && !liveKeys.has(key)) this.blobs.delete(key)
    }
  }

  async saveMigrationRun(report: MigrationReport): Promise<void> {
    this.runs.set(report.runId, structuredClone(report))
  }

  async getMigrationRun(runId: string): Promise<MigrationReport | null> {
    const run = this.runs.get(runId)
    return run ? structuredClone(run) : null
  }

  async saveQuarantineRecords(records: QuarantineRecord[]): Promise<void> {
    for (const r of records) {
      const list = this.quarantine.get(r.runId) ?? []
      list.push(r)
      this.quarantine.set(r.runId, list)
    }
  }

  async getQuarantineRecords(runId: string): Promise<QuarantineRecord[]> {
    return this.quarantine.get(runId) ?? []
  }
}

/** Real Payload CMS + PostgreSQL persistence store */
export class PayloadLegacyMigrationStore implements LegacyMigrationStore {
  constructor(
    private payload: Payload,
    private actor?: { id?: unknown; role?: unknown; member?: unknown },
  ) {}

  async createSite(data: {
    name: string
    slug: string
    description?: string
  }): Promise<{ id: string; slug: string }> {
    const created = (await this.payload.create({
      collection: 'sites',
      overrideAccess: true,
      // Pass the actor so the canonical Sites afterChange creator grant
      // fires for the new site (as it does for UI/API site creation).
      // Without a request user no grant is created, and the media
      // permission layer then denies the actor's own media imports
      // into the site the migration just created ("Site scope access
      // denied" MEDIA_STORE_FAILED).
      user: this.actor ? { ...this.actor, collection: 'users' } : undefined,
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        lifecycle: 'active',
        communityRegistrationPolicy: 'open',
      },
    } as never)) as { id: string; slug: string }
    return { id: String(created.id), slug: created.slug }
  }

  async findSite(siteIdOrSlug: string): Promise<{ id: string; slug: string; name: string } | null> {
    try {
      const byId = await this.payload.findByID({
        collection: 'sites',
        id: siteIdOrSlug,
        depth: 0,
        overrideAccess: true,
      })
      if (byId) return { id: String(byId.id), slug: byId.slug, name: byId.name }
    } catch {
      // not UUID, fallback to slug
    }

    const bySlug = await this.payload.find({
      collection: 'sites',
      where: { slug: { equals: siteIdOrSlug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (bySlug.docs[0]) {
      const doc = bySlug.docs[0]
      return { id: String(doc.id), slug: doc.slug, name: doc.name }
    }
    return null
  }

  async deleteSite(siteId: string): Promise<void> {
    // Native hierarchy/retention guards must decide whether deletion is safe.
    await this.payload.delete({
      collection: 'sites',
      id: siteId,
      overrideAccess: false,
      user: this.actor,
    })
  }

  async createAuthor(data: {
    siteId: string
    displayName: string
    slug: string
    email?: string
  }): Promise<{ id: string }> {
    const created = await this.payload.create({
      collection: 'authors',
      overrideAccess: true,
      data: {
        displayName: data.displayName,
        slug: data.slug,
      },
    })
    return { id: String(created.id) }
  }

  async findAuthor(siteId: string, slug: string): Promise<{ id: string } | null> {
    const res = await this.payload.find({
      collection: 'authors',
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    })
    return res.docs[0] ? { id: String(res.docs[0].id) } : null
  }

  async createCategory(data: {
    siteId: string
    name: string
    slug: string
    parentId?: string
    description?: string
  }): Promise<{ id: string }> {
    const canonicalPath = `/categories/${data.slug}`
    const created = await this.payload.create({
      collection: 'categories',
      overrideAccess: true,
      data: {
        site: data.siteId,
        name: data.name,
        slug: data.slug,
        canonicalPath,
        scope: 'site',
        parent: data.parentId ?? null,
        description: data.description,
      },
    })
    return { id: String(created.id) }
  }

  async findCategory(siteId: string, slug: string): Promise<{ id: string } | null> {
    const res = await this.payload.find({
      collection: 'categories',
      where: {
        and: [{ site: { equals: siteId } }, { slug: { equals: slug } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    return res.docs[0] ? { id: String(res.docs[0].id) } : null
  }

  async createTag(data: {
    siteId: string
    name: string
    slug: string
    description?: string
  }): Promise<{ id: string }> {
    const created = await this.payload.create({
      collection: 'tags',
      overrideAccess: true,
      data: {
        site: data.siteId,
        name: data.name,
        slug: data.slug,
        scope: 'site',
        description: data.description,
      },
    })
    return { id: String(created.id) }
  }

  async findTag(siteId: string, slug: string): Promise<{ id: string } | null> {
    const res = await this.payload.find({
      collection: 'tags',
      where: {
        and: [{ site: { equals: siteId } }, { slug: { equals: slug } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    return res.docs[0] ? { id: String(res.docs[0].id) } : null
  }

  async createMedia(data: {
    siteId: string
    fileName: string
    mimeType: string
    bytes: Uint8Array
    sha256: string
    title?: string
    altText?: string
    caption?: string
    width?: number
    height?: number
  }): Promise<{ id: string; url: string }> {
    const created = await uploadMedia(this.payload, loadConfig(), {
      user: this.actor ? { ...this.actor } : undefined,
      scope: { kind: 'site', siteId: data.siteId },
      title: data.title || data.fileName,
      originalFilename: data.fileName,
      bytes: data.bytes,
      altText: data.altText,
      caption: data.caption,
    })
    return { id: String(created.id), url: `/media/${created.id}` }
  }

  async findMediaBySha256(
    siteId: string,
    sha256: string,
  ): Promise<{ id: string; url: string } | null> {
    const res = await this.payload.find({
      collection: 'media-assets',
      where: {
        and: [{ site: { equals: siteId } }, { checksum: { equals: sha256 } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    const found = res.docs[0]
    if (!found) return null
    const bytes = await mediaStorage(loadConfig()).get(String(found.storageLocation))
    if (!bytes || inspectMedia(bytes).sha256 !== sha256)
      throw new Error(`Imported original media is missing or corrupt: ${found.id}`)
    return { id: String(found.id), url: `/media/${found.id}` }
  }

  async createContent(data: {
    siteId: string
    contentType: 'article' | 'page'
    title: string
    slug: string
    canonicalPath: string
    excerpt?: string
    body: string
    status: 'draft' | 'published'
    publishedAt?: string
    authorIds?: string[]
    categoryIds?: string[]
    tagIds?: string[]
    featuredMediaId?: string
    seoTitle?: string
    seoDescription?: string
    parentPageId?: string
  }): Promise<{ id: string }> {
    const authors = (data.authorIds ?? []).map((authorId, index) => ({
      author: authorId,
      displayOrder: index + 1,
    }))
    const lexicalBody = legacyBodyToLexical(data.body)
    const created = (await this.payload.create({
      collection: 'content',
      overrideAccess: true,
      data: {
        site: data.siteId,
        contentType: data.contentType,
        title: data.title,
        slug: data.slug,
        canonicalPath: data.canonicalPath,
        // The migration's canonical path is deliberate (derived from
        // the legacy URL plan, e.g. the legacy home page maps to '/').
        // Without an explicit override the editorial path derivation
        // recomputes it from the slug ('/home'), and the migration's
        // own verification then cannot find the record at the planned
        // path (contentCountsMatch fails; stage stays 'failed').
        pathOverride: true,
        parentPage: data.parentPageId ?? null,
        excerpt: data.excerpt,
        body: lexicalBody,
        status: data.status,
        publishedAt: data.publishedAt,
        authors,
        categories: data.categoryIds ?? [],
        tags: data.tagIds ?? [],
        heroMedia: data.featuredMediaId ?? null,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
      },
    } as never)) as { id: string | number }
    return { id: String(created.id) }
  }

  async findContent(
    siteId: string,
    slug: string,
    canonicalPath?: string,
  ): Promise<{ id: string } | null> {
    const res = await this.payload.find({
      collection: 'content',
      where: {
        and: [
          { site: { equals: siteId } },
          canonicalPath ? { canonicalPath: { equals: canonicalPath } } : { slug: { equals: slug } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    return res.docs[0] ? { id: String(res.docs[0].id) } : null
  }

  async createRedirect(data: {
    siteId: string
    fromPath: string
    toPath: string
    statusCode?: string
    enabled?: boolean
  }): Promise<{ id: string }> {
    const statusCode = (data.statusCode as '301' | '302' | '307' | '308') ?? '308'
    const created = (await this.payload.create({
      collection: 'public-redirects',
      overrideAccess: true,
      data: {
        site: data.siteId,
        fromPath: data.fromPath,
        toPath: data.toPath,
        match: 'exact',
        statusCode,
        enabled: data.enabled ?? true,
      },
    } as never)) as { id: string | number }
    return { id: String(created.id) }
  }

  async findRedirect(siteId: string, fromPath: string): Promise<{ id: string } | null> {
    const res = await this.payload.find({
      collection: 'public-redirects',
      where: {
        and: [{ site: { equals: siteId } }, { fromPath: { equals: fromPath } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    return res.docs[0] ? { id: String(res.docs[0].id) } : null
  }

  async createLayout(data: {
    siteId: string
    path: string
    name?: string
    status: 'draft' | 'published'
    themeId: string
    surface: PageLayout['surface']
    slot: PageLayout['slot']
    templateId?: string
    templateMode?: PageLayout['templateMode']
    blocks: LayoutBlock[]
  }): Promise<{ id: string }> {
    const themeId = (data.themeId as 'neutral-starter' | 'renegade-party') ?? 'neutral-starter'
    const created = (await this.payload.create({
      collection: 'page-layouts',
      overrideAccess: true,
      data: {
        site: data.siteId,
        name: data.name,
        path: data.path,
        status: data.status,
        themeId,
        surface: data.surface,
        slot: data.slot,
        templateId: data.templateId,
        templateMode: data.templateMode,
        blocks: data.blocks,
        layoutVersion: 1,
        revision: 1,
        visibility: 'public',
      },
    } as never)) as { id: string | number }
    return { id: String(created.id) }
  }

  async findLayout(siteId: string, path: string): Promise<{ id: string } | null> {
    const res = await this.payload.find({
      collection: 'page-layouts',
      where: {
        and: [{ site: { equals: siteId } }, { path: { equals: path } }],
      },
      limit: 1,
      overrideAccess: true,
    })
    return res.docs[0] ? { id: String(res.docs[0].id) } : null
  }

  async publishLayout(id: string): Promise<void> {
    await this.payload.update({
      collection: 'page-layouts',
      id,
      overrideAccess: true,
      data: {
        status: 'published',
      },
      context: { publishPresentation: true },
    })
  }

  async deleteEntity(collection: string, id: string): Promise<void> {
    // Teardown authority: every caller of this method removes records the
    // migration itself created (the rollback entity loop, article-family
    // cleanup, and the site-publication teardown), addressed by IDs recorded
    // in the run's own manifest. Authorization for the rollback operation
    // itself is enforced at the operator surface (staff role plus
    // canMigrateLegacySite for the run's site). Running these deletes under
    // the actor's personal access made rollback impossible for a scoped
    // importing operator: global collections such as authors require
    // all-sites authority (operatorAllSitesAccess), which a site-scoped
    // operator can never hold in a multi-site install — so a migration that
    // created author records could never be rolled back. The store's other
    // teardown paths (migration runs, quarantine, verification artifacts,
    // rollback reference clearing, site deletion) already use overrideAccess
    // for the same reason. Collection hooks (e.g. the authors beforeDelete
    // reference guard) still run and still block deleting records in use.
    await this.payload.delete({
      collection: collection as never,
      id,
      overrideAccess: true,
      user: this.actor,
    })
  }

  async clearContentRollbackReferences(contentIds: string[]): Promise<void> {
    if (!contentIds.length) return
    // Article-family rows are created by the editorial lifecycle for every
    // imported article (the content afterChange companion sync) and
    // reference the content 1:1; they are rollback's own artifacts.
    const families = await this.payload.find({
      collection: 'article-family-content',
      where: { content: { in: contentIds } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    } as never)
    if (families.docs.length) {
      // Each family owns append-only revision records whose article link
      // is non-nullable, so a family row cannot be deleted while its
      // revisions exist. Those revisions were created by the same
      // lifecycle sync (with access override, as internal system records);
      // rollback removes exactly the revisions of its own families the
      // same way. The append-only API access rules are unchanged for
      // every other caller.
      const familyIds = families.docs.map((doc) => String(doc.id))
      const revisions = await this.payload.find({
        collection: 'revision-records',
        where: { article: { in: familyIds } },
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      } as never)
      for (const doc of revisions.docs) {
        await this.payload.delete({
          collection: 'revision-records',
          id: String(doc.id),
          overrideAccess: true,
        } as never)
      }
    }
    for (const doc of families.docs)
      await this.deleteEntity('article-family-content', String(doc.id))
    // Child pages inside the created set link to their created parents;
    // detach those links so no created parent is deleted before its
    // created children let go of it.
    const children = await this.payload.find({
      collection: 'content',
      where: {
        and: [{ id: { in: contentIds } }, { parentPage: { in: contentIds } }],
      },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    } as never)
    for (const doc of children.docs) {
      await this.payload.update({
        collection: 'content',
        id: String(doc.id),
        data: { parentPage: null },
        overrideAccess: true,
      } as never)
    }
  }

  async deleteSitePublications(siteId: string): Promise<void> {
    // The Sites afterChange hook auto-created a default publication when
    // the migration created the site; the migration imported no state
    // into it. It is rollback's own lifecycle artifact, removed here
    // through the same native delete path as every other created entity
    // (the site hierarchy guard still judges the site delete itself).
    const publications = await this.payload.find({
      collection: 'publications',
      where: { site: { equals: siteId } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    } as never)
    for (const doc of publications.docs) await this.deleteEntity('publications', String(doc.id))
  }

  async deleteSiteMediaBlobs(siteId: string): Promise<void> {
    // Blobs are the physical bytes uploadMedia stored for the migration's
    // imported assets, deduplicated per site + checksum. A blob is
    // rollback's own artifact only once nothing references it: assets
    // resolve their bytes through originalBlob and variants through blob,
    // so both are checked before a blob is removed. Referenced blobs are
    // left exactly as they are. The collection denies API deletes; the
    // product's own lifecycle cleanup deletes blobs with access override
    // (e.g. uploadMedia's failed-create path), and rollback does the same.
    const blobs = await this.payload.find({
      collection: 'media-blobs',
      where: { site: { equals: siteId } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    } as never)
    for (const doc of blobs.docs) {
      const blobId = String(doc.id)
      const referencingAssets = await this.payload.count({
        collection: 'media-assets',
        where: { originalBlob: { equals: blobId } },
        overrideAccess: true,
      } as never)
      if (referencingAssets.totalDocs) continue
      const referencingVariants = await this.payload.count({
        collection: 'media-variants',
        where: { blob: { equals: blobId } },
        overrideAccess: true,
      } as never)
      if (referencingVariants.totalDocs) continue
      await this.payload.delete({
        collection: 'media-blobs',
        id: blobId,
        overrideAccess: true,
      } as never)
    }
  }

  async saveMigrationRun(report: MigrationReport): Promise<void> {
    try {
      const db = (
        this.payload.db as unknown as {
          pool?: { query: (q: string, p: unknown[]) => Promise<unknown> }
        }
      ).pool
      if (db) {
        const siteIdParam =
          report.siteId &&
          /^[0-9a-fA-F-]{36}$/.test(report.siteId) &&
          report.stage !== 'rolled-back'
            ? report.siteId
            : null
        await db.query(
          `INSERT INTO legacy_migration_runs (run_id, site_id, stage, source_checksum, options, report, checkpoint, created_entity_ids, created_at, updated_at, activated_at, rolled_back_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10, $11)
           ON CONFLICT (run_id) DO UPDATE SET
             site_id = EXCLUDED.site_id,
             stage = EXCLUDED.stage,
             report = EXCLUDED.report,
             checkpoint = EXCLUDED.checkpoint,
             created_entity_ids = EXCLUDED.created_entity_ids,
             updated_at = now(),
             activated_at = EXCLUDED.activated_at,
             rolled_back_at = EXCLUDED.rolled_back_at;`,
          [
            report.runId,
            siteIdParam,
            report.stage,
            report.checksums.sourceWxr,
            JSON.stringify(report.options),
            JSON.stringify(report),
            JSON.stringify(report.resumableCheckpoint),
            JSON.stringify(report.createdEntityIds),
            report.createdAt,
            report.activatedAt ?? null,
            report.rolledBackAt ?? null,
          ],
        )
      }
    } catch (err) {
      throw new Error('Failed to persist migration run.', { cause: err })
    }
  }

  async getMigrationRun(runId: string): Promise<MigrationReport | null> {
    try {
      const db = (
        this.payload.db as unknown as {
          pool?: {
            query: (q: string, p: unknown[]) => Promise<{ rows: Array<{ report: unknown }> }>
          }
        }
      ).pool
      if (db) {
        const res = await db.query(`SELECT report FROM legacy_migration_runs WHERE run_id = $1;`, [
          runId,
        ])
        if (res.rows.length > 0) {
          return res.rows[0].report as MigrationReport
        }
      }
    } catch {
      // Fallback
    }
    return null
  }

  async saveQuarantineRecords(records: QuarantineRecord[]): Promise<void> {
    try {
      const db = (
        this.payload.db as unknown as {
          pool?: { query: (q: string, p: unknown[]) => Promise<unknown> }
        }
      ).pool
      if (db && records.length > 0) {
        for (const r of records) {
          const siteIdParam = r.siteId && /^[0-9a-fA-F-]{36}$/.test(r.siteId) ? r.siteId : null
          await db.query(
            `INSERT INTO legacy_migration_quarantine (id, run_id, site_id, source_id, item_type, title, kind, name, raw_source, location, reason, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (id) DO NOTHING;`,
            [
              r.id,
              r.runId,
              siteIdParam,
              r.sourceId,
              r.itemType,
              r.title,
              r.kind,
              r.name,
              r.rawSource,
              r.location,
              r.reason,
              r.createdAt,
            ],
          )
        }
      }
    } catch (err) {
      throw new Error('Failed to persist migration quarantine.', { cause: err })
    }
  }

  async getQuarantineRecords(runId: string): Promise<QuarantineRecord[]> {
    try {
      const db = (
        this.payload.db as unknown as {
          pool?: {
            query: (q: string, p: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
          }
        }
      ).pool
      if (db) {
        const res = await db.query(`SELECT * FROM legacy_migration_quarantine WHERE run_id = $1;`, [
          runId,
        ])
        return res.rows.map((row) => ({
          id: String(row.id),
          runId: String(row.run_id ?? row.runId),
          siteId: String(row.site_id ?? row.siteId ?? ''),
          sourceId: String(row.source_id ?? row.sourceId),
          itemType: String(row.item_type ?? row.itemType),
          title: String(row.title ?? ''),
          kind: String(row.kind) as QuarantineRecord['kind'],
          name: String(row.name),
          rawSource: String(row.raw_source ?? row.rawSource ?? ''),
          location: String(row.location ?? ''),
          reason: String(row.reason),
          createdAt: String(row.created_at ?? row.createdAt),
        }))
      }
    } catch {
      // Fallback
    }
    return []
  }
}
