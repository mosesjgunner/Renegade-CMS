import type { Payload } from 'payload'
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import { resolveSiteSettings, type ResolvedSiteSettings } from '../core/site-settings'
import { mediaVariantUrl } from '../media/variant-contracts'
import { canDiscoverPublic } from './contracts'
import { crawlerEntries, SITEMAP_PAGE_SIZE, type CrawlerEntry } from './crawler'
import {
  applyRedirectRule,
  buildGenericRecordDiscoveryDocument,
  buildLayoutDiscoveryDocument,
  buildPodcastEpisodeDiscoveryDocument,
  buildPodcastShowDiscoveryDocument,
  buildVideoDiscoveryDocument,
  getAllIndexableDiscoveryDocuments,
  idOf,
  matchRedirectRule,
  normalPath,
  normalizeDiscoveryPath,
  resolveDiscoveryDocument,
  safeCanonicalUrl,
  type DiscoveryDocument,
  type RedirectRule,
} from './discovery'
import { isPublicPageLayout } from './layout-visibility'
import { registeredOnly } from './registered-collections'
import { resolvePublicUrl, routeTemplatesForSite } from './semantic-url'

/**
 * Page-sliced lightweight sitemap projection.
 *
 * `getAllIndexableDiscoveryDocuments` resolves a full DiscoveryDocument for
 * every record in the corpus on every sitemap request (per-record family /
 * revision / media queries for content, a settings resolution plus redirect
 * finds plus a re-fetch for every show / episode / video), so the sitemap
 * index pays the full corpus cost and a child page pays for all pages, not
 * its own slice. Measured on the SEO rig: 12.9s at 1k documents, ~114–186s
 * at 10k, and a working set beyond the 2 GB profile at 50k.
 *
 * This module computes the exact same crawler entries with batched loads:
 *
 * - Site settings are resolved once; the site's redirect rules are loaded
 *   once and matched in memory with the same creation-order semantics as
 *   `resolveRedirectForSite` (per hop, that resolver's candidate set is
 *   exactly the rules that can match the path — exact for the path, prefix
 *   on a segment ancestor, or any regex rule — so filtering the full
 *   creation-ordered set with the same matcher picks the same first rule).
 * - Layouts, podcast shows / episodes, videos, and the generic collections
 *   are built by the very same builder functions `getAll` uses; only their
 *   per-record resolution traffic (redirect finds, slug re-fetches) is
 *   replaced by the preloaded rule set and the enumeration rows, whose
 *   fields the builders read identically at any population depth.
 * - Content — the one builder that takes `payload` — is projected at the
 *   crawler-field level from the same primitives the builder composes
 *   (`safeCanonicalUrl`, `canDiscoverPublic`, route templates, the media
 *   variant contract), with its auxiliary loads batched: article families,
 *   published revisions, media assets, and canonical-target validation
 *   (which only runs for records whose canonical override actually points
 *   at a different URL). The hierarchy trail is not loaded: it feeds
 *   breadcrumbs only, never a crawler-consumed field. The corpus and its
 *   auxiliaries are read as raw drizzle rows (a depth-0 Payload `find`
 *   hydrates too slowly to meet the scale targets); every raw loader
 *   falls back to the `find` path on any failure, so the transport can
 *   only ever cost speed, never correctness.
 * - The closing self-canonical / duplicate filter and the entry shaping
 *   are the same code paths `getAll` + `crawlerEntries` apply.
 *
 * Records that fall outside the projection's proven-equivalent envelope
 * (a duplicate slug within a site for shows / episodes / videos, a missing
 * slug, a content path computation that throws) are resolved through the
 * original `resolveDiscoveryDocument`, so anomalous data keeps the exact
 * original behavior — including its failures.
 */

type AnyRecord = Record<string, any>

const ENUM_PAGE_SIZE = 1_000
const BATCH_SIZE = 500
/** Raw inArray chunks can be far larger than Payload find batches. */
const RAW_BATCH_SIZE = 5_000

const findAllPages = async (
  payload: Payload,
  collection: string,
  where: Record<string, unknown>,
  depth: number,
  pageSize = ENUM_PAGE_SIZE,
): Promise<AnyRecord[]> => {
  const docs: AnyRecord[] = []
  let page = 1
  for (;;) {
    const result = await payload.find({
      collection: collection as never,
      where: where as never,
      limit: pageSize,
      page,
      depth,
      overrideAccess: true,
    } as never)
    docs.push(...(result.docs as AnyRecord[]))
    if (!result.hasNextPage) break
    page += 1
  }
  return docs
}

/** Load rows by id in chunks; missing ids are simply absent from the map. */
const findByIds = async (
  payload: Payload,
  collection: string,
  ids: string[],
): Promise<Map<string, AnyRecord>> => {
  const byId = new Map<string, AnyRecord>()
  const unique = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE)
    const result = await payload
      .find({
        collection: collection as never,
        where: { id: { in: chunk } } as never,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => ({ docs: [] }))
    for (const doc of result.docs as unknown as AnyRecord[]) byId.set(String(doc.id), doc)
  }
  return byId
}

// ---------------------------------------------------------------------------
// Raw row transport for the content corpus.
//
// Even a depth-0, field-selected Payload `find` hydrates ~0.06–0.2 ms per
// content row through the operation/adapter layers, which puts a 50k corpus
// at several seconds before any verdict work happens. The projection only
// consumes a fixed crawler-field set (see `projectContentRecord`), so the
// corpus and its batched auxiliaries are read as raw drizzle rows and
// adapted to the exact field shapes the verdict code already reads. Every
// raw loader returns null on any failure (unknown table shape, driver
// error) and the caller falls back to the Payload `find` path, so the raw
// transport can only ever cost speed, never correctness.
// ---------------------------------------------------------------------------

type DrizzleHandle = { drizzle: AnyRecord; tables: AnyRecord }

const drizzleHandle = (payload: Payload): DrizzleHandle | null => {
  const db = (payload as unknown as AnyRecord).db as AnyRecord | undefined
  const tables = (db?.tables ?? db?.schema) as AnyRecord | undefined
  if (!db?.drizzle || !tables?.content) return null
  return { drizzle: db.drizzle as AnyRecord, tables }
}

const toIso = (value: unknown): unknown => (value instanceof Date ? value.toISOString() : value)

