/**
 * POD-12 (POD-REQ-26, POD-REQ-27): headless tests for the EDL edit
 * engine + edit project model. NO real browser, audio decode or
 * network is exercised — the engine is a pure core over the POD-00
 * EDL contract, and that purity is the point:
 *
 * - the PT-C scenario is the engine acceptance test (the PT-C fixture
 *   chapters/transcript + the remap expectations from the PT-C
 *   evidence: cut 5–8 of 15 s → 12.000 s, chapter 12 → 9.0, in-cut
 *   chapter dropped-and-reported, transcript split/clamp set);
 * - every op + undo returns the EDL to the EXACT prior canonical hash;
 * - ops never mutate their inputs (deep-frozen inputs, snapshot
 *   comparison) — the engine cannot write media, it has no I/O;
 * - the delete-semantics pair (single-lane silence-in-place vs
 *   all-lane gap-close) with duration assertions;
 * - remap edge cases: cue spanning the whole cut, chapter exactly at
 *   a cut boundary, a cut ending exactly at the timeline end;
 * - SCALE MODEL test: a 3-track × 2-hour project MODEL (synthetic
 *   clips/chapters/cues + synthetic POD-08 peaks arrays) loads and
 *   ops complete inside the stated budget. This measures the model,
 *   not real 2 h audio — no audio bytes exist in this test.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseEdl, type Edl } from '../../src/modules/podcast-studio/contracts/edl'
import {
  addClipFromSource,
  applyToHistory,
  canonicalEdlJson,
  copyClips,
  createHistory,
  cutRange,
  deleteRangeInTrack,
  editDurationSec,
  edlHash,
  importToNewLane,
  moveClip,
  pasteClips,
  rateStretchClip,
  redoHistory,
  setClipFades,
  setClipGain,
  setClipMuted,
  setTrackGain,
  setTrackMuted,
  setTrackProcessing,
  splitClipAt,
  trimClip,
  undoHistory,
  type EdlOpResult,
} from '../../src/modules/podcast-studio/edit/edl-engine'
import {
  buildProjectFromRecording,
  chaptersFromMarkers,
  restoreProjectVersion,
  saveProjectEdl,
  PROJECT_VERSION_LIMIT,
} from '../../src/modules/podcast-studio/edit/project'
import { fitView, visibleColumns } from '../../src/modules/podcast-studio/players/waveform'
import type { WaveformPeaksData } from '../../src/modules/media/peaks'

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(join(__dirname, '..', 'fixtures', 'podcast-studio', name), 'utf8'),
  ) as Record<string, unknown>

const NOW = '2026-11-18T12:00:00.000Z'

/** The PT-C scenario BEFORE the cut: one 15 s clip per lane, cut not yet applied. */
const ptcPreCutEdl = (): Edl => {
  const raw = fixture('edl-pt-c.json')
  const tracks = (raw.tracks as Array<Record<string, unknown>>).map((track) => ({
    id: track.id,
    gain: track.gain,
    clips: [{ sourceIn: 0, sourceOut: 15, timelineStart: 0 }],
  }))
  return parseEdl({
    version: 1,
    sessionRate: 48000,
    sources: raw.sources,
    tracks,
    chapters: raw.chapters,
    transcript: raw.transcript,
    loudnessTarget: raw.loudnessTarget,
  })
}

const deepFreeze = (value: unknown): void => {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const entry of Object.values(value)) deepFreeze(entry)
  }
}

