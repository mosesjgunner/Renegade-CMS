import type { Payload } from 'payload'
import { sanitizeCommentHtml } from './comment-composer'
import { checkBlockBetween } from './service'
import { blockMember } from './service'
import { ingestModerationReport } from './moderation-reports'
import { linkMessageAttachments } from './message-attachments'

export class ConversationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'CONVERSATION_ERROR',
  ) {
    super(message)
  }
}
type Query = <T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
) => Promise<{ rows: T[] }>
type Client = { query: Query; release?: () => void }
type PoolPayload = Payload & { db?: { pool?: { connect?: () => Promise<Client>; query?: Query } } }

async function transaction<T>(payload: Payload, work: (query: Query) => Promise<T>): Promise<T> {
  const client = await (payload as PoolPayload).db?.pool?.connect?.()
  if (!client) throw new Error('A PostgreSQL transaction-capable connection is required')
  try {
    await client.query('BEGIN')
    const result = await work(client.query.bind(client))
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    throw error
  } finally {
    client.release?.()
  }
}
function orderedPair(a: string, b: string) {
  return a < b ? [a, b] : [b, a]
}
function toConversation(row: Record<string, unknown>, members: string[]) {
  return {
    id: String(row.id),
    siteId: String(row.site_id),
    kind: String(row.kind) as 'direct' | 'group',
    requestState: String(row.request_state ?? 'active') as
      | 'pending_request'
      | 'active'
      | 'declined',
    requestRecipientMemberId: row.request_recipient_member_id
      ? String(row.request_recipient_member_id)
      : null,
    title: row.title ? String(row.title) : null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    members,
    createdAt: String(row.created_at),
  }
}

async function hasMutualRelationship(payload: Payload, siteId: string, a: string, b: string) {
  const found = await payload.find({
    collection: 'relationships',
    where: {
      and: [
        { site: { equals: siteId } },
        { kind: { equals: 'follow' } },
        { status: { equals: 'active' } },
        {
          pairKey: {
            in: [
              `follow:${siteId}:${a}:${b}`,
              `follow:${siteId}:${b}:${a}`,
              `follow:${a}:${b}`,
              `follow:${b}:${a}`,
            ],
          },
        },
      ],
    },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  } as never)
  const keys = new Set((found.docs as Array<{ pairKey?: string }>).map((row) => row.pairKey))
  return (
    [`follow:${siteId}:${a}:${b}`, `follow:${a}:${b}`].some((key) => keys.has(key)) &&
    [`follow:${siteId}:${b}:${a}`, `follow:${b}:${a}`].some((key) => keys.has(key))
  )
}

