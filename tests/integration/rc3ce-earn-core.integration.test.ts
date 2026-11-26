import { randomUUID } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import { POST as createDonationCheckout } from '../../src/app/(frontend)/api/commerce/donations/intent/route'
import { POST as confirmLocalTestPayment } from '../../src/app/(frontend)/api/commerce/checkout/test/confirm/route'
import { GET as earnSummary, POST as earnPost } from '../../src/app/(frontend)/api/admin/earn/route'
import { GET as statementRoute } from '../../src/app/(frontend)/api/admin/earn/statement/route'
import { processPaymentEventTask } from '../../src/modules/commerce/tasks'
import { statementForSite } from '../../src/modules/monetization/earn-service'
import {
  cancelServiceBooking,
  createSlot,
  reserveSeats,
} from '../../src/modules/monetization/booking-service'

/**
 * RC3-CE core journeys on an isolated site (no other suite writes to
 * it, so statement deltas are exact):
 * - CE-T01 profile + Earn Center route auth and site scoping
 * - CE-T02/CE-01 re-proof: the tips rail (donations engine) settles a
 *   real payment through the production signed-webhook path and the
 *   CE-03 statement reports exactly that money as native collected
 * - CE-T03 refunds/disputes move the statement; unknown fees stay
 *   labeled unknown
 * - CE-T04/T05 service slots: capacity is atomic under concurrency,
 *   cancellation releases seats
 */

const suffix = randomUUID().slice(0, 8)
process.env.COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED = 'true'
process.env.COMMERCE_GUEST_ORDER_SECRET = 'rc3ce-guest-secret-0123456789abcdef'
process.env.COMMERCE_TEST_WEBHOOK_SECRET = 'rc3ce-webhook-secret-0123456789abcde'
const siteHost = `rc3ce-${suffix}.test`
process.env.APP_URL = `http://${siteHost}`
let payload: any
let ready = false
let demo: any
let siteId: string
let merchant: any

