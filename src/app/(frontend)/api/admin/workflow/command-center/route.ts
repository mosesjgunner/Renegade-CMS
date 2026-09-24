import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { getWorkflowQueuesForUser } from '@/modules/editorial/cmos-persistence'
import { getUnresolvedComments } from '@/modules/editorial/comments'
import { getLocalizationEngine } from '@/modules/editorial/localization/service'
import { sanitizeErrorLog } from '@/modules/editorial/scheduler'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') || undefined
  const now = url.searchParams.get('now') || new Date().toISOString()

  const userId = String(auth.user.id)
  const role = String(auth.user.role)

  const isPublisher = ['owner', 'administrator'].includes(role)
  const isEditor = isPublisher || role === 'staff'

  const permissions = {
    canSubmit: true,
    canReview: isEditor,
    canApprove: isEditor,
    canWaive: isPublisher,
    canSchedule: isEditor,
    canExecuteRelease: isPublisher,
    canRetryRelease: isPublisher,
    canRollback: isPublisher,
    role,
  }

  try {
    // 1. Queues (My Work & Team Queues)
    const queues = await getWorkflowQueuesForUser(payload, {
      userId,
      role: isPublisher ? 'publisher' : 'editor',
      siteId,
      now,
    })

    // 2. Unresolved Comments
    const comments = getUnresolvedComments()

    // 3. Due / Overdue items
    const allItems = [
      ...queues.personal.assigned,
      ...queues.personal.awaitingApproval,
      ...queues.personal.requestedChanges,
      ...queues.personal.approved,
      ...queues.personal.overdue,
      ...queues.team.assigned,
      ...queues.team.awaitingApproval,
      ...queues.team.requestedChanges,
      ...queues.team.approved,
      ...queues.team.overdue,
    ]
    // Deduplicate by ID
    const uniqueItemsMap = new Map<string, (typeof allItems)[0]>()
    for (const item of allItems) {
      if (!uniqueItemsMap.has(item.id)) {
        uniqueItemsMap.set(item.id, item)
      }
    }
    const uniqueItems = Array.from(uniqueItemsMap.values())

    const nowDate = new Date(now)
    const dueOverdue = uniqueItems
      .filter((item) => item.assignment.dueDate)
      .map((item) => {
        const dueDate = new Date(item.assignment.dueDate!)
        const diffMs = dueDate.getTime() - nowDate.getTime()
        const diffHours = Math.round(diffMs / (1000 * 60 * 60))
        const isOverdue = diffMs < 0
        return {
          id: item.id,
          contentType: item.contentType,
          status: item.status,
          dueDate: item.assignment.dueDate,
          diffHours,
          isOverdue,
          priority: item.assignment.priority,
          editorId: item.assignment.editorId,
          directLink: `/admin/collections/content/${item.id}?revision=${item.currentRevisionSequence}`,
        }
      })
      .sort((a, b) => a.diffHours - b.diffHours)

    // 4. Blockers & Quality Issues
    const blockers = uniqueItems
      .filter(
        (item) =>
          (item.qualityGateSnapshot &&
            item.qualityGateSnapshot.blockingIssueCount > 0 &&
            !item.qualityWaiver) ||
          item.queueMembership === 'blocked',
      )
      .map((item) => ({
        id: item.id,
        contentType: item.contentType,
        status: item.status,
        blockingCount: item.qualityGateSnapshot?.blockingIssueCount || 1,
        issues: item.qualityGateSnapshot?.issues || [],
        repairLink: `/admin/rendered-quality?id=${encodeURIComponent(item.id)}`,
        directLink: `/admin/collections/content/${item.id}`,
      }))

    // 5. Localization / Translations
    const locEngine = getLocalizationEngine()
    const translationGroups = locEngine.getAllGroups().map((g) => ({
      id: g.id,
      conceptualId: g.conceptualId,
      sourceLocale: g.sourceLocale,
      variantCount: Object.keys(g.variants).length,
      variants: Object.keys(g.variants),
      directLink: `/admin/workflow?tab=translations&groupId=${encodeURIComponent(g.id)}`,
    }))
    const translationRequests = locEngine.getAllRequests().map((r) => {
      const grp = locEngine.getGroup(r.groupId)
      const variant = grp?.variants[r.targetLocale]
      return {
        id: r.id,
        groupId: r.groupId,
        targetLocale: r.targetLocale,
        status: r.status,
        isStale: r.isStale,
        staleReason: r.staleReason,
        pinnedSourceRevision: r.sourceRevisionPin.sequence,
        humanReviewed: r.status === 'approved' || variant?.status === 'approved',
        completenessScore: variant?.completenessScore ?? 100,
        directLink: `/admin/workflow?tab=translations&requestId=${encodeURIComponent(r.id)}`,
      }
    })

    // 6. Notification Failures from Outbox
    const outbox = locEngine.notificationManager.getOutbox()
    const notificationFailures = outbox
      .filter((n) => n.status === 'failed')
      .map((n) => ({
        id: n.id,
        eventType: n.eventType,
        recipientId: n.recipientId,
        channel: n.channel,
        attempts: n.attempts,
        lastError: n.lastError,
        createdAt: n.createdAt,
      }))

    // 7. Releases
    let releasesList: Array<Record<string, unknown>> = []
    try {
      const finder = payload.find as unknown as (
        args: unknown,
      ) => Promise<{ docs: Array<Record<string, unknown>> }>
      const releasesDocs = await finder({
        collection: 'content-releases',
        limit: 10,
        sort: '-createdAt',
        overrideAccess: true,
      })
      releasesList = (releasesDocs.docs as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        name: r.name || r.title,
        title: r.title,
        status: r.status,
        releaseRevision: r.releaseRevision,
        artifactCount: ((r.artifacts || r.executionItems || []) as unknown[]).length,
        scheduledFor: r.scheduledFor || r.plannedInstant,
        gatePassed: (r.gateSnapshot as Record<string, unknown> | undefined)?.status === 'passed',
        directLink: `/admin/releases?id=${encodeURIComponent(String(r.id))}`,
      }))
    } catch {
      // Ignore if collection not present
    }

    // 8. Schedule Health & Jobs
    let jobsList: Array<Record<string, unknown>> = []
    let activeLockCount = 0
    try {
      const finder = payload.find as unknown as (
        args: unknown,
      ) => Promise<{ docs: Array<Record<string, unknown>> }>
      const jobsDocs = await finder({
        collection: 'scheduled-publish-jobs',
        limit: 20,
        sort: '-scheduledFor',
        overrideAccess: true,
      })
      jobsList = (jobsDocs.docs as Array<Record<string, unknown>>).map((job) => {
        if (job.leaseExpiresAt && new Date(String(job.leaseExpiresAt)).getTime() > Date.now()) {
          activeLockCount++
        }
        return {
          jobId: String(job.id),
          scheduledFor: String(job.scheduledFor),
          timeZone: String(job.timeZone || 'UTC'),
          targetRevisionId: String(job.targetRevisionId || job.revision || ''),
          status: String(job.status),
          lastError: sanitizeErrorLog(job.lastError as string | undefined),
        }
      })
    } catch {
      // Ignore if collection not present
    }

    const calendarEntries = [
      ...jobsList.map((job) => ({
        id: `job-${job.jobId}`,
        sourceType: 'content',
        sourceId: job.targetRevisionId,
        title: `Scheduled Job: ${String(job.jobId)}`,
        startsAt: job.scheduledFor,
        timeZone: job.timeZone,
        status: job.status,
        directLink: `/admin/collections/scheduled-publish-jobs/${encodeURIComponent(String(job.jobId))}`,
      })),
      ...releasesList
        .filter((r) => r.scheduledFor)
        .map((r) => ({
          id: `release-${String(r.id)}`,
          sourceType: 'content-release',
          sourceId: r.id,
          title: `Release: ${String(r.title || r.name)}`,
          startsAt: r.scheduledFor,
          timeZone: 'UTC',
          status: r.status,
          directLink: r.directLink,
        })),
    ]

    // 9. Recent Unified Audit Activity
    const recentAudit: Array<{
      id: string
      action: string
      actorId: string
      actorRole: string
      at: string
      target: string
      detail?: string
      directLink: string
    }> = []

    for (const item of uniqueItems) {
      for (const event of item.auditTrail.slice(-3)) {
        recentAudit.push({
          id: event.id,
          action: event.action,
          actorId: event.actorId,
          actorRole: event.actorRole,
          at: event.at,
          target: `${item.contentType} #${item.id}`,
          detail:
            event.reason || (event.staleApproval ? 'Approval invalidated (stale)' : undefined),
          directLink: `/admin/collections/content/${item.id}`,
        })
      }
    }
    recentAudit.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

    return NextResponse.json({
      currentUser: {
        id: userId,
        email: auth.user.email,
        role,
        permissions,
      },
      myWork: queues.personal,
      teamQueues: queues.team,
      unresolvedComments: comments,
      dueOverdue,
      calendar: calendarEntries,
      scheduledJobs: {
        health: {
          healthy: true,
          activeLocks: activeLockCount,
          clockSkewSeconds: 30,
          catchUpMode: 'publish-immediately',
        },
        upcomingCount: jobsList.length,
        jobs: jobsList,
      },
      translations: {
        groups: translationGroups,
        requests: translationRequests,
        staleCount: translationRequests.filter((r) => r.isStale).length,
      },
      releases: releasesList,
      blockers,
      notificationFailures,
      recentAudit: recentAudit.slice(0, 20),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to compile command center data.' },
      { status: 500 },
    )
  }
}
