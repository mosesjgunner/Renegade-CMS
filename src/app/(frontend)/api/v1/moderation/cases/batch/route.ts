import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor } from '@/modules/community/service'
import { batchDispositionModerationCases } from '@/modules/community/abuse-triage'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as {
    siteId?: string
    caseIds?: unknown
    disposition?: string
  }
  const siteId = body.siteId ?? request.headers.get('x-site-id') ?? 'default'
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if ((!actor.isStaff && !actor.isModerator) || !actor.memberId)
    return Response.json({ error: 'Moderation privileges required' }, { status: 403 })
  const ids = Array.isArray(body.caseIds) ? body.caseIds.map(String) : []
  if (!ids.length || ids.length > 50 || !body.disposition)
    return Response.json({ error: '1 to 50 caseIds and disposition are required' }, { status: 400 })
  try {
    const items = await batchDispositionModerationCases(payload, {
      siteId,
      actorMemberId: actor.memberId,
      caseIds: ids,
      disposition: body.disposition,
    })
    return Response.json({ success: items.every((i) => i.success), items })
  } catch {
    return Response.json({ error: 'Moderation database unavailable' }, { status: 503 })
  }
}
