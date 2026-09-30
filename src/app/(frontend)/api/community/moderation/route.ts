import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor, CommunityError } from '@/modules/community/service'
import {
  applyModerationAction,
  ModerationActionError,
  verifyCommunityAuditChain,
} from '@/modules/community/moderation-actions'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? request.headers.get('x-site-id') ?? 'default')

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.isStaff && !actor.isModerator) {
    return Response.json({ error: 'Moderation privileges required' }, { status: 403 })
  }

  const action = body.action as never
  const targetType = String(body.targetType ?? '')
  const targetId = body.targetId ? String(body.targetId) : ''
  const reason = body.reason ? String(body.reason) : ''
  const caseId = body.caseId ? String(body.caseId) : ''
  const details = (body.details as Record<string, unknown>) ?? undefined
  const actorId = actor.memberId ?? actor.userId

  if (!action || !targetType || !targetId || !reason || !caseId || !actorId) {
    return Response.json(
      { error: 'caseId, action, targetType, targetId, and reason are required' },
      { status: 400 },
    )
  }

  try {
    const result = await applyModerationAction(payload, {
      siteId,
      caseId,
      actorMemberId: actorId,
      targetType,
      targetId,
      action,
      scope: String(body.scope ?? 'object') as never,
      scopeId: body.scopeId ? String(body.scopeId) : null,
      expiresAt: body.expiresAt ? String(body.expiresAt) : null,
      reason,
      details,
    })
    return Response.json({ success: true, data: result }, { status: 200 })
  } catch (err: unknown) {
    if (err instanceof CommunityError || err instanceof ModerationActionError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Moderation action failed' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.isStaff && !actor.isModerator) {
    return Response.json({ error: 'Moderation privileges required' }, { status: 403 })
  }

  try {
    const pool = (payload.db as any).pool
    const query = pool?.query?.bind(pool)
    if (!query) {
      return Response.json({ error: 'Database access unavailable' }, { status: 500 })
    }

    const actionsRes = await query(
      `SELECT a.id, a.site_id AS "siteId", a.case_id AS "caseId", a.actor, a.target_type AS "targetType",
              a.target_id AS "targetId", a.action, a.reason, a.details, a.created_at AS "createdAt"
       FROM moderation_actions a
       WHERE a.site_id = $1
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [siteId],
    )

    const auditRes = await query(
      `SELECT l.id, l.site_id AS "siteId", l.event_type AS "eventType", l.event_payload AS "payload",
              l.record_hash AS "hash", l.created_at AS "createdAt"
       FROM community_audit_log l
       WHERE l.site_id = $1
       ORDER BY l.created_at DESC
       LIMIT 50`,
      [siteId],
    )

    let auditValid = true
    try {
      auditValid = await verifyCommunityAuditChain(payload, siteId)
    } catch {
      // If no records yet or uninitialized
    }

    return Response.json({
      actions: actionsRes.rows,
      auditLog: auditRes.rows,
      auditValid,
    })
  } catch (err: unknown) {
    return Response.json({ error: 'Failed to fetch moderation data' }, { status: 500 })
  }
}
