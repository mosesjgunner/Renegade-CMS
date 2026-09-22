import config from '@payload-config'
import { getPayload } from 'payload'

import {
  createForumThread,
  resolveCommunityActor,
  CommunityError,
} from '@/modules/community/service'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? '')
  const forumId = String(body.forumId ?? '')
  const title = String(body.title ?? '')
  const content = String(body.body ?? '')

  if (!siteId || !forumId || !title || !content) {
    return Response.json({ error: 'siteId, forumId, title, and body are required' }, { status: 400 })
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
