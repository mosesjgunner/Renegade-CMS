/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes } from 'node:crypto'
import { grantTermsSnapshot, validateGrant, type RightsRecordShape } from './rights'
import { relId } from './earn-service'

/**
 * RC3-CE rights registry & licensing operations (CE-10/CE-11).
 *
 * Offers can only activate when the rights validator passes on the
 * underlying record. Grants are issued from paid canonical orders and
 * are immutable snapshots: withdrawing an offer or editing its terms
 * never rewrites a grant a buyer already holds. Delivery uses a
 * one-time token whose hash — never the token — is stored.
 */

const siteWhere = (siteId: string) => ({ site: { equals: siteId } })

async function findAll(db: any, collection: string, siteId: string, limit = 1000): Promise<any[]> {
  const result = await db.find({
    collection,
    where: siteWhere(siteId),
    limit,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs as any[]
}

export function toRightsShape(doc: any): RightsRecordShape {
  return {
    id: String(doc.id),
    status: String(doc.status),
    basis: String(doc.basis),
    fingerprint: String(doc.fingerprint),
    holders: (doc.holders as RightsRecordShape['holders']) ?? [],
    releases: (doc.releases as Record<string, boolean>) ?? {},
    grantable: (doc.grantable as Record<string, boolean>) ?? {},
    restrictions: (doc.restrictions as Record<string, unknown>) ?? {},
    expiresAt: doc.expiresAt ?? null,
    aiTdmOptIn: Boolean(doc.aiTdmOptIn),
    aiTdmTermsVersion: doc.aiTdmTermsVersion ?? null,
  }
}

export async function createRightsRecord(db: any, siteId: string, data: Record<string, unknown>) {
  return db.create({
    collection: 'rights-records',
    data: { ...data, site: siteId },
    depth: 0,
    overrideAccess: true,
  })
}

export async function createLicenseOffer(
  db: any,
  siteId: string,
  data: {
    rightsRecord: string
    name: string
    terms: Record<string, unknown>
    priceMinor?: string | null
    currency: string
    agreementVersion: string
    activate: boolean
  },
): Promise<any> {
  const record = await db.findByID({
    collection: 'rights-records',
    id: data.rightsRecord,
    depth: 0,
    overrideAccess: true,
  })
  if (!record || relId(record.site) !== siteId)
    throw new Error('Rights record not found for this site.')
  if (data.activate) {
    const rights = Array.isArray((data.terms as any)?.rights)
      ? ((data.terms as any).rights as string[])
      : []
    const validation = validateGrant(toRightsShape(record), {
      rights,
      includesAiTdm: Boolean((data.terms as any)?.includesAiTdm),
      at: new Date().toISOString(),
    })
    if (!validation.ok) throw new Error(`Offer cannot activate: ${validation.reasons.join(' ')}`)
  }
  return db.create({
    collection: 'license-offers',
    data: {
      site: siteId,
      rightsRecord: data.rightsRecord,
      name: data.name,
      terms: data.terms,
      priceMinor: data.priceMinor ?? null,
      currency: data.currency,
      agreementVersion: data.agreementVersion,
      status: data.activate ? 'active' : 'draft',
    },
    depth: 0,
    overrideAccess: true,
  })
}

/**
 * Issue a grant for a paid order. The order must belong to the site
 * and be in a paid state — a grant is never issued against an unpaid
 * or foreign-site order (CE-T19).
 */
export async function issueGrantForOrder(
  db: any,
  siteId: string,
  input: { offerId: string; orderId: string },
): Promise<{ grant: any; deliveryToken: string }> {
  const [offer, order] = await Promise.all([
    db.findByID({
      collection: 'license-offers',
      id: input.offerId,
      depth: 0,
      overrideAccess: true,
    }),
    db.findByID({ collection: 'orders', id: input.orderId, depth: 0, overrideAccess: true }),
  ])
  if (!offer || relId(offer.site) !== siteId) throw new Error('Offer not found for this site.')
  if (!order || relId(order.site) !== siteId) throw new Error('Order not found for this site.')
  if (offer.status !== 'active') throw new Error('Offer is not active.')
  const orderState = String(order.state ?? order.status ?? '')
  if (!['paid', 'fulfilling', 'fulfilled'].includes(orderState))
    throw new Error(`Order is ${orderState || 'unknown'}, not paid; no grant can be issued.`)
  const record = await db.findByID({
    collection: 'rights-records',
    id: relId(offer.rightsRecord),
    depth: 0,
    overrideAccess: true,
  })
  const terms = (offer.terms as Record<string, unknown>) ?? {}
  const validation = validateGrant(toRightsShape(record), {
    rights: Array.isArray(terms.rights) ? (terms.rights as string[]) : [],
    includesAiTdm: Boolean(terms.includesAiTdm),
    at: new Date().toISOString(),
  })
  if (!validation.ok)
    throw new Error(`Grant blocked by rights validation: ${validation.reasons.join(' ')}`)
  const deliveryToken = randomBytes(24).toString('hex')
  const grant = await db.create({
    collection: 'license-grants',
    data: {
      site: siteId,
      offer: offer.id,
      order: order.id,
      buyerName: order.buyerName ?? order.customerName ?? null,
      buyerEmail: order.buyerEmail ?? order.customerEmail ?? null,
      agreementVersion: offer.agreementVersion,
      fingerprint: record.fingerprint,
      termsSnapshot: grantTermsSnapshot({
        offerTerms: terms,
        agreementVersion: String(offer.agreementVersion),
        fingerprint: String(record.fingerprint),
        rightsRecordId: String(record.id),
        includesAiTdm: Boolean(terms.includesAiTdm),
        aiTdmTermsVersion: record.aiTdmTermsVersion ?? null,
      }),
      status: 'issued',
      issuedAt: new Date().toISOString(),
      deliveryTokenHash: createHash('sha256').update(deliveryToken).digest('hex'),
    },
    depth: 0,
    overrideAccess: true,
  })
  return { grant, deliveryToken }
}

/** Redeem a delivery token once; the grant moves to delivered and the token dies. */
export async function redeemGrantDelivery(
  db: any,
  siteId: string,
  grantId: string,
  token: string,
): Promise<any> {
  const grant = await db.findByID({
    collection: 'license-grants',
    id: grantId,
    depth: 0,
    overrideAccess: true,
  })
  if (!grant || relId(grant.site) !== siteId) throw new Error('Grant not found for this site.')
  if (grant.status !== 'issued') throw new Error(`Grant is ${grant.status}, not awaiting delivery.`)
  const hash = createHash('sha256').update(token).digest('hex')
  if (hash !== grant.deliveryTokenHash) throw new Error('Delivery token does not match.')
  return db.update({
    collection: 'license-grants',
    id: grantId,
    data: { status: 'delivered', deliveredAt: new Date().toISOString(), deliveryTokenHash: null },
    depth: 0,
    overrideAccess: true,
  })
}

export async function recordDistributionSubmission(
  db: any,
  siteId: string,
  data: Record<string, unknown>,
) {
  return db.create({
    collection: 'distribution-submissions',
    data: { ...data, site: siteId },
    depth: 0,
    overrideAccess: true,
  })
}

export async function listRightsRecords(db: any, siteId: string) {
  return findAll(db, 'rights-records', siteId)
}
