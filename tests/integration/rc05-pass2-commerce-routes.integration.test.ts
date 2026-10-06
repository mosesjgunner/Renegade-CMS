/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { getPayload } from 'payload'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'

// Commerce routes under test
import {
  POST as cartRoute,
  GET as getCartRoute,
} from '../../src/app/(frontend)/api/commerce/cart/route'
import { POST as proposalRoute } from '../../src/app/(frontend)/api/commerce/proposal/route'
import { POST as initiateCheckoutRoute } from '../../src/app/(frontend)/api/commerce/checkout/initiate/route'
import { POST as confirmTestPaymentRoute } from '../../src/app/(frontend)/api/commerce/checkout/test/confirm/route'
import { POST as webhookRoute } from '../../src/app/(frontend)/api/commerce/webhooks/[provider]/route'
import { GET as dashboardRoute } from '../../src/app/(frontend)/api/admin/commerce/dashboard/route'
import { GET as downloadRoute } from '../../src/app/(frontend)/api/commerce/download/[grantKey]/route'
import { processPaymentEventTask } from '../../src/modules/commerce/tasks'
import { guestCartCookieName } from '../../src/modules/commerce/cart'

describe('RC-05 Pass 2: Commerce Acceptance, Idempotency, Concurrency & Security', () => {
  it('proves the complete physical product lifecycle, server authority, and idempotent settlement', async () => {
    const payload = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    const suffix = randomUUID().slice(0, 8)

    process.env.LOCAL_E2E_TEST_MODE = 'true'
    process.env.COMMERCE_GUEST_ORDER_SECRET = 'rc05-pass2-guest-order-secret-very-long-32chars'
    process.env.COMMERCE_TEST_WEBHOOK_SECRET = 'rc05-pass2-webhook-secret-long-enough'

    // Enable commerce checkout in global settings
    const settings = await payload.findGlobal({ slug: 'site-settings', overrideAccess: true })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
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

    // Setup active merchant connection
    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteId,
        label: `Pass2 Test Merchant ${suffix}`,
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
        railKey: `local-card-${suffix}`,
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

    // Operator creates a tracked physical product with stock 10
    const product = await (payload as any).create({
      collection: 'products',
      data: {
        site: siteId,
        name: `Renegade Pass2 Jacket ${suffix}`,
        slug: `pass2-jacket-${suffix}`,
        canonicalPath: `/store/pass2-jacket-${suffix}`,
        kind: 'physical',
        state: 'published',
        publishedAt: new Date().toISOString(),
        productCapabilities: ['shippable'],
        optionDimensions: [{ key: 'size', label: 'Size', values: ['M'] }],
        variants: [
          {
            sku: `JKT-${suffix}-M`,
            title: 'Jacket Medium',
            status: 'active',
            optionValues: { size: 'M' },
            inventoryPolicy: 'tracked',
            inventoryQuantity: 10,
            weightGrams: 400,
            dimensionsMm: { length: 300, width: 200, height: 50 },
          },
        ],
        prices: [{ currency: 'USD', amountMinor: '4000', variantSku: `JKT-${suffix}-M` }],
        offers: [
          {
            id: `offer-jkt-${suffix}`,
            version: 1,
            status: 'active',
            variantSku: `JKT-${suffix}-M`,
            amountMinor: '4000', // $40.00
            currency: 'USD',
            taxDisplay: 'exclusive',
            segmentPolicy: { mode: 'public' },
          },
        ],
      },
      overrideAccess: true,
    })

    // 1. Customer adds to cart
    const addRes = await cartRoute(
      new Request('http://localhost/api/commerce/cart', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: String(product.id),
          variantSku: `JKT-${suffix}-M`,
          quantity: 1,
        }),
      }),
    )
    expect(addRes.status).toBe(200)
    const cartCookie = addRes.headers.get('set-cookie')
    expect(cartCookie).toBeTruthy()
    const cookieHeader = cartCookie!.split(';')[0]

    // Verify cart retrieval has authoritative price 4000
    const getCartRes = await getCartRoute(
      new Request('http://localhost/api/commerce/cart', {
        method: 'GET',
        headers: { host: 'localhost', cookie: cookieHeader },
      }),
    )
    expect(getCartRes.status).toBe(200)
    const cartBody = await getCartRes.json()
    expect(cartBody.cart.items).toHaveLength(1)
    expect(cartBody.cart.items[0].displaySnapshot.unitPriceMinor).toBe('4000')

    // 2. Customer creates proposal (server computes totals authoritatively)
    const proposalRes = await proposalRoute(
      new Request('http://localhost/api/commerce/proposal', {
        method: 'POST',
        headers: { host: 'localhost', cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({
          customer: { email: `customer-${suffix}@example.test`, name: 'Test Customer' },
          shippingAddress: {
            name: 'Test Customer',
            line1: '123 Main St',
            city: 'Austin',
            state: 'TX',
            postalCode: '78701',
            country: 'US',
          },
          billingAddress: {
            name: 'Test Customer',
            line1: '123 Main St',
            city: 'Austin',
            state: 'TX',
            postalCode: '78701',
            country: 'US',
          },
          selectedShippingRateId: 'standard',
          consents: { termsAccepted: true, privacyAccepted: true },
        }),
      }),
    )
    expect(proposalRes.status).toBe(200)
    const proposalData = await proposalRes.json()
    expect(proposalData.proposal).toBeDefined()
    const proposal = proposalData.proposal
    expect(proposal.integrityHash).toBeTruthy()
    expect(proposal.pricingSnapshot.subtotalMinor).toBe('4000')
    expect(proposal.pricingSnapshot.grandTotalMinor).toBeDefined()

    // 3. Initiate checkout
    const initRes = await initiateCheckoutRoute(
      new Request('http://localhost/api/commerce/checkout/initiate', {
        method: 'POST',
        headers: { host: 'localhost', cookie: cookieHeader, 'content-type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          capabilityId: String(capability.id),
        }),
      }),
    )
    expect([200, 201]).toContain(initRes.status)
    const checkoutData = await initRes.json()
    expect(checkoutData.actionUrl).toMatch(/^\/checkout\/test\/det_cs_/)
    expect(checkoutData.sessionId).toBeDefined()
    expect(checkoutData.attemptId).toBeDefined()
    const checkoutCookie = initRes.headers.get('set-cookie')?.split(';')[0] ?? ''

    // 4. Confirm test payment
    const reference = String(checkoutData.actionUrl).split('/').at(-1)!
    const confirmRes = await confirmTestPaymentRoute(
      new Request('http://localhost/api/commerce/checkout/test/confirm', {
        method: 'POST',
        headers: {
          host: 'localhost',
          cookie: `${cookieHeader}; ${checkoutCookie}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: `reference=${encodeURIComponent(reference)}`,
      }),
    )
    expect(confirmRes.status).toBe(303)
    expect(confirmRes.headers.get('location')).toContain(
      `/checkout/return?session=${checkoutData.sessionId}`,
    )

    // 5. Verify webhook inbox entry and task execution
    const inboxDocs = await payload.find({
      collection: 'payment-webhook-events',
      where: { providerEventId: { equals: `local-test-paid:${checkoutData.attemptId}` } },
      limit: 1,
      overrideAccess: true,
    })
    expect(inboxDocs.docs).toHaveLength(1)
    const webhookEventId = String(inboxDocs.docs[0].id)

    // Execute task twice to prove idempotency
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId },
      req: { payload },
    })
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId },
      req: { payload },
    })

    // Verify canonical Order
    const orders = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: checkoutData.sessionId } },
      limit: 10,
      overrideAccess: true,
    })
    expect(orders.docs).toHaveLength(1)
    const order = orders.docs[0]
    expect(order.state).toBe('paid')
    expect((order.receipt as any)?.state).toBe('issued')

    // Verify Tracked Inventory was decremented exactly once from 10 to 9
    const updatedProduct = await payload.findByID({
      collection: 'products',
      id: product.id,
      depth: 0,
      overrideAccess: true,
    })
    const updatedVariant = (updatedProduct.variants as any[])?.find(
      (v) => v.sku === `JKT-${suffix}-M`,
    )
    expect(updatedVariant?.inventoryQuantity).toBe(9)

    // Verify email receipt delivery queued
    const deliveries = await payload.find({
      collection: 'email-deliveries',
      where: { recipientEmail: { equals: `customer-${suffix}@example.test` } },
      limit: 10,
      overrideAccess: true,
    })
    expect(deliveries.docs).toHaveLength(1)

    // 6. Operator checks Commerce Dashboard
    const dashboardRes = await dashboardRoute(
      new Request(`http://localhost/api/admin/commerce/dashboard?siteId=${siteId}`, {
        headers: { host: 'localhost' },
      }),
    )
    expect([200, 403]).toContain(dashboardRes.status)
  }, 35_000)

  it('defeats client price, quantity, and total tampering attempts across routes', async () => {
    const payload = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    const suffix = randomUUID().slice(0, 8)

    const product = await (payload as any).create({
      collection: 'products',
      data: {
        site: siteId,
        name: `Tamper Target Product ${suffix}`,
        slug: `tamper-target-${suffix}`,
        canonicalPath: `/store/tamper-target-${suffix}`,
        kind: 'physical',
        state: 'published',
        publishedAt: new Date().toISOString(),
        productCapabilities: ['shippable'],
        variants: [
          {
            sku: `TMP-${suffix}`,
            title: 'Tamper Variant',
            status: 'active',
            inventoryPolicy: 'untracked',
            weightGrams: 200,
            dimensionsMm: { length: 100, width: 100, height: 10 },
          },
        ],
        offers: [
          {
            id: `offer-tmp-${suffix}`,
            version: 1,
            status: 'active',
            variantSku: `TMP-${suffix}`,
            amountMinor: '9900', // $99.00
            currency: 'USD',
            taxDisplay: 'exclusive',
          },
        ],
      },
      overrideAccess: true,
    })

    // Tamper Attempt 1: Negative quantity
    const badQtyRes = await cartRoute(
      new Request('http://localhost/api/commerce/cart', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: String(product.id),
          variantSku: `TMP-${suffix}`,
          quantity: -3,
        }),
      }),
    )
    expect(badQtyRes.status).toBe(400)
    expect((await badQtyRes.json()).error).toMatch(/positive integer/i)

    // Tamper Attempt 2: Non-integer quantity
    const floatQtyRes = await cartRoute(
      new Request('http://localhost/api/commerce/cart', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: String(product.id),
          variantSku: `TMP-${suffix}`,
          quantity: 1.5,
        }),
      }),
    )
    expect(floatQtyRes.status).toBe(400)

    // Tamper Attempt 3: Client tampering with unit price in cart
    const addRes = await cartRoute(
      new Request('http://localhost/api/commerce/cart', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: String(product.id),
          variantSku: `TMP-${suffix}`,
          quantity: 1,
          unitPriceMinor: '100', // Attacker wants to pay $1 instead of $99
        }),
      }),
    )
    expect(addRes.status).toBe(200)
    const cartCookie = addRes.headers.get('set-cookie')!.split(';')[0]

    const getRes = await getCartRoute(
      new Request('http://localhost/api/commerce/cart', {
        headers: { host: 'localhost', cookie: cartCookie },
      }),
    )
    const cartJson = await getRes.json()
    // Server has authoritatively set 9900
    expect(cartJson.cart.items[0].displaySnapshot.unitPriceMinor).toBe('9900')
    expect(cartJson.pricing.subtotalMinor).toBe('9900')

    // Tamper Attempt 4: Tampering with proposal integrity hash
    const proposalRes = await proposalRoute(
      new Request('http://localhost/api/commerce/proposal', {
        method: 'POST',
        headers: { host: 'localhost', cookie: cartCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          customer: { email: `tamper-${suffix}@example.test`, name: 'Tamper Attacker' },
          shippingAddress: {
            name: 'Attacker',
            line1: '123 Fake St',
            city: 'Dallas',
            state: 'TX',
            postalCode: '75201',
            country: 'US',
          },
          consents: { termsAccepted: true, privacyAccepted: true },
        }),
      }),
    )
    expect(proposalRes.status).toBe(200)
    const proposal = (await proposalRes.json()).proposal

    // Tamper proposal record in database to set grandTotalMinor to '100'
    await payload.update({
      collection: 'checkout-proposals',
      id: proposal.id,
      data: {
        pricingSnapshot: {
          ...proposal.pricingSnapshot,
          grandTotalMinor: '100', // Attacker hacked DB or passed manipulated totals
        },
      },
      overrideAccess: true,
    })

    // Now attempt to initiate checkout with tampered proposal: must be rejected with 409
    const cap = await payload.find({
      collection: 'payment-method-capabilities',
      where: { site: { equals: siteId } },
      limit: 1,
      overrideAccess: true,
    })
    const capId = String(cap.docs[0]?.id ?? 'cap-1')

    const attackRes = await initiateCheckoutRoute(
      new Request('http://localhost/api/commerce/checkout/initiate', {
        method: 'POST',
        headers: { host: 'localhost', cookie: cartCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          capabilityId: capId,
        }),
      }),
    )
    expect(attackRes.status).toBe(409)
    expect((await attackRes.json()).error).toMatch(/integrity/i)
  }, 20_000)

  it('proves webhook security boundaries: unsigned, invalid signature, replay, and race handling', async () => {
    const payload = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    const suffix = randomUUID().slice(0, 8)
    const secret = process.env.COMMERCE_TEST_WEBHOOK_SECRET ?? 'test-secret'

    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteId,
        label: `Webhook Sec Merchant ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    })

    const fixtureCart = await payload.create({
      collection: 'carts',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        currency: 'USD',
        items: [],
        state: 'active',
        version: 1,
      },
      overrideAccess: true,
    })

    const session = await payload.create({
      collection: 'checkout-sessions',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        cart: fixtureCart.id,
        currency: 'USD',
        amountMinor: '2500',
        customerKey: `cust-key-${suffix}`,
        attempt: 1,
        bindingKey: `bind-sec-${suffix}`,
        state: 'open',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      overrideAccess: true,
    })

    const intent = await payload.create({
      collection: 'payment-intents',
      data: {
        site: siteId,
        checkoutSession: session.id,
        merchantConnection: merchant.id,
        capabilityId: 'deterministic-test-card',
        providerKey: 'deterministic-test',
        amountMinor: '2500',
        currency: 'USD',
        state: 'requires-action',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      overrideAccess: true,
    })

    const attempt = await (payload as any).create({
      collection: 'payment-attempts',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        checkoutSession: session.id,
        paymentIntent: intent.id,
        idempotencyKey: `attempt-sec-${suffix}`,
        providerKey: 'deterministic-test',
        providerContractVersion: '1.0.0',
        providerImplementationVersion: '1.0.0',
        providerApiVersion: '1.0.0',
        state: 'action-required',
        amountMinor: '2500',
        currency: 'USD',
        attempt: 1,
        providerReference: `det_ref_${suffix}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        processedEventIds: [],
      },
      overrideAccess: true,
    })

    const rawPayload = JSON.stringify({
      providerEventId: `evt_sec_${suffix}`,
      providerReference: `det_ref_${suffix}`,
      kind: 'succeeded',
      amountMinor: '2500',
      currency: 'USD',
      sanitizedEvidence: {
        attemptId: String(attempt.id),
      },
    })

    // 1. Unsigned webhook: rejected with 401
    const unsignedRes = await webhookRoute(
      new Request('http://localhost/api/commerce/webhooks/deterministic-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: rawPayload,
      }),
      { params: Promise.resolve({ provider: 'deterministic-test' }) },
    )
    expect(unsignedRes.status).toBe(401)

    // 2. Bad signature: rejected with 401
    const badSigRes = await webhookRoute(
      new Request('http://localhost/api/commerce/webhooks/deterministic-test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-commerce-signature':
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        },
        body: rawPayload,
      }),
      { params: Promise.resolve({ provider: 'deterministic-test' }) },
    )
    expect(badSigRes.status).toBe(401)

    // 3. Valid signed webhook: accepted with 202
    const validSignature = createHmac('sha256', secret).update(rawPayload).digest('hex')
    const validRes = await webhookRoute(
      new Request('http://localhost/api/commerce/webhooks/deterministic-test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-commerce-signature': validSignature,
        },
        body: rawPayload,
      }),
      { params: Promise.resolve({ provider: 'deterministic-test' }) },
    )
    expect(validRes.status).toBe(202)
    expect((await validRes.json()).received).toBe(true)

    // 4. Replay of identical webhook: idempotent (returns received: true, replay: true)
    const replayRes = await webhookRoute(
      new Request('http://localhost/api/commerce/webhooks/deterministic-test', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-commerce-signature': validSignature,
        },
        body: rawPayload,
      }),
      { params: Promise.resolve({ provider: 'deterministic-test' }) },
    )
    expect(replayRes.status).toBe(200)
    expect((await replayRes.json()).replay).toBe(true)

    // 5. Simultaneous duplicate event race
    const rawRace = JSON.stringify({
      providerEventId: `evt_race_${suffix}`,
      providerReference: `det_ref_${suffix}`,
      kind: 'succeeded',
      amountMinor: '2500',
      currency: 'USD',
      sanitizedEvidence: { attemptId: String(attempt.id) },
    })
    const raceSig = createHmac('sha256', secret).update(rawRace).digest('hex')
    const [res1, res2] = await Promise.all([
      webhookRoute(
        new Request('http://localhost/api/commerce/webhooks/deterministic-test', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-commerce-signature': raceSig },
          body: rawRace,
        }),
        { params: Promise.resolve({ provider: 'deterministic-test' }) },
      ),
      webhookRoute(
        new Request('http://localhost/api/commerce/webhooks/deterministic-test', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-commerce-signature': raceSig },
          body: rawRace,
        }),
        { params: Promise.resolve({ provider: 'deterministic-test' }) },
      ),
    ])
    // Both responses must be successful (either 202 or 200 replay), never 500 error
    expect([200, 202]).toContain(res1.status)
    expect([200, 202]).toContain(res2.status)
  }, 20_000)

  it('proves multi-tenant boundaries and security against cross-site cart/order access', async () => {
    const payload = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteAId = demo.siteId
    const suffix = randomUUID().slice(0, 8)

    // Create Site B
    const siteB = await (payload as any).create({
      collection: 'sites',
      data: { name: `Site B ${suffix}`, slug: `site-b-${suffix}`, lifecycle: 'active' },
      overrideAccess: true,
    })

    const merchantA = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteAId,
        label: `Merchant A ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    })

    // Create cart for Site A
    await payload.create({
      collection: 'carts',
      data: {
        site: siteAId,
        merchantConnection: merchantA.id,
        currency: 'USD',
        items: [],
        state: 'active',
        version: 1,
        guestTokenHash: createHash('sha256').update(`token_a_${suffix}`).digest('hex'),
      },
      overrideAccess: true,
    })

    // Attacker on Site B tries to access Site A cart using Site A's guest token
    const cookieBName = guestCartCookieName(String(siteB.id))
    const getRes = await getCartRoute(
      new Request('http://localhost/api/commerce/cart', {
        headers: {
          host: `site-b-${suffix}.renegade.test`,
          cookie: `${cookieBName}=token_a_${suffix}`,
        },
      }),
    )
    const json = await getRes.json()
    // Cannot access Site A cart from Site B
    expect(json.cart).toBeNull()

    // Download Route: Forged grant token returns 404
    const forgedDownloadRes = await downloadRoute(
      new Request('http://localhost/api/commerce/download/forged-grant-key-12345'),
      { params: Promise.resolve({ grantKey: 'forged-grant-key-12345' }) },
    )
    expect(forgedDownloadRes.status).toBe(404)
  }, 15_000)

  it('proves downstream partial failure handling and operator reconciliation', async () => {
    const payload = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    const suffix = randomUUID().slice(0, 8)

    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteId,
        label: `Reconcile Merchant ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    })

    const fixtureCart = await payload.create({
      collection: 'carts',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        currency: 'USD',
        items: [],
        state: 'active',
        version: 1,
      },
      overrideAccess: true,
    })

    const session = await payload.create({
      collection: 'checkout-sessions',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        cart: fixtureCart.id,
        currency: 'USD',
        amountMinor: '2500',
        customerKey: `cust-key-mismatch-${suffix}`,
        attempt: 1,
        bindingKey: `bind-mismatch-${suffix}`,
        state: 'open',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      overrideAccess: true,
    })

    const intent = await payload.create({
      collection: 'payment-intents',
      data: {
        site: siteId,
        checkoutSession: session.id,
        merchantConnection: merchant.id,
        capabilityId: 'deterministic-test-card',
        providerKey: 'deterministic-test',
        amountMinor: '2500',
        currency: 'USD',
        state: 'requires-action',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      overrideAccess: true,
    })

    // Create an attempt where provider sends amount mismatch ($5000 vs $2500)
    const attempt = await (payload as any).create({
      collection: 'payment-attempts',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        checkoutSession: session.id,
        paymentIntent: intent.id,
        idempotencyKey: `attempt-mismatch-${suffix}`,
        providerKey: 'deterministic-test',
        providerContractVersion: '1.0.0',
        providerImplementationVersion: '1.0.0',
        providerApiVersion: '1.0.0',
        state: 'action-required',
        amountMinor: '2500',
        currency: 'USD',
        attempt: 1,
        providerReference: `det_mismatch_${suffix}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        processedEventIds: [],
      },
      overrideAccess: true,
    })

    // Ingest mismatch event
    const mismatchEvent = await (payload as any).create({
      collection: 'payment-webhook-events',
      data: {
        merchantConnection: merchant.id,
        providerKey: 'deterministic-test',
        providerEventId: `evt_mismatch_${suffix}`,
        payloadHash: 'hash',
        verifiedAt: new Date().toISOString(),
        normalizedKind: 'succeeded',
        providerReference: `det_mismatch_${suffix}`,
        sanitizedEvidence: {
          attemptId: String(attempt.id),
          amountMinor: '5000', // Mismatch!
          currency: 'USD',
        },
        processingState: 'received',
      },
      overrideAccess: true,
    })

    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId: String(mismatchEvent.id) },
      req: { payload },
    })

    // Attempt must transition to 'unknown' with reason 'amount-or-currency-mismatch'
    const updatedAttempt = await payload.findByID({
      collection: 'payment-attempts',
      id: attempt.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(updatedAttempt.state).toBe('unknown')

    // Reconciliation case must be opened for operator review
    const cases = await payload.find({
      collection: 'commerce-reconciliation-cases',
      where: { legacyId: { equals: String(attempt.id) } },
      limit: 1,
      overrideAccess: true,
    })
    expect(cases.docs).toHaveLength(1)
    expect(cases.docs[0].status).toBe('quarantined')
    expect(cases.docs[0].reason).toBe('amount-or-currency-mismatch')
  }, 20_000)
})
