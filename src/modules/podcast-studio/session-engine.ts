/**
 * POD-05 (POD-REQ-11, POD-REQ-12 state layer, POD-REQ-13 state layer):
 * the Podcast Studio session state engine.
 *
 * A pure-TS port of the PT-E prototype's proven session semantics
 * (RC3_NATIVE_PODCAST_PROTOTYPE_EVIDENCE/PT-E-session-guests/session.js;
 * PT-E is Renegade's own R&D — no third-party notice applies) over the
 * POD-00 StudioSession contract:
 *
 * - Sessions save/reload with deep equality (serialize → parse is
 *   lossless; the POD-00 parser preserves unknown fields verbatim).
 * - Restoring a saved session NEVER auto-plays: cart clips found
 *   'playing' restore as 'paused' and the downgrade is logged. A
 *   rundown item's 'playing' status is a desk state, not playback —
 *   PT-E requires the restored copy to still be able to complete the
 *   in-progress segment with the correct actual time — so rundown
 *   statuses are preserved exactly; only cart playback states and a
 *   live/recording session state are downgraded (to 'paused').
 * - Rundown ops with the PT-E timing rollup (planned vs elapsed +
 *   variance); a chapter marker is emitted ONLY when a segment/guest
 *   item starts — never on complete, never for clip/link items.
 * - Cartwall armed-fire discipline: fire(clipId) requires the clip to
 *   be armed; an unarmed fire is REJECTED and LOGGED, and firing
 *   consumes the arm (a second fire needs a re-arm).
 * - STOP ALL returns every clip to idle and logs the event.
 * - Mixer snapshots are state only (no audio exists in this stage).
 * - The session log (info/warn/error entries) lives in the session
 *   document and backs the studio's on-air / message bars.
 *
 * Every operation is immutable-style: it clones the input document and
 * returns a new one. Every save path validates through the POD-00
 * parser (`parseStudioSession`).
 */
import {
  parseStudioSession,
  serializeStudioSession,
  type StudioCartClip,
  type StudioMixerSnapshot,
  type StudioRundownItem,
  type StudioSession,
} from './contracts/session'

/**
 * The working session document: the POD-00 StudioSession plus the
 * POD-05 extension fields the parser preserves verbatim —
 * `rundownSourceHash` (OPML conflict guard, see opml.ts),
 * `deckBackups` (cart deck reset backups, bankId → clips), and an
 * optional `exportProfile` placeholder (real export profiles land
 * with the export prompts).
 */
export type StudioSessionDoc = StudioSession & {
  rundownSourceHash?: string
  deckBackups?: Record<string, StudioCartClip[]>
  exportProfile?: Record<string, unknown>
}

export type SessionLogLevel = 'info' | 'warn' | 'error'

export type SessionOpResult<Extra extends object = Record<string, unknown>> = {
  ok: boolean
  session: StudioSessionDoc
  error?: string
} & Extra

const cloneDoc = (session: StudioSessionDoc): StudioSessionDoc =>
  JSON.parse(JSON.stringify(session)) as StudioSessionDoc

