/**
 * POD-09 — Track assembly + finalize engine (PURE CORE).
 *
 * Turns per-track chunk sets (from POD-06 journals, an upload-bridge
 * blob, or a local chunk directory — the loaders in finalize.ts produce
 * the inputs) into the finalized recording:
 *
 * - Every track is placed on the ONE session sample clock: chunk
 *   positions come from the journal's startSample records plus the
 *   track's join offset. Tracks are padded/trimmed to exactly the
 *   session length — alignment is by position, never by concatenation
 *   order alone.
 * - Gaps are SILENCE WITH A RECORD: any timeline range no chunk covers
 *   (late join, missing chunk, corrupt chunk, short track) is emitted
 *   as silence plus an explicit gap record naming the range and the
 *   reason. Audio is NEVER shifted to close a hole.
 * - Drift (PT-F method, drift.ts): when a track carries head+tail sync
 *   points whose track-clock span disagrees with the timeline span, the
 *   rate correction is estimated, the audio is resampled by the
 *   correction factor, chunk boundaries are remapped, and the measured
 *   residual (worst sync-point miss after correction) is recorded.
 *   Local tracks share the session clock, so their span agreement is
 *   exact and no correction is applied — the same code path proves it.
 * - A corrupt chunk flags ITS track only: the corrupt range becomes a
 *   gap, the track is marked degraded with a visible error, and every
 *   other track assembles untouched.
 * - Output per track: a WAV file in the POD-00 working format (48 kHz
 *   PCM s16) + its SHA-256. Assembly is a pure function of its inputs,
 *   so an interrupted finalize re-run produces byte-identical output —
 *   that determinism IS the resume mechanism (finalize.ts).
 *
 * The manifest conforms to the POD-00 TrackManifest contract
 * (parse-validated before it is returned); per-track gap / drift /
 * degradation detail rides as extension fields the parser preserves.
 */

import { sha256Hex } from '../capture/journal'
import {
  parseTrackManifest,
  type StudioTrackRole,
  type TrackManifest,
  type TrackSyncEvent,
} from '../contracts/track-manifest'
import {
  correctPosition,
  estimateRateCorrection,
  measureResiduals,
  resampleLinear,
  type SyncPoint,
} from './drift'

export type AssemblyChunk = {
  /** First frame of this chunk on the TRACK's own sample clock. */
  startSample: number
  /** Interleaved PCM (frames × channels). */
  pcm: Float32Array
  /** Observed position of this chunk's start on the session timeline, when known (drift residual measurement). */
  timelineStartSample?: number
  /** True when the storage layer's checksum verification failed for this chunk. */
  corrupt?: boolean
}

export type AssemblyGap = {
  /** Timeline range [fromSample, toSample) rendered as silence. */
  fromSample: number
  toSample: number
  frames: number
  reason: 'late-join' | 'missing-chunk' | 'corrupt-chunk' | 'explicit' | 'track-short'
}

export type TrackDriftReport = {
  rateCorrectionPpm: number
  resampleFactor: number
  /** Worst sync-point miss after correction (PT-F residual). */
  maxResidualSamples: number
  maxResidualMs: number
  corrected: boolean
}

export type TrackAssemblyInput = {
  trackId: string
  role: StudioTrackRole
  guestId?: string
  channels: number
  channelLayout?: string
  /** Session-clock sample at which this track's sample 0 sits. */
  joinedAtSample: number
  chunks: AssemblyChunk[]
  /** Head/tail sync points (track clock ↔ timeline); head is required for drift estimation. */
  syncEvents?: TrackSyncEvent[]
  /** Explicit gaps recorded during the session (track-local ranges). */
  explicitGaps?: Array<{ fromSample: number; frames: number }>
}

export type AssembledTrack = {
  trackId: string
  role: StudioTrackRole
  guestId?: string
  channels: number
  channelLayout: string
  /** Exactly `sessionFrames` frames of interleaved PCM. */
  pcm: Float32Array
  frames: number
  gaps: AssemblyGap[]
  drift: TrackDriftReport
  degraded: boolean
  errors: string[]
  syncEvents: TrackSyncEvent[]
}

