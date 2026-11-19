/**
 * POD-11 (POD-REQ-25) — Guest-track conform CORE (pure TypeScript, no
 * DOM / Node imports).
 *
 * A remote guest's browser records its OWN raw track on its OWN clock
 * (the POD-06 chunk journal, bound in guests/guest-recording.ts). That
 * clock is not the host's: it starts at the guest's join offset and it
 * drifts at a constant-ish rate (PT-F: +80 ppm misaligns 288 ms over
 * one hour). Conform is the step that puts the guest track onto the
 * ONE session timeline:
 *
 * - Head + tail sync pairs — {guestTrackSamples, hostTimelineSamples}
 *   correspondences captured at record start and end through the
 *   POD-10 signalling layer — determine BOTH the head offset and the
 *   rate factor by the PT-F two-point method. The estimation itself
 *   lives in POD-09's `drift.ts` and is REUSED here, never
 *   reimplemented; this module adds the guest-shaped inputs, the EDL
 *   rate-correction artefact (POD-00 EDL schema shape), the conform
 *   report, gap accounting, and the fallback ladder.
 * - The EDL artefact is exactly what POD-12 will consume per source:
 *   { nominalRate, measuredRateHz, resampleFactor, rateCorrectionPpm,
 *   offsetSamplesAtHead } — the PT-F `numbers.json` correction format.
 *   measuredRate = nominal × (guestSamples between syncs) /
 *   (hostSamples between syncs).
 * - Gaps (disconnect intervals / missing chunk ranges recorded in the
 *   guest journal) are listed EXPLICITLY in the conform plan, mapped
 *   onto the timeline — audio is never stretched or shifted to close
 *   a hole (the POD-09 assembly rule, inherited by delegating the
 *   actual placement to assemble.ts).
 * - The assembled output is a POD-09 `AssembledTrack`: exactly
 *   `sessionFrames` long, with POD-00-manifest-ready sync events, so
 *   it slots into POD-09's finalizeAssembly as that guest's ISO track.
 *
 * Fallback ladder (the episode NEVER silently loses a guest):
 *   rung 1 — the guest's local recording is present, complete and
 *            checksum-verified → conform it (best quality).
 *   rung 2 — local missing / incomplete / failed → the POD-09 guest
 *            ISO slot recorded live from the received stream (already
 *            on the host clock, mix-minus era capture) is used and
 *            marked `degraded: live-capture` with the reason named.
 *   rung 3 — neither exists → a full-range gap plus an explicit
 *            manifest error naming the guest. Silence with a record,
 *            never a vanished guest.
 *
 * HONESTY: all drift proof here is synthetic (PT-F simulation +
 * synthetic files), exactly as PT-F itself recorded. Real-device
 * drift over a two-device 30+ minute rig session is UNVERIFIED — see
 * docs/podcast-studio/PODCAST_PROJECT_STATE.md.
 */

import type { RecoveryReport } from '../capture/journal'
import type { EdlRateCorrection } from '../contracts/edl'
import type { TrackSyncEvent } from '../contracts/track-manifest'
import {
  assembleTrack,
  type AssembledTrack,
  type AssemblyChunk,
  type TrackAssemblyInput,
} from './assemble'
import {
  correctPosition,
  estimateRateCorrection,
  measureResiduals,
  type RateCorrection,
  type SyncPoint,
} from './drift'

// ---------------------------------------------------------------------------
// Sync correspondence (the POD-10 signalling-layer data model)
// ---------------------------------------------------------------------------

/**
 * One sync correspondence: the same instant expressed on the guest
 * track's own sample clock and on the host session timeline. Head and
 * tail pairs bound the guest recording (captured at record start /
 * end via the signalling channel — see guests/guest-recording.ts).
 */
export type GuestSyncPair = {
  guestTrackSamples: number
  hostTimelineSamples: number
}

export const syncPair = (guestTrackSamples: number, hostTimelineSamples: number): GuestSyncPair => {
  if (
    !Number.isInteger(guestTrackSamples) ||
    guestTrackSamples < 0 ||
    !Number.isInteger(hostTimelineSamples) ||
    hostTimelineSamples < 0
  ) {
    throw new Error('Sync pair samples must be non-negative integers.')
  }
  return { guestTrackSamples, hostTimelineSamples }
}

