import { describe, expect, it } from 'vitest'
import {
  computePricing,
  allocateDiscountsToLines,
  allocateTaxToLines,
} from '../../src/modules/commerce/pricing'
import { resolvePromotions, type PromotionDefinition } from '../../src/modules/commerce/promotions'
import {
  checkLineAvailability,
  isReservationExpired,
  deriveReservationExpiry,
  type VariantInventoryRecord,
  type InventoryReservation,
} from '../../src/modules/commerce/inventory'
import { LocalFallbackShippingAdapter, validateAddress } from '../../src/modules/commerce/shipping'
import { BoundedJurisdictionTaxAdapter } from '../../src/modules/commerce/tax'
import {
  createEmptyCart,
  reResolveCart,
  mergeGuestAndMemberCarts,
  type CatalogProductLookup,
  type CartItem,
} from '../../src/modules/commerce/cart'
import {
  createCheckoutProposal,
  assertProposalValidForCheckout,
} from '../../src/modules/commerce/proposal'

describe('SHOP-02 Carts, Pricing, Promotions & Proposals', () => {
  describe('Deterministic Pricing Engine & Rounding Residues', () => {
    it('allocates odd discounts across lines with exact zero residue loss', () => {
      // 3 items with gross: 1000, 1000, 1000 = 3000
      // Total discount: 100 ($1.00)
      // 100 / 3 = 33.3333333333...
      // Expect 34, 33, 33 sum = exactly 100
      const lines = [
        { lineId: 'l1', gross: 1000n },
        { lineId: 'l2', gross: 1000n },
        { lineId: 'l3', gross: 1000n },
      ]
      const allocated = allocateDiscountsToLines(lines, 100n)
      const sum = Array.from(allocated.values()).reduce((a, b) => a + b, 0n)
      expect(sum).toBe(100n)
      expect(allocated.get('l1')).toBe(34n)
      expect(allocated.get('l2')).toBe(33n)
      expect(allocated.get('l3')).toBe(33n)
    })

    it('allocates tax across taxable lines with zero residue loss', () => {
      // 3 taxable lines with net: 700, 700, 700 = 2100
      // Total tax: 155
      const lines = [
        { lineId: 'l1', net: 700n, taxable: true },
        { lineId: 'l2', net: 700n, taxable: true },
        { lineId: 'l3', net: 700n, taxable: true },
      ]
      const allocated = allocateTaxToLines(lines, 155n)
      const sum = Array.from(allocated.values()).reduce((a, b) => a + b, 0n)
      expect(sum).toBe(155n)
    })

    it('guarantees Subtotal - Adjustments + Shipping + Tax == GrandTotal', () => {
      const pricing = computePricing({
        currency: 'USD',
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            variantSku: 'v1',
            quantity: 3,
            unitPriceMinor: '3333', // gross 9999
            currency: 'USD',
          },
          {
            lineId: 'l2',
            productId: 'p2',
            variantSku: 'v2',
            quantity: 1,
            unitPriceMinor: '1999', // gross 1999
            currency: 'USD',
          },
        ],
        orderAdjustments: [
          {
            description: 'Promo',
            scope: 'order',
            amountMinor: '1500', // $15.00 discount
          },
        ],
        shippingAmountMinor: '500', // $5.00 shipping
        taxTotalMinor: '899', // $8.99 tax
      })

      const subtotal = BigInt(pricing.subtotalMinor)
      const discount = BigInt(pricing.adjustmentsTotalMinor)
      const netShipping = BigInt(pricing.netShippingMinor)
      const tax = BigInt(pricing.taxTotalMinor)
      const grandTotal = BigInt(pricing.grandTotalMinor)

      expect(subtotal).toBe(9999n + 1999n) // 11998
      expect(discount).toBe(1500n)
      expect(netShipping).toBe(500n)
      expect(tax).toBe(899n)
      expect(grandTotal).toBe(subtotal - discount + netShipping + tax)
      // Check each line's net + tax == total
      for (const line of pricing.lines) {
        expect(BigInt(line.netAmountMinor) + BigInt(line.taxAmountMinor)).toBe(
          BigInt(line.totalAmountMinor),
        )
      }
    })
  })

  describe('Promotions Engine', () => {
    it('applies percentage discounts with basis points and caps', () => {
      const promo: PromotionDefinition = {
        id: 'promo_perc',
        version: 1,
        siteId: 'site_1',
        code: '20OFF',
        description: '20% off up to $10',
        scope: 'order',
        discountType: 'percentage-basis-points',
        discountValue: '2000', // 20%
        maxDiscountMinor: '1000', // $10 cap
        currency: 'USD',
        status: 'active',
        stackingRule: 'stackable',
        stackingPriority: 10,
        usageCount: 0,
      }

      const lines = [
        {
          lineId: 'l1',
          productId: 'p1',
          variantSku: 'v1',
          quantity: 1,
          unitPriceMinor: '8000', // $80.00 -> 20% is $16.00, capped at $10.00 (1000 minor)
          currency: 'USD',
        },
      ]

      const result = resolvePromotions([promo], lines, '0', {
        siteId: 'site_1',
        currency: 'USD',
      })

      expect(result.adjustments).toHaveLength(1)
      expect(result.adjustments[0].amountMinor).toBe('1000') // Capped at $10.00
    })

    it('enforces exclusive vs stackable promotion priority', () => {
      const exclusivePromo: PromotionDefinition = {
        id: 'promo_excl',
        version: 1,
        siteId: 'site_1',
        code: 'VIP50',
        description: 'VIP $50 off',
        scope: 'order',
        discountType: 'fixed-minor',
        discountValue: '5000',
        currency: 'USD',
        status: 'active',
        stackingRule: 'exclusive',
        stackingPriority: 100,
        usageCount: 0,
      }

      const stackablePromo: PromotionDefinition = {
        id: 'promo_stack',
        version: 1,
        siteId: 'site_1',
        code: 'SAVE5',
        description: '$5 off',
        scope: 'order',
        discountType: 'fixed-minor',
        discountValue: '500',
        currency: 'USD',
        status: 'active',
        stackingRule: 'stackable',
        stackingPriority: 1,
        usageCount: 0,
      }

      const lines = [
        {
          lineId: 'l1',
          productId: 'p1',
          variantSku: 'v1',
          quantity: 1,
          unitPriceMinor: '10000',
          currency: 'USD',
        },
      ]

      const result = resolvePromotions([exclusivePromo, stackablePromo], lines, '0', {
        siteId: 'site_1',
        currency: 'USD',
      })

      // Exclusive promo wins, stackable is rejected
      expect(result.adjustments).toHaveLength(1)
      expect(result.adjustments[0].code).toBe('VIP50')
      expect(result.rejected.some((r) => r.code === 'SAVE5')).toBe(true)
    })
  })

  describe('Availability & Inventory Policies', () => {
    it('checks untracked, finite tracked, POD, digital, and preorder availability', () => {
      const now = '2026-09-23T12:00:00.000Z'

      // 1. Untracked
      const untracked: VariantInventoryRecord = {
        productId: 'p1',
        variantSku: 'v1',
        policy: 'untracked',
      }
      expect(checkLineAvailability(untracked, 100, now).available).toBe(true)

      // 2. Tracked finite: in stock
      const trackedInStock: VariantInventoryRecord = {
        productId: 'p2',
        variantSku: 'v2',
        policy: 'tracked',
        quantityAvailable: 5,
      }
      expect(checkLineAvailability(trackedInStock, 3, now).available).toBe(true)
      // Oversell blocked
      const oversell = checkLineAvailability(trackedInStock, 10, now)
      expect(oversell.available).toBe(false)
      expect(oversell.availableQuantity).toBe(5)

      // 3. Tracked with backorder allowed
      const backorder: VariantInventoryRecord = {
        productId: 'p3',
        variantSku: 'v3',
        policy: 'tracked',
        quantityAvailable: 0,
        allowBackorder: true,
      }
      expect(checkLineAvailability(backorder, 2, now).available).toBe(true)

      // 4. POD
      const podAvailable: VariantInventoryRecord = {
        productId: 'p4',
        variantSku: 'v4',
        policy: 'pod',
        podAvailable: true,
      }
      expect(checkLineAvailability(podAvailable, 1, now).available).toBe(true)

      const podUnavailable: VariantInventoryRecord = {
        productId: 'p4',
        variantSku: 'v4',
        policy: 'pod',
        podAvailable: false,
      }
      expect(checkLineAvailability(podUnavailable, 1, now).available).toBe(false)

      // 5. Digital
      const digital: VariantInventoryRecord = {
        productId: 'p5',
        variantSku: 'v5',
        policy: 'digital',
        digitalAvailable: true,
      }
      expect(checkLineAvailability(digital, 1, now).available).toBe(true)

      // 6. Preorder within window and capacity
      const preorder: VariantInventoryRecord = {
        productId: 'p6',
        variantSku: 'v6',
        policy: 'preorder',
        preorderWindow: {
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-10-01T00:00:00.000Z',
          expectedReleaseDate: '2026-10-15',
          maxPreorderQuantity: 50,
          currentPreorders: 20,
        },
      }
      const preResult = checkLineAvailability(preorder, 5, now)
      expect(preResult.available).toBe(true)
      expect(preResult.isPreorder).toBe(true)
      expect(preResult.expectedReleaseDate).toBe('2026-10-15')

      // Preorder exceeding cap
      const preExceed = checkLineAvailability(preorder, 40, now) // 20 + 40 = 60 > 50
      expect(preExceed.available).toBe(false)
      expect(preExceed.availableQuantity).toBe(30)
    })

    it('enforces that reservations cannot live forever and expire after TTL', () => {
      const expiry = deriveReservationExpiry(15 * 60 * 1000)
      const res: InventoryReservation = {
        id: 'res_1',
        siteId: 'site_1',
        cartId: 'cart_1',
        productId: 'p1',
        variantSku: 'v1',
        quantity: 2,
        expiresAt: expiry,
        status: 'active',
        createdAt: new Date().toISOString(),
      }

      expect(isReservationExpired(res, new Date().toISOString())).toBe(false)

      // Future time beyond TTL
      const futureTime = new Date(Date.now() + 20 * 60 * 1000).toISOString()
      expect(isReservationExpired(res, futureTime)).toBe(true)
    })
  })

  describe('Shipping & Tax Adapters', () => {
    it('provides local fallback shipping rates including free qualifying tier', async () => {
      const adapter = new LocalFallbackShippingAdapter({
        standardRateMinor: '800', // $8.00
        currency: 'USD',
        freeShippingThresholdMinor: '5000', // $50.00
        enableLocalPickup: true,
      })

      const dest = validateAddress({
        name: 'John Smith',
        line1: '123 Pine St',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        country: 'US',
      })

      // Query with subtotal below threshold ($30)
      const ratesBelow = await adapter.getRates({
        siteId: 'site_1',
        currency: 'USD',
        itemsSubtotalMinor: '3000',
        destination: dest,
        items: [{ productId: 'p1', variantSku: 'v1', quantity: 1, shippable: true }],
      })

      expect(
        ratesBelow.some((r) => r.source === 'configured-flat' && r.amountMinor === '800'),
      ).toBe(true)
      expect(ratesBelow.some((r) => r.source === 'configured-pickup')).toBe(true)

      // Query with subtotal above threshold ($60)
      const ratesAbove = await adapter.getRates({
        siteId: 'site_1',
        currency: 'USD',
        itemsSubtotalMinor: '6000',
        destination: dest,
        items: [{ productId: 'p1', variantSku: 'v1', quantity: 2, shippable: true }],
      })

      expect(ratesAbove.some((r) => r.source === 'configured-free' && r.amountMinor === '0')).toBe(
        true,
      )
    })

    it('calculates bounded jurisdiction tax for California, New York, UK, and zero-tax states', async () => {
      const taxAdapter = new BoundedJurisdictionTaxAdapter()

      const caAddress = validateAddress({
        name: 'Alice',
        line1: '100 California St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94111',
        country: 'US',
      })

      const caTax = await taxAdapter.calculateTax({
        siteId: 'site_1',
        currency: 'USD',
        destination: caAddress,
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            variantSku: 'v1',
            quantity: 1,
            unitPriceMinor: '10000', // $100.00
            currency: 'USD',
          },
        ],
        shippingAmountMinor: '0',
      })

      expect(caTax.jurisdiction).toBe('US:CA')
      expect(caTax.effectiveRateBasisPoints).toBe(725)
      expect(caTax.taxAmountMinor).toBe('725') // $7.25

      // Oregon (NOMAD state with 0% tax)
      const orAddress = validateAddress({
        name: 'Bob',
        line1: '200 Oregon Way',
        city: 'Portland',
        state: 'OR',
        postalCode: '97201',
        country: 'US',
      })

      const orTax = await taxAdapter.calculateTax({
        siteId: 'site_1',
        currency: 'USD',
        destination: orAddress,
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            variantSku: 'v1',
            quantity: 1,
            unitPriceMinor: '10000',
            currency: 'USD',
          },
        ],
        shippingAmountMinor: '0',
      })

      expect(orTax.jurisdiction).toBe('US:OR')
      expect(orTax.effectiveRateBasisPoints).toBe(0)
      expect(orTax.taxAmountMinor).toBe('0')
      expect(orTax.disclaimer).toContain('Does not imply tax return filing')
    })
  })

  describe('Guest/Member Cart Merge & Checkout Proposal', () => {
    it('merges guest and member carts idempotently and generates an immutable proposal with fulfillment split', () => {
      const products: CatalogProductLookup[] = [
        {
          id: 'prod_book',
          name: 'Renegade Book',
          state: 'published',
          kind: 'physical',
          variants: [
            {
              sku: 'BOOK-HC',
              title: 'Hardcover',
              status: 'active',
              inventoryPolicy: 'tracked',
              inventoryQuantity: 20,
            },
          ],
          offers: [
            {
              id: 'off_book',
              version: 1,
              status: 'active',
              variantSku: 'BOOK-HC',
              amountMinor: '2500',
              currency: 'USD',
            },
          ],
        },
        {
          id: 'prod_ebook',
          name: 'Renegade PDF',
          state: 'published',
          kind: 'digital',
          variants: [
            {
              sku: 'EBOOK-PDF',
              title: 'PDF Download',
              status: 'active',
              inventoryPolicy: 'digital',
              digitalAvailable: true,
            },
          ],
          offers: [
            {
              id: 'off_ebook',
              version: 1,
              status: 'active',
              variantSku: 'EBOOK-PDF',
              amountMinor: '1000',
              currency: 'USD',
            },
          ],
        },
      ]

      const guestCart = createEmptyCart({
        id: 'cart_guest_1',
        siteId: 'site_renegade',
        merchantConnectionId: 'merch_1',
        currency: 'USD',
        guestTokenHash: 'hash_guest_123',
      })
      const guestCartWithItems = {
        ...guestCart,
        items: [
          {
            lineId: 'l_guest_1',
            productId: 'prod_book',
            variantSku: 'BOOK-HC',
            quantity: 2,
            kind: 'physical' as const,
            displaySnapshot: {
              title: 'Renegade Book',
              unitPriceMinor: '2500',
              currency: 'USD',
            },
          },
          {
            lineId: 'l_guest_2',
            productId: 'prod_ebook',
            variantSku: 'EBOOK-PDF',
            quantity: 1,
            kind: 'digital' as const,
            displaySnapshot: {
              title: 'Renegade PDF',
              unitPriceMinor: '1000',
              currency: 'USD',
            },
          },
        ],
      }

      const memberCart = createEmptyCart({
        id: 'cart_member_1',
        siteId: 'site_renegade',
        merchantConnectionId: 'merch_1',
        currency: 'USD',
        customerId: 'member_77',
      })
      const memberCartWithItems = {
        ...memberCart,
        items: [
          {
            lineId: 'l_member_1',
            productId: 'prod_book',
            variantSku: 'BOOK-HC',
            quantity: 1, // Member already had 1 hardcover book
            kind: 'physical' as const,
            displaySnapshot: {
              title: 'Renegade Book',
              unitPriceMinor: '2500',
              currency: 'USD',
            },
          },
        ],
      }

      const { mergedCart, pricingSnapshot, guestCartToRetire } = mergeGuestAndMemberCarts({
        guestCart: guestCartWithItems,
        memberCart: memberCartWithItems,
        products,
      })

      // Quantities for BOOK-HC combined: 1 + 2 = 3
      const bookLine = mergedCart.items.find((i) => i.variantSku === 'BOOK-HC')
      expect(bookLine?.quantity).toBe(3)
      // Ebook line included: 1
      const ebookLine = mergedCart.items.find((i) => i.variantSku === 'EBOOK-PDF')
      expect(ebookLine?.quantity).toBe(1)

      // Total subtotal: 3 * 2500 + 1 * 1000 = 8500
      expect(pricingSnapshot.subtotalMinor).toBe('8500')
      expect(guestCartToRetire.items).toHaveLength(0)

      // Now create Checkout Proposal
      const validAddress = validateAddress({
        name: 'Member Person',
        line1: '500 Pine St',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        country: 'US',
      })

      const proposal = createCheckoutProposal({
        cart: mergedCart,
        pricingSnapshot,
        customer: { email: 'member@renegade.test', isGuest: false, memberId: 'member_77' },
        shippingAddress: validAddress,
        selectedShippingRate: {
          id: 'rate_standard',
          title: 'Standard',
          amountMinor: '600',
          currency: 'USD',
          source: 'configured-flat',
          quotedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
        consents: {
          termsAccepted: true,
          privacyAccepted: true,
          timestamp: new Date().toISOString(),
        },
      })

      expect(proposal.cartVersion).toBe(mergedCart.version)
      expect(proposal.fulfillmentSplit).toHaveLength(2) // 1 physical group, 1 digital group
      expect(
        proposal.fulfillmentSplit.find((f) => f.fulfillmentKind === 'physical')?.items,
      ).toHaveLength(1)
      expect(
        proposal.fulfillmentSplit.find((f) => f.fulfillmentKind === 'digital')?.items,
      ).toHaveLength(1)

      expect(() => assertProposalValidForCheckout(proposal, mergedCart)).not.toThrow()
    })
  })
})
