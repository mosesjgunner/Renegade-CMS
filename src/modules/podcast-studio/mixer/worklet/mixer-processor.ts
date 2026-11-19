/**
 * POD-07 — AudioWorklet mixer processor (dependency-free source).
 *
 * DELIVERY CHOICE (documented, deliberate): the canonical mixer core lives
 * in `../routing.ts` + `../processing.ts` as TypeScript modules, but the
 * repo build has no bundling pipeline that can emit a worklet module with
 * imports (the same constraint POD-06 hit). So — exactly as POD-06 did for
 * capture — the worklet source is a self-contained string that INLINES the
 * minimal DSP the render thread needs (strip gains, pan, 1/N staging,
 * mix-minus by inclusion, limiter ceiling). The math is a deliberate,
 * minimal duplication of the core; the core remains the tested source of
 * truth (PT-A suite runs against `routing.ts`), and this file's smoke test
 * runs the same tone assertions against the inlined copy so drift fails CI.
 *
 * Topology inside the worklet:
 * - inputs: 0 = host (mono), 1 = clips (stereo), 2..2+G-1 = guests (mono),
 *   last = talkback (mono). Guest count arrives via the `guests` port
 *   message before start.
 * - outputs: 0 = program (stereo), 1 = host cue (stereo),
 *   2..2+G-1 = per-guest mix-minus (stereo).
 * - Talkback is summed ONLY into the mix-minus outputs. There is no code
 *   path from the talkback input to the program or cue outputs.
 * - Strip state arrives over the port as plain data
 *   ({type:'state', strips:[{id,kind,gainDb,muted,pan,solo,pfl}], masterGainDb,
 *    limiterCeilingDb, talkbackGainDb, talkbackMuted, keepGuestsInProgram}).
 * - Meters are posted back throttled ({type:'meters', ...}) at ~10 Hz.
 *
 * UNVERIFIED: no real browser AudioWorklet has run this processor; it is
 * proven only by the fake-globals smoke test in the POD-07 unit suite.
 */

export const MIXER_PROCESSOR_NAME = 'renegade-mixer'