/** Drift at or below this magnitude is clock agreement, not drift — no resample. */
export const DRIFT_CORRECTION_THRESHOLD_PPM = 0.5

const layoutFor = (channels: number): string => (channels === 2 ? 'stereo' : 'mono')

/**
 * Assembles ONE track onto the session timeline of `sessionFrames`
 * frames. Pure and deterministic.
 */
export const assembleTrack = (
  input: TrackAssemblyInput,
  sessionFrames: number,
  sampleRate: number,
): AssembledTrack => {
  const channels = input.channels
  const out = new Float32Array(sessionFrames * channels)
  const errors: string[] = []
  let degraded = false

  // --- Drift estimation (PT-F two-point method over head+tail sync) ---
  const head = input.syncEvents?.find((event) => event.type === 'head')
  const tail = input.syncEvents?.find((event) => event.type === 'tail')
  let drift: TrackDriftReport = {
    rateCorrectionPpm: 0,
    resampleFactor: 1,
    maxResidualSamples: 0,
    maxResidualMs: 0,
    corrected: false,
  }
  let correction = {
    resampleFactor: 1,
    rateCorrectionPpm: 0,
    headOffsetSamples: input.joinedAtSample,
  }
  if (head && tail) {
    correction = estimateRateCorrection(
      { trackSamples: head.trackSamples, timelineSamples: head.timelineSamples },
      { trackSamples: tail.trackSamples, timelineSamples: tail.timelineSamples },
    )
    const points: SyncPoint[] = [
      { trackSamples: head.trackSamples, timelineSamples: head.timelineSamples },
      ...input.chunks
        .filter((chunk) => chunk.timelineStartSample !== undefined)
        .map((chunk) => ({
          trackSamples: chunk.startSample,
          timelineSamples: chunk.timelineStartSample!,
        })),
      { trackSamples: tail.trackSamples, timelineSamples: tail.timelineSamples },
    ]
    const residuals = measureResiduals(correction, points, sampleRate)
    drift = {
      rateCorrectionPpm: correction.rateCorrectionPpm,
      resampleFactor: correction.resampleFactor,
      maxResidualSamples: residuals.maxAbsResidualSamples,
      maxResidualMs: residuals.maxAbsResidualMs,
      corrected: Math.abs(correction.rateCorrectionPpm) > DRIFT_CORRECTION_THRESHOLD_PPM,
    }
  }

  // --- Placement -------------------------------------------------------
  // Chunks are first laid out on the TRACK's own clock (contiguous
  // buffer; holes stay silent), then the WHOLE track buffer is
  // resampled by the correction factor when drift was measured —
  // resampling chunk-by-chunk would lose the accumulated fraction at
  // every boundary and re-introduce the drift it corrects.
  const sorted = [...input.chunks].sort((a, b) => a.startSample - b.startSample)
  const trackSpan = sorted.reduce(
    (max, chunk) => Math.max(max, chunk.startSample + chunk.pcm.length / channels),
    0,
  )
  const trackBuffer = new Float32Array(trackSpan * channels)
  const coveredTrack: Array<{ from: number; to: number }> = []
  const corruptRanges: Array<{ from: number; to: number }> = []
  for (const chunk of sorted) {
    const frames = chunk.pcm.length / channels
    if (!Number.isInteger(frames) || frames < 0) {
      degraded = true
      errors.push(
        `Track ${input.trackId}: chunk at track sample ${chunk.startSample} has a malformed PCM length (${chunk.pcm.length} samples for ${channels} channels) and was dropped.`,
      )
      continue
    }
    if (chunk.corrupt) {
      degraded = true
      errors.push(
        `Track ${input.trackId}: chunk at track sample ${chunk.startSample} failed checksum verification; its ${frames} frames are a recorded gap, not audio.`,
      )
      corruptRanges.push({ from: chunk.startSample, to: chunk.startSample + frames })
      continue
    }
    trackBuffer.set(chunk.pcm, chunk.startSample * channels)
    coveredTrack.push({ from: chunk.startSample, to: chunk.startSample + frames })
  }

  const mapPosition = (trackSamples: number): number =>
    drift.corrected
      ? Math.round(correctPosition(correction, trackSamples))
      : input.joinedAtSample + trackSamples
  const correctedBuffer = drift.corrected
    ? resampleLinear(trackBuffer, channels, correction.resampleFactor)
    : trackBuffer
  const correctedFrames = correctedBuffer.length / channels
  const timelineStart = mapPosition(0)
  const writeFrom = Math.max(0, timelineStart)
  const writeTo = Math.min(sessionFrames, timelineStart + correctedFrames)
  if (writeTo > writeFrom) {
    const sourceOffset = (writeFrom - timelineStart) * channels
    out.set(
      correctedBuffer.subarray(sourceOffset, sourceOffset + (writeTo - writeFrom) * channels),
      writeFrom * channels,
    )
  }

  // --- Gap accounting: every uncovered range is named ------------------
  const gaps: AssemblyGap[] = []
  const pushGap = (from: number, to: number, reason: AssemblyGap['reason']) => {
    const clampedFrom = Math.max(0, Math.min(sessionFrames, from))
    const clampedTo = Math.max(0, Math.min(sessionFrames, to))
    if (clampedTo > clampedFrom)
      gaps.push({
        fromSample: clampedFrom,
        toSample: clampedTo,
        frames: clampedTo - clampedFrom,
        reason,
      })
  }
  // Leading silence before the track joins / starts.
  if (timelineStart > 0)
    pushGap(0, timelineStart, input.joinedAtSample > 0 ? 'late-join' : 'missing-chunk')
  // Holes on the track clock (missing chunks), mapped to the timeline.
  coveredTrack.sort((a, b) => a.from - b.from)
  let cursor = 0
  for (const range of coveredTrack) {
    if (range.from > cursor) pushGap(mapPosition(cursor), mapPosition(range.from), 'missing-chunk')
    cursor = Math.max(cursor, range.to)
  }
  // Corrupt ranges keep their own reason (they are also holes above,
  // recorded once here instead — dedupe by dropping the overlapping
  // 'missing-chunk' entries below).
  for (const range of corruptRanges)
    pushGap(mapPosition(range.from), mapPosition(range.to), 'corrupt-chunk')
  for (let i = gaps.length - 1; i >= 0; i--) {
    const gap = gaps[i]!
    if (
      gap.reason === 'missing-chunk' &&
      corruptRanges.some(
        (range) => gap.fromSample < mapPosition(range.to) && gap.toSample > mapPosition(range.from),
      )
    )
      gaps.splice(i, 1)
  }
  // Trailing silence: the track ended before the session did.
  const timelineEnd = timelineStart + correctedFrames
  if (timelineEnd < sessionFrames)
    pushGap(
      timelineEnd,
      sessionFrames,
      coveredTrack.length === 0 && timelineStart === 0 && input.joinedAtSample > 0
        ? 'late-join'
        : 'track-short',
    )
  // Explicit gaps recorded live (their silence is already in the audio;
  // the record is what matters) are surfaced with their own reason.
  for (const explicit of input.explicitGaps ?? []) {
    const fromSample = input.joinedAtSample + explicit.fromSample
    gaps.push({
      fromSample,
      toSample: fromSample + explicit.frames,
      frames: explicit.frames,
      reason: 'explicit',
    })
  }
  gaps.sort((a, b) => a.fromSample - b.fromSample)

  const syncEvents: TrackSyncEvent[] =
    input.syncEvents && input.syncEvents.length > 0
      ? input.syncEvents
      : [
          { type: 'head', trackSamples: 0, timelineSamples: input.joinedAtSample },
          {
            type: 'tail',
            trackSamples: sorted.reduce(
              (max, chunk) => Math.max(max, chunk.startSample + chunk.pcm.length / channels),
              0,
            ),
            timelineSamples: sessionFrames,
          },
        ]

  return {
    trackId: input.trackId,
    role: input.role,
    ...(input.guestId ? { guestId: input.guestId } : {}),
    channels,
    channelLayout: input.channelLayout ?? layoutFor(channels),
    pcm: out,
    frames: sessionFrames,
    gaps,
    drift,
    degraded,
    errors,
    syncEvents,
  }
}

