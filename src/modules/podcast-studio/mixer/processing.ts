/**
 * POD-07 — Per-source + program-bus DSP blocks (PURE CORE).
 *
 * Everything here operates on Float32Array PCM blocks with explicit state
 * objects, so it is headlessly testable (PT-A style) and can run identically
 * in tests, in the AudioWorklet adapter, and later at render time (POD-13
 * auditions the same program chain). No Web Audio types appear in this file.
 *
 * Blocks: high-pass + 3-band EQ (RBJ biquads, coefficients computed in TS),
 * a self-setting room gate (never fully closes), a feedforward compressor,
 * and a bus limiter ceiling. The limiter is the FINAL GUARD only — the
 * primary headroom strategy is the 1/N gain staging in `routing.ts`
 * (POD-REQ-15, decided from the PT-A measurement: 0.75 peak ruled vs 2.25
 * unruled).
 */

export const dbToLinear = (db: number): number => Math.pow(10, db / 20)
export const linearToDb = (linear: number): number =>
  linear > 0 ? 20 * Math.log10(linear) : -Infinity

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// ---------------------------------------------------------------------------
// Biquads (RBJ Audio EQ Cookbook coefficients, computed in TypeScript)
// ---------------------------------------------------------------------------

export type BiquadCoefficients = {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

export type BiquadState = { x1: number; x2: number; y1: number; y2: number }

export const createBiquadState = (): BiquadState => ({ x1: 0, x2: 0, y1: 0, y2: 0 })

const normalize = (b0: number, b1: number, b2: number, a0: number, a1: number, a2: number) => ({
  b0: b0 / a0,
  b1: b1 / a0,
  b2: b2 / a0,
  a1: a1 / a0,
  a2: a2 / a0,
})

export const highPassCoefficients = (
  sampleRate: number,
  frequencyHz: number,
  q = Math.SQRT1_2,
): BiquadCoefficients => {
  const w = (2 * Math.PI * clamp(frequencyHz, 10, sampleRate / 2 - 1)) / sampleRate
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  return normalize((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha)
}

export const peakingCoefficients = (
  sampleRate: number,
  frequencyHz: number,
  gainDb: number,
  q = 1,
): BiquadCoefficients => {
  const w = (2 * Math.PI * clamp(frequencyHz, 10, sampleRate / 2 - 1)) / sampleRate
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  const a = Math.pow(10, gainDb / 40)
  return normalize(1 + alpha * a, -2 * cos, 1 - alpha * a, 1 + alpha / a, -2 * cos, 1 - alpha / a)
}

export const lowShelfCoefficients = (
  sampleRate: number,
  frequencyHz: number,
  gainDb: number,
): BiquadCoefficients => {
  const w = (2 * Math.PI * clamp(frequencyHz, 10, sampleRate / 2 - 1)) / sampleRate
  const cos = Math.cos(w)
  const a = Math.pow(10, gainDb / 40)
  const alpha = (Math.sin(w) / 2) * Math.sqrt((a + 1 / a) * (1 / 0.9 - 1) + 2)
  const s = 2 * Math.sqrt(a) * alpha
  return normalize(
    a * (a + 1 - (a - 1) * cos + s),
    2 * a * (a - 1 - (a + 1) * cos),
    a * (a + 1 - (a - 1) * cos - s),
    a + 1 + (a - 1) * cos + s,
    -2 * (a - 1 + (a + 1) * cos),
    a + 1 + (a - 1) * cos - s,
  )
}

export const highShelfCoefficients = (
  sampleRate: number,
  frequencyHz: number,
  gainDb: number,
): BiquadCoefficients => {
  const w = (2 * Math.PI * clamp(frequencyHz, 10, sampleRate / 2 - 1)) / sampleRate
  const cos = Math.cos(w)
  const a = Math.pow(10, gainDb / 40)
  const alpha = (Math.sin(w) / 2) * Math.sqrt((a + 1 / a) * (1 / 0.9 - 1) + 2)
  const s = 2 * Math.sqrt(a) * alpha
  return normalize(
    a * (a + 1 + (a - 1) * cos + s),
    -2 * a * (a - 1 + (a + 1) * cos),
    a * (a + 1 + (a - 1) * cos - s),
    a + 1 - (a - 1) * cos + s,
    2 * (a - 1 - (a + 1) * cos),
    a + 1 - (a - 1) * cos - s,
  )
}

/** Magnitude response |H(e^jw)| of a biquad at a probe frequency (testable). */
export const biquadMagnitudeAt = (
  coefficients: BiquadCoefficients,
  sampleRate: number,
  frequencyHz: number,
): number => {
  const w = (2 * Math.PI * frequencyHz) / sampleRate
  const cos1 = Math.cos(w)
  const sin1 = Math.sin(w)
  const cos2 = Math.cos(2 * w)
  const sin2 = Math.sin(2 * w)
  const numRe = coefficients.b0 + coefficients.b1 * cos1 + coefficients.b2 * cos2
  const numIm = -(coefficients.b1 * sin1 + coefficients.b2 * sin2)
  const denRe = 1 + coefficients.a1 * cos1 + coefficients.a2 * cos2
  const denIm = -(coefficients.a1 * sin1 + coefficients.a2 * sin2)
  return Math.hypot(numRe, numIm) / Math.hypot(denRe, denIm)
}

/** In-place Direct Form I biquad over one block. */
export const processBiquadBlock = (
  coefficients: BiquadCoefficients,
  state: BiquadState,
  block: Float32Array,
): void => {
  const { b0, b1, b2, a1, a2 } = coefficients
  let { x1, x2, y1, y2 } = state
  for (let i = 0; i < block.length; i++) {
    const x = block[i]
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    block[i] = y
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
  }
  state.x1 = x1
  state.x2 = x2
  state.y1 = y1
  state.y2 = y2
}

// ---------------------------------------------------------------------------
// Per-source EQ chain: high-pass + low shelf + peaking + high shelf
// ---------------------------------------------------------------------------

export type EqSettings = {
  highPassHz: number
  lowGainDb: number
  lowHz: number
  midGainDb: number
  midHz: number
  midQ: number
  highGainDb: number
  highHz: number
}

export const DEFAULT_EQ_SETTINGS: EqSettings = {
  highPassHz: 80,
  lowGainDb: 0,
  lowHz: 200,
  midGainDb: 0,
  midHz: 1000,
  midQ: 1,
  highGainDb: 0,
  highHz: 6000,
}

export type EqChain = {
  settings: EqSettings
  sampleRate: number
  coefficients: {
    highPass: BiquadCoefficients
    low: BiquadCoefficients
    mid: BiquadCoefficients
    high: BiquadCoefficients
  }
  states: { highPass: BiquadState; low: BiquadState; mid: BiquadState; high: BiquadState }
}

export const createEqChain = (sampleRate: number, settings: EqSettings): EqChain => ({
  settings,
  sampleRate,
  coefficients: {
    highPass: highPassCoefficients(sampleRate, settings.highPassHz),
    low: lowShelfCoefficients(sampleRate, settings.lowHz, settings.lowGainDb),
    mid: peakingCoefficients(sampleRate, settings.midHz, settings.midGainDb, settings.midQ),
    high: highShelfCoefficients(sampleRate, settings.highHz, settings.highGainDb),
  },
  states: {
    highPass: createBiquadState(),
    low: createBiquadState(),
    mid: createBiquadState(),
    high: createBiquadState(),
  },
})

/** In-place per-source chain: HP → low → mid → high. */
export const processEqBlock = (chain: EqChain, block: Float32Array): void => {
  processBiquadBlock(chain.coefficients.highPass, chain.states.highPass, block)
  processBiquadBlock(chain.coefficients.low, chain.states.low, block)
  processBiquadBlock(chain.coefficients.mid, chain.states.mid, block)
  processBiquadBlock(chain.coefficients.high, chain.states.high, block)
}

// ---------------------------------------------------------------------------
// Room gate — self-setting threshold, NEVER fully closes (tool map row 30).
//
// The threshold tracks an estimated noise floor (slow downward adaptation on
// quiet blocks, frozen while signal is present) and sits GATE_MARGIN_DB above
// it; there is no user threshold. Below threshold the gain eases to
// GATE_FLOOR_GAIN (-20 dB), never to 0, so room tone never pumps to digital
// silence. Attack/release smoothing prevents chatter on borderline input.
//
// The gate is a SEND/monitoring treatment only: `gateForSend` returns a gated
// COPY. ISO tracks (POD-09) always record the raw, ungated signal.
// ---------------------------------------------------------------------------

export const GATE_FLOOR_GAIN = 0.1 // -20 dB — the gate never closes past this
export const GATE_MARGIN_DB = 12
/** Hysteresis: the gate closes at a lower level than it opens — no chatter. */
export const GATE_CLOSE_MARGIN_DB = 6
export const GATE_INITIAL_FLOOR = 0.002 // assumed room tone before first estimate

export type RoomGateState = {
  noiseFloor: number
  gain: number
  open: boolean
  sampleRate: number
}

export const createRoomGate = (sampleRate: number): RoomGateState => ({
  noiseFloor: GATE_INITIAL_FLOOR,
  gain: 1,
  open: true,
  sampleRate,
})

const blockRms = (block: Float32Array): number => {
  if (block.length === 0) return 0
  let sum = 0
  for (let i = 0; i < block.length; i++) sum += block[i] * block[i]
  return Math.sqrt(sum / block.length)
}

/**
 * Advances the gate over one block and returns the (smoothed) gain to apply.
 * One gain per block keeps the control path click-free at block rate.
 */
export const roomGateGainForBlock = (gate: RoomGateState, block: Float32Array): number => {
  const rms = blockRms(block)
  const openThreshold = gate.noiseFloor * dbToLinear(GATE_MARGIN_DB)
  const closeThreshold = gate.noiseFloor * dbToLinear(GATE_CLOSE_MARGIN_DB)
  if (rms > openThreshold) gate.open = true
  else if (rms < closeThreshold) gate.open = false
  // Between the thresholds the state holds (hysteresis) — borderline input
  // cannot flap the gate.
  if (!gate.open) {
    // Quiet block: adapt the floor estimate toward what we hear (slowly, and
    // only while closed so speech never raises the floor into itself).
    gate.noiseFloor += (Math.max(rms, 1e-6) - gate.noiseFloor) * 0.05
  }
  const target = gate.open ? 1 : GATE_FLOOR_GAIN
  const blockSec = block.length / gate.sampleRate
  const coeff =
    target > gate.gain
      ? 1 - Math.exp(-blockSec / 0.005) // 5 ms attack
      : 1 - Math.exp(-blockSec / 0.15) // 150 ms release
  gate.gain += (target - gate.gain) * coeff
  return gate.gain
}

/** Gated COPY of a block for send/monitor paths; the input is never mutated. */
export const gateForSend = (gate: RoomGateState, block: Float32Array): Float32Array => {
  const gain = roomGateGainForBlock(gate, block)
  const out = new Float32Array(block.length)
  for (let i = 0; i < block.length; i++) out[i] = block[i] * gain
  return out
}

// ---------------------------------------------------------------------------
// Feedforward compressor
// ---------------------------------------------------------------------------

export type CompressorSettings = {
  thresholdDb: number
  ratio: number
  attackMs: number
  releaseMs: number
  makeupDb: number
}

export const DEFAULT_COMPRESSOR_SETTINGS: CompressorSettings = {
  thresholdDb: -18,
  ratio: 3,
  attackMs: 10,
  releaseMs: 120,
  makeupDb: 0,
}

export type CompressorState = { envelopeDb: number; sampleRate: number }

export const createCompressor = (sampleRate: number): CompressorState => ({
  envelopeDb: -60,
  sampleRate,
})

/** In-place feedforward compression over one block (per-sample envelope). */
export const processCompressorBlock = (
  settings: CompressorSettings,
  state: CompressorState,
  block: Float32Array,
): void => {
  const attackCoeff = Math.exp(-1 / ((settings.attackMs / 1000) * state.sampleRate))
  const releaseCoeff = Math.exp(-1 / ((settings.releaseMs / 1000) * state.sampleRate))
  const makeup = dbToLinear(settings.makeupDb)
  let env = state.envelopeDb
  for (let i = 0; i < block.length; i++) {
    const levelDb = linearToDb(Math.abs(block[i]) + 1e-9)
    const coeff = levelDb > env ? attackCoeff : releaseCoeff
    env = coeff * env + (1 - coeff) * levelDb
    let gainDb = 0
    if (env > settings.thresholdDb) {
      gainDb = settings.thresholdDb + (env - settings.thresholdDb) / settings.ratio - env
    }
    block[i] = block[i] * dbToLinear(gainDb) * makeup
  }
  state.envelopeDb = env
}

// ---------------------------------------------------------------------------
// Bus limiter ceiling — final guard ONLY (never the gain strategy).
// Instant-attack peak follower + release smoothing: once the envelope is at
// or above a sample's magnitude, gain ≤ ceiling/|x|, so output can never
// exceed the ceiling after the envelope has seen the peak.
// ---------------------------------------------------------------------------

export type LimiterState = { envelope: number; sampleRate: number; releaseMs: number }

export const createLimiter = (sampleRate: number, releaseMs = 100): LimiterState => ({
  envelope: 0,
  sampleRate,
  releaseMs,
})

export const processLimiterBlock = (
  ceilingDb: number,
  state: LimiterState,
  block: Float32Array,
): void => {
  const ceiling = dbToLinear(ceilingDb)
  const releaseCoeff = Math.exp(-1 / ((state.releaseMs / 1000) * state.sampleRate))
  let env = state.envelope
  for (let i = 0; i < block.length; i++) {
    const magnitude = Math.abs(block[i])
    env = Math.max(magnitude, env * releaseCoeff)
    const gain = env > ceiling ? ceiling / env : 1
    block[i] = block[i] * gain
  }
  state.envelope = env
}

/**
 * Program-bus chain (tool map row 37): high-pass → compressor → limiter
 * ceiling. The same chain is auditioned in the editor and applied at render
 * (POD-13). State is carried across blocks by the caller.
 */
export type ProgramChain = {
  eq: EqChain
  compressor: CompressorState
  compressorSettings: CompressorSettings
  limiter: LimiterState
  ceilingDb: number
}

export const createProgramChain = (
  sampleRate: number,
  ceilingDb: number,
  compressorSettings: CompressorSettings = DEFAULT_COMPRESSOR_SETTINGS,
): ProgramChain => ({
  eq: createEqChain(sampleRate, { ...DEFAULT_EQ_SETTINGS }),
  compressor: createCompressor(sampleRate),
  compressorSettings,
  limiter: createLimiter(sampleRate),
  ceilingDb,
})

export const processProgramBlock = (chain: ProgramChain, block: Float32Array): void => {
  processEqBlock(chain.eq, block)
  processCompressorBlock(chain.compressorSettings, chain.compressor, block)
  processLimiterBlock(chain.ceilingDb, chain.limiter, block)
}
