/**
 * POD-12 (POD-REQ-26, POD-REQ-27) — EDL edit engine (PURE CORE).
 *
 * The binding architecture rule of the podcast program applies here in
 * its strongest form: this module is a pure TypeScript core over the
 * POD-00 EDL contract. Every operation takes an EDL and returns a NEW
 * EDL plus a `RemapReport`; inputs are never mutated and media bytes
 * are never touched (the engine has no I/O at all — edits are decisions
 * about media, never writes to it). The editor UI, the project service
 * and POD-13's render pipeline are all consumers of this core.
 *
 * Timed-metadata remap follows the PT-C rules exactly (PT-C CONCLUSION,
 * "TESTED — all 9 assertions pass"; the remap rules were ported from
 * the PT-C prototype's render.js segment-table logic, Renegade R&D):
 *
 * - a chapter whose start falls inside a removed range is DROPPED and
 *   reported (`flaggedRemoved` in PT-C terms);
 * - a chapter after a removed range shifts by exactly the removed
 *   length; a chapter before it is unchanged;
 * - a transcript cue is intersected with the kept segments: fully
 *   inside a removed range → dropped; spanning the whole range →
 *   split at the cut boundaries; partially overlapping → clamped to
 *   the kept audio (a cue lying wholly after the range shifts with
 *   the timeline and is reported as clamped/shifted, as PT-C did);
 * - nothing (chapter, cue or marker) may extend past the new
 *   duration: ends are clamped and starts past the end are dropped,
 *   always reported — remap outcomes are NEVER silent.
 *
 * Extension fields (preserved verbatim by the POD-00 parser, so no
 * contract change): clips carry `id`, `gain`, `muted` and `rate`
 * (playback-rate stretch factor; timeline span = source span / rate);
 * tracks carry `label`, `role`, `muted` and `processing` (the POD-07
 * guest-chain preset reference: `{ presetId, params }` — stored now,
 * auditioned via POD-13's preview render later).
 *
 * Canonical hash: SHA-256 over the canonical JSON of the EDL (object
 * keys sorted recursively, numbers rounded to 6 decimal places to
 * absorb float dust). Undo is snapshot-based, so an undo returns the
 * EDL to the EXACT prior hash by construction — the PT-C acceptance
 * property the test suite asserts for every op.
 */
import {
  parseEdl,
  type Edl,
  type EdlChapter,
  type EdlClip,
  type EdlMarker,
  type EdlSource,
  type EdlTrack,
  type EdlTranscriptCue,
} from '../contracts/edl'
import { sha256Hex } from '../capture/journal'

// ---------------------------------------------------------------------------
// Extended (editor) shapes — POD-00 fields plus preserved extension fields
// ---------------------------------------------------------------------------

export type LaneProcessingRef = {
  /** POD-07 guest-chain preset id. */
  presetId: string
  params?: Record<string, number>
}

export type EditClip = EdlClip & {
  id?: string
  gain?: number
  muted?: boolean
  /** Playback-rate stretch factor (1 = normal). Timeline span = source span / rate. */
  rate?: number
}

export type EditTrack = Omit<EdlTrack, 'clips'> & {
  label?: string
  role?: string
  muted?: boolean
  processing?: LaneProcessingRef
  clips: EditClip[]
}

export type EditEdl = Omit<Edl, 'tracks'> & { tracks: EditTrack[] }

// ---------------------------------------------------------------------------
// Canonical JSON + hash
// ---------------------------------------------------------------------------

const canonicalize = (value: unknown): unknown => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return value
    const rounded = Number(value.toFixed(6))
    return rounded === 0 ? 0 : rounded
  }
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort())
      out[key] = canonicalize((value as Record<string, unknown>)[key])
    return out
  }
  return value
}

export const canonicalEdlJson = (edl: Edl): string => JSON.stringify(canonicalize(edl))

export const edlHash = (edl: Edl): string =>
  sha256Hex(new TextEncoder().encode(canonicalEdlJson(edl)))

// ---------------------------------------------------------------------------
// Timeline math
// ---------------------------------------------------------------------------

export const clipRate = (clip: EditClip): number => clip.rate ?? 1

export const clipTimelineSpanSec = (clip: EditClip): number =>
  (clip.sourceOut - clip.sourceIn) / clipRate(clip)

