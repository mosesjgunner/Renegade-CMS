/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-16 — Live service: the Payload wiring over the live cores.
 *
 * - Stream profile + credential writes on podcast-shows (the
 *   credential is encrypted or env-referenced at this boundary; the
 *   plaintext exists only in this call and in `resolveShowStreamConfig`,
 *   which is server-side only and never serialized by any route).
 * - Live episode lifecycle over podcast-episodes (schedule / go-live /
 *   end-show / convert-with-recording), delegating state rules to the
 *   document cores in `live-session.ts`.
 * - Audience room binding writes (data only — see `live-room.ts`).
 * - Relay health folded into a saved POD-05 session record.
 */

import { join } from 'node:path'

import { loadConfig } from '../../core/config'
import { loadStudioSessionRecord, saveStudioSessionRecord } from '../sessions'
import {
  LiveIngestBuffer,
  type LiveIngestChunkResult,
  type LiveIngestStatus,
} from './ingest-buffer'
import {
  applyIngestStatus,
  applyRelayHealth,
  convertLiveEpisodeDoc,
  endLiveEpisodeDoc,
  goLiveEpisodeDoc,
  scheduleLiveEpisode,
  type LiveEpisodeDoc,
} from './live-session'
import { resolveLiveRoomBinding, type LiveRoomBinding } from './live-room'
import type { RelayHealth } from './relay'
import {
  encryptStreamCredential,
  parseStreamProfile,
  publicStreamProfile,
  resolveStreamCredential,
  streamCredentialStorageOf,
  type PublicStreamProfile,
  type StreamProfile,
} from './stream-profile'

const SHOWS = 'podcast-shows'
const EPISODES = 'podcast-episodes'
const RECORDINGS = 'podcast-recordings'

const findById = async (payload: any, collection: string, id: string): Promise<any> =>
  payload.findByID({ collection, id, depth: 0, overrideAccess: true })

// ---------------------------------------------------------------------------
// Stream profile + credential
// ---------------------------------------------------------------------------

/**
 * Stores a show's stream profile and (optionally) its source
 * credential. Pass `credential` to store it encrypted, or
 * `credentialEnvName` to reference an environment variable instead —
 * never both. Returns the PUBLIC projection (no credential material).
 */
export async function setShowStreamProfile(
  payload: any,
  input: {
    showId: string
    profile: StreamProfile
    credential?: string
    credentialEnvName?: string
  },
): Promise<PublicStreamProfile> {
  const profile = parseStreamProfile(input.profile)
  if (input.credential && input.credentialEnvName)
    throw new Error('Choose one credential storage: encrypted value OR env reference, not both.')
  const data: Record<string, unknown> = { streamProfile: profile }
  if (input.credential) {
    data.streamCredentialEncrypted = encryptStreamCredential(input.credential)
    data.streamCredentialEnvName = null
  }
  if (input.credentialEnvName) {
    data.streamCredentialEnvName = input.credentialEnvName
    data.streamCredentialEncrypted = null
  }
  const doc = await payload.update({
    collection: SHOWS,
    id: input.showId,
    data,
    overrideAccess: true,
  })
  const pub = publicStreamProfile(doc as Record<string, unknown>)
  if (!pub) throw new Error('Stored stream profile failed to re-read.')
  return pub
}

/** The public projection for a show (safe for any payload). */
export async function getPublicStreamProfile(
  payload: any,
  showId: string,
): Promise<PublicStreamProfile | null> {
  const doc = await findById(payload, SHOWS, showId)
  return doc ? publicStreamProfile(doc as Record<string, unknown>) : null
}

/**
 * SERVER-SIDE ONLY: the show's parsed profile + resolved plaintext
 * credential for the relay supervisor. The result must never be
 * serialized into a response or a log.
 */
export async function resolveShowStreamConfig(
  payload: any,
  showId: string,
): Promise<{ profile: StreamProfile; credential: string | null } | null> {
  const doc = await findById(payload, SHOWS, showId)
  if (!doc?.streamProfile) return null
  const profile = parseStreamProfile(doc.streamProfile)
  const credential = resolveStreamCredential(streamCredentialStorageOf(doc))
  return { profile, credential }
}

// ---------------------------------------------------------------------------
// Live episode lifecycle
// ---------------------------------------------------------------------------

