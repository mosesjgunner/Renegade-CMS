/**
 * POD-06 — Input normalization core (pure TypeScript, no DOM imports).
 *
 * Any input PCM is normalized to the canonical POD-00 working format:
 * 48 kHz WAV PCM, mono for voice tracks, stereo for program material
 * (`docs/podcast-studio/WORKING_FORMAT.md`). Resampling is deterministic
 * linear interpolation with exact output frame counts
 * (`round(frames * 48000 / sourceRate)`); channel mapping is exact
 * (mono voice = channel average, stereo program = L/R or mono duplicated).
 * Normalizing audio already at 48 kHz in the target layout is an exact
 * identity on sample values (idempotence is asserted in tests).
 */

import { WORKING_SAMPLE_RATE } from './capture'

export type WorkingKind = 'voice' | 'program'

export type PcmChannels = {
  /** One Float32Array per channel, all the same frame count. */
  channels: Float32Array[]
  sampleRate: number
}

export type NormalizedPcm = {
  channels: Float32Array[]
  sampleRate: typeof WORKING_SAMPLE_RATE
  frames: number
  kind: WorkingKind
}

/** Exact output frame count for a resample — the arithmetic every caller can rely on. */
export const resampledFrameCount = (frames: number, fromRate: number, toRate: number): number =>
  Math.round((frames * toRate) / fromRate)

/**
 * Deterministic linear-interpolation resample of one channel. Output frame
 * `i` samples the input at `i * fromRate / toRate`, clamped at the last
 * input frame. Same-rate input returns an exact copy.
 */
export const resampleChannel = (
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array => {
  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0)
    throw new Error('Resample rates must be positive finite numbers.')
  if (fromRate === toRate) return new Float32Array(input)
  const outFrames = resampledFrameCount(input.length, fromRate, toRate)
  const out = new Float32Array(outFrames)
  const ratio = fromRate / toRate
  for (let i = 0; i < outFrames; i++) {
    const position = i * ratio
    const index = Math.floor(position)
    const fraction = position - index
    const a = input[Math.min(index, input.length - 1)] ?? 0
    const b = input[Math.min(index + 1, input.length - 1)] ?? a
    out[i] = a + (b - a) * fraction
  }
  return out
}

/** Maps any channel layout to the working layout for the kind (voice = mono, program = stereo). */
export const mapToWorkingChannels = (
  channels: Float32Array[],
  kind: WorkingKind,
): Float32Array[] => {
  if (channels.length === 0) throw new Error('PCM must carry at least one channel.')
  const frames = channels[0]!.length
  if (kind === 'voice') {
    if (channels.length === 1) return [new Float32Array(channels[0]!)]
    const mono = new Float32Array(frames)
    for (let i = 0; i < frames; i++) {
      let sum = 0
      for (const channel of channels) sum += channel[i] ?? 0
      mono[i] = sum / channels.length
    }
    return [mono]
  }
  // program: stereo
  if (channels.length === 1) {
    return [new Float32Array(channels[0]!), new Float32Array(channels[0]!)]
  }
  return [new Float32Array(channels[0]!), new Float32Array(channels[1]!)]
}

/** Full normalization: channel map, then resample every channel to 48 kHz. */
export const normalizeToWorkingFormat = (input: PcmChannels, kind: WorkingKind): NormalizedPcm => {
  const mapped = mapToWorkingChannels(input.channels, kind)
  const channels = mapped.map((channel) =>
    resampleChannel(channel, input.sampleRate, WORKING_SAMPLE_RATE),
  )
  return {
    channels,
    sampleRate: WORKING_SAMPLE_RATE,
    frames: channels[0]?.length ?? 0,
    kind,
  }
}

/** Interleaves normalized (or any equal-length) channels into one PCM stream. */
export const interleave = (channels: Float32Array[]): Float32Array => {
  const frames = channels[0]?.length ?? 0
  const out = new Float32Array(frames * channels.length)
  channels.forEach((channel, channelIndex) => {
    for (let i = 0; i < frames; i++) out[i * channels.length + channelIndex] = channel[i] ?? 0
  })
  return out
}

/** Splits an interleaved PCM stream into per-channel arrays. */
export const deinterleave = (pcm: Float32Array, channelCount: number): Float32Array[] => {
  if (!Number.isInteger(channelCount) || channelCount < 1)
    throw new Error('Channel count must be a positive integer.')
  const frames = Math.floor(pcm.length / channelCount)
  return Array.from({ length: channelCount }, (_, channelIndex) => {
    const out = new Float32Array(frames)
    for (let i = 0; i < frames; i++) out[i] = pcm[i * channelCount + channelIndex] ?? 0
    return out
  })
}
