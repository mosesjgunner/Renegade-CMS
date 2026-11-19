/**
 * POD-06 — Level metering core (pure TypeScript, no DOM imports).
 *
 * Per-source RMS + peak + rolling peak-hold as pure functions over PCM
 * blocks. Peak-hold holds the last peak for `holdMs`, then decays at
 * `decayDbPerSec`; all math is plain Float32 arithmetic so meter values in
 * tests are hand-computable exactly.
 */

export type BlockLevels = {
  rms: number
  rmsDb: number
  peak: number
  peakDb: number
}

export const toDb = (linear: number): number => (linear <= 0 ? -Infinity : 20 * Math.log10(linear))

export const fromDb = (db: number): number => (db === -Infinity ? 0 : Math.pow(10, db / 20))

/** RMS + peak of one PCM block (single channel or an interleaved stream treated as samples). */
export const computeBlockLevels = (block: Float32Array): BlockLevels => {
  if (block.length === 0) return { rms: 0, rmsDb: -Infinity, peak: 0, peakDb: -Infinity }
  let sumSquares = 0
  let peak = 0
  for (let i = 0; i < block.length; i++) {
    const sample = block[i] ?? 0
    sumSquares += sample * sample
    const magnitude = Math.abs(sample)
    if (magnitude > peak) peak = magnitude
  }
  const rms = Math.sqrt(sumSquares / block.length)
  return { rms, rmsDb: toDb(rms), peak, peakDb: toDb(peak) }
}

export type PeakHoldState = {
  peakHold: number
  /** Timestamp (ms, caller's clock) at which the current hold was set. */
  heldAtMs: number
}

/**
 * One peak-hold step: a new higher peak replaces the hold immediately; while
 * within `holdMs` the hold is kept; afterwards it decays toward the current
 * block peak at `decayDbPerSec`, never below the current block peak.
 */
export const stepPeakHold = (
  state: PeakHoldState,
  blockPeak: number,
  atMs: number,
  options: { holdMs?: number; decayDbPerSec?: number } = {},
): PeakHoldState => {
  const holdMs = options.holdMs ?? 1_000
  const decayDbPerSec = options.decayDbPerSec ?? 12
  if (blockPeak >= state.peakHold) return { peakHold: blockPeak, heldAtMs: atMs }
  const elapsedMs = atMs - state.heldAtMs
  if (elapsedMs <= holdMs) return state
  const decayedDb = toDb(state.peakHold) - (decayDbPerSec * (elapsedMs - holdMs)) / 1000
  const decayed = fromDb(decayedDb)
  return decayed > blockPeak
    ? { peakHold: decayed, heldAtMs: state.heldAtMs }
    : { peakHold: blockPeak, heldAtMs: atMs }
}

/** Stateful per-source meter: push blocks with a caller-supplied clock, read snapshots. */
export class LevelMeter {
  private hold: PeakHoldState = { peakHold: 0, heldAtMs: 0 }
  private last: BlockLevels = { rms: 0, rmsDb: -Infinity, peak: 0, peakDb: -Infinity }

  constructor(private readonly options: { holdMs?: number; decayDbPerSec?: number } = {}) {}

  push(block: Float32Array, atMs: number): BlockLevels & { peakHold: number; peakHoldDb: number } {
    this.last = computeBlockLevels(block)
    this.hold = stepPeakHold(this.hold, this.last.peak, atMs, this.options)
    return this.snapshot()
  }

  snapshot(): BlockLevels & { peakHold: number; peakHoldDb: number } {
    return { ...this.last, peakHold: this.hold.peakHold, peakHoldDb: toDb(this.hold.peakHold) }
  }

  reset(): void {
    this.hold = { peakHold: 0, heldAtMs: 0 }
    this.last = { rms: 0, rmsDb: -Infinity, peak: 0, peakDb: -Infinity }
  }
}
