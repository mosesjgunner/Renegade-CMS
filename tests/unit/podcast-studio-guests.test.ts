/**
 * POD-10 (POD-REQ-21/22/23/24): headless tests for the guest system's
 * PURE CORES — invite tokens, lobby machine, peer-session machine +
 * reconnect budget, ICE config builder, signalling validation, clip
 * slot validation, telemetry aggregation, and the POD-07 mix-minus
 * bus assignment per guest.
 *
 * What this does NOT prove: real WebRTC media, NAT traversal or TURN
 * relay in a browser — all UNVERIFIED (no rig). The server-side
 * lifecycle is proven against real Postgres in
 * tests/integration/pod10-guests.integration.test.ts.
 */
import { describe, expect, it } from 'vitest'

import {
  buildIceConfig,
  buildIceConfigFromEnv,
  canTransitionLobby,
  canTransitionPeer,
  createPeerSession,
  evaluateInviteToken,
  evaluateReconnect,
  generateGuestToken,
  guestTokenMatchesHash,
  hashGuestToken,
  lobbyBoundAllows,
  MAX_REMOTE_GUESTS,
  mixMinusBusFor,
  recordReconnectAttempt,
  reconnectDelayMs,
  RECONNECT_GRACE_MS,
  RECONNECT_MAX_ATTEMPTS,
  renderGuestReceive,
  summarizeTelemetry,
  talkbackAudibleToGuest,
  transitionLobby,
  transitionPeer,
  turnConfigFromEnv,
  validateGuestClip,
  validateSignalMessage,
  GUEST_CLIP_MAX_BYTES,
} from '../../src/modules/podcast-studio/guests'
import { createMixerEngine, defaultMixerState } from '../../src/modules/podcast-studio/mixer'

const SR = 48000
const tone = (frequencyHz: number, amplitude = 0.9, frames = 4800): Float32Array => {
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++)
    out[i] = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / SR)
  return out
}
const energy = (block: Float32Array): number => {
  let sum = 0
  for (let i = 0; i < block.length; i++) sum += block[i] * block[i]
  return sum
}

describe('POD-10 invite tokens', () => {
  it('hash-only storage: the persisted form is the SHA-256 hex, never the token', () => {
    const token = generateGuestToken()
    const hash = hashGuestToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    expect(guestTokenMatchesHash(token, hash)).toBe(true)
    expect(guestTokenMatchesHash(generateGuestToken(), hash)).toBe(false)
    expect(generateGuestToken()).not.toBe(generateGuestToken())
  })

  const base = {
    purpose: 'guest-invite',
    sessionId: 'sess-1',
    state: 'invited',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revokedAt: null,
  }

  it('expired token refused', () => {
    const verdict = evaluateInviteToken(
      { ...base, expiresAt: new Date(Date.now() - 1_000).toISOString() },
      { nowMs: Date.now(), forJoin: true },
    )
    expect(verdict).toMatchObject({ ok: false, code: 'invite-expired' })
  })

  it('revoked token refused', () => {
    const verdict = evaluateInviteToken(
      { ...base, revokedAt: new Date().toISOString() },
      { nowMs: Date.now(), forJoin: true },
    )
    expect(verdict).toMatchObject({ ok: false, code: 'invite-revoked' })
  })

  it('reused (already-joined) token refused at join; cross-session token refused', () => {
    expect(
      evaluateInviteToken({ ...base, state: 'waiting' }, { nowMs: Date.now(), forJoin: true }),
    ).toMatchObject({ ok: false, code: 'invite-already-used' })
    expect(
      evaluateInviteToken(base, { sessionId: 'sess-2', nowMs: Date.now(), forJoin: false }),
    ).toMatchObject({ ok: false, code: 'invite-wrong-session' })
    expect(evaluateInviteToken(null, { nowMs: Date.now(), forJoin: true })).toMatchObject({
      ok: false,
      code: 'invite-not-found',
    })
    expect(evaluateInviteToken(base, { nowMs: Date.now(), forJoin: true })).toEqual({ ok: true })
  })
})

