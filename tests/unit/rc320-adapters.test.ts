import { describe, expect, it } from 'vitest'
import {
  AdapterRegistry,
  convertFiatMinorToSatoshis,
  createBtcpayAdapter,
  createBuiltinAdapterRegistries,
  createEmulatorDropshipAdapter,
  formatSatoshisAsBtc,
  fulfillmentGroupKindForLine,
  isAffiliateProduct,
  mapBtcpayStatus,
  parseDecimalRational,
  quoteShippingForGroups,
  resolveProductSource,
  type BtcpayFetch,
} from '../../src/modules/commerce/adapters'
import { computePricing } from '../../src/modules/commerce/pricing'
import { createCheckoutProposal } from '../../src/modules/commerce/proposal'
import { createEmptyCart, type CartItem } from '../../src/modules/commerce/cart'
import { LocalFallbackShippingAdapter, validateAddress } from '../../src/modules/commerce/shipping'
import {
  buildFulfillmentPlan,
  createSupplierJobAfterPaidAcceptance,
  submitSupplierJob,
  type FulfillmentLineItem,
} from '../../src/modules/commerce/fulfillment-plan'
import { checkLineAvailability } from '../../src/modules/commerce/inventory'

const address = validateAddress({
  name: 'Guest Buyer',
  line1: '100 Main St',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
})

const rate = (id: string, amountMinor: string) => ({
  id,
  title: id,
  amountMinor,
  currency: 'USD',
  source: 'configured-flat' as const,
  quotedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
})

describe('RC3-20 adapter registries', () => {
  it('registers every built-in through the same mechanism and resolves by key', () => {
    const registries = createBuiltinAdapterRegistries()
    expect(registries.sources.get('own-inventory').sourceType).toBe('own')
    expect(registries.sources.get('generic-dropship').sourceType).toBe('dropship')
    expect(registries.sources.get('affiliate-referral').sourceType).toBe('affiliate')
    expect(registries.fulfillmentProviders.get('self-manual').kind).toBe('self')
    expect(registries.fulfillmentProviders.get('generic-dropship').kind).toBe('supplier')
    expect(registries.fulfillmentProviders.get('affiliate-referral').kind).toBe('referral')
    expect(registries.paymentRails.get('btcpay').implementation).toBe('live-configured')
    expect(registries.paymentRails.get('btcpay').networks).toContain('bitcoin')
    expect(registries.paymentRails.get('stripe-test').family).toBe('card')
    expect(() => registries.sources.get('nope')).toThrow(/not registered/)
  })

  it('rejects duplicate registration', () => {
    const registry = new AdapterRegistry()
    const entry = { key: 'x', contractVersion: 'v1', capabilities: [] }
    registry.register(entry)
    expect(() => registry.register(entry)).toThrow(/already registered/)
  })
})

