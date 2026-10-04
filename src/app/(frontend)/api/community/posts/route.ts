import config from '@payload-config'
import { getPayload } from 'payload'

import {
  replyToForumThread,
  resolveCommunityActor,
  CommunityError,
  listDiscussionComments,
} from '@/modules/community/service'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? '')
  const discussionId = String(body.discussionId ?? '')
  const content = String(body.body ?? '')

  if (!siteId || !discussionId || !content) {
    return Response.json({ error: 'siteId, discussionId, and body are required' }, { status: 400 })
  }

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
  const url = new URL(request.url)
  const discussionId = url.searchParams.get('discussionId') ?? ''

  if (!discussionId) {
    return Response.json({ error: 'discussionId is required' }, { status: 400 })
  }

  const siteId = url.searchParams.get('siteId') ?? ''
  if (!siteId) return Response.json({ error: 'siteId is required' }, { status: 400 })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  try {
    const posts = await listDiscussionComments(payload, discussionId, { siteId, actor })
    return Response.json({ posts }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof CommunityError)
      return Response.json({ error: error.message }, { status: error.status })
    return Response.json({ error: 'Discussion unavailable' }, { status: 404 })
  }
}