const toSyncPoint = (pair: GuestSyncPair): SyncPoint => ({
  trackSamples: pair.guestTrackSamples,
  timelineSamples: pair.hostTimelineSamples,
})

const toTrackSyncEvent = (type: 'head' | 'tail', pair: GuestSyncPair): TrackSyncEvent => ({
  type,
  trackSamples: pair.guestTrackSamples,
  timelineSamples: pair.hostTimelineSamples,
})

// ---------------------------------------------------------------------------
// Conform plan: rate correction artefact + report + explicit gaps
// ---------------------------------------------------------------------------

/** A gap recorded in the guest journal, on the GUEST track clock. */
export type GuestGapInput = {
  /** First guest-track sample with no audio. */
  fromGuestSample: number
  frames: number
  reason: 'disconnect' | 'missing-range'
}

/** A gap after mapping onto the session timeline (the plan's record). */
export type ConformGap = {
  fromTimelineSample: number
  toTimelineSample: number
  frames: number
  fromGuestSample: number
  guestFrames: number
  reason: 'disconnect' | 'missing-range'
}

export type ConformReport = {
  /** Head offset: timeline position of guest sample 0 (samples + ms). */
  offsetSamplesAtHead: number
  offsetMsAtHead: number
  resampleFactor: number
  rateCorrectionPpm: number
  measuredRateHz: number
  nominalRate: number
  guestSpanSamples: number
  hostSpanSamples: number
  /**
   * Residual misalignment estimate after correction, in ms. With
   * intermediate check points it is the measured worst miss (PT-F
   * method); with head+tail only it is the sync-pair geometry bound:
   * each sync position is quantised to ±0.5 sample, which bounds the
   * worst interior residual at 0.75 samples (endpoint quantisation
   * propagated through the linear correction).
   */
  residualEstimateMs: number
  residualBasis: 'check-points' | 'sync-pair-geometry'
  /**
   * The PT-F F4 control: how far the TAIL would still miss if only
   * the head offset were applied (no rate correction). Proves the
   * rate correction is load-bearing, not decoration.
   */
  headOnlyTailErrorMs: number
  /** Explicit gap regions — never silently stretched. */
  gaps: ConformGap[]
}

export type ConformPlan = {
  /** The POD-00 EDL per-source artefact (POD-12 consumes this). */
  rateCorrection: EdlRateCorrection
  /** The POD-09 drift correction the plan was derived from. */
  correction: RateCorrection
  report: ConformReport
  syncEvents: TrackSyncEvent[]
}

/** Worst interior residual (samples) attributable to sync quantisation alone. */
export const SYNC_QUANTISATION_RESIDUAL_SAMPLES = 0.75

export function computeConformPlan(input: {
  /** The session (nominal) sample rate — 48,000 in the working format. */
  nominalRate: number
  head: GuestSyncPair
  tail: GuestSyncPair
  /** Optional intermediate sync pairs; when present the residual is measured, not just bounded. */
  checkPoints?: GuestSyncPair[]
  gaps?: GuestGapInput[]
}): ConformPlan {
  const { nominalRate, head, tail } = input
  if (!(nominalRate > 0)) throw new Error('Conform requires a positive nominal rate.')
  const correction = estimateRateCorrection(toSyncPoint(head), toSyncPoint(tail))
  const guestSpan = tail.guestTrackSamples - head.guestTrackSamples
  const hostSpan = tail.hostTimelineSamples - head.hostTimelineSamples
  // PT-F artefact math: measuredRate = nominal × guestSpan / hostSpan.
  const measuredRateHz = hostSpan > 0 ? nominalRate * (guestSpan / hostSpan) : nominalRate
  const offsetSamplesAtHead = Math.max(0, Math.round(correction.headOffsetSamples))

  let residualEstimateMs: number
  let residualBasis: ConformReport['residualBasis']
  if (input.checkPoints && input.checkPoints.length > 0) {
    const points = [head, ...input.checkPoints, tail].map(toSyncPoint)
    residualEstimateMs = measureResiduals(correction, points, nominalRate).maxAbsResidualMs
    residualBasis = 'check-points'
  } else {
    residualEstimateMs = (SYNC_QUANTISATION_RESIDUAL_SAMPLES / nominalRate) * 1000
    residualBasis = 'sync-pair-geometry'
  }

  const gaps: ConformGap[] = (input.gaps ?? []).map((gap) => {
    const fromTimelineSample = Math.max(
      0,
      Math.round(correctPosition(correction, gap.fromGuestSample)),
    )
    const toTimelineSample = Math.max(
      fromTimelineSample,
      Math.round(correctPosition(correction, gap.fromGuestSample + gap.frames)),
    )
    return {
      fromTimelineSample,
      toTimelineSample,
      frames: toTimelineSample - fromTimelineSample,
      fromGuestSample: gap.fromGuestSample,
      guestFrames: gap.frames,
      reason: gap.reason,
    }
  })

  const rateCorrection: EdlRateCorrection = {
    nominalRate,
    measuredRateHz,
    resampleFactor: correction.resampleFactor,
    rateCorrectionPpm: correction.rateCorrectionPpm,
    offsetSamplesAtHead,
  }
  return {
    rateCorrection,
    correction,
    report: {
      offsetSamplesAtHead,
      offsetMsAtHead: (offsetSamplesAtHead / nominalRate) * 1000,
      resampleFactor: correction.resampleFactor,
      rateCorrectionPpm: correction.rateCorrectionPpm,
      measuredRateHz,
      nominalRate,
      guestSpanSamples: guestSpan,
      hostSpanSamples: hostSpan,
      residualEstimateMs,
      residualBasis,
      headOnlyTailErrorMs: hostSpan > 0 ? (Math.abs(guestSpan - hostSpan) / nominalRate) * 1000 : 0,
      gaps,
    },
    syncEvents: [toTrackSyncEvent('head', head), toTrackSyncEvent('tail', tail)],
  }
}

