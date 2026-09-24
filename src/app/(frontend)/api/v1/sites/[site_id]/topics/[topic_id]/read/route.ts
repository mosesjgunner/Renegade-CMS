import config from '@payload-config'
import { getPayload } from 'payload'

import { ForumBrowsingError, markForumTopicRead } from '@/modules/community/forum-browsing'
import { ForumSpaceAccessError } from '@/modules/community/forum-space-access'
import { resolveCommunityActor } from '@/modules/community/service'

export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-renegade-api-version': 'v1' },
  })

export async function POST(
  request: Request,
  context: { params: Promise<{ site_id: string; topic_id: string }> },
) {
  const { site_id, topic_id } = await context.params
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)
  if (!actor.memberId)
    return json(
      {
        error: { code: 'UNAUTHORIZED', message: 'Authentication required to record topic reads.' },
      },
      401,
    )
  try {
    const data = await markForumTopicRead(payload, {
      siteId: site_id,
      topicId: topic_id,
      memberId: actor.memberId,
    })
    return json({ data })
  } catch (error) {
    if (error instanceof ForumBrowsingError || error instanceof ForumSpaceAccessError)
      return json({ error: { code: error.code, message: error.message } }, error.status)
    return json({ error: { code: 'INTERNAL_ERROR', message: 'An error occurred' } }, 500)
  }
}
