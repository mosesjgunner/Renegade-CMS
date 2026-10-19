import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { resolveSiteSettings } from '../core/site-settings'

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
// Lifecycle projection writes commit or roll back with the canonical mutation.
async function projectionQuery(
  payload: Payload,
  req: Partial<PayloadRequest> | undefined,
  text: string,
  values: unknown[],
) {
  const transactionID = await req?.transactionID
  if (!transactionID) return poolFor(payload).query(text, values)
  const db = payload.db as unknown as {
    sessions: Record<string, { db: { execute: (query: unknown) => Promise<unknown> } }>
  }
  const transaction = db.sessions[transactionID]?.db
  if (!transaction) throw new Error('Search projection transaction unavailable.')
  const pieces = text
    .split(/(\$\d+)/)
    .map((part) =>
      /^\$\d+$/.test(part) ? sql`${values[Number(part.slice(1)) - 1]}` : sql.raw(part),
    )
  return transaction.execute(sql.join(pieces, sql.raw('')))
}
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
  input: { collection: string; record: Record<string, unknown>; req?: Partial<PayloadRequest> },
): Promise<'upserted' | 'removed'> {
  const siteId = idOf(input.record.site)
  const canonicalId = String(input.record.id || '')
  if (!canonicalId) return 'removed'
  // Lifecycle hooks run before commit. Read companions and revisions in that
  // same request transaction so republishing indexes the new public pointer.
  const scopedPayload = input.req
    ? (Object.assign(Object.create(payload), {
        find: (args: Parameters<Payload['find']>[0]) => payload.find({ ...args, req: input.req }),
        findByID: (args: Parameters<Payload['findByID']>[0]) =>
          payload.findByID({ ...args, req: input.req }),
        findGlobal: (args: Parameters<Payload['findGlobal']>[0]) =>
          payload.findGlobal({ ...args, req: input.req }),
      }) as Payload)
    : payload
  const doc = await resolveDiscoveryDocument(scopedPayload, {
    collection: input.collection,
    record: input.record,
    path: String(input.record.canonicalPath || ''),
    slug: typeof input.record.slug === 'string' ? input.record.slug : undefined,
    siteId: siteId || undefined,
  })
  const projection = searchProjectionFromDiscovery(doc, input.collection)
  if (!projection) {
    await projectionQuery(
      payload,
      input.req,
      'DELETE FROM search_documents WHERE collection = $1 AND canonical_id = $2',
      [input.collection, canonicalId],
    )
    return 'removed'
  }
  await projectionQuery(
    payload,
    input.req,
    `INSERT INTO search_documents (site_id, collection, canonical_id, canonical_revision_id, canonical_url, path, content_type, title, excerpt, body, author, taxonomy, published_at, modified_at, language, media_hints, visibility, index_version, indexed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'public',$17,now())
     ON CONFLICT (collection, canonical_id) DO UPDATE SET
       site_id=EXCLUDED.site_id, canonical_revision_id=EXCLUDED.canonical_revision_id, canonical_url=EXCLUDED.canonical_url, path=EXCLUDED.path, content_type=EXCLUDED.content_type, title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body=EXCLUDED.body, author=EXCLUDED.author, taxonomy=EXCLUDED.taxonomy, published_at=EXCLUDED.published_at, modified_at=EXCLUDED.modified_at, language=EXCLUDED.language, media_hints=EXCLUDED.media_hints, visibility=EXCLUDED.visibility, index_version=EXCLUDED.index_version, indexed_at=now()`,
    [
      siteId || projection.siteId,
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
  req?: Partial<PayloadRequest>,
) {
  await projectionQuery(
    payload,
    req,
    'DELETE FROM search_documents WHERE collection = $1 AND canonical_id = $2',
    [collection, String(record.id)],
  )
}

export const searchProjectionHooks = (collection: string) => ({
  afterChange: [
    async ({ doc, req }: { doc: Record<string, unknown>; req: { payload: Payload } }) => {
      await projectSearchDocument(req.payload, { collection, record: doc, req })
      return doc
    },
  ],
  afterDelete: [
    async ({ doc, req }: { doc: Record<string, unknown>; req: { payload: Payload } }) => {
      await removeSearchDocument(req.payload, collection, doc, req)
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
    'books',
    'page-layouts',
    'products',
  ].filter((collection) => collection in payload.collections)
  let processed = 0
  const retained: string[] = []
  // Do not clear a working index before reads succeed. Sweep stale rows only after a complete rebuild.
  for (const collection of collections) {
    let page = 1
    let more = true
    while (more) {
      const result = await payload.find({
        collection: collection as never,
        where: siteId ? { site: { equals: siteId } } : {},
        depth: 2,
        limit: 200,
        page,
        sort: 'id',
        overrideAccess: true,
      })
      for (const record of result.docs as unknown as Record<string, unknown>[]) {
        await projectSearchDocument(payload, { collection, record })
        retained.push(`${collection}:${record.id}`)
        processed++
      }
      more = result.hasNextPage
      page++
    }
  }
  await poolFor(payload).query(
    "DELETE FROM search_documents WHERE NOT ((collection || ':' || canonical_id) = ANY($1::text[]))" +
      (siteId ? ' AND site_id = $2' : ''),
    siteId ? [retained, siteId] : [retained],
  )
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
  const settings = await resolveSiteSettings(payload).catch(() => null)
  const values: unknown[] = [input.siteId, query]
  const sitePredicate = 'site_id = $1'
  const predicates = [
    sitePredicate,
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
  if (input.to) {
    values.push(input.to)
    predicates.push(`published_at < $${values.length}::date + interval '1 day'`)
  }
  const where = predicates.join(' AND ')
  const result = await poolFor(payload).query(
    `SELECT canonical_id AS id, site_id AS "siteId", path, title, excerpt, body, taxonomy, modified_at AS "updatedAt", collection, canonical_revision_id AS "canonicalRevisionId", canonical_url AS "canonicalUrl", content_type AS "contentType", author, language, published_at AS "publishedAt", media_hints AS "mediaHints", index_version AS "indexVersion", count(*) OVER()::int AS total
     FROM search_documents WHERE ${where}
     ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('simple', $2)) DESC, published_at DESC NULLS LAST, canonical_id ASC`,
    values,
  )
  // Projections rank candidates; current canonical policy authorizes every public result.
  // This also suppresses stale rows after settings/access changes without requiring a reindex.
  const hits: ProjectedSearchDocument[] = []
  if (
    settings?.launchState === 'live' &&
    settings.indexingMode === 'index' &&
    !settings.seoNoIndex
  ) {
    for (const row of result.rows) {
      const record = await payload
        .findByID({
          collection: row.collection as never,
          id: String(row.id),
          depth: 2,
          overrideAccess: true,
        })
        .catch(() => null)
      if (!record || idOf((record as unknown as Record<string, unknown>).site) !== input.siteId)
        continue
      const doc = await resolveDiscoveryDocument(payload, {
        collection: String(row.collection),
        record: record as unknown as Record<string, unknown>,
        siteId: input.siteId,
      })
      const current = searchProjectionFromDiscovery(doc, String(row.collection))
      if (current) hits.push(current)
    }
  }
  const total = hits.length
  return {
    hits: hits.slice((page - 1) * pageSize, page * pageSize),
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
