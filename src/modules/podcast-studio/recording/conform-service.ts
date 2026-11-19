/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-11 (POD-REQ-25) — Guest-track conform JOB (SERVER).
 *
 * Takes one guest's uploaded local track (POD-06 journal chunks in a
 * ChunkStorage, written by guests/guest-chunk-upload.ts) plus its
 * head/tail sync pairs, and produces the conformed ISO track on the
 * host session timeline:
 *
 * 1. Readiness gate (conform.ts): the recovered journal must be
 *    complete + checksum-verified, or conform REFUSES with a named
 *    state (track-missing / track-incomplete / track-checksum-failed)
 *    and the fallback ladder decides what the episode uses instead.
 * 2. Rung 1: the plan comes from the pure conform core (PT-F method
 *    via POD-09 drift.ts). The RATE CORRECTION itself is applied by
 *    ffmpeg — `asetrate=<measuredRate>` + `aresample=<sessionRate>`
 *    (see conform.ts `rateCorrectionFilter` for why this chain is a
 *    pure rate correction and `atempo` is not) — then the corrected
 *    PCM is placed sample-accurately at the plan's head offset onto
 *    a session-length timeline and encoded as a working-format WAV.
 * 3. Rung 2 (fallback): the live-capture ISO track (POD-09 guest slot
 *    recorded from the received stream, already on the host clock)
 *    is assembled as-is and marked `degraded: live-capture`.
 * 4. Rung 3: no audio exists — the manifest gains a full-range gap
 *    track with an explicit error naming the guest.
 *
 * Outputs: the conformed ISO media asset (POD-02 blob/asset dedupe,
 * shared with the POD-09 finalizer), the conform report stored on
 * the `podcast-recordings` record (`conformReports` json, upserted
 * by track) AND on the session document's `guestRecordings` entry,
 * and — when a recording record exists — the POD-00 track manifest's
 * guest entry updated in place (mediaAssetId, rateCorrectionPpm,
 * syncEvents, conform extension, degraded/errors). The stored
 * `rateCorrection` artefact is what POD-12's EDL consumes.
 *
 * Supported order: finalize the session (POD-09) first, then conform
 * guests — conform updates the finalized manifest. Conforming before
 * a finalize still produces the asset + session-doc report; a later
 * finalize re-derives the manifest from the journals.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { loadConfig, type AppConfig } from '../../core/config'
import type { MediaPublishingStore } from '../../media/publishing'
import {
  int16BytesToFloat,
  recoverRecording,
  sha256Hex,
  type ChunkStorage,
} from '../capture/journal'
import { guestLocalTrackId } from '../guests/guest-recording'
import { readGuestRecordingMeta, upsertGuestRecordingMeta } from '../guests/guest-chunk-upload'
import { loadStudioSessionRecord, saveStudioSessionRecord } from '../sessions'
import { encodeWavPcm16, type AssemblyChunk } from './assemble'
import {
  assembleGuestWithFallback,
  buildConformFfmpegArgs,
  computeConformPlan,
  evaluateConformReadiness,
  type ConformPlan,
  type ConformReport,
  type FallbackDecision,
} from './conform'
import { PODCAST_RECORDING_COLLECTION, loadTrackFromStorage, storeTrackAsset } from './finalize'
import type { TrackDefinition } from './multitrack'

export const PODCAST_CONFORM_TRACK_TASK = 'podcast-conform-track'

export class PodcastConformError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const relationId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id ?? '')
      : ''

// ---------------------------------------------------------------------------
// ffmpeg rate correction (real ffmpeg; peaks.ts spawn pattern)
// ---------------------------------------------------------------------------

/** Decodes a WAV (ours or ffmpeg's) to interleaved Float32 PCM by scanning for the data chunk. */
export const decodeWavPcm16 = (
  bytes: Uint8Array,
): { pcm: Float32Array; channels: number; sampleRate: number } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (offset: number, text: string) =>
    [...text].every((ch, i) => view.getUint8(offset + i) === ch.charCodeAt(0))
  if (!ascii(0, 'RIFF') || !ascii(8, 'WAVE')) throw new Error('Not a WAV file.')
  let channels = 1
  let sampleRate = 48_000
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    )
    const chunkSize = view.getUint32(offset + 4, true)
    if (chunkId === 'fmt ') {
      channels = view.getUint16(offset + 10, true)
      sampleRate = view.getUint32(offset + 12, true)
    }
    if (chunkId === 'data') {
      const frames = Math.floor(chunkSize / (channels * 2))
      const pcm = new Float32Array(frames * channels)
      for (let i = 0; i < pcm.length; i++) {
        pcm[i] = view.getInt16(offset + 8 + i * 2, true) / 32767
      }
      return { pcm, channels, sampleRate }
    }
    offset += 8 + chunkSize + (chunkSize % 2)
  }
  throw new Error('WAV file has no data chunk.')
}

