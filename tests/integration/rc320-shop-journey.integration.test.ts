import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { getPayload } from 'payload'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import { reviewCatalogFixture } from '../helpers/review-catalog-fixture'
import { POST as cartRoute } from '../../src/app/(frontend)/api/commerce/cart/route'
import { POST as proposalRoute } from '../../src/app/(frontend)/api/commerce/proposal/route'
import { GET as methodsRoute } from '../../src/app/(frontend)/api/commerce/checkout/methods/route'
import { POST as initiateRoute } from '../../src/app/(frontend)/api/commerce/checkout/initiate/route'
import { POST as confirmRoute } from '../../src/app/(frontend)/api/commerce/checkout/test/confirm/route'
import { GET as statusRoute } from '../../src/app/(frontend)/api/commerce/checkout/status/route'
import { processPaymentEventTask } from '../../src/modules/commerce/tasks'

/**
 * RC3-20 SHOP-UX definition-of-done journey, proven at the HTTP route layer on
 * synthetic data: discover -> variant -> cart -> quote with faithful consent
 * recording -> eligible payment method -> sandbox purchase through the real
 * signed-webhook settlement path -> exactly one paid order -> confirmation
 * readable only with the guest's possession token.
 *
 * The payment rail is the deterministic test provider, which settles through
 * the production webhook handler with a signed event. It is a sandbox proof,
 * not a live provider receipt.
 */

