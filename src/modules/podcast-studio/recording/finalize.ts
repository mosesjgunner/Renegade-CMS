/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-09 — Recording finalizer (SERVER service).
 *
 * Given a session's chunk set, assemble every track to WAV in the
 * POD-00 working format, register each track as a media asset, and
 * write the `podcast-recordings` record carrying the POD-00 track
 * manifest, the live markers and the played-clip log. When the session
 * is bound to an episode, the episode's POD-04 production state moves
 * to `recorded` through production.ts's guarded transitions — legally
 * or not at all (an episode already past `recorded` is left alone and
 * the skip is reported, never forced).
 *
 * Chunk sources (the finalizer is source-agnostic; assemble.ts does
 * the work):
 * - any POD-06 `ChunkStorage` — including `DirectoryChunkStorage`
 *   below (a local chunk directory: the test path, and the shape a
 *   server-side journal takes), read through the PT-B recovery scan so
 *   a crashed session finalizes with ≤ 1 timeslice lost per track;
 * - an upload-bridge blob: the assembled s16 byte stream a completed
 *   POD-06 upload session landed as one media blob, split back into
 *   timeslice chunks by `trackChunksFromBlobBytes`.
 *
 * Resume: assembly is deterministic (assemble.ts), media blobs/assets
 * dedupe by site+checksum (the POD-02 import pattern), and the
 * recording record is keyed by session — an interrupted finalize
 * re-run detects its partial outputs by checksum/manifest and completes
 * them with byte-identical results instead of duplicating anything.
 *
 * Storage policy: the record snapshots the show's resolved retention
 * policy and its computed `retainUntil` (null while the episode is
 * unpublished — raw tracks are retained). The cleanup core below is
 * what the `podcast-recording-cleanup` task runs; it is DRY-RUN BY
 * DEFAULT and only deletes when a run explicitly passes dryRun: false.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { loadConfig, type AppConfig } from '../../core/config'
import type { MediaPublishingStore } from '../../media/publishing'
import { mediaObjectKey, mediaStorage } from '../../media/storage'
import { TIMESLICE_FRAMES } from '../capture/capture'
import { int16BytesToFloat, recoverRecording, type ChunkStorage } from '../capture/journal'
import { transitionProductionState } from '../production'
import {
  finalizeAssembly,
  type AssemblyChunk,
  type FinalizeResult,
  type TrackAssemblyInput,
} from './assemble'
import { sessionRecordingId, type TrackDefinition } from './multitrack'
import {
  computeRetainUntil,
  planRecordingCleanup,
  resolveRetentionPolicy,
  type RetentionPolicy,
} from './storage-policy'

export const PODCAST_RECORDING_COLLECTION = 'podcast-recordings'
export const PODCAST_RECORDING_FINALIZE_TASK = 'podcast-recording-finalize'
export const PODCAST_RECORDING_CLEANUP_TASK = 'podcast-recording-cleanup'

type Doc = Record<string, any>
const relationId = (value: unknown): string =>
  typeof value === 'string' ? value : String((value as Doc)?.id ?? '')

// ---------------------------------------------------------------------------
// DirectoryChunkStorage — the POD-06 ChunkStorage over a local directory.
// Layout mirrors the OPFS adapter: <root>/<recordingId>/chunk-NNNN.pcm
// plus manifest.jsonl. Path segments are sanitized recording ids.
// ---------------------------------------------------------------------------

/**
 * POD-19 hardening: the previous sanitizer left dot segments untouched,
 * so a recording id of exactly `..` (or `.`) escaped the storage root —
 * `deleteRecording('..')` would have removed the root's PARENT. Dots are
 * only safe inside a segment, never leading it; dot-only results and
 * empty results collapse to a placeholder segment.
 */
const safeSegment = (value: string): string => {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_')
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? '_' : cleaned
}

export class DirectoryChunkStorage implements ChunkStorage {
  constructor(private readonly root: string) {}

  private recordingDir(recordingId: string): string {
    return join(this.root, safeSegment(recordingId))
  }

  private chunkPath(recordingId: string, index: number): string {
    return join(this.recordingDir(recordingId), `chunk-${String(index).padStart(4, '0')}.pcm`)
  }

  async putChunk(recordingId: string, index: number, bytes: Uint8Array): Promise<void> {
    await mkdir(this.recordingDir(recordingId), { recursive: true })
    await writeFile(this.chunkPath(recordingId, index), bytes)
  }

