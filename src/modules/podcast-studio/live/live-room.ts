/**
 * POD-16 — Audience room binding for live episodes (DATA ONLY).
 *
 * The LIVE-SHOWS direction addendum (Nov 17, 2026) puts a live room
 * alongside the stream: the audience — at a venue, remote, or both —
 * gets text Q&A/chat with access public or member-gated, reusing the
 * community/rooms machinery where it exists.
 *
 * GAP, stated plainly: the community program's rooms machinery is
 * NOT in this tree. `src/modules/community/` has forums, discussions
 * and messaging, but no rooms/chat-room collection or service exists
 * here to bind to (checked POD-16: no room collection in
 * src/collections/Community.ts, no room module under
 * src/modules/community/). Per the POD-16 brief's scope discipline
 * this stage therefore delivers the binding AS DATA — an episode
 * carries { roomId, access } in its `liveRoom` JSON field — plus
 * this contract, and does NOT build a chat system. When the rooms
 * machinery lands, `roomId` is the foreign key it consumes and
 * `access` maps onto its room-access policy (`public` = anyone may
 * read/post per the room's own rules; `members` = the show's member
 * entitlement, the POD-03 binding, gates entry). Until then a
 * bound room id is a reference, not a working room — LIVE.md says
 * so in operator language.
 */

export type LiveRoomAccess = 'public' | 'members'

export type LiveRoomBinding = {
  /** Identifier of the audience room in the community rooms system (external reference until that system lands in-tree). */
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
