import { describe, expect, it } from 'vitest'
import {
  acceptSubscriptionEvent,
  applySubscriptionEvent,
  grantsFromSubscription,
  publishPlan,
  subscriptionGrantsAccess,
  subscriptionMetrics,
} from '../../src/modules/commerce/subscription-contract'

const planInput = {
  planKey: 'supporter',
  interval: 'month' as const,
  intervalCount: 1,
  amountMinor: '1200',
  currency: 'USD',
  trialDays: 0,
  trialEligibility: 'none' as const,
  entitlements: [
    {
      resource: 'publication:journal',
      capability: 'read',
      siteId: 'site-1',
      term: 'subscription' as const,
    },
  ],
  cancelPolicy: 'period_end' as const,
  changePolicy: 'period_end' as const,
  taxPolicy: 'provider' as const,
  providerMappings: { fixture: 'price-1' },
  publishedAt: '2026-09-01T00:00:00Z',
}
const plan = publishPlan(planInput)
const subscription = {
  id: 'sub-1',
  customerId: 'member-1',
  siteId: 'site-1',
  plan,
  provider: { key: 'fixture', subscriptionRef: 'p-sub-1' },
  state: 'active' as const,
  source: 'provider' as const,
  currentPeriodStart: '2026-09-01T00:00:00Z',
  currentPeriodEnd: '2026-10-01T00:00:00Z',
  cancelAtPeriodEnd: false,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  version: 1,
}

describe('canonical subscription lifecycle contract', () => {
  it('publishes immutable revisions and leaves prior agreement snapshots intact', () => {
    const next = publishPlan({ ...planInput, amountMinor: '1500' }, [plan])
    expect(next.revision).toBe(2)
    expect(next.id).not.toBe(plan.id)
    expect(subscription.plan.amountMinor).toBe('1200')
  })
  it('derives exact scoped access and expires it with the paid period', () => {
    expect(subscriptionGrantsAccess(subscription, '2026-09-20T00:00:00Z')).toBe(true)
    expect(grantsFromSubscription(subscription)).toMatchObject([
      {
        subjectId: 'member-1',
        siteId: 'site-1',
        resource: 'publication:journal',
        capability: 'read',
        sourceId: 'sub-1',
      },
    ])
    expect(subscriptionGrantsAccess(subscription, '2026-10-01T00:00:00Z')).toBe(false)
  })
  it('deduplicates events and puts failed renewal into past due without erasing evidence', () => {
    const e = {
      id: 'evt-1',
      providerEventId: 'evt-provider-1',
      subscriptionId: 'sub-1',
      kind: 'invoice_failed' as const,
      occurredAt: '2026-09-30T00:00:00Z',
    }
    expect(acceptSubscriptionEvent(acceptSubscriptionEvent([], e), e)).toEqual(['evt-provider-1'])
    const next = applySubscriptionEvent(subscription, e)
    expect(next.state).toBe('past_due')
    expect(subscription.state).toBe('active')
  })
  it('pauses disputed or fully refunded subscription payments while recording partial refunds without revoking access', () => {
    const disputed = applySubscriptionEvent(subscription, {
      id: 'evt-dispute',
      subscriptionId: 'sub-1',
      kind: 'payment_review',
      occurredAt: '2026-09-15T00:00:00Z',
    })
    const refunded = applySubscriptionEvent(subscription, {
      id: 'evt-refund',
      subscriptionId: 'sub-1',
      kind: 'payment_refunded',
      occurredAt: '2026-09-15T00:00:00Z',
    })
    const partial = applySubscriptionEvent(subscription, {
      id: 'evt-partial',
      subscriptionId: 'sub-1',
      kind: 'refund_recorded',
      occurredAt: '2026-09-15T00:00:00Z',
    })
    expect(disputed.state).toBe('paused')
    expect(grantsFromSubscription(disputed)).toEqual([])
    expect(refunded.state).toBe('paused')
    expect(grantsFromSubscription(refunded)).toEqual([])
    expect(partial.state).toBe('active')
  })
  it('ignores out of order provider events and applies cancellation, resume, and terminal expiry', () => {
    const newer = applySubscriptionEvent(subscription, {
      id: 'evt-3',
      subscriptionId: 'sub-1',
      kind: 'invoice_paid',
      occurredAt: '2026-09-10T00:00:00Z',
      sequence: 3,
    })
    const stale = applySubscriptionEvent(newer, {
      id: 'evt-2',
      subscriptionId: 'sub-1',
      kind: 'invoice_failed',
      occurredAt: '2026-09-09T00:00:00Z',
      sequence: 2,
    })
    expect(stale.state).toBe('active')
    const scheduled = applySubscriptionEvent(newer, {
      id: 'evt-4',
      subscriptionId: 'sub-1',
      kind: 'cancel_scheduled',
      occurredAt: '2026-09-11T00:00:00Z',
      sequence: 4,
    })
    expect(scheduled.cancelAtPeriodEnd).toBe(true)
    expect(
      applySubscriptionEvent(scheduled, {
        id: 'evt-5',
        subscriptionId: 'sub-1',
        kind: 'resumed',
        occurredAt: '2026-09-12T00:00:00Z',
        sequence: 5,
      }).state,
    ).toBe('active')
    expect(
      applySubscriptionEvent(scheduled, {
        id: 'evt-6',
        subscriptionId: 'sub-1',
        kind: 'canceled',
        occurredAt: '2026-09-13T00:00:00Z',
        sequence: 6,
      }).state,
    ).toBe('canceled')
  })
  it('reports recurring revenue and dunning by currency without combining currencies', () => {
    const euroPlan = publishPlan({
      ...planInput,
      planKey: 'euro',
      amountMinor: '900',
      currency: 'EUR',
    })
    const euro = { ...subscription, id: 'sub-eur', plan: euroPlan }
    expect(
      subscriptionMetrics(
        [subscription, euro],
        [...grantsFromSubscription(subscription), ...grantsFromSubscription(euro)],
        '2026-09-20T00:00:00Z',
      ),
    ).toEqual([
      {
        currency: 'EUR',
        subscriptions: 1,
        active: 1,
        dunning: 0,
        recurringRevenueMonthlyMinor: '900',
        activeEntitlements: 1,
      },
      {
        currency: 'USD',
        subscriptions: 1,
        active: 1,
        dunning: 0,
        recurringRevenueMonthlyMinor: '1200',
        activeEntitlements: 1,
      },
    ])
  })
  it('requires fixed entitlement terms to carry an explicit duration', () => {
    expect(() =>
      publishPlan({
        ...planInput,
        entitlements: [
          { resource: 'download', capability: 'read', siteId: 'site-1', term: 'fixed' },
        ],
      }),
    ).toThrow('positive durationSeconds')
  })
})