export const mixerProcessorSource = `
'use strict'
const dbToLinear = (db) => Math.pow(10, db / 20)
class RenegadeMixerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.guestIds = (options && options.processorOptions && options.processorOptions.guestIds) || []
    this.strips = []
    this.masterGainDb = 0
    this.limiterCeilingDb = -1
    this.talkbackGainDb = 0
    this.talkbackMuted = true
    this.keepGuestsInProgram = true
    this.limiterEnvL = 0
    this.limiterEnvR = 0
    this.framesSinceMeters = 0
    this.port.onmessage = (event) => {
      const data = event.data || {}
      if (data.type === 'state') {
        this.strips = data.strips || []
        this.masterGainDb = data.masterGainDb || 0
        this.limiterCeilingDb = typeof data.limiterCeilingDb === 'number' ? data.limiterCeilingDb : -1
        this.talkbackGainDb = data.talkbackGainDb || 0
        this.talkbackMuted = data.talkbackMuted !== false
        this.keepGuestsInProgram = data.keepGuestsInProgram !== false
      }
    }
  }
  panGains(pan) {
    const angle = ((pan + 1) * Math.PI) / 4
    return { left: Math.cos(angle) * Math.SQRT2, right: Math.sin(angle) * Math.SQRT2 }
  }
  contributor(strip, inputs, frames) {
    if (strip.muted) return null
    const gain = dbToLinear(strip.gainDb || 0)
    const pan = this.panGains(strip.pan || 0)
    let sourceL = null
    let sourceR = null
    if (strip.kind === 'host') {
      const input = inputs[0]
      if (!input || !input[0]) return null
      sourceL = input[0]; sourceR = input[0]
    } else if (strip.kind === 'clips') {
      const input = inputs[1]
      if (!input || !input[0]) return null
      sourceL = input[0]; sourceR = input[1] || input[0]
      const outL = new Float32Array(frames)
      const outR = new Float32Array(frames)
      const balL = Math.min(1, pan.left)
      const balR = Math.min(1, pan.right)
      for (let i = 0; i < frames; i++) { outL[i] = sourceL[i] * gain * balL; outR[i] = sourceR[i] * gain * balR }
      return { id: strip.id, kind: strip.kind, solo: !!strip.solo, pfl: !!strip.pfl, left: outL, right: outR }
    } else {
      const index = 2 + this.guestIds.indexOf(strip.id)
      const input = inputs[index]
      if (!input || !input[0]) return null
      sourceL = input[0]; sourceR = input[0]
    }
    const outL = new Float32Array(frames)
    const outR = new Float32Array(frames)
    for (let i = 0; i < frames; i++) { outL[i] = sourceL[i] * gain * pan.left; outR[i] = sourceR[i] * gain * pan.right }
    return { id: strip.id, kind: strip.kind, solo: !!strip.solo, pfl: !!strip.pfl, left: outL, right: outR }
  }
  sumBus(contributors, frames) {
    const left = new Float32Array(frames)
    const right = new Float32Array(frames)
    const n = contributors.length
    if (n === 0) return { left, right }
    const staging = 1 / n
    for (const c of contributors) {
      for (let i = 0; i < frames; i++) { left[i] += c.left[i] * staging; right[i] += c.right[i] * staging }
    }
    return { left, right }
  }
  process(inputs, outputs) {
    const frames = outputs[0] && outputs[0][0] ? outputs[0][0].length : 128
    const contributors = []
    for (const strip of this.strips) {
      if (strip.kind === 'guest' && !this.keepGuestsInProgram) continue
      const c = this.contributor(strip, inputs, frames)
      if (c) contributors.push(c)
    }
    // PROGRAM
    const program = this.sumBus(contributors, frames)
    const master = dbToLinear(this.masterGainDb)
    const ceiling = dbToLinear(this.limiterCeilingDb)
    const releaseCoeff = Math.exp(-1 / (0.1 * sampleRate))
    for (let i = 0; i < frames; i++) {
      let l = program.left[i] * master
      let r = program.right[i] * master
      this.limiterEnvL = Math.max(Math.abs(l), this.limiterEnvL * releaseCoeff)
      this.limiterEnvR = Math.max(Math.abs(r), this.limiterEnvR * releaseCoeff)
      if (this.limiterEnvL > ceiling) l *= ceiling / this.limiterEnvL
      if (this.limiterEnvR > ceiling) r *= ceiling / this.limiterEnvR
      program.left[i] = l; program.right[i] = r
    }
    if (outputs[0]) { outputs[0][0].set(program.left); if (outputs[0][1]) outputs[0][1].set(program.right) }
    // CUE: solo/PFL if any, else non-host contributors. Talkback never here.
    const anyPfl = contributors.some((c) => c.solo || c.pfl)
    const cueSources = anyPfl ? contributors.filter((c) => c.solo || c.pfl) : contributors.filter((c) => c.kind !== 'host')
    const cue = this.sumBus(cueSources, frames)
    if (outputs[1]) { outputs[1][0].set(cue.left); if (outputs[1][1]) outputs[1][1].set(cue.right) }
    // TALKBACK: read once; summed ONLY into mix-minus outputs below.
    const talkbackInput = inputs[2 + this.guestIds.length]
    const talkbackGain = this.talkbackMuted ? 0 : dbToLinear(this.talkbackGainDb)
    // MIX-MINUS per guest (by inclusion) + talkback.
    this.guestIds.forEach((guestId, guestIndex) => {
      const output = outputs[2 + guestIndex]
      if (!output) return
      const others = contributors.filter((c) => c.id !== guestId)
      const bus = this.sumBus(others, frames)
      if (talkbackInput && talkbackInput[0] && talkbackGain > 0) {
        const restage = others.length > 0 ? others.length / (others.length + 1) : 1
        const tbStaging = 1 / (others.length + 1)
        for (let i = 0; i < frames; i++) {
          const tb = talkbackInput[0][i] * talkbackGain * tbStaging
          bus.left[i] = bus.left[i] * restage + tb
          bus.right[i] = bus.right[i] * restage + tb
        }
      }
      output[0].set(bus.left)
      if (output[1]) output[1].set(bus.right)
    })
    // Meters, throttled to ~10 Hz.
    this.framesSinceMeters += frames
    if (this.framesSinceMeters >= sampleRate / 10) {
      this.framesSinceMeters = 0
      let peak = 0
      for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(program.left[i]), Math.abs(program.right[i]))
      this.port.postMessage({ type: 'meters', programPeak: peak })
    }
    return true
  }
}
registerProcessor('${MIXER_PROCESSOR_NAME}', RenegadeMixerProcessor)
`
