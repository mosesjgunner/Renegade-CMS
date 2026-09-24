import { describe, expect, it } from 'vitest'
import {
  batchDispositionModerationCases,
  evaluateAbuseHeuristics,
  listModerationCases,
  simHash,
  simHashDistance,
  triageSubmission,
} from '@/modules/community/abuse-triage'
import { up } from '@/migrations/20260922_060000_comm_05d_abuse_triage_console'

describe('COMM-05D abuse triage', () => {
  it('moves the tenth near-identical submission in ten seconds to human review', () => {
    const text = 'Visit https://example.invalid for a spectacular offer now'
    const fingerprint = simHash(text)
    const result = evaluateAbuseHeuristics({
      text,
      accountAgeHours: 1,
      verified: false,
      postsInTenSeconds: 10,
      nearestSimHash: fingerprint,
    })
    expect(result.pendingReview).toBe(true)
    expect(result.priority).toBe('high')
    expect(result.categories).toEqual(
      expect.arrayContaining(['posting_velocity', 'near_duplicate']),
    )
  })
  it('uses a stable, bounded near-duplicate fingerprint', () => {
    expect(
      simHashDistance(simHash('Hello community!'), simHash('hello, community')),
    ).toBeLessThanOrEqual(3)
  })
  it('creates durable fingerprint and high-priority case metadata', async () => {
    const calls: unknown[] = []
    await up({
      db: {
        execute: async (sql: unknown) => {
          calls.push(sql)
        },
      },
    } as never)
    const schema = JSON.stringify(calls[0])
    expect(schema).toContain('moderation_submission_fingerprints')
    expect(schema).toContain('rule_categories')
    expect(schema).toContain('sla_deadline')
  })
  it('routes the tenth same-text submission across spaces to pending review and a high-priority case', async () => {
    const calls: string[] = []
    const text = 'same message delivered through every space'
    const payload = {
      db: {
        pool: {
          query: async (sql: string) => {
            calls.push(sql)
            if (sql.includes('FROM members')) return { rows: [{ age: 1, verified: false }] }
            if (sql.includes('count(*)')) return { rows: [{ count: 9 }] }
            if (sql.includes('SELECT fingerprint'))
              return { rows: [{ fingerprint: simHash(text) }] }
            if (sql.includes('INSERT INTO moderation_cases')) return { rows: [{ id: 'case-1' }] }
            return { rows: [] }
          },
        },
      },
    }
    const decision = await triageSubmission(payload as never, {
      siteId: 'site',
      targetType: 'comment',
      targetId: 'comment-10',
      authorId: 'member',
      text,
    })
    expect(decision).toMatchObject({ pendingReview: true, priority: 'high', caseId: 'case-1' })
    expect(calls.some((sql) => sql.includes("status='pending_review'"))).toBe(true)
    expect(calls.some((sql) => sql.includes('INSERT INTO moderation_cases'))).toBe(true)
  })
  it('does not contain any autonomous ban disposition in the heuristic decision', () => {
    const result = evaluateAbuseHeuristics({
      text: 'https://example.invalid',
      accountAgeHours: 0,
      verified: false,
      postsInTenSeconds: 10,
    })
    expect(JSON.stringify(result)).not.toContain('ban')
    expect(result.pendingReview).toBe(true)
  })
  it('marks an unverified image attachment preview for blur in the console response', async () => {
    const payload = {
      db: {
        pool: {
          connect: async () => ({
            query: async () => ({
              rows: [
                { id: 'case-1', rule_categories: [], triage_payload: { sensitiveMedia: true } },
              ],
            }),
            release: () => undefined,
          }),
        },
      },
    }
    const cases = await listModerationCases(payload as never, { siteId: 'site' })
    expect(cases[0]?.preview).toEqual({ blurSensitiveMedia: true, blurSensitiveText: false })
  })
  it('returns itemized partial success for mixed valid and invalid batch IDs', async () => {
    const calls: string[] = []
    const payload = {
      db: {
        pool: {
          connect: async () => ({
            query: async (text: string, values?: unknown[]) => {
              calls.push(text)
              if (text.includes('SELECT id FROM moderation_cases'))
                return { rows: values?.[0] === 'valid' ? [{ id: 'valid' }] : [] }
              return { rows: [] }
            },
            release: () => undefined,
          }),
        },
      },
    }
    const items = await batchDispositionModerationCases(payload as never, {
      siteId: 'site',
      actorMemberId: 'moderator',
      caseIds: ['valid', 'missing'],
      disposition: 'close',
    })
    expect(items).toEqual([
      { caseId: 'valid', success: true },
      { caseId: 'missing', success: false, code: 'CASE_NOT_FOUND' },
    ])
    expect(calls.some((call) => call.includes('moderation.case.disposition.v1'))).toBe(true)
  })
})
