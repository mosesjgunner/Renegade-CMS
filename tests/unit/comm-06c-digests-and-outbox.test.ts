import { describe, expect, it, vi } from 'vitest'
import {
  compileNotificationDigest,
  formatNotificationSubject,
  getMemberNotificationPreference,
  isMandatoryNotice,
  isPrivateMessageKind,
  routeNotificationToOutbox,
  setMemberNotificationPreference,
  writeAudienceDeliveryOutbox,
} from '@/modules/community/notification-delivery'

const siteId = '00000000-0000-7000-8000-000000000001'
const recipientId = '00000000-0000-7000-8000-000000000002'

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

describe('COMM-06C notification preferences, digests & audience outbox', () => {
  it('daily digest preference creates zero immediate emails for 10 comments, then one digest at scheduled run', async () => {
    const outboxRows: unknown[] = []
    const inboxRows = Array.from({ length: 10 }, (_, i) => ({
      id: `notif-${i + 1}`,
      kind: 'comment.created.v1',
      target_type: 'comment',
      target_id: `comment-${i + 1}`,
      created_at: new Date(Date.now() - (10 - i) * 60000).toISOString(),
    }))

    const payload = createMockPayload(async (text, values = []) => {
      // Member preference query: daily_digest for email
      if (text.includes('FROM notification_preferences')) {
        return [{ frequency: 'daily_digest' }]
      }
      // Outbox insertion query
      if (text.includes('INSERT INTO audience_delivery_outbox')) {
        const id = `outbox-${outboxRows.length + 1}`
        outboxRows.push({ id, values })
        return [{ id }]
      }
      // Inbox notifications in digest window
      if (text.includes('FROM inbox_notifications')) {
        return inboxRows
      }
      return []
    })

    // Simulate 10 incoming comments routed for this recipient
    for (let i = 1; i <= 10; i++) {
      const result = await routeNotificationToOutbox(payload, {
        siteId,
        recipientId,
        kind: 'comment.created.v1',
        targetType: 'comment',
        targetId: `comment-${i}`,
      })
      // No immediate emails created because preference is daily_digest
      expect(result.enqueued).toHaveLength(0)
    }

    expect(outboxRows).toHaveLength(0)

    // Now run scheduled digest compilation for the window
    const digest = await compileNotificationDigest(payload, {
      siteId,
      recipientId,
      windowRange: {
        startAt: new Date(Date.now() - 86400000).toISOString(),
        endAt: new Date().toISOString(),
      },
      channel: 'email',
    })

    expect(digest).not.toBeNull()
    expect(digest?.channel).toBe('email')
    expect(digest?.envelope.kind).toBe('community_digest')
    expect(digest?.envelope.metadata?.totalItems).toBe(10)
    // Exactly 1 digest envelope written to outbox
    expect(outboxRows).toHaveLength(1)
  })

  it('marketing unsubscribe does not block transactional community notifications', async () => {
    // Marketing unsubscribe in Audience sets subscriber/suppression record.
    // Transactional community notifications intentionally query only notification_preferences
    // and deliver to the audience outbox regardless of marketing status.
    const outboxRows: unknown[] = []

    const payload = createMockPayload(async (text, values = []) => {
      if (text.includes('FROM notification_preferences')) {
        const channel = values[2]
        return [{ frequency: channel === 'email' ? 'immediate' : 'off' }]
      }
      if (text.includes('INSERT INTO audience_delivery_outbox')) {
        const id = `outbox-tx-${outboxRows.length + 1}`
        outboxRows.push({ id, values })
        return [{ id }]
      }
      return []
    })

    const result = await routeNotificationToOutbox(payload, {
      siteId,
      recipientId,
      kind: 'comment.reply.v1',
      targetType: 'comment',
      targetId: 'comment-123',
    })

    expect(result.enqueued.length).toBeGreaterThan(0)
    expect(outboxRows).toHaveLength(1)
  })

  it('private message email subject and preheader are strictly generic', () => {
    // Subjects must never leak message content or sender message snippets
    const subject = formatNotificationSubject('conversation.message_created', true, 'Renegade CMS')
    expect(subject).toBe('New private message on Renegade CMS')
    expect(subject).not.toContain('secret')
    expect(isPrivateMessageKind('conversation.message_created', true)).toBe(true)

    // Normal comment notification has distinct subject
    const commentSubject = formatNotificationSubject('comment.created.v1', false, 'Renegade CMS')
    expect(commentSubject).toBe('New reply to your comment on Renegade CMS')
  })

  it('mandatory moderation notices still route transactionally even if member turned notifications off', async () => {
    const outboxRows: unknown[] = []

    const payload = createMockPayload(async (text, values = []) => {
      // Member turned all notifications off!
      if (text.includes('FROM notification_preferences')) {
        return [{ frequency: 'off' }]
      }
      if (text.includes('INSERT INTO audience_delivery_outbox')) {
        const id = 'outbox-mod-1'
        outboxRows.push({ id, values })
        return [{ id }]
      }
      return []
    })

    expect(isMandatoryNotice('moderation_warning')).toBe(true)
    expect(isMandatoryNotice('sanction_issued')).toBe(true)

    const result = await routeNotificationToOutbox(payload, {
      siteId,
      recipientId,
      kind: 'moderation_warning',
      targetType: 'moderation_case',
      targetId: 'case-999',
    })

    // Mandatory notice bypassed the 'off' preference and dispatched immediate transactional email
    expect(result.enqueued).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'email',
          frequency: 'immediate',
        }),
      ]),
    )
    expect(outboxRows).toHaveLength(2) // email + sms both route immediately for mandatory safety notice
  })
})
