import { createHash } from 'node:crypto'

/**
 * Creator catalog manifest contracts (RC3-12, non-podcast slice).
 *
 * A catalog arrives as a VERSIONED MANIFEST and is staged before any
 * write: every item is classified ready / review / blocked with
 * actionable reasons. The classification is a pure function of the
 * manifest plus the site's existing catalog titles, so the exact same
 * verdicts are reproducible in unit tests and at staging time.
 *
 * Items carry durable keys (series source id + item source id),
 * provenance, consent/rights status and a content checksum — the
 * resume and export/restore proofs key off those, never off titles.
 *
 * Member-roster records are refused by design: importing people
 * requires the approved, separately audited grant workflow, and a
 * catalog import creates no billing or newsletter consent. Podcast
 * episode/feed records are not a manifest kind here; they ride
 * RC3-10/11 and are reported as unsupported, never silently mapped.
 */

export const CATALOG_MANIFEST_VERSION = 1

export const catalogItemKinds = ['article', 'video', 'audio', 'gallery', 'link'] as const
export type CatalogItemKind = (typeof catalogItemKinds)[number]
export const catalogListingPolicies = ['listed', 'unlisted'] as const
export type CatalogListingPolicy = (typeof catalogListingPolicies)[number]
export const catalogAccessPolicies = ['free', 'member'] as const
export type CatalogAccessPolicy = (typeof catalogAccessPolicies)[number]
export const catalogRightsStatuses = ['owned', 'licensed', 'unknown'] as const
export type CatalogRightsStatus = (typeof catalogRightsStatuses)[number]
export const catalogConsentStatuses = ['granted', 'not-required', 'missing'] as const
export type CatalogConsentStatus = (typeof catalogConsentStatuses)[number]

export type ManifestItem = {
  sourceId: string
  kind: string
  title: string
  slug?: string
  season?: number
  position?: number
  legacyUrl?: string
  workRef?: { collection: string; id: string }
  transcript?: string
  variants?: unknown[]
  listingPolicy?: string
  accessPolicy?: string
  rightsStatus?: string
  consentStatus?: string
  checksum?: string
  roster?: boolean
}

export type ManifestSeries = {
  sourceId: string
  title: string
  slug?: string
  description?: string
  listingPolicy?: string
  accessPolicy?: string
  items: ManifestItem[]
}

export type CatalogManifest = {
  formatVersion: number
  source: string
  series: ManifestSeries[]
}

