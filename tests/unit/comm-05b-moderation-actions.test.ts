import { describe, expect, it } from 'vitest'
import { down, up } from '@/migrations/20260922_040000_comm_05b_moderation_actions_sanctions'
import { applyModerationAction, assertMemberCanPost, ModerationActionError } from '@/modules/community/moderation-actions'

const ids = { site: '00000000-0000-7000-8000-000000000001', case: '00000000-0000-7000-8000-000000000002', actor: '00000000-0000-7000-8000-000000000003', comment: '00000000-0000-7000-8000-000000000004', author: '00000000-0000-7000-8000-000000000005' }

describe('COMM-05B moderation actions, sanctions, quarantine, and outbox', () => {
  it('migrates case action scope, sanctions, and quarantine state reversibly', async () => {
    const calls: unknown[] = []; const db = { execute: async (value: unknown) => { calls.push(value) } }
    await up({ db } as never); await down({ db } as never)
    expect(JSON.stringify(calls[0])).toContain('member_sanctions')
    expect(JSON.stringify(calls[0])).toContain('is_quarantined')
  })

  it('quarantines a comment, audits the action and commits moderation.action.v1 in the same transaction', async () => {
    const calls: string[] = []; let committed = false
    const query = async (text: string) => {
      calls.push(text)
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') { if (text === 'COMMIT') committed = true; return { rows: [] } }
      if (text.includes('FROM moderation_cases')) return { rows: [{ id: ids.case }] }
      if (text.includes('FROM comments')) return { rows: [{ authorId: ids.author, threadId: 'thread-1' }] }
      if (text.includes('INSERT INTO moderation_actions')) return { rows: [{ id: 'action-1' }] }
      return { rows: [] }
    }
    const payload = { db: { pool: { connect: async () => ({ query, release: () => undefined }) } } } as never
    await applyModerationAction(payload, { siteId: ids.site, caseId: ids.case, actorMemberId: ids.actor, targetType: 'comment', targetId: ids.comment, action: 'quarantine', scope: 'object', scopeId: ids.comment, reason: 'abuse' })
    expect(committed).toBe(true)
    expect(calls.some(call => call.includes("UPDATE comments SET status"))).toBe(true)
    expect(calls.some(call => call.includes('INSERT INTO moderation_actions'))).toBe(true)
    expect(calls.some(call => call.includes("moderation.action.v1"))).toBe(true)
  })

  it('rolls everything back when outbox persistence fails', async () => {
    const calls: string[] = []
    const query = async (text: string) => {
      calls.push(text)
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [] }
      if (text.includes('FROM moderation_cases')) return { rows: [{ id: ids.case }] }
      if (text.includes('FROM comments')) return { rows: [{ authorId: ids.author, threadId: 'thread-1' }] }
      if (text.includes('INSERT INTO moderation_actions')) return { rows: [{ id: 'action-1' }] }
      if (text.includes('INSERT INTO outbox_events')) throw new Error('OUTBOX_FAILED')
      return { rows: [] }
    }
    const payload = { db: { pool: { connect: async () => ({ query, release: () => undefined }) } } } as never
    await expect(applyModerationAction(payload, { siteId: ids.site, caseId: ids.case, actorMemberId: ids.actor, targetType: 'comment', targetId: ids.comment, action: 'warn', scope: 'object', scopeId: ids.comment, reason: 'abuse' })).rejects.toThrow('OUTBOX_FAILED')
    expect(calls).toContain('ROLLBACK')
  })

  it('rejects active posting sanctions and permits an expired five-second suspension', async () => {
    const activePayload = { db: { pool: { query: async () => ({ rows: [{ id: 'sanction-1' }] }) } } } as never
    await expect(assertMemberCanPost(activePayload, { siteId: ids.site, memberId: ids.author })).rejects.toMatchObject({ status: 403, code: 'MEMBER_POSTING_SUSPENDED' } satisfies Partial<ModerationActionError>)
    const expiredPayload = { db: { pool: { query: async () => ({ rows: [] }) } } } as never
    await expect(assertMemberCanPost(expiredPayload, { siteId: ids.site, memberId: ids.author })).resolves.toBeUndefined()
  })
})
