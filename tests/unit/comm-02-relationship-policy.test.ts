import { describe, expect, it, vi } from 'vitest'
import { evaluateCommunityPolicy } from '@/modules/community/policy'
import {
  dispatchCommunityNotification,
  enforceCommunityWriteRateLimit,
  getMemberNotifications,
  listConversationMessages,
} from '@/modules/community/service'
import { communityRealtime, emitCommunityEvent } from '@/modules/community/realtime'
import { resetApiRateLimitsForTest } from '@/modules/integrations/rate-limit'

const context = {
  siteId: 'site-1',
  actor: {
    kind: 'member' as const,
    memberId: 'reader',
    isStaff: false,
    isModerator: false,
    status: 'active' as const,
  },
}
const target = { siteId: 'site-1', authorMemberId: 'author', visibility: 'public' }

describe('COMM-02 block and mute output boundaries', () => {
  it('hides existing member content for a blocked or muting viewer, without hiding it anonymously', () => {
    expect(evaluateCommunityPolicy(context, target, 'read', { isBlocked: true })).toMatchObject({
      allowed: false,
      status: 404,
    })
    expect(
      evaluateCommunityPolicy(context, target, 'read', { isBlocked: false, isMuted: true }),
    ).toMatchObject({ allowed: false, status: 404 })
    expect(
      evaluateCommunityPolicy(
        { siteId: 'site-1', actor: { kind: 'anonymous', isStaff: false, isModerator: false } },
        target,
        'read',
      ),
    ).toMatchObject({ allowed: true })
  })

  it('suppresses new notifications and recipient realtime events after a mute', async () => {
    const create = vi.fn()
    const find = vi.fn(async ({ collection, where }: { collection: string; where: unknown }) => {
      if (collection !== 'relationships') return { docs: [] }
      const serialized = JSON.stringify(where)
      return { docs: serialized.includes('mute:site-1:reader:author') ? [{ id: 'mute-1' }] : [] }
    })
    const payload = { find, create } as never
    const listener = vi.fn()
    const unsubscribe = communityRealtime.subscribeMember('reader', listener)
    try {
      await dispatchCommunityNotification(payload, {
        siteId: 'site-1',
        recipientMemberId: 'reader',
        actorMemberId: 'author',
        type: 'comment.reply',
        object: { id: 'post-1' },
        payloadData: { snippet: 'hidden' },
      })
      await emitCommunityEvent(payload, {
        type: 'community.message_sent',
        siteId: 'site-1',
        recipientMemberId: 'reader',
        actorMemberId: 'author',
        payload: { messageId: 'message-1' },
      })
      expect(create).not.toHaveBeenCalled()
      expect(listener).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })

  it('filters preexisting notifications from muted actors at read time', async () => {
    const payload = {
      find: vi.fn(async ({ collection, where }: { collection: string; where: unknown }) => {
        if (collection === 'notifications')
          return {
            docs: [
              {
                id: 'n1',
                activityEvent: { id: 'a1', site: 'site-1', actor: { memberId: 'author' } },
              },
              {
                id: 'n2',
                activityEvent: { id: 'a2', site: 'site-2', actor: { memberId: 'other' } },
              },
            ],
          }
        if (collection === 'relationships')
          return {
            docs: JSON.stringify(where).includes('mute:site-1:reader:author')
              ? [{ id: 'mute-1' }]
              : [],
          }
        return { docs: [] }
      }),
    } as never
    expect(await getMemberNotifications(payload, 'reader', context)).toEqual([])
  })

  it('applies the three-member policy to cached conversation rows after mute and suspension', async () => {
    const members: Record<string, string> = { reader: 'active', author: 'active', third: 'active' }
    const payload = {
      db: {
        pool: {
          query: vi.fn(async (sql: string) => {
            if (sql.includes('FROM "community_conversations"'))
              return { rows: [{ id: 'c1', site_id: 'site-1', status: 'active' }] }
            if (sql.includes('community_conversation_participants'))
              return {
                rows: [{ member_id: 'reader' }, { member_id: 'author' }, { member_id: 'third' }],
              }
            if (sql.includes('FROM "community_messages"'))
              return {
                rows: [
                  {
                    id: 'm1',
                    conversation_id: 'c1',
                    sender_id: 'author',
                    body: 'muted',
                    attachments: [],
                    read_by: [],
                    created_at: 'now',
                    updated_at: 'now',
                  },
                  {
                    id: 'm2',
                    conversation_id: 'c1',
                    sender_id: 'third',
                    body: 'visible',
                    attachments: [],
                    read_by: [],
                    created_at: 'now',
                    updated_at: 'now',
                  },
                ],
              }
            return { rows: [] }
          }),
        },
      },
      find: vi.fn(async ({ where }: { where: unknown }) => ({
        docs: JSON.stringify(where).includes('mute:site-1:reader:author') ? [{ id: 'mute-1' }] : [],
      })),
      findByID: vi.fn(async ({ id }: { id: string }) => ({ id, status: members[id] })),
    } as never
    await expect(listConversationMessages(payload, 'c1', context)).resolves.toMatchObject([
      { id: 'm2', senderId: 'third', body: 'visible' },
    ])
    members.third = 'suspended'
    await expect(listConversationMessages(payload, 'c1', context)).resolves.toEqual([])
  })

  it('rate-limits member-originated writes and keeps moderation role denial server-side', () => {
    resetApiRateLimitsForTest()
    for (let index = 0; index < 30; index++) enforceCommunityWriteRateLimit(context, 'comment')
    expect(() => enforceCommunityWriteRateLimit(context, 'comment')).toThrow(/Rate limit exceeded/)
    expect(evaluateCommunityPolicy(context, { siteId: 'site-1' }, 'moderate')).toMatchObject({
      allowed: false,
      status: 403,
      reason: 'moderator_privilege_required',
    })
  })
})
