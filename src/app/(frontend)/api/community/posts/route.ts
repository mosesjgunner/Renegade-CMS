import { discussionRequestSite } from '@/modules/community/discussion-operations'
import {
  discussionPostsPage,
  discussionPage,
  moderateDiscussionPost,
} from '@/modules/community/discussion-operations'
import config from '@payload-config'
import { getPayload } from 'payload'
import { verifyCsrf } from '@/modules/identity/member-identity'

import { isRegisteredCollection } from '@/modules/public/registered-collections'
import {
  replyToForumThread,
  resolveCommunityActor,
  CommunityError,
} from '@/modules/community/service'

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers)) {
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  }
  const payload = await getPayload({ config })
  if (
    !isRegisteredCollection(payload, 'discussions') ||
    !isRegisteredCollection(payload, 'discussion-posts')
  ) {
    return Response.json(
      { error: 'Community discussions service is unavailable.' },
      { status: 503 },
    )
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? '')
  const discussionId = String(body.discussionId ?? '')
  const content = String(body.body ?? '')

  if (!siteId || !discussionId || !content) {
    return Response.json({ error: 'siteId, discussionId, and body are required' }, { status: 400 })
  }

  if (!(await discussionRequestSite(payload, request.headers, siteId)))
    return Response.json({ error: 'Community site unavailable' }, { status: 404 })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Sign-in required to post reply' }, { status: 401 })
  }

  try {
    const post = await replyToForumThread(
      payload,
      {
        siteId,
        discussionId,
        authorMemberId: actor.memberId,
        body: content,
        parentPostId: body.parentPostId ? String(body.parentPostId) : undefined,
        quotePostId: body.quotePostId ? String(body.quotePostId) : undefined,
        attachments: Array.isArray(body.attachments) ? (body.attachments as string[]) : undefined,
      },
      { siteId, actor },
    )

    return Response.json({ post }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to reply' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  if (!isRegisteredCollection(payload, 'discussions')) {
    return Response.json(
      { error: 'Community discussions service is unavailable.' },
      { status: 503 },
    )
  }
  const url = new URL(request.url)
  const discussionId = url.searchParams.get('discussionId') ?? ''

  if (!discussionId) {
    return Response.json({ error: 'discussionId is required' }, { status: 400 })
  }

  const siteId = url.searchParams.get('siteId') ?? ''
  if (!siteId) return Response.json({ error: 'siteId is required' }, { status: 400 })
  if (!(await discussionRequestSite(payload, request.headers, siteId)))
    return Response.json({ error: 'Community site unavailable' }, { status: 404 })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  try {
    const result = await discussionPostsPage(
      payload,
      discussionId,
      { siteId, actor },
      discussionPage(url.searchParams.get('page')),
    )
    return Response.json(result, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof CommunityError)
      return Response.json({ error: error.message }, { status: error.status })
    return Response.json({ error: 'Discussion unavailable' }, { status: 404 })
  }
}

export async function PATCH(request: Request) {
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  const payload = await getPayload({ config })
  if (!isRegisteredCollection(payload, 'discussion-posts'))
    return Response.json({ error: 'Community unavailable' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  const siteId = String(body.siteId ?? '')
  if (!(await discussionRequestSite(payload, request.headers, siteId)))
    return Response.json({ error: 'Community site unavailable' }, { status: 404 })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  try {
    const post = await moderateDiscussionPost(
      payload,
      String(body.postId ?? ''),
      body.moderationState,
      body.reason,
      { siteId, actor },
    )
    return Response.json({ post })
  } catch (error) {
    if (error instanceof CommunityError)
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    return Response.json({ error: 'Moderation failed' }, { status: 500 })
  }
}
