import config from '@payload-config'
import { getPayload } from 'payload'

import {
  createForumThread,
  resolveCommunityActor,
  CommunityError,
} from '@/modules/community/service'
import { evaluateCommunityPolicy } from '@/modules/community/policy'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
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
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? ''
  if (!siteId) return Response.json({ error: 'siteId is required' }, { status: 400 })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  const visibleThread = (thread: Record<string, unknown>) => {
    if (
      String(thread.site) !== siteId ||
      !evaluateCommunityPolicy(
        { siteId, actor },
        {
          siteId: String(thread.site),
          visibility: String(thread.visibility),
          moderationState: String(thread.moderationState),
          status: String(thread.status),
          ownerId: String(thread.owner ?? ''),
        },
        'read',
      ).allowed
    )
      return null
    return {
      id: thread.id,
      title: thread.title,
      canonicalPath: thread.canonicalPath,
      status: thread.status,
      commentsPolicy: thread.commentsPolicy,
      visibility: thread.visibility,
      forum: thread.forum,
    }
  }
  let forumId = url.searchParams.get('forumId') ?? ''
  const forumSlug = url.searchParams.get('forumSlug') ?? ''
  const threadId = url.searchParams.get('threadId') ?? ''

  if (threadId) {
    try {
      const discussion = await payload.findByID({
        collection: 'discussions',
        id: threadId,
        depth: 0,
        overrideAccess: true,
      })
      const thread = visibleThread(discussion as unknown as Record<string, unknown>)
      if (!thread) return Response.json({ error: 'Thread not found' }, { status: 404 })
      return Response.json({ thread })
    } catch {
      return Response.json({ error: 'Thread not found' }, { status: 404 })
    }
  }

  if (!forumId && forumSlug) {
    const forums = await payload.find({
      collection: 'forums',
      where: { and: [{ site: { equals: siteId } }, { slug: { equals: forumSlug } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (forums.docs.length > 0) {
      forumId = String(forums.docs[0].id)
    }
  }

  const whereConditions: any[] = [{ kind: { equals: 'thread' } }]
  if (siteId) whereConditions.push({ site: { equals: siteId } })
  if (forumId) whereConditions.push({ forum: { equals: forumId } })

  const threads = await payload.find({
    collection: 'discussions',
    where: { and: whereConditions },
    sort: '-createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })

  return Response.json({
    threads: threads.docs
      .map((doc) => visibleThread(doc as unknown as Record<string, unknown>))
      .filter(Boolean),
  })
}
