import config from '@payload-config'
import { getPayload } from 'payload'
import { publicSiteForHost } from '@/modules/public/site-scope'
import { resolveCommunityActor } from '@/modules/community/service'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const siteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!siteId) return Response.json({ error: 'Publication site is unavailable.' }, { status: 404 })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.isModerator)
    return Response.json({ error: 'Site moderation grant required.' }, { status: 403 })
  return Response.json({ siteId }, { headers: { 'cache-control': 'private, no-store' } })
}