describe('POD-12 PT-C acceptance (engine)', () => {
  it('cut 5–8 of the 15 s PT-C timeline → duration 12.000, clips match the PT-C EDL layout', () => {
    const { edl } = cutRange(ptcPreCutEdl(), { start: 5, end: 8 })
    expect(editDurationSec(edl)).toBe(12)
    for (const track of edl.tracks) {
      expect(
        track.clips.map((clip) => [clip.sourceIn, clip.sourceOut, clip.timelineStart]),
      ).toEqual([
        [0, 5, 0],
        [8, 15, 5],
      ])
    }
    parseEdl(edl)
  })

  it('chapters remap exactly as PT-C: 0→0, 4→4, 6.5 dropped-and-reported, 12→9.0', () => {
    const { edl, report } = cutRange(ptcPreCutEdl(), { start: 5, end: 8 })
    expect(edl.chapters).toEqual([
      { start: 0, title: 'Cold open' },
      { start: 4, title: 'Topic setup' },
      { start: 9, title: 'Wrap up' },
    ])
    expect(report.droppedChapters).toEqual([{ start: 6.5, title: 'Cut segment' }])
    expect(report.shiftedChapters).toEqual([
      { chapter: { start: 12, title: 'Wrap up' }, from: 12, to: 9 },
    ])
    expect(report.durationBefore).toBe(15)
    expect(report.durationAfter).toBe(12)
  })

  it('transcript remap matches the PT-C transcript-remapped segments semantically', () => {
    const { edl, report } = cutRange(ptcPreCutEdl(), { start: 5, end: 8 })
    const segments = edl.transcript
      .map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }))
      .sort((a, b) => a.start - b.start || a.end - b.end)
    // PT-C evidence: transcript-remapped.json segments, verbatim expectations.
    expect(segments).toEqual([
      { start: 0, end: 4.5, text: 'Welcome and intro' },
      { start: 4, end: 5, text: 'Topic setup begins' },
      { start: 4.5, end: 5, text: 'Bridge discussion (spans whole cut)' },
      { start: 5, end: 5.5, text: 'Bridge discussion (spans whole cut)' },
      { start: 5, end: 6, text: 'Story part one' },
      { start: 6, end: 8, text: 'Story part two' },
      { start: 9, end: 12, text: 'Wrap up' },
    ])
    expect(report.droppedCues.map((cue) => cue.text)).toEqual(['Sponsor read (inside cut)'])
    expect(report.splitCues).toHaveLength(1)
    expect(report.splitCues[0].original.text).toBe('Bridge discussion (spans whole cut)')
    expect(report.splitCues[0].pieces.map((piece) => [piece.start, piece.end])).toEqual([
      [4.5, 5],
      [5, 5.5],
    ])
    const clampedTexts = report.clampedCues.map((entry) => entry.original.text)
    expect(clampedTexts).toContain('Topic setup begins')
    expect(clampedTexts).toContain('Story part one')
    expect(clampedTexts).toContain('Story part two')
    // Nothing timed extends past the new duration.
    expect(Math.max(...edl.transcript.map((cue) => cue.end))).toBeLessThanOrEqual(12)
    expect(Math.max(...edl.chapters.map((chapter) => chapter.start))).toBeLessThanOrEqual(12)
  })

  it('EDL hash is invariant under save/reload (canonical JSON round trip)', () => {
    const edl = ptcPreCutEdl()
    const reloaded = parseEdl(JSON.parse(canonicalEdlJson(edl)) as unknown)
    expect(edlHash(reloaded)).toBe(edlHash(edl))
    const { edl: cut } = cutRange(edl, { start: 5, end: 8 })
    const cutReloaded = parseEdl(JSON.stringify(cut))
    expect(edlHash(cutReloaded)).toBe(edlHash(cut))
  })
})

