/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-16 — social queue and provider truth: the operator journey.
 *
 * Source-linked draft → schedule → dispatch → receipt against the
 * deterministic AT-protocol fixture (tests/rc03/provider-fixture.mjs,
 * isolated on 127.0.0.1:13161), plus the legs the salvage left unbuilt:
 * pause/resume, the two-tier retry gate, uncertain-outcome quarantine
 * through a live dispatch, manual handoff with operator completion,
 * and the evergreen recurrence (spawn, cadence, duplicate-spawn guard).
 * No real network is touched.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { socialHash, type SocialNetwork } from '../../src/modules/social/contracts'
import { encryptSecret } from '../../src/modules/social/security'
import {
  completeManualHandoff,
  executeSocialQueueItem,
  pauseSocialQueueItem,
  recoverSocialOutbox,
  resumeSocialQueueItem,
} from '../../src/modules/social/tasks'
import {
  getProviderCapabilityTruth,
  socialProviderFor,
} from '../../src/modules/social/provider-runtime'
import {
  assertFixtureSafeDatabase,
  buildRc2World,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

const FIXTURE = 'http://127.0.0.1:13161'
const stamp = Date.now().toString(36)

let payload: Payload
let world: Rc2World
let fixtureProc: ChildProcess | null = null
const originalAllowedOrigins = process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS

async function fixtureState(): Promise<any> {
  const res = await fetch(`${FIXTURE}/state`)
  return res.json()
}
async function fixtureUp(): Promise<boolean> {
  try {
    return (await fetch(`${FIXTURE}/state`)).ok
  } catch {
    return false
  }
}

async function seedAccount(
  identifier: string,
  network: SocialNetwork = 'bluesky',
): Promise<string> {
  const account = await (payload as any).create({
    collection: 'social-accounts',
    data: {
      site: world.siteA.siteId,
      network,
      actorType: 'site',
      displayName: `RC316 ${identifier} ${stamp}`,
      externalAccountId: `${identifier}-${stamp}`,
      credentialHealth: 'healthy',
      connectionReference: `enc:${encryptSecret(
        JSON.stringify({ identifier, appPassword: 'pw', service: FIXTURE }),
      )}`,
    },
    overrideAccess: true,
  })
  return String(account.id)
}

async function seedScheduledItem(input: {
  accountId: string
  network?: SocialNetwork
  text: string
  linkUrl?: string
  scheduledFor?: string
  recurrenceIntervalDays?: number
}): Promise<{ draftId: string; variantId: string; queueId: string; approvalHash: string }> {
  const network = input.network ?? 'bluesky'
  const linkUrl = input.linkUrl ?? 'https://a.rc2-a04.test/articles/rc316'
  const draft = await (payload as any).create({
    collection: 'social-drafts',
    data: {
      site: world.siteA.siteId,
      title: `RC316 ${input.text} ${stamp}`,
      status: 'approved',
      canonicalUrl: linkUrl,
    },
    overrideAccess: true,
  })
  const approvalHash = socialHash({ network, text: input.text, linkUrl, attachments: [] })
  const variant = await (payload as any).create({
    collection: 'social-network-variants',
    data: {
      draft: String(draft.id),
      account: input.accountId,
      network,
      label: network,
      text: input.text,
      linkUrl,
      status: 'approved',
      approvalHash,
      idempotencyKey: `rc316-variant-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    },
    overrideAccess: true,
  })
  const queue = await (payload as any).create({
    collection: 'social-queue-items',
    data: {
      variant: String(variant.id),
      account: input.accountId,
      scheduledFor: input.scheduledFor ?? new Date(Date.now() - 60_000).toISOString(),
      timeZone: 'UTC',
      status: 'scheduled',
      idempotencyKey: `scheduled:draft:${draft.id}:${variant.id}:${approvalHash}`,
      ...(input.recurrenceIntervalDays
        ? {
            recurrenceIntervalDays: input.recurrenceIntervalDays,
            recurrenceSeriesKey: `draft:${draft.id}:variant:${variant.id}`,
            recurrenceOccurrence: 1,
          }
        : {}),
    },
    overrideAccess: true,
  })
  return {
    draftId: String(draft.id),
    variantId: String(variant.id),
    queueId: String(queue.id),
    approvalHash,
  }
}

async function queueRow(queueId: string): Promise<any> {
  return (payload as any).findByID({
    collection: 'social-queue-items',
    id: queueId,
    depth: 0,
    overrideAccess: true,
  })
}

beforeAll(async () => {
  process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS = FIXTURE
  assertFixtureSafeDatabase(process.env.DATABASE_URL)
  if (await fixtureUp()) throw new Error('RC316 journey fixture port is already occupied')
  fixtureProc = spawn('node', ['tests/rc03/provider-fixture.mjs'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env: { ...process.env, SOCIAL_FIXTURE_PORT: '13161' },
  })
  const t0 = Date.now()
  while (!(await fixtureUp())) {
    if (Date.now() - t0 > 30_000) throw new Error('provider fixture did not start')
    await new Promise((r) => setTimeout(r, 500))
  }
  payload = await getPayload({ config })
  world = await buildRc2World(payload)
}, 240_000)

afterAll(async () => {
  if (payload && world) await teardownRc2World(payload, world)
  fixtureProc?.kill()
  if (originalAllowedOrigins === undefined) delete process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS
  else process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS = originalAllowedOrigins
})

describe('RC3-16 operator journey', () => {
  it('1. draft → schedule → dispatch → receipt, exactly one provider post', async () => {
    const accountId = await seedAccount('good.test')
    const { draftId, variantId, queueId } = await seedScheduledItem({
      accountId,
      text: `RC316 hello ${stamp}`,
    })
    const result: any = await executeSocialQueueItem(payload, {
      queueItemId: queueId,
      workerId: 'rc316-journey',
    })
    expect(result.output.status).toBe('published')
    expect(result.output.remoteId).toBeTruthy()
    const queue = await queueRow(queueId)
    expect(queue.status).toBe('published')
    const variant: any = await (payload as any).findByID({
      collection: 'social-network-variants',
      id: variantId,
      depth: 0,
      overrideAccess: true,
    })
    expect(variant.status).toBe('published')
    const draft: any = await (payload as any).findByID({
      collection: 'social-drafts',
      id: draftId,
      depth: 0,
      overrideAccess: true,
    })
    expect(draft.status).toBe('published')
    const posts = await (payload as any).find({
      collection: 'external-posts',
      where: { variant: { equals: variantId } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    })
    expect(posts.docs).toHaveLength(1)
    expect(posts.docs[0].remoteUrl).toContain(`${FIXTURE}/posts/`)
    const state = await fixtureState()
    expect(state.creates['did:plc:good']).toBe(1)
  })

  it('2. pause holds a due item against sweep and direct dispatch; resume releases it; cancel is terminal', async () => {
    const accountId = await seedAccount('pause.test')
    const item = await seedScheduledItem({ accountId, text: `RC316 paused ${stamp}` })
    await pauseSocialQueueItem(payload, item.queueId)
    expect((await queueRow(item.queueId)).status).toBe('paused')
    await recoverSocialOutbox(payload)
    expect((await fixtureState()).creates['did:plc:pause'] ?? 0).toBe(0)
    const skipped: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
    })
    expect(skipped.output.skipped).toBe(true)
    await resumeSocialQueueItem(payload, item.queueId)
    const released: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
    })
    expect(released.output.status).toBe('published')
    expect((await fixtureState()).creates['did:plc:pause']).toBe(1)

    const doomed = await seedScheduledItem({ accountId, text: `RC316 cancelled ${stamp}` })
    await (payload as any).update({
      collection: 'social-queue-items',
      id: doomed.queueId,
      data: { status: 'cancelled', cancelledAt: new Date().toISOString() },
      overrideAccess: true,
    })
    await recoverSocialOutbox(payload)
    expect((await fixtureState()).creates['did:plc:pause']).toBe(1)
    await expect(pauseSocialQueueItem(payload, doomed.queueId)).rejects.toThrow(/Cannot move/)
  })

  it('3. retry gate tiers, then a lost response quarantines and reconcile settles without a second post', async () => {
    const accountId = await seedAccount('bad.test')
    const item = await seedScheduledItem({ accountId, text: `RC316 retry ${stamp}` })
    const first: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
    })
    expect(first.output.status).toBe('failed')
    expect((await fixtureState()).creates['did:plc:bad'] ?? 0).toBe(0)

    // The automatic gate refuses a validation-class failure…
    const autoRetry: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
      mode: 'retry',
    })
    expect(autoRetry.output.skipped).toBe(true)
    // …the operator gate retries it (still failing, still no post).
    const operatorRetry: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
      mode: 'retry',
      operatorRequested: true,
    })
    expect(operatorRetry.output.status).toBe('failed')
    expect((await fixtureState()).creates['did:plc:bad'] ?? 0).toBe(0)

    // Provider now accepts but the response is lost: the outcome is
    // uncertain and must quarantine, never blind-retry.
    await fetch(`${FIXTURE}/recover`)
    const lost: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
      mode: 'retry',
      operatorRequested: true,
    })
    expect(lost.output.status).toBe('unknown')
    const quarantined = await queueRow(item.queueId)
    expect(quarantined.status).toBe('unknown')
    expect(quarantined.nextAttemptAt ?? null).toBeNull()
    expect((await fixtureState()).creates['did:plc:bad']).toBe(1)
    const requestsBefore = (await fixtureState()).requests['did:plc:bad']

    const blindRetry: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
      mode: 'retry',
      operatorRequested: true,
    })
    expect(blindRetry.output.skipped).toBe(true)

    const settled: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
      mode: 'reconcile',
    })
    expect(settled.output.status).toBe('published')
    const state = await fixtureState()
    expect(state.creates['did:plc:bad']).toBe(1)
    expect(state.requests['did:plc:bad']).toBe(requestsBefore)
  })

  it('4. manual handoff parks with the approved copy and completes by operator receipt', async () => {
    const accountId = await seedAccount('hands.test', 'manual')
    const item = await seedScheduledItem({
      accountId,
      network: 'manual',
      text: `RC316 handoff ${stamp}`,
    })
    const result: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
    })
    expect(result.output.status).toBe('manual-handoff')
    const queue = await queueRow(item.queueId)
    expect(queue.status).toBe('manual-handoff')
    expect(queue.handoff.text).toBe(`RC316 handoff ${stamp}`)
    expect(queue.handoff.linkUrl).toBe('https://a.rc2-a04.test/articles/rc316')
    expect(queue.handoff.network).toBe('manual')
    const attempts = await (payload as any).find({
      collection: 'social-publish-attempts',
      where: { queueItem: { equals: item.queueId } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    })
    expect(attempts.docs).toHaveLength(0)

    await expect(
      completeManualHandoff(payload, { queueItemId: item.queueId, remoteUrl: '' }),
    ).rejects.toThrow(/URL is required/)
    const done = await completeManualHandoff(payload, {
      queueItemId: item.queueId,
      remoteUrl: 'https://example.test/post/rc316-manual',
      note: 'Posted by hand from the approved copy.',
    })
    expect(done.status).toBe('published')
    const settled = await queueRow(item.queueId)
    expect(settled.status).toBe('published')
    expect(settled.handoff.remoteUrl).toBe('https://example.test/post/rc316-manual')
    expect(settled.handoff.completedAt).toBeTruthy()
    const posts = await (payload as any).find({
      collection: 'external-posts',
      where: { variant: { equals: item.variantId } },
      limit: 5,
      depth: 0,
      overrideAccess: true,
    })
    expect(posts.docs).toHaveLength(1)
    expect(posts.docs[0].remoteUrl).toBe('https://example.test/post/rc316-manual')
  })

  it('5. evergreen: publish spawns the next slot on cadence, once; the series can be paused', async () => {
    const accountId = await seedAccount('ever.test')
    const slotTime = new Date(Date.now() - 60_000).toISOString()
    const item = await seedScheduledItem({
      accountId,
      text: `RC316 evergreen ${stamp}`,
      scheduledFor: slotTime,
      recurrenceIntervalDays: 7,
    })
    const first: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
    })
    expect(first.output.status).toBe('published')

    const seriesKey = `draft:${item.draftId}:variant:${item.variantId}`
    const nextKey = `evergreen:${seriesKey}:2:${item.approvalHash}`
    const spawned = await (payload as any).find({
      collection: 'social-queue-items',
      where: { idempotencyKey: { equals: nextKey } },
      limit: 2,
      depth: 0,
      overrideAccess: true,
    })
    expect(spawned.docs).toHaveLength(1)
    const occurrence2 = spawned.docs[0]
    expect(occurrence2.status).toBe('scheduled')
    expect(occurrence2.recurrenceOccurrence).toBe(2)
    expect(Date.parse(occurrence2.scheduledFor) - Date.parse(slotTime)).toBe(7 * 86_400_000)

    // Replaying the completed item cannot spawn a duplicate.
    const replay: any = await executeSocialQueueItem(payload, {
      queueItemId: item.queueId,
      workerId: 'rc316-journey',
    })
    expect(replay.output.skipped).toBe(true)
    const afterReplay = await (payload as any).find({
      collection: 'social-queue-items',
      where: { recurrenceSeriesKey: { equals: seriesKey } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    expect(afterReplay.docs).toHaveLength(2)
    expect((await fixtureState()).creates['did:plc:ever']).toBe(1)

    // Occurrence 2 publishes when due and spawns occurrence 3; pausing
    // occurrence 3 holds the series.
    await (payload as any).update({
      collection: 'social-queue-items',
      id: String(occurrence2.id),
      data: { scheduledFor: new Date(Date.now() - 1_000).toISOString() },
      overrideAccess: true,
    })
    const second: any = await executeSocialQueueItem(payload, {
      queueItemId: String(occurrence2.id),
      workerId: 'rc316-journey',
    })
    expect(second.output.status).toBe('published')
    expect((await fixtureState()).creates['did:plc:ever']).toBe(2)
    const third = await (payload as any).find({
      collection: 'social-queue-items',
      where: { recurrenceSeriesKey: { equals: seriesKey }, recurrenceOccurrence: { equals: 3 } },
      limit: 2,
      depth: 0,
      overrideAccess: true,
    })
    expect(third.docs).toHaveLength(1)
    await (payload as any).update({
      collection: 'social-queue-items',
      id: String(third.docs[0].id),
      data: { scheduledFor: new Date(Date.now() - 1_000).toISOString() },
      overrideAccess: true,
    })
    await pauseSocialQueueItem(payload, String(third.docs[0].id))
    await recoverSocialOutbox(payload)
    expect((await fixtureState()).creates['did:plc:ever']).toBe(2)
  })

  it('6. provider truth agrees across runtime, capability truth and dispatch behavior', async () => {
    expect(socialProviderFor('manual').mode).toBe('manual-handoff')
    expect(getProviderCapabilityTruth('manual').mode).toBe('manual-handoff')
    expect(getProviderCapabilityTruth('x').mode).toBe('manual-handoff')
    expect(socialProviderFor('x').mode).toBe('manual-handoff')
    expect(getProviderCapabilityTruth('bluesky').mode).not.toBe('manual-handoff')
    expect(getProviderCapabilityTruth('bluesky').mode).not.toBe('unavailable')
    // Caller-supplied promotion cannot move a manual network (salvage).
    expect(getProviderCapabilityTruth('x', 'live').mode).toBe('manual-handoff')
  })
})
