/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Payload store test double. */
import { describe, expect, it } from 'vitest'

import { processProviderSuppressionEvent } from '../../src/modules/audience/service'

/**
 * 16B: provider email callbacks must apply effects in occurredAt order.
 * A replay is deduplicated; a stale (older) callback is recorded for
 * history but never regresses status or re-applies a business effect;
 * a 'deferred' callback never regresses a terminal delivery status.
 */

const T1 = '2026-11-01T10:00:00.000Z'
const T2 = '2026-11-01T11:00:00.000Z'
const T3 = '2026-11-01T12:00:00.000Z'

function makeStore() {
  const delivery: any = {
    id: 'delivery-1',
    message: { id: 'message-1', site: 'site-a' },
    provider: 'smtp-gateway',
    providerMessageId: 'prov-msg-1',
    recipientEmail: 'reader@example.test',
    status: 'accepted',
    outcome: {},
  }
  const events: any[] = []
  const suppressions: any[] = []
  const matches = (doc: any, where: any): boolean =>
    Object.entries(where ?? {}).every(([field, cond]: [string, any]) => {
      if (field === 'and') return (cond as any[]).every((sub) => matches(doc, sub))
      if (cond && typeof cond === 'object' && 'equals' in cond) return doc[field] === cond.equals
      return doc[field] === cond
    })
  const store: any = {
    find: async ({ collection, where, sort }: any) => {
      if (collection === 'email-deliveries')
        return { docs: matches(delivery, where) ? [delivery] : [] }
      if (collection === 'email-delivery-events') {
        let docs = events.filter((doc) => matches(doc, where))
        if (sort === '-occurredAt')
          docs = [...docs].sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
        return { docs }
      }
      if (collection === 'suppressions')
        return { docs: suppressions.filter((d) => matches(d, where)) }
      return { docs: [] }
    },
    create: async ({ collection, data }: any) => {
      const doc = { id: `${collection}-${events.length + suppressions.length + 1}`, ...data }
      if (collection === 'email-delivery-events') events.push(doc)
      if (collection === 'suppressions') suppressions.push(doc)
      return doc
    },
    update: async ({ collection, id, data }: any) => {
      if (collection === 'email-deliveries' && id === delivery.id) Object.assign(delivery, data)
      return delivery
    },
  }
  return { store, delivery, events, suppressions }
}

const send = (store: any, overrides: Record<string, any> = {}) =>
  processProviderSuppressionEvent(store, {
    siteId: 'site-a',
    email: 'reader@example.test',
    event: 'delivered',
    provider: 'smtp-gateway',
    providerMessageId: 'prov-msg-1',
    ...overrides,
  } as any)

describe('16B email provider callback ordering', () => {
  it('deduplicates an exact replay without a second event record or effect', async () => {
    const { store, delivery, events } = makeStore()
    await send(store, { providerEventId: 'evt-1', occurredAt: T1 })
    await send(store, { providerEventId: 'evt-1', occurredAt: T1 })
    expect(events).toHaveLength(1)
    expect(delivery.status).toBe('delivered')
  })

  it('records a stale older callback but never lets it regress status or suppress', async () => {
    const { store, delivery, events, suppressions } = makeStore()
    await send(store, { event: 'bounce', providerEventId: 'evt-bounce', occurredAt: T2 })
    expect(delivery.status).toBe('bounced')
    expect(suppressions).toHaveLength(1)
    // A 'delivered' that occurred BEFORE the bounce arrives late.
    await send(store, { event: 'delivered', providerEventId: 'evt-delivered', occurredAt: T1 })
    expect(events).toHaveLength(2)
    expect(delivery.status).toBe('bounced')
    expect(suppressions).toHaveLength(1)
  })

  it('does not suppress from a stale bounce that predates an applied delivery', async () => {
    const { store, delivery, events, suppressions } = makeStore()
    await send(store, { event: 'delivered', providerEventId: 'evt-delivered', occurredAt: T2 })
    await send(store, { event: 'bounce', providerEventId: 'evt-bounce', occurredAt: T1 })
    expect(events).toHaveLength(2)
    expect(delivery.status).toBe('delivered')
    expect(suppressions).toHaveLength(0)
  })

  it('never regresses a terminal status to deferred, even with a newer timestamp', async () => {
    const { store, delivery } = makeStore()
    await send(store, { event: 'delivered', providerEventId: 'evt-1', occurredAt: T1 })
    await send(store, { event: 'deferred', providerEventId: 'evt-2', occurredAt: T3 })
    expect(delivery.status).toBe('delivered')
  })

  it('still applies in-order progression: deferred then delivered', async () => {
    const { store, delivery } = makeStore()
    await send(store, { event: 'deferred', providerEventId: 'evt-1', occurredAt: T1 })
    expect(delivery.status).toBe('deferred')
    await send(store, { event: 'delivered', providerEventId: 'evt-2', occurredAt: T2 })
    expect(delivery.status).toBe('delivered')
  })
})
