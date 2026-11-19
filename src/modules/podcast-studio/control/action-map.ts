/**
 * POD-15 (POD-REQ-32, POD-REQ-33) — Studio action registry + action bus
 * (PURE CORE).
 *
 * The single registry of studio actions: every action the desk can
 * perform — session transport (prepare / record / stop), MARK, STOP
 * ALL, players 1–8 (play / pause / stop / PFL / fader), carts 1–8
 * (fire / stop), talkback (hold + toggle), mixer (per-strip mute,
 * fader nudges, continuous faders, master), rundown navigation, and
 * the POD-12 editor ops (J/L/K shuttle, I/O, split, cut, undo/redo) —
 * exists here as DATA: `{ id, title, defaultChords, context }`.
 * Keyboard (keyboard-map.ts), Web MIDI (midi.ts), on-screen buttons
 * and scripted show runs all dispatch the SAME action ids through the
 * ONE `StudioActionBus`; no surface talks to an engine directly.
 *
 * Wiring (`createStudioActionHandlers`) generalizes POD-08's
 * `dispatchPlayerAction` — the POD-08 wiring point — instead of
 * duplicating it: player/cart actions route through
 * `dispatchPlayerAction` / the cartwall core, session actions through
 * the POD-05 session engine and the POD-09 recording state, mixer
 * actions through the POD-07 `MixerState`, editor actions through
 * injected hooks (the editor panel owns playhead/selection state).
 *
 * Pattern note: the action/learn model follows the CurryCaster v1
 * MidiMapper behaviour (MIT pattern — see THIRD_PARTY_NOTICES);
 * the implementation is Renegade-native TypeScript.
 */

import {
  addMarker,
  getRecordingState,
  requestStopRecording,
  startRecordingState,
} from '../recording/recording-session'
import type { DeskMode } from '../mixer/device-roles'
import type { MixerState } from '../mixer/state'
import { FADER_MAX_DB, FADER_MIN_DB, type PlayerEngine } from '../players/player-engine'
import {
  createCartwallAudio,
  stopAllAudio,
  toggleCart,
  type CartwallAudioState,
} from '../players/cartwall-audio'
import { dispatchPlayerAction } from '../players/players-browser'
import {
  armCue,
  completeSegment,
  fireCue,
  moveRundownItem,
  removeRundownItem,
  setSessionState,
  skipSegment,
  startSegment,
  stopAll as sessionStopAll,
  stopCue,
  type StudioSessionDoc,
} from '../session-engine'

// ---------------------------------------------------------------------------
// Registry (actions are data)
// ---------------------------------------------------------------------------

export type StudioActionContext = 'studio' | 'editor' | 'global'

export type StudioActionValueKind = 'trigger' | 'toggle' | 'momentary' | 'continuous'

export type StudioActionDef = {
  id: string
  title: string
  category: string
  context: StudioActionContext
  /** Normalized chords (see keyboard-map.ts `chordFromKeyboardEvent`). Empty = unbound by default (MIDI-first actions). */
  defaultChords: string[]
  valueKind: StudioActionValueKind
  /**
   * Safety actions bypass the focus guard (they fire while typing and
   * while a modal is open). ONLY `stop-all` carries this — see
   * keyboard-map.ts for the documented policy.
   */
  safety?: boolean
}

const def = (
  id: string,
  title: string,
  category: string,
  context: StudioActionContext,
  defaultChords: string[],
  valueKind: StudioActionValueKind = 'trigger',
  extra: Partial<StudioActionDef> = {},
): StudioActionDef => ({ id, title, category, context, defaultChords, valueKind, ...extra })

export const CART_KEYS = ['Q', 'W', 'E', 'T', 'Y', 'U', 'I', 'O'] as const

