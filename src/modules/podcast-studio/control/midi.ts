/**
 * POD-15 (POD-REQ-33) — Web MIDI core (PURE): message parsing over
 * byte arrays, the binding model, learn mode, CC scaling, routing to
 * the action bus, per-machine persistence, versioned import/export,
 * capability detection, and the device-disconnect state machine.
 *
 * Everything here works over MIDI-message-shaped data — no hardware,
 * no `navigator` — so the whole mapping layer is headless-testable.
 * The browser adapter (midi-browser.ts) is thin wiring over this
 * core; real-device behaviour is UNVERIFIED (see the POD-15 handoff).
 *
 * Pattern: learn/bind/persist behaviour follows the CurryCaster v1
 * MidiMapper/MidiWorker model (MIT pattern — THIRD_PARTY_NOTICES);
 * this is a clean TypeScript reimplementation on Web MIDI semantics.
 *
 * DISCONNECT IS A NON-EVENT: unplugging a device mid-session changes
 * nothing audible. The tracker tolerates hot-unplug and statechange
 * for unknown devices, and messages arriving from a disconnected
 * device are dropped — never dispatched, never thrown.
 */

import type { PrefsStorage } from '../capture/devices'
import { FADER_MAX_DB, FADER_MIN_DB } from '../players/player-engine'
import { getStudioAction, type StudioActionPayload } from './action-map'

// ---------------------------------------------------------------------------
// Message parsing (pure functions over byte arrays)
// ---------------------------------------------------------------------------

export type MidiMessageType = 'note-on' | 'note-off' | 'control-change' | 'unsupported'

export type MidiMessage = {
  type: MidiMessageType
  /** 1–16. */
  channel: number
  /** Note number (note-*) or controller number (control-change). */
  data1: number
  /** Velocity (note-*) or controller value (control-change), 0–127. */
  data2: number
  status: number
  raw: number[]
}

/**
 * Parses a raw MIDI byte array. Note-on with velocity 0 IS note-off
 * (the running convention). Short/garbled input parses to
 * 'unsupported' with whatever could be read — parsing never throws.
 */
export function parseMidiMessage(bytes: Uint8Array | readonly number[]): MidiMessage {
  const raw = Array.from(bytes as Iterable<number>)
  const status = raw[0] ?? 0
  const kind = status & 0xf0
  const channel = (status & 0x0f) + 1
  const data1 = raw[1] ?? 0
  const data2 = raw[2] ?? 0
  let type: MidiMessageType = 'unsupported'
  if (kind === 0x90) type = data2 === 0 ? 'note-off' : 'note-on'
  else if (kind === 0x80) type = 'note-off'
  else if (kind === 0xb0) type = 'control-change'
  return { type, channel, data1, data2, status, raw }
}

/** Stable control identity: `cc:ch1:7` / `note:ch1:60`. */
export function midiControlId(
  message: Pick<MidiMessage, 'type' | 'channel' | 'data1'>,
): string | null {
  if (message.type === 'control-change') return `cc:ch${message.channel}:${message.data1}`
  if (message.type === 'note-on' || message.type === 'note-off')
    return `note:ch${message.channel}:${message.data1}`
  return null
}

export const isValidControlId = (controlId: string): boolean =>
  /^(cc|note):ch([1-9]|1[0-6]):\d{1,3}$/.test(controlId)

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

/** CC 0–127 → dB, linear across the strip fader range (−60…+6 dB by default). */
export const scaleCcToDb = (
  value: number,
  minDb: number = FADER_MIN_DB,
  maxDb: number = FADER_MAX_DB,
): number => minDb + (Math.min(127, Math.max(0, value)) / 127) * (maxDb - minDb)

export const scaleCcToNormalized = (value: number): number =>
  Math.min(127, Math.max(0, value)) / 127

// ---------------------------------------------------------------------------
// Binding model + map
// ---------------------------------------------------------------------------

export type MidiBindingMode = 'absolute' | 'relative' | 'toggle' | 'momentary'

export type MidiBinding = {
  controlId: string
  actionId: string
  mode: MidiBindingMode
  /** Fader range for absolute mode (defaults: the strip fader range). */
  minDb?: number
  maxDb?: number
}

export type MidiMap = {
  version: 1
  bindings: MidiBinding[]
  updatedAt: string
}

export const emptyMidiMap = (): MidiMap => ({ version: 1, bindings: [], updatedAt: '' })

export const findMidiBinding = (map: MidiMap, controlId: string): MidiBinding | null =>
  map.bindings.find((binding) => binding.controlId === controlId) ?? null

