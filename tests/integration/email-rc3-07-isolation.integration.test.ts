import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import {
  localMailSinkReceipts,
  resetLocalMailSink,
  simulateLocalMailSinkOutcome,
  type EmailDeliveryAdapter,
  type EmailDeliveryRequest,
  type EmailDeliveryResult,
} from '../../src/modules/email/delivery'
import { createPostmarkEmailAdapter } from '../../src/modules/email/postmark'
import {
  dispatchEmailIntent,
  enqueueEmailIntent,
  recoverAccountEmailOutbox,
} from '../../src/modules/email/outbox'
import { emailDeliveryTask, recoverEmailOutbox } from '../../src/modules/audience/tasks'
import {
  canDeliverToSubscriber,
  confirmDoubleOptIn,
  queueNewsletterDeliveries,
  requestDoubleOptIn,
  suppressSubscriber,
} from '../../src/modules/audience/service'
import { audienceDigest, normalizeEmailAddress } from '../../src/modules/audience/contracts'

/**
 * RC3-07 — Production email isolation, FIXTURE LEGS ONLY.
 *
 * Two isolated sites, deterministic provider fixtures (the development
 * capture sink, scripted adapter overrides, and a stubbed-fetch Postmark
 * adapter). No real provider account, inbox, or send is involved; live
 * placement evidence stays BLOCKED-ON-OWNER (EMAIL-11).
 *
 * Baseline note: DEBT-15's suppression-counting fix (RC3-02) is NOT in
 * this tree; suppression fixtures here assert dispatch behavior only.
 */
let payload: Payload
let siteA = ''
let siteB = ''
let listA = ''
let listB = ''
const run = Math.random().toString(36).slice(2, 8)

async function findSiteBySlug(slug: string) {
  const found = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  return found.docs[0] as unknown as { id: string } | undefined
}

async function ensureList(siteId: string, name: string) {
  const found = await payload.find({
    collection: 'audience-lists',
    where: { site: { equals: siteId } },
    limit: 100,
    overrideAccess: true,
  })
  const existing = (found.docs as unknown as { id: string; name: string }[]).find(
    (doc) => doc.name === name,
  )
  if (existing) return String(existing.id)
  const created = await payload.create({
    collection: 'audience-lists',
    data: { site: siteId, name },
    overrideAccess: true,
  } as never)
  return String((created as unknown as { id: string }).id)
}

async function createSubscriber(siteId: string, email: string, status = 'active') {
  const created = await payload.create({
    collection: 'subscribers',
    data: {
      site: siteId,
      email,
      emailHash: audienceDigest(normalizeEmailAddress(email)),
      status,
    },
    overrideAccess: true,
  } as never)
  return created as unknown as { id: string }
}

async function addMembership(subscriberId: string, listId: string) {
  return payload.create({
    collection: 'audience-memberships',
    data: { subscriber: subscriberId, audienceList: listId, status: 'active', source: 'rc3-07' },
    overrideAccess: true,
  } as never)
}

async function runDelivery(deliveryId: string) {
  await (emailDeliveryTask.handler as never as (args: unknown) => Promise<unknown>)({
    input: { deliveryId },
    req: { payload },
  })
}

