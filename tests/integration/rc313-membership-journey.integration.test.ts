/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import { buildRc2World, teardownRc2World, type Rc2World } from '../fixtures/rc2-world'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import { POST as subscriptionCheckout } from '../../src/app/(frontend)/api/commerce/subscriptions/checkout/route'
import { GET as billingReadback } from '../../src/app/(frontend)/api/commerce/subscriptions/route'
import { POST as commerceWebhook } from '../../src/app/(frontend)/api/commerce/webhooks/[provider]/route'
import { POST as createDonationCheckout } from '../../src/app/(frontend)/api/commerce/donations/intent/route'
import { POST as confirmLocalTestPayment } from '../../src/app/(frontend)/api/commerce/checkout/test/confirm/route'
import {
  createDeterministicPaymentAdapter,
  type DeterministicAdapterControls,
  type NormalizedSubscriptionEvent,
  type PaymentProviderAdapter,
  type RecurringPaymentProvider,
} from '../../src/modules/commerce/payment-provider'
import { hasEntitlement } from '../../src/modules/commerce/subscription-service'
import { reconcileBillingSubscription } from '../../src/modules/commerce/subscription-reconciliation'
import { processPaymentEventTask } from '../../src/modules/commerce/tasks'
import {
  consumeMagicLink,
  issueMagicLink,
  memberSessionCookie,
} from '../../src/modules/identity/member-identity'

/**
 * RC3-13 proof (non-podcast slice): membership purchase, access and
 * revocation in provider test mode. The deterministic provider is the
 * sandbox fixture (F-02: no recurring fixture existed); the journey
 * drives the real checkout route, the real signed-webhook route and
 * the real billing reconciliation against real Postgres in a two-site
 * world. Protected member FEED readback is podcast-dependent and
 * deferred to RC3-11; no live provider is claimed anywhere here.
 */

const FIXTURE_SECRET = 'rc313-deterministic-fixture-secret-0123456789'
const CSRF = 'rc313-csrf-token'

let payload: Payload
let world: Rc2World
let fixture: PaymentProviderAdapter & RecurringPaymentProvider & DeterministicAdapterControls
let planAId = ''
let planBId = ''
let hostA = ''
let hostB = ''
const sessions = new Map<string, string>()
const rel = (value: any) => String(typeof value === 'object' && value ? value.id : (value ?? ''))

let clock = Date.now()
const nextTs = () => new Date((clock += 1000)).toISOString()

const memberHeaders = (host: string, memberId: string, extra: Record<string, string> = {}) => {
  const headers = new Headers({
    host,
    'content-type': 'application/json',
    cookie: `${memberSessionCookie(sessions.get(memberId)!, false)}; renegade-member-csrf=${CSRF}`,
    'x-member-csrf': CSRF,
    ...extra,
  })
  return headers
}

const purchase = async (host: string, memberId: string, planRevisionId: string, key: string) =>
  subscriptionCheckout(
    new Request(`https://${host}/api/commerce/subscriptions/checkout`, {
      method: 'POST',
      headers: memberHeaders(host, memberId, { 'idempotency-key': key }),
      body: JSON.stringify({ planRevisionId }),
    }),
  )

const sendEvent = async (event: NormalizedSubscriptionEvent) => {
  // Webhook dedupe keys are global, so event ids are scoped to this run.
  const scoped = {
    ...event,
    providerEventId: `det_${world.suffix}_${event.providerEventId}`,
  }
  const { raw, signature } = fixture.signSubscriptionEvent(scoped)
  return commerceWebhook(
    new Request('https://hooks.example.test/api/commerce/webhooks/deterministic-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-commerce-signature': signature },
      body: raw,
    }),
    { params: Promise.resolve({ provider: 'deterministic-test' }) },
  )
}

const subscriptionRow = async (id: string) =>
  payload.findByID({
    collection: 'subscriptions',
    id,
    depth: 0,
    overrideAccess: true,
  } as never) as any