  async getChunk(recordingId: string, index: number): Promise<Uint8Array | null> {
    return readFile(this.chunkPath(recordingId, index)).catch(() => null)
  }

  async listChunks(recordingId: string): Promise<number[]> {
    const names = await readdir(this.recordingDir(recordingId)).catch(() => [] as string[])
    return names
      .map((name) => /^chunk-(\d+)\.pcm$/.exec(name)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number)
      .sort((a, b) => a - b)
  }

  async getManifest(recordingId: string): Promise<string | null> {
    return readFile(join(this.recordingDir(recordingId), 'manifest.jsonl'), 'utf8').catch(
      () => null,
    )
  }

  async putManifest(recordingId: string, text: string): Promise<void> {
    await mkdir(this.recordingDir(recordingId), { recursive: true })
    await writeFile(join(this.recordingDir(recordingId), 'manifest.jsonl'), text)
  }

  async listRecordings(): Promise<string[]> {
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => [])
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  }

  async deleteRecording(recordingId: string): Promise<void> {
    await rm(this.recordingDir(recordingId), { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Chunk loaders → assemble.ts inputs
// ---------------------------------------------------------------------------

export type LoadedTrack = {
  input: TrackAssemblyInput
  /** True when the journal recovery verified every admitted chunk's checksum. */
  checksumsVerified: boolean
  /** True when the journal had no footer (crashed / interrupted session). */
  recoveredFromCrash: boolean
  recoveredFrames: number
  lossTimeslices: 0 | 1
  loadErrors: string[]
}

/**
 * Loads one track's chunks from a ChunkStorage through the POD-06 PT-B
 * recovery scan. Only the admitted gapless run becomes chunks; a
 * checksum failure ends the run and is reported as a load error (the
 * finalizer flags the track degraded — the unrecovered tail is a
 * recorded gap at assembly, never invented audio).
 */
export const loadTrackFromStorage = async (
  storage: ChunkStorage,
  definition: TrackDefinition,
  sessionId: string,
): Promise<LoadedTrack> => {
  const recordingId = sessionRecordingId(sessionId, definition.trackId)
  const report = await recoverRecording(storage, recordingId)
  const loadErrors: string[] = []
  if (!report) {
    return {
      input: {
        trackId: definition.trackId,
        role: definition.role,
        ...(definition.guestId ? { guestId: definition.guestId } : {}),
        channels: definition.channels,
        channelLayout: definition.channelLayout,
        joinedAtSample: definition.joinedAtSample,
        chunks: [],
        syncEvents: [{ type: 'head', trackSamples: 0, timelineSamples: definition.joinedAtSample }],
      },
      checksumsVerified: false,
      recoveredFromCrash: false,
      recoveredFrames: 0,
      lossTimeslices: 0,
      loadErrors: [`Track ${definition.trackId}: no journal found for recording ${recordingId}.`],
    }
  }
  if (!report.checksumsVerified)
    loadErrors.push(
      `Track ${definition.trackId}: a chunk failed checksum verification; the journal run ends there and the remainder is a recorded gap.`,
    )
  if (report.tornManifestLines > 0)
    loadErrors.push(
      `Track ${definition.trackId}: ${report.tornManifestLines} torn manifest line(s) were ignored during recovery (chunk files are the evidence).`,
    )
  const chunks: AssemblyChunk[] = []
  for (const index of report.admittedChunks) {
    const bytes = await storage.getChunk(recordingId, index)
    if (!bytes) continue
    chunks.push({ startSample: index * TIMESLICE_FRAMES, pcm: int16BytesToFloat(bytes) })
  }
  const totalFrames = chunks.reduce(
    (sum, chunk) => Math.max(sum, chunk.startSample + chunk.pcm.length / definition.channels),
    0,
  )
  return {
    input: {
      trackId: definition.trackId,
      role: definition.role,
      ...(definition.guestId ? { guestId: definition.guestId } : {}),
      channels: definition.channels,
      channelLayout: definition.channelLayout,
      joinedAtSample: definition.joinedAtSample,
      chunks,
      syncEvents: [
        { type: 'head', trackSamples: 0, timelineSamples: definition.joinedAtSample },
        {
          type: 'tail',
          trackSamples: totalFrames,
          timelineSamples: definition.joinedAtSample + totalFrames,
        },
      ],
    },
    checksumsVerified: report.checksumsVerified,
    recoveredFromCrash: !report.complete,
    recoveredFrames: report.recoveredFrames,
    lossTimeslices: report.lossTimeslices,
    loadErrors,
  }
}

/**
 * Splits an upload-bridge blob (the concatenated s16 chunk stream a
 * completed POD-06 upload session stores as one media blob) back into
 * timeslice chunks for assembly.
 */
export const trackChunksFromBlobBytes = (
  bytes: Uint8Array,
  definition: TrackDefinition,
): TrackAssemblyInput => {
  const pcm = int16BytesToFloat(bytes)
  const chunkSamples = TIMESLICE_FRAMES * definition.channels
  const chunks: AssemblyChunk[] = []
  for (let offset = 0, index = 0; offset < pcm.length; offset += chunkSamples, index++) {
    chunks.push({
      startSample: index * TIMESLICE_FRAMES,
      pcm: pcm.subarray(offset, Math.min(offset + chunkSamples, pcm.length)),
    })
  }
  const totalFrames = pcm.length / definition.channels
  return {
    trackId: definition.trackId,
    role: definition.role,
    ...(definition.guestId ? { guestId: definition.guestId } : {}),
    channels: definition.channels,
    channelLayout: definition.channelLayout,
    joinedAtSample: definition.joinedAtSample,
    chunks,
    syncEvents: [
      { type: 'head', trackSamples: 0, timelineSamples: definition.joinedAtSample },
      {
        type: 'tail',
        trackSamples: totalFrames,
        timelineSamples: definition.joinedAtSample + totalFrames,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// The finalize service
// ---------------------------------------------------------------------------

export type FinalizeRecordingInput = {
  /** Studio session document id (POD-05 StudioSession.id). */
  sessionId: string
  /** podcast-studio-sessions record id, when the session is persisted. */
  sessionRecordId?: string | null
  siteId: string
  showId: string
  episodeId?: string | null
  tracks: TrackAssemblyInput[]
  markers?: unknown[]
  playedClipLog?: unknown[]
  sessionLog?: unknown[]
  /** Sample-clock length; defaults to the longest track's timeline end. */
  sessionFrames?: number
  sampleRate?: number
}

export type FinalizeRecordingResult = {
  recordingId: string
  state: 'finalized' | 'degraded'
  manifest: FinalizeResult['manifest']
  trackAssets: Array<{ trackId: string; mediaAssetId: string; checksumSha256: string }>
  episodeTransition: 'moved-to-recorded' | 'already-recorded' | 'skipped' | 'not-bound'
  episodeTransitionNote?: string
  resumed: boolean
}

/**
 * Stores one track WAV through the media blob/asset model (POD-02
 * pattern; dedupe by site+checksum). Exported for POD-11's conform
 * job, which registers conformed guest ISO assets through the same
 * dedupe path.
 */
export const storeTrackAsset = async (
  store: MediaPublishingStore,
  config: AppConfig,
  input: {
    siteId: string
    showId: string
    sessionId: string
    trackId: string
    role: string
    wavBytes: Uint8Array
    checksumSha256: string
    durationSec: number
  },
): Promise<string> => {
  const storage = mediaStorage(config)
  const prefixedChecksum = `sha256:${input.checksumSha256}`
  const scope = { site: input.siteId, publication: null, space: null }
  const knownBlobs = await store
    .find({
      collection: 'media-blobs',
      where: {
        and: [{ site: { equals: input.siteId } }, { checksum: { equals: prefixedChecksum } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  let blob = knownBlobs.docs[0]
  if (!blob) {
    const key = mediaObjectKey(input.siteId, 'wav')
    await storage.put(key, input.wavBytes, 'audio/wav')
    try {
      blob = await store.create({
        collection: 'media-blobs',
        data: {
          ...scope,
          checksum: prefixedChecksum,
          storageKey: key,
          storageProvider: storage.provider,
          mimeType: 'audio/wav',
          sizeBytes: input.wavBytes.byteLength,
          state: 'ready',
        },
        overrideAccess: true,
      })
    } catch (error) {
      await storage.remove(key).catch(() => undefined)
      throw error
    }
  } else {
    const existingBytes = await storage.get(String(blob.storageKey)).catch(() => undefined)
    if (!existingBytes) await storage.put(String(blob.storageKey), input.wavBytes, 'audio/wav')
  }
  const knownAssets = await store
    .find({
      collection: 'media-assets',
      where: {
        and: [{ site: { equals: input.siteId } }, { originalBlob: { equals: relationId(blob) } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  const existing = knownAssets.docs[0]
  if (existing) return relationId(existing)
  const asset = await store.create({
    collection: 'media-assets',
    data: {
      ...scope,
      owner: null,
      title: `Recording ${input.sessionId} — ${input.trackId} (${input.role})`,
      kind: 'audio',
      storageLocation: String(blob.storageKey),
      storageProvider: storage.provider,
      originalBlob: relationId(blob),
      originalFilename: `${input.sessionId}-${input.trackId}.wav`,
      mimeType: 'audio/wav',
      sizeBytes: input.wavBytes.byteLength,
      checksum: prefixedChecksum,
      durationSeconds: input.durationSec,
    },
    overrideAccess: true,
  })
  return relationId(asset)
}

/**
 * Finalizes one recording session. Idempotent/resumable: an existing
 * recording record for the session whose manifest checksums match the
 * deterministic re-assembly is completed in place (missing assets are
 * created, present ones reused) and reported with `resumed: true`.
 */
export async function finalizeRecordingSession(
  payload: MediaPublishingStore,
  config: AppConfig | undefined,
  input: FinalizeRecordingInput,
): Promise<FinalizeRecordingResult> {
  const resolvedConfig = config ?? loadConfig()
  const sampleRate = input.sampleRate ?? 48_000
  const result = finalizeAssembly({
    sessionId: input.sessionId,
    sampleRate,
    tracks: input.tracks,
    sessionFrames: input.sessionFrames,
  })

  const existingRecord = await payload
    .find({
      collection: PODCAST_RECORDING_COLLECTION,
      where: { session: { equals: input.sessionRecordId ?? '__none__' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .then((found) => found.docs[0] ?? null)
    .catch(() => null)
  const resumed = Boolean(
    existingRecord &&
      (existingRecord.state === 'finalizing' ||
        existingRecord.state === 'finalized' ||
        existingRecord.state === 'degraded'),
  )

  // Media assets first (dedupe makes a re-run free), manifest ids folded
  // back into the manifest, then the recording record.
  const trackAssets: FinalizeRecordingResult['trackAssets'] = []
  for (const track of result.tracks) {
    const mediaAssetId = await storeTrackAsset(payload, resolvedConfig, {
      siteId: input.siteId,
      showId: input.showId,
      sessionId: input.sessionId,
      trackId: track.trackId,
      role: track.role,
      wavBytes: track.wavBytes,
      checksumSha256: track.checksumSha256,
      durationSec: track.frames / sampleRate,
    })
    trackAssets.push({ trackId: track.trackId, mediaAssetId, checksumSha256: track.checksumSha256 })
    const manifestTrack = result.manifest.tracks.find((entry) => entry.trackId === track.trackId)
    if (manifestTrack) manifestTrack.mediaAssetId = mediaAssetId
  }

  // Retention: policy snapshot + retainUntil from the bound episode.
  let policy: RetentionPolicy = { ...resolveRetentionPolicy(null) }
  let retainUntil: string | null = null
  const show = input.showId
    ? await payload
        .findByID({ collection: 'podcast-shows', id: input.showId, depth: 0, overrideAccess: true })
        .catch(() => null)
    : null
  if (show) policy = resolveRetentionPolicy(show)
  let episode: Doc | null = null
  if (input.episodeId) {
    episode = await payload
      .findByID({
        collection: 'podcast-episodes',
        id: input.episodeId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    retainUntil = computeRetainUntil(policy, episode)
  }

  const state = result.degraded ? 'degraded' : 'finalized'
  const recordData: Doc = {
    site: input.siteId,
    show: input.showId,
    session: input.sessionRecordId ?? null,
    episode: input.episodeId ?? null,
    state,
    manifest: result.manifest,
    markers: input.markers ?? [],
    playedClipLog: input.playedClipLog ?? [],
    sessionLog: input.sessionLog ?? [],
    trackAssets,
    retentionPolicy: policy,
    retainUntil,
    finalizedAt: new Date().toISOString(),
    errorMessage: result.errors.length > 0 ? result.errors.join('\n').slice(0, 2000) : null,
  }
  const record = existingRecord
    ? await payload.update({
        collection: PODCAST_RECORDING_COLLECTION,
        id: relationId(existingRecord),
        data: recordData,
        overrideAccess: true,
      })
    : await payload.create({
        collection: PODCAST_RECORDING_COLLECTION,
        data: recordData,
        overrideAccess: true,
      })

  // Episode binding: production state → recorded, through the guarded
  // POD-04 machine. Illegal from the episode's current state → skipped
  // with the reason, never forced.
  let episodeTransition: FinalizeRecordingResult['episodeTransition'] = 'not-bound'
  let episodeTransitionNote: string | undefined
  if (input.episodeId && episode) {
    const current = String(episode.productionState ?? 'idea')
    if (current === 'recorded') {
      episodeTransition = 'already-recorded'
    } else {
      try {
        await transitionProductionState(payload as never, input.episodeId, 'recorded')
        episodeTransition = 'moved-to-recorded'
      } catch (error) {
        episodeTransition = 'skipped'
        episodeTransitionNote = error instanceof Error ? error.message : String(error)
      }
    }
  }

  return {
    recordingId: relationId(record),
    state,
    manifest: result.manifest,
    trackAssets,
    episodeTransition,
    ...(episodeTransitionNote ? { episodeTransitionNote } : {}),
    resumed,
  }
}

/** Convenience: load every track from a ChunkStorage, then finalize. */
export async function finalizeRecordingFromStorage(
  payload: MediaPublishingStore,
  config: AppConfig | undefined,
  input: Omit<FinalizeRecordingInput, 'tracks'> & {
    storage: ChunkStorage
    trackDefinitions: TrackDefinition[]
    explicitGaps?: Record<string, Array<{ fromSample: number; frames: number }>>
  },
): Promise<FinalizeRecordingResult & { trackLoads: LoadedTrack[] }> {
  const trackLoads: LoadedTrack[] = []
  const tracks: TrackAssemblyInput[] = []
  for (const definition of input.trackDefinitions) {
    const loaded = await loadTrackFromStorage(input.storage, definition, input.sessionId)
    trackLoads.push(loaded)
    const gaps = input.explicitGaps?.[definition.trackId]
    tracks.push({ ...loaded.input, ...(gaps ? { explicitGaps: gaps } : {}) })
  }
  const result = await finalizeRecordingSession(payload, config, { ...input, tracks })
  // Attach load errors to the manifest extension + recording record.
  type ManifestTrackExt = FinalizeResult['manifest']['tracks'][number]
  for (const loaded of trackLoads) {
    if (loaded.loadErrors.length === 0) continue
    const manifestTrack = result.manifest.tracks.find(
      (entry) => entry.trackId === loaded.input.trackId,
    ) as ManifestTrackExt | undefined
    if (manifestTrack) {
      manifestTrack.errors = [...manifestTrack.errors, ...loaded.loadErrors]
      manifestTrack.degraded = true
    }
  }
  if (trackLoads.some((loaded) => loaded.loadErrors.length > 0)) {
    await payload
      .update({
        collection: PODCAST_RECORDING_COLLECTION,
        id: result.recordingId,
        data: {
          state: 'degraded',
          manifest: result.manifest,
          errorMessage: trackLoads
            .flatMap((loaded) => loaded.loadErrors)
            .join('\n')
            .slice(0, 2000),
        },
        overrideAccess: true,
      })
      .catch(() => undefined)
    result.state = 'degraded'
  }
  return { ...result, trackLoads }
}

// ---------------------------------------------------------------------------
// Retention cleanup core (the task in media/tasks.ts is a thin wrapper)
// ---------------------------------------------------------------------------

export type RecordingCleanupResult = {
  dryRun: boolean
  scanned: number
  expired: number
  deleted: number
  retained: number
  observedAt: string
}

/**
 * Expires raw multitrack recordings past their retainUntil.
 * DRY-RUN BY DEFAULT (`dryRun` defaults true): counts and reports only.
 * A real run (dryRun: false) deletes the recording's track media
 * assets, removes blob bytes no other asset references, and marks the
 * recording record `expired` (the record itself is kept as the audit
 * trail; its manifest stays readable).
 */
export async function cleanupExpiredRecordings(
  payload: MediaPublishingStore & { delete?: (args: any) => Promise<any> },
  config: AppConfig | undefined,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<RecordingCleanupResult> {
  const dryRun = options.dryRun !== false
  const now = options.now ?? new Date()
  const found = await payload.find({
    collection: PODCAST_RECORDING_COLLECTION,
    where: { state: { not_equals: 'expired' } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const plan = planRecordingCleanup(
    found.docs.map((doc) => ({
      id: relationId(doc),
      state: String(doc.state ?? ''),
      retainUntil: (doc.retainUntil as string | null) ?? null,
    })),
    now,
  )
  let deleted = 0
  if (!dryRun) {
    const resolvedConfig = config ?? loadConfig()
    const storage = mediaStorage(resolvedConfig)
    const expiredIds = new Set(plan.expired.map((candidate) => candidate.id))
    // Checksum dedupe can make two recordings reference the SAME media
    // asset (byte-identical tracks). An asset another retained
    // recording still references is never deleted from under it.
    const assetSharedWithRetained = (assetId: string): boolean =>
      found.docs.some(
        (doc) =>
          !expiredIds.has(relationId(doc)) &&
          doc.state !== 'expired' &&
          Array.isArray(doc.trackAssets) &&
          doc.trackAssets.some((entry: Doc) => String(entry?.mediaAssetId ?? '') === assetId),
      )
    for (const candidate of plan.expired) {
      const record = found.docs.find((doc) => relationId(doc) === candidate.id)
      if (!record) continue
      const trackAssets = Array.isArray(record.trackAssets) ? record.trackAssets : []
      for (const entry of trackAssets) {
        const assetId = String((entry as Doc)?.mediaAssetId ?? '')
        if (!assetId || assetSharedWithRetained(assetId)) continue
        const asset = await payload
          .findByID({ collection: 'media-assets', id: assetId, depth: 0, overrideAccess: true })
          .catch(() => null)
        if (!asset) continue
        const blobId = relationId(asset.originalBlob)
        await payload
          .delete?.({ collection: 'media-assets', id: assetId, overrideAccess: true } as never)
          .catch(() => undefined)
        deleted++
        if (blobId) {
          const siblings = await payload
            .find({
              collection: 'media-assets',
              where: { originalBlob: { equals: blobId } },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
            .catch(() => ({ docs: [] as Doc[] }))
          if (siblings.docs.length === 0) {
            const blob = await payload
              .findByID({ collection: 'media-blobs', id: blobId, depth: 0, overrideAccess: true })
              .catch(() => null)
            if (blob?.storageKey)
              await storage.remove(String(blob.storageKey)).catch(() => undefined)
            await payload
              .delete?.({ collection: 'media-blobs', id: blobId, overrideAccess: true } as never)
              .catch(() => undefined)
          }
        }
      }
      await payload.update({
        collection: PODCAST_RECORDING_COLLECTION,
        id: candidate.id,
        data: { state: 'expired' },
        overrideAccess: true,
      })
    }
  }
  const result: RecordingCleanupResult = {
    dryRun,
    scanned: plan.counts.scanned,
    expired: plan.counts.expired,
    deleted,
    retained: plan.counts.retained,
    observedAt: now.toISOString(),
  }
  console.info(
    `[podcast-recording-cleanup] dryRun=${dryRun} scanned=${result.scanned} expired=${result.expired} deleted=${result.deleted} retained=${result.retained} at=${result.observedAt}`,
  )
  return result
}

/** Enqueues the finalize task for one session, deduplicated like the POD-02 import queue. */
export async function queuePodcastRecordingFinalizeTask(
  payload: MediaPublishingStore & {
    jobs: { queue: (args: any) => Promise<{ id: string | number }> }
  },
  input: {
    sessionId: string
    sessionRecordId?: string | null
    siteId: string
    showId: string
    episodeId?: string | null
    storageRoot: string
    trackDefinitions: TrackDefinition[]
  },
): Promise<{ id: string; queued: boolean }> {
  const idempotencyKey = `podcast-recording-finalize:${input.sessionId}`
  const existing = await payload
    .find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: PODCAST_RECORDING_FINALIZE_TASK } },
          { 'input.idempotencyKey': { equals: idempotencyKey } },
        ],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as Doc[] }))
  const active = existing.docs.find((job) => !job.hasError && !job.completedAt)
  if (active) return { id: String(active.id), queued: false }
  const job = await payload.jobs.queue({
    task: PODCAST_RECORDING_FINALIZE_TASK,
    queue: 'media',
    input: { ...input, idempotencyKey },
  } as never)
  return { id: String(job.id), queued: true }
}
