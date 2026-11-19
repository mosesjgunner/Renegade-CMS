/**
 * POD-07 — Routing core (PURE): the PT-A bus topology over PCM blocks.
 *
 * Port of the proven PT-A model (`RC3_NATIVE_PODCAST_PROTOTYPE_EVIDENCE/
 * PT-A-mixminus/mixminus.js`, Renegade's own R&D) into production TypeScript.
 * The architectural lesson of PT-A is preserved exactly: buses are built by
 * INCLUSION, never by subtraction — a guest's mix-minus simply never sums
 * that guest's return, so own-return energy is exactly 0, not approximately.
 *
 * Buses:
 * - PROGRAM: every unmuted source (host, clips, guests) — what records and
 *   streams. 1/N headroom staging (N = active unmuted contributors) is the
 *   primary gain strategy (POD-REQ-15, DECIDED from PT-A's measurement:
 *   0.75 peak ruled vs 2.25 unruled); master gain, then the limiter ceiling
 *   from the session snapshot as the final guard.
 * - MIX-MINUS per guest: program contributors minus that guest, PLUS
 *   talkback. This is the function POD-10 consumes for remote guests.
 * - HOST CUE (PFL): solo/PFL strips only when any are assigned; otherwise
 *   all non-host contributors (PT-A: guest + clips, no host self-sidetone).
 * - TALKBACK (host → guests): a send, never a bus input. There is NO route
 *   from talkback into program or cue — the contributor lists below are
 *   built from strip kinds only, and 'talkback' is not a strip kind, so
 *   talkback is structurally unable to reach program/record/stream taps.
 */

import { createLimiter, dbToLinear, processLimiterBlock, type LimiterState } from './processing'
import type { ChannelStrip, MixerState } from './state'

export type StereoBlock = { left: Float32Array; right: Float32Array }

export type RenderInputs = {
  /** Host mic, mono. */
  host?: Float32Array
  /** Clip players, stereo. */
  clips?: StereoBlock
  /** Remote guest returns, mono, keyed by strip id. */
  guests?: Record<string, Float32Array>
  /** Host talkback mic send, mono. Never routed to program/cue. */
  talkback?: Float32Array
}

export type RenderOutput = {
  program: StereoBlock
  /** Per-guest mix-minus sends, keyed by guest strip id. */
  mixMinusPerGuest: Record<string, StereoBlock>
  /** Host cue / PFL bus. */
  cue: StereoBlock
  /** Active contributor counts per bus (the N of the 1/N rule) — for proof/metering. */
  contributors: { program: number; cue: number; mixMinusPerGuest: Record<string, number> }
}

type Contributor = {
  strip: ChannelStrip
  left: Float32Array
  right: Float32Array
}

/**
 * Center-compensated equal-power pan: at pan 0 a mono source lands at unity
 * on BOTH channels (dual mono), so the core reproduces PT-A's measured
 * numbers exactly (program peak 0.75, per-tone energy 0.0225 across L+R).
 */
const equalPowerPanGains = (pan: number): { left: number; right: number } => {
  const angle = ((pan + 1) * Math.PI) / 4
  return { left: Math.cos(angle) * Math.SQRT2, right: Math.sin(angle) * Math.SQRT2 }
}

const contributorFor = (
  strip: ChannelStrip,
  inputs: RenderInputs,
  frames: number,
): Contributor | null => {
  if (strip.muted) return null
  const gain = dbToLinear(strip.gainDb)
  const pan = equalPowerPanGains(strip.pan)
  const scale = (source: Float32Array, panGain: number) => {
    const out = new Float32Array(frames)
    for (let i = 0; i < frames; i++) out[i] = (source[i] ?? 0) * gain * panGain
    return out
  }
  if (strip.kind === 'host') {
    if (!inputs.host) return null
    return { strip, left: scale(inputs.host, pan.left), right: scale(inputs.host, pan.right) }
  }
  if (strip.kind === 'clips') {
    if (!inputs.clips) return null
    // Stereo source: pan acts as balance — center is unity on both sides,
    // panning only ever attenuates the opposite side.
    return {
      strip,
      left: scale(inputs.clips.left, Math.min(1, pan.left)),
      right: scale(inputs.clips.right, Math.min(1, pan.right)),
    }
  }
  const guest = inputs.guests?.[strip.id]
  if (!guest) return null
  return { strip, left: scale(guest, pan.left), right: scale(guest, pan.right) }
}

/** Program contributors: strips only. Talkback can never appear here. */
const programContributors = (state: MixerState, inputs: RenderInputs, frames: number) =>
  state.strips
    .filter((strip) => strip.kind !== 'guest' || state.keepGuestsInProgram)
    .map((strip) => contributorFor(strip, inputs, frames))
    .filter((c): c is Contributor => c !== null)

