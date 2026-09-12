import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
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
  }): Promise<{ id: string }>

  createRedirect(data: {
    siteId: string
    fromPath: string
    toPath: string
    statusCode?: string
    enabled?: boolean
  }): Promise<{ id: string }>

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

  publishLayout(id: string): Promise<void>
  deleteEntity(collection: string, id: string): Promise<void>

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

  async createRedirect(data: Record<string, unknown>): Promise<{ id: string }> {
    const id = `redir-${randomUUID().slice(0, 8)}`
    this.redirects.set(id, { id, ...data })
    return { id }
  }

  async createLayout(data: Record<string, unknown>): Promise<{ id: string }> {
    const id = `layout-${randomUUID().slice(0, 8)}`
    this.layouts.set(id, { id, ...data })
    return { id }
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
  constructor(private payload: Payload) {}

  async createSite(data: {
    name: string
    slug: string
    description?: string
  }): Promise<{ id: string; slug: string }> {
    const created = (await this.payload.create({
      collection: 'sites',
      overrideAccess: true,
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        lifecycle: 'active',
      },
    })) as { id: string; slug: string }
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
    const db = (
      this.payload.db as unknown as {
        pool?: { query: (q: string, p?: unknown[]) => Promise<unknown> }
      }
    ).pool
    if (db) {
      try {
        await db.query("SET session_replication_role = 'replica'").catch(() => {})
        try {
          await db
            .query(
              `DELETE FROM revision_records WHERE article_id IN (SELECT id FROM article_family_content WHERE content_id IN (SELECT id FROM content WHERE site_id = $1))`,
              [siteId],
            )
            .catch(() => {})
          await db
            .query(
              `DELETE FROM article_family_content WHERE content_id IN (SELECT id FROM content WHERE site_id = $1)`,
              [siteId],
            )
            .catch(() => {})
          await db
            .query(
              `DELETE FROM content_authors WHERE _parent_id IN (SELECT id FROM content WHERE site_id = $1)`,
              [siteId],
            )
            .catch(() => {})
          await db
            .query(
              `DELETE FROM content_rels WHERE parent_id IN (SELECT id FROM content WHERE site_id = $1)`,
              [siteId],
            )
            .catch(() => {})
          await db.query(`DELETE FROM content WHERE site_id = $1`, [siteId]).catch(() => {})
          await db.query(`DELETE FROM media_assets WHERE site_id = $1`, [siteId]).catch(() => {})
          await db
            .query(`DELETE FROM public_redirects WHERE site_id = $1`, [siteId])
            .catch(() => {})
          await db.query(`DELETE FROM page_layouts WHERE site_id = $1`, [siteId]).catch(() => {})
          await db
            .query(`UPDATE categories SET parent_id = NULL WHERE site_id = $1`, [siteId])
            .catch(() => {})
          await db.query(`DELETE FROM categories WHERE site_id = $1`, [siteId]).catch(() => {})
          await db.query(`DELETE FROM tags WHERE site_id = $1`, [siteId]).catch(() => {})
          await db
            .query(`DELETE FROM legacy_migration_quarantine WHERE site_id = $1`, [siteId])
            .catch(() => {})
          await db
            .query(`DELETE FROM legacy_migration_runs WHERE site_id = $1`, [siteId])
            .catch(() => {})
          await db.query(`DELETE FROM sites WHERE id = $1`, [siteId]).catch(() => {})
        } finally {
          await db.query("SET session_replication_role = 'origin'").catch(() => {})
        }
        return
      } catch (err) {
        console.error('Direct SQL deleteSite error, falling back to Payload delete:', err)
      }
    }

    await this.payload.delete({
      collection: 'sites',
      id: siteId,
      overrideAccess: true,
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
    const canonicalPath = `/topics/${data.slug}`
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
    const created = (await this.payload.create({
      collection: 'media-assets',
      overrideAccess: true,
      data: {
        site: data.siteId,
        title: data.title || data.fileName,
        kind: 'image',
        storageLocation: `local://${data.siteId}/${data.fileName}`,
        storageProvider: 'local',
        mimeType: data.mimeType,
        checksum: data.sha256,
        sizeBytes: data.bytes.length,
        altText: data.altText,
        caption: data.caption,
        width: data.width,
        height: data.height,
        retentionMode: 'permanent',
      },
    } as never)) as { id: string | number }
    const id = String(created.id)
    return { id, url: `/media/${id}` }
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
    return res.docs[0] ? { id: String(res.docs[0].id), url: `/media/${res.docs[0].id}` } : null
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
  }): Promise<{ id: string }> {
    const authors = (data.authorIds ?? []).map((authorId, index) => ({
      author: authorId,
      displayOrder: index + 1,
    }))
    const lexicalBody = {
      root: {
        type: 'root',
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        children: [
          {
            type: 'paragraph',
            format: '' as const,
            indent: 0,
            version: 1,
            direction: 'ltr' as const,
            children: [
              {
                type: 'text',
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: data.body,
                version: 1,
              },
            ],
          },
        ],
      },
    }
    const created = (await this.payload.create({
      collection: 'content',
      overrideAccess: true,
      data: {
        site: data.siteId,
        contentType: data.contentType,
        title: data.title,
        slug: data.slug,
        canonicalPath: data.canonicalPath,
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
    try {
      if (collection === 'content') {
        const db = (
          this.payload.db as unknown as {
            pool?: { query: (q: string, p: unknown[]) => Promise<unknown> }
          }
        ).pool
        if (db) {
          await db
            .query(`DELETE FROM "revision_records" WHERE "article_id" = $1;`, [id])
            .catch(() => {})
          await db
            .query(`DELETE FROM "article_family_content" WHERE "content_id" = $1;`, [id])
            .catch(() => {})
        }
      }
      await this.payload.delete({
        collection: collection as never,
        id,
        overrideAccess: true,
      })
    } catch {
      // Ignored if already deleted
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
      console.error('Failed to save migration run:', err)
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
      console.error('Failed to save quarantine records:', err)
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
