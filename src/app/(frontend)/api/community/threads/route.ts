import {
  browseDiscussions,
  discussionPage,
  updateDiscussion,
} from '@/modules/community/discussion-operations'
import { discussionRequestSite } from '@/modules/community/discussion-operations'
import config from '@payload-config'
import { getPayload } from 'payload'
import { verifyCsrf } from '@/modules/identity/member-identity'

import { isRegisteredCollection } from '@/modules/public/registered-collections'
import {
  createForumThread,
  resolveCommunityActor,
  CommunityError,
} from '@/modules/community/service'
import { evaluateCommunityPolicy } from '@/modules/community/policy'

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers)) {
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  }
  const payload = await getPayload({ config })
  if (
    !isRegisteredCollection(payload, 'discussions') ||
    !isRegisteredCollection(payload, 'forums')
  ) {
    return Response.json(
      { error: 'Community discussions service is unavailable.' },
      { status: 503 },
    )
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? '')
  const forumId = String(body.forumId ?? '')
  const title = String(body.title ?? '')
  const content = String(body.body ?? '')

  if (!siteId || !forumId || !title || !content) {
    return Response.json(
      { error: 'siteId, forumId, title, and body are required' },
      { status: 400 },
    )
  }

  if (!(await discussionRequestSite(payload, request.headers, siteId)))
    return Response.json({ error: 'Community site unavailable' }, { status: 404 })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Sign-in required to create a thread' }, { status: 401 })
  }

  try {
    const result = await createForumThread(
      payload,
      {
        siteId,
        forumId,
        authorMemberId: actor.memberId,
        title,
        body: content,
        attachments: Array.isArray(body.attachments) ? (body.attachments as string[]) : undefined,
        visibility: (body.visibility as 'public') ?? 'public',
      },
      { siteId, actor },
    )

    return Response.json(result, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to create thread' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  if (!isRegisteredCollection(payload, 'discussions'))
    return Response.json({ error: 'Community unavailable' }, { status: 503 })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? ''
  if (!(await discussionRequestSite(payload, request.headers, siteId)))
    return Response.json({ error: 'Community site unavailable' }, { status: 404 })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  const threadId = url.searchParams.get('threadId')
  if (threadId) {
    const discussion = await payload
      .findByID({ collection: 'discussions', id: threadId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (
      !discussion ||
      discussion.kind !== 'thread' ||
      String(discussion.site) !== siteId ||
      !evaluateCommunityPolicy(
        { siteId, actor },
        {
          siteId,
          ownerId: String(discussion.owner ?? ''),
          visibility: discussion.visibility,
          moderationState: discussion.moderationState,
          status: discussion.status,
        },
        'read',
      ).allowed
    )
      return Response.json({ error: 'Thread not found' }, { status: 404 })
    return Response.json(
      { thread: discussion },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  }
  let forumId = url.searchParams.get('forumId') ?? ''
  const slug = url.searchParams.get('forumSlug')
  if (slug && !forumId) {
    const result = await payload.find({
      collection: 'forums',
      where: { and: [{ site: { equals: siteId } }, { slug: { equals: slug } }] },
      limit: 1,
      overrideAccess: true,
    })
    if (!result.docs[0]) return Response.json({ error: 'Forum not found' }, { status: 404 })
    forumId = String(result.docs[0].id)
  }
  const result = await browseDiscussions(payload, {
    siteId,
    forumId,
    page: discussionPage(url.searchParams.get('page')),
    query: url.searchParams.get('q') ?? '',
  })
  return Response.json(
    { threads: result.docs, page: result.page, hasNextPage: result.hasNextPage },
    { headers: { 'cache-control': 'private, no-store' } },
  )
}

export async function PATCH(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  const payload = await getPayload({ config })
  if (!isRegisteredCollection(payload, 'discussions'))
    return Response.json({ error: 'Community unavailable' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  const siteId = String(body.siteId ?? '')
  if (!(await discussionRequestSite(payload, request.headers, siteId)))
    return Response.json({ error: 'Community site unavailable' }, { status: 404 })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  try {
    const thread = await updateDiscussion(payload, String(body.discussionId ?? ''), body, {
      siteId,
      actor,
    })
    return Response.json({ thread })
  } catch (error) {
    if (error instanceof CommunityError)
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    return Response.json({ error: 'Discussion update failed' }, { status: 500 })
  }
}
