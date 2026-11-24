import { describe, expect, it } from 'vitest'
import {
  deriveCatalogListingFields,
  parseMoneyToMinor,
  type CatalogProduct,
} from '../../src/modules/commerce/catalog'
import {
  merchantPolicies,
  merchantPolicyVersions,
  merchantShippingConfig,
  merchantTaxConfig,
} from '../../src/modules/commerce/merchant-config'
import {
  BoundedJurisdictionTaxAdapter,
  TaxCalculationUnavailableError,
} from '../../src/modules/commerce/tax'
import { validateAddress } from '../../src/modules/commerce/shipping'
import {
  createBuiltinAdapterRegistries,
  createCustodialCryptoAdapter,
  custodialCryptoConfigFromMerchant,
} from '../../src/modules/commerce/adapters'
import { presentPaymentMethod } from '../../src/modules/commerce/payment-methods'
import { parseStorefrontParams, storefrontHref } from '../../src/modules/commerce/storefront'
import type { PaymentMethodCapability } from '../../src/modules/commerce/contracts'

const product = (overrides: Partial<CatalogProduct>): CatalogProduct =>
  ({
    id: 'p1',
    siteId: 'site-1',
    slug: 'widget',
    canonicalPath: '/store/widget',
    name: 'Widget',
    state: 'published',
    capabilities: [],
    variants: [
      {
        sku: 'W-1',
        title: 'Widget',
        optionValues: {},
        status: 'active',
        inventory: { policy: 'untracked' },
      },
    ],
    offers: [
      {
        id: 'o1',
        version: 1,
        status: 'active',
        amountMinor: '1000',
        currency: 'USD',
        taxDisplay: 'exclusive',
      },
    ],
    ...overrides,
  }) as CatalogProduct

describe('deriveCatalogListingFields (Pass 01 projection)', () => {
  it('derives the minimum purchasable price and availability', () => {
    expect(deriveCatalogListingFields(product({}))).toEqual({
      minPriceMinor: '1000',
      priceCurrency: 'USD',
      anyAvailable: true,
    })
  })

  it('takes the minimum across variants and skips sold-out tracked variants', () => {
    const derived = deriveCatalogListingFields(
      product({
        variants: [
          {
            sku: 'W-1',
            title: 'Small',
            optionValues: {},
            status: 'active',
            inventory: { policy: 'tracked', quantity: 0 },
          },
          {
            sku: 'W-2',
            title: 'Large',
            optionValues: {},
            status: 'active',
            inventory: { policy: 'untracked' },
          },
        ] as CatalogProduct['variants'],
        offers: [
          {
            id: 'o1',
            version: 1,
            status: 'active',
            variantSku: 'W-1',
            amountMinor: '500',
            currency: 'USD',
            taxDisplay: 'exclusive',
          },
          {
            id: 'o2',
            version: 1,
            status: 'active',
            variantSku: 'W-2',
            amountMinor: '2500',
            currency: 'USD',
            taxDisplay: 'exclusive',
          },
        ] as CatalogProduct['offers'],
      }),
    )
    expect(derived).toEqual({ minPriceMinor: '2500', priceCurrency: 'USD', anyAvailable: true })
  })

  it('reports unavailable when nothing is purchasable', () => {
    const derived = deriveCatalogListingFields(
      product({
        variants: [
          {
            sku: 'W-1',
            title: 'Widget',
            optionValues: {},
            status: 'active',
            inventory: { policy: 'tracked', quantity: 0 },
          },
        ] as CatalogProduct['variants'],
      }),
    )
    expect(derived.anyAvailable).toBe(false)
    expect(derived.minPriceMinor).toBeNull()
  })
})

describe('parseMoneyToMinor (Pass 02 money entry)', () => {
  it('converts using the currency exponent, never a hardcoded 100', () => {
    expect(parseMoneyToMinor('12.50', 'USD')).toBe('1250')
    expect(parseMoneyToMinor('500', 'JPY')).toBe('500')
    expect(parseMoneyToMinor('1.234', 'KWD')).toBe('1234')
    expect(parseMoneyToMinor('0.05', 'USD')).toBe('5')
  })
  it('rejects malformed and over-precise amounts', () => {
    expect(() => parseMoneyToMinor('1.005', 'USD')).toThrow()
    expect(() => parseMoneyToMinor('-3', 'USD')).toThrow()
    expect(() => parseMoneyToMinor('abc', 'USD')).toThrow()
    expect(() => parseMoneyToMinor('1,000.00', 'USD')).toThrow()
  })
})

