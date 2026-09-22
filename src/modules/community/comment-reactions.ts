import type { Payload } from 'payload'

import { executeDbQuery } from './comment-composer'

export const DEFAULT_COMMENT_REACTION_CODES = ['thumbs_up', 'heart', 'insightful', 'applause'] as const
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

export async function getSiteCommentReactionCodes(payload: Payload, siteId: string): Promise<string[]> {
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

async function getReactionTarget(payload: Payload, commentId: string): Promise<CommentReactionTarget> {
  const rows = await executeDbQuery<CommentReactionTarget>(
    payload,
    `SELECT c.id, c.status, t.site_id AS "siteId", t.is_frozen AS "threadFrozen", t.is_closed AS "threadClosed"
     FROM comments c JOIN comment_threads t ON t.id = c.thread_id
     WHERE c.id = $1`,
    [commentId],
  )
  if (!rows[0]) throw new CommentReactionError('Comment not found.', 404, 'COMMENT_NOT_FOUND')
  return rows[0]
}

/** Rebuilds the disposable counter projection exclusively from authoritative raw reactions. */
export async function rebuildCommentReactionCounters(
  payload: Payload,
  input: { commentId?: string } = {},
): Promise<void> {
  const scope = input.commentId ? 'WHERE comment_id = $1' : ''
  const values = input.commentId ? [input.commentId] : []
  await executeDbQuery(
    payload,
    `WITH raw AS MATERIALIZED (
       SELECT comment_id, reaction_code, COUNT(*)::integer AS reaction_count
       FROM comment_reactions ${scope}
       GROUP BY comment_id, reaction_code
     ), wiped AS (
       DELETE FROM comment_reaction_counters ${scope} RETURNING comment_id
     )
     INSERT INTO comment_reaction_counters (comment_id, reaction_code, reaction_count, updated_at)
     SELECT comment_id, reaction_code, reaction_count, now() FROM raw`,
    values,
  )
}

export async function toggleCommentReaction(
  payload: Payload,
  input: { siteId: string; commentId: string; memberId: string; reactionCode: string },
): Promise<{ added: boolean; reactionCode: string; count: number }> {
  const reactionCode = input.reactionCode.trim()
  const allowedCodes = await getSiteCommentReactionCodes(payload, input.siteId)
  if (!allowedCodes.includes(reactionCode)) {
    throw new CommentReactionError('Reaction code is not enabled for this site.', 422, 'INVALID_REACTION_CODE')
  }

  const target = await getReactionTarget(payload, input.commentId)
  if (target.siteId !== input.siteId) {
    throw new CommentReactionError('Site mismatch for this comment.', 403, 'SITE_MISMATCH')
  }
  if (target.status === 'deleted') {
    throw new CommentReactionError('Cannot react to a deleted comment.', 422, 'COMMENT_DELETED')
  }
  if (target.threadFrozen) {
    throw new CommentReactionError('Cannot react to a frozen comment thread.', 403, 'COMMENT_FROZEN')
  }

  // One advisory transaction lock per comment/code serializes both this member's toggle and its
  // shared counter. The unique constraint remains the durable correctness backstop.
  const rows = await executeDbQuery<{ added: boolean; count: number }>(
    payload,
    `WITH tuple_lock AS MATERIALIZED (
       SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $3, 0))
     ), removed AS (
       DELETE FROM comment_reactions
       WHERE comment_id = $1 AND member_id = $2 AND reaction_code = $3
         AND EXISTS (SELECT 1 FROM tuple_lock)
       RETURNING id
     ), inserted AS (
       INSERT INTO comment_reactions (comment_id, member_id, reaction_code)
       SELECT $1, $2, $3 FROM tuple_lock WHERE NOT EXISTS (SELECT 1 FROM removed)
       ON CONFLICT (comment_id, member_id, reaction_code) DO NOTHING
       RETURNING id
     ), existing_count AS (
       SELECT COUNT(*)::integer AS count FROM comment_reactions
       WHERE comment_id = $1 AND reaction_code = $3
     ), result AS (
       SELECT EXISTS (SELECT 1 FROM inserted) AS added,
         count + (SELECT COUNT(*)::integer FROM inserted) - (SELECT COUNT(*)::integer FROM removed) AS count
       FROM existing_count
     ), projection AS (
       INSERT INTO comment_reaction_counters (comment_id, reaction_code, reaction_count, updated_at)
       SELECT $1, $3, count, now() FROM result
       ON CONFLICT (comment_id, reaction_code) DO UPDATE
       SET reaction_count = EXCLUDED.reaction_count, updated_at = EXCLUDED.updated_at
     )
     SELECT added, count FROM result`,
    [input.commentId, input.memberId, reactionCode],
  )
  const result = rows[0]
  return { added: Boolean(result?.added), reactionCode, count: Number(result?.count ?? 0) }
}