export async function startDirectConversation(
  payload: Payload,
  input: { siteId: string; memberId: string; recipientMemberId: string },
) {
  if (!input.recipientMemberId)
    throw new ConversationError('recipientMemberId is required', 400, 'RECIPIENT_REQUIRED')
  if (input.memberId === input.recipientMemberId)
    throw new ConversationError(
      'A direct conversation requires two distinct members',
      422,
      'DIRECT_SELF',
    )
  if (
    (await checkBlockBetween(payload, input.memberId, input.recipientMemberId, input.siteId))
      .isBlocked
  )
    throw new ConversationError(
      'Blocked members cannot start a direct conversation',
      403,
      'BLOCKED_COMMUNICATION',
    )
  const [low, high] = orderedPair(input.memberId, input.recipientMemberId)
  const mutual = await hasMutualRelationship(
    payload,
    input.siteId,
    input.memberId,
    input.recipientMemberId,
  )
  return transaction(payload, async (query) => {
    // Serializes creation even before the partial unique index resolves a race.
    await query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `conversation:direct:${input.siteId}:${low}:${high}`,
    ])
    const existing = await query<Record<string, unknown>>(
      "SELECT * FROM conversations WHERE site_id=$1 AND kind='direct' AND status='active' AND direct_member_low_id=$2 AND direct_member_high_id=$3 LIMIT 1",
      [input.siteId, low, high],
    )
    const row =
      existing.rows[0] ??
      (
        await query<Record<string, unknown>>(
          "INSERT INTO conversations (site_id,kind,direct_member_low_id,direct_member_high_id,request_state,request_recipient_member_id) VALUES ($1,'direct',$2,$3,$4,$5) RETURNING *",
          [
            input.siteId,
            low,
            high,
            mutual ? 'active' : 'pending_request',
            mutual ? null : input.recipientMemberId,
          ],
        )
      ).rows[0]
    if (!existing.rows[0]) {
      if (!mutual) {
        // Lock the rolling window so concurrent first requests cannot bypass the limit.
        await query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `message-request:${input.siteId}:${input.memberId}`,
        ])
        const member = await query<{ created_at: string }>(
          'SELECT created_at FROM members WHERE id=$1',
          [input.memberId],
        )
        const createdAt =
          member.rows[0]?.created_at && new Date(member.rows[0].created_at).getTime()
        if (createdAt && Date.now() - createdAt < 7 * 24 * 60 * 60 * 1000) {
          const prior = await query<{ count: number }>(
            "SELECT count(*)::int AS count FROM message_request_attempts WHERE site_id=$1 AND sender_id=$2 AND created_at >= now() - interval '1 hour'",
            [input.siteId, input.memberId],
          )
          if (Number(prior.rows[0]?.count ?? 0) >= 3)
            throw new ConversationError(
              'New accounts may send only three message requests per hour',
              429,
              'MESSAGE_REQUEST_RATE_LIMITED',
            )
          await query(
            'INSERT INTO message_request_attempts (site_id,sender_id,recipient_id,conversation_id) VALUES ($1,$2,$3,$4)',
            [input.siteId, input.memberId, input.recipientMemberId, row.id],
          )
        }
      }
      await query(
        'INSERT INTO conversation_memberships (conversation_id,member_id) VALUES ($1,$2),($1,$3)',
        [row.id, low, high],
      )
    }
    return toConversation(row, [low, high])
  })
}

export async function createGroupConversation(
  payload: Payload,
  input: {
    siteId: string
    creatorMemberId: string
    memberIds: string[]
    title: string
    avatarUrl?: string | null
  },
) {
  const members = [...new Set([input.creatorMemberId, ...input.memberIds])]
  if (!input.title.trim() || members.length < 2)
    throw new ConversationError(
      'A group needs a title and at least two members',
      422,
      'INVALID_GROUP',
    )
  if (members.length > 100)
    throw new ConversationError('Groups may have at most 100 members', 422, 'GROUP_MEMBER_LIMIT')
  return transaction(payload, async (query) => {
    const row = (
      await query<Record<string, unknown>>(
        "INSERT INTO conversations (site_id,kind,title,avatar_url) VALUES ($1,'group',$2,$3) RETURNING *",
        [input.siteId, input.title.trim(), input.avatarUrl ?? null],
      )
    ).rows[0]
    await query(
      "INSERT INTO conversation_memberships (conversation_id,member_id,role,visible_from_sequence) SELECT $1, member_id, CASE WHEN member_id=$3::uuid THEN 'admin' ELSE 'member' END, 1 FROM unnest($2::uuid[]) AS member_id",
      [row.id, members, input.creatorMemberId],
    )
    await appendSystemNotice(query, String(row.id), 'group_created', 'The group was created.')
    return toConversation(row, members)
  })
}

