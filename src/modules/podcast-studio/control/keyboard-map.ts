/**
 * POD-15 (POD-REQ-32) — Keyboard map (PURE CORE): chord normalization,
 * the focus-safety guard, binding resolution, conflict detection,
 * remapping, and per-participant persisted overrides.
 *
 * FOCUS-SAFETY POLICY (documented decision, per brief):
 * - Shortcuts NEVER fire while the operator is typing in a text
 *   input, textarea or contentEditable element, while a modal/dialog
 *   is open, or while focus sits on a native interactive control
 *   (button / select / link) where the key has its native meaning.
 * - The ONE exception is the safety class: `stop-all`
 *   (Shift+Escape) fires in EVERY focus state, including mid-typing
 *   and with a modal open. Halting audio must never be gated by where
 *   focus happens to be. No other action is safety-class.
 *
 * CONFLICT POLICY: two actions bound to the same chord in overlapping
 * contexts are a CONFLICT — surfaced in `detectConflicts` and refused
 * by `attemptRemap` (the first/existing binding is kept; nothing is
 * ever silently overridden).
 *
 * PERSISTENCE: overrides are per participant AND per machine — the
 * store key carries the participant id (POD-06 prefs pattern) over an
 * injected `PrefsStorage` (localStorage in the browser, a memory fake
 * in tests). Two participants on one machine never see each other's
 * map; one participant's map never leaks to another's.
 */

import type { PrefsStorage } from '../capture/devices'
import {
  contextsOverlap,
  getStudioAction,
  STUDIO_ACTIONS,
  type StudioActionBus,
  type StudioActionContext,
  type StudioActionDef,
  type StudioActionResult,
} from './action-map'

// ---------------------------------------------------------------------------
// Chord normalization
// ---------------------------------------------------------------------------

export type KeyboardEventLike = {
  key: string
  code?: string
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

/**
 * Normalizes a keyboard event to a chord string such as `KeyR`,
 * `Shift+KeyR`, `Ctrl+Digit1`, `Alt+ArrowUp`, `Shift+Escape`, `Space`.
 * Letter/digit chords use the physical `code` when available
 * (layout-independent). A modifier-only press returns null.
 */
export function chordFromKeyboardEvent(event: KeyboardEventLike): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  let base: string | null = null
  if (event.code && /^(Key[A-Z]|Digit[0-9])$/.test(event.code)) base = event.code
  else if (event.key === ' ') base = 'Space'
  else if (event.key === 'Spacebar') base = 'Space'
  else if (event.key.length === 1) {
    const upper = event.key.toUpperCase()
    if (/^[A-Z]$/.test(upper)) base = `Key${upper}`
    else if (/^[0-9]$/.test(event.key)) base = `Digit${event.key}`
    else if (event.key === '=') base = 'Equal'
    else if (event.key === '-') base = 'Minus'
    else base = event.key
  } else base = event.key
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey && base !== 'Shift') {
    // Shift is part of the chord except when the base key already
    // encodes it (e.g. '?' typed as a literal) — our bases never do,
    // except single punctuation literals, which keep the raw key.
    if (/^(Key|Digit|Arrow|Escape|Enter|Delete|Backspace|Space|Equal|Minus|F[0-9])/.test(base))
      parts.push('Shift')
    else if (event.shiftKey && base.length > 1) parts.push('Shift')
  }
  if (event.metaKey) parts.push('Meta')
  parts.push(base)
  return parts.join('+')
}

/** Human-readable chord label for the mapping UI (`Shift+Digit1` → `Shift+1`). */
export const chordLabel = (chord: string): string =>
  chord
    .replace(/Key([A-Z])/g, '$1')
    .replace(/Digit([0-9])/g, '$1')
    .replace('Space', 'Space')
    .replace('Arrow', '')

// ---------------------------------------------------------------------------
// Focus guard (pure function over event + focus context)
// ---------------------------------------------------------------------------

export type FocusContext = {
  isTextInput: boolean
  isTextarea: boolean
  isContentEditable: boolean
  modalOpen: boolean
  /** Focus is on a button/select/link — keys keep their native meaning. */
  isInteractiveControl: boolean
}

export const NEUTRAL_FOCUS: FocusContext = {
  isTextInput: false,
  isTextarea: false,
  isContentEditable: false,
  modalOpen: false,
  isInteractiveControl: false,
}

export type GuardDecision = {
  allowed: boolean
  reason?: 'typing' | 'modal-open' | 'interactive-control'
}