describe('RC3-20 product source resolution', () => {
  it('defaults to own inventory', () => {
    const source = resolveProductSource(
      { kind: 'physical', variants: [{ sku: 'A', inventoryPolicy: 'tracked' }] },
      'A',
    )
    expect(source).toEqual({ type: 'own', providerKey: 'own-inventory' })
  })

  it('resolves affiliate by kind, capability, and variant policy', () => {
    expect(resolveProductSource({ kind: 'affiliate', variants: [{ sku: 'A' }] }, 'A').type).toBe(
      'affiliate',
    )
    expect(
      resolveProductSource(
        { kind: 'physical', productCapabilities: ['affiliate'], variants: [{ sku: 'A' }] },
        'A',
      ).type,
    ).toBe('affiliate')
    expect(
      resolveProductSource(
        { kind: 'physical', variants: [{ sku: 'A', inventoryPolicy: 'affiliate' }] },
        'A',
      ).type,
    ).toBe('affiliate')
    expect(isAffiliateProduct({ kind: 'affiliate' })).toBe(true)
    expect(isAffiliateProduct({ kind: 'physical' })).toBe(false)
  })

  it('carries affiliate observations (price/availability/freshness) on the descriptor', () => {
    const source = resolveProductSource(
      {
        kind: 'affiliate',
        affiliatePolicy: {
          destinationUrl: 'https://seller.example/item',
          disclosure: 'Affiliate link',
          remotePrice: { amountMinor: '4999', currency: 'USD' },
          remoteAvailability: true,
          observedAt: '2026-11-24T00:00:00.000Z',
          freshnessHours: 24,
        },
        variants: [{ sku: 'A', inventoryPolicy: 'affiliate' }],
      },
      'A',
    )
    expect(source.observed?.priceMinor).toBe('4999')
    expect(source.observed?.available).toBe(true)
    expect(source.freshnessHours).toBe(24)
  })

  it('resolves dropship only from a reviewed sourcePolicy descriptor', () => {
    const product = {
      kind: 'physical',
      sourcePolicy: {
        variants: {
          A: {
            type: 'dropship' as const,
            providerKey: 'generic-dropship',
            externalRef: 'ext-a',
            observed: {
              costMinor: '900',
              currency: 'USD',
              available: true,
              observedAt: '2026-11-24T00:00:00.000Z',
            },
          },
        },
      },
      variants: [{ sku: 'A', inventoryPolicy: 'external-hook' }],
    }
    expect(resolveProductSource(product, 'A').type).toBe('dropship')
    // external-hook alone never infers a supplier relationship
    expect(
      resolveProductSource(
        { kind: 'physical', variants: [{ sku: 'A', inventoryPolicy: 'external-hook' }] },
        'A',
      ).type,
    ).toBe('own')
  })

  it('resolves POD from kind and policy, and maps group kinds', () => {
    expect(
      resolveProductSource({ kind: 'pod-reference', variants: [{ sku: 'A' }] }, 'A').type,
    ).toBe('pod')
    expect(
      fulfillmentGroupKindForLine({
        itemKind: 'physical',
        source: { type: 'dropship', providerKey: 'generic-dropship' },
      }),
    ).toBe('dropship')
    expect(
      fulfillmentGroupKindForLine({
        itemKind: 'affiliate',
        source: { type: 'affiliate', providerKey: 'affiliate-referral' },
      }),
    ).toBe('referral')
    expect(
      fulfillmentGroupKindForLine({
        itemKind: 'digital',
        source: { type: 'own', providerKey: 'own-inventory' },
      }),
    ).toBe('digital')
  })

  it('external-hook and affiliate variants are available to the cart (external stock)', () => {
    const base = { productId: 'p', variantSku: 'A', status: 'active' as const }
    expect(checkLineAvailability({ ...base, policy: 'external-hook' }, 2).available).toBe(true)
    expect(checkLineAvailability({ ...base, policy: 'affiliate' }, 1).available).toBe(true)
  })
})

describe('RC3-20 per-group shipping', () => {
  it('quotes each group on its own subtotal and sums the rates', async () => {
    const adapter = new LocalFallbackShippingAdapter({
      standardRateMinor: '500',
      currency: 'USD',
      freeShippingThresholdMinor: '5000',
    })
    const { quotes, totalMinor } = await quoteShippingForGroups({
      adapter,
      base: { siteId: 'site', currency: 'USD', destination: address },
      groups: [
        {
          groupKey: 'physical',
          itemsSubtotalMinor: '6000', // over the free threshold on its own
          items: [{ productId: 'p1', variantSku: 'A', quantity: 1, shippable: true }],
        },
        {
          groupKey: 'dropship',
          itemsSubtotalMinor: '2000', // under: pays the flat rate
          items: [{ productId: 'p2', variantSku: 'B', quantity: 1, shippable: true }],
        },
      ],
    })
    expect(quotes.find((q) => q.groupKey === 'physical')?.amountMinor).toBe('0')
    expect(quotes.find((q) => q.groupKey === 'dropship')?.amountMinor).toBe('500')
    expect(totalMinor).toBe('500')
  })
})

