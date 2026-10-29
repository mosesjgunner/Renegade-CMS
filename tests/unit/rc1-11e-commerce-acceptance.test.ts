import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { computePricing } from '../../src/modules/commerce/pricing'
import { resolvePromotions, type PromotionDefinition } from '../../src/modules/commerce/promotions'
import {
  applyNormalizedPaymentEvent,
  checkoutBindingKey,
  financeDashboardSummary,
  previewRefund,
  receiptMessageSnapshot,
  type PaymentAttemptSnapshot,
} from '../../src/modules/commerce/payment-operations'
import {
  createDeterministicPaymentAdapter,
  createStripeTestAdapter,
  type NormalizedPaymentEvent,
} from '../../src/modules/commerce/payment-provider'
import {
  assertDigitalAssetsReady,
  assertDigitalDeliveryConfigured,
  deliveryGrantAvailable,
  revokeOrderDigitalAccess,
} from '../../src/modules/commerce/digital-delivery'
import {
  deriveDownloadGrantKey,
  finalizeVerifiedOrder,
  inventoryAdjustmentsForOrder,
} from '../../src/modules/commerce/service'
import { abandonCheckoutTask, recoverStaleCommerceJobs } from '../../src/modules/commerce/tasks'

const baseAttempt = (overrides: Partial<PaymentAttemptSnapshot> = {}): PaymentAttemptSnapshot => ({
  id: 'attempt-11e-1',
  checkoutSessionId: 'session-11e',
  proposalId: 'proposal-11e',
  customerKey: 'customer-11e',
  siteId: 'site-alpha',
  amountMinor: '2500',
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
  providerEventId: 'evt-11e-1',
  providerReference: 'det_cs_0123456789abcdef01234567',
  providerPaymentReference: 'det_pi_0123456789abcdef01234567',
  kind: 'succeeded',
  amountMinor: '2500',
  currency: 'USD',
  occurredAt: '2026-10-28T00:00:00.000Z',
  sequence: 10,
  sanitizedEvidence: { attemptId: 'attempt-11e-1' },
  ...overrides,
})

