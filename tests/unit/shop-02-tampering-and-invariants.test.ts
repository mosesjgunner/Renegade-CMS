import { describe, expect, it } from 'vitest'
import {
  computePricing,
  allocateDiscountsToLines,
  allocateTaxToLines,
} from '../../src/modules/commerce/pricing'
import {
  resolvePromotions,
  evaluatePromotion,
  type PromotionDefinition,
} from '../../src/modules/commerce/promotions'
import {
  createEmptyCart,
  reResolveCart,
  mergeGuestAndMemberCarts,
  type CatalogProductLookup,
  type CartItem,
} from '../../src/modules/commerce/cart'
import { validateAddress } from '../../src/modules/commerce/shipping'
import {
  BoundedJurisdictionTaxAdapter,
  TaxCalculationUnavailableError,
} from '../../src/modules/commerce/tax'
import {
  createCheckoutProposal,
  assertProposalValidForCheckout,
} from '../../src/modules/commerce/proposal'

describe('SHOP-02 Security & Tampering Resistance', () => {
  const dummyProducts: CatalogProductLookup[] = [
    {
      id: 'prod_hat',
      name: 'Renegade Hat',
      state: 'published',
      kind: 'physical',
      variants: [
        {
          sku: 'HAT-BLK',
          title: 'Black Hat',
          status: 'active',
          inventoryPolicy: 'tracked',
          inventoryQuantity: 5,
        },
      ],
      offers: [
        {
          id: 'offer_hat_usd',
          version: 1,
          status: 'active',
          variantSku: 'HAT-BLK',
          amountMinor: '3000', // $30.00
          currency: 'USD',
          taxDisplay: 'exclusive',
        },
      ],
    },
  ]

  it('rejects client-side price tampering and re-resolves authoritative catalog price', () => {
    const cart = createEmptyCart({
      id: 'cart_1',
      siteId: 'site_alpha',
      merchantConnectionId: 'merch_1',
      currency: 'USD',
    })

    // Attacker crafts an item payload claiming unitPriceMinor is 100 ($1.00) instead of 3000 ($30.00)
    const tamperedItem: CartItem = {
      lineId: 'line_tampered',
      productId: 'prod_hat',
      variantSku: 'HAT-BLK',
      quantity: 2,
      kind: 'physical',
      displaySnapshot: {
        title: 'Renegade Hat',
        unitPriceMinor: '100', // Tampered!
        currency: 'USD',
      },
    }

    const cartWithItem = { ...cart, items: [tamperedItem] }
    const { cart: resolvedCart, pricingSnapshot } = reResolveCart({
      cart: cartWithItem,
      products: dummyProducts,
    })

    // The server overwrites with the authoritative price of 3000
    expect(resolvedCart.items[0].displaySnapshot.unitPriceMinor).toBe('3000')
    expect(pricingSnapshot.subtotalMinor).toBe('6000') // 2 * 3000
    expect(resolvedCart.reconciliationNotes.some((n) => n.code === 'price-changed')).toBe(true)
  })

  it('rejects currency tampering across lines and cart', () => {
    expect(() =>
      computePricing({
        currency: 'USD',
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            variantSku: 'v1',
            quantity: 1,
            unitPriceMinor: '1000',
            currency: 'EUR', // Tampered currency!
          },
        ],
      }),
    ).toThrow('Line currency mismatch')
  })

  it('rejects invalid quantities (negative, zero, float, overflow)', () => {
    const testQuantities = [0, -1, -100, 1.5, NaN, Infinity]
    for (const q of testQuantities) {
      expect(() =>
        computePricing({
          currency: 'USD',
          lines: [
            {
              lineId: 'l1',
              productId: 'p1',
              variantSku: 'v1',
              quantity: q,
              unitPriceMinor: '1000',
              currency: 'USD',
            },
          ],
        }),
      ).toThrow('Invalid line quantity')
    }
  })

  it('strictly blocks cross-site guest cart token theft during merge', () => {
    const guestCartFromSiteA = createEmptyCart({
      id: 'cart_guest',
      siteId: 'site_alpha',
      merchantConnectionId: 'merch_1',
      currency: 'USD',
    })

    const memberCartOnSiteB = createEmptyCart({
      id: 'cart_member',
      siteId: 'site_beta', // Different site!
      merchantConnectionId: 'merch_1',
      currency: 'USD',
      customerId: 'member_99',
    })

    expect(() =>
      mergeGuestAndMemberCarts({
        guestCart: guestCartFromSiteA,
        memberCart: memberCartOnSiteB,
        products: dummyProducts,
      }),
    ).toThrow('Cross-site cart access denied')
  })

  it('rejects invalid or forged coupon codes and enforces usage limits', () => {
    const promo: PromotionDefinition = {
      id: 'promo_1',
      version: 1,
      siteId: 'site_alpha',
      code: 'SAVE10',
      description: '$10 off',
      scope: 'order',
      discountType: 'fixed-minor',
      discountValue: '1000',
      currency: 'USD',
      status: 'active',
      stackingRule: 'stackable',
      stackingPriority: 1,
      usageLimitTotal: 2,
      usageCount: 2, // Reached limit!
    }

    const lines = [
      {
        lineId: 'l1',
        productId: 'prod_hat',
        variantSku: 'HAT-BLK',
        quantity: 1,
        unitPriceMinor: '3000',
        currency: 'USD',
      },
    ]

    const evalResult = evaluatePromotion(promo, lines, '0', {
      siteId: 'site_alpha',
      currency: 'USD',
    })

    expect(evalResult.eligible).toBe(false)
    expect(evalResult.ineligibilityReason).toContain('usage limit reached')
  })

  it('sanitizes address script injection while preserving verbatim raw input', () => {
    const maliciousInput = {
      name: '<script>alert("pwn")</script> John Doe',
      line1: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      postalCode: '90210',
      country: 'US',
    }

    const validated = validateAddress(maliciousInput)
    // Preserves raw input exactly
    expect(validated.rawInput.name).toBe('<script>alert("pwn")</script> John Doe')
    // Flags validation error due to dangerous characters
    expect(validated.isValid).toBe(false)
    expect(validated.validationErrors.some((e) => e.includes('invalid characters'))).toBe(true)
  })

  it('detects tampering of proposal integrity hash', () => {
    const cart = createEmptyCart({
      id: 'cart_1',
      siteId: 'site_alpha',
      merchantConnectionId: 'merch_1',
      currency: 'USD',
    })
    const cartWithItem = {
      ...cart,
      items: [
        {
          lineId: 'l1',
          productId: 'prod_hat',
          variantSku: 'HAT-BLK',
          quantity: 1,
          kind: 'physical' as const,
          displaySnapshot: {
            title: 'Renegade Hat',
            unitPriceMinor: '3000',
            currency: 'USD',
          },
        },
      ],
    }

    const pricing = computePricing({
      currency: 'USD',
      lines: [
        {
          lineId: 'l1',
          productId: 'prod_hat',
          variantSku: 'HAT-BLK',
          quantity: 1,
          unitPriceMinor: '3000',
          currency: 'USD',
        },
      ],
    })

    const validatedAddr = validateAddress({
      name: 'Jane Doe',
      line1: '100 Market St',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'US',
    })

    const proposal = createCheckoutProposal({
      cart: cartWithItem,
      pricingSnapshot: pricing,
      customer: { email: 'jane@example.com', isGuest: true },
      shippingAddress: validatedAddr,
      selectedShippingRate: {
        id: 'r1',
        title: 'Standard',
        amountMinor: '500',
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

    // Valid check passes
    expect(() => assertProposalValidForCheckout(proposal, cartWithItem)).not.toThrow()

    // Attacker modifies grand total minor on the proposal object
    const tamperedProposal = {
      ...proposal,
      pricingSnapshot: {
        ...proposal.pricingSnapshot,
        grandTotalMinor: '100', // Tampered from 3000 to 100!
      },
    }

    expect(() => assertProposalValidForCheckout(tamperedProposal, cartWithItem)).toThrow(
      'Proposal integrity check failed',
    )
  })

  it('rejects checkout proposals when cart version has changed (multi-tab race)', () => {
    const cartV1 = createEmptyCart({
      id: 'cart_1',
      siteId: 'site_alpha',
      merchantConnectionId: 'merch_1',
      currency: 'USD',
    })
    const cartV1WithItem = {
      ...cartV1,
      version: 1,
      items: [
        {
          lineId: 'l1',
          productId: 'prod_hat',
          variantSku: 'HAT-BLK',
          quantity: 1,
          kind: 'physical' as const,
          displaySnapshot: {
            title: 'Renegade Hat',
            unitPriceMinor: '3000',
            currency: 'USD',
          },
        },
      ],
    }

    const pricing = computePricing({
      currency: 'USD',
      lines: [
        {
          lineId: 'l1',
          productId: 'prod_hat',
          variantSku: 'HAT-BLK',
          quantity: 1,
          unitPriceMinor: '3000',
          currency: 'USD',
        },
      ],
    })

    const proposal = createCheckoutProposal({
      cart: cartV1WithItem,
      pricingSnapshot: pricing,
      customer: { email: 'jane@example.com', isGuest: true },
      shippingAddress: validateAddress({
        name: 'Jane Doe',
        line1: '100 Market St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      }),
      selectedShippingRate: {
        id: 'r1',
        title: 'Standard',
        amountMinor: '500',
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

    // Suppose user in another tab modified the cart, bumping version to 2
    const cartV2 = { ...cartV1WithItem, version: 2 }

    expect(() => assertProposalValidForCheckout(proposal, cartV2)).toThrow(
      'Cart has been modified since checkout proposal was generated',
    )
  })

  it('strictly blocks and throws when tax calculation is unreliable; never invents zero tax', async () => {
    const taxAdapter = new BoundedJurisdictionTaxAdapter()

    const unmappedAddress = validateAddress({
      name: 'Explorer',
      line1: '1 Unknown Way',
      city: 'Unknown City',
      postalCode: '00000',
      country: 'ZZ', // Unmapped fictitious country
    })

    await expect(
      taxAdapter.calculateTax({
        siteId: 'site_alpha',
        currency: 'USD',
        destination: unmappedAddress,
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            variantSku: 'v1',
            quantity: 1,
            unitPriceMinor: '5000',
            currency: 'USD',
          },
        ],
        shippingAmountMinor: '0',
      }),
    ).rejects.toThrow(TaxCalculationUnavailableError)
  })
})
