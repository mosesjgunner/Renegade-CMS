/**
 * POD-08 — Played-clip log (PURE CORE): the authoritative record of what
 * actually played on air during a session (tool map row 47).
 *
 * The log lives INSIDE the POD-05 session document as the preserved
 * extension field `playedClipLog` (the POD-00 session parser validates
 * known fields and preserves unknown ones verbatim, so the log survives
 * save/reload losslessly with no contract change).
 *
 * Crash-safety rule (binding): an entry is written at play START with
 * `endedAtSessionSec: null` and `outcome: 'playing'`. If the desk dies
 * mid-clip, the saved session still proves the clip started, at what
 * session time, and that it never closed. The entry is closed exactly
 * once, at play end, with outcome 'completed' (ran to its OUT point) or
 * 'stopped' (operator stop / STOP ALL / dump / cart toggle-off).
 *
 * PFL auditions are NOT logged and never dim: the log records on-air
 * plays only — it feeds POD-12's chapter list and POD-16's now-playing,
 * neither of which may learn about a private audition.
 *
 * Consumers: POD-09 (recording finalize attaches the log to the track
 * manifest), POD-12 (chapters from played items), POD-16 (now-playing).
 */

import type { StudioSessionDoc } from '../session-engine'

export type PlayedClipSource = 'player' | 'cart'

export type PlayedClipOutcome = 'playing' | 'completed' | 'stopped'

export type PlayedClipLogEntry = {
  /** Stable id: `${source}:${clipId}:${startedAtSessionSec}` — unique per play. */
  id: string
  source: PlayedClipSource
  /** The cart id or player clip id within the session. */
  clipId: string
  /** Media asset the clip resolves to, when known. */
  assetId?: string
  title: string
  startedAtSessionSec: number
  endedAtSessionSec: number | null
  outcome: PlayedClipOutcome
}

export type SessionDocWithPlayedLog = StudioSessionDoc & {
  playedClipLog?: PlayedClipLogEntry[]
}

const cloneDoc = (session: StudioSessionDoc): SessionDocWithPlayedLog =>
  JSON.parse(JSON.stringify(session)) as SessionDocWithPlayedLog

export const getPlayedClipLog = (session: StudioSessionDoc): PlayedClipLogEntry[] =>
  (session as SessionDocWithPlayedLog).playedClipLog ?? []

export const playedLogEntryId = (
  source: PlayedClipSource,
  clipId: string,
  startedAtSessionSec: number,
): string => `${source}:${clipId}:${startedAtSessionSec}`

/**
 * Opens an entry at play START. Call this BEFORE (or atomically with)
 * starting playback — the entry must exist even if nothing after it
 * ever runs. Returns the new session document plus the entry.
 */
export function beginPlayedClip(
  session: StudioSessionDoc,
  input: {
    source: PlayedClipSource
    clipId: string
    assetId?: string
    title: string
    startedAtSessionSec?: number
  },
): { session: SessionDocWithPlayedLog; entry: PlayedClipLogEntry } {
  const startedAtSessionSec = input.startedAtSessionSec ?? session.elapsedSec
  const entry: PlayedClipLogEntry = {
    id: playedLogEntryId(input.source, input.clipId, startedAtSessionSec),
    source: input.source,
    clipId: input.clipId,
    ...(input.assetId ? { assetId: input.assetId } : {}),
    title: input.title,
    startedAtSessionSec,
    endedAtSessionSec: null,
    outcome: 'playing',
  }
  const next = cloneDoc(session)
  next.playedClipLog = [...getPlayedClipLog(next), entry]
  next.log.push({
    type: 'clip-play-start',
    level: 'info',
    atElapsedSec: startedAtSessionSec,
    clipId: input.clipId,
    source: input.source,
    playedLogId: entry.id,
  })
  return { session: next, entry }
}

/**
 * Closes the open entry for a clip (the most recent 'playing' entry with
 * that source+clipId). Closing an already-closed or unknown clip is a
 * no-op that reports `closed: false` — a close can never rewrite history.
 */
export function closePlayedClip(
  session: StudioSessionDoc,
  input: {
    source: PlayedClipSource
    clipId: string
    outcome: Exclude<PlayedClipOutcome, 'playing'>
    endedAtSessionSec?: number
  },
): { session: SessionDocWithPlayedLog; closed: boolean } {
  const next = cloneDoc(session)
  const log = getPlayedClipLog(next)
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i]
    if (
      entry.source === input.source &&
      entry.clipId === input.clipId &&
      entry.outcome === 'playing'
    ) {
      entry.endedAtSessionSec = input.endedAtSessionSec ?? next.elapsedSec
      entry.outcome = input.outcome
      next.log.push({
        type: 'clip-play-end',
        level: 'info',
        atElapsedSec: entry.endedAtSessionSec,
        clipId: input.clipId,
        source: input.source,
        playedLogId: entry.id,
        outcome: input.outcome,
      })
      return { session: next, closed: true }
    }
  }
  return { session: next, closed: false }
}

/** Entries still open (started, never closed) — the crash residue view. */
export const openPlayedClips = (session: StudioSessionDoc): PlayedClipLogEntry[] =>
  getPlayedClipLog(session).filter((entry) => entry.outcome === 'playing')
