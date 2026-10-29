import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateDonationProgress,
  donationDisclosures,
  type DonationProgress,
} from '@/modules/commerce/donations'
import { reverseDonation } from '@/modules/commerce/donation-ingestion'

const state = vi.hoisted(() => ({
  records: new Map<string, any>(),
  calls: [] as Array<{ collection: string; data: any }>,
  checkout: vi.fn(),
  retrieve: vi.fn(),
  campaignSite: 'site-alpha',
  unavailableHost: false,
  recurringCapabilityEnabled: false,
  memberId: undefined as string | undefined,
}))

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/modules/commerce/site-scope', () => ({
  catalogSiteForHost: async () => {
    if (state.unavailableHost) throw new Error('Catalog site unavailable for this host.')
    return 'site-alpha'
  },
}))
vi.mock('@/modules/identity/member-identity', () => ({
  readMemberSession: () => (state.memberId ? 'test-session-token' : undefined),
  currentMember: async () => state.memberId,
}))
vi.mock('@/modules/commerce/donations', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    assertDonationIntent: () => undefined,
    feeCoverAmount: () => '35',
  }
})
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
vi.mock('@/modules/commerce/payment-operations', () => ({ signGuestOrderToken: () => 'mock-token' }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    findGlobal: async () => ({
      adminExperience: { optionalCapabilities: { commerceCheckout: true } },
    }),
    findByID: async ({ collection, id }: { collection: string; id: string }) => {
      if (collection === 'donation-campaigns') {
        return {
          id: 'camp-alpha-1',
          site: state.campaignSite,
          title: 'Alpha Conservation Fund',
          lifecycle: 'active',
          currency: 'USD',
          allowedAmounts: ['1000', '2500', '5000'],
          recurrence: ['one-time', 'recurring'],
          feeCover: {
            mode: 'percentage-plus-fixed',
            basisPoints: 290,
            fixedAmountMinor: '30',
          },
          version: 1,
        }
      }
      return state.records.get(`${collection}:${id}`)
    },
    find: async ({ collection, where }: { collection: string; where: any }) => {
      if (collection === 'merchant-connections')
        return {
          docs: [
            { id: 'merchant-alpha', providerKey: 'deterministic-test', site: 'site-alpha' },
          ],
        }
      if (collection === 'payment-method-capabilities')
        return {
          docs: [
            {
              id: 'capability-alpha-card',
              providerKey: 'deterministic-test',
              presentmentCurrencies: ['USD'],
              recurring: state.recurringCapabilityEnabled,
            },
          ],
        }
      const docs = [...state.records.entries()]
        .filter(([key]) => key.startsWith(`${collection}:`))
        .map(([, value]) => value)
      if (collection === 'donation-intents')
        return { docs: docs.filter((row) => row.idempotencyKey === where?.idempotencyKey?.equals) }
      if (collection === 'payment-attempts')
        return { docs: docs.filter((row) => row.paymentIntent === where?.paymentIntent?.equals) }
      if (collection === 'entitlements')
        return { docs: docs.filter((row) => row.paymentIntent === where?.paymentIntent?.equals) }
      if (collection === 'donation-events')
        return { docs: docs.filter((row) => row.eventKey === where?.eventKey?.equals) }
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

import { POST as createDonationIntent } from '@/app/(frontend)/api/commerce/donations/intent/route'

const request = (details: Record<string, unknown> = {}, key = 'key-rc112c-1234567890123456') =>
  new Request('http://localhost/api/commerce/donations/intent', {
    method: 'POST',
    headers: { host: 'localhost', 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify({
      campaignId: 'camp-alpha-1',
      currency: 'USD',
      amountMinor: '2500',
      recurrence: 'one-time',
      recognition: 'anonymous',
      email: 'donor@example.test',
      ...details,
    }),
  })

describe('RC1 12C — One-Time and Recurring Donations Unit Acceptance', () => {
  beforeEach(() => {
    state.records.clear()
    state.calls.length = 0
    state.campaignSite = 'site-alpha'
    state.unavailableHost = false
    state.recurringCapabilityEnabled = false
    state.memberId = undefined
    state.checkout.mockReset().mockResolvedValue({
      actionUrl: '/checkout/test/det_cs_alpha1234567890abcdef',
      providerReference: 'det_cs_alpha1234567890abcdef',
      state: 'action-required',
    })
    state.retrieve.mockReset().mockResolvedValue({
      actionUrl: '/checkout/test/det_cs_alpha1234567890abcdef',
    })
    process.env.COMMERCE_GUEST_ORDER_SECRET = 'unit-test-guest-order-secret-32-chars-long'
    process.env.LOCAL_E2E_TEST_MODE = 'true'
  })

  it('1. Fails closed (503) for recurring donation when capability lacks recurring: true', async () => {
    state.recurringCapabilityEnabled = false
    const response = await createDonationIntent(request({ recurrence: 'recurring' }))
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error).toBe('Recurring donation checkout is not configured for this campaign.')
    expect(state.calls).toHaveLength(0)
  })

  it('2. Completes recurring donation checkout initiation when capability has recurring: true', async () => {
    state.recurringCapabilityEnabled = true
    state.memberId = 'member-alpha-donor'
    const response = await createDonationIntent(
      request({
        recurrence: 'recurring',
        recognition: 'public',
        publicDisplayName: 'Jane Donor',
        feeCover: true,
      }),
    )
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.actionUrl).toContain('/checkout/test/det_cs_')
    expect(body.recurrence).toBe('recurring')

    const intentCall = state.calls.find((c) => c.collection === 'donation-intents')
    expect(intentCall).toBeDefined()
    expect(intentCall?.data.recurrence).toBe('recurring')
    expect(intentCall?.data.donorSnapshot?.memberId).toBe('member-alpha-donor')
    expect(intentCall?.data.publicDisplayName).toBe('Jane Donor')
    expect(intentCall?.data.recognition).toBe('public')

    const cartCall = state.calls.find((c) => c.collection === 'carts')
    expect(cartCall?.data.member).toBe('member-alpha-donor')

    const paymentCall = state.calls.find((c) => c.collection === 'payment-intents')
    expect(paymentCall?.data.owner).toBe('member-alpha-donor')
  })

  it('3. Rejects cross-site campaign access with 404', async () => {
    state.campaignSite = 'site-beta-foreign'
    const response = await createDonationIntent(request())
    expect(response.status).toBe(404)
    expect(state.calls).toHaveLength(0)
  })

  it('4. Rejects out-of-bounds donation amounts with 422', async () => {
    const response = await createDonationIntent(request({ amountMinor: '0' }))
    expect(response.status).toBe(422)
    expect(state.calls).toHaveLength(0)
  })

  it('5. Rejects invalid recognition options with 422', async () => {
    const response = await createDonationIntent(request({ recognition: 'invalid-choice' }))
    expect(response.status).toBe(422)
    expect(state.calls).toHaveLength(0)
  })

  it('6. calculateDonationProgress correctly separates currencies and subtracts partial refunds', () => {
    const rows = [
      { lifecycle: 'succeeded', currency: 'USD', baseAmountMinor: '5000', reversedAmountMinor: '0' },
      { lifecycle: 'succeeded', currency: 'USD', baseAmountMinor: '2500', reversedAmountMinor: '500' },
      { lifecycle: 'partially-refunded', currency: 'USD', baseAmountMinor: '1000', reversedAmountMinor: '200' },
      { lifecycle: 'refunded', currency: 'USD', baseAmountMinor: '3000', reversedAmountMinor: '3000' },
      { lifecycle: 'disputed', currency: 'USD', baseAmountMinor: '1500', reversedAmountMinor: '0' },
      { lifecycle: 'succeeded', currency: 'EUR', baseAmountMinor: '4000', reversedAmountMinor: '0' },
    ]
    const usdProgress: DonationProgress = calculateDonationProgress(rows, 'USD', '10000')
    // Settled: 5000 + (2500 - 500) + (1000 - 200) = 5000 + 2000 + 800 = 7800
    expect(usdProgress.settledAmountMinor).toBe('7800')
    expect(usdProgress.settledGiftCount).toBe(3)
    expect(usdProgress.percent).toBe(78)

    const eurProgress: DonationProgress = calculateDonationProgress(rows, 'EUR')
    expect(eurProgress.settledAmountMinor).toBe('4000')
    expect(eurProgress.settledGiftCount).toBe(1)
  })

  it('7. donationDisclosures requires verified flags before including tax deductibility', () => {
    const unverified = donationDisclosures({ verifiedTaxDeductibility: false })
    expect(unverified).toContain('No representation is made that this contribution is tax deductible.')
    expect(unverified.some((t) => t.includes('Your contribution may be tax deductible'))).toBe(false)

    const verified = donationDisclosures({
      verifiedTaxDeductibility: true,
      verified501c3Status: true,
      verifiedNonprofitStatus: true,
    })
    expect(verified).toContain('This organization is a nonprofit.')
    expect(verified).toContain('This organization is recognized as a 501(c)(3).')
    expect(verified).toContain('Your contribution may be tax deductible; consult your tax adviser.')
  })

  it('8. reverseDonation idempotently updates donation lifecycle and revokes supporter entitlement', async () => {
    const donation = {
      id: 'donation-12c-test',
      site: 'site-alpha',
      lifecycle: 'succeeded',
      paymentIntent: 'pi-12c-test',
      supporter: 'supporter-12c-test',
      baseAmountMinor: '2500',
    }
    state.records.set(`donations:${donation.id}`, donation)

    const entitlement = {
      id: 'entitlement-12c-test',
      site: 'site-alpha',
      supporter: 'supporter-12c-test',
      paymentIntent: 'pi-12c-test',
      entitlement: 'donor-badge',
      source: 'donation',
      revokedAt: null,
    }
    state.records.set(`entitlements:${entitlement.id}`, entitlement)

    const mockPayload: any = {
      findByID: async ({ collection, id }: any) => state.records.get(`${collection}:${id}`),
      find: async ({ collection, where }: any) => {
        if (collection === 'donation-events') {
          const events = [...state.records.entries()]
            .filter(([k]) => k.startsWith('donation-events:'))
            .map(([, v]) => v)
          return { docs: events.filter((e) => e.eventKey === where?.eventKey?.equals) }
        }
        if (collection === 'entitlements') {
          return { docs: [state.records.get(`entitlements:${entitlement.id}`)] }
        }
        return { docs: [] }
      },
      create: async ({ collection, data }: any) => {
        const row = { ...data, id: `${collection}-${state.calls.length + 1}` }
        state.calls.push({ collection, data })
        state.records.set(`${collection}:${row.id}`, row)
        return row
      },
      update: async ({ collection, id, data }: any) => {
        const existing = state.records.get(`${collection}:${id}`)
        const row = { ...existing, ...data }
        state.records.set(`${collection}:${id}`, row)
        return row
      },
    }

    const firstReversal = await reverseDonation(mockPayload, {
      donationId: donation.id,
      eventKey: 'reversal-evt-12c-001',
      kind: 'refunded',
      occurredAt: new Date().toISOString(),
    })
    expect(firstReversal.outcome).toBe('reversed')
    expect(firstReversal.lifecycle).toBe('refunded')

    const updatedDonation = state.records.get(`donations:${donation.id}`)
    expect(updatedDonation.lifecycle).toBe('refunded')

    const updatedEntitlement = state.records.get(`entitlements:${entitlement.id}`)
    expect(updatedEntitlement.revokedAt).toBeDefined()

    // Replay with identical eventKey returns duplicate outcome
    const duplicateReversal = await reverseDonation(mockPayload, {
      donationId: donation.id,
      eventKey: 'reversal-evt-12c-001',
      kind: 'refunded',
      occurredAt: new Date().toISOString(),
    })
    expect(duplicateReversal.outcome).toBe('duplicate')
  })
})

