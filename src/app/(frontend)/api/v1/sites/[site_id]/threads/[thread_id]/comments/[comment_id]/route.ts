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
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return problem(400, 'INVALID_JSON', 'Request body must be valid JSON.')
  }

  const newBody = String(body.body ?? body.bodyHtml ?? body.body_html ?? '').trim()
  if (!newBody) {
    return problem(422, 'EMPTY_COMMENT_BODY', 'Comment body cannot be empty.')
  }

  const actorPermissions =
    (body.permissions as string[]) ??
    request.headers
      .get('x-permissions')
      ?.split(',')
      .map((p) => p.trim()) ??
    []

  try {
    const updated = await editThreadComment(payload, {
      siteId: site_id,
      threadId: thread_id,
      commentId: comment_id,
      newBody,
      actor: {
        ...actor,
        permissions: actorPermissions,
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
