import { discussionRequestSite } from '@/modules/community/discussion-operations'
import { verifyCsrf } from '@/modules/identity/member-identity'
import config from '@payload-config'
import { getPayload } from 'payload'

import { ForumBrowsingError, listForumTopics } from '@/modules/community/forum-browsing'
import { ForumSpaceAccessError } from '@/modules/community/forum-space-access'
import { resolveCommunityActor } from '@/modules/community/service'

export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-renegade-api-version': 'v1' },
  })

export async function GET(request: Request, context: { params: Promise<{ site_id: string }> }) {
  const { site_id } = await context.params
  const url = new URL(request.url)
  if (request.method !== 'GET' && !verifyCsrf(request.headers))
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  const payload = await getPayload({ config })
  if (!(await discussionRequestSite(payload, request.headers, site_id)))
    return Response.json({ error: 'Community site unavailable' }, { status: 404 })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)
  if (request.method !== 'GET' && (!actor.memberId || actor.status !== 'active'))
    return Response.json({ error: 'Active member authentication required' }, { status: 401 })
  try {
    const data = await listForumTopics(payload, {
      siteId: site_id,
      memberId: actor.memberId,
      spaceId: url.searchParams.get('space_id') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
      limit: Number(url.searchParams.get('limit') ?? 30),
    })
    return json({ data })
  } catch (error) {
    if (error instanceof ForumBrowsingError || error instanceof ForumSpaceAccessError)
      return json({ error: { code: error.code, message: error.message } }, error.status)
    return json({ error: { code: 'INTERNAL_ERROR', message: 'An error occurred' } }, 500)
  }
}
