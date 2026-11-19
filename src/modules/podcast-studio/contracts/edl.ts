import {
  assertArray,
  assertFiniteNumber,
  assertNonEmptyString,
  assertNonNegativeTime,
  assertOptionalString,
  assertPositiveNumber,
  assertRecord,
  assertString,
  assertVersion1,
  coerceInput,
  requireField,
} from './validation'

/**
 * Edl v1 — the Podcast Studio edit-decision-list contract (POD-00).
 *
 * Shape is the PT-C prototype fixture (`tests/fixtures/podcast-studio/edl-pt-c.json`):
 * sources, per-track clips, an optional cut, crossfade settings, chapters,
 * transcript cues and a loudness target. Per-track rate correction follows
 * PT-F: the artefact stored per source is `resampleFactor`,
 * `rateCorrectionPpm` and `offsetSamplesAtHead` (plus the nominal/measured
 * rates they were derived from), as in the drift fixture's `edlCorrection`.
 *
 * The parser validates known fields and preserves unknown fields verbatim,
 * so a parse -> serialize round trip is lossless.
 */

export type EdlRateCorrection = {
  nominalRate: number
  measuredRateHz: number
  resampleFactor: number
  rateCorrectionPpm: number
  offsetSamplesAtHead: number
}

export type EdlSource = {
  id: string
  /** Local/prototype file reference (PT-C shape). */
  file?: string
  /** Media-library asset reference (production shape); either this or `file` is required. */
  mediaAssetId?: string
  assetId?: string
  rateCorrection?: EdlRateCorrection
}

export type EdlClipFades = {
  inSec?: number
  outSec?: number
  fadeInSec?: number
  fadeOutSec?: number
}

export type EdlClip = {
  sourceIn: number
  sourceOut: number
  timelineStart: number
  sourceId?: string
  fadeInSec?: number
  fadeOutSec?: number
  fades?: EdlClipFades
}

export type EdlTrack = {
  id: string
  gain: number
  clips: EdlClip[]
}

export type EdlCut = {
  timelineStart: number
  timelineEnd: number
}

export type EdlChapter = {
  start: number
  title: string
}

export type EdlTranscriptCue = {
  start: number
  end: number
  text: string
  speaker?: string
}

export type EdlMarker = {
  start: number
  title?: string
  label?: string
  type?: string
}

export type EdlLoudnessTarget = {
  /** Integrated loudness target in LUFS (PT-C key `I`). */
  I: number
  /** True-peak ceiling in dBTP (PT-C key `TP`). */
  TP: number
  LRA?: number
}

export type Edl = {
  version: 1
  sessionRate: number
  sources: EdlSource[]
  tracks: EdlTrack[]
  chapters: EdlChapter[]
  transcript: EdlTranscriptCue[]
  cut?: EdlCut
  crossfadeSec?: number
  crossfadeMode?: string
  loudnessTarget?: EdlLoudnessTarget
  markers?: EdlMarker[]
}

/** Timeline duration implied by the clips: max end across every track lane. */
export const edlTimelineDurationSec = (edl: Pick<Edl, 'tracks'>): number => {
  let duration = 0
  for (const track of edl.tracks)
    for (const clip of track.clips)
      duration = Math.max(duration, clip.timelineStart + (clip.sourceOut - clip.sourceIn))
  return duration
}

const assertRateCorrection = (value: unknown, label: string) => {
  const correction = assertRecord(value, label)
  assertPositiveNumber(requireField(correction, 'nominalRate', label), `${label}.nominalRate`)
  assertPositiveNumber(requireField(correction, 'measuredRateHz', label), `${label}.measuredRateHz`)
  assertPositiveNumber(requireField(correction, 'resampleFactor', label), `${label}.resampleFactor`)
  assertFiniteNumber(
    requireField(correction, 'rateCorrectionPpm', label),
    `${label}.rateCorrectionPpm`,
  )
  const offset = assertFiniteNumber(
    requireField(correction, 'offsetSamplesAtHead', label),
    `${label}.offsetSamplesAtHead`,
  )
  if (!Number.isInteger(offset) || offset < 0)
    throw new Error(`${label}.offsetSamplesAtHead must be a non-negative integer.`)
}