/**
 * `drizzle.execute` returns timestamptz values as Postgres text
 * (`2026-11-18 08:20:53.771+00`), which `Date` would parse as local time;
 * normalize to ISO 8601 with an explicit offset before anyone reads it.
 */
const pgTimestampToIso = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} /.test(value)) {
    return value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  }
  return value
}

const RAW_CONTENT_FIELDS = [
  'id',
  'site',
  'slug',
  'canonicalPath',
  'contentType',
  'status',
  'visibility',
  'publishedAt',
  'publicModifiedAt',
  'updatedAt',
  'updatedAtEditorial',
  'retentionMode',
  'retentionExpiresAt',
  'removeFromDiscovery',
  'requiredEntitlement',
  'seoNoIndex',
  'seoCanonicalURL',
  'discoveryOverrides',
  'heroMedia',
  'createdAt',
] as const

/**
 * The site's published/updated content as verdict-shaped records (the same
 * fields a depth-0 Payload doc exposes to the projection), read with one
 * explicit SQL query — the fastest transport measured. Null on any failure.
 */
const rawContentRecordsSql = async (
  payload: Payload,
  siteId: string,
): Promise<AnyRecord[] | null> => {
  const handle = drizzleHandle(payload)
  if (!handle) return null
  try {
    const result = (await handle.drizzle.execute(sql`
      SELECT c.id, c.site_id, c.slug, c.canonical_path, c.content_type,
        c.status, c.visibility, c.published_at, c.public_modified_at,
        c.updated_at, c.updated_at_editorial, c.retention_mode,
        c.retention_expires_at, c.remove_from_discovery,
        c.required_entitlement, c.seo_no_index, c.seo_canonical_u_r_l,
        c.discovery_overrides, c.hero_media_id, c.created_at,
        COALESCE(t.topics, ARRAY[]::uuid[]) AS topics
      FROM content c
      LEFT JOIN (
        SELECT parent_id, array_agg(topics_id) AS topics
        FROM content_rels
        WHERE topics_id IS NOT NULL
        GROUP BY parent_id
      ) t ON t.parent_id = c.id
      WHERE c.status IN ('published', 'updated')
        ${siteId ? sql`AND c.site_id = ${siteId}` : sql``}
      ORDER BY c.created_at DESC
    `)) as AnyRecord
    const rows = (result.rows ?? result) as AnyRecord[]
    return rows.map((row) => ({
      id: row.id,
      site: row.site_id,
      slug: row.slug,
      canonicalPath: row.canonical_path,
      contentType: row.content_type,
      status: row.status,
      visibility: row.visibility,
      publishedAt: pgTimestampToIso(row.published_at),
      publicModifiedAt: pgTimestampToIso(row.public_modified_at),
      updatedAt: pgTimestampToIso(row.updated_at),
      updatedAtEditorial: pgTimestampToIso(row.updated_at_editorial),
      retentionMode: row.retention_mode,
      retentionExpiresAt: pgTimestampToIso(row.retention_expires_at),
      removeFromDiscovery: row.remove_from_discovery,
      requiredEntitlement: row.required_entitlement,
      seoNoIndex: row.seo_no_index,
      seoCanonicalURL: row.seo_canonical_u_r_l,
      discoveryOverrides: row.discovery_overrides,
      heroMedia: row.hero_media_id,
      createdAt: pgTimestampToIso(row.created_at),
      topics: Array.isArray(row.topics) ? row.topics.map(String) : [],
    }))
  } catch {
    return null
  }
}

const rawContentRecords = async (payload: Payload, siteId: string): Promise<AnyRecord[] | null> =>
  (await rawContentRecordsSql(payload, siteId)) ?? rawContentRecordsBuilder(payload, siteId)

/**
 * The same records via the drizzle query builder (kept as the fallback if
 * the explicit SQL transport is unavailable), or null.
 */
const rawContentRecordsBuilder = async (
  payload: Payload,
  siteId: string,
): Promise<AnyRecord[] | null> => {
  const handle = drizzleHandle(payload)
  if (!handle) return null
  const { drizzle, tables } = handle
  const ct = tables.content as AnyRecord
  const rels = (tables.content_rels ?? tables.contentRels) as AnyRecord | undefined
  if (!rels?.parent || !rels?.topicsID) return null
  try {
    const selection: AnyRecord = {}
    for (const field of RAW_CONTENT_FIELDS) selection[field] = ct[field]
    const statusFilter = inArray(ct.status, ['published', 'updated'])
    const rows = (await drizzle
      .select(selection)
      .from(ct)
      .where(siteId ? and(eq(ct.site, siteId), statusFilter) : statusFilter)
      .orderBy(desc(ct.createdAt))) as AnyRecord[]

    // Topics live in the rels table; the projection needs them only as the
    // used-topics gate input, shaped as a depth-0 doc's id array. One join
    // against the same site/status filter answers it for the whole corpus.
    const topicsByParent = new Map<string, string[]>()
    const relRows = (await drizzle
      .select({ parent: rels.parent, topicsID: rels.topicsID })
      .from(rels)
      .innerJoin(ct, eq(rels.parent, ct.id))
      .where(
        and(
          siteId ? eq(ct.site, siteId) : undefined,
          inArray(ct.status, ['published', 'updated']),
          isNotNull(rels.topicsID),
        ),
      )) as AnyRecord[]
    for (const rel of relRows) {
      const parent = String(rel.parent)
      const list = topicsByParent.get(parent) ?? []
      list.push(String(rel.topicsID))
      topicsByParent.set(parent, list)
    }

    return rows.map((row) => ({
      ...row,
      site: row.site != null ? String(row.site) : row.site,
      heroMedia: row.heroMedia != null ? String(row.heroMedia) : row.heroMedia,
      publishedAt: toIso(row.publishedAt),
      publicModifiedAt: toIso(row.publicModifiedAt),
      updatedAt: toIso(row.updatedAt),
      updatedAtEditorial: toIso(row.updatedAtEditorial),
      retentionExpiresAt: toIso(row.retentionExpiresAt),
      createdAt: toIso(row.createdAt),
      topics: topicsByParent.get(String(row.id)) ?? [],
    }))
  } catch {
    return null
  }
}

