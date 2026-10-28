import { describe, expect, it } from 'vitest'
import { validateCatalogWrite } from '../../src/modules/commerce/catalog-write'
const product = () => ({
  catalogContractVersion: 1,
  id: 'test',
  site: 'alpha',
  name: 'Tee',
  slug: 'tee',
  canonicalPath: '/store/tee',
  state: 'published',
  productCapabilities: ['shippable'],
  optionDimensions: [],
  variants: [
    {
      sku: 'TEE-ONE',
      title: 'Tee',
      optionValues: {},
      status: 'active',
      inventoryPolicy: 'tracked',
      inventoryQuantity: 5,
      weightGrams: 100,
      dimensionsMm: { length: 10, width: 10, height: 10 },
    },
  ],
  offers: [
    {
      offerId: 'usd',
      version: 1,
      status: 'active',
      amountMinor: '1000',
      currency: 'USD',
      taxDisplay: 'exclusive',
    },
  ],
})
describe('11A native catalog write boundary', () => {
  it('blocks direct creation as published, approved or reviewed', () => {
    for (const state of ['published', 'approved', 'review'])
      expect(() => validateCatalogWrite({ ...product(), state })).toThrow('workflow')
  })
  it('validates partial money updates against persisted context', () => {
    expect(() =>
      validateCatalogWrite({ offers: [{ ...product().offers[0], amountMinor: '-1' }] }, product()),
    ).toThrow('money')
  })
  it('rejects duplicate SKU partial updates', () => {
    const p = product()
    expect(() => validateCatalogWrite({ variants: [p.variants[0], p.variants[0]] }, p)).toThrow(
      'duplicated',
    )
  })
  it('rejects negative and fractional inventory', () => {
    const p = product()
    for (const inventoryQuantity of [-1, 0.5])
      expect(() =>
        validateCatalogWrite({ variants: [{ ...p.variants[0], inventoryQuantity }] }, p),
      ).toThrow('inventory')
  })
  it('preserves live stock adjustments', () => {
    const p = product()
    expect(
      validateCatalogWrite({ variants: [{ ...p.variants[0], inventoryQuantity: 0 }] }, p),
    ).not.toHaveProperty('state')
  })
  it('requires a new review after price or variant editorial changes', () => {
    const p = product()
    expect(
      validateCatalogWrite({ offers: [{ ...p.offers[0], amountMinor: '1500', version: 2 }] }, p)
        .state,
    ).toBe('draft')
    expect(
      validateCatalogWrite({ variants: [{ ...p.variants[0], title: 'Edited' }] }, p).state,
    ).toBe('draft')
  })
  it('revalidates active offers on partial publication', () => {
    expect(() =>
      validateCatalogWrite(
        { state: 'published' },
        { ...product(), state: 'approved', offers: [] },
        true,
      ),
    ).toThrow('active offer')
  })
})