/** Mixer strips the control surface addresses by name. */
export const CONTROL_STRIPS = [
  {
    key: 'host',
    stripId: 'host',
    label: 'Host',
    muteChord: 'Alt+KeyH',
    nudgeUp: 'Alt+ArrowUp',
    nudgeDown: 'Alt+ArrowDown',
  },
  {
    key: 'clips',
    stripId: 'clips',
    label: 'Clips',
    muteChord: 'Alt+KeyC',
    nudgeUp: 'Ctrl+ArrowUp',
    nudgeDown: 'Ctrl+ArrowDown',
  },
  {
    key: 'guest',
    stripId: 'guest-1',
    label: 'Guest 1',
    muteChord: 'Alt+KeyG',
    nudgeUp: 'Ctrl+Shift+ArrowUp',
    nudgeDown: 'Ctrl+Shift+ArrowDown',
  },
] as const

function buildRegistry(): StudioActionDef[] {
  const actions: StudioActionDef[] = [
    def(
      'stop-all',
      'STOP ALL (halt players + carts)',
      'Safety',
      'global',
      ['Shift+Escape'],
      'trigger',
      { safety: true },
    ),
    def('session.prepare', 'Prepare session (desk → ready)', 'Transport', 'studio', ['Shift+KeyP']),
    def('record.start', 'Start recording', 'Transport', 'studio', ['KeyR']),
    def('record.stop', 'Stop recording (confirmed)', 'Transport', 'studio', ['Shift+KeyR']),
    def('marker.drop', 'Drop marker (MARK)', 'Transport', 'studio', ['KeyM']),
    def(
      'talkback.hold',
      'Talkback (hold — guests only, never program)',
      'Talkback',
      'studio',
      ['KeyB'],
      'momentary',
    ),
    def('talkback.toggle', 'Talkback toggle', 'Talkback', 'studio', ['Shift+KeyB'], 'toggle'),
  ]
  for (let n = 1; n <= 8; n++) {
    actions.push(
      def(`player.${n}.play`, `Player ${n} play`, 'Players', 'studio', [`Digit${n}`]),
      def(`player.${n}.pause`, `Player ${n} pause`, 'Players', 'studio', [`Ctrl+Digit${n}`]),
      def(`player.${n}.stop`, `Player ${n} stop`, 'Players', 'studio', [`Shift+Digit${n}`]),
      def(
        `player.${n}.pfl`,
        `Player ${n} PFL toggle (cue bus only)`,
        'Players',
        'studio',
        [`Alt+Digit${n}`],
        'toggle',
      ),
      def(
        `player.${n}.fader`,
        `Player ${n} fader (continuous)`,
        'Players',
        'studio',
        [],
        'continuous',
      ),
    )
  }
  CART_KEYS.forEach((key, i) => {
    const n = i + 1
    actions.push(
      def(`cart.${n}.fire`, `Cart ${n} fire`, 'Cartwall', 'studio', [`Key${key}`]),
      def(`cart.${n}.stop`, `Cart ${n} stop`, 'Cartwall', 'studio', [`Shift+Key${key}`]),
    )
  })
  for (const strip of CONTROL_STRIPS) {
    actions.push(
      def(
        `mixer.${strip.key}.mute`,
        `${strip.label} strip mute toggle`,
        'Mixer',
        'studio',
        [strip.muteChord],
        'toggle',
      ),
      def(`mixer.${strip.key}.fader-up`, `${strip.label} fader +1 dB`, 'Mixer', 'studio', [
        strip.nudgeUp,
      ]),
      def(`mixer.${strip.key}.fader-down`, `${strip.label} fader −1 dB`, 'Mixer', 'studio', [
        strip.nudgeDown,
      ]),
      def(
        `mixer.${strip.key}.fader`,
        `${strip.label} fader (continuous)`,
        'Mixer',
        'studio',
        [],
        'continuous',
      ),
    )
  }
  actions.push(
    def('mixer.master.mute', 'Master mute toggle', 'Mixer', 'studio', ['Alt+KeyM'], 'toggle'),
    def('mixer.master.fader-up', 'Master fader +1 dB', 'Mixer', 'studio', ['Alt+Shift+ArrowUp']),
    def('mixer.master.fader-down', 'Master fader −1 dB', 'Mixer', 'studio', [
      'Alt+Shift+ArrowDown',
    ]),
    def('mixer.master.fader', 'Master fader (continuous)', 'Mixer', 'studio', [], 'continuous'),
    def('rundown.next', 'Rundown: select next item', 'Rundown', 'studio', ['ArrowDown']),
    def('rundown.prev', 'Rundown: select previous item', 'Rundown', 'studio', ['ArrowUp']),
    def('rundown.move-up', 'Rundown: move selected item up', 'Rundown', 'studio', [
      'Shift+ArrowUp',
    ]),
    def('rundown.move-down', 'Rundown: move selected item down', 'Rundown', 'studio', [
      'Shift+ArrowDown',
    ]),
    def('rundown.start', 'Rundown: start selected item', 'Rundown', 'studio', ['Enter']),
    def('rundown.complete', 'Rundown: complete selected item', 'Rundown', 'studio', [
      'Shift+Enter',
    ]),
    def('rundown.skip', 'Rundown: skip selected item', 'Rundown', 'studio', ['Alt+Enter']),
    def('rundown.remove', 'Rundown: remove selected item', 'Rundown', 'studio', ['Delete']),
    // POD-12 editor ops (editor context — J/L/K per the reference model).
    def('editor.shuttle.reverse', 'Editor: shuttle reverse (J)', 'Editor', 'editor', ['KeyJ']),
    def('editor.shuttle.stop', 'Editor: shuttle stop (K)', 'Editor', 'editor', ['KeyK']),
    def('editor.shuttle.forward', 'Editor: shuttle forward (L)', 'Editor', 'editor', ['KeyL']),
    def(
      'editor.transport.play-pause',
      'Editor: play / pause',
      'Editor',
      'editor',
      ['Space'],
      'toggle',
    ),
    def('editor.mark-in', 'Editor: set IN point (I)', 'Editor', 'editor', ['KeyI']),
    def('editor.mark-out', 'Editor: set OUT point (O)', 'Editor', 'editor', ['KeyO']),
    def('editor.split', 'Editor: split clip at playhead (S)', 'Editor', 'editor', ['KeyS']),
    def('editor.cut-range', 'Editor: cut I/O range (gap closes)', 'Editor', 'editor', ['KeyX']),
    def('editor.delete-range', 'Editor: delete I/O in lane (silence)', 'Editor', 'editor', [
      'Shift+KeyX',
    ]),
    def('editor.undo', 'Editor: undo', 'Editor', 'editor', ['Ctrl+KeyZ']),
    def('editor.redo', 'Editor: redo', 'Editor', 'editor', ['Ctrl+Shift+KeyZ']),
    def('editor.copy', 'Editor: copy selected clip', 'Editor', 'editor', ['Ctrl+KeyC']),
    def('editor.paste', 'Editor: paste at playhead', 'Editor', 'editor', ['Ctrl+KeyV']),
    def('editor.markers-to-chapters', 'Editor: markers → chapters', 'Editor', 'editor', [
      'Shift+KeyC',
    ]),
    def('editor.zoom-in', 'Editor: zoom in', 'Editor', 'editor', ['Equal']),
    def('editor.zoom-out', 'Editor: zoom out', 'Editor', 'editor', ['Minus']),
    def('editor.zoom-fit', 'Editor: zoom to fit', 'Editor', 'editor', ['KeyF']),
  )
  return actions
}

