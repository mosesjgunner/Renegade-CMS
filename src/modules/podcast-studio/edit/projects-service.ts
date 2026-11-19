/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-12 (POD-REQ-26, POD-REQ-27): server persistence for Podcast
 * Studio edit projects — the thin Payload layer over the pure project
 * model in project.ts, following the POD-05 sessions pattern (staff
 * auth + operator site checks live in the API routes; all writes here
 * run with overrideAccess and every save is validated through the
 * POD-00 EDL parser via the project model).
 *
 * Autosave model: the editor PATCHes the full EDL after each op (the
 * EDL is the document; ops are pure). Each save appends a bounded
 * version snapshot inside the project document (see project.ts for
 * the persistence-choice rationale), so reopening a project can
 * restore any of the last `PROJECT_VERSION_LIMIT` versions exactly.
 */
import { parseTrackManifest } from '../contracts/track-manifest'
import { loadEpisodeTranscript } from '../episode-transcript'
import {
  buildProjectFromRecording,
  restoreProjectVersion,
  saveProjectEdl,
  validateProjectDoc,
  EDIT_PROJECT_SCHEMA_VERSION,
  type EditProjectDoc,
} from './project'
import { edlHash, type EditEdl } from './edl-engine'

export const PODCAST_EDIT_PROJECT_COLLECTION = 'podcast-edit-projects'
export const PODCAST_RECORDING_COLLECTION = 'podcast-recordings'

export class PodcastEditProjectError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const relationId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id)
      : ''

export type EditProjectRecord = {
  id: string
  siteId: string
  showId: string
  title: string
  schemaVersion: number
  lastSavedAt: string | null
  project: EditProjectDoc
}

const toRecord = (doc: any): EditProjectRecord => ({
  id: String(doc.id),
  siteId: relationId(doc.site),
  showId: relationId(doc.show),
  title: String(doc.title ?? ''),
  schemaVersion: Number(doc.schemaVersion ?? EDIT_PROJECT_SCHEMA_VERSION),
  lastSavedAt: doc.lastSavedAt ?? null,
  project: validateProjectDoc(doc.projectData),
})

export async function createEditProjectRecord(
  payload: any,
  input: { siteId: string; showId: string; project: EditProjectDoc },
): Promise<EditProjectRecord> {
  const validated = validateProjectDoc(input.project)
  const now = new Date().toISOString()
  const doc = await payload.create({
    collection: PODCAST_EDIT_PROJECT_COLLECTION,
    data: {
      site: input.siteId,
      show: input.showId,
      session: validated.sessionId || undefined,
      recording: validated.recordingId || undefined,
      episode: validated.episodeId || undefined,
      title: validated.title,
      projectData: validated,
      schemaVersion: EDIT_PROJECT_SCHEMA_VERSION,
      lastSavedAt: now,
    },
    overrideAccess: true,
  })
  return toRecord(doc)
}