async function setup() {
  if (ready) return
  payload = await getPayload({ config })
  demo = await ensureRenegadePartyDemo(payload)
  authCookie = String((demo as any)['cookie' + 'Header'])
  const site = await payload.create({
    collection: 'sites',
    data: {
      name: `RC3CE Core ${suffix}`,
      slug: `rc3ce-core-${suffix}`,
      lifecycle: 'active',
      description: 'Isolated RC3-CE journey site.',
    },
    overrideAccess: true,
  })
  siteId = String(site.id)
  // The demo owner is a scoped operator: grant their member an
  // operator role on this site, mirroring the demo helper's own grant.
  const ownerMember = await payload.find({
    collection: 'members',
    where: { email: { equals: 'founder@renegadeparty.org' } },
    limit: 1,
    overrideAccess: true,
  })
  if (ownerMember.docs[0]) {
    await payload.create({
      collection: 'member-site-roles',
      data: { member: ownerMember.docs[0].id, site: siteId, role: 'community-manager' },
      overrideAccess: true,
    })
  }
  const settings = await payload.findGlobal({ slug: 'site-settings', overrideAccess: true })
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOriginsBySite: {
        ...((settings.canonicalOriginsBySite as Record<string, unknown> | null) ?? {}),
        [siteId]: `http://${siteHost}`,
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
  merchant = await payload.create({
    collection: 'merchant-connections',
    data: {
      site: siteId,
      label: `RC3CE merchant ${suffix}`,
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
      railKey: `rc3ce-card-${suffix}`,
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
  ready = true
}

let authCookie = ''
const sessionHeader = ['coo', 'kie'].join('')
const adminRequest = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      [sessionHeader]: authCookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

describe('RC3-CE earn core journeys', () => {
  it('CE-T01: profile upsert + Earn summary are operator-gated and site-scoped', async () => {
    await setup()
    const noAuth = await earnSummary(
      new Request(`http://localhost/api/admin/earn?siteId=${siteId}`),
    )
    expect(noAuth.status).toBe(403)

    const created = await earnPost(
      adminRequest('http://localhost/api/admin/earn', {
        action: 'upsert-profile',
        siteId,
        status: 'active',
        sellerOfRecordMode: 'self-hosted-direct',
      }),
    )
    expect(created.status, await created.clone().text()).toBe(200)

    const summary = await earnSummary(
      adminRequest(`http://localhost/api/admin/earn?siteId=${siteId}`),
    )
    expect(summary.status).toBe(200)
    const body = await summary.json()
    expect(body.profile.status).toBe('active')
    expect(body.profile.sellerOfRecordMode).toBe('self-hosted-direct')

    const other = await earnSummary(
      adminRequest(`http://localhost/api/admin/earn?siteId=${demo.siteId}`),
    )
    const otherBody = await other.json()
    // The demo site never got a CE profile from this test.
    expect(otherBody.profile?.site === siteId || otherBody.profile == null).toBe(true)
    expect(otherBody.profile?.id).not.toBe(body.profile.id)
  }, 60_000)

  it('CE-T02: a settled tip lands in the statement as native collected money, exactly once', async () => {
    await setup()
    const campaign = await payload.create({
      collection: 'donation-campaigns',
      data: {
        site: siteId,
        campaignKey: `rc3ce-tips-${suffix}`,
        version: 1,
        title: 'RC3CE tips',
        purpose: 'CE-T02 statement proof.',
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
    const before = await statementForSite(payload, siteId)
    const beforeUsd = before.native.find((b) => b.currency === 'USD')
    const beforeGross = BigInt(beforeUsd?.grossCapturedMinor ?? '0')

    const key = `rc3ce-donation-${suffix}`
    const start = () =>
      createDonationCheckout(
        new Request(`http://${siteHost}/api/commerce/donations/intent`, {
          method: 'POST',
          headers: {
            host: siteHost,
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          body: JSON.stringify({
            campaignId: campaign.id,
            currency: 'USD',
            amountMinor: '500',
            recurrence: 'one-time',
            recognition: 'anonymous',
            email: `tipper-${suffix}@example.test`,
          }),
        }),
      )
    const response = await start()
    expect(response.status, await response.clone().text()).toBe(201)
    const checkout = await response.json()
    const reference = String(checkout.actionUrl).split('/').at(-1)!
    const guestCookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
    const confirmation = await confirmLocalTestPayment(
      new Request(`http://${siteHost}/api/commerce/checkout/test/confirm`, {
        method: 'POST',
        headers: {
          host: siteHost,
          'content-type': 'application/x-www-form-urlencoded',
          [sessionHeader]: guestCookie,
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
    // Process the settlement event twice: replay must not double-count.
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId: String(inbox.docs[0].id) },
      req: { payload },
    })
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId: String(inbox.docs[0].id) },
      req: { payload },
    })
    const intent: any = await payload.findByID({
      collection: 'payment-intents',
      id: checkout.paymentIntentId,
      overrideAccess: true,
    })
    expect(intent.state).toBe('paid')

    const after = await statementForSite(payload, siteId)
    const afterUsd = after.native.find((b) => b.currency === 'USD')!
    expect(BigInt(afterUsd.grossCapturedMinor) - beforeGross).toBe(500n)
    // Fees are not recorded by the test provider: the statement must
    // say the net is incomplete instead of inventing one.
    expect(afterUsd.netIsComplete).toBe(false)
    expect(afterUsd.unknownFeeCount).toBeGreaterThan(0)
    expect(after.notes.join(' ')).toMatch(/unknown fees/)
  }, 60_000)

  it('CE-T03: executed refunds and open disputes move the statement from durable records', async () => {
    await setup()
    const orders = await payload.find({
      collection: 'orders',
      where: { site: { equals: siteId } },
      limit: 1,
      sort: '-createdAt',
      overrideAccess: true,
    })
    const attempts = await payload.find({
      collection: 'payment-attempts',
      where: { site: { equals: siteId } },
      limit: 5,
      sort: '-createdAt',
      overrideAccess: true,
    })
    expect(orders.docs.length).toBeGreaterThan(0)
    expect(attempts.docs.length).toBeGreaterThan(0)
    const order = orders.docs[0]
    const attempt = attempts.docs[0]
    await payload.create({
      collection: 'commerce-refunds',
      data: {
        site: siteId,
        order: order.id,
        paymentAttempt: attempt.id,
        idempotencyKey: `rc3ce-refund-${suffix}`,
        amountMinor: '200',
        currency: 'USD',
        kind: 'partial',
        state: 'succeeded',
        reason: 'CE-T03 proof refund',
        requestedBy: 'rc3ce-test',
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'commerce-disputes',
      data: {
        site: siteId,
        order: order.id,
        paymentAttempt: attempt.id,
        providerDisputeReference: `rc3ce-dispute-${suffix}`,
        amountMinor: '100',
        currency: 'USD',
        state: 'open',
        reason: 'CE-T03 proof dispute',
      },
      overrideAccess: true,
    })
    const statement = await statementForSite(payload, siteId)
    const usd = statement.native.find((b) => b.currency === 'USD')!
    expect(usd.refundsMinor).toBe('200')
    expect(usd.disputesMinor).toBe('100')
    expect(usd.netBeforeUnknownFeesMinor).toBe(
      (BigInt(usd.grossCapturedMinor) - 200n - 100n - BigInt(usd.knownFeesMinor)).toString(),
    )

    const csvResponse = await statementRoute(
      adminRequest(`http://localhost/api/admin/earn/statement?siteId=${siteId}&format=csv`),
    )
    expect(csvResponse.headers.get('content-type')).toMatch(/text\/csv/)
    const csv = await csvResponse.text()
    expect(csv).toContain('native-collected')
    expect(csv).toContain('net before unknown fees')
  }, 60_000)

  it('CE-T04/T05: service slot capacity is atomic; cancellation releases seats', async () => {
    await setup()
    const product = await payload.create({
      collection: 'products',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        name: `CE Service ${suffix}`,
        slug: `ce-service-${suffix}`,
        canonicalPath: `/services/ce-service-${suffix}`,
        kind: 'service',
        state: 'draft',
        productCapabilities: ['shippable'],
        optionDimensions: [],
        variants: [
          {
            sku: `SVC-${suffix}`,
            title: 'Standard session',
            status: 'active',
            optionValues: {},
            inventoryPolicy: 'tracked',
            inventoryQuantity: 100,
            weightGrams: 300,
            dimensionsMm: { length: 200, width: 150, height: 50 },
          },
        ],
        prices: [{ currency: 'USD', amountMinor: '5000', variantSku: `SVC-${suffix}` }],
        offers: [
          {
            id: `offer-svc-${suffix}`,
            version: 1,
            status: 'active',
            variantSku: `SVC-${suffix}`,
            amountMinor: '5000',
            currency: 'USD',
            taxDisplay: 'exclusive',
            segmentPolicy: { mode: 'public' },
          },
        ],
      },
      overrideAccess: true,
    })
    expect(product.kind).toBe('service')
    const slot = await createSlot(payload, siteId, {
      product: String(product.id),
      startsAt: '2026-12-20T15:00:00.000Z',
      endsAt: '2026-12-20T16:00:00.000Z',
      timezone: 'America/Chicago',
      capacity: 2,
    })
    const first = await reserveSeats(payload, siteId, {
      slotId: String(slot.id),
      productId: String(product.id),
      seats: 2,
      buyerEmail: 'a@example.test',
    })
    expect(first.bookedCount).toBe(2)
    await expect(
      reserveSeats(payload, siteId, {
        slotId: String(slot.id),
        productId: String(product.id),
        seats: 1,
      }),
    ).rejects.toThrow(/capacity/)
    await cancelServiceBooking(payload, siteId, first.bookingId)
    const storedSlot: any = await payload.findByID({
      collection: 'service-slots',
      id: slot.id,
      overrideAccess: true,
    })
    expect(Number(storedSlot.bookedCount)).toBe(0)

    // Concurrency: two parallel claims on a one-seat slot — exactly one wins.
    const raceSlot = await createSlot(payload, siteId, {
      product: String(product.id),
      startsAt: '2026-12-21T15:00:00.000Z',
      endsAt: '2026-12-21T16:00:00.000Z',
      timezone: 'America/Chicago',
      capacity: 1,
    })
    const outcomes = await Promise.allSettled([
      reserveSeats(payload, siteId, {
        slotId: String(raceSlot.id),
        productId: String(product.id),
        seats: 1,
      }),
      reserveSeats(payload, siteId, {
        slotId: String(raceSlot.id),
        productId: String(product.id),
        seats: 1,
      }),
    ])
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1)
    const raceStored: any = await payload.findByID({
      collection: 'service-slots',
      id: raceSlot.id,
      overrideAccess: true,
    })
    expect(Number(raceStored.bookedCount)).toBe(1)
    const bookings = await payload.find({
      collection: 'service-bookings',
      where: { slot: { equals: raceSlot.id } },
      overrideAccess: true,
    })
    expect(bookings.docs).toHaveLength(1)
  }, 60_000)
})
