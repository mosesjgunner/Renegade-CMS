import { expect, it, vi } from 'vitest'
import { validatePlanWrite } from '../../src/modules/commerce/plan-write'
import { recomputeSubscriptionEntitlements } from '../../src/modules/commerce/subscription-service'
import { createStripeTestAdapter } from '../../src/modules/commerce/payment-provider'
import { settleSubscriptionOrder } from '../../src/modules/commerce/subscription-order'
const plan = {
  site: 'alpha',
  planKey: 'gold',
  revision: 1,
  interval: 'month',
  intervalCount: 1,
  amountMinor: '1200',
  currency: 'USD',
  trialDays: 0,
  entitlements: [
    { siteId: 'alpha', resource: 'journal', capability: 'read', term: 'subscription' },
  ],
  providerMappings: { 'stripe-test': 'price_gold' },
}
it('validates a scoped integer-priced plan', () =>
  expect(() => validatePlanWrite(plan)).not.toThrow())
it.each([
  { amountMinor: '-1' },
  { amountMinor: '1000000000000' },
  { entitlements: [{ ...plan.entitlements[0], limit: 1 }] },
  { entitlements: [{ ...plan.entitlements[0], resource: { id: 'journal' } }] },
  { amountMinor: '1.5' },
  { currency: 'usd' },
  { intervalCount: 1.5 },
  { revision: 0 },
  { interval: 'day' },
  { entitlements: [] },
  { providerMappings: [] },
  { entitlements: [{ ...plan.entitlements[0], siteId: 'beta' }] },
  { entitlements: [...plan.entitlements, ...plan.entitlements] },
])('rejects invalid native agreement %j', (change) =>
  expect(() => validatePlanWrite({ ...plan, ...change })).toThrow(),
)
it('rejects a foreign-site grant even for a legacy subscription', async () => {
  const db = { find: vi.fn(), create: vi.fn(), update: vi.fn() }
  await expect(
    recomputeSubscriptionEntitlements(db, { siteId: 'beta', plan } as never),
  ).rejects.toThrow('site mismatch')
  expect(db.create).not.toHaveBeenCalled()
})
it('activation alone never marks an order paid', async () => {
  const db = { find: vi.fn(), update: vi.fn() }
  await settleSubscriptionOrder(db, { id: 'sub' }, { kind: 'activated' })
  expect(db.find).not.toHaveBeenCalled()
})
it('invoice settlement marks both canonical order and session once', async () => {
  const db = {
    find: vi.fn().mockResolvedValue({
      docs: [{ id: 'order', state: 'pending-payment', checkoutSession: 'session' }],
    }),
    update: vi.fn(),
  }
  await settleSubscriptionOrder(
    db,
    { id: 'sub' },
    { kind: 'invoice_paid', providerEventId: 'invoice' },
  )
  expect(db.update.mock.calls.map(([input]) => [input.collection, input.data.state])).toEqual([
    ['orders', 'paid'],
    ['checkout-sessions', 'completed'],
  ])
  db.find.mockResolvedValue({ docs: [{ id: 'order', state: 'paid' }] })
  await settleSubscriptionOrder(db, { id: 'sub' }, { kind: 'invoice_paid' })
  expect(db.update).toHaveBeenCalledTimes(2)
})

it.each([
  { unit_amount: 1 },
  { currency: 'eur' },
  { recurring: { interval: 'year', interval_count: 1 } },
  { active: false },
])('rejects provider price drift %j before checkout', async (change) => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        active: true,
        unit_amount: 1200,
        currency: 'usd',
        recurring: { interval: 'month', interval_count: 1 },
        ...change,
      }),
    ),
  )
  const adapter = createStripeTestAdapter({
    secretKey: 'sk_test_fixture',
    webhookSecret: 'test',
    fetch: fetcher,
  })
  await expect(
    adapter.createSubscriptionCheckout({
      idempotencyKey: 'key',
      priceReference: 'price_gold',
      expectedPrice: { amountMinor: '1200', currency: 'USD', interval: 'month', intervalCount: 1 },
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
      metadata: {},
    }),
  ).rejects.toThrow('does not match')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
