/**
 * POD-14 — public listener player model (PURE). The logic behind
 * PodcastPlayer.tsx: share-at-timestamp links (`?t=` produced and
 * consumed; the legacy `#t=` form is still consumed), chapter
 * navigation, transcript-synced highlight, and the sleep timer.
 * Kept pure so every behaviour is unit-testable without a browser.
 */

export type PlayerChapter = { startTime: number; title?: string }
export type PlayerSegment = { startSeconds: number; endSeconds?: number }

/** Parses "83", "83.5", "1:23", "1:02:03" and "1h2m3s" timestamp forms. */
export const parseTimestampValue = (raw: string | null | undefined): number | null => {
  if (!raw) return null
  const value = raw.trim()
  if (!value) return null
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value)
  const colon = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/)
  if (colon) return Number(colon[1] ?? 0) * 3600 + Number(colon[2]) * 60 + Number(colon[3])
  const units = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/)
  if (units && (units[1] || units[2] || units[3]))
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0)
  return null
}

/**
 * Reads a share timestamp from a URL's `?t=` query parameter first,
 * then the legacy `#t=` hash form. Returns null when absent/invalid.
 */
export const parseShareTimestamp = (input: {
  search?: string | null
  hash?: string | null
}): number | null => {
  if (input.search) {
    const params = new URLSearchParams(
      input.search.startsWith('?') ? input.search.slice(1) : input.search,
    )
    const fromQuery = parseTimestampValue(params.get('t'))
    if (fromQuery !== null) return fromQuery
  }
  if (input.hash) {
    const hash = input.hash.startsWith('#') ? input.hash.slice(1) : input.hash
    if (hash.startsWith('t=')) return parseTimestampValue(hash.slice(2))
  }
  return null
}

/** Produces the canonical share link: `?t=<whole seconds>`, hash cleared. */
export const buildShareUrl = (href: string, seconds: number): string => {
  const url = new URL(href)
  url.searchParams.set('t', String(Math.max(0, Math.floor(seconds))))
  url.hash = ''
  return url.toString()
}

/** Index of the chapter active at `time` (last chapter whose start ≤ time). */
export const activeChapterIndexAt = (chapters: readonly PlayerChapter[], time: number): number => {
  let active = -1
  chapters.forEach((chapter, index) => {
    if (time >= chapter.startTime) active = index
  })
  return active
}

/** Index of the transcript segment active at `time`, or -1 between segments. */
export const activeSegmentIndexAt = (segments: readonly PlayerSegment[], time: number): number => {
  for (let i = segments.length - 1; i >= 0; i--) {
    const start = Number(segments[i].startSeconds || 0)
    const end = segments[i].endSeconds !== undefined ? Number(segments[i].endSeconds) : Infinity
    if (time >= start && time <= end) return i
  }
  return -1
}

export const nextChapterStart = (
  chapters: readonly PlayerChapter[],
  time: number,
): number | null => {
  for (const chapter of chapters) if (chapter.startTime > time + 0.25) return chapter.startTime
  return null
}

/**
 * Previous-chapter target: more than 3 s into the current chapter →
 * its start; otherwise the previous chapter's start (or 0).
 */
export const previousChapterStart = (chapters: readonly PlayerChapter[], time: number): number => {
  const active = activeChapterIndexAt(chapters, time)
  if (active < 0) return 0
  if (time - chapters[active].startTime > 3) return chapters[active].startTime
  return active > 0 ? chapters[active - 1].startTime : 0
}

export const SLEEP_TIMER_MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const
export type SleepTimerSetting =
  | { kind: 'off' }
  | { kind: 'minutes'; minutes: number }
  | { kind: 'episode-end' }

/** Remaining seconds for a minutes-based sleep timer; 0 = expired. */
export const sleepTimerRemainingSec = (
  setting: SleepTimerSetting,
  setAtMs: number,
  nowMs: number,
): number | null => {
  if (setting.kind !== 'minutes') return null
  const remaining = setting.minutes * 60 - Math.floor((nowMs - setAtMs) / 1000)
  return Math.max(0, remaining)
}

export const sleepTimerExpired = (
  setting: SleepTimerSetting,
  setAtMs: number,
  nowMs: number,
): boolean => {
  const remaining = sleepTimerRemainingSec(setting, setAtMs, nowMs)
  return remaining !== null && remaining <= 0
}