export const clipEndSec = (clip: EditClip): number => clip.timelineStart + clipTimelineSpanSec(clip)

/** Engine duration: max clip end, accounting for per-clip rate stretch. */
export const editDurationSec = (edl: Pick<Edl, 'tracks'>): number => {
  let duration = 0
  for (const track of edl.tracks)
    for (const clip of track.clips as EditClip[]) duration = Math.max(duration, clipEndSec(clip))
  return duration
}

const cloneEdl = (edl: Edl): EditEdl => JSON.parse(JSON.stringify(edl)) as EditEdl

const round6 = (value: number): number => Number(value.toFixed(6))

/** Deterministic clip ids so selection/history survive ops: existing ids win. */
export const ensureClipIds = (edl: Edl): EditEdl => {
  const next = cloneEdl(edl)
  for (const track of next.tracks)
    track.clips.forEach((clip, index) => {
      if (!clip.id) clip.id = `${track.id}:clip-${index}`
    })
  return next
}

// ---------------------------------------------------------------------------
// Remap report — every timed-metadata consequence of an op, surfaced
// ---------------------------------------------------------------------------

export type ShiftedChapter = { chapter: EdlChapter; from: number; to: number }
export type ShiftedMarker = { marker: EdlMarker; from: number; to: number }
export type SplitCue = { original: EdlTranscriptCue; pieces: EdlTranscriptCue[] }
export type ClampedCue = { original: EdlTranscriptCue; piece: EdlTranscriptCue }

export type RemapReport = {
  op: string
  durationBefore: number
  durationAfter: number
  droppedChapters: EdlChapter[]
  shiftedChapters: ShiftedChapter[]
  droppedCues: EdlTranscriptCue[]
  splitCues: SplitCue[]
  clampedCues: ClampedCue[]
  droppedMarkers: EdlMarker[]
  shiftedMarkers: ShiftedMarker[]
  /** Human-readable clamp notes (chapters/cues/markers pinned to the new duration). */
  clamped: string[]
}

const newReport = (op: string, durationBefore: number): RemapReport => ({
  op,
  durationBefore,
  durationAfter: durationBefore,
  droppedChapters: [],
  shiftedChapters: [],
  droppedCues: [],
  splitCues: [],
  clampedCues: [],
  droppedMarkers: [],
  shiftedMarkers: [],
  clamped: [],
})

export type EdlOpResult = { edl: EditEdl; report: RemapReport }

const sortClips = (track: EditTrack) => {
  track.clips.sort((a, b) => a.timelineStart - b.timelineStart)
}

/**
 * Post-op invariant pass: nothing timed may extend past the (new)
 * duration. Chapters/markers starting past the end are dropped,
 * cue ends are clamped; every adjustment is reported.
 */
const clampTimedMetadata = (edl: EditEdl, report: RemapReport): void => {
  const duration = editDurationSec(edl)
  report.durationAfter = duration
  if (duration <= 0) return
  edl.chapters = edl.chapters.filter((chapter) => {
    if (chapter.start > duration) {
      report.clamped.push(
        `chapter "${chapter.title}" at ${chapter.start}s dropped: past new duration ${round6(duration)}s`,
      )
      report.droppedChapters.push(chapter)
      return false
    }
    return true
  })
  edl.transcript = edl.transcript.flatMap((cue) => {
    if (cue.start >= duration) {
      report.clamped.push(
        `cue "${cue.text}" at ${cue.start}s dropped: past new duration ${round6(duration)}s`,
      )
      report.droppedCues.push(cue)
      return []
    }
    if (cue.end > duration) {
      report.clamped.push(`cue "${cue.text}" end clamped ${cue.end}s → ${round6(duration)}s`)
      return [{ ...cue, end: duration }]
    }
    return [cue]
  })
  if (edl.markers)
    edl.markers = edl.markers.filter((marker) => {
      if (marker.start > duration) {
        report.clamped.push(
          `marker at ${marker.start}s dropped: past new duration ${round6(duration)}s`,
        )
        report.droppedMarkers.push(marker)
        return false
      }
      return true
    })
  edl.chapters.sort((a, b) => a.start - b.start)
  edl.transcript.sort((a, b) => a.start - b.start)
}

