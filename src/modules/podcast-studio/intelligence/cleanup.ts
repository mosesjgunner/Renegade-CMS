/**
 * POD-14 — audio cleanup chain (render-time). Named, toggleable
 * options applied on the program bus:
 *
 * - hum removal: notch (band-reject) at the mains frequency and its
 *   first harmonic (50 Hz or 60 Hz regions),
 * - noise gate: the POD-07 room-gate preset rendered as a static
 *   ffmpeg `agate` (same mapping POD-13 uses per-lane),
 * - de-esser: the ffmpeg `deesser` at the voice preset,
 * - silence trim: head/tail silence is MEASURED with ffmpeg
 *   `silencedetect` at a stated threshold/duration and the measured
 *   points become an `atrim` — it lives at file level (not inside
 *   the POD-13 graph) because trimming inside the graph would shift
 *   the timeline under the EDL's chapters/cues; the render graph
 *   takes the other three filters via `cleanupProgramFilters`.
 *
 * Audio pass (pre-RC3) — two more file-level stages, applied by
 * `applyCleanupToFile` ahead of the bus filters (they are per-source
 * treatments, so they do NOT join `cleanupProgramFilters`; the render
 * graph applies denoise per lane instead — see render.ts):
 *
 * - broadband denoise: ffmpeg `afftdn` spectral reduction with a
 *   TRACKED noise floor — the steady fan/HVAC/room tone that sits
 *   UNDER speech, which the gate cannot touch (it only mutes between
 *   phrases). Conservative by design: modest strength and gain
 *   smoothing against musical noise. The filter's floor is set from
 *   the MEASURED room floor (a guessed floor silently disables the
 *   stage — see `denoiseFilter`). Strength is a control, not a fixed
 *   value, and the stage has an off switch like every other.
 * - de-click: ffmpeg `adeclick` impulsive-noise removal. OFF by
 *   default — it is a repair tool for damaged sources, not a
 *   mastering stage. (Its sibling `adeclip` is deliberately NOT
 *   offered anywhere: clipped audio is flagged in the health
 *   report, never silently "repaired".)
 * - de-reverb: NOT AVAILABLE with local tooling at a quality bar we
 *   would ship — named as a limitation in the seller docs rather
 *   than faked with a gate trick.
 *
 * `applyCleanupToFile` is the measurable file-level chain used for
 * pre-render cleanup of a finished master or a single track; it
 * reports before/after measurements: duration, the hum-band energy
 * (band-passed RMS at the notch frequency), and — when denoise is
 * enabled — the PCM noise floor / speech level and any clipped
 * ranges, so tests assert real reductions, not filter-string
 * presence.
 */
import { execFile } from 'node:child_process'

import { resolveFfmpegBinary, resolveFfprobeBinary } from '../../media/ffmpeg'
import { measureFileHealth, type ClippedRange } from './audio-health'

export type CleanupOptions = {
  humRemoval?: { enabled: boolean; frequencyHz?: 50 | 60 }
  noiseGate?: { enabled: boolean; preset?: 'voice' }
  deEsser?: { enabled: boolean; preset?: 'voice' }
  silenceTrim?: {
    enabled: boolean
    /** Silence threshold in dBFS (negative). Default −45. */
    thresholdDb?: number
    /** Minimum silence duration to count, seconds. Default 0.5. */
    minSilenceSec?: number
  }
  denoise?: {
    enabled: boolean
    /**
     * Noise reduction strength in dB (afftdn `nr`). Default 9 —
     * deliberately under afftdn's own 12 dB default: the owner is an
     * audiophile and artifacts are a failure, not a trade-off.
     */
    strengthDb?: number
    /** Starting noise-floor estimate in dBFS (afftdn `nf`); the floor is tracked from there. Default −55. */
    floorDb?: number
  }
  deClick?: { enabled: boolean }
}

export const VOICE_CLEANUP_PRESET: Required<CleanupOptions> = {
  humRemoval: { enabled: true, frequencyHz: 60 },
  noiseGate: { enabled: true, preset: 'voice' },
  deEsser: { enabled: true, preset: 'voice' },
  silenceTrim: { enabled: true, thresholdDb: -45, minSilenceSec: 0.5 },
  denoise: { enabled: true, strengthDb: 9, floorDb: -55 },
  deClick: { enabled: false },
}

