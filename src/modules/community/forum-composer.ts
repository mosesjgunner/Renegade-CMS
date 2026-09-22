import type { Payload } from 'payload'

import { sanitizeCommentHtml } from './comment-composer'
import { executeDbQuery } from './comment-composer'
import { requireForumSpaceCapability, resolveForumSpaceAccess } from './forum-space-access'
import { assertMemberCanPost, ModerationActionError } from './moderation-actions'
import { triageSubmission } from './abuse-triage'

export class ForumComposerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ForumComposerError'
  }
}

type Client = {
  query: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[] }>
  release?: () => void
}
type PoolPayload = Payload & { db: { pool?: { connect?: () => Promise<Client> } } }
type Topic = { id: string; spaceId: string; isLocked: boolean }

/** The search worker owns projection; mutations only stage an ACL-bearing, deduplicated request. */
async function enqueueForumSearchSync(query: Client['query'], siteId: string, topicId: string, mutationId: string) {
  const visibility = (await query<{ visibility: string }>('SELECT visibility FROM forum_spaces s JOIN forum_topics t ON t.space_id=s.id WHERE t.id=$1', [topicId])).rows[0]?.visibility ?? 'private'
  const key = `forum.search_sync.v1:${topicId}:${mutationId}`
  await query(`INSERT INTO outbox_events (event_type,payload,idempotency_key,created_at) VALUES ('forum.search_sync.v1',$1::jsonb,$2,now()) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`, [JSON.stringify({ version: 1, siteId, topicId, acl: { visibility, requiresMembership: ['private', 'hidden'].includes(visibility) } }), key])
}

function requireBody(body: string) {
  const raw = String(body ?? '').trim()
  if (!raw)
    throw new ForumComposerError('Forum post body cannot be empty.', 422, 'EMPTY_FORUM_POST')
  const html = sanitizeCommentHtml(raw)
  if (!html.trim())
    throw new ForumComposerError('Forum post contains no allowed content.', 422, 'EMPTY_FORUM_POST')
  return { raw, html }
}

async function withTransaction<T>(
  payload: Payload,
  work: (query: Client['query']) => Promise<T>,
): Promise<T> {
  const pool = (payload as PoolPayload).db?.pool
  if (pool?.connect) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client.query.bind(client))
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release?.()
    }
  }
  await executeDbQuery(payload, 'BEGIN')
  try {
    const result = await work((text, values) =>
      executeDbQuery(payload, text, values).then((rows) => ({ rows })),
    )
    await executeDbQuery(payload, 'COMMIT')
    return result
  } catch (error) {
    try {
      await executeDbQuery(payload, 'ROLLBACK')
    } catch {}
    throw error
  }
}

async function assertQuoteReadable(
  payload: Payload,
  siteId: string,
  authorId: string,
  replyToPostId: string,
  query?: Client['query'],
) {
  const run =
    query ??
    ((text: string, values?: unknown[]) =>
      executeDbQuery(payload, text, values).then((rows) => ({ rows })))
  const result = await run<{ id: string; spaceId: string }>(
    `SELECT p.id, t.space_id AS "spaceId" FROM forum_posts p JOIN forum_topics t ON t.id = p.topic_id
     WHERE p.id = $1 AND t.site_id = $2`,
    [replyToPostId, siteId],
  )
  const quoted = result.rows[0]
  if (!quoted) throw new ForumComposerError('Quoted post not found.', 404, 'QUOTE_NOT_FOUND')
  // Resolve through COMM-04A, including private/hidden membership semantics.
  await resolveForumSpaceAccess(payload, {
    siteId,
    spaceId: quoted.spaceId,
    actor: { memberId: authorId },
  })
  return quoted
}

export async function createForumTopic(
  payload: Payload,
  input: {
    siteId: string
    spaceId: string
    authorId: string
    title: string
    body: string
    replyToPostId?: string | null
  },
) {
  const title = String(input.title ?? '').trim()
  if (!title) throw new ForumComposerError('Topic title cannot be empty.', 422, 'EMPTY_TOPIC_TITLE')
  const body = requireBody(input.body)
  try { await assertMemberCanPost(payload, { siteId: input.siteId, memberId: input.authorId, spaceId: input.spaceId }) }
  catch (error) { if (error instanceof ModerationActionError) throw new ForumComposerError(error.message, error.status, error.code); throw error }
  const access = await resolveForumSpaceAccess(payload, {
    siteId: input.siteId,
    spaceId: input.spaceId,
    actor: { memberId: input.authorId },
  })
  requireForumSpaceCapability(access, 'can_create_topic')
  if (input.replyToPostId)
    await assertQuoteReadable(payload, input.siteId, input.authorId, input.replyToPostId)
  const created = await withTransaction(payload, async (query) => {
    const topic = (
      await query<Topic>(
        `INSERT INTO forum_topics (site_id, space_id, author_id, title, next_post_sequence) VALUES ($1,$2,$3,$4,2) RETURNING id, space_id AS "spaceId", is_locked AS "isLocked"`,
        [input.siteId, input.spaceId, input.authorId, title],
      )
    ).rows[0]!
    const post = (
      await query(
        `INSERT INTO forum_posts (topic_id, author_id, sequence_number, reply_to_post_id, body_raw, body_html) VALUES ($1,$2,1,$3,$4,$5) RETURNING *`,
        [topic.id, input.authorId, input.replyToPostId ?? null, body.raw, body.html],
      )
    ).rows[0]!
    await enqueueForumSearchSync(query, input.siteId, topic.id, String((post as { id?: string }).id ?? topic.id))
    return { topic, post }
  })
  await triageSubmission(payload, { siteId: input.siteId, targetType: 'forum_post', targetId: String((created.post as { id: string }).id), authorId: input.authorId, text: body.raw })
  return created
}

