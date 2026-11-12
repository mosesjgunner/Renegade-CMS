/* eslint-disable @typescript-eslint/no-explicit-any */
// RC2-F-02 subscription cancellation (service proof): the member-facing
// surface exposes plan changes and a provider billing portal, but no direct
// cancel action in this build — cancellation arrives as provider state and is
// projected by the production recompute service. This spec drives exactly
// that projection for one subscription (state -> canceled) so the journey can
// prove, over HTTP, that only the intended entitlement is revoked.
// Env: F02_SUB_ID (subscription to cancel)
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { getPayload } from 'payload'
import { recomputeSubscriptionEntitlements } from '../../src/modules/commerce/subscription-service'

describe('RC2-F-02 cancel projection', () => {
  it('revokes the canceled subscription entitlements via the production recompute', async () => {
    const payload: any = await getPayload({ config })
    const subId = process.env.F02_SUB_ID ?? ''
    expect(subId).toBeTruthy()
    const sub: any = await payload.findByID({
      collection: 'subscriptions',
      id: subId,
      depth: 0,
      overrideAccess: true,
    })
    const rel = (v: any) => String(typeof v === 'object' && v ? v.id : v)
    const record: any = {
      id: String(sub.id),
      siteId: rel(sub.site),
      supporterId: rel(sub.supporter),
      customerId: rel(sub.supporter),
      plan: sub.planSnapshot,
      state: 'canceled',
      source: sub.source,
      provider: { key: String(sub.providerKey ?? 'deterministic-test') },
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      createdAt: sub.createdAt,
      updatedAt: new Date().toISOString(),
      version: Number(sub.version ?? 1),
    }
    const result: any = await recomputeSubscriptionEntitlements(payload, record)
    writeFileSync('/tmp/f02-cancel.json', JSON.stringify(result))
    expect(result.revoked).toBeGreaterThanOrEqual(1)
    void readFileSync
  }, 120000)
})