describe('POD-10 lobby machine', () => {
  it('walks invited → preflight → waiting → admitted → dropped; illegal jumps refused', () => {
    expect(canTransitionLobby('invited', 'preflight')).toBe(true)
    expect(canTransitionLobby('preflight', 'waiting')).toBe(true)
    expect(canTransitionLobby('waiting', 'admitted')).toBe(true)
    expect(canTransitionLobby('admitted', 'dropped')).toBe(true)
    expect(transitionLobby('invited', 'admitted')).toMatchObject({
      ok: false,
      code: 'illegal-lobby-transition',
    })
    expect(transitionLobby('dropped', 'waiting')).toMatchObject({ ok: false })
    expect(transitionLobby('admitted', 'left')).toEqual({ ok: true, state: 'left' })
  })

  it('bound: host + at most 3 admitted guests', () => {
    expect(MAX_REMOTE_GUESTS).toBe(3)
    expect(lobbyBoundAllows(2)).toBe(true)
    expect(lobbyBoundAllows(3)).toBe(false)
  })

  it('reconnect grace is 120 s: inside restores the place, outside is refused', () => {
    expect(RECONNECT_GRACE_MS).toBe(120_000)
    expect(evaluateReconnect({ disconnectedAtMs: 1_000, nowMs: 1_000 + 119_000 })).toEqual({
      ok: true,
    })
    expect(evaluateReconnect({ disconnectedAtMs: 1_000, nowMs: 1_000 + 121_000 })).toMatchObject({
      ok: false,
      code: 'reconnect-grace-expired',
    })
  })
})

describe('POD-10 peer session machine + reconnect budget', () => {
  it('walks invited → connecting → connected → admitted', () => {
    const s = createPeerSession('guest-1')
    expect(transitionPeer(s, 'connecting', 0).ok).toBe(true)
    expect(transitionPeer(s, 'connected', 1).ok).toBe(true)
    expect(transitionPeer(s, 'admitted', 2).ok).toBe(true)
    expect(s.state).toBe('admitted')
    expect(canTransitionPeer('invited', 'admitted')).toBe(false)
    expect(transitionPeer(s, 'invited', 3)).toMatchObject({ ok: false })
  })

  it('backoff grows exponentially and caps', () => {
    expect(reconnectDelayMs(0)).toBe(1_000)
    expect(reconnectDelayMs(1)).toBe(2_000)
    expect(reconnectDelayMs(2)).toBe(4_000)
    expect(reconnectDelayMs(10)).toBe(15_000)
  })

  it('reconnect budget exhaustion drops the session with the reason logged', () => {
    const s = createPeerSession('guest-1')
    transitionPeer(s, 'connecting', 0)
    transitionPeer(s, 'connected', 1)
    transitionPeer(s, 'admitted', 2)
    transitionPeer(s, 'reconnecting', 3)
    let outcome = recordReconnectAttempt(s, 4)
    for (let i = 1; i < RECONNECT_MAX_ATTEMPTS; i++) {
      outcome = recordReconnectAttempt(s, 4 + i)
    }
    expect(outcome.dropped).toBe(true)
    expect(s.state).toBe('dropped')
    expect(s.dropReason).toContain('budget exhausted')
    expect(
      s.log.some((entry) => entry.event.includes('dropped') || entry.detail?.includes('budget')),
    ).toBe(true)
  })

  it('grace expiry mid-reconnect drops with the grace reason', () => {
    const s = createPeerSession('guest-1')
    transitionPeer(s, 'connecting', 0)
    transitionPeer(s, 'connected', 1)
    transitionPeer(s, 'reconnecting', 10_000)
    const outcome = recordReconnectAttempt(s, 10_000 + RECONNECT_GRACE_MS + 1)
    expect(outcome.dropped).toBe(true)
    expect(s.dropReason).toContain('grace expired')
  })
})

