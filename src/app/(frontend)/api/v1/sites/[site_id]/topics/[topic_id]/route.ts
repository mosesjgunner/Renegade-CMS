import config from '@payload-config'
import { getPayload } from 'payload'

import { ForumBrowsingError, getForumTopicPosts } from '@/modules/community/forum-browsing'
import { ForumSpaceAccessError } from '@/modules/community/forum-space-access'
import { resolveCommunityActor } from '@/modules/community/service'
import { ForumTopicOperationError, mergeForumTopics, moveForumTopic, resolveForumTopicRedirect, setForumTopicState, splitForumTopic } from '@/modules/community/forum-topic-operations'

export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-renegade-api-version': 'v1' } })

export async function GET(request: Request, context: { params: Promise<{ site_id: string; topic_id: string }> }) {
  const { site_id, topic_id } = await context.params
  const url = new URL(request.url)
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)
  try {
    const data = await getForumTopicPosts(payload, { siteId: site_id, topicId: topic_id, memberId: actor.memberId, cursor: url.searchParams.get('cursor'), limit: Number(url.searchParams.get('limit') ?? 30) })
    // Access is resolved above before revealing the redirect target for a private/hidden source.
    const redirect = await resolveForumTopicRedirect(payload, { siteId: site_id, topicId: topic_id })
    if (redirect && redirect.targetTopicId !== topic_id)
      return new Response(null, { status: 301, headers: { location: `/api/v1/sites/${site_id}/topics/${redirect.targetTopicId}`, 'cache-control': 'no-store', 'x-renegade-api-version': 'v1' } })
    return json({ data })
  } catch (error) {
    if (error instanceof ForumBrowsingError && error.code === 'TOPIC_NOT_FOUND') {
      const redirect = await resolveForumTopicRedirect(payload, { siteId: site_id, topicId: topic_id })
      if (redirect) return new Response(null, { status: 301, headers: { location: `/api/v1/sites/${site_id}/topics/${redirect.targetTopicId}`, 'cache-control': 'no-store', 'x-renegade-api-version': 'v1' } })
    }
    if (error instanceof ForumBrowsingError || error instanceof ForumSpaceAccessError)
      return json({ error: { code: error.code, message: error.message } }, error.status)
    return json({ error: { code: 'INTERNAL_ERROR', message: 'An error occurred' } }, 500)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ site_id: string; topic_id: string }> }) {
  const { site_id, topic_id } = await context.params
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)
  if (!actor.memberId) return json({ error: { code: 'UNAUTHORIZED', message: 'A staff member is required.' } }, 401)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } }, 400)
  try {
    const operation = String(body.operation ?? 'state')
    const data = operation === 'move' ? await moveForumTopic(payload, { siteId: site_id, topicId: topic_id, targetSpaceId: String(body.targetSpaceId ?? body.target_space_id ?? ''), actorId: actor.memberId })
      : operation === 'merge' ? await mergeForumTopics(payload, { siteId: site_id, targetTopicId: topic_id, sourceTopicId: String(body.sourceTopicId ?? body.source_topic_id ?? ''), actorId: actor.memberId })
      : operation === 'split' ? await splitForumTopic(payload, { siteId: site_id, sourceTopicId: topic_id, targetSpaceId: String(body.targetSpaceId ?? body.target_space_id ?? ''), title: String(body.title ?? ''), postIds: Array.isArray(body.postIds) ? body.postIds.map(String) : [], actorId: actor.memberId })
      : await setForumTopicState(payload, { siteId: site_id, topicId: topic_id, actorId: actor.memberId, pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined, locked: typeof body.locked === 'boolean' ? body.locked : undefined, archived: typeof body.archived === 'boolean' ? body.archived : undefined })
    return json({ data })
  } catch (error) {
    if (error instanceof ForumTopicOperationError || error instanceof ForumSpaceAccessError) return json({ error: { code: error.code, message: error.message } }, error.status)
    return json({ error: { code: 'INTERNAL_ERROR', message: 'An error occurred' } }, 500)
  }
}
