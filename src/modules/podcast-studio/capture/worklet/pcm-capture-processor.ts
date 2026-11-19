/**
 * POD-06 — AudioWorklet PCM capture processor (dependency-free source).
 *
 * The processor pulls input PCM off the audio rendering thread, buffers it
 * into 250 ms chunks (12,000 frames at 48 kHz — the PT-B timeslice), and
 * posts each chunk to the main thread with its start sample on the shared
 * clock. It never allocates per quantum beyond the chunk buffer, never does
 * I/O, and never blocks: the render quantum is 128 frames.
 *
 * Delivery choice: the canonical source lives here as a plain string
 * (`pcmCaptureProcessorSource`) so the loader (`loader.ts`) can register it
 * through `audioWorklet.addModule` via a Blob URL — the repo's build has no
 * public-asset pipeline for worklet files, and inlining the source keeps the
 * worklet global-scope code dependency-free and auditable in one place.
 * The string is exactly the code a worklet module would contain.
 *
 * UNVERIFIED: no real browser AudioWorklet was exercised in POD-06. The
 * smoke test in the capture suite evaluates this source with fake worklet
 * globals and feeds it synthetic quanta.
 */

export const PCM_CAPTURE_PROCESSOR_NAME = 'renegade-pcm-capture'

export type PcmChunkMessage = {
  type: 'pcm-chunk'
  /** Interleaved Float32 PCM, `frames * channels` samples. */
  pcm: Float32Array
  frames: number
  channels: number
  /** First frame of this chunk on the recording's sample clock. */
  startSample: number
  sampleRate: number
}

export const pcmCaptureProcessorSource = `
class RenegadePcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.chunkFrames = Math.round(sampleRate * 0.25)
    this.channels = 0
    this.buffer = null
    this.framesBuffered = 0
    this.nextStartSample = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const frames = input[0].length
    const channels = input.length
    if (channels !== this.channels) {
      this.channels = channels
      this.buffer = new Float32Array(this.chunkFrames * channels)
      this.framesBuffered = 0
    }
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        this.buffer[this.framesBuffered * channels + c] = input[c][i]
      }
      this.framesBuffered++
      if (this.framesBuffered === this.chunkFrames) {
        const pcm = this.buffer.slice()
        const startSample = this.nextStartSample
        this.nextStartSample += this.chunkFrames
        this.framesBuffered = 0
        this.port.postMessage(
          { type: 'pcm-chunk', pcm, frames: this.chunkFrames, channels, startSample, sampleRate },
          [pcm.buffer],
        )
      }
    }
    return true
  }
}

registerProcessor('${PCM_CAPTURE_PROCESSOR_NAME}', RenegadePcmCaptureProcessor)
`
