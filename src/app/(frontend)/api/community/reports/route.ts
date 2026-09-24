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