describe('merchant configuration parsing (Pass 04)', () => {
  it('falls back to platform shipping defaults when unconfigured', () => {
    expect(merchantShippingConfig({}, 'USD')).toMatchObject({
      standardRateMinor: '500',
      freeShippingThresholdMinor: '5000',
      enableLocalPickup: true,
    })
  })
  it('honors merchant shipping configuration and explicit threshold removal', () => {
    const config = merchantShippingConfig(
      {
        shipping: {
          standardRateMinor: '1299',
          freeShippingThresholdMinor: null,
          enableLocalPickup: false,
        },
      },
      'USD',
    )
    expect(config.standardRateMinor).toBe('1299')
    expect(config.freeShippingThresholdMinor).toBeUndefined()
    expect(config.enableLocalPickup).toBe(false)
  })
  it('keeps only well-formed tax rates', () => {
    expect(
      merchantTaxConfig({
        tax: { ratesBps: { 'US:VT': 600, 'US:XX': -5, GB: 2000, bogus: 100, 'US:CA': 1.5 } },
      }).ratesBps,
    ).toEqual({ 'US:VT': 600, GB: 2000 })
  })
  it('parses policy records and versions defensively', () => {
    const configuration = {
      policies: [
        { type: 'terms', version: '3', title: 'Terms of Service', body: 'Be kind.' },
        { type: 'privacy', version: '2', url: 'https://example.com/privacy' },
        { type: 'nonsense', version: '1' },
        { type: 'returns', version: '' },
      ],
    }
    expect(merchantPolicies(configuration).map((policy) => policy.type)).toEqual([
      'terms',
      'privacy',
    ])
    expect(merchantPolicyVersions(configuration)).toEqual({ terms: '3', privacy: '2' })
  })
})

describe('merchant-configured tax (Pass 04)', () => {
  const destination = validateAddress({
    name: 'Buyer',
    line1: '1 Main St',
    city: 'Burlington',
    state: 'VT',
    postalCode: '05401',
    country: 'US',
  })
  const lines = [
    {
      lineId: 'l1',
      productId: 'p1',
      variantSku: 'W-1',
      quantity: 1,
      unitPriceMinor: '10000',
      currency: 'USD',
    },
  ]
  it('fails closed for an unmapped state with no merchant rate', async () => {
    const adapter = new BoundedJurisdictionTaxAdapter()
    await expect(
      adapter.calculateTax({
        siteId: 'site-1',
        currency: 'USD',
        destination,
        lines,
        shippingAmountMinor: '0',
      }),
    ).rejects.toBeInstanceOf(TaxCalculationUnavailableError)
  })
  it('uses the merchant rate for that same state and labels the source', async () => {
    const adapter = new BoundedJurisdictionTaxAdapter(undefined, { 'US:VT': 600 })
    const result = await adapter.calculateTax({
      siteId: 'site-1',
      currency: 'USD',
      destination,
      lines,
      shippingAmountMinor: '0',
    })
    expect(result.source).toBe('merchant-configured')
    expect(result.effectiveRateBasisPoints).toBe(600)
    expect(result.taxAmountMinor).toBe('600')
  })
  it('lets a merchant override the bounded baseline', async () => {
    const ca = validateAddress({
      name: 'Buyer',
      line1: '1 Main St',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      country: 'US',
    })
    const adapter = new BoundedJurisdictionTaxAdapter(undefined, { 'US:CA': 0 })
    const result = await adapter.calculateTax({
      siteId: 'site-1',
      currency: 'USD',
      destination: ca,
      lines,
      shippingAmountMinor: '0',
    })
    expect(result.source).toBe('merchant-configured')
    expect(result.taxAmountMinor).toBe('0')
  })
})

