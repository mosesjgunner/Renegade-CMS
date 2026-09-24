import config from '@payload-config'
import { getPayload } from 'payload'

import {
  resolveCommunityActor,
  toggleCommunityReaction,
  CommunityError,
} from '@/modules/community/service'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? '')
  const targetType = (body.targetType as 'post') ?? 'post'
  const targetId = String(body.targetId ?? '')
  const emoji = String(body.emoji ?? 'like')

  if (!siteId || !targetId) {
    return Response.json({ error: 'siteId and targetId are required' }, { status: 400 })
  }

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Sign-in required to react' }, { status: 401 })
  }

  try {
    const result = await toggleCommunityReaction(
      payload,
      {
        siteId,
        memberId: actor.memberId,
        targetType,
        targetId,
        emoji,
      },
      { siteId, actor },
    )
    return Response.json(result)
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to toggle reaction' }, { status: 500 })
  }
}
