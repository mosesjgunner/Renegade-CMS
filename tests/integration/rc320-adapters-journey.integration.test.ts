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
import { POST as confirmRoute } from '../../src/app/(frontend)/api/commerce/checkout/test/confirm/route'
import { POST as cryptoVerifyRoute } from '../../src/app/(frontend)/api/commerce/crypto/verify/route'
import { processPaymentEventTask } from '../../src/modules/commerce/tasks'

/**
 * RC3-20 Layer A journey proof: a mixed cart (own inventory + generic
 * dropship + affiliate) closes as one payable order with per-group shipping
 * and a terminal referral group; the same mixed payable cart paid over the
 * BTCPay rail settles only on server-queried BTCPay evidence.
 *
 * BTCPay is the merchant's own server in production. Here it is a local HTTP
 * stub implementing the Greenfield contract (rates / invoice create /
 * payment methods / invoice status) so the REAL adapter code runs over real
 * HTTP. The stub is a contract fixture, not a live BTCPay receipt — the live
 * instance leg is labeled not-run in the RC3-20 evidence.
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

const shippingAddress = {
  name: 'Guest Buyer',
  line1: '100 Main St',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
}

const proposalBody = {
  customer: { email: 'guest@example.com', name: 'Guest Buyer', country: 'US' },
  shippingAddress,
  billingAddress: shippingAddress,
  consents: { termsAccepted: true, privacyAccepted: true, marketingAccepted: false },
}

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

async function addToCart(cookie: string | undefined, productId: string, variantSku: string) {
  const res = await cartRoute(
    jsonRequest(
      'http://localhost/api/commerce/cart',
      { productId, variantSku, quantity: 1 },
      cookie,
    ),
  )
  expect(res.status, await res.clone().text()).toBe(200)
  // The route sets the session cookie only when it creates the cart; later
  // adds on the same cart keep the incoming cookie.
  const setCookie = res.headers.get('set-cookie')
  return setCookie ? setCookie.split(';')[0] : (cookie as string)
}

// --- BTCPay Greenfield contract stub ---------------------------------------

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
        const id = `stub-inv-${stubInvoices.size + 1}`
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

describe('RC3-20 Layer A — mixed-source cart and BTCPay rail', () => {
  it('own + dropship + affiliate: one payable order, per-group shipping, terminal referral group', async () => {
    process.env.LOCAL_E2E_TEST_MODE = 'true'
    const payload: any = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    await enableCheckout(payload, siteId)
    const suffix = randomUUID().slice(0, 8)

    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteId,
        label: `RC320 adapters merchant ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    })
    const capability = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        providerKey: 'deterministic-test',
        railKey: `rc320-adp-card-${suffix}`,
        family: 'card',
        flow: 'hosted',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['USD'],
        settlementCurrencies: ['USD'],
        enabled: true,
        health: 'healthy',
      },
      overrideAccess: true,
    })

    const own = await createProduct(payload, demo, siteId, merchant.id, {
      name: `Own Widget ${suffix}`,
      slug: `own-widget-${suffix}`,
      canonicalPath: `/store/own-widget-${suffix}`,
      kind: 'physical',
      productCapabilities: ['shippable'],
      variants: [
        {
          sku: `OWN-${suffix}`,
          title: 'Own Widget',
          status: 'active',
          inventoryPolicy: 'tracked',
          inventoryQuantity: 5,
          weightGrams: 300,
          dimensionsMm: { length: 200, width: 150, height: 100 },
        },
      ],
      prices: [{ currency: 'USD', amountMinor: '1000', variantSku: `OWN-${suffix}` }],
      offers: [offer(`offer-own-${suffix}`, `OWN-${suffix}`, '1000')],
    })
    const dropship = await createProduct(payload, demo, siteId, merchant.id, {
      name: `Drop Widget ${suffix}`,
      slug: `drop-widget-${suffix}`,
      canonicalPath: `/store/drop-widget-${suffix}`,
      kind: 'physical',
      productCapabilities: ['shippable'],
      variants: [
        {
          sku: `DROP-${suffix}`,
          title: 'Drop Widget',
          status: 'active',
          inventoryPolicy: 'external-hook',
          weightGrams: 400,
          dimensionsMm: { length: 250, width: 200, height: 120 },
        },
      ],
      prices: [{ currency: 'USD', amountMinor: '2000', variantSku: `DROP-${suffix}` }],
      offers: [offer(`offer-drop-${suffix}`, `DROP-${suffix}`, '2000')],
      sourcePolicy: {
        variants: {
          [`DROP-${suffix}`]: {
            type: 'dropship',
            providerKey: 'generic-dropship',
            externalRef: 'ext-widget',
            observed: {
              costMinor: '1200',
              currency: 'USD',
              available: true,
              observedAt: new Date().toISOString(),
            },
          },
        },
      },
    })
    const affiliate = await createProduct(payload, demo, siteId, merchant.id, {
      name: `Affiliate Widget ${suffix}`,
      slug: `affiliate-widget-${suffix}`,
      canonicalPath: `/store/affiliate-widget-${suffix}`,
      kind: 'affiliate',
      productCapabilities: ['affiliate'],
      variants: [
        {
          sku: `AFF-${suffix}`,
          title: 'Affiliate Widget',
          status: 'active',
          inventoryPolicy: 'affiliate',
        },
      ],
      prices: [{ currency: 'USD', amountMinor: '9999', variantSku: `AFF-${suffix}` }],
      offers: [offer(`offer-aff-${suffix}`, `AFF-${suffix}`, '9999')],
      affiliatePolicy: {
        destinationUrl: 'https://seller.example/item',
        disclosure: 'Affiliate link — purchase completes at the seller.',
        remotePrice: { amountMinor: '9999', currency: 'USD' },
        remoteAvailability: true,
        observedAt: new Date().toISOString(),
        freshnessHours: 24,
      },
    })

    let cookie = await addToCart(undefined, String(own.id), `OWN-${suffix}`)
    cookie = await addToCart(cookie, String(dropship.id), `DROP-${suffix}`)
    cookie = await addToCart(cookie, String(affiliate.id), `AFF-${suffix}`)

    const proposalRes = await proposalRoute(
      jsonRequest('http://localhost/api/commerce/proposal', proposalBody, cookie),
    )
    expect(proposalRes.status, await proposalRes.clone().text()).toBe(200)
    const { proposal } = await proposalRes.json()

    // Affiliate is excluded from every payable figure.
    expect(proposal.pricingSnapshot.subtotalMinor).toBe('3000')
    expect(proposal.pricingSnapshot.lines).toHaveLength(2)
    expect(
      proposal.pricingSnapshot.lines.some((line: any) => line.productId === String(affiliate.id)),
    ).toBe(false)
    // Two shippable groups, each quoted its own flat rate.
    expect(proposal.pricingSnapshot.netShippingMinor).toBe('1000')
    expect(BigInt(proposal.pricingSnapshot.grandTotalMinor)).toBe(
      BigInt(proposal.pricingSnapshot.subtotalMinor) +
        BigInt(proposal.pricingSnapshot.netShippingMinor) +
        BigInt(proposal.pricingSnapshot.taxTotalMinor),
    )
    const groups = Object.fromEntries(
      proposal.fulfillmentSplit.map((group: any) => [group.fulfillmentKind, group]),
    )
    expect(Object.keys(groups).sort()).toEqual(['dropship', 'physical', 'referral'])
    expect(groups.physical.shippingRate.amountMinor).toBe('500')
    expect(groups.dropship.shippingRate.amountMinor).toBe('500')
    expect(groups.dropship.items[0].sourceProviderKey).toBe('generic-dropship')
    expect(groups.referral.state).toBe('referred')
    expect(groups.referral.items[0].productId).toBe(String(affiliate.id))
    expect(groups.referral.shippingRate).toBeUndefined()

    // Pay the payable part through the sandbox rail; exactly one order closes.
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
    expect(orderCookie).toContain(`renegade_checkout_${checkout.sessionId}=`)
    const reference = String(checkout.actionUrl).split('/').at(-1)!
    const confirmRes = await confirmRoute(
      new Request('http://localhost/api/commerce/checkout/test/confirm', {
        method: 'POST',
        headers: {
          host: 'localhost',
          origin: 'http://localhost',
          cookie: orderCookie,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: `reference=${encodeURIComponent(reference)}`,
      }),
    )
    expect(confirmRes.status).toBe(303)
    const inbox = await payload.find({
      collection: 'payment-webhook-events',
      where: { providerEventId: { equals: `local-test-paid:${checkout.attemptId}` } },
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
      where: { checkoutSession: { equals: checkout.sessionId } },
      overrideAccess: true,
    })
    expect(orders.docs).toHaveLength(1)
    const order = orders.docs[0]
    expect(order.state).toBe('paid')
    expect(order.amountMinor).toBe(proposal.pricingSnapshot.grandTotalMinor)
    const orderGroups = (order.downstreamInstructions as any[]).map((g) => g.fulfillmentKind)
    expect(orderGroups.sort()).toEqual(['dropship', 'physical', 'referral'])
    // The affiliate line is not among the order's paid items.
    expect((order.items as any[]).some((item) => item.productId === String(affiliate.id))).toBe(
      false,
    )

    // An affiliate-only cart has nothing payable: no proposal is issued.
    const affOnlyCookie = await addToCart(undefined, String(affiliate.id), `AFF-${suffix}`)
    const affProposal = await proposalRoute(
      jsonRequest('http://localhost/api/commerce/proposal', proposalBody, affOnlyCookie),
    )
    expect(affProposal.status).toBe(400)
    const affBody = await affProposal.json()
    expect(affBody.error).toMatch(/disclosed seller destination/)
  })

  it('mixed own + dropship cart paid in BTC settles only on server-queried BTCPay evidence', async () => {
    process.env.LOCAL_E2E_TEST_MODE = 'true'
    const payload: any = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    await enableCheckout(payload, siteId)
    const suffix = randomUUID().slice(0, 8)

    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteId,
        label: `RC320 BTCPay merchant ${suffix}`,
        providerKey: 'btcpay',
        merchantCountry: 'US',
        status: 'active',
        configuration: {
          btcpay: { serverUrl: stubBaseUrl, storeId: 'stub-store', apiKey: 'stub-key' },
        },
      },
      overrideAccess: true,
    })
    const capability = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        providerKey: 'btcpay',
        railKey: `rc320-btc-${suffix}`,
        family: 'crypto',
        flow: 'qr',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['USD'],
        settlementCurrencies: ['BTC'],
        enabled: true,
        health: 'healthy',
      },
      overrideAccess: true,
    })
    const own = await createProduct(payload, demo, siteId, merchant.id, {
      name: `BTC Own Widget ${suffix}`,
      slug: `btc-own-widget-${suffix}`,
      canonicalPath: `/store/btc-own-widget-${suffix}`,
      kind: 'physical',
      productCapabilities: ['shippable'],
      variants: [
        {
          sku: `BOWN-${suffix}`,
          title: 'Own Widget',
          status: 'active',
          inventoryPolicy: 'tracked',
          inventoryQuantity: 5,
          weightGrams: 300,
          dimensionsMm: { length: 200, width: 150, height: 100 },
        },
      ],
      prices: [{ currency: 'USD', amountMinor: '1000', variantSku: `BOWN-${suffix}` }],
      offers: [offer(`offer-bown-${suffix}`, `BOWN-${suffix}`, '1000')],
    })
    const dropship = await createProduct(payload, demo, siteId, merchant.id, {
      name: `BTC Drop Widget ${suffix}`,
      slug: `btc-drop-widget-${suffix}`,
      canonicalPath: `/store/btc-drop-widget-${suffix}`,
      kind: 'physical',
      productCapabilities: ['shippable'],
      variants: [
        {
          sku: `BDROP-${suffix}`,
          title: 'Drop Widget',
          status: 'active',
          inventoryPolicy: 'external-hook',
          weightGrams: 400,
          dimensionsMm: { length: 250, width: 200, height: 120 },
        },
      ],
      prices: [{ currency: 'USD', amountMinor: '2000', variantSku: `BDROP-${suffix}` }],
      offers: [offer(`offer-bdrop-${suffix}`, `BDROP-${suffix}`, '2000')],
      sourcePolicy: {
        variants: {
          [`BDROP-${suffix}`]: {
            type: 'dropship',
            providerKey: 'generic-dropship',
            externalRef: 'ext-widget',
            observed: {
              costMinor: '1200',
              currency: 'USD',
              available: true,
              observedAt: new Date().toISOString(),
            },
          },
        },
      },
    })

    let cookie = await addToCart(undefined, String(own.id), `BOWN-${suffix}`)
    cookie = await addToCart(cookie, String(dropship.id), `BDROP-${suffix}`)
    const proposalRes = await proposalRoute(
      jsonRequest('http://localhost/api/commerce/proposal', proposalBody, cookie),
    )
    expect(proposalRes.status, await proposalRes.clone().text()).toBe(200)
    const { proposal } = await proposalRes.json()
    const grandTotal = BigInt(proposal.pricingSnapshot.grandTotalMinor)

    const initRes = await initiateRoute(
      jsonRequest(
        'http://localhost/api/commerce/checkout/initiate',
        { proposalId: proposal.id, capabilityId: String(capability.id) },
        cookie,
      ),
    )
    expect(initRes.status, await initRes.clone().text()).toBe(200)
    const checkout = await initRes.json()
    expect(checkout.flow).toBe('qr')
    expect(checkout.cryptoInvoice.network).toBe('bitcoin')
    expect(checkout.cryptoInvoice.asset).toBe('BTC')
    // Stub rate $100,000/BTC: satoshis = grandTotalCents * 10 exactly.
    expect(checkout.cryptoInvoice.exactAmountAtomic).toBe((grandTotal * 10n).toString())
    expect(checkout.cryptoInvoice.destination).toContain('bc1qstubdestination')

    const intent: any = await payload.findByID({
      collection: 'payment-intents',
      id: checkout.intentId,
      overrideAccess: true,
    })
    expect(intent.providerReference).toMatch(/^btcpay:stub-inv-/)
    expect(intent.fxQuote.quoteSource).toBe('btcpay-rates')
    expect(intent.fxQuote.buyerConfirmedConversion).toBe(true)
    expect(intent.fxQuote.exactAmountAtomic).toBe((grandTotal * 10n).toString())

    // Not settled on the merchant server yet: verification must refuse.
    const earlyVerify = await cryptoVerifyRoute(
      jsonRequest(
        'http://localhost/api/commerce/crypto/verify',
        { intentId: checkout.intentId },
        cookie,
      ),
    )
    expect(earlyVerify.status).toBe(200)
    const early = await earlyVerify.json()
    expect(early.confirmed).toBe(false)
    const ordersBefore = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: checkout.sessionId } },
      overrideAccess: true,
    })
    expect(ordersBefore.docs.filter((o: any) => o.state === 'paid')).toHaveLength(0)

    // The merchant's BTCPay now reports Settled: the same verify call settles.
    const invoiceId = String(intent.cryptoInvoice.reference)
    stubInvoices.get(invoiceId)!.status = 'Settled'
    const verifyRes = await cryptoVerifyRoute(
      jsonRequest(
        'http://localhost/api/commerce/crypto/verify',
        { intentId: checkout.intentId },
        cookie,
      ),
    )
    expect(verifyRes.status, await verifyRes.clone().text()).toBe(200)
    const verified = await verifyRes.json()
    expect(verified.confirmed).toBe(true)
    expect(verified.state).toBe('confirmed')

    const orders = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: checkout.sessionId } },
      overrideAccess: true,
    })
    expect(orders.docs).toHaveLength(1)
    expect(orders.docs[0].state).toBe('paid')
    expect((orders.docs[0].receipt as any)?.state).toBe('issued')
    const orderGroups = (orders.docs[0].downstreamInstructions as any[]).map(
      (g) => g.fulfillmentKind,
    )
    expect(orderGroups.sort()).toEqual(['dropship', 'physical'])
  })
})