async function deliveryState(id: string) {
  return (await payload.findByID({
    collection: 'email-deliveries',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as { status: string; outcome?: { code?: string } }
}

async function intentState(id: string) {
  return (await payload.findByID({
    collection: 'email-intents',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as {
    submission: string
    provider?: string
    providerMessageId?: string
    lastError?: { code?: string }
  }
}

async function deliveriesForMessage(messageId: string) {
  const found = await payload.find({
    collection: 'email-deliveries',
    where: { message: { equals: messageId } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs as unknown as { id: string; recipientEmail: string; status: string }[]
}

/** A deterministic scripted provider fixture: records every send and
 * answers send/reconcile from the script it was given. */
function fixtureAdapter(input: {
  id: string
  sendResult: EmailDeliveryResult
  reconcileResult?: EmailDeliveryResult | null
}) {
  const sends: EmailDeliveryRequest[] = []
  let reconcileCalls = 0
  const adapter: EmailDeliveryAdapter = {
    id: input.id,
    capabilities: ['transactional', 'operational', 'marketing'],
    contract: {
      version: 1,
      connectionVerification: true,
      senderReadiness: true,
      batchSend: false,
      singleSend: true,
      providerIdempotency: true,
      webhookEvents: false,
      reconciliation: true,
      rateLimits: { known: false },
    },
    async send(request) {
      sends.push(request)
      return input.sendResult
    },
    async health() {
      return { provider: input.id, status: 'healthy' }
    },
    async verifyConnection() {
      return { provider: input.id, status: 'healthy' }
    },
    async senderReadiness() {
      return { provider: input.id, status: 'ready', domainAuthentication: 'not-observed' }
    },
    async reconcile() {
      reconcileCalls += 1
      return input.reconcileResult ?? null
    },
  }
  return { adapter, sends, reconcileCalls: () => reconcileCalls }
}

beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_release_acceptance'))
    throw new Error('Disposable acceptance database required')
  payload = await getPayload({ config })
  const demo = await ensureRenegadePartyDemo(payload)
  siteA = String(demo.siteId)
  const existingB = await findSiteBySlug('email07-b')
  if (existingB) {
    siteB = String(existingB.id)
  } else {
    const created = await payload.create({
      collection: 'sites',
      data: { name: 'Email07 Site B', slug: 'email07-b', lifecycle: 'active' },
      overrideAccess: true,
    } as never)
    siteB = String((created as unknown as { id: string }).id)
  }
  if (siteA === siteB) throw new Error('Harness requires two distinct sites')
  listA = await ensureList(siteA, 'Email07 List A')
  listB = await ensureList(siteB, 'Email07 List B')
  vi.stubEnv('EMAIL_MODE', 'development')
  vi.stubEnv('EMAIL_FROM', 'Renegade <mail@renegade.test>')
  resetLocalMailSink()
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await payload?.db.destroy?.()
})

describe('RC3-07 account flows: recovery + invitation carry their own site identity', () => {
  it('dispatches a site A recovery intent and a site B invitation with no cross-traffic', async () => {
    const fixtureA = fixtureAdapter({
      id: 'fixture-a',
      sendResult: { ok: true, provider: 'fixture-a', providerMessageId: 'fixture-a-1' },
    })
    const recovery = await enqueueEmailIntent(payload as never, {
      purpose: 'account-recovery',
      recipientEmail: `recover-${run}@example.test`,
      subject: 'Recover your account',
      payload: { text: 'Recovery: https://a.example.test/recover?token=x' },
      idempotencyKey: `rc307-recovery-a-${run}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      siteId: siteA,
      fromIdentity: 'Site A Security <security@a.example.test>',
    })
    expect(
      await dispatchEmailIntent(payload as never, String(recovery.id), undefined, fixtureA.adapter),
    ).toBe('accepted')
    expect(fixtureA.sends).toHaveLength(1)
    expect(fixtureA.sends[0].from).toBe('Site A Security <security@a.example.test>')
    expect(fixtureA.sends[0].to).toBe(`recover-${run}@example.test`)
    expect(fixtureA.sends[0].category).toBe('transactional')
    expect((await intentState(String(recovery.id))).provider).toBe('fixture-a')

    const fixtureB = fixtureAdapter({
      id: 'fixture-b',
      sendResult: { ok: true, provider: 'fixture-b', providerMessageId: 'fixture-b-1' },
    })
    const invite = await enqueueEmailIntent(payload as never, {
      purpose: 'staff-invitation',
      recipientEmail: `invitee-${run}@example.test`,
      subject: 'You are invited to join Site B',
      payload: { text: 'Enroll: https://b.example.test/enroll?token=y' },
      idempotencyKey: `rc307-invite-b-${run}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      siteId: siteB,
      fromIdentity: 'Site B Team <team@b.example.test>',
    })
    expect(
      await dispatchEmailIntent(payload as never, String(invite.id), undefined, fixtureB.adapter),
    ).toBe('accepted')
    expect(fixtureB.sends).toHaveLength(1)
    expect(fixtureB.sends[0].from).toBe('Site B Team <team@b.example.test>')
    // Site A's provider saw none of site B's traffic, and vice versa.
    expect(fixtureA.sends).toHaveLength(1)
    expect((await intentState(String(invite.id))).provider).toBe('fixture-b')
  })
})

describe('RC3-07 double opt-in: the same address confirms independently per site', () => {
  it('delivers, confirms, and activates site A and site B subscriptions separately', async () => {
    const email = `optin-${run}@example.test`
    const resA = await requestDoubleOptIn(payload as never, {
      siteId: siteA,
      listId: listA,
      email,
      locale: 'en',
      consentWording: 'newsletter-v1',
      source: 'rc3-07',
    })
    expect(resA.replay).toBe(false)
    expect(resA.token).toBeTruthy()
    const resB = await requestDoubleOptIn(payload as never, {
      siteId: siteB,
      listId: listB,
      email,
      locale: 'en',
      consentWording: 'newsletter-v1',
      source: 'rc3-07',
    })
    expect(resB.replay).toBe(false)
    expect(String(resB.subscriber.id)).not.toBe(String(resA.subscriber.id))

    // Both confirmation deliveries dispatch through the audience boundary.
    for (const token of [resA.token!, resB.token!]) {
      const key = `subscription-confirmation:${audienceDigest(token)}`
      const found = await payload.find({
        collection: 'email-deliveries',
        where: { idempotencyKey: { equals: key } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const delivery = found.docs[0] as unknown as { id: string }
      expect(delivery).toBeTruthy()
      await runDelivery(String(delivery.id))
      expect((await deliveryState(String(delivery.id))).status).toBe('accepted')
      const receipts = localMailSinkReceipts().filter((r) => r.idempotencyKey === key)
      expect(receipts).toHaveLength(1)
      expect(receipts[0].to).toBe(email)
      expect(receipts[0].links.some((link) => link.includes('/subscribe/confirm'))).toBe(true)
    }

    // Confirming site A must not activate site B's pending subscription.
    await confirmDoubleOptIn(payload as never, resA.token!)
    const subA = (await payload.findByID({
      collection: 'subscribers',
      id: String(resA.subscriber.id),
      depth: 0,
      overrideAccess: true,
    })) as unknown as { status: string }
    const subBBefore = (await payload.findByID({
      collection: 'subscribers',
      id: String(resB.subscriber.id),
      depth: 0,
      overrideAccess: true,
    })) as unknown as { status: string }
    expect(subA.status).toBe('active')
    expect(subBBefore.status).toBe('pending')

    await confirmDoubleOptIn(payload as never, resB.token!)
    const subBAfter = (await payload.findByID({
      collection: 'subscribers',
      id: String(resB.subscriber.id),
      depth: 0,
      overrideAccess: true,
    })) as unknown as { status: string }
    expect(subBAfter.status).toBe('active')
  })
})

describe('RC3-07 campaign flow + suppression scoping', () => {
  it('queues a campaign only for eligible members of the sending site', async () => {
    // A dedicated per-run list: the opt-in test legitimately leaves an
    // active member on the shared list, and earlier runs of this suite
    // leave active members on theirs — a campaign queues for all of them.
    const campaignList = await ensureList(siteA, `Email07 Campaign List ${run}`)
    const eligible = await createSubscriber(siteA, `fan-ok-${run}@example.test`)
    await addMembership(String(eligible.id), campaignList)
    const bounced = await createSubscriber(siteA, `fan-bounced-${run}@example.test`)
    await addMembership(String(bounced.id), campaignList)
    await suppressSubscriber(payload as never, {
      siteId: siteA,
      email: `fan-bounced-${run}@example.test`,
      reason: 'bounce',
      provider: 'fixture',
    })
    // Data anomaly on purpose: a site B subscriber holding a site A list
    // membership must still never receive site A's campaign.
    const foreign = await createSubscriber(siteB, `fan-foreign-${run}@example.test`)
    await addMembership(String(foreign.id), campaignList)

    const message = await payload.create({
      collection: 'email-messages',
      data: {
        site: siteA,
        subject: `RC3-07 Campaign ${run}`,
        kind: 'bulk',
        status: 'scheduled',
        scheduledFor: new Date(Date.now() - 60_000).toISOString(),
        blocks: [{ type: 'text', text: 'Hello from A' }],
        purpose: 'newsletter',
        audience: { lists: [campaignList] },
      },
      overrideAccess: true,
    } as never)
    const messageId = String((message as unknown as { id: string }).id)
    const queued = await queueNewsletterDeliveries(payload as never, messageId)
    expect(queued).toBe(1)
    const deliveries = await deliveriesForMessage(messageId)
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].recipientEmail).toBe(`fan-ok-${run}@example.test`)

    await runDelivery(String(deliveries[0].id))
    expect((await deliveryState(String(deliveries[0].id))).status).toBe('accepted')
    const receipts = localMailSinkReceipts().filter((r) => r.to === `fan-ok-${run}@example.test`)
    expect(receipts).toHaveLength(1)
    expect(receipts[0].subject).toBe(`RC3-07 Campaign ${run}`)
  })

  it('cancels a queued campaign delivery when the subscriber unsubscribes before dispatch', async () => {
    const member = await createSubscriber(siteA, `fan-late-${run}@example.test`)
    await addMembership(String(member.id), listA)
    const message = await payload.create({
      collection: 'email-messages',
      data: {
        site: siteA,
        subject: `RC3-07 Late Campaign ${run}`,
        kind: 'bulk',
        status: 'scheduled',
        scheduledFor: new Date(Date.now() - 60_000).toISOString(),
        blocks: [{ type: 'text', text: 'Hello again' }],
        purpose: 'newsletter',
        audience: { lists: [listA] },
      },
      overrideAccess: true,
    } as never)
    const messageId = String((message as unknown as { id: string }).id)
    await queueNewsletterDeliveries(payload as never, messageId)
    const deliveries = await deliveriesForMessage(messageId)
    const mine = deliveries.find((d) => d.recipientEmail === `fan-late-${run}@example.test`)
    expect(mine).toBeTruthy()

    await suppressSubscriber(payload as never, {
      siteId: siteA,
      email: `fan-late-${run}@example.test`,
      reason: 'unsubscribe',
    })
    await runDelivery(String(mine!.id))
    const state = await deliveryState(String(mine!.id))
    expect(state.status).toBe('cancelled')
    expect(state.outcome?.code).toBe('suppressed-before-send')
    expect(
      localMailSinkReceipts().filter((r) => r.to === `fan-late-${run}@example.test`),
    ).toHaveLength(0)
  })

  it('keeps marketing suppression from blocking account mail, scoped per site', async () => {
    const optedOut = `optout-${run}@example.test`
    await suppressSubscriber(payload as never, {
      siteId: siteA,
      email: optedOut,
      reason: 'unsubscribe',
    })
    // An unsubscribe is a marketing suppression: account mail still flows.
    const fixture = fixtureAdapter({
      id: 'fixture-optout',
      sendResult: { ok: true, provider: 'fixture-optout', providerMessageId: 'fixture-optout-1' },
    })
    const intent = await enqueueEmailIntent(payload as never, {
      purpose: 'account-recovery',
      recipientEmail: optedOut,
      subject: 'Recover your account',
      payload: { text: 'Recovery link' },
      idempotencyKey: `rc307-optout-recovery-${run}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      siteId: siteA,
    })
    expect(
      await dispatchEmailIntent(payload as never, String(intent.id), undefined, fixture.adapter),
    ).toBe('accepted')

    // An invalid-address suppression blocks audience delivery on site A
    // only; the same address remains deliverable on site B.
    const invalid = `invalid-aud-${run}@example.test`
    await suppressSubscriber(payload as never, {
      siteId: siteA,
      email: invalid,
      reason: 'invalid',
      provider: 'fixture',
    })
    expect(
      await canDeliverToSubscriber(payload as never, { siteId: siteA, recipientEmail: invalid }),
    ).toBe(false)
    expect(
      await canDeliverToSubscriber(payload as never, { siteId: siteB, recipientEmail: invalid }),
    ).toBe(true)
  })
})

describe('RC3-07 fault injection', () => {
  it('reconciles an ambiguous account send without ever sending twice', async () => {
    const fixture = fixtureAdapter({
      id: 'fixture-unknown',
      sendResult: {
        ok: false,
        provider: 'fixture-unknown',
        failure: { kind: 'unknown', code: 'unknown_outcome', message: 'Fixture timeout.' },
      },
      reconcileResult: {
        ok: true,
        provider: 'fixture-unknown',
        providerMessageId: 'fixture-msg-1',
      },
    })
    const intent = await enqueueEmailIntent(payload as never, {
      purpose: 'member-sign-in',
      recipientEmail: `ambiguous-${run}@example.test`,
      subject: 'Your sign-in link',
      payload: { text: 'Sign in: https://a.example.test/verify?token=z' },
      idempotencyKey: `rc307-ambiguous-${run}`,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      siteId: siteA,
    })
    expect(
      await dispatchEmailIntent(payload as never, String(intent.id), undefined, fixture.adapter),
    ).toBe('unknown')
    expect((await intentState(String(intent.id))).submission).toBe('unknown')
    expect(fixture.sends).toHaveLength(1)

    // A later dispatch attempt must reconcile, not resend.
    expect(
      await dispatchEmailIntent(payload as never, String(intent.id), undefined, fixture.adapter),
    ).toBe('accepted')
    expect(fixture.sends).toHaveLength(1)
    expect(fixture.reconcileCalls()).toBeGreaterThan(0)
    const state = await intentState(String(intent.id))
    expect(state.submission).toBe('accepted')
    expect(state.providerMessageId).toBe('fixture-msg-1')
  })

  it('keeps an unreconcilable ambiguous send quarantined — never resent', async () => {
    const fixture = fixtureAdapter({
      id: 'fixture-quarantine',
      sendResult: {
        ok: false,
        provider: 'fixture-quarantine',
        failure: { kind: 'unknown', code: 'unknown_outcome', message: 'Fixture timeout.' },
      },
      reconcileResult: null,
    })
    const intent = await enqueueEmailIntent(payload as never, {
      purpose: 'member-sign-in',
      recipientEmail: `quarantine-${run}@example.test`,
      subject: 'Your sign-in link',
      payload: { text: 'Sign in: https://a.example.test/verify?token=q' },
      idempotencyKey: `rc307-quarantine-${run}`,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      siteId: siteA,
    })
    expect(
      await dispatchEmailIntent(payload as never, String(intent.id), undefined, fixture.adapter),
    ).toBe('unknown')
    expect(
      await dispatchEmailIntent(payload as never, String(intent.id), undefined, fixture.adapter),
    ).toBe('unknown')
    expect(fixture.sends).toHaveLength(1)
    const state = await intentState(String(intent.id))
    expect(state.submission).toBe('unknown')
    expect(state.lastError?.code).toBe('unknown_outcome')
  })

  it('records a bad provider configuration as a clean permanent failure', async () => {
    const unauthorizedFetch = async () => ({
      status: 401,
      headers: { get: () => null },
      json: async () => ({ ErrorCode: 401, Message: 'Invalid server token.' }),
      text: async () => 'unauthorized',
    })
    const postmark = createPostmarkEmailAdapter(
      'account',
      {
        serverToken: 'fixture-invalid-token',
        transactionalStream: 'outbound',
        broadcastStream: 'broadcast',
        timeoutMs: 1000,
      },
      { fetch: unauthorizedFetch as never },
    )
    const intent = await enqueueEmailIntent(payload as never, {
      purpose: 'account-recovery',
      recipientEmail: `badconfig-${run}@example.test`,
      subject: 'Recover your account',
      payload: { text: 'Recovery link' },
      idempotencyKey: `rc307-badconfig-${run}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      siteId: siteA,
    })
    expect(
      await dispatchEmailIntent(payload as never, String(intent.id), undefined, postmark),
    ).toBe('rejected')
    const state = await intentState(String(intent.id))
    expect(state.submission).toBe('rejected')
    expect(state.lastError?.code).toBe('authentication_failed')
  })

  it('lets confirmations and account mail complete while a campaign backlog is delayed', async () => {
    const message = await payload.create({
      collection: 'email-messages',
      data: {
        site: siteA,
        subject: `RC3-07 Backpressure ${run}`,
        kind: 'bulk',
        status: 'draft',
        blocks: [{ type: 'text', text: 'Hello' }],
        purpose: 'newsletter',
      },
      overrideAccess: true,
    } as never)
    const messageId = String((message as unknown as { id: string }).id)
    const campaignIds: string[] = []
    for (let i = 0; i < 12; i += 1) {
      const key = `rc307-backpressure-${run}-${i}`
      simulateLocalMailSinkOutcome(key, 'delay')
      const delivery = await payload.create({
        collection: 'email-deliveries',
        data: {
          message: messageId,
          recipientEmail: `bp-${run}-${i}@example.test`,
          idempotencyKey: key,
          status: 'queued',
          messageSnapshot: {
            kind: 'bulk',
            subject: `RC3-07 Backpressure ${run}`,
            blocks: [{ type: 'text', text: 'Hello' }],
            purpose: 'newsletter',
          },
        },
        overrideAccess: true,
      } as never)
      campaignIds.push(String((delivery as unknown as { id: string }).id))
    }

    const optIn = await requestDoubleOptIn(payload as never, {
      siteId: siteA,
      listId: listA,
      email: `bp-confirm-${run}@example.test`,
      locale: 'en',
      consentWording: 'newsletter-v1',
      source: 'rc3-07',
    })
    const confirmKey = `subscription-confirmation:${audienceDigest(optIn.token!)}`
    const confirmFound = await payload.find({
      collection: 'email-deliveries',
      where: { idempotencyKey: { equals: confirmKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const confirmDelivery = confirmFound.docs[0] as unknown as { id: string }

    const accountIntent = await enqueueEmailIntent(payload as never, {
      purpose: 'member-sign-in',
      recipientEmail: `bp-account-${run}@example.test`,
      subject: 'Your sign-in link',
      payload: { text: 'Sign in: https://b.example.test/verify?token=b' },
      idempotencyKey: `rc307-bp-account-${run}`,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      siteId: siteB,
    })

    await recoverEmailOutbox(payload as never)
    await recoverAccountEmailOutbox(payload as never)

    expect((await deliveryState(String(confirmDelivery.id))).status).toBe('accepted')
    expect((await intentState(String(accountIntent.id))).submission).toBe('accepted')
    for (const id of campaignIds) {
      expect((await deliveryState(id)).status).toBe('queued')
    }

    // Drain the backlog so the shared acceptance DB stays tidy.
    for (let i = 0; i < 12; i += 1)
      simulateLocalMailSinkOutcome(`rc307-backpressure-${run}-${i}`, 'accept')
    for (const id of campaignIds)
      await payload.update({
        collection: 'email-deliveries',
        id,
        data: { nextAttemptAt: null },
        overrideAccess: true,
      })
    await recoverEmailOutbox(payload as never)
    for (const id of campaignIds) {
      expect((await deliveryState(id)).status).toBe('accepted')
    }
  })

  it('keeps account mail usable while the audience boundary provider is broken', async () => {
    vi.stubEnv('EMAIL_AUDIENCE_PROVIDER', 'postmark')
    vi.stubEnv('EMAIL_AUDIENCE_POSTMARK_SERVER_TOKEN', 'fixture-invalid-token')
    vi.stubEnv('EMAIL_AUDIENCE_FROM', 'Audience <news@audience.example.test>')
    vi.stubEnv('SMTP_SEND_TIMEOUT_MS', '1000')
    try {
      const message = await payload.create({
        collection: 'email-messages',
        data: {
          site: siteA,
          subject: `RC3-07 Broken Boundary ${run}`,
          kind: 'bulk',
          status: 'draft',
          blocks: [{ type: 'text', text: 'Hello' }],
          purpose: 'newsletter',
        },
        overrideAccess: true,
      } as never)
      const delivery = await payload.create({
        collection: 'email-deliveries',
        data: {
          message: String((message as unknown as { id: string }).id),
          recipientEmail: `broken-${run}@example.test`,
          idempotencyKey: `rc307-broken-audience-${run}`,
          status: 'queued',
          messageSnapshot: {
            kind: 'bulk',
            subject: `RC3-07 Broken Boundary ${run}`,
            blocks: [{ type: 'text', text: 'Hello' }],
            purpose: 'newsletter',
          },
        },
        overrideAccess: true,
      } as never)
      const deliveryId = String((delivery as unknown as { id: string }).id)
      await runDelivery(deliveryId)
      const state = await deliveryState(deliveryId)
      // The broken provider must not produce an acceptance, a crash, or a
      // sink receipt; the delivery stays recoverable for operator action.
      expect(state.status).not.toBe('accepted')
      expect(['unknown', 'queued', 'failed']).toContain(state.status)
      expect(
        localMailSinkReceipts().filter((r) => r.idempotencyKey === `rc307-broken-audience-${run}`),
      ).toHaveLength(0)

      // Account mail rides its own boundary and is unaffected.
      const intent = await enqueueEmailIntent(payload as never, {
        purpose: 'member-sign-in',
        recipientEmail: `still-works-${run}@example.test`,
        subject: 'Your sign-in link',
        payload: { text: 'Sign in: https://a.example.test/verify?token=s' },
        idempotencyKey: `rc307-still-works-${run}`,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        siteId: siteA,
      })
      expect(await dispatchEmailIntent(payload as never, String(intent.id))).toBe('accepted')
    } finally {
      vi.unstubAllEnvs()
      vi.stubEnv('EMAIL_MODE', 'development')
      vi.stubEnv('EMAIL_FROM', 'Renegade <mail@renegade.test>')
    }
  })
})
