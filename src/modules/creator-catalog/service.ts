import type { Payload } from 'payload'
import {
  catalogChecksum,
  classifyCatalogManifest,
  durableKeyFor,
  itemChecksum,
  slugifyCatalogTitle,
  type CatalogAccessPolicy,
  type CatalogClassification,
  type CatalogListingPolicy,
  type CatalogManifest,
  type ManifestItem,
  type ManifestSeries,
} from './contracts'

/**
 * Creator catalog service (RC3-12, non-podcast slice).
 *
 * Stage first, apply second: staging persists the manifest and its
 * per-item verdicts and writes NOTHING to the catalog tables; apply
 * writes only `ready` items, keyed by durable key + checksum, so a
 * partial apply resumes without duplicates and a re-apply is a no-op.
 * Staging and applying send no notifications — an import is silent
 * until the operator chooses to publish.
 *
 * Listing policy and access policy are separate axes. The public
 * listing and the search projection filter on BOTH before any entry,
 * facet or snippet is produced: member-only and unlisted works never
 * reach the anonymous projection, not even as a facet count.
 */

export class CatalogError extends Error {
  status: number
  code: string

  constructor(message: string, status = 400, code = 'CATALOG_ERROR') {
    super(message)
    this.name = 'CatalogError'
    this.status = status
    this.code = code
  }
}

type Query = <T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
) => Promise<{ rows: T[] }>
type Client = { query: Query; release?: () => void }
type DbPayload = Payload & { db: { pool?: { connect?: () => Promise<Client>; query?: Query } } }

async function transaction<T>(payload: Payload, work: (query: Query) => Promise<T>): Promise<T> {
  const client = await (payload as DbPayload).db.pool?.connect?.()
  if (!client)
    throw new CatalogError(
      'Creator catalog requires transactional database access.',
      503,
      'CATALOG_DB_UNAVAILABLE',
    )
  try {
    await client.query('BEGIN')
    const result = await work(client.query.bind(client))
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release?.()
  }
}

async function requireCatalogStaff(query: Query, siteId: string, actorMemberId: string) {
  const row = (
    await query<{ role: string }>(
      'SELECT role FROM member_site_roles WHERE site_id=$1 AND member_id=$2',
      [siteId, actorMemberId],
    )
  ).rows[0]
  if (!row)
    throw new CatalogError('Actor has no standing on this site.', 403, 'CATALOG_NO_STANDING')
  // The site role ladder names the owner/admin tier 'community-manager'
  // (the same tier community/groups.ts treats as site staff).
  if (row.role !== 'community-manager')
    throw new CatalogError(
      'Catalog import requires a site owner or admin.',
      403,
      'CATALOG_STAFF_REQUIRED',
    )
}

type RunRow = {
  id: string
  site_id: string
  manifest: CatalogManifest
  manifest_checksum: string
  state: string
  report: CatalogClassification & { applied?: Record<string, string> }
}

export async function stageCatalogImport(
  payload: Payload,
  input: { siteId: string; actorMemberId: string; manifest: CatalogManifest },
) {
  return transaction(payload, async (query) => {
    await requireCatalogStaff(query, input.siteId, input.actorMemberId)
    const checksum = catalogChecksum(input.manifest)
    const prior = (
      await query<RunRow>(
        'SELECT * FROM creator_catalog_import_runs WHERE site_id=$1 AND manifest_checksum=$2',
        [input.siteId, checksum],
      )
    ).rows[0]
    if (prior)
      return {
        runId: prior.id,
        state: prior.state,
        classification: prior.report,
        replayed: true,
      }
    const existingTitles = (
      await query<{ title: string }>('SELECT title FROM creator_catalog_items WHERE site_id=$1', [
        input.siteId,
      ])
    ).rows.map((row) => row.title)
    const classification = classifyCatalogManifest(input.manifest, existingTitles)
    const run = (
      await query<{ id: string }>(
        `INSERT INTO creator_catalog_import_runs (site_id, actor_member_id, manifest_checksum, manifest, report)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING id`,
        [
          input.siteId,
          input.actorMemberId,
          checksum,
          JSON.stringify(input.manifest),
          JSON.stringify(classification),
        ],
      )
    ).rows[0]!
    return { runId: run.id, state: 'staged', classification, replayed: false }
  })
}