export type ItemVerdictState = 'ready' | 'review' | 'blocked'
export type ItemVerdict = {
  durableKey: string
  seriesSourceId: string
  itemSourceId: string
  title: string
  state: ItemVerdictState
  reasons: string[]
}
export type SeriesVerdict = {
  seriesSourceId: string
  title: string
  state: ItemVerdictState
  reasons: string[]
}
export type CatalogClassification = {
  manifestChecksum: string
  series: SeriesVerdict[]
  items: ItemVerdict[]
  counts: Record<ItemVerdictState, number>
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const item = value as Record<string, unknown>
  return `{${Object.keys(item)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(item[key])}`)
    .join(',')}}`
}

export function catalogChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex')
}

export function slugifyCatalogTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
}

export function durableKeyFor(seriesSourceId: string, itemSourceId: string): string {
  const clean = (value: string) => value.trim().replace(/\s+/g, '-')
  return `${clean(seriesSourceId)}/${clean(itemSourceId)}`
}

/** The canonical content an item's checksum covers — identity + body, not staging metadata. */
export function itemChecksum(item: ManifestItem): string {
  return catalogChecksum({
    kind: item.kind,
    title: item.title,
    slug: item.slug ?? null,
    season: item.season ?? null,
    legacyUrl: item.legacyUrl ?? null,
    workRef: item.workRef ?? null,
    transcript: item.transcript ?? null,
    variants: item.variants ?? [],
    rightsStatus: item.rightsStatus ?? 'owned',
    consentStatus: item.consentStatus ?? 'not-required',
  })
}

const worst = (a: ItemVerdictState, b: ItemVerdictState): ItemVerdictState =>
  a === 'blocked' || b === 'blocked'
    ? 'blocked'
    : a === 'review' || b === 'review'
      ? 'review'
      : 'ready'

/**
 * Classify every item in a manifest. `existingTitles` are the titles
 * already in the site's catalog (a collision sends the new item to
 * review, never to a silent overwrite).
 */
export function classifyCatalogManifest(
  manifest: CatalogManifest,
  existingTitles: readonly string[] = [],
): CatalogClassification {
  if (!manifest || typeof manifest !== 'object')
    throw new Error('Catalog manifest must be an object.')
  if (manifest.formatVersion !== CATALOG_MANIFEST_VERSION)
    throw new Error(
      `Unsupported catalog manifest version: ${String(manifest.formatVersion)} (expected ${CATALOG_MANIFEST_VERSION}).`,
    )
  if (!Array.isArray(manifest.series)) throw new Error('Catalog manifest requires a series list.')

  const seenTitles = new Map<string, string>()
  for (const title of existingTitles) seenTitles.set(title.trim().toLowerCase(), 'existing catalog')
  const items: ItemVerdict[] = []
  const seriesVerdicts: SeriesVerdict[] = []

  for (const series of manifest.series) {
    const seriesReasons: string[] = []
    let seriesState: ItemVerdictState = 'ready'
    if (!series?.sourceId?.trim() || !series?.title?.trim()) {
      seriesState = 'blocked'
      seriesReasons.push('malformed series: sourceId and title are required')
    }
    if (!Array.isArray(series?.items)) {
      seriesState = 'blocked'
      seriesReasons.push('malformed series: items must be a list')
    }
    for (const item of Array.isArray(series?.items) ? series.items : []) {
      const reasons: string[] = []
      let state: ItemVerdictState = 'ready'
      const key = durableKeyFor(String(series?.sourceId ?? ''), String(item?.sourceId ?? ''))
      // block/review RETURN the new state and callers assign it directly:
      // closure-only mutation defeats the type checker's flow analysis.
      const block = (reason: string): ItemVerdictState => {
        reasons.push(reason)
        return 'blocked'
      }
      const review = (reason: string): ItemVerdictState => {
        reasons.push(reason)
        return state === 'blocked' ? 'blocked' : 'review'
      }
      if (!item?.sourceId?.trim() || !item?.title?.trim() || !item?.kind?.trim()) {
        state = block('malformed item: sourceId, title and kind are required')
      } else if (item.roster === true || item.kind === 'roster-entry') {
        state = block(
          'member roster import requires the approved, separately audited grant workflow; a catalog import creates no billing or newsletter consent',
        )
      } else if (!(catalogItemKinds as readonly string[]).includes(item.kind)) {
        state = block(
          `unsupported kind "${item.kind}" in the non-podcast catalog slice (podcast episode/feed kinds ride RC3-10/11)`,
        )
      }
      if (item?.checksum && item.checksum !== itemChecksum(item))
        state = block('checksum mismatch: manifest checksum does not match item content')
      if (item?.consentStatus === 'missing')
        state = block('consent not recorded for this work; record consent before import')
      if (
        item?.consentStatus &&
        !(catalogConsentStatuses as readonly string[]).includes(item.consentStatus)
      )
        state = block(`unknown consent status "${item.consentStatus}"`)
      if (
        item?.rightsStatus &&
        !(catalogRightsStatuses as readonly string[]).includes(item.rightsStatus)
      )
        state = block(`unknown rights status "${item.rightsStatus}"`)
      if (state !== 'blocked') {
        const titleKey = String(item.title).trim().toLowerCase()
        const prior = seenTitles.get(titleKey)
        if (prior)
          state = review(
            `duplicate title "${item.title}" (also in ${prior}); confirm which work it names`,
          )
        else seenTitles.set(titleKey, `series ${String(series?.sourceId ?? '')}`)
        if (item.rightsStatus === 'unknown')
          state = review('rights status unverified; confirm ownership or licence')
      }
      items.push({
        durableKey: key,
        seriesSourceId: String(series?.sourceId ?? ''),
        itemSourceId: String(item?.sourceId ?? ''),
        title: String(item?.title ?? ''),
        state,
        reasons,
      })
      seriesState = worst(seriesState, state)
    }
    seriesVerdicts.push({
      seriesSourceId: String(series?.sourceId ?? ''),
      title: String(series?.title ?? ''),
      state: seriesState,
      reasons: seriesReasons,
    })
  }

  const counts: Record<ItemVerdictState, number> = { ready: 0, review: 0, blocked: 0 }
  for (const verdict of items) counts[verdict.state]++
  return { manifestChecksum: catalogChecksum(manifest), series: seriesVerdicts, items, counts }
}