/** Article families for the given content ids, raw; null when unavailable. */
const rawFamiliesByContentId = async (
  payload: Payload,
  contentIds: string[],
): Promise<Map<string, AnyRecord> | null> => {
  const handle = drizzleHandle(payload)
  const table = handle?.tables.article_family_content as AnyRecord | undefined
  if (!handle || !table?.content || !table?.latestPublishedRevision) return null
  try {
    const byContentId = new Map<string, AnyRecord>()
    for (let i = 0; i < contentIds.length; i += RAW_BATCH_SIZE) {
      const chunk = contentIds.slice(i, i + RAW_BATCH_SIZE)
      const rows = (await handle.drizzle
        .select({
          id: table.id,
          content: table.content,
          latestPublishedRevision: table.latestPublishedRevision,
        })
        .from(table)
        .where(inArray(table.content, chunk))) as AnyRecord[]
      for (const fam of rows) {
        const key = fam.content != null ? String(fam.content) : ''
        if (key && !byContentId.has(key)) byContentId.set(key, fam)
      }
    }
    return byContentId
  } catch {
    return null
  }
}

/** Published revisions by id, raw; null when unavailable. */
const rawRevisionsById = async (
  payload: Payload,
  revisionIds: string[],
): Promise<Map<string, AnyRecord> | null> => {
  const handle = drizzleHandle(payload)
  const table = handle?.tables.revision_records as AnyRecord | undefined
  if (!handle || !table?.createdAt) return null
  try {
    const byId = new Map<string, AnyRecord>()
    const unique = [...new Set(revisionIds.filter(Boolean))]
    for (let i = 0; i < unique.length; i += RAW_BATCH_SIZE) {
      const chunk = unique.slice(i, i + RAW_BATCH_SIZE)
      const rows = (await handle.drizzle
        .select({ id: table.id, createdAt: table.createdAt })
        .from(table)
        .where(inArray(table.id, chunk))) as AnyRecord[]
      for (const row of rows) {
        byId.set(String(row.id), { id: row.id, createdAt: toIso(row.createdAt) })
      }
    }
    return byId
  } catch {
    return null
  }
}

/**
 * Canonical-target content rows by canonical path for one site, raw; null
 * when unavailable. Only the fields the validation reads are selected
 * (`seoNoIndex` plus the `canDiscoverPublic` inputs).
 */
