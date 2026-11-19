/**
 * POD-13 (POD-REQ-28, POD-REQ-29) — EDL render core (SERVER, real ffmpeg).
 *
 * Turns a POD-12 edit project's EDL into a publishable program:
 *
 *   EDL → ffmpeg filter graph (per-clip trim/rate/fades/gain/delay,
 *   per-lane POD-07 processing mapped to ffmpeg filters, POD-07 row-37
 *   program bus chain) → pre-norm program WAV in the POD-00 working
 *   format → two-pass loudnorm (measure, then apply with the measured
 *   values, linear when possible — the PT-C proven approach) → WAV
 *   master whose loudness is INDEPENDENTLY re-measured with ebur128
 *   (and cross-checked with the repo's own `measurePcmLoudness` on the
 *   decoded PCM). The render only completes when the measured
 *   integrated loudness is within ±0.5 LU of target and the measured
 *   true peak is at or under the gate ceiling; otherwise it fails with
 *   a named `RENDER_LOUDNESS_GATE` error carrying the measurements —
 *   an out-of-gate master is never promoted silently.
 *
 * Targets are the POD-00 recipe (`podcast-standard-lufs16` in
 * src/modules/media/audio.ts): −16 LUFS stereo / −19 LUFS mono,
 * −1.5 dBTP. An EDL `loudnessTarget` (PT-C shape) overrides them.
 *
 * Timeline semantics are the EDL's own: a clip sounds exactly at its
 * `timelineStart` for its (rate-adjusted) span. A gap between clips
 * is therefore silence in the render, and a ripple delete is audible
 * as the following audio moving earlier — the two delete semantics
 * POD-12 implements are both literal in the graph (per-clip `adelay`
 * placement + `amix`, never concat, so positions can never drift).
 *
 * POD-07 → ffmpeg mapping (honest approximations, also returned in
 * every render report's `approximations` list):
 * - high-pass: `highpass` — faithful (RBJ high-pass in both).
 * - EQ low/high bands: POD-07 uses RBJ shelf biquads; ffmpeg render
 *   uses `equalizer` peaking bands at the same frequency/gain —
 *   APPROXIMATION (shelf shape differs away from the centre).
 * - EQ mid band: `equalizer` peaking with width_type=q — faithful.
 * - compressor: `acompressor` (threshold linear, ratio, attack,
 *   release, makeup linear) — close; knee/envelope details differ
 *   from POD-07's per-sample feedforward tracker — APPROXIMATION.
 * - limiter: `alimiter` with latency compensation — close; POD-07's
 *   limiter is an instant-attack peak follower — APPROXIMATION.
 * - room gate: POD-07's gate is SELF-SETTING (threshold tracks a
 *   noise-floor estimate, floor −20 dB, never fully closes). ffmpeg
 *   has no adaptive equivalent, so the gate renders ONLY when the
 *   lane's params carry an explicit `gateThresholdDb`, as a static
 *   `agate` whose `range` defaults to the POD-07 floor gain (0.1) —
 *   APPROXIMATION, named wherever it applies.
 *
 * Failure behaviour: a source referenced by an audible lane whose
 * file is missing fails BEFORE any ffmpeg run with the named
 * `RENDER_SOURCE_MISSING` error (source id + asset/file named). All
 * outputs are written inside a caller-owned work directory; the
 * service layer registers media assets only after this core returns
 * a gate-passing result, so a failed render registers nothing.
 *
 * Audio pass (pre-RC3) additions, all opt-in at this layer and
 * defaulted on for master renders by the service:
 * - per-lane broadband denoise (afftdn, floor set from the MEASURED
 *   per-source noise floor — see intelligence/cleanup.ts),
 * - per-speaker leveling (leveling.ts): lanes are measured and
 *   gained toward a reference before the graph is built; the plan
 *   rides in the result and the loudness gate still has the final
 *   word,
 * - source health: every audible source is PCM-measured before the
 *   chain; clipped ranges are FLAGGED in the result, never repaired.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { measurePcmLoudness } from '../../media/audio'
import { resolveFfmpegBinary, resolveFfprobeBinary } from '../../media/ffmpeg'
import { parseEdl, type EdlChapter } from '../contracts/edl'
import { measureFileHealth, type ClippedRange } from '../intelligence/audio-health'
import {
  cleanupProgramFilters,
  denoiseFilter,
  denoiseFloorForMeasurement,
  type CleanupOptions,
} from '../intelligence/cleanup'
import { editDurationSec, type EditClip, type EditEdl, type EditTrack } from '../edit/edl-engine'
import { dbToLinear } from '../mixer/processing'
import {
  applyLevelingToEdl,
  deferredLevelingReport,
  measureAllLanesDetailed,
  planLeveling,
  type LevelingOptions,
  type LevelingReport,
} from './leveling'

export const PODCAST_RENDER_RECIPE = 'podcast-standard-lufs16'
export const LOUDNESS_GATE_TOLERANCE_LU = 0.5
/** Gate ceiling for measured true peak: the −1.5 dBTP target plus the 0.1 dB measurement allowance. */
export const TRUE_PEAK_GATE_DB = -1.4

export type RenderProfileName = 'master' | 'preview' | 'clip' | 'audiogram'

export class PodcastRenderError extends Error {
  code: string
  /** Loudness measurements, present on RENDER_LOUDNESS_GATE failures. */
  measurements?: RenderMeasurements
  constructor(code: string, message: string, measurements?: RenderMeasurements) {
    super(message)
    this.name = 'PodcastRenderError'
    this.code = code
    this.measurements = measurements
  }
}

export type RenderSourceFile = {
  sourceId: string
  /** Local file path ffmpeg reads (the service materialises asset bytes to a temp file). */
  path: string
  channels: number
  sampleRate: number
  /** Human-facing origin for error messages (media asset id or file name). */
  origin: string
}

export type LoudnormMeasurement = {
  inputI: number
  inputTp: number
  inputLra: number
  inputThresh: number
  targetOffset: number
}

export type RenderMeasurements = {
  integratedLufs: number
  truePeakDb: number
  loudnessRangeLu?: number
  /** The repo's own PCM loudness approximation over the decoded master (cross-check only). */
  pcmIntegratedLufs: number
  pcmTruePeakDbfs?: number
}

export type RenderedFile = {
  path: string
  filename: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  durationSec?: number
}

export type PodcastChapter = { startTime: number; title: string }

export type RenderTags = {
  title?: string
  artist?: string
  album?: string
  description?: string
  date?: string
  track?: string
}

