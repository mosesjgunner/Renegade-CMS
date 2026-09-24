import type { Payload } from 'payload'

import { executeDbQuery } from './comment-composer'
import { ForumSpaceAccessError, resolveForumSpaceAccess } from './forum-space-access'

export type TopicSort = 'latest_activity' | 'creation_date' | 'most_replies' | 'unanswered'
export class ForumBrowsingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ForumBrowsingError'
  }
}

const limitOf = (value?: number) =>
  Math.min(Math.max(Number.isFinite(value) ? Math.floor(value!) : 30, 1), 100)
const decodeCursor = (cursor?: string | null) => {
  if (!cursor) return 0
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (Number.isInteger(parsed.sequence) && parsed.sequence >= 0) return parsed.sequence
  } catch {}
  throw new ForumBrowsingError('Invalid post cursor.', 400, 'INVALID_CURSOR')
}
const cursorFor = (sequence: number) =>
  Buffer.from(JSON.stringify({ sequence })).toString('base64url')

export async function listForumTopics(
  payload: Payload,
  input: {
    siteId: string
    memberId?: string
    spaceId?: string
    sort?: string
    limit?: number
  },
) {
  const sort = (input.sort ?? 'latest_activity') as TopicSort
  if (!['latest_activity', 'creation_date', 'most_replies', 'unanswered'].includes(sort))
    throw new ForumBrowsingError('Unsupported topic sort.', 400, 'INVALID_TOPIC_SORT')
  if (input.spaceId)
    await resolveForumSpaceAccess(payload, {
      siteId: input.siteId,
      spaceId: input.spaceId,
      actor: { memberId: input.memberId },
    })
  const order =
    sort === 'creation_date'
      ? 't.created_at DESC, t.id DESC'
      : sort === 'most_replies'
        ? 't.reply_count DESC, t.last_post_timestamp DESC NULLS LAST, t.id DESC'
        : 't.last_post_timestamp DESC NULLS LAST, t.id DESC'
  const rows = await executeDbQuery<Record<string, unknown>>(
    payload,
    `
    SELECT t.id, t.site_id AS "siteId", t.space_id AS "spaceId", t.author_id AS "authorId", t.title,
           t.view_count AS "viewCount", t.reply_count AS "replyCount", t.last_post_author_id AS "lastPostAuthor",
           t.last_post_timestamp AS "lastPostTimestamp", t.last_post_sequence_number AS "lastPostSequenceNumber",
           t.created_at AS "createdAt", COALESCE(rs.last_read_sequence_number, 0) AS "lastReadSequenceNumber",
           ($2::uuid IS NOT NULL AND t.last_post_sequence_number > COALESCE(rs.last_read_sequence_number, 0)) AS unread
    FROM forum_topics t JOIN forum_spaces s ON s.id = t.space_id
    LEFT JOIN member_topic_read_state rs ON rs.topic_id = t.id AND rs.member_id = $2
    WHERE t.site_id = $1
      AND NOT t.is_archived
      AND NOT t.is_quarantined
      AND ($3::uuid IS NULL OR t.space_id = $3)
      AND (s.visibility = 'public' OR (s.visibility = 'member_only' AND $2::uuid IS NOT NULL)
        OR EXISTS (SELECT 1 FROM space_memberships sm WHERE sm.space_id = s.id AND sm.member_id = $2 AND sm.status = 'active')
        OR EXISTS (SELECT 1 FROM member_site_roles sr WHERE sr.site_id = t.site_id AND sr.member_id = $2 AND sr.role = 'community-manager'))
      AND ($4::text <> 'unanswered' OR t.reply_count = 0)
    ORDER BY ${order} LIMIT $5`,
    [input.siteId, input.memberId ?? null, input.spaceId ?? null, sort, limitOf(input.limit)],
  )
  return rows
}

export async function getForumTopicPosts(
  payload: Payload,
  input: {
    siteId: string
    topicId: string
    memberId?: string
    cursor?: string | null
    limit?: number
    countView?: boolean
  },
) {
  const topic = (
    await executeDbQuery<{ id: string; spaceId: string; lastPostSequenceNumber: number }>(
      payload,
      `SELECT id, space_id AS "spaceId", last_post_sequence_number AS "lastPostSequenceNumber" FROM forum_topics WHERE id = $1 AND site_id = $2`,
      [input.topicId, input.siteId],
    )
  )[0]
  if (!topic) throw new ForumBrowsingError('Forum topic not found.', 404, 'TOPIC_NOT_FOUND')
  await resolveForumSpaceAccess(payload, {
    siteId: input.siteId,
    spaceId: topic.spaceId,
    actor: { memberId: input.memberId },
  })
  if (input.countView !== false)
    await executeDbQuery(
      payload,
      'UPDATE forum_topics SET view_count = view_count + 1 WHERE id = $1',
      [topic.id],
    )
  const after = decodeCursor(input.cursor)
  const rows = await executeDbQuery<Record<string, unknown>>(
    payload,
    `
    SELECT id, topic_id AS "topicId", author_id AS "authorId", sequence_number AS "sequenceNumber",
           reply_to_post_id AS "replyToPostId", body_html AS "bodyHtml", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM forum_posts WHERE topic_id = $1 AND NOT is_quarantined AND sequence_number > $2
    ORDER BY sequence_number ASC LIMIT $3`,
    [topic.id, after, limitOf(input.limit) + 1],
  )
  const hasMore = rows.length > limitOf(input.limit)
  const posts = hasMore ? rows.slice(0, -1) : rows
  const finalSequence = Number(posts.at(-1)?.sequenceNumber ?? after)
  return { topic, posts, nextCursor: hasMore ? cursorFor(finalSequence) : null }
}

export async function markForumTopicRead(
  payload: Payload,
  input: { siteId: string; topicId: string; memberId: string },
) {
  const topic = (
    await executeDbQuery<{ id: string; spaceId: string; lastPostSequenceNumber: number }>(
      payload,
      `SELECT id, space_id AS "spaceId", last_post_sequence_number AS "lastPostSequenceNumber" FROM forum_topics WHERE id = $1 AND site_id = $2`,
      [input.topicId, input.siteId],
    )
  )[0]
  if (!topic) throw new ForumBrowsingError('Forum topic not found.', 404, 'TOPIC_NOT_FOUND')
  await resolveForumSpaceAccess(payload, {
    siteId: input.siteId,
    spaceId: topic.spaceId,
    actor: { memberId: input.memberId },
  })
  const rows = await executeDbQuery<Record<string, unknown>>(
    payload,
    `INSERT INTO member_topic_read_state (member_id, topic_id, last_read_sequence_number, read_at) VALUES ($1,$2,$3,now())
     ON CONFLICT (member_id, topic_id) DO UPDATE SET last_read_sequence_number = GREATEST(member_topic_read_state.last_read_sequence_number, EXCLUDED.last_read_sequence_number), read_at = now()
     RETURNING member_id AS "memberId", topic_id AS "topicId", last_read_sequence_number AS "lastReadSequenceNumber", read_at AS "readAt"`,
    [input.memberId, topic.id, topic.lastPostSequenceNumber],
  )
  return rows[0]
}

export { ForumSpaceAccessError }