export const STUDIO_ACTIONS: readonly StudioActionDef[] = buildRegistry()

export const getStudioAction = (actionId: string): StudioActionDef | null =>
  STUDIO_ACTIONS.find((action) => action.id === actionId) ?? null

export const listStudioActions = (
  filter: { context?: StudioActionContext; category?: string } = {},
): StudioActionDef[] =>
  STUDIO_ACTIONS.filter(
    (action) =>
      (filter.context === undefined || action.context === filter.context) &&
      (filter.category === undefined || action.category === filter.category),
  )

/** Two contexts overlap when either is 'global' or they are equal. */
export const contextsOverlap = (a: StudioActionContext, b: StudioActionContext): boolean =>
  a === 'global' || b === 'global' || a === b

// ---------------------------------------------------------------------------
// Action bus — the one dispatch path for every surface
// ---------------------------------------------------------------------------

export type StudioActionPayload = {
  source: 'keyboard' | 'midi' | 'ui' | 'script'
  /** Momentary actions: 'down' engages, 'up' releases. */
  phase?: 'down' | 'up'
  /** Continuous actions: normalized 0..1 control value (MIDI CC). */
  value?: number
  /** Continuous actions: absolute fader value in dB (already scaled). */
  valueDb?: number
  chord?: string
  controlId?: string
}