/**
 * The afftdn filter for the denoise stage. Two parameters are
 * load-bearing, both measured on this chain's bad-session fixture:
 *
 * - `nf`: afftdn only reduces noise ABOVE its floor estimate, so a
 *   floor set far under the real room (the −50 default against a
 *   −36 dBFS fan) silently does nothing. Callers therefore pass the
 *   MEASURED floor (`denoiseFloorForMeasurement`); the static
 *   `floorDb` option is only the fallback when no measurement
 *   exists.
 * - `ad` (adaptivity) stays LOW (0.2): at ad=1 the tracker
 *   converges onto steady program material itself and the filter
 *   degenerates into a uniform −nr dB cut across EVERYTHING —
 *   speech included (measured: fan, speech and sibilance all down
 *   exactly the strength value). At 0.2 the estimate stays with
 *   the room: the fixture's fan drops ~4–5 dB in fan-only segments
 *   while speech segments move ≤ 0.5 dB. Conservative by design —
 *   the owner's bar is that artifacts are a failure, not a
 *   trade-off.
 */
export const denoiseFilter = (options: NonNullable<CleanupOptions['denoise']>): string => {
  const strength = options.strengthDb ?? 9
  const floor = options.floorDb ?? -55
  return `afftdn=nr=${fmt(strength)}:nf=${fmt(floor)}:tn=1:ad=0.2:gs=4`
}

/**
 * The afftdn floor for a measured noise floor: a few dB above the
 * measurement (afftdn reduces what sits above its floor; the
 * tracker converges from there), clamped to the filter's range.
 */
export const denoiseFloorForMeasurement = (measuredNoiseFloorDbfs: number): number =>
  Math.round(Math.min(-20, Math.max(-70, measuredNoiseFloorDbfs + 6)) * 10) / 10

/** The adeclick filter for the (off-by-default) de-click stage. */
export const deClickFilter = (): string => 'adeclick=w=55:o=75:t=2'

export class CleanupError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'CleanupError'
    this.code = code
  }
}

const fmt = (value: number) => {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/** The enabled cleanup filters for the program chain, in chain order. */
export const cleanupProgramFilters = (
  options: CleanupOptions = {},
): { filters: string[]; names: string[] } => {
  const filters: string[] = []
  const names: string[] = []
  if (options.humRemoval?.enabled) {
    const frequency = options.humRemoval.frequencyHz ?? 60
    filters.push(`bandreject=f=${frequency}:width_type=h:width=6`)
    filters.push(`bandreject=f=${frequency * 2}:width_type=h:width=6`)
    names.push(`hum-notch-${frequency}hz`)
  }
  if (options.noiseGate?.enabled) {
    filters.push('agate=threshold=0.02:range=0.1:ratio=2:attack=20:release=250')
    names.push('noise-gate-voice')
  }
  if (options.deEsser?.enabled) {
    filters.push('deesser=i=0.4:m=0.5:f=0.5')
    names.push('de-esser-voice')
  }
  return { filters, names }
}

type Runner = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

const defaultRunner: Runner = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new CleanupError(
              'CLEANUP_FFMPEG_FAILED',
              `${command} failed: ${error.message}${stderr ? `: ${String(stderr).slice(0, 300)}` : ''}`,
            ),
          )
          return
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) })
      },
    )
  })

export const probeDurationSec = async (
  filePath: string,
  ffprobe: string | undefined = undefined,
  runner: Runner = defaultRunner,
): Promise<number> => {
  const { stdout } = await runner(resolveFfprobeBinary(ffprobe), [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    filePath,
  ])
  const parsed = JSON.parse(stdout) as { format?: { duration?: string } }
  const duration = Number(parsed.format?.duration ?? Number.NaN)
  if (!Number.isFinite(duration))
    throw new CleanupError('CLEANUP_PROBE_FAILED', `Could not probe duration of ${filePath}.`)
  return duration
}

