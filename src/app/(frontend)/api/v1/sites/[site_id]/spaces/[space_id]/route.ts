import config from '@payload-config'
import { getPayload } from 'payload'

import { resolveCommunityActor } from '@/modules/community/service'
import { ForumSpaceAccessError, resolveForumSpaceAccess } from '@/modules/community/forum-space-access'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ site_id: string; space_id: string }> }) {
  const { site_id, space_id } = await context.params
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)
  try {
    const access = await resolveForumSpaceAccess(payload, {
      siteId: site_id,
      spaceId: space_id,
      actor: { memberId: actor.memberId },
    })
    return Response.json({ data: access }, { headers: { 'cache-control': 'no-store', 'x-renegade-api-version': 'v1' } })
  } catch (error) {
    if (error instanceof ForumSpaceAccessError)
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status })
    return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'An error occurred' } }, { status: 500 })
  }
}
