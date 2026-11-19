/**
 * POD-08 — Players browser adapter (THIN BROWSER ADAPTER) + the shared
 * action dispatcher.
 *
 * `dispatchPlayerAction` is THE wiring point for every control surface:
 * the POD-05 studio UI buttons call it today, and POD-15's keyboard /
 * MIDI map will call it with the same action names — no surface talks
 * to the engine or the audio graph directly.
 *
 * The adapter decodes clip audio with `decodeAudioData` into the
 * session's 48 kHz context (the POD-00 working-format browser decode
 * policy — playback/interaction only, never written back), plays it
 * through a per-player GainNode (the engine's log-taper fader), and
 * routes each player to exactly one destination at a time:
 * - program: the CLIPS stream destination handed to the POD-07 mixer
 *   graph as its clips source (POD-07 `MixerSourceStreams.clips`);
 * - PFL: the cue stream destination (host monitor) — a PFL player is
 *   disconnected from the clips stream, so an audition cannot reach
 *   program, the recording, or the stream.
 * Position updates flow from a requestAnimationFrame loop into the
 * pure core via `engine.advance(dt)`; the core remains the single
 * source of play state, cue and played-log truth.
 *
 * UNVERIFIED: no real browser, AudioContext or decodeAudioData was
 * exercised in POD-08. This file is typechecked wiring over the tested
 * core; the rig tests that would close it are named in the POD-08
 * handoff.
 */

import { PlayerEngine, type ClipRef } from './player-engine'
import type { CartwallAudioState } from './cartwall-audio'
import { toggleCart } from './cartwall-audio'
import type { StudioSessionDoc } from '../session-engine'

export type PlayerAction =
  | 'load'
  | 'play'
  | 'pause'
  | 'stop'
  | 'dump'
  | 'seek'
  | 'set-cue-in'
  | 'set-cue-out'
  | 'set-pfl'
  | 'set-fader'
  | 'wheel-fader'
  | 'toggle-display'
  | 'stop-all'
  | 'cart-toggle'

export type PlayerActionArgs = {
  playerIndex?: number
  clip?: ClipRef
  sec?: number
  gainDb?: number
  wheelDeltaY?: number
  pfl?: boolean
  cartId?: string
}

export type PlayerActionHooks = {
  /** Adapter hook: (re)start/stop the actual audio for a player after a transport action. */
  onTransport?: (action: PlayerAction, playerIndex: number, engine: PlayerEngine) => void
  /** Cartwall session effects (played log + dimming) produced by a cart toggle. */
  onCartSession?: (session: StudioSessionDoc) => void
  cartwall?: { state: CartwallAudioState; session: StudioSessionDoc }
}

/**
 * The single action dispatcher every control surface uses (UI buttons
 * now; POD-15 hotkeys/MIDI later). Returns a small result describing
 * what happened so surfaces can flash feedback (e.g. 'already-loaded').
 */
export function dispatchPlayerAction(
  engine: PlayerEngine,
  action: PlayerAction,
  args: PlayerActionArgs = {},
  hooks: PlayerActionHooks = {},
): { ok: boolean; reason?: string; playerIndex?: number } {
  const index = args.playerIndex ?? 0
  switch (action) {
    case 'load': {
      if (!args.clip) return { ok: false, reason: 'no-clip' }
      const result = engine.loadClip(args.clip, args.playerIndex)
      if (result.ok) hooks.onTransport?.(action, result.playerIndex ?? index, engine)
      return result
    }
    case 'play': {
      const result = engine.play(index)
      if (result.ok) hooks.onTransport?.(action, index, engine)
      return result
    }
    case 'pause':
      engine.pause(index)
      hooks.onTransport?.(action, index, engine)
      return { ok: true, playerIndex: index }
    case 'stop':
      engine.stop(index)
      hooks.onTransport?.(action, index, engine)
      return { ok: true, playerIndex: index }
    case 'dump':
      engine.dump(index)
      hooks.onTransport?.(action, index, engine)
      return { ok: true, playerIndex: index }
    case 'seek':
      if (args.sec === undefined) return { ok: false, reason: 'no-sec' }
      engine.seek(index, args.sec)
      hooks.onTransport?.(action, index, engine)
      return { ok: true, playerIndex: index }
    case 'set-cue-in':
      if (args.sec === undefined) return { ok: false, reason: 'no-sec' }
      engine.setCueIn(index, args.sec)
      return { ok: true, playerIndex: index }
    case 'set-cue-out':
      if (args.sec === undefined) return { ok: false, reason: 'no-sec' }
      engine.setCueOut(index, args.sec)
      return { ok: true, playerIndex: index }
    case 'set-pfl':
      engine.setPfl(index, args.pfl ?? false)
      hooks.onTransport?.(action, index, engine)
      return { ok: true, playerIndex: index }
    case 'set-fader':
      if (args.gainDb === undefined) return { ok: false, reason: 'no-gain' }
      engine.setFaderDb(index, args.gainDb)
      hooks.onTransport?.(action, index, engine)
      return { ok: true, playerIndex: index }
    case 'wheel-fader':
      engine.wheelFader(index, args.wheelDeltaY ?? 0)
      hooks.onTransport?.(action, index, engine)
      return { ok: true, playerIndex: index }
    case 'toggle-display':
      // Display mode is a per-surface preference; the core's display
      // model serves both modes from the same state. No engine change.
      return { ok: true, playerIndex: index }
    case 'stop-all':
      engine.stopAll()
      hooks.onTransport?.(action, index, engine)
      return { ok: true }
    case 'cart-toggle': {
      if (!args.cartId || !hooks.cartwall) return { ok: false, reason: 'no-cart' }
      const result = toggleCart(hooks.cartwall.state, hooks.cartwall.session, args.cartId)
      if (result.session) hooks.onCartSession?.(result.session)
      return { ok: result.ok, reason: result.error }
    }
    default:
      return { ok: false, reason: 'unknown-action' }
  }
}