/** Band-passed RMS level (dBFS) at a frequency — the hum measurement. */
export const measureBandEnergyDb = async (
  filePath: string,
  frequencyHz: number,
  ffmpeg: string | undefined = undefined,
  runner: Runner = defaultRunner,
): Promise<number> => {
  const { stderr } = await runner(resolveFfmpegBinary(ffmpeg), [
    '-hide_banner',
    '-i',
    filePath,
    '-af',
    `bandpass=f=${frequencyHz}:width_type=h:width=10,astats=metadata=1:reset=0`,
    '-f',
    'null',
    '-',
  ]).catch((error: unknown) => {
    // astats prints to stderr; a non-zero exit still carries the stats.
    const partial = error as { stderr?: string }
    if (partial?.stderr) return { stdout: '', stderr: partial.stderr }
    throw error
  })
  const match = stderr.match(/RMS level dB:\s*(-?[\d.]+|-inf)/)
  if (!match) return -120
  return match[1] === '-inf' ? -120 : Number(match[1])
}

export type SilenceTrimMeasurement = {
  trimStartSec: number
  trimEndSec: number
  headSilenceSec: number
  tailSilenceSec: number
  thresholdDb: number
  minSilenceSec: number
}

/** Measures head/tail silence with silencedetect at the stated thresholds. */
export const detectSilenceTrim = async (
  filePath: string,
  options: { thresholdDb?: number; minSilenceSec?: number; durationSec: number },
  ffmpeg: string | undefined = undefined,
  runner: Runner = defaultRunner,
): Promise<SilenceTrimMeasurement> => {
  const thresholdDb = options.thresholdDb ?? -45
  const minSilenceSec = options.minSilenceSec ?? 0.5
  const { stderr } = await runner(resolveFfmpegBinary(ffmpeg), [
    '-hide_banner',
    '-i',
    filePath,
    '-af',
    `silencedetect=noise=${thresholdDb}dB:d=${minSilenceSec}`,
    '-f',
    'null',
    '-',
  ]).catch((error: unknown) => {
    const partial = error as { stderr?: string }
    if (partial?.stderr) return { stdout: '', stderr: partial.stderr }
    throw error
  })
  const events: { start?: number; end?: number }[] = []
  let current: { start?: number; end?: number } | null = null
  for (const line of stderr.split('\n')) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/)
    const endMatch = line.match(/silence_end:\s*([\d.]+)/)
    if (startMatch) {
      current = { start: Number(startMatch[1]) }
      events.push(current)
    }
    if (endMatch && current) current.end = Number(endMatch[1])
  }
  const duration = options.durationSec
  let headSilenceSec = 0
  let tailSilenceSec = 0
  for (const event of events) {
    if (event.start !== undefined && event.start <= 0.05) {
      headSilenceSec = Math.max(headSilenceSec, (event.end ?? duration) - event.start)
    }
    if (event.end !== undefined && Math.abs(event.end - duration) <= 0.1) {
      tailSilenceSec = Math.max(tailSilenceSec, event.end - (event.start ?? 0))
    }
    // A silence that never ends runs to the file end (tail).
    if (event.start !== undefined && event.end === undefined) {
      tailSilenceSec = Math.max(tailSilenceSec, duration - event.start)
      if (event.start <= 0.05) headSilenceSec = duration
    }
  }
  return {
    trimStartSec: Math.round(headSilenceSec * 1000) / 1000,
    trimEndSec: Math.round((duration - tailSilenceSec) * 1000) / 1000,
    headSilenceSec: Math.round(headSilenceSec * 1000) / 1000,
    tailSilenceSec: Math.round(tailSilenceSec * 1000) / 1000,
    thresholdDb,
    minSilenceSec,
  }
}

export type CleanupMeasurements = {
  durationBeforeSec: number
  durationAfterSec: number
  humFrequencyHz: number | null
  humEnergyBeforeDb: number | null
  humEnergyAfterDb: number | null
  trim: SilenceTrimMeasurement | null
  appliedFilters: string[]
  /**
   * PCM health, measured only when the denoise stage is enabled
   * (the decode is the expensive part): noise floor and speech
   * level before/after, plus the input's clipped ranges — flagged,
   * never repaired.
   */
  noiseFloorBeforeDb: number | null
  noiseFloorAfterDb: number | null
  speechLevelBeforeDb: number | null
  speechLevelAfterDb: number | null
  clippedRanges: ClippedRange[]
}

