import { describe, expect, it } from 'vitest'
import { starterComponents } from '../../src/modules/presentation/themes/components'

/**
 * RC3-20 SHOP-UX Pass 07 — the eight commerce blocks are registered in the
 * shared starter component registry (merged across themes by the
 * presentation registry), carry canonical references only, and refuse to
 * validate without the reference they need. Layout JSON never holds a
 * price or an inventory count.
 */
const COMMERCE_BLOCK_IDS = [
  'commerce.product-card',
  'commerce.product-grid',
  'commerce.featured-product',
  'commerce.collection-grid',
  'commerce.buy-button',
  'commerce.cart-indicator',
  'commerce.membership-card',
  'commerce.donation-card',
]

describe('commerce builder blocks (Pass 07)', () => {
  it('registers all eight blocks in the Commerce category', () => {
    for (const id of COMMERCE_BLOCK_IDS) {
      expect(starterComponents[id], id).toBeDefined()
      expect(starterComponents[id].category).toBe('Commerce')
    }
  })

  it('product-referencing blocks require a product reference', () => {
    for (const id of COMMERCE_BLOCK_IDS.filter(
      (candidate) =>
        candidate !== 'commerce.product-grid' &&
        candidate !== 'commerce.cart-indicator' &&
        candidate !== 'commerce.collection-grid',
    )) {
      expect(starterComponents[id].validate({})).not.toEqual([])
      expect(starterComponents[id].validate({ productId: 'prod-1' })).toEqual([])
    }
    expect(starterComponents['commerce.collection-grid'].validate({})).not.toEqual([])
    expect(
      starterComponents['commerce.collection-grid'].validate({ collectionId: 'alb-1' }),
    ).toEqual([])
  })

  it('block fields carry references and display options only — never price or inventory', () => {
    for (const id of COMMERCE_BLOCK_IDS) {
      const fieldNames = Object.keys(starterComponents[id].fields)
      for (const forbidden of ['price', 'priceMinor', 'amountMinor', 'inventory', 'stock'])
        expect(fieldNames, `${id}.${forbidden}`).not.toContain(forbidden)
    }
  })

  it('renders carry the canonical reference for theme-independent re-resolution', () => {
    const rendered = starterComponents['commerce.product-card'].render({
      productId: 'prod-42',
    }) as any
    expect(JSON.stringify(rendered.props)).toContain('prod-42')
    const grid = starterComponents['commerce.product-grid'].render({
      category: 'kitchen',
      limit: 6,
      featuredOnly: 'yes',
    }) as any
    expect(JSON.stringify(grid.props)).toContain('commerce.product-grid')
  })
})
