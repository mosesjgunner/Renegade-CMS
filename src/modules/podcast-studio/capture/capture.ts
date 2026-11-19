/**
 * POD-06 — Dual-path capture core (pure TypeScript, no DOM imports).
 *
 * Owns POD-REQ-16: the local MASTER path is requested with echoCancellation,
 * noiseSuppression and autoGainControl all OFF, and the returned track
 * settings are asserted via their `getSettings()` shape. When the browser
 * refuses raw capture the result carries a visible fallback warning — a
 * processed master is never silently accepted. The CONVERSATION path (what
 * guests hear live) may enable processing. Sample-rate / channel config
 * follows the POD-00 working format: 48 kHz, mono voice.
 *
 * The constraint objects are plain data in the `MediaStreamConstraints`
 * shape; the browser adapter passes them to `getUserMedia` verbatim.
 */

export const WORKING_SAMPLE_RATE = 48_000
/** PT-B timeslice: 250 ms of 48 kHz audio = 12,000 frames per chunk. */
export const TIMESLICE_MS = 250
export const TIMESLICE_FRAMES = (WORKING_SAMPLE_RATE * TIMESLICE_MS) / 1000

export type CapturePath = 'master' | 'conversation'

export type AudioConstraintSet = {
  deviceId?: { exact: string }
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
  sampleRate: { ideal: number }
  channelCount: { ideal: number }
}

export type CaptureConstraints = { audio: AudioConstraintSet; video: false }

const buildConstraints = (
  processing: boolean,
  deviceId?: string,
  channels: 1 | 2 = 1,
): CaptureConstraints => ({
  audio: {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: processing,
    noiseSuppression: processing,
    autoGainControl: processing,
    sampleRate: { ideal: WORKING_SAMPLE_RATE },
    channelCount: { ideal: channels },
  },
  video: false,
})

/** Master path: all three processing flags OFF — this is the recording that becomes the studio asset. */
export const buildMasterConstraints = (
  deviceId?: string,
  channels: 1 | 2 = 1,
): CaptureConstraints => buildConstraints(false, deviceId, channels)

/** Conversation path: processing allowed — intelligibility beats fidelity for the live call. */
export const buildConversationConstraints = (
  deviceId?: string,
  channels: 1 | 2 = 1,
): CaptureConstraints => buildConstraints(true, deviceId, channels)

export const buildConstraintsForPath = (
  path: CapturePath,
  deviceId?: string,
  channels: 1 | 2 = 1,
): CaptureConstraints =>
  path === 'master'
    ? buildMasterConstraints(deviceId, channels)
    : buildConversationConstraints(deviceId, channels)

/** The shape of `MediaTrackSettings` this core reads (a structural subset). */
export type TrackSettingsLike = {
  deviceId?: string
  sampleRate?: number
  channelCount?: number
  echoCancellation?: boolean | string
  noiseSuppression?: boolean | string
  autoGainControl?: boolean | string
}

export type RawSettingsAssertion = {
  /** True only when all three processing flags are verifiably `false`. */
  raw: boolean
  /** Flags that are on — or unverifiable — in the returned settings. */
  processedFlags: Array<'echoCancellation' | 'noiseSuppression' | 'autoGainControl'>
  /** Visible fallback warning for the session health panel; null when raw. */
  warning: string | null
  sampleRate: number | null
}

const PROCESSING_FLAGS = ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const

/**
 * Asserts a master track is really raw. A flag counts as off only when
 * `getSettings()` reports it exactly `false`; `true`, a string mode, or a
 * missing value all mean the master cannot be vouched for, and the warning
 * names the offending flags.
 */
export const assertRawSettings = (settings: TrackSettingsLike): RawSettingsAssertion => {
  const processedFlags = PROCESSING_FLAGS.filter((flag) => settings[flag] !== false)
  const raw = processedFlags.length === 0
  return {
    raw,
    processedFlags: [...processedFlags],
    warning: raw
      ? null
      : `Master capture is NOT raw: the browser reports ${processedFlags.join(', ')} active or unverifiable. The recording may be processed by the browser — check the device/browser, or accept a processed master knowingly.`,
    sampleRate: typeof settings.sampleRate === 'number' ? settings.sampleRate : null,
  }
}
