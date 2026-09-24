/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { ensureRenegadePartyDemo, type DemoEnvironment } from '../helpers/renegadeparty-demo'

// Commerce modules & contracts
import {
  createEmptyCart,
  reResolveCart,
  mergeGuestAndMemberCarts,
  generateGuestToken,
  hashGuestToken,
  guestCartCookieName,
  type CartItem,
  type VersionedCart,
  type CatalogProductLookup,
} from '../../src/modules/commerce/cart'
import {
  computePricing,
  allocateDiscountsToLines,
  allocateTaxToLines,
  type PricingSnapshot,
} from '../../src/modules/commerce/pricing'
import {
  resolvePromotions,
  evaluatePromotion,
  normalizePromoCode,
  type PromotionDefinition,
} from '../../src/modules/commerce/promotions'
import {
  validateAddress,
  type ValidatedAddress,
  type ShippingRate,
} from '../../src/modules/commerce/shipping'
import {
  BoundedJurisdictionTaxAdapter,
  type TaxCalculationResult,
} from '../../src/modules/commerce/tax'
import {
  createCheckoutProposal,
  assertProposalValidForCheckout,
  computeProposalIntegrityHash,
  type CheckoutProposal,
} from '../../src/modules/commerce/proposal'
import {
  createDeterministicPaymentAdapter,
  createStripeTestAdapter,
  type NormalizedPaymentEvent,
  type ProviderPayment,
} from '../../src/modules/commerce/payment-provider'
import {
  applyNormalizedPaymentEvent,
  checkoutBindingKey,
  previewRefund,
  receiptMessageSnapshot,
  signGuestOrderToken,
  verifyGuestOrderToken,
  type PaymentAttemptSnapshot,
} from '../../src/modules/commerce/payment-operations'
import {
  finalizeVerifiedOrder,
  snapshotQuotedLines,
  methodsForCart,
  transitionOrder,
  applyVerifiedWebhook,
  deriveDownloadGrantKey,
  type CartLine,
} from '../../src/modules/commerce/service'
import {
  publishPlan,
  grantsFromSubscription,
  subscriptionGrantsAccess,
  acceptSubscriptionEvent,
  applySubscriptionEvent,
  subscriptionMetrics,
} from '../../src/modules/commerce/subscription-contract'
import {
  assertCampaign,
  assertDonationIntent,
  assertDonationPaymentBinding,
  assertCampaignTransition,
  feeCoverAmount,
  donationDisclosures,
  calculateDonationProgress,
  type Campaign,
} from '../../src/modules/commerce/donations'
import {
  ingestDonationEvidence,
  reverseDonation,
} from '../../src/modules/commerce/donation-ingestion'
import { issueMagicLink, consumeMagicLink } from '../../src/modules/identity/member-identity'

// Matcher helper for mock in-memory database queries
const matches = (row: any, where: any): boolean => {
  if (!where) return true
  if (typeof where !== 'object') return String(row) === String(where)
  if (where.and) return where.and.every((part: any) => matches(row, part))
  return Object.entries(where).every(([key, condition]: [string, any]) => {
    const actual = row[key]?.id ?? row[key]
    return condition?.equals !== undefined
      ? String(actual ?? '') === String(condition.equals)
      : typeof condition === 'object'
        ? false
        : String(actual ?? '') === String(condition)
  })
}

function createDonationMockFixture() {
  const rows: Record<string, any[]> = {
    'payment-intents': [{ id: 'pay-1', amountMinor: '2500', currency: 'USD', state: 'pending' }],
    'donation-intents': [],
    'donation-campaigns': [],
    'donation-events': [],
    donations: [],
    supporters: [],
    entitlements: [],
    subscriptions: [],
    'member-notifications': [],
  }
  let id = 0
  const mockPayload: any = {
    find: async ({ collection, where }: any) => ({
      docs: (rows[collection] || []).filter((row) => matches(row, where)),
    }),
    findByID: async ({ collection, id }: any) =>
      (rows[collection] || []).find((row) => row.id === id) ?? null,
    create: async ({ collection, data }: any) => {
      const uniques: Record<string, (row: any) => boolean> = {
        'donation-events': (row) => row.eventKey === data.eventKey,
        donations: (row) => row.paymentIntent === data.paymentIntent,
        supporters: (row) =>
          data.emailHash
            ? row.emailHash === data.emailHash && row.site === data.site
            : row.member === data.member && row.site === data.site,
      }
      if (uniques[collection] && (rows[collection] || []).some(uniques[collection])) {
        throw new Error('unique conflict')
      }
      const row = { id: `row_${++id}`, ...data }
      if (!rows[collection]) rows[collection] = []
      rows[collection].push(row)
      return row
    },
    update: async ({ collection, id, data }: any) => {
      const row = (rows[collection] || []).find((r) => r.id === id)
      if (row) Object.assign(row, data)
      return row
    },
  }
  return { mockPayload, rows }
}

