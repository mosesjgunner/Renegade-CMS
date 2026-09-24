import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NotificationStreamManager,
  notificationStreamManager,
  rebuildNotificationCounters,
} from '@/modules/community/notification-stream'

const siteA = '00000000-0000-7000-8000-000000000001'
const siteB = '00000000-0000-7000-8000-000000000002'
const memberId = '00000000-0000-7000-8000-000000000003'

function createMockPayload(queryHandler: (text: string, values?: unknown[]) => Promise<unknown[]>) {
  return {
    db: {
      pool: {
        query: vi.fn(async (text: string, values: unknown[] = []) => ({
          rows: await queryHandler(text, values),
        })),
      },
    },
  } as never
}

describe('COMM-06D realtime notification hints and counter repair', () => {
  beforeEach(() => {
    notificationStreamManager.clear()
  })

  it('disconnect, emit 3 notifications, reconnect with Last-Event-ID, receive missed hints', () => {
    const receivedChunks: string[] = []
    const connection1 = {
      id: 'conn-1',
      siteId: siteA,
      memberId,
      send: (chunk: string) => receivedChunks.push(chunk),
      close: vi.fn(),
    }

    // 1. Initial connection established
    expect(notificationStreamManager.acquireLease(memberId, connection1)).toBe(true)

    // Emit initial notification
    const hint0 = notificationStreamManager.emitHint(siteA, memberId, 1)
    expect(receivedChunks).toHaveLength(1)
    expect(receivedChunks[0]).toContain(`id: ${hint0.id}`)
    expect(receivedChunks[0]).toContain('"unread_count":1')

    // 2. Client disconnects
    notificationStreamManager.releaseLease(memberId, connection1)

    // 3. While disconnected, 3 notifications occur
    const hint1 = notificationStreamManager.emitHint(siteA, memberId, 2)
    const hint2 = notificationStreamManager.emitHint(siteA, memberId, 3)
    const hint3 = notificationStreamManager.emitHint(siteA, memberId, 4)

    // 4. Reconnect with Last-Event-ID of hint0
    const missed = notificationStreamManager.getMissedHints(siteA, memberId, hint0.id)
    expect(missed).toHaveLength(3)
    expect(missed.map((h) => h.id)).toEqual([hint1.id, hint2.id, hint3.id])
    expect(missed.map((h) => h.unreadCount)).toEqual([2, 3, 4])
  })

  it('Site A client never receives Site B hints', () => {
    const siteAMessages: string[] = []
    const siteBMessages: string[] = []

    const connSiteA = {
      id: 'conn-a',
      siteId: siteA,
      memberId,
      send: (chunk: string) => siteAMessages.push(chunk),
      close: vi.fn(),
    }

    const connSiteB = {
      id: 'conn-b',
      siteId: siteB,
      memberId,
      send: (chunk: string) => siteBMessages.push(chunk),
      close: vi.fn(),
    }

    expect(notificationStreamManager.acquireLease(memberId, connSiteA)).toBe(true)
    expect(notificationStreamManager.acquireLease(memberId, connSiteB)).toBe(true)

    // Emit event on Site A
    notificationStreamManager.emitHint(siteA, memberId, 5)

    expect(siteAMessages).toHaveLength(1)
    expect(siteAMessages[0]).toContain('"unread_count":5')
    // Site B client received nothing!
    expect(siteBMessages).toHaveLength(0)

    // Emit event on Site B
    notificationStreamManager.emitHint(siteB, memberId, 2)

    expect(siteBMessages).toHaveLength(1)
    expect(siteBMessages[0]).toContain('"unread_count":2')
    // Site A client did not receive Site B event
    expect(siteAMessages).toHaveLength(1)
  })

  it('sixth concurrent stream lease is rejected', () => {
    const connections = Array.from({ length: 5 }, (_, i) => ({
      id: `conn-${i + 1}`,
      siteId: siteA,
      memberId,
      send: vi.fn(),
      close: vi.fn(),
    }))

    // First 5 leases succeed
    for (const conn of connections) {
      expect(notificationStreamManager.acquireLease(memberId, conn)).toBe(true)
    }
    expect(notificationStreamManager.getActiveLeaseCount(memberId)).toBe(5)

    // 6th concurrent stream attempts to lease
    const sixthConn = {
      id: 'conn-6',
      siteId: siteA,
      memberId,
      send: vi.fn(),
      close: vi.fn(),
    }
    const acquired = notificationStreamManager.acquireLease(memberId, sixthConn)
    expect(acquired).toBe(false)
    expect(notificationStreamManager.getActiveLeaseCount(memberId)).toBe(5)

    // Release one lease
    notificationStreamManager.releaseLease(memberId, connections[0])
    expect(notificationStreamManager.getActiveLeaseCount(memberId)).toBe(4)

    // Now 6th can acquire
    expect(notificationStreamManager.acquireLease(memberId, sixthConn)).toBe(true)
    expect(notificationStreamManager.getActiveLeaseCount(memberId)).toBe(5)
  })

  it('corrupted counters are rebuilt exactly from inbox rows', async () => {
    // Simulated state:
    // Member 1 has 3 unread notifications in inbox_notifications, but counter had 99 (corrupted)
    // Member 2 has 0 unread notifications in inbox_notifications, but counter had 5 (corrupted)
    const member1 = '00000000-0000-7000-8000-000000000011'
    const member2 = '00000000-0000-7000-8000-000000000012'

    const counterRows = new Map<string, number>([
      [`${siteA}:${member1}`, 99],
      [`${siteA}:${member2}`, 5],
    ])

    const payload = createMockPayload(async (text, values = []) => {
      // 1. Group query on inbox_notifications
      if (
        text.includes('FROM inbox_notifications') &&
        text.includes('GROUP BY site_id, recipient_member_id')
      ) {
        return [
          { site_id: siteA, member_id: member1, unread_count: 3 },
          // Note: member2 has 0 unread rows, so is omitted from GROUP BY
        ]
      }
      // 2. Upsert positive unread counts
      if (text.includes('INSERT INTO member_notification_counters')) {
        const sid = values[0] as string
        const mid = values[1] as string
        const count = Number(values[2])
        counterRows.set(`${sid}:${mid}`, count)
        return []
      }
      // 3. Zero out counters for members with 0 unread
      if (
        text.includes('UPDATE member_notification_counters') &&
        text.includes('SET unread_count = 0')
      ) {
        counterRows.set(`${siteA}:${member2}`, 0)
        return [{ count: 1 }]
      }
      return []
    })

    const result = await rebuildNotificationCounters(payload, siteA)

    expect(result.rebuilt).toBe(1)
    expect(result.zeroed).toBe(1)

    // Verify exactly corrected counter values:
    expect(counterRows.get(`${siteA}:${member1}`)).toBe(3)
    expect(counterRows.get(`${siteA}:${member2}`)).toBe(0)
  })
})