const episodeDocOf = (doc: any): LiveEpisodeDoc => ({
  id: String(doc.id),
  liveState: doc.liveState ?? 'none',
  liveStartAt: doc.liveStartAt ?? null,
  liveEndAt: doc.liveEndAt ?? null,
  liveStreamUrl: doc.liveStreamUrl ?? null,
  audio: doc.audio ?? null,
})

const updateEpisode = async (payload: any, episode: LiveEpisodeDoc): Promise<any> =>
  payload.update({
    collection: EPISODES,
    id: episode.id,
    data: {
      liveState: episode.liveState,
      liveStartAt: episode.liveStartAt,
      liveEndAt: episode.liveEndAt,
      liveStreamUrl: episode.liveStreamUrl,
      ...(episode.audio ? { audio: episode.audio } : {}),
    },
    overrideAccess: true,
  })

/** Schedules a live episode: liveState `scheduled` + the show's listener/stream URL. */
export async function scheduleLiveEpisodeForShow(
  payload: any,
  input: { episodeId: string; startAt: string },
): Promise<any> {
  const episode = await findById(payload, EPISODES, input.episodeId)
  if (!episode) throw new Error(`Episode ${input.episodeId} not found.`)
  const show = await findById(payload, SHOWS, String(episode.show?.id ?? episode.show))
  const profile = show?.streamProfile ? parseStreamProfile(show.streamProfile) : null
  if (!profile?.enabled)
    throw new Error(
      'The show has no enabled stream profile — set one before scheduling a live episode.',
    )
  return updateEpisode(
    payload,
    scheduleLiveEpisode(episodeDocOf(episode), {
      startAt: input.startAt,
      streamUrl: profile.sourceUrl,
    }),
  )
}

export async function goLiveEpisode(payload: any, episodeId: string): Promise<any> {
  const episode = await findById(payload, EPISODES, episodeId)
  if (!episode) throw new Error(`Episode ${episodeId} not found.`)
  return updateEpisode(payload, goLiveEpisodeDoc(episodeDocOf(episode), new Date().toISOString()))
}

export async function endLiveEpisode(payload: any, episodeId: string): Promise<any> {
  const episode = await findById(payload, EPISODES, episodeId)
  if (!episode) throw new Error(`Episode ${episodeId} not found.`)
  return updateEpisode(payload, endLiveEpisodeDoc(episodeDocOf(episode), new Date().toISOString()))
}

/**
 * Converts a live/ended episode to a normal episode backed by a
 * POD-09 recording: the recording manifest's program track asset
 * becomes the episode audio. Idempotent — a second convert with the
 * same recording changes nothing (POD-REQ-35: reconnects and repeated
 * end-show calls never mint duplicate artifacts).
 */
export async function convertLiveEpisodeWithRecording(
  payload: any,
  input: { episodeId: string; recordingId: string },
): Promise<{ episode: any; converted: boolean }> {
  const episode = await findById(payload, EPISODES, input.episodeId)
  if (!episode) throw new Error(`Episode ${input.episodeId} not found.`)
  const recording = await findById(payload, RECORDINGS, input.recordingId)
  if (!recording) throw new Error(`Recording ${input.recordingId} not found.`)
  const tracks = Array.isArray(recording.manifest?.tracks) ? recording.manifest.tracks : []
  const program = tracks.find((track: any) => track?.role === 'program' && track?.mediaAssetId)
  if (!program)
    throw new Error(
      `Recording ${input.recordingId} has no finalized program track asset to convert with.`,
    )
  const { episode: next, converted } = convertLiveEpisodeDoc(episodeDocOf(episode), {
    audioAssetId: String(program.mediaAssetId),
  })
  if (!converted) return { episode, converted: false }
  const updated = await updateEpisode(payload, next)
  return { episode: updated, converted: true }
}

// ---------------------------------------------------------------------------
// Audience room binding
// ---------------------------------------------------------------------------