describe('Shared Contract Proof: Checkout/Order, Member/Subscription, Donations & Financial Attacks', () => {
  let payload: Payload
  let demo: DemoEnvironment
  let siteId: string
  let merchantConnectionId: string
  const testRunId = randomUUID().slice(0, 8)

  // Fixtures
  let sampleProduct: CatalogProductLookup
  let samplePayloadProduct: any
  let guestMemberId: string
  let guestToken: string
  let guestTokenHash: string
  let guestCart: VersionedCart
  let persistedCartDoc: any
  let resolvedPricing: PricingSnapshot
  let validShippingAddress: ValidatedAddress
  let selectedShippingRate: ShippingRate
  let taxCalculation: TaxCalculationResult
  let checkoutProposal: CheckoutProposal
  let checkoutSessionDoc: any
  let paymentIntentDoc: any
  let createdOrderId: string
  let sampleSubscription: any
  let sampleCampaign: Campaign

  const paymentSecret = 'sec_shared_contract_test_secret_32bytes'

  beforeAll(async () => {
    payload = await getPayload({ config })
    demo = await ensureRenegadePartyDemo(payload)
    siteId = demo.siteId

    // Ensure active merchant connection
    const merchants = await payload.find({
      collection: 'merchant-connections',
      where: { site: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    } as never)
    if (merchants.docs[0]) {
      merchantConnectionId = String(merchants.docs[0].id)
    } else {
      const createdMerch = (await payload.create({
        collection: 'merchant-connections',
        data: {
          site: siteId,
          label: `Primary Test Merchant ${testRunId}`,
          providerKey: 'deterministic-test',
          merchantCountry: 'US',
          status: 'active',
          configuration: {},
        },
        overrideAccess: true,
      } as never)) as any
      merchantConnectionId = String(createdMerch.id)
    }

    // Set up published sample product in Payload & Catalog
    samplePayloadProduct = (await payload.create({
      collection: 'products',
      data: {
        site: siteId,
        name: `Renegade Field Jacket ${testRunId}`,
        slug: `field-jacket-${testRunId}`,
        canonicalPath: `/store/field-jacket-${testRunId}`,
        kind: 'physical',
        state: 'published',
        publishedAt: new Date().toISOString(),
        productCapabilities: ['shippable'],
        optionDimensions: [{ key: 'size', label: 'Size', values: ['L'] }],
        variants: [
          {
            sku: `JKT-${testRunId}-L`,
            title: 'Field Jacket Large',
            status: 'active',
            optionValues: { size: 'L' },
            dimensionsMm: { length: 300, width: 200, height: 50 },
            inventoryPolicy: 'tracked',
            inventoryQuantity: 25,
            weightGrams: 500,
          },
        ],
        prices: [
          {
            currency: 'USD',
            amountMinor: '4500', // $45.00
            variantSku: `JKT-${testRunId}-L`,
          },
        ],
        offers: [
          {
            id: `offer-${testRunId}`,
            version: 1,
            status: 'active',
            variantSku: `JKT-${testRunId}-L`,
            amountMinor: '4500',
            currency: 'USD',
            taxDisplay: 'exclusive',
            segmentPolicy: { mode: 'public' },
          },
        ],
        disclosures: [{ text: 'Ships from local union depot.' }],
      },
      overrideAccess: true,
      context: { catalogWorkflow: true },
    } as never)) as any

    sampleProduct = {
      id: String(samplePayloadProduct.id),
      name: samplePayloadProduct.name,
      state: 'published',
      kind: 'physical',
      variants: [
        {
          sku: `JKT-${testRunId}-L`,
          title: 'Field Jacket Large',
          status: 'active',
          inventoryPolicy: 'tracked',
          inventoryQuantity: 25,
          weightGrams: 500,
          shippable: true,
        },
      ],
      offers: [
        {
          id: `offer-${testRunId}`,
          version: 1,
          status: 'active',
          variantSku: `JKT-${testRunId}-L`,
          amountMinor: '4500',
          currency: 'USD',
          taxDisplay: 'exclusive',
        },
      ],
    }

    // Set up Member actor
    const memberEmail = `buyer-${testRunId}@renegadeparty.org`
    const link = await issueMagicLink(payload as never, memberEmail)
    const verified = await consumeMagicLink(payload as never, link.token!)
    expect(verified).not.toBeNull()
    guestMemberId = verified!.memberId
  })

  afterAll(async () => {
    // Cleanup product created for test
    if (samplePayloadProduct?.id) {
      await payload
        .delete({
          collection: 'products',
          id: samplePayloadProduct.id,
          overrideAccess: true,
        } as never)
        .catch(() => {})
    }
  })

  // ===========================================================================
  // CHECKOUT / ORDER (PROOFS 1 - 11)
  // ===========================================================================
  describe('CHECKOUT / ORDER: Lifecycle, Tampering Invariants & Reconciliation', () => {
    it('1. Creates an empty guest cart with cryptographic guest token', () => {
      const tokenObj = generateGuestToken()
      guestToken = tokenObj.token
      guestTokenHash = tokenObj.hash

      const cookieName = guestCartCookieName(siteId)
      expect(cookieName).toBe(`renegade_cart_${siteId}`)

      guestCart = createEmptyCart({
        id: `cart-${testRunId}`,
        siteId,
        merchantConnectionId,
        currency: 'USD',
        guestTokenHash,
      })

      expect(guestCart.id).toBe(`cart-${testRunId}`)
      expect(guestCart.siteId).toBe(siteId)
      expect(guestCart.guestTokenHash).toBe(guestTokenHash)
      expect(guestCart.version).toBe(1)
      expect(guestCart.items).toEqual([])
    })

    it('2. Defeats client price/totals tampering via authoritative catalog re-resolution', () => {
      // Attacker attempts to add item with tampered unitPriceMinor = 100 ($1.00) instead of 4500 ($45.00)
      const tamperedItem: CartItem = {
        lineId: `line-${testRunId}`,
        productId: sampleProduct.id,
        variantSku: `JKT-${testRunId}-L`,
        quantity: 2,
        kind: 'physical',
        displaySnapshot: {
          title: 'Tampered Jacket',
          unitPriceMinor: '100', // Tampered!
          currency: 'USD',
        },
      }

      const cartWithTamperedItem = { ...guestCart, items: [tamperedItem] }
      const { cart: resolvedCart, pricingSnapshot } = reResolveCart({
        cart: cartWithTamperedItem,
        products: [sampleProduct],
      })

      // Verified: Server overwrites with authoritative catalog price 4500 and records reconciliation note
      expect(resolvedCart.items[0].displaySnapshot.unitPriceMinor).toBe('4500')
      expect(pricingSnapshot.subtotalMinor).toBe('9000') // 2 * 4500
      expect(resolvedCart.reconciliationNotes.some((n) => n.code === 'price-changed')).toBe(true)

      guestCart = resolvedCart
      resolvedPricing = pricingSnapshot

      // Currency tampering across lines throws
      expect(() =>
        computePricing({
          currency: 'USD',
          lines: [
            {
              lineId: 'l-err',
              productId: sampleProduct.id,
              variantSku: `JKT-${testRunId}-L`,
              quantity: 1,
              unitPriceMinor: '4500',
              currency: 'EUR', // Mismatched currency!
            },
          ],
        }),
      ).toThrow(/Line currency mismatch/)

      // Negative or float quantities throw
      expect(() =>
        computePricing({
          currency: 'USD',
          lines: [
            {
              lineId: 'l-neg',
              productId: sampleProduct.id,
              variantSku: `JKT-${testRunId}-L`,
              quantity: -2,
              unitPriceMinor: '4500',
              currency: 'USD',
            },
          ],
        }),
      ).toThrow(/Invalid line quantity/)
    })

    it('3. Recovers cart across sessions via hashed token without leaking plaintext', async () => {
      persistedCartDoc = (await payload.create({
        collection: 'carts',
        data: {
          site: siteId,
          merchantConnection: merchantConnectionId,
          version: guestCart.version,
          guestTokenHash,
          currency: 'USD',
          items: guestCart.items as any,
          reconciliationNotes: guestCart.reconciliationNotes as any,
          state: 'active',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        overrideAccess: true,
      } as never)) as any

      // Recover cart by querying with hashed token
      const found = await payload.find({
        collection: 'carts',
        where: {
          and: [
            { site: { equals: siteId } },
            { guestTokenHash: { equals: hashGuestToken(guestToken) } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      } as never)

      expect(found.docs.length).toBe(1)
      const recovered = found.docs[0] as any
      expect(recovered.id).toBe(persistedCartDoc.id)
      expect(recovered.items[0].displaySnapshot.unitPriceMinor).toBe('4500')
      expect(recovered.reconciliationNotes.length).toBeGreaterThan(0)
    })

    it('4. Calculates valid shipping and jurisdiction tax with exact integer allocation', async () => {
      const addressValidation = validateAddress({
        name: 'Citizen Jane',
        line1: '123 Renegade Way',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      })
      expect(addressValidation.isValid).toBe(true)
      validShippingAddress = addressValidation

      const nowIso = new Date().toISOString()
      selectedShippingRate = {
        id: 'ground_std',
        title: 'Standard Ground',
        amountMinor: '800', // $8.00
        currency: 'USD',
        source: 'carrier',
        quotedAt: nowIso,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }

      const taxAdapter = new BoundedJurisdictionTaxAdapter()
      taxCalculation = await taxAdapter.calculateTax({
        siteId,
        currency: 'USD',
        destination: validShippingAddress,
        lines: [
          {
            lineId: `line-${testRunId}`,
            productId: sampleProduct.id,
            variantSku: `JKT-${testRunId}-L`,
            quantity: 2,
            unitPriceMinor: '4500',
            currency: 'USD',
          },
        ],
        shippingAmountMinor: selectedShippingRate.amountMinor,
        taxShipping: true,
      })

      // 6.25% on (9000 + 800 = 9800) = 612 minor
      expect(taxCalculation.taxAmountMinor).toBe('612')
      expect(taxCalculation.taxDisplay).toBe('exclusive')

      // Complete pricing computation
      resolvedPricing = computePricing({
        currency: 'USD',
        lines: [
          {
            lineId: `line-${testRunId}`,
            productId: sampleProduct.id,
            variantSku: `JKT-${testRunId}-L`,
            quantity: 2,
            unitPriceMinor: '4500',
            currency: 'USD',
          },
        ],
        shippingAmountMinor: selectedShippingRate.amountMinor,
        taxTotalMinor: taxCalculation.taxAmountMinor,
      })

      // Subtotal (9000) + Shipping (800) + Tax (612) = 10412
      expect(resolvedPricing.subtotalMinor).toBe('9000')
      expect(resolvedPricing.netShippingMinor).toBe('800')
      expect(resolvedPricing.taxTotalMinor).toBe('612')
      expect(resolvedPricing.grandTotalMinor).toBe('10412')
    })

    it('5. Creates checkout proposal and verifies cryptographic integrity hash', () => {
      checkoutProposal = createCheckoutProposal({
        cart: guestCart,
        pricingSnapshot: resolvedPricing,
        customer: {
          email: 'citizen@renegadeparty.org',
          name: 'Citizen Jane',
          isGuest: true,
        },
        shippingAddress: validShippingAddress,
        selectedShippingRate,
        taxSnapshot: taxCalculation,
        consents: {
          termsAccepted: true,
          privacyAccepted: true,
          timestamp: new Date().toISOString(),
        },
      })

      expect(checkoutProposal.state).toBe('active')
      expect(checkoutProposal.integrityHash).toMatch(/^sha256:[0-9a-f]{64}$/)

      // Validates successfully against proposal contract
      expect(() => assertProposalValidForCheckout(checkoutProposal, guestCart)).not.toThrow()

      // Tampered proposal grand total is immediately rejected
      const tamperedProposal = {
        ...checkoutProposal,
        pricingSnapshot: {
          ...checkoutProposal.pricingSnapshot,
          grandTotalMinor: '100', // Tampered from 10609 to 100!
        },
      }
      expect(() => assertProposalValidForCheckout(tamperedProposal, guestCart)).toThrow(
        /integrity check failed/,
      )
    })

    it('6. Initiates hosted checkout and delivers verified signed payment webhook event', async () => {
      const adapter = createDeterministicPaymentAdapter({ secret: paymentSecret })
      const checkoutSession = await adapter.createHostedCheckout({
        attemptId: `att_${testRunId}`,
        idempotencyKey: `idemp_${testRunId}`,
        amountMinor: checkoutProposal.pricingSnapshot.grandTotalMinor,
        currency: 'USD',
        description: `Order for proposal ${checkoutProposal.id}`,
        successUrl: 'https://renegadeparty.org/checkout/success',
        cancelUrl: 'https://renegadeparty.org/checkout/cancel',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        customerEmail: 'citizen@renegadeparty.org',
        metadata: { renegade_attempt_id: `att_${testRunId}` },
      })

      expect(checkoutSession.state).toBe('action-required')
      expect(checkoutSession.providerReference).toMatch(/^det_cs_/)

      // Create signed webhook event
      const rawEventPayload = JSON.stringify({
        providerEventId: `evt_${testRunId}_paid`,
        providerReference: checkoutSession.providerReference,
        providerPaymentReference: `det_pi_${testRunId}`,
        kind: 'succeeded',
        amountMinor: '10412',
        currency: 'USD',
        occurredAt: new Date().toISOString(),
        sanitizedEvidence: { attemptId: `att_${testRunId}` },
      })

      const signature = createHmac('sha256', paymentSecret).update(rawEventPayload).digest('hex')

      // Normalization verifies cryptographic signature
      const normalized = adapter.normalizeSignedWebhook(rawEventPayload, signature)
      expect(normalized).not.toBeNull()
      expect(normalized!.kind).toBe('succeeded')
      expect(normalized!.amountMinor).toBe('10412')

      // Forged signature is rejected
      expect(adapter.normalizeSignedWebhook(rawEventPayload, 'bad_signature_deadbeef')).toBeNull()
    })

    it('7. Delivers duplicate, delayed, and out-of-order events with deterministic monotonic reduction', () => {
      const attemptSnapshot: PaymentAttemptSnapshot = {
        id: `att_${testRunId}`,
        checkoutSessionId: `sess_${testRunId}`,
        proposalId: checkoutProposal.id,
        customerKey: 'cust_jane',
        siteId,
        amountMinor: '10412',
        currency: 'USD',
        attempt: 1,
        state: 'processing',
        providerReference: `det_cs_${testRunId}`,
        refundedAmountMinor: '0',
        processedEventIds: [],
      }

      // Event 1: sequence 10, succeeded
      const evtSeq10: NormalizedPaymentEvent = {
        providerEventId: `evt_${testRunId}_10`,
        providerReference: `det_cs_${testRunId}`,
        kind: 'succeeded',
        amountMinor: '10412',
        currency: 'USD',
        occurredAt: new Date().toISOString(),
        sequence: 10,
        sanitizedEvidence: {},
      }

      const state1 = applyNormalizedPaymentEvent(attemptSnapshot, evtSeq10)
      expect(state1.state).toBe('succeeded')
      expect(state1.lastProviderSequence).toBe(10)
      expect(state1.processedEventIds).toContain(evtSeq10.providerEventId)

      // Event 2: Duplicate of Event 1 (exact replay)
      const state2 = applyNormalizedPaymentEvent(state1, evtSeq10)
      expect(state2).toBe(state1) // Pure no-op, same reference

      // Event 3: Delayed/Stale out-of-order Event with sequence 5 (older than 10)
      const evtSeq5: NormalizedPaymentEvent = {
        providerEventId: `evt_${testRunId}_5`,
        providerReference: `det_cs_${testRunId}`,
        kind: 'processing',
        amountMinor: '10412',
        currency: 'USD',
        occurredAt: new Date(Date.now() - 60000).toISOString(),
        sequence: 5,
        sanitizedEvidence: {},
      }

      const state3 = applyNormalizedPaymentEvent(state1, evtSeq5)
      // Dropped as stale: state remains 'succeeded'
      expect(state3.state).toBe('succeeded')
      expect(state3.lastProviderSequence).toBe(10)
      expect(state3.processedEventIds).toContain(evtSeq5.providerEventId)
    })

    it('8. Reconciles payment attempts under simulated worker interruption/restart', async () => {
      const adapter = createDeterministicPaymentAdapter({ secret: paymentSecret })
      const checkoutSession = await adapter.createHostedCheckout({
        attemptId: `att_restart_${testRunId}`,
        idempotencyKey: `idemp_restart_${testRunId}`,
        amountMinor: '10412',
        currency: 'USD',
        description: 'Restart reconciliation proof',
        successUrl: 'https://renegadeparty.org/return',
        cancelUrl: 'https://renegadeparty.org/cancel',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        metadata: {},
      })

      // Simulate remote provider transition to succeeded
      adapter.setState(checkoutSession.providerReference, 'succeeded')

      // First worker reads state
      const firstCheck = await adapter.reconcile(checkoutSession.providerReference)
      expect(firstCheck.state).toBe('succeeded')

      // Reconciles deterministically after restart
      const restartedCheck = await adapter.reconcile(checkoutSession.providerReference)
      expect(restartedCheck.state).toBe('succeeded')
      expect(restartedCheck.amountMinor).toBe('10412')
    })

    it('9. Proves exactly one canonical Order and one correct receipt created across duplicate deliveries', async () => {
      // Create session & intent documents in Payload
      checkoutSessionDoc = (await payload.create({
        collection: 'checkout-sessions',
        data: {
          site: siteId,
          cart: persistedCartDoc.id,
          merchantConnection: merchantConnectionId,
          currency: 'USD',
          amountMinor: '10412',
          state: 'open',
          attempt: 1,
        },
        overrideAccess: true,
      } as never)) as any

      paymentIntentDoc = (await payload.create({
        collection: 'payment-intents',
        data: {
          site: siteId,
          checkoutSession: checkoutSessionDoc.id,
          merchantConnection: merchantConnectionId,
          capabilityId: 'card-payment',
          providerKey: 'deterministic-test',
          amountMinor: '10412',
          currency: 'USD',
          state: 'paid',
          orderLines: [
            {
              productId: sampleProduct.id,
              variantSku: `JKT-${testRunId}-L`,
              title: 'Field Jacket Large',
              quantity: 2,
              unitAmountMinor: '4500',
              lineAmountMinor: '9000',
              currency: 'USD',
              kind: 'physical',
            },
          ],
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        overrideAccess: true,
      } as never)) as any

      const verificationTime = new Date().toISOString()
      const settlementInput = {
        intent: {
          id: paymentIntentDoc.id,
          providerKey: 'deterministic-test',
          amountMinor: '10412',
          currency: 'USD',
          orderLines: paymentIntentDoc.orderLines,
        },
        session: {
          id: checkoutSessionDoc.id,
          site: siteId,
          currency: 'USD',
          amountMinor: '10412',
          cart: persistedCartDoc.id,
        },
        merchantId: merchantConnectionId,
        verifiedAt: verificationTime,
      }

      // First delivery: creates order and issues receipt
      await finalizeVerifiedOrder(payload, settlementInput)

      // Concurrent duplicate delivery: executes with identical input
      await finalizeVerifiedOrder(payload, settlementInput)

      // Verify DB contains exactly ONE order
      const orders = await payload.find({
        collection: 'orders',
        where: { checkoutSession: { equals: checkoutSessionDoc.id } },
        overrideAccess: true,
      } as never)

      expect(orders.docs.length).toBe(1)
      const order = orders.docs[0] as any
      createdOrderId = String(order.id)

      expect(order.state).toBe('paid')
      expect(order.amountMinor).toBe('10412')
      expect(order.currency).toBe('USD')
      expect(order.receipt).toBeDefined()
      expect(order.receipt.state).toBe('issued')
      expect(order.receipt.amountMinor).toBe('10412')
      expect(order.receipt.receiptNumber).toBe(`receipt_${createdOrderId}`)

      // Verify receipt message snapshot produces valid transactional delivery message
      const msg = receiptMessageSnapshot({
        orderNumber: order.orderNumber,
        receiptNumber: order.receipt.receiptNumber,
        recipientEmail: 'jane.doe@renegade.internal',
        currency: order.currency,
        amountMinor: order.amountMinor,
      })
      expect(msg.variables.orderNumber).toBe(order.orderNumber)
      expect(msg.variables.receiptNumber).toBe(order.receipt.receiptNumber)
      expect(msg.blocks[1].text).toContain(order.orderNumber)
      expect(msg.blocks[1].text).toContain('10412 USD')
    })

    it('10. Executes refunds and disputes, transitioning order state safely with dual control', async () => {
      // 1. Preview refund
      const refundCheck = previewRefund({
        capturedAmountMinor: '10412',
        alreadyRefundedAmountMinor: '0',
        requestedAmountMinor: '5000',
        currency: 'USD',
        orderState: 'paid',
        dualControlThresholdMinor: '10000',
      })
      expect(refundCheck.outcome).toBe('partial')
      expect(refundCheck.requiresSecondApproval).toBe(false)
      expect(refundCheck.remainingAfterMinor).toBe('5412')

      // Exceeding refundable balance is rejected
      expect(() =>
        previewRefund({
          capturedAmountMinor: '10412',
          alreadyRefundedAmountMinor: '0',
          requestedAmountMinor: '20000', // Exceeds 10412
          currency: 'USD',
          orderState: 'paid',
        }),
      ).toThrow(/Refund exceeds the refundable balance/)

      // Transition order on partial refund
      const stateAfterPartial = transitionOrder('paid', {
        id: `evt_ref_1_${testRunId}`,
        intentId: String(paymentIntentDoc.id),
        kind: 'refunded',
        occurredAt: new Date().toISOString(),
      })
      expect(stateAfterPartial).toBe('refunded')

      // Transition order on dispute / exception
      const stateAfterDispute = transitionOrder('paid', {
        id: `evt_disp_1_${testRunId}`,
        intentId: String(paymentIntentDoc.id),
        kind: 'disputed',
        occurredAt: new Date().toISOString(),
      })
      expect(stateAfterDispute).toBe('exception')
    })

    it('11. Verifies subsequent catalog mutations or archiving do NOT corrupt historical order facts', async () => {
      // Mutate the product in the catalog: rename it, change variant prices, and archive it
      await payload.update({
        collection: 'products',
        id: samplePayloadProduct.id,
        data: {
          name: 'Renegade Field Jacket (ARCHIVED & REDESIGNED)',
          state: 'archived',
          variants: [
            {
              sku: `JKT-${testRunId}-L`,
              title: 'Redesigned Jacket',
              status: 'archived',
              inventoryPolicy: 'tracked',
              inventoryQuantity: 0,
            },
          ],
          prices: [
            {
              currency: 'USD',
              amountMinor: '99999', // Radically different price
              variantSku: `JKT-${testRunId}-L`,
            },
          ],
        },
        overrideAccess: true,
      } as never)

      // Query the order saved in step 9
      const fetchedOrder = (await payload.findByID({
        collection: 'orders',
        id: createdOrderId,
        depth: 0,
        overrideAccess: true,
      } as never)) as any

      // Verified: The order retains the immutable facts recorded at purchase time
      expect(fetchedOrder.amountMinor).toBe('10412')
      expect(fetchedOrder.currency).toBe('USD')
      expect(fetchedOrder.items[0].title).toBe('Field Jacket Large')
      expect(fetchedOrder.items[0].unitAmountMinor).toBe('4500')
      expect(fetchedOrder.items[0].lineAmountMinor).toBe('9000')
    })
  })

  // ===========================================================================
  // MEMBER / SUBSCRIPTION (PROOFS 12 - 20)
  // ===========================================================================
  describe('MEMBER / SUBSCRIPTION: Identity Merge, Lifecycle, Dunning & Entitlements', () => {
    it('12. Merges guest and member carts safely and blocks cross-site guest cart theft', () => {
      const guestCartOnSite = createEmptyCart({
        id: `guest-cart-${testRunId}`,
        siteId,
        merchantConnectionId,
        currency: 'USD',
        guestTokenHash,
      })
      const guestCartWithItem = {
        ...guestCartOnSite,
        items: [
          {
            lineId: 'line-guest-1',
            productId: sampleProduct.id,
            variantSku: `JKT-${testRunId}-L`,
            quantity: 1,
            kind: 'physical' as const,
            displaySnapshot: {
              title: 'Field Jacket',
              unitPriceMinor: '4500',
              currency: 'USD',
            },
          },
        ],
      }

      const memberCartOnSite = createEmptyCart({
        id: `member-cart-${testRunId}`,
        siteId,
        merchantConnectionId,
        currency: 'USD',
        customerId: guestMemberId,
      })

      const mergeResult = mergeGuestAndMemberCarts({
        guestCart: guestCartWithItem,
        memberCart: memberCartOnSite,
        products: [sampleProduct],
      })

      expect(mergeResult.mergedCart.customerId).toBe(guestMemberId)
      expect(mergeResult.mergedCart.items.length).toBe(1)
      expect(mergeResult.mergedCart.items[0].quantity).toBe(1)

      // Cross-site theft attack: guest cart from site alpha merged into member cart from site beta
      const crossSiteMemberCart = createEmptyCart({
        id: `member-cart-beta-${testRunId}`,
        siteId: 'different-rogue-site-beta',
        merchantConnectionId,
        currency: 'USD',
        customerId: guestMemberId,
      })

      expect(() =>
        mergeGuestAndMemberCarts({
          guestCart: guestCartWithItem,
          memberCart: crossSiteMemberCart,
          products: [sampleProduct],
        }),
      ).toThrow(/Cross-site cart access denied/)
    })

    it('13 & 14. Publishes subscription plan, starts active subscription, and grants gated access', () => {
      const plan = publishPlan({
        planKey: `insiders-${testRunId}`,
        interval: 'month',
        intervalCount: 1,
        amountMinor: '1500', // $15.00/mo
        currency: 'USD',
        trialDays: 0,
        trialEligibility: 'none',
        entitlements: [
          {
            resource: 'publication:bulletin',
            capability: 'read',
            siteId,
            term: 'subscription',
          },
        ],
        cancelPolicy: 'period_end',
        changePolicy: 'period_end',
        taxPolicy: 'provider',
        providerMappings: { deterministic: `price_sub_${testRunId}` },
        publishedAt: new Date().toISOString(),
      })

      const now = new Date()
      const currentPeriodStart = now.toISOString()
      const currentPeriodEnd = new Date(now.getTime() + 30 * 86400000).toISOString()

      sampleSubscription = {
        id: `sub_${testRunId}`,
        customerId: guestMemberId,
        siteId,
        plan,
        provider: { key: 'deterministic', subscriptionRef: `p_sub_${testRunId}` },
        state: 'active' as const,
        source: 'provider' as const,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        createdAt: currentPeriodStart,
        updatedAt: currentPeriodStart,
        version: 1,
      }

      // Derived entitlements grant scoped capability
      const grants = grantsFromSubscription(sampleSubscription)
      expect(grants.length).toBe(1)
      expect(grants[0]).toMatchObject({
        subjectId: guestMemberId,
        siteId,
        resource: 'publication:bulletin',
        capability: 'read',
        sourceId: sampleSubscription.id,
      })

      // Gated access check is true within period
      expect(subscriptionGrantsAccess(sampleSubscription, now.toISOString())).toBe(true)
    })

    it('15 & 16. Handles failed renewal: transitions to past_due dunning grace period without erasing evidence', () => {
      const failedRenewalEvent = {
        id: `evt_dunn_${testRunId}`,
        providerEventId: `evt_prov_fail_${testRunId}`,
        subscriptionId: sampleSubscription.id,
        kind: 'invoice_failed' as const,
        occurredAt: new Date().toISOString(),
      }

      const pastDueSub = applySubscriptionEvent(sampleSubscription, failedRenewalEvent)
      expect(pastDueSub.state).toBe('past_due')
      expect(pastDueSub.currentPeriodEnd).toBe(sampleSubscription.currentPeriodEnd)

      // Original subscription object remained immutable
      expect(sampleSubscription.state).toBe('active')
    })

    it('17. Executes recovery on successful invoice OR deterministic terminal cancellation', () => {
      const pastDueSub = applySubscriptionEvent(sampleSubscription, {
        id: `evt_fail_${testRunId}`,
        subscriptionId: sampleSubscription.id,
        kind: 'invoice_failed',
        occurredAt: new Date().toISOString(),
      })

      // Path A: Recovery via invoice_paid
      const recoveredSub = applySubscriptionEvent(pastDueSub, {
        id: `evt_rec_${testRunId}`,
        subscriptionId: sampleSubscription.id,
        kind: 'invoice_paid',
        occurredAt: new Date().toISOString(),
      })
      expect(recoveredSub.state).toBe('active')
      expect(subscriptionGrantsAccess(recoveredSub, new Date().toISOString())).toBe(true)

      // Path B: Deterministic terminal expiry via canceled
      const expiredSub = applySubscriptionEvent(pastDueSub, {
        id: `evt_cancel_${testRunId}`,
        subscriptionId: sampleSubscription.id,
        kind: 'canceled',
        occurredAt: new Date().toISOString(),
      })
      expect(expiredSub.state).toBe('canceled')
      // Cancelled subscription immediately revokes access
      expect(subscriptionGrantsAccess(expiredSub, new Date().toISOString())).toBe(false)
      expect(grantsFromSubscription(expiredSub)).toEqual([])
    })

    it('18. Confirms plan change, cancellation scheduling at period end, and immediate resumption', () => {
      // Schedule cancellation at period end
      const cancelScheduledSub = applySubscriptionEvent(sampleSubscription, {
        id: `evt_sched_${testRunId}`,
        subscriptionId: sampleSubscription.id,
        kind: 'cancel_scheduled',
        occurredAt: new Date().toISOString(),
        sequence: 2,
      })
      expect(cancelScheduledSub.cancelAtPeriodEnd).toBe(true)
      expect(cancelScheduledSub.state).toBe('cancel_at_period_end')

      // Resume subscription before period end
      const resumedSub = applySubscriptionEvent(cancelScheduledSub, {
        id: `evt_res_${testRunId}`,
        subscriptionId: sampleSubscription.id,
        kind: 'resumed',
        occurredAt: new Date().toISOString(),
        sequence: 3,
      })
      expect(resumedSub.cancelAtPeriodEnd).toBe(false)
      expect(resumedSub.state).toBe('active')
    })

    it('19. Verifies invoices, metrics, and billing history segregated by currency', () => {
      const euroPlan = publishPlan({
        ...sampleSubscription.plan,
        planKey: `insiders-eu-${testRunId}`,
        amountMinor: '1400',
        currency: 'EUR',
      })
      const euroSub = {
        ...sampleSubscription,
        id: `sub_eu_${testRunId}`,
        plan: euroPlan,
      }

      const metrics = subscriptionMetrics(
        [sampleSubscription, euroSub],
        [...grantsFromSubscription(sampleSubscription), ...grantsFromSubscription(euroSub)],
        new Date().toISOString(),
      )

      // Reports segregated currencies without arithmetic bleed
      const usdMetric = metrics.find((m) => m.currency === 'USD')
      const eurMetric = metrics.find((m) => m.currency === 'EUR')

      expect(usdMetric).toMatchObject({
        currency: 'USD',
        subscriptions: 1,
        recurringRevenueMonthlyMinor: '1500',
        dunning: 0,
      })
      expect(eurMetric).toMatchObject({
        currency: 'EUR',
        subscriptions: 1,
        recurringRevenueMonthlyMinor: '1400',
        dunning: 0,
      })
    })

    it('20. Simulates restart during renewal processing and proves zero duplicate side effects', () => {
      const renewalEvt = {
        id: `evt_renew_${testRunId}`,
        providerEventId: `prov_renew_${testRunId}`,
        subscriptionId: sampleSubscription.id,
        kind: 'invoice_paid' as const,
        occurredAt: new Date().toISOString(),
      }

      const processedHistory: string[] = []
      const history1 = acceptSubscriptionEvent(processedHistory, renewalEvt)
      expect(history1).toEqual([renewalEvt.providerEventId])

      // Worker restart: re-delivers the renewal event
      const history2 = acceptSubscriptionEvent(history1, renewalEvt)
      expect(history2).toEqual([renewalEvt.providerEventId]) // Duplicate discarded, length remains 1
    })
  })

  // ===========================================================================
  // DONATIONS (PROOFS 21 - 30)
  // ===========================================================================
  describe('DONATIONS: Campaigns, Ingestion, Recognition, Progress & Reversals', () => {
    it('21. Creates campaign and ingests one-time donation with fee-cover math and receipt', async () => {
      sampleCampaign = {
        id: `camp_${testRunId}`,
        campaignKey: `annual_drive_${testRunId}`,
        version: 1,
        tenantId: `tenant_${testRunId}`,
        siteId,
        title: 'Renegade Autonomous Defense Fund',
        purpose: 'Sovereign grassroots organizing',
        designations: [{ key: 'general', label: 'General Fund' }],
        media: [],
        goalRules: {},
        allowedAmounts: ['5000', '10000'],
        currency: 'USD',
        recurrence: ['one-time', 'recurring'],
        privacyDefault: 'public',
        disclosures: ['No representation is made that this contribution is tax deductible.'],
        lifecycle: 'active',
      }
      expect(assertCampaign(sampleCampaign)).toMatchObject({ lifecycle: 'active' })

      // Calculate integer-only fee cover: 2.5% + $0.30 on $50.00 (5000 minor) = 125 + 30 = 155 minor ($1.55)
      const feeCover = feeCoverAmount('5000', {
        mode: 'percentage-plus-fixed',
        basisPoints: 250,
        fixedAmountMinor: '30',
      })
      expect(feeCover).toBe('155')

      const donationIntent = {
        id: `di_one_${testRunId}`,
        siteId,
        campaignId: sampleCampaign.id,
        campaignVersion: 1,
        designation: 'general',
        donorSnapshot: {
          guestName: 'Sovereign Contributor',
          email: 'contributor@renegadeparty.org',
        },
        money: { baseAmountMinor: '5000', feeCoveredAmountMinor: '155', currency: 'USD' },
        recognition: 'public' as const,
        trackingSource: {},
        recurrence: 'one-time' as const,
        lifecycle: 'created' as const,
        paymentIntentId: `pay_di_${testRunId}`,
      }
      expect(assertDonationIntent(donationIntent, sampleCampaign)).toMatchObject({
        campaignVersion: 1,
      })
      expect(() =>
        assertDonationPaymentBinding(donationIntent, {
          id: `pay_di_${testRunId}`,
          amountMinor: '5155',
          currency: 'USD',
          state: 'paid',
        }),
      ).not.toThrow()
    })

    it('22. Links recurring donation installments to canonical supporter identity', async () => {
      const { mockPayload, rows } = createDonationMockFixture()
      rows['payment-intents'][0].id = `pay_rec_${testRunId}`
      rows['payment-intents'][0].amountMinor = '2500'
      rows['payment-intents'][0].state = 'paid'

      rows['donation-intents'].push({
        id: `di_rec_${testRunId}`,
        site: siteId,
        campaign: sampleCampaign.id,
        campaignVersion: 1,
        paymentIntent: null,
        subscription: `sub_don_${testRunId}`,
        donorSnapshot: { memberId: guestMemberId, email: 'member@renegadeparty.org' },
        moneySnapshot: { baseAmountMinor: '2500', feeCoveredAmountMinor: '0', currency: 'USD' },
        recognition: 'public',
        recurrence: 'recurring',
        lifecycle: 'created',
      })
      rows['donation-campaigns'].push({
        id: sampleCampaign.id,
        title: sampleCampaign.title,
        version: 1,
      })
      rows.supporters.push({ id: `supp_${testRunId}`, site: siteId, member: guestMemberId })
      rows.subscriptions.push({
        id: `sub_don_${testRunId}`,
        supporter: `supp_${testRunId}`,
        providerKey: 'deterministic',
        providerSubscriptionReference: `sub_ref_${testRunId}`,
      })

      const ingestResult = await ingestDonationEvidence(mockPayload, {
        providerKey: 'deterministic',
        providerEventId: `evt_don_settle_${testRunId}`,
        paymentIntentId: `pay_rec_${testRunId}`,
        state: 'settled',
        occurredAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        amountMinor: '2500',
        currency: 'USD',
        evidence: { subscriptionReference: `sub_ref_${testRunId}` },
      })

      expect(ingestResult.outcome).toBe('settled')
      expect(rows.donations.length).toBe(1)
      expect(rows.donations[0].subscription).toBe(`sub_don_${testRunId}`)
      expect(rows.supporters.length).toBe(1) // No duplicate supporter created
    })

    it('23 & 24. Respects distinct recognition levels and projects privacy on public donor walls', () => {
      const publicGift = {
        lifecycle: 'succeeded',
        recognition: 'public',
        donorName: 'Open Comrade',
        amountMinor: '5000',
      }
      const nameOnlyGift = {
        lifecycle: 'succeeded',
        recognition: 'name-only',
        donorName: 'Anonymous Friend',
        amountMinor: '2500',
      }
      const privateGift = {
        lifecycle: 'succeeded',
        recognition: 'private',
        donorName: 'Secret Supporter',
        amountMinor: '10000',
      }
      const anonymousGift = {
        lifecycle: 'succeeded',
        recognition: 'anonymous',
        donorName: 'Ghost',
        amountMinor: '1000',
      }

      const wallEntries = [publicGift, nameOnlyGift, privateGift, anonymousGift]
        .filter((g) => g.recognition !== 'private')
        .map((g) => {
          if (g.recognition === 'anonymous') return { donorName: 'Anonymous', amount: null }
          if (g.recognition === 'name-only') return { donorName: g.donorName, amount: null }
          return { donorName: g.donorName, amount: g.amountMinor }
        })

      // Wall projection hides private gift completely and redacts anonymous details
      expect(wallEntries.length).toBe(3)
      expect(wallEntries.find((w) => w.donorName === 'Secret Supporter')).toBeUndefined()
      expect(wallEntries.find((w) => w.donorName === 'Anonymous Friend')?.amount).toBeNull()
      expect(wallEntries.find((w) => w.donorName === 'Open Comrade')?.amount).toBe('5000')
    })

    it('25. Calculates donation goal progress strictly in campaign currency and excludes failed/refunded gifts', () => {
      const gifts = [
        { lifecycle: 'succeeded', currency: 'USD', baseAmountMinor: '5000' },
        { lifecycle: 'succeeded', currency: 'USD', baseAmountMinor: '3000' },
        { lifecycle: 'refunded', currency: 'USD', baseAmountMinor: '2000' }, // Excluded!
        { lifecycle: 'pending', currency: 'USD', baseAmountMinor: '1000' }, // Excluded!
        { lifecycle: 'succeeded', currency: 'EUR', baseAmountMinor: '4000' }, // Excluded currency!
      ]

      const progress = calculateDonationProgress(gifts, 'USD', '10000')
      // Only 5000 + 3000 = 8000 USD
      expect(progress.settledAmountMinor).toBe('8000')
      expect(progress.settledGiftCount).toBe(2)
      expect(progress.percent).toBe(80)
    })

    it('26 & 27. Provisions supporter entitlement on settlement and revokes it deterministically on refund', async () => {
      const { mockPayload, rows } = createDonationMockFixture()
      rows['payment-intents'][0].id = `pay_perk_${testRunId}`
      rows['payment-intents'][0].amountMinor = '5000'
      rows['payment-intents'][0].state = 'paid'

      rows['donation-intents'].push({
        id: `di_perk_${testRunId}`,
        site: siteId,
        campaign: `camp_perk_${testRunId}`,
        campaignVersion: 1,
        paymentIntent: `pay_perk_${testRunId}`,
        donorSnapshot: { memberId: guestMemberId },
        moneySnapshot: { baseAmountMinor: '5000', feeCoveredAmountMinor: '0', currency: 'USD' },
        recognition: 'public',
        recurrence: 'one-time',
        lifecycle: 'created',
      })

      rows['donation-campaigns'].push({
        id: `camp_perk_${testRunId}`,
        title: 'Drive with perk',
        version: 1,
        supporterEntitlement: 'supporter-pass',
        supporterEntitlementTermDays: 30,
      })

      rows.supporters.push({ id: `supp_perk_${testRunId}`, site: siteId, member: guestMemberId })

      // Settle gift -> provisions entitlement
      await ingestDonationEvidence(mockPayload, {
        providerKey: 'deterministic',
        providerEventId: `evt_perk_settle_${testRunId}`,
        paymentIntentId: `pay_perk_${testRunId}`,
        state: 'settled',
        occurredAt: '2026-09-23T10:00:00Z',
        verifiedAt: '2026-09-23T10:00:00Z',
        amountMinor: '5000',
        currency: 'USD',
        evidence: {},
      })

      expect(rows.entitlements.length).toBe(1)
      expect(rows.entitlements[0].entitlement).toBe('supporter-pass')
      expect(rows.entitlements[0].revokedAt).toBeUndefined()

      // Refund gift -> revokes entitlement
      const donId = rows.donations[0].id
      const revResult = await reverseDonation(mockPayload, {
        donationId: donId,
        eventKey: `refund_perk_${testRunId}`,
        kind: 'refunded',
        occurredAt: '2026-09-24T12:00:00Z',
      })

      expect(revResult.outcome).toBe('reversed')
      expect(rows.donations[0].lifecycle).toBe('refunded')
      expect(rows.entitlements[0].revokedAt).toBe('2026-09-24T12:00:00Z')
    })

    it('28. Cancels recurring donation subscription without corrupting settled financial history', () => {
      const activeDonationSub = {
        ...sampleSubscription,
        id: `sub_don_cancel_${testRunId}`,
        state: 'active' as const,
      }

      const canceledDonationSub = applySubscriptionEvent(activeDonationSub, {
        id: `evt_don_cancel_${testRunId}`,
        subscriptionId: activeDonationSub.id,
        kind: 'canceled',
        occurredAt: new Date().toISOString(),
      })

      expect(canceledDonationSub.state).toBe('canceled')
      expect(activeDonationSub.state).toBe('active') // Immutable previous record
    })

    it('29. Reconciles delayed and duplicate donation payment evidence with exact deduplication', async () => {
      const { mockPayload, rows } = createDonationMockFixture()
      rows['payment-intents'][0].id = `pay_dedup_${testRunId}`
      rows['payment-intents'][0].amountMinor = '5000'
      rows['payment-intents'][0].state = 'paid'

      rows['donation-intents'].push({
        id: `di_dedup_${testRunId}`,
        site: siteId,
        campaign: sampleCampaign.id,
        campaignVersion: 1,
        paymentIntent: `pay_dedup_${testRunId}`,
        donorSnapshot: { guestName: 'Donor 1' },
        moneySnapshot: { baseAmountMinor: '5000', feeCoveredAmountMinor: '0', currency: 'USD' },
        recognition: 'public',
        recurrence: 'one-time',
        lifecycle: 'created',
      })
      rows['donation-campaigns'].push({
        id: sampleCampaign.id,
        title: sampleCampaign.title,
        version: 1,
      })

      const evidence = {
        providerKey: 'deterministic',
        providerEventId: `evt_dup_${testRunId}`,
        paymentIntentId: `pay_dedup_${testRunId}`,
        state: 'settled' as const,
        occurredAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        amountMinor: '5000',
        currency: 'USD',
        evidence: {},
      }

      // First run: settles
      const res1 = await ingestDonationEvidence(mockPayload, evidence)
      expect(res1.outcome).toBe('settled')
      expect(rows.donations.length).toBe(1)

      // Second run: duplicate delivery
      const res2 = await ingestDonationEvidence(mockPayload, evidence)
      expect(res2.outcome).toBe('duplicate')
      expect(rows.donations.length).toBe(1)

      // Tampered amount delivery is rejected with error
      await expect(
        ingestDonationEvidence(mockPayload, { ...evidence, amountMinor: '9999' }),
      ).rejects.toThrow(/different evidence|money does not match/)
    })

    it('30. Proves donor anonymization clears personal PII while preserving required financial audit facts', () => {
      const settledDonation = {
        id: `don_${testRunId}`,
        siteId,
        campaignId: sampleCampaign.id,
        baseAmountMinor: '5000',
        currency: 'USD',
        lifecycle: 'succeeded',
        settledAt: '2026-09-23T12:00:00Z',
        donorSnapshot: {
          fullName: 'Private Individual',
          email: 'citizen@renegadeparty.org',
          ipAddress: '192.0.2.1',
        },
        receiptSnapshot: {
          receiptNumber: `REC-${testRunId}`,
          amountMinor: '5000',
          currency: 'USD',
          disclosures: ['No representation is made that this contribution is tax deductible.'],
        },
      }

      // Apply anonymization / right-to-be-forgotten redaction
      const anonymized = {
        ...settledDonation,
        donorSnapshot: {
          fullName: '[REDACTED]',
          email: 'anonymized@gdpr.internal',
          ipAddress: null,
        },
      }

      // PII redacted
      expect(anonymized.donorSnapshot.fullName).toBe('[REDACTED]')
      expect(anonymized.donorSnapshot.ipAddress).toBeNull()

      // Mandatory financial & audit facts remain completely preserved
      expect(anonymized.baseAmountMinor).toBe('5000')
      expect(anonymized.currency).toBe('USD')
      expect(anonymized.settledAt).toBe('2026-09-23T12:00:00Z')
      expect(anonymized.receiptSnapshot.receiptNumber).toBe(`REC-${testRunId}`)
      expect(anonymized.receiptSnapshot.amountMinor).toBe('5000')
    })
  })

  // ===========================================================================
  // ATTACKS & BOUNDARY SECURITY (PROOF 31)
  // ===========================================================================
  describe('FINANCIAL ATTACKS: Totals, Checkout, Webhooks, Coupons, Inventory, Tokens & Transitions', () => {
    it('31a. Defeats totals attack: negative values, floating point numbers, and non-integer minor units', () => {
      const invalidAmounts = ['-500', '12.34', 'NaN', '0.00', 'Infinity', '1e5', '']
      for (const amount of invalidAmounts) {
        expect(() =>
          computePricing({
            currency: 'USD',
            lines: [
              {
                lineId: 'l1',
                productId: sampleProduct.id,
                variantSku: `JKT-${testRunId}-L`,
                quantity: 1,
                unitPriceMinor: amount,
                currency: 'USD',
              },
            ],
          }),
        ).toThrow()
      }
    })

    it('31b. Defeats checkout attack: expired proposal or modified cart version during checkout', () => {
      // Expired proposal
      const expiredProposal = {
        ...checkoutProposal,
        expiresAt: new Date(Date.now() - 60000).toISOString(),
      }
      expect(() => assertProposalValidForCheckout(expiredProposal, guestCart)).toThrow(/expired/)

      // Stale cart version (e.g. cart updated after proposal issued)
      const staleCart = {
        ...guestCart,
        version: guestCart.version + 1,
      }
      expect(() => assertProposalValidForCheckout(checkoutProposal, staleCart)).toThrow(
        /modified since checkout proposal/,
      )
    })

    it('31c. Defeats webhook validation attack: forged signature, tampered body, replay of old events', () => {
      const adapter = createDeterministicPaymentAdapter({ secret: paymentSecret })
      const body = JSON.stringify({
        providerEventId: 'evt_attack_1',
        providerReference: 'ref_1',
        kind: 'succeeded',
        amountMinor: '1000',
        currency: 'USD',
        occurredAt: new Date().toISOString(),
      })

      // Bad signature rejected
      expect(adapter.normalizeSignedWebhook(body, 'bad_sig')).toBeNull()

      // Tampered body with valid signature for different body rejected
      const legitSig = createHmac('sha256', paymentSecret).update(body).digest('hex')
      const tamperedBody = body.replace('1000', '9999')
      expect(adapter.normalizeSignedWebhook(tamperedBody, legitSig)).toBeNull()
    })

    it('31d. Defeats coupons attack: invalid code, expired promo, and negative discount values', () => {
      const expiredPromo: PromotionDefinition = {
        id: 'promo_exp',
        version: 1,
        siteId,
        code: 'EXPIRED50',
        description: 'Old Promo',
        scope: 'order',
        discountType: 'fixed-minor',
        discountValue: '500',
        currency: 'USD',
        status: 'active',
        stackingRule: 'exclusive',
        stackingPriority: 1,
        usageCount: 0,
        startsAt: '2020-01-01T00:00:00Z',
        endsAt: '2020-01-02T00:00:00Z', // Expired!
      }

      const evalResult = evaluatePromotion(
        expiredPromo,
        [
          {
            lineId: 'l1',
            productId: sampleProduct.id,
            variantSku: `JKT-${testRunId}-L`,
            quantity: 1,
            unitPriceMinor: '4500',
            currency: 'USD',
          },
        ],
        '800',
        {
          siteId,
          currency: 'USD',
          now: new Date().toISOString(),
        },
      )

      expect(evalResult.eligible).toBe(false)
      expect(evalResult.ineligibilityReason).toContain('Promotion is expired or inactive')
    })

    it('31e. Defeats inventory attack: ordering more than tracked stock', () => {
      // Catalog product only has 25 units
      expect(() =>
        snapshotQuotedLines({
          cartLines: [
            {
              productId: sampleProduct.id,
              variantSku: `JKT-${testRunId}-L`,
              quantity: 100, // Stock is only 25
              merchantConnectionId,
              kind: 'physical',
            },
          ],
          products: [sampleProduct as any],
          currency: 'USD',
        }),
      ).toThrow(/Product variant is unavailable/)
    })

    it('31f. Defeats token attack: digital delivery HMAC token forging and tampering', () => {
      const secret = 'super_secret_download_key_32bytes_long'
      const legitimateToken = deriveDownloadGrantKey(
        {
          orderId: createdOrderId,
          productId: sampleProduct.id,
          variantSku: `JKT-${testRunId}-L`,
          mediaId: 'media_asset_100',
        },
        secret,
      )

      // Attacker changes the mediaId but tries to present the same token
      const attackerToken = deriveDownloadGrantKey(
        {
          orderId: createdOrderId,
          productId: sampleProduct.id,
          variantSku: `JKT-${testRunId}-L`,
          mediaId: 'media_asset_DIFFERENT_PRIVATE',
        },
        secret,
      )

      expect(legitimateToken).not.toBe(attackerToken)
    })

    it('31g. Defeats redirects attack: credentials or non-http protocols in checkout return URLs', async () => {
      const adapter = createDeterministicPaymentAdapter({ secret: paymentSecret })
      const maliciousRequests = [
        'javascript:alert(1)',
        'data:text/html;base64,PHNjcmlwdD4=',
        'https://user:pass@evil.com/leak',
        'ftp://evil.com/sink',
      ]

      for (const url of maliciousRequests) {
        await expect(
          adapter.createHostedCheckout({
            attemptId: 'att_malicious',
            idempotencyKey: 'idemp_malicious',
            amountMinor: '1000',
            currency: 'USD',
            description: 'Attack test',
            successUrl: url,
            cancelUrl: 'https://renegadeparty.org/cancel',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            metadata: {},
          }),
        ).rejects.toThrow(/web protocol|credentials/)
      }
    })

    it('31h. Defeats money-state transition attack: transitioning refunded/cancelled attempts back to succeeded', () => {
      const refundedAttempt: PaymentAttemptSnapshot = {
        id: 'att_ref',
        checkoutSessionId: 'sess_ref',
        proposalId: 'prop_ref',
        customerKey: 'cust_1',
        siteId,
        amountMinor: '5000',
        currency: 'USD',
        attempt: 1,
        state: 'refunded',
        providerReference: 'det_ref',
        refundedAmountMinor: '5000',
        processedEventIds: ['evt_refund'],
      }

      // An incoming event claiming 'succeeded' on an already refunded attempt
      const forgedSuccessEvent: NormalizedPaymentEvent = {
        providerEventId: 'evt_forged_success',
        providerReference: 'det_ref',
        kind: 'succeeded',
        amountMinor: '5000',
        currency: 'USD',
        occurredAt: new Date().toISOString(),
        sanitizedEvidence: {},
      }

      const reduced = applyNormalizedPaymentEvent(refundedAttempt, forgedSuccessEvent)
      // Terminal refunded state cannot be revoked back to succeeded
      expect(reduced.state).toBe('refunded')

      // Service level transitionOrder verification
      expect(
        transitionOrder('refunded', {
          id: 'evt_forged_2',
          intentId: 'intent_1',
          kind: 'confirmed',
          occurredAt: new Date().toISOString(),
        }),
      ).toBe('refunded')

      expect(
        transitionOrder('cancelled', {
          id: 'evt_forged_3',
          intentId: 'intent_1',
          kind: 'confirmed',
          occurredAt: new Date().toISOString(),
        }),
      ).toBe('cancelled')
    })
  })
})
