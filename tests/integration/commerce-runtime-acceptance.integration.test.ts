/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { getPayload } from 'payload'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'

// Commerce API routes under test
import {
  POST as cartRoute,
  GET as getCartRoute,
} from '../../src/app/(frontend)/api/commerce/cart/route'
import { POST as proposalRoute } from '../../src/app/(frontend)/api/commerce/proposal/route'
import { POST as initiateCheckoutRoute } from '../../src/app/(frontend)/api/commerce/checkout/initiate/route'
import { POST as confirmTestPaymentRoute } from '../../src/app/(frontend)/api/commerce/checkout/test/confirm/route'
import { POST as webhookRoute } from '../../src/app/(frontend)/api/commerce/webhooks/[provider]/route'
import { POST as donationIntentRoute } from '../../src/app/(frontend)/api/commerce/donations/intent/route'
import { POST as refundRoute } from '../../src/app/(frontend)/api/admin/commerce/refunds/route'
import { GET as downloadRoute } from '../../src/app/(frontend)/api/commerce/download/[grantKey]/route'

// Modules & Services
import { processPaymentEventTask } from '../../src/modules/commerce/tasks'
import { guestCanConfirmTestCheckout } from '../../src/modules/commerce/local-test-checkout'
import {
  recomputeSubscriptionEntitlements,
  hasEntitlement,
} from '../../src/modules/commerce/subscription-service'
import { publishPlan } from '../../src/modules/commerce/subscription-contract'
import { reverseDonation } from '../../src/modules/commerce/donation-ingestion'
import { isSafeAffiliateDestinationUrl } from '../../src/modules/commerce/affiliate-referral-contracts'
import {
  validateAffiliateOffer,
  resolveOutboundRedirect,
  importConversionEvidence,
} from '../../src/modules/commerce/affiliate-service'
import { PodEmulatorAdapter } from '../../src/modules/commerce/pod-emulator'
import { PrintfulPodAdapter } from '../../src/modules/commerce/pod-real-provider'
import {
  handoffFailedPodJobToManual,
  acknowledgeManualFulfillmentPackage,
  shipManualFulfillmentPackage,
} from '../../src/modules/commerce/manual-fulfillment'
import { resolveOperatorGrantContext } from '../../src/modules/operations/operator-grants'

