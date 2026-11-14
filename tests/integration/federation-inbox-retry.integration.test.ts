import { randomUUID } from 'node:crypto'

import { getPayload } from 'payload'
import { afterAll, describe, expect, it } from 'vitest'

import config from '../../src/payload.config'
import { recordInbound, releaseInbound } from '../../src/modules/social/activitypub-runtime'

// RC2-H-05 (RC2-DEBT-22): the federation inbox recorded the dedupe key
// BEFORE processing, so when processing threw, the record stayed
// 'accepted' forever and a legitimate retry of the same activity was
// acknowledged (202) as a duplicate without ever being processed.
// The inbox route now rolls the record back on processing failure via
// releaseInbound; this test proves the mechanism the route relies on:
// record → duplicate guard holds → release → the same key records fresh.
describe('federation inbox dedupe rollback (RC2-H-05 / RC2-DEBT-22)', () => {
  let payload: Awaited<ReturnType<typeof getPayload>>
  let remoteActorDocId = ''
  let remoteInstanceDocId = ''
  const dedupeKey = `h05-retry-${randomUUID()}`
  const input = () => ({
    activity: { id: `https://peer.example/activities/${dedupeKey}` },
    remoteActor: { id: remoteActorDocId },
    dedupeKey,
    envelope: { type: 'Create', actor: 'https://peer.example/actors/alice' },
  })

  afterAll(async () => {
    const leftovers = await payload.find({
      collection: 'inbound-network-activities',
      where: { dedupeKey: { equals: dedupeKey } },
      limit: 10,
      overrideAccess: true,
    })
    for (const doc of leftovers.docs)
      await payload.delete({
        collection: 'inbound-network-activities',
        id: doc.id,
        overrideAccess: true,
      })
    if (remoteActorDocId)
      await payload
        .delete({ collection: 'remote-actors', id: remoteActorDocId, overrideAccess: true })
        .catch(() => undefined)
    if (remoteInstanceDocId)
      await payload
        .delete({
          collection: 'remote-instances',
          id: remoteInstanceDocId,
          overrideAccess: true,
        })
        .catch(() => undefined)
  })

  it('records fresh, guards the replay, and records fresh again after release', async () => {
    payload = await getPayload({ config })
    // recordInbound stores the remote-actors document id (a relationship),
    // exactly as verifyInboundActivity hands it over in production.
    const instanceDoc = await payload.create({
      collection: 'remote-instances',
      data: { origin: `https://${dedupeKey}.peer.example`, status: 'active' } as never,
      overrideAccess: true,
    })
    remoteInstanceDocId = String(instanceDoc.id)
    const actorDoc = await payload.create({
      collection: 'remote-actors',
      data: {
        instance: remoteInstanceDocId,
        canonicalId: `https://peer.example/actors/${dedupeKey}`,
        profile: { inbox: 'https://peer.example/inbox' },
      } as never,
      overrideAccess: true,
    })
    remoteActorDocId = String(actorDoc.id)

    const first = await recordInbound(payload as never, input())
    expect(first.duplicate).toBe(false)
    expect(first.record?.id).toBeTruthy()

    const replay = await recordInbound(payload as never, input())
    expect(replay.duplicate).toBe(true)

    // Simulated processing failure: the route rolls the record back.
    await releaseInbound(payload as never, String(first.record?.id))

    const retry = await recordInbound(payload as never, input())
    expect(retry.duplicate).toBe(false)
    expect(retry.record?.id).toBeTruthy()
    expect(String(retry.record?.id)).not.toBe(String(first.record?.id))
  })
})
