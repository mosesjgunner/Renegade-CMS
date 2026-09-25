import config from '@payload-config'
import { getPayload } from 'payload'

import {
  replyToForumThread,
  resolveCommunityActor,
  CommunityError,
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

  const posts = await payload.find({
    collection: 'discussion-posts',
    where: {
      and: [
        { discussion: { equals: discussionId } },
        { status: { not_equals: 'removed' } },
      ],
    },
    sort: 'displayOrder',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })

  return Response.json({ posts: posts.docs })
}