describe('POD-10 ICE config builder (POD-REQ-23)', () => {
  it('no TURN configured: STUN only, sessions still build, limitation surfaced', () => {
    const ice = buildIceConfig({ turn: null })
    expect(ice.turnConfigured).toBe(false)
    expect(ice.iceServers).toHaveLength(1)
    expect(ice.iceServers[0].urls[0]).toMatch(/^stun:/)
    expect(ice.iceTransportPolicy).toBe('all')
    expect(ice.limitation).toContain('No TURN server configured')
  })

  it('TURN from operator config: TURN entries present, no limitation', () => {
    const ice = buildIceConfig({
      turn: { urls: ['turn:turn.example.org:3478'], username: 'u', credential: 'secret' },
    })
    expect(ice.turnConfigured).toBe(true)
    expect(ice.iceServers).toHaveLength(2)
    expect(ice.iceServers[1]).toMatchObject({ urls: ['turn:turn.example.org:3478'], username: 'u' })
    expect(ice.limitation).toBeNull()
  })

  it('force-relay: relay-only with TURN; honest fallback without', () => {
    expect(
      buildIceConfig({ turn: { urls: ['turn:t:3478'] }, forceRelay: true }).iceTransportPolicy,
    ).toBe('relay')
    const noTurn = buildIceConfig({ turn: null, forceRelay: true })
    expect(noTurn.iceTransportPolicy).toBe('all')
    expect(noTurn.limitation).toContain('Force-relay')
  })

  it('env parsing: comma TURN urls + credentials; empty env → no TURN (never a hardcoded public TURN)', () => {
    expect(turnConfigFromEnv({})).toBeNull()
    expect(
      turnConfigFromEnv({
        PODCAST_STUDIO_TURN_URLS: 'turn:a:3478, turns:b:5349',
        PODCAST_STUDIO_TURN_USERNAME: 'op',
        PODCAST_STUDIO_TURN_CREDENTIAL: 'pw',
      }),
    ).toEqual({ urls: ['turn:a:3478', 'turns:b:5349'], username: 'op', credential: 'pw' })
    const ice = buildIceConfigFromEnv({
      PODCAST_STUDIO_TURN_URLS: 'turn:a:3478',
      PODCAST_STUDIO_TURN_FORCE_RELAY: 'true',
    })
    expect(ice.iceTransportPolicy).toBe('relay')
    for (const server of buildIceConfigFromEnv({}).iceServers) {
      for (const url of server.urls) expect(url.startsWith('turn:')).toBe(false)
    }
  })
})

describe('POD-10 signalling validation', () => {
  const msg = (type: 'offer' | 'bye' | 'ice-candidate', sessionId = 'sess-1') => ({
    sessionId,
    type,
  })

  it('pre-admission media negotiation refused at the signalling layer; control allowed', () => {
    expect(
      validateSignalMessage({
        lobbyState: 'waiting',
        inviteSessionId: 'sess-1',
        message: msg('offer'),
      }),
    ).toMatchObject({ ok: false, code: 'signal-pre-admission' })
    expect(
      validateSignalMessage({
        lobbyState: 'waiting',
        inviteSessionId: 'sess-1',
        message: msg('ice-candidate'),
      }),
    ).toMatchObject({ ok: false, code: 'signal-pre-admission' })
    expect(
      validateSignalMessage({
        lobbyState: 'waiting',
        inviteSessionId: 'sess-1',
        message: msg('bye'),
      }),
    ).toEqual({ ok: true })
    expect(
      validateSignalMessage({
        lobbyState: 'admitted',
        inviteSessionId: 'sess-1',
        message: msg('offer'),
      }),
    ).toEqual({ ok: true })
  })

  it('cross-session and post-drop messages refused', () => {
    expect(
      validateSignalMessage({
        lobbyState: 'admitted',
        inviteSessionId: 'sess-1',
        message: msg('offer', 'sess-2'),
      }),
    ).toMatchObject({ ok: false, code: 'signal-wrong-session' })
    expect(
      validateSignalMessage({
        lobbyState: 'dropped',
        inviteSessionId: 'sess-1',
        message: msg('bye'),
      }),
    ).toMatchObject({ ok: false, code: 'signal-session-over' })
  })
})

