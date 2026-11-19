/**
 * POD-10 (POD-REQ-21/22): the guest lobby state machine (PURE CORE).
 *
 * Lobby states (per guest invite, persisted on the invite row):
 *   invited → preflight → waiting → admitted → dropped / left
 *
 * - invited: token issued, guest has not opened the link yet.
 * - preflight: guest opened the link and is doing name entry + device
 *   check + headphone declaration (headphones | no-headphones-fallback).
 * - waiting: preflight complete; the guest sits in the waiting room.
 *   NOTHING is transmitted pre-admission — the signalling core refuses
 *   media negotiation for any guest who is not `admitted`.
 * - admitted: host admitted the guest (consent gate + bound checked in
 *   service.ts at this transition).
 * - dropped: host dropped the guest, the reconnect grace expired, or
 *   the invite was revoked mid-session. Terminal.
 * - left: the guest left voluntarily (bye). Terminal.
 *
 * Bound: host + at most MAX_REMOTE_GUESTS (3) remote guests admitted at
 * once — the v1 mesh bound. The revisit trigger for an SFU (8 guests)
 * is recorded in PODCAST_PROJECT_STATE.md, not hidden here.
 */

export type LobbyState = 'invited' | 'preflight' | 'waiting' | 'admitted' | 'dropped' | 'left'

export const LOBBY_STATES: readonly LobbyState[] = [
  'invited',
  'preflight',
  'waiting',
  'admitted',
  'dropped',
  'left',
]

/** v1 mesh bound: at most 3 remote guests admitted alongside the host. */
export const MAX_REMOTE_GUESTS = 3

/** Reconnect grace (PT-E): a dropped connection may reclaim its place within 120 s. */
export const RECONNECT_GRACE_MS = 120_000

export type HeadphoneDeclaration = 'headphones' | 'no-headphones-fallback'

const TRANSITIONS: Record<LobbyState, readonly LobbyState[]> = {
  invited: ['preflight', 'dropped'],
  preflight: ['waiting', 'dropped', 'left'],
  waiting: ['admitted', 'dropped', 'left'],
  admitted: ['dropped', 'left'],
  dropped: [],
  left: [],
}

export const canTransitionLobby = (from: LobbyState, to: LobbyState): boolean =>
  (TRANSITIONS[from] ?? []).includes(to)

export type LobbyTransitionResult =
  | { ok: true; state: LobbyState }
  | { ok: false; code: 'illegal-lobby-transition'; message: string }

export function transitionLobby(from: LobbyState, to: LobbyState): LobbyTransitionResult {
  if (from === to) return { ok: true, state: from }
  if (!canTransitionLobby(from, to)) {
    return {
      ok: false,
      code: 'illegal-lobby-transition',
      message: `Guest lobby cannot move from ${from} to ${to}.`,
    }
  }
  return { ok: true, state: to }
}

/** The bound check, pure: admitting one more guest must keep admitted ≤ MAX_REMOTE_GUESTS. */
export function lobbyBoundAllows(admittedCount: number): boolean {
  return admittedCount < MAX_REMOTE_GUESTS
}

export type ReconnectVerdict =
  | { ok: true }
  | { ok: false; code: 'reconnect-grace-expired'; message: string }

export function evaluateReconnect(input: {
  disconnectedAtMs: number | null
  nowMs: number
}): ReconnectVerdict {
  if (input.disconnectedAtMs === null) return { ok: true }
  if (input.nowMs - input.disconnectedAtMs <= RECONNECT_GRACE_MS) return { ok: true }
  return {
    ok: false,
    code: 'reconnect-grace-expired',
    message: `Reconnect refused: the ${RECONNECT_GRACE_MS / 1000} s grace window has closed.`,
  }
}
