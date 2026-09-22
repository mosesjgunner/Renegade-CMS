import { describe, expect, it, vi } from 'vitest'
import {
  decodeInboxCursor,
  encodeInboxCursor,
  listInbox,
  markInboxRead,
  noSnippet,
  projectInboxEvent,
  resolveInboxCandidates,
} from '@/modules/community/inbox-notifications'
import * as communityService from '@/modules/community/service'
import * as forumSpaceAccess from '@/modules/community/forum-space-access'

describe('COMM-06B inbox keyset cursor', () => {
  it('round-trips a stable created-at/id boundary', () => {
    const cursor = encodeInboxCursor({ id: '018f0000-0000-8000-8000-000000000001', createdAt: '2026-09-22T12:00:00.000Z' })
    expect(decodeInboxCursor(cursor)).toEqual({ id: '018f0000-0000-8000-8000-000000000001', createdAt: '2026-09-22T12:00:00.000Z' })
  })

  it('rejects malformed cursors instead of falling back to offset pagination', () => {
    expect(decodeInboxCursor('not-a-cursor')).toBeNull()
    expect(decodeInboxCursor(Buffer.from('{}').toString('base64url'))).toBeNull()
    expect(decodeInboxCursor(Buffer.from(JSON.stringify({ id: 123 })).toString('base64url'))).toBeNull()
  })
})

describe('COMM-06B snapshot sanitization', () => {
  it('strips private or quarantined content text snippets from notifications', () => {
    const dirty = {
      kind: 'comment.created.v1',
      actor_name: 'Alice',
      body: 'Secret text content',
      body_html: '<p>Secret</p>',
      body_raw: 'Raw confidential',
      snippet: 'Preview snippet',
      preview: 'Short preview',
      message: 'Sensitive message',
      content: 'Inner content',
    }
    const clean = noSnippet(dirty)
    expect(clean).toEqual({
      kind: 'comment.created.v1',
      actor_name: 'Alice',
    })
    expect(clean).not.toHaveProperty('body')
    expect(clean).not.toHaveProperty('body_html')
    expect(clean).not.toHaveProperty('snippet')
    expect(clean).not.toHaveProperty('preview')
    expect(clean).not.toHaveProperty('message')
  })
})

