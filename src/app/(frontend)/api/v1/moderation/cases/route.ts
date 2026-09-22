import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor } from '@/modules/community/service'
import { listModerationCases } from '@/modules/community/abuse-triage'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if ((!actor.isStaff && !actor.isModerator) || !actor.memberId)
    return Response.json({ error: 'Moderation privileges required' }, { status: 403 })
  try {
    return Response.json({
      success: true,
      cases: await listModerationCases(payload, {
        siteId,
        priority: url.searchParams.get('priority') ?? undefined,
        status: url.searchParams.get('status') ?? undefined,
        ruleCategory: url.searchParams.get('ruleCategory') ?? undefined,
        slaBefore: url.searchParams.get('slaDeadline') ?? undefined,
      }),
    })
  } catch {
    return Response.json({ error: 'Failed to list moderation cases' }, { status: 500 })
  }
}
