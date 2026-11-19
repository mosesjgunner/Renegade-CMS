/**
 * POD-08 — Server waveform peaks for media assets.
 *
 * Peaks are generated on the server (never in the browser from the
 * delivery file) so every player shows the same waveform and cueing is
 * sample-honest. Generation follows the `audio-recipe-task` pattern in
 * tasks.ts: a queued Payload task (`media-peaks`) wraps
 * `generatePeaksForAsset`, which resolves the asset's original bytes
 * exactly like `processAudioRecipe` does, decodes them with the local
 * ffmpeg (the repo's `local-ffmpeg` pattern from video.ts), reduces
 * the PCM to min/max pairs, and stores the result on the asset's
 * `waveformPeaks` json field.
 *
 * Peaks format (version 1):
 * - `peaksPerSecond: 100` — the stated resolution: 100 min/max pairs
 *   per second of audio (480-sample buckets at the 48 kHz working
 *   rate), enough for 0.1 s cue precision at full zoom.
 * - `min` / `max`: parallel arrays of peak amplitudes in [-1, 1],
 *   rounded to 4 decimal places, merged across channels (min of mins,
 *   max of maxes) — a single overview lane, which is what the desk
 *   waveform renders.
 * - `sourceChecksum`: the asset checksum the peaks were computed from.
 *   Re-running the job for unchanged bytes is a no-op (idempotent):
 *   the stored peaks are returned without decoding again.
 *
 * The pure reduction (`computePeaksFromPcm`) is unit-tested directly;
 * `generatePeaksForBytes` runs the real ffmpeg decode path and is
 * covered against a generated WAV fixture in the POD-08 tests.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'

import type { AppConfig } from '../core/config'
import { mediaStorage, type MediaStorage } from './storage'
import { MediaWorkflowError } from './workflow'

export const PEAKS_FORMAT_VERSION = 1
export const PEAKS_PER_SECOND = 100
export const PEAKS_SAMPLE_RATE = 48000

export type WaveformPeaksData = {
  version: typeof PEAKS_FORMAT_VERSION
  /** Stated resolution: min/max pairs per second of audio. */
  peaksPerSecond: typeof PEAKS_PER_SECOND
  /** Sample rate the peaks were reduced from (the POD-00 working rate). */
  sampleRate: typeof PEAKS_SAMPLE_RATE
  durationSec: number
  sourceChecksum: string
  min: number[]
  max: number[]
}

const round4 = (value: number): number => Math.round(value * 10000) / 10000

/**
 * Pure peaks reduction: channel PCM (float, -1..1) → min/max pairs at
 * PEAKS_PER_SECOND. Channels merge by extremes. Deterministic: the
 * same PCM always produces byte-identical peaks (idempotence).
 */
export function computePeaksFromPcm(
  channels: Float32Array[],
  sampleRate: number,
  sourceChecksum: string,
): WaveformPeaksData {
  if (channels.length === 0 || channels[0].length === 0) {
    return {
      version: PEAKS_FORMAT_VERSION,
      peaksPerSecond: PEAKS_PER_SECOND,
      sampleRate: PEAKS_SAMPLE_RATE,
      durationSec: 0,
      sourceChecksum,
      min: [],
      max: [],
    }
  }
  const frames = channels[0].length
  const bucketFrames = Math.max(1, Math.round(sampleRate / PEAKS_PER_SECOND))
  const peakCount = Math.ceil(frames / bucketFrames)
  const min: number[] = new Array(peakCount).fill(0)
  const max: number[] = new Array(peakCount).fill(0)
  for (let peak = 0; peak < peakCount; peak++) {
    const start = peak * bucketFrames
    const end = Math.min(frames, start + bucketFrames)
    let lo = Infinity
    let hi = -Infinity
    for (const channel of channels) {
      for (let i = start; i < end; i++) {
        const sample = channel[i]
        if (sample < lo) lo = sample
        if (sample > hi) hi = sample
      }
    }
    min[peak] = round4(Number.isFinite(lo) ? lo : 0)
    max[peak] = round4(Number.isFinite(hi) ? hi : 0)
  }
  return {
    version: PEAKS_FORMAT_VERSION,
    peaksPerSecond: PEAKS_PER_SECOND,
    sampleRate: PEAKS_SAMPLE_RATE,
    durationSec: Math.round((frames / sampleRate) * 1000) / 1000,
    sourceChecksum,
    min,
    max,
  }
}

