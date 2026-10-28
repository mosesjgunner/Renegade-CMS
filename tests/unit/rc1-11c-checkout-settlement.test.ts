import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { configuredCheckoutMerchant } from '../../src/modules/commerce/merchant-selection'
import {
  applyNormalizedPaymentEvent,
  checkoutBindingKey,
  receiptMessageSnapshot,
  signGuestOrderToken,
  verifyGuestOrderToken,
  type PaymentAttemptSnapshot,
} from '../../src/modules/commerce/payment-operations'
import {
  createDeterministicPaymentAdapter,
  createStripeTestAdapter,
  type NormalizedPaymentEvent,
} from '../../src/modules/commerce/payment-provider'
import {
  canConfirmTestCheckout,
  guestCanConfirmTestCheckout,
  localTestCheckoutEnabled,
  signedLocalPaymentEvent,
} from '../../src/modules/commerce/local-test-checkout'
import {
  assertCheckoutQuote,
  finalizeVerifiedOrder,
  inventoryAdjustmentsForOrder,
  methodsForCart,
  receiptForVerifiedPayment,
  snapshotQuotedLines,
} from '../../src/modules/commerce/service'

const baseAttempt = (overrides: Partial<PaymentAttemptSnapshot> = {}): PaymentAttemptSnapshot => ({
  id: 'attempt-11c',
  checkoutSessionId: 'session-11c',
  proposalId: 'proposal-11c',
  customerKey: 'customer-11c',
  siteId: 'site-alpha',
  amountMinor: '2359',
  currency: 'USD',
  attempt: 1,
  state: 'action-required',
  providerReference: 'det_cs_0123456789abcdef01234567',
  providerPaymentReference: 'det_pi_0123456789abcdef01234567',
  refundedAmountMinor: '0',
  processedEventIds: [],
  ...overrides,
})