const orderFor = async (subscriptionId: string) =>
  (
    await payload.find({
      collection: 'orders',
      where: { orderNumber: { equals: `SUB-${subscriptionId}` } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as any
const grantsFor = async (subscriptionId: string) =>
  (
    await payload.find({
      collection: 'entitlements',
      where: { source: { equals: `subscription:${subscriptionId}` } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs as any[]
const eventsFor = async (subscriptionId: string) =>
  (
    await payload.find({
      collection: 'subscription-events',
      where: { subscription: { equals: subscriptionId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs as any[]

const mintSession = async (email: string, expectedMemberId: string) => {
  const issued = await issueMagicLink(payload as never, email)
  expect(issued.token).toBeTruthy()
  const consumed = await consumeMagicLink(payload as never, issued.token!)
  expect(consumed?.memberId).toBe(expectedMemberId)
  sessions.set(expectedMemberId, consumed!.sessionToken)
}

beforeAll(async () => {
  process.env.COMMERCE_TEST_WEBHOOK_SECRET = FIXTURE_SECRET
  payload = await getPayload({ config })
  world = await buildRc2World(payload)
  fixture = createDeterministicPaymentAdapter({ secret: FIXTURE_SECRET })

  // Bind this world's sites to unique hosts in canonical origins so host
  // routing resolves unambiguously even when other worlds share the DB.
  const suffix = world.suffix
  hostA = `a313-${suffix}.test`
  hostB = `b313-${suffix}.test`
  const settings = (await payload.findGlobal({
    slug: 'site-settings',
    overrideAccess: true,
  } as never)) as any
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOriginsBySite: {
        ...((settings.canonicalOriginsBySite as Record<string, unknown> | null) ?? {}),
        [world.siteA.siteId]: `https://${hostA}`,
        [world.siteB.siteId]: `https://${hostB}`,
      },
    },
    overrideAccess: true,
  } as never)

  for (const site of [world.siteA, world.siteB]) {
    await payload.create({
      collection: 'merchant-connections',
      data: {
        site: site.siteId,
        label: `RC313 test merchant ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    } as never)
  }

  const makePlan = async (site: typeof world.siteA, priceReference: string, planKey: string) =>
    payload.create({
      collection: 'plan-revisions',
      data: {
        site: site.siteId,
        planKey,
        revision: 1,
        name: 'Members',
        lifecycle: 'published',
        interval: 'month',
        intervalCount: 1,
        amountMinor: '1200',
        currency: 'USD',
        trialDays: 0,
        trialEligibility: 'none',
        entitlements: [
          {
            resource: 'members-lounge',
            capability: 'read',
            siteId: site.siteId,
            term: 'subscription',
          },
          {
            resource: `media:${site.mediaAssetId}`,
            capability: 'download',
            siteId: site.siteId,
            term: 'subscription',
          },
        ],
        cancelPolicy: 'period_end',
        changePolicy: 'period_end',
        taxPolicy: 'provider',
        providerMappings: { 'deterministic-test': priceReference },
        publishedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never) as any

  planAId = String((await makePlan(world.siteA, 'det_price_members_a', `members-${suffix}`)).id)
  planBId = String((await makePlan(world.siteB, 'det_price_members_b', `members-b-${suffix}`)).id)

  await mintSession(world.siteA.member.email, world.siteA.member.memberId)
  await mintSession(world.siteA.subscriber.email, world.siteA.subscriber.memberId)
  await mintSession(world.siteB.member.email, world.siteB.member.memberId)
}, 240000)

afterAll(async () => {
  await teardownRc2World(payload, world)
})

describe('RC3-13 membership: purchase in provider test mode', () => {
  let subscriptionId = ''
  let subscriptionRef = ''

  it('creates an incomplete subscription, a pending order and no access before payment', async () => {
    const memberId = world.siteA.member.memberId
    const response = await purchase(hostA, memberId, planAId, 'rc313-buy-a1')
    expect(response.status).toBe(201)
    const body = await response.json()
    subscriptionId = String(body.subscriptionId)
    expect(body.url).toContain('/checkout/test/det_scs_')

    const row = await subscriptionRow(subscriptionId)
    expect(row.state).toBe('incomplete')
    expect(row.providerKey).toBe('deterministic-test')
    subscriptionRef = String(row.providerSubscriptionReference)
    expect(subscriptionRef).toMatch(/^det_sub_/)

    const order = await orderFor(subscriptionId)
    expect(order.state).toBe('pending-payment')
    expect(String(order.amountMinor)).toBe('1200')
    const session = (await payload.findByID({
      collection: 'checkout-sessions',
      id: rel(order.checkoutSession),
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(session.state).toBe('pending')

    expect(
      await hasEntitlement(payload, {
        subjectId: memberId,
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(false)

    // Replaying the purchase with the same idempotency key reuses the subscription.
    const replay = await purchase(hostA, memberId, planAId, 'rc313-buy-a1')
    const replayBody = await replay.json()
    expect(String(replayBody.subscriptionId)).toBe(subscriptionId)
    const all = await payload.find({
      collection: 'subscriptions',
      where: { checkoutKey: { equals: row.checkoutKey } },
      limit: 10,
      overrideAccess: true,
    } as never)
    expect(all.docs).toHaveLength(1)
  })

  it('settles the receipt and grants gated page + media access on signed payment events', async () => {
    const memberId = world.siteA.member.memberId
    fixture.setSubscriptionState(subscriptionRef, { state: 'active' })
    const activated = await sendEvent({
      providerEventId: `det_evt_a1_activated`,
      subscriptionReference: subscriptionRef,
      kind: 'activated',
      occurredAt: nextTs(),
      sequence: 1,
      evidence: {},
    })
    expect(activated.status).toBe(202)
    const paid = await sendEvent({
      providerEventId: `det_evt_a1_paid`,
      subscriptionReference: subscriptionRef,
      kind: 'invoice_paid',
      occurredAt: nextTs(),
      sequence: 2,
      invoiceReference: 'det_in_a1',
      evidence: { invoiceReference: 'det_in_a1', amountMinor: '1200', currency: 'USD' },
    })
    expect(paid.status).toBe(202)

    const row = await subscriptionRow(subscriptionId)
    expect(row.state).toBe('active')
    const order = await orderFor(subscriptionId)
    expect(order.state).toBe('paid')
    expect(order.transitionLog?.[0]?.kind).toBe('subscription-invoice-paid')
    const session = (await payload.findByID({
      collection: 'checkout-sessions',
      id: rel(order.checkoutSession),
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(session.state).toBe('completed')

    const grants = await grantsFor(subscriptionId)
    expect(grants).toHaveLength(2)
    expect(grants.every((grant) => !grant.revokedAt)).toBe(true)
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId,
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(true)
    // The exact check the protected download route performs.
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId,
        siteId: world.siteA.siteId,
        resource: `media:${world.siteA.mediaAssetId}`,
        capability: 'download',
        unmetered: true,
      }),
    ).toBe(true)
    // Nothing leaks to the second site.
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId,
        siteId: world.siteB.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(false)

    // Member billing readback: state, the paid invoice ledger, both downloads.
    const billing = await billingReadback(
      new Request(`https://${hostA}/api/commerce/subscriptions`, {
        method: 'GET',
        headers: memberHeaders(hostA, memberId),
      }),
    )
    expect(billing.status).toBe(200)
    const billingBody = await billing.json()
    const mine = billingBody.subscriptions.find((sub: any) => String(sub.id) === subscriptionId)
    expect(mine.state).toBe('active')
    expect(mine.invoices).toEqual([
      {
        reference: 'det_in_a1',
        state: 'paid',
        amountMinor: '1200',
        currency: 'USD',
        occurredAt: expect.any(String),
      },
    ])
    expect(mine.downloads).toEqual([
      { path: `/api/commerce/subscriptions/download/${world.siteA.mediaAssetId}` },
    ])
  })

  it('treats a duplicate delivery as a replay and changes nothing', async () => {
    const before = await eventsFor(subscriptionId)
    const grantsBefore = await grantsFor(subscriptionId)
    const replay = await sendEvent({
      providerEventId: `det_evt_a1_paid`,
      subscriptionReference: subscriptionRef,
      kind: 'invoice_paid',
      occurredAt: nextTs(),
      sequence: 2,
      invoiceReference: 'det_in_a1',
      evidence: { invoiceReference: 'det_in_a1', amountMinor: '1200', currency: 'USD' },
    })
    expect(replay.status).toBe(200)
    expect((await replay.json()).replay).toBe(true)
    expect(await eventsFor(subscriptionId)).toHaveLength(before.length)
    expect(await grantsFor(subscriptionId)).toHaveLength(grantsBefore.length)
    expect((await orderFor(subscriptionId)).state).toBe('paid')
  })

  it('cancels at period end, keeps access until the end, then revokes', async () => {
    const memberId = world.siteA.member.memberId
    fixture.setSubscriptionState(subscriptionRef, { state: 'active', cancelAtPeriodEnd: true })
    const cancel = await sendEvent({
      providerEventId: `det_evt_a1_cancel`,
      subscriptionReference: subscriptionRef,
      kind: 'cancel_scheduled',
      occurredAt: nextTs(),
      sequence: 3,
      evidence: {},
    })
    expect(cancel.status).toBe(202)
    let row = await subscriptionRow(subscriptionId)
    expect(row.state).toBe('cancel_at_period_end')
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId,
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(true)

    const afterEnd = new Date(Date.parse(String(row.currentPeriodEnd)) + 48 * 3600 * 1000)
    const reconciled = await reconcileBillingSubscription(payload, subscriptionId, afterEnd)
    expect(reconciled.state).toBe('canceled')
    row = await subscriptionRow(subscriptionId)
    expect(row.state).toBe('canceled')
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId,
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(false)
    const grants = await grantsFor(subscriptionId)
    expect(grants.every((grant) => grant.revokedAt)).toBe(true)
  })
})

describe('RC3-13 membership: out-of-order and failed payment', () => {
  let subscriptionId = ''
  let subscriptionRef = ''
  const memberId = () => world.siteA.subscriber.memberId

  it('converges when invoice_paid arrives before activated, and stale events change nothing', async () => {
    const response = await purchase(hostA, memberId(), planAId, 'rc313-buy-a2')
    expect(response.status).toBe(201)
    subscriptionId = String((await response.json()).subscriptionId)
    subscriptionRef = String((await subscriptionRow(subscriptionId)).providerSubscriptionReference)
    fixture.setSubscriptionState(subscriptionRef, { state: 'active' })

    // Out of order: the payment lands before the activation notice.
    const paidFirst = await sendEvent({
      providerEventId: 'det_evt_a2_paid',
      subscriptionReference: subscriptionRef,
      kind: 'invoice_paid',
      occurredAt: nextTs(),
      sequence: 2,
      invoiceReference: 'det_in_a2',
      evidence: { invoiceReference: 'det_in_a2', amountMinor: '1200', currency: 'USD' },
    })
    expect(paidFirst.status).toBe(202)
    const activatedLate = await sendEvent({
      providerEventId: 'det_evt_a2_activated',
      subscriptionReference: subscriptionRef,
      kind: 'activated',
      occurredAt: new Date(clock - 60_000).toISOString(),
      sequence: 1,
      evidence: {},
    })
    expect(activatedLate.status).toBe(202)

    let row = await subscriptionRow(subscriptionId)
    expect(row.state).toBe('active')
    expect((await orderFor(subscriptionId)).state).toBe('paid')
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId(),
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(true)

    // A stale failure notice (older sequence + timestamp, new event id) is
    // recorded in the ledger but must not move state, version or access.
    const versionBefore = Number(row.version)
    const stale = await sendEvent({
      providerEventId: 'det_evt_a2_stale_failure',
      subscriptionReference: subscriptionRef,
      kind: 'invoice_failed',
      occurredAt: new Date(clock - 30_000).toISOString(),
      sequence: 1,
      invoiceReference: 'det_in_a2',
      evidence: { invoiceReference: 'det_in_a2' },
    })
    expect(stale.status).toBe(202)
    row = await subscriptionRow(subscriptionId)
    expect(row.state).toBe('active')
    expect(Number(row.version)).toBe(versionBefore)
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId(),
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(true)
  })

  it('keeps access through the grace window after a failed renewal, then expires it', async () => {
    fixture.setSubscriptionState(subscriptionRef, { state: 'past_due' })
    const failed = await sendEvent({
      providerEventId: 'det_evt_a2_failed',
      subscriptionReference: subscriptionRef,
      kind: 'invoice_failed',
      occurredAt: nextTs(),
      sequence: 3,
      invoiceReference: 'det_in_a2_renewal',
      evidence: { invoiceReference: 'det_in_a2_renewal' },
    })
    expect(failed.status).toBe(202)
    let row = await subscriptionRow(subscriptionId)
    expect(row.state).toBe('grace')
    expect(row.failure?.code).toBe('renewal-failed')
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId(),
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(true)

    const reconciled = await reconcileBillingSubscription(
      payload,
      subscriptionId,
      new Date(Date.now() + 100 * 24 * 3600 * 1000),
    )
    expect(reconciled.state).toBe('expired')
    row = await subscriptionRow(subscriptionId)
    expect(row.state).toBe('expired')
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId(),
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(false)
    const grants = await grantsFor(subscriptionId)
    expect(grants.length).toBeGreaterThan(0)
    expect(grants.every((grant) => grant.revokedAt)).toBe(true)
  })
})

describe('RC3-13 membership: refund revocation and second-site isolation', () => {
  it('revokes access when an invoice-only refund event resolves to a full refund', async () => {
    const memberId = world.siteA.member.memberId
    const response = await purchase(hostA, memberId, planAId, 'rc313-buy-a3')
    expect(response.status).toBe(201)
    const subscriptionId = String((await response.json()).subscriptionId)
    const subscriptionRef = String(
      (await subscriptionRow(subscriptionId)).providerSubscriptionReference,
    )
    fixture.setSubscriptionState(subscriptionRef, { state: 'active' })
    await sendEvent({
      providerEventId: 'det_evt_a3_paid',
      subscriptionReference: subscriptionRef,
      kind: 'invoice_paid',
      occurredAt: nextTs(),
      sequence: 1,
      invoiceReference: 'det_in_a3',
      evidence: { invoiceReference: 'det_in_a3', amountMinor: '1200', currency: 'USD' },
    })
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId,
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(true)

    // The refund callback carries only the invoice reference; the route
    // resolves it through the provider and upgrades it to a full-refund hold.
    fixture.setInvoice('det_in_a3', { subscriptionReference: subscriptionRef, fullyRefunded: true })
    fixture.setSubscriptionState(subscriptionRef, { state: 'paused' })
    const refund = await sendEvent({
      providerEventId: 'det_evt_a3_refund',
      kind: 'refund_recorded',
      occurredAt: nextTs(),
      sequence: 2,
      invoiceReference: 'det_in_a3',
      evidence: { invoiceReference: 'det_in_a3' },
    })
    expect(refund.status).toBe(202)
    const row = await subscriptionRow(subscriptionId)
    expect(row.state).toBe('paused')
    expect(row.failure?.code).toBe('payment-refunded')
    expect(
      await hasEntitlement(payload, {
        subjectId: memberId,
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(false)
    const grants = await grantsFor(subscriptionId)
    expect(grants.every((grant) => grant.revokedAt)).toBe(true)
    // The member is told, through the billing notice path.
    const notices = await payload.find({
      collection: 'notifications',
      where: { recipientMember: { equals: memberId } },
      limit: 100,
      depth: 1,
      overrideAccess: true,
    } as never)
    const types = notices.docs.map((notice: any) => notice.activityEvent?.type)
    expect(types).toContain('billing.payment_refunded')
  })

  it('keeps the second site fully isolated', async () => {
    const memberB = world.siteB.member.memberId
    // Site A's plan cannot be bought through site B's host.
    const cross = await purchase(hostB, memberB, planAId, 'rc313-buy-cross')
    expect(cross.status).toBe(404)

    const response = await purchase(hostB, memberB, planBId, 'rc313-buy-b1')
    expect(response.status).toBe(201)
    const subscriptionId = String((await response.json()).subscriptionId)
    const subscriptionRef = String(
      (await subscriptionRow(subscriptionId)).providerSubscriptionReference,
    )
    fixture.setSubscriptionState(subscriptionRef, { state: 'active' })
    await sendEvent({
      providerEventId: 'det_evt_b1_paid',
      subscriptionReference: subscriptionRef,
      kind: 'invoice_paid',
      occurredAt: nextTs(),
      sequence: 1,
      invoiceReference: 'det_in_b1',
      evidence: { invoiceReference: 'det_in_b1', amountMinor: '1200', currency: 'USD' },
    })
    expect(
      await hasEntitlement(payload, {
        subjectId: memberB,
        siteId: world.siteB.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(true)
    expect(
      await hasEntitlement(payload, {
        subjectId: memberB,
        siteId: world.siteA.siteId,
        resource: 'members-lounge',
        capability: 'read',
      }),
    ).toBe(false)
    expect(
      await hasEntitlement(payload, {
        subjectId: world.siteA.member.memberId,
        siteId: world.siteB.siteId,
        resource: `media:${world.siteB.mediaAssetId}`,
        capability: 'download',
        unmetered: true,
      }),
    ).toBe(false)
  })
})

describe('RC3-13 focused readbacks: shop and donations', () => {
  it('reads back the shop paid order with its session and amounts in agreement', async () => {
    const order = (await payload.findByID({
      collection: 'orders',
      id: world.siteA.paidOrderId!,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(order.state).toBe('paid')
    expect(String(order.amountMinor)).toBe('5000')
    expect(order.currency).toBe('USD')
    const session = (await payload.findByID({
      collection: 'checkout-sessions',
      id: rel(order.checkoutSession),
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(String(session.amountMinor)).toBe(String(order.amountMinor))
    expect(session.currency).toBe(order.currency)
    const unpaid = (await payload.findByID({
      collection: 'orders',
      id: world.siteA.unpaidOrderId!,
      depth: 0,
      overrideAccess: true,
    } as never)) as any
    expect(unpaid.state).toBe('pending-payment')
  })

  it('settles a one-time donation and reads back the donation, order receipt and campaign', async () => {
    process.env.COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED = 'true'
    process.env.COMMERCE_GUEST_ORDER_SECRET = 'rc313-guest-order-secret-0123456789abcdef'
    process.env.COMMERCE_TEST_WEBHOOK_SECRET = 'rc313-test-webhook-secret-0123456789abcdef'
    const demo = await ensureRenegadePartyDemo(payload)
    const siteId = demo.siteId
    const suffix = randomUUID().slice(0, 8)
    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      overrideAccess: true,
    } as never)) as any
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
    } as never)
    const merchant = (await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteId,
        label: `RC313 donation merchant ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    } as never)) as any
    await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: siteId,
        merchantConnection: merchant.id,
        providerKey: 'deterministic-test',
        railKey: `rc313-card-${suffix}`,
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
    } as never)
    const campaign = (await payload.create({
      collection: 'donation-campaigns',
      data: {
        site: siteId,
        campaignKey: `rc313-donation-${suffix}`,
        version: 1,
        title: 'RC313 giving check',
        purpose: 'Verify the donation readback for the membership pass.',
        allowedAmounts: ['500'],
        currency: 'USD',
        recurrence: ['one-time'],
        privacyDefault: 'anonymous',
        disclosures: ['No tax status or deductibility is represented.'],
        lifecycle: 'draft',
      },
      overrideAccess: true,
    } as never)) as any
    await payload.update({
      collection: 'donation-campaigns',
      id: campaign.id,
      data: { lifecycle: 'active' },
      overrideAccess: true,
    } as never)

    const start = await createDonationCheckout(
      new Request('http://localhost/api/commerce/donations/intent', {
        method: 'POST',
        headers: {
          host: 'localhost',
          'content-type': 'application/json',
          'idempotency-key': `rc313-donation-${suffix}`,
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          currency: 'USD',
          amountMinor: '500',
          recurrence: 'one-time',
          recognition: 'anonymous',
          email: `donor313-${suffix}@example.test`,
        }),
      }),
    )
    expect(start.status).toBe(201)
    const checkout = await start.json()
    const reference = String(checkout.actionUrl).split('/').at(-1)!
    const confirmation = await confirmLocalTestPayment(
      new Request('http://localhost/api/commerce/checkout/test/confirm', {
        method: 'POST',
        headers: {
          cookie: start.headers.get('set-cookie')?.split(';')[0] ?? '',
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
    } as never)
    expect(inbox.docs).toHaveLength(1)
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId: String((inbox.docs[0] as any).id) },
      req: { payload },
    })

    const donations = await payload.find({
      collection: 'donations',
      where: { paymentIntent: { equals: checkout.paymentIntentId } },
      overrideAccess: true,
    } as never)
    expect(donations.docs).toHaveLength(1)
    const orders = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: checkout.sessionId } },
      overrideAccess: true,
    } as never)
    expect(orders.docs).toHaveLength(1)
    expect(((orders.docs[0] as any).receipt as { state?: string } | undefined)?.state).toBe(
      'issued',
    )
    // Campaign totals are derived from settled donations, not stored on the
    // (immutable) campaign revision: the operator readback sums to the gift.
    const campaignDonations = await payload.find({
      collection: 'donations',
      where: { campaign: { equals: campaign.id } },
      limit: 100,
      overrideAccess: true,
    } as never)
    expect(campaignDonations.docs).toHaveLength(1)
    const raised = campaignDonations.docs.reduce(
      (sum, donation: any) => sum + BigInt(String(donation.baseAmountMinor ?? '0')),
      0n,
    )
    expect(raised.toString()).toBe('500')
  }, 60000)
})