const finish = (edl: EditEdl, report: RemapReport): EdlOpResult => {
  for (const track of edl.tracks) sortClips(track)
  clampTimedMetadata(edl, report)
  // Every op result must satisfy the POD-00 contract.
  parseEdl(edl)
  return { edl, report }
}

// ---------------------------------------------------------------------------
// Range-removal machinery (PT-C segment-table remap)
// ---------------------------------------------------------------------------

type Range = { start: number; end: number }

/** Maps a timeline point through a removed range; null = the point was removed. */
const mapPointThroughCut = (t: number, cut: Range): number | null => {
  if (t < cut.start) return t
  if (t < cut.end) return null
  return t - (cut.end - cut.start)
}

const remapChaptersThroughCut = (edl: EditEdl, cut: Range, report: RemapReport): void => {
  edl.chapters = edl.chapters.flatMap((chapter) => {
    const mapped = mapPointThroughCut(chapter.start, cut)
    if (mapped === null) {
      report.droppedChapters.push(chapter)
      return []
    }
    if (mapped !== chapter.start)
      report.shiftedChapters.push({ chapter, from: chapter.start, to: mapped })
    return [{ ...chapter, start: mapped }]
  })
}

const remapMarkersThroughCut = (edl: EditEdl, cut: Range, report: RemapReport): void => {
  if (!edl.markers) return
  edl.markers = edl.markers.flatMap((marker) => {
    const mapped = mapPointThroughCut(marker.start, cut)
    if (mapped === null) {
      report.droppedMarkers.push(marker)
      return []
    }
    if (mapped !== marker.start)
      report.shiftedMarkers.push({ marker, from: marker.start, to: mapped })
    return [{ ...marker, start: mapped }]
  })
}

/** PT-C cue rule: intersect the cue with the kept segments on both sides of the cut. */
const remapCuesThroughCut = (edl: EditEdl, cut: Range, report: RemapReport): void => {
  const shift = cut.end - cut.start
  edl.transcript = edl.transcript.flatMap((cue) => {
    const pieces: EdlTranscriptCue[] = []
    // Kept segment before the cut: [0, cut.start)
    if (cue.start < cut.start) pieces.push({ ...cue, end: Math.min(cue.end, cut.start) })
    // Kept segment after the cut: [cut.end, ∞), shifted back by the removed length.
    if (cue.end > cut.end)
      pieces.push({
        ...cue,
        start: Math.max(cue.start, cut.end) - shift,
        end: cue.end - shift,
      })
    if (pieces.length === 0) {
      report.droppedCues.push(cue)
      return []
    }
    if (pieces.length === 2) {
      report.splitCues.push({ original: cue, pieces })
      return pieces
    }
    const piece = pieces[0]
    if (piece.start !== cue.start || piece.end !== cue.end)
      report.clampedCues.push({ original: cue, piece })
    return [piece]
  })
}

/**
 * Fades that belong to a piece of a split clip: a fade survives only on
 * its own edge (head fades on the piece that keeps the clip's head,
 * tail fades on the piece that keeps its tail); the other edge's fades
 * are removed, never carried onto a fresh cut edge.
 */
const applyPieceFades = (
  piece: EditClip,
  source: EditClip,
  pieceStart: number,
  pieceEnd: number,
): EditClip => {
  const atHead = pieceStart === source.timelineStart
  const atTail = pieceEnd === clipEndSec(source)
  delete piece.fadeInSec
  delete piece.fadeOutSec
  delete piece.fades
  const fades: NonNullable<EditClip['fades']> = {}
  if (atHead) {
    if (source.fadeInSec !== undefined) piece.fadeInSec = source.fadeInSec
    if (source.fades?.inSec !== undefined) fades.inSec = source.fades.inSec
    if (source.fades?.fadeInSec !== undefined) fades.fadeInSec = source.fades.fadeInSec
  }
  if (atTail) {
    if (source.fadeOutSec !== undefined) piece.fadeOutSec = source.fadeOutSec
    if (source.fades?.outSec !== undefined) fades.outSec = source.fades.outSec
    if (source.fades?.fadeOutSec !== undefined) fades.fadeOutSec = source.fades.fadeOutSec
  }
  if (Object.keys(fades).length > 0) piece.fades = fades
  return piece
}

