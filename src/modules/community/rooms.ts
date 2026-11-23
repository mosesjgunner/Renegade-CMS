import type { Payload } from 'payload'
import { CommunityError } from './service'
import { getGroup, groupAuthority, isSiteStaff, type GroupRole } from './groups'

/**
 * Rooms (RC3-15B / Circles D3, D4, D8).
 *
 * A room is a conversation plus a binding: (site, optional group,
 * optional event restriction). Audiences are DERIVED from current
 * group membership, site standing and event attendance — a room never
 * copies a roster into conversation_memberships (PT-K1), so a group
 * membership change takes effect on the next fetch and the next send.
 *
 * room_audience() is the shared policy for application reads and SQL writes.
 *
 * Transport contract (D8): Postgres is the authority. Clients poll
 * with a monotonic sequence cursor; any realtime bus is a hint only.
 */

export const roomLifecycles = ['open', 'closed'] as const
export type RoomLifecycle = (typeof roomLifecycles)[number]
export const roomHistoryPolicies = ['all', 'from-join'] as const
export type RoomHistoryPolicy = (typeof roomHistoryPolicies)[number]
export const roomModes = ['chat', 'group', 'content-attached', 'theater'] as const
export const roomAccessPolicies = ['public', 'members', 'paid', 'invite'] as const
export type RoomMode = (typeof roomModes)[number]
export type RoomAccessPolicy = (typeof roomAccessPolicies)[number]
export const roomIdPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

type Query = <T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
) => Promise<{ rows: T[] }>
type Client = { query: Query; release?: () => void }
type DbPayload = Payload & { db: { pool?: { connect?: () => Promise<Client>; query?: Query } } }