export async function loadEditProjectRecord(
  payload: any,
  projectId: string,
): Promise<EditProjectRecord | null> {
  if (!projectId) return null
  const doc = await payload
    .findByID({
      collection: PODCAST_EDIT_PROJECT_COLLECTION,
      id: projectId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  return doc ? toRecord(doc) : null
}

export async function listEditProjectRecords(
  payload: any,
  showId: string,
): Promise<EditProjectRecord[]> {
  const result = await payload.find({
    collection: PODCAST_EDIT_PROJECT_COLLECTION,
    where: { show: { equals: showId } },
    sort: '-lastSavedAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return (result.docs as any[]).map(toRecord)
}

/** Autosave: store a new current EDL as a fresh version snapshot. */
export async function saveEditProjectEdl(
  payload: any,
  projectId: string,
  edl: EditEdl,
  label: string,
): Promise<EditProjectRecord> {
  const record = await loadEditProjectRecord(payload, projectId)
  if (!record)
    throw new PodcastEditProjectError(
      'EDIT_PROJECT_NOT_FOUND',
      `Edit project ${projectId} not found.`,
    )
  const next = saveProjectEdl(record.project, edl, label, new Date().toISOString())
  const doc = await payload.update({
    collection: PODCAST_EDIT_PROJECT_COLLECTION,
    id: projectId,
    data: {
      title: next.title,
      projectData: next,
      schemaVersion: EDIT_PROJECT_SCHEMA_VERSION,
      lastSavedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  return toRecord(doc)
}

/** Restore a saved version as current (the restore is itself a new version). */
export async function restoreEditProjectVersion(
  payload: any,
  projectId: string,
  version: number,
): Promise<EditProjectRecord> {
  const record = await loadEditProjectRecord(payload, projectId)
  if (!record)
    throw new PodcastEditProjectError(
      'EDIT_PROJECT_NOT_FOUND',
      `Edit project ${projectId} not found.`,
    )
  let next: EditProjectDoc
  try {
    next = restoreProjectVersion(record.project, version, new Date().toISOString())
  } catch (error) {
    throw new PodcastEditProjectError(
      'EDIT_PROJECT_VERSION_NOT_FOUND',
      error instanceof Error ? error.message : 'Version not found.',
    )
  }
  const doc = await payload.update({
    collection: PODCAST_EDIT_PROJECT_COLLECTION,
    id: projectId,
    data: {
      projectData: next,
      schemaVersion: EDIT_PROJECT_SCHEMA_VERSION,
      lastSavedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  return toRecord(doc)
}

export type RecordingSummary = {
  id: string
  state: string
  finalizedAt: string | null
  episodeId: string | null
  trackCount: number
}

/** Recordings for a show that an edit project can be created from. */
export async function listRecordingsForShow(
  payload: any,
  showId: string,
): Promise<RecordingSummary[]> {
  const result = await payload.find({
    collection: PODCAST_RECORDING_COLLECTION,
    where: { show: { equals: showId } },
    sort: '-finalizedAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return (result.docs as any[]).map((doc) => ({
    id: String(doc.id),
    state: String(doc.state ?? ''),
    finalizedAt: doc.finalizedAt ?? null,
    episodeId: relationId(doc.episode) || null,
    trackCount: Array.isArray((doc.manifest as any)?.tracks)
      ? (doc.manifest as any).tracks.length
      : 0,
  }))
}

/**
 * Create-from-recording: loads the POD-09 recording record (manifest,
 * markers, played-clip log, track assets, POD-11 conform reports),
 * seeds chapters/transcript from the bound episode when present, and
 * persists a new edit project via the pure builder.
 */
export async function createProjectFromRecording(
  payload: any,
  input: { siteId: string; showId: string; recordingId: string; title?: string },
): Promise<EditProjectRecord> {
  const recording = await payload
    .findByID({
      collection: PODCAST_RECORDING_COLLECTION,
      id: input.recordingId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!recording)
    throw new PodcastEditProjectError(
      'RECORDING_NOT_FOUND',
      `Recording ${input.recordingId} not found.`,
    )
  if (relationId(recording.show) !== input.showId)
    throw new PodcastEditProjectError(
      'RECORDING_SHOW_MISMATCH',
      'Recording does not belong to this show.',
    )
  const manifest = parseTrackManifest(recording.manifest)
  const episodeId = relationId(recording.episode) || null
  let episodeChapters: unknown
  let episodeSegments: {
    startSeconds: number
    endSeconds: number
    text: string
    speaker?: string
  }[] = []
  if (episodeId) {
    const episode = await payload
      .findByID({ collection: 'podcast-episodes', id: episodeId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (episode) {
      episodeChapters = episode.chapters
      const slug = typeof episode.slug === 'string' ? episode.slug : ''
      if (slug) {
        const loaded = await loadEpisodeTranscript(
          payload,
          slug,
          `/podcasts/episodes/${slug}/transcript`,
          // Staff-side seeding: a members-only episode's transcript
          // still seeds its own edit project (POD-19 gate is public-only).
          { allowMembersOnly: true },
        ).catch(() => null)
        if (loaded?.kind === 'found') episodeSegments = loaded.segments
      }
    }
  }
  const project = buildProjectFromRecording({
    title: input.title || `Edit — recording ${String(recording.id).slice(0, 8)}`,
    recordingId: String(recording.id),
    sessionId: relationId(recording.session) || null,
    episodeId,
    manifest: manifest as never,
    markers: Array.isArray(recording.markers) ? recording.markers : [],
    playedClipLog: Array.isArray(recording.playedClipLog) ? recording.playedClipLog : [],
    trackAssets: Array.isArray(recording.trackAssets) ? recording.trackAssets : [],
    conformReports: Array.isArray(recording.conformReports) ? recording.conformReports : [],
    episodeChapters,
    episodeTranscriptSegments: episodeSegments,
    savedAt: new Date().toISOString(),
  })
  return createEditProjectRecord(payload, { siteId: input.siteId, showId: input.showId, project })
}

/**
 * The editor view of a project: the record plus the POD-08 server
 * peaks for every referenced media asset (peaks are the waveform
 * data — the client never decodes full tracks to draw lanes).
 */
export async function loadEditProjectView(payload: any, projectId: string) {
  const record = await loadEditProjectRecord(payload, projectId)
  if (!record) return null
  const assetIds = [
    ...new Set(
      record.project.edl.sources
        .map((source) => source.mediaAssetId ?? source.assetId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ]
  const peaksByAssetId: Record<string, unknown> = {}
  for (const assetId of assetIds) {
    const asset = await payload
      .findByID({ collection: 'media-assets', id: assetId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (asset?.waveformPeaks) peaksByAssetId[assetId] = asset.waveformPeaks
  }
  return { record, peaksByAssetId, edlHash: edlHash(record.project.edl) }
}