export type RenderRequest = {
  edl: EditEdl
  sources: RenderSourceFile[]
  /** Caller-owned scratch directory; outputs land in `<workDir>/out`. */
  workDir: string
  profile: RenderProfileName
  /** Window for preview/clip/audiogram profiles (seconds on the EDL timeline). */
  range?: { startSec: number; durationSec: number }
  /** Output channel count; default: 2 when any audible source is stereo, else 1. */
  channels?: 1 | 2
  tags?: RenderTags
  /** Local artwork image path embedded into the MP3 / used by the audiogram. */
  artworkPath?: string | null
  /**
   * POD-21 (POD-18 gap): optional caption track for the audiogram
   * profile — SRT text ALREADY re-timed to the render range (see
   * `segmentsToClipSrt`), burned into the MP4 with ffmpeg's libass
   * `subtitles` filter. Ignored by every other profile. Null/absent
   * renders the original waveform-over-artwork audiogram.
   */
  captionsSrt?: string | null
  /** Base name (no extension) for output files; default 'program'. */
  outputName?: string
  mp3BitrateKbps?: number
  opusBitrateKbps?: number
  /**
   * POD-14 cleanup chain (hum notch / noise gate / de-esser) applied
   * on the program bus before the bus chain. Silence trim is NOT
   * applied in-graph (it would shift the timeline under the EDL's
   * chapters); it is a measured file-level option in
   * intelligence/cleanup.ts.
   */
  cleanup?: CleanupOptions
  /**
   * Audio pass — per-lane broadband denoise default (ffmpeg afftdn,
   * tracked noise floor): applied to every audible lane whose own
   * processing params do not set `denoiseNrDb` (a lane param of 0
   * turns it off for that lane). Same conservative preset as the
   * file chain in intelligence/cleanup.ts.
   */
  denoise?: { enabled: boolean; strengthDb?: number; floorDb?: number }
  /**
   * Audio pass — automatic per-speaker leveling: each audible lane
   * is measured and gained toward a reference before the graph is
   * built (see leveling.ts). The plan rides in the result; the
   * program loudness gate still has the final word.
   */
  leveling?: LevelingOptions
  ffmpeg?: string
  ffprobe?: string
  /** Test seam: invoked at named stages; throwing simulates a worker killed mid-render. */
  faultHook?: (stage: string) => Promise<void> | void
}

/** Per-source PCM health, measured on the raw source files before the chain. */
export type SourceHealth = {
  sourceId: string
  origin: string
  peakDbfs: number
  noiseFloorDbfs: number
  speechLevelDbfs: number
  /** Clipped (flat-topped) ranges in the SOURCE — flagged, never repaired. */
  clippedRanges: ClippedRange[]
}

export type RenderResult = {
  profile: RenderProfileName
  durationSec: number
  frames: number
  sampleRate: number
  channels: number
  /**
   * Audio pass: the leveling report when leveling was enabled,
   * else null. `status` says whether gains were applied, applied
   * with some lanes deferred, or deferred entirely (silent/empty
   * lanes — the deferral and its reasons ride in the report).
   */
  leveling: LevelingReport | null
  /**
   * Audio pass: per-source health measured before the chain, or
   * null when no source could be measured. `anyClipping` is the
   * headline: a clipped source is named here, never silently
   * "fixed" by the chain.
   */
  audioHealth: { sources: SourceHealth[]; anyClipping: boolean } | null
  loudnessTarget: { I: number; TP: number; LRA: number }
  pass1: LoudnormMeasurement
  measurements: RenderMeasurements
  gate: { enforced: boolean; passed: boolean; integratedDeltaLu: number }
  chapters: PodcastChapter[]
  /** POD-21: whether the audiogram MP4 carries burned-in captions. */
  captionsBurnedIn: boolean
  outputs: {
    wavMaster?: RenderedFile
    mp3?: RenderedFile
    opus?: RenderedFile
    chaptersJson?: RenderedFile
    audiogramMp4?: RenderedFile
  }
  filterGraph: string
  approximations: string[]
  loudnormLinearFallback: boolean
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const fmt = (value: number): string => String(Number(value.toFixed(6)))

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

type CommandResult = { stdout: string; stderr: string }

const runCommand = (
  binary: string,
  args: string[],
  options: { timeoutMs?: number; captureStdout?: boolean } = {},
): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdoutChunks: Buffer[] = []
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 30 * 60_000)
    child.stdout.on('data', (chunk: Buffer) => {
      if (options.captureStdout) stdoutChunks.push(chunk)
    })
    child.stderr.on('data', (chunk) => (stderr += String(chunk).slice(-64_000)))
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`${binary} failed (${code ?? 'signal'}): ${stderr.slice(-1500)}`))
        return
      }
      resolve({ stdout: Buffer.concat(stdoutChunks).toString('utf8'), stderr })
    })
  })

const ffmpegPath = (request: RenderRequest): string => resolveFfmpegBinary(request.ffmpeg)
const ffprobePath = (request: RenderRequest): string => resolveFfprobeBinary(request.ffprobe)

export type ProbedAudio = {
  durationSec: number
  frames: number
  sampleRate: number
  channels: number
  codec: string
  format: string
  tags: Record<string, string>
  chapters: PodcastChapter[]
}

/** ffprobe wrapper: duration/frames/channels plus ID3 tags and embedded chapters. */
export async function probeAudioFile(
  filePath: string,
  ffprobe: string = resolveFfprobeBinary(),
): Promise<ProbedAudio> {
  const { stdout } = await runCommand(
    ffprobe,
    [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      filePath,
    ],
    { captureStdout: true },
  )
  const parsed = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>
    format?: Record<string, unknown>
    chapters?: Array<Record<string, unknown>>
  }
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio')
  const sampleRate = Number(audio?.sample_rate ?? 0)
  const durationSec = Number(parsed.format?.duration ?? audio?.duration ?? 0)
  const frames = audio?.duration_ts
    ? Number(audio.duration_ts)
    : Math.round(durationSec * (sampleRate || 1))
  const tags: Record<string, string> = {}
  for (const source of [parsed.format?.tags, audio?.tags]) {
    if (source && typeof source === 'object')
      for (const [key, value] of Object.entries(source as Record<string, unknown>))
        tags[key.toLowerCase()] = String(value)
  }
  return {
    durationSec,
    frames,
    sampleRate,
    channels: Number(audio?.channels ?? 0),
    codec: String(audio?.codec_name ?? ''),
    format: String(parsed.format?.format_name ?? ''),
    tags,
    chapters: (parsed.chapters ?? []).map((chapter) => ({
      startTime: Number(chapter.start_time ?? 0),
      title: String((chapter.tags as Record<string, unknown> | undefined)?.title ?? ''),
    })),
  }
}

/** Parses ID3v2 CHAP frames out of MP3 bytes (the in-test proof that chapters are embedded). */
export function parseId3Chapters(bytes: Uint8Array): PodcastChapter[] {
  if (bytes.length < 10 || String.fromCharCode(bytes[0], bytes[1], bytes[2]) !== 'ID3') return []
  // ID3v2.4 frame sizes are syncsafe; v2.3 (what ffmpeg writes with
  // -id3v2_version 3) uses plain 32-bit sizes. The tag size in the
  // header is always syncsafe.
  const version = bytes[3]
  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f)
  const end = Math.min(bytes.length, 10 + size)
  const chapters: PodcastChapter[] = []
  let offset = 10
  const readU32 = (at: number) =>
    ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
  const readSyncsafe = (at: number) =>
    ((bytes[at] & 0x7f) << 21) |
    ((bytes[at + 1] & 0x7f) << 14) |
    ((bytes[at + 2] & 0x7f) << 7) |
    (bytes[at + 3] & 0x7f)
  const readFrameSize = version >= 4 ? readSyncsafe : readU32
  while (offset + 10 <= end) {
    const id = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    )
    if (!/^[A-Z0-9]{4}$/.test(id)) break
    const frameSize = readFrameSize(offset + 4)
    const frameStart = offset + 10
    const frameEnd = Math.min(end, frameStart + frameSize)
    if (id === 'CHAP' && frameEnd - frameStart >= 17) {
      // CHAP body: element ID (null-terminated), start ms, end ms, offsets, sub-frames.
      let cursor = frameStart
      while (cursor < frameEnd && bytes[cursor] !== 0) cursor++
      const startMs = readU32(cursor + 1)
      let sub = cursor + 17
      let title = ''
      while (sub + 10 <= frameEnd) {
        const subId = String.fromCharCode(
          bytes[sub],
          bytes[sub + 1],
          bytes[sub + 2],
          bytes[sub + 3],
        )
        const subSize = readFrameSize(sub + 4)
        if (subId === 'TIT2' && sub + 10 < frameEnd) {
          const encoding = bytes[sub + 10]
          const textBytes = bytes.subarray(sub + 11, Math.min(frameEnd, sub + 10 + subSize))
          title =
            encoding === 3 || encoding === 0
              ? new TextDecoder('utf-8').decode(textBytes)
              : new TextDecoder('utf-16').decode(textBytes)
          title = title.replace(/\0+$/, '')
        }
        if (subSize <= 0) break
        sub += 10 + subSize
      }
      chapters.push({ startTime: startMs / 1000, title })
    }
    if (frameSize <= 0) break
    offset = frameStart + frameSize
  }
  return chapters.sort((a, b) => a.startTime - b.startTime)
}

