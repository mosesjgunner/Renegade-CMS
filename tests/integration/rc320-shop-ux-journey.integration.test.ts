import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { getPayload } from 'payload'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import { reviewCatalogFixture } from '../helpers/review-catalog-fixture'
import { POST as cartRoute } from '../../src/app/(frontend)/api/commerce/cart/route'
import { POST as proposalRoute } from '../../src/app/(frontend)/api/commerce/proposal/route'
import { POST as initiateRoute } from '../../src/app/(frontend)/api/commerce/checkout/initiate/route'
import { GET as methodsRoute } from '../../src/app/(frontend)/api/commerce/checkout/methods/route'
import { GET as statusRoute } from '../../src/app/(frontend)/api/commerce/checkout/status/route'
import { GET as ordersRoute } from '../../src/app/(frontend)/api/commerce/orders/route'
import { POST as confirmRoute } from '../../src/app/(frontend)/api/commerce/checkout/test/confirm/route'
import { POST as cryptoVerifyRoute } from '../../src/app/(frontend)/api/commerce/crypto/verify/route'
import { processPaymentEventTask } from '../../src/modules/commerce/tasks'
import {
  listStorefrontCategories,
  parseStorefrontParams,
  queryStorefront,
  relatedProductsFor,
} from '../../src/modules/commerce/storefront'

/**
 * RC3-20 SHOP-UX (slice 3) journey proof:
 * - Pass 01: storefront filters/sort/category/featured/attribute queries on
 *   the denormalized listing projection the products hook maintains.
 * - Pass 04: merchant-configured shipping + tax + consent policy versions;
 *   explicit shipping-method selection; fail-closed tax without config.
 * - Pass 05: the $10 BTC journey in BOTH custody modes — custodial via the
 *   deterministic processor adapter (processor-reported observations are
 *   fixture evidence), noncustodial via the BTCPay Greenfield contract
 *   stub — with expired-quote, partial-payment, duplicate-webhook/replay
 *   and method-switching negatives.
 * - Pass 06: order-center data (itemized totals + fulfillment groups) on
 *   the possession-verified status route; member order history is
 *   sign-in-gated.
 */

const jsonRequest = (url: string, body: unknown, cookie?: string) =>
  new Request(url, {
    method: 'POST',
    headers: {
      host: 'localhost',
      origin: 'http://localhost',
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })

const getRequest = (url: string, cookie?: string) =>
  new Request(url, {
    method: 'GET',
    headers: { host: 'localhost', ...(cookie ? { cookie } : {}) },
  })

const texasAddress = {
  name: 'Guest Buyer',
  line1: '100 Main St',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
}
const vermontAddress = {
  name: 'Guest Buyer',
  line1: '1 Church St',
  city: 'Burlington',
  state: 'VT',
  postalCode: '05401',
  country: 'US',
}

const proposalBodyFor = (shippingAddress: Record<string, string>) => ({
  customer: { email: 'guest@example.com', name: 'Guest Buyer', country: 'US' },
  shippingAddress,
  billingAddress: shippingAddress,
  consents: { termsAccepted: true, privacyAccepted: true, marketingAccepted: false },
})

async function enableCheckout(payload: any, siteId: string) {
  const settings = await payload.findGlobal({ slug: 'site-settings', overrideAccess: true })
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOriginsBySite: {
        ...((settings.canonicalOriginsBySite as Record<string, unknown> | null) ?? {}),
        [siteId]: 'http://localhost',
      },
      adminExperience: {
        ...(settings.adminExperience ?? {}),
        optionalCapabilities: {
          ...(settings.adminExperience?.optionalCapabilities ?? {}),
          commerceCheckout: true,
        },
      },
    },
    overrideAccess: true,
  })
}

async function createProduct(
  payload: any,
  demo: any,
  siteId: string,
  merchantId: string,
  data: Record<string, unknown>,
) {
  const product = await payload.create({
    collection: 'products',
    data: { site: siteId, merchantConnection: merchantId, state: 'draft', ...data },
    overrideAccess: true,
  })
  await reviewCatalogFixture(demo.cookieHeader, String(product.id))
  return product
}

const offer = (id: string, sku: string, amountMinor: string) => ({
  id,
  version: 1,
  status: 'active',
  variantSku: sku,
  amountMinor,
  currency: 'USD',
  taxDisplay: 'exclusive',
  segmentPolicy: { mode: 'public' },
})

const physicalVariant = (sku: string, extra: Record<string, unknown> = {}) => ({
  sku,
  title: sku,
  status: 'active',
  inventoryPolicy: 'tracked',
  inventoryQuantity: 5,
  weightGrams: 300,
  dimensionsMm: { length: 200, width: 150, height: 100 },
  ...extra,
})

