/**
 * POD-09 — Recording session state + guards (PURE CORE over the POD-05
 * session document).
 *
 * The on-air recording state lives INSIDE the POD-05 session document
 * as the preserved extension field `recordingState` (the POD-00 parser
 * keeps unknown fields verbatim — the POD-08 played-clip-log pattern),
 * so a saved session carries its recording health, markers and
 * played-clip log into POD-12 exactly as the desk left them.
 *
 * Rules owned here:
 * - Live markers: `addMarker` follows the spec's name-prompt model —
 *   the operator is offered a name; pressing Esc (modelled as a null
 *   prompt result) keeps the auto number ("Marker 3"). Markers land
 *   BOTH in the recording state and in the session's POD-00 `markers`
 *   list, so every existing consumer sees them.
 * - Played-clip log ingestion: the POD-08 log is snapshotted into the
 *   recording state at stop/finalize time (POD-12 consumes it from the
 *   recording record the finalizer writes).
 * - Confirm-stop guard: while recording, a stop request without an
 *   explicit confirmation is REFUSED (nothing changes).
 * - Close-while-recording guard: an API-level refusal object — closing
 *   a session document that is still recording is never a silent save.
 * - Quota/disk monitor: hours-remaining is computed from a storage
 *   quota probe VALUE (the browser adapter supplies
 *   `navigator.storage.estimate()`; the core takes the number). Below
 *   the warn threshold the state flags `warn`; at exhaustion the stop
 *   is GRACEFUL — status `stopped-quota`, everything journalled stays
 *   journalled, and the session log says why. Never silent truncation.
 * - MIXER-mode rule: when the desk mode is MIXER, the external desk
 *   owns the microphone, so the host ISO track is silent BY DESIGN.
 *   The state surfaces `isoSilentByDesign: true` plus a UI-facing
 *   explanation string — a silent ISO in MIXER mode is expected, never
 *   a surprise failure.
 */

import type { DeskMode } from '../mixer/device-roles'
import { getPlayedClipLog, type PlayedClipLogEntry } from '../players/played-log'
import { postMessage, setSessionState, type StudioSessionDoc } from '../session-engine'
import type { TrackHealth } from './multitrack'

export type RecordingStatus = 'idle' | 'recording' | 'stopped' | 'stopped-quota'

export type RecordingMarker = {
  /** Auto number, kept when the name prompt is Esc'd: "Marker 3". */
  number: number
  name: string
  atElapsedSec: number
  /** Session-clock sample of the marker (POD-12 chapter alignment). */
  atSample: number
}

export type RecordingQuota = {
  /** Hours of recording the probed free space buys at the current byte rate. */
  hoursRemaining: number | null
  warn: boolean
  exhausted: boolean
}

export type RecordingState = {
  status: RecordingStatus
  startedAtElapsedSec: number | null
  elapsedSec: number
  markers: RecordingMarker[]
  playedClipLog: PlayedClipLogEntry[]
  trackHealth: TrackHealth[]
  /** MIXER mode: host ISO silence is by design (see header). */
  isoSilentByDesign: boolean
  isoSilentExplanation: string | null
  quota: RecordingQuota
}

export type SessionDocWithRecording = StudioSessionDoc & { recordingState?: RecordingState }

export const MIXER_ISO_SILENT_EXPLANATION =
  'Host ISO is silent by design in MIXER mode: the external mixer owns the microphone, so the host voice reaches this recording through the program mix only. There is no separate host ISO to recover — this is expected, not a failure.'

const cloneDoc = (session: StudioSessionDoc): SessionDocWithRecording =>
  JSON.parse(JSON.stringify(session)) as SessionDocWithRecording

export const getRecordingState = (session: StudioSessionDoc): RecordingState | null =>
  (session as SessionDocWithRecording).recordingState ?? null

const emptyQuota = (): RecordingQuota => ({ hoursRemaining: null, warn: false, exhausted: false })

/**
 * Computes hours-remaining from a quota probe value. `quotaBytes` is
 * the adapter-supplied free-space estimate; `bytesPerSecond` is the
 * multitrack byte rate (tracks × channels × 2 bytes × sample rate).
 */
export const evaluateRecordingQuota = (input: {
  quotaBytes: number | null
  bytesPerSecond: number
  warnBelowHours?: number
}): RecordingQuota => {
  if (input.quotaBytes === null || !(input.bytesPerSecond > 0))
    return { hoursRemaining: null, warn: false, exhausted: false }
  const hoursRemaining = input.quotaBytes / input.bytesPerSecond / 3600
  return {
    hoursRemaining,
    warn: hoursRemaining < (input.warnBelowHours ?? 1),
    exhausted: input.quotaBytes <= 0,
  }
}

/** Total byte rate of a track set at a sample rate (s16 PCM). */
export const multitrackBytesPerSecond = (
  tracks: Array<{ channels: number }>,
  sampleRate: number,
): number => tracks.reduce((sum, track) => sum + track.channels * 2 * sampleRate, 0)

