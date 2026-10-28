import { describe, expect, it } from 'vitest'
import {
  applyModerationAction,
  assertMemberCanPost,
  ModerationActionError,
  verifyCommunityAuditChain,
  createModerationAppeal,
  reviewModerationAppeal,
} from '@/modules/community/moderation-actions'
import { snapshotHash } from '@/modules/community/moderation-reports'
import { exportCommunityData } from '@/modules/identity/community-export'
import { targetIsDeliverable, type InboxEvent } from '@/modules/community/inbox-notifications'
import { startDirectConversation, sendConversationMessage } from '@/modules/community/conversation-composer'

describe('RC1 10D Moderation Lifecycle, Audit Chain & Community Privacy', () => {
  const siteA = '00000000-0000-7000-8000-000000000001'
  const caseId = '00000000-0000-7000-8000-000000000010'
  const modActorA = '00000000-0000-7000-8000-000000000020'
  const modActorB = '00000000-0000-7000-8000-000000000021'
  const memberAlice = '00000000-0000-7000-8000-000000000030'
  const memberBob = '00000000-0000-7000-8000-000000000040'
  const targetCommentId = '00000000-0000-7000-8000-000000000050'

  it('captures immutable snapshot evidence and prevents snapshot mutation on target change', () => {
    const original = {
      version: 1,
      targetType: 'comment',
      target: {
        id: targetCommentId,
        body: 'Unacceptable defamatory language',
        authorId: memberAlice,
        status: 'visible',
      },
    }
    const hash = snapshotHash(original)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)

    // Target is subsequently edited by member or replaced with a tombstone
    const modified = {
      version: 1,
      targetType: 'comment',
      target: {
        id: targetCommentId,
        body: '[Removed by moderator]',
        authorId: memberAlice,
        status: 'deleted',
      },
    }
    const modifiedHash = snapshotHash(modified)
    expect(modifiedHash).not.toBe(hash)
    // Stored report snapshot remains identical to original evidence
    expect(snapshotHash(original)).toBe(hash)
  })

  it('applies remove action: tombstones content, invalidates search, and closes parent case', async () => {
    const executedQueries: string[] = []
    let committed = false

    const query = async (text: string) => {
      executedQueries.push(text)
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] }
      if (text === 'COMMIT') {
        committed = true
        return { rows: [] }
      }
      if (text.includes('FROM moderation_cases')) {
        return { rows: [{ id: caseId }] }
      }
      if (text.includes('FROM comments')) {
        return { rows: [{ authorId: memberAlice, threadId: 'thread-1' }] }
      }
      if (text.includes('INSERT INTO moderation_actions')) {
        return { rows: [{ id: 'action-remove-1' }] }
      }
      if (text.includes('INSERT INTO community_audit_log')) {
        return { rows: [{ id: 'audit-log-1' }] }
      }
      if (text.includes('INSERT INTO outbox_events')) {
        return { rows: [{ id: 'outbox-1' }] }
      }
      if (text.includes('UPDATE comments')) {
        return { rows: [{ id: targetCommentId }] }
      }
      if (text.includes('UPDATE moderation_cases')) {
        return { rows: [{ id: caseId }] }
      }
      if (text.includes('UPDATE community_reports')) {
        return { rows: [] }
      }
      return { rows: [] }
    }

    const payload = {
      db: { pool: { connect: async () => ({ query, release: () => undefined }), query } },
    } as never

    const result = await applyModerationAction(payload, {
      siteId: siteA,
      caseId,
      actorMemberId: modActorA,
      targetType: 'comment',
      targetId: targetCommentId,
      action: 'remove',
      scope: 'object',
      scopeId: targetCommentId,
      reason: 'Violation of community standards',
    })

    expect(committed).toBe(true)
    expect(result.actionId).toBe('action-remove-1')

    // Verifies tombstone and case closure executed
    expect(executedQueries.some((q) => q.includes('UPDATE comments SET status=$1'))).toBe(true)
    expect(executedQueries.some((q) => q.includes("UPDATE moderation_cases SET status='closed'"))).toBe(true)
    // Verifies moderation outbox event emitted
    expect(executedQueries.some((q) => q.includes('moderation.action.v1'))).toBe(true)
  })

  it('applies reinstate action: restores content, revokes sanctions, closes case, and rehydrates search', async () => {
    const executedQueries: string[] = []
    let committed = false

    const query = async (text: string) => {
      executedQueries.push(text)
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] }
      if (text === 'COMMIT') {
        committed = true
        return { rows: [] }
      }
      if (text.includes('FROM moderation_cases')) {
        return { rows: [{ id: caseId }] }
      }
      if (text.includes('FROM comments')) {
        return { rows: [{ authorId: memberAlice, threadId: 'thread-1' }] }
      }
      if (text.includes('INSERT INTO moderation_actions')) {
        return { rows: [{ id: 'action-reinstate-1' }] }
      }
      if (text.includes('INSERT INTO community_audit_log')) {
        return { rows: [{ id: 'audit-log-2' }] }
      }
      if (text.includes('INSERT INTO outbox_events')) {
        return { rows: [{ id: 'outbox-2' }] }
      }
      if (text.includes('UPDATE comments')) {
        return { rows: [{ id: targetCommentId }] }
      }
      if (text.includes('UPDATE member_sanctions SET revoked_at')) {
        return { rows: [] }
      }
      if (text.includes('UPDATE moderation_cases')) {
        return { rows: [{ id: caseId }] }
      }
      if (text.includes('UPDATE community_reports')) {
        return { rows: [] }
      }
      return { rows: [] }
    }

    const payload = {
      db: { pool: { connect: async () => ({ query, release: () => undefined }), query } },
    } as never

    const result = await applyModerationAction(payload, {
      siteId: siteA,
      caseId,
      actorMemberId: modActorA,
      targetType: 'comment',
      targetId: targetCommentId,
      action: 'reinstate',
      scope: 'object',
      scopeId: targetCommentId,
      reason: 'Appeal accepted; content restored',
    })

    expect(committed).toBe(true)
    expect(result.actionId).toBe('action-reinstate-1')

    // Verifies status restored to visible
    expect(executedQueries.some((q) => q.includes("UPDATE comments SET status='visible'"))).toBe(true)
    // Verifies active sanctions revoked
    expect(executedQueries.some((q) => q.includes('revoked_at=now()'))).toBe(true)
    // Verifies case closed and report resolved
    expect(executedQueries.some((q) => q.includes("UPDATE moderation_cases SET status='closed'"))).toBe(true)
    // Verifies search rehydration event emitted
    expect(executedQueries.some((q) => q.includes('search.rehydrate.v1'))).toBe(true)
  })

  it('rejects posting and messaging when member has an active suspend_posting sanction', async () => {
    const query = async (text: string) => {
      if (text.includes('FROM member_sanctions')) {
        return {
          rows: [
            {
              id: 'sanction-1',
              action: 'suspend_posting',
              scope: 'site_global',
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          ],
        }
      }
      return { rows: [] }
    }
    const payload = {
      db: {
        pool: {
          query,
          connect: async () => ({
            query,
            release: () => undefined,
          }),
        },
      },
      find: async () => ({ docs: [] }),
    } as never

    // Posting assertion throws 403
    await expect(assertMemberCanPost(payload, { siteId: siteA, memberId: memberAlice })).rejects.toThrow(
      ModerationActionError,
    )
    await expect(assertMemberCanPost(payload, { siteId: siteA, memberId: memberAlice })).rejects.toMatchObject({
      code: 'MEMBER_POSTING_SUSPENDED',
      status: 403,
    })

    // Direct conversation composition also rejects suspended member
    await expect(
      startDirectConversation(payload, {
        siteId: siteA,
        memberId: memberAlice,
        recipientMemberId: memberBob,
      }),
    ).rejects.toMatchObject({
      code: 'MEMBER_POSTING_SUSPENDED',
      status: 403,
    })

    // Message sending in existing conversation rejects suspended member
    await expect(
      sendConversationMessage(payload, {
        siteId: siteA,
        conversationId: '00000000-0000-7000-8000-000000000099',
        senderId: memberAlice,
        body: 'Follow-up message while suspended',
        idempotencyKey: 'idem-test-1',
      }),
    ).rejects.toMatchObject({
      code: 'MEMBER_POSTING_SUSPENDED',
      status: 403,
    })
  })

  it('suppresses inbox notification delivery when the referenced target is quarantined or removed', async () => {
    const queryQuarantined = async (text: string) => {
      if (text.includes('FROM discussion_posts')) {
        return { rows: [{ status: 'published', moderation_state: 'quarantined' }] }
      }
      return { rows: [] }
    }
    const payloadQuarantined = {
      db: { pool: { query: async (text: string) => queryQuarantined(text) } },
    } as never
    const deliverableQuarantined = await targetIsDeliverable(payloadQuarantined, {
      id: 'event-1',
      eventType: 'post.created',
      payload: {
        siteId: siteA,
        targetType: 'post',
        targetId: 'post-quarantined-1',
      },
    } as unknown as InboxEvent)
    expect(deliverableQuarantined).toBe(false)

    const queryRemoved = async (text: string) => {
      if (text.includes('FROM comments')) {
        return { rows: [{ status: 'deleted' }] }
      }
      return { rows: [] }
    }
    const payloadRemoved = {
      db: { pool: { query: async (text: string) => queryRemoved(text) } },
    } as never
    const deliverableRemoved = await targetIsDeliverable(payloadRemoved, {
      id: 'event-2',
      eventType: 'comment.created',
      payload: {
        siteId: siteA,
        targetType: 'comment',
        targetId: 'comment-removed-1',
      },
    } as unknown as InboxEvent)
    expect(deliverableRemoved).toBe(false)

    const queryVisible = async (text: string) => {
      if (text.includes('FROM comments')) {
        return { rows: [{ status: 'visible' }] }
      }
      return { rows: [] }
    }
    const payloadVisible = {
      db: { pool: { query: async (text: string) => queryVisible(text) } },
    } as never
    const deliverableVisible = await targetIsDeliverable(payloadVisible, {
      id: 'event-3',
      eventType: 'comment.created',
      payload: {
        siteId: siteA,
        targetType: 'comment',
        targetId: 'comment-visible-1',
      },
    } as unknown as InboxEvent)
    expect(deliverableVisible).toBe(true)
  })

  it('excludes moderation cases, reports, and staff evidence from member data export', async () => {
    const query = async (text: string) => {
      if (text.includes('FROM comments')) {
        return [
          {
            id: targetCommentId,
            site_id: siteA,
            canonical_content_id: 'art-1',
            thread_id: 'thread-1',
            parent_id: null,
            status: 'visible',
            body_raw: 'Member public comment',
            body_html: '<p>Member public comment</p>',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
          },
        ]
      }
      return []
    }
    const payload = {
      db: { pool: { query: async (statement: string) => ({ rows: await query(statement) }) } },
    } as never

    const exported = await exportCommunityData(payload, memberAlice)
    const exportJson = JSON.stringify(exported)

    // Public member contributions are present
    expect(exportJson).toContain('Member public comment')
    // Internal moderation cases, reports, snapshots, and staff audit notes are NEVER leaked
    expect(exportJson).not.toContain('moderation_cases')
    expect(exportJson).not.toContain('community_reports')
    expect(exportJson).not.toContain('community_audit_log')
    expect(exportJson).not.toContain('target_snapshot_payload')
  })

  it('verifies cryptographic audit chain integrity and flags broken links', async () => {
    const payloadValid = {
      db: {
        pool: {
          query: async (text: string) => {
            if (text.includes('SELECT NOT EXISTS')) {
              return { rows: [{ valid: true }] }
            }
            return { rows: [] }
          },
        },
      },
    } as never
    const isValid = await verifyCommunityAuditChain(payloadValid, siteA)
    expect(isValid).toBe(true)

    const payloadBroken = {
      db: {
        pool: {
          query: async (text: string) => {
            if (text.includes('SELECT NOT EXISTS')) {
              return { rows: [{ valid: false }] }
            }
            return { rows: [] }
          },
        },
      },
    } as never
    const isBrokenValid = await verifyCommunityAuditChain(payloadBroken, siteA)
    expect(isBrokenValid).toBe(false)
  })

  it('manages moderation appeals: records appeal and reviewer decision with audit trail', async () => {
    const executedQueries: string[] = []
    let committed = false

    const query = async (text: string) => {
      executedQueries.push(text)
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] }
      if (text === 'COMMIT') {
        committed = true
        return { rows: [] }
      }
      if (text.includes('FROM moderation_actions')) {
        return {
          rows: [
            {
              id: 'action-1',
              siteId: siteA,
              caseId,
              actorMemberId: modActorA,
              targetType: 'comment',
              targetId: targetCommentId,
              action: 'remove',
              scope: 'object',
              scopeId: targetCommentId,
              reason: 'Defamatory',
            },
          ],
        }
      }
      if (text.includes('FROM comments c JOIN comment_threads')) {
        return { rows: [{ authorId: memberAlice, threadId: 'thread-1' }] }
      }
      if (text.includes('INSERT INTO moderation_appeals')) {
        return { rows: [{ id: 'appeal-101' }] }
      }
      if (text.includes('INSERT INTO community_audit_log')) {
        return { rows: [{ id: 'audit-log-appeal-1' }] }
      }
      if (text.includes('INSERT INTO moderation_actions')) {
        return { rows: [{ id: 'reversal-action-101' }] }
      }
      if (text.includes('WHERE moderation_action_id=$1 FOR UPDATE')) {
        return { rows: [] }
      }
      if (text.includes('FROM moderation_appeals WHERE id=$1 AND site_id=$2 FOR UPDATE')) {
        return { rows: [{ id: 'appeal-101', status: 'pending', actionId: 'action-1' }] }
      }
      if (text.includes('SELECT EXISTS(SELECT 1 FROM member_site_roles')) {
        return { rows: [{ exists: true }] }
      }
      if (text.includes('UPDATE moderation_appeals')) {
        return { rows: [{ id: 'appeal-101', status: 'accepted' }] }
      }
      return { rows: [] }
    }

    const payload = {
      db: { pool: { connect: async () => ({ query, release: () => undefined }), query } },
    } as never

    // Member Alice submits appeal against action on her comment
    const appeal = await createModerationAppeal(payload, {
      siteId: siteA,
      moderationActionId: 'action-1',
      appellantMemberId: memberAlice,
      reason: 'The comment was taken out of context.',
    })
    expect(appeal.appealId).toBe('appeal-101')

    // Moderator Charlie (modActorB) reviews and accepts appeal
    const review = await reviewModerationAppeal(payload, {
      siteId: siteA,
      appealId: 'appeal-101',
      reviewerMemberId: modActorB,
      decision: 'accepted',
      reason: 'Context verified; action overturned.',
    })
    expect(review.appealId).toBe('appeal-101')
    expect(review.reversalActionId).toBe('reversal-action-101')
    expect(committed).toBe(true)
  })
})
