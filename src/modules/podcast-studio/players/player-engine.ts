/**
 * POD-08 — Player engine core (PURE, headless): the 8-player clip bank
 * of the Podcast Studio desk (POD-REQ-13 audio completion; tool map
 * rows 10–16).
 *
 * Behaviour model is a pattern-level adaptation of CurryCaster v1's
 * `PlayerModule` (MIT, © 2024 Adam Curry — see THIRD_PARTY_NOTICES),
 * rebuilt as a deterministic TypeScript state machine:
 *
 * - 8 players. Load paths resolve a clip by media asset id or by an
 *   explicit clip ref; the load target policy is the v1/II rule —
 *   an already-loaded clip FLASHES ('already-loaded' event, no reload);
 *   otherwise the least-recently-used EMPTY player; otherwise the
 *   least-recently-used NON-PLAYING player is reused (its clip is
 *   replaced); if every player is playing, the load is rejected.
 * - IN/OUT cue points at 0.1 s precision (all cue writes quantize to
 *   0.1 s). STOP returns the playhead to IN. Playback auto-returns to
 *   IN when it reaches OUT (and the play closes as 'completed').
 * - Log-taper fader in dB with a mouse-wheel step model.
 * - Elapsed ⇄ remaining display model; last-10-seconds warning state.
 * - PFL: a PFL player is assigned to the POD-07 CUE bus ONLY — its bus
 *   assignment can never be the program (CLIPS) bus while PFL is on.
 *   PFL plays neither dim nor enter the played-clip log (audition is
 *   private); program plays do both.
 * - Played-dimming: a clip played ON AIR (program route) is marked
 *   played for the session. Per-show opt-out disables marking. Reset
 *   rules: `startNewSession()` clears played marks (new show rule);
 *   `resetPlayed()` clears them on demand; restoring/opening state
 *   never marks anything played.
 * - The played-clip log is authoritative and crash-safe: an entry is
 *   appended at play START (outcome 'playing', no end time) and closed
 *   at play end — see played-log.ts. The engine keeps the entries;
 *   `playedLogToSession()` folds them into a POD-05 session document.
 *
 * Timing is driven by `advance(dtSec)` from the adapter (rAF) or by
 * tests — the engine owns no timers, so every behaviour here is
 * deterministically testable headlessly. The session clock is injected
 * (`sessionElapsedSec`) so played-log timestamps are session times.
 */

import {
  closePlayedClip,
  type PlayedClipLogEntry,
  type SessionDocWithPlayedLog,
} from './played-log'
import type { StudioSessionDoc } from '../session-engine'

export const PLAYER_COUNT = 8
export const CUE_PRECISION_SEC = 0.1
export const END_WARNING_SEC = 10
export const FADER_MIN_DB = -60
export const FADER_MAX_DB = 6
export const FADER_WHEEL_STEP_DB = 1

/** Quantizes a time to the cue precision (0.1 s). */
export const quantizeCue = (sec: number): number =>
  Math.round(sec / CUE_PRECISION_SEC) * CUE_PRECISION_SEC

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * Log-taper fader law (v1 `get_log_volume` pattern): dB → linear gain.
 * −60 dB is silence (0); 0 dB is unity; +6 dB is the desk maximum.
 */
export const faderDbToLinear = (gainDb: number): number => {
  if (gainDb <= FADER_MIN_DB) return 0
  return 10 ** (clamp(gainDb, FADER_MIN_DB, FADER_MAX_DB) / 20)
}

/** Mouse-wheel fader model: one notch = 1 dB, direction by wheel sign. */
export const wheelFaderDb = (gainDb: number, wheelDeltaY: number): number => {
  if (wheelDeltaY === 0) return clamp(gainDb, FADER_MIN_DB, FADER_MAX_DB)
  const step = wheelDeltaY < 0 ? FADER_WHEEL_STEP_DB : -FADER_WHEEL_STEP_DB
  return clamp(gainDb + step, FADER_MIN_DB, FADER_MAX_DB)
}

export type ClipRef = {
  /** Media asset id — the canonical load key. */
  assetId: string
  title: string
  durationSec: number
  /** Optional explicit cue region (quantized to 0.1 s on load). */
  cueInSec?: number
  cueOutSec?: number
}

