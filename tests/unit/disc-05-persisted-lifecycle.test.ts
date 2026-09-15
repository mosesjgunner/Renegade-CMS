import { describe, expect, it, vi } from 'vitest'
import {
  ignoreDiscoveryIssue,
  persistRenderedAuditLifecycle,
  resolveDiscoveryIssue,
} from '../../src/modules/public/discovery-lifecycle'
import type { RenderedAuditIssue } from '../../src/modules/public/discovery-audit'
import type { Payload } from 'payload'

describe('DISC-05 Persisted Lifecycle Fields & Quality Center Store', () => {
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