describe('RC3-20 proposal groups: mixed cart with referral partition', () => {
  const cartItem = (lineId: string, productId: string, sku: string, price: string): CartItem => ({
    lineId,
    productId,
    variantSku: sku,
    quantity: 1,
    kind: 'physical',
    displaySnapshot: { title: sku, unitPriceMinor: price, currency: 'USD' },
  })

  it('splits own + dropship into per-group rates and closes affiliate as referral', () => {
    const cart = {
      ...createEmptyCart({
        id: 'cart1',
        siteId: 'site',
        merchantConnectionId: 'm1',
        currency: 'USD',
      }),
      items: [
        cartItem('l-own', 'p-own', 'OWN-1', '1000'),
        cartItem('l-drop', 'p-drop', 'DROP-1', '2000'),
      ],
    }
    const pricingSnapshot = computePricing({
      currency: 'USD',
      lines: [
        {
          lineId: 'l-own',
          productId: 'p-own',
          variantSku: 'OWN-1',
          quantity: 1,
          unitPriceMinor: '1000',
          currency: 'USD',
        },
        {
          lineId: 'l-drop',
          productId: 'p-drop',
          variantSku: 'DROP-1',
          quantity: 1,
          unitPriceMinor: '2000',
          currency: 'USD',
        },
      ],
      shippingAmountMinor: '1000',
    })
    const proposal = createCheckoutProposal({
      cart,
      pricingSnapshot,
      customer: { email: 'guest@example.com', isGuest: true },
      shippingAddress: address,
      groupShippingRates: {
        physical: rate('rate_physical', '500'),
        dropship: rate('rate_drop', '500'),
      },
      lineSources: new Map([
        ['l-own', { type: 'own' as const, providerKey: 'own-inventory' }],
        [
          'l-drop',
          { type: 'dropship' as const, providerKey: 'generic-dropship', externalRef: 'ext-1' },
        ],
      ]),
      referralLines: [
        {
          productId: 'p-aff',
          variantSku: 'AFF-1',
          title: 'Affiliate Thing',
          quantity: 1,
          observedUnitPriceMinor: '9999',
          destinationUrl: 'https://seller.example/item',
          disclosure: 'Affiliate link',
        },
      ],
      consents: { termsAccepted: true, privacyAccepted: true, timestamp: new Date().toISOString() },
    })

    const kinds = proposal.fulfillmentSplit.map((g) => g.fulfillmentKind)
    expect(kinds).toEqual(['physical', 'dropship', 'referral'])
    expect(proposal.fulfillmentSplit[0].shippingRate?.id).toBe('rate_physical')
    expect(proposal.fulfillmentSplit[1].shippingRate?.id).toBe('rate_drop')
    expect(proposal.fulfillmentSplit[1].items[0].sourceProviderKey).toBe('generic-dropship')
    const referral = proposal.fulfillmentSplit[2]
    expect(referral.state).toBe('referred')
    expect(referral.shippingRate).toBeUndefined()
    expect(referral.items[0].unitPriceMinor).toBe('9999')
    // The referral line is never in the pricing snapshot: total is payable only.
    expect(proposal.pricingSnapshot.grandTotalMinor).toBe('4000')
    expect(proposal.pricingSnapshot.lines).toHaveLength(2)
  })

  it('refuses to price an affiliate line that reaches the split unpartitioned', () => {
    const cart = {
      ...createEmptyCart({
        id: 'cart2',
        siteId: 'site',
        merchantConnectionId: 'm1',
        currency: 'USD',
      }),
      items: [cartItem('l-aff', 'p-aff', 'AFF-1', '9999')],
    }
    const pricingSnapshot = computePricing({
      currency: 'USD',
      lines: [
        {
          lineId: 'l-aff',
          productId: 'p-aff',
          variantSku: 'AFF-1',
          quantity: 1,
          unitPriceMinor: '9999',
          currency: 'USD',
        },
      ],
    })
    expect(() =>
      createCheckoutProposal({
        cart,
        pricingSnapshot,
        customer: { email: 'guest@example.com', isGuest: true },
        shippingAddress: address,
        selectedShippingRate: rate('rate_x', '500'),
        lineSources: new Map([
          ['l-aff', { type: 'affiliate' as const, providerKey: 'affiliate-referral' }],
        ]),
        consents: {
          termsAccepted: true,
          privacyAccepted: true,
          timestamp: new Date().toISOString(),
        },
      }),
    ).toThrow(/disclosed seller destination/)
  })
})