export type PlayerStatus = 'empty' | 'loaded' | 'playing' | 'paused'

export type PlayerBusAssignment = 'clips' | 'cue'

export type PlayerState = {
  index: number
  status: PlayerStatus
  clip: ClipRef | null
  cueInSec: number
  cueOutSec: number
  positionSec: number
  gainDb: number
  pfl: boolean
  /** This loaded instance has been played on air. */
  played: boolean
  /** Monotonic LRU stamp: higher = used more recently. */
  lastUsedSeq: number
  /** Last-10-seconds warning is active (playing inside the warning zone). */
  endWarning: boolean
  /** The 'end-warning' event has fired for the current play (fires once per play). */
  endWarningFired: boolean
}

export type PlayerEvent =
  | { type: 'loaded'; playerIndex: number; assetId: string; reused: boolean }
  | { type: 'already-loaded'; playerIndex: number; assetId: string }
  | { type: 'load-rejected'; assetId: string; reason: 'all-players-playing' }
  | { type: 'play-started'; playerIndex: number; assetId: string; route: PlayerBusAssignment }
  | { type: 'paused'; playerIndex: number }
  | { type: 'stopped'; playerIndex: number }
  | { type: 'dumped'; playerIndex: number; assetId: string }
  | { type: 'play-completed'; playerIndex: number; assetId: string }
  | { type: 'end-warning'; playerIndex: number; remainingSec: number }
  | { type: 'pfl-changed'; playerIndex: number; pfl: boolean; bus: PlayerBusAssignment }
  | { type: 'stop-all'; stoppedPlayers: number }

export type PlayerEngineOptions = {
  /** Per-show played-dimming opt-out (tool map row 16). Default: dimming on. */
  playedDimmingEnabled?: boolean
  /** Injected session clock for played-log timestamps. Default: engine-local accumulated play time. */
  sessionElapsedSec?: () => number
  onEvent?: (event: PlayerEvent) => void
}

export type PlayerDisplayModel = {
  mode: 'elapsed' | 'remaining'
  /** Seconds shown for the current mode (elapsed within the cue region, or remaining to OUT). */
  displaySec: number
  elapsedSec: number
  remainingSec: number
  endWarning: boolean
}

export class PlayerEngine {
  readonly players: PlayerState[] = []
  /** Authoritative played-clip log entries (player source), in play order. */
  readonly playedLog: PlayedClipLogEntry[] = []
  /** Asset ids played on air this session — the dimming set. */
  readonly playedAssetIds = new Set<string>()

  private seq = 0
  private localElapsedSec = 0
  private readonly playedDimmingEnabled: boolean
  private readonly sessionElapsedSec: () => number
  private readonly onEvent?: (event: PlayerEvent) => void

  constructor(options: PlayerEngineOptions = {}) {
    this.playedDimmingEnabled = options.playedDimmingEnabled ?? true
    this.sessionElapsedSec = options.sessionElapsedSec ?? (() => this.localElapsedSec)
    this.onEvent = options.onEvent
    for (let index = 0; index < PLAYER_COUNT; index++) {
      this.players.push({
        index,
        status: 'empty',
        clip: null,
        cueInSec: 0,
        cueOutSec: 0,
        positionSec: 0,
        gainDb: 0,
        pfl: false,
        played: false,
        lastUsedSeq: 0,
        endWarning: false,
        endWarningFired: false,
      })
    }
  }

  private emit(event: PlayerEvent): void {
    this.onEvent?.(event)
  }

  private touch(player: PlayerState): void {
    player.lastUsedSeq = ++this.seq
  }

  private player(index: number): PlayerState {
    const player = this.players[index]
    if (!player) throw new Error(`No player at index ${index}.`)
    return player
  }

  // -------------------------------------------------------------------------
  // Loading (LRU policy)
  // -------------------------------------------------------------------------

