import type { Payload } from 'payload'
import { CommunityError } from './service'
import { isSiteStaff } from './groups'
import {
  canManageRoom,
  loadRoomBinding,
  requireRoomAccess,
  roomIdPattern,
  roomQuery,
  roomTransaction,
} from './rooms'

export type RoomViewer = { siteId: string; conversationId: string; memberId: string | null }
type RoomMember = RoomViewer & { memberId: string }

export async function listSiteRooms(payload: Payload, siteId: string, memberId: string | null) {
  const query = roomQuery(payload)
  const { rows } = await query<{
    id: string
    title: string
    mode: string
    event_title: string | null
    event_starts_at: Date | null
    event_announcement: string | null
  }>(
    `SELECT c.id, c.title, b.mode, e.title AS event_title, e.starts_at AS event_starts_at,
       e.announcement AS event_announcement
     FROM room_bindings b JOIN conversations c ON c.id=b.conversation_id
     LEFT JOIN live_events e ON e.room_id=b.conversation_id AND e.ended_at IS NULL
     WHERE b.site_id=$1 AND c.site_id=$1 AND c.status='active'
       AND EXISTS (SELECT 1 FROM room_audience(c.id,$2) WHERE can_read)
     ORDER BY c.created_at DESC LIMIT 100`,
    [siteId, memberId],
  )
  const canCreate =
    memberId !== null &&
    Boolean(
      (await query("SELECT id FROM members WHERE id=$1 AND status='active'", [memberId])).rows[0] &&
        ((await isSiteStaff(query, siteId, memberId)) ||
          (
            await query(
              `SELECT g.id FROM groups g JOIN group_memberships gm ON gm.group_id=g.id
       WHERE g.site_id=$1 AND g.status='active' AND gm.member_id=$2 AND gm.status='active'
         AND gm.role IN ('owner','admin') LIMIT 1`,
              [siteId, memberId],
            )
          ).rows[0]),
    )
  return { rooms: rows, canCreate }
}

export async function roomOverview(payload: Payload, viewer: RoomViewer) {
  const query = roomQuery(payload)
  const audience = await requireRoomAccess(query, viewer, 'read')
  const binding = audience.binding!
  const {
    rows: [room],
  } = await query<{
    title: string
    starts_at: Date | null
    ends_at: Date | null
    discussion_path: string | null
  }>(
    `SELECT c.title, e.starts_at, e.ends_at, d.canonical_path AS discussion_path
     FROM conversations c
     JOIN room_bindings b ON b.conversation_id=c.id
     LEFT JOIN calendar_entries e ON e.id=b.event_id AND e.site_id=b.site_id
       AND e.status NOT IN ('cancelled','archived') AND (b.event_restricted OR e.visibility='public')
     LEFT JOIN discussions d ON d.id=b.discussion_id AND d.site_id=b.site_id
       AND d.visibility='public' AND d.moderation_state='clear' AND d.status IN ('open','locked')
       AND d.retention_mode NOT IN ('manual-burn','tombstone')
       AND (d.retention_mode <> 'expire-at' OR d.retention_expires_at > now())
     WHERE c.id=$1 AND c.site_id=$2`,
    [viewer.conversationId, viewer.siteId],
  )
  const discussionPath =
    room.discussion_path && /^\/(?![/\\])[^\\\r\n]*$/.test(room.discussion_path)
      ? room.discussion_path
      : null
  return {
    title: room.title,
    mode: binding.mode,
    lifecycle: binding.lifecycle,
    canWrite: audience.canWrite,
    signedIn: Boolean(viewer.memberId),
    canManage: viewer.memberId ? await canManageRoom(query, binding, viewer.memberId) : false,
    canModerate: viewer.memberId
      ? await canManageRoom(query, binding, viewer.memberId, true)
      : false,
    accessPolicy: binding.accessPolicy,
    startsAt: binding.startsAt ?? room.starts_at?.toISOString() ?? null,
    endsAt: binding.endsAt ?? room.ends_at?.toISOString() ?? null,
    discussionPath,
    participantLimit: binding.participantLimit,
  }
}