// ---------------------------------------------------------------------------
// WAV encoding (POD-00 working format: WAV PCM s16, 48 kHz)
// ---------------------------------------------------------------------------

export const encodeWavPcm16 = (
  pcm: Float32Array,
  channels: number,
  sampleRate: number,
): Uint8Array => {
  const dataBytes = pcm.length * 2
  const out = new Uint8Array(44 + dataBytes)
  const view = new DataView(out.buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataBytes, true)
  for (let i = 0; i < pcm.length; i++) {
    const clamped = Math.max(-1, Math.min(1, pcm[i] ?? 0))
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true)
  }
  return out
}

/** Reads back the frame count + channel count a WAV header declares. */
export const wavInfo = (
  bytes: Uint8Array,
): { frames: number; channels: number; sampleRate: number } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const channels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const dataBytes = view.getUint32(40, true)
  return { frames: dataBytes / (channels * 2), channels, sampleRate }
}

// ---------------------------------------------------------------------------
// Whole-session finalize (pure): assembled tracks + validated manifest
// ---------------------------------------------------------------------------

export type FinalizedTrack = AssembledTrack & {
  wavBytes: Uint8Array
  checksumSha256: string
}

export type FinalizeResult = {
  sessionId: string
  sampleRate: number
  sessionFrames: number
  durationSec: number
  tracks: FinalizedTrack[]
  /** POD-00 TrackManifest + per-track extension fields (gaps/drift/errors). */
  manifest: TrackManifest & {
    tracks: Array<
      TrackManifest['tracks'][number] & {
        gaps: AssemblyGap[]
        drift: TrackDriftReport
        degraded: boolean
        errors: string[]
      }
    >
  }
  degraded: boolean
  errors: string[]
}

