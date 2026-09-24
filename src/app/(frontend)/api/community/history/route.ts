import config from '@payload-config'
import { getPayload } from 'payload'
import {
  resolveCommunityActor,
  getMemberActivityHistory,
  CommunityError,
} from '@/modules/community/service'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const history = await getMemberActivityHistory(payload, actor.memberId, { siteId, actor })
    return Response.json({ history })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}