export async function getCatalogImportRun(
  payload: Payload,
  input: { siteId: string; runId: string },
) {
  return transaction(payload, async (query) => {
    const run = (
      await query<RunRow>('SELECT * FROM creator_catalog_import_runs WHERE id=$1 AND site_id=$2', [
        input.runId,
        input.siteId,
      ])
    ).rows[0]
    if (!run) throw new CatalogError('Catalog import run not found.', 404, 'CATALOG_RUN_NOT_FOUND')
    return run
  })
}

async function ensureSeries(
  query: Query,
  siteId: string,
  creatorMemberId: string,
  series: ManifestSeries,
): Promise<string> {
  const slug = (series.slug?.trim() || slugifyCatalogTitle(series.title)).slice(0, 160)
  const provenance = { source: 'catalog-manifest', seriesSourceId: series.sourceId }
  const checksum = catalogChecksum({ title: series.title, slug, sourceId: series.sourceId })
  const row = (
    await query<{ id: string }>(
      `INSERT INTO creator_catalog_series (site_id, creator_member_id, slug, title, description, listing_policy, access_policy, provenance, checksum)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT (site_id, slug) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
         listing_policy=EXCLUDED.listing_policy, access_policy=EXCLUDED.access_policy, updated_at=now()
       RETURNING id`,
      [
        siteId,
        creatorMemberId,
        slug,
        series.title,
        series.description ?? null,
        series.listingPolicy === 'unlisted' ? 'unlisted' : 'listed',
        series.accessPolicy === 'member' ? 'member' : 'free',
        JSON.stringify(provenance),
        checksum,
      ],
    )
  ).rows[0]!
  return row.id
}

