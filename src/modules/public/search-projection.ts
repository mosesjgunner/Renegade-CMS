import type { Payload } from 'payload'

import {
  discoveryToSearchDocument,
  resolveDiscoveryDocument,
  type DiscoveryDocument,
  type SearchDocument,
} from './discovery'

/** Increment this only for a deliberately incompatible projection change. */
export const SEARCH_INDEX_VERSION = 1
export const SEARCH_ADAPTER_THRESHOLD = {
  corpusDocuments: 100_000,
  p95LatencyMs: 250,
  consecutiveMeasurementWindows: 3,
} as const

type Pool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}
const poolFor = (payload: Payload) => (payload.db as unknown as { pool: Pool }).pool
const idOf = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id || '')

export type ProjectedSearchDocument = SearchDocument & {
  collection: string
  canonicalRevisionId: string | null
  canonicalUrl: string
  contentType: string
  author: string | null
  language: string | null
  publishedAt: string | null
  mediaHints: string[]
  indexVersion: number
}

export function searchProjectionFromDiscovery(
  doc: DiscoveryDocument,
  collection: string,
): ProjectedSearchDocument | null {
  if (!doc.indexability.indexable || !doc.search.eligible || doc.redirect.isTombstone) return null
  const base = discoveryToSearchDocument(doc)
  return {
    ...base,
    collection,
    canonicalRevisionId: doc.revisions.publishedRevisionId,
    canonicalUrl: doc.canonicalUrl,
    contentType: doc.contentType,
    author: doc.author?.name || null,
    language: doc.social?.locale || null,
    publishedAt: doc.dates.publishedAt || null,
    mediaHints: doc.socialImage.url ? ['image'] : [],
    indexVersion: SEARCH_INDEX_VERSION,
  }
}

/** Upserts the public projection. It is derived data only: canonical state remains in Payload. */
export async function projectSearchDocument(
  payload: Payload,
  input: { collection: string; record: Record<string, unknown> },
): Promise<'upserted' | 'removed'> {
  const siteId = idOf(input.record.site)
  const canonicalId = String(input.record.id || '')
  if (!canonicalId) return 'removed'
  const doc = await resolveDiscoveryDocument(payload, {
    collection: input.collection,
    record: input.record,
    path: String(input.record.canonicalPath || ''),
    slug: typeof input.record.slug === 'string' ? input.record.slug : undefined,
    siteId: siteId || undefined,
  })
  const projection = searchProjectionFromDiscovery(doc, input.collection)
  if (!projection) {
    await poolFor(payload).query(
      'DELETE FROM search_documents WHERE collection = $1 AND canonical_id = $2',
      [input.collection, canonicalId],
    )
    return 'removed'
  }
  await poolFor(payload).query(
    `INSERT INTO search_documents (site_id, collection, canonical_id, canonical_revision_id, canonical_url, path, content_type, title, excerpt, body, author, taxonomy, published_at, modified_at, language, media_hints, visibility, index_version, indexed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'public',$17,now())
     ON CONFLICT (collection, canonical_id) DO UPDATE SET
       site_id=EXCLUDED.site_id, canonical_revision_id=EXCLUDED.canonical_revision_id, canonical_url=EXCLUDED.canonical_url, path=EXCLUDED.path, content_type=EXCLUDED.content_type, title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body=EXCLUDED.body, author=EXCLUDED.author, taxonomy=EXCLUDED.taxonomy, published_at=EXCLUDED.published_at, modified_at=EXCLUDED.modified_at, language=EXCLUDED.language, media_hints=EXCLUDED.media_hints, visibility=EXCLUDED.visibility, index_version=EXCLUDED.index_version, indexed_at=now()`,
    [
      projection.siteId,
      input.collection,
      canonicalId,
      projection.canonicalRevisionId,
      projection.canonicalUrl,
      projection.path,
      projection.contentType,
      projection.title,
      projection.excerpt || projection.summary || '',
      projection.body || '',
      projection.author,
      projection.taxonomy || '',
      projection.publishedAt,
      projection.updatedAt,
      projection.language,
      JSON.stringify(projection.mediaHints || []),
      SEARCH_INDEX_VERSION,
    ],
  )
  return 'upserted'
}

export async function removeSearchDocument(
  payload: Payload,
  collection: string,
  record: Record<string, unknown>,
) {
  await poolFor(payload).query(
    'DELETE FROM search_documents WHERE collection = $1 AND canonical_id = $2',
    [collection, String(record.id)],
  )
}

export const searchProjectionHooks = (collection: string) => ({
  afterChange: [
    async ({ doc, req }: { doc: Record<string, unknown>; req: { payload: Payload } }) => {
      await projectSearchDocument(req.payload, { collection, record: doc })
      return doc
    },
  ],
  afterDelete: [
    async ({ doc, req }: { doc: Record<string, unknown>; req: { payload: Payload } }) => {
      await removeSearchDocument(req.payload, collection, doc)
      return doc
    },
  ],
})