describe('RC3-20 generic dropship supplier (deterministic emulator)', () => {
  const seed = {
    catalog: [
      {
        externalRef: 'ext-1',
        title: 'Supplier Widget',
        variants: [
          {
            externalSku: 'SUP-W-1',
            title: 'Widget',
            costMinor: '1200',
            currency: 'USD',
            available: true,
            stockQuantity: 3,
          },
        ],
      },
    ],
  }
  const recipient = {
    name: 'Guest Buyer',
    address1: '100 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  }

  it('syncs catalog/stock, places idempotent orders, and returns tracking', async () => {
    const adapter = createEmulatorDropshipAdapter('generic-dropship', seed)
    expect((await adapter.health()).ready).toBe(true)
    const catalog = await adapter.getCatalog()
    expect(catalog[0].variants[0].stockQuantity).toBe(3)
    expect((await adapter.getStock('SUP-W-1')).available).toBe(true)

    const order = await adapter.createOrder({
      orderId: 'order-1',
      idempotencyKey: 'supplier_job:site:order-1:0:abc',
      recipient,
      items: [{ externalSku: 'SUP-W-1', quantity: 2 }],
    })
    expect(order.state).toBe('submitted')
    expect(order.costMinor).toBe('2400')

    const replay = await adapter.createOrder({
      orderId: 'order-1',
      idempotencyKey: 'supplier_job:site:order-1:0:abc',
      recipient,
      items: [{ externalSku: 'SUP-W-1', quantity: 2 }],
    })
    expect(replay.replay).toBe(true)
    expect(replay.externalOrderId).toBe(order.externalOrderId)
    // Stock was decremented once, not twice.
    expect((await adapter.getStock('SUP-W-1')).stockQuantity).toBe(1)

    const shipped = await adapter.getOrder(order.externalOrderId)
    expect(shipped.state).toBe('shipped')
    expect(shipped.tracking?.carrier).toBe('USPS')
    expect(shipped.tracking?.trackingNumber).toMatch(/^EMU/)
    expect((await adapter.cancelOrder(order.externalOrderId)).cancelled).toBe(false)
  })

  it('fails honestly when supplier stock is insufficient', async () => {
    const adapter = createEmulatorDropshipAdapter('generic-dropship', seed)
    const order = await adapter.createOrder({
      orderId: 'order-2',
      idempotencyKey: 'k-2',
      recipient,
      items: [{ externalSku: 'SUP-W-1', quantity: 99 }],
    })
    expect(order.state).toBe('failed')
    expect(order.error).toMatch(/stock unavailable/)
  })

  it('plans supplier packages on cost evidence and submits only after paid acceptance', async () => {
    const items: FulfillmentLineItem[] = [
      {
        lineId: 'l1',
        productId: 'p-drop',
        variantSku: 'DROP-1',
        title: 'Drop Widget',
        quantity: 2,
        unitPriceMinor: '2000',
        lineAmountMinor: '4000',
        kind: 'dropship',
        dropship: {
          providerKey: 'generic-dropship',
          externalSku: 'SUP-W-1',
          costMinor: '1200',
          currency: 'USD',
          available: true,
        },
      },
    ]
    const plan = buildFulfillmentPlan({
      orderId: 'order-9',
      siteId: 'site',
      currency: 'USD',
      recipientAddress: { ...recipient, address1: '100 Main St' },
      items,
      connectionsByProviderKey: new Map(),
    })
    expect(plan.supplierPackages).toHaveLength(1)
    expect(plan.supplierPackages[0].estimatedCostMinor).toBe('2400')

    expect(() =>
      createSupplierJobAfterPaidAcceptance({
        plan,
        packageIndex: 0,
        orderPaymentState: 'pending-payment',
      }),
    ).toThrow(/must be "paid"/)
    const job = createSupplierJobAfterPaidAcceptance({
      plan,
      packageIndex: 0,
      orderPaymentState: 'paid',
    })
    expect(job.state).toBe('created')

    const adapter = createEmulatorDropshipAdapter('generic-dropship', seed)
    const submitted = await submitSupplierJob(adapter, job)
    expect(submitted.replay).toBe(false)
    expect(submitted.job.state).toBe('shipped')
    expect(submitted.job.externalOrderId).toBeTruthy()
    expect(submitted.job.tracking?.trackingNumber).toMatch(/^EMU/)
    const replayed = await submitSupplierJob(adapter, submitted.job)
    expect(replayed.replay).toBe(true)
  })

  it('refuses to plan a dropship package without observed cost evidence', () => {
    const items: FulfillmentLineItem[] = [
      {
        lineId: 'l1',
        productId: 'p-drop',
        variantSku: 'DROP-1',
        title: 'Drop Widget',
        quantity: 1,
        unitPriceMinor: '2000',
        lineAmountMinor: '2000',
        kind: 'dropship',
        dropship: { providerKey: 'generic-dropship', externalSku: 'SUP-W-1', available: true },
      },
    ]
    expect(() =>
      buildFulfillmentPlan({
        orderId: 'order-10',
        siteId: 'site',
        currency: 'USD',
        items,
        connectionsByProviderKey: new Map(),
      }),
    ).toThrow(/cost evidence/)
  })
})

describe('RC3-20 BTCPay rail: FX math', () => {
  it('parses decimals exactly and converts with ceiling rounding', () => {
    expect(parseDecimalRational('97412.33')).toEqual({
      numerator: 9741233n,
      denominator: 100n,
    })
    // $40.00 at $100,000/BTC = 0.0004 BTC = 40000 sats exactly
    expect(
      convertFiatMinorToSatoshis({
        amountMinor: '4000',
        currency: 'USD',
        rateFiatPerBtc: '100000',
      }),
    ).toBe('40000')
    // $10.00 at $97,412.33/BTC = 10265.68... sats -> ceil 10266
    expect(
      convertFiatMinorToSatoshis({
        amountMinor: '1000',
        currency: 'USD',
        rateFiatPerBtc: '97412.33',
      }),
    ).toBe('10266')
    // Zero-decimal currency: ¥1500 at ¥15,000,000/BTC = 10000 sats
    expect(
      convertFiatMinorToSatoshis({
        amountMinor: '1500',
        currency: 'JPY',
        rateFiatPerBtc: '15000000',
      }),
    ).toBe('10000')
    expect(formatSatoshisAsBtc('10266')).toBe('0.00010266')
    expect(formatSatoshisAsBtc('100000000')).toBe('1.00000000')
  })

  it('maps BTCPay statuses conservatively', () => {
    expect(mapBtcpayStatus({ status: 'New' }).state).toBe('created')
    expect(mapBtcpayStatus({ status: 'Processing' }).accepted).toBe(false)
    expect(mapBtcpayStatus({ status: 'Settled' })).toEqual({
      state: 'confirmed',
      accepted: true,
      manualReconciliationAllowed: false,
    })
    expect(mapBtcpayStatus({ status: 'Settled', additionalStatus: 'PaidOver' })).toEqual({
      state: 'overpaid',
      accepted: false,
      manualReconciliationAllowed: true,
    })
    expect(mapBtcpayStatus({ status: 'Expired', additionalStatus: 'PaidLate' }).state).toBe('late')
    expect(mapBtcpayStatus({ status: 'Expired', additionalStatus: 'PaidPartial' }).state).toBe(
      'underpaid',
    )
    expect(mapBtcpayStatus({ status: 'Invalid' }).state).toBe('exception')
  })
})

describe('RC3-20 BTCPay rail: Greenfield adapter against a contract stub', () => {
  function stubFetch(state: { status: string; additionalStatus?: string }) {
    const calls: { url: string; method?: string; authorization?: string; body?: string }[] = []
    const fetchFn: BtcpayFetch = async (url, init) => {
      calls.push({
        url,
        method: init?.method,
        authorization: init?.headers?.Authorization,
        body: init?.body,
      })
      const json = (value: unknown) => ({ ok: true, status: 200, json: async () => value })
      if (url.includes('/rates')) return json([{ currencyPair: 'BTC_USD', rate: '100000.00' }])
      if (url.endsWith('/invoices') && init?.method === 'POST')
        return json({
          id: 'inv-123',
          status: 'New',
          checkoutLink: 'https://btcpay.example/i/inv-123',
        })
      if (url.includes('/payment-methods'))
        return json([
          {
            paymentMethodId: 'BTC-CHAIN',
            destination: 'bc1qexampledestination',
            paymentLink: 'bitcoin:bc1qexampledestination?amount=0.00040000',
          },
        ])
      if (url.endsWith('/invoices/inv-123'))
        return json({
          id: 'inv-123',
          status: state.status,
          additionalStatus: state.additionalStatus ?? 'None',
        })
      return { ok: false, status: 404, json: async () => ({}) }
    }
    return { fetchFn, calls }
  }

  it('quotes, creates, and verifies settlement — server-side only', async () => {
    const state: { status: string; additionalStatus?: string } = { status: 'New' }
    const { fetchFn, calls } = stubFetch(state)
    const adapter = createBtcpayAdapter({
      serverUrl: 'https://btcpay.example',
      storeId: 'store-1',
      apiKey: 'merchant-key',
      fetchFn,
    })

    const quote = await adapter.quoteInvoiceAmount({
      amountMinor: '4000',
      currency: 'USD',
      now: '2026-11-24T12:00:00.000Z',
      buyerConfirmedConversion: true,
    })
    expect(quote.exactAmountAtomic).toBe('40000')
    expect(quote.money.quoteSource).toBe('btcpay-rates')
    expect(quote.money.buyerConfirmedConversion).toBe(true)
    expect(quote.money.quotedAt).toBe('2026-11-24T12:00:00.000Z')

    const invoice = await adapter.createInvoice({
      intentId: 'intent-1',
      exactAmountAtomic: quote.exactAmountAtomic,
      expiresAt: '2026-11-24T12:20:00.000Z',
    })
    expect(invoice.network).toBe('bitcoin')
    expect(invoice.asset).toBe('BTC')
    expect(invoice.reference).toBe('inv-123')
    expect(invoice.destination).toBe('bc1qexampledestination')
    expect(invoice.uri).toContain('bitcoin:bc1qexampledestination')
    const post = calls.find((call) => call.method === 'POST')!
    expect(post.authorization).toBe('token merchant-key')
    expect(JSON.parse(post.body!)).toMatchObject({ amount: '0.00040000', currency: 'BTC' })

    state.status = 'Processing'
    const processing = await adapter.verifySettlement({
      invoiceId: 'inv-123',
      invoice,
      now: '2026-11-24T12:05:00.000Z',
    })
    expect(processing.accepted).toBe(false)
    expect(processing.invoice.state).toBe('confirming')

    state.status = 'Settled'
    const settled = await adapter.verifySettlement({
      invoiceId: 'inv-123',
      invoice,
      now: '2026-11-24T12:06:00.000Z',
    })
    expect(settled.accepted).toBe(true)
    expect(settled.invoice.state).toBe('confirmed')

    state.status = 'Settled'
    state.additionalStatus = 'PaidOver'
    const overpaid = await adapter.verifySettlement({
      invoiceId: 'inv-123',
      invoice,
      now: '2026-11-24T12:07:00.000Z',
    })
    expect(overpaid.accepted).toBe(false)
    expect(overpaid.manualReconciliationAllowed).toBe(true)
  })
})
