import type { Payload } from 'payload'

import { executeDbQuery } from './db-query'

export const DEFAULT_COMMENT_REACTION_CODES = [
  'thumbs_up',
  'heart',
  'insightful',
  'applause',
] as const
export type CommentReactionCode = (typeof DEFAULT_COMMENT_REACTION_CODES)[number]

export class CommentReactionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'CommentReactionError'
  }
}

type CommentReactionTarget = {
  id: string
  status: string
  siteId: string
  threadFrozen: boolean
  threadClosed: boolean
}

export async function getSiteCommentReactionCodes(
  payload: Payload,
  siteId: string,
): Promise<string[]> {
  const site = (await payload.findByID({
    collection: 'sites',
    id: siteId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as { commentReactionCodes?: unknown } | null
  if (!site) throw new CommentReactionError('Site not found.', 404, 'SITE_NOT_FOUND')
  const codes = site.commentReactionCodes
  return Array.isArray(codes) ? codes.map(String) : [...DEFAULT_COMMENT_REACTION_CODES]
}

function relationId(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>))
    return String((value as Record<string, unknown>).id ?? '')
  return ''
}

/**
 * RC2-DEBT-20 fold: reaction targets resolve against the live
 * discussion-posts store. A removed post is the deleted state; a
 * locked/archived discussion is the frozen state.
 */
async function getReactionTarget(
  payload: Payload,
  commentId: string,
): Promise<CommentReactionTarget> {
  const post = (await payload
    .findByID({ collection: 'discussion-posts', id: commentId, depth: 0, overrideAccess: true })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!post) throw new CommentReactionError('Comment not found.', 404, 'COMMENT_NOT_FOUND')
  const discussion = (await payload
    .findByID({
      collection: 'discussions',
      id: relationId(post.discussion),
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!discussion) throw new CommentReactionError('Comment not found.', 404, 'COMMENT_NOT_FOUND')
  const discussionStatus = String(discussion.status ?? 'open')
  return {
    id: String(post.id),
    status: String(post.status) === 'removed' ? 'deleted' : String(post.status ?? ''),
    siteId: relationId(discussion.site),
    threadFrozen: discussionStatus === 'locked' || discussionStatus === 'archived',
    threadClosed:
      String(discussion.commentsPolicy ?? 'open') === 'closed' || discussionStatus !== 'open',
  }
}

/**
 * RC2-DEBT-20 fold: toggles land in the live community_reactions
 * table (target_type 'post'), the same store the community surface
 * aggregates. The v1 reaction code is stored as the reaction key, so
 * counts stay coherent per surface vocabulary. The disposable
 * comment_reaction_counters projection retired with the v1 store —
 * counts are aggregated from the raw rows, as the live path does.
 */
export async function toggleCommentReaction(
  payload: Payload,
  input: { siteId: string; commentId: string; memberId: string; reactionCode: string },
): Promise<{ added: boolean; reactionCode: string; count: number }> {
  const reactionCode = input.reactionCode.trim()
  const allowedCodes = await getSiteCommentReactionCodes(payload, input.siteId)
  if (!allowedCodes.includes(reactionCode)) {
    throw new CommentReactionError(
      'Reaction code is not enabled for this site.',
      422,
      'INVALID_REACTION_CODE',
    )
  }

  const target = await getReactionTarget(payload, input.commentId)
  if (target.siteId !== input.siteId) {
    throw new CommentReactionError('Site mismatch for this comment.', 403, 'SITE_MISMATCH')
  }
  if (target.status === 'deleted') {
    throw new CommentReactionError('Cannot react to a deleted comment.', 422, 'COMMENT_DELETED')
  }
  if (target.threadFrozen) {
    throw new CommentReactionError(
      'Cannot react to a frozen comment thread.',
      403,
      'COMMENT_FROZEN',
    )
  }

  // One advisory lock per comment/code serializes the toggle; the
  // unique index on (site, member, target, emoji) is the backstop.
  const rows = await executeDbQuery<{ added: boolean; count: number }>(
    payload,
    `WITH tuple_lock AS MATERIALIZED (
       SELECT pg_advisory_xact_lock(hashtextextended($2::text || ':' || $4, 0))
     ), removed AS (
       DELETE FROM community_reactions
       WHERE target_type = 'post' AND target_id = $2 AND member_id = $3 AND emoji = $4
         AND EXISTS (SELECT 1 FROM tuple_lock)
       RETURNING id
     ), inserted AS (
       INSERT INTO community_reactions (site_id, target_type, target_id, member_id, emoji)
       SELECT $1, 'post', $2, $3, $4 FROM tuple_lock WHERE NOT EXISTS (SELECT 1 FROM removed)
       ON CONFLICT (site_id, member_id, target_type, target_id, emoji) DO NOTHING
       RETURNING id
     ), existing_count AS (
       SELECT COUNT(*)::integer AS count FROM community_reactions
       WHERE target_type = 'post' AND target_id = $2 AND emoji = $4
     )
     SELECT EXISTS (SELECT 1 FROM inserted) AS added,
       count + (SELECT COUNT(*)::integer FROM inserted) - (SELECT COUNT(*)::integer FROM removed) AS count
     FROM existing_count`,
    [input.siteId, input.commentId, input.memberId, reactionCode],
  )
  const result = rows[0]
  return { added: Boolean(result?.added), reactionCode, count: Number(result?.count ?? 0) }
}