export async function roomAttendees(payload: Payload, viewer: RoomViewer) {
  const query = roomQuery(payload)
  const { binding } = await requireRoomAccess(query, viewer, 'read')
  const moderators =
    viewer.memberId && (await canManageRoom(query, binding!, viewer.memberId, true))
  const {
    rows: [presence],
  } = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM room_participation p
     WHERE p.conversation_id=$1 AND p.active_until>now()
       AND EXISTS (SELECT 1 FROM room_audience(p.conversation_id,p.member_id) WHERE can_write)`,
    [viewer.conversationId],
  )
  const requests =
    moderators || viewer.memberId
      ? await query<{ member_id: string; status: string }>(
          `SELECT member_id,status FROM room_speaker_requests
         WHERE conversation_id=$1 AND ($2::boolean OR member_id=$3)
         ORDER BY requested_at DESC LIMIT 100`,
          [viewer.conversationId, Boolean(moderators), viewer.memberId],
        )
      : null
  return { presentCount: presence.count, speakerRequests: requests?.rows ?? [] }
}

export async function participateInRoom(payload: Payload, viewer: RoomMember, leave = false) {
  return roomTransaction(payload, async (query) => {
    // Serialize admission and renewal against all other seats for this room.
    await query(
      'SELECT conversation_id FROM room_bindings WHERE conversation_id=$1 AND site_id=$2 FOR UPDATE',
      [viewer.conversationId, viewer.siteId],
    )
    const { binding } = await requireRoomAccess(query, viewer, leave ? 'read' : 'write')
    if (leave) {
      await query('DELETE FROM room_participation WHERE conversation_id=$1 AND member_id=$2', [
        viewer.conversationId,
        viewer.memberId,
      ])
      return { joined: false }
    }
    await query(
      `DELETE FROM room_participation p WHERE conversation_id=$1
       AND (active_until<=now() OR NOT EXISTS
         (SELECT 1 FROM room_audience(p.conversation_id,p.member_id) WHERE can_write))`,
      [viewer.conversationId],
    )
    if (binding!.participantLimit !== null) {
      const {
        rows: [seats],
      } = await query<{ occupied: number }>(
        'SELECT count(*)::int AS occupied FROM room_participation WHERE conversation_id=$1 AND member_id<>$2',
        [viewer.conversationId, viewer.memberId],
      )
      if (seats.occupied >= binding!.participantLimit)
        throw new CommunityError('The room has reached its participant limit.', 409, 'ROOM_FULL')
    }
    await query(
      `INSERT INTO room_participation (conversation_id,member_id,active_until)
       VALUES ($1,$2,now()+interval '90 seconds')
       ON CONFLICT (conversation_id,member_id) DO UPDATE SET active_until=excluded.active_until`,
      [viewer.conversationId, viewer.memberId],
    )
    return { joined: true }
  })
}

export async function requestRoomSpeaker(payload: Payload, viewer: RoomMember) {
  return roomTransaction(payload, async (query) => {
    const { binding } = await requireRoomAccess(query, viewer, 'write')
    const { rows } = await query(
      'SELECT member_id FROM room_participation WHERE conversation_id=$1 AND member_id=$2 AND active_until>now()',
      [viewer.conversationId, viewer.memberId],
    )
    if (binding?.mode !== 'theater' || !rows[0])
      throw new CommunityError(
        'Join the theater before requesting to speak.',
        409,
        'ROOM_JOIN_REQUIRED',
      )
    await query(
      'INSERT INTO room_speaker_requests (conversation_id,member_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [viewer.conversationId, viewer.memberId],
    )
    return { requested: true }
  })
}

export async function setRoomInvitation(
  payload: Payload,
  viewer: RoomMember,
  subjectId: string,
  invite: boolean,
) {
  if (!roomIdPattern.test(subjectId))
    throw new CommunityError('Invalid member ID.', 422, 'INVALID_ROOM_MEMBER')
  return roomTransaction(payload, async (query) => {
    await query(
      'SELECT conversation_id FROM room_bindings WHERE conversation_id=$1 AND site_id=$2 FOR UPDATE',
      [viewer.conversationId, viewer.siteId],
    )
    const binding = await loadRoomBinding(query, viewer.conversationId)
    if (!binding || binding.siteId !== viewer.siteId)
      throw new CommunityError('Room not found.', 404, 'ROOM_NOT_FOUND')
    if (!(await canManageRoom(query, binding, viewer.memberId)))
      throw new CommunityError('Room manager permission is required.', 403, 'ROOM_MANAGER_REQUIRED')
    if (binding.accessPolicy !== 'invite')
      throw new CommunityError('This room does not use invitations.', 409, 'ROOM_NOT_INVITE_ONLY')
    if (invite) {
      const result = await query(
        `INSERT INTO room_invitations (conversation_id,member_id)
         SELECT $1,id FROM members WHERE id=$2 AND status='active'
         ON CONFLICT DO NOTHING RETURNING member_id`,
        [viewer.conversationId, subjectId],
      )
      if (
        !result.rows[0] &&
        !(
          await query(
            'SELECT member_id FROM room_invitations WHERE conversation_id=$1 AND member_id=$2',
            [viewer.conversationId, subjectId],
          )
        ).rows[0]
      )
        throw new CommunityError('Member not found.', 404, 'ROOM_MEMBER_NOT_FOUND')
      if (result.rows[0] && binding.historyPolicy === 'from-join') {
        await query(
          `INSERT INTO room_read_states (conversation_id,member_id,history_floor_sequence)
           SELECT id,$2,next_message_sequence FROM conversations WHERE id=$1
           ON CONFLICT (conversation_id,member_id) DO UPDATE SET history_floor_sequence =
             GREATEST(room_read_states.history_floor_sequence,excluded.history_floor_sequence)`,
          [viewer.conversationId, subjectId],
        )
      }
    } else {
      await query('DELETE FROM room_invitations WHERE conversation_id=$1 AND member_id=$2', [
        viewer.conversationId,
        subjectId,
      ])
      await query('DELETE FROM room_participation WHERE conversation_id=$1 AND member_id=$2', [
        viewer.conversationId,
        subjectId,
      ])
    }
    return { invited: invite }
  })
}

export async function moderateRoom(
  payload: Payload,
  viewer: RoomMember,
  input: {
    action: 'pin' | 'unpin' | 'remove' | 'approve-speaker' | 'decline-speaker'
    targetId?: string
  },
) {
  const targetId = input.targetId
  if (input.action !== 'unpin' && (!targetId || !roomIdPattern.test(targetId)))
    throw new CommunityError('Invalid moderation target.', 422, 'INVALID_ROOM_TARGET')
  return roomTransaction(payload, async (query) => {
    await query(
      'SELECT conversation_id FROM room_bindings WHERE conversation_id=$1 AND site_id=$2 FOR UPDATE',
      [viewer.conversationId, viewer.siteId],
    )
    const { binding } = await requireRoomAccess(query, viewer, 'read')
    if (!(await canManageRoom(query, binding!, viewer.memberId, true)))
      throw new CommunityError(
        'Room moderator permission is required.',
        403,
        'ROOM_MODERATOR_REQUIRED',
      )
    if (input.action === 'approve-speaker' || input.action === 'decline-speaker') {
      const status = input.action === 'approve-speaker' ? 'approved' : 'declined'
      const result = await query(
        'UPDATE room_speaker_requests SET status=$3 WHERE conversation_id=$1 AND member_id=$2 RETURNING member_id',
        [viewer.conversationId, targetId, status],
      )
      if (!result.rows[0])
        throw new CommunityError('Speaker request not found.', 404, 'ROOM_SPEAKER_NOT_FOUND')
    } else if (input.action === 'unpin') {
      await query('UPDATE room_bindings SET pinned_message_id=NULL WHERE conversation_id=$1', [
        viewer.conversationId,
      ])
    } else {
      const result = await query(
        `SELECT id FROM messages WHERE id=$1 AND conversation_id=$2 AND kind='member'
         AND room_removed_at IS NULL AND sequence_number>=room_history_floor($2,$3)`,
        [targetId, viewer.conversationId, viewer.memberId],
      )
      if (!result.rows[0])
        throw new CommunityError('Message not found.', 404, 'ROOM_MESSAGE_NOT_FOUND')
      if (input.action === 'pin') {
        await query('UPDATE room_bindings SET pinned_message_id=$2 WHERE conversation_id=$1', [
          viewer.conversationId,
          targetId,
        ])
      } else {
        await query('UPDATE messages SET room_removed_at=now(),room_removed_by=$2 WHERE id=$1', [
          targetId,
          viewer.memberId,
        ])
        await query(
          'UPDATE room_bindings SET pinned_message_id=NULL WHERE conversation_id=$1 AND pinned_message_id=$2',
          [viewer.conversationId, targetId],
        )
      }
    }
    return { success: true }
  })
}
