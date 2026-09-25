import config from '@payload-config'
import { getPayload } from 'payload'
import {
  resolveCommunityActor,
  CommunityError,
  enforceCommunityWriteRateLimit,
} from '@/modules/community/service'
import {
  ingestModerationReport,
  moderationTargetTypes,
} from '@/modules/community/moderation-reports'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? request.headers.get('x-site-id') ?? 'default')

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const targetType = body.targetType as (typeof moderationTargetTypes)[number]
  const targetId = body.targetId ? String(body.targetId) : ''
  const reason = body.reason ? String(body.reason) : ''
  const details = body.details ? String(body.details) : undefined

  if (!targetType || !targetId || !reason) {
    return Response.json(
      { error: 'targetType, targetId, and reason are required' },
      { status: 400 },
    )
  }

  try {
    enforceCommunityWriteRateLimit({ siteId, actor }, 'report')
    const result = await ingestModerationReport(payload, {
      siteId,
      reporterId: actor.memberId,
      targetType,
      targetId,
      reason,
      details,
    })
    // Never return reporter identity, snapshots, or case internals to an author/public caller.
    return Response.json(
      { success: true, reportId: result.reportId, caseId: result.caseId },
      { status: 201 },
    )
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to submit report' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || (!actor.isStaff && !actor.isModerator)) {
    return Response.json({ error: 'Staff or moderator authorization required' }, { status: 403 })
  }

  try {
    const pool = (payload.db as any).pool
    const query = pool?.query?.bind(pool)
    if (!query) {
      return Response.json({ error: 'Database access unavailable' }, { status: 500 })
    }

    const reportsRes = await query(
      `SELECT r.id, r.site_id AS "siteId", r.reporter_id AS "reporterId", r.target_type AS "targetType",
              r.target_id AS "targetId", r.reason, r.details, r.status, r.parent_case_id AS "parentCaseId",
              r.target_snapshot_payload AS "snapshot", r.created_at AS "createdAt"
       FROM community_reports r
       WHERE r.site_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [siteId],
    )

    const casesRes = await query(
      `SELECT c.id, c.site_id AS "siteId", c.target_type AS "targetType", c.target_id AS "targetId",
              c.status, c.created_at AS "createdAt", c.last_reported_at AS "lastReportedAt"
       FROM moderation_cases c
       WHERE c.site_id = $1
       ORDER BY c.last_reported_at DESC
       LIMIT 100`,
      [siteId],
    )

    return Response.json({
      reports: reportsRes.rows,
      cases: casesRes.rows,
    })
  } catch (err: unknown) {
    return Response.json({ error: 'Failed to fetch moderation reports' }, { status: 500 })
  }
}