describe('POD-10 mix-minus bus assignment per guest (POD-07 consumption)', () => {
  it('bus definition excludes only the guest themself and includes talkback', () => {
    const state = defaultMixerState(['guest-1', 'guest-2'])
    const bus = mixMinusBusFor(state, 'guest-1')
    expect(bus.excludeStripId).toBe('guest-1')
    expect(bus.includeStripIds).toContain('guest-2')
    expect(bus.includeStripIds).toContain('host')
    expect(bus.includeStripIds).not.toContain('guest-1')
    expect(bus.talkbackIncluded).toBe(true)
    expect(bus.talkbackReachesProgram).toBe(false)
    expect(() => mixMinusBusFor(state, 'nobody')).toThrow()
  })

  it('rendered receive stream: own return energy exactly 0; host + talkback audible', () => {
    const state = defaultMixerState(['guest-1'])
    const engine = createMixerEngine(state)
    // Only the guest's own return present → receive must be silence.
    const ownOnly = renderGuestReceive(engine, { guests: { 'guest-1': tone(880) } }, 'guest-1')
    expect(energy(ownOnly.left)).toBe(0)
    expect(energy(ownOnly.right)).toBe(0)
    // Host present → audible in the guest's receive.
    const withHost = renderGuestReceive(
      engine,
      { host: tone(440), guests: { 'guest-1': tone(880) } },
      'guest-1',
    )
    expect(energy(withHost.left)).toBeGreaterThan(0)
    // Talkback (unmuted) reaches the guest receive.
    state.talkbackMuted = false
    const withTalkback = renderGuestReceive(engine, { talkback: tone(220) }, 'guest-1')
    expect(energy(withTalkback.left)).toBeGreaterThan(0)
    expect(talkbackAudibleToGuest(state, 'admitted')).toBe(true)
    expect(talkbackAudibleToGuest(state, 'connected')).toBe(false)
  })
})

describe('POD-10 telemetry aggregation', () => {
  it('averages samples and warns over the delay/loss thresholds', () => {
    const calm = summarizeTelemetry([
      { atMs: 0, roundTripTimeMs: 40, packetLossPct: 0, bitrateKbps: 64, jitterMs: 2 },
      { atMs: 1, roundTripTimeMs: 60, packetLossPct: 1, bitrateKbps: 64, jitterMs: 3 },
    ])
    expect(calm.avgRoundTripTimeMs).toBe(50)
    expect(calm.warnings).toEqual([])
    const rough = summarizeTelemetry([
      { atMs: 0, roundTripTimeMs: 450, packetLossPct: 9, bitrateKbps: 32, jitterMs: 30 },
    ])
    expect(rough.warnings).toHaveLength(2)
    expect(summarizeTelemetry([]).warnings).toEqual([])
  })
})

describe('POD-10 guest clip slot validation', () => {
  it('60 MB cap, admitted only, session-bound', () => {
    const ok = {
      lobbyState: 'admitted' as const,
      inviteSessionId: 's1',
      sessionId: 's1',
      sizeBytes: 1024,
    }
    expect(validateGuestClip(ok)).toEqual({ ok: true })
    expect(validateGuestClip({ ...ok, sizeBytes: GUEST_CLIP_MAX_BYTES + 1 })).toMatchObject({
      ok: false,
      code: 'clip-too-large',
    })
    expect(validateGuestClip({ ...ok, lobbyState: 'waiting' })).toMatchObject({
      ok: false,
      code: 'clip-not-admitted',
    })
    expect(validateGuestClip({ ...ok, sessionId: 's2' })).toMatchObject({
      ok: false,
      code: 'clip-wrong-session',
    })
  })
})