export async function sendConversationMessage(
  payload: Payload,
  input: {
    siteId: string
    conversationId: string
    senderId: string
    body: string
    idempotencyKey: string
    attachmentIds?: string[]
  },
) {
  const bodyHtml = sanitizeCommentHtml(String(input.body ?? '').trim())
  if (!bodyHtml)
    throw new ConversationError('Message contains no allowed content', 422, 'EMPTY_MESSAGE')
  if (!input.idempotencyKey.trim())
    throw new ConversationError('idempotencyKey is required', 400, 'IDEMPOTENCY_KEY_REQUIRED')
  return transaction(payload, async (query) => {
    const membership = await query(
      'SELECT c.request_state, c.request_recipient_member_id, c.status FROM conversation_memberships cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.conversation_id=$1 AND cm.member_id=$2 AND cm.left_at IS NULL AND c.site_id=$3 FOR SHARE',
      [input.conversationId, input.senderId, input.siteId],
    )
    if (!membership.rows[0])
      throw new ConversationError('Active membership is required', 403, 'NOT_CONVERSATION_MEMBER')
    const conversation = membership.rows[0] as Record<string, unknown>
    if (conversation.status === 'archived')
      throw new ConversationError(
        'Archived conversations are read-only',
        409,
        'CONVERSATION_ARCHIVED',
      )
    if (conversation.request_state === 'declined')
      throw new ConversationError(
        'This message request was declined',
        403,
        'MESSAGE_REQUEST_DECLINED',
      )
    if (
      conversation.request_state === 'pending_request' &&
      conversation.request_recipient_member_id === input.senderId
    )
      throw new ConversationError(
        'Accept the request before replying',
        403,
        'MESSAGE_REQUEST_PENDING',
      )
    const peers = await query<{ member_id: string }>(
      'SELECT member_id FROM conversation_memberships WHERE conversation_id=$1 AND member_id<>$2 AND left_at IS NULL',
      [input.conversationId, input.senderId],
    )
    for (const peer of peers.rows)
      if (
        peer.member_id &&
        (await checkBlockBetween(payload, input.senderId, peer.member_id, input.siteId)).isBlocked
      )
        throw new ConversationError(
          'Blocked members cannot send messages',
          403,
          'BLOCKED_COMMUNICATION',
        )
    const duplicate = await query<Record<string, unknown>>(
      'SELECT * FROM messages WHERE conversation_id=$1 AND idempotency_key=$2',
      [input.conversationId, input.idempotencyKey],
    )
    if (duplicate.rows[0]) return { ...duplicate.rows[0], duplicate: true }
    const sequence = await query<{ sequence_number: number }>(
      'UPDATE conversations SET next_message_sequence=next_message_sequence+1, last_message_at=now(), updated_at=now() WHERE id=$1 RETURNING next_message_sequence - 1 AS sequence_number',
      [input.conversationId],
    )
    if (!sequence.rows[0])
      throw new ConversationError('Conversation unavailable', 404, 'CONVERSATION_UNAVAILABLE')
    const row = (
      await query<Record<string, unknown>>(
        'INSERT INTO messages (conversation_id,sender_id,idempotency_key,sequence_number,body_html) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [
          input.conversationId,
          input.senderId,
          input.idempotencyKey,
          sequence.rows[0].sequence_number,
          bodyHtml,
        ],
      )
    ).rows[0]
    await linkMessageAttachments(query, {
      siteId: input.siteId,
      memberId: input.senderId,
      messageId: String(row.id),
      attachmentIds: input.attachmentIds,
    })
    return { ...row, duplicate: false }
  })
}

