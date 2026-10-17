import config from '@payload-config'
import { getPayload } from 'payload'
import { verifyCsrf } from '@/modules/identity/member-identity'

import {
  addComment,
  editComment,
  deleteComment,
  listDiscussionComments,
  resolveCommunityActor,
  CommunityError,
} from '@/modules/community/service'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const discussionId = url.searchParams.get('discussionId')
  const attachedToId = url.searchParams.get('attachedToId')
  const siteId = url.searchParams.get('siteId') ?? 'default'

  if (!discussionId && !attachedToId) {
    return Response.json(
      { error: 'Either discussionId or attachedToId query param is required' },
      { status: 400 },
    )
  }

  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)

  try {
    let targetDiscussionId = discussionId
    if (!targetDiscussionId && attachedToId) {
      const disc = await payload.find({
        collection: 'discussions',
        where: {
          and: [
            { site: { equals: siteId } },
            { kind: { equals: 'attached' } },
            { 'attachedTo.value': { equals: attachedToId } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      if (disc.docs[0]) {
        targetDiscussionId = String(disc.docs[0].id)
      } else {
        return Response.json({ comments: [] })
      }
    }

    const comments = await listDiscussionComments(payload, targetDiscussionId!, { siteId, actor })
    return Response.json({ comments })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!verifyCsrf(request.headers)) {
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  }
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? '')

  if (!siteId || !body.attachedToId || !body.body) {
    return Response.json({ error: 'siteId, attachedToId, and body are required' }, { status: 400 })
  }

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Sign-in required to comment' }, { status: 401 })
  }

  try {
    const requestedCollection = String(body.attachedToCollection ?? 'content')
    if (!['content', 'media-assets', 'albums'].includes(requestedCollection)) {
      return Response.json({ error: 'Unsupported comment target' }, { status: 400 })
    }
    const attachedToCollection = requestedCollection as 'content' | 'media-assets' | 'albums'
    let commentsPolicy: 'open' | 'members' | 'closed' = 'open'
    if (attachedToCollection === 'content') {
      const content = (await payload
        .findByID({
          collection: 'content',
          id: String(body.attachedToId),
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)) as unknown as Record<string, unknown> | null
      const contentSite =
        typeof content?.site === 'string'
          ? content.site
          : String((content?.site as { id?: unknown } | undefined)?.id ?? '')
      if (!content || contentSite !== siteId) {
        return Response.json({ error: 'Content not found' }, { status: 404 })
      }
      commentsPolicy = ['open', 'members', 'closed'].includes(String(content.commentsPolicy))
        ? (String(content.commentsPolicy) as 'open' | 'members' | 'closed')
        : 'closed'
    }

    const post = await addComment(
      payload,
      {
        siteId,
        attachedToCollection,
        attachedToId: String(body.attachedToId),
        canonicalPath: String(body.canonicalPath ?? `/content/${body.attachedToId}`),
        title: String(body.title ?? 'Discussion'),
        commentsPolicy,
        authorMemberId: actor.memberId,
        body: String(body.body),
        parentPostId: body.parentPostId ? String(body.parentPostId) : undefined,
        attachments: Array.isArray(body.attachments) ? (body.attachments as string[]) : undefined,
      },
      { siteId, actor },
    )
    return Response.json({ comment: post }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to post comment' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  if (!verifyCsrf(request.headers)) {
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  }
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? '')
  const commentId = String(body.commentId ?? '')
  const commentBody = String(body.body ?? '')

  if (!siteId || !commentId || !commentBody.trim()) {
    return Response.json({ error: 'siteId, commentId, and body are required' }, { status: 400 })
  }

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Sign-in required to edit comment' }, { status: 401 })
  }

  try {
    const updated = await editComment(
      payload,
      {
        siteId,
        commentId,
        authorMemberId: actor.memberId,
        body: commentBody,
      },
      { siteId, actor },
    )
    return Response.json({ success: true, comment: updated }, { status: 200 })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to edit comment' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!verifyCsrf(request.headers)) {
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  }
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? '')
  const commentId = String(body.commentId ?? '')

  if (!siteId || !commentId) {
    return Response.json({ error: 'siteId and commentId are required' }, { status: 400 })
  }

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Sign-in required to delete comment' }, { status: 401 })
  }

  try {
    const result = await deleteComment(
      payload,
      {
        siteId,
        commentId,
        actor,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
      },
      { siteId, actor },
    )
    return Response.json(result, { status: 200 })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to delete comment' }, { status: 500 })
  }
}