/**
 * Removes [range) from one track's clips. With `closeGap`, surviving
 * tail pieces shift back by the removed length (all-lane cut / ripple);
 * without it, pieces keep their timeline positions (silence in place).
 */
const removeRangeFromTrack = (track: EditTrack, range: Range, closeGap: boolean): void => {
  const shift = range.end - range.start
  const next: EditClip[] = []
  for (const clip of track.clips) {
    const start = clip.timelineStart
    const end = clipEndSec(clip)
    const rate = clipRate(clip)
    if (end <= range.start || start >= range.end) {
      next.push(
        closeGap && start >= range.end ? { ...clip, timelineStart: start - shift } : { ...clip },
      )
      continue
    }
    // Left kept piece: [start, range.start)
    if (start < range.start) {
      const pieceEnd = range.start
      next.push(
        applyPieceFades(
          {
            ...clip,
            sourceOut: round6(clip.sourceIn + (pieceEnd - start) * rate),
            timelineStart: start,
          },
          clip,
          start,
          pieceEnd,
        ),
      )
    }
    // Right kept piece: [range.end, end)
    if (end > range.end) {
      const pieceStart = closeGap ? range.start : range.end
      next.push(
        applyPieceFades(
          {
            ...clip,
            sourceIn: round6(clip.sourceIn + (range.end - start) * rate),
            timelineStart: pieceStart,
          },
          clip,
          range.end,
          end,
        ),
      )
    }
  }
  track.clips = next
}

const assertRange = (range: Range, duration: number, op: string): void => {
  if (!(range.end > range.start))
    throw new Error(`${op}: range end (${range.end}) must be greater than start (${range.start}).`)
  if (range.start < 0 || range.end > duration + 1e-9)
    throw new Error(
      `${op}: range ${range.start}–${range.end} is outside the timeline (0–${round6(duration)}).`,
    )
}

const findTrack = (edl: EditEdl, trackId: string, op: string): EditTrack => {
  const track = edl.tracks.find((entry) => entry.id === trackId)
  if (!track) throw new Error(`${op}: unknown track "${trackId}".`)
  return track
}

const findClip = (track: EditTrack, clipId: string, op: string): EditClip => {
  const clip = track.clips.find((entry) => entry.id === clipId)
  if (!clip) throw new Error(`${op}: unknown clip "${clipId}" on track "${track.id}".`)
  return clip
}

// ---------------------------------------------------------------------------
// Operations — each returns a new validated EDL + a RemapReport
// ---------------------------------------------------------------------------

/**
 * Cut a range from EVERY lane; the gap closes everywhere (subsequent
 * clips shift) and timed metadata remaps by the PT-C rules. This is
 * the PT-C acceptance operation (cut 5–8 of a 15 s timeline → 12 s).
 */
export const cutRange = (edl: Edl, range: Range): EdlOpResult => {
  const before = editDurationSec(edl)
  assertRange(range, before, 'cut')
  const report = newReport('cut', before)
  const next = ensureClipIds(edl)
  for (const track of next.tracks) removeRangeFromTrack(track, range, true)
  remapChaptersThroughCut(next, range, report)
  remapMarkersThroughCut(next, range, report)
  remapCuesThroughCut(next, range, report)
  return finish(next, report)
}

/** Ripple-delete is the all-lane cut under its editing name (gap closes). */
export const rippleDelete = cutRange

/**
 * Delete a range in ONE lane: clips are split/trimmed and the gap
 * remains as timeline silence. Duration and timed metadata do not move.
 */
export const deleteRangeInTrack = (edl: Edl, trackId: string, range: Range): EdlOpResult => {
  const before = editDurationSec(edl)
  assertRange(range, before, 'delete-in-track')
  const report = newReport('delete-in-track', before)
  const next = ensureClipIds(edl)
  removeRangeFromTrack(findTrack(next, trackId, 'delete-in-track'), range, false)
  return finish(next, report)
}