export type StudioActionResult = { ok: boolean; actionId: string; reason?: string }
export type StudioActionHandler = (
  payload: StudioActionPayload,
) => { ok: boolean; reason?: string } | void

const ok = { ok: true } as const

export class StudioActionBus {
  private handlers = new Map<string, StudioActionHandler>()

  /** Registers a handler. Unknown action ids are refused by name — a typo can never become a silent no-op binding. */
  register(actionId: string, handler: StudioActionHandler): { ok: boolean; reason?: string } {
    if (!getStudioAction(actionId)) return { ok: false, reason: 'unknown-action' }
    this.handlers.set(actionId, handler)
    return { ok: true }
  }

  registerAll(handlers: Record<string, StudioActionHandler>): { ok: boolean; reason?: string } {
    for (const [actionId, handler] of Object.entries(handlers)) {
      const result = this.register(actionId, handler)
      if (!result.ok) return result
    }
    return { ok: true }
  }

  hasHandler(actionId: string): boolean {
    return this.handlers.has(actionId)
  }

  dispatch(actionId: string, payload: StudioActionPayload): StudioActionResult {
    if (!getStudioAction(actionId)) return { ok: false, actionId, reason: 'unknown-action' }
    const handler = this.handlers.get(actionId)
    if (!handler) return { ok: false, actionId, reason: 'no-handler' }
    const result = handler(payload)
    if (result && result.ok === false) return { ok: false, actionId, reason: result.reason }
    return { ok: true, actionId }
  }
}

// ---------------------------------------------------------------------------
// Core wiring — handlers bound to the POD-05/07/08/09/12 cores
// ---------------------------------------------------------------------------

export type SessionStore = { get(): StudioSessionDoc; set(doc: StudioSessionDoc): void }
export type MixerStore = { get(): MixerState; set(state: MixerState): void }
export type CartwallStore = { get(): CartwallAudioState; set(state: CartwallAudioState): void }
export type SelectionStore = { get(): number; set(index: number): void }

/** Editor callbacks the POD-12 panel supplies (it owns playhead/selection/history state). */
export type EditorControlHooks = Partial<
  Record<
    | 'shuttleReverse'
    | 'shuttleStop'
    | 'shuttleForward'
    | 'playPause'
    | 'markIn'
    | 'markOut'
    | 'split'
    | 'cutRange'
    | 'deleteRange'
    | 'undo'
    | 'redo'
    | 'copy'
    | 'paste'
    | 'markersToChapters'
    | 'zoomIn'
    | 'zoomOut'
    | 'zoomFit',
    () => void
  >
>

export type StudioCoreDeps = {
  session?: SessionStore
  playerEngine?: PlayerEngine
  /** When omitted, cart actions fall back to a wall built from the session doc per dispatch. */
  cartwall?: CartwallStore
  mixer?: MixerStore
  selection?: SelectionStore
  editor?: EditorControlHooks
  deskMode?: DeskMode
}

const clampDb = (db: number): number => Math.min(FADER_MAX_DB, Math.max(FADER_MIN_DB, db))

/**
 * Builds the handler map that binds every registry action to the real
 * cores. Surfaces construct a bus, `registerAll` this map (plus any
 * surface-local editor hooks), and dispatch — nothing else.
 */
