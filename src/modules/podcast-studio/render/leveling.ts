/**
 * Audio pass — automatic per-speaker leveling (POD-13 render stage).
 *
 * Program loudnorm (the existing two-pass stage) fixes the OVERALL
 * loudness of an episode; it cannot fix a quiet guest sitting 12 dB
 * under a loud host, because both survive normalization still
 * mismatched. Leveling runs BEFORE the render graph: each audible
 * lane's edited source mix (clip windows, clip gains, rate
 * corrections — the same pre-chains the render graph builds) is
 * measured with ffmpeg loudnorm's measurement pass, a per-lane gain
 * is planned against a reference (the loudest lane, or an explicit
 * target), clamped so a broken measurement can never produce a wild
 * ride, and applied to the lane gains of a cloned EDL. The plan is
 * fully inspectable — measured loudness, applied gain and predicted
 * loudness per lane ride in the render report.
 *
 * Measurement notes (stated, not hidden): clip fades are ignored in
 * the measurement mix (they touch clip edges, not a speaker's level),
 * and lane processing (EQ/comp) is NOT part of the measurement — the
 * plan levels the speakers as recorded, then the existing per-lane
 * chain and the program loudnorm gate run exactly as before. The
 * gate is the final word: leveling never bypasses or relaxes it.
 *
 * Deferral contract: a lane that cannot be measured because it is
 * silent or empty never aborts the render. It is skipped, the skip
 * is recorded on the report (`deferredLanes`, `status`), and the
 * render proceeds — so a silent program still reaches the gate and
 * fails with its contract error (RENDER_LOUDNESS_GATE) instead of
 * dying inside an optimization stage.
 */
import { spawn } from 'node:child_process'

import { resolveFfmpegBinary } from '../../media/ffmpeg'
import { editDurationSec, type EditEdl, type EditTrack } from '../edit/edl-engine'
import { dbToLinear } from '../mixer/processing'

export type LevelingOptions = {
  enabled: boolean
  /** Reference loudness; default: the loudest lane's measured loudness. */
  targetLufs?: number
  /** Maximum boost for a quiet lane. Default 15 dB. */
  maxBoostDb?: number
  /** Maximum cut for a loud lane. Default 12 dB. */
  maxCutDb?: number
}

export type LaneLoudness = {
  trackId: string
  label?: string
  integratedLufs: number
}

/**
 * A lane leveling skipped because it could not be measured — it is
 * silent or empty, so there is no loudness to plan a gain against.
 * Deferral is NOT a render failure: leveling is an optimization and
 * steps aside, leaving the program loudness gate to judge the
 * render (a silent program must fail as RENDER_LOUDNESS_GATE, not
 * as a leveling error). The deferral rides in the report so the
 * skip is visible, never silent.
 */
export type DeferredLane = {
  trackId: string
  label?: string
  /** Why the lane could not be measured, in plain terms. */
  reason: string
}

export type LevelingPlanLane = LaneLoudness & {
  appliedGainDb: number
  predictedLufs: number
  /** True when the clamp bound the requested gain (target not fully reached). */
  capped: boolean
}

export type LevelingReport = {
  enabled: true
  /**
   * 'applied' — every audible lane measured and the plan applied;
   * 'partially-deferred' — the plan applied to the measured lanes
   * while one or more lanes deferred (see `deferredLanes`);
   * 'deferred' — no lane could be measured, so leveling applied
   * nothing and the render proceeded without it.
   */
  status: 'applied' | 'partially-deferred' | 'deferred'
  /** Reference loudness the plan aimed at; null when deferred (no lane measured, no reference exists). */
  targetLufs: number | null
  maxBoostDb: number
  maxCutDb: number
  lanes: LevelingPlanLane[]
  /** Lanes leveling skipped because they could not be measured (silent/empty). */
  deferredLanes: DeferredLane[]
  /** Plain-language notes about the stage's decisions (deferrals). */
  notes: string[]
  /** Spread between the loudest and quietest lane BEFORE leveling. */
  beforeDeltaLu: number
  /** Predicted spread AFTER leveling (what the plan can achieve inside its clamps). */
  afterDeltaLu: number
}

