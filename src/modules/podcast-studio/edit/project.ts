/**
 * POD-12 (POD-REQ-26, POD-REQ-27) — edit project model (PURE CORE).
 *
 * An edit project binds a POD-09 recording (or imported media) to its
 * EDL and carries the project's version history. Persistence choice
 * (documented per the POD-12 brief): the history lives INSIDE the
 * project document as a bounded list of full-EDL versions — every
 * autosave appends `{ version, savedAt, label, edlHash, edl }` and the
 * list is capped at `PROJECT_VERSION_LIMIT` (oldest dropped). Payload
 * versions were rejected for this: restores must be exact-EDL and
 * hash-comparable, and the engine's own snapshot history already
 * proves the model; a document-local version list keeps restore a
 * pure function of the stored document with no draft/version
 * machinery in between. The in-editor undo/redo history (engine
 * `EditHistory`) is session state and is NOT persisted — what persists
 * is the version list, so reopening a project restores any saved
 * version exactly (hash-verified in tests).
 *
 * Create-from-recording is a pure builder over the POD-09 artefacts:
 * lanes come from the track manifest — the program lane first, as a
 * MUTED reference; ISO lanes editable. Live recording markers and the
 * POD-08 played-clip log become EDL markers (played items tagged
 * `type: 'played-clip'`); chapters and transcript seed from the bound
 * episode's canonical chapter list and current transcript revision
 * when an episode is bound (POD-01/POD-03 paths). Markers can be
 * promoted to chapters with `chaptersFromMarkers`.
 */
import {
  parseEdl,
  type Edl,
  type EdlChapter,
  type EdlMarker,
  type EdlTranscriptCue,
} from '../contracts/edl'
import type { TrackManifest } from '../contracts/track-manifest'
import type { PlayedClipLogEntry } from '../players/played-log'
import type { RecordingMarker } from '../recording/recording-session'
import { edlHash, ensureClipIds, type EditEdl, type EditTrack } from './edl-engine'

export const EDIT_PROJECT_SCHEMA_VERSION = 1
export const PROJECT_VERSION_LIMIT = 20

export type EditProjectVersion = {
  version: number
  savedAt: string
  label: string
  edlHash: string
  edl: EditEdl
}

export type EditProjectDoc = {
  version: 1
  title: string
  /** POD-09 recording record id this project was built from, when any. */
  recordingId: string | null
  /** POD-05 studio session record id, when the recording carried one. */
  sessionId: string | null
  /** Bound podcast episode id, when any. */
  episodeId: string | null
  edl: EditEdl
  /** Bounded version list, oldest first; the last entry mirrors `edl`. */
  versions: EditProjectVersion[]
}

export type RecordingTrackAsset = { trackId: string; mediaAssetId: string; checksumSha256?: string }