describe('RC1 11E inventory, retry, digital delivery, refunds and Commerce Command Center', () => {
  it('evaluates stackable order + shipping coupons, enforces usageLimitTotal, and preserves exact integer minor math', () => {
    const orderPromo: PromotionDefinition = {
      id: 'promo-order-500',
      version: 1,
      siteId: 'site-alpha',
      code: 'SAVE5',
      description: '$5 off order',
      scope: 'order',
      discountType: 'fixed-minor',
      discountValue: '500',
      currency: 'USD',
      status: 'active',
      stackingRule: 'stackable',
      stackingPriority: 10,
      usageLimitTotal: 1,
      usageCount: 0,
    }
    const shipPromo: PromotionDefinition = {
      id: 'promo-ship-free',
      version: 1,
      siteId: 'site-alpha',
      code: 'FREESHIP',
      description: 'Free shipping',
      scope: 'shipping',
      discountType: 'free-shipping',
      discountValue: '0',
      currency: 'USD',
      status: 'active',
      stackingRule: 'stackable',
      stackingPriority: 5,
      usageCount: 0,
    }
    const lines = [
      {
        lineId: 'l1',
        productId: 'prod-1',
        variantSku: 'SKU-1',
        quantity: 1,
        unitPriceMinor: '3000',
        currency: 'USD',
      },
    ]

    const firstEval = resolvePromotions([orderPromo, shipPromo], lines, '500', {
      siteId: 'site-alpha',
      currency: 'USD',
    })
    expect(firstEval.appliedPromotions.map((p) => p.code)).toEqual(['SAVE5', 'FREESHIP'])

    const pricing = computePricing({
      currency: 'USD',
      lines,
      orderAdjustments: firstEval.adjustments,
      shippingAmountMinor: '500',
      shippingAdjustmentMinor: firstEval.adjustments
        .filter((a) => a.scope === 'shipping')
        .reduce((sum, a) => sum + BigInt(a.amountMinor), 0n)
        .toString(),
      taxTotalMinor: '181',
    })
    expect(pricing.subtotalMinor).toBe('3000')
    expect(pricing.adjustmentsTotalMinor).toBe('500')
    expect(pricing.shippingAmountMinor).toBe('500')
    expect(pricing.shippingAdjustmentMinor).toBe('500')
    expect(pricing.netShippingMinor).toBe('0')
    expect(pricing.taxTotalMinor).toBe('181')
    expect(pricing.grandTotalMinor).toBe('2681')

    // After order settlement increments usageCount to 1, SAVE5 reaches usageLimitTotal
    const exhaustedEval = resolvePromotions(
      [{ ...orderPromo, usageCount: 1 }, shipPromo],
      lines,
      '500',
      {
        siteId: 'site-alpha',
        currency: 'USD',
      },
    )
    expect(exhaustedEval.appliedPromotions.map((p) => p.code)).toEqual(['FREESHIP'])
    expect(exhaustedEval.rejected).toEqual([
      { code: 'SAVE5', reason: 'Promotion usage limit reached.' },
    ])
  })

  it('tracks distinct checkout binding keys across payment retry attempts and deduplicates settlement', async () => {
    const bindingAttempt1 = checkoutBindingKey({
      proposalId: 'prop-1',
      customerKey: 'cust-1',
      siteId: 'site-alpha',
      amountMinor: '2681',
      currency: 'USD',
      attempt: 1,
    })
    const bindingAttempt2 = checkoutBindingKey({
      proposalId: 'prop-1',
      customerKey: 'cust-1',
      siteId: 'site-alpha',
      amountMinor: '2681',
      currency: 'USD',
      attempt: 2,
    })
    expect(bindingAttempt1).not.toBe(bindingAttempt2)

    const attempt1Failed = applyNormalizedPaymentEvent(
      baseAttempt({ id: 'att-1', attempt: 1 }),
      baseEvent({ providerEventId: 'evt-fail-1', kind: 'failed', sequence: 1 }),
    )
    expect(attempt1Failed.state).toBe('failed')

    const attempt2Succeeded = applyNormalizedPaymentEvent(
      baseAttempt({ id: 'att-2', attempt: 2 }),
      baseEvent({ providerEventId: 'evt-succ-2', kind: 'succeeded', sequence: 2 }),
    )
    expect(attempt2Succeeded.state).toBe('succeeded')
  })

  it('increments promotion usageCount, consumes reservations, decrements inventory once, and issues digital grants idempotently on finalizeVerifiedOrder', async () => {
    const state: any = {
      order: null,
      product: {
        id: 'prod-bundle',
        name: 'Bundle',
        state: 'published',
        kind: 'digital',
        variants: [
          {
            sku: 'BUNDLE-1',
            title: 'Bundle Edition',
            status: 'active',
            inventoryPolicy: 'tracked',
            inventoryQuantity: 3,
          },
        ],
        digitalDelivery: {
          entitlement: 'entitlement:bundle-1',
          downloadLimit: 2,
          expiresAfterDays: 14,
          assets: [
            {
              mediaId: 'media-priv-1',
              rightsStatus: 'approved',
              malwareStatus: 'clean',
              publicOriginal: false,
            },
          ],
        },
      },
      promo: { id: 'promo-1', site: 'site-alpha', code: 'SAVE5', usageCount: 0 },
      reservations: [{ id: 'res-1', proposal: 'prop-1', status: 'active' }],
      proposal: {
        id: 'prop-1',
        state: 'active',
        customer: { email: 'buyer@11e.test', isGuest: false, memberId: 'member-1' },
        pricingSnapshot: {
          subtotalMinor: '3000',
          adjustmentsTotalMinor: '500',
          netShippingMinor: '0',
          taxTotalMinor: '0',
          grandTotalMinor: '2500',
          currency: 'USD',
          adjustments: [{ code: 'SAVE5', scope: 'order', amountMinor: '500' }],
        },
        fulfillmentSplit: [],
      },
      cart: { id: 'cart-1', member: 'member-1', state: 'active', items: [] },
      entitlements: [] as any[],
      grants: [] as any[],
      supporters: [] as any[],
    }

    const db: any = {
      collections: { promotions: {} },
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'orders') return { docs: state.order ? [state.order] : [] }
        if (collection === 'promotions') return { docs: [state.promo] }
        if (collection === 'entitlements') return { docs: state.entitlements }
        if (collection === 'digital-delivery-grants') return { docs: state.grants }
        if (collection === 'supporters') return { docs: state.supporters }
        if (collection === 'pod-connections') return { docs: [] }
        return { docs: [] }
      }),
      findByID: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'carts') return state.cart
        if (collection === 'checkout-proposals') return state.proposal
        if (collection === 'products') return state.product
        return null
      }),
      create: vi.fn(async ({ collection, data }: { collection: string; data: any }) => {
        if (collection === 'orders') {
          state.order = { id: 'ord-1', ...data }
          return state.order
        }
        if (collection === 'supporters') {
          const doc = { id: 'sup-1', ...data }
          state.supporters.push(doc)
          return doc
        }
        if (collection === 'entitlements') {
          const doc = { id: 'ent-1', ...data }
          state.entitlements.push(doc)
          return doc
        }
        if (collection === 'digital-delivery-grants') {
          const doc = { id: 'grant-1', ...data }
          state.grants.push(doc)
          return doc
        }
        return { id: 'doc-1', ...data }
      }),
      update: vi.fn(async ({ collection, data }: { collection: string; data: any }) => {
        if (collection === 'products') {
          state.product = { ...state.product, ...data }
          return state.product
        }
        if (collection === 'orders') {
          state.order = { ...state.order, ...data }
          return state.order
        }
        if (collection === 'promotions') {
          state.promo = { ...state.promo, ...data }
          return state.promo
        }
        if (collection === 'inventory-reservations') {
          state.reservations = state.reservations.map((r: any) => ({ ...r, ...data }))
          return state.reservations
        }
        if (collection === 'checkout-proposals') {
          state.proposal = { ...state.proposal, ...data }
          return state.proposal
        }
        if (collection === 'carts') {
          state.cart = { ...state.cart, ...data }
          return state.cart
        }
        return data
      }),
    }

    const input = {
      intent: {
        id: 'pi-1',
        providerKey: 'deterministic-test',
        amountMinor: '2500',
        currency: 'USD',
        orderLines: [
          {
            productId: 'prod-bundle',
            variantSku: 'BUNDLE-1',
            title: 'Bundle Edition',
            quantity: 1,
            unitAmountMinor: '3000',
            lineAmountMinor: '3000',
            currency: 'USD',
            kind: 'digital',
            entitlement: 'entitlement:bundle-1',
          },
        ],
      },
      session: {
        id: 'sess-1',
        site: 'site-alpha',
        cart: 'cart-1',
        proposal: 'prop-1',
        currency: 'USD',
        amountMinor: '2500',
      },
      merchantId: 'merch-1',
      verifiedAt: '2026-10-28T00:00:00.000Z',
    }

    const first = await finalizeVerifiedOrder(db, input)
    expect(first.replay).toBe(false)
    expect(state.product.variants[0].inventoryQuantity).toBe(2)
    expect(state.promo.usageCount).toBe(1)
    expect(state.reservations[0].status).toBe('consumed')
    expect(state.proposal.state).toBe('consumed')
    expect(state.cart.state).toBe('converted')
    expect(state.entitlements).toHaveLength(1)
    expect(state.grants).toHaveLength(1)

    // Replay of finalizeVerifiedOrder does not decrement stock or increment coupon usageCount a second time
    const replay = await finalizeVerifiedOrder(db, input)
    expect(replay.replay).toBe(true)
    expect(state.product.variants[0].inventoryQuantity).toBe(2)
    expect(state.promo.usageCount).toBe(1)
    expect(state.entitlements).toHaveLength(1)
    expect(state.grants).toHaveLength(1)
  })

  it('recovers stale processing webhook events and releases reservations on checkout abandonment', async () => {
    const updates: any[] = []
    const mockPayload: any = {
      collections: {
        'payment-webhook-events': {},
        'inventory-reservations': {},
        'checkout-proposals': {},
      },
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'payment-webhook-events') {
          return {
            docs: [{ id: 'evt-interrupted-1', processingState: 'processing' }],
          }
        }
        if (collection === 'checkout-sessions') {
          return {
            docs: [{ id: 'sess-stale-1', proposal: 'prop-stale-1', state: 'open' }],
          }
        }
        return { docs: [] }
      }),
      update: vi.fn(async (arg: any) => {
        updates.push(arg)
        return arg
      }),
      jobs: { queue: vi.fn().mockResolvedValue({ id: 'job-recovered' }) },
    }

    const recovered = await recoverStaleCommerceJobs(mockPayload, 60_000)
    expect(recovered).toBe(1)
    expect(
      updates.some(
        (u) => u.collection === 'payment-webhook-events' && u.data.processingState === 'received',
      ),
    ).toBe(true)

    await (abandonCheckoutTask.handler as any)({ req: { payload: mockPayload } })
    expect(
      updates.some((u) => u.collection === 'checkout-sessions' && u.data.state === 'abandoned'),
    ).toBe(true)
    expect(
      updates.some((u) => u.collection === 'inventory-reservations' && u.data.status === 'expired'),
    ).toBe(true)
    expect(
      updates.some((u) => u.collection === 'checkout-proposals' && u.data.state === 'expired'),
    ).toBe(true)
  })

  it('enforces digital delivery preflight, grant availability, and full-refund revocation', async () => {
    expect(() =>
      assertDigitalDeliveryConfigured(
        [{ digitalDelivery: { assets: [{ mediaId: 'm1' }] } }],
        'short',
      ),
    ).toThrow(/unavailable/)

    const grantKey = deriveDownloadGrantKey(
      {
        orderId: 'ord-11e',
        productId: 'prod-11e',
        variantSku: 'SKU-DIG',
        mediaId: 'media-11e',
      },
      'rc1-11e-delivery-secret-32-chars-minimum',
    )
    expect(grantKey).toHaveLength(43)
    const grantHash = createHash('sha256').update(grantKey).digest('hex')
    expect(grantHash).toHaveLength(64)

    expect(
      deliveryGrantAvailable({
        id: 'grant-1',
        entitlement: { startsAt: '2026-01-01T00:00:00.000Z' },
        downloadLimit: 2,
        downloadCount: 1,
      }),
    ).toBe(true)

    expect(
      deliveryGrantAvailable({
        id: 'grant-1',
        entitlement: { startsAt: '2026-01-01T00:00:00.000Z' },
        downloadLimit: 2,
        downloadCount: 2,
      }),
    ).toBe(false)

    expect(
      deliveryGrantAvailable({
        id: 'grant-1',
        entitlement: {
          startsAt: '2026-01-01T00:00:00.000Z',
          revokedAt: '2026-10-28T00:00:00.000Z',
        },
        downloadLimit: 2,
        downloadCount: 0,
      }),
    ).toBe(false)

    const revoked: any[] = []
    const revokePayload: any = {
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'entitlements') return { docs: [{ id: 'ent-revoke-1' }] }
        if (collection === 'digital-delivery-grants') return { docs: [{ id: 'grant-revoke-1' }] }
        return { docs: [] }
      }),
      update: vi.fn(async (arg: any) => {
        revoked.push(arg)
        return arg
      }),
    }
    await revokeOrderDigitalAccess(revokePayload, 'ord-11e')
    expect(revoked).toHaveLength(2)
    expect(
      revoked.some((r) => r.collection === 'digital-delivery-grants' && r.data.revokedAt),
    ).toBe(true)
    expect(revoked.some((r) => r.collection === 'entitlements' && r.data.revokedAt)).toBe(true)
  })

  it('computes currency-separated finance dashboard summaries and oldest reconciliation age without mixing currencies', () => {
    const nowMs = Date.parse('2026-10-28T12:00:00.000Z')
    const summary = financeDashboardSummary(
      [
        {
          state: 'succeeded',
          amountMinor: '2681',
          currency: 'USD',
          createdAt: '2026-10-28T11:30:00.000Z',
          reconciledAt: '2026-10-28T11:31:00.000Z',
        },
        {
          state: 'succeeded',
          amountMinor: '1900',
          currency: 'EUR',
          createdAt: '2026-10-28T11:40:00.000Z',
          reconciledAt: '2026-10-28T11:41:00.000Z',
        },
        {
          state: 'unknown',
          amountMinor: '4500',
          currency: 'USD',
          createdAt: '2026-10-28T10:00:00.000Z',
        },
      ],
      nowMs,
    )
    expect(summary.counts).toEqual({ succeeded: 2, unknown: 1 })
    expect(summary.totalsMinorByCurrency).toEqual({
      USD: { succeeded: '2681', unknown: '4500' },
      EUR: { succeeded: '1900' },
    })
    expect(summary.oldestAgeMs.unknown).toBe(2 * 3_600_000)
  })
})
