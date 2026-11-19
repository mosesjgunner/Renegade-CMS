/**
 * POD-16 — Live state in the POD-05 session document + the live
 * episode lifecycle (PURE CORES over plain documents; the Payload
 * wiring is `live-service.ts`).
 *
 * Relay health is surfaced into the session document as the preserved
 * extension field `liveStream` (the POD-08 played-log / POD-09
 * recording-state pattern: the POD-00 parser keeps unknown fields
 * verbatim, so no contract change). The on-air bar model combines
 * that with the POD-09 recording state — and the combination is
 * exactly where POD-REQ-35 becomes visible: the two states sit side
 * by side in one document, written by two independent machines,
 * sharing only the session clock (`elapsedSec`). Applying relay
 * health NEVER touches `recordingState`; the lifecycle-separation
 * tests assert the recording subtree is deep-equal before and after
 * every relay event, including a mid-record kill.
 *
 * Episode lifecycle (POD-01 live states):
 *   scheduled ──go-live──▶ live ──end-show──▶ ended (no recording yet:
 *   still a `podcast:liveItem` with status "ended") ──convert──▶ ended
 *   + audio (the POD-09 recording's program asset): the POD-01 feed
 *   builder now renders a NORMAL item with the recording enclosure —
 *   the same episode, the same GUID, no duplicate artifact.
 * Conversion is idempotent: converting an already-converted episode
 * with the same recording is a no-op success.
 */

import { getRecordingState, type RecordingState } from '../recording/recording-session'
import type { StudioSessionDoc } from '../session-engine'
import type { RelayHealth, RelayState } from './relay'

export type LiveStreamSessionState = {
  relayState: RelayState
  pid: number | null
  restarts: number
  spawns: number
  mount: string
  nowPlaying: string | null
  lastError: string | null
  /** Session-clock second (POD-05 `elapsedSec`) of the last relay event — the ONLY clock the two machines share. */
  atElapsedSec: number
  updatedAtIso: string
}

export type SessionDocWithLive = StudioSessionDoc & { liveStream?: LiveStreamSessionState }

export const getLiveStreamState = (session: StudioSessionDoc): LiveStreamSessionState | null =>
  (session as SessionDocWithLive).liveStream ?? null

const cloneDoc = (session: StudioSessionDoc): SessionDocWithLive =>
  JSON.parse(JSON.stringify(session)) as SessionDocWithLive

/**
 * Folds one relay health snapshot into the session document. Log
 * entries are written on STATE TRANSITIONS and failures only (the
 * message bar is an event log, not a telemetry stream). The
 * recording subtree is never read for writing and never modified.
 */
export function applyRelayHealth(
  session: StudioSessionDoc,
  health: RelayHealth,
  atIso = new Date().toISOString(),
): SessionDocWithLive {
  const next = cloneDoc(session)
  const previous = next.liveStream
  next.liveStream = {
    relayState: health.state,
    pid: health.pid,
    restarts: health.restarts,
    spawns: health.spawns,
    mount: health.mount,
    nowPlaying: health.nowPlaying,
    lastError: health.lastError,
    atElapsedSec: next.elapsedSec,
    updatedAtIso: atIso,
  }
  if (!previous || previous.relayState !== health.state) {
    next.log.push({
      type: 'live-relay-state',
      level: health.state === 'failed' ? 'error' : health.state === 'live' ? 'info' : 'warn',
      atElapsedSec: next.elapsedSec,
      relayState: health.state,
      mount: health.mount,
      ...(health.lastError ? { error: health.lastError } : {}),
    })
  } else if (health.state === 'failed' && previous.lastError !== health.lastError) {
    next.log.push({
      type: 'live-relay-state',
      level: 'error',
      atElapsedSec: next.elapsedSec,
      relayState: health.state,
      mount: health.mount,
      error: health.lastError ?? 'relay failed',
    })
  }
  return next
}

/** The on-air bar model: stream health and recording health, side by side, independently sourced. */
export type OnAirLiveModel = {
  relay: LiveStreamSessionState | null
  recording: RecordingState | null
  /** True while the relay reports live — independent of whether recording runs. */
  streamLive: boolean
  recordingActive: boolean
}

export const onAirLiveModel = (session: StudioSessionDoc): OnAirLiveModel => {
  const relay = getLiveStreamState(session)
  const recording = getRecordingState(session)
  return {
    relay,
    recording,
    streamLive: relay?.relayState === 'live',
    recordingActive: recording?.status === 'recording',
  }
}

// ---------------------------------------------------------------------------
// Live ingest status in the session document (POD-21)
// ---------------------------------------------------------------------------

export type LiveIngestSessionState = {
  /** Highest contiguous sequence the relay can hear (buffer nextSeq − 1 when ≥ 0). */
  nextSeq: number
  gaps: Array<{ fromSeq: number; toSeq: number }>
  /** True while the pump reports an ingest stall (no chunks for the stall window). */
  stalled: boolean
  lastChunkAtIso: string | null
  updatedAtIso: string
}

export type SessionDocWithLiveIngest = StudioSessionDoc & {
  liveIngest?: LiveIngestSessionState
}

