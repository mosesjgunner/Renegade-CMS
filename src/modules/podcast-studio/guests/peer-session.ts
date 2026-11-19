/**
 * POD-10 (POD-REQ-22/23): peer session core (PURE) — connection state
 * machine, ICE configuration, reconnect policy, telemetry model, and
 * the mix-minus wiring that feeds a guest's receive stream.
 *
 * The actual RTCPeerConnection / MediaStream handling lives in the
 * thin browser adapter (peer-browser.ts). Real-browser WebRTC, NAT
 * traversal and TURN relay behaviour are UNVERIFIED — nothing here
 * claims otherwise. What IS proven here: the state machine, the ICE
 * config builder, the reconnect budget, the telemetry thresholds, and
 * (via the POD-07 routing core) that a guest's receive bus is the
 * program minus their own return, plus talkback.
 */
import {
  renderBlock,
  type MixerEngine,
  type RenderInputs,
  type StereoBlock,
} from '../mixer/routing'
import type { MixerState } from '../mixer/state'
import { RECONNECT_GRACE_MS } from './lobby'

// ---------------------------------------------------------------------------
// Connection state machine
// ---------------------------------------------------------------------------

export type PeerState =
  | 'invited'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'admitted'
  | 'dropped'

const PEER_TRANSITIONS: Record<PeerState, readonly PeerState[]> = {
  invited: ['connecting', 'dropped'],
  connecting: ['connected', 'reconnecting', 'dropped'],
  connected: ['admitted', 'reconnecting', 'dropped'],
  reconnecting: ['connected', 'dropped'],
  admitted: ['reconnecting', 'dropped'],
  dropped: [],
}

export const canTransitionPeer = (from: PeerState, to: PeerState): boolean =>
  (PEER_TRANSITIONS[from] ?? []).includes(to)

export type PeerSession = {
  participantId: string
  state: PeerState
  /** Reconnect attempts consumed in the current disconnect episode. */
  reconnectAttempts: number
  /** Epoch ms of the current disconnect episode's start, or null while connected. */
  disconnectedAtMs: number | null
  /** Why the session was dropped (logged, surfaced to host + guest). */
  dropReason: string | null
  /** Limitation notes surfaced in state (e.g. TURN absent). Never hidden. */
  limitations: string[]
  log: Array<{ atMs: number; event: string; detail?: string }>
}

export const createPeerSession = (
  participantId: string,
  limitations: string[] = [],
): PeerSession => ({
  participantId,
  state: 'invited',
  reconnectAttempts: 0,
  disconnectedAtMs: null,
  dropReason: null,
  limitations: [...limitations],
  log: [],
})

const logEvent = (session: PeerSession, atMs: number, event: string, detail?: string): void => {
  session.log.push({ atMs, event, ...(detail ? { detail } : {}) })
}

export type PeerTransitionResult =
  | { ok: true; session: PeerSession }
  | { ok: false; code: 'illegal-peer-transition'; message: string }

export function transitionPeer(
  session: PeerSession,
  to: PeerState,
  atMs: number,
  detail?: string,
): PeerTransitionResult {
  if (session.state !== to && !canTransitionPeer(session.state, to)) {
    return {
      ok: false,
      code: 'illegal-peer-transition',
      message: `Peer session cannot move from ${session.state} to ${to}.`,
    }
  }
  const from = session.state
  session.state = to
  if (to === 'reconnecting' && from !== 'reconnecting') {
    session.disconnectedAtMs = atMs
    session.reconnectAttempts = 0
  }
  if (to === 'connected' || to === 'admitted') {
    session.disconnectedAtMs = null
    session.reconnectAttempts = 0
  }
  if (to === 'dropped') session.dropReason = detail ?? session.dropReason ?? 'dropped'
  logEvent(session, atMs, `${from}->${to}`, detail)
  return { ok: true, session }
}

// ---------------------------------------------------------------------------
// Reconnect policy: exponential backoff inside the 120 s grace window,
// with a hard attempt budget. Exhaustion drops the session with the
// reason logged — the guest's lobby place is NOT held past grace.
// ---------------------------------------------------------------------------

export const RECONNECT_MAX_ATTEMPTS = 5
export const RECONNECT_BASE_DELAY_MS = 1_000
export const RECONNECT_MAX_DELAY_MS = 15_000

export const reconnectDelayMs = (attempt: number): number =>
  Math.min(RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt), RECONNECT_MAX_DELAY_MS)

/**
 * Records one failed reconnect attempt. Returns `dropped: true` (and
 * moves the session to dropped, reason logged) when the attempt budget
 * is exhausted OR the grace window has closed.
 */
