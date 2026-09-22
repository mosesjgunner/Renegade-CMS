import config from '@payload-config'
import { getPayload } from 'payload'

import { resolveCommunityActor } from '@/modules/community/service'
import {
  CommentLifecycleError,
  getThreadLifecycle,
  updateThreadLifecycle,
} from '@/modules/community/thread-lifecycle'

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
  _request: Request,
  context: { params: Promise<{ site_id: string; thread_id: string }> },
) {
  const { site_id, thread_id } = await context.params
  const payload = await getPayload({ config })

  try {
    const thread = await getThreadLifecycle(payload, { siteId: site_id, threadId: thread_id })
    return json({ data: thread }, 200)
  } catch (err: unknown) {
    if (err instanceof CommentLifecycleError) {
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

  const closed =
    typeof body.closed === 'boolean'
      ? body.closed
      : typeof body.isClosed === 'boolean'
        ? body.isClosed
        : typeof body.is_closed === 'boolean'
          ? body.is_closed
          : undefined

  const frozen =
    typeof body.frozen === 'boolean'
      ? body.frozen
      : typeof body.isFrozen === 'boolean'
        ? body.isFrozen
        : typeof body.is_frozen === 'boolean'
          ? body.is_frozen
          : undefined

  const premoderationEnabled =
    typeof body.premoderation_enabled === 'boolean'
      ? body.premoderation_enabled
      : typeof body.premoderationEnabled === 'boolean'
        ? body.premoderationEnabled
        : undefined

  try {
    const updated = await updateThreadLifecycle(payload, {
      siteId: site_id,
      threadId: thread_id,
      actor,
      closed,
      frozen,
      premoderationEnabled,
    })

    return json({ data: updated }, 200)
  } catch (err: unknown) {
    if (err instanceof CommentLifecycleError) {
      return problem(err.status, err.code, err.message, err.details)
    }
    return problem(500, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'An error occurred')
  }
}
