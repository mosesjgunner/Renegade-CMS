/**
 * POD-14 (POD-REQ-31) — post-production assists (PURE CORES).
 *
 * Every assist produces a DRAFT; nothing here touches an episode.
 * Acceptance is an explicit user action in the service layer.
 *
 * The baseline is extractive and needs NO AI key: chapter suggestions
 * come from POD-12 markers + the POD-08 played-clip log + transcript
 * segment gaps; show-note/summary drafts are templated extracts of
 * the reviewed transcript; highlights are marked ranges first, then
 * the longest substantive segments. When an operator has configured
 * the CMS AI seam, a `TextAssistEnhancer` may rewrite a baseline
 * draft — the enhancer is an injected seam (the gateway is chat-only
 * and config-bound, so the service wires it only when configured);
 * an enhancer failure falls back to the baseline and says so in the
 * draft's `enhancedBy`/`enhancerError` fields. Tests run the baseline
 * (no AI key anywhere) plus a fake enhancer for the seam.
 */
import { finalizeChapters, normalizeChapters, type ManagedChapter } from './chapters'
import type { TimedSegment } from './transcription'

export type AssistKind = 'chapters' | 'show-notes' | 'summary' | 'highlight' | 'audiogram'

export type ChapterSuggestion = ManagedChapter & { source: string }

export type HighlightClip = {
  startSec: number
  endSec: number
  label: string
  text: string
  source: 'marked-range' | 'longest-segment'
}

export type TextAssistEnhancer = {
  id: string
  enhance: (input: {
    kind: AssistKind
    baseline: string
    context: { episodeTitle: string; transcriptText: string }
  }) => Promise<string>
}

const round3 = (value: number) => Math.round(value * 1000) / 1000
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean)
const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

const chapterTitleFromSegment = (segment: TimedSegment | undefined, fallback: string) => {
  if (!segment) return fallback
  const firstSentence = segment.text.split(/(?<=[.!?])\s/)[0] ?? segment.text
  return truncate(firstSentence.replace(/\s+/g, ' ').trim(), 60) || fallback
}

/**
 * Chapter suggestions: marker/played-log boundaries first (finalized
 * through the chapter-management core), then transcript gaps — a new
 * chapter is suggested where a segment starts after a silence gap of
 * at least `minGapSec` and at least `minSpacingSec` after the
 * previous chapter. Titles come from the segment at the boundary.
 */
export const suggestChapters = (input: {
  segments: readonly TimedSegment[]
  markers?: readonly { start: number; title?: string; label?: string; type?: string }[]
  playedLog?: readonly Record<string, unknown>[]
  durationSec?: number
  minGapSec?: number
  minSpacingSec?: number
}): ChapterSuggestion[] => {
  const minGapSec = input.minGapSec ?? 20
  const minSpacingSec = input.minSpacingSec ?? 30
  const base = finalizeChapters({
    markers: input.markers,
    playedLog: input.playedLog as never,
    durationSec: input.durationSec,
  })
  const suggestions: ChapterSuggestion[] = base.map((chapter) => ({
    ...chapter,
    source: 'marker-or-played-log',
  }))
  const taken = [...suggestions.map((chapter) => chapter.startTime)].sort((a, b) => a - b)
  const segmentAt = (time: number) =>
    input.segments.find(
      (segment) =>
        time >= segment.startSeconds && time < Math.max(segment.endSeconds, time + 0.001),
    ) ?? input.segments.find((segment) => segment.startSeconds >= time)

  if (input.segments.length && !taken.some((start) => start <= 0.001)) {
    suggestions.push({
      startTime: 0,
      title: chapterTitleFromSegment(input.segments[0], 'Introduction'),
      source: 'transcript-start',
    })
    taken.unshift(0)
  }
  for (let i = 1; i < input.segments.length; i++) {
    const gap = input.segments[i].startSeconds - input.segments[i - 1].endSeconds
    if (gap < minGapSec) continue
    const start = round3(input.segments[i].startSeconds)
    if (taken.some((existing) => Math.abs(existing - start) < minSpacingSec)) continue
    suggestions.push({
      startTime: start,
      title: chapterTitleFromSegment(input.segments[i], `Chapter ${suggestions.length + 1}`),
      source: 'transcript-gap',
    })
    taken.push(start)
    taken.sort((a, b) => a - b)
  }
  void segmentAt
  return normalizeChapters(suggestions)
    .map((chapter) => {
      const match = suggestions.find(
        (suggestion) => Math.abs(suggestion.startTime - chapter.startTime) < 0.0005,
      )
      return { ...chapter, source: match?.source ?? 'transcript-gap' }
    })
    .sort((a, b) => a.startTime - b.startTime)
}