const runFfmpegDecodeToPcm = async (inputPath: string, ffmpeg: string): Promise<Float32Array> =>
  await new Promise((resolve, reject) => {
    // Decode to the working format (48 kHz, mono mix-down for the
    // overview lane) as signed 16-bit PCM on stdout.
    const child = spawn(
      ffmpeg,
      [
        '-v',
        'error',
        '-i',
        inputPath,
        '-ac',
        '1',
        '-ar',
        String(PEAKS_SAMPLE_RATE),
        '-f',
        's16le',
        '-',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const chunks: Buffer[] = []
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => (stderr += String(chunk).slice(-8000)))
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(
          new Error(`ffmpeg peaks decode failed (${code ?? 'signal'}): ${stderr.slice(-1000)}`),
        )
        return
      }
      const bytes = Buffer.concat(chunks)
      const samples = new Float32Array(bytes.length / 2)
      for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(i * 2) / 32768
      resolve(samples)
    })
  })

/**
 * Generates peaks from raw audio bytes via the real ffmpeg decode
 * path. The container is sniffed by ffmpeg itself; the temp input file
 * carries no extension trust (ffmpeg probes content, not names).
 */
export async function generatePeaksForBytes(
  bytes: Uint8Array,
  options: { ffmpeg?: string; sourceChecksum?: string } = {},
): Promise<WaveformPeaksData> {
  const sourceChecksum =
    options.sourceChecksum ?? `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const directory = await mkdtemp(path.join(os.tmpdir(), 'renegade-peaks-'))
  const input = path.join(directory, 'source')
  try {
    await writeFile(input, bytes)
    const pcm = await runFfmpegDecodeToPcm(
      input,
      options.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg',
    )
    if (pcm.length === 0) throw new MediaWorkflowError('Audio decoded to zero samples.', 422)
    return computePeaksFromPcm([pcm], PEAKS_SAMPLE_RATE, sourceChecksum)
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * The queued job's core (task slug `media-peaks` in tasks.ts): resolves
 * the asset's original bytes like `processAudioRecipe`, generates
 * peaks, and stores them on `waveformPeaks`. Idempotent: when the
 * stored peaks' sourceChecksum already matches the asset checksum,
 * the stored peaks are returned and nothing is decoded or written.
 */
export async function generatePeaksForAsset(
  payload: Payload,
  config: AppConfig,
  assetId: string,
  storageOverride?: MediaStorage,
): Promise<WaveformPeaksData> {
  const asset = (await payload.findByID({
    collection: 'media-assets',
    id: assetId,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown> | null

  if (!asset) throw new MediaWorkflowError('Media asset not found.', 404)
  if (asset.kind !== 'audio') throw new MediaWorkflowError('Asset is not an audio file.', 400)

  const existing = asset.waveformPeaks as WaveformPeaksData | undefined
  if (
    existing &&
    existing.version === PEAKS_FORMAT_VERSION &&
    typeof asset.checksum === 'string' &&
    asset.checksum.length > 0 &&
    existing.sourceChecksum === asset.checksum
  ) {
    return existing
  }

  const storage = storageOverride ?? mediaStorage(config)
  let key = String(asset.storageLocation || '')
  if (asset.originalBlob) {
    const blobId =
      typeof asset.originalBlob === 'object' && asset.originalBlob !== null
        ? String((asset.originalBlob as { id?: string }).id)
        : String(asset.originalBlob)
    const blob = (await payload
      .findByID({
        collection: 'media-blobs',
        id: blobId,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => undefined)) as unknown as Record<string, unknown> | undefined
    if (blob?.storageKey) key = String(blob.storageKey)
  }
  if (key.startsWith('local://')) key = key.slice('local://'.length)

  const originalBytes = await storage.get(key)
  if (!originalBytes)
    throw new MediaWorkflowError('Original audio file is missing from storage.', 404)

  const peaks = await generatePeaksForBytes(originalBytes, {
    sourceChecksum:
      typeof asset.checksum === 'string' && asset.checksum ? asset.checksum : undefined,
  })

  await payload.update({
    collection: 'media-assets',
    id: assetId,
    overrideAccess: true,
    data: { waveformPeaks: peaks },
  } as never)

  return peaks
}
