/**
 * POD-07 (POD-REQ-14, POD-REQ-15): headless tests for the mixer & routing
 * engine's PURE CORES, carrying the PT-A prototype's acceptance assertions
 * into production code.
 *
 * PT-A (RC3_NATIVE_PODCAST_PROTOTYPE_EVIDENCE/PT-A-mixminus) proved the bus
 * model offline with three 0.9-amplitude tones (host 440 Hz, guest 880 Hz,
 * clip 1320 Hz, 1 s @ 48 kHz): program peak 0.7499 under the 1/N rule vs
 * 2.25 unruled; guest own-return energy exactly 0. These tests assert the
 * SAME numbers against `src/modules/podcast-studio/mixer/routing.ts`.
 *
 * What this does NOT prove: real-engine behaviour in a browser. The Web
 * Audio adapter + worklet are UNVERIFIED against a real AudioContext (the
 * worklet gets a fake-globals smoke test below, mirroring POD-06's capture
 * worklet test). See the POD-07 handoff.
 */
import { describe, expect, it } from 'vitest'

import { parseStudioSession } from '../../src/modules/podcast-studio/contracts/session'
import { buildExampleSession } from '../../src/modules/podcast-studio/sessions'
import {
  applyRoleProposals,
  biquadMagnitudeAt,
  computeRoutingDiff,
  createCompressor,
  createEqChain,
  createLimiter,
  createRoomGate,
  createStripMeter,
  dbToLinear,
  DEFAULT_COMPRESSOR_SETTINGS,
  defaultMixerState,
  GATE_FLOOR_GAIN,
  gateForSend,
  highPassCoefficients,
  mixerStateFromSnapshot,
  mixerStateToSnapshot,
  monitoringLatencyMs,
  peakingCoefficients,
  processCompressorBlock,
  processLimiterBlock,
  proposeRoleAssignments,
  renderBlockOnce,
  roomGateGainForBlock,
  switchDeskMode,
  updateStripMeter,
  type DeviceRoleAssignment,
  type MixerState,
} from '../../src/modules/podcast-studio/mixer'
import {
  MIXER_PROCESSOR_NAME,
  mixerProcessorSource,
} from '../../src/modules/podcast-studio/mixer/worklet/mixer-processor'

const SR = 48000
const FRAMES = SR // 1 second, exactly as PT-A

const tone = (frequencyHz: number, amplitude = 0.9, frames = FRAMES): Float32Array => {
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++)
    out[i] = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / SR)
  return out
}

