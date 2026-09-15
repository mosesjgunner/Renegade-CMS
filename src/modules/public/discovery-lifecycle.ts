import type { Payload } from 'payload'
import type { QualityIssue, QualityScan } from '../../payload-types'
import type { RenderedAuditIssue } from './discovery-audit'

export type DiscoveryLifecycleSummary = {
  scanId: string
  created: number
  updated: number
  resolved: number
  active: number
  totalIssues: number
}

export type IssueStateFilter = 'all' | 'open' | 'resolved' | 'ignored'

export async function persistRenderedAuditLifecycle(
  payload: Payload,
  siteId: string,
  issues: readonly RenderedAuditIssue[],
): Promise<DiscoveryLifecycleSummary> {
  const now = new Date().toISOString()

  // 1. Create a QualityScan entry for this audit run
  const scanDoc = (await payload.create({
    collection: 'quality-scans',
    data: {
      site: siteId,
      targetType: 'site',
      targetId: siteId,
      status: 'completed',
      startedAt: now,
      completedAt: now,
      summary: { type: 'rendered_audit', totalIssues: issues.length },
    } as never,
    overrideAccess: true,
  })) as unknown as QualityScan

  // 2. Fetch all existing rendered_audit issues for this site
  const existingResult = await payload.find({
    collection: 'quality-issues',
    where: {
      and: [{ site: { equals: siteId } }, { targetType: { equals: 'rendered_audit' } }],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  const existingMap = new Map<string, QualityIssue>(
    (existingResult.docs as unknown as QualityIssue[]).map((i) => [i.dedupeKey, i]),
  )

  const activeDedupeKeys = new Set<string>()
  let created = 0
  let updated = 0
  let resolved = 0

  for (const item of issues) {
    const dedupeKey = `disc-05:${item.ruleId}:${item.url}`
    activeDedupeKeys.add(dedupeKey)

    const existingIssue = existingMap.get(dedupeKey)
    if (existingIssue) {
      if (existingIssue.status === 'resolved') {
        await payload.update({
          collection: 'quality-issues',
          id: existingIssue.id,
          data: {
            status: 'open',
            lastSeenAt: now,
            scan: scanDoc.id,
            message: item.evidence,
          } as never,
          overrideAccess: true,
        })
        updated++
      } else {
        await payload.update({
          collection: 'quality-issues',
          id: existingIssue.id,
          data: {
            lastSeenAt: now,
            scan: scanDoc.id,
            message: item.evidence,
          } as never,
          overrideAccess: true,
        })
        updated++
      }
    } else {
      await payload.create({
        collection: 'quality-issues',
        data: {
          site: siteId,
          scan: scanDoc.id,
          dedupeKey,
          targetType: 'rendered_audit',
          targetId: item.url,
          severity: item.severity,
          status: 'open',
          workflowState: 'new',
          category: 'seo',
          message: item.evidence,
          repairUrl: item.repairTarget,
          firstSeenAt: now,
          lastSeenAt: now,
        } as never,
        overrideAccess: true,
      })
      created++
    }
  }

  // Mark previous open issues that are no longer detected as resolved
  for (const [key, existingIssue] of existingMap.entries()) {
    if (!activeDedupeKeys.has(key) && existingIssue.status === 'open') {
      await payload.update({
        collection: 'quality-issues',
        id: existingIssue.id,
        data: {
          status: 'resolved',
          resolvedAt: now,
        } as never,
        overrideAccess: true,
      })
      resolved++
    }
  }

  const activeCount = issues.length

  return {
    scanId: scanDoc.id,
    created,
    updated,
    resolved,
    active: activeCount,
    totalIssues: issues.length,
  }
}

export async function ignoreDiscoveryIssue(
  payload: Payload,
  issueId: string,
  reason?: string,
): Promise<{ success: boolean }> {
  await payload.update({
    collection: 'quality-issues',
    id: issueId,
    data: {
      status: 'ignored',
      ignoredAt: new Date().toISOString(),
      ignoredReason: reason || 'Ignored by staff in discovery Quality Center.',
    } as never,
    overrideAccess: true,
  })
  return { success: true }
}

export async function resolveDiscoveryIssue(
  payload: Payload,
  issueId: string,
): Promise<{ success: boolean }> {
  await payload.update({
    collection: 'quality-issues',
    id: issueId,
    data: {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    } as never,
    overrideAccess: true,
  })
  return { success: true }
}
