import type { Payload } from 'payload'
import { randomUUID } from 'node:crypto'
import { audienceDigest } from '../../src/modules/audience/contracts'
import { telecomDigest } from '../../src/modules/telecom/contracts'

/** Persist recipient-bound consent; a site-wide consent row grants no recipient authority. */
export async function telecomRecipient(payload: Payload, siteId: string, phone: string) {
  const email = `telecom-${phone.replace(/\D/g, '')}-${randomUUID()}@example.test`
  const subscriber = await payload.create({
    collection: 'subscribers',
    data: { site: siteId, email, emailHash: audienceDigest(email), status: 'active' },
    overrideAccess: true,
  })
  for (const channel of ['rcs', 'sms'] as const) {
    await payload.create({
      collection: 'consent-events',
      data: {
        site: siteId,
        subscriber: subscriber.id,
        channel,
        event: 'preference-granted',
        basis: 'consent',
        purpose: 'marketing',
        evidence: { phoneHash: telecomDigest(phone) },
        occurredAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
  }
  return subscriber.id
}