// ---------------------------------------------------------------------------
// Windowing (preview / clip / audiogram ranges)
// ---------------------------------------------------------------------------

/**
 * Extracts a timeline window as a new EDL: clips are intersected with
 * the window (source windows advance by the cut-in amount, fades on a
 * cut edge are dropped, fades on a surviving edge are kept), chapters
 * inside the window shift onto it, transcript cues intersect like the
 * PT-C remap. Pure — the full render and the excerpt render share the
 * graph builder below, so a preview is the same render, windowed.
 */
export function windowEdl(edl: EditEdl, startSec: number, durationSec: number): EditEdl {
  const endSec = startSec + durationSec
  const next: EditEdl = JSON.parse(JSON.stringify(edl)) as EditEdl
  next.tracks = []
  for (const track of edl.tracks as EditTrack[]) {
    const clips: EditClip[] = []
    for (const clip of track.clips) {
      const rate = clip.rate ?? 1
      const span = (clip.sourceOut - clip.sourceIn) / rate
      const clipStart = clip.timelineStart
      const clipEnd = clipStart + span
      const keepStart = Math.max(clipStart, startSec)
      const keepEnd = Math.min(clipEnd, endSec)
      if (keepEnd <= keepStart) continue
      const headCut = keepStart > clipStart
      const tailCut = keepEnd < clipEnd
      const windowed: EditClip = {
        ...clip,
        sourceIn: Number((clip.sourceIn + (keepStart - clipStart) * rate).toFixed(6)),
        sourceOut: Number((clip.sourceIn + (keepEnd - clipStart) * rate).toFixed(6)),
        timelineStart: Number((keepStart - startSec).toFixed(6)),
      }
      if (headCut) {
        delete windowed.fadeInSec
        if (windowed.fades) {
          const { inSec: _in, fadeInSec: _fi, ...rest } = windowed.fades
          windowed.fades = rest
        }
      }
      if (tailCut) {
        delete windowed.fadeOutSec
        if (windowed.fades) {
          const { outSec: _out, fadeOutSec: _fo, ...rest } = windowed.fades
          windowed.fades = rest
        }
      }
      clips.push(windowed)
    }
    if (clips.length > 0) next.tracks.push({ ...track, clips })
  }
  next.chapters = edl.chapters
    .filter((chapter) => chapter.start >= startSec && chapter.start < endSec)
    .map((chapter) => ({ ...chapter, start: Number((chapter.start - startSec).toFixed(6)) }))
  next.transcript = edl.transcript.flatMap((cue) => {
    const keepStart = Math.max(cue.start, startSec)
    const keepEnd = Math.min(cue.end, endSec)
    if (keepEnd <= keepStart) return []
    return [
      {
        ...cue,
        start: Number((keepStart - startSec).toFixed(6)),
        end: Number((keepEnd - startSec).toFixed(6)),
      },
    ]
  })
  if (next.markers && edl.markers)
    next.markers = edl.markers
      .filter((marker) => marker.start >= startSec && marker.start < endSec)
      .map((marker) => ({ ...marker, start: Number((marker.start - startSec).toFixed(6)) }))
  delete next.cut
  if (next.tracks.length === 0)
    throw new PodcastRenderError(
      'RENDER_RANGE_EMPTY',
      `Render range ${startSec}s–${endSec}s contains no audible clips.`,
    )
  parseEdl(next)
  return next
}

// ---------------------------------------------------------------------------
// Export profiles + templating (POD-REQ-29)
// ---------------------------------------------------------------------------

export type PodcastExportProfile = {
  filenameTemplate: string
  titleTemplate: string
  artistTemplate: string
  albumTemplate: string
  descriptionTemplate: string
  mp3BitrateKbps: number
  opusBitrateKbps: number
}

export const DEFAULT_EXPORT_PROFILE: PodcastExportProfile = {
  filenameTemplate: '{show-slug}-{episode-slug}',
  titleTemplate: '{episode-title}',
  artistTemplate: '{show-title}',
  albumTemplate: '{show-title}',
  descriptionTemplate: '{episode-description}',
  mp3BitrateKbps: 192,
  opusBitrateKbps: 96,
}

/** Validates a stored per-show export profile, filling defaults for absent fields. */
export function resolveExportProfile(raw: unknown): PodcastExportProfile {
  if (raw == null) return { ...DEFAULT_EXPORT_PROFILE }
  if (typeof raw !== 'object' || Array.isArray(raw))
    throw new PodcastRenderError(
      'RENDER_EXPORT_PROFILE_INVALID',
      'Export profile must be an object.',
    )
  const record = raw as Record<string, unknown>
  const profile = { ...DEFAULT_EXPORT_PROFILE }
  for (const key of [
    'filenameTemplate',
    'titleTemplate',
    'artistTemplate',
    'albumTemplate',
    'descriptionTemplate',
  ] as const) {
    const value = record[key]
    if (value !== undefined) {
      if (typeof value !== 'string' || !value.trim())
        throw new PodcastRenderError(
          'RENDER_EXPORT_PROFILE_INVALID',
          `Export profile ${key} must be a non-empty string.`,
        )
      profile[key] = value
    }
  }
  for (const key of ['mp3BitrateKbps', 'opusBitrateKbps'] as const) {
    const value = record[key]
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 32 || value > 320)
        throw new PodcastRenderError(
          'RENDER_EXPORT_PROFILE_INVALID',
          `Export profile ${key} must be a number between 32 and 320.`,
        )
      profile[key] = value
    }
  }
  return profile
}

export type TemplateContext = Record<string, string>

/** Renders a `{token}` template; unknown tokens render empty (never throw on show data). */
export const renderTemplate = (template: string, context: TemplateContext): string =>
  template.replace(/\{([a-z0-9-]+)\}/gi, (_match, token: string) => context[token] ?? '')

export const slugifyTemplatePart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'episode'

/** The Podcast JSON chapters document (version 1.2.0) — the same serialisation the feed route serves. */
export function buildPodcastChaptersJson(chapters: PodcastChapter[]): string {
  return JSON.stringify(
    {
      version: '1.2.0',
      chapters: chapters.map((chapter) => ({
        startTime: chapter.startTime,
        title: chapter.title,
      })),
    },
    null,
    2,
  )
}

/** EDL chapters → the canonical Podcast chapter list (one source for MP3, sidecar and feed). */
export const edlChaptersToPodcast = (chapters: EdlChapter[]): PodcastChapter[] =>
  [...chapters]
    .sort((a, b) => a.start - b.start)
    .map((chapter) => ({ startTime: chapter.start, title: chapter.title }))