export type ConformReportEntry = {
  trackId: string
  rateCorrection?: {
    nominalRate: number
    measuredRateHz: number
    resampleFactor: number
    rateCorrectionPpm: number
    offsetSamplesAtHead: number
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const numberField = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

/** Tolerant reader for the episode's canonical chapter list (json field, POD-01 shape family). */
export const episodeChaptersToEdl = (raw: unknown): EdlChapter[] => {
  if (!Array.isArray(raw)) return []
  const chapters: EdlChapter[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) continue
    const start = numberField(record, ['start', 'startTime', 'startSeconds', 'startSec'])
    const title = typeof record.title === 'string' ? record.title : null
    if (start === null || title === null) continue
    chapters.push({ start, title })
  }
  return chapters.sort((a, b) => a.start - b.start)
}

/** Maps POD-03 current-revision transcript segments onto EDL cues. */
export const episodeSegmentsToCues = (
  segments: { startSeconds: number; endSeconds: number; text: string; speaker?: string }[],
): EdlTranscriptCue[] =>
  segments
    .filter((segment) => segment.endSeconds > segment.startSeconds && segment.text)
    .map((segment) => ({
      start: segment.startSeconds,
      end: segment.endSeconds,
      text: segment.text,
      ...(segment.speaker ? { speaker: segment.speaker } : {}),
    }))
    .sort((a, b) => a.start - b.start)

export type BuildProjectFromRecordingInput = {
  title: string
  recordingId: string | null
  sessionId: string | null
  episodeId: string | null
  manifest: TrackManifest & {
    tracks: Array<TrackManifest['tracks'][number] & { mediaAssetId?: string }>
  }
  markers?: RecordingMarker[] | unknown[]
  playedClipLog?: PlayedClipLogEntry[] | unknown[]
  trackAssets?: RecordingTrackAsset[]
  conformReports?: ConformReportEntry[]
  episodeChapters?: unknown
  episodeTranscriptSegments?: {
    startSeconds: number
    endSeconds: number
    text: string
    speaker?: string
  }[]
  savedAt: string
}

/**
 * Builds the initial project document from a finalized recording.
 * Program lane = muted reference; every other manifest lane is an
 * editable ISO lane with one full-span clip. POD-11 conform artefacts
 * land on the matching sources as POD-00 `rateCorrection`.
 */
export const buildProjectFromRecording = (
  input: BuildProjectFromRecordingInput,
): EditProjectDoc => {
  const assetByTrack = new Map<string, string>()
  for (const asset of input.trackAssets ?? [])
    if (asset.mediaAssetId) assetByTrack.set(asset.trackId, asset.mediaAssetId)
  const correctionByTrack = new Map<string, NonNullable<ConformReportEntry['rateCorrection']>>()
  for (const report of input.conformReports ?? [])
    if (report.rateCorrection) correctionByTrack.set(report.trackId, report.rateCorrection)

  const sources: Edl['sources'] = []
  const tracks: EditTrack[] = []
  const ordered = [...input.manifest.tracks].sort((a, b) =>
    a.role === 'program' ? -1 : b.role === 'program' ? 1 : 0,
  )
  for (const track of ordered) {
    const mediaAssetId = assetByTrack.get(track.trackId) ?? track.mediaAssetId
    const source: Edl['sources'][number] = { id: track.trackId }
    if (mediaAssetId) source.mediaAssetId = mediaAssetId
    const correction = correctionByTrack.get(track.trackId)
    if (correction) source.rateCorrection = correction
    sources.push(source)
    tracks.push({
      id: track.trackId,
      gain: 1,
      label: track.role === 'program' ? 'Program (reference)' : track.trackId,
      role: track.role,
      ...(track.role === 'program' ? { muted: true } : {}),
      clips: [
        {
          id: `${track.trackId}:clip-0`,
          sourceId: track.trackId,
          sourceIn: 0,
          sourceOut: track.durationSec,
          timelineStart: 0,
        },
      ],
    })
  }

  const markers: EdlMarker[] = []
  for (const raw of input.markers ?? []) {
    const record = asRecord(raw)
    if (!record) continue
    const at = numberField(record, ['atElapsedSec', 'start'])
    if (at === null) continue
    markers.push({
      start: at,
      title: typeof record.name === 'string' ? record.name : 'Marker',
      type: 'recording-marker',
    })
  }
  for (const raw of input.playedClipLog ?? []) {
    const record = asRecord(raw)
    if (!record) continue
    const at = numberField(record, ['startedAtSessionSec', 'start'])
    if (at === null) continue
    markers.push({
      start: at,
      title: typeof record.title === 'string' ? record.title : 'Played clip',
      type: 'played-clip',
    })
  }
  markers.sort((a, b) => a.start - b.start)

  // Seed data comes from the episode's canonical lists, which may run
  // past this recording's length: clamp to the recording duration so
  // the seeded EDL satisfies the POD-00 contract (nothing timed may
  // extend past the timeline).
  const maxDuration = Math.max(0, ...input.manifest.tracks.map((track) => track.durationSec))
  const edl = ensureClipIds(
    parseEdl({
      version: 1,
      sessionRate: input.manifest.sampleRate,
      sources,
      tracks,
      chapters: episodeChaptersToEdl(input.episodeChapters).filter(
        (chapter) => chapter.start <= maxDuration,
      ),
      transcript: episodeSegmentsToCues(input.episodeTranscriptSegments ?? [])
        .filter((cue) => cue.start < maxDuration)
        .map((cue) => ({ ...cue, end: Math.min(cue.end, maxDuration) })),
      markers: markers.filter((marker) => marker.start <= maxDuration),
    }),
  )

  const doc: EditProjectDoc = {
    version: 1,
    title: input.title,
    recordingId: input.recordingId,
    sessionId: input.sessionId,
    episodeId: input.episodeId,
    edl,
    versions: [],
  }
  return appendProjectVersion(doc, 'Created from recording', input.savedAt)
}

/** Promotes EDL markers to chapters (POD-09 markers / POD-08 played items as chapter points). */
export const chaptersFromMarkers = (edl: EditEdl, onlyTypes?: string[]): EditEdl => {
  const existing = new Set(edl.chapters.map((chapter) => chapter.start))
  const promoted: EdlChapter[] = []
  for (const marker of edl.markers ?? []) {
    if (onlyTypes && marker.type && !onlyTypes.includes(marker.type)) continue
    if (existing.has(marker.start)) continue
    promoted.push({ start: marker.start, title: marker.title ?? marker.label ?? 'Chapter' })
  }
  const next: EditEdl = {
    ...edl,
    chapters: [...edl.chapters, ...promoted].sort((a, b) => a.start - b.start),
  }
  parseEdl(next)
  return next
}

/** Appends a version snapshot of the project's current EDL (bounded; oldest dropped). */
export const appendProjectVersion = (
  doc: EditProjectDoc,
  label: string,
  savedAt: string,
): EditProjectDoc => {
  const version: EditProjectVersion = {
    version: (doc.versions[doc.versions.length - 1]?.version ?? 0) + 1,
    savedAt,
    label,
    edlHash: edlHash(doc.edl),
    edl: doc.edl,
  }
  return { ...doc, versions: [...doc.versions, version].slice(-PROJECT_VERSION_LIMIT) }
}

/** Autosave: replace the current EDL and append its version. */
export const saveProjectEdl = (
  doc: EditProjectDoc,
  edl: EditEdl,
  label: string,
  savedAt: string,
): EditProjectDoc => {
  parseEdl(edl)
  return appendProjectVersion({ ...doc, edl }, label, savedAt)
}

/** Restore a saved version as the current EDL (the restore itself is a new version). */
export const restoreProjectVersion = (
  doc: EditProjectDoc,
  version: number,
  savedAt: string,
): EditProjectDoc => {
  const target = doc.versions.find((entry) => entry.version === version)
  if (!target) throw new Error(`restore: project has no version ${version}.`)
  return appendProjectVersion({ ...doc, edl: target.edl }, `Restored version ${version}`, savedAt)
}

/** Validates a stored project document (EDL through the POD-00 parser, versions bounded). */
export const validateProjectDoc = (value: unknown): EditProjectDoc => {
  const record = asRecord(value)
  if (!record) throw new Error('Edit project document must be an object.')
  if (record.version !== 1) throw new Error('Edit project document version must be 1.')
  const edl = parseEdl(record.edl)
  const versions = Array.isArray(record.versions) ? record.versions : []
  for (const entry of versions) {
    const versionRecord = asRecord(entry)
    if (!versionRecord) throw new Error('Edit project version entries must be objects.')
    parseEdl(versionRecord.edl)
  }
  return value as EditProjectDoc
}