export function recordReconnectAttempt(
  session: PeerSession,
  atMs: number,
): { dropped: boolean; nextDelayMs: number | null; reason?: string } {
  if (session.state !== 'reconnecting') return { dropped: false, nextDelayMs: null }
  session.reconnectAttempts += 1
  const graceExpired =
    session.disconnectedAtMs !== null && atMs - session.disconnectedAtMs > RECONNECT_GRACE_MS
  if (graceExpired || session.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
    const reason = graceExpired
      ? `reconnect grace expired (${RECONNECT_GRACE_MS / 1000}s)`
      : `reconnect budget exhausted after ${session.reconnectAttempts} attempts`
    transitionPeer(session, 'dropped', atMs, reason)
    return { dropped: true, nextDelayMs: null, reason }
  }
  const nextDelayMs = reconnectDelayMs(session.reconnectAttempts)
  logEvent(session, atMs, 'reconnect-attempt-failed', `next delay ${nextDelayMs}ms`)
  return { dropped: false, nextDelayMs }
}

// ---------------------------------------------------------------------------
// ICE configuration (POD-REQ-23)
//
// STUN defaults are built in. TURN comes ONLY from operator config
// (environment / operator settings) — there is deliberately NO
// hardcoded public TURN server: without operator TURN, sessions still
// work host-side and for guests on friendly NATs, and the limitation
// is surfaced in the built config (and in peer-session state), never
// hidden. See docs/podcast-studio/COTURN.md for the operator runbook.
// ---------------------------------------------------------------------------

export const DEFAULT_STUN_URLS: readonly string[] = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
]

export type TurnConfig = {
  urls: string[]
  username?: string
  credential?: string
}

export type IceConfig = {
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }>
  iceTransportPolicy: 'all' | 'relay'
  turnConfigured: boolean
  /** Present when TURN is absent or a forced-relay request cannot be honoured. */
  limitation: string | null
}

export type IceEnv = Record<string, string | undefined>

/**
 * Reads the operator TURN config from the environment:
 * - PODCAST_STUDIO_TURN_URLS: comma-separated turn:/turns: URLs
 * - PODCAST_STUDIO_TURN_USERNAME / PODCAST_STUDIO_TURN_CREDENTIAL:
 *   the coturn credential pair (secret — never logged, never returned
 *   to any client other than the joining guest's own ICE config).
 * - PODCAST_STUDIO_TURN_FORCE_RELAY: 'true' forces relay-only
 *   transport (the forced-relay test procedure in COTURN.md).
 * - PODCAST_STUDIO_STUN_URLS: optional override of the STUN defaults.
 */
