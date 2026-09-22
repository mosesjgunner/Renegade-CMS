import type { Payload } from 'payload'

export class CommentIdentityError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'CommentIdentityError'
  }
}

type QueryablePayload = Payload & {
  db: { pool?: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> } }
}

async function query<T>(
  payload: QueryablePayload,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  if (!payload.db.pool?.query) throw new Error('Comment identity requires the PostgreSQL adapter')
  return (await payload.db.pool.query(text, values)).rows as T[]
}

export type CommentThread = {
  id: string
  siteId: string
  canonicalContentId: string
  contentType: string
  isClosed: boolean
  isFrozen: boolean
  premoderationEnabled: boolean
}

/** Validates through the canonical Payload content collection, never a URL or slug. */
export async function assertCanonicalCommentContent(
  payload: Payload,
  siteId: string,
  canonicalContentId: string,
): Promise<{ id: string; contentType: string }> {
  const found = await payload.find({
    collection: 'content',
    where: { and: [{ id: { equals: canonicalContentId } }, { site: { equals: siteId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const content = found.docs[0] as unknown as { id: string; contentType?: string } | undefined
  if (!content)
    throw new CommentIdentityError(
      'Canonical content was not found for this site',
      422,
      'INVALID_CANONICAL_CONTENT',
    )
  return { id: String(content.id), contentType: String(content.contentType ?? 'content') }
}

/** Atomic upsert makes concurrent creation converge on exactly one canonical thread. */
export async function getOrCreateCommentThread(
  payload: QueryablePayload,
  input: { siteId: string; canonicalContentId: string; premoderationEnabled?: boolean },
): Promise<CommentThread> {
  const content = await assertCanonicalCommentContent(
    payload,
    input.siteId,
    input.canonicalContentId,
  )
  const rows = await query<CommentThread>(
    payload,
    `
    INSERT INTO comment_threads (site_id, canonical_content_id, content_type, premoderation_enabled)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (site_id, canonical_content_id) DO UPDATE SET updated_at = comment_threads.updated_at
    RETURNING id, site_id AS "siteId", canonical_content_id AS "canonicalContentId",
      content_type AS "contentType", is_closed AS "isClosed", is_frozen AS "isFrozen",
      premoderation_enabled AS "premoderationEnabled"`,
    [input.siteId, content.id, content.contentType, input.premoderationEnabled ?? false],
  )
  return rows[0]!
}

export async function createCanonicalComment(
  payload: QueryablePayload,
  input: {
    threadId: string
    parentId?: string | null
    authorId: string
    authorType: 'member' | 'anonymous' | 'system'
    bodyRaw: string
    bodyHtml: string
    clientMutationId?: string | null
    status?: 'visible' | 'pending_review' | 'rejected' | 'deleted'
  },
) {
  const parents = input.parentId
    ? await query<{ id: string; threadId: string; rootId: string | null; depth: number }>(
        payload,
        `SELECT id, thread_id AS "threadId", root_id AS "rootId", depth FROM comments WHERE id = $1`,
        [input.parentId],
      )
    : []
  const parent = parents[0]
  if (input.parentId && (!parent || parent.threadId !== input.threadId)) {
    throw new CommentIdentityError(
      'Parent comment is not in this thread',
      422,
      'INVALID_COMMENT_PARENT',
    )
  }
  const depth = parent ? parent.depth + 1 : 0
  if (depth > 5)
    throw new CommentIdentityError(
      'Comment nesting cannot exceed depth 5',
      422,
      'COMMENT_DEPTH_EXCEEDED',
    )
  const rows = await query<Record<string, unknown>>(
    payload,
    `
    INSERT INTO comments (thread_id, parent_id, root_id, author_id, author_type, depth, body_raw, body_html, client_mutation_id, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      input.threadId,
      parent?.id ?? null,
      parent ? (parent.rootId ?? parent.id) : null,
      input.authorId,
      input.authorType,
      depth,
      input.bodyRaw,
      input.bodyHtml,
      input.clientMutationId ?? null,
      input.status ?? 'visible',
    ],
  )
  return rows[0]
}

/** Tombstones retain IDs and parent links so descendants never detach. */
export async function tombstoneCanonicalComment(payload: QueryablePayload, commentId: string) {
  const rows = await query<Record<string, unknown>>(
    payload,
    `
    UPDATE comments SET status = 'deleted', body_raw = '', body_html = '', deleted_at = now(), updated_at = now()
    WHERE id = $1 RETURNING *`,
    [commentId],
  )
  if (!rows[0]) throw new CommentIdentityError('Comment not found', 404, 'COMMENT_NOT_FOUND')
  return rows[0]
}