export const getLiveIngestState = (session: StudioSessionDoc): LiveIngestSessionState | null =>
  (session as SessionDocWithLiveIngest).liveIngest ?? null

/**
 * Folds one ingest status snapshot into the session document (the
 * POD-21 surfacing rule): the `liveIngest` extension is refreshed,
 * and LOG entries are written on stall transitions and on newly
 * detected gaps only — the message bar stays an event log, not a
 * telemetry stream. Like `applyRelayHealth`, this never reads or
 * writes the recording subtree: an ingest stall is a stream event,
 * and the recording's health is a separate machine's business
 * (POD-REQ-35).
 */
export function applyIngestStatus(
  session: StudioSessionDoc,
  status: {
    nextSeq: number
    gaps: Array<{ fromSeq: number; toSeq: number }>
    stalled: boolean
    lastChunkAtIso: string | null
  },
  atIso = new Date().toISOString(),
): SessionDocWithLiveIngest {
  const next = cloneDoc(session) as SessionDocWithLiveIngest
  const previous = next.liveIngest
  next.liveIngest = {
    nextSeq: status.nextSeq,
    gaps: status.gaps.map((gap) => ({ ...gap })),
    stalled: status.stalled,
    lastChunkAtIso: status.lastChunkAtIso,
    updatedAtIso: atIso,
  }
  if (status.stalled && !previous?.stalled) {
    next.log.push({
      type: 'live-ingest-stall',
      level: 'error',
      atElapsedSec: next.elapsedSec,
      message:
        'Live ingest stalled: no program chunks are arriving from the studio browser. The stream is starved; the recording is unaffected.',
    })
  } else if (!status.stalled && previous?.stalled) {
    next.log.push({
      type: 'live-ingest-resumed',
      level: 'info',
      atElapsedSec: next.elapsedSec,
      message: 'Live ingest resumed: program chunks are arriving again.',
    })
  }
  const previousGaps = new Set((previous?.gaps ?? []).map((gap) => `${gap.fromSeq}-${gap.toSeq}`))
  for (const gap of status.gaps) {
    if (previousGaps.has(`${gap.fromSeq}-${gap.toSeq}`)) continue
    next.log.push({
      type: 'live-ingest-gap',
      level: 'warn',
      atElapsedSec: next.elapsedSec,
      fromSeq: gap.fromSeq,
      toSeq: gap.toSeq,
      message: `Live ingest gap: chunk(s) ${gap.fromSeq}–${gap.toSeq} have not arrived; the relay hears the contiguous prefix only until they land.`,
    })
  }
  return next
}

// ---------------------------------------------------------------------------
// Live episode lifecycle (document-level core)
// ---------------------------------------------------------------------------

export type LiveEpisodeDoc = {
  id: string
  liveState?: string
  liveStartAt?: string | null
  liveEndAt?: string | null
  liveStreamUrl?: string | null
  audio?: unknown
  [key: string]: unknown
}

export const scheduleLiveEpisode = <T extends LiveEpisodeDoc>(
  episode: T,
  input: { startAt: string; streamUrl: string },
): T => ({
  ...episode,
  liveState: 'scheduled',
  liveStartAt: input.startAt,
  liveEndAt: null,
  liveStreamUrl: input.streamUrl,
})

export const goLiveEpisodeDoc = <T extends LiveEpisodeDoc>(episode: T, atIso: string): T => {
  if (episode.liveState !== 'scheduled')
    throw new Error(
      `Episode ${episode.id} cannot go live from liveState "${episode.liveState ?? 'none'}" — only a scheduled live episode can go live.`,
    )
  return { ...episode, liveState: 'live', liveStartAt: atIso }
}

export const endLiveEpisodeDoc = <T extends LiveEpisodeDoc>(episode: T, atIso: string): T => {
  if (episode.liveState !== 'live')
    throw new Error(
      `Episode ${episode.id} cannot end a live show from liveState "${episode.liveState ?? 'none'}" — it is not live.`,
    )
  return { ...episode, liveState: 'ended', liveEndAt: atIso }
}

/**
 * Converts an ended live episode into a normal episode backed by the
 * recording's program asset. Idempotent for the same asset (a
 * reconnect or a repeated end-show must never mint a second artifact
 * or change the GUID — POD-REQ-35).
 */
export const convertLiveEpisodeDoc = <T extends LiveEpisodeDoc>(
  episode: T,
  input: { audioAssetId: string },
): { episode: T; converted: boolean } => {
  if (episode.liveState !== 'ended' && episode.liveState !== 'live')
    throw new Error(
      `Episode ${episode.id} cannot convert from liveState "${episode.liveState ?? 'none'}" — only a live or ended episode converts.`,
    )
  const currentAudioId =
    episode.audio && typeof episode.audio === 'object'
      ? String((episode.audio as { id?: unknown }).id ?? '')
      : episode.audio
        ? String(episode.audio)
        : ''
  if (currentAudioId === input.audioAssetId && episode.liveState === 'ended')
    return { episode, converted: false }
  return {
    episode: {
      ...episode,
      liveState: 'ended',
      liveEndAt: episode.liveEndAt ?? new Date().toISOString(),
      audio: input.audioAssetId,
    },
    converted: true,
  }
}
