/**
 * POD-15 (POD-REQ-32) — Keyboard browser adapter (THIN BROWSER ADAPTER).
 *
 * Mounts window keydown/keyup listeners and feeds them to the pure
 * core (`dispatchKeyboardEvent`): the focus context is derived from
 * the event target (tag name, contentEditable, an open dialog/modal
 * ancestor, native interactive controls) and everything else —
 * chords, guard, conflicts — lives in the tested core.
 *
 * UNVERIFIED in a real browser (no browser rig ran in POD-15); the
 * core it wires is unit-proven, and the keyboard-only show run is
 * proven at the action level in tests/unit/podcast-studio-control.test.ts.
 */

import type { StudioActionBus, StudioActionContext } from './action-map'
import {
  dispatchKeyboardEvent,
  NEUTRAL_FOCUS,
  type FocusContext,
  type ResolvedBinding,
} from './keyboard-map'

export function focusContextFromTarget(target: EventTarget | null): FocusContext {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return NEUTRAL_FOCUS
  const element = target as HTMLElement
  const tag = element.tagName
  return {
    isTextInput:
      tag === 'INPUT' &&
      !['checkbox', 'radio', 'range', 'button', 'submit'].includes(
        (element as HTMLInputElement).type,
      ),
    isTextarea: tag === 'TEXTAREA',
    isContentEditable: Boolean(element.isContentEditable),
    modalOpen: Boolean(element.closest?.('[role="dialog"], [aria-modal="true"], dialog[open]')),
    isInteractiveControl: ['BUTTON', 'SELECT', 'A'].includes(tag),
  }
}

export type KeyboardAttachment = { detach(): void }

/**
 * Attaches the studio keyboard handler. `getBindings` is read per
 * event so remapping in the settings panel takes effect immediately.
 * Returns a detach function for unmount.
 */
export function attachStudioKeyboard(input: {
  bus: StudioActionBus
  getBindings: () => ResolvedBinding[]
  activeContexts: StudioActionContext[]
  onDispatch?: (actionId: string) => void
}): KeyboardAttachment {
  if (typeof window === 'undefined') return { detach: () => {} }
  const handle = (phase: 'down' | 'up') => (event: KeyboardEvent) => {
    const result = dispatchKeyboardEvent(
      input.bus,
      input.getBindings(),
      event,
      focusContextFromTarget(event.target),
      { activeContexts: input.activeContexts, phase },
    )
    if (result.ok && 'actionId' in result) {
      event.preventDefault()
      input.onDispatch?.(result.actionId)
    }
  }
  const onKeyDown = handle('down')
  const onKeyUp = handle('up')
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  return {
    detach: () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

/** localStorage-backed PrefsStorage for the browser (tests use the memory fake from POD-06). */
export function createLocalStoragePrefsStorage(): import('../capture/devices').PrefsStorage {
  return {
    get: (key) => {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    },
    set: (key, value) => {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // Storage full/blocked: bindings fall back to defaults for the session.
      }
    },
    remove: (key) => {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // no-op
      }
    },
  }
}