const sumWithHeadroom = (contributors: Contributor[], frames: number): StereoBlock => {
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  const n = contributors.length
  if (n === 0) return { left, right }
  const staging = 1 / n // the 1/N headroom rule (PT-A, POD-REQ-15)
  for (const contributor of contributors) {
    for (let i = 0; i < frames; i++) {
      left[i] += contributor.left[i] * staging
      right[i] += contributor.right[i] * staging
    }
  }
  return { left, right }
}

export type MixerEngine = {
  state: MixerState
  sampleRate: number
  programLimiter: LimiterState
}

export const createMixerEngine = (state: MixerState, sampleRate = 48000): MixerEngine => ({
  state,
  sampleRate,
  programLimiter: createLimiter(sampleRate),
})

/**
 * Renders one block. Inputs may be any length; the block length is taken
 * from the longest provided input. All outputs are freshly allocated.
 */
export const renderBlock = (engine: MixerEngine, inputs: RenderInputs): RenderOutput => {
  const { state } = engine
  const frames = Math.max(
    inputs.host?.length ?? 0,
    inputs.clips?.left.length ?? 0,
    inputs.talkback?.length ?? 0,
    ...Object.values(inputs.guests ?? {}).map((block) => block.length),
    0,
  )

  const programSources = programContributors(state, inputs, frames)
  const program = sumWithHeadroom(programSources, frames)

  // Master gain, then the limiter ceiling as the final guard (never the
  // primary strategy — the 1/N staging above does the headroom work).
  const master = dbToLinear(state.masterGainDb)
  if (master !== 1) {
    for (let i = 0; i < frames; i++) {
      program.left[i] *= master
      program.right[i] *= master
    }
  }
  processLimiterBlock(state.limiterCeilingDb, engine.programLimiter, program.left)
  // A second limiter state would drift from the left channel's; the ceiling
  // is a guard, so the right channel is hard-clamped to the same ceiling.
  const ceiling = dbToLinear(state.limiterCeilingDb)
  for (let i = 0; i < frames; i++) {
    if (program.right[i] > ceiling) program.right[i] = ceiling
    else if (program.right[i] < -ceiling) program.right[i] = -ceiling
  }

  // Talkback send (host → guests), prepared once; added to guest sends only.
  const talkbackGain = state.talkbackMuted ? 0 : dbToLinear(state.talkbackGainDb)
  const talkbackBlock =
    inputs.talkback && talkbackGain > 0
      ? (() => {
          const out = new Float32Array(frames)
          for (let i = 0; i < frames; i++) out[i] = (inputs.talkback[i] ?? 0) * talkbackGain
          return out
        })()
      : null

  // Per-guest mix-minus: program contributors minus that guest, by
  // inclusion (the guest's own contributor is simply never summed), plus
  // talkback. This is the send POD-10 hands to each remote participant.
  const mixMinusPerGuest: Record<string, StereoBlock> = {}
  const mixMinusCounts: Record<string, number> = {}
  for (const strip of state.strips) {
    if (strip.kind !== 'guest') continue
    const others = programSources.filter((c) => c.strip.id !== strip.id)
    const bus = sumWithHeadroom(others, frames)
    let count = others.length
    if (talkbackBlock) {
      // Talkback joins the bus as one more contributor under the same rule:
      // re-stage the whole bus at 1/(N+1) instead of double-staging.
      const restage = others.length > 0 ? others.length / (others.length + 1) : 1
      const tbStaging = 1 / (others.length + 1)
      for (let i = 0; i < frames; i++) {
        bus.left[i] = bus.left[i] * restage + talkbackBlock[i] * tbStaging
        bus.right[i] = bus.right[i] * restage + talkbackBlock[i] * tbStaging
      }
      count += 1
    }
    mixMinusPerGuest[strip.id] = bus
    mixMinusCounts[strip.id] = count
  }

  // Host cue (PFL): solo/PFL strips if any are assigned, else every non-host
  // contributor (PT-A host cue: guest + clips, no host self-sidetone).
  const anyPfl = state.strips.some((strip) => strip.solo || strip.pfl)
  const cueSources = anyPfl
    ? programSources.filter((c) => c.strip.solo || c.strip.pfl)
    : programSources.filter((c) => c.strip.kind !== 'host')
  const cue = sumWithHeadroom(cueSources, frames)

  return {
    program,
    mixMinusPerGuest,
    cue,
    contributors: {
      program: programSources.length,
      cue: cueSources.length,
      mixMinusPerGuest: mixMinusCounts,
    },
  }
}

/** One-shot render with a fresh engine (tests, offline audition). */
export const renderBlockOnce = (
  state: MixerState,
  inputs: RenderInputs,
  sampleRate = 48000,
): RenderOutput => renderBlock(createMixerEngine(state, sampleRate), inputs)