  /**
   * Loads a clip. Target selection, in order:
   * 1. The clip is already loaded somewhere → 'already-loaded' flash
   *    event, that player is returned, NOTHING reloads.
   * 2. An explicit `targetIndex` (drag onto a player / file picker) —
   *    unless that player is playing, in which case it is rejected.
   * 3. The least-recently-used empty player.
   * 4. The least-recently-used non-playing player (clip replaced).
   * 5. All players playing → 'load-rejected'.
   */
  loadClip(
    clip: ClipRef,
    targetIndex?: number,
  ): { ok: boolean; playerIndex?: number; reason?: string } {
    const existing = this.players.find((p) => p.clip?.assetId === clip.assetId)
    if (existing) {
      this.touch(existing)
      this.emit({ type: 'already-loaded', playerIndex: existing.index, assetId: clip.assetId })
      return { ok: true, playerIndex: existing.index, reason: 'already-loaded' }
    }

    let target: PlayerState | undefined
    let reused = false
    if (targetIndex !== undefined) {
      const explicit = this.player(targetIndex)
      if (explicit.status === 'playing') {
        this.emit({ type: 'load-rejected', assetId: clip.assetId, reason: 'all-players-playing' })
        return { ok: false, reason: 'player-playing' }
      }
      target = explicit
      reused = explicit.status !== 'empty'
    } else {
      const empties = this.players.filter((p) => p.status === 'empty')
      if (empties.length > 0) {
        target = empties.reduce((a, b) => (a.lastUsedSeq <= b.lastUsedSeq ? a : b))
      } else {
        const nonPlaying = this.players.filter((p) => p.status !== 'playing')
        if (nonPlaying.length === 0) {
          this.emit({ type: 'load-rejected', assetId: clip.assetId, reason: 'all-players-playing' })
          return { ok: false, reason: 'all-players-playing' }
        }
        target = nonPlaying.reduce((a, b) => (a.lastUsedSeq <= b.lastUsedSeq ? a : b))
        reused = true
      }
    }

    const cueInSec = quantizeCue(clamp(clip.cueInSec ?? 0, 0, clip.durationSec))
    const cueOutSec = quantizeCue(
      clamp(clip.cueOutSec ?? clip.durationSec, cueInSec, clip.durationSec),
    )
    target.clip = { ...clip, cueInSec, cueOutSec }
    target.cueInSec = cueInSec
    target.cueOutSec = cueOutSec
    target.positionSec = cueInSec
    target.status = 'loaded'
    target.played = false
    target.endWarning = false
    target.endWarningFired = false
    this.touch(target)
    this.emit({ type: 'loaded', playerIndex: target.index, assetId: clip.assetId, reused })
    return { ok: true, playerIndex: target.index }
  }

  /** Load by media asset id (clip-browser / file-picker path). */
  loadByAssetId(asset: { assetId: string; title: string; durationSec: number }): {
    ok: boolean
    playerIndex?: number
    reason?: string
  } {
    return this.loadClip({
      assetId: asset.assetId,
      title: asset.title,
      durationSec: asset.durationSec,
    })
  }

  // -------------------------------------------------------------------------
  // Cues
  // -------------------------------------------------------------------------

  /** Sets IN, quantized to 0.1 s, clamped inside [0, OUT]. Playhead follows if it was before IN. */
  setCueIn(index: number, sec: number): PlayerState {
    const player = this.player(index)
    player.cueInSec = quantizeCue(clamp(sec, 0, player.cueOutSec))
    if (player.clip) player.clip.cueInSec = player.cueInSec
    if (player.positionSec < player.cueInSec) player.positionSec = player.cueInSec
    this.touch(player)
    return player
  }

  /** Sets OUT, quantized to 0.1 s, clamped inside [IN, duration]. */
  setCueOut(index: number, sec: number): PlayerState {
    const player = this.player(index)
    const duration = player.clip?.durationSec ?? sec
    player.cueOutSec = quantizeCue(clamp(sec, player.cueInSec, duration))
    if (player.clip) player.clip.cueOutSec = player.cueOutSec
    if (player.positionSec > player.cueOutSec) player.positionSec = player.cueOutSec
    this.touch(player)
    return player
  }

