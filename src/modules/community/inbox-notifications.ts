import type { Payload } from 'payload'

import { executeDbQuery } from './comment-composer'
import { resolveForumSpaceAccess } from './forum-space-access'
import { checkBlockBetween, checkMuteFrom } from './service'

type EventPayload = Record<string, unknown>
export type InboxEvent = { id: string; eventType: string; payload: EventPayload }
type Candidate = { memberId: string; reason: string }
type Row = Record<string, unknown>

const asArray = (value: unknown) => (Array.isArray(value) ? value.map(String).filter(Boolean) : [])
export const noSnippet = (snapshot: Record<string, unknown>) => {
  const {
    snippet: _snippet,
    preview: _preview,
    body: _body,
    body_html: _html,
    body_raw: _raw,
    text: _text,
    content: _content,
    message: _message,
    ...safe
  } = snapshot
  return safe
}

/** Resolves every candidate source before filtering; duplicates deliberately collapse by member id. */
export async function resolveInboxCandidates(
  payload: Payload,
  event: InboxEvent,
): Promise<Candidate[]> {
  const p = event.payload
  const siteId = String(p.site_id ?? p.siteId ?? '')
  const targetType = String(
    p.target_type ??
      p.targetType ??
      (event.eventType.startsWith('comment.') ? 'comment' : 'forum_post'),
  )
  const targetId = String(
    p.target_id ?? p.targetId ?? p.comment_id ?? p.commentId ?? p.post_id ?? p.postId ?? '',
  )
  const members = new Map<string, Candidate>()
  const add = (ids: string[], reason: string) =>
    ids.forEach((memberId) => {
      if (memberId) members.set(memberId, { memberId, reason })
    })
  add(asArray(p.recipient_member_ids ?? p.recipientMemberIds), 'explicit')
  add(asArray(p.moderation_target_member_ids ?? p.moderationTargetMemberIds), 'moderation_target')
  if (p.thread_id ?? p.threadId) {
    const rows = await executeDbQuery<{ member_id: string }>(
      payload,
      'SELECT member_id FROM comment_thread_subscriptions WHERE thread_id=$1',
      [String(p.thread_id ?? p.threadId)],
    )
    add(
      rows.map((row) => row.member_id),
      'thread_subscription',
    )
  }
  const spaceId = String(p.space_id ?? p.spaceId ?? '')
  if (spaceId) {
    const rows = await executeDbQuery<{ member_id: string }>(
      payload,
      "SELECT member_id FROM space_memberships WHERE space_id=$1 AND status='active'",
      [spaceId],
    )
    add(
      rows.map((row) => row.member_id),
      'space_membership',
    )
  }
  const handles = asArray(p.mentioned_handles ?? p.mentionedHandles).map((handle) =>
    handle.replace(/^@/, '').toLowerCase(),
  )
  if (handles.length) {
    const rows = await executeDbQuery<{ member_id: string }>(
      payload,
      'SELECT member_id FROM profiles WHERE LOWER(handle) = ANY($1::text[])',
      [handles],
    )
    add(
      rows.map((row) => row.member_id),
      'mention',
    )
  }
  // A reply target is a recipient even if the event producer did not materialize it.
  if (targetType === 'comment' && (p.parent_id ?? p.parentId)) {
    const rows = await executeDbQuery<{ author_id: string }>(
      payload,
      'SELECT author_id FROM comments WHERE id=$1',
      [String(p.parent_id ?? p.parentId)],
    )
    add(
      rows.map((row) => row.author_id),
      'reply_target',
    )
  }
  return [...members.values()]
}

async function targetIsDeliverable(payload: Payload, event: InboxEvent) {
  const p = event.payload
  const type = String(
    p.target_type ??
      p.targetType ??
      (event.eventType.startsWith('comment.') ? 'comment' : 'forum_post'),
  )
  const id = String(
    p.target_id ?? p.targetId ?? p.comment_id ?? p.commentId ?? p.post_id ?? p.postId ?? '',
  )
  if (!id) return false
  if (type === 'comment') {
    const rows = await executeDbQuery<{ status: string; deleted_at: string | null }>(
      payload,
      'SELECT status, deleted_at FROM comments WHERE id=$1',
      [id],
    )
    return rows[0]?.status === 'visible' && !rows[0]?.deleted_at
  }
  if (type === 'forum_post') {
    const rows = await executeDbQuery<{ quarantined: boolean }>(
      payload,
      'SELECT p.is_quarantined AS quarantined FROM forum_posts p WHERE p.id=$1',
      [id],
    )
    return Boolean(rows[0]) && !rows[0]!.quarantined
  }
  if (type === 'forum_topic') {
    const rows = await executeDbQuery<{ quarantined: boolean }>(
      payload,
      'SELECT is_quarantined AS quarantined FROM forum_topics WHERE id=$1',
      [id],
    )
    return Boolean(rows[0]) && !rows[0]!.quarantined
  }
  return true // moderation/member targets contain no content text snapshot.
}

async function recipientCanRead(
  payload: Payload,
  siteId: string,
  spaceId: string,
  memberId: string,
) {
  if (!spaceId) return true
  try {
    return (await resolveForumSpaceAccess(payload, { siteId, spaceId, actor: { memberId } }))
      .canView
  } catch {
    return false
  }
}