describe('POD-12 op suite — undo returns the exact prior hash; inputs never mutated', () => {
  const ops: Array<[string, (edl: Edl) => EdlOpResult]> = [
    ['cut', (edl) => cutRange(edl, { start: 5, end: 8 })],
    ['delete-in-track', (edl) => deleteRangeInTrack(edl, 'host', { start: 5, end: 8 })],
    ['split', (edl) => splitClipAt(edl, 'host', 7.5)],
    [
      'trim',
      (edl) => {
        const withIds = splitClipAt(edl, 'host', 7.5).edl
        const clipId = withIds.tracks[0].clips[0].id as string
        return trimClip(withIds, 'host', clipId, { sourceOut: 6 })
      },
    ],
    ['track-gain', (edl) => setTrackGain(edl, 'guest', 0.5)],
    ['track-mute', (edl) => setTrackMuted(edl, 'music', true)],
    [
      'clip-gain+fades+mute',
      (edl) => {
        const split = splitClipAt(edl, 'host', 7.5).edl
        const clipId = split.tracks[0].clips[0].id as string
        const gained = setClipGain(split, 'host', clipId, 0.75).edl
        const faded = setClipFades(gained, 'host', clipId, { fadeInSec: 0.25, fadeOutSec: 0.5 }).edl
        return setClipMuted(faded, 'host', clipId, true)
      },
    ],
    [
      'copy/paste',
      (edl) => {
        const split = splitClipAt(edl, 'host', 7.5).edl
        const clipId = split.tracks[0].clips[0].id as string
        const clipboard = copyClips(split, 'host', [clipId])
        return pasteClips(split, 'music', clipboard, 16)
      },
    ],
    [
      'move cross-track',
      (edl) => {
        const split = splitClipAt(edl, 'music', 7.5).edl
        const clipId = split.tracks[2].clips[1].id as string
        return moveClip(split, 'music', clipId, { trackId: 'guest', timelineStart: 16 })
      },
    ],
    [
      'import-lane',
      (edl) =>
        importToNewLane(edl, {
          source: { id: 'sting', mediaAssetId: 'asset-sting' },
          laneId: 'sting',
          sourceDurationSec: 4,
          timelineStart: 15,
        }),
    ],
    [
      'add-clip (intro assembly)',
      (edl) =>
        addClipFromSource(edl, {
          trackId: 'music',
          source: { id: 'intro', mediaAssetId: 'asset-intro' },
          sourceIn: 0,
          sourceOut: 3,
          timelineStart: 15,
          fadeOutSec: 0.5,
        }),
    ],
    [
      'track-processing',
      (edl) =>
        setTrackProcessing(edl, 'guest', { presetId: 'guest-chain-a', params: { gainDb: -2 } }),
    ],
    [
      'rate-stretch',
      (edl) => {
        const split = splitClipAt(edl, 'host', 7.5).edl
        const clipId = split.tracks[0].clips[0].id as string
        return rateStretchClip(split, 'host', clipId, 2)
      },
    ],
  ]

  for (const [label, op] of ops) {
    it(`${label}: result validates, input untouched, undo restores the exact prior hash`, () => {
      const base = ptcPreCutEdl()
      const snapshot = JSON.stringify(base)
      deepFreeze(base)
      const history = createHistory(base)
      const beforeHash = edlHash(history.present)
      const result = op(base)
      parseEdl(result.edl)
      expect(JSON.stringify(base)).toBe(snapshot)
      const applied = applyToHistory(history, label, result, NOW)
      expect(edlHash(applied.present)).toBe(edlHash(result.edl))
      const undone = undoHistory(applied, NOW)
      expect(edlHash(undone.present)).toBe(beforeHash)
      const redone = redoHistory(undone, NOW)
      expect(edlHash(redone.present)).toBe(edlHash(result.edl))
      // The op log is inspectable: the entry carries both hashes.
      const entry = applied.log[applied.log.length - 1]
      expect(entry.label).toBe(label)
      expect(entry.beforeHash).toBe(beforeHash)
      expect(entry.afterHash).toBe(edlHash(result.edl))
    })
  }
})