export class LevelingError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'LevelingError'
    this.code = code
  }
}

/**
 * Error code for "this lane cannot be measured because it is silent
 * or empty". Kept distinct from LEVELING_MEASURE_FAILED (a genuine
 * measurement failure on audio that should be measurable): callers
 * defer on this code and surface the other.
 */
export const LEVELING_LANE_UNMEASURABLE = 'LEVELING_LANE_UNMEASURABLE'

const deferralNotes = (deferred: DeferredLane[]): string[] =>
  deferred.map(
    (lane) => `Leveling skipped lane "${lane.trackId}" — it could not be measured: ${lane.reason}`,
  )

const fmt = (value: number): string => String(Number(value.toFixed(6)))
const round2 = (value: number): number => Math.round(value * 100) / 100

/** Pure plan: gains that bring every lane to the reference, inside the clamps. */
export const planLeveling = (
  lanes: LaneLoudness[],
  options: { targetLufs?: number; maxBoostDb?: number; maxCutDb?: number } = {},
  deferred: DeferredLane[] = [],
): LevelingReport => {
  if (lanes.length === 0)
    throw new LevelingError('LEVELING_NO_LANES', 'Leveling needs at least one measured lane.')
  const maxBoostDb = options.maxBoostDb ?? 15
  const maxCutDb = options.maxCutDb ?? 12
  const targetLufs = options.targetLufs ?? Math.max(...lanes.map((lane) => lane.integratedLufs))
  const planned: LevelingPlanLane[] = lanes.map((lane) => {
    const wanted = targetLufs - lane.integratedLufs
    const appliedGainDb = round2(Math.min(maxBoostDb, Math.max(-maxCutDb, wanted)))
    return {
      ...lane,
      appliedGainDb,
      predictedLufs: round2(lane.integratedLufs + appliedGainDb),
      capped: Math.abs(appliedGainDb - wanted) > 0.005,
    }
  })
  const measured = lanes.map((lane) => lane.integratedLufs)
  const predicted = planned.map((lane) => lane.predictedLufs)
  return {
    enabled: true,
    status: deferred.length > 0 ? 'partially-deferred' : 'applied',
    targetLufs: round2(targetLufs),
    maxBoostDb,
    maxCutDb,
    lanes: planned,
    deferredLanes: deferred,
    notes: deferralNotes(deferred),
    beforeDeltaLu: round2(Math.max(...measured) - Math.min(...measured)),
    afterDeltaLu: round2(Math.max(...predicted) - Math.min(...predicted)),
  }
}

/**
 * The report for a render where leveling was enabled but EVERY
 * lane deferred (e.g. a silent program): no gains were planned or
 * applied, and the render proceeds so the loudness gate owns the
 * verdict. `targetLufs` is the caller's explicit target when one
 * was set, else null — no reference can be established from lanes
 * that could not be measured.
 */
export const deferredLevelingReport = (
  options: { targetLufs?: number; maxBoostDb?: number; maxCutDb?: number } = {},
  deferred: DeferredLane[],
): LevelingReport => ({
  enabled: true,
  status: 'deferred',
  targetLufs: options.targetLufs ?? null,
  maxBoostDb: options.maxBoostDb ?? 15,
  maxCutDb: options.maxCutDb ?? 12,
  lanes: [],
  deferredLanes: deferred,
  notes: [
    'Leveling deferred: no lane could be measured, so no gains were planned or applied. The program loudness gate still judges this render.',
    ...deferralNotes(deferred),
  ],
  beforeDeltaLu: 0,
  afterDeltaLu: 0,
})

