/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { socialHash } from '../../src/modules/social/contracts'
import { encryptSecret } from '../../src/modules/social/security'
import { executeSocialQueueItem } from '../../src/modules/social/tasks'
import {
  assertFixtureSafeDatabase,
  buildRc2World,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

/**
 * RC2-DEBT-25: a bounded-out failed queue item (attempt bound spent) can
 * diverge from provider truth — the measured case is a lose-response
 * provider that committed the post on the final attempt while the item
 * recorded a known failure. Retry stays exhausted, but reconcile mode
 * now accepts the item and settles it from a read-only provider lookup
 * by the deterministic record key, without spending an attempt and
 * without creating a second post.
 *
 * Runs against the repository AT-protocol fixture
 * (tests/rc03/provider-fixture.mjs, isolated on 127.0.0.1:13160).
 */
const FIXTURE = 'http://127.0.0.1:13160'

async function fixtureUp(): Promise<boolean> {
  try {
    const res = await fetch(`${FIXTURE}/state`)
    return res.ok
  } catch {
    return false
  }
}

describe('RC2-DEBT-25: bounded-out failed items settle via read-only reconcile', () => {
  let payload: Payload
  let world: Rc2World
  let fixtureProc: ChildProcess | null = null
  const originalAllowedOrigins = process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS
  const stamp = Date.now().toString(36)

  async function seedBoundedItem(identifier: string, text: string) {
    const siteId = world.siteA.siteId
    const account = await (payload as any).create({
      collection: 'social-accounts',
      data: {
        site: siteId,
        network: 'bluesky',
        actorType: 'site',
        displayName: `DEBT25 ${identifier} ${stamp}`,
        externalAccountId: `debt25-${identifier}-${stamp}`,
        credentialHealth: 'healthy',
        // SOC-SEC-1: fixtures seed the encrypted envelope, never plaintext.
        connectionReference: `enc:${encryptSecret(
          JSON.stringify({
            identifier,
            appPassword: 'pw',
            service: FIXTURE,
          }),
        )}`,
      },
      overrideAccess: true,
    })
    const draft = await (payload as any).create({
      collection: 'social-drafts',
      data: {
        site: siteId,
        title: `DEBT25 Draft ${identifier} ${stamp}`,
        status: 'approved',
        canonicalUrl: 'https://a.rc2-a04.test/articles/debt25',
      },
      overrideAccess: true,
    })
    const linkUrl = 'https://a.rc2-a04.test/articles/debt25'
    const approvalHash = socialHash({ network: 'bluesky', text, linkUrl, attachments: [] })
    const variant = await (payload as any).create({
      collection: 'social-network-variants',
      data: {
        draft: String(draft.id),
        account: String(account.id),
        network: 'bluesky',
        label: 'Bluesky',
        text,
        linkUrl,
        status: 'failed',
        approvalHash,
        idempotencyKey: `debt25-variant-${identifier}-${stamp}`,
      },
      overrideAccess: true,
    })
    const idempotencyKey = `scheduled:draft:${draft.id}:${variant.id}:${approvalHash}`
    const queue = await (payload as any).create({
      collection: 'social-queue-items',
      data: {
        variant: String(variant.id),
        account: String(account.id),
        scheduledFor: new Date(Date.now() - 60_000).toISOString(),
        timeZone: 'UTC',
        status: 'failed',
        attemptCount: 3,
        idempotencyKey,
        deadLetterReason: {
          kind: 'transient',
          remoteOutcome: 'failed',
          providerCode: 'ResponseLost',
          message: 'Final attempt response lost after provider commit.',
        },
      },
      overrideAccess: true,
    })
    return { queueId: String(queue.id), idempotencyKey }
  }

  beforeAll(async () => {
    process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS = FIXTURE
    assertFixtureSafeDatabase(process.env.DATABASE_URL)
    if (await fixtureUp()) throw new Error('RC316 fixture port is already occupied')
    fixtureProc = spawn('node', ['tests/rc03/provider-fixture.mjs'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      env: { ...process.env, SOCIAL_FIXTURE_PORT: '13160' },
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

  it('quarantines a lost response and reconciles without a second provider submission', async () => {
    const did = 'did:plc:bad'
    const { queueId } = await seedBoundedItem('bad.test', `RC316 lost response ${stamp}`)
    await (payload as any).update({
      collection: 'social-queue-items',
      id: queueId,
      data: { status: 'scheduled', attemptCount: 0, deadLetterReason: null },
      overrideAccess: true,
    })
    const before = await (await fetch(`${FIXTURE}/state`)).json()
    await fetch(`${FIXTURE}/recover`)
    await executeSocialQueueItem(payload, {
      queueItemId: queueId,
      workerId: 'rc316',
      mode: 'dispatch',
    })
    const unknown = await (payload as any).findByID({
      collection: 'social-queue-items',
      id: queueId,
      depth: 0,
      overrideAccess: true,
    })
    expect(unknown.status).toBe('unknown')
    expect(unknown.attemptCount).toBe(1)
    await executeSocialQueueItem(payload, {
      queueItemId: queueId,
      workerId: 'rc316',
      mode: 'retry',
      operatorRequested: true,
    })
    const afterRetry = await (await fetch(`${FIXTURE}/state`)).json()
    expect(afterRetry.requests[did]).toBe((before.requests[did] ?? 0) + 1)
    await executeSocialQueueItem(payload, {
      queueItemId: queueId,
      workerId: 'rc316',
      mode: 'reconcile',
    })
    const settled = await (payload as any).findByID({
      collection: 'social-queue-items',
      id: queueId,
      depth: 0,
      overrideAccess: true,
    })
    const afterReconcile = await (await fetch(`${FIXTURE}/state`)).json()
    expect(settled.status).toBe('published')
    expect(settled.attemptCount).toBe(1)
    const attempts = await (payload as any).find({
      collection: 'social-publish-attempts',
      where: { queueItem: { equals: queueId } },
      depth: 0,
      overrideAccess: true,
    })
    expect(attempts.docs).toHaveLength(1)
    expect(attempts.docs[0].response).toMatchObject({ providerMode: 'local-harness' })
    expect(afterReconcile.requests[did]).toBe((before.requests[did] ?? 0) + 1)
    expect(afterReconcile.creates[did]).toBe((before.creates[did] ?? 0) + 1)
  }, 120_000)

  it('settles a bounded-out item to published from provider truth, spending no attempt and creating no second post', async () => {
    const identifier = `settle${stamp.slice(-6)}.test`
    const did = `did:plc:${identifier.split('.')[0]}`
    const text = `DEBT25 settle ${stamp}`
    const { queueId, idempotencyKey } = await seedBoundedItem(identifier, text)

    // The provider already holds the post (committed on the lost final
    // attempt): create it directly at the fixture under the
    // deterministic record key the adapter derives from the queue key.
    const rkey = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32)
    const createRes = await fetch(`${FIXTURE}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        repo: did,
        collection: 'app.bsky.feed.post',
        rkey,
        record: {
          $type: 'app.bsky.feed.post',
          text,
          createdAt: new Date().toISOString(),
        },
      }),
    })
    expect(createRes.ok).toBe(true)

    await executeSocialQueueItem(payload, {
      queueItemId: queueId,
      workerId: 'debt25-test',
      mode: 'reconcile',
    })

    const after = await (payload as any).findByID({
      collection: 'social-queue-items',
      id: queueId,
      depth: 0,
      overrideAccess: true,
    })
    expect(after.status).toBe('published')
    expect(after.attemptCount).toBe(3)
    const state = await (await fetch(`${FIXTURE}/state`)).json()
    expect(state.creates[did]).toBe(1)
  }, 120_000)

  it('leaves a bounded-out item quarantined (unknown) when the provider holds no record', async () => {
    const identifier = `absent${stamp.slice(-6)}.test`
    const did = `did:plc:${identifier.split('.')[0]}`
    const { queueId } = await seedBoundedItem(identifier, `DEBT25 absent ${stamp}`)

    await executeSocialQueueItem(payload, {
      queueItemId: queueId,
      workerId: 'debt25-test',
      mode: 'reconcile',
    })

    const after = await (payload as any).findByID({
      collection: 'social-queue-items',
      id: queueId,
      depth: 0,
      overrideAccess: true,
    })
    expect(after.status).toBe('unknown')
    expect(after.attemptCount).toBe(3)
    const state = await (await fetch(`${FIXTURE}/state`)).json()
    expect(state.creates[did] ?? 0).toBe(0)
  }, 120_000)
})
