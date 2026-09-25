import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  records: new Map<string, any>(),
  calls: [] as Array<{ collection: string; data: any }>,
  checkout: vi.fn(),
  retrieve: vi.fn(),
  campaignSite: 'site-1',
}))

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/modules/commerce/site-scope', () => ({ catalogSiteForHost: async () => 'site-1' }))
vi.mock('@/modules/commerce/donations', () => ({
  assertDonationIntent: () => undefined,
  feeCoverAmount: () => '0',
}))
vi.mock('@/modules/commerce/payment-provider', () => ({
  PaymentProviderError: class PaymentProviderError extends Error {},
  configuredPaymentProvider: (key: string) => ({
    key,
    contractVersion: 'shop-04.v1',
    metadata: {
      implementationVersion: '1',
      providerApiVersion: 'test',
      mode: key === 'deterministic-test' ? 'deterministic-test' : 'provider-test',
    },
    readiness: async () => ({ ready: true }),
    createHostedCheckout: state.checkout,
    retrieve: state.retrieve,
  }),
}))
vi.mock('@/modules/commerce/payment-operations', () => ({ signGuestOrderToken: () => 'token' }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    findGlobal: async () => ({
      adminExperience: { optionalCapabilities: { commerceCheckout: true } },
    }),
    findByID: async ({ collection, id }: { collection: string; id: string }) =>
      collection === 'donation-campaigns'
        ? {
            id: 'campaign-1',
            site: state.campaignSite,
            title: 'Campaign',
            lifecycle: 'active',
            currency: 'USD',
            allowedAmounts: ['500'],
            recurrence: ['one-time', 'recurring'],
            version: 1,
          }
        : state.records.get(`${collection}:${id}`),
    find: async ({ collection, where }: { collection: string; where: any }) => {
      if (collection === 'merchant-connections')
        return {
          docs: [
            { id: 'merchant-1', providerKey: 'stripe-test', site: 'site-1' },
            { id: 'merchant-2', providerKey: 'deterministic-test', site: 'site-1' },
          ],
        }
      if (collection === 'payment-method-capabilities')
        return {
          docs: [
            { id: 'capability-1', providerKey: 'stripe-test', presentmentCurrencies: ['USD'] },
            {
              id: 'capability-2',
              providerKey: 'deterministic-test',
              presentmentCurrencies: ['USD'],
            },
          ],
        }
      const docs = [...state.records.entries()]
        .filter(([key]) => key.startsWith(`${collection}:`))
        .map(([, value]) => value)
      if (collection === 'donation-intents')
        return { docs: docs.filter((row) => row.idempotencyKey === where.idempotencyKey.equals) }
      if (collection === 'payment-attempts')
        return { docs: docs.filter((row) => row.paymentIntent === where.paymentIntent.equals) }
      return { docs: [] }
    },
    create: async ({ collection, data }: { collection: string; data: any }) => {
      const row = { ...data, id: `${collection}-${state.calls.length + 1}` }
      state.calls.push({ collection, data })
      state.records.set(`${collection}:${row.id}`, row)
      return row
    },
    update: async ({ collection, id, data }: { collection: string; id: string; data: any }) => {
      const row = { ...state.records.get(`${collection}:${id}`), ...data }
      state.records.set(`${collection}:${id}`, row)
      return row
    },
  }),
}))

import { POST } from '../../src/app/(frontend)/api/commerce/donations/intent/route'
import { GET as getCampaign } from '../../src/app/(frontend)/api/commerce/donations/campaign/[campaignId]/route'

const request = (details: Record<string, unknown> = {}, key = 'fixed-donation-key-123456') =>
  new Request('http://localhost/api/commerce/donations/intent', {
    method: 'POST',
    headers: { host: 'localhost', 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify({
      campaignId: 'campaign-1',
      currency: 'USD',
      amountMinor: '500',
      recurrence: 'one-time',
      recognition: 'anonymous',
      email: 'donor@example.test',
      ...details,
    }),
  })

describe('SHOP-07 hosted donation checkout', () => {
  beforeEach(() => {
    state.records.clear()
    state.calls.length = 0
    state.campaignSite = 'site-1'
    delete process.env.LOCAL_E2E_TEST_MODE
    state.checkout.mockReset().mockResolvedValue({
      actionUrl: 'https://checkout.stripe.test/session',
      providerReference: 'cs_test_1',
      state: 'action-required',
    })
    state.retrieve.mockReset().mockResolvedValue({
      actionUrl: 'https://checkout.stripe.test/session',
    })
    process.env.COMMERCE_GUEST_ORDER_SECRET = 'unit-test-guest-order-secret-long-enough'
  })

  it('binds one immutable donation to one payment and replays the same hosted checkout', async () => {
    const first = await POST(request())
    expect(first.status).toBe(201)
    const body = await first.json()
    expect(body.actionUrl).toBe('https://checkout.stripe.test/session')
    expect(first.headers.get('set-cookie')).toContain('renegade_checkout_')
    const donation = state.records.get(`donation-intents:${body.intentId}`)
    const payment = state.records.get(`payment-intents:${body.paymentIntentId}`)
    expect(donation.paymentIntent).toBe(payment.id)
    expect(payment.amountMinor).toBe('500')
    const second = await POST(request())
    expect(second.status).toBe(200)
    expect((await second.json()).replay).toBe(true)
    expect(state.calls.filter((call) => call.collection === 'donation-intents')).toHaveLength(1)
    expect(state.checkout).toHaveBeenCalledTimes(1)
  })

  it('rejects changed donation details under one idempotency key', async () => {
    expect((await POST(request())).status).toBe(201)
    expect((await POST(request({ recognition: 'private' }))).status).toBe(409)
    expect(state.checkout).toHaveBeenCalledTimes(1)
  })

  it('fails closed for recurring billing until a recurring provider mapping exists', async () => {
    const response = await POST(request({ recurrence: 'recurring' }))
    expect(response.status).toBe(503)
    expect(state.calls).toHaveLength(0)
  })

  it('does not expose another site’s active campaign', async () => {
    state.campaignSite = 'site-2'
    const response = await getCampaign(
      new Request('http://localhost/api/commerce/donations/campaign/campaign-1', {
        headers: { host: 'localhost' },
      }),
      { params: Promise.resolve({ campaignId: 'campaign-1' }) },
    )
    expect(response.status).toBe(404)
    expect((await POST(request())).status).toBe(404)
  })

  it('uses the local emulator only when explicitly enabled and reconstructs its replay URL', async () => {
    process.env.LOCAL_E2E_TEST_MODE = 'true'
    state.checkout.mockResolvedValue({
      actionUrl: '/checkout/test/det_cs_0123456789abcdef01234567',
      providerReference: 'det_cs_0123456789abcdef01234567',
      state: 'action-required',
    })
    const first = await POST(request())
    expect(first.status).toBe(201)
    expect((await first.json()).providerMode).toBe('deterministic-test')
    const replay = await POST(request())
    expect(replay.status).toBe(200)
    expect((await replay.json()).actionUrl).toBe('/checkout/test/det_cs_0123456789abcdef01234567')
    expect(state.retrieve).not.toHaveBeenCalled()
  })
})