/**
 * Applies the plan's rate correction to a guest track WAV with the
 * real ffmpeg: asetrate (re-interpret samples at the measured rate)
 * + aresample (back to the session rate). Returns the corrected WAV
 * bytes; duration scales by the plan's resampleFactor.
 */
export async function runFfmpegRateCorrection(
  wavBytes: Uint8Array,
  plan: ConformPlan,
  options: { channels?: number; ffmpeg?: string } = {},
): Promise<Uint8Array> {
  const channels = options.channels ?? 1
  const directory = await mkdtemp(path.join(os.tmpdir(), 'renegade-conform-'))
  const inputPath = path.join(directory, 'guest-raw.wav')
  const outputPath = path.join(directory, 'guest-conformed.wav')
  try {
    await writeFile(inputPath, wavBytes)
    const args = buildConformFfmpegArgs({ inputPath, outputPath, plan, channels })
    await new Promise<void>((resolve, reject) => {
      const child = spawn(options.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg', args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      })
      let stderr = ''
      const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
      child.stderr.on('data', (chunk) => (stderr += String(chunk).slice(-8000)))
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          reject(new Error(`ffmpeg conform failed (${code ?? 'signal'}): ${stderr.slice(-1000)}`))
          return
        }
        resolve()
      })
    })
    return new Uint8Array(await readFile(outputPath))
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// The conform job
// ---------------------------------------------------------------------------

export type StoredConformReport = {
  inviteId: string
  trackId: string
  guestId: string | null
  state: FallbackDecision['state']
  source: FallbackDecision['source']
  degraded: boolean
  manifestError: string | null
  /** POD-00 EDL artefact for POD-12 (rung 1 only). */
  rateCorrection: ConformPlan['rateCorrection'] | null
  report: ConformReport | null
  ffmpegFilter: string | null
  conformedChecksumSha256: string | null
  at: string
}

export type ConformGuestTrackResult = {
  trackId: string
  decision: FallbackDecision
  plan: ConformPlan | null
  report: StoredConformReport
  mediaAssetId: string | null
  recordingId: string | null
  manifestUpdated: boolean
}