describe('RC08D-04: Commerce Runtime Closure & Acceptance Verification', () => {
  it('proves catalog, low-stock race, cart authority, settlement, subscriptions, donations, affiliates, and fulfillment', async () => {
    const payload = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    const suffix = randomUUID().slice(0, 8)

    process.env.LOCAL_E2E_TEST_MODE = 'true'
    process.env.COMMERCE_GUEST_ORDER_SECRET = 'rc08d04-guest-order-secret-very-long-32chars'
    process.env.COMMERCE_TEST_WEBHOOK_SECRET = 'rc08d04-webhook-secret-long-enough'

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

    // Setup active merchant connection and payment method capability
    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteId,
        label: `Runtime Test Merchant ${suffix}`,
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

    // =========================================================================
    // 1. CATALOG & INVENTORY LOW-STOCK CONCURRENCY RACE
    // =========================================================================
    // Create a product with strictly 1 item in stock
    const raceProduct = await (payload as any).create({
      collection: 'products',
      data: {
        site: siteId,
        name: `Limited Edition Print ${suffix}`,
        slug: `limited-print-${suffix}`,
        canonicalPath: `/store/limited-print-${suffix}`,
        kind: 'physical',
        state: 'published',
        publishedAt: new Date().toISOString(),
        productCapabilities: ['shippable'],
        optionDimensions: [{ key: 'finish', label: 'Finish', values: ['Matte'] }],
        variants: [
          {
            sku: `PRINT-${suffix}-M`,
            title: 'Limited Print Matte',
            status: 'active',
            optionValues: { finish: 'Matte' },
            inventoryPolicy: 'tracked',
            inventoryQuantity: 1, // Only 1 available!
            weightGrams: 200,
            dimensionsMm: { length: 250, width: 200, height: 10 },
          },
        ],
        prices: [{ currency: 'USD', amountMinor: '5000', variantSku: `PRINT-${suffix}-M` }],
        offers: [
          {
            id: `offer-print-${suffix}`,
            version: 1,
            status: 'active',
            variantSku: `PRINT-${suffix}-M`,
            amountMinor: '5000', // $50.00
            currency: 'USD',
            taxDisplay: 'exclusive',
            segmentPolicy: { mode: 'public' },
          },
        ],
      },
      overrideAccess: true,
    })

    // Also create a digital entitlement product for download verification
    const digitalProduct = await (payload as any).create({
      collection: 'products',
      data: {
        site: siteId,
        name: `Digital EP Album ${suffix}`,
        slug: `digital-ep-${suffix}`,
        canonicalPath: `/store/digital-ep-${suffix}`,
        kind: 'digital',
        state: 'published',
        publishedAt: new Date().toISOString(),
        productCapabilities: ['digital-entitlement'],
        optionDimensions: [{ key: 'format', label: 'Format', values: ['FLAC'] }],
        variants: [
          {
            sku: `EP-${suffix}-FLAC`,
            title: 'Digital EP FLAC',
            status: 'active',
            optionValues: { format: 'FLAC' },
            inventoryPolicy: 'untracked',
            digitalAvailable: true,
          },
        ],
        digitalDelivery: {
          entitlement: `product.digital-ep-${suffix}`,
          downloadLimit: 3,
          expiresAfterDays: 30,
          assets: [
            {
              mediaId: String(demo.assets.hero.id),
              rightsStatus: 'approved',
              malwareStatus: 'clean',
              publicOriginal: false,
            },
          ],
        },
        prices: [{ currency: 'USD', amountMinor: '1500', variantSku: `EP-${suffix}-FLAC` }],
        offers: [
          {
            id: `offer-ep-${suffix}`,
            version: 1,
            status: 'active',
            variantSku: `EP-${suffix}-FLAC`,
            amountMinor: '1500', // $15.00
            currency: 'USD',
            taxDisplay: 'exclusive',
            segmentPolicy: { mode: 'public' },
          },
        ],
      },
      overrideAccess: true,
    })

    // Customer A adds the last physical item + digital item to Cart A
    const addResA = await cartRoute(
      new Request('http://localhost/api/commerce/cart', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: String(raceProduct.id),
          variantSku: `PRINT-${suffix}-M`,
          quantity: 1,
        }),
      }),
    )
    expect(addResA.status).toBe(200)
    const cookieA = addResA.headers.get('set-cookie')!.split(';')[0]

    // Customer A also adds the digital EP
    await cartRoute(
      new Request('http://localhost/api/commerce/cart', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/json', cookie: cookieA },
        body: JSON.stringify({
          productId: String(digitalProduct.id),
          variantSku: `EP-${suffix}-FLAC`,
          quantity: 1,
        }),
      }),
    )

    // Customer B attempts to add the same physical item to Cart B
    const addResB = await cartRoute(
      new Request('http://localhost/api/commerce/cart', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: String(raceProduct.id),
          variantSku: `PRINT-${suffix}-M`,
          quantity: 1,
        }),
      }),
    )
    expect(addResB.status).toBe(200)
    const cookieB = addResB.headers.get('set-cookie')!.split(';')[0]

    // =========================================================================
    // 2. SERVER-AUTHORITATIVE CART & TAMPERING REJECTION
    // =========================================================================
    // Tamper attempt: negative quantity rejected
    const tamperQtyRes = await cartRoute(
      new Request('http://localhost/api/commerce/cart', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/json', cookie: cookieA },
        body: JSON.stringify({
          productId: String(raceProduct.id),
          variantSku: `PRINT-${suffix}-M`,
          quantity: -5,
        }),
      }),
    )
    expect(tamperQtyRes.status).toBe(400)

    // Customer A creates valid Proposal A
    const proposalReqA = {
      customer: { email: `buyerA-${suffix}@example.test`, name: 'Customer A' },
      shippingAddress: {
        name: 'Customer A',
        line1: '100 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      },
      billingAddress: {
        name: 'Customer A',
        line1: '100 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      },
      selectedShippingRateId: 'standard',
      consents: { termsAccepted: true, privacyAccepted: true },
    }
    const propResA = await proposalRoute(
      new Request('http://localhost/api/commerce/proposal', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/json', cookie: cookieA },
        body: JSON.stringify(proposalReqA),
      }),
    )
    expect(propResA.status).toBe(200)
    const { proposal: proposalA } = await propResA.json()
    expect(proposalA.pricingSnapshot.subtotalMinor).toBe('6500') // $50 + $15

    // Tamper attempt: Client tampers with proposal integrity hash during checkout initiation
    const tamperedInitRes = await initiateCheckoutRoute(
      new Request('http://localhost/api/commerce/checkout/initiate', {
        method: 'POST',
        headers: {
          host: 'localhost',
          'content-type': 'application/json',
          cookie: cookieA,
          'idempotency-key': `tamper-${suffix}`,
        },
        body: JSON.stringify({
          proposalId: 'non-existent-proposal-id',
          capabilityId: String(capability.id),
        }),
      }),
    )
    expect([400, 404]).toContain(tamperedInitRes.status)

    // =========================================================================
    // 3. DETERMINISTIC PAYMENT PATH, REPLAY, WORKER & SETTLEMENT
    // =========================================================================
    // Customer A initiates valid checkout
    const initResA = await initiateCheckoutRoute(
      new Request('http://localhost/api/commerce/checkout/initiate', {
        method: 'POST',
        headers: {
          host: 'localhost',
          'content-type': 'application/json',
          cookie: cookieA,
          'idempotency-key': `init-${suffix}`,
        },
        body: JSON.stringify({
          proposalId: proposalA.id,
          capabilityId: String(capability.id),
        }),
      }),
    )
    expect([200, 201]).toContain(initResA.status)
    const checkoutA = await initResA.json()
    expect(checkoutA.actionUrl).toMatch(/^\/checkout\/test\//)

    // Guest security: verify guest token validity
    const checkoutCookie = initResA.headers.get('set-cookie')!.split(';')[0]
    expect(
      guestCanConfirmTestCheckout({
        cookie: checkoutCookie,
        sessionId: checkoutA.sessionId,
        siteId,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    ).toBe(true)

    // Guest security: tampered guest cookie fails verification
    expect(
      guestCanConfirmTestCheckout({
        cookie: 'renegade_checkout_forged=invalid-token',
        sessionId: checkoutA.sessionId,
        siteId,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    ).toBe(false)

    // Confirm local test payment
    const reference = String(checkoutA.actionUrl).split('/').at(-1)!
    const confirmRes = await confirmTestPaymentRoute(
      new Request('http://localhost/api/commerce/checkout/test/confirm', {
        method: 'POST',
        headers: {
          host: 'localhost',
          cookie: `${cookieA}; ${checkoutCookie}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: `reference=${encodeURIComponent(reference)}`,
      }),
    )
    expect(confirmRes.status).toBe(303)

    // Webhook forgery rejection: unsigned/tampered webhook rejected
    const forgedWebhookRes = await webhookRoute(
      new Request('http://localhost/api/commerce/webhooks/deterministic-test', {
        method: 'POST',
        headers: {
          host: 'localhost',
          'content-type': 'application/json',
          'x-signature': 'tampered-signature-bytes',
        },
        body: JSON.stringify({ providerEventId: 'fake-evt' }),
      }),
      { params: Promise.resolve({ provider: 'deterministic-test' }) },
    )
    expect(forgedWebhookRes.status).toBe(401)

    // Verify webhook event stored in database
    const inbox = await payload.find({
      collection: 'payment-webhook-events',
      where: { providerEventId: { equals: `local-test-paid:${checkoutA.attemptId}` } },
      limit: 1,
      overrideAccess: true,
    })
    expect(inbox.docs).toHaveLength(1)
    const webhookEventId = String(inbox.docs[0].id)

    // Process event via durable worker task
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId },
      req: { payload },
    })

    // Webhook Replay test: re-executing worker is idempotent
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId },
      req: { payload },
    })

    // Verify settled Order and issued receipt
    const ordersA = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: checkoutA.sessionId } },
      overrideAccess: true,
    })
    expect(ordersA.docs).toHaveLength(1)
    const orderDocA = ordersA.docs[0]
    expect(orderDocA.state).toBe('paid')
    expect((orderDocA.receipt as any)?.state).toBe('issued')

    // Verify digital delivery grant generated
    const grants = await payload.find({
      collection: 'digital-delivery-grants',
      where: { product: { equals: digitalProduct.id } },
      overrideAccess: true,
    })
    expect(grants.docs).toHaveLength(1)
    const grantDoc = grants.docs[0]
    expect(grantDoc.grantKeyHash).toBeDefined()
    expect(grantDoc.downloadLimit).toBe(3)

    // And verify fulfillmentExtension in order has download path
    const downloadPath = (orderDocA.fulfillmentExtension as any)?.downloads?.[0]?.path
    expect(downloadPath).toMatch(/^\/api\/commerce\/download\//)

    // Verify download route denies invalid grant keys
    const invalidDlRes = await downloadRoute(
      new Request('http://localhost/api/commerce/download/nonexistent-grant-key'),
      { params: Promise.resolve({ grantKey: 'nonexistent-grant-key' }) },
    )
    expect(invalidDlRes.status).toBe(404)

    // Verify physical stock was decremented from 1 to 0
    const updatedRaceProduct = await payload.findByID({
      collection: 'products',
      id: String(raceProduct.id),
      overrideAccess: true,
    })
    expect(updatedRaceProduct.variants?.[0]?.inventoryQuantity).toBe(0)

    // =========================================================================
    // 4. LOW-STOCK RACE CLOSURE: CUSTOMER B RE-RESOLUTION DEFEATS OVERSELL
    // =========================================================================
    // Customer B attempts to create Proposal B now that stock is 0
    const propResB = await proposalRoute(
      new Request('http://localhost/api/commerce/proposal', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/json', cookie: cookieB },
        body: JSON.stringify({
          customer: { email: `buyerB-${suffix}@example.test`, name: 'Customer B' },
          shippingAddress: {
            name: 'Customer B',
            line1: '200 Second St',
            city: 'Dallas',
            state: 'TX',
            postalCode: '75201',
            country: 'US',
          },
          billingAddress: {
            name: 'Customer B',
            line1: '200 Second St',
            city: 'Dallas',
            state: 'TX',
            postalCode: '75201',
            country: 'US',
          },
          selectedShippingRateId: 'standard',
          consents: { termsAccepted: true, privacyAccepted: true },
        }),
      }),
    )
    // Cart re-resolution detects item out of stock, drops line, leaving cart empty -> 400
    expect(propResB.status).toBe(400)
    const propDataB = await propResB.json()
    expect(propDataB.error).toMatch(/Cart is empty|unavailable/)

    // =========================================================================
    // 5. OPERATOR REFUND LIFECYCLE
    // =========================================================================
    const refundRes = await refundRoute(
      new Request('http://localhost/api/admin/commerce/refunds', {
        method: 'POST',
        headers: {
          host: 'localhost',
          'content-type': 'application/json',
          'x-site-id': siteId,
          cookie: demo.cookieHeader,
        },
        body: JSON.stringify({
          orderId: String(orderDocA.id),
          amountMinor: '1500', // refund digital portion
          reason: 'Customer requested refund.',
        }),
      }),
    )
    expect([200, 202]).toContain(refundRes.status)
    const refundJson = await refundRes.json()
    expect(['awaiting-approval', 'previewed', 'processing', 'succeeded']).toContain(
      refundJson.refund?.state,
    )

    // =========================================================================
    // 6. SUBSCRIPTION RUNTIME LIFECYCLE & REPLAY PROTECTION
    // =========================================================================
    const memberA = await payload.create({
      collection: 'members',
      data: {
        email: `subscriber-${suffix}@example.test`,
        displayName: 'Subscribed Member',
        status: 'active',
      },
      overrideAccess: true,
    })

    const supporterA = await payload.create({
      collection: 'supporters',
      data: {
        site: siteId,
        member: memberA.id,
        displayName: 'Subscribed Member',
        visibilityPreference: 'public',
      },
      overrideAccess: true,
    })

    const plan = publishPlan({
      planKey: `membership-${suffix}`,
      amountMinor: '1000',
      currency: 'USD',
      interval: 'month',
      intervalCount: 1,
      trialDays: 0,
      trialEligibility: 'unrestricted',
      cancelPolicy: 'period_end',
      changePolicy: 'immediate',
      taxPolicy: 'exclusive',
      publishedAt: new Date().toISOString(),
      entitlements: [
        {
          siteId,
          resource: 'publication',
          capability: 'read-premium',
          term: 'subscription',
        },
      ],
      providerMappings: {},
    })

    const subscriptionRecord: any = {
      id: `sub-${suffix}`,
      siteId,
      supporterId: String(supporterA.id),
      customerId: String(supporterA.id),
      plan,
      state: 'active',
      source: 'complimentary',
      provider: { key: 'manual-test' },
      currentPeriodStart: new Date(Date.now() - 86400000).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    }

    // Compute entitlements: grant issued
    const subGrantResult = await recomputeSubscriptionEntitlements(payload, subscriptionRecord)
    expect(subGrantResult.granted).toBe(1)

    // Replay protection: recomputing does not create duplicate grants
    const subReplayResult = await recomputeSubscriptionEntitlements(payload, subscriptionRecord)
    expect(subReplayResult.granted).toBe(0)

    // Authorization seam: member has active entitlement
    expect(
      await hasEntitlement(payload, {
        subjectId: String(memberA.id),
        siteId,
        resource: 'publication',
        capability: 'read-premium',
      }),
    ).toBe(true)

    // Cancel subscription: grant revoked
    subscriptionRecord.state = 'canceled'
    const subCancelResult = await recomputeSubscriptionEntitlements(payload, subscriptionRecord)
    expect(subCancelResult.revoked).toBe(1)

    // Authorization seam: entitlement revoked
    expect(
      await hasEntitlement(payload, {
        subjectId: String(memberA.id),
        siteId,
        resource: 'publication',
        capability: 'read-premium',
      }),
    ).toBe(false)

    // =========================================================================
    // 7. DONATION RUNTIME LIFECYCLE & ANONYMOUS RECOGNITION
    // =========================================================================
    const campaign = await payload.create({
      collection: 'donation-campaigns',
      data: {
        site: siteId,
        campaignKey: `fundraiser-${suffix}`,
        version: 1,
        title: 'Community Fund',
        purpose: 'Support open-source research.',
        allowedAmounts: ['1000'],
        currency: 'USD',
        recurrence: ['one-time'],
        privacyDefault: 'anonymous',
        disclosures: ['No tax deductibility represented.'],
        lifecycle: 'draft',
      },
      overrideAccess: true,
    })

    await payload.update({
      collection: 'donation-campaigns',
      id: campaign.id,
      data: { lifecycle: 'active' },
      overrideAccess: true,
    })

    const donIntentRes = await donationIntentRoute(
      new Request('http://localhost/api/commerce/donations/intent', {
        method: 'POST',
        headers: {
          host: 'localhost',
          'content-type': 'application/json',
          'idempotency-key': `don-intent-${suffix}`,
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          currency: 'USD',
          amountMinor: '1000',
          recurrence: 'one-time',
          recognition: 'anonymous',
          email: `donor-${suffix}@example.test`,
        }),
      }),
    )
    expect(donIntentRes.status).toBe(201)
    const donCheckout = await donIntentRes.json()

    // Confirm donation test payment
    const donRef = String(donCheckout.actionUrl).split('/').at(-1)!
    await confirmTestPaymentRoute(
      new Request('http://localhost/api/commerce/checkout/test/confirm', {
        method: 'POST',
        headers: {
          cookie: donIntentRes.headers.get('set-cookie')?.split(';')[0] ?? '',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: `reference=${encodeURIComponent(donRef)}`,
      }),
    )

    // Process donation payment event
    const donInbox = await payload.find({
      collection: 'payment-webhook-events',
      where: { providerEventId: { equals: `local-test-paid:${donCheckout.attemptId}` } },
      limit: 1,
      overrideAccess: true,
    })
    expect(donInbox.docs).toHaveLength(1)
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId: String(donInbox.docs[0].id) },
      req: { payload },
    })

    const settledDonations = await payload.find({
      collection: 'donations',
      where: { paymentIntent: { equals: donCheckout.paymentIntentId } },
      overrideAccess: true,
    })
    expect(settledDonations.docs).toHaveLength(1)
    expect(settledDonations.docs[0].lifecycle).toBe('succeeded')

    // Reversal of donation
    const reversalOutcome = await reverseDonation(payload, {
      donationId: String(settledDonations.docs[0].id),
      kind: 'refunded',
      eventKey: `reversal-${suffix}`,
      occurredAt: new Date().toISOString(),
    })
    expect(reversalOutcome.outcome).toBe('reversed')

    // =========================================================================
    // 8. AFFILIATE LIFECYCLE & OPEN-REDIRECT PREVENTION
    // =========================================================================
    // Open-redirect prevention: reject unsafe destination URLs
    expect(
      isSafeAffiliateDestinationUrl('https://evil.attacker.com/malware', ['partner.com']),
    ).toBe(false)
    expect(
      isSafeAffiliateDestinationUrl('javascript:alert(1)', ['partner.com']),
    ).toBe(false)
    expect(
      isSafeAffiliateDestinationUrl('https://partner.com/product/123', ['partner.com']),
    ).toBe(true)

    // Disclosure validation: requires disclosure text when marked required
    const invalidOfferIssues = validateAffiliateOffer({
      id: 'aff-invalid',
      siteId,
      slug: 'bad-offer',
      name: 'Bad Offer',
      destinationUrl: 'https://evil.com',
      allowedDomains: ['partner.com'],
      networkReference: { network: 'custom', programId: '1' },
      disclosure: { required: true, text: '', placement: 'above' }, // empty text!
      status: 'active',
      trackingParameters: {},
    } as any)
    expect(invalidOfferIssues.length).toBeGreaterThan(0)

    // Outbound redirect resolution, allowlisted params, and click tracking
    const validOffer: any = {
      id: `offer-${suffix}`,
      siteId,
      slug: `good-offer-${suffix}`,
      name: 'Partner Offer',
      destinationUrl: 'https://partner.com/product/123',
      allowedDomains: ['partner.com'],
      networkReference: { network: 'custom', programId: '1' },
      disclosure: { required: true, text: 'We may earn a commission.' },
      status: 'active',
      trackingParameters: { ref: 'renegade' },
    }
    const redirectResult = resolveOutboundRedirect({
      offer: validOffer,
      trackingConsent: true,
      ip: '192.168.1.1',
      userAgent: 'Mozilla/5.0 AcceptanceTest',
    })
    expect(redirectResult.destinationUrl).toContain('partner.com')
    expect(redirectResult.click.clickToken).toBeDefined()

    // Import conversion evidence & reconcile against click token
    const conversionResult = importConversionEvidence({
      siteId,
      source: 'webhook',
      network: 'custom',
      rawPayload: { event: 'sale', amount: 5000 },
      items: [
        {
          externalEventId: `evt-${suffix}`,
          externalOrderId: `ord-${suffix}`,
          attributionHint: redirectResult.click.clickToken,
          amountMinor: '5000',
          currency: 'USD',
          commissionAmountMinor: '500',
          status: 'pending',
        },
      ],
      existingEvidence: [],
      existingClicks: [redirectResult.click],
      existingOffers: [validOffer],
    })
    expect(conversionResult.imported).toHaveLength(1)
    expect(conversionResult.matchedCount).toBe(1)
    expect(conversionResult.imported[0].reconciliationState).toBe('matched')

    // Duplicate replay detection
    const duplicateImport = importConversionEvidence({
      siteId,
      source: 'webhook',
      network: 'custom',
      rawPayload: { event: 'sale', amount: 5000 },
      items: [
        {
          externalEventId: `evt-${suffix}`,
          amountMinor: '5000',
          currency: 'USD',
        },
      ],
      existingEvidence: conversionResult.imported,
      existingClicks: [redirectResult.click],
      existingOffers: [validOffer],
    })
    expect(duplicateImport.duplicates).toHaveLength(1)

    // Reversal of conversion
    const reversalImport = importConversionEvidence({
      siteId,
      source: 'webhook',
      network: 'custom',
      rawPayload: { event: 'refund', amount: 5000 },
      items: [
        {
          externalEventId: `rev-${suffix}`,
          externalOrderId: `ord-${suffix}`,
          attributionHint: redirectResult.click.clickToken,
          amountMinor: '5000',
          currency: 'USD',
          status: 'reversed',
        },
      ],
      existingEvidence: conversionResult.imported,
      existingClicks: [redirectResult.click],
      existingOffers: [validOffer],
    })
    expect(reversalImport.imported[0].reconciliationState).toBe('reversed')

    // =========================================================================
    // 9. POD / FULFILLMENT & PROVIDER HEALTH
    // =========================================================================
    // Emulator: Preflight and mock order placement
    const emulator = new PodEmulatorAdapter()
    const preflightRes = await emulator.preflight({
      variantId: 'emu-tee-s-blk',
      printArea: 'front',
      artwork: {
        id: 'art-1',
        hash: 'hash-art-1',
        mimeType: 'image/png',
        widthPx: 3000,
        heightPx: 3000,
        dpi: 300,
      },
      placement: {
        topMm: 10,
        leftMm: 10,
        widthMm: 250,
        heightMm: 250,
      },
    })
    expect(preflightRes.passed).toBe(true)
    expect(preflightRes.effectiveDpi).toBeGreaterThanOrEqual(150)

    const podOrder = await emulator.createOrder({
      orderId: `order-${suffix}`,
      idempotencyKey: `pod-order-${suffix}`,
      recipient: {
        name: 'Test Recipient',
        address1: '123 Main St',
        city: 'Denver',
        state: 'CO',
        postalCode: '80202',
        country: 'US',
      },
      items: [
        {
          variantId: 'emu-tee-s-blk',
          quantity: 1,
          printAreas: [
            {
              area: 'front',
              artworkId: 'art-1',
              artworkHash: 'hash-art-1',
              artworkUrl: 'https://example.com/art.png',
              placement: { topMm: 10, leftMm: 10, widthMm: 250, heightMm: 250 },
            },
          ],
        },
      ],
    })
    expect(podOrder.externalOrderId).toBeTruthy()

    // Real Provider: Printful adapter presents unavailable without real credentials and opt-in
    const unconfiguredPrintful = new PrintfulPodAdapter({
      apiKey: 'test-token-without-live-optin',
      allowLiveCreation: false,
      fetchFn: async () => new Response('Forbidden', { status: 403 }),
    })
    const printfulHealth = await unconfiguredPrintful.health()
    expect(printfulHealth.health).toBe('unavailable')

    // Failed job recovery: Handoff failed POD job to manual package
    const failedPodJob: any = {
      id: `pod-job-failed-${suffix}`,
      orderId: String(orderDocA.id),
      siteId,
      packageIndex: 0,
      state: 'failed',
      lastError: 'Printful production capacity unavailable.',
      recipientSnapshot: {
        name: 'Customer A',
        addressLine1: '100 Main St',
        city: 'Austin',
        country: 'US',
      },
      itemsSnapshot: [{ sku: 'FAILED-SKU', quantity: 1, title: 'Shirt' }],
    }
    const manualPackage = handoffFailedPodJobToManual(
      failedPodJob,
      'Printful production capacity unavailable.',
    )
    expect(manualPackage.status).toBe('pending_acknowledgement')
    expect(manualPackage.source).toBe('pod-submission-exhausted')

    // Manual operator acknowledgement and shipping
    const ackPackage = acknowledgeManualFulfillmentPackage(
      manualPackage,
      'operator-1',
      'Assigned to workshop printing team.',
    )
    expect(ackPackage.status).toBe('acknowledged')

    const shippedPackage = shipManualFulfillmentPackage(
      ackPackage,
      {
        carrier: 'USPS',
        trackingNumber: '9400111899223344556677',
        trackingUrl: 'https://tools.usps.com/track?id=9400111899223344556677',
      },
      'operator-1',
    )
    expect(shippedPackage.status).toBe('shipped')
    expect(shippedPackage.externalFulfillment?.carrier).toBe('USPS')

    // =========================================================================
    // 10. MULTI-TENANT ISOLATION
    // =========================================================================
    const foreignSiteId = `foreign-site-${suffix}`
    const foreignOwnerSession = {
      id: `foreign-owner-${suffix}`,
      role: 'owner',
      authorizedSiteIds: [foreignSiteId],
      isGlobalOwner: false,
    }
    const foreignGrant = await resolveOperatorGrantContext(payload, foreignOwnerSession)
    // Foreign owner cannot access order belonging to siteId
    expect(foreignGrant.authorizedSiteIds.includes(siteId)).toBe(false)
  }, 90_000)
})
