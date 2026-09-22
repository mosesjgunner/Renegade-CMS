import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor, CommunityError } from '@/modules/community/service'
import { applyModerationAction, ModerationActionError } from '@/modules/community/moderation-actions'

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

  if (!action || !targetType || !targetId || !reason || !caseId || !actor.memberId) {
    return Response.json({ error: 'caseId, action, targetType, targetId, and reason are required' }, { status: 400 })
  }

  try {
    const result = await applyModerationAction(payload, { siteId, caseId, actorMemberId: actor.memberId, targetType, targetId, action, scope: String(body.scope ?? 'object') as never, scopeId: body.scopeId ? String(body.scopeId) : null, expiresAt: body.expiresAt ? String(body.expiresAt) : null, reason, details })
    return Response.json({ success: true, data: result }, { status: 200 })
  } catch (err: unknown) {
    if (err instanceof CommunityError || err instanceof ModerationActionError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Moderation action failed' }, { status: 500 })
  }
}
