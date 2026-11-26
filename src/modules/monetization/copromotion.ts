/**
 * RC3-CE cross-promotion matching (CE-12, contract §9).
 *
 * Pure ranking over opted-in inventory from other creators. A show
 * only ever appears as a candidate when its owner opted into network
 * discovery — there is no scraping and no default exposure. Ranking
 * favors category overlap, language match and a comparable audience
 * band; the reasons travel with each candidate so the creator sees
 * why a match was suggested, and a co-promotion deal itself is a
 * CE-06 sponsorship booking (surface: podcast/newsletter), not a
 * separate shadow system.
 */

export type ShowProfile = Readonly<{
  siteId: string
  inventoryId: string
  name: string
  surface: string
  categories: readonly string[]
  language: string
  audienceMonthly: number | null
  blockedSiteIds: readonly string[]
}>

export type CoPromotionCandidate = Readonly<{
  inventoryId: string
  siteId: string
  name: string
  score: number
  reasons: readonly string[]
}>

export function rankCoPromotionCandidates(
  source: ShowProfile,
  candidates: readonly ShowProfile[],
): readonly CoPromotionCandidate[] {
  const ranked: CoPromotionCandidate[] = []
  for (const candidate of candidates) {
    if (candidate.siteId === source.siteId) continue
    if (source.blockedSiteIds.includes(candidate.siteId)) continue
    if (candidate.blockedSiteIds.includes(source.siteId)) continue
    const reasons: string[] = []
    let score = 0
    const shared = candidate.categories.filter((c) => source.categories.includes(c))
    if (shared.length > 0) {
      score += 40 + shared.length * 5
      reasons.push(`shared categories: ${shared.join(', ')}`)
    }
    if (candidate.language === source.language) {
      score += 20
      reasons.push('same language')
    }
    // A shared surface alone is not a match: without a category or a
    // language in common there is no audience reason to cross-promote.
    if (shared.length === 0 && candidate.language !== source.language) continue
    if (candidate.surface === source.surface) {
      score += 10
      reasons.push('same surface')
    }
    if (source.audienceMonthly !== null && candidate.audienceMonthly !== null) {
      const ratio =
        Math.max(source.audienceMonthly, candidate.audienceMonthly) /
        Math.max(1, Math.min(source.audienceMonthly, candidate.audienceMonthly))
      if (ratio <= 3) {
        score += 20
        reasons.push('comparable audience size')
      } else if (ratio <= 10) {
        score += 5
        reasons.push('audience sizes differ but are within reach')
      }
    }
    if (score === 0) continue
    ranked.push({
      inventoryId: candidate.inventoryId,
      siteId: candidate.siteId,
      name: candidate.name,
      score,
      reasons,
    })
  }
  return ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}