/** Default mode for an action: continuous → absolute, momentary → momentary, toggle → toggle, else toggle (a pad press fires it). */
export const defaultMidiModeForAction = (actionId: string): MidiBindingMode => {
  const action = getStudioAction(actionId)
  if (!action) return 'toggle'
  if (action.valueKind === 'continuous') return 'absolute'
  if (action.valueKind === 'momentary') return 'momentary'
  return 'toggle'
}

// ---------------------------------------------------------------------------
// Learn mode (state machine: idle → armed → next message binds)
// ---------------------------------------------------------------------------

export type LearnState =
  | { phase: 'idle' }
  | { phase: 'armed'; actionId: string; mode: MidiBindingMode }

export type LearnResult =
  | { ok: true; binding: MidiBinding; map: MidiMap; replacedActionId?: string }
  | { ok: false; reason: 'not-armed' | 'unsupported-message' | 'unknown-action' }

export class MidiLearnController {
  private state: LearnState = { phase: 'idle' }

  get learnState(): LearnState {
    return this.state
  }

  arm(actionId: string, mode?: MidiBindingMode): { ok: boolean; reason?: string } {
    if (!getStudioAction(actionId)) return { ok: false, reason: 'unknown-action' }
    this.state = { phase: 'armed', actionId, mode: mode ?? defaultMidiModeForAction(actionId) }
    return { ok: true }
  }

  cancel(): void {
    this.state = { phase: 'idle' }
  }

  /**
   * Feeds a message to the learn machine. When armed, the next
   * note/CC message binds its control to the armed action (one
   * control → one action: an existing binding for that control is
   * replaced and the replaced action is named in the result).
   * Unsupported messages (pitch bend, clock…) do not consume the arm.
   */
  handleMessage(map: MidiMap, message: MidiMessage): LearnResult {
    if (this.state.phase !== 'armed') return { ok: false, reason: 'not-armed' }
    const controlId = midiControlId(message)
    if (!controlId) return { ok: false, reason: 'unsupported-message' }
    const { actionId, mode } = this.state
    const existing = findMidiBinding(map, controlId)
    const binding: MidiBinding = { controlId, actionId, mode }
    const bindings = [...map.bindings.filter((entry) => entry.controlId !== controlId), binding]
    this.state = { phase: 'idle' }
    return {
      ok: true,
      binding,
      map: { version: 1, bindings, updatedAt: new Date().toISOString() },
      ...(existing && existing.actionId !== actionId
        ? { replacedActionId: existing.actionId }
        : {}),
    }
  }
}

// ---------------------------------------------------------------------------
// Routing — message + map → action payload (pure), plus a dispatch helper
// ---------------------------------------------------------------------------

export type MidiRouteResult = { actionId: string; payload: StudioActionPayload } | null

/**
 * Computes what a message should do under the map. Returns null for
 * unbound controls and for messages that carry no action (note-off
 * for a toggle binding, a relative CC centred at 64…).
 * - absolute: CC value scales to the binding's dB range.
 * - relative: CC value is a delta from centre 64 (endless encoders);
 *   the payload carries the raw step count in `value` — bind these to
 *   nudge-style actions, not absolute faders.
 * - toggle: note-on / CC ≥ 64 fires the action once.
 * - momentary: note-on/CC ≥ 64 = phase down, note-off/CC < 64 = up.
 */
export function routeMidiMessage(map: MidiMap, message: MidiMessage): MidiRouteResult {
  const controlId = midiControlId(message)
  if (!controlId) return null
  const binding = findMidiBinding(map, controlId)
  if (!binding) return null
  const base = { source: 'midi' as const, controlId }
  switch (binding.mode) {
    case 'absolute': {
      if (message.type !== 'control-change') return null
      return {
        actionId: binding.actionId,
        payload: {
          ...base,
          value: scaleCcToNormalized(message.data2),
          valueDb: scaleCcToDb(message.data2, binding.minDb, binding.maxDb),
        },
      }
    }
    case 'relative': {
      if (message.type !== 'control-change') return null
      const steps = message.data2 - 64
      if (steps === 0) return null
      return { actionId: binding.actionId, payload: { ...base, value: steps } }
    }
    case 'momentary': {
      const down =
        message.type === 'note-on' || (message.type === 'control-change' && message.data2 >= 64)
      const up =
        message.type === 'note-off' || (message.type === 'control-change' && message.data2 < 64)
      if (!down && !up) return null
      return { actionId: binding.actionId, payload: { ...base, phase: down ? 'down' : 'up' } }
    }
    case 'toggle':
    default: {
      const fires =
        message.type === 'note-on' || (message.type === 'control-change' && message.data2 >= 64)
      return fires ? { actionId: binding.actionId, payload: { ...base } } : null
    }
  }
}

// ---------------------------------------------------------------------------
// Device tracker — disconnect is a non-event
// ---------------------------------------------------------------------------