export async function actOnMessageRequest(
  payload: Payload,
  input: {
    siteId: string
    conversationId: string
    recipientMemberId: string
    action: 'accept' | 'decline' | 'block_and_report'
    reason?: string
    details?: string
  },
) {
  const action = input.action
  const result = await transaction(payload, async (query) => {
    const request = (
      await query<Record<string, unknown>>(
        'SELECT c.*, cm.member_id AS recipient_member_id FROM conversations c JOIN conversation_memberships cm ON cm.conversation_id=c.id AND cm.member_id=$3 AND cm.left_at IS NULL WHERE c.id=$1 AND c.site_id=$2 FOR UPDATE',
        [input.conversationId, input.siteId, input.recipientMemberId],
      )
    ).rows[0]
    if (
      !request ||
      request.request_state !== 'pending_request' ||
      request.request_recipient_member_id !== input.recipientMemberId
    )
      throw new ConversationError(
        'Message request is unavailable',
        404,
        'MESSAGE_REQUEST_NOT_FOUND',
      )
    const state = action === 'accept' ? 'active' : 'declined'
    await query('UPDATE conversations SET request_state=$2, updated_at=now() WHERE id=$1', [
      input.conversationId,
      state,
    ])
    const sender = (
      await query<{ member_id: string }>(
        'SELECT member_id FROM conversation_memberships WHERE conversation_id=$1 AND member_id<>$2 AND left_at IS NULL',
        [input.conversationId, input.recipientMemberId],
      )
    ).rows[0]?.member_id
    return { state, sender }
  })
  if (action === 'block_and_report' && result.sender) {
    await blockMember(payload, {
      siteId: input.siteId,
      subjectMemberId: input.recipientMemberId,
      targetMemberId: result.sender,
    })
    const latest = await (payload as PoolPayload).db?.pool?.query?.(
      'SELECT id FROM messages WHERE conversation_id=$1 ORDER BY sequence_number DESC LIMIT 1',
      [input.conversationId],
    )
    if (latest?.rows[0]?.id)
      await ingestModerationReport(payload, {
        siteId: input.siteId,
        reporterId: input.recipientMemberId,
        targetType: 'message',
        targetId: String(latest.rows[0].id),
        reason: input.reason?.trim() || 'message_request',
        details: input.details,
      })
  }
  return { requestState: result.state }
}

export async function reportConversationMessage(
  payload: Payload,
  input: {
    siteId: string
    conversationId: string
    memberId: string
    messageId: string
    reason: string
    details?: string
  },
) {
  const messages = await listConversationMessages(payload, {
    siteId: input.siteId,
    conversationId: input.conversationId,
    memberId: input.memberId,
  })
  if (!messages.some((message) => String(message.id) === input.messageId))
    throw new ConversationError('Message unavailable', 404, 'MESSAGE_NOT_FOUND')
  return ingestModerationReport(payload, {
    siteId: input.siteId,
    reporterId: input.memberId,
    targetType: 'message',
    targetId: input.messageId,
    reason: input.reason,
    details: input.details,
  })
}

export async function listConversationMessages(
  payload: Payload,
  input: { siteId: string; conversationId: string; memberId: string },
) {
  const query = (payload as PoolPayload).db?.pool?.query
  if (!query) throw new Error('Database query execution not available')
  const membership = await query(
    'SELECT cm.visible_from_sequence FROM conversation_memberships cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.conversation_id=$1 AND cm.member_id=$2 AND cm.left_at IS NULL AND c.site_id=$3',
    [input.conversationId, input.memberId, input.siteId],
  )
  if (!membership.rows[0])
    throw new ConversationError('Access denied', 403, 'NOT_CONVERSATION_MEMBER')
  return (
    await query(
      `SELECT m.id,m.conversation_id,m.sender_id,m.sequence_number,m.body_html,m.created_at,
        COALESCE(json_agg(json_build_object('id',a.id,'filename',a.original_filename,'mimeType',a.claimed_mime_type,'status',a.status,'presentation',CASE WHEN a.status='clean' THEN 'attachment' ELSE 'attachment_pending' END)) FILTER (WHERE a.id IS NOT NULL), '[]') AS attachments
       FROM messages m LEFT JOIN message_attachments a ON a.message_id=m.id WHERE m.conversation_id=$1 AND m.sequence_number >= $2
       GROUP BY m.id ORDER BY m.sequence_number ASC LIMIT 100`,
      [
        input.conversationId,
        Number(
          (membership.rows[0] as { visible_from_sequence?: number }).visible_from_sequence ?? 1,
        ),
      ],
    )
  ).rows
}

type GroupAction = 'invite' | 'remove' | 'promote' | 'demote' | 'leave' | 'update_metadata'

