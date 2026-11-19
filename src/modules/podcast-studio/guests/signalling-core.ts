/**
 * POD-10 (POD-REQ-22): signalling message protocol (PURE CORE).
 *
 * Transport choice (see service.ts header for the full rationale):
 * authenticated HTTP long-poll over a durable Postgres message log —
 * the repo has no WebSocket server, and its one realtime layer (SSE
 * over `realtime-events`) requires a team-member account, which
 * guests by design do not have. SDP/ICE exchange is request/response
 * shaped, so long-poll carries it; the latency implication (up to the
 * poll window for host→guest pushes) is stated in GUESTS.md.
 *
 * Authorization rule enforced HERE, not just in the UI: media
 * negotiation messages (offer/answer/ice-candidate) are refused for
 * any guest who is not `admitted` in the lobby. Control messages
 * (hello/preflight/bye/talkback-state) carry no media and are allowed
 * pre-admission. NOTHING is transmitted pre-admission.
 */
import type { LobbyState } from './lobby'

export type SignalMessageType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'bye'
  | 'hello'
  | 'preflight'
  | 'talkback'

export const SIGNAL_MESSAGE_TYPES: readonly SignalMessageType[] = [
  'offer',
  'answer',
  'ice-candidate',
  'bye',
  'hello',
  'preflight',
  'talkback',
]

export const MEDIA_MESSAGE_TYPES: readonly SignalMessageType[] = [
  'offer',
  'answer',
  'ice-candidate',
]

export type SignalSender = 'guest' | 'host'

export type SignalMessage = {
  id?: string
  sessionId: string
  inviteId: string
  sender: SignalSender
  type: SignalMessageType
  payload: Record<string, unknown>
  createdAt?: string
}

export type SignalVerdict =
  | { ok: true }
  | {
      ok: false
      code:
        | 'signal-bad-type'
        | 'signal-wrong-session'
        | 'signal-pre-admission'
        | 'signal-session-over'
      message: string
    }

/**
 * Validates one message against the sender's lobby state and the
 * session it claims. Guest media messages require `admitted`; host
 * media messages (the host's offers to a guest) equally require that
 * the guest is admitted — the host cannot push media at a waiting
 * guest either.
 */
export function validateSignalMessage(input: {
  lobbyState: LobbyState
  inviteSessionId: string
  message: Pick<SignalMessage, 'sessionId' | 'type'>
}): SignalVerdict {
  if (!SIGNAL_MESSAGE_TYPES.includes(input.message.type)) {
    return {
      ok: false,
      code: 'signal-bad-type',
      message: `Unknown signalling message type: ${String(input.message.type)}.`,
    }
  }
  if (input.message.sessionId !== input.inviteSessionId) {
    return {
      ok: false,
      code: 'signal-wrong-session',
      message: 'Signalling message targets a different session than the invite.',
    }
  }
  if (input.lobbyState === 'dropped' || input.lobbyState === 'left') {
    return {
      ok: false,
      code: 'signal-session-over',
      message: 'Signalling refused: the guest session has ended.',
    }
  }
  if (MEDIA_MESSAGE_TYPES.includes(input.message.type) && input.lobbyState !== 'admitted') {
    return {
      ok: false,
      code: 'signal-pre-admission',
      message:
        'Media negotiation refused before admission: nothing is transmitted to or from a guest who has not been admitted.',
    }
  }
  return { ok: true }
}

/** Guest clip slots (POD-REQ-24): one admitted guest, one session, capped size. */
export const GUEST_CLIP_MAX_BYTES = 60 * 1024 * 1024
export const GUEST_CLIP_BANK_ID = 'guest-slots'

export type ClipSlotVerdict =
  | { ok: true }
  | {
      ok: false
      code: 'clip-not-admitted' | 'clip-too-large' | 'clip-wrong-session'
      message: string
    }

export function validateGuestClip(input: {
  lobbyState: LobbyState
  inviteSessionId: string
  sessionId: string
  sizeBytes: number
}): ClipSlotVerdict {
  if (input.sessionId !== input.inviteSessionId) {
    return {
      ok: false,
      code: 'clip-wrong-session',
      message: 'Clip upload refused: the invite belongs to a different session.',
    }
  }
  if (input.lobbyState !== 'admitted') {
    return {
      ok: false,
      code: 'clip-not-admitted',
      message: 'Clip upload refused: only admitted guests can send clips.',
    }
  }
  if (
    !Number.isFinite(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > GUEST_CLIP_MAX_BYTES
  ) {
    return {
      ok: false,
      code: 'clip-too-large',
      message: `Clip must be between 1 byte and ${GUEST_CLIP_MAX_BYTES} bytes (60 MB).`,
    }
  }
  return { ok: true }
}