  /** Click-seek: moves the playhead, clamped to the cue region. */
  seek(index: number, sec: number): PlayerState {
    const player = this.player(index)
    player.positionSec = clamp(sec, player.cueInSec, player.cueOutSec)
    player.endWarningFired = player.endWarningFired && this.remainingSec(player) > END_WARNING_SEC
    this.touch(player)
    return player
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  /** The bus a player feeds: PFL → cue ONLY; otherwise the program CLIPS bus. */
  busAssignment(index: number): PlayerBusAssignment {
    return this.player(index).pfl ? 'cue' : 'clips'
  }

  play(index: number): { ok: boolean; reason?: string } {
    const player = this.player(index)
    if (!player.clip || player.status === 'empty') return { ok: false, reason: 'no-clip' }
    if (player.status === 'playing') return { ok: true }
    if (player.positionSec >= player.cueOutSec) player.positionSec = player.cueInSec
    player.status = 'playing'
    player.endWarningFired = false
    this.touch(player)
    const route = this.busAssignment(index)
    this.emit({ type: 'play-started', playerIndex: index, assetId: player.clip.assetId, route })
    if (route === 'clips') {
      // On-air play: dim + log. The log entry opens NOW (crash-safe).
      if (this.playedDimmingEnabled) {
        player.played = true
        this.playedAssetIds.add(player.clip.assetId)
      }
      // Resume after pause continues the SAME play: an entry is opened
      // only when none is open for this clip.
      const alreadyOpen = this.playedLog.some(
        (entry) => entry.clipId === player.clip!.assetId && entry.outcome === 'playing',
      )
      if (!alreadyOpen) {
        const startedAtSessionSec = this.sessionElapsedSec()
        this.playedLog.push({
          id: `player:${player.clip.assetId}:${startedAtSessionSec}`,
          source: 'player',
          clipId: player.clip.assetId,
          assetId: player.clip.assetId,
          title: player.clip.title,
          startedAtSessionSec,
          endedAtSessionSec: null,
          outcome: 'playing',
        })
      }
    }
    return { ok: true }
  }

  pause(index: number): void {
    const player = this.player(index)
    if (player.status !== 'playing') return
    player.status = 'paused'
    this.emit({ type: 'paused', playerIndex: index })
  }

  /** STOP → IN: halts and returns the playhead to the IN point. */
  stop(index: number): void {
    const player = this.player(index)
    if (player.status === 'playing' || player.status === 'paused') {
      this.closeOpenLogEntry(player, 'stopped')
    }
    player.status = player.clip ? 'loaded' : 'empty'
    player.positionSec = player.cueInSec
    player.endWarning = false
    this.emit({ type: 'stopped', playerIndex: index })
  }

  /** DUMP: unloads the clip entirely. An open play closes as 'stopped'. */
  dump(index: number): void {
    const player = this.player(index)
    if (!player.clip) return
    const assetId = player.clip.assetId
    this.closeOpenLogEntry(player, 'stopped')
    player.clip = null
    player.status = 'empty'
    player.positionSec = 0
    player.cueInSec = 0
    player.cueOutSec = 0
    player.played = false
    player.pfl = false
    player.endWarning = false
    this.emit({ type: 'dumped', playerIndex: index, assetId })
  }

  /** STOP ALL (players half): every player halts and returns to IN. */
  stopAll(): number {
    let stopped = 0
    for (const player of this.players) {
      if (player.status === 'playing' || player.status === 'paused') {
        this.stop(player.index)
        stopped++
      }
    }
    this.emit({ type: 'stop-all', stoppedPlayers: stopped })
    return stopped
  }

  /** Toggles PFL. PFL on ⇒ cue bus only, never program. */
  setPfl(index: number, pfl: boolean): PlayerBusAssignment {
    const player = this.player(index)
    player.pfl = pfl
    const bus = this.busAssignment(index)
    this.emit({ type: 'pfl-changed', playerIndex: index, pfl, bus })
    return bus
  }

  // -------------------------------------------------------------------------
  // Fader + display
  // -------------------------------------------------------------------------

  setFaderDb(index: number, gainDb: number): number {
    const player = this.player(index)
    player.gainDb = clamp(gainDb, FADER_MIN_DB, FADER_MAX_DB)
    return player.gainDb
  }

  wheelFader(index: number, wheelDeltaY: number): number {
    const player = this.player(index)
    player.gainDb = wheelFaderDb(player.gainDb, wheelDeltaY)
    return player.gainDb
  }

  /** Linear gain for the adapter's GainNode, from the log taper. */
  faderLinear(index: number): number {
    return faderDbToLinear(this.player(index).gainDb)
  }

  private remainingSec(player: PlayerState): number {
    return Math.max(0, player.cueOutSec - player.positionSec)
  }

  displayModel(index: number, mode: 'elapsed' | 'remaining'): PlayerDisplayModel {
    const player = this.player(index)
    const elapsedSec = Math.max(0, player.positionSec - player.cueInSec)
    const remainingSec = this.remainingSec(player)
    return {
      mode,
      displaySec: mode === 'elapsed' ? elapsedSec : remainingSec,
      elapsedSec,
      remainingSec,
      endWarning: player.endWarning,
    }
  }

  // -------------------------------------------------------------------------
  // Played-dimming rules
  // -------------------------------------------------------------------------

  /** Dimming predicate for the clip browser / cartwall: played on air this session. */
  isPlayed(assetId: string): boolean {
    return this.playedDimmingEnabled && this.playedAssetIds.has(assetId)
  }

  /** New-show rule: starting a new session/show clears every played mark. */
  startNewSession(): void {
    this.playedAssetIds.clear()
    for (const player of this.players) player.played = false
  }

  /** On-demand reset of the played marks (log entries are history and stay). */
  resetPlayed(): void {
    this.startNewSession()
  }

  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------

  private closeOpenLogEntry(player: PlayerState, outcome: 'completed' | 'stopped'): void {
    if (!player.clip) return
    for (let i = this.playedLog.length - 1; i >= 0; i--) {
      const entry = this.playedLog[i]
      if (entry.clipId === player.clip.assetId && entry.outcome === 'playing') {
        entry.endedAtSessionSec = this.sessionElapsedSec()
        entry.outcome = outcome
        return
      }
    }
  }

  /**
   * Advances playback by dt seconds (adapter rAF / test clock). A
   * playing player that reaches OUT auto-returns to IN, stops, and its
   * log entry closes as 'completed'. The last-10 s warning state (and
   * its one-shot event) is maintained here.
   */
  advance(dtSec: number): void {
    if (!Number.isFinite(dtSec) || dtSec < 0) throw new Error('advance requires dt >= 0.')
    this.localElapsedSec += dtSec
    for (const player of this.players) {
      if (player.status !== 'playing' || !player.clip) continue
      player.positionSec += dtSec
      const remaining = this.remainingSec(player)
      player.endWarning = remaining <= END_WARNING_SEC
      if (player.endWarning && !player.endWarningFired) {
        player.endWarningFired = true
        this.emit({ type: 'end-warning', playerIndex: player.index, remainingSec: remaining })
      }
      if (player.positionSec >= player.cueOutSec) {
        const assetId = player.clip.assetId
        this.closeOpenLogEntry(player, 'completed')
        player.positionSec = player.cueInSec // auto-return at OUT
        player.status = 'loaded'
        player.endWarning = false
        this.emit({ type: 'play-completed', playerIndex: player.index, assetId })
      }
    }
  }

  /**
   * Folds the engine's played log into a POD-05 session document (the
   * authoritative store). Entries already in the document are not
   * duplicated (id match), so folding twice is idempotent; open
   * entries in the document are closed from the engine's copies.
   */
  playedLogToSession(session: StudioSessionDoc): SessionDocWithPlayedLog {
    const doc = JSON.parse(JSON.stringify(session)) as SessionDocWithPlayedLog
    const existing = new Map((doc.playedClipLog ?? []).map((entry) => [entry.id, entry]))
    for (const entry of this.playedLog) {
      const prior = existing.get(entry.id)
      if (prior) {
        prior.endedAtSessionSec = entry.endedAtSessionSec
        prior.outcome = entry.outcome
      } else {
        existing.set(entry.id, { ...entry })
      }
    }
    doc.playedClipLog = [...existing.values()]
    return doc
  }

  /** Rebuilds a session document's open entries via the played-log helpers (utility for POD-09). */
  static closeInSession(
    session: StudioSessionDoc,
    clipId: string,
    outcome: 'completed' | 'stopped',
  ): SessionDocWithPlayedLog {
    return closePlayedClip(session, { source: 'player', clipId, outcome }).session
  }
}