// ---------------------------------------------------------------------------
// Conform one guest track onto the session timeline (pure assembly)
// ---------------------------------------------------------------------------

export type ConformGuestTrackInput = {
  trackId: string
  guestId?: string
  channels?: number
  /** Guest-track chunks on the GUEST clock (journal order is irrelevant; positions rule). */
  chunks: AssemblyChunk[]
  head: GuestSyncPair
  tail: GuestSyncPair
  checkPoints?: GuestSyncPair[]
  gaps?: GuestGapInput[]
}

export type ConformedGuestTrack = {
  track: AssembledTrack
  plan: ConformPlan
  /** The POD-09 assembly input this conform corresponds to (finalize-ready). */
  assemblyInput: TrackAssemblyInput
}

/**
 * Conforms one guest's local track: builds the plan, then delegates
 * placement to POD-09's assembleTrack (which resamples the WHOLE
 * track buffer by the plan factor, places it at the corrected head
 * offset, and records every uncovered range as a gap). The plan's
 * disconnect gaps are annotated onto the report; assembly gaps whose
 * range overlaps a disconnect gap keep the disconnect reason in the
 * conform report (assembly itself labels the hole `missing-chunk`,
 * which is the same silence — the conform report is the record that
 * says WHY).
 */
export function conformGuestTrack(
  input: ConformGuestTrackInput,
  sessionFrames: number,
  sampleRate: number,
): ConformedGuestTrack {
  const plan = computeConformPlan({
    nominalRate: sampleRate,
    head: input.head,
    tail: input.tail,
    checkPoints: input.checkPoints,
    gaps: input.gaps,
  })
  const assemblyInput: TrackAssemblyInput = {
    trackId: input.trackId,
    role: 'guest',
    ...(input.guestId ? { guestId: input.guestId } : {}),
    channels: input.channels ?? 1,
    channelLayout: (input.channels ?? 1) === 2 ? 'stereo' : 'mono',
    // When drift is at/below the assembly threshold no resample runs
    // and placement falls back to joinedAtSample — so it carries the
    // plan's head offset, keeping head alignment in both branches.
    joinedAtSample: plan.report.offsetSamplesAtHead,
    chunks: input.chunks,
    syncEvents: plan.syncEvents,
  }
  const track = assembleTrack(assemblyInput, sessionFrames, sampleRate)
  return { track, plan, assemblyInput }
}

// ---------------------------------------------------------------------------
// Conform readiness: an incomplete guest track is REFUSED, by name
// ---------------------------------------------------------------------------

export type ConformReadiness =
  | { ok: true }
  | {
      ok: false
      code: 'conform-track-missing' | 'conform-track-incomplete' | 'conform-track-checksum-failed'
      /** The named state the conform job reports instead of running. */
      state: 'track-missing' | 'track-incomplete' | 'track-checksum-failed'
      message: string
    }

