import { discussionRequestSite } from '@/modules/community/discussion-operations'
import { verifyCsrf } from '@/modules/identity/member-identity'
import config from '@payload-config'
import { getPayload } from 'payload'

import { resolveCommunityActor } from '@/modules/community/service'
import {
  ForumSpaceAccessError,
  resolveForumSpaceAccess,
} from '@/modules/community/forum-space-access'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ site_id: string; space_id: string }> },
) {
  const { site_id, space_id } = await context.params
  if (request.method !== 'GET' && !verifyCsrf(request.headers))
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  const payload = await getPayload({ config })
  if (!(await discussionRequestSite(payload, request.headers, site_id)))
    return Response.json({ error: 'Community site unavailable' }, { status: 404 })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)
  if (request.method !== 'GET' && (!actor.memberId || actor.status !== 'active'))
    return Response.json({ error: 'Active member authentication required' }, { status: 401 })
  try {
    const access = await resolveForumSpaceAccess(payload, {
      siteId: site_id,
      spaceId: space_id,
      actor: { memberId: actor.memberId },
    })
    return Response.json(
      { data: access },
      { headers: { 'cache-control': 'no-store', 'x-renegade-api-version': 'v1' } },
    )
  } catch (error) {
    if (error instanceof ForumSpaceAccessError)
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      )
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An error occurred' } },
      { status: 500 },
    )
  }
}
