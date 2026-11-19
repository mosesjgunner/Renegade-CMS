import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '../../src/payload.config'
import { ensureRenegadePartyDemo } from '../helpers/renegadeparty-demo'
import {
  localMailSinkReceipts,
  resetLocalMailSink,
  simulateLocalMailSinkOutcome,
} from '../../src/modules/email/delivery'
import {
  dispatchEmailIntent,
  enqueueEmailIntent,
  recipientHashFor,
  recoverAccountEmailOutbox,
} from '../../src/modules/email/outbox'
import { emailDeliveryTask, recoverEmailOutbox } from '../../src/modules/audience/tasks'

/**
 * RC3-EMAIL-01 two-site isolation proof (EMAIL-02/05/10).
 *
 * Uses the deterministic development-capture sink: engineering behavior is
 * proven locally; mailbox placement is NOT claimed (EMAIL-11 stays BLOCKED
 * on live provider approval and seed inboxes).
 */
let payload: Payload
let siteA = ''
let siteB = ''
const run = Math.random().toString(36).slice(2, 8)

beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_release_acceptance'))
    throw new Error('Disposable acceptance database required')
  payload = await getPayload({ config })
  await ensureRenegadePartyDemo(payload)
  const site = (await payload.find({ collection: 'sites', limit: 1, overrideAccess: true }))
    .docs[0] as unknown as { id: string }
  siteA = String(site.id)
  const existingB = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'email01-b' } },
    limit: 1,
    overrideAccess: true,
  })
  if (existingB.docs[0]) {
    siteB = String(existingB.docs[0].id)
  } else {
    const created = await payload.create({
      collection: 'sites',
      data: { name: 'Email01 Site B', slug: 'email01-b', lifecycle: 'active' },
      overrideAccess: true,
    } as never)
    siteB = String((created as unknown as { id: string }).id)
  }
  vi.stubEnv('EMAIL_MODE', 'development')
  vi.stubEnv('EMAIL_FROM', 'Renegade <mail@renegade.test>')
  resetLocalMailSink()
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await payload?.db.destroy?.()
})

async function enqueueSignIn(siteId: string, email: string, key: string) {
  return enqueueEmailIntent(payload as never, {
    purpose: 'member-sign-in',
    recipientEmail: email,
    subject: 'Your sign-in link',
    payload: { text: `Sign in: https://example.test/member-auth/verify?token=${key}` },
    idempotencyKey: key,
    expiresAt: new Date(Date.now() + 15 * 60_000),
    siteId,
  })
}

async function intentState(id: string) {
  const doc = (await payload.findByID({
    collection: 'email-intents',
    id,
    depth: 0,
    overrideAccess: true,
  })) as unknown as { submission: string; attempts: number }
  return doc
}

describe('RC3-EMAIL-01 account outbox slice', () => {
  it('delivers a durable sign-in intent and deduplicates repeated enqueue', async () => {
    const key = `email01-signin-${run}`
    const first = await enqueueSignIn(siteA, `member-${run}@example.test`, key)
    const second = await enqueueSignIn(siteA, `member-${run}@example.test`, key)
    expect(String(second.id)).toBe(String(first.id))
    const outcome = await dispatchEmailIntent(payload as never, String(first.id))
    expect(outcome).toBe('accepted')
    expect((await intentState(String(first.id))).submission).toBe('accepted')
    const receipts = localMailSinkReceipts().filter((r) => r.idempotencyKey === key)
    expect(receipts).toHaveLength(1)
    expect(receipts[0].links[0]).toContain('/member-auth/verify')
    // A repeated dispatch of a terminal intent sends nothing more.
    expect(await dispatchEmailIntent(payload as never, String(first.id))).toBe('skipped')
    expect(localMailSinkReceipts().filter((r) => r.idempotencyKey === key)).toHaveLength(1)
  })

  it('recovers a transiently rejected intent through the account sweep after a restart', async () => {
    const key = `email01-retry-${run}`
    const intent = await enqueueSignIn(siteA, `retry-${run}@example.test`, key)
    simulateLocalMailSinkOutcome(key, 'delay')
    expect(await dispatchEmailIntent(payload as never, String(intent.id))).toBe('retry-scheduled')
    // Simulate the worker restarting later: clear the fault, sweep due rows.
    simulateLocalMailSinkOutcome(key, 'accept')
    const due = (await payload.findByID({
      collection: 'email-intents',
      id: String(intent.id),
      depth: 0,
      overrideAccess: true,
    })) as unknown as { nextAttemptAt: string }
    await payload.update({
      collection: 'email-intents',
      id: String(intent.id),
      data: { nextAttemptAt: new Date(Date.now() - 1000).toISOString() },
      overrideAccess: true,
    })
    void due
    await recoverAccountEmailOutbox(payload as never)
    expect((await intentState(String(intent.id))).submission).toBe('accepted')
  })

  it('expires an intent whose action lifetime is nearly gone instead of sending a dead link', async () => {
    const intent = await enqueueEmailIntent(payload as never, {
      purpose: 'member-sign-in',
      recipientEmail: `stale-${run}@example.test`,
      subject: 'Your sign-in link',
      payload: { text: 'Sign in: https://example.test/verify?token=stale' },
      idempotencyKey: `email01-stale-${run}`,
      expiresAt: new Date(Date.now() + 30_000),
      siteId: siteA,
    })
    expect(await dispatchEmailIntent(payload as never, String(intent.id))).toBe('expired')
    expect(
      localMailSinkReceipts().filter((r) => r.idempotencyKey === `email01-stale-${run}`),
    ).toHaveLength(0)
  })
})