/** Split the clip under `atSec` on one track into two clips. */
export const splitClipAt = (edl: Edl, trackId: string, atSec: number): EdlOpResult => {
  const report = newReport('split', editDurationSec(edl))
  const next = ensureClipIds(edl)
  const track = findTrack(next, trackId, 'split')
  const index = track.clips.findIndex(
    (clip) => clip.timelineStart < atSec && atSec < clipEndSec(clip),
  )
  if (index < 0) throw new Error(`split: no clip on track "${trackId}" spans ${atSec}s.`)
  const clip = track.clips[index]
  const rate = clipRate(clip)
  const boundarySource = round6(clip.sourceIn + (atSec - clip.timelineStart) * rate)
  const left = applyPieceFades(
    { ...clip, sourceOut: boundarySource },
    clip,
    clip.timelineStart,
    atSec,
  )
  const right = applyPieceFades(
    {
      ...clip,
      id: clip.id ? `${clip.id}:b` : undefined,
      sourceIn: boundarySource,
      timelineStart: atSec,
    },
    clip,
    atSec,
    clipEndSec(clip),
  )
  track.clips.splice(index, 1, left, right)
  return finish(next, report)
}

/**
 * Trim a clip's head and/or tail. Head trims move the clip's timeline
 * start by the source delta (the audio under the playhead is what
 * changes); pass `keepTimelineStart` to slide the source window under
 * a fixed start instead.
 */
export const trimClip = (
  edl: Edl,
  trackId: string,
  clipId: string,
  trim: { sourceIn?: number; sourceOut?: number; keepTimelineStart?: boolean },
): EdlOpResult => {
  const report = newReport('trim', editDurationSec(edl))
  const next = ensureClipIds(edl)
  const clip = findClip(findTrack(next, trackId, 'trim'), clipId, 'trim')
  const newIn = trim.sourceIn ?? clip.sourceIn
  const newOut = trim.sourceOut ?? clip.sourceOut
  if (newIn < 0 || !(newOut > newIn))
    throw new Error(`trim: invalid source window ${newIn}–${newOut}.`)
  if (!trim.keepTimelineStart && trim.sourceIn !== undefined)
    clip.timelineStart = round6(
      Math.max(0, clip.timelineStart + (newIn - clip.sourceIn) / clipRate(clip)),
    )
  clip.sourceIn = newIn
  clip.sourceOut = newOut
  return finish(next, report)
}

/** Copy: returns deep-cloned clips for a caller-held clipboard (pure data). */
export const copyClips = (edl: Edl, trackId: string, clipIds: string[]): EditClip[] => {
  const withIds = ensureClipIds(edl)
  const track = findTrack(withIds, trackId, 'copy')
  return clipIds.map(
    (clipId) => JSON.parse(JSON.stringify(findClip(track, clipId, 'copy'))) as EditClip,
  )
}

/** Paste clipboard clips onto a track at `atSec` (ids are re-minted with a suffix). */
export const pasteClips = (
  edl: Edl,
  trackId: string,
  clipboard: EditClip[],
  atSec: number,
  pasteCount = 1,
): EdlOpResult => {
  const report = newReport('paste', editDurationSec(edl))
  const next = ensureClipIds(edl)
  const track = findTrack(next, trackId, 'paste')
  if (clipboard.length === 0) throw new Error('paste: clipboard is empty.')
  const origin = Math.min(...clipboard.map((clip) => clip.timelineStart))
  for (const clip of clipboard) {
    const pasted = JSON.parse(JSON.stringify(clip)) as EditClip
    pasted.id = `${clip.id ?? 'clip'}:paste-${pasteCount}`
    pasted.timelineStart = round6(atSec + (clip.timelineStart - origin))
    track.clips.push(pasted)
  }
  return finish(next, report)
}

/**
 * Move a clip: within its lane (drag reorder — new timeline start) or
 * across lanes (cross-track move to `toTrackId`). The clip keeps its
 * source window, gain, fades and rate.
 */
export const moveClip = (
  edl: Edl,
  fromTrackId: string,
  clipId: string,
  to: { trackId: string; timelineStart: number },
): EdlOpResult => {
  const report = newReport('move', editDurationSec(edl))
  const next = ensureClipIds(edl)
  const from = findTrack(next, fromTrackId, 'move')
  const target = findTrack(next, to.trackId, 'move')
  const index = from.clips.findIndex((clip) => clip.id === clipId)
  if (index < 0) throw new Error(`move: unknown clip "${clipId}" on track "${fromTrackId}".`)
  const [clip] = from.clips.splice(index, 1)
  clip.timelineStart = Math.max(0, to.timelineStart)
  target.clips.push(clip)
  return finish(next, report)
}

