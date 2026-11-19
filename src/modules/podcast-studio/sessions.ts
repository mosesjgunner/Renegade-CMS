/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this boundary. */
/**
 * POD-05 (POD-REQ-11/12/13): server persistence for Podcast Studio
 * sessions + the Example Show scaffold.
 *
 * Session documents (the POD-00 StudioSession JSON, validated through
 * the POD-00 parser on every save by the engine's save path) live in
 * the `podcast-studio-sessions` collection, site-scoped through the
 * owning show. All state changes go through the pure engine in
 * session-engine.ts; this module is the thin Payload layer the
 * studio API routes call (staff auth + operator site checks happen
 * in the routes, following the POD-04 production pattern).
 */
import { randomUUID } from 'node:crypto'

import {
  addBank,
  addClip,
  addRundownItem,
  armCue,
  completeSegment,
  createSession,
  disarmCue,
  finishClip,
  fireCue,
  moveRundownItem,
  postMessage,
  reloadSession,
  removeClip,
  removeRundownItem,
  resetBank,
  restoreBank,
  restoreSession,
  saveSession,
  setClipCue,
  setMixerSnapshot,
  setSessionState,
  skipSegment,
  startSegment,
  stopAll,
  stopCue,
  tick,
  validateSessionDoc,
  type SessionOpResult,
  type StudioSessionDoc,
} from './session-engine'
import { exportOpml, importOpmlRundown } from './opml'
import type { DeskMode } from './mixer/device-roles'
import {
  addMarker,
  getRecordingState,
  requestStopRecording,
  startRecordingState,
  type RecordingMarker,
  type RecordingState,
} from './recording/recording-session'

export const PODCAST_STUDIO_SESSION_COLLECTION = 'podcast-studio-sessions'
export const STUDIO_SESSION_SCHEMA_VERSION = 1