// ---------------------------------------------------------------------------
// Filter graph construction
// ---------------------------------------------------------------------------

export type RenderGraph = {
  filterComplex: string
  durationSec: number
  frames: number
  audibleLaneCount: number
  approximations: string[]
}

const clipFadeIn = (clip: EditClip): number =>
  clip.fadeInSec ?? clip.fades?.inSec ?? clip.fades?.fadeInSec ?? 0
const clipFadeOut = (clip: EditClip): number =>
  clip.fadeOutSec ?? clip.fades?.outSec ?? clip.fades?.fadeOutSec ?? 0

/**
 * Per-lane POD-07 processing → ffmpeg filters. `processing` is the
 * POD-12 lane reference `{ presetId, params }`; params are numbers
 * keyed after the POD-07 settings shapes (see the module header for
 * the mapping and its named approximations).
 */
export function laneProcessingFilters(
  processing: EditTrack['processing'],
  sampleRate: number,
): { filters: string[]; approximations: string[] } {
  if (!processing) return { filters: [], approximations: [] }
  const params = processing.params ?? {}
  const num = (key: string, fallback: number): number =>
    typeof params[key] === 'number' && Number.isFinite(params[key]) ? params[key] : fallback
  const filters: string[] = []
  const approximations: string[] = []
  void sampleRate

  // Audio pass: per-lane broadband denoise runs FIRST — the gate and
  // compressor downstream should work on the cleaned signal, not on
  // fan noise. afftdn with a tracked floor (see cleanup.ts for the
  // preset rationale); a param of 0 (or absent) leaves the lane dry.
  if (typeof params.denoiseNrDb === 'number' && params.denoiseNrDb > 0) {
    filters.push(
      denoiseFilter({
        enabled: true,
        strengthDb: params.denoiseNrDb,
        floorDb: typeof params.denoiseFloorDb === 'number' ? params.denoiseFloorDb : undefined,
      }),
    )
    approximations.push(
      'denoise: ffmpeg afftdn spectral reduction with a tracked noise floor set from the measured room floor; conservative strength — on very noisy sources listen for watery artifacts and lower denoiseNrDb if speech sounds affected.',
    )
  }
  if (typeof params.gateThresholdDb === 'number') {
    const threshold = dbToLinear(params.gateThresholdDb)
    const range = num('gateRange', 0.1)
    filters.push(
      `agate=threshold=${fmt(threshold)}:range=${fmt(range)}:ratio=2:attack=20:release=250`,
    )
    approximations.push(
      'gate: POD-07 room gate is self-setting/adaptive with a −20 dB floor; rendered as a static ffmpeg agate at the explicit gateThresholdDb (range = gate floor gain).',
    )
  }
  const highPassHz = num('highPassHz', 80)
  if (highPassHz > 0) filters.push(`highpass=f=${fmt(highPassHz)}`)
  const bands: Array<[string, number, number, number, number]> = [
    ['low', num('lowHz', 200), num('lowGainDb', 0), 1, 0],
    ['mid', num('midHz', 1000), num('midGainDb', 0), num('midQ', 1), 1],
    ['high', num('highHz', 6000), num('highGainDb', 0), 1, 0],
  ]
  for (const [name, hz, gainDb, q] of bands) {
    if (gainDb === 0) continue
    filters.push(`equalizer=f=${fmt(hz)}:width_type=q:width=${fmt(q)}:g=${fmt(gainDb)}`)
    if (name !== 'mid')
      approximations.push(
        `EQ ${name} band: POD-07 uses an RBJ shelf; rendered as an ffmpeg equalizer peaking band at the same frequency/gain.`,
      )
  }
  const compThresholdDb = num('compThresholdDb', -18)
  const compRatio = num('compRatio', 3)
  filters.push(
    `acompressor=threshold=${fmt(dbToLinear(compThresholdDb))}:ratio=${fmt(compRatio)}:attack=${fmt(num('compAttackMs', 10))}:release=${fmt(num('compReleaseMs', 120))}:makeup=${fmt(dbToLinear(num('compMakeupDb', 0)))}`,
  )
  approximations.push(
    'compressor: ffmpeg acompressor approximates the POD-07 per-sample feedforward compressor (knee/envelope details differ).',
  )
  if (typeof params.limiterCeilingDb === 'number') {
    filters.push(
      `alimiter=limit=${fmt(dbToLinear(params.limiterCeilingDb))}:level=false:latency=true`,
    )
    approximations.push(
      'limiter: ffmpeg alimiter (lookahead) approximates the POD-07 instant-attack peak-follower ceiling.',
    )
  }
  return { filters, approximations }
}

/** The POD-07 row-37 program bus chain: high-pass → compressor → limiter ceiling (−1 dBFS guard). */
export function programBusFilters(): string[] {
  return [
    'highpass=f=80',
    `acompressor=threshold=${fmt(dbToLinear(-18))}:ratio=3:attack=10:release=120:makeup=1`,
    `alimiter=limit=${fmt(dbToLinear(-1))}:level=false:latency=true`,
  ]
}

export type GraphSource = {
  sourceId: string
  channels: number
  rateCorrection?: EditEdl['sources'][number]['rateCorrection']
}

/**
 * Builds the render filter graph for an EDL over resolved sources.
 * Pure (no I/O): the caller guarantees the source files exist.
 */
export type GraphDenoiseOptions = {
  enabled: boolean
  strengthDb?: number
  /** Fallback afftdn floor when a lane's source has no measured floor. */
  floorDb?: number
  /** Measured afftdn floor per source id (see denoiseFloorForMeasurement). */
  floorBySourceId?: Record<string, number>
}