// ---------------------------------------------------------------------------
// Browser audio binding (UNVERIFIED in a real browser)
// ---------------------------------------------------------------------------

export type PlayerBankHandle = {
  context: AudioContext
  /** Feed this stream into the POD-07 mixer graph as its clips source. */
  clipsStream: MediaStream
  /** Host cue monitor stream: PFL players land here, never on program. */
  cueStream: MediaStream
  /** Loads + decodes a clip into a player (decodeAudioData, 48 kHz context). */
  loadDecoded(playerIndex: number, url: string): Promise<void>
  /** Reconciles live audio nodes with the engine state after any dispatched action. */
  sync(engine: PlayerEngine): void
  dispose(): void
}

type LivePlayer = {
  source: AudioBufferSourceNode | null
  gain: GainNode
  buffer: AudioBuffer | null
  startedAtContextTime: number
  startedAtPositionSec: number
}

/**
 * Builds the per-player audio binding. Routing is exclusive: each
 * player's gain connects to the clips destination (program) XOR the
 * cue destination (PFL) — the adapter physically cannot send a PFL
 * player to program.
 */
export const createPlayerBank = (context: AudioContext): PlayerBankHandle => {
  const clipsDestination = context.createMediaStreamDestination()
  const cueDestination = context.createMediaStreamDestination()
  const live: LivePlayer[] = Array.from({ length: 8 }, () => {
    const gain = context.createGain()
    gain.connect(clipsDestination)
    return { source: null, gain, buffer: null, startedAtContextTime: 0, startedAtPositionSec: 0 }
  })

  const stopSource = (player: LivePlayer) => {
    if (player.source) {
      try {
        player.source.stop()
      } catch {
        // already stopped
      }
      player.source.disconnect()
      player.source = null
    }
  }

  return {
    context,
    clipsStream: clipsDestination.stream,
    cueStream: cueDestination.stream,
    async loadDecoded(playerIndex: number, url: string) {
      const response = await fetch(url)
      const bytes = await response.arrayBuffer()
      const buffer = await context.decodeAudioData(bytes)
      const player = live[playerIndex]
      if (player) player.buffer = buffer
    },
    sync(engine: PlayerEngine) {
      engine.players.forEach((state, index) => {
        const player = live[index]
        if (!player) return
        player.gain.gain.value = engine.faderLinear(index)
        // Exclusive routing: cue XOR clips.
        player.gain.disconnect()
        player.gain.connect(state.pfl ? cueDestination : clipsDestination)
        if (state.status === 'playing' && !player.source && player.buffer) {
          const source = context.createBufferSource()
          source.buffer = player.buffer
          source.connect(player.gain)
          source.start(0, state.positionSec)
          player.source = source
          player.startedAtContextTime = context.currentTime
          player.startedAtPositionSec = state.positionSec
        } else if (state.status !== 'playing' && player.source) {
          stopSource(player)
        }
      })
    },
    dispose() {
      for (const player of live) {
        stopSource(player)
        player.gain.disconnect()
      }
    },
  }
}

/**
 * Position pump: advances the engine core from rAF using the audio
 * context clock. Returns a stop function. (UNVERIFIED in a browser.)
 */
export const pumpPlayerPositions = (
  engine: PlayerEngine,
  context: AudioContext,
  onTick?: () => void,
): (() => void) => {
  let raf = 0
  let last = context.currentTime
  const step = () => {
    const now = context.currentTime
    engine.advance(Math.max(0, now - last))
    last = now
    onTick?.()
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}
