/* eslint-disable @typescript-eslint/no-explicit-any -- canonical affiliate SQL tables */
import { randomUUID } from 'node:crypto'
import { validateAffiliateOffer } from './affiliate-service'
import type { AffiliateOffer } from './affiliate-referral-contracts'
import type { AffiliateClick } from './affiliate-referral-contracts'

export async function persistAffiliateClick(
  payload: any,
  offer: AffiliateOffer,
  click: AffiliateClick,
) {
  if (!click.trackingAllowed) return false
  await payload.db.pool.query(
    `INSERT INTO affiliate_clicks(id,site_id,offer_id,click_token,destination_url,tracking_allowed,bot_detected)
    VALUES($1,$2,$3,$4,$5,true,false)`,
    [click.id, offer.siteId, offer.id, click.clickToken, click.destinationUrl],
  )
  return true
}

export async function createAffiliateOffer(payload: any, siteId: string, input: any) {
  const offer: AffiliateOffer = { ...input, id: randomUUID(), siteId }
  const issues = validateAffiliateOffer(offer)
  if (!offer.allowedDomains?.length || !offer.disclosure.required)
    issues.push('A destination allowlist and disclosure are required.')
  if (issues.length) throw new Error(issues.join(' '))
  await payload.db.pool.query(
    `INSERT INTO affiliate_offers(id,site_id,slug,name,destination_url,network_reference,
    disclosure,sub_id_template,pricing_freshness,regions,status,link_health,tracking_parameters)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      offer.id,
      siteId,
      offer.slug,
      offer.name,
      offer.destinationUrl,
      { ...offer.networkReference, allowedDomains: offer.allowedDomains },
      offer.disclosure,
      offer.subIdTemplate ?? null,
      offer.pricingFreshness,
      JSON.stringify(offer.regions),
      offer.status,
      offer.linkHealth,
      offer.trackingParameters ?? {},
    ],
  )
  return offer
}

export async function storedAffiliateOffer(
  payload: any,
  siteId: string,
  offerId: string,
): Promise<AffiliateOffer | null> {
  const row = (
    await payload.db.pool.query(
      "SELECT * FROM affiliate_offers WHERE id=$1 AND site_id=$2 AND status='active'",
      [offerId, siteId],
    )
  ).rows[0]
  if (!row) return null
  const offer: AffiliateOffer = {
    id: row.id,
    siteId,
    slug: row.slug,
    name: row.name,
    destinationUrl: row.destination_url,
    allowedDomains: row.network_reference?.allowedDomains,
    networkReference: row.network_reference,
    disclosure: row.disclosure,
    subIdTemplate: row.sub_id_template,
    pricingFreshness: row.pricing_freshness,
    regions: row.regions,
    status: row.status,
    linkHealth: row.link_health,
    trackingParameters: row.tracking_parameters,
  }
  if (
    !offer.allowedDomains?.length ||
    !offer.disclosure.required ||
    validateAffiliateOffer(offer).length
  )
    return null
  return offer
}
