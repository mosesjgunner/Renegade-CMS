import config from '@payload-config'
import { getPayload } from 'payload'
import { markInboxRead } from '@/modules/community/inbox-notifications'
import { resolveCommunityActor } from '@/modules/community/service'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import { verifyCsrf } from '@/modules/identity/member-identity'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const siteId =
      new URL(request.url).searchParams.get('siteId') ??
      request.headers.get('x-site-id') ??
      'default',
    payload = await getPayload({ config })

  if (siteId !== (await publicSiteForHost(payload, request.headers.get('host'))))
    return Response.json(
      { error: { code: 'FORBIDDEN', message: 'Site access denied.' } },
      { status: 404 },
    )
  if (!verifyCsrf(request.headers) || !(await samePublicOrigin(payload, request)))
    return Response.json(
      { error: { code: 'FORBIDDEN', message: 'CSRF verification required.' } },
      { status: 403 },
    )

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.memberId)
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
      { status: 401 },
    )
  return Response.json(
    {
      data: await markInboxRead(payload, {
        siteId,
        memberId: actor.memberId,
        notificationId: (await context.params).id,
      }),
    },
    { headers: { 'cache-control': 'private, no-store', 'x-renegade-api-version': 'v1' } },
  )
}
