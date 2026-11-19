/**
 * POD-09 — Drift estimation + correction (PURE CORE), the PT-F method in
 * production form.
 *
 * PT-F (RC3_NATIVE_PODCAST_PROTOTYPE_EVIDENCE/PT-F-drift, verdict: TESTED
 * as mathematics on simulated clocks) proved that a two-point linear
 * estimate from head + tail sync events fully determines a constant-rate
 * clock drift: recorder B at +80 ppm misaligns 288 ms over one hour
 * uncorrected, and the head+tail rate correction reduces the residual to
 * 0.0083 ms (pure sample quantisation). The EDL/track-manifest artefact
 * is exactly what this module produces: a per-track `resampleFactor`
 * and `rateCorrectionPpm`.
 *
 * Sign conventions:
 * - A track clock running FAST by +P ppm produces MORE track samples
 *   per timeline second: trackSpan = timelineSpan × (1 + P/1e6).
 * - `rateCorrectionPpm` is that signed P (what the manifest stores).
 * - `resampleFactor` converts track samples to timeline samples:
 *   timelineSpan = trackSpan × resampleFactor, so it is ≈ 1 − P/1e6.
 * - `headOffsetSamples` is the timeline position of the track's sample 0
 *   after the head sync is honoured (the late-joiner offset).
 *
 * HONESTY: this is the PT-F mathematics reproduced on synthetic clocks.
 * Real-device drift (non-linear drift, dropped samples, browser capture
 * stacks) is UNVERIFIED — see the POD-09 handoff.
 */

export type SyncPoint = {
  /** Position on the track's own sample clock. */
  trackSamples: number
  /** The same instant on the session timeline clock. */
  timelineSamples: number
}

export type RateCorrection = {
  /** Multiply track-sample positions by this to land on the timeline. */
  resampleFactor: number
  /** Signed drift of the track clock, parts per million (+ = fast). */
  rateCorrectionPpm: number
  /** Timeline position of track sample 0 (head-sync offset). */
  headOffsetSamples: number
}

/**
 * Two-point (head + tail) linear estimate — the whole PT-F method.
 * Requires a positive span on both clocks; a zero-length track has no
 * measurable drift and gets the identity correction.
 */
export const estimateRateCorrection = (head: SyncPoint, tail: SyncPoint): RateCorrection => {
  const trackSpan = tail.trackSamples - head.trackSamples
  const timelineSpan = tail.timelineSamples - head.timelineSamples
  if (trackSpan <= 0 || timelineSpan <= 0) {
    return { resampleFactor: 1, rateCorrectionPpm: 0, headOffsetSamples: head.timelineSamples }
  }
  const resampleFactor = timelineSpan / trackSpan
  return {
    resampleFactor,
    rateCorrectionPpm: (trackSpan / timelineSpan - 1) * 1_000_000,
    headOffsetSamples: head.timelineSamples - head.trackSamples * resampleFactor,
  }
}

/** Maps one track-clock position onto the timeline under a correction. */
export const correctPosition = (correction: RateCorrection, trackSamples: number): number =>
  correction.headOffsetSamples + trackSamples * correction.resampleFactor

export type ResidualMeasurement = {
  /** Per-sync-point signed residual (corrected − true), in samples. */
  residualsSamples: number[]
  maxAbsResidualSamples: number
  maxAbsResidualMs: number
}

/**
 * Measures the residual misalignment of a correction against a set of
 * known sync points (the PT-F check: apply the head+tail estimate to
 * every impulse and report the worst miss).
 */
export const measureResiduals = (
  correction: RateCorrection,
  points: SyncPoint[],
  sampleRate: number,
): ResidualMeasurement => {
  const residualsSamples = points.map(
    (point) => correctPosition(correction, point.trackSamples) - point.timelineSamples,
  )
  const maxAbsResidualSamples = residualsSamples.reduce(
    (max, value) => Math.max(max, Math.abs(value)),
    0,
  )
  return {
    residualsSamples,
    maxAbsResidualSamples,
    maxAbsResidualMs: (maxAbsResidualSamples / sampleRate) * 1000,
  }
}

/**
 * Linear-interpolation resample of interleaved PCM by `factor`
 * (output frames = round(input frames × factor)). Deterministic: the
 * same input always produces byte-identical output, which is what makes
 * an interrupted finalize resumable to identical checksums.
 */
export const resampleLinear = (
  pcm: Float32Array,
  channels: number,
  factor: number,
): Float32Array => {
  if (channels < 1) throw new Error('resampleLinear requires at least one channel.')
  if (pcm.length % channels !== 0)
    throw new Error('PCM length must be a whole number of frames for its channel count.')
  if (!(factor > 0) || !Number.isFinite(factor))
    throw new Error('Resample factor must be a positive finite number.')
  if (factor === 1) return new Float32Array(pcm)
  const inFrames = pcm.length / channels
  const outFrames = Math.max(0, Math.round(inFrames * factor))
  const out = new Float32Array(outFrames * channels)
  for (let frame = 0; frame < outFrames; frame++) {
    const sourcePos = inFrames > 1 && outFrames > 1 ? frame / factor : 0
    const index = Math.min(Math.floor(sourcePos), Math.max(0, inFrames - 1))
    const frac = Math.min(1, Math.max(0, sourcePos - index))
    const next = Math.min(index + 1, inFrames - 1)
    for (let channel = 0; channel < channels; channel++) {
      const a = pcm[index * channels + channel] ?? 0
      const b = pcm[next * channels + channel] ?? 0
      out[frame * channels + channel] = a + (b - a) * frac
    }
  }
  return out
}