/**
 * Conform runs only on a COMPLETE, checksum-verified guest track: the
 * POD-06 recovery report must show a footer (clean close), verified
 * checksums, and — when the guest declared a chunk count at upload
 * completion — every declared chunk admitted. Anything less is a
 * named refusal; the fallback ladder decides what happens instead.
 */
export function evaluateConformReadiness(
  recovery: Pick<
    RecoveryReport,
    'complete' | 'checksumsVerified' | 'admittedChunks' | 'recoveredFrames'
  > | null,
  declaredChunks?: number | null,
): ConformReadiness {
  if (!recovery) {
    return {
      ok: false,
      code: 'conform-track-missing',
      state: 'track-missing',
      message: 'Conform refused: no guest journal was recovered for this track.',
    }
  }
  if (!recovery.checksumsVerified) {
    return {
      ok: false,
      code: 'conform-track-checksum-failed',
      state: 'track-checksum-failed',
      message:
        'Conform refused (state: track-checksum-failed): a guest chunk failed checksum verification; the track is not trustworthy enough to conform.',
    }
  }
  if (
    !recovery.complete ||
    (declaredChunks != null && recovery.admittedChunks.length < declaredChunks)
  ) {
    return {
      ok: false,
      code: 'conform-track-incomplete',
      state: 'track-incomplete',
      message: `Conform refused (state: track-incomplete): the guest upload is not complete (${recovery.admittedChunks.length} chunks admitted${declaredChunks != null ? ` of ${declaredChunks} declared` : ''}, journal ${recovery.complete ? 'closed' : 'not closed'}). Resume the upload first.`,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Fallback ladder: local-conformed → live-capture → named gap
// ---------------------------------------------------------------------------

export type GuestTrackFallbackState = 'conformed' | 'degraded-live-capture' | 'missing-gap'

export type FallbackDecision = {
  rung: 1 | 2 | 3
  state: GuestTrackFallbackState
  source: 'local-conformed' | 'live-capture' | 'none'
  degraded: boolean
  /** Manifest-visible error for rungs 2–3; null on the clean rung. */
  manifestError: string | null
}

export function decideGuestTrackFallback(input: {
  guestLabel: string
  local: { present: boolean; readiness: ConformReadiness } | null
  liveCapture: { present: boolean } | null
}): FallbackDecision {
  const local = input.local
  if (local?.present && local.readiness.ok) {
    return {
      rung: 1,
      state: 'conformed',
      source: 'local-conformed',
      degraded: false,
      manifestError: null,
    }
  }
  const localReason = !local?.present
    ? 'no local recording was uploaded'
    : local.readiness.ok
      ? 'local recording unusable'
      : local.readiness.message
  if (input.liveCapture?.present) {
    return {
      rung: 2,
      state: 'degraded-live-capture',
      source: 'live-capture',
      degraded: true,
      manifestError: `Guest ${input.guestLabel}: degraded: live-capture — the guest's local track was not conformed (${localReason}); the live ISO capture from the received stream is used instead.`,
    }
  }
  return {
    rung: 3,
    state: 'missing-gap',
    source: 'none',
    degraded: true,
    manifestError: `Guest ${input.guestLabel}: guest track missing — no local recording and no live capture exist (${localReason}); the guest's range is an explicit gap in the manifest, not a silent loss.`,
  }
}

export type GuestAssemblyWithFallback = {
  track: AssembledTrack
  decision: FallbackDecision
  /** The conform plan on rung 1; null on the fallback rungs. */
  plan: ConformPlan | null
}

/**
 * Applies the ladder and returns the guest's ISO track for the
 * session timeline in every case — conformed, live-capture, or an
 * explicit full-range gap — so POD-09 assembly always has a track
 * (and a manifest entry) for the guest.
 */
export function assembleGuestWithFallback(
  input: {
    trackId: string
    guestId?: string
    guestLabel: string
    channels?: number
    local: {
      chunks: AssemblyChunk[]
      head: GuestSyncPair
      tail: GuestSyncPair
      checkPoints?: GuestSyncPair[]
      gaps?: GuestGapInput[]
      readiness: ConformReadiness
    } | null
    liveCapture: { chunks: AssemblyChunk[]; joinedAtSample: number } | null
  },
  sessionFrames: number,
  sampleRate: number,
): GuestAssemblyWithFallback {
  const decision = decideGuestTrackFallback({
    guestLabel: input.guestLabel,
    local: input.local
      ? { present: input.local.chunks.length > 0, readiness: input.local.readiness }
      : null,
    liveCapture: input.liveCapture ? { present: input.liveCapture.chunks.length > 0 } : null,
  })
  const channels = input.channels ?? 1
  if (decision.rung === 1 && input.local) {
    const { track, plan } = conformGuestTrack(
      {
        trackId: input.trackId,
        guestId: input.guestId,
        channels,
        chunks: input.local.chunks,
        head: input.local.head,
        tail: input.local.tail,
        checkPoints: input.local.checkPoints,
        gaps: input.local.gaps,
      },
      sessionFrames,
      sampleRate,
    )
    return { track, decision, plan }
  }
  if (decision.rung === 2 && input.liveCapture) {
    // Live capture is already on the host clock: no rate correction,
    // placed by its join offset through the same assembly path.
    const totalFrames = input.liveCapture.chunks.reduce(
      (max, chunk) => Math.max(max, chunk.startSample + chunk.pcm.length / channels),
      0,
    )
    const track = assembleTrack(
      {
        trackId: input.trackId,
        role: 'guest',
        ...(input.guestId ? { guestId: input.guestId } : {}),
        channels,
        channelLayout: channels === 2 ? 'stereo' : 'mono',
        joinedAtSample: input.liveCapture.joinedAtSample,
        chunks: input.liveCapture.chunks,
        syncEvents: [
          { type: 'head', trackSamples: 0, timelineSamples: input.liveCapture.joinedAtSample },
          {
            type: 'tail',
            trackSamples: totalFrames,
            timelineSamples: input.liveCapture.joinedAtSample + totalFrames,
          },
        ],
      },
      sessionFrames,
      sampleRate,
    )
    track.degraded = true
    if (decision.manifestError) track.errors = [...track.errors, decision.manifestError]
    return { track, decision, plan: null }
  }
  // Rung 3: no audio exists. Assembly of an empty track yields the
  // full-range gap record; the manifest error names the guest.
  const track = assembleTrack(
    {
      trackId: input.trackId,
      role: 'guest',
      ...(input.guestId ? { guestId: input.guestId } : {}),
      channels,
      channelLayout: channels === 2 ? 'stereo' : 'mono',
      joinedAtSample: 0,
      chunks: [],
      syncEvents: [
        { type: 'head', trackSamples: 0, timelineSamples: 0 },
        { type: 'tail', trackSamples: 0, timelineSamples: 0 },
      ],
    },
    sessionFrames,
    sampleRate,
  )
  track.degraded = true
  if (decision.manifestError) track.errors = [...track.errors, decision.manifestError]
  return { track, decision, plan: null }
}

// ---------------------------------------------------------------------------
// ffmpeg rate-correction chain (arguments are pure data; the server
// job in conform-service.ts executes them)
// ---------------------------------------------------------------------------

/**
 * The ffmpeg filter chain that implements a PURE rate correction:
 * `asetrate=<measuredRateHz>` re-interprets the stored samples at the
 * rate the guest's clock actually ran at (the WAV header claims the
 * nominal rate; the samples were produced by the measured one), then
 * `aresample=<nominalRate>` resamples back to the session rate. The
 * result has the corrected DURATION (frames × resampleFactor) with
 * pitch restored — no tempo/pitch processing (no `atempo`, which
 * would time-stretch by dropping/duplicating content and is exactly
 * what conform must never do to a gap-bearing track). Head-offset
 * alignment is applied sample-accurately by the caller when the
 * corrected PCM is placed on the session timeline, not by ffmpeg
 * (whose delay filters are millisecond-grained).
 */
export function rateCorrectionFilter(plan: ConformPlan): string {
  const measured = Number(plan.rateCorrection.measuredRateHz.toFixed(5))
  return `asetrate=${measured},aresample=${plan.rateCorrection.nominalRate}`
}

export function buildConformFfmpegArgs(input: {
  inputPath: string
  outputPath: string
  plan: ConformPlan
  channels: number
}): string[] {
  return [
    '-v',
    'error',
    '-y',
    '-i',
    input.inputPath,
    '-af',
    rateCorrectionFilter(input.plan),
    '-ar',
    String(input.plan.rateCorrection.nominalRate),
    '-ac',
    String(input.channels),
    input.outputPath,
  ]
}
