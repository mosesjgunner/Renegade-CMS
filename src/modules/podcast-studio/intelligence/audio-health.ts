/**
 * Audio pass — PCM-level health analysis (PURE core + ffmpeg decode).
 *
 * One measurement core shared by the render's source-health report,
 * the file cleanup chain, and the pre-record room check:
 *
 * - peak / RMS level,
 * - noise floor: the 10th-percentile 50 ms window RMS — what a room
 *   sounds like when nobody is talking,
 * - speech level: the 90th-percentile 50 ms window RMS — how loud the
 *   voice actually arrives,
 * - clipped ranges: runs of full-scale samples. A single sample at
 *   0 dBFS is a hot peak, not proof of clipping; a RANGE requires at
 *   least `minClipFrames` consecutive at-rail frames (the flat top a
 *   hard clip leaves behind), and nearby ranges merge. Clipping is
 *   REPORTED here, never repaired — clipped audio is gone, and the
 *   honest move is to flag it (the gap sheet's control rule).
 *
 * The pure core runs on decoded s16le PCM so it is headlessly
 * testable; `measureFileHealth` decodes through the shared engine
 * resolver (src/modules/media/ffmpeg.ts) exactly like the render's
 * own PCM cross-check does.
 */
import { spawn } from 'node:child_process'

import { resolveFfmpegBinary, resolveFfprobeBinary } from '../../media/ffmpeg'

export type ClippedRange = {
  startSec: number
  endSec: number
  /** The rail level the flat top sits at (≈ 0 dBFS for full-scale clipping). */
  peakDbfs: number
  /** At-rail frames inside the range. */
  frames: number
}

export type PcmHealth = {
  durationSec: number
  sampleRate: number
  channels: number
  peakDbfs: number
  rmsDbfs: number
  noiseFloorDbfs: number
  speechLevelDbfs: number
  clippedRanges: ClippedRange[]
  /** Total at-rail frames, including isolated hot peaks that are not ranges. */
  atRailFrames: number
}

export class AudioHealthError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'AudioHealthError'
    this.code = code
  }
}

const DB_FLOOR = -120
const toDb = (linear: number): number =>
  linear > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(linear)) : DB_FLOOR

export type ClipDetectionOptions = {
  /** Consecutive at-rail frames that count as a flat top. Default 4. */
  minClipFrames?: number
  /** Ranges closer than this merge into one. Default 0.05 s. */
  mergeGapSec?: number
  /** |sample| at or above this (of 32768) counts as at-rail. Default 32767. */
  railThreshold?: number
}

/**
 * Analyses interleaved s16le PCM. Windows are 50 ms; percentiles are
 * taken over window RMS values so a few loud bursts cannot move the
 * noise floor and a few pauses cannot move the speech level.
 */