async function appendSystemNotice(
  query: Query,
  conversationId: string,
  event: string,
  body: string,
) {
  const allocated = await query<{ sequence_number: number }>(
    'UPDATE conversations SET next_message_sequence=next_message_sequence+1, last_message_at=now(), updated_at=now() WHERE id=$1 RETURNING next_message_sequence - 1 AS sequence_number',
    [conversationId],
  )
  const sequence = allocated.rows[0]?.sequence_number
  if (!sequence)
    throw new ConversationError('Conversation unavailable', 404, 'CONVERSATION_UNAVAILABLE')
  return (
    await query<Record<string, unknown>>(
      "INSERT INTO messages (conversation_id,sender_id,idempotency_key,sequence_number,body_html,kind,system_event) VALUES ($1,NULL,$2,$3,$4,'system',$5) RETURNING *",
      [conversationId, `system:${event}:${sequence}`, sequence, body, event],
    )
  ).rows[0]
}

/** Admin-authorized group mutations. Membership rows are retained; left_at is never deleted. */
export async function administerGroupConversation(
  payload: Payload,
  input: {
    siteId: string
    conversationId: string
    actorMemberId: string
    action: GroupAction
    targetMemberId?: string
    title?: string
    avatarUrl?: string | null
  },
) {
  return transaction(payload, async (query) => {
    const group = (
      await query<Record<string, unknown>>(
        'SELECT c.* FROM conversations c JOIN conversation_memberships cm ON cm.conversation_id=c.id WHERE c.id=$1 AND c.site_id=$2 AND cm.member_id=$3 AND cm.left_at IS NULL FOR UPDATE',
        [input.conversationId, input.siteId, input.actorMemberId],
      )
    ).rows[0]
    if (!group || group.kind !== 'group')
      throw new ConversationError('Group unavailable', 404, 'GROUP_NOT_FOUND')
    if (group.status === 'archived')
      throw new ConversationError('Archived groups are read-only', 409, 'GROUP_ARCHIVED')
    const actor = (
      await query<{ role: 'admin' | 'member' }>(
        'SELECT role FROM conversation_memberships WHERE conversation_id=$1 AND member_id=$2 AND left_at IS NULL FOR UPDATE',
        [input.conversationId, input.actorMemberId],
      )
    ).rows[0]
    const target = input.targetMemberId
    const adminRequired = input.action !== 'leave'
    if (adminRequired && actor?.role !== 'admin')
      throw new ConversationError('Group admin permission is required', 403, 'GROUP_ADMIN_REQUIRED')

    if (input.action === 'update_metadata') {
      const title = input.title?.trim()
      if (!title)
        throw new ConversationError('A group name is required', 422, 'GROUP_NAME_REQUIRED')
      await query(
        'UPDATE conversations SET title=$2, avatar_url=$3, updated_at=now() WHERE id=$1',
        [input.conversationId, title, input.avatarUrl ?? null],
      )
      return {
        notice: await appendSystemNotice(
          query,
          input.conversationId,
          'metadata_updated',
          'Group details were updated.',
        ),
      }
    }
    if (!target && input.action !== 'leave')
      throw new ConversationError('targetMemberId is required', 400, 'GROUP_MEMBER_REQUIRED')
    const subjectId = input.action === 'leave' ? input.actorMemberId : target!
    const membership = (
      await query<{ role: 'admin' | 'member'; left_at: string | null }>(
        'SELECT role,left_at FROM conversation_memberships WHERE conversation_id=$1 AND member_id=$2 FOR UPDATE',
        [input.conversationId, subjectId],
      )
    ).rows[0]

    if (input.action === 'invite') {
      if (membership && !membership.left_at)
        throw new ConversationError(
          'Member already belongs to this group',
          422,
          'GROUP_MEMBER_EXISTS',
        )
      const count = await query<{ count: number }>(
        'SELECT count(*)::int AS count FROM conversation_memberships WHERE conversation_id=$1 AND left_at IS NULL',
        [input.conversationId],
      )
      if (Number(count.rows[0]?.count ?? 0) >= 100)
        throw new ConversationError(
          'Groups may have at most 100 members',
          422,
          'GROUP_MEMBER_LIMIT',
        )
      const boundary =
        (
          await query<{ next_message_sequence: number }>(
            'SELECT next_message_sequence FROM conversations WHERE id=$1 FOR UPDATE',
            [input.conversationId],
          )
        ).rows[0]?.next_message_sequence ?? 1
      if (membership)
        await query(
          "UPDATE conversation_memberships SET left_at=NULL, role='member', joined_at=now(), visible_from_sequence=$3 WHERE conversation_id=$1 AND member_id=$2",
          [input.conversationId, subjectId, boundary],
        )
      else
        await query(
          "INSERT INTO conversation_memberships (conversation_id,member_id,role,visible_from_sequence) VALUES ($1,$2,'member',$3)",
          [input.conversationId, subjectId, boundary],
        )
      return {
        notice: await appendSystemNotice(
          query,
          input.conversationId,
          'member_joined',
          'A member joined the group.',
        ),
      }
    }
    if (!membership || membership.left_at)
      throw new ConversationError(
        'Active group membership is required',
        404,
        'GROUP_MEMBER_NOT_FOUND',
      )
    if (input.action === 'promote' || input.action === 'demote') {
      if (input.action === 'demote' && membership.role === 'admin') {
        const admins = await query<{ count: number }>(
          "SELECT count(*)::int AS count FROM conversation_memberships WHERE conversation_id=$1 AND left_at IS NULL AND role='admin'",
          [input.conversationId],
        )
        if (Number(admins.rows[0]?.count ?? 0) <= 1)
          throw new ConversationError(
            'Assign another admin before removing the last owner role',
            409,
            'LAST_OWNER',
          )
      }
      const role = input.action === 'promote' ? 'admin' : 'member'
      await query(
        'UPDATE conversation_memberships SET role=$3 WHERE conversation_id=$1 AND member_id=$2',
        [input.conversationId, subjectId, role],
      )
      return {
        notice: await appendSystemNotice(
          query,
          input.conversationId,
          `member_${input.action}d`,
          `A member was ${input.action}d.`,
        ),
      }
    }
    // Removal and voluntary leave share the owner guard and retained-history transition.
    if (membership.role === 'admin') {
      const admins = await query<{ count: number }>(
        "SELECT count(*)::int AS count FROM conversation_memberships WHERE conversation_id=$1 AND left_at IS NULL AND role='admin'",
        [input.conversationId],
      )
      const active = await query<{ count: number }>(
        'SELECT count(*)::int AS count FROM conversation_memberships WHERE conversation_id=$1 AND left_at IS NULL',
        [input.conversationId],
      )
      if (Number(admins.rows[0]?.count ?? 0) <= 1 && Number(active.rows[0]?.count ?? 0) > 1)
        throw new ConversationError(
          'Assign another admin before the last owner leaves',
          409,
          'LAST_OWNER',
        )
    }
    await query(
      'UPDATE conversation_memberships SET left_at=now() WHERE conversation_id=$1 AND member_id=$2',
      [input.conversationId, subjectId],
    )
    const remaining = await query<{ count: number }>(
      'SELECT count(*)::int AS count FROM conversation_memberships WHERE conversation_id=$1 AND left_at IS NULL',
      [input.conversationId],
    )
    if (Number(remaining.rows[0]?.count ?? 0) === 0)
      await query("UPDATE conversations SET status='archived', updated_at=now() WHERE id=$1", [
        input.conversationId,
      ])
    return {
      notice: await appendSystemNotice(
        query,
        input.conversationId,
        input.action === 'leave' ? 'member_left' : 'member_removed',
        input.action === 'leave'
          ? 'A member left the group.'
          : 'A member was removed from the group.',
      ),
    }
  })
}