export function createStudioActionHandlers(
  deps: StudioCoreDeps,
): Record<string, StudioActionHandler> {
  const handlers: Record<string, StudioActionHandler> = {}
  const need = (present: boolean) => (present ? null : { ok: false, reason: 'target-not-wired' })

  // -- Transport / session (POD-05 engine + POD-09 recording state) --
  if (deps.session) {
    const session = deps.session
    handlers['session.prepare'] = () => {
      session.set(setSessionState(session.get(), 'ready'))
      return ok
    }
    handlers['record.start'] = () => {
      if (getRecordingState(session.get())?.status === 'recording')
        return { ok: false, reason: 'already-recording' }
      session.set(startRecordingState(session.get(), { deskMode: deps.deskMode ?? 'one-mic' }))
      return ok
    }
    handlers['record.stop'] = () => {
      // A control-surface stop is the operator's explicit act, so the
      // POD-09 confirm guard is satisfied by the dispatch itself.
      const result = requestStopRecording(session.get(), { confirmed: true })
      if (!result.ok) return { ok: false, reason: result.code }
      session.set(result.session)
      return ok
    }
    handlers['marker.drop'] = () => {
      const doc = session.get()
      if (getRecordingState(doc)?.status === 'recording') {
        // POD-09 marker: name prompt Esc'd (null) → auto number kept.
        session.set(addMarker(doc, { promptResult: null }).session)
      } else {
        const next: StudioSessionDoc = JSON.parse(JSON.stringify(doc)) as StudioSessionDoc
        const number = (next.markers ?? []).length + 1
        next.markers = [
          ...(next.markers ?? []),
          { startTime: next.elapsedSec, title: `Marker ${number}`, type: 'marker' },
        ]
        next.log.push({
          type: 'marker',
          level: 'info',
          atElapsedSec: next.elapsedSec,
          markerNumber: number,
        })
        session.set(next)
      }
      return ok
    }
  }

  // -- STOP ALL (POD-08 stopAllAudio over POD-05 stopAll) --
  handlers['stop-all'] = () => {
    let doc = deps.session?.get()
    if (deps.playerEngine && deps.session && doc) {
      const wall = deps.cartwall?.get() ?? createCartwallAudio(doc)
      const result = stopAllAudioBridge(deps.playerEngine, wall, doc)
      deps.cartwall?.set(result.state)
      doc = result.session
    } else if (deps.playerEngine) {
      deps.playerEngine.stopAll()
    }
    if (deps.session && doc) deps.session.set(sessionStopAll(doc))
    else if (deps.session) deps.session.set(sessionStopAll(deps.session.get()))
    return ok
  }

  // -- Players (through POD-08 dispatchPlayerAction — the wiring point) --
  if (deps.playerEngine) {
    const engine = deps.playerEngine
    for (let n = 1; n <= 8; n++) {
      const index = n - 1
      handlers[`player.${n}.play`] = () =>
        dispatchPlayerAction(engine, 'play', { playerIndex: index })
      handlers[`player.${n}.pause`] = () =>
        dispatchPlayerAction(engine, 'pause', { playerIndex: index })
      handlers[`player.${n}.stop`] = () =>
        dispatchPlayerAction(engine, 'stop', { playerIndex: index })
      handlers[`player.${n}.pfl`] = () =>
        dispatchPlayerAction(engine, 'set-pfl', {
          playerIndex: index,
          pfl: !engine.players[index].pfl,
        })
      handlers[`player.${n}.fader`] = (payload) => {
        if (payload.valueDb === undefined) return { ok: false, reason: 'no-value' }
        return dispatchPlayerAction(engine, 'set-fader', {
          playerIndex: index,
          gainDb: payload.valueDb,
        })
      }
    }
  }

  // -- Carts (POD-08 cartwall core; session fire/stop fallback) --
  const cartAt = (n: number): { cartId: string; wall: CartwallAudioState } | null => {
    if (!deps.session) return null
    const wall = deps.cartwall?.get() ?? createCartwallAudio(deps.session.get())
    const cart = wall.carts[n - 1]
    return cart ? { cartId: cart.cartId, wall } : null
  }
  for (let n = 1; n <= 8; n++) {
    handlers[`cart.${n}.fire`] = () => {
      const missing = need(Boolean(deps.session))
      if (missing) return missing
      const found = cartAt(n)
      if (!found) return { ok: false, reason: 'no-such-cart' }
      const cart = found.wall.carts[n - 1]
      if (cart.status === 'playing') return { ok: false, reason: 'already-playing' }
      if (deps.cartwall) {
        const result = toggleCart(found.wall, deps.session!.get(), found.cartId)
        if (!result.ok) return { ok: false, reason: result.error }
        deps.cartwall.set(result.state)
        if (result.session) deps.session!.set(result.session)
        return ok
      }
      // Session-only path: fire discipline requires an arm — the fire
      // action arms then fires in one operator gesture.
      const armed = armCue(deps.session!.get(), found.cartId)
      if (!armed.ok) return { ok: false, reason: armed.error }
      const fired = fireCue(armed.session, found.cartId)
      deps.session!.set(fired.session)
      return fired.ok ? ok : { ok: false, reason: fired.error }
    }
    handlers[`cart.${n}.stop`] = () => {
      const missing = need(Boolean(deps.session))
      if (missing) return missing
      const found = cartAt(n)
      if (!found) return { ok: false, reason: 'no-such-cart' }
      const cart = found.wall.carts[n - 1]
      if (deps.cartwall && cart.status === 'playing') {
        const result = toggleCart(found.wall, deps.session!.get(), found.cartId)
        if (!result.ok) return { ok: false, reason: result.error }
        deps.cartwall.set(result.state)
        if (result.session) deps.session!.set(result.session)
        return ok
      }
      const stopped = stopCue(deps.session!.get(), found.cartId)
      deps.session!.set(stopped.session)
      return stopped.ok ? ok : { ok: false, reason: stopped.error }
    }
  }

  // -- Mixer + talkback (POD-07 MixerState) --
  if (deps.mixer) {
    const mixer = deps.mixer
    const update = (fn: (state: MixerState) => MixerState) => {
      mixer.set(fn(JSON.parse(JSON.stringify(mixer.get())) as MixerState))
      return ok
    }
    for (const strip of CONTROL_STRIPS) {
      handlers[`mixer.${strip.key}.mute`] = () =>
        update((state) => {
          const target = state.strips.find((s) => s.id === strip.stripId)
          if (target) target.muted = !target.muted
          return state
        })
      handlers[`mixer.${strip.key}.fader-up`] = (payload) =>
        update((state) => {
          const target = state.strips.find((s) => s.id === strip.stripId)
          if (target) target.gainDb = clampDb(payload.valueDb ?? target.gainDb + 1)
          return state
        })
      handlers[`mixer.${strip.key}.fader-down`] = () =>
        update((state) => {
          const target = state.strips.find((s) => s.id === strip.stripId)
          if (target) target.gainDb = clampDb(target.gainDb - 1)
          return state
        })
      handlers[`mixer.${strip.key}.fader`] = (payload) => {
        if (payload.valueDb === undefined) return { ok: false, reason: 'no-value' }
        return update((state) => {
          const target = state.strips.find((s) => s.id === strip.stripId)
          if (target) target.gainDb = clampDb(payload.valueDb!)
          return state
        })
      }
    }
    handlers['mixer.master.mute'] = () =>
      update((state) => {
        // Master mute is modelled as all strips muted toggling with the
        // first strip's state — MixerState has no separate master mute.
        const muted = !(state.strips[0]?.muted ?? false)
        for (const s of state.strips) s.muted = muted
        return state
      })
    handlers['mixer.master.fader-up'] = (payload) =>
      update((state) => ({
        ...state,
        masterGainDb: clampDb(payload.valueDb ?? state.masterGainDb + 1),
      }))
    handlers['mixer.master.fader-down'] = () =>
      update((state) => ({ ...state, masterGainDb: clampDb(state.masterGainDb - 1) }))
    handlers['mixer.master.fader'] = (payload) => {
      if (payload.valueDb === undefined) return { ok: false, reason: 'no-value' }
      return update((state) => ({ ...state, masterGainDb: clampDb(payload.valueDb!) }))
    }
    handlers['talkback.toggle'] = () =>
      update((state) => ({ ...state, talkbackMuted: !state.talkbackMuted }))
    handlers['talkback.hold'] = (payload) =>
      update((state) => ({ ...state, talkbackMuted: payload.phase === 'up' }))
  }

  // -- Rundown (POD-05 engine over the UI selection) --
  if (deps.session) {
    const session = deps.session
    const selectedIndex = () => deps.selection?.get() ?? 0
    handlers['rundown.next'] = () => {
      if (!deps.selection) return { ok: false, reason: 'target-not-wired' }
      deps.selection.set(
        Math.min(selectedIndex() + 1, Math.max(0, session.get().rundown.length - 1)),
      )
      return ok
    }
    handlers['rundown.prev'] = () => {
      if (!deps.selection) return { ok: false, reason: 'target-not-wired' }
      deps.selection.set(Math.max(selectedIndex() - 1, 0))
      return ok
    }
    handlers['rundown.move-up'] = () => moveSelected(session, selectedIndex(), -1, deps.selection)
    handlers['rundown.move-down'] = () => moveSelected(session, selectedIndex(), 1, deps.selection)
    handlers['rundown.start'] = () => {
      const item = session.get().rundown[selectedIndex()]
      if (!item) return { ok: false, reason: 'no-such-item' }
      const result = startSegment(session.get(), item.id)
      session.set(result.session)
      return result.ok ? ok : { ok: false, reason: result.error }
    }
    handlers['rundown.complete'] = () => {
      const item = session.get().rundown[selectedIndex()]
      if (!item) return { ok: false, reason: 'no-such-item' }
      const result = completeSegment(session.get(), item.id)
      session.set(result.session)
      return result.ok ? ok : { ok: false, reason: result.error }
    }
    handlers['rundown.skip'] = () => {
      const item = session.get().rundown[selectedIndex()]
      if (!item) return { ok: false, reason: 'no-such-item' }
      const result = skipSegment(session.get(), item.id)
      session.set(result.session)
      return result.ok ? ok : { ok: false, reason: result.error }
    }
    handlers['rundown.remove'] = () => {
      const item = session.get().rundown[selectedIndex()]
      if (!item) return { ok: false, reason: 'no-such-item' }
      const result = removeRundownItem(session.get(), item.id)
      session.set(result.session)
      return result.ok ? ok : { ok: false, reason: result.error }
    }
  }

  // -- Editor (POD-12 hooks supplied by the panel) --
  if (deps.editor) {
    const editor = deps.editor
    const bind = (actionId: string, hook: keyof EditorControlHooks) => {
      const fn = editor[hook]
      if (fn)
        handlers[actionId] = () => {
          fn()
          return ok
        }
    }
    bind('editor.shuttle.reverse', 'shuttleReverse')
    bind('editor.shuttle.stop', 'shuttleStop')
    bind('editor.shuttle.forward', 'shuttleForward')
    bind('editor.transport.play-pause', 'playPause')
    bind('editor.mark-in', 'markIn')
    bind('editor.mark-out', 'markOut')
    bind('editor.split', 'split')
    bind('editor.cut-range', 'cutRange')
    bind('editor.delete-range', 'deleteRange')
    bind('editor.undo', 'undo')
    bind('editor.redo', 'redo')
    bind('editor.copy', 'copy')
    bind('editor.paste', 'paste')
    bind('editor.markers-to-chapters', 'markersToChapters')
    bind('editor.zoom-in', 'zoomIn')
    bind('editor.zoom-out', 'zoomOut')
    bind('editor.zoom-fit', 'zoomFit')
  }

  return handlers
}

function stopAllAudioBridge(engine: PlayerEngine, wall: CartwallAudioState, doc: StudioSessionDoc) {
  return stopAllAudio(engine, wall, doc)
}

function moveSelected(
  session: SessionStore,
  index: number,
  delta: -1 | 1,
  selection?: SelectionStore,
): { ok: boolean; reason?: string } {
  const target = index + delta
  const doc = session.get()
  if (target < 0 || target >= doc.rundown.length) return { ok: false, reason: 'index-out-of-range' }
  const result = moveRundownItem(doc, index, target)
  if (!result.ok) return { ok: false, reason: result.error }
  session.set(result.session)
  selection?.set(target)
  return ok
}