export async function applyCatalogImport(
  payload: Payload,
  input: { siteId: string; actorMemberId: string; runId: string; maxItems?: number },
) {
  return transaction(payload, async (query) => {
    await requireCatalogStaff(query, input.siteId, input.actorMemberId)
    const run = (
      await query<RunRow>(
        'SELECT * FROM creator_catalog_import_runs WHERE id=$1 AND site_id=$2 FOR UPDATE',
        [input.runId, input.siteId],
      )
    ).rows[0]
    if (!run) throw new CatalogError('Catalog import run not found.', 404, 'CATALOG_RUN_NOT_FOUND')
    const classification = run.report
    const readyKeys = new Set(
      classification.items.filter((verdict) => verdict.state === 'ready').map((v) => v.durableKey),
    )
    const seriesBySource = new Map(run.manifest.series.map((series) => [series.sourceId, series]))
    let created = 0
    let updated = 0
    let skipped = 0
    let processed = 0
    const limit = input.maxItems ?? Number.POSITIVE_INFINITY
    const applied: Record<string, string> = { ...(classification.applied ?? {}) }

    for (const series of run.manifest.series) {
      for (const item of series.items) {
        const key = durableKeyFor(series.sourceId, item.sourceId)
        if (!readyKeys.has(key)) continue
        const checksum = itemChecksum(item)
        const existing = (
          await query<{ id: string; checksum: string }>(
            'SELECT id, checksum FROM creator_catalog_items WHERE site_id=$1 AND durable_key=$2',
            [input.siteId, key],
          )
        ).rows[0]
        if (existing && existing.checksum === checksum) {
          skipped++
          applied[key] = existing.id
          continue
        }
        if (processed >= limit) continue
        processed++
        const seriesId = await ensureSeries(
          query,
          input.siteId,
          input.actorMemberId,
          seriesBySource.get(series.sourceId)!,
        )
        const slug = (item.slug?.trim() || slugifyCatalogTitle(item.title)).slice(0, 160)
        const provenance = {
          source: run.manifest.source,
          seriesSourceId: series.sourceId,
          itemSourceId: item.sourceId,
          legacyUrl: item.legacyUrl ?? null,
        }
        if (existing) {
          await query(
            `UPDATE creator_catalog_items SET series_id=$1, season_number=$2, position=$3, kind=$4, title=$5,
               slug=$6, legacy_url=$7, work_ref_collection=$8, work_ref_id=$9, transcript=$10, variants=$11::jsonb,
               listing_policy=$12, access_policy=$13, rights_status=$14, consent_status=$15,
               provenance=$16::jsonb, checksum=$17, updated_at=now()
             WHERE id=$18`,
            [
              seriesId,
              item.season ?? null,
              item.position ?? 0,
              item.kind,
              item.title,
              slug,
              item.legacyUrl ?? null,
              item.workRef?.collection ?? null,
              item.workRef?.id ?? null,
              item.transcript ?? null,
              JSON.stringify(item.variants ?? []),
              item.listingPolicy === 'unlisted' ? 'unlisted' : 'listed',
              item.accessPolicy === 'member' ? 'member' : 'free',
              item.rightsStatus ?? 'owned',
              item.consentStatus ?? 'not-required',
              JSON.stringify(provenance),
              checksum,
              existing.id,
            ],
          )
          updated++
          applied[key] = existing.id
        } else {
          const inserted = (
            await query<{ id: string }>(
              `INSERT INTO creator_catalog_items (site_id, series_id, season_number, position, kind, title, slug,
                 legacy_url, work_ref_collection, work_ref_id, transcript, variants, listing_policy, access_policy,
                 rights_status, consent_status, durable_key, provenance, checksum)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18::jsonb,$19) RETURNING id`,
              [
                input.siteId,
                seriesId,
                item.season ?? null,
                item.position ?? 0,
                item.kind,
                item.title,
                slug,
                item.legacyUrl ?? null,
                item.workRef?.collection ?? null,
                item.workRef?.id ?? null,
                item.transcript ?? null,
                JSON.stringify(item.variants ?? []),
                item.listingPolicy === 'unlisted' ? 'unlisted' : 'listed',
                item.accessPolicy === 'member' ? 'member' : 'free',
                item.rightsStatus ?? 'owned',
                item.consentStatus ?? 'not-required',
                key,
                JSON.stringify(provenance),
                checksum,
              ],
            )
          ).rows[0]!
          created++
          applied[key] = inserted.id
        }
      }
    }

    const remaining = [...readyKeys].filter((key) => !(key in applied)).length
    const state =
      remaining === 0 ? 'applied' : created + updated > 0 ? 'partially-applied' : run.state
    await query(
      'UPDATE creator_catalog_import_runs SET state=$1, report=$2::jsonb, updated_at=now() WHERE id=$3',
      [state, JSON.stringify({ ...classification, applied }), run.id],
    )
    return { runId: run.id, state, created, updated, skipped, remaining }
  })
}

export type CatalogViewer = { memberId?: string; entitled?: boolean }

const visibleSql = (viewer: CatalogViewer) =>
  viewer.entitled
    ? `s.listing_policy='listed' AND i.listing_policy='listed'`
    : `s.listing_policy='listed' AND i.listing_policy='listed' AND s.access_policy='free' AND i.access_policy='free'`

export async function listPublicCatalog(
  payload: Payload,
  input: { siteId: string; viewer: CatalogViewer },
) {
  return transaction(payload, async (query) => {
    const rows = (
      await query<{
        series_id: string
        series_title: string
        series_slug: string
        item_id: string
        title: string
        slug: string
        kind: string
        season_number: number | null
        position: number
        access_policy: CatalogAccessPolicy
      }>(
        `SELECT s.id AS series_id, s.title AS series_title, s.slug AS series_slug,
                i.id AS item_id, i.title, i.slug, i.kind, i.season_number, i.position, i.access_policy
         FROM creator_catalog_series s JOIN creator_catalog_items i ON i.series_id=s.id
         WHERE s.site_id=$1 AND ${visibleSql(input.viewer)}
         ORDER BY s.title, i.season_number NULLS LAST, i.position, i.title`,
        [input.siteId],
      )
    ).rows
    const series = new Map<string, { id: string; title: string; slug: string; items: unknown[] }>()
    for (const row of rows) {
      if (!series.has(row.series_id))
        series.set(row.series_id, {
          id: row.series_id,
          title: row.series_title,
          slug: row.series_slug,
          items: [],
        })
      series.get(row.series_id)!.items.push({
        id: row.item_id,
        title: row.title,
        slug: row.slug,
        kind: row.kind,
        season: row.season_number,
        position: row.position,
        accessPolicy: row.access_policy,
      })
    }
    return [...series.values()]
  })
}