/**
 * Assembles every track to the common session length and builds the
 * POD-00 track manifest. `sessionFrames` defaults to the longest
 * track's timeline end (join offset + corrected span).
 */
export const finalizeAssembly = (input: {
  sessionId: string
  sampleRate: number
  tracks: TrackAssemblyInput[]
  sessionFrames?: number
  createdAt?: string
}): FinalizeResult => {
  const sampleRate = input.sampleRate
  let sessionFrames = input.sessionFrames ?? 0
  if (sessionFrames <= 0) {
    for (const track of input.tracks) {
      const span = track.chunks.reduce(
        (max, chunk) => Math.max(max, chunk.startSample + chunk.pcm.length / track.channels),
        0,
      )
      sessionFrames = Math.max(sessionFrames, track.joinedAtSample + span)
    }
  }

  const assembled = input.tracks.map((track) => assembleTrack(track, sessionFrames, sampleRate))
  const tracks: FinalizedTrack[] = assembled.map((track) => {
    const wavBytes = encodeWavPcm16(track.pcm, track.channels, sampleRate)
    return { ...track, wavBytes, checksumSha256: sha256Hex(wavBytes) }
  })

  const manifest = {
    version: 1 as const,
    sessionId: input.sessionId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    sampleRate,
    tracks: tracks.map((track) => ({
      trackId: track.trackId,
      role: track.role,
      ...(track.guestId ? { guestId: track.guestId } : {}),
      channels: track.channels,
      channelLayout: track.channelLayout,
      durationSec: track.frames / sampleRate,
      checksumSha256: track.checksumSha256,
      syncEvents: track.syncEvents,
      ...(track.drift.corrected ? { rateCorrectionPpm: track.drift.rateCorrectionPpm } : {}),
      gaps: track.gaps,
      drift: track.drift,
      degraded: track.degraded,
      errors: track.errors,
    })),
  }
  // The POD-00 contract gate: the manifest must parse before it leaves.
  parseTrackManifest(manifest)

  return {
    sessionId: input.sessionId,
    sampleRate,
    sessionFrames,
    durationSec: sessionFrames / sampleRate,
    tracks,
    manifest: manifest as FinalizeResult['manifest'],
    degraded: tracks.some((track) => track.degraded),
    errors: tracks.flatMap((track) => track.errors),
  }
}