describe('POD-12 delete semantics (exact pair)', () => {
  it('single-lane delete = silence in place: gap remains, duration + metadata unmoved', () => {
    const { edl, report } = deleteRangeInTrack(ptcPreCutEdl(), 'host', { start: 5, end: 8 })
    const host = edl.tracks.find((track) => track.id === 'host')
    expect(host?.clips.map((clip) => [clip.sourceIn, clip.sourceOut, clip.timelineStart])).toEqual([
      [0, 5, 0],
      [8, 15, 8],
    ])
    expect(editDurationSec(edl)).toBe(15)
    expect(edl.chapters).toEqual(ptcPreCutEdl().chapters)
    expect(report.droppedChapters).toHaveLength(0)
    expect(report.droppedCues).toHaveLength(0)
  })

  it('all-lane cut = gap closes everywhere: duration shrinks by the cut length', () => {
    const { edl } = cutRange(ptcPreCutEdl(), { start: 5, end: 8 })
    expect(editDurationSec(edl)).toBe(12)
    for (const track of edl.tracks)
      expect(
        Math.max(
          ...track.clips.map((clip) => clip.timelineStart + (clip.sourceOut - clip.sourceIn)),
        ),
      ).toBe(12)
  })
})

describe('POD-12 remap edge cases', () => {
  it('chapter exactly at the cut start is dropped; exactly at the cut end shifts onto the junction', () => {
    const base = ptcPreCutEdl()
    base.chapters = [
      { start: 5, title: 'At cut start' },
      { start: 8, title: 'At cut end' },
    ]
    const { edl, report } = cutRange(base, { start: 5, end: 8 })
    expect(report.droppedChapters.map((chapter) => chapter.title)).toEqual(['At cut start'])
    expect(edl.chapters).toEqual([{ start: 5, title: 'At cut end' }])
  })

  it('a cut ending exactly at the timeline end clamps everything to the new duration', () => {
    const { edl, report } = cutRange(ptcPreCutEdl(), { start: 12, end: 15 })
    expect(editDurationSec(edl)).toBe(12)
    expect(report.droppedChapters.map((chapter) => chapter.title)).toEqual(['Wrap up'])
    expect(report.droppedCues.map((cue) => cue.text)).toEqual(['Wrap up'])
    expect(Math.max(...edl.transcript.map((cue) => cue.end))).toBeLessThanOrEqual(12)
  })

  it('markers remap with chapters: in-cut dropped-and-reported, after-cut shifted', () => {
    const base = ptcPreCutEdl()
    base.markers = [
      { start: 2, title: 'Early' },
      { start: 6, title: 'In cut' },
      { start: 10, title: 'Late' },
    ]
    const { edl, report } = cutRange(base, { start: 5, end: 8 })
    expect(edl.markers).toEqual([
      { start: 2, title: 'Early' },
      { start: 7, title: 'Late' },
    ])
    expect(report.droppedMarkers.map((marker) => marker.title)).toEqual(['In cut'])
    expect(report.shiftedMarkers.map((entry) => [entry.from, entry.to])).toEqual([[10, 7]])
  })

  it('an out-of-range cut is refused, not clamped silently', () => {
    expect(() => cutRange(ptcPreCutEdl(), { start: 5, end: 99 })).toThrow(/outside the timeline/)
    expect(() => cutRange(ptcPreCutEdl(), { start: 8, end: 8 })).toThrow(/must be greater/)
  })
})