/**
 * The search projection. Filtering happens FIRST — the entries, the
 * facet counts and the snippets are all computed from the already
 * filtered set, so a private work cannot leak through a facet count
 * or a transcript snippet.
 */
export async function catalogSearchProjection(
  payload: Payload,
  input: { siteId: string; viewer: CatalogViewer; query?: string },
) {
  return transaction(payload, async (query) => {
    const rows = (
      await query<{
        item_id: string
        title: string
        kind: string
        series_title: string
        transcript: string | null
      }>(
        `SELECT i.id AS item_id, i.title, i.kind, s.title AS series_title, i.transcript
         FROM creator_catalog_series s JOIN creator_catalog_items i ON i.series_id=s.id
         WHERE s.site_id=$1 AND ${visibleSql(input.viewer)}
         ORDER BY i.title`,
        [input.siteId],
      )
    ).rows
    const needle = input.query?.trim().toLowerCase()
    const entries = rows
      .filter((row) => !needle || row.title.toLowerCase().includes(needle))
      .map((row) => ({
        itemId: row.item_id,
        title: row.title,
        kind: row.kind,
        seriesTitle: row.series_title,
        snippet: row.transcript ? row.transcript.slice(0, 120) : '',
      }))
    const facets: Record<string, number> = {}
    for (const entry of entries) facets[entry.kind] = (facets[entry.kind] ?? 0) + 1
    return { entries, facets }
  })
}

/**
 * Export the site's catalog graph back to a versioned manifest.
 * Durable keys become the source ids, so restoring the export on
 * another site reproduces the same keys, titles and checksums.
 */
export async function exportCatalogManifest(
  payload: Payload,
  input: { siteId: string; actorMemberId: string },
): Promise<CatalogManifest> {
  return transaction(payload, async (query) => {
    await requireCatalogStaff(query, input.siteId, input.actorMemberId)
    const seriesRows = (
      await query<{
        id: string
        slug: string
        title: string
        description: string | null
        listing_policy: CatalogListingPolicy
        access_policy: CatalogAccessPolicy
        provenance: { seriesSourceId?: string }
      }>('SELECT * FROM creator_catalog_series WHERE site_id=$1 ORDER BY title', [input.siteId])
    ).rows
    const series: ManifestSeries[] = []
    for (const row of seriesRows) {
      const items = (
        await query<Record<string, unknown>>(
          'SELECT * FROM creator_catalog_items WHERE series_id=$1 ORDER BY season_number NULLS LAST, position, title',
          [row.id],
        )
      ).rows
      series.push({
        sourceId: row.provenance?.seriesSourceId ?? row.slug,
        title: row.title,
        slug: row.slug,
        description: row.description ?? undefined,
        listingPolicy: row.listing_policy,
        accessPolicy: row.access_policy,
        items: items.map((item) => {
          const durable = String(item.durable_key)
          const sourceId = durable.includes('/') ? durable.slice(durable.indexOf('/') + 1) : durable
          const manifestItem: ManifestItem = {
            sourceId,
            kind: String(item.kind),
            title: String(item.title),
            slug: String(item.slug),
            season: (item.season_number as number | null) ?? undefined,
            position: Number(item.position ?? 0),
            legacyUrl: (item.legacy_url as string | null) ?? undefined,
            workRef:
              item.work_ref_collection && item.work_ref_id
                ? { collection: String(item.work_ref_collection), id: String(item.work_ref_id) }
                : undefined,
            transcript: (item.transcript as string | null) ?? undefined,
            variants: (item.variants as unknown[]) ?? [],
            listingPolicy: String(item.listing_policy),
            accessPolicy: String(item.access_policy),
            rightsStatus: String(item.rights_status),
            consentStatus: String(item.consent_status),
          }
          return { ...manifestItem, checksum: itemChecksum(manifestItem) }
        }),
      })
    }
    return { formatVersion: 1, source: 'catalog-export', series }
  })
}
