import config from '@payload-config'
import { getPayload } from 'payload'
import { listInbox } from '@/modules/community/inbox-notifications'
import { resolveCommunityActor } from '@/modules/community/service'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const url = new URL(request.url),
    siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'
  const payload = await getPayload({ config }),
    actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.memberId)
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
      { status: 401 },
    )
  const data = await listInbox(payload, {
    siteId,
    memberId: actor.memberId,
    cursor: url.searchParams.get('cursor'),
    limit: Number(url.searchParams.get('limit') ?? 30),
  })
  return Response.json(
    { data },
    { headers: { 'cache-control': 'private, no-store', 'x-renegade-api-version': 'v1' } },
  )
}