export async function rebuildSearchProjection(payload: Payload, siteId?: string) {
  const collections = [
    'content',
    'podcast-shows',
    'podcast-episodes',
    'videos',
    'page-layouts',
    'products',
  ]
  if (!siteId) await poolFor(payload).query('TRUNCATE search_documents')
  else await poolFor(payload).query('DELETE FROM search_documents WHERE site_id = $1', [siteId])
  let processed = 0
  for (const collection of collections) {
    const result = await payload
      .find({
        collection: collection as never,
        where: siteId ? { site: { equals: siteId } } : {},
        depth: 2,
        limit: 1000,
        overrideAccess: true,
      } as never)
      .catch(() => ({ docs: [] }))
    for (const record of result.docs as unknown as Record<string, unknown>[]) {
      await projectSearchDocument(payload, { collection, record })
      processed++
    }
  }
  return { processed, version: SEARCH_INDEX_VERSION }
}

export async function reconcileSearchProjection(payload: Payload, siteId?: string) {
  const before = await poolFor(payload).query(
    'SELECT count(*)::int AS count FROM search_documents' + (siteId ? ' WHERE site_id = $1' : ''),
    siteId ? [siteId] : [],
  )
  const rebuilt = await rebuildSearchProjection(payload, siteId)
  const after = await poolFor(payload).query(
    'SELECT count(*)::int AS count FROM search_documents' + (siteId ? ' WHERE site_id = $1' : ''),
    siteId ? [siteId] : [],
  )
  return {
    ...rebuilt,
    before: Number(before.rows[0]?.count || 0),
    after: Number(after.rows[0]?.count || 0),
  }
}

export async function querySearchProjection(
  payload: Payload,
  input: {
    siteId: string
    query: string
    page?: number
    pageSize?: number
    type?: string
    author?: string
    topic?: string
    from?: string
    to?: string
  },
) {
  const query = input.query.trim()
  const page = Math.max(1, input.page || 1)
  const pageSize = Math.max(1, Math.min(50, input.pageSize || 10))
  if (!query) return { hits: [] as ProjectedSearchDocument[], total: 0, page, pageCount: 0 }
  const values: unknown[] = [input.siteId, query]
  const predicates = [
    'site_id = $1',
    "visibility = 'public'",
    'index_version = ' + SEARCH_INDEX_VERSION,
    "search_vector @@ websearch_to_tsquery('simple', $2)",
  ]
  const add = (column: string, value?: string, op = '=') => {
    if (!value) return
    values.push(value)
    predicates.push(`${column} ${op} $${values.length}`)
  }
  add('content_type', input.type)
  add('author', input.author)
  if (input.topic) {
    values.push(input.topic)
    predicates.push(`taxonomy ILIKE '%' || $${values.length} || '%'`)
  }
  add('published_at', input.from, '>=')
  add('published_at', input.to, '<=')
  values.push(pageSize, (page - 1) * pageSize)
  const where = predicates.join(' AND ')
  const result = await poolFor(payload).query(
    `SELECT canonical_id AS id, site_id AS "siteId", path, title, excerpt, body, taxonomy, modified_at AS "updatedAt", collection, canonical_revision_id AS "canonicalRevisionId", canonical_url AS "canonicalUrl", content_type AS "contentType", author, language, published_at AS "publishedAt", media_hints AS "mediaHints", index_version AS "indexVersion", count(*) OVER()::int AS total
     FROM search_documents WHERE ${where}
     ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('simple', $2)) DESC, published_at DESC NULLS LAST, canonical_id ASC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  )
  const total = Number(result.rows[0]?.total || 0)
  return {
    hits: result.rows as unknown as ProjectedSearchDocument[],
    total,
    page,
    pageCount: Math.ceil(total / pageSize),
  }
}

export async function searchHealth(payload: Payload) {
  const result = await poolFor(payload).query(
    `SELECT site_id, content_type, count(*)::int AS count, max(indexed_at) AS last_indexed_at,
      count(*) FILTER (WHERE body = '')::int AS missing_body,
      count(*) FILTER (WHERE index_version <> $1)::int AS version_mismatch
     FROM search_documents GROUP BY site_id, content_type ORDER BY site_id, content_type`,
    [SEARCH_INDEX_VERSION],
  )
  return result.rows
}

/** Contract for a future external service; no provider is enabled by default. */
export interface ExternalSearchAdapter {
  readonly id: string
  rebuild(documents: AsyncIterable<ProjectedSearchDocument>): Promise<void>
  query(input: {
    siteId: string
    query: string
    filters?: Record<string, string>
  }): Promise<{ ids: string[] }>
}