describe('POD-12 project model (create-from-recording, versions)', () => {
  const manifest = {
    version: 1 as const,
    sessionId: 'sess-1',
    createdAt: NOW,
    sampleRate: 48000,
    tracks: [
      {
        trackId: 'host-iso',
        role: 'host' as const,
        channels: 1,
        channelLayout: 'mono',
        durationSec: 3600,
        checksumSha256: 'a'.repeat(64),
        syncEvents: [{ type: 'head' as const, trackSamples: 0, timelineSamples: 0 }],
      },
      {
        trackId: 'program',
        role: 'program' as const,
        channels: 2,
        channelLayout: 'stereo',
        durationSec: 3600,
        checksumSha256: 'b'.repeat(64),
        syncEvents: [{ type: 'head' as const, trackSamples: 0, timelineSamples: 0 }],
      },
    ],
  }

  it('lanes come from the manifest: program first + muted reference, ISO editable; markers/played log imported; episode seeds land', () => {
    const doc = buildProjectFromRecording({
      title: 'Edit — test',
      recordingId: 'rec-1',
      sessionId: 'sess-rec-1',
      episodeId: 'ep-1',
      manifest,
      markers: [{ number: 1, name: 'Intro done', atElapsedSec: 120, atSample: 120 * 48000 }],
      playedClipLog: [
        {
          id: 'cart:sting:300',
          source: 'cart',
          clipId: 'sting',
          title: 'Sting',
          startedAtSessionSec: 300,
          endedAtSessionSec: 304,
          outcome: 'completed',
        },
      ],
      trackAssets: [
        { trackId: 'program', mediaAssetId: 'asset-program' },
        { trackId: 'host-iso', mediaAssetId: 'asset-host' },
      ],
      conformReports: [
        {
          trackId: 'host-iso',
          rateCorrection: {
            nominalRate: 48000,
            measuredRateHz: 48003.84,
            resampleFactor: 0.99992,
            rateCorrectionPpm: 80,
            offsetSamplesAtHead: 0,
          },
        },
      ],
      episodeChapters: [
        { startTime: 0, title: 'Open' },
        { start: 600, title: 'Interview' },
      ],
      episodeTranscriptSegments: [
        { startSeconds: 0, endSeconds: 4, text: 'Hello', speaker: 'Host' },
        { startSeconds: 4000, endSeconds: 4005, text: 'Past the recording — clamped out' },
      ],
      savedAt: NOW,
    })
    expect(doc.edl.tracks.map((track) => track.id)).toEqual(['program', 'host-iso'])
    expect(doc.edl.tracks[0].muted).toBe(true)
    expect(doc.edl.tracks[1].muted).toBeUndefined()
    expect(
      doc.edl.sources.find((source) => source.id === 'host-iso')?.rateCorrection?.rateCorrectionPpm,
    ).toBe(80)
    expect(doc.edl.markers?.map((marker) => [marker.start, marker.type])).toEqual([
      [120, 'recording-marker'],
      [300, 'played-clip'],
    ])
    expect(doc.edl.chapters).toEqual([
      { start: 0, title: 'Open' },
      { start: 600, title: 'Interview' },
    ])
    expect(doc.edl.transcript).toEqual([{ start: 0, end: 4, text: 'Hello', speaker: 'Host' }])
    expect(doc.versions).toHaveLength(1)
    expect(doc.versions[0].edlHash).toBe(edlHash(doc.edl))

    const withChapters = chaptersFromMarkers(doc.edl)
    expect(withChapters.chapters.map((chapter) => chapter.start)).toEqual([0, 120, 300, 600])
  })

  it('version history is bounded and any saved version restores exactly (hash-equal)', () => {
    let doc = buildProjectFromRecording({
      title: 'Edit — versions',
      recordingId: 'rec-1',
      sessionId: null,
      episodeId: null,
      manifest,
      trackAssets: [
        { trackId: 'program', mediaAssetId: 'asset-program' },
        { trackId: 'host-iso', mediaAssetId: 'asset-host' },
      ],
      savedAt: NOW,
    })
    const firstHash = edlHash(doc.edl)
    for (let i = 0; i < PROJECT_VERSION_LIMIT + 5; i++) {
      const gained = setTrackGain(doc.edl, 'host-iso', 1 + i / 100).edl
      doc = saveProjectEdl(doc, gained, `gain ${i}`, NOW)
    }
    expect(doc.versions).toHaveLength(PROJECT_VERSION_LIMIT)
    const target = doc.versions[3]
    const restored = restoreProjectVersion(doc, target.version, NOW)
    expect(edlHash(restored.edl)).toBe(target.edlHash)
    expect(restored.versions[restored.versions.length - 1].label).toBe(
      `Restored version ${target.version}`,
    )
    expect(firstHash).not.toBe(edlHash(restored.edl))
    expect(() => restoreProjectVersion(doc, 9999, NOW)).toThrow(/no version 9999/)
  })
})

