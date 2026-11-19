/**
 * Audio pass — pre-record room check (POD-REQ-21 preflight upgrade).
 *
 * The diagnostic that runs BEFORE a session is recorded, while the
 * problems it finds can still be fixed: it measures a short sample
 * of the actual room + mic (through the shared PCM health core) and
 * answers in plain language — a verdict and a specific fix hint,
 * never a raw dB readout as the primary surface (the numbers are
 * there in `detail` for anyone who wants them).
 *
 * It WARNS, it never gates: joining/recording stays possible with a
 * warning showing, exactly like the headphone declaration. A check
 * that blocks would just teach people to lie to it.
 *
 * What it can honestly measure from a sample: noise floor (fan /
 * HVAC / room tone), clipping and headroom, and how loud the voice
 * arrives (mic distance / input level). What it cannot measure
 * reliably from a short sample — echo/reverb character — it does
 * not pretend to: no fake score, named as a limit in the docs.
 */
import { measureFileHealth, type PcmHealth } from './audio-health'

export type RoomCheckItemId = 'clipping' | 'noise' | 'level'

export type RoomCheckItem = {
  id: RoomCheckItemId
  status: 'pass' | 'warn'
  /** Plain-language headline — the primary surface. */
  headline: string
  /** The specific fix, when there is one. */
  hint?: string
  /** The measured numbers behind the verdict, for the detail view. */
  detail: Record<string, number | string>
}

export type RoomCheckReport = {
  status: 'good' | 'needs-attention'
  summary: string
  items: RoomCheckItem[]
  measurements: {
    durationSec: number
    noiseFloorDbfs: number
    speechLevelDbfs: number
    peakDbfs: number
    clippedRanges: PcmHealth['clippedRanges']
  }
}

// Thresholds (dBFS, close-mic speech sample). Stated here so the
// verdicts are auditable, and tuned for a normal room + decent mic:
// a fan that survives under speech sits around −45 dBFS or louder;
// a healthy room floor is −55 or quieter.
export const ROOM_CHECK_THRESHOLDS = {
  /** Noise floor at or above this (dBFS) warns. */
  noiseWarnDbfs: -45,
  /** Speech level below this (dBFS) warns "too quiet". */
  quietWarnDbfs: -40,
  /** Speech level at or above this (dBFS) warns "too hot". */
  hotWarnDbfs: -9,
} as const

const round1 = (value: number): number => Math.round(value * 10) / 10

/** Pure verdicts over a measured health snapshot. */
export const buildRoomCheckReport = (health: PcmHealth): RoomCheckReport => {
  const items: RoomCheckItem[] = []

  if (health.clippedRanges.length > 0) {
    const first = health.clippedRanges[0]
    items.push({
      id: 'clipping',
      status: 'warn',
      headline: 'Your mic is clipping — the loud parts are distorting.',
      hint: 'Lower the input level in your sound settings, or move a little farther from the mic, then check again.',
      detail: {
        clippedSections: health.clippedRanges.length,
        firstClippedAtSec: first.startSec,
        peakDbfs: round1(health.peakDbfs),
      },
    })
  } else {
    items.push({
      id: 'clipping',
      status: 'pass',
      headline: 'No clipping — your level has clean headroom.',
      detail: { peakDbfs: round1(health.peakDbfs) },
    })
  }

  if (health.noiseFloorDbfs >= ROOM_CHECK_THRESHOLDS.noiseWarnDbfs) {
    items.push({
      id: 'noise',
      status: 'warn',
      headline: 'Room noise is audible — a fan or air conditioner is being picked up.',
      hint: 'Turn the fan or AC off if you can, close the window, and move closer to the mic — closer beats louder.',
      detail: { noiseFloorDbfs: round1(health.noiseFloorDbfs) },
    })
  } else {
    items.push({
      id: 'noise',
      status: 'pass',
      headline: 'The room is quiet — background noise is low.',
      detail: { noiseFloorDbfs: round1(health.noiseFloorDbfs) },
    })
  }

  if (health.speechLevelDbfs < ROOM_CHECK_THRESHOLDS.quietWarnDbfs) {
    items.push({
      id: 'level',
      status: 'warn',
      headline: "You're coming through very quiet.",
      hint: 'Move closer to the mic, or raise the input level in your sound settings, then check again.',
      detail: { speechLevelDbfs: round1(health.speechLevelDbfs) },
    })
  } else if (health.speechLevelDbfs >= ROOM_CHECK_THRESHOLDS.hotWarnDbfs) {
    items.push({
      id: 'level',
      status: 'warn',
      headline: "You're coming through very loud — close to clipping.",
      hint: 'Lower the input level a little, or sit slightly farther from the mic.',
      detail: { speechLevelDbfs: round1(health.speechLevelDbfs) },
    })
  } else {
    items.push({
      id: 'level',
      status: 'pass',
      headline: 'Your level sounds right — clear and comfortably loud.',
      detail: { speechLevelDbfs: round1(health.speechLevelDbfs) },
    })
  }

  const warnings = items.filter((item) => item.status === 'warn').length
  return {
    status: warnings > 0 ? 'needs-attention' : 'good',
    summary:
      warnings > 0
        ? 'Worth fixing before you record — each item below says what to change. You can still record as-is.'
        : 'Your room sounds good — you are ready to record.',
    items,
    measurements: {
      durationSec: Math.round(health.durationSec * 10) / 10,
      noiseFloorDbfs: round1(health.noiseFloorDbfs),
      speechLevelDbfs: round1(health.speechLevelDbfs),
      peakDbfs: round1(health.peakDbfs),
      clippedRanges: health.clippedRanges,
    },
  }
}

/** Measures a recorded sample file and builds the room-check report. */
export const runRoomCheck = async (
  filePath: string,
  options: { ffmpeg?: string; ffprobe?: string } = {},
): Promise<RoomCheckReport> => {
  const health = await measureFileHealth(filePath, options)
  return buildRoomCheckReport(health)
}