export function buildRenderGraph(
  edl: EditEdl,
  sources: GraphSource[],
  options: { channels: 1 | 2; cleanup?: CleanupOptions; denoise?: GraphDenoiseOptions },
): RenderGraph {
  const sampleRate = edl.sessionRate
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]))
  const approximations: string[] = []
  const parts: string[] = []

  type Lane = { track: EditTrack; clips: EditClip[] }
  const lanes: Lane[] = []
  for (const track of edl.tracks as EditTrack[]) {
    if (track.muted) continue
    const clips = track.clips.filter((clip) => !clip.muted)
    if (clips.length > 0) lanes.push({ track, clips })
  }
  if (lanes.length === 0)
    throw new PodcastRenderError(
      'RENDER_NO_AUDIBLE_LANES',
      'The EDL has no audible (unmuted) lanes to render.',
    )

  // Junction crossfades (PT-C rule): complementary afades where two
  // clips butt-join on a lane and neither carries an explicit fade.
  const junctionFades = new Map<string, { fadeIn?: number; fadeOut?: number }>()
  const crossfade = edl.crossfadeSec ?? 0
  if (crossfade > 0) {
    for (const lane of lanes) {
      const sorted = [...lane.clips].sort((a, b) => a.timelineStart - b.timelineStart)
      for (let i = 0; i + 1 < sorted.length; i++) {
        const prev = sorted[i]
        const next = sorted[i + 1]
        const prevSpan = (prev.sourceOut - prev.sourceIn) / (prev.rate ?? 1)
        const nextSpan = (next.sourceOut - next.sourceIn) / (next.rate ?? 1)
        if (Math.abs(prev.timelineStart + prevSpan - next.timelineStart) > 1e-6) continue
        const d = Math.min(crossfade, prevSpan, nextSpan)
        if (d <= 0) continue
        if (clipFadeOut(prev) <= 0)
          junctionFades.set(`${lane.track.id}:${prev.id ?? ''}:out`, { fadeOut: d })
        if (clipFadeIn(next) <= 0)
          junctionFades.set(`${lane.track.id}:${next.id ?? ''}:in`, { fadeIn: d })
      }
    }
  }

  // Per-source pre-chains (rate correction + channel layout), split per clip.
  const clipCountBySource = new Map<string, number>()
  for (const lane of lanes)
    for (const clip of lane.clips) {
      const sourceId = clip.sourceId ?? lane.track.id
      clipCountBySource.set(sourceId, (clipCountBySource.get(sourceId) ?? 0) + 1)
    }
  const splitLabelBySourceClip = new Map<string, string>()
  sources.forEach((source, inputIndex) => {
    const count = clipCountBySource.get(source.sourceId) ?? 0
    if (count === 0) return
    const chain: string[] = []
    if (source.rateCorrection) {
      chain.push(`asetrate=${fmt(source.rateCorrection.measuredRateHz)}`)
      chain.push(`aresample=${sampleRate}`)
    } else {
      chain.push(`aresample=${sampleRate}`)
    }
    if (source.channels === 1 && options.channels === 2) chain.push('pan=stereo|c0=c0|c1=c0')
    if (source.channels >= 2 && options.channels === 1) chain.push('pan=mono|c0=0.5*c0+0.5*c1')
    const preLabel = `src${inputIndex}`
    parts.push(`[${inputIndex}:a]${chain.join(',')}[${preLabel}]`)
    if (count === 1) {
      splitLabelBySourceClip.set(source.sourceId, preLabel)
    } else {
      const labels = Array.from({ length: count }, (_, i) => `[${preLabel}s${i}]`).join('')
      parts.push(`[${preLabel}]asplit=${count}${labels}`)
      let cursor = 0
      for (const lane of lanes)
        for (const clip of lane.clips) {
          if ((clip.sourceId ?? lane.track.id) !== source.sourceId) continue
          splitLabelBySourceClip.set(`${source.sourceId}#${cursor}`, `${preLabel}s${cursor}`)
          cursor++
        }
    }
  })

  // Per-clip chains → per-lane mixes.
  const laneLabels: string[] = []
  const sourceClipCursor = new Map<string, number>()
  lanes.forEach((lane, laneIndex) => {
    const clipLabels: string[] = []
    lane.clips.forEach((clip, clipIndex) => {
      const sourceId = clip.sourceId ?? lane.track.id
      const source = sourceById.get(sourceId)
      if (!source)
        throw new PodcastRenderError(
          'RENDER_SOURCE_MISSING',
          `EDL source "${sourceId}" referenced by track "${lane.track.id}" has no resolved file.`,
        )
      const cursor = sourceClipCursor.get(sourceId) ?? 0
      sourceClipCursor.set(sourceId, cursor + 1)
      const inLabel =
        (clipCountBySource.get(sourceId) ?? 0) === 1
          ? splitLabelBySourceClip.get(sourceId)
          : splitLabelBySourceClip.get(`${sourceId}#${cursor}`)
      if (!inLabel)
        throw new PodcastRenderError(
          'RENDER_SOURCE_MISSING',
          `EDL source "${sourceId}" referenced by track "${lane.track.id}" has no resolved file.`,
        )
      const offsetSec = source.rateCorrection
        ? source.rateCorrection.offsetSamplesAtHead / sampleRate
        : 0
      const rate = clip.rate ?? 1
      const span = (clip.sourceOut - clip.sourceIn) / rate
      const chain: string[] = [
        `atrim=start=${fmt(clip.sourceIn + offsetSec)}:end=${fmt(clip.sourceOut + offsetSec)}`,
        'asetpts=PTS-STARTPTS',
      ]
      if (rate !== 1) {
        chain.push(`asetrate=${fmt(sampleRate * rate)}`, `aresample=${sampleRate}`)
        approximations.push(
          `clip rate ${rate} on track "${lane.track.id}": rendered as a tape-style asetrate resample (pitch shifts with rate).`,
        )
      }
      const fadeIn =
        clipFadeIn(clip) || (junctionFades.get(`${lane.track.id}:${clip.id ?? ''}:in`)?.fadeIn ?? 0)
      const fadeOut =
        clipFadeOut(clip) ||
        (junctionFades.get(`${lane.track.id}:${clip.id ?? ''}:out`)?.fadeOut ?? 0)
      if (fadeIn > 0) chain.push(`afade=t=in:st=0:d=${fmt(Math.min(fadeIn, span))}`)
      if (fadeOut > 0)
        chain.push(
          `afade=t=out:st=${fmt(Math.max(0, span - Math.min(fadeOut, span)))}:d=${fmt(Math.min(fadeOut, span))}`,
        )
      const gain = clip.gain ?? 1
      if (gain !== 1) chain.push(`volume=${fmt(gain)}`)
      chain.push(`adelay=${Math.round(clip.timelineStart * 1000)}:all=1`)
      const label = `clip${laneIndex}x${clipIndex}`
      parts.push(`[${inLabel}]${chain.join(',')}[${label}]`)
      clipLabels.push(`[${label}]`)
    })
    // Audio pass: the afftdn floor for this lane — the measured
    // floor of the lane's first source when the caller measured it,
    // else the configured fallback.
    const laneSourceId = lane.clips[0]?.sourceId ?? lane.track.id
    const laneFloorDb = options.denoise?.floorBySourceId?.[laneSourceId] ?? options.denoise?.floorDb
    const laneChain: string[] = []
    if (clipLabels.length > 1)
      laneChain.push(`amix=inputs=${clipLabels.length}:duration=longest:normalize=0`)
    // Audio pass: request-level denoise default for lanes whose own
    // params do not mention denoiseNrDb (a lane param — including 0
    // for off — always wins over the request default).
    if (
      options.denoise?.enabled &&
      typeof lane.track.processing?.params?.denoiseNrDb !== 'number'
    ) {
      laneChain.push(
        denoiseFilter({
          enabled: true,
          strengthDb: options.denoise.strengthDb,
          floorDb: laneFloorDb,
        }),
      )
      approximations.push(
        'denoise: ffmpeg afftdn spectral reduction with a tracked noise floor set from the measured room floor (request-level default; a lane can override with denoiseNrDb or disable with denoiseNrDb=0).',
      )
    }
    if (lane.track.gain !== 1) laneChain.push(`volume=${fmt(lane.track.gain)}`)
    // A lane that sets denoiseNrDb without a floor inherits the
    // measured floor too — a guessed floor silently disables afftdn.
    const effectiveProcessing =
      lane.track.processing &&
      typeof lane.track.processing.params?.denoiseNrDb === 'number' &&
      typeof lane.track.processing.params?.denoiseFloorDb !== 'number' &&
      laneFloorDb !== undefined
        ? {
            ...lane.track.processing,
            params: { ...lane.track.processing.params, denoiseFloorDb: laneFloorDb },
          }
        : lane.track.processing
    const processing = laneProcessingFilters(effectiveProcessing, sampleRate)
    laneChain.push(...processing.filters)
    approximations.push(...processing.approximations)
    const laneLabel = `lane${laneIndex}`
    parts.push(
      `${clipLabels.join('')}${laneChain.length > 0 ? laneChain.join(',') : 'anull'}[${laneLabel}]`,
    )
    laneLabels.push(`[${laneLabel}]`)
  })

  const durationSec = editDurationSec(edl)
  const frames = Math.round(durationSec * sampleRate)
  const programChain: string[] = []
  if (laneLabels.length > 1)
    programChain.push(`amix=inputs=${laneLabels.length}:duration=longest:normalize=0`)
  if (options.cleanup) {
    const cleanup = cleanupProgramFilters(options.cleanup)
    programChain.push(...cleanup.filters)
    for (const name of cleanup.names)
      approximations.push(`cleanup: POD-14 ${name} applied on the program bus.`)
  }
  programChain.push(...programBusFilters())
  programChain.push(`apad=whole_len=${frames}`, `atrim=end_sample=${frames}`)
  parts.push(`${laneLabels.join('')}${programChain.join(',')}[program]`)

  return {
    filterComplex: parts.join(';'),
    durationSec,
    frames,
    audibleLaneCount: lanes.length,
    approximations: [...new Set(approximations)],
  }
}

