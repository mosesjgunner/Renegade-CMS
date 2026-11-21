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
  /** Open issues left in place because their URL was not re-examined. */
  unverified: number
  scope: {
    state: string
    eligible: number
    examined: number
    complete: boolean
  } | null
}

/**
 * Re-examination evidence for one audit run (DEBT-14). An open issue may
 * be resolved only when its target URL appears in `examinedUrls` — a
 * skipped, failed, or out-of-scope page can never silently resolve it.
 * When scope is omitted there is no re-examination evidence at all, so
 * resolution never happens implicitly.
 */
export type RenderedAuditScopeEvidence = {
  state: 'complete' | 'partial' | 'empty' | 'no-eligible'
  eligible: number
  examined: number
  failed?: number
  skipped?: number
  examinedUrls: readonly string[]
  complete: boolean
  inboundLinksComplete?: boolean
}

export type IssueStateFilter = 'all' | 'open' | 'resolved' | 'ignored'

export async function persistRenderedAuditLifecycle(
  payload: Payload,
  siteId: string,
  issues: readonly RenderedAuditIssue[],
  scope?: RenderedAuditScopeEvidence,
): Promise<DiscoveryLifecycleSummary> {
  const now = new Date().toISOString()
  const incomplete = scope?.state === 'partial' || scope?.state === 'empty'

  // 1. Create a QualityScan entry for this audit run. A partial or empty
  // audit is recorded as 'incomplete', never as a clean 'completed'.
  const scanDoc = (await payload.create({
    collection: 'quality-scans',
    data: {
      site: siteId,
      targetType: 'site',
      targetId: siteId,
      status: incomplete ? 'incomplete' : 'completed',
      startedAt: now,
      completedAt: now,
      summary: {
        type: 'rendered_audit',
        totalIssues: issues.length,
        scope: {
          state: scope?.state ?? 'unscoped',
          eligible: scope?.eligible ?? 0,
          examined: scope?.examined ?? 0,
          ...(scope?.failed !== undefined ? { failed: scope.failed } : {}),
          ...(scope?.skipped !== undefined ? { skipped: scope.skipped } : {}),
        },
      },
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

  // Several links on a page can produce the same rule finding. Persist one
  // lifecycle record per key while retaining every distinct piece of evidence.
  const grouped = new Map<string, RenderedAuditIssue>()
  const severityRank = { informational: 0, warning: 1, publication_blocking: 2 }
  for (const item of issues) {
    const key = `disc-05:${item.ruleId}:${item.url}`
    const previous = grouped.get(key)
    grouped.set(
      key,
      previous
        ? {
            ...previous,
            evidence: [...new Set([previous.evidence, item.evidence])].join('\n'),
            severity:
              severityRank[item.severity] > severityRank[previous.severity]
                ? item.severity
                : previous.severity,
          }
        : item,
    )
  }

  for (const [dedupeKey, item] of grouped) {
    activeDedupeKeys.add(dedupeKey)

    const existingIssue =
      existingMap.get(dedupeKey) ??
      ((
        await payload.find({
          collection: 'quality-issues',
          where: { dedupeKey: { equals: dedupeKey } },
          limit: 1,
          overrideAccess: true,
        })
      ).docs[0] as unknown as QualityIssue | undefined)
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

  // Resolution invariant (DEBT-14): a previous open issue is resolved
  // only when its target URL was actually re-examined in this run and
  // the finding is no longer detected. Issues whose URL was skipped,
  // failed, or out of scope stay open and are counted as unverified.
  const examinedUrls = new Set(scope?.examinedUrls ?? [])
  let unverified = 0
  for (const [key, existingIssue] of existingMap.entries()) {
    if (activeDedupeKeys.has(key) || existingIssue.status !== 'open') continue
    if (
      !examinedUrls.has(String(existingIssue.targetId)) ||
      (key.startsWith('disc-05:DISC-05-NO-AUDITED-INBOUND-LINK:') && !scope?.inboundLinksComplete)
    ) {
      unverified++
      continue
    }
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

  const activeCount = grouped.size

  return {
    scanId: scanDoc.id,
    created,
    updated,
    resolved,
    active: activeCount,
    totalIssues: issues.length,
    unverified,
    scope: scope
      ? {
          state: scope.state,
          eligible: scope.eligible,
          examined: scope.examined,
          complete: scope.complete,
        }
      : null,
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