async function addToCart(cookie: string | undefined, productId: string, variantSku: string) {
  const res = await cartRoute(
    jsonRequest(
      'http://localhost/api/commerce/cart',
      { productId, variantSku, quantity: 1 },
      cookie,
    ),
  )
  expect(res.status, await res.clone().text()).toBe(200)
  const setCookie = res.headers.get('set-cookie')
  return setCookie ? setCookie.split(';')[0] : (cookie as string)
}

async function createMerchant(
  payload: any,
  siteId: string,
  suffix: string,
  configuration: Record<string, unknown>,
  providerKey = 'deterministic-test',
) {
  return payload.create({
    collection: 'merchant-connections',
    data: {
      site: siteId,
      label: `RC320 UX merchant ${suffix}`,
      providerKey,
      merchantCountry: 'US',
      status: 'active',
      configuration,
    },
    overrideAccess: true,
  })
}

async function createCapability(
  payload: any,
  siteId: string,
  merchantId: string,
  suffix: string,
  providerKey: string,
  family: string,
  flow: string,
) {
  return payload.create({
    collection: 'payment-method-capabilities',
    data: {
      site: siteId,
      merchantConnection: merchantId,
      providerKey,
      railKey: `rc320-ux-${providerKey}-${suffix}`,
      family,
      flow,
      merchantCountries: ['US'],
      buyerCountries: ['US'],
      presentmentCurrencies: ['USD'],
      settlementCurrencies: ['USD'],
      enabled: true,
      health: 'healthy',
    },
    overrideAccess: true,
  })
}

// --- BTCPay Greenfield contract stub (same contract as the slice-2 suite) --

type StubInvoice = { id: string; status: string; additionalStatus: string; amount: string }
const stubInvoices = new Map<string, StubInvoice>()
let stubServer: Server
let stubBaseUrl = ''

function startBtcpayStub(): Promise<void> {
  stubServer = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const send = (value: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
    }
    if (url.pathname.endsWith('/rates'))
      return send([
        { currencyPair: url.searchParams.get('currencyPair') ?? 'BTC_USD', rate: '100000.00' },
      ])
    if (url.pathname.endsWith('/invoices') && req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        const parsed = JSON.parse(body)
        const id = `stub-inv-ux-${stubInvoices.size + 1}`
        stubInvoices.set(id, { id, status: 'New', additionalStatus: 'None', amount: parsed.amount })
        send({
          id,
          status: 'New',
          amount: parsed.amount,
          currency: 'BTC',
          checkoutLink: `${stubBaseUrl}/i/${id}`,
        })
      })
      return
    }
    const methodsMatch = url.pathname.match(/\/invoices\/([^/]+)\/payment-methods$/)
    if (methodsMatch) {
      const invoice = stubInvoices.get(methodsMatch[1])
      return send([
        {
          paymentMethodId: 'BTC-CHAIN',
          destination: 'bc1qstubdestination000000000000000000000',
          paymentLink: `bitcoin:bc1qstubdestination000000000000000000000?amount=${invoice?.amount ?? '0'}`,
        },
      ])
    }
    const invoiceMatch = url.pathname.match(/\/invoices\/([^/]+)$/)
    if (invoiceMatch) {
      const invoice = stubInvoices.get(invoiceMatch[1])
      if (!invoice) return send({ message: 'not found' }, 404)
      return send({
        id: invoice.id,
        status: invoice.status,
        additionalStatus: invoice.additionalStatus,
      })
    }
    return send({ message: 'unmatched' }, 404)
  })
  return new Promise((resolve) => {
    stubServer.listen(0, '127.0.0.1', () => {
      const address = stubServer.address()
      stubBaseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
      resolve()
    })
  })
}

beforeAll(async () => {
  await startBtcpayStub()
})
afterAll(async () => {
  await new Promise((resolve) => stubServer.close(resolve))
})

// --- Journeys ---------------------------------------------------------------

