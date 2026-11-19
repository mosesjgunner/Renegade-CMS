/**
 * POD-07 — Mixer strip/bus state + metering (PURE CORE).
 *
 * The strip model extends the POD-05 mixer snapshot shape
 * (`StudioMixerSnapshot`: channels{id, gainDb, muted} + masterGainDb +
 * limiterCeilingDb). The POD-00 session contract validates those known
 * fields and preserves unknown fields verbatim, so the extended strip
 * fields (kind, solo, pan, PFL, processing) ride INSIDE the snapshot
 * channels — no contract change, and a parse → serialize round trip
 * through POD-05 sessions is lossless (asserted in the POD-07 tests).
 */

import type { StudioMixerChannel, StudioMixerSnapshot } from '../contracts/session'
import {
  DEFAULT_COMPRESSOR_SETTINGS,
  DEFAULT_EQ_SETTINGS,
  type CompressorSettings,
  type EqSettings,
} from './processing'

export type StripKind = 'host' | 'clips' | 'guest'

export type StripProcessingSettings = {
  gateEnabled: boolean
  eq: EqSettings
  compressor: CompressorSettings
}

export const defaultStripProcessing = (): StripProcessingSettings => ({
  gateEnabled: true,
  eq: { ...DEFAULT_EQ_SETTINGS },
  compressor: { ...DEFAULT_COMPRESSOR_SETTINGS },
})

export type ChannelStrip = {
  id: string
  kind: StripKind
  label: string
  gainDb: number
  muted: boolean
  /** Solo = PFL: routes this strip alone to the host cue bus. */
  solo: boolean
  /** Stereo pan, -1 (full left) … +1 (full right). Mono sources pan; the stereo clips strip pans as balance. */
  pan: number
  /** Pre-fader listen assignment (independent of solo). */
  pfl: boolean
  processing: StripProcessingSettings
}

export type MonitoringMode = 'off' | 'unprocessed' | 'processed-delayed'

/**
 * Monitoring latency, stated not implied (tool map row 29):
 * - off: no monitor path.
 * - unprocessed: direct path, 0 added samples (device latency excluded —
 *   that is the OS/driver's, and is why the default stance is no self-voice
 *   through the computer at all).
 * - processed-delayed: the monitor signal passes the per-source processing
 *   chain, which runs one processing block behind, plus the limiter
 *   lookahead below.
 */
export const PROCESSING_BLOCK_FRAMES = 128
export const LIMITER_LOOKAHEAD_FRAMES = 64
export const PROCESSED_MONITOR_LATENCY_FRAMES = PROCESSING_BLOCK_FRAMES + LIMITER_LOOKAHEAD_FRAMES

export const monitoringLatencyFrames = (mode: MonitoringMode): number =>
  mode === 'processed-delayed' ? PROCESSED_MONITOR_LATENCY_FRAMES : 0

export const monitoringLatencyMs = (mode: MonitoringMode, sampleRate: number): number =>
  (monitoringLatencyFrames(mode) / sampleRate) * 1000

export type MixerState = {
  strips: ChannelStrip[]
  masterGainDb: number
  /** Bus limiter ceiling (dBFS) — the final guard, from the session snapshot. */
  limiterCeilingDb: number
  /** Talkback strip gain (host → guests). Talkback has NO program route. */
  talkbackGainDb: number
  talkbackMuted: boolean
  monitoringMode: MonitoringMode
  /** MIXER-mode fold (tool map row 34): guests stay in program when their return is folded out. */
  keepGuestsInProgram: boolean
}

export const createStrip = (
  id: string,
  kind: StripKind,
  label: string,
  overrides: Partial<ChannelStrip> = {},
): ChannelStrip => ({
  id,
  kind,
  label,
  gainDb: 0,
  muted: false,
  solo: false,
  pan: 0,
  pfl: false,
  processing: defaultStripProcessing(),
  ...overrides,
})

export const defaultMixerState = (guestIds: string[] = ['guest-1']): MixerState => ({
  strips: [
    createStrip('host', 'host', 'Host mic'),
    createStrip('clips', 'clips', 'Clips'),
    ...guestIds.map((id) => createStrip(id, 'guest', `Guest ${id}`)),
  ],
  masterGainDb: 0,
  limiterCeilingDb: -1,
  talkbackGainDb: 0,
  talkbackMuted: true,
  monitoringMode: 'off',
  keepGuestsInProgram: true,
})

// ---------------------------------------------------------------------------
// Snapshot conversion (POD-05 StudioMixerSnapshot ⇄ MixerState)
// ---------------------------------------------------------------------------

type SnapshotChannelExtras = {
  kind?: StripKind
  label?: string
  solo?: boolean
  pan?: number
  pfl?: boolean
  processing?: StripProcessingSettings
}

export const mixerStateToSnapshot = (state: MixerState): StudioMixerSnapshot => ({
  channels: state.strips.map((strip) => {
    const channel: StudioMixerChannel & SnapshotChannelExtras = {
      id: strip.id,
      gainDb: strip.gainDb,
      muted: strip.muted,
      kind: strip.kind,
      label: strip.label,
      solo: strip.solo,
      pan: strip.pan,
      pfl: strip.pfl,
      processing: strip.processing,
    }
    return channel
  }),
  masterGainDb: state.masterGainDb,
  limiterCeilingDb: state.limiterCeilingDb,
})

export const mixerStateFromSnapshot = (snapshot: StudioMixerSnapshot): MixerState => {
  const state = defaultMixerState([])
  state.strips = snapshot.channels.map((raw) => {
    const channel = raw as StudioMixerChannel & SnapshotChannelExtras
    const kind: StripKind =
      channel.kind ?? (channel.id === 'host' ? 'host' : channel.id === 'clips' ? 'clips' : 'guest')
    return createStrip(channel.id, kind, channel.label ?? channel.id, {
      gainDb: channel.gainDb,
      muted: channel.muted,
      solo: channel.solo ?? false,
      pan: channel.pan ?? 0,
      pfl: channel.pfl ?? false,
      processing: channel.processing ?? defaultStripProcessing(),
    })
  })
  state.masterGainDb = snapshot.masterGainDb
  state.limiterCeilingDb = snapshot.limiterCeilingDb
  return state
}

// ---------------------------------------------------------------------------
// Metering — peak + RMS per block, clip indicator latch (per strip)
// ---------------------------------------------------------------------------

export type StripMeter = {
  peak: number
  rms: number
  peakDb: number
  rmsDb: number
  /** Latched: once a block clips, stays set until explicitly cleared. */
  clipped: boolean
}

export const createStripMeter = (): StripMeter => ({
  peak: 0,
  rms: 0,
  peakDb: -Infinity,
  rmsDb: -Infinity,
  clipped: false,
})

export const CLIP_THRESHOLD = 0.999

export const updateStripMeter = (meter: StripMeter, block: Float32Array): StripMeter => {
  let peak = 0
  let sumSquares = 0
  for (let i = 0; i < block.length; i++) {
    const magnitude = Math.abs(block[i])
    if (magnitude > peak) peak = magnitude
    sumSquares += block[i] * block[i]
  }
  const rms = block.length > 0 ? Math.sqrt(sumSquares / block.length) : 0
  meter.peak = peak
  meter.rms = rms
  meter.peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity
  meter.rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity
  if (peak >= CLIP_THRESHOLD) meter.clipped = true
  return meter
}

export const clearClipLatch = (meter: StripMeter): void => {
  meter.clipped = false
}