const newId = (prefix: string): string => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`

export const asSessionDoc = (session: StudioSession): StudioSessionDoc =>
  session as StudioSessionDoc

/** Validates a document through the POD-00 parser (the save gate). */
export const validateSessionDoc = (session: StudioSessionDoc): StudioSessionDoc =>
  asSessionDoc(parseStudioSession(session))

const slog = (
  session: StudioSessionDoc,
  type: string,
  level: SessionLogLevel,
  extra: Record<string, unknown> = {},
): void => {
  session.log.push({ type, level, atElapsedSec: session.elapsedSec, ...extra })
}

// ---------------------------------------------------------------------------
// Lifecycle: create / save / reload / restore
// ---------------------------------------------------------------------------

export const DEFAULT_MIXER: StudioMixerSnapshot = {
  channels: [
    { id: 'host', gainDb: -3, muted: false },
    { id: 'clips', gainDb: -6, muted: false },
    { id: 'guests', gainDb: -4, muted: false },
  ],
  masterGainDb: -1,
  limiterCeilingDb: -0.3,
}

export function createSession(input: {
  id?: string
  showId: string
  showTitle: string
}): StudioSessionDoc {
  const session: StudioSessionDoc = {
    version: 1,
    id: input.id ?? newId('sess'),
    showId: input.showId,
    showTitle: input.showTitle,
    state: 'draft',
    elapsedSec: 0,
    rundown: [],
    cartwall: { banks: [{ id: 'bank-main', name: 'Main deck', clips: [] }] },
    mixer: JSON.parse(JSON.stringify(DEFAULT_MIXER)) as StudioMixerSnapshot,
    chapters: [],
    markers: [],
    log: [],
  }
  slog(session, 'session-created', 'info', { showId: input.showId })
  return validateSessionDoc(session)
}

/** Serializes after validating through the POD-00 parser. Throws on an invalid doc. */
export const saveSession = (session: StudioSessionDoc): string =>
  serializeStudioSession(validateSessionDoc(session))

/**
 * Reloads a saved session (JSON string or object). Lossless: the
 * result is deep-equal to the document that was saved.
 */
export const reloadSession = (saved: string | unknown): StudioSessionDoc =>
  asSessionDoc(parseStudioSession(saved))

/**
 * Reopens a saved session for the desk. Nothing auto-plays: cart
 * clips found 'playing' restore as 'paused', and a session saved
 * while 'live'/'recording' restores as 'paused'; every downgrade is
 * written to the session log. Rundown statuses, chapters, markers,
 * mixer and cart state are otherwise preserved exactly (PT-E).
 */
export function restoreSession(session: StudioSessionDoc): StudioSessionDoc {
  const restored = cloneDoc(session)
  const downgradedClips: string[] = []
  for (const bank of restored.cartwall.banks) {
    for (const clip of bank.clips) {
      if (clip.state === 'playing') {
        clip.state = 'paused'
        downgradedClips.push(clip.id)
      }
    }
  }
  const stateDowngraded = restored.state === 'live' || restored.state === 'recording'
  if (stateDowngraded) restored.state = 'paused'
  if (downgradedClips.length > 0 || stateDowngraded) {
    slog(restored, 'session-restored', 'warn', {
      pausedClipIds: downgradedClips,
      stateDowngraded,
      note: 'Restore never auto-plays: playing clips reopen paused.',
    })
  } else {
    slog(restored, 'session-restored', 'info', {})
  }
  return validateSessionDoc(restored)
}

/** Advances the session clock (state only; no audio clock exists yet). */
export function tick(session: StudioSessionDoc, sec: number): StudioSessionDoc {
  if (!Number.isFinite(sec) || sec < 0) throw new Error('tick requires a non-negative duration.')
  const next = cloneDoc(session)
  next.elapsedSec += sec
  return next
}

/** Sets the session desk state (draft/ready/live/paused/recording/stopped/ended) + logs it. */
export function setSessionState(session: StudioSessionDoc, state: string): StudioSessionDoc {
  const next = cloneDoc(session)
  next.state = state
  slog(next, 'session-state', state === 'live' ? 'warn' : 'info', { state })
  return next
}

/** Posts a message-bar entry to the session log. */
export function postMessage(
  session: StudioSessionDoc,
  text: string,
  level: SessionLogLevel = 'info',
): StudioSessionDoc {
  const next = cloneDoc(session)
  slog(next, 'message', level, { text })
  return next
}

// ---------------------------------------------------------------------------
// Rundown (PT-E semantics)
// ---------------------------------------------------------------------------

export function addRundownItem(
  session: StudioSessionDoc,
  item: Partial<StudioRundownItem> & { title: string },
): SessionOpResult<{ itemId: string }> {
  const next = cloneDoc(session)
  const full: StudioRundownItem = {
    id: item.id ?? newId('rd'),
    type: item.type ?? 'segment',
    title: item.title,
    plannedSec: item.plannedSec ?? 0,
    actualSec: item.actualSec ?? null,
    status: item.status ?? 'pending',
    ...(item.clipId ? { clipId: item.clipId } : {}),
    ...(item.url ? { url: item.url } : {}),
  }
  next.rundown.push(full)
  slog(next, 'rundown-add', 'info', { itemId: full.id })
  return { ok: true, session: validateSessionDoc(next), itemId: full.id }
}

export function moveRundownItem(
  session: StudioSessionDoc,
  fromIdx: number,
  toIdx: number,
): SessionOpResult<{ itemId?: string }> {
  const next = cloneDoc(session)
  if (fromIdx < 0 || fromIdx >= next.rundown.length || toIdx < 0 || toIdx >= next.rundown.length) {
    return { ok: false, session, error: 'index-out-of-range' }
  }
  const [item] = next.rundown.splice(fromIdx, 1)
  next.rundown.splice(toIdx, 0, item)
  slog(next, 'rundown-reorder', 'info', { itemId: item.id, fromIdx, toIdx })
  return { ok: true, session: next, itemId: item.id }
}

export function removeRundownItem(session: StudioSessionDoc, itemId: string): SessionOpResult {
  const next = cloneDoc(session)
  const index = next.rundown.findIndex((item) => item.id === itemId)
  if (index < 0) return { ok: false, session, error: 'no-such-item' }
  next.rundown.splice(index, 1)
  slog(next, 'rundown-remove', 'info', { itemId })
  return { ok: true, session: next }
}

/**
 * Starts a pending rundown item. A chapter marker is emitted ONLY on
 * start, and only for segment/guest items (PT-E: clip/link items emit
 * no marker).
 */
export function startSegment(
  session: StudioSessionDoc,
  itemId: string,
): SessionOpResult<{ chapterEmitted?: boolean }> {
  const next = cloneDoc(session)
  const item = next.rundown.find((entry) => entry.id === itemId)
  if (!item || item.status !== 'pending') return { ok: false, session, error: 'not-pending' }
  item.status = 'playing'
  item.startedAtElapsedSec = next.elapsedSec
  const emitsChapter = item.type === 'segment' || item.type === 'guest'
  if (emitsChapter) {
    next.chapters.push({
      startTime: next.elapsedSec,
      title: item.title,
      rundownItemId: item.id,
    })
  }
  slog(next, 'segment-start', 'info', { itemId, chapterEmitted: emitsChapter })
  return { ok: true, session: next, chapterEmitted: emitsChapter }
}

export function completeSegment(
  session: StudioSessionDoc,
  itemId: string,
): SessionOpResult<{ actualSec?: number }> {
  const next = cloneDoc(session)
  const item = next.rundown.find((entry) => entry.id === itemId)
  if (!item || item.status !== 'playing') return { ok: false, session, error: 'not-playing' }
  item.actualSec = next.elapsedSec - (item.startedAtElapsedSec ?? next.elapsedSec)
  item.status = 'done'
  slog(next, 'segment-complete', 'info', { itemId, actualSec: item.actualSec })
  return { ok: true, session: next, actualSec: item.actualSec }
}

export function skipSegment(session: StudioSessionDoc, itemId: string): SessionOpResult {
  const next = cloneDoc(session)
  const item = next.rundown.find((entry) => entry.id === itemId)
  if (!item || (item.status !== 'pending' && item.status !== 'playing')) {
    return { ok: false, session, error: 'not-skippable' }
  }
  if (item.status === 'playing') {
    item.actualSec = next.elapsedSec - (item.startedAtElapsedSec ?? next.elapsedSec)
  }
  item.status = 'skipped'
  slog(next, 'segment-skip', 'info', { itemId, actualSec: item.actualSec })
  return { ok: true, session: next }
}

export type TimingRollup = {
  plannedTotalSec: number
  donePlannedSec: number
  doneActualSec: number
  varianceSec: number
  elapsedSec: number
  projectedTotalSec: number
  counts: { done: number; playing: number; pending: number; skipped: number }
}

/** PT-E timing rollup: planned vs elapsed with variance, ported exactly. */
export function timingRollup(session: StudioSessionDoc): TimingRollup {
  const plannedTotalSec = session.rundown.reduce((sum, item) => sum + item.plannedSec, 0)
  const done = session.rundown.filter((item) => item.status === 'done')
  const donePlannedSec = done.reduce((sum, item) => sum + item.plannedSec, 0)
  const doneActualSec = done.reduce((sum, item) => sum + (item.actualSec ?? 0), 0)
  const playing = session.rundown.filter((item) => item.status === 'playing')
  const playingPlannedSec = playing.reduce((sum, item) => sum + item.plannedSec, 0)
  const remainingPlannedSec = plannedTotalSec - donePlannedSec - playingPlannedSec
  return {
    plannedTotalSec,
    donePlannedSec,
    doneActualSec,
    varianceSec: doneActualSec - donePlannedSec,
    elapsedSec: session.elapsedSec,
    projectedTotalSec: doneActualSec + remainingPlannedSec + playingPlannedSec,
    counts: {
      done: done.length,
      playing: playing.length,
      pending: session.rundown.filter((item) => item.status === 'pending').length,
      skipped: session.rundown.filter((item) => item.status === 'skipped').length,
    },
  }
}

// ---------------------------------------------------------------------------
// Cartwall (PT-E armed-fire discipline + POD-05 deck ops)
// ---------------------------------------------------------------------------

export const findClip = (
  session: StudioSessionDoc,
  clipId: string,
): { bankId: string; clip: StudioCartClip } | null => {
  for (const bank of session.cartwall.banks) {
    const clip = bank.clips.find((entry) => entry.id === clipId)
    if (clip) return { bankId: bank.id, clip }
  }
  return null
}

export function addBank(
  session: StudioSessionDoc,
  input: { id?: string; name: string },
): SessionOpResult<{ bankId: string }> {
  const next = cloneDoc(session)
  const bank = { id: input.id ?? newId('bank'), name: input.name, clips: [] as StudioCartClip[] }
  next.cartwall.banks.push(bank)
  slog(next, 'bank-add', 'info', { bankId: bank.id })
  return { ok: true, session: validateSessionDoc(next), bankId: bank.id }
}

export function addClip(
  session: StudioSessionDoc,
  bankId: string,
  clip: Partial<StudioCartClip> & { title: string },
): SessionOpResult<{ clipId?: string }> {
  const next = cloneDoc(session)
  const bank = next.cartwall.banks.find((entry) => entry.id === bankId)
  if (!bank) return { ok: false, session, error: 'no-such-bank' }
  const full: StudioCartClip = {
    id: clip.id ?? newId('cart'),
    title: clip.title,
    cueInSec: clip.cueInSec ?? 0,
    cueOutSec: clip.cueOutSec ?? 0,
    fadeInSec: clip.fadeInSec ?? 0,
    fadeOutSec: clip.fadeOutSec ?? 0,
    loop: clip.loop ?? false,
    armed: clip.armed ?? false,
    state: clip.state ?? 'idle',
  }
  bank.clips.push(full)
  slog(next, 'clip-add', 'info', { bankId, clipId: full.id })
  return { ok: true, session: validateSessionDoc(next), clipId: full.id }
}

export function removeClip(session: StudioSessionDoc, clipId: string): SessionOpResult {
  const next = cloneDoc(session)
  for (const bank of next.cartwall.banks) {
    const index = bank.clips.findIndex((clip) => clip.id === clipId)
    if (index >= 0) {
      bank.clips.splice(index, 1)
      slog(next, 'clip-remove', 'info', { bankId: bank.id, clipId })
      return { ok: true, session: next }
    }
  }
  return { ok: false, session, error: 'no-such-clip' }
}

export function setClipCue(
  session: StudioSessionDoc,
  clipId: string,
  cue: Partial<
    Pick<StudioCartClip, 'cueInSec' | 'cueOutSec' | 'fadeInSec' | 'fadeOutSec' | 'loop'>
  >,
): SessionOpResult {
  const next = cloneDoc(session)
  const found = findClip(next, clipId)
  if (!found) return { ok: false, session, error: 'no-such-clip' }
  Object.assign(found.clip, cue)
  slog(next, 'clip-cue', 'info', { clipId, ...cue })
  return { ok: true, session: validateSessionDoc(next) }
}

export function armCue(session: StudioSessionDoc, clipId: string): SessionOpResult {
  const next = cloneDoc(session)
  const found = findClip(next, clipId)
  if (!found) return { ok: false, session, error: 'no-such-clip' }
  found.clip.armed = true
  slog(next, 'cue-arm', 'info', { clipId })
  return { ok: true, session: next }
}

export function disarmCue(session: StudioSessionDoc, clipId: string): SessionOpResult {
  const next = cloneDoc(session)
  const found = findClip(next, clipId)
  if (!found) return { ok: false, session, error: 'no-such-clip' }
  found.clip.armed = false
  slog(next, 'cue-disarm', 'info', { clipId })
  return { ok: true, session: next }
}

/**
 * Fires a clip. PT-E discipline: an unarmed fire is REJECTED and
 * LOGGED (the returned session carries the rejection entry); firing
 * consumes the arm.
 */
export function fireCue(session: StudioSessionDoc, clipId: string): SessionOpResult {
  const next = cloneDoc(session)
  const found = findClip(next, clipId)
  if (!found) return { ok: false, session, error: 'no-such-clip' }
  if (!found.clip.armed) {
    slog(next, 'cue-fire-rejected', 'error', { clipId, reason: 'not-armed' })
    return { ok: false, session: next, error: 'not-armed' }
  }
  found.clip.armed = false
  found.clip.state = 'playing'
  slog(next, 'cue-fire', 'info', { clipId })
  return { ok: true, session: next }
}

export function stopCue(session: StudioSessionDoc, clipId: string): SessionOpResult {
  const next = cloneDoc(session)
  const found = findClip(next, clipId)
  if (!found) return { ok: false, session, error: 'no-such-clip' }
  found.clip.state = 'idle'
  slog(next, 'cue-stop', 'info', { clipId })
  return { ok: true, session: next }
}

/** Marks a clip played (the played-dimming state the cartwall UI renders). */
export function finishClip(session: StudioSessionDoc, clipId: string): SessionOpResult {
  const next = cloneDoc(session)
  const found = findClip(next, clipId)
  if (!found) return { ok: false, session, error: 'no-such-clip' }
  found.clip.state = 'played'
  slog(next, 'clip-played', 'info', { clipId })
  return { ok: true, session: next }
}

/** STOP ALL: every clip on every bank returns to idle; the event is logged. */
export function stopAll(session: StudioSessionDoc): StudioSessionDoc {
  const next = cloneDoc(session)
  let stopped = 0
  for (const bank of next.cartwall.banks) {
    for (const clip of bank.clips) {
      if (clip.state !== 'idle') stopped += 1
      clip.state = 'idle'
    }
  }
  slog(next, 'stop-all', 'warn', { stoppedClips: stopped })
  return next
}

/** Exports one bank (a deck) as JSON — the cartwall share format. */
export function shareDeck(
  session: StudioSessionDoc,
  bankId: string,
): { ok: boolean; deckJson?: string; error?: string } {
  const bank = session.cartwall.banks.find((entry) => entry.id === bankId)
  if (!bank) return { ok: false, error: 'no-such-bank' }
  return { ok: true, deckJson: JSON.stringify(bank, null, 2) }
}

/**
 * Resets a deck to a pristine state (every clip idle + unarmed),
 * retaining a backup copy of the pre-reset clips in the session
 * document (`deckBackups[bankId]`) for restoreBank.
 */
export function resetBank(session: StudioSessionDoc, bankId: string): SessionOpResult {
  const next = cloneDoc(session)
  const bank = next.cartwall.banks.find((entry) => entry.id === bankId)
  if (!bank) return { ok: false, session, error: 'no-such-bank' }
  next.deckBackups = {
    ...(next.deckBackups ?? {}),
    [bankId]: JSON.parse(JSON.stringify(bank.clips)) as StudioCartClip[],
  }
  for (const clip of bank.clips) {
    clip.state = 'idle'
    clip.armed = false
  }
  slog(next, 'bank-reset', 'warn', { bankId, backedUpClips: bank.clips.length })
  return { ok: true, session: next }
}

/** Restores a deck from the backup retained by resetBank. */
export function restoreBank(session: StudioSessionDoc, bankId: string): SessionOpResult {
  const next = cloneDoc(session)
  const bank = next.cartwall.banks.find((entry) => entry.id === bankId)
  if (!bank) return { ok: false, session, error: 'no-such-bank' }
  const backup = next.deckBackups?.[bankId]
  if (!backup) return { ok: false, session, error: 'no-backup' }
  bank.clips = JSON.parse(JSON.stringify(backup)) as StudioCartClip[]
  slog(next, 'bank-restore', 'info', { bankId, restoredClips: bank.clips.length })
  return { ok: true, session: validateSessionDoc(next) }
}

// ---------------------------------------------------------------------------
// Mixer snapshot (state only)
// ---------------------------------------------------------------------------

export function setMixerSnapshot(
  session: StudioSessionDoc,
  mixer: StudioMixerSnapshot,
): SessionOpResult {
  const next = cloneDoc(session)
  next.mixer = JSON.parse(JSON.stringify(mixer)) as StudioMixerSnapshot
  slog(next, 'mixer-snapshot', 'info', {
    channels: mixer.channels.length,
    masterGainDb: mixer.masterGainDb,
    limiterCeilingDb: mixer.limiterCeilingDb,
  })
  return { ok: true, session: validateSessionDoc(next) }
}

export const getMixerSnapshot = (session: StudioSessionDoc): StudioMixerSnapshot => session.mixer