export async function replyToForumTopic(
  payload: Payload,
  input: {
    siteId: string
    topicId: string
    authorId: string
    body: string
    replyToPostId?: string | null
  },
) {
  const body = requireBody(input.body)
  const post = await withTransaction(payload, async (query) => {
    // Lock serializes allocation; a failed insert rolls the increment back with the transaction.
    const topic = (
      await query<Topic>(
        `SELECT id, space_id AS "spaceId", is_locked AS "isLocked" FROM forum_topics WHERE id = $1 AND site_id = $2 FOR UPDATE`,
        [input.topicId, input.siteId],
      )
    ).rows[0]
    if (!topic) throw new ForumComposerError('Forum topic not found.', 404, 'TOPIC_NOT_FOUND')
    if (topic.isLocked)
      throw new ForumComposerError('This forum topic is locked.', 403, 'TOPIC_LOCKED')
    try { await assertMemberCanPost(payload, { siteId: input.siteId, memberId: input.authorId, spaceId: topic.spaceId, objectId: topic.id }) }
    catch (error) { if (error instanceof ModerationActionError) throw new ForumComposerError(error.message, error.status, error.code); throw error }
    const access = await resolveForumSpaceAccess(payload, {
      siteId: input.siteId,
      spaceId: topic.spaceId,
      actor: { memberId: input.authorId },
    })
    requireForumSpaceCapability(access, 'can_reply')
    if (input.replyToPostId) {
      const quote = await assertQuoteReadable(
        payload,
        input.siteId,
        input.authorId,
        input.replyToPostId,
        query,
      )
      const withinTopic = (
        await query(`SELECT id FROM forum_posts WHERE id = $1 AND topic_id = $2`, [
          quote.id,
          topic.id,
        ])
      ).rows[0]
      if (!withinTopic)
        throw new ForumComposerError(
          'Quoted post must be in this topic.',
          422,
          'INVALID_QUOTE_TOPIC',
        )
    }
    const allocated = (
      await query<{ sequenceNumber: number }>(
        `UPDATE forum_topics SET next_post_sequence = next_post_sequence + 1, updated_at = now() WHERE id = $1 RETURNING next_post_sequence - 1 AS "sequenceNumber"`,
        [topic.id],
      )
    ).rows[0]!
    const post = (
      await query(
        `INSERT INTO forum_posts (topic_id, author_id, sequence_number, reply_to_post_id, body_raw, body_html) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          topic.id,
          input.authorId,
          allocated.sequenceNumber,
          input.replyToPostId ?? null,
          body.raw,
          body.html,
        ],
      )
    ).rows[0]!
    await enqueueForumSearchSync(query, input.siteId, topic.id, String((post as { id?: string }).id ?? allocated.sequenceNumber))
    return post
  })
  await triageSubmission(payload, { siteId: input.siteId, targetType: 'forum_post', targetId: String((post as { id: string }).id), authorId: input.authorId, text: body.raw })
  return post
}

export async function saveForumDraft(
  payload: Payload,
  input: {
    siteId: string
    spaceId: string
    topicId?: string | null
    authorId: string
    title?: string | null
    body: string
    replyToPostId?: string | null
  },
) {
  const access = await resolveForumSpaceAccess(payload, {
    siteId: input.siteId,
    spaceId: input.spaceId,
    actor: { memberId: input.authorId },
  })
  requireForumSpaceCapability(access, input.topicId ? 'can_reply' : 'can_create_topic')
  if (input.replyToPostId)
    await assertQuoteReadable(payload, input.siteId, input.authorId, input.replyToPostId)
  const rows = await executeDbQuery<Record<string, unknown>>(
    payload,
    `INSERT INTO forum_drafts (site_id, space_id, topic_id, author_id, title, body_raw, reply_to_post_id) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (author_id, topic_id, space_id) DO UPDATE SET title = EXCLUDED.title, body_raw = EXCLUDED.body_raw, reply_to_post_id = EXCLUDED.reply_to_post_id, updated_at = now() RETURNING *`,
    [
      input.siteId,
      input.spaceId,
      input.topicId ?? null,
      input.authorId,
      input.title?.trim() || null,
      String(input.body ?? ''),
      input.replyToPostId ?? null,
    ],
  )
  return rows[0]!
}

export async function editForumPost(
  payload: Payload,
  input: { postId: string; authorId: string; body: string },
) {
  const body = requireBody(input.body)
  const rows = await executeDbQuery<Record<string, unknown>>(
    payload,
    `UPDATE forum_posts p SET body_raw = $1, body_html = $2, updated_at = now()
     FROM forum_topics t WHERE p.id = $3 AND p.author_id = $4 AND t.id = p.topic_id
     RETURNING p.*, p.topic_id AS "topicId", t.site_id AS "siteId"`,
    [body.raw, body.html, input.postId, input.authorId],
  )
  if (!rows[0])
    throw new ForumComposerError(
      'Forum post not found or not editable by this author.',
      404,
      'POST_NOT_EDITABLE',
    )
  const updated = rows[0]
  await enqueueForumSearchSync(
    (text, values) => executeDbQuery(payload, text, values).then((result) => ({ rows: result })),
    String(updated.siteId),
    String(updated.topicId),
    String(updated.id),
  )
  return updated
}
