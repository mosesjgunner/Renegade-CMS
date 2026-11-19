/**
 * POD-14 — chapter management core (PURE). The canonical episode
 * chapter list (POD-01) is `{ startTime, title, url?, image? }` json on
 * podcast-episodes; the feed's chapters.json route, the Podcasting
 * 2.0 `podcast:chapters` tag and the POD-13 MP3 ID3 CHAP frames all
 * read that one list. This module is the management surface over it:
 *
 * - finalize chapters from POD-12 EDL markers and the POD-08
 *   played-clip log (promotion, POD-12's `chaptersFromMarkers` is the
 *   EDL-side equivalent; this is the episode-side one),
 * - edit / reorder / add / remove with validation (sorted, unique
 *   starts, non-empty titles, optional per-chapter artwork as a media
 *   asset id carried in the canonical `image` field the chapters
 *   route already renders as `img`),
 * - serialize to the Podcast JSON chapters document exactly as the
 *   chapters.json route serves it, and verify feed/MP3 consistency
 *   by comparing start/title pairs (the POD-13 agreement property).
 */

export type ManagedChapter = {
  startTime: number
  title: string
  url?: string
  /** Per-chapter artwork: a media-asset id (canonical `image` field). */
  image?: string
}

export class ChapterError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ChapterError'
    this.code = code
  }
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

type RawChapter = Record<string, unknown>

/** Tolerant reader for the stored canonical list (POD-01 shape family). */
export const readCanonicalChapters = (raw: unknown): ManagedChapter[] => {
  if (!Array.isArray(raw)) return []
  const chapters: ManagedChapter[] = []
  for (const entry of raw as RawChapter[]) {
    if (!entry || typeof entry !== 'object') continue
    const start = Number(entry.startTime ?? entry.startSeconds ?? entry.start ?? Number.NaN)
    if (!Number.isFinite(start)) continue
    const image =
      typeof entry.image === 'string'
        ? entry.image
        : typeof (entry.image as RawChapter)?.id === 'string'
          ? String((entry.image as RawChapter).id)
          : typeof entry.img === 'string'
            ? entry.img
            : undefined
    chapters.push({
      startTime: round3(Math.max(0, start)),
      title: String(entry.title ?? ''),
      ...(typeof entry.url === 'string' && entry.url ? { url: entry.url } : {}),
      ...(image ? { image } : {}),
    })
  }
  return chapters
}

/**
 * Normalizes a chapter list: sorts by start, merges duplicate starts
 * (the later entry wins the title/artwork), drops untitled entries,
 * and clamps starts into [0, durationSec] when a duration is known.
 */
export const normalizeChapters = (
  chapters: readonly ManagedChapter[],
  opts: { durationSec?: number } = {},
): ManagedChapter[] => {
  const byStart = new Map<number, ManagedChapter>()
  for (const chapter of chapters) {
    const title = String(chapter.title ?? '').trim()
    if (!title) continue
    let start = round3(Math.max(0, Number(chapter.startTime) || 0))
    if (opts.durationSec !== undefined) start = Math.min(start, round3(opts.durationSec))
    byStart.set(start, {
      startTime: start,
      title,
      ...(chapter.url ? { url: chapter.url } : {}),
      ...(chapter.image ? { image: chapter.image } : {}),
    })
  }
  return [...byStart.values()].sort((a, b) => a.startTime - b.startTime)
}

export type ChapterMarkerInput = {
  start: number
  title?: string
  label?: string
  type?: string
}

export type PlayedLogEntryInput = {
  /** POD-08 played-clip log entry: start time on the session clock. */
  startedAtSec?: number
  startSec?: number
  start?: number
  title?: string
  label?: string
  clipTitle?: string
}

/**
 * Finalizes a chapter list from POD-12 markers + the POD-08
 * played-clip log over any existing chapters: existing entries win at
 * the same start; markers and played items promote to chapters with
 * their recorded titles (auto "Chapter N" only when a source carries
 * no title at all — the POD-09 marker model).
 */
