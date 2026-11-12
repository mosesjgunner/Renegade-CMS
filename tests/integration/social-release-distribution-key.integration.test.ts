/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { socialHash } from '../../src/modules/social/contracts'
import { executeSocialQueueItem } from '../../src/modules/social/tasks'
import {
  assertFixtureSafeDatabase,
  buildRc2World,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

/**
 * RC2-D-04 regression: release-driven distribution dispatch.
 *
 * The release saga creates social queue items keyed
 * `release:<releaseId>:<artifactId>:<variantId>`, but the dispatch
 * executor only accepted keys ending with the variant approval hash —
 * so every release distribution threw its authorization error before
 * any provider request and the item sat in `scheduled` with no failure
 * record. The executor now accepts either binding (the content-hash
 * check itself is unchanged). The account here is revoked, so a
 * validation-passing execution ends in a persisted reconnect-required
 * failure — no provider is needed to prove the gate.
 */
describe('RC2-D-04: release-keyed social queue items pass dispatch validation', () => {
  let payload: Payload
  let world: Rc2World
  let accountId: string
  let draftId: string
  let variantId: string
  let approvalHash: string

  const stamp = Date.now().toString(36)

  async function makeQueueItem(idempotencyKey: string) {
    return (payload as any).create({
      collection: 'social-queue-items',
      data: {
        variant: variantId,
        account: accountId,
        scheduledFor: new Date(Date.now() - 60_000).toISOString(),
        timeZone: 'UTC',
        status: 'scheduled',
        idempotencyKey,
      },
      overrideAccess: true,
    })
  }

  beforeAll(async () => {
    assertFixtureSafeDatabase(process.env.DATABASE_URL)
    payload = await getPayload({ config })
    world = await buildRc2World(payload)
    const siteId = world.siteA.siteId

    const account = await (payload as any).create({
      collection: 'social-accounts',
      data: {
        site: siteId,
        network: 'bluesky',
        actorType: 'site',
        displayName: `D04 Key Test ${stamp}`,
        externalAccountId: `d04-key-${stamp}`,
        credentialHealth: 'revoked',
        connectionReference: 'd04-test-reference',
      },
      overrideAccess: true,
    })
    accountId = String(account.id)

    const draft = await (payload as any).create({
      collection: 'social-drafts',
      data: {
        site: siteId,
        title: `D04 Key Test Draft ${stamp}`,
        status: 'approved',
        canonicalUrl: 'https://a.rc2-a04.test/articles/d04-key-test',
      },
      overrideAccess: true,
    })
    draftId = String(draft.id)

    const text = `D04 key test ${stamp}`
    const linkUrl = 'https://a.rc2-a04.test/articles/d04-key-test'
    approvalHash = socialHash({ network: 'bluesky', text, linkUrl, attachments: [] })
    const variant = await (payload as any).create({
      collection: 'social-network-variants',
      data: {
        draft: draftId,
        account: accountId,
        network: 'bluesky',
        label: 'Bluesky',
        text,
        linkUrl,
        status: 'approved',
        approvalHash,
        idempotencyKey: `d04-variant-${stamp}`,
      },
      overrideAccess: true,
    })
    variantId = String(variant.id)
  }, 180_000)

  afterAll(async () => {
    if (payload && world) await teardownRc2World(payload, world)
  })

  it('dispatches a release-keyed item past validation (fails on the revoked account, with the failure persisted)', async () => {
    const item = await makeQueueItem(
      `release:00000000-0000-4000-8000-000000000001:distribution:${draftId}:${variantId}`,
    )
    let thrown: unknown = null
    try {
      await executeSocialQueueItem(payload, { queueItemId: String(item.id), workerId: 'd04-test' })
    } catch (err) {
      thrown = err
    }
    expect(String((thrown as Error)?.message ?? '')).not.toContain(
      'no longer matches its authorization',
    )
    const after = await (payload as any).findByID({
      collection: 'social-queue-items',
      id: item.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(after.status).toBe('failed')
    expect(after.deadLetterReason).toBeTruthy()
  }, 120_000)

  it('still refuses a queue item whose key binds neither the approval hash nor the variant', async () => {
    const item = await makeQueueItem(`unbound:${stamp}:${variantId}`)
    await expect(
      executeSocialQueueItem(payload, { queueItemId: String(item.id), workerId: 'd04-test' }),
    ).rejects.toThrow('no longer matches its authorization')
    const after = await (payload as any).findByID({
      collection: 'social-queue-items',
      id: item.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(after.status).toBe('scheduled')
  }, 120_000)

  it('still accepts the standalone scheduled key (approval-hash suffix)', async () => {
    const item = await makeQueueItem(`scheduled:draft:${draftId}:${variantId}:${approvalHash}`)
    let thrown: unknown = null
    try {
      await executeSocialQueueItem(payload, { queueItemId: String(item.id), workerId: 'd04-test' })
    } catch (err) {
      thrown = err
    }
    expect(String((thrown as Error)?.message ?? '')).not.toContain(
      'no longer matches its authorization',
    )
    const after = await (payload as any).findByID({
      collection: 'social-queue-items',
      id: item.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(after.status).toBe('failed')
  }, 120_000)
})