/**
 * Runs the full cleanup chain over one audio file and measures the
 * result. Silence trim (when enabled) is measured first and applied
 * as an atrim window; the program filters follow in chain order.
 */
export const applyCleanupToFile = async (input: {
  inputPath: string
  outputPath: string
  options: CleanupOptions
  ffmpeg?: string
  ffprobe?: string
  runner?: Runner
}): Promise<CleanupMeasurements> => {
  const ffmpeg = resolveFfmpegBinary(input.ffmpeg)
  const ffprobe = resolveFfprobeBinary(input.ffprobe)
  const runner = input.runner ?? defaultRunner
  const durationBeforeSec = await probeDurationSec(input.inputPath, ffprobe, runner)

  const humFrequencyHz = input.options.humRemoval?.enabled
    ? (input.options.humRemoval.frequencyHz ?? 60)
    : null
  const humEnergyBeforeDb =
    humFrequencyHz !== null
      ? await measureBandEnergyDb(input.inputPath, humFrequencyHz, ffmpeg, runner)
      : null

  // Audio pass: PCM health before (only when denoise is enabled —
  // the decode is the expensive part). Clipped ranges ride along:
  // flagged in the measurements, never repaired by any stage.
  const healthBefore = input.options.denoise?.enabled
    ? await measureFileHealth(input.inputPath, { ffmpeg, ffprobe }).catch(() => null)
    : null

  let trim: SilenceTrimMeasurement | null = null
  const chain: string[] = []
  const preNames: string[] = []
  if (input.options.deClick?.enabled) {
    chain.push(deClickFilter())
    preNames.push('de-click')
  }
  if (input.options.denoise?.enabled) {
    // The measured floor drives afftdn (see denoiseFilter); the
    // configured floorDb is only the no-measurement fallback.
    const floorDb =
      healthBefore != null
        ? denoiseFloorForMeasurement(healthBefore.noiseFloorDbfs)
        : input.options.denoise.floorDb
    chain.push(denoiseFilter({ ...input.options.denoise, floorDb }))
    preNames.push('denoise-afftdn')
  }
  if (input.options.silenceTrim?.enabled) {
    trim = await detectSilenceTrim(
      input.inputPath,
      {
        thresholdDb: input.options.silenceTrim.thresholdDb,
        minSilenceSec: input.options.silenceTrim.minSilenceSec,
        durationSec: durationBeforeSec,
      },
      ffmpeg,
      runner,
    )
    if (trim.trimEndSec > trim.trimStartSec && (trim.headSilenceSec > 0 || trim.tailSilenceSec > 0))
      chain.push(
        `atrim=start=${fmt(trim.trimStartSec)}:end=${fmt(trim.trimEndSec)}`,
        'asetpts=PTS-STARTPTS',
      )
  }
  const program = cleanupProgramFilters(input.options)
  chain.push(...program.filters)
  if (chain.length === 0) chain.push('anull')

  await runner(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input.inputPath,
    '-af',
    chain.join(','),
    '-ar',
    '48000',
    input.outputPath,
  ])
  const durationAfterSec = await probeDurationSec(input.outputPath, ffprobe, runner)
  const humEnergyAfterDb =
    humFrequencyHz !== null
      ? await measureBandEnergyDb(input.outputPath, humFrequencyHz, ffmpeg, runner)
      : null
  const healthAfter = healthBefore
    ? await measureFileHealth(input.outputPath, { ffmpeg, ffprobe }).catch(() => null)
    : null
  return {
    durationBeforeSec,
    durationAfterSec,
    humFrequencyHz,
    humEnergyBeforeDb,
    humEnergyAfterDb,
    trim,
    appliedFilters: [...preNames, ...program.names],
    noiseFloorBeforeDb: healthBefore?.noiseFloorDbfs ?? null,
    noiseFloorAfterDb: healthAfter?.noiseFloorDbfs ?? null,
    speechLevelBeforeDb: healthBefore?.speechLevelDbfs ?? null,
    speechLevelAfterDb: healthAfter?.speechLevelDbfs ?? null,
    clippedRanges: healthBefore?.clippedRanges ?? [],
  }
}