describe('COMM-06B recipient policy & inbox projection', () => {
  const siteId = '00000000-0000-7000-8000-000000000001'
  const actorId = '00000000-0000-7000-8000-000000000002'
  const recipientId = '00000000-0000-7000-8000-000000000003'
  const spaceId = '00000000-0000-7000-8000-000000000004'
  const commentId = '00000000-0000-7000-8000-000000000005'

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

  it('blocked actor generates zero inbox notifications', async () => {
    vi.spyOn(communityService, 'checkBlockBetween').mockResolvedValueOnce({
      isBlocked: true,
    })
    vi.spyOn(communityService, 'checkMuteFrom').mockResolvedValueOnce(false)

    const payload = createMockPayload(async (text) => {
      if (text.includes('SELECT status, deleted_at FROM comments')) {
        return [{ status: 'visible', deleted_at: null }]
      }
      return []
    })

    const delivered = await projectInboxEvent(payload, {
      id: 'event-1',
      eventType: 'comment.created.v1',
      payload: {
        site_id: siteId,
        author_id: actorId,
        comment_id: commentId,
        recipient_member_ids: [recipientId],
      },
    })

    expect(delivered).toBe(0)
  })

  it('revoked private-space access halts notification creation', async () => {
    vi.spyOn(communityService, 'checkBlockBetween').mockResolvedValueOnce({ isBlocked: false })
    vi.spyOn(communityService, 'checkMuteFrom').mockResolvedValueOnce(false)
    vi.spyOn(forumSpaceAccess, 'resolveForumSpaceAccess').mockResolvedValueOnce({
      canView: false,
      canPost: false,
      canModerate: false,
      isMember: false,
    } as never)

    const payload = createMockPayload(async (text) => {
      if (text.includes('SELECT status, deleted_at FROM comments')) {
        return [{ status: 'visible', deleted_at: null }]
      }
      return []
    })

    const delivered = await projectInboxEvent(payload, {
      id: 'event-2',
      eventType: 'comment.created.v1',
      payload: {
        site_id: siteId,
        author_id: actorId,
        comment_id: commentId,
        space_id: spaceId,
        recipient_member_ids: [recipientId],
      },
    })

    expect(delivered).toBe(0)
  })

  it('quarantined target drops pending delivery', async () => {
    const payload = createMockPayload(async (text) => {
      if (text.includes('SELECT status, deleted_at FROM comments')) {
        return [{ status: 'quarantined', deleted_at: null }]
      }
      return []
    })

    const delivered = await projectInboxEvent(payload, {
      id: 'event-3',
      eventType: 'comment.created.v1',
      payload: {
        site_id: siteId,
        author_id: actorId,
        comment_id: commentId,
        recipient_member_ids: [recipientId],
      },
    })

    expect(delivered).toBe(0)
  })

  it('5,000-notification inbox paginates efficiently using keyset pagination', async () => {
    const totalItems = 5000
    const pageSize = 50
    // Generate simulated 5000 notifications ordered desc by createdAt, id
    const allNotifications = Array.from({ length: totalItems }, (_, i) => {
      const ms = Date.now() - i * 1000
      return {
        id: `018f0000-0000-7000-8000-${String(i).padStart(12, '0')}`,
        kind: 'comment.created.v1',
        targetType: 'comment',
        targetId: 'target-1',
        snapshot: { text: 'clean' },
        readAt: null,
        createdAt: new Date(ms).toISOString(),
      }
    })

    const payload = createMockPayload(async (text, values = []) => {
      if (text.includes('FROM inbox_notifications')) {
        const cursorCreatedAt = values[2] as string | null
        const cursorId = values[3] as string | null
        const limit = Number(values[4])

        let filtered = allNotifications
        if (cursorCreatedAt && cursorId) {
          filtered = allNotifications.filter((n) => {
            if (n.createdAt < cursorCreatedAt) return true
            if (n.createdAt === cursorCreatedAt && n.id < cursorId) return true
            return false
          })
        }
        return filtered.slice(0, limit)
      }
      if (text.includes('FROM member_notification_counters')) {
        return [{ unread_count: totalItems }]
      }
      return []
    })

    // First page
    const page1 = await listInbox(payload, {
      siteId,
      memberId: recipientId,
      limit: pageSize,
    })
    expect(page1.notifications).toHaveLength(pageSize)
    expect(page1.nextCursor).not.toBeNull()
    expect(page1.unreadCount).toBe(5000)

    // Second page using nextCursor
    const page2 = await listInbox(payload, {
      siteId,
      memberId: recipientId,
      cursor: page1.nextCursor,
      limit: pageSize,
    })
    expect(page2.notifications).toHaveLength(pageSize)
    expect(page2.notifications[0].id).toBe(allNotifications[pageSize].id)
    expect(page2.nextCursor).not.toBeNull()
  })

  it('mark read and mark all read update counters correctly and atomically', async () => {
    let unreadCount = 10
    const unreadNotifications = new Set(['notif-1', 'notif-2', 'notif-3'])

    const payload = createMockPayload(async (text, values = []) => {
      if (text.includes('WITH changed AS (UPDATE inbox_notifications')) {
        const notifId = values[2] as string | undefined
        if (notifId) {
          if (unreadNotifications.has(notifId)) {
            unreadNotifications.delete(notifId)
            unreadCount = Math.max(0, unreadCount - 1)
          }
        } else {
          const count = unreadNotifications.size
          unreadNotifications.clear()
          unreadCount = Math.max(0, unreadCount - count)
        }
        return [{ unread_count: unreadCount }]
      }
      return []
    })

    // Mark single notification as read
    const singleResult = await markInboxRead(payload, {
      siteId,
      memberId: recipientId,
      notificationId: 'notif-1',
    })
    expect(singleResult.unreadCount).toBe(9)

    // Mark all as read
    const allResult = await markInboxRead(payload, {
      siteId,
      memberId: recipientId,
    })
    expect(allResult.unreadCount).toBe(7)
  })
})
