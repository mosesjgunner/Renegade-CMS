import { describe, expect, it, vi } from 'vitest'
vi.mock('../../src/modules/social/activitypub-runtime', () => ({
  resolveRemoteActor: vi.fn(async () => ({
    id: 'remote-id',
    canonicalId: 'https://remote.test/users/a',
    instance: 'instance-id',
    profile: { inbox: 'https://remote.test/inbox' },
  })),
  queueActivityDelivery: vi.fn(async () => ({ id: 'delivery-id' })),
}))
import {
  permitsRemoteSource,
  remoteObjectReference,
  takeNetworkQuota,
} from '../../src/modules/network/experience'
import { followRemoteActor, unfollowRemoteActor } from '../../src/modules/network/service'

const remote = {
  id: 'remote-id',
  canonicalId: 'https://remote.test/users/a',
  instance: 'instance-id',
  profile: { inbox: 'https://remote.test/inbox' },
}
const store = (relationship: Record<string, unknown> | null = null) => ({
  findGlobal: async () => ({ remotePolicy: { default: 'allow' } }),
  find: async ({ collection }: { collection: string }) => {
    if (collection === 'network-access-decisions') return { docs: [] }
    if (collection === 'network-relationships') return { docs: relationship ? [relationship] : [] }
    return { docs: [] }
  },
  create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) =>
    collection === 'network-relationships'
      ? { id: 'relationship-id', ...data }
      : { id: 'audit-id', ...data },
  update: async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'relationship-id',
    ...data,
  }),
})

describe('optional network experience safeguards', () => {
  const actor = 'https://remote.test/users/a'
  it('blocks actors and domains, including in allowlist mode', () => {
    expect(permitsRemoteSource(actor, [{ subject: actor, decision: 'block' }])).toBe(false)
    expect(
      permitsRemoteSource(actor, [{ subject: 'https://remote.test', decision: 'block' }]),
    ).toBe(false)
    expect(permitsRemoteSource(actor, [], { allowlist: true })).toBe(false)
    expect(
      permitsRemoteSource(actor, [{ subject: 'https://remote.test', decision: 'allow' }], {
        allowlist: true,
      }),
    ).toBe(true)
  })
  it('keeps remote references non-canonical and bounded', () => {
    expect(
      remoteObjectReference({ id: 'https://remote.test/n/1', type: 'Note', content: 'ignored' })
        .reference,
    ).toMatchObject({ remoteOnly: true, origin: 'https://remote.test' })
  })
  it('bounds a hostile source', () => {
    const subject = `limit-${Date.now()}`
    for (let i = 0; i < 30; i += 1) expect(takeNetworkQuota('inboxPerMinute', subject)).toBe(true)
    expect(takeNetworkQuota('inboxPerMinute', subject)).toBe(false)
  })
  it('creates bounded outbound follow state and ends it without changing local content', async () => {
    const payload = store()
    await expect(
      followRemoteActor({
        payload: payload as never,
        localActor: 'https://local.test/ap/actors/main',
        localSubjectId: 'local-id',
        remoteActorId: remote.canonicalId,
      }),
    ).resolves.toMatchObject({ kind: 'follow', direction: 'outbound', state: 'pending' })
    await expect(
      unfollowRemoteActor({
        payload: store({ id: 'relationship-id', remoteActor: remote }) as never,
        localActor: 'https://local.test/ap/actors/main',
        localSubjectId: 'local-id',
        remoteActorId: remote.id,
      }),
    ).resolves.toMatchObject({ id: 'relationship-id' })
  })
})