describe('custodial crypto adapter (Pass 05)', () => {
  const config = custodialCryptoConfigFromMerchant({
    custodialCrypto: {
      processorName: 'ProcessorPay',
      depositAddress: 'bc1qprocessor',
      lightningAddress: 'shop@processor.example',
      settlementMode: 'fiat',
      feeBasisPoints: 100,
      rateFiatPerBtc: '50000',
      observations: [],
    },
  })!
  it('parses a complete configuration and rejects incomplete ones', () => {
    expect(config.processorName).toBe('ProcessorPay')
    expect(custodialCryptoConfigFromMerchant({})).toBeNull()
    expect(
      custodialCryptoConfigFromMerchant({ custodialCrypto: { processorName: 'X' } }),
    ).toBeNull()
    expect(
      custodialCryptoConfigFromMerchant({
        custodialCrypto: {
          processorName: 'X',
          depositAddress: 'bc1q',
          settlementMode: 'sideways',
          feeBasisPoints: 100,
          rateFiatPerBtc: '50000',
        },
      }),
    ).toBeNull()
  })
  it('quotes $10 at the configured rate, rounding up', () => {
    const adapter = createCustodialCryptoAdapter(config)
    const quote = adapter.quoteInvoiceAmount({
      amountMinor: '1000',
      currency: 'USD',
      now: '2026-11-24T00:00:00.000Z',
      buyerConfirmedConversion: true,
    })
    // $10 at $50,000/BTC = 0.0002 BTC = 20,000 sats exactly.
    expect(quote.exactAmountAtomic).toBe('20000')
    expect(quote.money.quoteSource).toBe('custodial-processor')
    expect(quote.settlement).toEqual({
      settlementMode: 'fiat',
      feeBasisPoints: 100,
      feeAmountMinor: '10',
      netAmountMinor: '990',
      currency: 'USD',
    })
  })
  it('issues invoices payable to the PROCESSOR address, not a merchant wallet', async () => {
    const adapter = createCustodialCryptoAdapter(config)
    const invoice = await adapter.createInvoice({
      intentId: 'intent-1',
      network: 'bitcoin',
      asset: 'BTC',
      exactAmountAtomic: '20000',
      destination: config.depositAddress,
      expiresAt: '2026-11-24T01:00:00.000Z',
      requiredConfirmations: 1,
    })
    expect(invoice.destination).toBe('bc1qprocessor')
    expect(invoice.qrPayload).toContain('bitcoin:bc1qprocessor?amount=0.00020000')
    expect(invoice.reference).toBe('intent-1')
  })
  it('registers as a processor-managed (custodial) rail, distinct from BTCPay', () => {
    const rails = createBuiltinAdapterRegistries().paymentRails
    expect(rails.get('custodial-crypto')?.custody).toBe('processor-managed')
    expect(rails.get('btcpay')?.custody).toBe('noncustodial')
    expect(rails.get('fixture-crypto')?.custody).toBe('noncustodial')
  })
})

describe('payment method presentation (Pass 05)', () => {
  const capability = (overrides: Partial<PaymentMethodCapability>): PaymentMethodCapability =>
    ({
      id: 'cap-1',
      siteId: 'site-1',
      merchantConnectionId: 'merchant-1',
      providerKey: 'deterministic-test',
      railKey: 'internal-key-must-not-leak',
      family: 'card',
      flow: 'hosted',
      merchantCountries: ['US'],
      buyerCountries: [],
      presentmentCurrencies: ['USD'],
      settlementCurrencies: ['USD'],
      enabled: true,
      health: 'healthy',
      requiredCustomerFields: [],
      ...overrides,
    }) as PaymentMethodCapability

  it('never shows adapter or rail keys as the buyer label', () => {
    const presented = presentPaymentMethod(capability({}))
    expect(presented.label).toBe('Card')
    expect(presented.label).not.toContain('internal-key')
    expect(presented.detail).toBe('Test payment — no real charge')
  })
  it('presents custodial and noncustodial Bitcoin as distinct methods', () => {
    const noncustodial = presentPaymentMethod(
      capability({ providerKey: 'btcpay', railKey: 'btcpay', family: 'crypto', flow: 'qr' }),
    )
    expect(noncustodial.custody).toBe('noncustodial')
    expect(noncustodial.detail).toContain('seller’s own Bitcoin server')
    expect(noncustodial.paymentOptions).toEqual(['lightning', 'on-chain'])
    const custodial = presentPaymentMethod(
      capability({
        providerKey: 'custodial-crypto',
        railKey: 'custodial-crypto',
        family: 'crypto',
        flow: 'qr',
      }),
      {
        custodialCrypto: {
          processorName: 'ProcessorPay',
          depositAddress: 'bc1qprocessor',
          settlementMode: 'fiat',
          feeBasisPoints: 100,
          rateFiatPerBtc: '50000',
        },
      },
    )
    expect(custodial.custody).toBe('processor-managed')
    expect(custodial.detail).toContain('ProcessorPay')
    expect(custodial.label).toBe('Bitcoin')
  })
  it('names PayPal when a wallet capability uses it', () => {
    const presented = presentPaymentMethod(
      capability({ providerKey: 'paypal', railKey: 'paypal', family: 'wallet', flow: 'redirect' }),
    )
    expect(presented.label).toBe('PayPal')
  })
})

describe('storefront params (Pass 01)', () => {
  it('parses filters, converts price bounds with the catalog currency, and builds hrefs', () => {
    const params = parseStorefrontParams(
      { q: ' mug ', category: 'kitchen', min: '5.00', max: '20', sort: 'price-asc', page: '2' },
      'USD',
    )
    expect(params.q).toBe('mug')
    expect(params.minMinor).toBe('500')
    expect(params.maxMinor).toBe('2000')
    expect(params.sort).toBe('price-asc')
    const href = storefrontHref(params, { page: 3 })
    expect(href).toContain('category=kitchen')
    expect(href).toContain('min=5.00')
    expect(href).toContain('page=3')
    expect(href).toContain('sort=price-asc')
  })
  it('rejects unknown sorts back to newest', () => {
    expect(parseStorefrontParams({ sort: 'random' }).sort).toBe('newest')
  })
})