export const finalizeChapters = (input: {
  existing?: readonly ManagedChapter[]
  markers?: readonly ChapterMarkerInput[]
  playedLog?: readonly PlayedLogEntryInput[]
  durationSec?: number
}): ManagedChapter[] => {
  const promoted: ManagedChapter[] = []
  // Promotions past the end of the episode are bad data (a chapter at
  // exactly the duration is meaningless), so they are dropped here;
  // clamping applies only to the stored canonical list in normalize.
  const inRange = (start: number) => input.durationSec === undefined || start <= input.durationSec
  for (const marker of input.markers ?? []) {
    const start = Number(marker.start)
    if (!Number.isFinite(start) || !inRange(start)) continue
    promoted.push({
      startTime: round3(start),
      title: marker.title ?? marker.label ?? '',
    })
  }
  for (const entry of input.playedLog ?? []) {
    const start = Number(entry.startedAtSec ?? entry.startSec ?? entry.start ?? Number.NaN)
    if (!Number.isFinite(start) || !inRange(start)) continue
    promoted.push({
      startTime: round3(start),
      title: entry.title ?? entry.label ?? entry.clipTitle ?? '',
    })
  }
  const titled = normalizeChapters([...promoted, ...(input.existing ?? [])], {
    durationSec: input.durationSec,
  })
  const taken = new Set(titled.map((chapter) => chapter.startTime))
  const untitledStarts = [
    ...new Set(
      promoted
        .filter((chapter) => !chapter.title)
        .map((chapter) => chapter.startTime)
        .filter((start) => !taken.has(start)),
    ),
  ]
  const withUntitled = normalizeChapters(
    [...titled, ...untitledStarts.map((startTime) => ({ startTime, title: 'Chapter' }))],
    { durationSec: input.durationSec },
  )
  // Auto-number only the entries that arrived untitled (POD-09 model).
  const untitled = new Set(untitledStarts)
  return withUntitled.map((chapter, index) =>
    untitled.has(chapter.startTime) && chapter.title === 'Chapter'
      ? { ...chapter, title: `Chapter ${index + 1}` }
      : chapter,
  )
}

export type ChapterEdit =
  | { op: 'add'; chapter: ManagedChapter }
  | { op: 'remove'; startTime: number }
  | {
      op: 'update'
      startTime: number
      patch: Partial<Omit<ManagedChapter, 'startTime'>>
    }
  | { op: 'move'; startTime: number; toStartTime: number }
  | { op: 'set-artwork'; startTime: number; imageAssetId: string | null }

/** Applies management edits, then re-normalizes (order follows time). */
export const applyChapterEdits = (
  chapters: readonly ManagedChapter[],
  edits: readonly ChapterEdit[],
  opts: { durationSec?: number } = {},
): ManagedChapter[] => {
  let list = normalizeChapters(chapters, opts)
  for (const edit of edits) {
    if (edit.op === 'add') {
      list = normalizeChapters([...list, edit.chapter], opts)
      continue
    }
    const index = list.findIndex((chapter) => Math.abs(chapter.startTime - edit.startTime) < 0.0005)
    if (index < 0)
      throw new ChapterError('CHAPTER_NOT_FOUND', `No chapter starts at ${edit.startTime}s.`)
    if (edit.op === 'remove') list = list.filter((_, i) => i !== index)
    else if (edit.op === 'update')
      list = normalizeChapters(
        list.map((chapter, i) => (i === index ? { ...chapter, ...edit.patch } : chapter)),
        opts,
      )
    else if (edit.op === 'move')
      list = normalizeChapters(
        list.map((chapter, i) =>
          i === index ? { ...chapter, startTime: edit.toStartTime } : chapter,
        ),
        opts,
      )
    else if (edit.op === 'set-artwork')
      list = normalizeChapters(
        list.map((chapter, i) => {
          if (i !== index) return chapter
          const next = { ...chapter }
          if (edit.imageAssetId) next.image = edit.imageAssetId
          else delete next.image
          return next
        }),
        opts,
      )
  }
  return list
}

/**
 * The Podcast JSON chapters document (version 1.2.0) exactly as the
 * episode chapters.json route serves it: `{ title, startTime, url?,
 * img? }` where `img` is the artwork media URL the caller builds from
 * the chapter's artwork asset id.
 */
export const chaptersToFeedJson = (
  chapters: readonly ManagedChapter[],
  artworkUrl?: (imageAssetId: string) => string,
) => ({
  version: '1.2.0',
  chapters: normalizeChapters(chapters).map((chapter) => ({
    title: chapter.title,
    startTime: chapter.startTime,
    ...(chapter.url ? { url: chapter.url } : {}),
    ...(chapter.image && artworkUrl ? { img: artworkUrl(chapter.image) } : {}),
  })),
})

/** Chapters → POD-13's PodcastChapter pairs (the ID3/sidecar shape). */
export const chaptersToPodcastPairs = (chapters: readonly ManagedChapter[]) =>
  normalizeChapters(chapters).map((chapter) => ({
    startTime: chapter.startTime,
    title: chapter.title,
  }))

/**
 * The POD-01/POD-13 agreement check: two chapter sources (episode
 * canonical list vs feed JSON vs ID3 pairs) agree when their
 * (startTime, title) pairs are identical in order.
 */
export const chapterPairsAgree = (
  a: readonly { startTime: number; title: string }[],
  b: readonly { startTime: number; title: string }[],
): boolean =>
  a.length === b.length &&
  a.every(
    (chapter, index) =>
      Math.abs(chapter.startTime - Number(b[index].startTime)) < 0.0005 &&
      chapter.title === b[index].title,
  )