export async function roomTransaction<T>(
  payload: Payload,
  work: (query: Query) => Promise<T>,
): Promise<T> {
  const client = await (payload as DbPayload).db.pool?.connect?.()
  if (!client)
    throw new CommunityError(
      'Rooms require transactional database access.',
      503,
      'ROOMS_DB_UNAVAILABLE',
    )
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

export function roomQuery(payload: Payload): Query {
  const pool = (payload as DbPayload).db.pool
  if (!pool?.query) throw new CommunityError('Database unavailable.', 503, 'ROOMS_DB_UNAVAILABLE')
  return pool.query.bind(pool)
}

export interface RoomBinding {
  conversationId: string
  siteId: string
  groupId: string | null
  eventId: string | null
  eventRestricted: boolean
  lifecycle: RoomLifecycle
  historyPolicy: RoomHistoryPolicy
  createdByMemberId: string
  mode: RoomMode
  accessPolicy: RoomAccessPolicy
  contentId: string | null
  discussionId: string | null
  participantLimit: number | null
  startsAt: string | null
  endsAt: string | null
}

export interface RoomAudience {
  bound: boolean
  canRead: boolean
  canWrite: boolean
  /** Group role, 'guest' (public-group reader), 'member' (site lounge), or null. */
  role: GroupRole | 'guest' | 'member' | null
  binding: RoomBinding | null
  reason?: string
}

const denied = (binding: RoomBinding | null, reason: string): RoomAudience => ({
  bound: Boolean(binding),
  canRead: false,
  canWrite: false,
  role: null,
  binding,
  reason,
})

export async function loadRoomBinding(
  query: Query,
  conversationId: string,
): Promise<RoomBinding | null> {
  if (!roomIdPattern.test(conversationId)) return null
  const row = (
    await query<Record<string, unknown>>('SELECT * FROM room_bindings WHERE conversation_id=$1', [
      conversationId,
    ])
  ).rows[0]
  if (!row) return null
  return {
    conversationId: String(row.conversation_id),
    siteId: String(row.site_id),
    groupId: row.group_id ? String(row.group_id) : null,
    eventId: row.event_id ? String(row.event_id) : null,
    eventRestricted: Boolean(row.event_restricted),
    lifecycle: String(row.lifecycle) as RoomLifecycle,
    historyPolicy: String(row.history_policy) as RoomHistoryPolicy,
    createdByMemberId: String(row.created_by_member_id),
    mode: row.mode as RoomMode,
    accessPolicy: row.access_policy as RoomAccessPolicy,
    contentId: row.content_id ? String(row.content_id) : null,
    discussionId: row.discussion_id ? String(row.discussion_id) : null,
    participantLimit: row.participant_limit === null ? null : Number(row.participant_limit),
    startsAt: row.starts_at ? new Date(String(row.starts_at)).toISOString() : null,
    endsAt: row.ends_at ? new Date(String(row.ends_at)).toISOString() : null,
  }
}

async function hasStanding(query: Query, siteId: string, memberId: string) {
  const row = (
    await query('SELECT id FROM member_site_roles WHERE site_id=$1 AND member_id=$2', [
      siteId,
      memberId,
    ])
  ).rows[0]
  return Boolean(row)
}

/**
 * The shared audience function. `query` may be a pool query or a
 * transaction client — send/list paths evaluate inside their
 * transaction so the decision and the write are one atomic story.
 */
export async function evaluateRoomAudience(
  query: Query,
  input: { siteId: string; conversationId: string; memberId: string | null },
): Promise<RoomAudience> {
  const binding = await loadRoomBinding(query, input.conversationId)
  if (!binding) return denied(null, 'ROOM_NOT_FOUND')
  if (binding.siteId !== input.siteId) return denied(binding, 'TENANT_MISMATCH')
  const row = (
    await query<{ can_read: boolean; can_write: boolean; audience_role: RoomAudience['role'] }>(
      'SELECT * FROM room_audience($1,$2)',
      [input.conversationId, input.memberId],
    )
  ).rows[0]
  if (!row?.can_read) return denied(binding, 'NOT_IN_AUDIENCE')
  return { bound: true, binding, canRead: true, canWrite: row.can_write, role: row.audience_role }
}

export async function requireRoomAccess(
  query: Query,
  input: { siteId: string; conversationId: string; memberId: string | null },
  mode: 'read' | 'write',
): Promise<RoomAudience> {
  const audience = await evaluateRoomAudience(query, input)
  if (!audience.bound) throw new CommunityError('Room not found.', 404, 'ROOM_NOT_FOUND')
  if (mode === 'read' && !audience.canRead)
    throw new CommunityError('Access denied.', 403, 'NOT_ROOM_AUDIENCE')
  if (mode === 'write' && !audience.canWrite)
    throw new CommunityError(
      audience.binding?.lifecycle === 'closed' ? 'This room is closed.' : 'Access denied.',
      audience.binding?.lifecycle === 'closed' ? 409 : 403,
      audience.binding?.lifecycle === 'closed' ? 'ROOM_CLOSED' : 'NOT_ROOM_AUDIENCE',
    )
  return audience
}

/** JS mirror of room_history_floor(): an existing row wins; otherwise the policy default. */
export async function roomFloorFor(
  query: Query,
  binding: RoomBinding,
  memberId: string,
): Promise<number> {
  const row = (
    await query<{ history_floor_sequence: number }>(
      'SELECT history_floor_sequence FROM room_read_states WHERE conversation_id=$1 AND member_id=$2',
      [binding.conversationId, memberId],
    )
  ).rows[0]
  if (row) return Number(row.history_floor_sequence)
  if (binding.historyPolicy === 'from-join') {
    const conversation = (
      await query<{ next_message_sequence: number }>(
        'SELECT next_message_sequence FROM conversations WHERE id=$1',
        [binding.conversationId],
      )
    ).rows[0]
    return Number(conversation?.next_message_sequence ?? 1)
  }
  return 1
}

async function ensureRoomReadState(
  query: Query,
  binding: RoomBinding,
  memberId: string,
): Promise<{ floor: number; lastRead: number }> {
  const floor = await roomFloorFor(query, binding, memberId)
  await query(
    'INSERT INTO room_read_states (conversation_id,member_id,history_floor_sequence) VALUES ($1,$2,$3) ON CONFLICT (conversation_id,member_id) DO NOTHING',
    [binding.conversationId, memberId, floor],
  )
  const row = (
    await query<{ history_floor_sequence: number; last_read_sequence: number }>(
      'SELECT history_floor_sequence,last_read_sequence FROM room_read_states WHERE conversation_id=$1 AND member_id=$2',
      [binding.conversationId, memberId],
    )
  ).rows[0]!
  return { floor: Number(row.history_floor_sequence), lastRead: Number(row.last_read_sequence) }
}

export async function appendRoomNotice(
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
  if (!sequence) throw new CommunityError('Room unavailable.', 404, 'ROOM_NOT_FOUND')
  await query(
    "INSERT INTO messages (conversation_id,sender_id,idempotency_key,sequence_number,body_html,kind,system_event) VALUES ($1,NULL,$2,$3,$4,'system',$5)",
    [conversationId, `system:${event}:${sequence}`, sequence, body, event],
  )
}

async function assertAttendeesInAudience(
  query: Query,
  input: { siteId: string; groupId: string | null; attendeeMemberIds: string[] },
) {
  for (const memberId of input.attendeeMemberIds) {
    const inside = input.groupId
      ? (
          await query(
            "SELECT id FROM group_memberships WHERE group_id=$1 AND member_id=$2 AND status='active'",
            [input.groupId, memberId],
          )
        ).rows[0]
      : (
          await query('SELECT id FROM member_site_roles WHERE site_id=$1 AND member_id=$2', [
            input.siteId,
            memberId,
          ])
        ).rows[0]
    if (!inside)
      throw new CommunityError(
        'An event attendee must already belong to the room audience.',
        422,
        'ATTENDEE_OUTSIDE_AUDIENCE',
      )
  }
}

async function isCreatorTheaterHost(query: Query, siteId: string, memberId: string) {
  const { rows } = await query(
    `SELECT 1 FROM member_site_roles r JOIN sites s ON s.id=r.site_id
       WHERE r.site_id=$1 AND r.member_id=$2 AND s.lifecycle='active'
       AND s.creator_policy->'enabled'='true'::jsonb
       AND jsonb_typeof(r.creator_capabilities)='array' AND r.creator_capabilities ? 'live.host'`,
    [siteId, memberId],
  )
  return rows.length > 0
}

export async function createRoom(
  payload: Payload,
  input: {
    siteId: string
    creatorMemberId: string
    title: string
    groupId?: string | null
    eventId?: string | null
    eventRestricted?: boolean
    attendeeMemberIds?: string[]
    historyPolicy?: RoomHistoryPolicy
    mode?: RoomMode
    accessPolicy?: RoomAccessPolicy
    contentId?: string
    discussionId?: string
    creatorTheater?: true
    participantLimit?: number
    startsAt?: string
    endsAt?: string
    entitlement?: { resource: string; capability: string; scope?: string }
  },
) {
  const title = input.title?.trim()
  if (!title || title.length > 256)
    throw new CommunityError(
      'A room title of 1-256 characters is required.',
      422,
      'INVALID_ROOM_TITLE',
    )
  const historyPolicy = input.historyPolicy ?? 'all'
  const mode = input.mode ?? (input.groupId ? 'group' : 'chat')
  const accessPolicy = input.accessPolicy ?? 'members'
  if (!roomModes.includes(mode) || !roomAccessPolicies.includes(accessPolicy))
    throw new CommunityError('Unknown room mode or audience.', 422, 'INVALID_ROOM_POLICY')
  if ((mode === 'group' && !input.groupId) || (mode === 'content-attached' && !input.contentId))
    throw new CommunityError('The room mode requires an owner.', 422, 'ROOM_OWNER_REQUIRED')
  if (
    accessPolicy === 'paid' &&
    (!input.entitlement?.resource.trim() || !input.entitlement.capability.trim())
  )
    throw new CommunityError(
      'Paid rooms require an entitlement policy.',
      422,
      'ROOM_ENTITLEMENT_REQUIRED',
    )
  if (
    input.participantLimit !== undefined &&
    (!Number.isInteger(input.participantLimit) ||
      input.participantLimit < 1 ||
      input.participantLimit > 10000)
  )
    throw new CommunityError(
      'Participant limit must be between 1 and 10000.',
      422,
      'INVALID_ROOM_LIMIT',
    )
  if (
    [input.startsAt, input.endsAt].some(
      (date) => date !== undefined && !Number.isFinite(Date.parse(date)),
    ) ||
    (input.startsAt && input.endsAt && Date.parse(input.startsAt) >= Date.parse(input.endsAt))
  )
    throw new CommunityError('Invalid room schedule.', 422, 'INVALID_ROOM_SCHEDULE')
  if (accessPolicy === 'public' && historyPolicy === 'from-join')
    throw new CommunityError(
      'Public rooms require full chat history.',
      422,
      'INVALID_HISTORY_POLICY',
    )
  if (
    [input.groupId, input.eventId, input.contentId, input.discussionId].some(
      (id) => id && !roomIdPattern.test(id),
    )
  )
    throw new CommunityError('Invalid room owner or link.', 422, 'INVALID_ROOM_OWNER')
  if (!roomHistoryPolicies.includes(historyPolicy))
    throw new CommunityError('Unknown history policy.', 422, 'INVALID_HISTORY_POLICY')
  if (input.eventRestricted && !input.eventId)
    throw new CommunityError(
      'An attendance restriction requires an event.',
      422,
      'EVENT_REQUIRED_FOR_RESTRICTION',
    )
  return roomTransaction(payload, async (query) => {
    const creator = (
      await query<{ status: string }>('SELECT status FROM members WHERE id=$1', [
        input.creatorMemberId,
      ])
    ).rows[0]
    if (!creator) throw new CommunityError('Member not found.', 404, 'MEMBER_NOT_FOUND')
    if (creator.status !== 'active')
      throw new CommunityError('Member account is not active.', 403, 'MEMBER_NOT_ACTIVE')
    if (input.groupId) {
      const group = (
        await query('SELECT id FROM groups WHERE id=$1 AND site_id=$2 AND status=$3', [
          input.groupId,
          input.siteId,
          'active',
        ])
      ).rows[0]
      if (!group) throw new CommunityError('Group not found.', 404, 'GROUP_NOT_FOUND')
      const authority = await groupAuthority(
        query,
        input.siteId,
        input.groupId,
        input.creatorMemberId,
      )
      if (!authority.viaStaff && authority.role !== 'owner' && authority.role !== 'admin')
        throw new CommunityError(
          'Group administrator permission is required to open a room.',
          403,
          'GROUP_ADMIN_REQUIRED',
        )
    } else if (
      !(await isSiteStaff(query, input.siteId, input.creatorMemberId)) &&
      !(
        input.creatorTheater &&
        mode === 'theater' &&
        ['public', 'members'].includes(accessPolicy) &&
        !input.eventId &&
        !input.contentId &&
        !input.discussionId &&
        (await isCreatorTheaterHost(query, input.siteId, input.creatorMemberId))
      )
    ) {
      throw new CommunityError(
        'Site staff permission is required to open a site room.',
        403,
        'SITE_STAFF_REQUIRED',
      )
    }
    if (input.eventId) {
      const event = (
        await query<{ site_id: string }>('SELECT site_id FROM calendar_entries WHERE id=$1', [
          input.eventId,
        ])
      ).rows[0]
      if (!event || String(event.site_id) !== input.siteId)
        throw new CommunityError('Event not found on this site.', 404, 'EVENT_NOT_FOUND')
    }
    if (
      input.contentId &&
      !(
        await query('SELECT id FROM content WHERE id=$1 AND site_id=$2', [
          input.contentId,
          input.siteId,
        ])
      ).rows[0]
    )
      throw new CommunityError('Content not found on this site.', 404, 'ROOM_CONTENT_NOT_FOUND')
    if (
      input.discussionId &&
      !(
        await query('SELECT id FROM discussions WHERE id=$1 AND site_id=$2', [
          input.discussionId,
          input.siteId,
        ])
      ).rows[0]
    )
      throw new CommunityError(
        'Discussion not found on this site.',
        404,
        'ROOM_DISCUSSION_NOT_FOUND',
      )
    const attendees = [...new Set(input.attendeeMemberIds ?? [])]
    if (input.eventRestricted)
      await assertAttendeesInAudience(query, {
        siteId: input.siteId,
        groupId: input.groupId ?? null,
        attendeeMemberIds: attendees,
      })
    const conversation = (
      await query<Record<string, unknown>>(
        "INSERT INTO conversations (site_id,kind,title) VALUES ($1,'group',$2) RETURNING *",
        [input.siteId, title],
      )
    ).rows[0]!
    const conversationId = String(conversation.id)
    await query(
      `INSERT INTO room_bindings (conversation_id,site_id,group_id,event_id,event_restricted,history_policy,created_by_member_id,
        mode,access_policy,content_id,discussion_id,participant_limit,starts_at,ends_at,entitlement_resource,entitlement_capability,entitlement_scope)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        conversationId,
        input.siteId,
        input.groupId ?? null,
        input.eventId ?? null,
        Boolean(input.eventRestricted),
        historyPolicy,
        input.creatorMemberId,
        mode,
        accessPolicy,
        input.contentId ?? null,
        input.discussionId ?? null,
        input.participantLimit ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.entitlement?.resource.trim() ?? null,
        input.entitlement?.capability.trim() ?? null,
        input.entitlement?.scope?.trim() || null,
      ],
    )
    for (const memberId of attendees)
      await query('INSERT INTO room_event_attendees (conversation_id,member_id) VALUES ($1,$2)', [
        conversationId,
        memberId,
      ])
    if (accessPolicy === 'invite')
      await query('INSERT INTO room_invitations (conversation_id,member_id) VALUES ($1,$2)', [
        conversationId,
        input.creatorMemberId,
      ])
    // The founding audience was present from the start: their
    // from-join floor is the first sequence. Later joiners get their
    // floor materialized by the group join path (or lazily at first
    // evaluation for standing granted after the room exists).
    if (input.groupId && accessPolicy === 'members')
      await query(
        `INSERT INTO room_read_states (conversation_id,member_id,history_floor_sequence)
         SELECT $1, member_id, 1 FROM group_memberships WHERE group_id=$2 AND status='active'
         ON CONFLICT (conversation_id,member_id) DO NOTHING`,
        [conversationId, input.groupId],
      )
    else if (accessPolicy === 'members')
      await query(
        `INSERT INTO room_read_states (conversation_id,member_id,history_floor_sequence)
         SELECT $1, member_id, 1 FROM member_site_roles WHERE site_id=$2
         ON CONFLICT (conversation_id,member_id) DO NOTHING`,
        [conversationId, input.siteId],
      )
    await appendRoomNotice(query, conversationId, 'room_created', 'The room was created.')
    return {
      id: conversationId,
      siteId: input.siteId,
      title,
      groupId: input.groupId ?? null,
      eventId: input.eventId ?? null,
      eventRestricted: Boolean(input.eventRestricted),
      lifecycle: 'open' as RoomLifecycle,
      historyPolicy,
      mode,
      accessPolicy,
    }
  })
}

export async function canManageRoom(
  query: Query,
  binding: RoomBinding,
  actorMemberId: string,
  moderate = false,
) {
  const active = await query("SELECT id FROM members WHERE id=$1 AND status='active'", [
    actorMemberId,
  ])
  if (!active.rows[0]) return false
  if (await isSiteStaff(query, binding.siteId, actorMemberId)) return true
  if (binding.groupId) {
    const authority = await groupAuthority(query, binding.siteId, binding.groupId, actorMemberId)
    return (
      authority.role === 'owner' ||
      authority.role === 'admin' ||
      (moderate && authority.role === 'moderator')
    )
  }
  return (
    binding.mode === 'theater' &&
    binding.createdByMemberId === actorMemberId &&
    !binding.eventId &&
    !binding.contentId &&
    !binding.discussionId &&
    ['members', 'public'].includes(binding.accessPolicy) &&
    isCreatorTheaterHost(query, binding.siteId, actorMemberId)
  )
}

async function requireRoomManager(query: Query, binding: RoomBinding, actorMemberId: string) {
  if (await canManageRoom(query, binding, actorMemberId)) return
  throw new CommunityError('Room manager permission is required.', 403, 'ROOM_MANAGER_REQUIRED')
}

export async function setRoomAttendees(
  payload: Payload,
  input: {
    siteId: string
    conversationId: string
    actorMemberId: string
    attendeeMemberIds: string[]
  },
) {
  return roomTransaction(payload, async (query) => {
    const binding = await loadRoomBinding(query, input.conversationId)
    if (!binding || binding.siteId !== input.siteId)
      throw new CommunityError('Room not found.', 404, 'ROOM_NOT_FOUND')
    await requireRoomManager(query, binding, input.actorMemberId)
    const attendees = [...new Set(input.attendeeMemberIds)]
    await assertAttendeesInAudience(query, {
      siteId: input.siteId,
      groupId: binding.groupId,
      attendeeMemberIds: attendees,
    })
    await query('DELETE FROM room_event_attendees WHERE conversation_id=$1', [input.conversationId])
    for (const memberId of attendees)
      await query('INSERT INTO room_event_attendees (conversation_id,member_id) VALUES ($1,$2)', [
        input.conversationId,
        memberId,
      ])
    if (!binding.eventRestricted)
      await query(
        'UPDATE room_bindings SET event_restricted=true, updated_at=now() WHERE conversation_id=$1',
        [input.conversationId],
      )
    return { attendeeCount: attendees.length }
  })
}

export async function setRoomLifecycle(
  payload: Payload,
  input: {
    siteId: string
    conversationId: string
    actorMemberId: string
    lifecycle: RoomLifecycle
  },
) {
  if (!roomLifecycles.includes(input.lifecycle))
    throw new CommunityError('Unknown room lifecycle.', 422, 'INVALID_ROOM_LIFECYCLE')
  return roomTransaction(payload, async (query) => {
    const binding = await loadRoomBinding(query, input.conversationId)
    if (!binding || binding.siteId !== input.siteId)
      throw new CommunityError('Room not found.', 404, 'ROOM_NOT_FOUND')
    await requireRoomManager(query, binding, input.actorMemberId)
    await query(
      'UPDATE room_bindings SET lifecycle=$2, updated_at=now() WHERE conversation_id=$1',
      [input.conversationId, input.lifecycle],
    )
    await appendRoomNotice(
      query,
      input.conversationId,
      input.lifecycle === 'closed' ? 'room_closed' : 'room_reopened',
      input.lifecycle === 'closed' ? 'The room was closed.' : 'The room was reopened.',
    )
    return { lifecycle: input.lifecycle }
  })
}

export async function getRoom(
  payload: Payload,
  input: { siteId: string; conversationId: string; viewerMemberId: string },
) {
  const query = roomQuery(payload)
  const binding = await loadRoomBinding(query, input.conversationId)
  if (!binding || binding.siteId !== input.siteId)
    throw new CommunityError('Room not found.', 404, 'ROOM_NOT_FOUND')
  const conversation = (
    await query<{ title: string | null; last_message_at: string | null }>(
      'SELECT title, last_message_at FROM conversations WHERE id=$1',
      [input.conversationId],
    )
  ).rows[0]
  const audience = await evaluateRoomAudience(query, {
    siteId: input.siteId,
    conversationId: input.conversationId,
    memberId: input.viewerMemberId,
  })
  if (!audience.canRead) {
    // D6: the room's existence may be public knowledge (an event page
    // links it); its content, counts and participants are not
    // computable by anyone outside the audience.
    return {
      id: input.conversationId,
      access: 'denied' as const,
      lifecycle: binding.lifecycle,
      eventRestricted: binding.eventRestricted,
    }
  }
  const state = await ensureRoomReadState(query, binding, input.viewerMemberId)
  const unread = Number(
    (
      await query<{ count: number }>(
        `SELECT count(*)::int AS count FROM messages
         WHERE conversation_id=$1 AND sequence_number >= $2 AND sequence_number > $3
           AND room_removed_at IS NULL
           AND sender_id IS NOT NULL AND sender_id <> $4`,
        [input.conversationId, state.floor, state.lastRead, input.viewerMemberId],
      )
    ).rows[0]?.count ?? 0,
  )
  return {
    id: input.conversationId,
    access: 'granted' as const,
    title: conversation?.title ?? null,
    groupId: binding.groupId,
    eventId: binding.eventId,
    eventRestricted: binding.eventRestricted,
    lifecycle: binding.lifecycle,
    historyPolicy: binding.historyPolicy,
    role: audience.role,
    canWrite: audience.canWrite,
    lastMessageAt: conversation?.last_message_at ?? null,
    unreadCount: unread,
  }
}

const hiddenByRelations = `
  NOT EXISTS (
    SELECT 1 FROM relationships r
    WHERE r.status = 'active'
      AND (
        (r.kind = 'block' AND r.pair_key IN (
          'block:' || $site || ':' || m.sender_id || ':' || $reader,
          'block:' || m.sender_id || ':' || $reader,
          'block:' || $site || ':' || $reader || ':' || m.sender_id,
          'block:' || $reader || ':' || m.sender_id
        ))
        OR (r.kind = 'mute' AND r.pair_key IN (
          'mute:' || $site || ':' || $reader || ':' || m.sender_id,
          'mute:' || $reader || ':' || m.sender_id
        ))
      )
  )`

/**
 * Cursor polling (D8): pass the last sequence you saw as
 * `afterSequence`; you receive the next page in order, the current
 * unread count, and the latest allocated sequence. Postgres is the
 * authority — reconnects and restarts lose nothing.
 */
export async function listRoomMessages(
  payload: Payload,
  input: {
    siteId: string
    conversationId: string
    memberId: string | null
    afterSequence?: number
    limit?: number
    latest?: boolean
  },
) {
  const query = roomQuery(payload)
  const audience = await requireRoomAccess(query, input, 'read')
  const binding = audience.binding!
  const state = input.memberId
    ? await ensureRoomReadState(query, binding, input.memberId)
    : { floor: 1, lastRead: 0 }
  const after = Math.max(input.afterSequence ?? 0, 0)
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200)
  const rows = await query<Record<string, unknown>>(
    `SELECT m.id, m.conversation_id, m.sender_id, m.sequence_number, m.body_html, m.created_at, m.room_question,
       COALESCE(json_agg(json_build_object('id',a.id,'filename',a.original_filename,'mimeType',a.claimed_mime_type,'status',a.status,'presentation',CASE WHEN a.status='clean' THEN 'attachment' ELSE 'attachment_pending' END)) FILTER (WHERE a.id IS NOT NULL), '[]') AS attachments
     FROM messages m LEFT JOIN message_attachments a ON a.message_id = m.id
     WHERE m.conversation_id = $1 AND m.sequence_number >= $2 AND m.sequence_number > $3
       AND m.room_removed_at IS NULL
       AND ${hiddenByRelations.replaceAll('$site', '$4').replaceAll('$reader', '$5')}
     GROUP BY m.id ORDER BY m.sequence_number ${input.latest ? 'DESC' : 'ASC'} LIMIT $6`,
    [input.conversationId, state.floor, after, input.siteId, input.memberId, limit],
  )
  const pinned = await query<Record<string, unknown>>(
    `SELECT m.id, m.body_html FROM room_bindings b JOIN messages m
       ON m.id=b.pinned_message_id AND m.conversation_id=b.conversation_id
     WHERE b.conversation_id=$1 AND m.sequence_number >= $2 AND m.room_removed_at IS NULL
       AND ${hiddenByRelations.replaceAll('$site', '$3').replaceAll('$reader', '$4')}`,
    [input.conversationId, state.floor, input.siteId, input.memberId],
  )
  const latest = Number(
    (
      await query<{ next: number }>(
        'SELECT next_message_sequence - 1 AS next FROM conversations WHERE id=$1',
        [input.conversationId],
      )
    ).rows[0]?.next ?? 0,
  )
  const unread = Number(
    (
      await query<{ count: number }>(
        `SELECT count(*)::int AS count FROM messages m
         WHERE m.conversation_id=$1 AND m.sequence_number >= $2 AND m.sequence_number > $3
           AND m.sender_id IS NOT NULL AND m.sender_id <> $4 AND m.room_removed_at IS NULL
           AND ${hiddenByRelations.replaceAll('$site', '$5').replaceAll('$reader', '$4')}`,
        [input.conversationId, state.floor, state.lastRead, input.memberId, input.siteId],
      )
    ).rows[0]?.count ?? 0,
  )
  return {
    messages: input.latest ? rows.rows.reverse() : rows.rows,
    pinned: pinned.rows[0] ?? null,
    floor: state.floor,
    lastReadSequence: state.lastRead,
    unreadCount: unread,
    latestSequence: latest,
  }
}

export async function markRoomRead(
  payload: Payload,
  input: { siteId: string; conversationId: string; memberId: string; upToSequence: number },
) {
  return roomTransaction(payload, async (query) => {
    const audience = await requireRoomAccess(query, input, 'read')
    const binding = audience.binding!
    const state = await ensureRoomReadState(query, binding, input.memberId)
    const latest = Number(
      (
        await query<{ next: number }>(
          'SELECT next_message_sequence - 1 AS next FROM conversations WHERE id=$1',
          [input.conversationId],
        )
      ).rows[0]?.next ?? 0,
    )
    // Monotonic: a stale client can never rewind the cursor.
    const next = Math.min(Math.max(input.upToSequence, state.lastRead), latest)
    const {
      rows: [updated],
    } = await query<{ last_read_sequence: number }>(
      'UPDATE room_read_states SET last_read_sequence=GREATEST(last_read_sequence,$3), updated_at=now() WHERE conversation_id=$1 AND member_id=$2 RETURNING last_read_sequence',
      [input.conversationId, input.memberId, next],
    )
    return { lastReadSequence: updated.last_read_sequence }
  })
}

export async function getRoomReadState(
  payload: Payload,
  input: { siteId: string; conversationId: string; memberId: string },
) {
  const query = roomQuery(payload)
  const audience = await requireRoomAccess(query, input, 'read')
  const binding = audience.binding!
  const state = await ensureRoomReadState(query, binding, input.memberId)
  const latest = Number(
    (
      await query<{ next: number }>(
        'SELECT next_message_sequence - 1 AS next FROM conversations WHERE id=$1',
        [input.conversationId],
      )
    ).rows[0]?.next ?? 0,
  )
  return { floor: state.floor, lastReadSequence: state.lastRead, latestSequence: latest }
}

// ---------------------------------------------------------------------------
// Recaps (Circles D4): quotes are references, never copies. Containment
// is computed over RESOLVED member sets at creation and at publish.
// ---------------------------------------------------------------------------

export function isAudienceSubset(inner: Set<string>, outer: Set<string>): boolean {
  for (const member of inner) if (!outer.has(member)) return false
  return true
}

async function standingMemberIds(query: Query, siteId: string): Promise<Set<string>> {
  const rows = await query<{ member_id: string }>(
    'SELECT member_id FROM member_site_roles WHERE site_id=$1',
    [siteId],
  )
  return new Set(rows.rows.map((row) => String(row.member_id)))
}

async function activeGroupMemberIds(query: Query, groupId: string): Promise<Set<string>> {
  const rows = await query<{ member_id: string }>(
    "SELECT member_id FROM group_memberships WHERE group_id=$1 AND status='active'",
    [groupId],
  )
  return new Set(rows.rows.map((row) => String(row.member_id)))
}

export async function resolveRoomAudienceIds(
  query: Query,
  binding: RoomBinding,
): Promise<Set<string>> {
  const result = await query<{ member_id: string }>(
    `SELECT candidate.member_id FROM (
       SELECT member_id FROM member_site_roles WHERE site_id=$1
       UNION SELECT member_id FROM group_memberships WHERE group_id=$2 AND status='active'
       UNION SELECT member_id FROM room_invitations WHERE conversation_id=$3
       UNION SELECT supporter.member_id FROM supporters supporter
         JOIN entitlements e ON e.supporter_id=supporter.id WHERE e.site_id=$1 AND supporter.member_id IS NOT NULL
     ) candidate
     WHERE EXISTS (SELECT 1 FROM room_audience($3,candidate.member_id) WHERE can_read)`,
    [binding.siteId, binding.groupId, binding.conversationId],
  )
  return new Set(result.rows.map((row) => String(row.member_id)))
}

/** The resolved READ set of a recap destination (a group, or the whole site). */
export async function resolveDestinationAudienceIds(
  query: Query,
  siteId: string,
  destinationGroupId: string | null,
): Promise<Set<string>> {
  if (!destinationGroupId) return standingMemberIds(query, siteId)
  const group = (
    await query<{ privacy: string }>('SELECT privacy FROM groups WHERE id=$1 AND site_id=$2', [
      destinationGroupId,
      siteId,
    ])
  ).rows[0]
  if (!group) throw new CommunityError('Destination group not found.', 404, 'GROUP_NOT_FOUND')
  const members = await activeGroupMemberIds(query, destinationGroupId)
  if (group.privacy === 'public')
    return new Set([...(await standingMemberIds(query, siteId)), ...members])
  return members
}

export async function createRecap(
  payload: Payload,
  input: {
    siteId: string
    sourceConversationId: string
    authorMemberId: string
    title: string
    body?: string
    quoteMessageIds: string[]
    destinationGroupId?: string | null
  },
) {
  const title = input.title?.trim()
  if (!title || title.length > 200)
    throw new CommunityError(
      'A recap title of 1-200 characters is required.',
      422,
      'INVALID_RECAP_TITLE',
    )
  if (!input.quoteMessageIds.length)
    throw new CommunityError(
      'A recap needs at least one quoted message.',
      422,
      'RECAP_QUOTES_REQUIRED',
    )
  return roomTransaction(payload, async (query) => {
    const audience = await requireRoomAccess(
      query,
      {
        siteId: input.siteId,
        conversationId: input.sourceConversationId,
        memberId: input.authorMemberId,
      },
      'read',
    )
    const binding = audience.binding!
    const floor = await roomFloorFor(query, binding, input.authorMemberId)
    const quotes: Array<{ id: string; sequence: number }> = []
    for (const messageId of [...new Set(input.quoteMessageIds)]) {
      const message = (
        await query<{ id: string; sequence_number: number }>(
          'SELECT id, sequence_number FROM messages WHERE id=$1 AND conversation_id=$2 AND room_removed_at IS NULL',
          [messageId, input.sourceConversationId],
        )
      ).rows[0]
      if (!message)
        throw new CommunityError(
          'A quoted message does not belong to the source room.',
          422,
          'RECAP_QUOTE_FOREIGN',
        )
      if (Number(message.sequence_number) < floor)
        throw new CommunityError(
          'You cannot quote a message outside your visible history.',
          403,
          'RECAP_QUOTE_BELOW_FLOOR',
        )
      quotes.push({ id: String(message.id), sequence: Number(message.sequence_number) })
    }
    const destinationGroupId =
      input.destinationGroupId === undefined ? binding.groupId : input.destinationGroupId
    const sourceSet = await resolveRoomAudienceIds(query, binding)
    const destinationSet = await resolveDestinationAudienceIds(
      query,
      input.siteId,
      destinationGroupId,
    )
    if (!isAudienceSubset(destinationSet, sourceSet))
      throw new CommunityError(
        'The destination audience is broader than the quoted source audience.',
        422,
        'RECAP_AUDIENCE_WIDER',
      )
    const recap = (
      await query<Record<string, unknown>>(
        'INSERT INTO room_recaps (site_id,source_conversation_id,destination_group_id,author_member_id,title,body) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [
          input.siteId,
          input.sourceConversationId,
          destinationGroupId,
          input.authorMemberId,
          title,
          input.body ?? '',
        ],
      )
    ).rows[0]!
    const ordered = quotes.sort((a, b) => a.sequence - b.sequence)
    for (const [index, quote] of ordered.entries())
      await query(
        'INSERT INTO room_recap_quotes (recap_id,source_message_id,source_sequence,position) VALUES ($1,$2,$3,$4)',
        [String(recap.id), quote.id, quote.sequence, index],
      )
    return { id: String(recap.id), status: 'draft' as const }
  })
}

export async function publishRecap(
  payload: Payload,
  input: { siteId: string; recapId: string; approverMemberId: string },
) {
  return roomTransaction(payload, async (query) => {
    const recap = (
      await query<Record<string, unknown>>(
        'SELECT * FROM room_recaps WHERE id=$1 AND site_id=$2 FOR UPDATE',
        [input.recapId, input.siteId],
      )
    ).rows[0]
    if (!recap) throw new CommunityError('Recap not found.', 404, 'RECAP_NOT_FOUND')
    if (recap.status === 'published')
      throw new CommunityError('This recap is already published.', 409, 'RECAP_ALREADY_PUBLISHED')
    // Human approval: a moderator-or-above of the destination (or the
    // source group, or site staff) must make the publish call.
    let approved = await isSiteStaff(query, input.siteId, input.approverMemberId)
    for (const groupId of [recap.destination_group_id, null]) {
      if (approved) break
      const target = groupId
        ? String(groupId)
        : (
            await query<{ group_id: string | null }>(
              'SELECT group_id FROM room_bindings WHERE conversation_id=$1',
              [String(recap.source_conversation_id)],
            )
          ).rows[0]?.group_id
      if (!target) continue
      const authority = await groupAuthority(
        query,
        input.siteId,
        String(target),
        input.approverMemberId,
      )
      if (
        authority.role === 'owner' ||
        authority.role === 'admin' ||
        authority.role === 'moderator'
      )
        approved = true
    }
    if (!approved)
      throw new CommunityError(
        'A group moderator or site staff member must approve a recap.',
        403,
        'RECAP_APPROVAL_REQUIRED',
      )
    const binding = await loadRoomBinding(query, String(recap.source_conversation_id))
    if (!binding) throw new CommunityError('Source room not found.', 404, 'ROOM_NOT_FOUND')
    const sourceSet = await resolveRoomAudienceIds(query, binding)
    const destinationSet = await resolveDestinationAudienceIds(
      query,
      input.siteId,
      recap.destination_group_id ? String(recap.destination_group_id) : null,
    )
    if (!isAudienceSubset(destinationSet, sourceSet)) {
      // D4: never silently narrow, never publish anyway — land in an
      // explicit blocked state with the reason visible to the host.
      const reason =
        'The destination audience is no longer contained in the quoted source audience.'
      await query(
        "UPDATE room_recaps SET status='blocked', blocked_reason=$2, updated_at=now() WHERE id=$1",
        [input.recapId, reason],
      )
      return { id: input.recapId, status: 'blocked' as const, blockedReason: reason }
    }
    await query(
      "UPDATE room_recaps SET status='published', blocked_reason=NULL, approved_by_member_id=$2, published_at=now(), updated_at=now() WHERE id=$1",
      [input.recapId, input.approverMemberId],
    )
    return { id: input.recapId, status: 'published' as const }
  })
}

async function memberInDestination(
  query: Query,
  siteId: string,
  destinationGroupId: string | null,
  memberId: string,
): Promise<boolean> {
  if (!destinationGroupId) return hasStanding(query, siteId, memberId)
  const membership = (
    await query(
      "SELECT id FROM group_memberships WHERE group_id=$1 AND member_id=$2 AND status='active'",
      [destinationGroupId, memberId],
    )
  ).rows[0]
  if (membership) return true
  const group = (
    await query<{ privacy: string }>('SELECT privacy FROM groups WHERE id=$1', [destinationGroupId])
  ).rows[0]
  return group?.privacy === 'public' && (await hasStanding(query, siteId, memberId))
}

export async function getRecap(
  payload: Payload,
  input: { siteId: string; recapId: string; viewerMemberId: string },
) {
  const query = roomQuery(payload)
  const recap = (
    await query<Record<string, unknown>>('SELECT * FROM room_recaps WHERE id=$1 AND site_id=$2', [
      input.recapId,
      input.siteId,
    ])
  ).rows[0]
  if (!recap) throw new CommunityError('Recap not found.', 404, 'RECAP_NOT_FOUND')
  const destinationGroupId = recap.destination_group_id ? String(recap.destination_group_id) : null
  const isAuthor = String(recap.author_member_id) === input.viewerMemberId
  if (recap.status !== 'published') {
    let staff = isAuthor || (await isSiteStaff(query, input.siteId, input.viewerMemberId))
    if (!staff && destinationGroupId) {
      const authority = await groupAuthority(
        query,
        input.siteId,
        destinationGroupId,
        input.viewerMemberId,
      )
      staff =
        authority.role === 'owner' || authority.role === 'admin' || authority.role === 'moderator'
    }
    if (!staff) throw new CommunityError('Recap not found.', 404, 'RECAP_NOT_FOUND')
  } else if (
    !isAuthor &&
    !(await memberInDestination(query, input.siteId, destinationGroupId, input.viewerMemberId))
  ) {
    throw new CommunityError('Access denied.', 403, 'NOT_RECAP_AUDIENCE')
  }
  const binding = await loadRoomBinding(query, String(recap.source_conversation_id))
  const sourceAudience = binding
    ? await evaluateRoomAudience(query, {
        siteId: input.siteId,
        conversationId: binding.conversationId,
        memberId: input.viewerMemberId,
      })
    : null
  if (!sourceAudience?.canRead) throw new CommunityError('Access denied.', 403, 'NOT_ROOM_AUDIENCE')
  const viewerFloor =
    binding && sourceAudience?.canRead
      ? await roomFloorFor(query, binding, input.viewerMemberId)
      : null
  const quoteRows = await query<Record<string, unknown>>(
    `SELECT q.id, q.source_message_id, q.source_sequence, q.position,
            m.body_html, m.sender_id, m.created_at
     FROM room_recap_quotes q LEFT JOIN messages m ON m.id = q.source_message_id AND m.room_removed_at IS NULL
     WHERE q.recap_id=$1 ORDER BY q.position ASC`,
    [input.recapId],
  )
  const quotes = quoteRows.rows.map((row) => {
    // Source removal renders a tombstone in every recap, by
    // construction: the quote is a reference, never a copy (D4).
    if (!row.source_message_id || row.body_html === null || row.body_html === undefined)
      return { position: Number(row.position), tombstone: true as const }
    if (
      !sourceAudience?.canRead ||
      viewerFloor === null ||
      Number(row.source_sequence) < viewerFloor
    )
      return { position: Number(row.position), placeholder: true as const }
    return {
      position: Number(row.position),
      bodyHtml: String(row.body_html),
      senderId: row.sender_id ? String(row.sender_id) : null,
      sourceSequence: Number(row.source_sequence),
    }
  })
  return {
    id: String(recap.id),
    siteId: input.siteId,
    title: String(recap.title),
    body: String(recap.body ?? ''),
    status: String(recap.status),
    blockedReason: recap.blocked_reason ? String(recap.blocked_reason) : null,
    authorMemberId: String(recap.author_member_id),
    sourceConversationId: String(recap.source_conversation_id),
    destinationGroupId,
    publishedAt: recap.published_at ? String(recap.published_at) : null,
    quotes,
  }
}

export async function listGroupLibrary(
  payload: Payload,
  input: { siteId: string; groupId: string; viewerMemberId: string },
) {
  const query = roomQuery(payload)
  // The library lives inside the group home: the group gate applies,
  // and listings carry no quote content (D6 non-leak rule).
  await getGroup(payload, {
    siteId: input.siteId,
    groupId: input.groupId,
    viewerMemberId: input.viewerMemberId,
  })
  const rows = await query<Record<string, unknown>>(
    `SELECT r.id, r.title, r.author_member_id, r.published_at,
       (SELECT count(*)::int FROM room_recap_quotes q WHERE q.recap_id = r.id) AS quote_count
     FROM room_recaps r
     WHERE r.site_id=$1 AND r.destination_group_id=$2 AND r.status='published'
       AND EXISTS (SELECT 1 FROM room_audience(r.source_conversation_id,$3) WHERE can_read)
     ORDER BY r.published_at DESC`,
    [input.siteId, input.groupId, input.viewerMemberId],
  )
  return rows.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    authorMemberId: String(row.author_member_id),
    publishedAt: row.published_at ? String(row.published_at) : null,
    quoteCount: Number(row.quote_count ?? 0),
  }))
}

/**
 * The group home (Circles D2): a permission-aware read projection over
 * canonical records — group, rooms, library, next bound event. It is
 * not the site feed and creates no store.
 */
export async function getGroupHome(
  payload: Payload,
  input: { siteId: string; groupId: string; viewerMemberId: string },
) {
  const query = roomQuery(payload)
  const group = await getGroup(payload, input)
  const roomRows = await query<Record<string, unknown>>(
    `SELECT c.id, c.title, c.last_message_at, b.lifecycle, b.history_policy, b.event_id, b.event_restricted,
       (SELECT can_read FROM room_audience(c.id, $3)) AS can_read,
       (SELECT can_write FROM room_audience(c.id, $3)) AS can_write
     FROM room_bindings b JOIN conversations c ON c.id = b.conversation_id
     WHERE b.group_id=$1 AND b.site_id=$2 AND c.status='active'
       AND EXISTS (SELECT 1 FROM room_audience(c.id,$3) WHERE can_read)
     ORDER BY c.created_at ASC`,
    [input.groupId, input.siteId, input.viewerMemberId],
  )
  const rooms = roomRows.rows.map((row) => ({
    id: String(row.id),
    title: row.title ? String(row.title) : null,
    lifecycle: String(row.lifecycle),
    historyPolicy: String(row.history_policy),
    eventId: row.event_id ? String(row.event_id) : null,
    eventRestricted: Boolean(row.event_restricted),
    canRead: Boolean(row.can_read),
    canWrite: Boolean(row.can_write),
    lastMessageAt: row.can_read && row.last_message_at ? String(row.last_message_at) : null,
  }))
  const nextEventRow = (
    await query<Record<string, unknown>>(
      `SELECT e.id, e.title, e.starts_at FROM calendar_entries e
       JOIN room_bindings b ON b.event_id = e.id
       WHERE b.group_id=$1 AND e.site_id=$2 AND e.starts_at >= now() AND e.status NOT IN ('cancelled','archived')
         AND EXISTS (SELECT 1 FROM room_audience(b.conversation_id,$3) WHERE can_read)
       ORDER BY e.starts_at ASC LIMIT 1`,
      [input.groupId, input.siteId, input.viewerMemberId],
    )
  ).rows[0]
  const library = await listGroupLibrary(payload, input)
  return {
    group,
    rooms,
    library,
    nextEvent: nextEventRow
      ? {
          id: String(nextEventRow.id),
          title: String(nextEventRow.title),
          startsAt: String(nextEventRow.starts_at),
        }
      : null,
  }
}
