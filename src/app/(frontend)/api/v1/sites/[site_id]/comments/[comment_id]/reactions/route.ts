import config from '@payload-config'
import { getPayload } from 'payload'

import { CommentReactionError, toggleCommentReaction } from '@/modules/community/comment-reactions'
import { resolveCommunityActor } from '@/modules/community/service'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-renegade-api-version': 'v1' },
  })

export async function POST(
  request: Request,
  context: { params: Promise<{ site_id: string; comment_id: string }> },
) {
  const { site_id, comment_id } = await context.params
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, site_id)
  if (actor.kind === 'anonymous' || !actor.memberId || actor.status !== 'active') {
    return json(
      { error: { code: 'UNAUTHORIZED', message: 'An active member session is required.' } },
      401,
    )
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const reactionCode = String(body?.reactionCode ?? body?.reaction_code ?? '').trim()
  if (!reactionCode)
    return json(
      { error: { code: 'REACTION_CODE_REQUIRED', message: 'reactionCode is required.' } },
      422,
    )
  try {
    return json({
      data: await toggleCommentReaction(payload, {
        siteId: site_id,
        commentId: comment_id,
        memberId: actor.memberId,
        reactionCode,
      }),
    })
  } catch (err) {
    if (err instanceof CommentReactionError)
      return json({ error: { code: err.code, message: err.message } }, err.status)
    return json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'An error occurred',
        },
      },
      500,
    )
  }
}