const jsonRequest = (url: string, body: unknown, cookie?: string) =>
  new Request(url, {
    method: 'POST',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
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

async function createMerchantAndCapability(payload: any, siteId: string, suffix: string) {
  const merchant = await payload.create({
    collection: 'merchant-connections',
    data: {
      site: siteId,
      label: `RC320 journey merchant ${suffix}`,
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
      railKey: `rc320-card-${suffix}`,
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
  return { merchant, capability }
}

async function createPublishedProduct(
  payload: any,
  demo: any,
  siteId: string,
  merchantId: string,
  suffix: string,
  overrides: Record<string, unknown> = {},
) {
  const product = await payload.create({
    collection: 'products',
    data: {
      site: siteId,
      merchantConnection: merchantId,
      name: `Journey Widget ${suffix}`,
      slug: `journey-widget-${suffix}`,
      canonicalPath: `/store/journey-widget-${suffix}`,
      kind: 'physical',
      state: 'draft',
      productCapabilities: ['shippable'],
      optionDimensions: [{ key: 'size', label: 'Size', values: ['Small', 'Large'] }],
      variants: [
        {
          sku: `WIDGET-${suffix}-S`,
          title: 'Widget Small',
          status: 'active',
          optionValues: { size: 'Small' },
          inventoryPolicy: 'tracked',
          inventoryQuantity: 5,
          weightGrams: 300,
          dimensionsMm: { length: 200, width: 150, height: 50 },
        },
        {
          sku: `WIDGET-${suffix}-L`,
          title: 'Widget Large',
          status: 'active',
          optionValues: { size: 'Large' },
          inventoryPolicy: 'tracked',
          inventoryQuantity: 5,
          weightGrams: 500,
          dimensionsMm: { length: 300, width: 200, height: 80 },
        },
      ],
      prices: [
        { currency: 'USD', amountMinor: '2500', variantSku: `WIDGET-${suffix}-S` },
        { currency: 'USD', amountMinor: '3500', variantSku: `WIDGET-${suffix}-L` },
      ],
      offers: [
        {
          id: `offer-widget-${suffix}-s`,
          version: 1,
          status: 'active',
          variantSku: `WIDGET-${suffix}-S`,
          amountMinor: '2500',
          currency: 'USD',
          taxDisplay: 'exclusive',
          segmentPolicy: { mode: 'public' },
        },
        {
          id: `offer-widget-${suffix}-l`,
          version: 1,
          status: 'active',
          variantSku: `WIDGET-${suffix}-L`,
          amountMinor: '3500',
          currency: 'USD',
          taxDisplay: 'exclusive',
          segmentPolicy: { mode: 'public' },
        },
      ],
      ...overrides,
    },
    overrideAccess: true,
  })
  await reviewCatalogFixture(demo.cookieHeader, String(product.id))
  return product
}

async function guestCartWithItem(productId: string, variantSku: string) {
  const addRes = await cartRoute(
    jsonRequest('http://localhost/api/commerce/cart', {
      productId,
      variantSku,
      quantity: 1,
    }),
  )
  expect(addRes.status, await addRes.clone().text()).toBe(200)
  const cookie = addRes.headers.get('set-cookie')!.split(';')[0]
  return cookie
}

const shippingAddress = {
  name: 'Guest Buyer',
  line1: '100 Main St',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
}

function proposalBody(consents: Record<string, unknown>) {
  return {
    customer: { email: 'guest@example.com', name: 'Guest Buyer', country: 'US' },
    shippingAddress,
    billingAddress: shippingAddress,
    consents,
  }
}

describe('RC3-20 shop journey (definition of done)', () => {
  it('records the customer’s actual consent selections on the quote', async () => {
    process.env.LOCAL_E2E_TEST_MODE = 'true'
    const payload: any = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    await enableCheckout(payload, siteId)
    const suffix = randomUUID().slice(0, 8)
    const { merchant } = await createMerchantAndCapability(payload, siteId, suffix)
    const product = await createPublishedProduct(payload, demo, siteId, merchant.id, suffix)

    // Guest A opts IN to marketing: the stored record must say so.
    const cookieA = await guestCartWithItem(String(product.id), `WIDGET-${suffix}-S`)
    const resA = await proposalRoute(
      jsonRequest(
        'http://localhost/api/commerce/proposal',
        proposalBody({ termsAccepted: true, privacyAccepted: true, marketingAccepted: true }),
        cookieA,
      ),
    )
    expect(resA.status, await resA.clone().text()).toBe(200)
    const { proposal: proposalA } = await resA.json()
    expect(proposalA.consents.termsAccepted).toBe(true)
    expect(proposalA.consents.privacyAccepted).toBe(true)
    expect(proposalA.consents.marketingAccepted).toBe(true)
    expect(typeof proposalA.consents.timestamp).toBe('string')
    const storedA: any = await payload.findByID({
      collection: 'checkout-proposals',
      id: proposalA.id,
      overrideAccess: true,
    })
    expect(storedA.consents.marketingAccepted).toBe(true)

    // Guest B never sees a marketing choice made for them: absent means false,
    // and a refused required agreement is rejected outright.
    const cookieB = await guestCartWithItem(String(product.id), `WIDGET-${suffix}-S`)
    const refused = await proposalRoute(
      jsonRequest(
        'http://localhost/api/commerce/proposal',
        proposalBody({ termsAccepted: false, privacyAccepted: true }),
        cookieB,
      ),
    )
    expect(refused.status).toBe(400)
    const resB = await proposalRoute(
      jsonRequest(
        'http://localhost/api/commerce/proposal',
        proposalBody({ termsAccepted: true, privacyAccepted: true }),
        cookieB,
      ),
    )
    expect(resB.status, await resB.clone().text()).toBe(200)
    const { proposal: proposalB } = await resB.json()
    expect(proposalB.consents.marketingAccepted).toBe(false)
    const storedB: any = await payload.findByID({
      collection: 'checkout-proposals',
      id: proposalB.id,
      overrideAccess: true,
    })
    expect(storedB.consents.marketingAccepted).toBe(false)
  })

  it('guest discovers, buys once, and reads the confirmation with the possession token', async () => {
    process.env.LOCAL_E2E_TEST_MODE = 'true'
    const payload: any = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    await enableCheckout(payload, siteId)
    const suffix = randomUUID().slice(0, 8)
    const { merchant, capability } = await createMerchantAndCapability(payload, siteId, suffix)
    const product = await createPublishedProduct(payload, demo, siteId, merchant.id, suffix)

    // Discover: the storefront query shape (published, this site) finds it.
    const discovered = await payload.find({
      collection: 'products',
      where: {
        and: [
          { state: { equals: 'published' } },
          { site: { equals: siteId } },
          { name: { like: 'Journey Widget' } },
        ],
      },
      limit: 24,
      overrideAccess: true,
    })
    expect(discovered.docs.some((doc: any) => String(doc.id) === String(product.id))).toBe(true)

    // Variant -> cart -> quote.
    const cookie = await guestCartWithItem(String(product.id), `WIDGET-${suffix}-L`)
    const proposalRes = await proposalRoute(
      jsonRequest(
        'http://localhost/api/commerce/proposal',
        proposalBody({ termsAccepted: true, privacyAccepted: true, marketingAccepted: false }),
        cookie,
      ),
    )
    expect(proposalRes.status, await proposalRes.clone().text()).toBe(200)
    const { proposal } = await proposalRes.json()
    expect(proposal.pricingSnapshot.subtotalMinor).toBe('3500')

    // Eligible payment methods for the quote.
    const methodsRes = await methodsRoute(
      new Request(
        `http://localhost/api/commerce/checkout/methods?proposal=${encodeURIComponent(proposal.id)}`,
        { headers: { host: 'localhost', cookie } },
      ),
    )
    expect(methodsRes.status, await methodsRes.clone().text()).toBe(200)
    const { methods } = await methodsRes.json()
    expect(methods).toHaveLength(1)
    expect(methods[0].id).toBe(String(capability.id))

    // Initiate, then initiate again: one intent, replayed — never two charges.
    const initiateBody = { proposalId: proposal.id, capabilityId: String(capability.id) }
    const initRes = await initiateRoute(
      jsonRequest('http://localhost/api/commerce/checkout/initiate', initiateBody, cookie),
    )
    expect(initRes.status, await initRes.clone().text()).toBe(200)
    const checkout = await initRes.json()
    expect(checkout.actionUrl).toMatch(/^\/checkout\/test\//)
    const orderCookie = initRes.headers.get('set-cookie')!.split(';')[0]
    expect(orderCookie).toContain(`renegade_checkout_${checkout.sessionId}=`)

    const replayRes = await initiateRoute(
      jsonRequest('http://localhost/api/commerce/checkout/initiate', initiateBody, cookie),
    )
    expect(replayRes.status, await replayRes.clone().text()).toBe(200)
    const replay = await replayRes.json()
    expect(replay.intentId).toBe(checkout.intentId)
    expect(replay.replay).toBe(true)
    const intents = await payload.find({
      collection: 'payment-intents',
      where: { checkoutSession: { equals: checkout.sessionId } },
      overrideAccess: true,
    })
    expect(intents.docs).toHaveLength(1)

    // Sandbox payment through the real signed-webhook settlement path.
    const reference = String(checkout.actionUrl).split('/').at(-1)!
    const confirmRes = await confirmRoute(
      new Request('http://localhost/api/commerce/checkout/test/confirm', {
        method: 'POST',
        headers: {
          host: 'localhost',
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
    // Worker replay must not duplicate the order.
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
    expect(orders.docs[0].state).toBe('paid')
    expect((orders.docs[0].receipt as any)?.state).toBe('issued')

    // Confirmation: readable with the possession token, denied without it.
    const statusUrl = `http://localhost/api/commerce/checkout/status?session=${encodeURIComponent(checkout.sessionId)}`
    const denied = await statusRoute(new Request(statusUrl, { headers: { host: 'localhost' } }))
    expect(denied.status).toBe(403)
    const statusRes = await statusRoute(
      new Request(statusUrl, { headers: { host: 'localhost', cookie: orderCookie } }),
    )
    expect(statusRes.status, await statusRes.clone().text()).toBe(200)
    const status = await statusRes.json()
    expect(status.payment.state).toBe('succeeded')
    expect(status.order.orderNumber).toBeTruthy()
    expect(status.order.receiptNumber).toBeTruthy()
    expect(status.order.items).toHaveLength(1)
    expect(status.order.items[0].variantSku).toBe(`WIDGET-${suffix}-L`)
    expect(status.order.totalsSnapshot.grandTotalMinor).toBe(
      proposal.pricingSnapshot.grandTotalMinor,
    )
  })

  it('storefront search and pagination data path scopes to published on-site products', async () => {
    const payload: any = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    const suffix = randomUUID().slice(0, 8)
    const { merchant } = await createMerchantAndCapability(payload, siteId, suffix)
    const token = `Pagination Gadget ${suffix}`
    for (const label of ['One', 'Two', 'Three']) {
      await createPublishedProduct(payload, demo, siteId, merchant.id, `${suffix}${label}`, {
        name: `${token} ${label}`,
        slug: `pagination-gadget-${suffix}-${label.toLowerCase()}`,
        canonicalPath: `/store/pagination-gadget-${suffix}-${label.toLowerCase()}`,
      })
    }
    // A draft with the same name token must never surface in the storefront.
    const draft = await createPublishedProduct(payload, demo, siteId, merchant.id, `${suffix}D`, {
      name: `${token} Draft`,
      slug: `pagination-gadget-${suffix}-draft`,
      canonicalPath: `/store/pagination-gadget-${suffix}-draft`,
    })
    await payload.update({
      collection: 'products',
      id: draft.id,
      data: { state: 'draft' },
      overrideAccess: true,
    })

    const where = {
      and: [
        { state: { equals: 'published' } },
        { site: { equals: siteId } },
        { name: { like: token } },
      ],
    }
    const page1 = await payload.find({
      collection: 'products',
      where,
      limit: 2,
      page: 1,
      overrideAccess: true,
    })
    expect(page1.totalDocs).toBe(3)
    expect(page1.totalPages).toBe(2)
    expect(page1.docs).toHaveLength(2)
    const page2 = await payload.find({
      collection: 'products',
      where,
      limit: 2,
      page: 2,
      overrideAccess: true,
    })
    expect(page2.docs).toHaveLength(1)
    const seen = [...page1.docs, ...page2.docs].map((doc: any) => String(doc.id))
    expect(new Set(seen).size).toBe(3)
    expect(seen).not.toContain(String(draft.id))
  })
})
