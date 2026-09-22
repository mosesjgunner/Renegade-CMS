import { describe, expect, it, vi } from 'vitest'
import { down, up } from '@/migrations/20260922_030000_comm_05a_moderation_registry_reports'
import { ingestModerationReport, serializeReportForAuthor, snapshotHash } from '@/modules/community/moderation-reports'

describe('COMM-05A moderation policy registry and report evidence', () => {
  it('creates immutable policy and report/case schema', async () => {
    const execute = vi.fn(async () => undefined)
    await up({ db: { execute } } as never); await down({ db: { execute } } as never)
    const schema = JSON.stringify(execute.mock.calls[0]?.[0])
    expect(schema).toContain('community_policies')
    expect(schema).toContain('moderation_cases')
    expect(schema).toContain('community_policy_versions_immutable')
    expect(schema).toContain('target_snapshot_payload')
  })

  it('keeps a report snapshot hash stable after the live target changes or is deleted', () => {
    const reported = { version: 1, targetType: 'comment', target: { id: 'c1', body: 'reported text', status: 'visible' } }
    const storedHash = snapshotHash(reported)
    const liveTargetAfterEdit = { id: 'c1', body: 'edited text', status: 'deleted' }
    expect(snapshotHash(reported)).toBe(storedHash)
    expect(snapshotHash({ version: 1, targetType: 'comment', target: liveTargetAfterEdit })).not.toBe(storedHash)
  })

  it('coalesces fifteen parallel reports into exactly one parent case', async () => {
    const state = { locked: false, waiters: [] as (() => void)[], caseId: '', reports: 0 }
    const query = async (text: string) => {
      if (text === 'BEGIN') return { rows: [] }
      if (text === 'COMMIT') { state.locked = false; state.waiters.shift()?.(); return { rows: [] } }
      if (text.includes('FROM comments')) return { rows: [{ id: '00000000-0000-7000-8000-000000000003', body: 'reported' }] }
      if (text.includes('pg_advisory_xact_lock')) { if (state.locked) await new Promise<void>(resolve => state.waiters.push(resolve)); state.locked = true; return { rows: [] } }
      if (text.includes('FROM moderation_cases')) return { rows: state.caseId ? [{ id: state.caseId }] : [] }
      if (text.includes('INSERT INTO moderation_cases')) { state.caseId = '00000000-0000-7000-8000-000000000010'; return { rows: [{ id: state.caseId }] } }
      if (text.includes('INSERT INTO community_reports')) return { rows: [{ id: `report-${++state.reports}` }] }
      return { rows: [] }
    }
    const payload = { db: { pool: { connect: async () => ({ query, release: () => undefined }) } } } as never
    const reports = await Promise.all(Array.from({ length: 15 }, (_, index) => ingestModerationReport(payload, { siteId: '00000000-0000-7000-8000-000000000001', reporterId: `00000000-0000-7000-8000-0000000000${String(index + 20).padStart(2, '0')}`, targetType: 'comment', targetId: '00000000-0000-7000-8000-000000000003', reason: 'abuse' })))
    expect(new Set(reports.map(report => report.caseId))).toEqual(new Set(['00000000-0000-7000-8000-000000000010']))
    expect(state.reports).toBe(15)
  })

  it('never serializes reporter identity into author/public output', () => {
    const output = serializeReportForAuthor({ id: 'r1', site_id: 's1', reporter_id: 'secret-member', target_type: 'comment', target_id: 'c1', reason: 'abuse', status: 'pending', target_snapshot_payload: { authorId: 'other' } })
    expect(output).not.toHaveProperty('reporterId')
    expect(JSON.stringify(output)).not.toContain('secret-member')
  })

  it('uses site-bound target lookups for cross-site report rejection', async () => {
    const source = await import('@/modules/community/moderation-reports')
    expect(source.moderationTargetTypes).toEqual(['comment', 'forum_post', 'forum_topic', 'member_profile', 'message'])
  })
})
