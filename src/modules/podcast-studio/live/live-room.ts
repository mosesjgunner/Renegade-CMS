import type { Payload } from 'payload'
import { loadRoomBinding, roomIdPattern, roomQuery } from '@/modules/community/rooms'
import { CommunityError } from '@/modules/community/service'

export type LiveRoomAccess = 'public' | 'members'

export type LiveRoomBinding = {
  /** Canonical Community Rooms conversation ID. */
  roomId: string
  access: LiveRoomAccess
}

export function parseLiveRoomBinding(raw: unknown): LiveRoomBinding {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Live room binding must be an object: { roomId, access }.')
  const value = raw as Record<string, unknown>
  const roomId = typeof value.roomId === 'string' ? value.roomId.trim() : ''
  if (!roomId) throw new Error('Live room binding requires a roomId.')
  const access = value.access ?? 'public'
  if (access !== 'public' && access !== 'members')
    throw new Error('Live room binding access must be "public" or "members".')
  return { roomId, access }
}

export const tryParseLiveRoomBinding = (raw: unknown): LiveRoomBinding | null => {
  if (raw == null) return null
  try {
    return parseLiveRoomBinding(raw)
  } catch {
    return null
  }
}

/** Resolve stored references and validate newly submitted ones against the same site. */
export async function resolveLiveRoomBinding(
  payload: Payload,
  siteId: string,
  raw: unknown,
  options: { requiresMembers?: boolean } = {},
) {
  const value = parseLiveRoomBinding(raw)
  const roomId = value.roomId.toLowerCase()
  const room = roomIdPattern.test(roomId) ? await loadRoomBinding(roomQuery(payload), roomId) : null
  if (!room || room.siteId !== siteId)
    throw new CommunityError(
      'The bound live room could not be found on this site.',
      404,
      'LIVE_ROOM_NOT_FOUND',
    )
  if (
    (value.access === 'public' && (room.accessPolicy !== 'public' || options.requiresMembers)) ||
    (value.access === 'members' && room.accessPolicy === 'public')
  )
    throw new CommunityError(
      'The podcast and room access policies are incompatible.',
      409,
      'LIVE_ROOM_POLICY_MISMATCH',
    )
  return { binding: { ...value, roomId }, href: `/rooms/${roomId}` }
}