/** Add a clip from an existing (or new) source onto a lane — intro/outro assembly. */
export const addClipFromSource = (
  edl: Edl,
  input: {
    trackId: string
    source: EdlSource
    sourceIn: number
    sourceOut: number
    timelineStart: number
    clipId?: string
    gain?: number
    fadeInSec?: number
    fadeOutSec?: number
  },
): EdlOpResult => {
  const report = newReport('add-clip', editDurationSec(edl))
  const next = ensureClipIds(edl)
  const track = findTrack(next, input.trackId, 'add-clip')
  if (!next.sources.some((source) => source.id === input.source.id))
    next.sources.push({ ...input.source })
  const clip: EditClip = {
    id: input.clipId ?? `${input.source.id}@${input.timelineStart}`,
    sourceId: input.source.id,
    sourceIn: input.sourceIn,
    sourceOut: input.sourceOut,
    timelineStart: input.timelineStart,
  }
  if (input.gain !== undefined) clip.gain = input.gain
  if (input.fadeInSec !== undefined) clip.fadeInSec = input.fadeInSec
  if (input.fadeOutSec !== undefined) clip.fadeOutSec = input.fadeOutSec
  track.clips.push(clip)
  return finish(next, report)
}

/** Import audio as a NEW lane: adds the source (if new) and a lane holding one full-span clip. */
export const importToNewLane = (
  edl: Edl,
  input: {
    source: EdlSource
    laneId: string
    label?: string
    role?: string
    sourceDurationSec: number
    timelineStart?: number
  },
): EdlOpResult => {
  const report = newReport('import-lane', editDurationSec(edl))
  const next = ensureClipIds(edl)
  if (next.tracks.some((track) => track.id === input.laneId))
    throw new Error(`import-lane: lane "${input.laneId}" already exists.`)
  if (!next.sources.some((source) => source.id === input.source.id))
    next.sources.push({ ...input.source })
  const track: EditTrack = {
    id: input.laneId,
    gain: 1,
    label: input.label,
    role: input.role,
    clips: [
      {
        id: `${input.laneId}:clip-0`,
        sourceId: input.source.id,
        sourceIn: 0,
        sourceOut: input.sourceDurationSec,
        timelineStart: input.timelineStart ?? 0,
      },
    ],
  }
  next.tracks.push(track)
  return finish(next, report)
}

export const setTrackGain = (edl: Edl, trackId: string, gain: number): EdlOpResult => {
  const report = newReport('track-gain', editDurationSec(edl))
  const next = ensureClipIds(edl)
  if (gain < 0) throw new Error('track-gain: gain must not be negative.')
  findTrack(next, trackId, 'track-gain').gain = gain
  return finish(next, report)
}

export const setTrackMuted = (edl: Edl, trackId: string, muted: boolean): EdlOpResult => {
  const report = newReport('track-mute', editDurationSec(edl))
  const next = ensureClipIds(edl)
  findTrack(next, trackId, 'track-mute').muted = muted
  return finish(next, report)
}

export const setClipGain = (
  edl: Edl,
  trackId: string,
  clipId: string,
  gain: number,
): EdlOpResult => {
  const report = newReport('clip-gain', editDurationSec(edl))
  const next = ensureClipIds(edl)
  if (gain < 0) throw new Error('clip-gain: gain must not be negative.')
  findClip(findTrack(next, trackId, 'clip-gain'), clipId, 'clip-gain').gain = gain
  return finish(next, report)
}

export const setClipMuted = (
  edl: Edl,
  trackId: string,
  clipId: string,
  muted: boolean,
): EdlOpResult => {
  const report = newReport('clip-mute', editDurationSec(edl))
  const next = ensureClipIds(edl)
  findClip(findTrack(next, trackId, 'clip-mute'), clipId, 'clip-mute').muted = muted
  return finish(next, report)
}