/** Applies a plan's gains to a deep clone of the EDL (lane gain multipliers). */
export const applyLevelingToEdl = (edl: EditEdl, report: LevelingReport): EditEdl => {
  const next = JSON.parse(JSON.stringify(edl)) as EditEdl
  const gainByTrack = new Map(report.lanes.map((lane) => [lane.trackId, lane.appliedGainDb]))
  for (const track of next.tracks as EditTrack[]) {
    const gainDb = gainByTrack.get(track.id)
    if (gainDb === undefined || gainDb === 0) continue
    track.gain = (track.gain ?? 1) * dbToLinear(gainDb)
  }
  return next
}

// ---------------------------------------------------------------------------
// Measurement (real ffmpeg, through the shared resolver)
// ---------------------------------------------------------------------------

const runMeasure = (binary: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 30 * 60_000)
    child.stderr.on('data', (chunk) => (stderr += String(chunk).slice(-64_000)))
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(
          new LevelingError(
            'LEVELING_MEASURE_FAILED',
            `ffmpeg lane measurement failed (${code ?? 'signal'}): ${stderr.slice(-800)}`,
          ),
        )
        return
      }
      resolve(stderr)
    })
  })

const parseMeasuredI = (stderr: string, trackId: string): number => {
  const match = stderr.match(/\[Parsed_loudnorm[^\]]*\]\s*(\{[\s\S]*?\})/)
  if (!match)
    throw new LevelingError(
      'LEVELING_MEASURE_FAILED',
      `loudnorm measurement produced no JSON for lane "${trackId}".`,
    )
  const parsed = JSON.parse(match[1]) as Record<string, string>
  const value = Number(parsed.input_i)
  if (!Number.isFinite(value))
    throw new LevelingError(
      LEVELING_LANE_UNMEASURABLE,
      `Lane "${trackId}" measured ${parsed.input_i} LUFS — it is effectively silent and cannot be leveled.`,
    )
  return value
}

export type LaneMeasureSource = {
  sourceId: string
  path: string
  channels: number
  rateCorrection?: EditEdl['sources'][number]['rateCorrection']
}

/**
 * Measures one lane's integrated loudness over its edited source mix:
 * the render graph's per-source pre-chains (rate correction, channel
 * layout) and per-clip chains (trim window, clip gain, timeline
 * placement), mixed — without lane processing, bus chain or fades.
 */