const rawCanonicalTargets = async (
  payload: Payload,
  siteId: string,
  paths: string[],
): Promise<Map<string, AnyRecord> | null> => {
  const handle = drizzleHandle(payload)
  if (!handle) return null
  const ct = handle.tables.content as AnyRecord
  try {
    const targets = new Map<string, AnyRecord>()
    for (let i = 0; i < paths.length; i += RAW_BATCH_SIZE) {
      const chunk = paths.slice(i, i + RAW_BATCH_SIZE)
      const rows = (await handle.drizzle
        .select({
          canonicalPath: ct.canonicalPath,
          seoNoIndex: ct.seoNoIndex,
          status: ct.status,
          visibility: ct.visibility,
          publishedAt: ct.publishedAt,
          retentionMode: ct.retentionMode,
          retentionExpiresAt: ct.retentionExpiresAt,
          removeFromDiscovery: ct.removeFromDiscovery,
        })
        .from(ct)
        .where(and(eq(ct.site, siteId), inArray(ct.canonicalPath, chunk)))) as AnyRecord[]
      for (const row of rows) {
        const key = String(row.canonicalPath)
        if (!targets.has(key)) {
          targets.set(key, {
            ...row,
            publishedAt: toIso(row.publishedAt),
            retentionExpiresAt: toIso(row.retentionExpiresAt),
          })
        }
      }
    }
    return targets
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Redirects: the site's rules, loaded once, resolved in memory.
// ---------------------------------------------------------------------------

type RedirectCandidate = { rule: RedirectRule; createdAt: string }

const byCreationOrder = (a: RedirectCandidate, b: RedirectCandidate) =>
  a.createdAt < b.createdAt
    ? -1
    : a.createdAt > b.createdAt
      ? 1
      : a.rule.id < b.rule.id
        ? -1
        : a.rule.id > b.rule.id
          ? 1
          : 0

const loadSiteRedirectCandidates = async (
  payload: Payload,
  siteId: string,
): Promise<RedirectCandidate[]> => {
  const result = await payload
    .find({
      collection: 'public-redirects',
      where: { site: { equals: siteId } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => ({ docs: [] }))
  return (result.docs as Array<Record<string, unknown>>)
    .map((item) => ({
      rule: {
        id: String(item.id),
        siteId,
        fromPath: String(item.fromPath),
        toPath: String(item.toPath),
        match: item.match as RedirectRule['match'],
        statusCode: Number(item.statusCode) as RedirectRule['statusCode'],
        preserveQuery: item.preserveQuery !== false,
        enabled: item.enabled !== false,
      },
      createdAt: String(item.createdAt ?? ''),
    }))
    .sort(byCreationOrder)
}

/**
 * The redirect target `resolveRedirectForSite` would produce for `pathname`
 * (the discovery resolver passes no query), or null when its resolution has
 * no target (no match, loop, hop limit, or a missing target) — the cases in
 * which the original resolution falls through to normal discovery.
 */
const redirectTargetFor = (
  candidates: RedirectCandidate[],
  siteId: string,
  pathname: string,
): string | null => {
  let path = pathname
  const visited = new Set<string>()
  const ruleIds: string[] = []
  for (let hop = 0; hop < 8; hop++) {
    const candidate = candidates.find((entry) => matchRedirectRule([entry.rule], siteId, path))
    if (!candidate) return ruleIds.length ? path : null
    const rule = candidate.rule
    if (!normalPath(rule.toPath)) return null
    if (visited.has(rule.id) || visited.has(rule.toPath)) return null
    visited.add(rule.id)
    visited.add(path)
    ruleIds.push(rule.id)
    path = applyRedirectRule(rule, path)
    if (!normalPath(path)) return null
    if (!candidates.some((entry) => matchRedirectRule([entry.rule], siteId, path))) return path
  }
  return null
}

// ---------------------------------------------------------------------------
// Minimal document fabrication for the surfaces the projection computes
// directly (home, archive, content). Only the fields the closing filter and
// `crawlerEntries` read are populated; both consume exactly those fields.
// ---------------------------------------------------------------------------

const projectedDoc = (fields: {
  canonicalPath: string
  publicUrl: string
  canonicalUrl: string
  indexable: boolean
  publishedAt: unknown
  modifiedAt: unknown
  contentType: string
  heroImage: { id: string; url: string | null } | null
  socialImageUrl: string | null
  variantEligible: boolean
  variantUrl: string | null
  video?: { url: string; posterUrl: string } | null
  title?: string
  description?: string | null
}): DiscoveryDocument =>
  ({
    canonicalPath: fields.canonicalPath,
    publicUrl: fields.publicUrl,
    canonicalUrl: fields.canonicalUrl,
    indexability: { indexable: fields.indexable },
    dates: { publishedAt: fields.publishedAt, modifiedAt: fields.modifiedAt },
    contentType: fields.contentType,
    media: {
      ...(fields.heroImage ? { heroImage: fields.heroImage } : {}),
      ...(fields.video ? { video: fields.video } : {}),
    },
    socialImage: {
      url: fields.socialImageUrl,
      variantEligible: fields.variantEligible,
      variantUrl: fields.variantUrl,
    },
    title: { value: fields.title ?? '' },
    description: { value: fields.description ?? null },
  }) as unknown as DiscoveryDocument

// ---------------------------------------------------------------------------
// Home and articles archive (path-only resolutions inside the resolver).
// ---------------------------------------------------------------------------

const homeDocument = async (
  payload: Payload,
  input: {
    settings: ResolvedSiteSettings
    base: string
    siteId: string
    redirectCandidates: RedirectCandidate[]
    now: Date
  },
): Promise<DiscoveryDocument | null> => {
  const { settings, base, siteId, redirectCandidates, now } = input
  if (siteId && redirectTargetFor(redirectCandidates, siteId, '/')) return null
  const isSiteIndexable =
    settings.indexingMode !== 'noindex' &&
    settings.seoNoIndex !== true &&
    settings.launchState === 'live'
  const homeOverrides = (settings.discoveryOverrides ?? {}) as Record<string, any>
  const publicUrl = `${base}/`
  const canonicalUrl = safeCanonicalUrl(
    settings.seoCanonicalURL || homeOverrides.canonical,
    publicUrl,
    base,
  )
  let socialImg: string | null = settings.defaultSocialImageUrl
    ? `${base}${settings.defaultSocialImageUrl}`
    : null
  let socialVariantUrl: string | null = null
  let variantEligible = false
  const homeImageId = idOf(homeOverrides.socialImage) || settings.defaultSocialImageId || null
  if (homeImageId) {
    let image: AnyRecord | null = null
    try {
      image = (await payload.findByID({
        collection: 'media-assets',
        id: homeImageId,
        depth: 0,
        overrideAccess: true,
      } as never)) as AnyRecord
    } catch {
      image = null
    }
    const expired = Boolean(
      image?.rightsExpiresAt && new Date(String(image.rightsExpiresAt)).getTime() <= now.getTime(),
    )
    const publicReady =
      Boolean(image) &&
      !expired &&
      !['failed', 'quarantined', 'archived'].includes(String(image!.processingState ?? ''))
    if (publicReady) {
      socialImg = `${base}/media/${homeImageId}`
      socialVariantUrl = `${base}${mediaVariantUrl(homeImageId, 'og', 'jpeg')}`
      variantEligible = true
    } else if (image) {
      socialImg = null
      socialVariantUrl = null
      variantEligible = false
    }
  }
  return projectedDoc({
    canonicalPath: '/',
    publicUrl,
    canonicalUrl,
    indexable: isSiteIndexable,
    publishedAt: null,
    modifiedAt: null,
    contentType: 'home',
    heroImage: null,
    socialImageUrl: socialImg,
    variantEligible,
    variantUrl: socialVariantUrl,
  })
}

const archiveDocument = (input: {
  settings: ResolvedSiteSettings
  base: string
  siteId: string
  redirectCandidates: RedirectCandidate[]
}): DiscoveryDocument | null => {
  const { settings, base, siteId, redirectCandidates } = input
  if (siteId && redirectTargetFor(redirectCandidates, siteId, '/articles')) return null
  const publicUrl = `${base}/articles`
  return projectedDoc({
    canonicalPath: '/articles',
    publicUrl,
    canonicalUrl: publicUrl,
    indexable: settings.indexingMode !== 'noindex' && settings.launchState === 'live',
    publishedAt: null,
    modifiedAt: null,
    contentType: 'archive',
    heroImage: null,
    socialImageUrl: settings.defaultSocialImageUrl
      ? `${base}${settings.defaultSocialImageUrl}`
      : null,
    variantEligible: false,
    variantUrl: null,
  })
}

// ---------------------------------------------------------------------------
// Content: the crawler-field projection of buildContentDiscoveryDocument.
// ---------------------------------------------------------------------------

type ContentAux = {
  /** content id -> its article-family row (first, as the builder's limit-1 find). */
  familyByContentId: Map<string, AnyRecord>
  /** revision id -> revision-records row. */
  revisionById: Map<string, AnyRecord>
  /** media asset id -> media-assets row (absent key = fetch failed / missing). */
  mediaById: Map<string, AnyRecord>
  /** site id -> target paths that have at least one enabled redirect row. */
  canonicalRedirectPaths: Map<string, Set<string>>
  /** site id -> canonicalPath -> first content row at that path. */
  canonicalTargets: Map<string, Map<string, AnyRecord>>
  /** content id -> its canonical computation (computed once, in the aux pass). */
  canonicalById: Map<string, ReturnType<typeof contentCanonical>>
}

const loadContentAux = async (
  payload: Payload,
  records: AnyRecord[],
  settings: ResolvedSiteSettings,
  siteId: string,
  resolutionBase: string,
  // Light mode (sitemap index summary) never reads media: entries' images
  // do not affect page counts or lastmods, so the load is skipped whole.
  light = false,
): Promise<ContentAux> => {
  const contentIds = records.map((record) => String(record.id))
  let familyByContentId = await rawFamiliesByContentId(payload, contentIds)
  if (!familyByContentId) {
    familyByContentId = new Map<string, AnyRecord>()
    for (let i = 0; i < contentIds.length; i += BATCH_SIZE) {
      const chunk = contentIds.slice(i, i + BATCH_SIZE)
      const result = await payload
        .find({
          collection: 'article-family-content',
          where: { content: { in: chunk } } as never,
          pagination: false,
          depth: 0,
          overrideAccess: true,
        } as never)
        .catch(() => ({ docs: [] }))
      for (const fam of result.docs as unknown as AnyRecord[]) {
        const key = idOf(fam.content)
        if (key && !familyByContentId.has(key)) familyByContentId.set(key, fam)
      }
    }
  }

  const revisionIds: string[] = []
  for (const record of records) {
    const fam = familyByContentId.get(String(record.id))
    const revisionId = fam ? idOf(fam.latestPublishedRevision) : ''
    if (revisionId) revisionIds.push(revisionId)
  }
  const revisionById =
    (await rawRevisionsById(payload, revisionIds)) ??
    (await findByIds(payload, 'revision-records', revisionIds))

  // Canonical-target validation runs only for records whose canonical
  // candidate survives safeCanonicalUrl as a different URL; collect those
  // target paths per site and answer the builder's two finds in bulk.
  const targetsBySite = new Map<string, Set<string>>()
  const canonicalById = new Map<string, ReturnType<typeof contentCanonical>>()
  for (const record of records) {
    const projection = contentCanonical(record, settings, siteId, resolutionBase)
    canonicalById.set(String(record.id), projection)
    if (!projection || !projection.needsValidation) continue
    const set = targetsBySite.get(projection.contentSiteId) ?? new Set<string>()
    set.add(projection.targetPath)
    targetsBySite.set(projection.contentSiteId, set)
  }
  const canonicalRedirectPaths = new Map<string, Set<string>>()
  const canonicalTargets = new Map<string, Map<string, AnyRecord>>()
  for (const [contentSiteId, paths] of targetsBySite) {
    const pathList = [...paths]
    const redirectPaths = new Set<string>()
    const rawTargets = await rawCanonicalTargets(payload, contentSiteId, pathList)
    const targets = rawTargets ?? new Map<string, AnyRecord>()
    for (let i = 0; i < pathList.length; i += BATCH_SIZE) {
      const chunk = pathList.slice(i, i + BATCH_SIZE)
      const [redirects, targetDocs] = await Promise.all([
        payload
          .find({
            collection: 'public-redirects',
            where: {
              and: [
                { site: { equals: contentSiteId } },
                { fromPath: { in: chunk } },
                { enabled: { equals: true } },
              ],
            },
            pagination: false,
            depth: 0,
            overrideAccess: true,
          } as never)
          .catch(() => ({ docs: [] })),
        rawTargets
          ? Promise.resolve({ docs: [] as AnyRecord[] })
          : payload
              .find({
                collection: 'content',
                where: {
                  and: [{ site: { equals: contentSiteId } }, { canonicalPath: { in: chunk } }],
                },
                pagination: false,
                depth: 0,
                overrideAccess: true,
              } as never)
              .catch(() => ({ docs: [] })),
      ])
      for (const row of redirects.docs as unknown as AnyRecord[])
        redirectPaths.add(String(row.fromPath))
      for (const row of targetDocs.docs as unknown as AnyRecord[]) {
        const key = String(row.canonicalPath)
        if (!targets.has(key)) targets.set(key, row)
      }
    }
    canonicalRedirectPaths.set(contentSiteId, redirectPaths)
    canonicalTargets.set(contentSiteId, targets)
  }

  // Media assets: the image id chain needs the published revision's hero
  // media as its last fallback, so ids are collected after revisions load.
  const mediaIds: string[] = []
  for (const record of records) {
    const fam = familyByContentId.get(String(record.id))
    const revisionId = fam ? idOf(fam.latestPublishedRevision) : ''
    const revision = revisionId ? revisionById.get(revisionId) : undefined
    const overrides =
      record.discoveryOverrides && typeof record.discoveryOverrides === 'object'
        ? (record.discoveryOverrides as AnyRecord)
        : {}
    const imageId =
      idOf(overrides.socialImage) ||
      idOf(record.socialImage) ||
      idOf(record.heroMedia) ||
      idOf(revision?.heroMedia) ||
      null
    if (imageId) mediaIds.push(imageId)
  }
  const mediaById = light
    ? new Map<string, AnyRecord>()
    : await findByIds(payload, 'media-assets', mediaIds)

  return {
    familyByContentId,
    revisionById,
    mediaById,
    canonicalRedirectPaths,
    canonicalTargets,
    canonicalById,
  }
}

/**
 * The canonical computation shared by the aux loader and the projection:
 * the builder's canonicalPath / publicUrl / canonicalUrl before the
 * canonical-target validation. Returns null when the path computation
 * throws (the caller then falls back to the original resolver).
 */
const contentCanonical = (
  record: AnyRecord,
  settings: ResolvedSiteSettings,
  siteId: string,
  resolutionBase: string,
): {
  contentSiteId: string
  base: string
  canonicalPath: string
  publicUrl: string
  canonicalUrl: string
  needsValidation: boolean
  targetPath: string
} | null => {
  const contentSiteId = idOf(record.site) || siteId
  const base = (contentSiteId && settings.canonicalOriginsBySite[contentSiteId]) || resolutionBase
  let canonicalPath: string
  try {
    canonicalPath = normalizeDiscoveryPath(
      resolvePublicUrl(
        {
          kind: 'article',
          slug: String(record.slug || ''),
          canonicalPath: typeof record.canonicalPath === 'string' ? record.canonicalPath : null,
        },
        routeTemplatesForSite(
          contentSiteId,
          settings.semanticRouteTemplates,
          settings.semanticRouteTemplatesBySite,
        ),
      ),
    )
  } catch {
    return null
  }
  const publicUrl = new URL(canonicalPath, base).toString()
  const overrides =
    record.discoveryOverrides && typeof record.discoveryOverrides === 'object'
      ? (record.discoveryOverrides as AnyRecord)
      : {}
  const canonicalCandidate = record.seoCanonicalURL || overrides.canonical
  const canonicalUrl = safeCanonicalUrl(canonicalCandidate, publicUrl, base)
  const needsValidation = Boolean(canonicalCandidate && canonicalUrl !== publicUrl)
  return {
    contentSiteId,
    base,
    canonicalPath,
    publicUrl,
    canonicalUrl,
    needsValidation,
    targetPath: needsValidation ? new URL(canonicalUrl).pathname : '',
  }
}

/**
 * The resolver dispatch path for a content record as `getAll` invokes it
 * (record supplied, so no redirect check; the home case is guarded off for
 * the content collection). Only the archive / search shadowing outcomes
 * differ from running the content builder.
 */
const contentDispatchPath = (
  record: AnyRecord,
  settings: ResolvedSiteSettings,
  siteId: string,
): string => {
  const rawPath =
    typeof record.canonicalPath === 'string' && record.canonicalPath
      ? record.canonicalPath
      : undefined
  let unresolvedPath = '/'
  if (rawPath) {
    unresolvedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  } else {
    const rawSlug = typeof record.slug === 'string' ? record.slug : undefined
    if (rawSlug) {
      const kind = String(record.contentType ?? 'article') === 'page' ? 'page' : 'article'
      try {
        unresolvedPath = resolvePublicUrl(
          { kind, slug: rawSlug } as never,
          routeTemplatesForSite(
            siteId || idOf(record.site),
            settings.semanticRouteTemplates,
            settings.semanticRouteTemplatesBySite,
          ),
        )
      } catch {
        unresolvedPath = '/'
      }
    }
  }
  return normalizeDiscoveryPath(unresolvedPath)
}

const projectContentRecord = (
  record: AnyRecord,
  input: {
    settings: ResolvedSiteSettings
    siteId: string
    resolutionBase: string
    now: Date
    aux: ContentAux
    /** Light mode: skip the image chain (the index summary never reads it). */
    light?: boolean
  },
): { doc: DiscoveryDocument | null; indexable: boolean } | null => {
  const { settings, siteId, resolutionBase, now, aux } = input

  const dispatchPath = contentDispatchPath(record, settings, siteId)
  if (dispatchPath === '/search') return { doc: null, indexable: false }
  if (dispatchPath === '/articles') {
    // The resolver returns the archive document for this record; `getAll`
    // drops it from the content list, but its indexability still counts
    // toward the topics gate.
    return {
      doc: null,
      indexable: settings.indexingMode !== 'noindex' && settings.launchState === 'live',
    }
  }

  const canonical = aux.canonicalById.has(String(record.id))
    ? aux.canonicalById.get(String(record.id))
    : contentCanonical(record, settings, siteId, resolutionBase)
  if (!canonical) return null // caller falls back to the original resolver
  const { contentSiteId, base, canonicalPath, publicUrl } = canonical
  let { canonicalUrl } = canonical

  // Indexability — the builder's ordered chain, verbatim.
  const contentType = String(record.contentType || 'article')
  const typeDefaults = {
    ...(settings.discoveryDefaults.default ?? {}),
    ...(settings.discoveryDefaults[contentType] ?? {}),
  } as AnyRecord
  const requiredEntitlement = record.requiredEntitlement as
    | { resource?: unknown; capability?: unknown }
    | undefined
  const isEntitlementRestricted = Boolean(
    requiredEntitlement &&
      typeof requiredEntitlement.resource === 'string' &&
      requiredEntitlement.resource.trim() &&
      typeof requiredEntitlement.capability === 'string' &&
      requiredEntitlement.capability.trim(),
  )
  let indexable = true
  if (record.retentionMode === 'tombstone') indexable = false
  else if (record.status !== 'published' && record.status !== 'updated') indexable = false
  else if (record.publishedAt && new Date(record.publishedAt).getTime() > now.getTime())
    indexable = false
  else if (isEntitlementRestricted) indexable = false
  else if (record.visibility && record.visibility === 'unlisted') indexable = false
  else if (record.visibility && record.visibility !== 'public') indexable = false
  else if (record.seoNoIndex === true) indexable = false
  else if (settings.launchState !== 'live') indexable = false
  else if (settings.indexingMode === 'noindex' || typeDefaults.index === false) indexable = false
  else if (!canDiscoverPublic(record, now)) indexable = false

  // Canonical-target validation, answered from the batched loads.
  if (canonical.needsValidation) {
    const target = aux.canonicalTargets.get(contentSiteId)?.get(canonical.targetPath)
    if (
      aux.canonicalRedirectPaths.get(contentSiteId)?.has(canonical.targetPath) ||
      !target ||
      target.seoNoIndex === true ||
      !canDiscoverPublic(target, now)
    ) {
      canonicalUrl = publicUrl
    }
  }

  // Published revision (family -> latest published revision), batched.
  const fam = aux.familyByContentId.get(String(record.id))
  const revisionId = fam ? idOf(fam.latestPublishedRevision) : ''
  const publishedRevision = revisionId ? aux.revisionById.get(revisionId) : undefined

  const publishedAt = record.publishedAt || publishedRevision?.createdAt || null
  const modifiedAt =
    record.publicModifiedAt ||
    publishedRevision?.createdAt ||
    record.updatedAtEditorial ||
    record.updatedAt ||
    null

  // Social / hero image, with the asset readiness gate from the batch load.
  const overrides =
    record.discoveryOverrides && typeof record.discoveryOverrides === 'object'
      ? (record.discoveryOverrides as AnyRecord)
      : {}
  const imageId =
    idOf(overrides.socialImage) ||
    idOf(record.socialImage) ||
    idOf(record.heroMedia) ||
    idOf(publishedRevision?.heroMedia) ||
    null
  let heroImage: { id: string; url: string | null } | null = null
  let socialImageUrl: string | null = null
  let variantEligible = false
  let variantUrl: string | null = null
  if (input.light) {
    // Index-summary mode: no image fact reaches a page count or lastmod.
  } else if (imageId) {
    const image = aux.mediaById.get(imageId) ?? null
    const expired = Boolean(
      image?.rightsExpiresAt && new Date(String(image.rightsExpiresAt)).getTime() <= now.getTime(),
    )
    const publicReady =
      Boolean(image) &&
      !expired &&
      !['failed', 'quarantined', 'archived'].includes(image!.processingState)
    socialImageUrl = publicReady ? `${base}/media/${imageId}` : null
    variantUrl = publicReady ? `${base}${mediaVariantUrl(imageId, 'og', 'jpeg')}` : null
    variantEligible = publicReady
    heroImage = { id: imageId, url: socialImageUrl }
  } else if (settings.defaultSocialImageUrl) {
    socialImageUrl = `${base}${settings.defaultSocialImageUrl}`
  }

  return {
    doc: projectedDoc({
      canonicalPath,
      publicUrl,
      canonicalUrl,
      indexable,
      publishedAt,
      modifiedAt,
      contentType,
      heroImage,
      socialImageUrl,
      variantEligible,
      variantUrl,
    }),
    indexable,
  }
}

// ---------------------------------------------------------------------------
// The projection entry point.
// ---------------------------------------------------------------------------

/**
 * The shared projection pipeline: resolves the site's surviving
 * (self-canonical, unique-URL) documents in canonical-URL order — exactly
 * the set `getAllIndexableDiscoveryDocuments` returns. Returns null for the
 * degenerate no-site case, where the batched projection's per-record site
 * derivations no longer coincide with the resolver's and callers defer to
 * the original implementation wholesale.
 */
const collectSitemapDocuments = async (
  payload: Payload,
  siteId: string | undefined,
  light: boolean,
): Promise<DiscoveryDocument[] | null> => {
  const settings = await resolveSiteSettings(payload)
  if (settings.indexingMode === 'noindex' || settings.launchState !== 'live') return []

  let resolvedSiteId = siteId
  if (!resolvedSiteId) {
    const publications = await payload.find({
      collection: 'publications',
      where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const pub = publications.docs[0] as unknown as AnyRecord | undefined
    resolvedSiteId = idOf(pub?.site)
  }
  if (!resolvedSiteId) return null

  const now = new Date()
  const base =
    (resolvedSiteId && settings.canonicalOriginsBySite[resolvedSiteId]) || settings.canonicalOrigin
  const redirectCandidates = await loadSiteRedirectCandidates(payload, resolvedSiteId)
  const documents: DiscoveryDocument[] = []

  // 1. Home
  const home = await homeDocument(payload, {
    settings,
    base,
    siteId: resolvedSiteId,
    redirectCandidates,
    now,
  })
  if (home?.indexability.indexable) documents.push(home)

  // 2. Articles archive
  const archive = archiveDocument({ settings, base, siteId: resolvedSiteId, redirectCandidates })
  if (archive?.indexability.indexable) documents.push(archive)

  // 3. Content (articles & pages)
  const contentRecords =
    (await rawContentRecords(payload, resolvedSiteId)) ??
    (await findAllPages(
      payload,
      'content',
      {
        and: [
          ...(resolvedSiteId ? [{ site: { equals: resolvedSiteId } }] : []),
          { status: { in: ['published', 'updated'] } },
        ],
      },
      0,
    ).catch(() => [] as AnyRecord[]))
  const aux = await loadContentAux(payload, contentRecords, settings, resolvedSiteId, base, light)
  const resolvedContent: Array<{ doc: DiscoveryDocument | null; indexable: boolean }> = []
  for (const record of contentRecords) {
    const projected = projectContentRecord(record, {
      settings,
      siteId: resolvedSiteId,
      resolutionBase: base,
      now,
      aux,
      light,
    })
    if (projected) {
      resolvedContent.push(projected)
      continue
    }
    // Outside the projection envelope: resolve exactly as `getAll` does.
    // The enumerated record may be a raw verdict-shaped row, so re-read the
    // full depth-0 doc the resolver expects before handing it over.
    const fullRecord = await payload
      .findByID({
        collection: 'content',
        id: String(record.id),
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => null)
    const doc = await resolveDiscoveryDocument(payload, {
      collection: 'content',
      record: (fullRecord ?? record) as Record<string, unknown>,
      path: record.canonicalPath,
      slug: record.slug,
      siteId: resolvedSiteId,
    })
    resolvedContent.push({ doc, indexable: doc.indexability.indexable })
  }
  for (const entry of resolvedContent) {
    if (
      entry.doc &&
      entry.indexable &&
      entry.doc.canonicalPath !== '/' &&
      entry.doc.canonicalPath !== '/articles'
    ) {
      documents.push(entry.doc)
    }
  }
  const usedTopicIds = new Set(
    contentRecords.flatMap((record, index) => {
      if (!resolvedContent[index]?.indexable) return []
      const topics = record.topics
      return Array.isArray(topics) ? topics.map((topic) => idOf(topic)) : []
    }),
  )

  // 4. Page layouts
  const layouts = await findAllPages(
    payload,
    'page-layouts',
    {
      and: [
        ...(resolvedSiteId ? [{ site: { equals: resolvedSiteId } }] : []),
        { status: { equals: 'published' } },
        { visibility: { equals: 'public' } },
      ],
    },
    0,
  ).catch(() => [] as AnyRecord[])
  for (const layout of layouts) {
    if (!isPublicPageLayout(layout as Record<string, unknown>)) continue
    const layoutPath = String(layout.path || '')
    if (!layoutPath || layoutPath === '/') continue
    if (documents.some((d) => d.canonicalPath === layoutPath)) continue
    const normalized = normalizeDiscoveryPath(
      layoutPath.startsWith('/') ? layoutPath : `/${layoutPath}`,
    )
    if (normalized === '/search') continue // the search surface is never indexable
    if (normalized === '/articles') {
      const shadowed = archiveDocument({
        settings,
        base,
        siteId: '',
        redirectCandidates: [],
      })
      if (shadowed?.indexability.indexable) documents.push(shadowed)
      continue
    }
    if (normalized === '/') {
      const shadowed = await homeDocument(payload, {
        settings,
        base,
        siteId: '',
        redirectCandidates: [],
        now,
      })
      if (shadowed?.indexability.indexable) documents.push(shadowed)
      continue
    }
    const doc = buildLayoutDiscoveryDocument({ layout, settings, base, now })
    if (doc.indexability.indexable) documents.push(doc)
  }

  // 5–7. Podcast shows, podcast episodes, videos: enumerated rows feed the
  // same builders the resolver dispatches to; the redirect check runs
  // against the preloaded rule set.
  const mediaCollections: Array<{
    collection: string
    where: Record<string, unknown>
    kind: 'podcast' | 'podcast-episode' | 'video'
    build: (record: AnyRecord) => DiscoveryDocument
  }> = [
    {
      collection: 'podcast-shows',
      where: {
        and: [
          ...(resolvedSiteId ? [{ site: { equals: resolvedSiteId } }] : []),
          { status: { in: ['published', 'updated'] } },
        ],
      },
      kind: 'podcast',
      build: (record) => buildPodcastShowDiscoveryDocument({ show: record, settings, base, now }),
    },
    {
      collection: 'podcast-episodes',
      where: {
        and: [
          ...(resolvedSiteId ? [{ site: { equals: resolvedSiteId } }] : []),
          { status: { in: ['published', 'updated'] } },
        ],
      },
      kind: 'podcast-episode',
      build: (record) =>
        buildPodcastEpisodeDiscoveryDocument({ episode: record, settings, base, now }),
    },
    {
      collection: 'videos',
      where: {
        and: [
          ...(resolvedSiteId ? [{ site: { equals: resolvedSiteId } }] : []),
          { status: { equals: 'published' } },
          { visibility: { equals: 'public' } },
        ],
      },
      kind: 'video',
      build: (record) => buildVideoDiscoveryDocument({ video: record, settings, base, now }),
    },
  ]
  for (const { collection, where, kind, build } of mediaCollections) {
    const records = await findAllPages(payload, collection, where, 0).catch(() => [] as AnyRecord[])
    const slugCounts = new Map<string, number>()
    for (const record of records)
      slugCounts.set(String(record.slug), (slugCounts.get(String(record.slug)) ?? 0) + 1)
    for (const record of records) {
      const slug = record.slug
      if (typeof slug !== 'string' || !slug || (slugCounts.get(String(slug)) ?? 0) > 1) {
        // Missing or duplicated slug: the resolver's slug find decides which
        // record (if any) this enumeration row resolves to — defer to it.
        const doc = await resolveDiscoveryDocument(payload, {
          collection,
          slug: String(record.slug),
          siteId: resolvedSiteId,
        })
        if (doc.indexability.indexable) documents.push(doc)
        continue
      }
      let unresolvedPath: string
      try {
        unresolvedPath = resolvePublicUrl(
          { kind, slug } as never,
          routeTemplatesForSite(
            resolvedSiteId,
            settings.semanticRouteTemplates,
            settings.semanticRouteTemplatesBySite,
          ),
        )
      } catch {
        unresolvedPath = '/'
      }
      const normalizedPath = normalizeDiscoveryPath(unresolvedPath)
      if (redirectTargetFor(redirectCandidates, resolvedSiteId, normalizedPath)) continue
      const doc = build(record)
      if (doc.indexability.indexable) documents.push(doc)
    }
  }

  // 8. Generic collections — enumerated and built exactly as in `getAll`.
  const genericCollections = [
    'books',
    'events',
    'timelines',
    'albums',
    'discussions',
    'products',
    'topics',
    'categories',
    'sections',
  ]
  const availableGenericCollections = registeredOnly(payload, genericCollections)
  const genericResults = await Promise.all(
    availableGenericCollections.map(async (collection) => {
      const where: Record<string, unknown> = {
        ...(resolvedSiteId ? { site: { equals: resolvedSiteId } } : {}),
      }
      return [collection, await findAllPages(payload, collection, where, 1, 250)] as const
    }),
  )
  for (const [collection, docs] of genericResults) {
    for (const record of docs) {
      if (collection === 'topics' && !usedTopicIds.has(String(record.id))) continue
      const document = buildGenericRecordDiscoveryDocument({
        record:
          collection === 'topics' || collection === 'categories' || collection === 'sections'
            ? { ...record, status: 'published', visibility: 'public' }
            : record,
        collection,
        settings,
        base,
        now: new Date(),
      })
      if (document.indexability.indexable) documents.push(document)
    }
  }

  // Closing filter — identical to `getAllIndexableDiscoveryDocuments`.
  const selfCanonicalDocs = documents.filter(
    (document) => document.canonicalUrl === document.publicUrl,
  )
  const pathCounts = new Map<string, number>()
  const urlCounts = new Map<string, number>()
  for (const document of selfCanonicalDocs) {
    pathCounts.set(document.canonicalPath, (pathCounts.get(document.canonicalPath) ?? 0) + 1)
    urlCounts.set(document.canonicalUrl, (urlCounts.get(document.canonicalUrl) ?? 0) + 1)
  }
  const survivors = selfCanonicalDocs
    .filter(
      (document) =>
        pathCounts.get(document.canonicalPath) === 1 && urlCounts.get(document.canonicalUrl) === 1,
    )
    .sort((a, b) => a.canonicalUrl.localeCompare(b.canonicalUrl))
  return survivors
}

export async function getSitemapEntries(
  payload: Payload,
  siteId?: string,
): Promise<CrawlerEntry[]> {
  const survivors = await collectSitemapDocuments(payload, siteId, false)
  if (!survivors) {
    return crawlerEntries(await getAllIndexableDiscoveryDocuments(payload, siteId))
  }
  return crawlerEntries(survivors)
}

/**
 * The sitemap index's view of the projection: total entry count and the
 * latest lastmod per 1,000-entry page, in the same canonical-URL order the
 * child pages serve. Runs the light pipeline (no media loads, no image
 * chain — neither can change a count or a date), so the index no longer
 * pays the child pages' full entry-shaping cost.
 */
export async function getSitemapIndexSummary(
  payload: Payload,
  siteId?: string,
): Promise<{ total: number; pageLastmods: Array<string | null> }> {
  const survivors = await collectSitemapDocuments(payload, siteId, true)
  const lastmods: Array<string | undefined> = survivors
    ? survivors.map((doc) => {
        const modified = doc.dates.modifiedAt || doc.dates.publishedAt
        if (!modified) return undefined
        const time = Date.parse(modified)
        return Number.isFinite(time) ? new Date(time).toISOString() : undefined
      })
    : crawlerEntries(await getAllIndexableDiscoveryDocuments(payload, siteId)).map(
        (entry) => entry.lastmod,
      )
  const pageLastmods: Array<string | null> = []
  for (let i = 0; i < lastmods.length; i += SITEMAP_PAGE_SIZE) {
    let latest: string | null = null
    for (const lastmod of lastmods.slice(i, i + SITEMAP_PAGE_SIZE)) {
      if (lastmod && (!latest || lastmod > latest)) latest = lastmod
    }
    pageLastmods.push(latest)
  }
  return { total: lastmods.length, pageLastmods }
}
