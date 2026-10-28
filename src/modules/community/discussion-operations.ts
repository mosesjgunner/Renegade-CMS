import type { Payload, Where } from 'payload'
import { withExecutionLock } from '../operations/execution-lock'
import type { CommunityPolicyContext } from './contracts'
import { CommunityError, discussionTarget, listDiscussionComments } from './service'
import { emitCommunityEvent } from './realtime'
import { communitySiteForHost } from './site-scope'
import { getThreadLifecycle } from './thread-lifecycle'

export async function versionedCommentTarget(payload: Payload, siteId: string, threadId: string) {
  const thread = await getThreadLifecycle(payload, { siteId, threadId })
  const content = await discussionTarget(payload, siteId, 'content', thread.canonicalContentId)
  return { thread, content }
}

export async function discussionRequestSite(payload: Payload, headers: Headers, siteId: string) {
  return Boolean(await communitySiteForHost(payload, headers.get('host'), siteId).catch(() => null))
}

export function discussionPage(value: unknown, fallback = 1) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, 10000) : fallback
}

export async function discussionPostsPage(
  payload: Payload,
  discussionId: string,
  context: CommunityPolicyContext,
  page = 1,
  limit = 30,
) {
  const posts = await listDiscussionComments(payload, discussionId, context, { page, limit })
  const count = await payload.count({
    collection: 'discussion-posts',
    where: { discussion: { equals: discussionId } },
    overrideAccess: true,
  })
  return { posts, page, hasNextPage: page * limit < count.totalDocs }
}

/** SSR and hydrated reads share the records written by the public comment form. */
export async function attachedDiscussionComments(
  payload: Payload,
  input: { siteId: string; canonicalContentId: string; [key: string]: unknown },
) {
  if (!payload.collections?.discussions || !payload.collections?.['discussion-posts']) return []
  await discussionTarget(payload, input.siteId, 'content', input.canonicalContentId)
  const result = await payload.find({
    collection: 'discussions',
    where: {
      and: [
        { site: { equals: input.siteId } },
        { kind: { equals: 'attached' } },
        { 'attachedTo.relationTo': { equals: 'content' } },
        { 'attachedTo.value': { equals: input.canonicalContentId } },
      ],
    },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  if (!result.docs[0]) return []
  return listDiscussionComments(payload, String(result.docs[0].id), {
    siteId: input.siteId,
    actor: { kind: 'anonymous', isStaff: false, isModerator: false },
  }).catch((error: unknown) => {
    if (error instanceof CommunityError && [403, 404, 410].includes(error.status)) return []
    throw error
  })
}

/** Public topic search indexes titles only; post bodies never enter this index. */
export async function browseDiscussions(
  payload: Payload,
  input: { siteId: string; forumId?: string; page?: number; query?: string },
) {
  const where: Where = {
    and: [
      { site: { equals: input.siteId } },
      { kind: { equals: 'thread' } },
      { visibility: { equals: 'public' } },
      { moderationState: { equals: 'clear' } },
      { status: { in: ['open', 'locked'] } },
      { removeFromDiscovery: { not_equals: true } },
      ...(input.forumId ? [{ forum: { equals: input.forumId } }] : []),
      ...(input.query?.trim() ? [{ title: { contains: input.query.trim().slice(0, 180) } }] : []),
    ],
  }
  return payload.find({
    collection: 'discussions',
    where,
    sort: ['-pinned', '-createdAt', 'id'],
    page: input.page ?? 1,
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
}

function moderator(context: CommunityPolicyContext) {
  if (context.actor.status !== 'active' || (!context.actor.isModerator && !context.actor.isStaff))
    throw new CommunityError('Moderation privileges required', 403, 'MODERATOR_REQUIRED')
}

export async function updateDiscussion(
  payload: Payload,
  id: string,
  changes: Record<string, unknown>,
  context: CommunityPolicyContext,
) {
  moderator(context)
  if (typeof changes.reason !== 'string' || !changes.reason.trim())
    throw new CommunityError('A moderation reason is required', 400, 'REASON_REQUIRED')
  return withExecutionLock(payload, `discussion:${id}`, async () => {
    const current = await payload
      .findByID({ collection: 'discussions', id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!current || String(current.site) !== context.siteId)
      throw new CommunityError('Thread not found', 404, 'THREAD_NOT_FOUND')
    const data: Record<string, unknown> = {}
    for (const [key, values] of Object.entries({
      status: ['open', 'locked', 'archived'],
      commentsPolicy: ['open', 'members', 'closed'],
      moderationState: ['clear', 'review', 'restricted', 'removed'],
    })) {
      if (changes[key] !== undefined) {
        if (!values.includes(String(changes[key])))
          throw new CommunityError('Invalid discussion state', 400, 'INVALID_STATE')
        data[key] = changes[key]
      }
    }
    if (changes.pinned !== undefined) {
      if (typeof changes.pinned !== 'boolean')
        throw new CommunityError('Invalid pin state', 400, 'INVALID_STATE')
      data.pinned = changes.pinned
    }
    if (!Object.keys(data).length)
      throw new CommunityError('No discussion changes supplied', 400, 'INVALID_STATE')
    const thread = await payload.update({
      collection: 'discussions',
      id,
      data,
      overrideAccess: true,
    })
    await emitCommunityEvent(payload, {
      type: 'community.moderation_applied',
      siteId: context.siteId,
      actorMemberId: context.actor.memberId,
      payload: { discussionId: id, changes: data, reason: changes.reason },
    })
    return thread
  })
}

export async function moderateDiscussionPost(
  payload: Payload,
  id: string,
  state: unknown,
  reason: unknown,
  context: CommunityPolicyContext,
) {
  moderator(context)
  if (
    !['clear', 'review', 'restricted', 'removed'].includes(String(state)) ||
    typeof reason !== 'string' ||
    !reason.trim()
  )
    throw new CommunityError(
      'A valid moderation state and reason are required',
      400,
      'INVALID_STATE',
    )
  const post = await payload
    .findByID({ collection: 'discussion-posts', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!post) throw new CommunityError('Post not found', 404, 'POST_NOT_FOUND')
  const discussionId = typeof post.discussion === 'string' ? post.discussion : post.discussion.id
  return withExecutionLock(payload, `discussion:${discussionId}`, async () => {
    const discussion = await payload.findByID({
      collection: 'discussions',
      id: discussionId,
      depth: 0,
      overrideAccess: true,
    })
    if (String(discussion.site) !== context.siteId)
      throw new CommunityError('Post not found', 404, 'POST_NOT_FOUND')
    const result = await payload.update({
      collection: 'discussion-posts',
      id,
      data: {
        moderationState: state as 'clear',
        status: state === 'clear' ? 'published' : state === 'removed' ? 'removed' : 'hidden',
        tombstoneLabel: state === 'removed' ? '[Comment removed by moderator]' : null,
      },
      overrideAccess: true,
    })
    await emitCommunityEvent(payload, {
      type: 'community.moderation_applied',
      siteId: context.siteId,
      actorMemberId: context.actor.memberId,
      payload: { commentId: id, discussionId, state, reason },
    })
    return result
  })
}
