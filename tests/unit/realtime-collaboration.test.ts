import { describe, expect, it } from 'vitest'

import {
  activePresence,
  heartbeatPresence,
  visibleRealtimeEvents,
  type RealtimeStore,
} from '../../src/modules/collaboration/realtime'
import type { TeamScope } from '../../src/modules/collaboration/service'

class Store implements RealtimeStore {
  records = new Map<string, Array<Record<string, unknown>>>()
  sequence = 0
  async create({ collection, data }: Record<string, unknown>) {
    const name = String(collection)
    const record: Record<string, unknown> = {
      ...(data as Record<string, unknown>),
      id: `id-${++this.sequence}`,
    }
    if (name === 'realtime-events') record.sequence = this.sequence
    this.records.set(name, [...(this.records.get(name) ?? []), record])
    return record
  }
  async find({ collection, where }: Record<string, unknown>) {
    return {
      docs: (this.records.get(String(collection)) ?? []).filter((record) =>
        matches(record, where as Record<string, unknown>),
      ),
    }
  }
  async findByID({ collection, id }: Record<string, unknown>) {
    const item = (this.records.get(String(collection)) ?? []).find((record) => record.id === id)
    if (!item) throw new Error('not found')
    return item
  }
  async update({ collection, id, data }: Record<string, unknown>) {
    const item = await this.findByID({ collection, id })
    Object.assign(item, data)
    return item
  }
  async delete({ collection, id }: Record<string, unknown>) {
    this.records.set(
      String(collection),
      (this.records.get(String(collection)) ?? []).filter((item) => item.id !== id),
    )
  }
}
function value(value: unknown) {
  return typeof value === 'string' ? value : (value as { id?: string } | undefined)?.id
}
function matches(record: Record<string, unknown>, where: Record<string, unknown>): boolean {
  if (Array.isArray(where.and))
    return where.and.every((part) => matches(record, part as Record<string, unknown>))
  return Object.entries(where).every(([key, condition]) => {
    const target = condition as { equals?: unknown }
    return target.equals === undefined || value(record[key]) === target.equals
  })
}
const scope: TeamScope = { kind: 'site', siteId: 'site-a' }
async function grant(store: Store, member = 'member-a') {
  await store.create({
    collection: 'team-memberships',
    data: { member, scopeKey: 'site:site-a', status: 'active', role: 'editor', grants: [] },
  })
}

describe('Prompt 17 realtime collaboration', () => {
  it('recovers durable events after reconnect without exposing another recipient', () => {
    const events = [
      { sequence: 1, recipientMember: 'member-a' },
      { sequence: 2, recipientMember: 'member-b' },
      { sequence: 3, recipientMember: null },
    ]
    expect(visibleRealtimeEvents(events, 'member-a', 1).map((event) => event.sequence)).toEqual([3])
  })

  it('expires stale presence and rejects revoked editor heartbeats', async () => {
    const store = new Store()
    await grant(store)
    await heartbeatPresence(store, {
      memberId: 'member-a',
      scope,
      articleId: 'article-a',
      clientId: 'client_identifier_123',
      mode: 'editing',
      ttlSeconds: 30,
      now: new Date('2026-08-30T00:00:00Z'),
    })
    expect(
      activePresence(
        store.records.get('realtime-presence') ?? [],
        new Date('2026-08-30T00:00:29Z'),
      ),
    ).toHaveLength(1)
    expect(
      activePresence(
        store.records.get('realtime-presence') ?? [],
        new Date('2026-08-30T00:00:31Z'),
      ),
    ).toHaveLength(0)
    const membership = (store.records.get('team-memberships') ?? [])[0]
    membership.status = 'revoked'
    await expect(
      heartbeatPresence(store, {
        memberId: 'member-a',
        scope,
        articleId: 'article-a',
        clientId: 'client_identifier_124',
        mode: 'viewing',
        ttlSeconds: 30,
      }),
    ).rejects.toThrow('access denied')
  })
})
