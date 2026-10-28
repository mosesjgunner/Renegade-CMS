import { versionedCommentTarget } from '@/modules/community/discussion-operations'
import { discussionRequestSite } from '@/modules/community/discussion-operations'
import { verifyCsrf } from '@/modules/identity/member-identity'
import config from '@payload-config'
import { getPayload } from 'payload'

import { CommentComposerError, editThreadComment } from '@/modules/community/comment-composer'
import { resolveCommunityActor } from '@/modules/community/service'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-renegade-api-version': 'v1',
      ...extra,
    },
  })

const problem = (status: number, code: string, message: string, details?: unknown) =>
  json({ error: { code, message, details } }, status)

export async function PATCH(
  request: Request,
  context: { params: Promise<{ site_id: string; thread_id: string; comment_id: string }> },
) {
  const { site_id, thread_id, comment_id } = await context.params
  if (request.method !== 'GET' && !verifyCsrf(request.headers))
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  const payload = await getPayload({ config })
  if (!(await discussionRequestSite(payload, request.headers, site_id)))
    return Response.json({ error: 'Community site unavailable' }, { status: 404 })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)
  if (request.method !== 'GET' && (!actor.memberId || actor.status !== 'active'))
    return Response.json({ error: 'Active member authentication required' }, { status: 401 })
  const target = await versionedCommentTarget(payload, site_id, thread_id).catch(() => null)
  if (!target)
    return Response.json({ error: 'Published discussion target not found' }, { status: 404 })
  if (
    request.method !== 'GET' &&
    !actor.isModerator &&
    (target.thread.isClosed || target.thread.isFrozen || target.content.commentsPolicy === 'closed')
  )
    return Response.json({ error: 'Discussion is closed or locked' }, { status: 403 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return problem(400, 'INVALID_JSON', 'Request body must be valid JSON.')
  }

  const newBody = String(body.body ?? body.bodyHtml ?? body.body_html ?? '').trim()
  if (!newBody) {
    return problem(422, 'EMPTY_COMMENT_BODY', 'Comment body cannot be empty.')
  }

  try {
    const updated = await editThreadComment(payload, {
      siteId: site_id,
      threadId: thread_id,
      commentId: comment_id,
      newBody,
      actor: {
        ...actor,
        isStaff: actor.isStaff || actor.isModerator,
        permissions: actor.isModerator ? ['staff:community_moderate'] : [],
      },
      reason: body.reason ? String(body.reason) : undefined,
    })

    return json({ data: updated }, 200)
  } catch (err: unknown) {
    if (err instanceof CommentComposerError) {
      return problem(err.status, err.code, err.message, err.details)
    }
    return problem(500, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'An error occurred')
  }
}