export type ShowNotesDraft = {
  summary: string
  showNotes: string
  chapterList: { startTime: number; title: string }[]
  basis: 'extractive-baseline'
}

/** Extractive summary + templated show notes from the reviewed transcript. */
export const draftShowNotes = (input: {
  episodeTitle: string
  segments: readonly TimedSegment[]
  chapters?: readonly ManagedChapter[]
}): ShowNotesDraft => {
  const substantive = input.segments.filter((segment) => words(segment.text).length >= 4)
  const summaryParts: string[] = []
  let summaryWords = 0
  for (const segment of substantive) {
    if (summaryWords >= 60 && summaryParts.length >= 2) break
    summaryParts.push(segment.text.trim())
    summaryWords += words(segment.text).length
  }
  const summary = truncate(summaryParts.join(' '), 600)
  const chapters = normalizeChapters(input.chapters ?? [])
  const lines = [
    summary,
    '',
    chapters.length ? 'Chapters:' : '',
    ...chapters.map(
      (chapter) =>
        `- ${Math.floor(chapter.startTime / 60)}:${String(Math.floor(chapter.startTime % 60)).padStart(2, '0')} ${chapter.title}`,
    ),
    '',
    substantive.length
      ? `From the transcript: "${truncate(substantive[Math.min(1, substantive.length - 1)].text.trim(), 240)}"`
      : '',
  ]
  return {
    summary,
    showNotes: lines
      .filter((line, index) => line !== '' || index < 2)
      .join('\n')
      .trim(),
    chapterList: chapters.map((chapter) => ({
      startTime: chapter.startTime,
      title: chapter.title,
    })),
    basis: 'extractive-baseline',
  }
}

/**
 * Highlight/quote extraction: marked ranges (markers typed
 * `highlight` with an end, or explicit ranges) first, then the
 * longest substantive segments as clip definitions for POD-13's
 * clip/audiogram profiles.
 */
export const extractHighlights = (input: {
  segments: readonly TimedSegment[]
  markedRanges?: readonly { startSec: number; endSec: number; label?: string }[]
  maxHighlights?: number
}): HighlightClip[] => {
  const max = input.maxHighlights ?? 3
  const clips: HighlightClip[] = []
  for (const range of input.markedRanges ?? []) {
    if (!(range.endSec > range.startSec)) continue
    const text = input.segments
      .filter(
        (segment) => segment.endSeconds > range.startSec && segment.startSeconds < range.endSec,
      )
      .map((segment) => segment.text)
      .join(' ')
    clips.push({
      startSec: round3(range.startSec),
      endSec: round3(range.endSec),
      label: range.label ?? 'Marked highlight',
      text: truncate(text, 280),
      source: 'marked-range',
    })
  }
  const byLength = [...input.segments]
    .filter((segment) => words(segment.text).length >= 8)
    .sort((a, b) => words(b.text).length - words(a.text).length)
  for (const segment of byLength) {
    if (clips.length >= max) break
    if (
      clips.some((clip) => segment.startSeconds < clip.endSec && segment.endSeconds > clip.startSec)
    )
      continue
    clips.push({
      startSec: segment.startSeconds,
      endSec: segment.endSeconds,
      label: truncate(segment.text, 48),
      text: segment.text,
      source: 'longest-segment',
    })
  }
  return clips.sort((a, b) => a.startSec - b.startSec)
}

/** Runs an optional AI-seam enhancer over a text baseline, honestly labelled. */
export const maybeEnhance = async (
  enhancer: TextAssistEnhancer | null | undefined,
  input: {
    kind: AssistKind
    baseline: string
    context: { episodeTitle: string; transcriptText: string }
  },
): Promise<{ text: string; enhancedBy: string | null; enhancerError?: string }> => {
  if (!enhancer) return { text: input.baseline, enhancedBy: null }
  try {
    const text = await enhancer.enhance(input)
    if (!text.trim()) return { text: input.baseline, enhancedBy: null }
    return { text, enhancedBy: enhancer.id }
  } catch (error) {
    return {
      text: input.baseline,
      enhancedBy: null,
      enhancerError: error instanceof Error ? error.message : String(error),
    }
  }
}
