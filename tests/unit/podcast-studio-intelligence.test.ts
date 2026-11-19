/**
 * POD-14 (POD-REQ-30, POD-REQ-31) — intelligence cores (no Payload):
 *
 * - Transcription providers: fixture (deterministic, speakers are
 *   diarization placeholders), command (sovereign local ASR seam:
 *   unconfigured → named failure; bogus binary → named failure; a
 *   fake ASR binary → parsed segments), HTTP (BYO adapter shape via
 *   a fake fetch).
 * - Transcript serialisation: SRT / VTT / JSON round-trips; word
 *   timing preserved when present, never fabricated when absent.
 * - Segment editing: text/speaker edits, split at a supplied time,
 *   merge of adjacent segments.
 * - Chapter management: finalize from POD-12 markers + POD-08
 *   played log, edit/reorder/artwork ops, feed-JSON agreement with
 *   the canonical list and the POD-13 pair shape.
 * - Assists (no-AI baseline): chapter suggestions from markers +
 *   segment gaps, extractive show notes/summary, highlights from
 *   marked ranges + longest segments; the enhancer seam (fake
 *   enhancer applied; failing enhancer falls back, labelled).
 * - Player model: ?t= share links produced/consumed (legacy #t=
 *   still consumed), chapter navigation, highlight-at-time, sleep
 *   timer math.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  applyChapterEdits,
  chapterPairsAgree,
  chaptersToFeedJson,
  chaptersToPodcastPairs,
  finalizeChapters,
  normalizeChapters,
  readCanonicalChapters,
} from '../../src/modules/podcast-studio/intelligence/chapters'
import {
  draftShowNotes,
  extractHighlights,
  maybeEnhance,
  suggestChapters,
} from '../../src/modules/podcast-studio/intelligence/assists'
import {
  TranscriptionError,
  createCommandTranscriptionProvider,
  createHttpTranscriptionProvider,
  editSegmentText,
  fixtureTranscriptionProvider,
  mergeSegments,
  parseSrt,
  parseTranscriptJson,
  parseVtt,
  resolveTranscriptionProvider,
  segmentsToClipSrt,
  segmentsToSrt,
  segmentsToTranscriptJson,
  segmentsToVtt,
  setSegmentSpeaker,
  splitSegment,
  type TimedSegment,
} from '../../src/modules/podcast-studio/intelligence/transcription'
import {
  activeChapterIndexAt,
  activeSegmentIndexAt,
  buildShareUrl,
  nextChapterStart,
  parseShareTimestamp,
  parseTimestampValue,
  previousChapterStart,
  sleepTimerExpired,
  sleepTimerRemainingSec,
} from '../../src/modules/media/podcast-player-model'
import { buildRenderGraph } from '../../src/modules/podcast-studio/render/render'
import type { EditEdl } from '../../src/modules/podcast-studio/edit/edl-engine'
import fixture from '../fixtures/podcast-studio/edl-pt-c.json'

const segments: TimedSegment[] = [
  {
    id: 'seg-1',
    startSeconds: 0,
    endSeconds: 4,
    text: 'Welcome back to the show everyone.',
    speaker: 'Speaker 1',
  },
  {
    id: 'seg-2',
    startSeconds: 4,
    endSeconds: 8,
    text: 'Today we are talking about owning your own media and your own audience.',
    speaker: 'Speaker 2',
  },
  {
    id: 'seg-3',
    startSeconds: 40,
    endSeconds: 46,
    text: 'After the break we return with the main story about sovereign publishing tools.',
    speaker: 'Speaker 1',
  },
  {
    id: 'seg-4',
    startSeconds: 46,
    endSeconds: 50,
    text: 'Thanks for listening.',
    speaker: 'Speaker 2',
  },
]

describe('POD-14 transcription providers', () => {
  it('fixture provider derives deterministic canned segments from duration with placeholder speakers', async () => {
    const first = await fixtureTranscriptionProvider.transcribe({ durationSec: 10 })
    const second = await fixtureTranscriptionProvider.transcribe({ durationSec: 10 })
    expect(first.segments).toEqual(second.segments)
    expect(first.segments).toHaveLength(3)
    expect(first.segments[0]).toMatchObject({
      startSeconds: 0,
      endSeconds: 4,
      speaker: 'Speaker 1',
    })
    expect(first.segments[1].speaker).toBe('Speaker 2')
    expect(first.segments[2].endSeconds).toBe(10)
    expect(first.language).toBe('en')
    expect(fixtureTranscriptionProvider.label).toContain('NOT real transcription')
  })

  it('fixture provider refuses when no duration is known', async () => {
    await expect(fixtureTranscriptionProvider.transcribe({})).rejects.toMatchObject({
      code: 'TRANSCRIPTION_AUDIO_MISSING',
    })
  })

  it('command provider: unconfigured fails with the named reason, never silently', async () => {
    const provider = createCommandTranscriptionProvider({})
    await expect(provider.transcribe({ path: '/tmp/x.wav' })).rejects.toMatchObject({
      code: 'TRANSCRIPTION_NOT_CONFIGURED',
    })
    await expect(provider.transcribe({ path: '/tmp/x.wav' })).rejects.toThrow(
      /PODCAST_TRANSCRIPTION_COMMAND/,
    )
  })

  it('command provider: a bogus binary path fails with a named provider failure', async () => {
    const provider = createCommandTranscriptionProvider({
      command: '/nonexistent/whisper-binary-xyz',
    })
    const error = await provider.transcribe({ path: '/tmp/x.wav' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TranscriptionError)
    expect((error as TranscriptionError).code).toBe('TRANSCRIPTION_PROVIDER_FAILED')
    expect((error as TranscriptionError).message).toContain('/nonexistent/whisper-binary-xyz')
  })

  it('command provider: parses whisper-style JSON from a local ASR binary', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod14-asr-'))
    const script = path.join(dir, 'fake-asr.cjs')
    await writeFile(
      script,
      `process.stdout.write(JSON.stringify({ language: 'en', segments: [
        { start: 0, end: 2.5, text: ' Hello from the local model. ' },
        { start: 2.5, end: 5, text: 'Second line here.', speaker: 'Host' },
      ] }))`,
    )
    const provider = createCommandTranscriptionProvider({
      command: process.execPath,
      args: [script, '{input}'],
    })
    const result = await provider.transcribe({ path: '/tmp/whatever.wav' })
    expect(result.language).toBe('en')
    expect(result.segments).toHaveLength(2)
    expect(result.segments[0]).toMatchObject({
      startSeconds: 0,
      endSeconds: 2.5,
      text: 'Hello from the local model.',
    })
    expect(result.segments[0].speaker).toBeUndefined()
    expect(result.segments[1].speaker).toBe('Host')
  })

  it('HTTP provider: BYO endpoint shape via fake fetch; unconfigured fails named', async () => {
    const unconfigured = createHttpTranscriptionProvider({})
    await expect(unconfigured.transcribe({ path: '/tmp/x.wav' })).rejects.toMatchObject({
      code: 'TRANSCRIPTION_NOT_CONFIGURED',
    })

    let seenAuth = ''
    const provider = createHttpTranscriptionProvider({
      endpoint: 'https://asr.example.test/transcribe',
      apiKey: 'test-key',
      readBytes: async () => new Uint8Array([1, 2, 3]),
      fetchImpl: async (_url, init) => {
        seenAuth = String((init?.headers as Record<string, string>)?.authorization ?? '')
        return new Response(
          JSON.stringify({ language: 'en', segments: [{ start: 0, end: 3, text: 'Via HTTP.' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    })
    const result = await provider.transcribe({ path: '/tmp/x.wav', mimeType: 'audio/wav' })
    expect(seenAuth).toBe('Bearer test-key')
    expect(result.segments[0].text).toBe('Via HTTP.')
  })

  it('resolver: unknown provider id is a named configuration failure', () => {
    expect(() => resolveTranscriptionProvider({ providerId: 'nope' })).toThrow(
      /Unknown transcription provider/,
    )
    expect(resolveTranscriptionProvider({ providerId: 'fixture-provider' }).id).toBe(
      'fixture-provider',
    )
    expect(resolveTranscriptionProvider({}).id).toBe('command-provider')
  })
})

describe('POD-14 transcript serialisation + editing', () => {
  it('SRT round-trips timings and text', () => {
    const parsed = parseSrt(segmentsToSrt(segments))
    expect(parsed).toHaveLength(segments.length)
    parsed.forEach((segment, index) => {
      expect(segment.startSeconds).toBe(segments[index].startSeconds)
      expect(segment.endSeconds).toBe(segments[index].endSeconds)
      expect(segment.text).toBe(segments[index].text)
    })
  })

  it('VTT round-trips timings, text AND speakers via <v> spans', () => {
    const parsed = parseVtt(segmentsToVtt(segments))
    expect(parsed).toHaveLength(segments.length)
    parsed.forEach((segment, index) => {
      expect(segment.text).toBe(segments[index].text)
      expect(segment.speaker).toBe(segments[index].speaker)
    })
  })

  it('JSON round-trips everything, and word timing survives only when present', () => {
    const withWords: TimedSegment[] = [
      {
        id: 'seg-1',
        startSeconds: 0,
        endSeconds: 2,
        text: 'Hello world',
        words: [
          { start: 0, end: 0.9, text: 'Hello' },
          { start: 1, end: 2, text: 'world' },
        ],
      },
      { id: 'seg-2', startSeconds: 2, endSeconds: 4, text: 'No words here' },
    ]
    const parsed = parseTranscriptJson(
      JSON.parse(JSON.stringify(segmentsToTranscriptJson(withWords))),
    )
    expect(parsed[0].words).toEqual(withWords[0].words)
    expect(parsed[1].words).toBeUndefined()
    // The plain fixture segments carry no fabricated word timings.
    const plain = parseTranscriptJson(segmentsToTranscriptJson(segments))
    expect(plain.every((segment) => segment.words === undefined)).toBe(true)
  })

  it('parses foreign SRT/VTT documents (numbered cues, WEBVTT header)', () => {
    const srt = `1\n00:00:01,000 --> 00:00:03,500\nFirst line.\n\n2\n00:00:03,500 --> 00:00:05,000\nSecond line.\n`
    expect(parseSrt(srt)).toHaveLength(2)
    expect(parseSrt(srt)[1].startSeconds).toBe(3.5)
    const vtt = `WEBVTT\n\n00:01.000 --> 00:04.000\n<v Host>Spoken by the host.</v>\n`
    const parsedVtt = parseVtt(vtt)
    expect(parsedVtt[0]).toMatchObject({
      startSeconds: 1,
      speaker: 'Host',
      text: 'Spoken by the host.',
    })
  })

  it('edits text + speaker, splits at a supplied time, merges adjacent segments', () => {
    const edited = editSegmentText(segments, 'seg-1', 'A brand new opening line.')
    expect(edited[0].text).toBe('A brand new opening line.')
    const respeakered = setSegmentSpeaker(edited, 'seg-1', 'Host')
    expect(respeakered[0].speaker).toBe('Host')

    const split = splitSegment(segments, 'seg-2', 6, 'Media and audience, continued.')
    expect(split).toHaveLength(5)
    expect(split[1]).toMatchObject({ startSeconds: 4, endSeconds: 6 })
    expect(split[2]).toMatchObject({
      startSeconds: 6,
      endSeconds: 8,
      text: 'Media and audience, continued.',
    })
    expect(() => splitSegment(segments, 'seg-2', 99)).toThrow(/outside segment/)

    const merged = mergeSegments(segments, 'seg-3', 'seg-4')
    expect(merged).toHaveLength(3)
    expect(merged[2].endSeconds).toBe(50)
    expect(merged[2].text).toContain('sovereign publishing tools')
    expect(merged[2].text).toContain('Thanks for listening.')
  })
})

describe('POD-14 chapter management', () => {
  it('finalizes chapters from POD-12 markers + POD-08 played log over existing chapters', () => {
    const chapters = finalizeChapters({
      existing: [{ startTime: 40, title: 'Main story' }],
      markers: [{ start: 0, title: 'Cold open' }, { start: 12.5, label: 'Ad read' }, { start: 99 }],
      playedLog: [{ startedAtSec: 25, clipTitle: 'Sting: news sting' }],
      durationSec: 60,
    })
    expect(chapters.map((chapter) => chapter.startTime)).toEqual([0, 12.5, 25, 40])
    expect(chapters[0].title).toBe('Cold open')
    expect(chapters[2].title).toBe('Sting: news sting')
    expect(chapters[3].title).toBe('Main story')
  })

  it('untitled markers get the POD-09 auto-number title; out-of-duration promotions drop', () => {
    const chapters = finalizeChapters({
      markers: [{ start: 5 }, { start: 500 }],
      durationSec: 60,
    })
    expect(chapters).toHaveLength(1)
    expect(chapters[0]).toMatchObject({ startTime: 5, title: 'Chapter 1' })
  })

  it('edit ops: add / update / move (reorder by time) / artwork / remove', () => {
    const base = normalizeChapters([
      { startTime: 0, title: 'Intro' },
      { startTime: 30, title: 'Middle' },
      { startTime: 60, title: 'End' },
    ])
    const edited = applyChapterEdits(base, [
      { op: 'update', startTime: 30, patch: { title: 'The middle bit' } },
      { op: 'set-artwork', startTime: 30, imageAssetId: 'asset-123' },
      { op: 'move', startTime: 60, toStartTime: 45 },
      { op: 'add', chapter: { startTime: 90, title: 'Bonus' } },
      { op: 'remove', startTime: 0 },
    ])
    expect(edited.map((chapter) => chapter.title)).toEqual(['The middle bit', 'End', 'Bonus'])
    expect(edited[0]).toMatchObject({ startTime: 30, image: 'asset-123' })
    expect(edited[1].startTime).toBe(45)
    expect(() => applyChapterEdits(base, [{ op: 'remove', startTime: 123 }])).toThrow(
      /No chapter starts at/,
    )
  })

  it('feed JSON agrees with the canonical list and the POD-13 pair shape', () => {
    const canonical = readCanonicalChapters([
      { startTime: 0, title: 'Intro', image: { id: 'img-1' } },
      { startSeconds: 30, title: 'Middle', url: 'https://example.test/ref' },
    ])
    const feed = chaptersToFeedJson(canonical, (id) => `https://cdn.test/media/${id}`)
    expect(feed.version).toBe('1.2.0')
    expect(feed.chapters[0]).toMatchObject({
      title: 'Intro',
      startTime: 0,
      img: 'https://cdn.test/media/img-1',
    })
    expect(feed.chapters[1]).toMatchObject({
      title: 'Middle',
      startTime: 30,
      url: 'https://example.test/ref',
    })
    expect(chapterPairsAgree(feed.chapters, chaptersToPodcastPairs(canonical))).toBe(true)
    expect(chapterPairsAgree(feed.chapters, [{ startTime: 0, title: 'Different' }])).toBe(false)
  })
})

describe('POD-14 assists (extractive baseline, no AI key)', () => {
  it('chapter suggestions come from markers first, then transcript gaps', () => {
    const suggestions = suggestChapters({
      segments,
      markers: [{ start: 40, title: 'Main story' }],
      durationSec: 50,
    })
    expect(suggestions[0]).toMatchObject({ startTime: 0, source: 'transcript-start' })
    const mainStory = suggestions.find((chapter) => chapter.startTime === 40)
    expect(mainStory).toMatchObject({ title: 'Main story', source: 'marker-or-played-log' })
    // The 32 s silence gap before seg-3 does not double-suggest at 40 (marker wins the spacing).
    expect(suggestions.filter((chapter) => chapter.startTime === 40)).toHaveLength(1)
  })

  it('show-note + summary drafts are extractive and carry the chapter list', () => {
    const notes = draftShowNotes({
      episodeTitle: 'Ep',
      segments,
      chapters: [
        { startTime: 0, title: 'Intro' },
        { startTime: 40, title: 'Main story' },
      ],
    })
    expect(notes.basis).toBe('extractive-baseline')
    expect(notes.summary).toContain('Welcome back')
    expect(notes.showNotes).toContain('0:00 Intro')
    expect(notes.showNotes).toContain('0:40 Main story')
    expect(notes.chapterList).toHaveLength(2)
  })

  it('highlights: marked ranges first, then longest substantive segments, no overlaps', () => {
    const highlights = extractHighlights({
      segments,
      markedRanges: [{ startSec: 40, endSec: 46, label: 'The quote' }],
    })
    // Returned in timeline order; the marked range is present and first-class.
    const marked = highlights.find((clip) => clip.source === 'marked-range')
    expect(marked).toMatchObject({ startSec: 40, endSec: 46, label: 'The quote' })
    expect(marked!.text).toContain('sovereign publishing')
    const rest = highlights.filter((clip) => clip.source !== 'marked-range')
    expect(rest.every((clip) => clip.source === 'longest-segment')).toBe(true)
    expect(rest.some((clip) => clip.startSec === 4)).toBe(true)
  })

  it('enhancer seam: applied when configured, labelled fallback when it fails, baseline when absent', async () => {
    const context = { episodeTitle: 'Ep', transcriptText: 'words' }
    const absent = await maybeEnhance(null, { kind: 'summary', baseline: 'base', context })
    expect(absent).toEqual({ text: 'base', enhancedBy: null })
    const applied = await maybeEnhance(
      { id: 'fake-ai', enhance: async () => 'enhanced text' },
      { kind: 'summary', baseline: 'base', context },
    )
    expect(applied).toEqual({ text: 'enhanced text', enhancedBy: 'fake-ai' })
    const failed = await maybeEnhance(
      {
        id: 'fake-ai',
        enhance: async () => {
          throw new Error('provider down')
        },
      },
      { kind: 'summary', baseline: 'base', context },
    )
    expect(failed.text).toBe('base')
    expect(failed.enhancedBy).toBeNull()
    expect(failed.enhancerError).toContain('provider down')
  })
})

describe('POD-14 player model', () => {
  const chapters = [
    { startTime: 0, title: 'Intro' },
    { startTime: 30, title: 'Middle' },
    { startTime: 90, title: 'End' },
  ]

  it('share links: ?t= produced and consumed; legacy #t= consumed; fancy forms parsed', () => {
    const url = buildShareUrl('https://show.test/podcasts/episodes/ep-1?x=1#frag', 83.9)
    expect(url).toContain('?x=1&t=83')
    expect(url).not.toContain('#')
    expect(parseShareTimestamp({ search: '?t=83', hash: '' })).toBe(83)
    expect(parseShareTimestamp({ search: '', hash: '#t=42' })).toBe(42)
    expect(parseShareTimestamp({ search: '?t=1:23', hash: '#t=9' })).toBe(83)
    expect(parseShareTimestamp({ search: '?other=1', hash: '' })).toBeNull()
    expect(parseTimestampValue('1h2m3s')).toBe(3723)
    expect(parseTimestampValue('2:03')).toBe(123)
    expect(parseTimestampValue('bogus')).toBeNull()
    // Round-trip: produced → consumed.
    const produced = new URL(buildShareUrl('https://show.test/e', 125))
    expect(parseShareTimestamp({ search: produced.search, hash: produced.hash })).toBe(125)
  })

  it('chapter navigation: active, next, previous (3 s rule)', () => {
    expect(activeChapterIndexAt(chapters, 45)).toBe(1)
    expect(activeChapterIndexAt(chapters, 0)).toBe(0)
    expect(nextChapterStart(chapters, 45)).toBe(90)
    expect(nextChapterStart(chapters, 95)).toBeNull()
    expect(previousChapterStart(chapters, 45)).toBe(30)
    expect(previousChapterStart(chapters, 31)).toBe(0)
    expect(previousChapterStart(chapters, 10)).toBe(0)
  })

  it('transcript highlight-at-time follows segment windows', () => {
    const segs = segments.map((segment) => ({
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
    }))
    expect(activeSegmentIndexAt(segs, 2)).toBe(0)
    expect(activeSegmentIndexAt(segs, 42)).toBe(2)
    expect(activeSegmentIndexAt(segs, 20)).toBe(-1)
  })

  it('sleep timer math: remaining counts down, expiry at zero', () => {
    const setAt = 1_000_000
    expect(sleepTimerRemainingSec({ kind: 'minutes', minutes: 15 }, setAt, setAt + 60_000)).toBe(
      840,
    )
    expect(sleepTimerExpired({ kind: 'minutes', minutes: 15 }, setAt, setAt + 901_000)).toBe(true)
    expect(sleepTimerExpired({ kind: 'minutes', minutes: 15 }, setAt, setAt + 60_000)).toBe(false)
    expect(sleepTimerRemainingSec({ kind: 'off' }, setAt, setAt)).toBeNull()
    expect(sleepTimerRemainingSec({ kind: 'episode-end' }, setAt, setAt)).toBeNull()
  })
})

describe('POD-14 cleanup wiring into the POD-13 graph', () => {
  it('cleanup options land on the program bus with named approximations', () => {
    const edl = fixture as unknown as EditEdl
    const graph = buildRenderGraph(
      edl,
      [
        { sourceId: 'host', channels: 1 },
        { sourceId: 'guest', channels: 1 },
        { sourceId: 'music', channels: 1 },
      ],
      {
        channels: 1,
        cleanup: {
          humRemoval: { enabled: true, frequencyHz: 50 },
          noiseGate: { enabled: true },
          deEsser: { enabled: true },
        },
      },
    )
    expect(graph.filterComplex).toContain('bandreject=f=50:width_type=h:width=6')
    expect(graph.filterComplex).toContain('bandreject=f=100:width_type=h:width=6')
    expect(graph.filterComplex).toContain('agate=threshold=0.02')
    expect(graph.filterComplex).toContain('deesser=i=0.4')
    expect(graph.approximations.join(' ')).toContain('hum-notch-50hz')
    expect(graph.approximations.join(' ')).toContain('noise-gate-voice')
    expect(graph.approximations.join(' ')).toContain('de-esser-voice')
  })

  it('disabled cleanup adds nothing to the graph', () => {
    const edl = fixture as unknown as EditEdl
    const graph = buildRenderGraph(
      edl,
      [
        { sourceId: 'host', channels: 1 },
        { sourceId: 'guest', channels: 1 },
        { sourceId: 'music', channels: 1 },
      ],
      { channels: 1, cleanup: { humRemoval: { enabled: false } } },
    )
    expect(graph.filterComplex).not.toContain('bandreject')
  })
})

describe('POD-21 audiogram captions — segmentsToClipSrt (POD-18 gap)', () => {
  const segments: TimedSegment[] = [
    { id: 'seg-1', startSeconds: 0, endSeconds: 4, text: 'Before the clip.' },
    { id: 'seg-2', startSeconds: 4, endSeconds: 9, text: 'Inside the clip, first half.' },
    { id: 'seg-3', startSeconds: 9, endSeconds: 14, text: 'Inside the clip, second half.' },
    { id: 'seg-4', startSeconds: 14, endSeconds: 20, text: 'After the clip.' },
  ]

  it('keeps only overlapping segments, clamped and re-timed to the clip start', () => {
    const { srt, segmentCount } = segmentsToClipSrt(segments, { startSec: 6, endSec: 12 })
    expect(segmentCount).toBe(2)
    // seg-2 (4–9) clamps to 6–9 → re-timed 0–3; seg-3 (9–14) clamps to 9–12 → 3–6.
    expect(srt).toContain('00:00:00,000 --> 00:00:03,000')
    expect(srt).toContain('Inside the clip, first half.')
    expect(srt).toContain('00:00:03,000 --> 00:00:06,000')
    expect(srt).toContain('Inside the clip, second half.')
    expect(srt).not.toContain('Before the clip.')
    expect(srt).not.toContain('After the clip.')
    // And the SRT parses back to exactly those re-timed cues.
    const parsed = parseSrt(srt)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ startSeconds: 0, endSeconds: 3 })
    expect(parsed[1]).toMatchObject({ startSeconds: 3, endSeconds: 6 })
  })

  it('a range with no overlapping speech yields an empty SRT (uncaptioned fallback signal)', () => {
    const { srt, segmentCount } = segmentsToClipSrt(segments, { startSec: 30, endSec: 40 })
    expect(segmentCount).toBe(0)
    expect(srt).toBe('')
    expect(segmentsToClipSrt([], { startSec: 0, endSec: 10 }).segmentCount).toBe(0)
  })
})
