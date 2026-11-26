/* eslint-disable @typescript-eslint/no-explicit-any */
import { rankCoPromotionCandidates, type ShowProfile } from './copromotion'
import { relId } from './earn-service'

/**
 * RC3-CE co-promotion discovery (CE-12).
 *
 * Candidates are sponsor-inventory rows from OTHER sites whose
 * monetization profile explicitly opted into network discovery
 * (networkOptIn.copromotion === true). No opt-in, no appearance —
 * there is no default exposure and no scraping. Facets (categories,
 * language, audience) come from the inventory's audience snapshot,
 * which the owner controls. A resulting deal is a CE-06 sponsorship
 * booking, not a separate system.
 */

function toProfile(doc: any, siteId: string): ShowProfile {
  const snapshot = (doc.audienceSnapshot as Record<string, unknown>) ?? {}
  return {
    siteId,
    inventoryId: String(doc.id),
    name: String(doc.name),
    surface: String(doc.surface),
    categories: Array.isArray(snapshot.categories) ? (snapshot.categories as string[]) : [],
    language: typeof snapshot.language === 'string' ? snapshot.language : 'en',
    audienceMonthly: typeof snapshot.audienceMonthly === 'number' ? snapshot.audienceMonthly : null,
    blockedSiteIds: Array.isArray(snapshot.blockedSiteIds)
      ? (snapshot.blockedSiteIds as string[])
      : [],
  }
}

export async function discoverCoPromotion(
  db: any,
  siteId: string,
  sourceInventoryId: string,
): Promise<{ source: ShowProfile; candidates: ReturnType<typeof rankCoPromotionCandidates> }> {
  const source = await db.findByID({
    collection: 'sponsor-inventory',
    id: sourceInventoryId,
    depth: 0,
    overrideAccess: true,
  })
  if (!source || relId(source.site) !== siteId)
    throw new Error('Source inventory not found for this site.')
  const sourceProfile = toProfile(source, siteId)

  const profiles = (
    await db.find({
      collection: 'monetization-profiles',
      where: { id: { not_equals: '' } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as any[]
  const optedInSites = new Set(
    profiles
      .filter((p) => (p.networkOptIn as any)?.copromotion === true)
      .map((p) => relId(p.site))
      .filter(Boolean) as string[],
  )
  const inventory = (
    await db.find({
      collection: 'sponsor-inventory',
      where: { status: { equals: 'open' } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as any[]
  const candidates = inventory
    .map((doc) => toProfile(doc, relId(doc.site) ?? ''))
    .filter((profile) => optedInSites.has(profile.siteId))
  return { source: sourceProfile, candidates: rankCoPromotionCandidates(sourceProfile, candidates) }
}
