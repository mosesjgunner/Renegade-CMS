/**
 * POD-09 — Raw multitrack retention policy (PURE CORE).
 *
 * Policy as DATA, not code: a show's raw multitrack recordings are
 * retained until the episode is published, plus a grace window
 * (default 30 days) — while an episode is unpublished (or a recording
 * has no episode), its raw tracks are retained indefinitely, because
 * they are the only master that exists. A show may override the grace
 * window with `recordingRetentionDays` (podcast-shows field, POD-09).
 *
 * The cleanup task (src/modules/media/tasks.ts,
 * `podcast-recording-cleanup`) consumes `planRecordingCleanup` and is
 * DRY-RUN BY DEFAULT: it counts and logs what WOULD expire and deletes
 * nothing unless a run explicitly passes dryRun: false.
 */

export type RetentionPolicy = {
  mode: 'until-published-plus-days'
  daysAfterPublish: number
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  mode: 'until-published-plus-days',
  daysAfterPublish: 30,
}

/** Resolves the effective policy for a show document (override → default). */
export const resolveRetentionPolicy = (
  show: { recordingRetentionDays?: unknown } | null | undefined,
): RetentionPolicy => {
  const days = Number(show?.recordingRetentionDays)
  if (Number.isFinite(days) && days > 0)
    return { mode: 'until-published-plus-days', daysAfterPublish: Math.floor(days) }
  return { ...DEFAULT_RETENTION_POLICY }
}

/**
 * The instant a recording's raw tracks become eligible for cleanup, or
 * null when they must be retained: no episode, an unpublished episode,
 * or a published episode with no trustworthy publishedAt all retain.
 */
export const computeRetainUntil = (
  policy: RetentionPolicy,
  episode: { productionState?: unknown; publishedAt?: unknown } | null | undefined,
): string | null => {
  if (!episode) return null
  if (episode.productionState !== 'published') return null
  const publishedAt = episode.publishedAt ? new Date(String(episode.publishedAt)) : null
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return null
  return new Date(publishedAt.getTime() + policy.daysAfterPublish * 24 * 3600_000).toISOString()
}

export type CleanupCandidate = {
  id: string
  state?: string
  retainUntil?: string | null
}

export type CleanupPlan = {
  /** Recordings whose retainUntil has passed — eligible for deletion. */
  expired: CleanupCandidate[]
  /** Recordings still inside their retention window (or retained indefinitely). */
  retained: CleanupCandidate[]
  counts: { scanned: number; expired: number; retained: number }
}

/**
 * Partitions recordings by retention. Already-expired recordings are
 * not re-planned (idempotent reruns report them as retained/skipped —
 * they are terminal).
 */
export const planRecordingCleanup = (
  recordings: CleanupCandidate[],
  now: Date = new Date(),
): CleanupPlan => {
  const expired: CleanupCandidate[] = []
  const retained: CleanupCandidate[] = []
  for (const recording of recordings) {
    if (recording.state === 'expired') {
      retained.push(recording)
      continue
    }
    const retainUntil = recording.retainUntil ? new Date(String(recording.retainUntil)) : null
    if (
      retainUntil &&
      !Number.isNaN(retainUntil.getTime()) &&
      retainUntil.getTime() <= now.getTime()
    )
      expired.push(recording)
    else retained.push(recording)
  }
  return {
    expired,
    retained,
    counts: { scanned: recordings.length, expired: expired.length, retained: retained.length },
  }
}