// ---------------------------------------------------------------------------
// Loudness: two-pass loudnorm + ebur128 verification (PT-C approach)
// ---------------------------------------------------------------------------

const parseLoudnormJson = (stderr: string): LoudnormMeasurement => {
  const match = stderr.match(/\[Parsed_loudnorm[^\]]*\]\s*(\{[\s\S]*?\})/)
  if (!match)
    throw new PodcastRenderError(
      'RENDER_LOUDNORM_MEASURE_FAILED',
      'loudnorm pass 1 produced no measurement JSON.',
    )
  const parsed = JSON.parse(match[1]) as Record<string, string>
  return {
    inputI: Number(parsed.input_i),
    inputTp: Number(parsed.input_tp),
    inputLra: Number(parsed.input_lra),
    inputThresh: Number(parsed.input_thresh),
    targetOffset: Number(parsed.target_offset),
  }
}

const parseEbur128 = (
  stderr: string,
): { integratedLufs: number; truePeakDb: number; lra?: number } => {
  // Parse only the trailing Summary block (per-frame lines carry the
  // same labels with running values).
  const summaryAt = stderr.lastIndexOf('Summary:')
  const summary = summaryAt >= 0 ? stderr.slice(summaryAt) : stderr
  const num = '-?(?:[\\d.]+|inf)'
  const integrated = summary.match(new RegExp(`Integrated loudness:[\\s\\S]*?I:\\s*(${num}) LUFS`))
  const peak = summary.match(new RegExp(`True peak:[\\s\\S]*?Peak:\\s*(${num}) dBFS`))
  const lra = summary.match(new RegExp(`Loudness range:[\\s\\S]*?LRA:\\s*(${num}) LU`))
  if (!integrated || !peak)
    throw new PodcastRenderError(
      'RENDER_LOUDNESS_VERIFY_FAILED',
      'ebur128 verification produced no summary.',
    )
  return {
    integratedLufs: Number(integrated[1]),
    truePeakDb: Number(peak[1]),
    lra: lra ? Number(lra[1]) : undefined,
  }
}

async function measureMasterPcm(
  masterPath: string,
  ffmpeg: string,
  channels: number,
): Promise<{ integratedLufs: number; truePeakDbfs?: number }> {
  const pcmBytes = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      ['-v', 'error', '-i', masterPath, '-f', 's16le', '-acodec', 'pcm_s16le', '-'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => (stderr += String(chunk).slice(-4000)))
    child.once('error', reject)
    child.once('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(
            new Error(`ffmpeg PCM decode failed (${code ?? 'signal'}): ${stderr.slice(-500)}`),
          ),
    )
  })
  const samples = new Int16Array(
    pcmBytes.buffer.slice(
      pcmBytes.byteOffset,
      pcmBytes.byteOffset + pcmBytes.byteLength - (pcmBytes.byteLength % 2),
    ),
  )
  void channels
  const loudness = measurePcmLoudness(samples)
  return { integratedLufs: loudness.integratedLufs, truePeakDbfs: loudness.truePeakDbfs }
}

// ---------------------------------------------------------------------------
// The render itself
// ---------------------------------------------------------------------------

const fileResult = async (
  filePath: string,
  filename: string,
  mimeType: string,
): Promise<RenderedFile> => {
  const bytes = await readFile(filePath)
  return {
    path: filePath,
    filename,
    mimeType,
    sizeBytes: bytes.byteLength,
    checksumSha256: sha256Hex(bytes),
  }
}

/**
 * Renders an EDL to files inside `request.workDir`. Throws a named
 * PodcastRenderError on any failure; on a loudness-gate failure the
 * error carries the measurements and NO output is reported (the
 * caller deletes the work directory — nothing is promoted).
 */