const baseEvent = (overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent => ({
  providerEventId: 'evt-11c-1',
  providerReference: 'det_cs_0123456789abcdef01234567',
  providerPaymentReference: 'det_pi_0123456789abcdef01234567',
  kind: 'succeeded',
  amountMinor: '2359',
  currency: 'USD',
  occurredAt: '2026-10-27T00:00:00.000Z',
  sequence: 10,
  sanitizedEvidence: { attemptId: 'attempt-11c' },
  ...overrides,
})

describe('RC1 11C checkout, merchant selection and payment settlement', () => {
  it('binds merchant selection strictly to site, active status, healthy method and currency', () => {
    const merchants = [
      {
        id: 'm-foreign',
        site: 'site-beta',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      {
        id: 'm-disabled',
        site: 'site-alpha',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'disabled',
      },
      {
        id: 'm-recurring-only',
        site: 'site-alpha',
        providerKey: 'stripe-test',
        merchantCountry: 'US',
        status: 'active',
      },
      {
        id: 'm-alpha-valid',
        site: 'site-alpha',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    ]
    const capabilities = [
      {
        id: 'cap-foreign',
        site: 'site-beta',
        merchantConnection: 'm-foreign',
        providerKey: 'deterministic-test',
        enabled: true,
        health: 'healthy',
        merchantCountries: ['US'],
        presentmentCurrencies: ['USD'],
      },
      {
        id: 'cap-alpha-valid',
        site: 'site-alpha',
        merchantConnection: 'm-alpha-valid',
        providerKey: 'deterministic-test',
        enabled: true,
        health: 'healthy',
        merchantCountries: ['US'],
        presentmentCurrencies: ['USD'],
      },
    ]

    expect(
      configuredCheckoutMerchant(merchants, capabilities, {
        siteId: 'site-alpha',
        currency: 'USD',
      })?.id,
    ).toBe('m-alpha-valid')

    expect(
      configuredCheckoutMerchant(merchants, capabilities, {
        siteId: 'site-alpha',
        currency: 'EUR',
      }),
    ).toBeUndefined()

    expect(
      configuredCheckoutMerchant(merchants, capabilities, {
        siteId: 'site-alpha',
        currency: 'USD',
        preferredMerchantId: 'm-foreign',
      }),
    ).toBeUndefined()
  })

  it('filters payment method eligibility by scope, country, currency, health and recurring flag', () => {
    const scope = {
      siteId: 'site-alpha',
      spaceId: 'space-alpha',
      merchantConnectionId: 'm-alpha',
    }
    const baseMethod = {
      ...scope,
      id: 'cap-1',
      providerKey: 'deterministic-test',
      railKey: 'card',
      family: 'card' as const,
      flow: 'hosted' as const,
      merchantCountries: ['US'],
      buyerCountries: ['US', 'CA'],
      presentmentCurrencies: ['USD'],
      settlementCurrencies: ['USD'],
      recurring: false,
      refunds: true,
      enabled: true,
      health: 'healthy' as const,
      requiredCustomerFields: [],
      instructions: 'Pay securely.',
    }

    const lines = [
      {
        productId: 'prod-1',
        variantSku: 'SKU-1',
        quantity: 1,
        merchantConnectionId: 'm-alpha',
        kind: 'physical' as const,
      },
    ]

    expect(
      methodsForCart(
        [
          baseMethod,
          { ...baseMethod, id: 'cap-disabled', enabled: false },
          { ...baseMethod, id: 'cap-degraded', health: 'degraded' },
          { ...baseMethod, id: 'cap-wrong-country', buyerCountries: ['GB'] },
          { ...baseMethod, id: 'cap-wrong-currency', presentmentCurrencies: ['EUR'] },
          { ...baseMethod, id: 'cap-foreign-site', siteId: 'site-beta' },
        ],
        {
          merchant: scope,
          merchantCountry: 'US',
          buyerCountry: 'US',
          currency: 'USD',
          amountMinor: '2359',
          recurring: false,
        },
        lines,
      ).map((entry) => entry.capability.id),
    ).toEqual(['cap-1'])
  })

  it('authorizes both guest token checkouts and authenticated member cart owners for local test checkout', async () => {
    const secret = 'rc1-11c-guest-secret-with-at-least-32-characters'
    vi.stubEnv('COMMERCE_GUEST_ORDER_SECRET', secret)
    try {
      const expiresAt = new Date(Date.now() + 60_000).toISOString()
      const token = signGuestOrderToken(
        {
          orderId: 'session-guest-1',
          checkoutSessionId: 'session-guest-1',
          siteId: 'site-alpha',
          exp: Date.now() + 60_000,
        },
        secret,
      )

      expect(
        guestCanConfirmTestCheckout({
          cookie: `renegade_checkout_session-guest-1=${token}`,
          sessionId: 'session-guest-1',
          siteId: 'site-alpha',
          expiresAt,
        }),
      ).toBe(true)

      expect(
        guestCanConfirmTestCheckout({
          cookie: `renegade_checkout_session-guest-1=${token}`,
          sessionId: 'session-guest-1',
          siteId: 'site-beta',
          expiresAt,
        }),
      ).toBe(false)

      // Member checkout without guest cookie succeeds when member owns the cart on the active host site
      const memberSessionCookie = 'renegade-member=valid-member-token'
      const mockPayload: any = {
        findGlobal: async () => ({
          canonicalOriginsBySite: { 'site-alpha': 'http://localhost:39017' },
        }),
        find: async ({ collection }: { collection: string }) => {
          if (collection === 'sites') {
            return { docs: [{ id: 'site-alpha', status: 'active' }] }
          }
          if (collection === 'member-sessions') {
            return {
              docs: [
                {
                  id: 'ms-1',
                  member: 'member-1',
                  expiresAt: new Date(Date.now() + 60_000).toISOString(),
                },
              ],
            }
          }
          return { docs: [] }
        },
        findByID: async ({ collection, id }: { collection: string; id: string }) => {
          if (collection === 'carts' && id === 'cart-member-1') {
            return { id: 'cart-member-1', site: 'site-alpha', member: 'member-1', state: 'active' }
          }
          if (collection === 'members' && id === 'member-1') {
            return { id: 'member-1', status: 'active' }
          }
          return null
        },
        update: async () => ({}),
      }

      const allowedMember = await canConfirmTestCheckout(mockPayload, {
        headers: new Headers({
          host: 'localhost:39017',
          cookie: memberSessionCookie,
        }),
        session: { id: 'session-member-1', cart: 'cart-member-1' },
        siteId: 'site-alpha',
        expiresAt,
      })
      expect(allowedMember).toBe(true)

      // Denied when cart belongs to a different member
      const deniedOtherMember = await canConfirmTestCheckout(mockPayload, {
        headers: new Headers({
          host: 'localhost:39017',
          cookie: memberSessionCookie,
        }),
        session: {
          id: 'session-member-2',
          cart: { id: 'cart-member-2', site: 'site-alpha', member: 'member-2' },
        },
        siteId: 'site-alpha',
        expiresAt,
      })
      expect(deniedOtherMember).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('prevents webhook replay, out-of-order regression, payment disagreement and terminal conflicts', () => {
    const initial = baseAttempt({ state: 'processing', lastProviderSequence: 5 })

    // 1. Valid settlement transitions to succeeded
    const settled = applyNormalizedPaymentEvent(initial, baseEvent({ sequence: 10 }))
    expect(settled.state).toBe('succeeded')
    expect(settled.processedEventIds).toEqual(['evt-11c-1'])

    // 2. Duplicate replay returns identical snapshot
    const replayed = applyNormalizedPaymentEvent(settled, baseEvent({ sequence: 10 }))
    expect(replayed).toBe(settled)

    // 3. Out-of-order stale failure with lower sequence does not regress succeeded state
    const staleFailure = applyNormalizedPaymentEvent(
      settled,
      baseEvent({ providerEventId: 'evt-11c-stale', kind: 'failed', sequence: 7 }),
    )
    expect(staleFailure.state).toBe('succeeded')
    expect(staleFailure.lastProviderSequence).toBe(10)
    expect(staleFailure.processedEventIds).toContain('evt-11c-stale')

    // 4. Amount disagreement quarantines attempt to unknown
    const amountMismatch = applyNormalizedPaymentEvent(
      initial,
      baseEvent({ providerEventId: 'evt-11c-amt', amountMinor: '999', sequence: 11 }),
    )
    expect(amountMismatch.state).toBe('unknown')

    // 5. Currency disagreement quarantines attempt to unknown
    const currencyMismatch = applyNormalizedPaymentEvent(
      initial,
      baseEvent({ providerEventId: 'evt-11c-cur', currency: 'EUR', sequence: 12 }),
    )
    expect(currencyMismatch.state).toBe('unknown')

    // 6. Terminal-success conflict (late succeeded after failed/cancelled) quarantines to unknown
    const cancelled = baseAttempt({ state: 'cancelled', lastProviderSequence: 10 })
    const conflict = applyNormalizedPaymentEvent(
      cancelled,
      baseEvent({ providerEventId: 'evt-11c-late-win', kind: 'succeeded', sequence: 15 }),
    )
    expect(conflict.state).toBe('unknown')
  })

  it('rejects forged signatures on both deterministic-test and stripe-test adapters', () => {
    const det = createDeterministicPaymentAdapter({ secret: 'det-secret-32-chars-minimum-12345' })
    const signed = signedLocalPaymentEvent({
      attemptId: 'attempt-11c',
      providerReference: 'det_cs_0123456789abcdef01234567',
      amountMinor: '2359',
      currency: 'USD',
      secret: 'det-secret-32-chars-minimum-12345',
    })
    expect(det.normalizeSignedWebhook(signed.raw, 'forged-signature')).toBeNull()
    expect(det.normalizeSignedWebhook(signed.raw, signed.signature)).toMatchObject({
      providerEventId: 'local-test-paid:attempt-11c',
      kind: 'succeeded',
      amountMinor: '2359',
      currency: 'USD',
    })

    const stripe = createStripeTestAdapter({
      secretKey: 'sk_test_11c',
      webhookSecret: 'whsec_11c',
    })
    const now = new Date('2026-10-27T00:00:00.000Z')
    const ts = Math.floor(now.getTime() / 1000)
    const stripeRaw = JSON.stringify({
      id: 'evt_stripe_11c',
      type: 'payment_intent.succeeded',
      created: ts,
      livemode: false,
      data: {
        object: {
          id: 'pi_11c',
          object: 'payment_intent',
          amount: 2359,
          currency: 'usd',
          metadata: { renegade_attempt_id: 'attempt-11c' },
        },
      },
    })
    const validStripeSig = createHmac('sha256', 'whsec_11c')
      .update(`${ts}.${stripeRaw}`)
      .digest('hex')
    expect(stripe.normalizeSignedWebhook(stripeRaw, `t=${ts},v1=forged`, now)).toBeNull()
    expect(
      stripe.normalizeSignedWebhook(stripeRaw, `t=${ts},v1=${validStripeSig}`, now),
    ).toMatchObject({
      providerEventId: 'evt_stripe_11c',
      kind: 'succeeded',
      amountMinor: '2359',
      currency: 'USD',
    })
  })

  it('freezes quoted order lines and settles an order idempotently with a single inventory decrement', async () => {
    const products = [
      {
        id: 'prod-book',
        name: 'Field Manual',
        state: 'published',
        kind: 'physical',
        catalogContractVersion: 1,
        variants: [
          {
            sku: 'BOOK-HC',
            title: 'Hardcover',
            status: 'active' as const,
            inventoryPolicy: 'tracked' as const,
            inventoryQuantity: 5,
          },
        ],
        offers: [
          {
            id: 'offer-book',
            version: 1,
            status: 'active',
            variantSku: 'BOOK-HC',
            currency: 'USD',
            amountMinor: '2500',
          },
        ],
      },
    ]
    const quoted = snapshotQuotedLines({
      cartLines: [
        {
          productId: 'prod-book',
          variantSku: 'BOOK-HC',
          quantity: 2,
          merchantConnectionId: 'mc-alpha',
          kind: 'physical',
        },
      ],
      products,
      currency: 'USD',
    })
    expect(quoted).toEqual([
      {
        productId: 'prod-book',
        variantSku: 'BOOK-HC',
        title: 'Hardcover',
        quantity: 2,
        unitAmountMinor: '2500',
        lineAmountMinor: '5000',
        currency: 'USD',
        kind: 'physical',
      },
    ])
    expect(() =>
      assertCheckoutQuote({ lines: quoted, currency: 'USD', amountMinor: '5000' }),
    ).not.toThrow()
    expect(() =>
      assertCheckoutQuote({ lines: quoted, currency: 'USD', amountMinor: '4999' }),
    ).toThrow('Checkout total differs from the server quote.')
  })
})
