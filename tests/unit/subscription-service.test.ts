import { describe, expect, it, vi } from 'vitest'
import {
  recomputeSubscriptionEntitlements,
  hasEntitlement,
} from '../../src/modules/commerce/subscription-service'
import { publishPlan } from '../../src/modules/commerce/subscription-contract'

const plan = publishPlan({
  planKey: 'gold',
  interval: 'month',
  intervalCount: 1,
  amountMinor: '500',
  currency: 'USD',
  trialDays: 0,
  trialEligibility: 'none',
  entitlements: [
    { resource: 'publication:journal', capability: 'read', siteId: 'site-1', term: 'subscription' },
  ],
  cancelPolicy: 'period_end',
  changePolicy: 'period_end',
  taxPolicy: 'provider',
  providerMappings: {},
  publishedAt: '2026-01-01T00:00:00Z',
})
const sub = {
  id: 'sub-1',
  customerId: 'supporter-1',
  supporterId: 'supporter-1',
  siteId: 'site-1',
  plan,
  provider: { key: 'stripe-test' },
  state: 'active' as const,
  source: 'provider' as const,
  currentPeriodStart: '2026-01-01T00:00:00Z',
  currentPeriodEnd: '2027-01-01T00:00:00Z',
  cancelAtPeriodEnd: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 1,
}

function memoryPayload() {
  const rows: any[] = []
  let id = 0
  return {
    rows,
    find: vi.fn(async (input: any) => {
      const where = input.where ?? {}
      const and = where.and ?? []
      if (input.collection === 'members') return { docs: [{ id: 'member-1', status: 'active' }] }
      let result = rows
      for (const item of and) {
        if (item.supporter?.equals)
          result = result.filter((row) => row.supporter === item.supporter.equals)
        if (item.source?.equals) result = result.filter((row) => row.source === item.source.equals)
      }
      if (where.grantKey?.equals)
        result = result.filter((row) => row.grantKey === where.grantKey.equals)
      return { docs: result.slice(0, input.limit ?? 100) }
    }),
    create: vi.fn(async (input: any) => {
      const row = { id: `grant-${++id}`, ...input.data }
      rows.push(row)
      return row
    }),
    update: vi.fn(async (input: any) => {
      const index = rows.findIndex((row) => row.id === input.id)
      rows[index] = { ...rows[index], ...input.data }
      return rows[index]
    }),
  }
}

describe('subscription entitlement service', () => {
  it('grants the exact site capability once, survives replay, and revokes on cancellation', async () => {
    const payload = memoryPayload()
    expect(await recomputeSubscriptionEntitlements(payload, sub)).toEqual({
      granted: 1,
      revoked: 0,
    })
    expect(await recomputeSubscriptionEntitlements(payload, sub)).toEqual({
      granted: 0,
      revoked: 0,
    })
    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({
      site: 'site-1',
      resource: 'publication:journal',
      capability: 'read',
      source: 'subscription:sub-1',
      grantKey: 'subscription:sub-1:site-1::publication:journal:read',
    })
    const canceled = { ...sub, state: 'canceled' as const }
    expect(await recomputeSubscriptionEntitlements(payload, canceled)).toEqual({
      granted: 0,
      revoked: 1,
    })
    expect(payload.rows[0].revokedAt).toBeTruthy()
  })
  it('checks access for the member, resource, capability, site, and exact scope', async () => {
    const payload = memoryPayload()
    await hasEntitlement(payload, {
      subjectId: 'member-1',
      siteId: 'site-1',
      resource: 'publication:journal',
      capability: 'read',
      scope: 'article-7',
      now: '2026-01-01T00:00:00Z',
    })
    expect(payload.find.mock.calls[1]?.[0].where.and).toContainEqual({
      'supporter.member': { equals: 'member-1' },
    })
    expect(payload.find.mock.calls[1]?.[0].where.and).toContainEqual({
      scope: { equals: 'article-7' },
    })
  })
  it('denies entitlements when the member is deletion-pending', async () => {
    const payload = memoryPayload()
    payload.find.mockImplementation(async (input: any) =>
      input.collection === 'members'
        ? { docs: [{ id: 'member-1', status: 'deletion-pending' }] }
        : { docs: [{ id: 'grant-1' }] },
    )
    expect(
      await hasEntitlement(payload, {
        subjectId: 'member-1',
        siteId: 'site-1',
        resource: 'publication:journal',
        capability: 'read',
      }),
    ).toBe(false)
    expect(payload.find).toHaveBeenCalledTimes(1)
  })
})