describe('RC3-20 SHOP-UX slice 3', () => {
  it('Pass 01 — storefront filters, sorting, categories, featured and attributes', async () => {
    const payload: any = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    await enableCheckout(payload, siteId)
    const suffix = randomUUID().slice(0, 8)
    const merchant: any = await createMerchant(payload, siteId, suffix, {})

    const category: any = await payload.create({
      collection: 'categories',
      data: {
        site: siteId,
        scope: 'site',
        name: `UX Kitchen ${suffix}`,
        slug: `ux-kitchen-${suffix}`,
      },
      overrideAccess: true,
    })

    const mug = (name: string, sku: string, price: string, color: string, extra: any = {}) =>
      createProduct(payload, demo, siteId, merchant.id, {
        name,
        slug: `${sku.toLowerCase()}-${suffix}`,
        canonicalPath: `/store/${sku.toLowerCase()}-${suffix}`,
        kind: 'physical',
        productCapabilities: ['shippable'],
        categories: category.id,
        optionDimensions: [{ key: 'color', label: 'Color', values: ['red', 'blue'] }],
        variants: [physicalVariant(sku, { optionValues: { color } })],
        prices: [{ currency: 'USD', amountMinor: price, variantSku: sku }],
        offers: [offer(`offer-${sku}-${suffix}`, sku, price)],
        ...extra,
      })

    const prefix = `UXSF ${suffix}`
    const alpha = await mug(`${prefix} Alpha Mug`, `UXA-${suffix}`, '500', 'red', {
      featured: true,
    })
    const beta = await mug(`${prefix} Beta Mug`, `UXB-${suffix}`, '1500', 'blue')
    const gamma = await createProduct(payload, demo, siteId, merchant.id, {
      name: `${prefix} Gamma Poster`,
      slug: `uxg-${suffix}`,
      canonicalPath: `/store/uxg-${suffix}`,
      kind: 'physical',
      productCapabilities: ['shippable'],
      variants: [physicalVariant(`UXG-${suffix}`, { inventoryQuantity: 0 })],
      prices: [{ currency: 'USD', amountMinor: '2500', variantSku: `UXG-${suffix}` }],
      offers: [offer(`offer-uxg-${suffix}`, `UXG-${suffix}`, '2500')],
    })

    // The products hook maintains the listing projection at write time.
    const alphaDoc: any = await payload.findByID({
      collection: 'products',
      id: alpha.id,
      overrideAccess: true,
    })
    expect(alphaDoc.minPriceMinor).toBe(500)
    expect(alphaDoc.priceCurrency).toBe('USD')
    expect(alphaDoc.anyAvailable).toBe(true)
    expect(alphaDoc.featured).toBe(true)
    const gammaDoc: any = await payload.findByID({
      collection: 'products',
      id: gamma.id,
      overrideAccess: true,
    })
    expect(gammaDoc.anyAvailable).toBe(false)

    const query = (input: Record<string, string | undefined>) =>
      queryStorefront(payload, siteId, parseStorefrontParams({ q: prefix, ...input }, 'USD'), 0)
    const names = (result: any) => result.docs.map((doc: any) => doc.name)

    const all = await query({})
    expect(names(all)).toEqual(
      expect.arrayContaining([
        `${prefix} Alpha Mug`,
        `${prefix} Beta Mug`,
        `${prefix} Gamma Poster`,
      ]),
    )

    const byCategory = await query({ category: `ux-kitchen-${suffix}` })
    expect(names(byCategory)).toEqual(
      expect.arrayContaining([`${prefix} Alpha Mug`, `${prefix} Beta Mug`]),
    )
    expect(names(byCategory)).not.toContain(`${prefix} Gamma Poster`)

    const byPrice = await query({ min: '10', max: '20' })
    expect(names(byPrice)).toEqual([`${prefix} Beta Mug`])

    const available = await query({ availability: 'available' })
    expect(names(available)).not.toContain(`${prefix} Gamma Poster`)
    expect(names(available)).toContain(`${prefix} Alpha Mug`)

    const sorted = await query({ sort: 'price-asc' })
    expect(names(sorted)).toEqual([
      `${prefix} Alpha Mug`,
      `${prefix} Beta Mug`,
      `${prefix} Gamma Poster`,
    ])

    const featured = await query({ featured: '1' })
    expect(names(featured)).toEqual([`${prefix} Alpha Mug`])

    const byAttribute = await query({ attr: 'color', attrValue: 'blue' })
    expect(byAttribute.attributeFiltered).toBe(true)
    expect(names(byAttribute)).toEqual([`${prefix} Beta Mug`])

    const categories = await listStorefrontCategories(payload, siteId)
    const kitchen = categories.find((entry) => entry.slug === `ux-kitchen-${suffix}`)
    expect(kitchen?.count).toBe(2)

    const related = await relatedProductsFor(payload, alphaDoc, siteId)
    expect(related.map((doc: any) => String(doc.id))).toContain(String(beta.id))
    expect(related.map((doc: any) => String(doc.id))).not.toContain(String(alpha.id))
  })

  it('Pass 04 — merchant-configured shipping/tax, consent versions, fail-closed tax', async () => {
    const payload: any = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    await enableCheckout(payload, siteId)
    const suffix = randomUUID().slice(0, 8)

    const merchant: any = await createMerchant(payload, siteId, suffix, {
      shipping: {
        standardRateMinor: '700',
        freeShippingThresholdMinor: null,
        enableLocalPickup: false,
      },
      tax: { ratesBps: { 'US:VT': 600 } },
      policies: [
        { type: 'terms', version: '3', title: 'Terms of Service', body: 'Be kind.' },
        { type: 'privacy', version: '2', url: 'https://example.com/privacy' },
      ],
    })
    await createCapability(
      payload,
      siteId,
      merchant.id,
      suffix,
      'deterministic-test',
      'card',
      'hosted',
    )
    const product = await createProduct(payload, demo, siteId, merchant.id, {
      name: `UX Tax Widget ${suffix}`,
      slug: `ux-tax-${suffix}`,
      canonicalPath: `/store/ux-tax-${suffix}`,
      kind: 'physical',
      productCapabilities: ['shippable'],
      variants: [physicalVariant(`UXT-${suffix}`)],
      prices: [{ currency: 'USD', amountMinor: '1000', variantSku: `UXT-${suffix}` }],
      offers: [offer(`offer-uxt-${suffix}`, `UXT-${suffix}`, '1000')],
    })

    const cookie = await addToCart(undefined, String(product.id), `UXT-${suffix}`)
    const proposalRes = await proposalRoute(
      jsonRequest(
        'http://localhost/api/commerce/proposal',
        proposalBodyFor(vermontAddress),
        cookie,
      ),
    )
    expect(proposalRes.status, await proposalRes.clone().text()).toBe(200)
    const body = await proposalRes.json()
    const { proposal } = body
    // Merchant rates, not platform defaults: $7 flat, no pickup, no free tier.
    expect(body.shippingOptions).toHaveLength(1)
    expect(body.shippingOptions[0].rates.map((rate: any) => rate.id)).toEqual([
      'rate_standard_flat',
    ])
    expect(body.shippingOptions[0].rates[0].amountMinor).toBe('700')
    expect(proposal.pricingSnapshot.netShippingMinor).toBe('700')
    // Merchant-configured VT rate (6% of $10 = $0.60), labeled as such.
    expect(proposal.taxSnapshot.source).toBe('merchant-configured')
    expect(proposal.pricingSnapshot.taxTotalMinor).toBe('60')
    // Consent carries the policy versions in force.
    expect(proposal.consents.policyVersions).toEqual({ terms: '3', privacy: '2' })
    const stored: any = await payload.findByID({
      collection: 'checkout-proposals',
      id: proposal.id,
      overrideAccess: true,
    })
    expect(stored.consents.policyVersions).toEqual({ terms: '3', privacy: '2' })

    // A merchant WITHOUT a configured VT rate fails closed before charging.
    const plainMerchant: any = await createMerchant(payload, siteId, `${suffix}b`, {})
    await createCapability(
      payload,
      siteId,
      plainMerchant.id,
      `${suffix}b`,
      'deterministic-test',
      'card',
      'hosted',
    )
    const plainProduct = await createProduct(payload, demo, siteId, plainMerchant.id, {
      name: `UX Plain Widget ${suffix}`,
      slug: `ux-plain-${suffix}`,
      canonicalPath: `/store/ux-plain-${suffix}`,
      kind: 'physical',
      productCapabilities: ['shippable'],
      variants: [physicalVariant(`UXP-${suffix}`)],
      prices: [{ currency: 'USD', amountMinor: '1000', variantSku: `UXP-${suffix}` }],
      offers: [offer(`offer-uxp-${suffix}`, `UXP-${suffix}`, '1000')],
    })
    const plainCookie = await addToCart(undefined, String(plainProduct.id), `UXP-${suffix}`)
    const blocked = await proposalRoute(
      jsonRequest(
        'http://localhost/api/commerce/proposal',
        proposalBodyFor(vermontAddress),
        plainCookie,
      ),
    )
    expect(blocked.status).toBe(422)
    expect((await blocked.json()).code).toBe('tax_calculation_unavailable')

    // Explicit shipping-method selection: choosing pickup re-quotes at $0.
    const texasCookie = await addToCart(undefined, String(plainProduct.id), `UXP-${suffix}`)
    const pickupRes = await proposalRoute(
      jsonRequest(
        'http://localhost/api/commerce/proposal',
        { ...proposalBodyFor(texasAddress), selectedShippingRateId: 'rate_local_pickup' },
        texasCookie,
      ),
    )
    expect(pickupRes.status, await pickupRes.clone().text()).toBe(200)
    const pickupBody = await pickupRes.json()
    expect(pickupBody.proposal.pricingSnapshot.netShippingMinor).toBe('0')
    expect(pickupBody.shippingOptions[0].selectedRateId).toBe('rate_local_pickup')
    expect(pickupBody.shippingOptions[0].rates.map((rate: any) => rate.id).sort()).toEqual([
      'rate_local_pickup',
      'rate_standard_flat',
    ])
  })

  it('Pass 05/06 — $10 BTC custodial journey: quote, partial, expired, settle, replay guards', async () => {
    process.env.LOCAL_E2E_TEST_MODE = 'true'
    const payload: any = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    await enableCheckout(payload, siteId)
    const suffix = randomUUID().slice(0, 8)
    const depositAddress = 'bc1qprocessorpay0000000000000000000000'
    const configuration: Record<string, unknown> = {
      shipping: {
        standardRateMinor: '0',
        freeShippingThresholdMinor: null,
        enableLocalPickup: false,
      },
      custodialCrypto: {
        processorName: 'ProcessorPay',
        depositAddress,
        lightningAddress: 'shop@processor.example',
        settlementMode: 'fiat',
        feeBasisPoints: 100,
        rateFiatPerBtc: '100000',
        observations: [] as unknown[],
      },
    }
    const merchant: any = await createMerchant(
      payload,
      siteId,
      suffix,
      configuration,
      'custodial-crypto',
    )
    const setObservations = async (observations: unknown[]) => {
      ;(configuration.custodialCrypto as any).observations = observations
      await payload.update({
        collection: 'merchant-connections',
        id: merchant.id,
        data: { configuration },
        overrideAccess: true,
      })
    }
    const capability = await createCapability(
      payload,
      siteId,
      merchant.id,
      suffix,
      'custodial-crypto',
      'crypto',
      'qr',
    )
    const product = await createProduct(payload, demo, siteId, merchant.id, {
      name: `UX Custodial Widget ${suffix}`,
      slug: `ux-cust-${suffix}`,
      canonicalPath: `/store/ux-cust-${suffix}`,
      kind: 'physical',
      productCapabilities: ['shippable'],
      variants: [physicalVariant(`UXC-${suffix}`)],
      prices: [{ currency: 'USD', amountMinor: '1000', variantSku: `UXC-${suffix}` }],
      offers: [offer(`offer-uxc-${suffix}`, `UXC-${suffix}`, '1000')],
    })

    const cookie = await addToCart(undefined, String(product.id), `UXC-${suffix}`)
    const proposalRes = await proposalRoute(
      jsonRequest('http://localhost/api/commerce/proposal', proposalBodyFor(texasAddress), cookie),
    )
    expect(proposalRes.status, await proposalRes.clone().text()).toBe(200)
    const { proposal } = await proposalRes.json()
    // $10.00 + $0.00 shipping + $0.62 TX tax = $10.62.
    expect(proposal.pricingSnapshot.grandTotalMinor).toBe('1062')

    // Presentation: recognizable Bitcoin method, custody explained, no keys.
    const methodsRes = await methodsRoute(
      getRequest(`http://localhost/api/commerce/checkout/methods?proposal=${proposal.id}`, cookie),
    )
    expect(methodsRes.status, await methodsRes.clone().text()).toBe(200)
    const { methods } = await methodsRes.json()
    const btc = methods.find((method: any) => method.providerKey === 'custodial-crypto')
    expect(btc.label).toBe('Bitcoin')
    expect(btc.custody).toBe('processor-managed')
    expect(btc.detail).toContain('ProcessorPay')
    expect(btc.paymentOptions).toEqual(['lightning', 'on-chain'])
    for (const method of methods) {
      expect(method.label).not.toBe(method.providerKey)
      expect(method.label).not.toContain('custodial-crypto')
    }

    const initRes = await initiateRoute(
      jsonRequest(
        'http://localhost/api/commerce/checkout/initiate',
        { proposalId: proposal.id, capabilityId: String(capability.id) },
        cookie,
      ),
    )
    expect(initRes.status, await initRes.clone().text()).toBe(200)
    const checkout = await initRes.json()
    const orderCookie = initRes.headers.get('set-cookie')!.split(';')[0]
    expect(checkout.flow).toBe('qr')
    // Funds go to the PROCESSOR's address; the quote froze at initiation.
    expect(checkout.cryptoInvoice.destination).toBe(depositAddress)
    expect(checkout.cryptoInvoice.exactAmountAtomic).toBe('10620')
    expect(checkout.custodial.lightningAddress).toBe('shop@processor.example')
    const intent: any = await payload.findByID({
      collection: 'payment-intents',
      id: checkout.intentId,
      overrideAccess: true,
    })
    expect(intent.fxQuote.quoteSource).toBe('custodial-processor')
    expect(intent.fxQuote.settlement).toMatchObject({
      settlementMode: 'fiat',
      feeAmountMinor: '11',
      netAmountMinor: '1051',
    })

    const verify = (transactionId: string) =>
      cryptoVerifyRoute(
        jsonRequest(
          'http://localhost/api/commerce/crypto/verify',
          { intentId: checkout.intentId, transactionId },
          cookie,
        ),
      )
    const paidOrders = async () =>
      (
        await payload.find({
          collection: 'orders',
          where: { checkoutSession: { equals: checkout.sessionId } },
          overrideAccess: true,
        })
      ).docs

    // Unknown transaction: refused, no order.
    expect((await verify('tx-unknown')).status).toBe(422)
    expect(await paidOrders()).toHaveLength(0)

    const observation = (transactionId: string, amountAtomic: string) => ({
      transactionId,
      network: 'bitcoin',
      asset: 'BTC',
      destination: depositAddress,
      amountAtomic,
      confirmations: 1,
      observedAt: new Date().toISOString(),
    })

    // Partial payment: seen, not accepted, no order.
    await setObservations([observation('tx-partial', '5000')])
    const partialRes = await verify('tx-partial')
    expect(partialRes.status).toBe(200)
    const partial = await partialRes.json()
    expect(partial.confirmed).toBe(false)
    expect(partial.state).toBe('underpaid')
    expect(await paidOrders()).toHaveLength(0)

    // Expired quote: even a full payment observed now cannot settle.
    const originalExpiry = intent.expiresAt
    const liveIntent: any = await payload.findByID({
      collection: 'payment-intents',
      id: checkout.intentId,
      overrideAccess: true,
    })
    await payload.update({
      collection: 'payment-intents',
      id: checkout.intentId,
      data: {
        cryptoInvoice: {
          ...liveIntent.cryptoInvoice,
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        },
      },
      overrideAccess: true,
    })
    await setObservations([observation('tx-partial', '5000'), observation('tx-full', '10620')])
    const expiredRes = await verify('tx-full')
    expect(expiredRes.status).toBe(200)
    const expired = await expiredRes.json()
    expect(expired.confirmed).toBe(false)
    expect(expired.state).toBe('late')
    expect(await paidOrders()).toHaveLength(0)
    await payload.update({
      collection: 'payment-intents',
      id: checkout.intentId,
      data: {
        cryptoInvoice: { ...liveIntent.cryptoInvoice, expiresAt: originalExpiry },
      },
      overrideAccess: true,
    })

    // Full payment inside the window: exactly one paid order with receipt.
    const settledRes = await verify('tx-full')
    expect(settledRes.status, await settledRes.clone().text()).toBe(200)
    expect((await settledRes.json()).confirmed).toBe(true)
    const orders = await paidOrders()
    expect(orders).toHaveLength(1)
    expect(orders[0].state).toBe('paid')
    expect((orders[0].receipt as any)?.state).toBe('issued')
    expect(orders[0].totalsSnapshot.grandTotalMinor).toBe('1062')

    // Duplicate verification is a replay-safe refresh — still one order.
    const duplicateRes = await verify('tx-full')
    expect(duplicateRes.status).toBe(200)
    expect((await duplicateRes.json()).confirmed).toBe(true)
    expect(await paidOrders()).toHaveLength(1)

    // Pass 06: the order center reads the same canonical record back.
    const statusRes = await statusRoute(
      getRequest(
        `http://localhost/api/commerce/checkout/status?session=${checkout.sessionId}`,
        orderCookie,
      ),
    )
    expect(statusRes.status, await statusRes.clone().text()).toBe(200)
    const status = await statusRes.json()
    expect(status.order.totalsSnapshot.grandTotalMinor).toBe('1062')
    expect(status.order.fulfillment.groups.map((group: any) => group.kind)).toContain('physical')
    // Member order history is sign-in gated.
    const ordersRes = await ordersRoute(getRequest('http://localhost/api/commerce/orders'))
    expect(ordersRes.status).toBe(401)

    // The same transaction can never settle a second checkout.
    const cookie2 = await addToCart(undefined, String(product.id), `UXC-${suffix}`)
    const proposal2Res = await proposalRoute(
      jsonRequest('http://localhost/api/commerce/proposal', proposalBodyFor(texasAddress), cookie2),
    )
    const { proposal: proposal2 } = await proposal2Res.json()
    const init2Res = await initiateRoute(
      jsonRequest(
        'http://localhost/api/commerce/checkout/initiate',
        { proposalId: proposal2.id, capabilityId: String(capability.id) },
        cookie2,
      ),
    )
    expect(init2Res.status, await init2Res.clone().text()).toBe(200)
    const checkout2 = await init2Res.json()
    const replayRes = await cryptoVerifyRoute(
      jsonRequest(
        'http://localhost/api/commerce/crypto/verify',
        { intentId: checkout2.intentId, transactionId: 'tx-full' },
        cookie2,
      ),
    )
    expect(replayRes.status).toBe(422)
  })

  it('Pass 05 — $10 BTC noncustodial journey over the BTCPay contract stub, with negatives', async () => {
    process.env.LOCAL_E2E_TEST_MODE = 'true'
    const payload: any = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    await enableCheckout(payload, siteId)
    const suffix = randomUUID().slice(0, 8)
    const merchant: any = await createMerchant(
      payload,
      siteId,
      suffix,
      { btcpay: { serverUrl: stubBaseUrl, storeId: 'stub-store', apiKey: 'stub-key' } },
      'btcpay',
    )
    const capability = await createCapability(
      payload,
      siteId,
      merchant.id,
      suffix,
      'btcpay',
      'crypto',
      'qr',
    )
    const product = await createProduct(payload, demo, siteId, merchant.id, {
      name: `UX BTCPay Widget ${suffix}`,
      slug: `ux-btcpay-${suffix}`,
      canonicalPath: `/store/ux-btcpay-${suffix}`,
      kind: 'physical',
      productCapabilities: ['shippable'],
      variants: [physicalVariant(`UXN-${suffix}`)],
      prices: [{ currency: 'USD', amountMinor: '1000', variantSku: `UXN-${suffix}` }],
      offers: [offer(`offer-uxn-${suffix}`, `UXN-${suffix}`, '1000')],
    })
    const cookie = await addToCart(undefined, String(product.id), `UXN-${suffix}`)
    const proposalRes = await proposalRoute(
      jsonRequest('http://localhost/api/commerce/proposal', proposalBodyFor(texasAddress), cookie),
    )
    expect(proposalRes.status, await proposalRes.clone().text()).toBe(200)
    const { proposal } = await proposalRes.json()
    const grandTotal = BigInt(proposal.pricingSnapshot.grandTotalMinor)

    const methodsRes = await methodsRoute(
      getRequest(`http://localhost/api/commerce/checkout/methods?proposal=${proposal.id}`, cookie),
    )
    const { methods } = await methodsRes.json()
    const btc = methods.find((method: any) => method.providerKey === 'btcpay')
    expect(btc.custody).toBe('noncustodial')
    expect(btc.detail).toContain('own Bitcoin server')

    const initRes = await initiateRoute(
      jsonRequest(
        'http://localhost/api/commerce/checkout/initiate',
        { proposalId: proposal.id, capabilityId: String(capability.id) },
        cookie,
      ),
    )
    expect(initRes.status, await initRes.clone().text()).toBe(200)
    const checkout = await initRes.json()
    expect(checkout.cryptoInvoice.exactAmountAtomic).toBe((grandTotal * 10n).toString())
    const intent: any = await payload.findByID({
      collection: 'payment-intents',
      id: checkout.intentId,
      overrideAccess: true,
    })
    const invoiceId = String(intent.cryptoInvoice.reference)
    const stub = stubInvoices.get(invoiceId)!
    const verify = () =>
      cryptoVerifyRoute(
        jsonRequest(
          'http://localhost/api/commerce/crypto/verify',
          { intentId: checkout.intentId },
          cookie,
        ),
      )
    const orders = async () =>
      (
        await payload.find({
          collection: 'orders',
          where: { checkoutSession: { equals: checkout.sessionId } },
          overrideAccess: true,
        })
      ).docs

    // Expired unpaid invoice: refused.
    stub.status = 'Expired'
    stub.additionalStatus = 'None'
    let res = await verify()
    expect(res.status).toBe(200)
    let body = await res.json()
    expect(body.confirmed).toBe(false)
    expect(body.state).toBe('expired')

    // Partial payment on the expired invoice: manual reconciliation only.
    stub.additionalStatus = 'PaidPartial'
    res = await verify()
    body = await res.json()
    expect(body.confirmed).toBe(false)
    expect(body.state).toBe('underpaid')
    expect(body.manualReconciliationAllowed).toBe(true)
    expect(await orders()).toHaveLength(0)

    // Overpayment: real money in the wrong shape — never auto-accepted.
    stub.status = 'Settled'
    stub.additionalStatus = 'PaidOver'
    res = await verify()
    body = await res.json()
    expect(body.confirmed).toBe(false)
    expect(body.state).toBe('overpaid')
    expect(await orders()).toHaveLength(0)

    // Plain settlement on the merchant's own server: exactly one order.
    stub.additionalStatus = 'None'
    res = await verify()
    expect(res.status, await res.clone().text()).toBe(200)
    body = await res.json()
    expect(body.confirmed).toBe(true)
    const settled = await orders()
    expect(settled).toHaveLength(1)
    expect(settled[0].state).toBe('paid')
  })

  it('Pass 05 — switching payment methods supersedes the earlier intent', async () => {
    process.env.LOCAL_E2E_TEST_MODE = 'true'
    const payload: any = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    await enableCheckout(payload, siteId)
    const suffix = randomUUID().slice(0, 8)
    const depositAddress = 'bc1qswitchprocessor000000000000000000'
    const merchant: any = await createMerchant(payload, siteId, suffix, {
      shipping: {
        standardRateMinor: '0',
        freeShippingThresholdMinor: null,
        enableLocalPickup: false,
      },
      custodialCrypto: {
        processorName: 'ProcessorPay',
        depositAddress,
        settlementMode: 'fiat',
        feeBasisPoints: 100,
        rateFiatPerBtc: '100000',
        observations: [
          {
            transactionId: 'tx-switch',
            network: 'bitcoin',
            asset: 'BTC',
            destination: depositAddress,
            amountAtomic: '10620',
            confirmations: 1,
            observedAt: new Date().toISOString(),
          },
        ],
      },
    })
    const cryptoCapability = await createCapability(
      payload,
      siteId,
      merchant.id,
      suffix,
      'custodial-crypto',
      'crypto',
      'qr',
    )
    const cardCapability = await createCapability(
      payload,
      siteId,
      merchant.id,
      suffix,
      'deterministic-test',
      'card',
      'hosted',
    )
    const product = await createProduct(payload, demo, siteId, merchant.id, {
      name: `UX Switch Widget ${suffix}`,
      slug: `ux-switch-${suffix}`,
      canonicalPath: `/store/ux-switch-${suffix}`,
      kind: 'physical',
      productCapabilities: ['shippable'],
      variants: [physicalVariant(`UXS-${suffix}`)],
      prices: [{ currency: 'USD', amountMinor: '1000', variantSku: `UXS-${suffix}` }],
      offers: [offer(`offer-uxs-${suffix}`, `UXS-${suffix}`, '1000')],
    })
    const cookie = await addToCart(undefined, String(product.id), `UXS-${suffix}`)
    const proposalRes = await proposalRoute(
      jsonRequest('http://localhost/api/commerce/proposal', proposalBodyFor(texasAddress), cookie),
    )
    const { proposal } = await proposalRes.json()

    // Start with Bitcoin, then switch to card before paying.
    const cryptoInit = await initiateRoute(
      jsonRequest(
        'http://localhost/api/commerce/checkout/initiate',
        { proposalId: proposal.id, capabilityId: String(cryptoCapability.id) },
        cookie,
      ),
    )
    expect(cryptoInit.status, await cryptoInit.clone().text()).toBe(200)
    const cryptoCheckout = await cryptoInit.json()
    const cardInit = await initiateRoute(
      jsonRequest(
        'http://localhost/api/commerce/checkout/initiate',
        { proposalId: proposal.id, capabilityId: String(cardCapability.id) },
        cookie,
      ),
    )
    expect(cardInit.status, await cardInit.clone().text()).toBe(200)
    const cardCheckout = await cardInit.json()
    expect(cardCheckout.sessionId).toBe(cryptoCheckout.sessionId)

    // The abandoned Bitcoin intent is cancelled and can no longer settle.
    const staleIntent: any = await payload.findByID({
      collection: 'payment-intents',
      id: cryptoCheckout.intentId,
      overrideAccess: true,
    })
    expect(staleIntent.state).toBe('cancelled')
    const staleVerify = await cryptoVerifyRoute(
      jsonRequest(
        'http://localhost/api/commerce/crypto/verify',
        { intentId: cryptoCheckout.intentId, transactionId: 'tx-switch' },
        cookie,
      ),
    )
    expect(staleVerify.status).toBe(409)

    // The card payment completes exactly one order.
    const reference = String(cardCheckout.actionUrl).split('/').at(-1)!
    const checkoutCookie = cardInit.headers.get('set-cookie')!.split(';')[0]
    const confirmRes = await confirmRoute(
      new Request('http://localhost/api/commerce/checkout/test/confirm', {
        method: 'POST',
        headers: {
          host: 'localhost',
          origin: 'http://localhost',
          cookie: `${cookie}; ${checkoutCookie}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: `reference=${encodeURIComponent(reference)}`,
      }),
    )
    expect(confirmRes.status).toBe(303)
    const inbox = await payload.find({
      collection: 'payment-webhook-events',
      where: { providerEventId: { equals: `local-test-paid:${cardCheckout.attemptId}` } },
      limit: 1,
      overrideAccess: true,
    })
    expect(inbox.docs).toHaveLength(1)
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId: String(inbox.docs[0].id) },
      req: { payload },
    })
    const orders = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: cardCheckout.sessionId } },
      overrideAccess: true,
    })
    expect(orders.docs).toHaveLength(1)
    expect(orders.docs[0].state).toBe('paid')
  })
})
