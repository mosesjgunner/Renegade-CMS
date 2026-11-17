import { describe, expect, it, vi } from 'vitest'
import {
  ignoreDiscoveryIssue,
  persistRenderedAuditLifecycle,
  resolveDiscoveryIssue,
} from '../../src/modules/public/discovery-lifecycle'
import type { RenderedAuditIssue } from '../../src/modules/public/discovery-audit'
import type { Payload } from 'payload'

describe('DISC-05 Persisted Lifecycle Fields & Quality Center Store', () => {
  it('groups repeated rule findings without violating uniqueness or losing evidence', async () => {
    const created: Record<string, unknown>[] = []
    const payload = {
      create: vi.fn(async ({ collection, data }) => {
        if (collection === 'quality-scans') return { id: 'scan', ...data }
        if (created.some((row) => row.dedupeKey === data.dedupeKey))
          throw new Error('Duplicate lifecycle key')
        created.push(data)
        return { id: 'issue', ...data }
      }),
      find: vi.fn(async () => ({ docs: [] })),
    } as unknown as Payload
    const issue: RenderedAuditIssue = {
      url: 'https://example.test/article',
      ruleId: 'DISC-05-LINK',
      ruleVersion: '1.0.0',
      severity: 'warning',
      evidence: 'First broken link',
      repairTarget: 'body',
    }
    const result = await persistRenderedAuditLifecycle(payload, 'site', [
      issue,
      { ...issue, evidence: 'Second broken link', severity: 'publication_blocking' },
    ])
    expect(result).toMatchObject({ created: 1, active: 1, totalIssues: 2 })
    expect(created[0]).toMatchObject({
      message: 'First broken link\nSecond broken link',
      severity: 'publication_blocking',
    })
  })
  it('persists findings into quality scans and issues with firstSeenAt and lastSeenAt tracking', async () => {
    const existingIssues: Record<string, unknown>[] = []
    const createdIssues: Record<string, unknown>[] = []

    const mockPayload = {
      create: vi.fn(async ({ collection, data }) => {
        if (collection === 'quality-scans') return { id: 'scan-123', ...data }
        if (collection === 'quality-issues') {
          const item = { id: `issue-${createdIssues.length + 1}`, ...data }
          createdIssues.push(item)
          return item
        }
        return data
      }),
      find: vi.fn(async () => ({ docs: existingIssues })),
      update: vi.fn(async ({ id, data }) => ({ id, ...data })),
    } as unknown as Payload

    const issues: RenderedAuditIssue[] = [
      {
        url: 'https://example.test/a',
        ruleId: 'DISC-05-TITLE-MISSING',
        ruleVersion: '1.0.0',
        severity: 'publication_blocking',
        evidence: 'No title element.',
        repairTarget: 'seoTitle',
      },
    ]

    const result = await persistRenderedAuditLifecycle(mockPayload, 'site-1', issues)
    expect(result.created).toBe(1)
    expect(result.scanId).toBe('scan-123')
    expect(createdIssues[0]).toMatchObject({
      dedupeKey: 'disc-05:DISC-05-TITLE-MISSING:https://example.test/a',
      status: 'open',
      targetType: 'rendered_audit',
    })
    expect(createdIssues[0].firstSeenAt).toBeTruthy()
    expect(createdIssues[0].lastSeenAt).toBeTruthy()
  })

  describe('DEBT-14 resolution invariant', () => {
    const openIssue = (url: string) => ({
      id: `issue-${url}`,
      dedupeKey: `disc-05:DISC-05-TITLE-MISSING:${url}`,
      targetId: url,
      targetType: 'rendered_audit',
      status: 'open',
    })
    const makePayload = (existing: Array<Record<string, unknown>>) => {
      const updates: Array<{ id: unknown; data: Record<string, unknown> }> = []
      const scanCreates: Array<Record<string, unknown>> = []
      const payload = {
        create: vi.fn(async ({ collection, data }: any) => {
          if (collection === 'quality-scans') {
            scanCreates.push(data)
            return { id: 'scan-x', ...data }
          }
          return { id: 'created-issue', ...data }
        }),
        find: vi.fn(async ({ where }: any) => {
          if (where?.dedupeKey?.equals)
            return { docs: existing.filter((row) => row.dedupeKey === where.dedupeKey.equals) }
          return { docs: existing }
        }),
        update: vi.fn(async ({ id, data }: any) => {
          updates.push({ id, data })
          return { id, ...data }
        }),
      } as unknown as Payload
      return { payload, updates, scanCreates }
    }
    const resolvedUpdates = (updates: Array<{ data: Record<string, unknown> }>) =>
      updates.filter((entry) => entry.data.status === 'resolved')

    it('an empty-scope run persists an incomplete scan and cannot erase findings', async () => {
      const { payload, updates, scanCreates } = makePayload([openIssue('https://example.test/a')])
      const result = await persistRenderedAuditLifecycle(payload, 'site-1', [], {
        state: 'empty',
        eligible: 2,
        examined: 0,
        failed: 2,
        skipped: 0,
        examinedUrls: [],
        complete: false,
      })
      expect(scanCreates[0]).toMatchObject({ status: 'incomplete' })
      expect(resolvedUpdates(updates)).toEqual([])
      expect(result.resolved).toBe(0)
      expect(result.unverified).toBe(1)
      expect(result.scope).toMatchObject({ state: 'empty', complete: false })
    })

    it('a partial-scope run resolves only re-examined URLs and retains the rest', async () => {
      const fixed = 'https://example.test/fixed'
      const stale = 'https://example.test/stale'
      const { payload, updates, scanCreates } = makePayload([openIssue(fixed), openIssue(stale)])
      const result = await persistRenderedAuditLifecycle(payload, 'site-1', [], {
        state: 'partial',
        eligible: 2,
        examined: 1,
        failed: 0,
        skipped: 1,
        examinedUrls: [fixed],
        complete: false,
      })
      expect(scanCreates[0]).toMatchObject({ status: 'incomplete' })
      expect(resolvedUpdates(updates)).toEqual([expect.objectContaining({ id: `issue-${fixed}` })])
      expect(result.resolved).toBe(1)
      expect(result.unverified).toBe(1)
    })

    it('a clean complete run completes the scan and resolves verified-fixed issues', async () => {
      const fixed = 'https://example.test/fixed'
      const { payload, updates, scanCreates } = makePayload([openIssue(fixed)])
      const result = await persistRenderedAuditLifecycle(payload, 'site-1', [], {
        state: 'complete',
        eligible: 1,
        examined: 1,
        failed: 0,
        skipped: 0,
        examinedUrls: [fixed],
        complete: true,
      })
      expect(scanCreates[0]).toMatchObject({
        status: 'completed',
        summary: expect.objectContaining({
          scope: expect.objectContaining({ state: 'complete', eligible: 1, examined: 1 }),
        }),
      })
      expect(resolvedUpdates(updates)).toHaveLength(1)
      expect(result.resolved).toBe(1)
      expect(result.unverified).toBe(0)
    })

    it('without scope evidence, resolution never happens implicitly', async () => {
      const { payload, updates } = makePayload([openIssue('https://example.test/a')])
      const result = await persistRenderedAuditLifecycle(payload, 'site-1', [])
      expect(resolvedUpdates(updates)).toEqual([])
      expect(result.resolved).toBe(0)
      expect(result.unverified).toBe(1)
      expect(result.scope).toBeNull()
    })

    it('a still-detected issue on an examined URL is refreshed, never resolved', async () => {
      const url = 'https://example.test/a'
      const { payload, updates } = makePayload([openIssue(url)])
      const stillBroken: RenderedAuditIssue = {
        url,
        ruleId: 'DISC-05-TITLE-MISSING',
        ruleVersion: '1.0.0',
        severity: 'publication_blocking',
        evidence: 'Rendered HTML has no title element.',
        repairTarget: 'seoTitle',
      }
      const result = await persistRenderedAuditLifecycle(payload, 'site-1', [stillBroken], {
        state: 'complete',
        eligible: 1,
        examined: 1,
        examinedUrls: [url],
        complete: true,
      })
      expect(resolvedUpdates(updates)).toEqual([])
      expect(result.resolved).toBe(0)
      expect(result.unverified).toBe(0)
      expect(result.updated).toBe(1)
    })
  })

  it('allows staff to ignore and resolve individual discovery issues', async () => {
    const updateFn = vi.fn(async ({ id, data }) => ({ id, ...data }))
    const mockPayload = { update: updateFn } as unknown as Payload

    await ignoreDiscoveryIssue(mockPayload, 'issue-1', 'False positive per editorial review.')
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'issue-1',
        data: expect.objectContaining({
          status: 'ignored',
          ignoredReason: 'False positive per editorial review.',
        }),
      }),
    )

    await resolveDiscoveryIssue(mockPayload, 'issue-2')
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'issue-2',
        data: expect.objectContaining({
          status: 'resolved',
        }),
      }),
    )
  })
})