export type MidiDeviceState = { id: string; name: string; connected: boolean }

export class MidiDeviceTracker {
  private devices = new Map<string, MidiDeviceState>()

  connect(id: string, name = ''): MidiDeviceState {
    const device = { id, name, connected: true }
    this.devices.set(id, device)
    return device
  }

  /** Hot-unplug: marks the device disconnected. Unknown ids are a no-op success — never a throw. */
  disconnect(id: string): { ok: true } {
    const device = this.devices.get(id)
    if (device) device.connected = false
    return { ok: true }
  }

  isConnected(id: string): boolean {
    return this.devices.get(id)?.connected ?? false
  }

  list(): MidiDeviceState[] {
    return [...this.devices.values()]
  }

  /**
   * Routes a message from a device. A message from a disconnected
   * (or never-seen) device is dropped — no dispatch, no throw.
   */
  routeFromDevice(
    deviceId: string,
    map: MidiMap,
    bytes: Uint8Array | readonly number[],
  ): MidiRouteResult {
    if (!this.isConnected(deviceId)) return null
    return routeMidiMessage(map, parseMidiMessage(bytes))
  }
}

// ---------------------------------------------------------------------------
// Capability detection (progressive enhancement only)
// ---------------------------------------------------------------------------

export type MidiCapability = { supported: boolean; reason?: string }

/** Pure capability check over a navigator-shaped object. */
export function midiCapability(
  nav: { requestMIDIAccess?: unknown } | null | undefined,
): MidiCapability {
  if (!nav || typeof nav.requestMIDIAccess !== 'function') {
    return {
      supported: false,
      reason:
        'Web MIDI is not available in this browser (Safari and Firefox do not expose it by default). Keyboard and on-screen controls remain the full-control baseline.',
    }
  }
  return { supported: true }
}

// ---------------------------------------------------------------------------
// Persistence (per machine) + versioned import/export
// ---------------------------------------------------------------------------

export const midiMapKey = (scope = 'machine'): string => `podcast-studio:midi-map:${scope}`

export class MidiMapStore {
  constructor(
    private readonly storage: PrefsStorage,
    private readonly scope = 'machine',
  ) {}

  load(): MidiMap {
    const raw = this.storage.get(midiMapKey(this.scope))
    if (!raw) return emptyMidiMap()
    try {
      const parsed = JSON.parse(raw) as MidiMap
      if (parsed.version !== 1 || !Array.isArray(parsed.bindings)) return emptyMidiMap()
      return parsed
    } catch {
      return emptyMidiMap()
    }
  }

  save(map: MidiMap): MidiMap {
    const saved = { ...map, version: 1 as const, updatedAt: new Date().toISOString() }
    this.storage.set(midiMapKey(this.scope), JSON.stringify(saved))
    return saved
  }

  clear(): void {
    this.storage.remove(midiMapKey(this.scope))
  }
}

export const MIDI_MAP_FILE_KIND = 'renegade-podcast-midi-map'

export type MidiMapFile = { kind: typeof MIDI_MAP_FILE_KIND; version: 1; bindings: MidiBinding[] }

export function exportMidiMap(map: MidiMap): string {
  const file: MidiMapFile = { kind: MIDI_MAP_FILE_KIND, version: 1, bindings: map.bindings }
  return JSON.stringify(file, null, 2)
}

export type MidiImportResult = { ok: true; map: MidiMap } | { ok: false; error: string }

/**
 * Imports a mapping file. Validation is strict and named: wrong kind,
 * wrong version, malformed control ids and unknown action ids are
 * each refused — a bad file can never half-apply.
 */
export function importMidiMap(json: string): MidiImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'invalid-json' }
  }
  const file = parsed as Partial<MidiMapFile>
  if (file.kind !== MIDI_MAP_FILE_KIND) return { ok: false, error: 'wrong-kind' }
  if (file.version !== 1) return { ok: false, error: 'unsupported-version' }
  if (!Array.isArray(file.bindings)) return { ok: false, error: 'bindings-missing' }
  for (const binding of file.bindings as MidiBinding[]) {
    if (!binding || typeof binding.controlId !== 'string' || !isValidControlId(binding.controlId)) {
      return { ok: false, error: `invalid-control-id:${String(binding?.controlId)}` }
    }
    if (!getStudioAction(binding.actionId))
      return { ok: false, error: `unknown-action:${String(binding.actionId)}` }
    if (!['absolute', 'relative', 'toggle', 'momentary'].includes(binding.mode)) {
      return { ok: false, error: `invalid-mode:${String(binding.mode)}` }
    }
  }
  return {
    ok: true,
    map: {
      version: 1,
      bindings: file.bindings as MidiBinding[],
      updatedAt: new Date().toISOString(),
    },
  }
}