/** Worker entry point. Re-checks authorization and target state immediately before the atomic insert. */
export async function projectInboxEvent(payload: Payload, event: InboxEvent): Promise<number> {
  const p = event.payload,
    siteId = String(p.site_id ?? p.siteId ?? ''),
    actorId =
      String(p.author_id ?? p.authorId ?? p.actor_member_id ?? p.actorMemberId ?? '') || undefined
  const targetType = String(
    p.target_type ??
      p.targetType ??
      (event.eventType.startsWith('comment.') ? 'comment' : 'forum_post'),
  )
  const targetId = String(
    p.target_id ?? p.targetId ?? p.comment_id ?? p.commentId ?? p.post_id ?? p.postId ?? '',
  )
  const spaceId = String(p.space_id ?? p.spaceId ?? '')
  if (!siteId || !targetId || !(await targetIsDeliverable(payload, event))) return 0
  let delivered = 0
  for (const candidate of await resolveInboxCandidates(payload, event)) {
    if (candidate.memberId === actorId) continue
    if (actorId) {
      const [block, muted] = await Promise.all([
        checkBlockBetween(payload, candidate.memberId, actorId, siteId),
        checkMuteFrom(payload, candidate.memberId, actorId, siteId),
      ])
      if (block.isBlocked || muted) continue
    }
    if (!(await recipientCanRead(payload, siteId, spaceId, candidate.memberId))) continue
    const snapshot = noSnippet({
      kind: event.eventType,
      targetType,
      targetId,
      reason: candidate.reason,
      ...(p.snapshot && typeof p.snapshot === 'object'
        ? (p.snapshot as Record<string, unknown>)
        : {}),
    })
    const inserted = await executeDbQuery<{ id: string }>(
      payload,
      `WITH inserted AS (
      INSERT INTO inbox_notifications (site_id,recipient_member_id,actor_member_id,source_event_id,kind,target_type,target_id,snapshot)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (source_event_id,recipient_member_id) DO NOTHING RETURNING id
    ), counter AS (
      INSERT INTO member_notification_counters (site_id,member_id,unread_count) SELECT $1,$2,1 FROM inserted
      ON CONFLICT (site_id,member_id) DO UPDATE SET unread_count=member_notification_counters.unread_count+1,updated_at=now()
    ) SELECT id FROM inserted`,
      [
        siteId,
        candidate.memberId,
        actorId ?? null,
        event.id,
        event.eventType,
        targetType,
        targetId,
        JSON.stringify(snapshot),
      ],
    )
    delivered += inserted.length
  }
  return delivered
}

/**
 * COMM-06A worker adapter: callers may safely replay this batch after a crash.
 * The source-event/recipient unique key makes projection at-least-once without
 * a separate acknowledgement table or a second queue.
 */
export async function projectPendingInboxEvents(payload: Payload, limit = 100) {
  const events = await executeDbQuery<{ id: string; event_type: string; payload: EventPayload }>(
    payload,
    `SELECT id,event_type,payload FROM outbox_events
     WHERE event_type IN ('comment.created.v1','forum.post.created.v1','forum.topic.created.v1','moderation.action.v1')
     ORDER BY created_at ASC,id ASC LIMIT $1`,
    [Math.min(500, Math.max(1, limit))],
  )
  let delivered = 0
  for (const event of events)
    delivered += await projectInboxEvent(payload, {
      id: event.id,
      eventType: event.event_type,
      payload: event.payload,
    })
  return { processed: events.length, delivered }
}

export function decodeInboxCursor(cursor: string | null) {
  if (!cursor) return null
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    return typeof value.createdAt === 'string' && typeof value.id === 'string' ? value : null
  } catch {
    return null
  }
}
export const encodeInboxCursor = (row: Row) =>
  Buffer.from(JSON.stringify({ createdAt: row.createdAt, id: row.id })).toString('base64url')

export async function listInbox(
  payload: Payload,
  input: { siteId: string; memberId: string; cursor?: string | null; limit?: number },
) {
  const cursor = decodeInboxCursor(input.cursor ?? null),
    limit = Math.min(100, Math.max(1, input.limit ?? 30))
  const rows = await executeDbQuery<Row>(
    payload,
    `SELECT id,kind,target_type AS "targetType",target_id AS "targetId",snapshot,read_at AS "readAt",created_at AS "createdAt"
    FROM inbox_notifications WHERE site_id=$1 AND recipient_member_id=$2
    AND ($3::timestamptz IS NULL OR (created_at,id) < ($3::timestamptz,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`,
    [input.siteId, input.memberId, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
  )
  const page = rows.slice(0, limit),
    count = await executeDbQuery<{ unread_count: number }>(
      payload,
      'SELECT unread_count FROM member_notification_counters WHERE site_id=$1 AND member_id=$2',
      [input.siteId, input.memberId],
    )
  return {
    notifications: page,
    nextCursor: rows.length > limit ? encodeInboxCursor(page[page.length - 1]!) : null,
    unreadCount: Number(count[0]?.unread_count ?? 0),
  }
}

export async function markInboxRead(
  payload: Payload,
  input: { siteId: string; memberId: string; notificationId?: string },
) {
  const where = input.notificationId ? 'AND id=$3::uuid' : ''
  const values = input.notificationId
    ? [input.siteId, input.memberId, input.notificationId]
    : [input.siteId, input.memberId]
  const rows = await executeDbQuery<{ unread_count: number }>(
    payload,
    `WITH changed AS (UPDATE inbox_notifications SET read_at=now() WHERE site_id=$1 AND recipient_member_id=$2 AND read_at IS NULL ${where} RETURNING id), counter AS (
    UPDATE member_notification_counters SET unread_count=GREATEST(0,unread_count-(SELECT count(*) FROM changed)),updated_at=now() WHERE site_id=$1 AND member_id=$2 RETURNING unread_count
  ) SELECT unread_count FROM counter`,
    values,
  )
  return { unreadCount: Number(rows[0]?.unread_count ?? 0) }
}
