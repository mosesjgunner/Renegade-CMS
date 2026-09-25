import { randomUUID } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import { POST as createDonationCheckout } from '../../src/app/(frontend)/api/commerce/donations/intent/route'
import { POST as confirmLocalTestPayment } from '../../src/app/(frontend)/api/commerce/checkout/test/confirm/route'
import { processPaymentEventTask } from '../../src/modules/commerce/tasks'

describe('SHOP-08 local donation checkout through public routes and durable payment job', () => {
  it('settles one gift, one order and one receipt across a replay', async () => {
    const payload = await getPayload({ config })
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    const suffix = randomUUID().slice(0, 8)
    process.env.LOCAL_E2E_TEST_MODE = 'true'
    process.env.COMMERCE_GUEST_ORDER_SECRET = 'integration-guest-order-secret-long-enough'
    process.env.COMMERCE_TEST_WEBHOOK_SECRET = 'integration-commerce-webhook-secret'
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
    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteId,
        label: `Local donation merchant ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    })
    await payload.create({
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
    const campaign = await payload.create({
      collection: 'donation-campaigns',
      data: {
        site: siteId,
        campaignKey: `local-donation-${suffix}`,
        version: 1,
        title: 'Local test giving',
        purpose: 'Verify the donation checkout lifecycle.',
        allowedAmounts: ['500'],
        currency: 'USD',
        recurrence: ['one-time'],
        privacyDefault: 'anonymous',
        disclosures: ['No tax status or deductibility is represented.'],
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
    const key = `shop08-donation-${suffix}`
    const start = () =>
      createDonationCheckout(
        new Request('http://localhost/api/commerce/donations/intent', {
          method: 'POST',
          headers: {
            host: 'localhost',
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          body: JSON.stringify({
            campaignId: campaign.id,
            currency: 'USD',
            amountMinor: '500',
            recurrence: 'one-time',
            recognition: 'anonymous',
            email: `donor-${suffix}@example.test`,
          }),
        }),
      )
    const response = await start()
    expect(response.status).toBe(201)
    const checkout = await response.json()
    expect(checkout.providerMode).toBe('deterministic-test')
    expect(checkout.actionUrl).toMatch(/^\/checkout\/test\/det_cs_/)
    const replay = await start()
    expect(replay.status).toBe(200)
    expect((await replay.json()).paymentIntentId).toBe(checkout.paymentIntentId)
    const reference = String(checkout.actionUrl).split('/').at(-1)!
    const confirmation = await confirmLocalTestPayment(
      new Request('http://localhost/api/commerce/checkout/test/confirm', {
        method: 'POST',
        headers: {
          cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: `reference=${encodeURIComponent(reference)}`,
      }),
    )
    expect(confirmation.status).toBe(303)
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
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId: String(inbox.docs[0].id) },
      req: { payload },
    })
    const donations = await payload.find({
      collection: 'donations',
      where: { paymentIntent: { equals: checkout.paymentIntentId } },
      overrideAccess: true,
    })
    const orders = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: checkout.sessionId } },
      overrideAccess: true,
    })
    expect(donations.docs).toHaveLength(1)
    expect(orders.docs).toHaveLength(1)
    expect((orders.docs[0].receipt as { state?: string } | undefined)?.state).toBe('issued')
    const receipts = await payload.find({
      collection: 'email-deliveries',
      where: { recipientEmail: { equals: `donor-${suffix}@example.test` } },
      overrideAccess: true,
    })
    expect(receipts.docs).toHaveLength(1)
  }, 30_000)
})
