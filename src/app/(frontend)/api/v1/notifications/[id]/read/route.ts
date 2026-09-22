import config from '@payload-config'
import { getPayload } from 'payload'
import { markInboxRead } from '@/modules/community/inbox-notifications'
import { resolveCommunityActor } from '@/modules/community/service'
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const siteId = new URL(request.url).searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default', payload = await getPayload({ config }), actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.memberId) return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } }, { status: 401 })
  return Response.json({ data: await markInboxRead(payload, { siteId, memberId: actor.memberId, notificationId: (await context.params).id }) }, { headers: { 'cache-control': 'private, no-store', 'x-renegade-api-version': 'v1' } })
}