export class PodcastStudioSessionError extends Error {
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

export type StudioSessionRecord = {
  id: string
  siteId: string
  showId: string
  title: string
  state: string
  schemaVersion: number
  startedAt: string | null
  lastSavedAt: string | null
  session: StudioSessionDoc
}

const toRecord = (doc: any): StudioSessionRecord => ({
  id: String(doc.id),
  siteId: relationId(doc.site),
  showId: relationId(doc.show),
  title: String(doc.title ?? ''),
  state: String(doc.state ?? 'draft'),
  schemaVersion: Number(doc.schemaVersion ?? STUDIO_SESSION_SCHEMA_VERSION),
  startedAt: doc.startedAt ?? null,
  lastSavedAt: doc.lastSavedAt ?? null,
  session: reloadSession(doc.sessionData),
})

/** Creates the collection row for a session document (validated via the save path). */
export async function createStudioSessionRecord(
  payload: any,
  input: { siteId: string; showId: string; title: string; session: StudioSessionDoc },
): Promise<StudioSessionRecord> {
  const validated = validateSessionDoc(input.session)
  saveSession(validated) // throws if the document fails the POD-00 parser
  const now = new Date().toISOString()
  const doc = await payload.create({
    collection: PODCAST_STUDIO_SESSION_COLLECTION,
    data: {
      site: input.siteId,
      show: input.showId,
      title: input.title,
      state: validated.state,
      sessionData: validated,
      schemaVersion: STUDIO_SESSION_SCHEMA_VERSION,
      startedAt: now,
      lastSavedAt: now,
    },
    overrideAccess: true,
  })
  return toRecord(doc)
}

export async function loadStudioSessionRecord(
  payload: any,
  sessionRecordId: string,
): Promise<StudioSessionRecord | null> {
  if (!sessionRecordId) return null
  const doc = await payload
    .findByID({
      collection: PODCAST_STUDIO_SESSION_COLLECTION,
      id: sessionRecordId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  return doc ? toRecord(doc) : null
}

export async function listStudioSessionRecords(
  payload: any,
  showId: string,
): Promise<StudioSessionRecord[]> {
  const result = await payload.find({
    collection: PODCAST_STUDIO_SESSION_COLLECTION,
    where: { show: { equals: showId } },
    sort: '-lastSavedAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return (result.docs as any[]).map(toRecord)
}

/** Persists a session document (parser-validated) and refreshes the row's state/stamps. */
export async function saveStudioSessionRecord(
  payload: any,
  sessionRecordId: string,
  session: StudioSessionDoc,
): Promise<StudioSessionRecord> {
  const validated = validateSessionDoc(session)
  saveSession(validated)
  const doc = await payload.update({
    collection: PODCAST_STUDIO_SESSION_COLLECTION,
    id: sessionRecordId,
    data: {
      title: validated.showTitle,
      state: validated.state,
      sessionData: validated,
      schemaVersion: STUDIO_SESSION_SCHEMA_VERSION,
      lastSavedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })
  return toRecord(doc)
}

export async function deleteStudioSessionRecord(payload: any, sessionRecordId: string) {
  return payload.delete({
    collection: PODCAST_STUDIO_SESSION_COLLECTION,
    id: sessionRecordId,
    overrideAccess: true,
  })
}

// ---------------------------------------------------------------------------
// State-op dispatch (the studio API's PATCH surface)
// ---------------------------------------------------------------------------

export type SessionOperation =
  | { op: 'tick'; sec: number }
  | { op: 'set-state'; state: string }
  | { op: 'message'; text: string; level?: 'info' | 'warn' | 'error' }
  | { op: 'restore' }
  | { op: 'add-item'; item: { title: string; [key: string]: unknown } }
  | { op: 'move-item'; fromIdx: number; toIdx: number }
  | { op: 'remove-item'; itemId: string }
  | { op: 'start-segment'; itemId: string }
  | { op: 'complete-segment'; itemId: string }
  | { op: 'skip-segment'; itemId: string }
  | { op: 'add-bank'; name: string }
  | { op: 'add-clip'; bankId: string; clip: { title: string; [key: string]: unknown } }
  | { op: 'remove-clip'; clipId: string }
  | { op: 'set-cue'; clipId: string; cue: Record<string, unknown> }
  | { op: 'arm'; clipId: string }
  | { op: 'disarm'; clipId: string }
  | { op: 'fire'; clipId: string }
  | { op: 'stop-clip'; clipId: string }
  | { op: 'finish-clip'; clipId: string }
  | { op: 'stop-all' }
  | { op: 'reset-bank'; bankId: string }
  | { op: 'restore-bank'; bankId: string }
  | { op: 'set-mixer'; mixer: any }
  // POD-21 (POD-15 gap): the marker + POD-09 recording-state ops the
  // live workspace's keyboard/MIDI handlers dispatch. Before this pass
  // the API exposed no such ops, so the workspace mapped record.start/
  // stop to bare desk states and marker.drop to a status line only.
  | { op: 'drop-marker'; name?: string | null; atElapsedSec?: number }
  | { op: 'recording-start'; deskMode?: DeskMode }
  | { op: 'recording-stop'; confirmed?: boolean }
  | { op: 'import-opml'; opml: string }
  | { op: 'export-opml'; targetText?: string | null; force?: boolean }

export type AppliedOperation = {
  ok: boolean
  error?: string
  session: StudioSessionDoc
  /** Present for export-opml: the OPML text, or the conflict detail. */
  opml?: string
  conflict?: Record<string, unknown>
  /** Present for drop-marker: the marker that landed (POD-21). */
  marker?: RecordingMarker | { number: number; name: string; atElapsedSec: number }
  /** Present for the recording ops: the POD-09 recording state after the op (POD-21). */
  recordingState?: RecordingState | null
}

/** Applies one named state operation to a session document (pure; no persistence). */
export function applySessionOperation(
  session: StudioSessionDoc,
  operation: SessionOperation,
): AppliedOperation {
  const wrap = (result: SessionOpResult): AppliedOperation => ({
    ok: result.ok,
    ...(result.error ? { error: result.error } : {}),
    session: result.session,
  })
  switch (operation.op) {
    case 'tick':
      return { ok: true, session: tick(session, operation.sec) }
    case 'set-state':
      return { ok: true, session: setSessionState(session, operation.state) }
    case 'message':
      return { ok: true, session: postMessage(session, operation.text, operation.level) }
    case 'restore':
      return { ok: true, session: restoreSession(session) }
    case 'add-item':
      return wrap(addRundownItem(session, operation.item as never))
    case 'move-item':
      return wrap(moveRundownItem(session, operation.fromIdx, operation.toIdx))
    case 'remove-item':
      return wrap(removeRundownItem(session, operation.itemId))
    case 'start-segment':
      return wrap(startSegment(session, operation.itemId))
    case 'complete-segment':
      return wrap(completeSegment(session, operation.itemId))
    case 'skip-segment':
      return wrap(skipSegment(session, operation.itemId))
    case 'add-bank':
      return wrap(addBank(session, { name: operation.name }))
    case 'add-clip':
      return wrap(addClip(session, operation.bankId, operation.clip as never))
    case 'remove-clip':
      return wrap(removeClip(session, operation.clipId))
    case 'set-cue':
      return wrap(setClipCue(session, operation.clipId, operation.cue as never))
    case 'arm':
      return wrap(armCue(session, operation.clipId))
    case 'disarm':
      return wrap(disarmCue(session, operation.clipId))
    case 'fire':
      return wrap(fireCue(session, operation.clipId))
    case 'stop-clip':
      return wrap(stopCue(session, operation.clipId))
    case 'finish-clip':
      return wrap(finishClip(session, operation.clipId))
    case 'stop-all':
      return { ok: true, session: stopAll(session) }
    case 'reset-bank':
      return wrap(resetBank(session, operation.bankId))
    case 'restore-bank':
      return wrap(restoreBank(session, operation.bankId))
    case 'set-mixer':
      return wrap(setMixerSnapshot(session, operation.mixer))
    case 'drop-marker': {
      // POD-21: the same semantics the POD-15 core handlers proved —
      // while recording, the POD-09 marker lands in BOTH the recording
      // state and the session marker list; off-record it still lands
      // in the session list (auto number kept when no name is given).
      if (getRecordingState(session)?.status === 'recording') {
        const dropped = addMarker(session, {
          promptResult: operation.name ?? null,
          ...(operation.atElapsedSec !== undefined ? { atElapsedSec: operation.atElapsedSec } : {}),
        })
        return {
          ok: true,
          session: dropped.session,
          marker: dropped.marker,
          recordingState: getRecordingState(dropped.session),
        }
      }
      const next: StudioSessionDoc = JSON.parse(JSON.stringify(session)) as StudioSessionDoc
      const atElapsedSec = operation.atElapsedSec ?? next.elapsedSec
      const number = (next.markers ?? []).length + 1
      const typed = operation.name?.trim() ?? ''
      const marker = {
        number,
        name: typed.length > 0 ? typed : `Marker ${number}`,
        atElapsedSec,
      }
      next.markers = [
        ...(next.markers ?? []),
        { startTime: atElapsedSec, title: marker.name, type: 'marker' },
      ]
      next.log.push({
        type: 'marker',
        level: 'info',
        atElapsedSec,
        markerNumber: number,
        markerName: marker.name,
      })
      return { ok: true, session: validateSessionDoc(next), marker }
    }
    case 'recording-start': {
      if (getRecordingState(session)?.status === 'recording')
        return { ok: false, error: 'already-recording', session }
      const started = startRecordingState(session, {
        deskMode: operation.deskMode ?? 'one-mic',
      })
      return { ok: true, session: started, recordingState: getRecordingState(started) }
    }
    case 'recording-stop': {
      // A control-surface/API stop dispatch is the operator's explicit
      // act, so the POD-09 confirm guard is satisfied by default; a
      // caller may pass `confirmed: false` to exercise the guard.
      const result = requestStopRecording(session, { confirmed: operation.confirmed ?? true })
      if (!result.ok) return { ok: false, error: result.code, session: result.session }
      return {
        ok: true,
        session: result.session,
        recordingState: getRecordingState(result.session),
      }
    }
    case 'import-opml': {
      const next = importOpmlRundown(session, operation.opml)
      return { ok: true, session: validateSessionDoc(next) }
    }
    case 'export-opml': {
      const result = exportOpml(session, operation.targetText ?? null, {
        force: operation.force,
      })
      if (!result.ok) {
        return {
          ok: false,
          error: 'opml-conflict',
          session,
          conflict: {
            recordedHash: result.recordedHash,
            targetHash: result.targetHash,
            reason: result.reason,
          },
        }
      }
      return { ok: true, session, opml: result.opml }
    }
    default:
      throw new PodcastStudioSessionError(
        'PODCAST_STUDIO_UNKNOWN_OP',
        `Unknown studio session operation: ${String((operation as { op?: unknown }).op)}`,
      )
  }
}

/** Loads a session record, applies an operation, and persists the result. */
export async function applySessionOperationToRecord(
  payload: any,
  sessionRecordId: string,
  operation: SessionOperation,
): Promise<{ record: StudioSessionRecord; applied: AppliedOperation }> {
  const record = await loadStudioSessionRecord(payload, sessionRecordId)
  if (!record) {
    throw new PodcastStudioSessionError(
      'PODCAST_STUDIO_SESSION_NOT_FOUND',
      'Studio session not found.',
    )
  }
  const applied = applySessionOperation(record.session, operation)
  // Export is read-only: it never mutates (or re-stamps) the stored session.
  if (operation.op === 'export-opml') return { record, applied }
  const saved = await saveStudioSessionRecord(payload, sessionRecordId, applied.session)
  return { record: saved, applied }
}

// ---------------------------------------------------------------------------
// Example Show scaffold
// ---------------------------------------------------------------------------

/**
 * The starter session for the Example Show: a five-item rundown, one
 * cart deck with three clips, the default mixer snapshot, and an
 * export-profile placeholder (real export profiles land with the
 * export prompts; the placeholder rides in the session document's
 * preserved extension fields).
 */
export function buildExampleSession(showId: string, showTitle: string): StudioSessionDoc {
  let session = createSession({ showId, showTitle })
  const items: Array<Parameters<typeof addRundownItem>[1]> = [
    { id: 'rd-cold-open', type: 'segment', title: 'Cold open + headlines', plannedSec: 300 },
    { id: 'rd-theme', type: 'clip', title: 'Theme sting', plannedSec: 8, clipId: 'cart-theme' },
    { id: 'rd-guest', type: 'guest', title: 'Guest interview', plannedSec: 900 },
    {
      id: 'rd-link',
      type: 'link',
      title: 'Link read: show notes',
      plannedSec: 30,
      url: 'https://example.com/notes',
    },
    { id: 'rd-wrap', type: 'segment', title: 'Wrap + credits', plannedSec: 240 },
  ]
  for (const item of items) session = addRundownItem(session, item).session
  const bankId = session.cartwall.banks[0].id
  const clips: Array<Parameters<typeof addClip>[2]> = [
    {
      id: 'cart-theme',
      title: 'Theme sting',
      cueInSec: 0,
      cueOutSec: 8,
      fadeInSec: 0,
      fadeOutSec: 1,
      loop: false,
    },
    {
      id: 'cart-bed',
      title: 'News bed (loop)',
      cueInSec: 0,
      cueOutSec: 60,
      fadeInSec: 2,
      fadeOutSec: 2,
      loop: true,
    },
    {
      id: 'cart-applause',
      title: 'Applause',
      cueInSec: 0,
      cueOutSec: 6,
      fadeInSec: 0.1,
      fadeOutSec: 0.5,
      loop: false,
    },
  ]
  for (const clip of clips) session = addClip(session, bankId, clip).session
  session = {
    ...session,
    exportProfile: {
      name: 'Default export (placeholder)',
      format: 'mp3',
      bitrateKbps: 128,
      loudnessTargetLufs: -16,
      status: 'placeholder — real export profiles land with the export prompts',
    },
  }
  return validateSessionDoc(session)
}

/**
 * Creates an example podcast show plus its starter studio session.
 * Used by the integration tests and available to setup tooling; the
 * show is a plain draft podcast-shows record on the given site.
 */
export async function createExampleShow(
  payload: any,
  input: { siteId: string; slugSuffix?: string },
): Promise<{ show: any; record: StudioSessionRecord }> {
  const suffix = input.slugSuffix ?? randomUUID().slice(0, 8)
  const show = await payload.create({
    collection: 'podcast-shows',
    data: {
      site: input.siteId,
      title: 'Example Show',
      slug: `example-show-${suffix}`,
      description: 'Starter show created by the Podcast Studio Example Show scaffold (POD-05).',
      status: 'draft',
    },
    overrideAccess: true,
  })
  const session = buildExampleSession(String(show.id), String(show.title))
  const record = await createStudioSessionRecord(payload, {
    siteId: input.siteId,
    showId: String(show.id),
    title: String(show.title),
    session,
  })
  return { show, record }
}