describe('RC3-EMAIL-01 isolation boundary', () => {
  it('holds site B account mail under a site pause while site A continues, then releases it', async () => {
    const pause = await payload.create({
      collection: 'email-pauses',
      data: { site: siteB, scope: 'site', reason: 'isolation test', active: true },
      overrideAccess: true,
    } as never)
    const heldKey = `email01-held-${run}`
    const held = await enqueueSignIn(siteB, `held-${run}@example.test`, heldKey)
    expect(await dispatchEmailIntent(payload as never, String(held.id))).toBe('held')
    expect(localMailSinkReceipts().filter((r) => r.idempotencyKey === heldKey)).toHaveLength(0)

    const freeKey = `email01-free-${run}`
    const free = await enqueueSignIn(siteA, `free-${run}@example.test`, freeKey)
    expect(await dispatchEmailIntent(payload as never, String(free.id))).toBe('accepted')

    await payload.update({
      collection: 'email-pauses',
      id: String((pause as unknown as { id: string }).id),
      data: { active: false },
      overrideAccess: true,
    })
    await recoverAccountEmailOutbox(payload as never)
    expect((await intentState(String(held.id))).submission).toBe('accepted')
  })

  it('stops account sends to a confirmed-invalid address for that site only', async () => {
    const email = `invalid-${run}@example.test`
    await payload.create({
      collection: 'suppressions',
      data: {
        site: siteA,
        emailHash: recipientHashFor(email),
        reason: 'invalid',
        occurredAt: new Date().toISOString(),
        global: true,
      },
      overrideAccess: true,
    } as never)
    const blockedKey = `email01-invalid-a-${run}`
    const blocked = await enqueueSignIn(siteA, email, blockedKey)
    expect(await dispatchEmailIntent(payload as never, String(blocked.id))).toBe('skipped')
    expect((await intentState(String(blocked.id))).submission).toBe('cancelled')
    expect(localMailSinkReceipts().filter((r) => r.idempotencyKey === blockedKey)).toHaveLength(0)

    const allowedKey = `email01-invalid-b-${run}`
    const allowed = await enqueueSignIn(siteB, email, allowedKey)
    expect(await dispatchEmailIntent(payload as never, String(allowed.id))).toBe('accepted')
  })

  it('keeps account mail flowing while site A campaigns are paused and backlogged', async () => {
    // Backlog: a batch of queued marketing deliveries for site A.
    const message = await payload.create({
      collection: 'email-messages',
      data: {
        site: siteA,
        subject: `Campaign ${run}`,
        kind: 'bulk',
        status: 'draft',
        blocks: [{ type: 'text', text: 'Hello' }],
        purpose: 'newsletter',
      },
      overrideAccess: true,
    } as never)
    const messageId = String((message as unknown as { id: string }).id)
    const deliveryIds: string[] = []
    for (let i = 0; i < 12; i += 1) {
      const delivery = await payload.create({
        collection: 'email-deliveries',
        data: {
          message: messageId,
          recipientEmail: `fan-${run}-${i}@example.test`,
          idempotencyKey: `email01-campaign-${run}-${i}`,
          status: 'queued',
          messageSnapshot: {
            kind: 'bulk',
            subject: `Campaign ${run}`,
            blocks: [{ type: 'text', text: 'Hello' }],
            purpose: 'newsletter',
          },
        },
        overrideAccess: true,
      } as never)
      deliveryIds.push(String((delivery as unknown as { id: string }).id))
    }
    // Pause site A's audience class.
    const pause = await payload.create({
      collection: 'email-pauses',
      data: {
        site: siteA,
        scope: 'site-class',
        trafficClass: 'audience',
        reason: 'campaign incident drill',
        active: true,
      },
      overrideAccess: true,
    } as never)

    // The audience handler must not submit A's paused campaign deliveries.
    await (emailDeliveryTask.handler as never as (args: unknown) => Promise<unknown>)({
      input: { deliveryId: deliveryIds[0] },
      req: { payload },
    })
    const pausedDelivery = (await payload.findByID({
      collection: 'email-deliveries',
      id: deliveryIds[0],
      depth: 0,
      overrideAccess: true,
    })) as unknown as { status: string; outcome?: { code?: string } }
    expect(pausedDelivery.status).toBe('queued')
    expect(pausedDelivery.outcome?.code).toBe('dispatch-paused')
    expect(
      localMailSinkReceipts().filter((r) => r.idempotencyKey === `email01-campaign-${run}-0`),
    ).toHaveLength(0)

    // Account mail for BOTH sites still dispatches during the incident.
    const aKey = `email01-during-a-${run}`
    const aIntent = await enqueueSignIn(siteA, `during-a-${run}@example.test`, aKey)
    expect(await dispatchEmailIntent(payload as never, String(aIntent.id))).toBe('accepted')
    const bKey = `email01-during-b-${run}`
    const bIntent = await enqueueSignIn(siteB, `during-b-${run}@example.test`, bKey)
    expect(await dispatchEmailIntent(payload as never, String(bIntent.id))).toBe('accepted')

    // Site B audience mail is unaffected by A's pause.
    const bMessage = await payload.create({
      collection: 'email-messages',
      data: {
        site: siteB,
        subject: `Campaign B ${run}`,
        kind: 'bulk',
        status: 'draft',
        blocks: [{ type: 'text', text: 'Hello B' }],
        purpose: 'newsletter',
      },
      overrideAccess: true,
    } as never)
    const bDelivery = await payload.create({
      collection: 'email-deliveries',
      data: {
        message: String((bMessage as unknown as { id: string }).id),
        recipientEmail: `fan-b-${run}@example.test`,
        idempotencyKey: `email01-campaign-b-${run}`,
        status: 'queued',
        messageSnapshot: {
          kind: 'bulk',
          subject: `Campaign B ${run}`,
          blocks: [{ type: 'text', text: 'Hello B' }],
          purpose: 'newsletter',
        },
      },
      overrideAccess: true,
    } as never)
    await (emailDeliveryTask.handler as never as (args: unknown) => Promise<unknown>)({
      input: { deliveryId: String((bDelivery as unknown as { id: string }).id) },
      req: { payload },
    })
    const bState = (await payload.findByID({
      collection: 'email-deliveries',
      id: String((bDelivery as unknown as { id: string }).id),
      depth: 0,
      overrideAccess: true,
    })) as unknown as { status: string }
    expect(bState.status).toBe('accepted')

    // Cleanup: lift the pause and drain A's backlog through the audience sweep.
    await payload.update({
      collection: 'email-pauses',
      id: String((pause as unknown as { id: string }).id),
      data: { active: false },
      overrideAccess: true,
    })
    await payload.update({
      collection: 'email-deliveries',
      id: deliveryIds[0],
      data: { nextAttemptAt: null },
      overrideAccess: true,
    })
    await recoverEmailOutbox(payload as never)
    const drained = (await payload.findByID({
      collection: 'email-deliveries',
      id: deliveryIds[0],
      depth: 0,
      overrideAccess: true,
    })) as unknown as { status: string }
    expect(drained.status).toBe('accepted')
  })
})
