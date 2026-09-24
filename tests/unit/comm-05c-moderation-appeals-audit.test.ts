import { describe, expect, it } from 'vitest'
import { down, up } from '@/migrations/20260922_050000_comm_05c_moderation_appeals_audit'
import {
  reviewModerationAppeal,
  verifyCommunityAuditChain,
} from '@/modules/community/moderation-actions'

const ids = {
  site: '00000000-0000-7000-8000-000000000001',
  moderator: '00000000-0000-7000-8000-000000000002',
  other: '00000000-0000-7000-8000-000000000003',
  appeal: '00000000-0000-7000-8000-000000000004',
  action: '00000000-0000-7000-8000-000000000005',
  target: '00000000-0000-7000-8000-000000000006',
}

describe('COMM-05C appeals, reversals, and append-only audit chain', () => {
  it('creates appeal/audit tables with a SHA-256 chain and immutable DB triggers', async () => {
    const calls: unknown[] = []
    const db = {
      execute: async (value: unknown) => {
        calls.push(value)
      },
    }
    await up({ db } as never)
    await down({ db } as never)
    const schema = JSON.stringify(calls[0])
    expect(schema).toContain('moderation_appeals')
    expect(schema).toContain('community_audit_log')
    expect(schema).toContain('digest(')
    expect(schema).toContain('BEFORE UPDATE OR DELETE')
    expect(schema).toContain('moderation_appeals_action_site_fk')
    expect(schema).toContain('decision_reason')
  })

  it('forbids the original moderator from reviewing while another qualified moderator exists', async () => {
    const calls: string[] = []
    const query = async (text: string) => {
      calls.push(text)
      if (['BEGIN', 'ROLLBACK'].includes(text)) return { rows: [] }
      if (text.includes('FROM moderation_appeals'))
        return { rows: [{ id: ids.appeal, actionId: ids.action, status: 'pending' }] }
      if (text.includes('FROM moderation_actions'))
        return {
          rows: [
            {
              id: ids.action,
              siteId: ids.site,
              caseId: 'case',
              actorMemberId: ids.moderator,
              targetType: 'comment',
              targetId: ids.target,
              action: 'quarantine',
              scope: 'object',
              scopeId: ids.target,
              expiresAt: null,
              reason: 'abuse',
              details: {},
            },
          ],
        }
      if (text.includes('member_site_roles')) return { rows: [{ exists: true }] }
      return { rows: [] }
    }
    const payload = {
      db: { pool: { connect: async () => ({ query, release: () => undefined }) } },
    } as never
    await expect(
      reviewModerationAppeal(payload, {
        siteId: ids.site,
        appealId: ids.appeal,
        reviewerMemberId: ids.moderator,
        decision: 'accepted',
        reason: 'reconsidered',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'ORIGINAL_MODERATOR_REVIEW_FORBIDDEN' })
    expect(calls).toContain('ROLLBACK')
  })

  it('accepts an appeal by appending a reversal, restoring quarantined visibility, and rehydrating search', async () => {
    const calls: string[] = []
    const query = async (text: string) => {
      calls.push(text)
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] }
      if (text.includes('FROM moderation_appeals'))
        return { rows: [{ id: ids.appeal, actionId: ids.action, status: 'pending' }] }
      if (text.includes('FROM moderation_actions'))
        return {
          rows: [
            {
              id: ids.action,
              siteId: ids.site,
              caseId: 'case',
              actorMemberId: ids.moderator,
              targetType: 'comment',
              targetId: ids.target,
              action: 'quarantine',
              scope: 'object',
              scopeId: ids.target,
              expiresAt: null,
              reason: 'abuse',
              details: {},
            },
          ],
        }
      if (text.includes('member_site_roles')) return { rows: [{ exists: false }] }
      if (text.includes('INSERT INTO moderation_actions')) return { rows: [{ id: 'reversal-1' }] }
      return { rows: [] }
    }
    const payload = {
      db: { pool: { connect: async () => ({ query, release: () => undefined }) } },
    } as never
    await expect(
      reviewModerationAppeal(payload, {
        siteId: ids.site,
        appealId: ids.appeal,
        reviewerMemberId: ids.other,
        decision: 'accepted',
        reason: 'reversed',
      }),
    ).resolves.toEqual({ appealId: ids.appeal, reversalActionId: 'reversal-1' })
    expect(calls.some((call) => call.includes("UPDATE comments SET status='visible'"))).toBe(true)
    expect(calls.some((call) => call.includes("'reversal'"))).toBe(true)
    expect(calls.some((call) => call.includes('search.rehydrate.v1'))).toBe(true)
    expect(calls.some((call) => call.includes('UPDATE moderation_actions'))).toBe(false)
  })

  it('verifies the persisted chain in PostgreSQL rather than trusting caller supplied hashes', async () => {
    let sql = ''
    const payload = {
      db: {
        pool: {
          query: async (text: string) => {
            sql = text
            return { rows: [{ valid: true }] }
          },
        },
      },
    } as never
    await expect(verifyCommunityAuditChain(payload, ids.site)).resolves.toBe(true)
    expect(sql).toContain("digest(coalesce(previous_hash, '')")
  })
})