export async function renderEdlToFiles(request: RenderRequest): Promise<RenderResult> {
  const ffmpeg = ffmpegPath(request)
  const ffprobe = ffprobePath(request)
  parseEdl(request.edl)

  let edl = request.range
    ? windowEdl(request.edl, request.range.startSec, request.range.durationSec)
    : request.edl
  const chapters = edlChaptersToPodcast(edl.chapters)

  // Missing-source gate, before any ffmpeg run: every source an
  // audible lane references must resolve to an existing file.
  const audibleSourceIds = new Set<string>()
  for (const track of edl.tracks as EditTrack[]) {
    if (track.muted) continue
    for (const clip of track.clips) if (!clip.muted) audibleSourceIds.add(clip.sourceId ?? track.id)
  }
  const resolvedById = new Map(request.sources.map((source) => [source.sourceId, source]))
  for (const sourceId of audibleSourceIds) {
    const source = resolvedById.get(sourceId)
    if (!source)
      throw new PodcastRenderError(
        'RENDER_SOURCE_MISSING',
        `EDL source "${sourceId}" has no resolved media asset/file — the render cannot start.`,
      )
    const exists = await access(source.path).then(
      () => true,
      () => false,
    )
    if (!exists)
      throw new PodcastRenderError(
        'RENDER_SOURCE_MISSING',
        `EDL source "${sourceId}" (${source.origin}) is missing — the render cannot start.`,
      )
  }

  const audibleSources = request.sources.filter((source) => audibleSourceIds.has(source.sourceId))
  const channels: 1 | 2 =
    request.channels ?? (audibleSources.some((source) => source.channels >= 2) ? 2 : 1)
  const target = {
    I: edl.loudnessTarget?.I ?? (channels === 1 ? -19 : -16),
    TP: edl.loudnessTarget?.TP ?? -1.5,
    LRA: edl.loudnessTarget?.LRA ?? 11,
  }

  const sourceMeta = new Map(edl.sources.map((source) => [source.id, source]))

  // Audio pass — source health: measure every audible source's PCM
  // BEFORE the chain touches it. Diagnostic only: a source that
  // cannot be measured is skipped rather than failing the render,
  // but a measured clipped source is flagged in the result —
  // clipping is named, never silently repaired away.
  const healthSources: SourceHealth[] = []
  for (const source of audibleSources) {
    const health = await measureFileHealth(source.path, { ffmpeg, ffprobe }).catch(() => null)
    if (health)
      healthSources.push({
        sourceId: source.sourceId,
        origin: source.origin,
        peakDbfs: health.peakDbfs,
        noiseFloorDbfs: health.noiseFloorDbfs,
        speechLevelDbfs: health.speechLevelDbfs,
        clippedRanges: health.clippedRanges,
      })
  }
  const audioHealth =
    healthSources.length > 0
      ? {
          sources: healthSources,
          anyClipping: healthSources.some((source) => source.clippedRanges.length > 0),
        }
      : null

  // Audio pass — per-speaker leveling: measure each audible lane,
  // plan gains against the reference, and apply them to a clone of
  // the EDL (the caller's EDL is never mutated). The program
  // loudnorm gate below still has the final word — leveling defers
  // to it: a lane that cannot be measured because it is silent or
  // empty is skipped and recorded on the report, never an error,
  // and when EVERY lane defers the stage steps aside entirely so
  // the gate produces its contract verdict (e.g. a silent program
  // fails as RENDER_LOUDNESS_GATE, not as a leveling error).
  let levelingReport: LevelingReport | null = null
  if (request.leveling?.enabled) {
    const measurement = await measureAllLanesDetailed(
      edl,
      audibleSources.map((source) => ({
        sourceId: source.sourceId,
        path: source.path,
        channels: source.channels,
        rateCorrection: sourceMeta.get(source.sourceId)?.rateCorrection,
      })),
      { channels, ffmpeg },
    )
    if (measurement.measured.length > 0) {
      levelingReport = planLeveling(measurement.measured, request.leveling, measurement.deferred)
      edl = applyLevelingToEdl(edl, levelingReport)
    } else if (measurement.deferred.length > 0) {
      levelingReport = deferredLevelingReport(request.leveling, measurement.deferred)
    }
  }

  const graph = buildRenderGraph(
    edl,
    audibleSources.map((source) => ({
      sourceId: source.sourceId,
      channels: source.channels,
      rateCorrection: sourceMeta.get(source.sourceId)?.rateCorrection,
    })),
    {
      channels,
      cleanup: request.cleanup,
      // The measured per-source floors drive afftdn per lane — a
      // guessed floor silently disables the stage (see cleanup.ts).
      denoise: request.denoise
        ? {
            ...request.denoise,
            floorBySourceId: Object.fromEntries(
              healthSources.map((source) => [
                source.sourceId,
                denoiseFloorForMeasurement(source.noiseFloorDbfs),
              ]),
            ),
          }
        : undefined,
    },
  )

  const { mkdir } = await import('node:fs/promises')
  const outDir = path.join(request.workDir, 'out')
  await mkdir(outDir, { recursive: true })
  const base = request.outputName ?? 'program'
  const prenormPath = path.join(request.workDir, 'prenorm.wav')
  const masterPath = path.join(outDir, `${base}.wav`)
  const inputArgs = audibleSources.flatMap((source) => ['-i', source.path])

  // 1. Pre-norm program render.
  await runCommand(ffmpeg, [
    '-hide_banner',
    '-nostdin',
    '-y',
    ...inputArgs,
    '-filter_complex',
    graph.filterComplex,
    '-map',
    '[program]',
    '-ar',
    String(edl.sessionRate),
    '-ac',
    String(channels),
    '-c:a',
    'pcm_s16le',
    prenormPath,
  ])
  await request.faultHook?.('after-prenorm')

  // 2. Loudnorm pass 1 (measure).
  const pass1Run = await runCommand(ffmpeg, [
    '-hide_banner',
    '-nostdin',
    '-i',
    prenormPath,
    '-af',
    `loudnorm=I=${fmt(target.I)}:TP=${fmt(target.TP)}:LRA=${fmt(target.LRA)}:print_format=json`,
    '-f',
    'null',
    '-',
  ])
  const pass1 = parseLoudnormJson(pass1Run.stderr)
  await request.faultHook?.('after-loudnorm-measure')

  // Digital silence (or near enough that loudnorm reports -inf) can
  // never be normalized to target: fail through the loudness gate
  // with the pre-norm measurements instead of feeding -inf into
  // pass 2. The -70 values are the measurement floor, stated as such.
  if (!Number.isFinite(pass1.inputI) || !Number.isFinite(pass1.targetOffset)) {
    const pcm = await measureMasterPcm(prenormPath, ffmpeg, channels)
    throw new PodcastRenderError(
      'RENDER_LOUDNESS_GATE',
      `Rendered program is silent (loudnorm pass 1 measured -inf LUFS): it cannot be normalized to the ${target.I} LUFS target. No master was promoted.`,
      {
        integratedLufs: -70,
        truePeakDb: -70,
        pcmIntegratedLufs: pcm.integratedLufs,
        pcmTruePeakDbfs: pcm.truePeakDbfs,
      },
    )
  }

  // 3. Loudnorm pass 2 (apply, linear when possible) → WAV master,
  //    re-pinned to the exact EDL frame count.
  const loudnormFilter = (linear: boolean) =>
    `loudnorm=I=${fmt(target.I)}:TP=${fmt(target.TP)}:LRA=${fmt(target.LRA)}` +
    `:measured_I=${fmt(pass1.inputI)}:measured_TP=${fmt(pass1.inputTp)}:measured_LRA=${fmt(pass1.inputLra)}` +
    `:measured_thresh=${fmt(pass1.inputThresh)}:offset=${fmt(pass1.targetOffset)}:linear=${linear ? 'true' : 'false'}` +
    `,aresample=${edl.sessionRate},apad=whole_len=${graph.frames},atrim=end_sample=${graph.frames}`
  let linearFallback = false
  try {
    await runCommand(ffmpeg, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      prenormPath,
      '-af',
      loudnormFilter(true),
      '-ar',
      String(edl.sessionRate),
      '-ac',
      String(channels),
      '-c:a',
      'pcm_s16le',
      masterPath,
    ])
  } catch {
    linearFallback = true
    await runCommand(ffmpeg, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      prenormPath,
      '-af',
      loudnormFilter(false),
      '-ar',
      String(edl.sessionRate),
      '-ac',
      String(channels),
      '-c:a',
      'pcm_s16le',
      masterPath,
    ])
  }
  await request.faultHook?.('after-loudnorm')

  // 4. Independent verification: ebur128 summary + the repo PCM measure.
  const eburRun = await runCommand(ffmpeg, [
    '-hide_banner',
    '-nostdin',
    '-i',
    masterPath,
    '-af',
    'ebur128=peak=true',
    '-f',
    'null',
    '-',
  ])
  const ebur = parseEbur128(eburRun.stderr)
  const pcm = await measureMasterPcm(masterPath, ffmpeg, channels)
  const measurements: RenderMeasurements = {
    integratedLufs: ebur.integratedLufs,
    truePeakDb: ebur.truePeakDb,
    loudnessRangeLu: ebur.lra,
    pcmIntegratedLufs: pcm.integratedLufs,
    pcmTruePeakDbfs: pcm.truePeakDbfs,
  }
  const integratedDelta = Math.abs(measurements.integratedLufs - target.I)
  // The preview profile is an audition, not a publishable master: it
  // reports measurements but is not gated on them.
  const gateEnforced = request.profile !== 'preview'
  const gatePassed =
    integratedDelta <= LOUDNESS_GATE_TOLERANCE_LU && measurements.truePeakDb <= TRUE_PEAK_GATE_DB
  if (gateEnforced && !gatePassed) {
    throw new PodcastRenderError(
      'RENDER_LOUDNESS_GATE',
      `Rendered master failed the loudness gate: integrated ${measurements.integratedLufs} LUFS vs target ${target.I} LUFS (Δ ${integratedDelta.toFixed(2)} LU, tolerance ${LOUDNESS_GATE_TOLERANCE_LU}), true peak ${measurements.truePeakDb} dBTP vs ceiling ${TRUE_PEAK_GATE_DB} dBTP. No master was promoted.`,
      measurements,
    )
  }
  await request.faultHook?.('before-promote')

  // 5. Exports from the verified master.
  const outputs: RenderResult['outputs'] = {}
  const masterProbe = await probeAudioFile(masterPath, ffprobe)
  outputs.wavMaster = {
    ...(await fileResult(masterPath, `${base}.wav`, 'audio/wav')),
    durationSec: masterProbe.durationSec,
  }

  if (
    request.profile === 'master' ||
    request.profile === 'clip' ||
    request.profile === 'audiogram'
  ) {
    const tags = request.tags ?? {}
    const metadataArgs: string[] = []
    if (tags.title) metadataArgs.push('-metadata', `title=${tags.title}`)
    if (tags.artist) metadataArgs.push('-metadata', `artist=${tags.artist}`)
    if (tags.album) metadataArgs.push('-metadata', `album=${tags.album}`)
    if (tags.description) metadataArgs.push('-metadata', `description=${tags.description}`)
    if (tags.date) metadataArgs.push('-metadata', `date=${tags.date}`)
    if (tags.track) metadataArgs.push('-metadata', `track=${tags.track}`)

    // Chapters via an ffmetadata sidecar input → ID3 CHAP frames.
    let chaptersMetaPath: string | null = null
    if (chapters.length > 0) {
      chaptersMetaPath = path.join(request.workDir, 'chapters.ffmeta')
      const lines = [';FFMETADATA1']
      chapters.forEach((chapter, index) => {
        const startMs = Math.round(chapter.startTime * 1000)
        const endMs = Math.round(
          (index + 1 < chapters.length ? chapters[index + 1].startTime : graph.durationSec) * 1000,
        )
        lines.push(
          '[CHAPTER]',
          'TIMEBASE=1/1000',
          `START=${startMs}`,
          `END=${Math.max(startMs + 1, endMs)}`,
          `title=${chapter.title.replace(/\n/g, ' ')}`,
        )
      })
      await writeFile(chaptersMetaPath, lines.join('\n') + '\n')
    }

    const mp3Path = path.join(outDir, `${base}.mp3`)
    const mp3Args = ['-hide_banner', '-nostdin', '-y', '-i', masterPath]
    let artworkInput = -1
    let metaInput = -1
    if (request.artworkPath) {
      artworkInput = 1
      mp3Args.push('-i', request.artworkPath)
    }
    if (chaptersMetaPath) {
      metaInput = artworkInput >= 0 ? 2 : 1
      mp3Args.push('-i', chaptersMetaPath)
    }
    mp3Args.push('-map', '0:a')
    if (artworkInput >= 0) mp3Args.push('-map', `${artworkInput}:v`)
    if (metaInput >= 0) mp3Args.push('-map_chapters', String(metaInput))
    mp3Args.push('-c:a', 'libmp3lame', '-b:a', `${request.mp3BitrateKbps ?? 192}k`)
    if (artworkInput >= 0) mp3Args.push('-c:v', 'copy')
    mp3Args.push('-id3v2_version', '3', ...metadataArgs)
    if (artworkInput >= 0)
      mp3Args.push('-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)')
    mp3Args.push(mp3Path)
    await runCommand(ffmpeg, mp3Args)
    const mp3Probe = await probeAudioFile(mp3Path, ffprobe)
    outputs.mp3 = {
      ...(await fileResult(mp3Path, `${base}.mp3`, 'audio/mpeg')),
      durationSec: mp3Probe.durationSec,
    }
  }

  if (request.profile === 'master') {
    const tags = request.tags ?? {}
    const metadataArgs: string[] = []
    if (tags.title) metadataArgs.push('-metadata', `title=${tags.title}`)
    if (tags.artist) metadataArgs.push('-metadata', `artist=${tags.artist}`)
    if (tags.album) metadataArgs.push('-metadata', `album=${tags.album}`)
    if (tags.description) metadataArgs.push('-metadata', `description=${tags.description}`)
    if (tags.date) metadataArgs.push('-metadata', `date=${tags.date}`)
    const opusPath = path.join(outDir, `${base}.opus`)
    await runCommand(ffmpeg, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      masterPath,
      '-c:a',
      'libopus',
      '-b:a',
      `${request.opusBitrateKbps ?? 96}k`,
      ...metadataArgs,
      opusPath,
    ])
    const opusProbe = await probeAudioFile(opusPath, ffprobe)
    outputs.opus = {
      ...(await fileResult(opusPath, `${base}.opus`, 'audio/ogg')),
      durationSec: opusProbe.durationSec,
    }

    const chaptersPath = path.join(outDir, `${base}.chapters.json`)
    await writeFile(chaptersPath, buildPodcastChaptersJson(chapters))
    outputs.chaptersJson = await fileResult(
      chaptersPath,
      `${base}.chapters.json`,
      'application/json',
    )
  }

  let captionsBurnedIn = false
  if (request.profile === 'audiogram') {
    const mp4Path = path.join(outDir, `${base}.audiogram.mp4`)
    // POD-21 caption burn-in: the range-retimed SRT rides as a sidecar
    // file the libass `subtitles` filter reads; the filter path is
    // escaped for ffmpeg's filter parser (no shell is involved).
    let subtitlesFilter = ''
    if (request.captionsSrt && request.captionsSrt.trim()) {
      const captionsPath = path.join(request.workDir, 'audiogram-captions.srt')
      await writeFile(captionsPath, request.captionsSrt)
      const escaped = captionsPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
      subtitlesFilter = `;[precap]subtitles=filename='${escaped}':force_style='FontSize=22,Alignment=2,MarginV=48'[vout]`
      captionsBurnedIn = true
    }
    const args = ['-hide_banner', '-nostdin', '-y']
    if (request.artworkPath) args.push('-loop', '1', '-framerate', '30', '-i', request.artworkPath)
    else args.push('-f', 'lavfi', '-i', 'color=c=0x14181d:s=1080x1080:r=30')
    args.push(
      '-i',
      masterPath,
      '-filter_complex',
      '[0:v]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,setsar=1[bg];' +
        '[1:a]showwaves=s=1080x360:mode=line:colors=0xFFFFFF[wave];' +
        `[bg][wave]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p${captionsBurnedIn ? '[precap]' : '[vout]'}` +
        subtitlesFilter,
      '-map',
      '[vout]',
      '-map',
      '1:a',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      mp4Path,
    )
    await runCommand(ffmpeg, args)
    const mp4Probe = await probeAudioFile(mp4Path, ffprobe)
    outputs.audiogramMp4 = {
      ...(await fileResult(mp4Path, `${base}.audiogram.mp4`, 'video/mp4')),
      durationSec: mp4Probe.durationSec,
    }
  }

  return {
    profile: request.profile,
    durationSec: graph.durationSec,
    frames: graph.frames,
    sampleRate: edl.sessionRate,
    channels,
    leveling: levelingReport,
    audioHealth,
    loudnessTarget: target,
    pass1,
    measurements,
    gate: {
      enforced: gateEnforced,
      passed: gatePassed,
      integratedDeltaLu: Number(integratedDelta.toFixed(3)),
    },
    chapters,
    captionsBurnedIn,
    outputs,
    filterGraph: graph.filterComplex,
    approximations: graph.approximations,
    loudnormLinearFallback: linearFallback,
  }
}