export const measureLaneLoudness = async (
  edl: EditEdl,
  track: EditTrack,
  sources: LaneMeasureSource[],
  options: { channels: 1 | 2; ffmpeg?: string },
): Promise<LaneLoudness> => {
  const ffmpeg = resolveFfmpegBinary(options.ffmpeg)
  const sampleRate = edl.sessionRate
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]))
  const clips = track.clips.filter((clip) => !clip.muted)
  if (clips.length === 0)
    throw new LevelingError(
      LEVELING_LANE_UNMEASURABLE,
      `Lane "${track.id}" has no audible clips to measure.`,
    )

  // Inputs: only the sources this lane actually references.
  const usedSourceIds: string[] = []
  for (const clip of clips) {
    const sourceId = clip.sourceId ?? track.id
    if (!usedSourceIds.includes(sourceId)) usedSourceIds.push(sourceId)
  }
  const inputIndexBySource = new Map<string, number>()
  const inputArgs: string[] = []
  usedSourceIds.forEach((sourceId, index) => {
    const source = sourceById.get(sourceId)
    if (!source)
      throw new LevelingError(
        'LEVELING_MEASURE_FAILED',
        `Lane "${track.id}" references source "${sourceId}" with no resolved file.`,
      )
    inputIndexBySource.set(sourceId, index)
    inputArgs.push('-i', source.path)
  })

  const parts: string[] = []
  const clipLabels: string[] = []
  clips.forEach((clip, clipIndex) => {
    const sourceId = clip.sourceId ?? track.id
    const source = sourceById.get(sourceId)!
    const inputIndex = inputIndexBySource.get(sourceId)!
    const pre: string[] = []
    if (source.rateCorrection) {
      pre.push(`asetrate=${fmt(source.rateCorrection.measuredRateHz)}`, `aresample=${sampleRate}`)
    } else {
      pre.push(`aresample=${sampleRate}`)
    }
    if (source.channels === 1 && options.channels === 2) pre.push('pan=stereo|c0=c0|c1=c0')
    if (source.channels >= 2 && options.channels === 1) pre.push('pan=mono|c0=0.5*c0+0.5*c1')
    const offsetSec = source.rateCorrection
      ? source.rateCorrection.offsetSamplesAtHead / sampleRate
      : 0
    const rate = clip.rate ?? 1
    const chain: string[] = [
      ...pre,
      `atrim=start=${fmt(clip.sourceIn + offsetSec)}:end=${fmt(clip.sourceOut + offsetSec)}`,
      'asetpts=PTS-STARTPTS',
    ]
    if (rate !== 1) chain.push(`asetrate=${fmt(sampleRate * rate)}`, `aresample=${sampleRate}`)
    const gain = clip.gain ?? 1
    if (gain !== 1) chain.push(`volume=${fmt(gain)}`)
    if (track.gain !== undefined && track.gain !== 1) chain.push(`volume=${fmt(track.gain)}`)
    chain.push(`adelay=${Math.round(clip.timelineStart * 1000)}:all=1`)
    const label = `mclip${clipIndex}`
    parts.push(`[${inputIndex}:a]${chain.join(',')}[${label}]`)
    clipLabels.push(`[${label}]`)
  })
  const durationSec = editDurationSec(edl)
  const frames = Math.round(durationSec * sampleRate)
  const mix =
    clipLabels.length > 1 ? `amix=inputs=${clipLabels.length}:duration=longest:normalize=0,` : ''
  // loudnorm rides INSIDE the complex graph — ffmpeg refuses a
  // simple `-af` chain on a stream a complex graph already feeds.
  parts.push(
    `${clipLabels.join('')}${mix}apad=whole_len=${frames},atrim=end_sample=${frames},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[lane]`,
  )

  const stderr = await runMeasure(ffmpeg, [
    '-hide_banner',
    '-nostdin',
    ...inputArgs,
    '-filter_complex',
    parts.join(';'),
    '-map',
    '[lane]',
    '-f',
    'null',
    '-',
  ])
  return {
    trackId: track.id,
    label: track.label,
    integratedLufs: round2(parseMeasuredI(stderr, track.id)),
  }
}

export type LaneMeasurement = {
  measured: LaneLoudness[]
  /** Lanes skipped because they could not be measured (silent/empty). */
  deferred: DeferredLane[]
}

/**
 * Measures every audible lane of an EDL, in track order, splitting
 * the outcome: lanes that measure land in `measured`; lanes that
 * cannot be measured because they are silent/empty land in
 * `deferred` and do NOT abort the pass. A genuine measurement
 * failure on measurable audio (ffmpeg error, unparseable output,
 * unresolved source) still throws — deferral is only for lanes
 * there is nothing to measure in.
 */
export const measureAllLanesDetailed = async (
  edl: EditEdl,
  sources: LaneMeasureSource[],
  options: { channels: 1 | 2; ffmpeg?: string },
): Promise<LaneMeasurement> => {
  const measured: LaneLoudness[] = []
  const deferred: DeferredLane[] = []
  for (const track of edl.tracks as EditTrack[]) {
    if (track.muted) continue
    if (track.clips.filter((clip) => !clip.muted).length === 0) continue
    try {
      measured.push(await measureLaneLoudness(edl, track, sources, options))
    } catch (error) {
      if (error instanceof LevelingError && error.code === LEVELING_LANE_UNMEASURABLE) {
        deferred.push({ trackId: track.id, label: track.label, reason: error.message })
        continue
      }
      throw error
    }
  }
  return { measured, deferred }
}

/** Measures every audible lane of an EDL, in track order. */
export const measureAllLanes = async (
  edl: EditEdl,
  sources: LaneMeasureSource[],
  options: { channels: 1 | 2; ffmpeg?: string },
): Promise<LaneLoudness[]> => (await measureAllLanesDetailed(edl, sources, options)).measured