export async function runGuestConformJob(
  payload: MediaPublishingStore,
  config: AppConfig | undefined,
  input: {
    sessionRecordId: string
    inviteId: string
    /** Where the guest's uploaded journal chunks live. */
    storage: ChunkStorage
    /** The live-capture ISO track (fallback rung 2), when the host recorded one. */
    liveCapture?: { definition: TrackDefinition; storage: ChunkStorage } | null
    sessionFrames: number
    sampleRate?: number
    /** Test seam: skip the ffmpeg pass and use the pure resample path's output. */
    ffmpeg?: string
  },
): Promise<ConformGuestTrackResult> {
  const resolvedConfig = config ?? loadConfig()
  const sampleRate = input.sampleRate ?? 48_000
  const record = await loadStudioSessionRecord(payload as never, input.sessionRecordId)
  if (!record) throw new PodcastConformError('session-not-found', 'Studio session not found.')
  const invite = await payload
    .findByID({
      collection: 'podcast-guest-invites',
      id: input.inviteId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!invite) throw new PodcastConformError('invite-not-found', 'Guest invite not found.')
  if (relationId((invite as any).session) !== input.sessionRecordId) {
    throw new PodcastConformError(
      'invite-wrong-session',
      'Conform refused: the invite belongs to a different session.',
    )
  }
  const trackId = guestLocalTrackId(input.inviteId)
  const guestId = relationId((invite as any).guest) || null
  const guestLabel = String((invite as any).displayName ?? input.inviteId)
  const meta = readGuestRecordingMeta(record.session, input.inviteId)

  // --- Guest journal recovery + readiness -------------------------------
  const journalRecordingId = `${record.session.id}__${trackId}`
  const recovery = await recoverRecording(input.storage, journalRecordingId).catch(() => null)
  const readiness = evaluateConformReadiness(
    recovery,
    meta?.uploadComplete ? meta.totalChunks : null,
  )
  // The recovered journal is a gapless run from chunk 0, so chunk
  // positions are cumulative frame counts on the guest clock.
  const guestChunks: AssemblyChunk[] = []
  if (recovery) {
    let cursor = 0
    for (const index of recovery.admittedChunks) {
      const bytes = await input.storage.getChunk(journalRecordingId, index)
      if (!bytes) continue
      const pcm = int16BytesToFloat(bytes)
      guestChunks.push({ startSample: cursor, pcm })
      cursor += pcm.length
    }
  }

  // --- Live-capture track (fallback rung 2 source) ----------------------
  let liveCapture: { chunks: AssemblyChunk[]; joinedAtSample: number } | null = null
  if (input.liveCapture) {
    const loaded = await loadTrackFromStorage(
      input.liveCapture.storage,
      input.liveCapture.definition,
      record.session.id,
    )
    if (loaded.input.chunks.length > 0) {
      liveCapture = {
        chunks: loaded.input.chunks,
        joinedAtSample: input.liveCapture.definition.joinedAtSample,
      }
    }
  }

  const hasSync = Boolean(meta?.headSync && meta?.tailSync)
  // Chunks without sync pairs cannot be conformed — an incomplete
  // track by another name, expressed as a readiness refusal so the
  // fallback ladder hears the named reason.
  const effectiveReadiness =
    guestChunks.length > 0 && !hasSync
      ? {
          ok: false as const,
          code: 'conform-track-incomplete' as const,
          state: 'track-incomplete' as const,
          message:
            'Conform refused (state: track-incomplete): the guest upload carries no head/tail sync pairs, so no rate correction can be computed.',
        }
      : readiness
  const localForAssembly =
    guestChunks.length > 0 && hasSync
      ? {
          chunks: guestChunks,
          head: meta!.headSync!,
          tail: meta!.tailSync!,
          gaps: meta!.gaps ?? [],
          readiness: effectiveReadiness,
        }
      : null

  const assembled = assembleGuestWithFallback(
    {
      trackId,
      guestId: guestId ?? undefined,
      guestLabel,
      local: localForAssembly ? { ...localForAssembly, readiness: effectiveReadiness } : null,
      liveCapture,
    },
    input.sessionFrames,
    sampleRate,
  )
  const decision = assembled.decision
  const plan = assembled.plan

  // --- Produce the ISO asset -------------------------------------------
  let mediaAssetId: string | null = null
  let conformedChecksum: string | null = null
  let ffmpegFilter: string | null = null
  let finalWavBytes: Uint8Array | null = null
  if (decision.rung === 1 && plan && localForAssembly) {
    // Raw guest WAV on the GUEST clock (chunks concatenated by
    // position — holes stay silent, exactly as journalled).
    const guestFrames = guestChunks.reduce(
      (max, chunk) => Math.max(max, chunk.startSample + chunk.pcm.length),
      0,
    )
    const rawPcm = new Float32Array(guestFrames)
    for (const chunk of guestChunks) rawPcm.set(chunk.pcm, chunk.startSample)
    const rawWav = encodeWavPcm16(rawPcm, 1, sampleRate)
    const correctedWav = await runFfmpegRateCorrection(rawWav, plan, {
      channels: 1,
      ffmpeg: input.ffmpeg,
    })
    ffmpegFilter = `asetrate=${Number(plan.rateCorrection.measuredRateHz.toFixed(5))},aresample=${sampleRate}`
    const corrected = decodeWavPcm16(correctedWav)
    // Sample-accurate head-offset placement onto the session timeline.
    const timeline = new Float32Array(input.sessionFrames)
    const offset = plan.report.offsetSamplesAtHead
    const writable = Math.min(corrected.pcm.length, Math.max(0, input.sessionFrames - offset))
    if (writable > 0) timeline.set(corrected.pcm.subarray(0, writable), offset)
    finalWavBytes = encodeWavPcm16(timeline, 1, sampleRate)
  } else if (decision.rung === 2) {
    finalWavBytes = encodeWavPcm16(assembled.track.pcm, assembled.track.channels, sampleRate)
  }
  if (finalWavBytes) {
    conformedChecksum = sha256Hex(finalWavBytes)
    mediaAssetId = await storeTrackAsset(payload, resolvedConfig, {
      siteId: record.siteId,
      showId: record.showId,
      sessionId: record.session.id,
      trackId,
      role: 'guest',
      wavBytes: finalWavBytes,
      checksumSha256: conformedChecksum,
      durationSec: input.sessionFrames / sampleRate,
    })
  }

  const storedReport: StoredConformReport = {
    inviteId: input.inviteId,
    trackId,
    guestId,
    state: decision.state,
    source: decision.source,
    degraded: decision.degraded,
    manifestError: decision.manifestError,
    rateCorrection: plan?.rateCorrection ?? null,
    report: plan?.report ?? null,
    ffmpegFilter,
    conformedChecksumSha256: conformedChecksum,
    at: new Date().toISOString(),
  }

  // --- Persist: session-doc entry + recording record manifest ----------
  if (meta) {
    await upsertGuestRecordingMeta(payload as never, input.sessionRecordId, {
      ...meta,
      conformReport: storedReport,
    })
  } else {
    const doc = record.session as any
    const entries: any[] = Array.isArray(doc.guestRecordings) ? doc.guestRecordings : []
    entries.push({
      inviteId: input.inviteId,
      trackId,
      uploadComplete: false,
      totalChunks: null,
      totalFrames: null,
      journalChecksum: null,
      headSync: null,
      tailSync: null,
      gaps: [],
      completedAt: null,
      conformReport: storedReport,
    })
    doc.guestRecordings = entries
    await saveStudioSessionRecord(payload as never, record.id, record.session)
  }

  let recordingId: string | null = null
  let manifestUpdated = false
  const existingRecord = await payload
    .find({
      collection: PODCAST_RECORDING_COLLECTION,
      where: { session: { equals: input.sessionRecordId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    .then((found: any) => found.docs[0] ?? null)
    .catch(() => null)
  if (existingRecord) {
    recordingId = relationId(existingRecord)
    const manifest = (existingRecord as any).manifest as any
    const reports: StoredConformReport[] = Array.isArray((existingRecord as any).conformReports)
      ? (existingRecord as any).conformReports
      : []
    const reportIdx = reports.findIndex((entry) => entry.trackId === trackId)
    if (reportIdx >= 0) reports[reportIdx] = storedReport
    else reports.push(storedReport)
    if (manifest && Array.isArray(manifest.tracks)) {
      const track = manifest.tracks.find((entry: any) => entry.trackId === trackId)
      if (track) {
        if (mediaAssetId) track.mediaAssetId = mediaAssetId
        if (plan) {
          track.rateCorrectionPpm = plan.rateCorrection.rateCorrectionPpm
          track.syncEvents = plan.syncEvents
        }
        track.conform = {
          state: decision.state,
          source: decision.source,
          report: storedReport.report,
          rateCorrection: storedReport.rateCorrection,
        }
        track.degraded = Boolean(track.degraded || decision.degraded)
        const errors: string[] = Array.isArray(track.errors) ? track.errors : []
        if (decision.manifestError && !errors.includes(decision.manifestError)) {
          errors.push(decision.manifestError)
        }
        track.errors = errors
        if (decision.rung === 3) {
          track.gaps = [
            {
              fromSample: 0,
              toSample: input.sessionFrames,
              frames: input.sessionFrames,
              reason: 'missing-chunk',
            },
          ]
        }
        manifestUpdated = true
      }
    }
    await payload.update({
      collection: PODCAST_RECORDING_COLLECTION,
      id: recordingId,
      data: {
        conformReports: reports,
        ...(manifestUpdated ? { manifest } : {}),
        ...(decision.degraded
          ? {
              state: 'degraded',
              errorMessage: [
                String((existingRecord as any).errorMessage ?? ''),
                decision.manifestError ?? '',
              ]
                .filter(Boolean)
                .join('\n')
                .slice(0, 2000),
            }
          : {}),
      },
      overrideAccess: true,
    } as never)
  }

  return {
    trackId,
    decision,
    plan,
    report: storedReport,
    mediaAssetId,
    recordingId,
    manifestUpdated,
  }
}

/** Enqueues the conform task for one guest, deduplicated like the POD-09 finalize queue. */
export async function queuePodcastConformTrackTask(
  payload: MediaPublishingStore & {
    jobs: { queue: (args: any) => Promise<{ id: string | number }> }
  },
  input: {
    sessionRecordId: string
    inviteId: string
    storageRoot: string
    sessionFrames: number
    sampleRate?: number
    liveCapture?: { definition: TrackDefinition; storageRoot: string } | null
  },
): Promise<{ id: string; queued: boolean }> {
  const idempotencyKey = `podcast-conform-track:${input.sessionRecordId}:${input.inviteId}`
  const existing = await payload
    .find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: PODCAST_CONFORM_TRACK_TASK } },
          { 'input.idempotencyKey': { equals: idempotencyKey } },
        ],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => ({ docs: [] as any[] }))
  const active = (existing as any).docs.find((job: any) => !job.hasError && !job.completedAt)
  if (active) return { id: String(active.id), queued: false }
  const job = await payload.jobs.queue({
    task: PODCAST_CONFORM_TRACK_TASK,
    queue: 'media',
    input: { ...input, idempotencyKey },
  } as never)
  return { id: String(job.id), queued: true }
}

// Re-exported for the task wrapper's plan-only checks.
export { computeConformPlan }
