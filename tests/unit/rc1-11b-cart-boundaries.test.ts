import { describe, expect, it } from 'vitest'
import { computePricing } from '../../src/modules/commerce/pricing'
import { BoundedJurisdictionTaxAdapter } from '../../src/modules/commerce/tax'
import { validateAddress } from '../../src/modules/commerce/shipping'
import { validateCartMutation } from '../../src/modules/commerce/cart-mutation'
import { createEmptyCart, reResolveCart, type CartItem } from '../../src/modules/commerce/cart'
describe('11B customer purchase choices', () => {
  it.each([
    'cartId',
    'siteId',
    'merchantConnectionId',
    'member',
    'pricing',
    'taxTotalMinor',
    'shippingAmountMinor',
    'unitPriceMinor',
    'items',
  ])('rejects forged %s', (field) => {
    expect(
      validateCartMutation({ productId: 'p', variantSku: 's', [field]: 'forged' }, 'POST'),
    ).toBe('Unsupported cart field.')
  })
  it.each([-1, 0.5, 10000, '2', null])('rejects invalid PATCH quantity %s', (quantity) => {
    expect(validateCartMutation({ quantity }, 'PATCH')).toBe('Invalid cart quantity.')
  })
  it('accepts zero removal and positive purchase quantity', () => {
    expect(
      validateCartMutation({ lineId: 'line', quantity: 0, expectedVersion: 2 }, 'PATCH'),
    ).toBeNull()
    expect(
      validateCartMutation({ productId: 'p', variantSku: 's', quantity: 2 }, 'POST'),
    ).toBeNull()
  })
  it('rejects malformed coupon lists and donation money', () => {
    expect(validateCartMutation({ appliedCouponCodes: [5] }, 'PATCH')).toBe('Invalid coupon codes.')
    expect(validateCartMutation({ donationAmountMinor: '-100' }, 'POST')).toBe(
      'Invalid donation amount.',
    )
  })
  const item: CartItem = {
    lineId: 'l',
    productId: 'p',
    variantSku: 's',
    quantity: 2,
    kind: 'physical',
    displaySnapshot: { title: 'Old', unitPriceMinor: '1', currency: 'USD' },
  }
  const cart = {
    ...createEmptyCart({ id: 'c', siteId: 'a', merchantConnectionId: 'm', currency: 'USD' }),
    items: [item],
  }
  const product = {
    id: 'p',
    name: 'P',
    state: 'published',
    kind: 'physical',
    merchantConnectionId: 'm',
    variants: [{ sku: 's', inventoryPolicy: 'untracked' as const }],
    offers: [
      { id: 'o', version: 2, status: 'active' as const, amountMinor: '1750', currency: 'USD' },
    ],
  }
  it('replaces stale prices using the current merchant catalog', () => {
    const result = reResolveCart({ cart, products: [product] })
    expect(result.pricingSnapshot.grandTotalMinor).toBe('3500')
    expect(result.cart.items[0].displaySnapshot.unitPriceMinor).toBe('1750')
  })
  it('withdraws items belonging to a substituted merchant', () => {
    const result = reResolveCart({
      cart,
      products: [{ ...product, merchantConnectionId: 'foreign' }],
    })
    expect(result.cart.items).toEqual([])
    expect(result.pricingSnapshot.grandTotalMinor).toBe('0')
  })
})

describe('11B authoritative tax modes', () => {
  it('does not add included tax a second time and excludes non-taxable offers', async () => {
    const lines = [
      {
        lineId: 'included',
        productId: 'p',
        variantSku: 'a',
        quantity: 1,
        unitPriceMinor: '1200',
        currency: 'USD',
        taxDisplay: 'inclusive' as const,
      },
      {
        lineId: 'extra',
        productId: 'p',
        variantSku: 'b',
        quantity: 1,
        unitPriceMinor: '1000',
        currency: 'USD',
        taxDisplay: 'exclusive' as const,
      },
      {
        lineId: 'exempt',
        productId: 'p',
        variantSku: 'c',
        quantity: 1,
        unitPriceMinor: '500',
        currency: 'USD',
        taxDisplay: 'not-applicable' as const,
      },
    ]
    const tax = await new BoundedJurisdictionTaxAdapter().calculateTax({
      siteId: 's',
      currency: 'USD',
      lines,
      shippingAmountMinor: '0',
      destination: validateAddress({
        name: 'Buyer',
        line1: '100 Main St',
        city: 'London',
        postalCode: 'SW1A 1AA',
        country: 'GB',
      }),
    })
    expect(tax.taxAmountMinor).toBe('400')
    const priced = computePricing({
      currency: 'USD',
      lines,
      taxTotalMinor: tax.taxAmountMinor,
      lineTaxAmountsMinor: tax.lineTaxAmountsMinor,
    })
    expect(priced.grandTotalMinor).toBe('2900')
    expect(priced.lines.map((line) => line.totalAmountMinor)).toEqual(['1200', '1200', '500'])
  })
  it('rejects inconsistent authoritative tax allocations', () => {
    expect(() =>
      computePricing({
        currency: 'USD',
        lines: [
          {
            lineId: 'l',
            productId: 'p',
            variantSku: 'a',
            quantity: 1,
            unitPriceMinor: '100',
            currency: 'USD',
          },
        ],
        taxTotalMinor: '10',
        lineTaxAmountsMinor: { l: '1' },
      }),
    ).toThrow('Tax allocations do not match')
  })
})