/**
 * The focus guard. Safety actions are always allowed; every other
 * action is suppressed while typing, while a modal is open, or on a
 * native interactive control.
 */
export function guardDecision(action: StudioActionDef, focus: FocusContext): GuardDecision {
  if (action.safety) return { allowed: true }
  if (focus.isTextInput || focus.isTextarea || focus.isContentEditable)
    return { allowed: false, reason: 'typing' }
  if (focus.modalOpen) return { allowed: false, reason: 'modal-open' }
  if (focus.isInteractiveControl) return { allowed: false, reason: 'interactive-control' }
  return { allowed: true }
}

export const shouldDispatch = (action: StudioActionDef, focus: FocusContext): boolean =>
  guardDecision(action, focus).allowed

// ---------------------------------------------------------------------------
// Binding resolution + conflict detection
// ---------------------------------------------------------------------------

export type KeyboardOverrides = {
  participantId: string
  /** actionId → chords. Replaces the action's defaults entirely; [] unbinds. */
  overrides: Record<string, string[]>
  updatedAt: string
}

export type ResolvedBinding = {
  actionId: string
  chord: string
  context: StudioActionContext
  source: 'default' | 'override'
}

export function resolveBindings(
  overrides: KeyboardOverrides | null,
  actions: readonly StudioActionDef[] = STUDIO_ACTIONS,
): ResolvedBinding[] {
  const bindings: ResolvedBinding[] = []
  for (const action of actions) {
    const overridden = overrides?.overrides[action.id]
    const chords = overridden ?? action.defaultChords
    const source = overridden ? 'override' : 'default'
    for (const chord of chords)
      bindings.push({ actionId: action.id, chord, context: action.context, source })
  }
  return bindings
}

export type BindingConflict = {
  chord: string
  actionIds: string[]
  contexts: StudioActionContext[]
  message: string
}

/**
 * Surfaces every chord claimed by two different actions in
 * overlapping contexts. Conflicts are DATA the UI lists — resolution
 * never happens silently here.
 */
export function detectConflicts(bindings: ResolvedBinding[]): BindingConflict[] {
  const conflicts: BindingConflict[] = []
  const seen = new Set<string>()
  for (let i = 0; i < bindings.length; i++) {
    for (let j = i + 1; j < bindings.length; j++) {
      const a = bindings[i]
      const b = bindings[j]
      if (a.actionId === b.actionId || a.chord !== b.chord) continue
      if (!contextsOverlap(a.context, b.context)) continue
      const actionIds = [a.actionId, b.actionId].sort()
      const key = `${a.chord}:${actionIds.join('|')}`
      if (seen.has(key)) continue
      seen.add(key)
      conflicts.push({
        chord: a.chord,
        actionIds,
        contexts: [a.context, b.context],
        message: `Chord ${chordLabel(a.chord)} is bound to both ${actionIds.join(' and ')} — the first binding wins; remap one of them.`,
      })
    }
  }
  return conflicts
}

export type RemapResult =
  | { ok: true; overrides: KeyboardOverrides }
  | {
      ok: false
      error: 'binding-conflict' | 'unknown-action'
      conflict?: BindingConflict
      message: string
    }

/**
 * Attempts to bind `actionId` to `chord` (replacing its current
 * chords). If another action already owns that chord in an
 * overlapping context, the remap is REFUSED, the conflict is named,
 * and the existing overrides are returned untouched — the first
 * binding is always kept.
 */
export function attemptRemap(
  current: KeyboardOverrides,
  actionId: string,
  chord: string,
  actions: readonly StudioActionDef[] = STUDIO_ACTIONS,
): RemapResult {
  const action = actions.find((entry) => entry.id === actionId) ?? getStudioAction(actionId)
  if (!action)
    return { ok: false, error: 'unknown-action', message: `No studio action named ${actionId}.` }
  const prospective: KeyboardOverrides = {
    ...current,
    overrides: { ...current.overrides, [actionId]: [chord] },
  }
  const conflicts = detectConflicts(resolveBindings(prospective, actions)).filter(
    (conflict) => conflict.actionIds.includes(actionId) && conflict.chord === chord,
  )
  if (conflicts.length > 0) {
    return {
      ok: false,
      error: 'binding-conflict',
      conflict: conflicts[0],
      message: conflicts[0].message,
    }
  }
  return { ok: true, overrides: prospective }
}