export const analyzePcmHealth = (
  samples: Int16Array,
  input: { channels: number; sampleRate: number },
  clipOptions: ClipDetectionOptions = {},
): PcmHealth => {
  const channels = Math.max(1, Math.floor(input.channels) || 1)
  const sampleRate = input.sampleRate > 0 ? input.sampleRate : 48000
  const frames = Math.floor(samples.length / channels)
  const minClipFrames = clipOptions.minClipFrames ?? 4
  const mergeGapFrames = Math.round((clipOptions.mergeGapSec ?? 0.05) * sampleRate)
  const rail = clipOptions.railThreshold ?? 32767

  let peak = 0
  let sumSquares = 0
  const windowFrames = Math.max(1, Math.round(sampleRate * 0.05))
  const windowRms: number[] = []
  let windowSum = 0
  let windowCount = 0

  const ranges: ClippedRange[] = []
  let atRailFrames = 0
  let runStart = -1
  let runLength = 0
  let runPeak = 0
  const closeRun = (endFrame: number) => {
    if (runStart >= 0 && runLength >= minClipFrames) {
      ranges.push({
        startSec: runStart / sampleRate,
        endSec: endFrame / sampleRate,
        peakDbfs: toDb(runPeak / 32768),
        frames: runLength,
      })
    }
    runStart = -1
    runLength = 0
    runPeak = 0
  }

  for (let frame = 0; frame < frames; frame++) {
    let framePeak = 0
    let frameSquareSum = 0
    for (let ch = 0; ch < channels; ch++) {
      const value = samples[frame * channels + ch]
      const abs = Math.abs(value)
      if (abs > framePeak) framePeak = abs
      frameSquareSum += value * value
    }
    if (framePeak > peak) peak = framePeak
    const meanSquare = frameSquareSum / channels / (32768 * 32768)
    sumSquares += meanSquare
    windowSum += meanSquare
    windowCount++
    if (windowCount === windowFrames) {
      windowRms.push(Math.sqrt(windowSum / windowCount))
      windowSum = 0
      windowCount = 0
    }
    if (framePeak >= rail) {
      atRailFrames++
      if (runStart < 0) {
        runStart = frame
        runLength = 1
        runPeak = framePeak
      } else {
        runLength++
        if (framePeak > runPeak) runPeak = framePeak
      }
    } else if (runStart >= 0) {
      closeRun(frame)
    }
  }
  if (windowCount > 0) windowRms.push(Math.sqrt(windowSum / windowCount))
  closeRun(frames)

  // Merge ranges separated by less than the merge gap (a clipped
  // passage with brief dips below the rail is one damaged section).
  const merged: ClippedRange[] = []
  for (const range of ranges) {
    const prev = merged[merged.length - 1]
    if (prev && range.startSec - prev.endSec <= mergeGapFrames / sampleRate) {
      prev.endSec = range.endSec
      prev.frames += range.frames
      prev.peakDbfs = Math.max(prev.peakDbfs, range.peakDbfs)
    } else {
      merged.push({ ...range })
    }
  }

  const sorted = [...windowRms].sort((a, b) => a - b)
  const percentile = (p: number): number => {
    if (sorted.length === 0) return 0
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))
    return sorted[index]
  }

  return {
    durationSec: frames / sampleRate,
    sampleRate,
    channels,
    peakDbfs: toDb(peak / 32768),
    rmsDbfs: frames > 0 ? toDb(Math.sqrt(sumSquares / frames)) : DB_FLOOR,
    noiseFloorDbfs: toDb(percentile(0.1)),
    speechLevelDbfs: toDb(percentile(0.9)),
    clippedRanges: merged.map((range) => ({
      ...range,
      startSec: Math.round(range.startSec * 1000) / 1000,
      endSec: Math.round(range.endSec * 1000) / 1000,
      peakDbfs: Math.round(range.peakDbfs * 10) / 10,
    })),
    atRailFrames,
  }
}

// ---------------------------------------------------------------------------
// File decoding (real ffmpeg, through the shared resolver)
// ---------------------------------------------------------------------------

type ProbedShape = { channels: number; sampleRate: number }

const probeShape = async (filePath: string, ffprobe: string): Promise<ProbedShape> => {
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      ffprobe,
      ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-select_streams', 'a:0', filePath],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (err += String(chunk).slice(-2000)))
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(
            new AudioHealthError(
              'AUDIO_HEALTH_PROBE_FAILED',
              `ffprobe failed (${code ?? 'signal'}) on ${filePath}: ${err.slice(-400)}`,
            ),
          ),
    )
  })
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ channels?: number; sample_rate?: string }>
  }
  const stream = parsed.streams?.[0]
  return {
    channels: Number(stream?.channels ?? 0) || 1,
    sampleRate: Number(stream?.sample_rate ?? 0) || 48000,
  }
}

const decodePcm = async (
  filePath: string,
  ffmpeg: string,
  shape: ProbedShape,
): Promise<Int16Array> => {
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        '-v',
        'error',
        '-i',
        filePath,
        '-f',
        's16le',
        '-acodec',
        'pcm_s16le',
        '-ac',
        String(shape.channels),
        '-ar',
        String(shape.sampleRate),
        '-',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const chunks: Buffer[] = []
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => (err += String(chunk).slice(-2000)))
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(
            new AudioHealthError(
              'AUDIO_HEALTH_DECODE_FAILED',
              `ffmpeg PCM decode failed (${code ?? 'signal'}) on ${filePath}: ${err.slice(-400)}`,
            ),
          ),
    )
  })
  return new Int16Array(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength - (bytes.byteLength % 2),
    ),
  )
}

/** Decodes a file through the resolved engine and analyses its PCM health. */
export const measureFileHealth = async (
  filePath: string,
  options: { ffmpeg?: string; ffprobe?: string; clip?: ClipDetectionOptions } = {},
): Promise<PcmHealth> => {
  const ffmpeg = resolveFfmpegBinary(options.ffmpeg)
  const ffprobe = resolveFfprobeBinary(options.ffprobe)
  const shape = await probeShape(filePath, ffprobe)
  const samples = await decodePcm(filePath, ffmpeg, shape)
  return analyzePcmHealth(samples, shape, options.clip)
}