export const setClipFades = (
  edl: Edl,
  trackId: string,
  clipId: string,
  fades: { fadeInSec?: number; fadeOutSec?: number },
): EdlOpResult => {
  const report = newReport('clip-fades', editDurationSec(edl))
  const next = ensureClipIds(edl)
  const clip = findClip(findTrack(next, trackId, 'clip-fades'), clipId, 'clip-fades')
  const span = clipTimelineSpanSec(clip)
  if (fades.fadeInSec !== undefined) {
    if (fades.fadeInSec < 0 || fades.fadeInSec > span)
      throw new Error(
        `clip-fades: fade-in ${fades.fadeInSec}s exceeds the clip span ${round6(span)}s.`,
      )
    clip.fadeInSec = fades.fadeInSec
  }
  if (fades.fadeOutSec !== undefined) {
    if (fades.fadeOutSec < 0 || fades.fadeOutSec > span)
      throw new Error(
        `clip-fades: fade-out ${fades.fadeOutSec}s exceeds the clip span ${round6(span)}s.`,
      )
    clip.fadeOutSec = fades.fadeOutSec
  }
  return finish(next, report)
}

/** Store the per-lane processing unit reference (POD-07 guest-chain preset + params). */
export const setTrackProcessing = (
  edl: Edl,
  trackId: string,
  processing: LaneProcessingRef | null,
): EdlOpResult => {
  const report = newReport('track-processing', editDurationSec(edl))
  const next = ensureClipIds(edl)
  const track = findTrack(next, trackId, 'track-processing')
  if (processing === null) delete track.processing
  else track.processing = { ...processing }
  return finish(next, report)
}

/**
 * Rate-stretch a clip: sets its playback rate; later clips on the same
 * lane ripple by the change in this clip's timeline span so the lane
 * stays butt-joined where it was.
 */
export const rateStretchClip = (
  edl: Edl,
  trackId: string,
  clipId: string,
  rate: number,
): EdlOpResult => {
  const report = newReport('rate-stretch', editDurationSec(edl))
  const next = ensureClipIds(edl)
  if (!(rate > 0)) throw new Error('rate-stretch: rate must be positive.')
  const track = findTrack(next, trackId, 'rate-stretch')
  const clip = findClip(track, clipId, 'rate-stretch')
  const oldSpan = clipTimelineSpanSec(clip)
  clip.rate = rate
  const delta = clipTimelineSpanSec(clip) - oldSpan
  if (delta !== 0)
    for (const other of track.clips)
      if (other !== clip && other.timelineStart >= clip.timelineStart + oldSpan - 1e-9)
        other.timelineStart = round6(Math.max(0, other.timelineStart + delta))
  return finish(next, report)
}

// ---------------------------------------------------------------------------
// Undo/redo — snapshot history with an inspectable op log
// ---------------------------------------------------------------------------

export const HISTORY_LIMIT = 200

export type EditHistoryEntry = {
  label: string
  at: string
  beforeHash: string
  afterHash: string
}

export type EditHistory = {
  past: EditEdl[]
  present: EditEdl
  future: EditEdl[]
  log: EditHistoryEntry[]
}

export const createHistory = (edl: Edl): EditHistory => ({
  past: [],
  present: ensureClipIds(edl),
  future: [],
  log: [],
})

/** Applies an op result: the result EDL becomes present; the op is logged with both hashes. */
export const applyToHistory = (
  history: EditHistory,
  label: string,
  result: EdlOpResult,
  atIso: string,
): EditHistory => ({
  past: [...history.past, history.present].slice(-HISTORY_LIMIT),
  present: result.edl,
  future: [],
  log: [
    ...history.log,
    { label, at: atIso, beforeHash: edlHash(history.present), afterHash: edlHash(result.edl) },
  ].slice(-HISTORY_LIMIT),
})

/** Undo: the present returns to the EXACT prior EDL (snapshot), so its hash matches the log. */
export const undoHistory = (history: EditHistory, atIso: string): EditHistory => {
  const previous = history.past[history.past.length - 1]
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    log: [
      ...history.log,
      {
        label: 'undo',
        at: atIso,
        beforeHash: edlHash(history.present),
        afterHash: edlHash(previous),
      },
    ].slice(-HISTORY_LIMIT),
  }
}

export const redoHistory = (history: EditHistory, atIso: string): EditHistory => {
  const nextEdl = history.future[0]
  if (!nextEdl) return history
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: nextEdl,
    future: history.future.slice(1),
    log: [
      ...history.log,
      {
        label: 'redo',
        at: atIso,
        beforeHash: edlHash(history.present),
        afterHash: edlHash(nextEdl),
      },
    ].slice(-HISTORY_LIMIT),
  }
}