describe('POD-12 scale model — 3 tracks × 2 hours (synthetic model + peaks, NOT real audio)', () => {
  it('loads, hashes, cuts and undoes within budget; peaks columns for a full-timeline view stay cheap', () => {
    const trackCount = 3
    const durationSec = 2 * 60 * 60
    const clipsPerTrack = 120 // one 60 s clip per minute per track
    const tracks = Array.from({ length: trackCount }, (_, trackIndex) => ({
      id: `track-${trackIndex}`,
      gain: 1,
      clips: Array.from({ length: clipsPerTrack }, (_, clipIndex) => ({
        sourceIn: clipIndex * 60,
        sourceOut: clipIndex * 60 + 60,
        timelineStart: clipIndex * 60,
      })),
    }))
    const chapters = Array.from({ length: 100 }, (_, i) => ({
      start: i * 72,
      title: `Chapter ${i}`,
    }))
    const transcript = Array.from({ length: 3600 }, (_, i) => ({
      start: i * 2,
      end: i * 2 + 1.8,
      text: `Cue ${i}`,
    }))

    const t0 = performance.now()
    const edl = parseEdl({
      version: 1,
      sessionRate: 48000,
      sources: tracks.map((track) => ({ id: track.id, mediaAssetId: `asset-${track.id}` })),
      tracks,
      chapters,
      transcript,
    })
    const loadMs = performance.now() - t0
    expect(editDurationSec(edl)).toBe(durationSec)

    const history = createHistory(edl)
    const t1 = performance.now()
    const hash = edlHash(history.present)
    const hashMs = performance.now() - t1
    expect(hash).toHaveLength(64)

    const t2 = performance.now()
    const cut = cutRange(edl, { start: 1800, end: 1860 })
    const applied = applyToHistory(history, 'scale cut', cut, NOW)
    const undone = undoHistory(applied, NOW)
    const opsMs = performance.now() - t2
    expect(editDurationSec(cut.edl)).toBe(durationSec - 60)
    expect(edlHash(undone.present)).toBe(hash)

    // Synthetic POD-08 peaks at 100 pairs/sec for one 2 h track: the
    // view model reduces a full-timeline viewport without touching audio.
    const peaksPerSecond = 100
    const count = durationSec * peaksPerSecond
    const min = new Array<number>(count)
    const max = new Array<number>(count)
    for (let i = 0; i < count; i++) {
      const v = Math.abs(Math.sin(i / 997))
      min[i] = -v
      max[i] = v
    }
    const peaks: WaveformPeaksData = {
      version: 1,
      peaksPerSecond,
      sampleRate: 48000,
      durationSec,
      sourceChecksum: 'c'.repeat(64),
      min,
      max,
    }
    const t3 = performance.now()
    const view = fitView(durationSec, 1200)
    const columns = visibleColumns(peaks, view, 1200)
    const peaksMs = performance.now() - t3
    expect(columns).toHaveLength(1200)

    // Budgets (acceptance: model ops complete in well under a second
    // each on this rig class; measured values are reported, not hidden).
    console.log(
      `[pod12-scale] load=${loadMs.toFixed(1)}ms hash=${hashMs.toFixed(1)}ms cut+undo=${opsMs.toFixed(1)}ms peaksColumns=${peaksMs.toFixed(1)}ms`,
    )
    expect(loadMs).toBeLessThan(1000)
    expect(hashMs).toBeLessThan(1000)
    expect(opsMs).toBeLessThan(1000)
    expect(peaksMs).toBeLessThan(1000)
  })
})
