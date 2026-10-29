/* eslint-disable @typescript-eslint/no-explicit-any -- deliberately bounded domain fixtures */
import { expect, it, vi } from 'vitest'
import {
  assertFulfillmentOrderEligible,
  assertFrozenFulfillment,
  freezeFulfillmentLines,
} from '../../src/modules/commerce/fulfillment-mapping'
import { buildFulfillmentPlan } from '../../src/modules/commerce/fulfillment-plan'
import {
  catalogProductFromDocument,
  validateCatalogProduct,
  assertCatalogReady,
  catalogReadiness,
} from '../../src/modules/commerce/catalog'
const order = {
  id: 'order',
  site: 'alpha',
  merchantConnection: 'merchant',
  checkoutSession: 'session',
  state: 'paid',
  receipt: { state: 'issued' },
  amountMinor: '1000',
  currency: 'USD',
}
const payment = {
  site: 'alpha',
  merchantConnection: 'merchant',
  state: 'paid',
  amountMinor: '1000',
  currency: 'USD',
  financialEvents: [{ kind: 'succeeded', resultingState: 'succeeded' }],
}
it('allows draft POD authoring before its review but keeps readiness and publication blocked', () => {
  const draft = catalogProductFromDocument({
    id: 'product',
    site: 'alpha',
    name: 'Shirt',
    slug: 'shirt',
    canonicalPath: '/store/shirt',
    state: 'draft',
    productCapabilities: ['shippable', 'pod'],
    optionDimensions: [],
    variants: [
      {
        sku: 'POD-ONE',
        optionValues: {},
        status: 'active',
        inventoryPolicy: 'pod',
        weightGrams: 100,
        dimensionsMm: { length: 100, width: 100, height: 10 },
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
  expect(validateCatalogProduct(draft)).toEqual([])
  expect(catalogReadiness(draft).ready).toBe(false)
  expect(() => assertCatalogReady(draft)).toThrow('reviewed provider mappings')
  expect(validateCatalogProduct({ ...draft, state: 'published' })).toContain(
    'POD products require reviewed provider mappings.',
  )
})
it.each(['pending-payment', 'cancelled', 'refunded', 'failed'])(
  'rejects %s before any fulfillment/provider effect',
  async (state) => {
    const find = vi.fn()
    await expect(assertFulfillmentOrderEligible({ find }, { ...order, state })).rejects.toThrow(
      'Only settled',
    )
    expect(find).not.toHaveBeenCalled()
  },
)
it('requires matching verified settlement and rejects partially refunded orders', async () => {
  await expect(
    assertFulfillmentOrderEligible({ find: async () => ({ docs: [payment] }) }, order),
  ).resolves.toBeUndefined()
  await expect(
    assertFulfillmentOrderEligible(
      { find: vi.fn() },
      { ...order, refundExtension: { refundedAmountMinor: '1' } },
    ),
  ).rejects.toThrow('Only settled')
  for (const patch of [
    { site: 'beta' },
    { merchantConnection: 'foreign' },
    { currency: 'EUR' },
    { amountMinor: '1001' },
    { financialEvents: [] },
  ])
    await expect(
      assertFulfillmentOrderEligible(
        { find: async () => ({ docs: [{ ...payment, ...patch }] }) },
        order,
      ),
    ).rejects.toThrow('Verified matching')
})
const shipping = {
  name: 'Local recipient',
  address1: '100 Main St',
  city: 'Austin',
  postalCode: '78701',
  country: 'US',
}
it('accepts canonical confirmed-chain evidence but rejects reorged/underconfirmed/mismatched invoices', async () => {
  const invoice = {
    state: 'confirmed',
    requiredConfirmations: 2,
    confirmations: 2,
    transactionIds: ['local-chain-observation'],
    exactAmountAtomic: '500',
    detectedAmountAtomic: '500',
  }
  const payload = (patch: any = {}) => ({
    find: async () => ({
      docs: [{ ...payment, financialEvents: [], cryptoInvoice: { ...invoice, ...patch } }],
    }),
  })
  await expect(assertFulfillmentOrderEligible(payload(), order)).resolves.toBeUndefined()
  for (const patch of [
    { state: 'reorged' },
    { confirmations: 1 },
    { transactionIds: [] },
    { detectedAmountAtomic: '499' },
  ])
    await expect(assertFulfillmentOrderEligible(payload(patch), order)).rejects.toThrow(
      'Verified matching',
    )
  await expect(
    assertFulfillmentOrderEligible(
      {
        find: async () => ({
          docs: [
            {
              ...payment,
              financialEvents: [
                ...payment.financialEvents,
                { kind: 'partially-refunded', resultingState: 'partially-refunded' },
              ],
            },
          ],
        }),
      },
      order,
    ),
  ).rejects.toThrow('Verified matching')
})
it('freezes a manual mapping independently of later catalog changes', async () => {
  const product: any = {
    id: 'product',
    site: 'alpha',
    merchantConnection: 'merchant',
    variants: [{ sku: 'PRINT' }],
    podMappings: [
      {
        mode: 'manual',
        siteId: 'alpha',
        productId: 'product',
        merchantConnectionId: 'merchant',
        variantSku: 'PRINT',
        version: 1,
        reviewStatus: 'approved',
      },
    ],
  }
  const lines: any[] = [
    { productId: 'product', variantSku: 'PRINT', kind: 'physical', quantity: 1 },
  ]
  await freezeFulfillmentLines({}, lines, [product], {
    siteId: 'alpha',
    merchantId: 'merchant',
    currency: 'USD',
    shipping,
  })
  product.podMappings[0].version = 2
  expect(lines[0].fulfillmentSnapshot.version).toBe(1)
  await expect(assertFrozenFulfillment({}, order, lines)).resolves.toBeUndefined()
  await expect(assertFrozenFulfillment({}, { ...order, site: 'beta' }, lines)).rejects.toThrow(
    'cross',
  )
})
it('rejects missing shipping and missing POD review before a payment is initiated', async () => {
  const lines: any[] = [{ productId: 'product', variantSku: 'POD', kind: 'physical', quantity: 1 }]
  const product = {
    id: 'product',
    site: 'alpha',
    merchantConnection: 'merchant',
    variants: [{ sku: 'POD', inventoryPolicy: 'pod-provider' }],
  }
  await expect(
    freezeFulfillmentLines({}, lines, [product], {
      siteId: 'alpha',
      merchantId: 'merchant',
      currency: 'USD',
      shipping: undefined,
    }),
  ).rejects.toThrow('address')
  await expect(
    freezeFulfillmentLines({}, lines, [product], {
      siteId: 'alpha',
      merchantId: 'merchant',
      currency: 'USD',
      shipping,
    }),
  ).rejects.toThrow('reviewed mapping')
})
it('groups the same provider by the pinned connection rather than silently changing stores', () => {
  const connections = new Map<string, any>(
    ['one', 'two'].map((id) => [
      id,
      { id, siteId: 'alpha', providerKey: 'pod-emulator', status: 'active' },
    ]),
  )
  const items: any[] = ['one', 'two'].map((connectionId, i) => ({
    lineId: String(i),
    productId: 'product',
    variantSku: 'POD',
    title: 'Print',
    quantity: 1,
    unitPriceMinor: '1000',
    lineAmountMinor: '1000',
    kind: 'pod',
    podMapping: {
      siteId: 'alpha',
      productId: 'product',
      variantSku: 'POD',
      connectionId,
      providerKey: 'pod-emulator',
      reviewStatus: 'approved',
      snapshot: { costMinor: '300', currency: 'USD', available: true },
    },
  }))
  const plan = buildFulfillmentPlan({
    orderId: 'order',
    siteId: 'alpha',
    currency: 'USD',
    items,
    connectionsByProviderKey: connections,
  })
  expect(plan.providerJobs.map((p) => p.connectionId)).toEqual(['one', 'two'])
  expect(plan.providerJobs.map((p) => p.estimatedCostMinor)).toEqual(['300', '300'])
  expect(() =>
    buildFulfillmentPlan({
      orderId: 'order',
      siteId: 'beta',
      currency: 'USD',
      items,
      connectionsByProviderKey: connections,
    }),
  ).toThrow('mapping')
})
