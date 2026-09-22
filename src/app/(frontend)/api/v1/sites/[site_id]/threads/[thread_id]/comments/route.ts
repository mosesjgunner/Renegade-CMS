import config from '@payload-config'
import { getPayload } from 'payload'

import {
  CommentComposerError,
  editThreadComment,
  postThreadComment,
} from '@/modules/community/comment-composer'
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

export async function GET(
  request: Request,
  context: { params: Promise<{ site_id: string; thread_id: string }> },
) {
  const { site_id, thread_id } = await context.params
  const url = new URL(request.url)
  const sort = url.searchParams.get('sort') ?? 'chronological'
  const maxDepthParam = url.searchParams.get('max_depth') ?? url.searchParams.get('depth')
  const maxDepth = maxDepthParam ? parseInt(maxDepthParam, 10) : 5

  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)

  const { getThreadCommentsTree } = await import('@/modules/community/thread-lifecycle')

  try {
    const comments = await getThreadCommentsTree(payload, {
      threadId: thread_id,
      siteId: site_id,
      sort,
      maxDepth,
      includeNonPublic: actor.isStaff,
    })

    return json({ data: comments }, 200)
  } catch (err: unknown) {
    return problem(500, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'An error occurred')
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ site_id: string; thread_id: string }> },
) {
  const { site_id, thread_id } = await context.params

  const idempotencyKey = request.headers.get('idempotency-key')
  if (!idempotencyKey || !idempotencyKey.trim()) {
    return problem(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'An Idempotency-Key header is required for creating comments.',
    )
  }

  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)

  const memberId =
    actor.memberId ??
    request.headers.get('x-member-id') ??
    request.headers.get('x-author-id') ??
    (actor.isStaff ? actor.userId : undefined)

  if (!memberId && actor.kind === 'anonymous') {
    return problem(401, 'UNAUTHORIZED', 'Authentication required to post comments.')
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return problem(400, 'INVALID_JSON', 'Request body must be valid JSON.')
  }

  const commentContent = String(body.body ?? body.bodyHtml ?? body.body_html ?? '').trim()
  if (!commentContent) {
    return problem(422, 'EMPTY_COMMENT_BODY', 'Comment body cannot be empty.')
  }

  try {
    const result = await postThreadComment(payload, {
      siteId: site_id,
      threadId: thread_id,
      parentId: (body.parentId ?? body.parent_id) as string | undefined,
      authorId: String(memberId),
      authorType: (body.authorType as 'member') ?? 'member',
      body: commentContent,
      idempotencyKey,
      actor,
    })

    return json(
      { data: result.comment },
      result.replayed ? 200 : 201,
      result.replayed ? { 'idempotency-replayed': 'true' } : {},
    )
  } catch (err: unknown) {
    if (err instanceof CommentComposerError) {
      return problem(err.status, err.code, err.message, err.details)
    }
    return problem(500, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'An error occurred')
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ site_id: string; thread_id: string }> },
) {
  const { site_id, thread_id } = await context.params
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return problem(400, 'INVALID_JSON', 'Request body must be valid JSON.')
  }

  const commentId = String(body.commentId ?? body.comment_id ?? '')
  if (!commentId) {
    return problem(422, 'COMMENT_ID_REQUIRED', 'commentId is required in the request body.')
  }

  const newBody = String(body.body ?? body.bodyHtml ?? body.body_html ?? '').trim()
  if (!newBody) {
    return problem(422, 'EMPTY_COMMENT_BODY', 'Comment body cannot be empty.')
  }

  try {
    const updated = await editThreadComment(payload, {
      siteId: site_id,
      threadId: thread_id,
      commentId,
      newBody,
      actor: {
        ...actor,
        permissions: (body.permissions as string[]) ?? undefined,
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