/** Opens the recording state on a session document (desk state → recording). */
export function startRecordingState(
  session: StudioSessionDoc,
  input: { deskMode: DeskMode; quota?: RecordingQuota; atSampleRate?: number },
): SessionDocWithRecording {
  const next = cloneDoc(session)
  const mixer = input.deskMode === 'mixer'
  next.recordingState = {
    status: 'recording',
    startedAtElapsedSec: next.elapsedSec,
    elapsedSec: 0,
    markers: [],
    playedClipLog: [],
    trackHealth: [],
    isoSilentByDesign: mixer,
    isoSilentExplanation: mixer ? MIXER_ISO_SILENT_EXPLANATION : null,
    quota: input.quota ?? emptyQuota(),
  }
  const started = setSessionState(next, 'recording')
  return postMessage(
    started,
    mixer
      ? `Recording started (MIXER mode). ${MIXER_ISO_SILENT_EXPLANATION}`
      : 'Recording started.',
    'info',
  ) as SessionDocWithRecording
}

/** Refreshes the on-air snapshot (elapsed, per-track health, quota) the on-air bar renders. */
export function updateRecordingHealth(
  session: StudioSessionDoc,
  input: { elapsedSec: number; trackHealth: TrackHealth[]; quota?: RecordingQuota },
): SessionDocWithRecording {
  const next = cloneDoc(session)
  const state = next.recordingState
  if (!state) return next
  state.elapsedSec = input.elapsedSec
  state.trackHealth = JSON.parse(JSON.stringify(input.trackHealth)) as TrackHealth[]
  if (input.quota) state.quota = input.quota
  return next
}

/**
 * Adds a live marker. `promptResult` models the name prompt: a string
 * is the typed name; `null` is Esc — the auto number is kept. An empty
 * or whitespace-only name also falls back to the auto number (an
 * unnamed marker is still a marker).
 */
export function addMarker(
  session: StudioSessionDoc,
  input: { promptResult: string | null; atElapsedSec?: number; sampleRate?: number },
): { session: SessionDocWithRecording; marker: RecordingMarker } {
  const next = cloneDoc(session)
  const state = next.recordingState
  if (!state) throw new Error('Cannot add a marker: this session is not recording.')
  const atElapsedSec = input.atElapsedSec ?? next.elapsedSec
  const number = state.markers.length + 1
  const typed = input.promptResult?.trim() ?? ''
  const marker: RecordingMarker = {
    number,
    name: typed.length > 0 ? typed : `Marker ${number}`,
    atElapsedSec,
    atSample: Math.round(atElapsedSec * (input.sampleRate ?? 48_000)),
  }
  state.markers.push(marker)
  next.markers = [
    ...(next.markers ?? []),
    { startTime: atElapsedSec, title: marker.name, type: 'recording-marker' },
  ]
  next.log.push({
    type: 'recording-marker',
    level: 'info',
    atElapsedSec,
    markerNumber: marker.number,
    markerName: marker.name,
  })
  return { session: next, marker }
}

/** Snapshots the POD-08 played-clip log into the recording state (POD-12's source). */
export function ingestPlayedClipLog(session: StudioSessionDoc): SessionDocWithRecording {
  const next = cloneDoc(session)
  const state = next.recordingState
  if (state) state.playedClipLog = getPlayedClipLog(next)
  return next
}

export type StopRequestResult =
  | { ok: true; session: SessionDocWithRecording }
  | { ok: false; session: SessionDocWithRecording; code: 'confirm-required' | 'not-recording' }

/**
 * The confirm-stop guard: while recording, stop requires an explicit
 * confirmation. An unconfirmed request changes NOTHING and reports
 * `confirm-required` so the UI can ask.
 */
export function requestStopRecording(
  session: StudioSessionDoc,
  input: { confirmed: boolean },
): StopRequestResult {
  const next = cloneDoc(session)
  const state = next.recordingState
  if (!state || state.status !== 'recording')
    return { ok: false, session: next, code: 'not-recording' }
  if (!input.confirmed) return { ok: false, session: next, code: 'confirm-required' }
  state.status = 'stopped'
  state.playedClipLog = getPlayedClipLog(next)
  const stopped = setSessionState(next, 'stopped')
  return {
    ok: true,
    session: postMessage(stopped, 'Recording stopped.', 'info') as SessionDocWithRecording,
  }
}

/**
 * The quota stop: graceful, never a truncation. The recording state
 * flips to `stopped-quota`, the played-clip log is snapshotted, and
 * the session log records the exhaustion — everything already
 * journalled remains exactly as journalled for the finalizer.
 */
export function applyQuotaExhaustion(session: StudioSessionDoc): SessionDocWithRecording {
  const next = cloneDoc(session)
  const state = next.recordingState
  if (!state || state.status !== 'recording') return next
  state.status = 'stopped-quota'
  state.quota = { ...state.quota, exhausted: true }
  state.playedClipLog = getPlayedClipLog(next)
  const stopped = setSessionState(next, 'stopped')
  return postMessage(
    stopped,
    'Recording stopped: storage quota exhausted. Everything recorded so far is intact and will finalize as-is — nothing was truncated silently.',
    'error',
  ) as SessionDocWithRecording
}

export type CloseGuardResult = { ok: true } | { ok: false; code: 'recording-in-progress' }

/**
 * The close-while-recording guard (API-level refusal): a session that
 * is still recording cannot be closed/archived out from under the
 * recorder.
 */
export const guardCloseWhileRecording = (session: StudioSessionDoc): CloseGuardResult => {
  const state = getRecordingState(session)
  if (state?.status === 'recording' || session.state === 'recording')
    return { ok: false, code: 'recording-in-progress' }
  return { ok: true }
}
