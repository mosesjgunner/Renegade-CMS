/**
 * RC3-CE first-party advertising core (CE-08, contract §7).
 *
 * Pure placement selection and ads.txt construction. The rules that
 * keep this honest:
 * - Nothing is auto-inserted: a placement renders only in a slot the
 *   site explicitly renders, inside its own window.
 * - Paid content can exclude ads entirely, per placement and per
 *   site policy; consent-required placements never render without
 *   consent; frequency caps are enforced from delivery counts.
 * - A provider tag whose provider is not connected renders the house
 *   fallback, never a dead tag; every render decision carries its
 *   reason so the operator can see why a slot showed what it showed.
 * - Delivery counts are first-party observations and are labeled as
 *   such; they are not third-party verified impressions.
 */

export type PlacementShape = Readonly<{
  id: string
  slot: string
  kind: 'house' | 'direct-sold' | 'provider-tag'
  providerId: string | null
  providerConnected: boolean
  status: string
  startsAt: string | null
  endsAt: string | null
  frequencyCapPerDay: number | null
  categoryExclusions: readonly string[]
  excludePaidContent: boolean
  requiresConsent: boolean
}>

export type RenderContext = Readonly<{
  slot: string
  at: string
  contentPaid: boolean
  contentCategory: string | null
  consentGranted: boolean
  impressionsTodayByPlacement: Readonly<Record<string, number>>
}>

export type PlacementDecision = Readonly<{
  placementId: string | null
  kind: PlacementShape['kind'] | null
  reason: string
}>

function ineligibleReason(p: PlacementShape, ctx: RenderContext): string | null {
  if (p.slot !== ctx.slot) return 'different slot'
  if (p.status !== 'active') return `placement is ${p.status}`
  if (p.startsAt && ctx.at < p.startsAt) return 'not started'
  if (p.endsAt && ctx.at >= p.endsAt) return 'ended'
  if (p.excludePaidContent && ctx.contentPaid) return 'paid content excludes this placement'
  if (ctx.contentCategory && p.categoryExclusions.includes(ctx.contentCategory))
    return 'category excluded'
  if (p.requiresConsent && !ctx.consentGranted) return 'consent required'
  if (
    p.frequencyCapPerDay !== null &&
    (ctx.impressionsTodayByPlacement[p.id] ?? 0) >= p.frequencyCapPerDay
  )
    return 'frequency cap reached'
  if (p.kind === 'provider-tag' && !p.providerConnected) return 'provider not connected'
  return null
}

/**
 * Selection order: direct-sold first (a sold booking outranks a tag),
 * then connected provider tags, then house. Returns the decision and
 * the reason; a null placement with reason "no eligible placement"
 * renders nothing — an empty slot is a valid outcome, never backfilled
 * by an unapproved network.
 */
export function selectPlacement(
  placements: readonly PlacementShape[],
  ctx: RenderContext,
): PlacementDecision {
  const eligible = placements.filter((p) => ineligibleReason(p, ctx) === null)
  const order: PlacementShape['kind'][] = ['direct-sold', 'provider-tag', 'house']
  for (const kind of order) {
    const chosen = eligible.find((p) => p.kind === kind)
    if (chosen)
      return {
        placementId: chosen.id,
        kind: chosen.kind,
        reason:
          kind === 'house'
            ? 'house fallback (no eligible direct-sold or connected provider placement)'
            : `${kind} placement selected`,
      }
  }
  return { placementId: null, kind: null, reason: 'no eligible placement for this slot' }
}

export type AdsTxtLine = Readonly<{
  domain: string
  sellerId: string
  relationship: 'DIRECT' | 'RESELLER'
  tagId?: string
}>

/**
 * Build a site's ads.txt from its authorized seller relationships
 * only. Lines come from connected provider relationships the operator
 * recorded; nothing is emitted for a provider that is not connected,
 * because an ads.txt line is a public claim of an authorized selling
 * relationship.
 */
export function buildAdsTxt(lines: readonly AdsTxtLine[]): string {
  const unique = new Map<string, AdsTxtLine>()
  for (const line of lines) {
    const key = `${line.domain}|${line.sellerId}|${line.relationship}`
    if (!unique.has(key)) unique.set(key, line)
  }
  const sorted = [...unique.values()].sort((a, b) =>
    `${a.domain}${a.sellerId}`.localeCompare(`${b.domain}${b.sellerId}`),
  )
  const body = sorted
    .map((l) => `${l.domain}, ${l.sellerId}, ${l.relationship}${l.tagId ? `, ${l.tagId}` : ''}`)
    .join('\n')
  return `# ads.txt for this site — generated from connected provider relationships only.\n${body}${body ? '\n' : ''}`
}