export function turnConfigFromEnv(env: IceEnv): TurnConfig | null {
  const urls = (env.PODCAST_STUDIO_TURN_URLS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (urls.length === 0) return null
  return {
    urls,
    ...(env.PODCAST_STUDIO_TURN_USERNAME ? { username: env.PODCAST_STUDIO_TURN_USERNAME } : {}),
    ...(env.PODCAST_STUDIO_TURN_CREDENTIAL
      ? { credential: env.PODCAST_STUDIO_TURN_CREDENTIAL }
      : {}),
  }
}

export function buildIceConfig(input: {
  turn: TurnConfig | null
  stunUrls?: readonly string[]
  forceRelay?: boolean
}): IceConfig {
  const stunUrls = input.stunUrls ?? DEFAULT_STUN_URLS
  const iceServers: IceConfig['iceServers'] = [{ urls: [...stunUrls] }]
  if (input.turn) {
    iceServers.push({
      urls: [...input.turn.urls],
      ...(input.turn.username ? { username: input.turn.username } : {}),
      ...(input.turn.credential ? { credential: input.turn.credential } : {}),
    })
  }
  const turnConfigured = Boolean(input.turn)
  let iceTransportPolicy: IceConfig['iceTransportPolicy'] = 'all'
  let limitation: string | null = turnConfigured
    ? null
    : 'No TURN server configured: guests behind hostile NATs may fail to connect. Host-side and friendly-NAT sessions are unaffected. See docs/podcast-studio/COTURN.md.'
  if (input.forceRelay) {
    if (turnConfigured) {
      iceTransportPolicy = 'relay'
      limitation = null
    } else {
      limitation =
        'Force-relay was requested but no TURN server is configured, so relay-only transport is impossible; falling back to all transports.'
    }
  }
  return { iceServers, iceTransportPolicy, turnConfigured, limitation }
}

export function buildIceConfigFromEnv(env: IceEnv): IceConfig {
  const stunUrls = (env.PODCAST_STUN_URLS ?? env.PODCAST_STUDIO_STUN_URLS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return buildIceConfig({
    turn: turnConfigFromEnv(env),
    ...(stunUrls.length > 0 ? { stunUrls } : {}),
    forceRelay: env.PODCAST_STUDIO_TURN_FORCE_RELAY === 'true',
  })
}

// ---------------------------------------------------------------------------
// Mix-minus consumption (POD-07)
//
// A guest's receive stream is the POD-07 mix-minus bus for their
// participant strip: program contributors minus themselves, PLUS
// talkback. The bus DEFINITION below is what the signalling/adapter
// layer routes; renderGuestReceive proves it against the real POD-07
// routing core.
// ---------------------------------------------------------------------------

export type GuestBusDefinition = {
  participantId: string
  stripId: string
  /** Strip ids summed into this guest's receive bus (by inclusion). */
  includeStripIds: string[]
  /** The guest's own strip — never summed (mix-minus by construction). */
  excludeStripId: string
  talkbackIncluded: boolean
  /** Talkback has no route to program/record/stream (POD-07 structural guarantee). */
  talkbackReachesProgram: false
}

export function mixMinusBusFor(state: MixerState, participantId: string): GuestBusDefinition {
  const strip = state.strips.find((entry) => entry.id === participantId && entry.kind === 'guest')
  if (!strip) {
    throw new Error(`No guest strip for participant ${participantId}.`)
  }
  return {
    participantId,
    stripId: strip.id,
    includeStripIds: state.strips.filter((entry) => entry.id !== strip.id).map((e) => e.id),
    excludeStripId: strip.id,
    talkbackIncluded: true,
    talkbackReachesProgram: false,
  }
}

/** Renders one block of a guest's receive stream through the POD-07 core. */
export function renderGuestReceive(
  engine: MixerEngine,
  inputs: RenderInputs,
  participantId: string,
): StereoBlock {
  const output = renderBlock(engine, inputs)
  const bus = output.mixMinusPerGuest[participantId]
  if (!bus) throw new Error(`POD-07 produced no mix-minus bus for ${participantId}.`)
  return bus
}

/** Host talkback is live for a guest only while they are admitted and talkback is unmuted. */
export const talkbackAudibleToGuest = (state: MixerState, peerState: PeerState): boolean =>
  peerState === 'admitted' && !state.talkbackMuted

// ---------------------------------------------------------------------------
// Telemetry model: per-guest delay / loss / bitrate samples. The
// browser adapter reads RTCPeerConnection.getStats(); this core
// aggregates samples and raises UI warnings at fixed thresholds.
// ---------------------------------------------------------------------------

export type TelemetrySample = {
  atMs: number
  roundTripTimeMs: number
  packetLossPct: number
  bitrateKbps: number
  jitterMs: number
}

export type TelemetrySummary = {
  samples: number
  avgRoundTripTimeMs: number
  maxRoundTripTimeMs: number
  avgPacketLossPct: number
  maxPacketLossPct: number
  avgBitrateKbps: number
  warnings: string[]
}

export const TELEMETRY_RTT_WARN_MS = 300
export const TELEMETRY_LOSS_WARN_PCT = 5

export function summarizeTelemetry(samples: TelemetrySample[]): TelemetrySummary {
  if (samples.length === 0) {
    return {
      samples: 0,
      avgRoundTripTimeMs: 0,
      maxRoundTripTimeMs: 0,
      avgPacketLossPct: 0,
      maxPacketLossPct: 0,
      avgBitrateKbps: 0,
      warnings: [],
    }
  }
  const avg = (pick: (s: TelemetrySample) => number) =>
    samples.reduce((sum, s) => sum + pick(s), 0) / samples.length
  const summary: TelemetrySummary = {
    samples: samples.length,
    avgRoundTripTimeMs: avg((s) => s.roundTripTimeMs),
    maxRoundTripTimeMs: Math.max(...samples.map((s) => s.roundTripTimeMs)),
    avgPacketLossPct: avg((s) => s.packetLossPct),
    maxPacketLossPct: Math.max(...samples.map((s) => s.packetLossPct)),
    avgBitrateKbps: avg((s) => s.bitrateKbps),
    warnings: [],
  }
  if (summary.maxRoundTripTimeMs > TELEMETRY_RTT_WARN_MS) {
    summary.warnings.push(
      `High delay: peak round-trip ${Math.round(summary.maxRoundTripTimeMs)} ms exceeds ${TELEMETRY_RTT_WARN_MS} ms.`,
    )
  }
  if (summary.maxPacketLossPct > TELEMETRY_LOSS_WARN_PCT) {
    summary.warnings.push(
      `Packet loss: peak ${summary.maxPacketLossPct.toFixed(1)}% exceeds ${TELEMETRY_LOSS_WARN_PCT}%.`,
    )
  }
  return summary
}
