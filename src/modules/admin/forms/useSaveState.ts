'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'

import {
  classifySaveFailure,
  initialSaveState,
  saveStateReducer,
  type SaveAck,
  type SaveState,
} from './save-state'

export type { SaveState } from './save-state'
export { SaveConflictError, saveHttpError } from './save-state'

export type SaveOutcome<T> = { ok: true; value: T } | { ok: false; state: SaveState }

/**
 * UXI-08 — thin React binding over the pure save-state machine.
 *
 * `save(fn)` runs `fn` (the surface's real server call) and:
 * - dispatches SAVE_START immediately (any previous `saved` is gone),
 * - dispatches SAVE_ACK only after `fn` resolves — so a consumer can
 *   never render "Saved" before the server has acknowledged,
 * - classifies a thrown failure as conflict (HTTP 409 / version
 *   conflict), offline (browser offline, checked before the attempt
 *   and again on failure), or a plain error. The caller's local work
 *   is never touched: failure states mean "not saved", never "lost".
 *
 * `fn` may return `{ version }` when the server reports the saved
 * record's version; it is kept as the last-acknowledged version.
 */
export function useSaveState(options?: { isOnline?: () => boolean }) {
  const [state, dispatch] = useReducer(saveStateReducer, initialSaveState)
  const inFlight = useRef(false)
  const isOnlineRef = useRef(options?.isOnline)
  isOnlineRef.current = options?.isOnline

  const isOnline = useCallback(() => {
    if (isOnlineRef.current) return isOnlineRef.current()
    return typeof navigator === 'undefined' || !('onLine' in navigator) ? true : navigator.onLine
  }, [])

  // A connection drop while a save result is on screen downgrades a
  // stale "saved" only when a new save is attempted; here we simply
  // re-render consumers on connectivity changes so indicators that
  // read `online` stay honest.
  const [, setOnlineTick] = useReducer((tick: number) => tick + 1, 0)
  useEffect(() => {
    const onChange = () => setOnlineTick()
    window.addEventListener('online', onChange)
    window.addEventListener('offline', onChange)
    return () => {
      window.removeEventListener('online', onChange)
      window.removeEventListener('offline', onChange)
    }
  }, [])

  const save = useCallback(
    async <T>(fn: () => Promise<T & SaveAck>): Promise<SaveOutcome<T>> => {
      if (inFlight.current) return { ok: false, state }
      dispatch({ type: 'SAVE_START', at: Date.now() })
      if (!isOnline()) {
        const offline: SaveState = {
          status: 'offline',
          message: 'You appear to be offline. Your work is still here — reconnect and try again.',
          attemptedAt: Date.now(),
        }
        // SAVE_OFFLINE is honoured only from `saving`, which SAVE_START
        // has just entered.
        dispatch({
          type: 'SAVE_OFFLINE',
          at: offline.attemptedAt,
          message: offline.message,
        })
        return { ok: false, state: offline }
      }
      inFlight.current = true
      try {
        const value = await fn()
        const version =
          typeof value === 'object' && value !== null && 'version' in value
            ? (value as { version?: string | number }).version
            : undefined
        dispatch({ type: 'SAVE_ACK', at: Date.now(), version })
        return { ok: true, value }
      } catch (cause) {
        const failure = classifySaveFailure(cause, { online: isOnline() })
        if (failure.kind === 'conflict') {
          dispatch({
            type: 'SAVE_CONFLICT',
            message: failure.message,
            serverVersion: failure.serverVersion,
          })
          return {
            ok: false,
            state: {
              status: 'conflict',
              message: failure.message,
              serverVersion: failure.serverVersion,
            },
          }
        }
        if (failure.kind === 'offline') {
          dispatch({ type: 'SAVE_OFFLINE', at: Date.now(), message: failure.message })
          return {
            ok: false,
            state: { status: 'offline', message: failure.message, attemptedAt: Date.now() },
          }
        }
        dispatch({ type: 'SAVE_ERROR', message: failure.message })
        return { ok: false, state: { status: 'error', message: failure.message, retryable: true } }
      } finally {
        inFlight.current = false
      }
    },
    // `state` is read only for the in-flight guard's return value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOnline],
  )

  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])

  return {
    state,
    save,
    reset,
    isSaving: state.status === 'saving',
    /** Server-acknowledged save time; null until the first ack — never a guess. */
    lastAcknowledgedAt: state.status === 'saved' ? state.acknowledgedAt : null,
    lastAcknowledgedVersion: state.status === 'saved' ? state.version : undefined,
  }
}