export const parseEdl = (value: unknown): Edl => {
  const edl = coerceInput(value, 'Edl')
  assertVersion1(edl, 'Edl')
  assertPositiveNumber(requireField(edl, 'sessionRate', 'Edl'), 'Edl.sessionRate')

  const sources = assertArray(requireField(edl, 'sources', 'Edl'), 'Edl.sources')
  const sourceIds = new Set<string>()
  sources.forEach((entry, index) => {
    const label = `Edl.sources[${index}]`
    const source = assertRecord(entry, label)
    const id = assertNonEmptyString(requireField(source, 'id', label), `${label}.id`)
    sourceIds.add(id)
    if (
      source.file === undefined &&
      source.mediaAssetId === undefined &&
      source.assetId === undefined
    )
      throw new Error(`${label} must carry a file or media asset reference.`)
    assertOptionalString(source.file, `${label}.file`)
    assertOptionalString(source.mediaAssetId, `${label}.mediaAssetId`)
    assertOptionalString(source.assetId, `${label}.assetId`)
    if (source.rateCorrection !== undefined)
      assertRateCorrection(source.rateCorrection, `${label}.rateCorrection`)
  })

  const tracks = assertArray(requireField(edl, 'tracks', 'Edl'), 'Edl.tracks')
  tracks.forEach((entry, trackIndex) => {
    const label = `Edl.tracks[${trackIndex}]`
    const track = assertRecord(entry, label)
    assertNonEmptyString(requireField(track, 'id', label), `${label}.id`)
    const gain = assertFiniteNumber(requireField(track, 'gain', label), `${label}.gain`)
    if (gain < 0) throw new Error(`${label}.gain must not be negative.`)
    const clips = assertArray(requireField(track, 'clips', label), `${label}.clips`)
    clips.forEach((clipEntry, clipIndex) => {
      const clipLabel = `${label}.clips[${clipIndex}]`
      const clip = assertRecord(clipEntry, clipLabel)
      const sourceIn = assertNonNegativeTime(
        requireField(clip, 'sourceIn', clipLabel),
        `${clipLabel}.sourceIn`,
      )
      const sourceOut = assertNonNegativeTime(
        requireField(clip, 'sourceOut', clipLabel),
        `${clipLabel}.sourceOut`,
      )
      if (sourceOut <= sourceIn)
        throw new Error(`${clipLabel}.sourceOut must be greater than sourceIn.`)
      assertNonNegativeTime(
        requireField(clip, 'timelineStart', clipLabel),
        `${clipLabel}.timelineStart`,
      )
      assertOptionalString(clip.sourceId, `${clipLabel}.sourceId`)
      if (clip.sourceId !== undefined && !sourceIds.has(clip.sourceId as string))
        throw new Error(`${clipLabel}.sourceId references an unknown EDL source.`)
      if (clip.fadeInSec !== undefined)
        assertNonNegativeTime(clip.fadeInSec, `${clipLabel}.fadeInSec`)
      if (clip.fadeOutSec !== undefined)
        assertNonNegativeTime(clip.fadeOutSec, `${clipLabel}.fadeOutSec`)
      if (clip.fades !== undefined) {
        const fades = assertRecord(clip.fades, `${clipLabel}.fades`)
        for (const key of ['inSec', 'outSec', 'fadeInSec', 'fadeOutSec'])
          if (fades[key] !== undefined)
            assertNonNegativeTime(fades[key], `${clipLabel}.fades.${key}`)
      }
    })
  })

  if (edl.cut !== undefined) {
    const cut = assertRecord(edl.cut, 'Edl.cut')
    const start = assertNonNegativeTime(
      requireField(cut, 'timelineStart', 'Edl.cut'),
      'Edl.cut.timelineStart',
    )
    const end = assertNonNegativeTime(
      requireField(cut, 'timelineEnd', 'Edl.cut'),
      'Edl.cut.timelineEnd',
    )
    if (end <= start) throw new Error('Edl.cut.timelineEnd must be greater than timelineStart.')
  }
  if (edl.crossfadeSec !== undefined) assertNonNegativeTime(edl.crossfadeSec, 'Edl.crossfadeSec')
  assertOptionalString(edl.crossfadeMode, 'Edl.crossfadeMode')
  if (edl.loudnessTarget !== undefined) {
    const target = assertRecord(edl.loudnessTarget, 'Edl.loudnessTarget')
    assertFiniteNumber(requireField(target, 'I', 'Edl.loudnessTarget'), 'Edl.loudnessTarget.I')
    assertFiniteNumber(requireField(target, 'TP', 'Edl.loudnessTarget'), 'Edl.loudnessTarget.TP')
    if (target.LRA !== undefined) assertFiniteNumber(target.LRA, 'Edl.loudnessTarget.LRA')
  }

  // Duration is "known" whenever at least one clip defines the timeline.
  const duration = edlTimelineDurationSec(edl as unknown as Edl)

  const chapters = assertArray(requireField(edl, 'chapters', 'Edl'), 'Edl.chapters')
  chapters.forEach((entry, index) => {
    const label = `Edl.chapters[${index}]`
    const chapter = assertRecord(entry, label)
    const start = assertNonNegativeTime(requireField(chapter, 'start', label), `${label}.start`)
    assertString(requireField(chapter, 'title', label), `${label}.title`)
    if (duration > 0 && start > duration)
      throw new Error(`${label}.start is past the EDL timeline duration (${duration}s).`)
  })

  const transcript = assertArray(requireField(edl, 'transcript', 'Edl'), 'Edl.transcript')
  transcript.forEach((entry, index) => {
    const label = `Edl.transcript[${index}]`
    const cue = assertRecord(entry, label)
    const start = assertNonNegativeTime(requireField(cue, 'start', label), `${label}.start`)
    const end = assertNonNegativeTime(requireField(cue, 'end', label), `${label}.end`)
    if (end <= start) throw new Error(`${label}.end must be greater than start.`)
    assertString(requireField(cue, 'text', label), `${label}.text`)
    assertOptionalString(cue.speaker, `${label}.speaker`)
  })

  if (edl.markers !== undefined)
    assertArray(edl.markers, 'Edl.markers').forEach((entry, index) => {
      const label = `Edl.markers[${index}]`
      const marker = assertRecord(entry, label)
      const start = assertNonNegativeTime(requireField(marker, 'start', label), `${label}.start`)
      if (duration > 0 && start > duration)
        throw new Error(`${label}.start is past the EDL timeline duration (${duration}s).`)
      assertOptionalString(marker.title, `${label}.title`)
      assertOptionalString(marker.label, `${label}.label`)
    })

  return edl as unknown as Edl
}

export const assertEdl = (value: unknown): Edl => parseEdl(value)

/** Serializes a validated EDL to JSON; `parseEdl` accepts this string directly. */
export const serializeEdl = (edl: Edl): string => JSON.stringify(edl, null, 2)