// ---------------------------------------------------------------------------
// Per-participant persistence (POD-06 prefs pattern)
// ---------------------------------------------------------------------------

export const keyboardPrefsKey = (participantId: string): string =>
  `podcast-studio:keyboard-prefs:${participantId}`

export const emptyKeyboardOverrides = (participantId: string): KeyboardOverrides => ({
  participantId,
  overrides: {},
  updatedAt: '',
})

export class KeyboardPrefsStore {
  constructor(private readonly storage: PrefsStorage) {}

  load(participantId: string): KeyboardOverrides {
    const raw = this.storage.get(keyboardPrefsKey(participantId))
    if (!raw) return emptyKeyboardOverrides(participantId)
    try {
      const parsed = JSON.parse(raw) as KeyboardOverrides
      if (parsed.participantId !== participantId || typeof parsed.overrides !== 'object') {
        return emptyKeyboardOverrides(participantId)
      }
      return parsed
    } catch {
      return emptyKeyboardOverrides(participantId)
    }
  }

  save(overrides: KeyboardOverrides): KeyboardOverrides {
    const saved = { ...overrides, updatedAt: new Date().toISOString() }
    this.storage.set(keyboardPrefsKey(overrides.participantId), JSON.stringify(saved))
    return saved
  }

  /** Remaps one action through the conflict gate; a conflict changes nothing in storage. */
  remap(participantId: string, actionId: string, chord: string): RemapResult {
    const result = attemptRemap(this.load(participantId), actionId, chord)
    if (!result.ok) return result
    return { ok: true, overrides: this.save(result.overrides) }
  }

  unbind(participantId: string, actionId: string): KeyboardOverrides {
    const current = this.load(participantId)
    return this.save({ ...current, overrides: { ...current.overrides, [actionId]: [] } })
  }

  resetAction(participantId: string, actionId: string): KeyboardOverrides {
    const current = this.load(participantId)
    const overrides = { ...current.overrides }
    delete overrides[actionId]
    return this.save({ ...current, overrides })
  }

  resetAll(participantId: string): KeyboardOverrides {
    const cleared = emptyKeyboardOverrides(participantId)
    this.storage.remove(keyboardPrefsKey(participantId))
    return cleared
  }

  clear(participantId: string): void {
    this.storage.remove(keyboardPrefsKey(participantId))
  }
}

// ---------------------------------------------------------------------------
// Keyboard dispatch — chord + bindings + guard → bus
// ---------------------------------------------------------------------------

export type KeyboardDispatchResult =
  | StudioActionResult
  | {
      ok: false
      actionId?: string
      reason: 'no-binding' | 'typing' | 'modal-open' | 'interactive-control' | 'modifier-only'
    }

/**
 * Resolves a keyboard event against the bindings for the active
 * contexts, applies the focus guard, and dispatches through the bus.
 * Momentary actions dispatch phase 'down' on keydown and 'up' on
 * keyup (pass `phase`); key repeat of a held momentary key is a no-op
 * success so holding talkback does not retrigger.
 */
export function dispatchKeyboardEvent(
  bus: StudioActionBus,
  bindings: ResolvedBinding[],
  event: KeyboardEventLike & { repeat?: boolean },
  focus: FocusContext,
  options: { activeContexts: StudioActionContext[]; phase?: 'down' | 'up' },
): KeyboardDispatchResult {
  const chord = chordFromKeyboardEvent(event)
  if (!chord) return { ok: false, reason: 'modifier-only' }
  const candidates = bindings.filter(
    (binding) =>
      binding.chord === chord &&
      options.activeContexts.some((ctx) => contextsOverlap(ctx, binding.context)),
  )
  // First binding wins — conflicts are surfaced by detectConflicts,
  // never resolved by silently picking a later binding's action.
  const binding = candidates[0]
  if (!binding) return { ok: false, reason: 'no-binding' }
  const action = getStudioAction(binding.actionId)
  if (!action) return { ok: false, actionId: binding.actionId, reason: 'no-binding' }
  const guard = guardDecision(action, focus)
  if (!guard.allowed) return { ok: false, actionId: action.id, reason: guard.reason }
  if (event.repeat && action.valueKind !== 'momentary')
    return { ok: false, actionId: action.id, reason: 'no-binding' }
  return bus.dispatch(action.id, {
    source: 'keyboard',
    chord,
    phase: action.valueKind === 'momentary' ? (options.phase ?? 'down') : undefined,
  })
}