/** Goertzel single-frequency power, PT-A's normalisation: sine amplitude A → A²/4. */
const goertzel = (samples: Float32Array, frequencyHz: number): number => {
  const n = samples.length
  const k = (frequencyHz * n) / SR
  const w = (2 * Math.PI * k) / n
  const coeff = 2 * Math.cos(w)
  let s0 = 0
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < n; i++) {
    s0 = samples[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return (s1 * s1 + s2 * s2 - coeff * s1 * s2) / (n * n)
}

const peak = (samples: Float32Array): number => {
  let p = 0
  for (const v of samples) p = Math.max(p, Math.abs(v))
  return p
}

const ptAInputs = () => ({
  host: tone(440),
  clips: { left: tone(1320), right: tone(1320) },
  guests: { 'guest-1': tone(880) },
})

describe('PT-A acceptance assertions on the production routing core', () => {
  it('A1: program contains host + guest + clip at PT-A energies', () => {
    const out = renderBlockOnce(defaultMixerState(), ptAInputs())
    expect(out.contributors.program).toBe(3)
    for (const frequency of [440, 880, 1320]) {
      expect(goertzel(out.program.left, frequency)).toBeCloseTo(0.0225, 4)
      expect(goertzel(out.program.right, frequency)).toBeCloseTo(0.0225, 4)
    }
  })

  it('A2+A3: guest mix-minus has host + clips and EXACTLY zero own return', () => {
    const out = renderBlockOnce(defaultMixerState(), ptAInputs())
    const bus = out.mixMinusPerGuest['guest-1']
    expect(bus).toBeDefined()
    expect(goertzel(bus.left, 440)).toBeCloseTo(0.050625, 4)
    expect(goertzel(bus.left, 1320)).toBeCloseTo(0.050625, 4)
    expect(goertzel(bus.left, 880)).toBeLessThan(1e-9)
    expect(goertzel(bus.right, 880)).toBeLessThan(1e-9)
  })

  it('A4: program peak is the PT-A measured 0.7499 under the 1/N rule', () => {
    const out = renderBlockOnce(defaultMixerState(), ptAInputs())
    expect(peak(out.program.left)).toBeCloseTo(0.7499, 3)
    expect(peak(out.program.left)).toBeLessThanOrEqual(dbToLinear(-1)) // ≤ −1 dBFS
  })

  it('A6 (control): the naive unruled sum of the same sources clips at 2.25', () => {
    const naive = new Float32Array(FRAMES)
    const inputs = ptAInputs()
    for (let i = 0; i < FRAMES; i++) {
      naive[i] = inputs.host[i] + inputs.guests['guest-1'][i] + inputs.clips.left[i]
    }
    expect(peak(naive)).toBeCloseTo(2.25, 2)
    expect(peak(naive)).toBeGreaterThan(1)
  })

  it('A7: muting the clip removes only 1320 Hz from program', () => {
    const state = defaultMixerState()
    state.strips.find((s) => s.id === 'clips')!.muted = true
    const out = renderBlockOnce(state, ptAInputs())
    expect(goertzel(out.program.left, 1320)).toBeLessThan(1e-9)
    expect(goertzel(out.program.left, 440)).toBeCloseTo(0.050625, 4)
    expect(goertzel(out.program.left, 880)).toBeCloseTo(0.050625, 4)
  })

  it('host cue = guest + clips, no host self-sidetone (PT-A host cue bus)', () => {
    const out = renderBlockOnce(defaultMixerState(), ptAInputs())
    expect(goertzel(out.cue.left, 440)).toBeLessThan(1e-9)
    expect(goertzel(out.cue.left, 880)).toBeCloseTo(0.050625, 4)
    expect(goertzel(out.cue.left, 1320)).toBeCloseTo(0.050625, 4)
  })

  it('host hears guest+clips, guest hears host+clips, nobody hears themselves; solo/PFL narrows the cue', () => {
    const state = defaultMixerState()
    state.strips.find((s) => s.id === 'clips')!.solo = true
    const out = renderBlockOnce(state, ptAInputs())
    expect(goertzel(out.cue.left, 1320)).toBeGreaterThan(0.01)
    expect(goertzel(out.cue.left, 880)).toBeLessThan(1e-9)
    expect(goertzel(out.cue.left, 440)).toBeLessThan(1e-9)
  })

  it('two guests + two clip tones: each mix-minus excludes only its own guest', () => {
    const state = defaultMixerState(['guest-1', 'guest-2'])
    const out = renderBlockOnce(state, {
      host: tone(440),
      clips: { left: tone(1320), right: tone(1760) },
      guests: { 'guest-1': tone(880), 'guest-2': tone(660) },
    })
    const mm1 = out.mixMinusPerGuest['guest-1']
    const mm2 = out.mixMinusPerGuest['guest-2']
    expect(goertzel(mm1.left, 880)).toBeLessThan(1e-9) // own return gone
    expect(goertzel(mm1.left, 660)).toBeGreaterThan(0.001) // other guest present
    expect(goertzel(mm1.left, 440)).toBeGreaterThan(0.001)
    expect(goertzel(mm1.left, 1320)).toBeGreaterThan(0.001)
    expect(goertzel(mm2.left, 660)).toBeLessThan(1e-9)
    expect(goertzel(mm2.left, 880)).toBeGreaterThan(0.001)
    // Program carries everyone + both clip tones.
    for (const frequency of [440, 660, 880, 1320]) {
      expect(goertzel(out.program.left, frequency)).toBeGreaterThan(0.001)
    }
    expect(goertzel(out.program.right, 1760)).toBeGreaterThan(0.001)
  })
})

describe('structural exclusion — sample-exact zero (stronger than PT-A A3)', () => {
  const allZero = (block: Float32Array) => block.every((v) => v === 0)

  it('a guest return ALONE produces a literally all-zero mix-minus for that guest', () => {
    const out = renderBlockOnce(defaultMixerState(), { guests: { 'guest-1': tone(880) } })
    expect(allZero(out.mixMinusPerGuest['guest-1'].left)).toBe(true)
    expect(allZero(out.mixMinusPerGuest['guest-1'].right)).toBe(true)
    expect(peak(out.program.left)).toBeGreaterThan(0) // but it IS in program
  })

  it('talkback ALONE produces literally all-zero program and cue', () => {
    const state = defaultMixerState()
    state.talkbackMuted = false
    const out = renderBlockOnce(state, { talkback: tone(220) })
    expect(allZero(out.program.left)).toBe(true)
    expect(allZero(out.program.right)).toBe(true)
    expect(allZero(out.cue.left)).toBe(true)
    expect(peak(out.mixMinusPerGuest['guest-1'].left)).toBeGreaterThan(0) // guests hear it
  })

  it('the host ALONE produces a literally all-zero cue (no self-sidetone path exists)', () => {
    const out = renderBlockOnce(defaultMixerState(), { host: tone(440) })
    expect(allZero(out.cue.left)).toBe(true)
    expect(allZero(out.cue.right)).toBe(true)
  })
})

describe('headroom rule (POD-REQ-15)', () => {
  it('N contributors at unity full scale: 1/N staging alone peaks at exactly 1.0 (≤ 0 dBFS)', () => {
    const state = defaultMixerState(['guest-1', 'guest-2'])
    state.limiterCeilingDb = 6 // ceiling out of the way: staging must do the work
    const fullScale = () => tone(440, 1.0)
    const out = renderBlockOnce(state, {
      host: fullScale(),
      clips: { left: fullScale(), right: fullScale() },
      guests: { 'guest-1': fullScale(), 'guest-2': fullScale() },
    })
    expect(out.contributors.program).toBe(4)
    expect(peak(out.program.left)).toBeCloseTo(1.0, 3)
    expect(peak(out.program.left)).toBeLessThanOrEqual(1.0 + 1e-6)
  })

  it('with the snapshot ceiling at −1 dBFS, the limiter guard caps coherent full-scale at the ceiling', () => {
    const state = defaultMixerState(['guest-1', 'guest-2'])
    expect(state.limiterCeilingDb).toBe(-1)
    const fullScale = () => tone(440, 1.0)
    const out = renderBlockOnce(state, {
      host: fullScale(),
      clips: { left: fullScale(), right: fullScale() },
      guests: { 'guest-1': fullScale(), 'guest-2': fullScale() },
    })
    const ceiling = dbToLinear(-1)
    expect(peak(out.program.left)).toBeLessThanOrEqual(ceiling + 1e-6)
    expect(peak(out.program.right)).toBeLessThanOrEqual(ceiling + 1e-6)
    expect(peak(out.program.left)).toBeGreaterThan(0.85) // the guard engaged near the ceiling
  })

  it('standalone limiter: a 1.5-amplitude block never exceeds the ceiling', () => {
    const limiter = createLimiter(SR)
    const block = new Float32Array(4096).fill(1.5)
    processLimiterBlock(-1, limiter, block)
    expect(peak(block)).toBeLessThanOrEqual(dbToLinear(-1) + 1e-6)
    expect(block[block.length - 1]).toBeCloseTo(dbToLinear(-1), 3)
  })
})

describe('talkback bus', () => {
  it('present in every guest send, EXACTLY zero in program and cue', () => {
    const state = defaultMixerState(['guest-1', 'guest-2'])
    state.talkbackMuted = false
    const out = renderBlockOnce(state, {
      ...ptAInputs(),
      guests: { 'guest-1': tone(880), 'guest-2': tone(660) },
      talkback: tone(220),
    })
    expect(goertzel(out.program.left, 220)).toBeLessThan(1e-9)
    expect(goertzel(out.program.right, 220)).toBeLessThan(1e-9)
    expect(goertzel(out.cue.left, 220)).toBeLessThan(1e-9)
    expect(goertzel(out.mixMinusPerGuest['guest-1'].left, 220)).toBeGreaterThan(0.001)
    expect(goertzel(out.mixMinusPerGuest['guest-2'].left, 220)).toBeGreaterThan(0.001)
  })

  it('muted talkback reaches nobody', () => {
    const state = defaultMixerState()
    expect(state.talkbackMuted).toBe(true)
    const out = renderBlockOnce(state, { ...ptAInputs(), talkback: tone(220) })
    expect(goertzel(out.mixMinusPerGuest['guest-1'].left, 220)).toBeLessThan(1e-9)
  })
})

describe('processing core', () => {
  it('room gate: silence eases to the floor gain and NEVER to zero', () => {
    const gate = createRoomGate(SR)
    const quiet = tone(1000, 0.0014, 128) // RMS ≈ 0.001, room tone
    let gain = 1
    for (let block = 0; block < 300; block++) gain = roomGateGainForBlock(gate, quiet)
    expect(gain).toBeGreaterThanOrEqual(GATE_FLOOR_GAIN - 0.01)
    expect(gain).toBeLessThan(0.2)
    expect(gain).toBeGreaterThan(0)
  })

  it('room gate: speech-level input returns to ~unity; gateForSend copies, never mutates', () => {
    const gate = createRoomGate(SR)
    const quiet = tone(1000, 0.0014, 128)
    for (let block = 0; block < 300; block++) roomGateGainForBlock(gate, quiet)
    const speech = tone(1000, 0.3, 128)
    let gain = 0
    for (let block = 0; block < 30; block++) gain = roomGateGainForBlock(gate, speech)
    expect(gain).toBeGreaterThan(0.9)
    const raw = tone(1000, 0.3, 128)
    const snapshot = Float32Array.from(raw)
    const sent = gateForSend(gate, raw)
    expect(Array.from(raw)).toEqual(Array.from(snapshot)) // ISO path stays raw
    expect(sent).not.toBe(raw)
  })

  it('room gate: borderline input does not chatter', () => {
    const gate = createRoomGate(SR)
    const quiet = tone(1000, 0.0014, 128)
    for (let block = 0; block < 300; block++) roomGateGainForBlock(gate, quiet)
    const below = tone(1000, 0.004, 128) // RMS ≈ 0.0028, under threshold
    const above = tone(1000, 0.008, 128) // RMS ≈ 0.0057, over threshold
    const gains: number[] = []
    for (let block = 0; block < 100; block++) {
      gains.push(roomGateGainForBlock(gate, block % 2 === 0 ? below : above))
    }
    const tail = gains.slice(-40)
    const swing = Math.max(...tail) - Math.min(...tail)
    expect(swing).toBeLessThan(0.1) // hysteresis holds state: no flapping once settled
    const maxStep = Math.max(...gains.slice(1).map((g, i) => Math.abs(g - gains[i])))
    expect(maxStep).toBeLessThan(0.45) // and no single-block jump either
  })

  it('EQ coefficients: peaking +6 dB measures +6 dB at its centre, ~unity far away; HP kills subsonics', () => {
    const peaking = peakingCoefficients(SR, 1000, 6, 1)
    expect(biquadMagnitudeAt(peaking, SR, 1000)).toBeCloseTo(dbToLinear(6), 1)
    expect(biquadMagnitudeAt(peaking, SR, 100)).toBeGreaterThan(0.9)
    expect(biquadMagnitudeAt(peaking, SR, 100)).toBeLessThan(1.1)
    const hp = highPassCoefficients(SR, 80)
    expect(biquadMagnitudeAt(hp, SR, 20)).toBeLessThan(0.1)
    expect(biquadMagnitudeAt(hp, SR, 1000)).toBeCloseTo(1, 1)
    const chain = createEqChain(SR, {
      highPassHz: 80,
      lowGainDb: 0,
      lowHz: 200,
      midGainDb: 6,
      midHz: 1000,
      midQ: 1,
      highGainDb: 0,
      highHz: 6000,
    })
    expect(chain.coefficients.mid.b0).toBeCloseTo(peaking.b0, 10)
  })

  it('compressor: a hot steady tone is pulled toward the ratio-predicted level', () => {
    const compressor = createCompressor(SR)
    const settings = { ...DEFAULT_COMPRESSOR_SETTINGS, thresholdDb: -18, ratio: 3 }
    const block = tone(1000, 0.9, 4096)
    for (let i = 0; i < 12; i++) {
      block.set(tone(1000, 0.9, 4096))
      processCompressorBlock(settings, compressor, block)
    }
    // env ≈ −0.9 dB → static prediction −12.3 dB → peak ≈ 0.22; the per-sample
    // envelope tracker lands above the static figure, so the bound is a sanity band
    expect(peak(block)).toBeGreaterThan(0.16)
    expect(peak(block)).toBeLessThan(0.33)
  })
})

describe('strip state, meters, monitoring', () => {
  it('meter reports peak/RMS and latches clip until cleared', () => {
    const meter = createStripMeter()
    updateStripMeter(meter, tone(1000, 0.5, 256))
    expect(meter.peak).toBeCloseTo(0.5, 2)
    expect(meter.clipped).toBe(false)
    updateStripMeter(meter, new Float32Array([1.0, -0.2]))
    expect(meter.clipped).toBe(true)
    updateStripMeter(meter, tone(1000, 0.1, 256))
    expect(meter.clipped).toBe(true) // latch holds
  })

  it('monitoring latency is stated: processed-delayed = block + lookahead (192 frames = 4 ms @ 48 kHz)', () => {
    expect(monitoringLatencyMs('off', SR)).toBe(0)
    expect(monitoringLatencyMs('unprocessed', SR)).toBe(0)
    expect(monitoringLatencyMs('processed-delayed', SR)).toBeCloseTo(4, 5)
  })

  it('snapshot save/restore round-trips through a POD-05 session document losslessly', () => {
    const state = defaultMixerState(['guest-1', 'guest-2'])
    state.strips.find((s) => s.id === 'host')!.gainDb = -3
    state.strips.find((s) => s.id === 'clips')!.pan = -0.5
    state.strips.find((s) => s.id === 'guest-1')!.solo = true
    state.strips.find((s) => s.id === 'guest-2')!.gainDb = -6
    state.masterGainDb = -2
    state.limiterCeilingDb = -1.5

    const snapshot = mixerStateToSnapshot(state)
    const doc = buildExampleSession('show-1', 'Example')
    const session = parseStudioSession({ ...doc, mixer: snapshot })
    const restored = mixerStateFromSnapshot(session.mixer as typeof snapshot)

    expect(restored.masterGainDb).toBe(-2)
    expect(restored.limiterCeilingDb).toBe(-1.5)
    expect(restored.strips).toHaveLength(4)
    const byId = Object.fromEntries(restored.strips.map((s) => [s.id, s]))
    expect(byId['host'].gainDb).toBe(-3)
    expect(byId['clips'].pan).toBe(-0.5)
    expect(byId['guest-1'].solo).toBe(true)
    expect(byId['guest-2'].gainDb).toBe(-6)
    // And back out again identically.
    expect(mixerStateToSnapshot(restored)).toEqual(snapshot)
  })
})

describe('device roles + discovery wizard', () => {
  const oneMic: DeviceRoleAssignment = {
    mode: 'one-mic',
    roles: {
      'mic-in': 'usb-mic',
      'pfl-out': 'headphones',
      'guests-out': 'call-app',
      'mix-minus-in': 'call-app',
    },
    folds: {
      clipsInFold: false,
      guestsInFold: false,
      guestsOutFold: false,
      keepGuestsInProgram: true,
    },
  }

  it('mode switch keeps surviving bindings and diffs the dropped roles', () => {
    const mixerAssignment: DeviceRoleAssignment = {
      ...oneMic,
      mode: 'mixer',
      roles: { ...oneMic.roles, 'clips-in': 'mixer-usb', 'guests-in': 'mixer-usb' },
    }
    const { assignment, diff } = switchDeskMode(mixerAssignment, 'one-mic')
    expect(assignment.mode).toBe('one-mic')
    expect(assignment.roles['mic-in']).toBe('usb-mic')
    expect(diff.map((c) => c.role).sort()).toEqual(['clips-in', 'guests-in'])
    expect(diff.every((c) => c.kind === 'unassign')).toBe(true)
  })

  it('computeRoutingDiff reports a device move for one role only', () => {
    const next: DeviceRoleAssignment = {
      ...oneMic,
      roles: { ...oneMic.roles, 'mic-in': 'xlr-interface' },
    }
    const diff = computeRoutingDiff(oneMic, next)
    expect(diff).toEqual([
      { role: 'mic-in', fromDeviceId: 'usb-mic', toDeviceId: 'xlr-interface', kind: 'move' },
    ])
  })

  it('wizard proposes the spoken device as mic-in; overrides win', () => {
    const devices = [
      { deviceId: 'mic-a', label: 'USB Microphone', kind: 'audioinput' as const },
      { deviceId: 'mic-b', label: 'Webcam Mic', kind: 'audioinput' as const },
      { deviceId: 'spk-a', label: 'Headphones', kind: 'audiooutput' as const },
    ]
    const proposals = proposeRoleAssignments(devices, { 'mic-a': 0.001, 'mic-b': 0.24 })
    const micProposal = proposals.find((p) => p.role === 'mic-in')
    expect(micProposal?.deviceId).toBe('mic-b')
    expect(micProposal?.confidence).toBe('high')
    const roles = applyRoleProposals({}, proposals, { 'mic-in': 'mic-a' })
    expect(roles['mic-in']).toBe('mic-a') // manual override beats the wizard
    expect(roles['pfl-out']).toBe('spk-a')
  })
})

describe('mixer worklet source (fake-globals smoke test — NOT a browser proof)', () => {
  const loadProcessor = () => {
    type ProcessorInstance = {
      port: {
        onmessage: ((event: { data: unknown }) => void) | null
        postMessage: (m: unknown) => void
      }
      process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean
    }
    type ProcessorCtor = new (options?: unknown) => ProcessorInstance
    const holder: { ctor: ProcessorCtor | null } = { ctor: null }
    class FakeWorkletProcessor {
      port = {
        onmessage: null as ((event: { data: unknown }) => void) | null,
        postMessage: (_m: unknown) => {},
      }
    }
    const registerProcessor = (name: string, ctor: ProcessorCtor) => {
      expect(name).toBe(MIXER_PROCESSOR_NAME)
      holder.ctor = ctor
    }
    const run = new Function(
      'AudioWorkletProcessor',
      'registerProcessor',
      'sampleRate',
      mixerProcessorSource,
    )
    run(FakeWorkletProcessor, registerProcessor, SR)
    if (!holder.ctor) throw new Error('processor not registered')
    return new holder.ctor({ processorOptions: { guestIds: ['guest-1'] } })
  }

  it('inlined worklet DSP reproduces the PT-A routing: program has all, guest bus has zero own return', () => {
    const processor = loadProcessor()
    processor.port.onmessage?.({
      data: {
        type: 'state',
        strips: [
          { id: 'host', kind: 'host', gainDb: 0, muted: false, pan: 0 },
          { id: 'clips', kind: 'clips', gainDb: 0, muted: false, pan: 0 },
          { id: 'guest-1', kind: 'guest', gainDb: 0, muted: false, pan: 0 },
        ],
        masterGainDb: 0,
        limiterCeilingDb: -1,
        talkbackGainDb: 0,
        talkbackMuted: true,
        keepGuestsInProgram: true,
      },
    })
    const quantum = 128
    const programAcc = new Float32Array(FRAMES)
    const guestAcc = new Float32Array(FRAMES)
    const host = tone(440)
    const guest = tone(880)
    const clip = tone(1320)
    for (let offset = 0; offset < FRAMES; offset += quantum) {
      const slice = (source: Float32Array) => source.slice(offset, offset + quantum)
      const pL = new Float32Array(quantum)
      const pR = new Float32Array(quantum)
      const cL = new Float32Array(quantum)
      const cR = new Float32Array(quantum)
      const mL = new Float32Array(quantum)
      const mR = new Float32Array(quantum)
      processor.process(
        [[slice(host)], [slice(clip), slice(clip)], [slice(guest)], [new Float32Array(quantum)]],
        [
          [pL, pR],
          [cL, cR],
          [mL, mR],
        ],
      )
      programAcc.set(pL, offset)
      guestAcc.set(mL, offset)
    }
    expect(goertzel(programAcc, 440)).toBeCloseTo(0.0225, 3)
    expect(goertzel(programAcc, 880)).toBeCloseTo(0.0225, 3)
    expect(goertzel(programAcc, 1320)).toBeCloseTo(0.0225, 3)
    expect(goertzel(guestAcc, 880)).toBeLessThan(1e-9)
    expect(goertzel(guestAcc, 440)).toBeCloseTo(0.050625, 3)
  })
})
