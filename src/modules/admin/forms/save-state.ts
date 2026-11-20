/**
 * UXI-08 — the content-persistence contract as a pure state machine.
 *
 * States: idle / saving / saved / offline / conflict / error.
 *
 * The load-bearing invariant: `saved` is reachable ONLY through a
 * SAVE_ACK event, and SAVE_ACK is honoured only while a save is in
 * flight (`saving`). There is no event a consumer can dispatch to
 * claim a save the server has not acknowledged — the React hook
 * dispatches SAVE_ACK exclusively after the wrapped save function
 * resolves. Editing again (SAVE_START) always leaves `saved`.
 *
 * This module is deliberately React-free so the machine is unit
 * testable in the repo's node-environment unit suite.
 */

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving'; attempt: number; startedAt: number }
  | {
      status: 'saved'
      /** When the server acknowledged the save (ms epoch). */
      acknowledgedAt: number
      /** Server-reported version of the saved record, when it returns one. */
      version?: string | number
    }
  | { status: 'offline'; message: string; attemptedAt: number }
  | {
      status: 'conflict'
      message: string
      /** The server's current version, when it reports one. */
      serverVersion?: string | number
    }
  | { status: 'error'; message: string; retryable: boolean }

export type SaveEvent =
  | { type: 'SAVE_START'; at: number }
  | { type: 'SAVE_ACK'; at: number; version?: string | number }
  | { type: 'SAVE_OFFLINE'; at: number; message: string }
  | { type: 'SAVE_CONFLICT'; message: string; serverVersion?: string | number }
  | { type: 'SAVE_ERROR'; message: string; retryable?: boolean }
  | { type: 'RESET' }

export const initialSaveState: SaveState = { status: 'idle' }

export function saveStateReducer(state: SaveState, event: SaveEvent): SaveState {
  switch (event.type) {
    case 'SAVE_START':
      return {
        status: 'saving',
        attempt: state.status === 'saving' ? state.attempt + 1 : 1,
        startedAt: event.at,
      }
    case 'SAVE_ACK':
      // No ack, no "saved": an acknowledgment that arrives when no
      // save is in flight (stale, duplicated, or fabricated) is ignored.
      if (state.status !== 'saving') return state
      return { status: 'saved', acknowledgedAt: event.at, version: event.version }
    case 'SAVE_OFFLINE':
      if (state.status !== 'saving') return state
      return { status: 'offline', message: event.message, attemptedAt: event.at }
    case 'SAVE_CONFLICT':
      if (state.status !== 'saving') return state
      return { status: 'conflict', message: event.message, serverVersion: event.serverVersion }
    case 'SAVE_ERROR':
      if (state.status !== 'saving') return state
      return { status: 'error', message: event.message, retryable: event.retryable ?? true }
    case 'RESET':
      return initialSaveState
  }
}

/** What a save function returns when the server acknowledges the save. */
export type SaveAck = { version?: string | number } | void

/** Error a save function throws (or a helper builds) for an HTTP 409. */
export class SaveConflictError extends Error {
  readonly status = 409
  readonly serverVersion?: string | number
  constructor(message: string, serverVersion?: string | number) {
    super(message)
    this.name = 'SaveConflictError'
    this.serverVersion = serverVersion
  }
}

/** Build an Error carrying an HTTP status, for fetch-based save functions. */
export function saveHttpError(status: number, message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

export type SaveFailureKind = 'conflict' | 'offline' | 'error'

/**
 * Classify a thrown save failure. Conflict wins first (a 409 is a
 * definitive server answer, even if the connection then drops);
 * offline is next when the caller reports the browser offline or the
 * failure is a bare network TypeError while offline.
 */
export function classifySaveFailure(
  cause: unknown,
  options: { online: boolean },
): { kind: SaveFailureKind; message: string; serverVersion?: string | number } {
  const status =
    typeof cause === 'object' && cause !== null && 'status' in cause
      ? Number((cause as { status: unknown }).status)
      : undefined
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String((cause as { code: unknown }).code)
      : undefined
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'string'
        ? cause
        : 'The save did not complete.'
  if (status === 409 || code === 'VERSION_CONFLICT' || cause instanceof SaveConflictError) {
    return {
      kind: 'conflict',
      message,
      serverVersion:
        cause instanceof SaveConflictError
          ? cause.serverVersion
          : typeof cause === 'object' && cause !== null && 'serverVersion' in cause
            ? ((cause as { serverVersion?: string | number }).serverVersion as
                | string
                | number
                | undefined)
            : undefined,
    }
  }
  if (!options.online) {
    return {
      kind: 'offline',
      message: 'You appear to be offline. Your work is still here — reconnect and try again.',
    }
  }
  return { kind: 'error', message }
}