export async function setLiveRoomBinding(
  payload: any,
  input: { episodeId: string; binding: LiveRoomBinding },
): Promise<any> {
  const episode = await findById(payload, EPISODES, input.episodeId)
  const showId = typeof episode.show === 'string' ? episode.show : episode.show?.id
  const show = await findById(payload, SHOWS, showId)
  const siteId = typeof episode.site === 'string' ? episode.site : episode.site?.id
  const showSiteId = typeof show.site === 'string' ? show.site : show.site?.id
  if (!siteId || showSiteId !== siteId)
    throw new Error('The podcast episode and show must belong to the same site.')
  const { binding } = await resolveLiveRoomBinding(payload, siteId, input.binding, {
    requiresMembers:
      episode.membersOnly || show.feedVisibility === 'members' || Boolean(show.requiredEntitlement),
  })
  return payload.update({
    collection: EPISODES,
    id: input.episodeId,
    data: { liveRoom: binding },
    overrideAccess: true,
  })
}

// ---------------------------------------------------------------------------
// Live ingest buffer (POD-21: the browser→ingest byte path, server side)
// ---------------------------------------------------------------------------

/** Root of the per-session ingest buffers, under the media storage area. */
export const liveIngestRoot = (): string =>
  join(loadConfig().storage.mediaDir, 'podcast-live-ingest')

/** The ingest buffer for one studio session record (relay wiring + routes share this). */
export const liveIngestBufferFor = (sessionRecordId: string): LiveIngestBuffer =>
  new LiveIngestBuffer(liveIngestRoot(), sessionRecordId)

const requireSessionRecord = async (payload: any, sessionRecordId: string) => {
  const record = await loadStudioSessionRecord(payload, sessionRecordId)
  if (!record) throw new Error(`Studio session record ${sessionRecordId} not found.`)
  return record
}

/**
 * Accepts one browser program chunk into the session's ingest buffer
 * and folds the resulting status (sequence head, gaps) into the
 * saved session document, so the desk's on-air surface shows the
 * ingest state next to relay + recording health.
 */
export async function writeLiveIngestChunk(
  payload: any,
  input: { sessionRecordId: string; seq: number; bytes: Uint8Array; format?: string },
): Promise<LiveIngestChunkResult> {
  const record = await requireSessionRecord(payload, input.sessionRecordId)
  const buffer = liveIngestBufferFor(input.sessionRecordId)
  const result = await buffer.writeChunk({
    seq: input.seq,
    bytes: input.bytes,
    ...(input.format ? { format: input.format } : {}),
  })
  const next = applyIngestStatus(record.session, {
    nextSeq: result.status.nextSeq,
    gaps: result.status.gaps,
    stalled: false,
    lastChunkAtIso: result.status.lastChunkAtIso,
  })
  await saveStudioSessionRecord(payload, input.sessionRecordId, next)
  return result
}

/** The session's ingest status (buffer truth; the session doc mirrors it). */
export async function getLiveIngestStatus(
  payload: any,
  sessionRecordId: string,
): Promise<LiveIngestStatus> {
  await requireSessionRecord(payload, sessionRecordId)
  return liveIngestBufferFor(sessionRecordId).open()
}

/**
 * Surfaces an ingest stall (or its end) into the saved session
 * document — the pump adapter's `onStall`/`onResume` callbacks wire
 * here, so a starved stream is visible in the session log and the
 * on-air model while the recording stays structurally untouched.
 */
export async function recordIngestStallInSession(
  payload: any,
  input: { sessionRecordId: string; stalled: boolean },
): Promise<void> {
  const record = await requireSessionRecord(payload, input.sessionRecordId)
  const status = await liveIngestBufferFor(input.sessionRecordId).status()
  const next = applyIngestStatus(record.session, {
    nextSeq: status.nextSeq,
    gaps: status.gaps,
    stalled: input.stalled,
    lastChunkAtIso: status.lastChunkAtIso,
  })
  await saveStudioSessionRecord(payload, input.sessionRecordId, next)
}

// ---------------------------------------------------------------------------
// Relay health → session record
// ---------------------------------------------------------------------------

/** Folds relay health into a saved studio session record (the POD-05 log + live state surface). */
export async function recordRelayHealthInSession(
  payload: any,
  input: { sessionRecordId: string; health: RelayHealth },
): Promise<void> {
  const record = await loadStudioSessionRecord(payload, input.sessionRecordId)
  if (!record) throw new Error(`Studio session record ${input.sessionRecordId} not found.`)
  const next = applyRelayHealth(record.session, input.health)
  await saveStudioSessionRecord(payload, input.sessionRecordId, next)
}
