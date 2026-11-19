/**
 * POD-13 (POD-REQ-28, POD-REQ-29) — render core unit proofs (no ffmpeg):
 *
 * - The filter graph: per-clip trim/placement, exact frame pinning,
 *   muted lanes excluded, junction crossfades per the PT-C rule, the
 *   POD-07 program bus chain, and the per-lane processing mapping
 *   with its named approximations (gate only with an explicit
 *   threshold; EQ/comp/limiter mappings).
 * - Windowing: clip intersection math for preview/clip renders,
 *   chapter/transcript shifting, empty-range refusal.
 * - Export profiles + templating + the Podcast JSON chapters builder
 *   (the one chapter source for MP3 / sidecar / feed).
 * - Idempotency key derivation and the stale-claim recovery for
 *   `podcast-render` jobs (fake store, media-variant pattern).
 */
import { describe, expect, it } from 'vitest'

import fixture from '../fixtures/podcast-studio/edl-pt-c.json'
import type { EditEdl } from '../../src/modules/podcast-studio/edit/edl-engine'
import {
  buildPodcastChaptersJson,
  buildRenderGraph,
  edlChaptersToPodcast,
  laneProcessingFilters,
  programBusFilters,
  renderTemplate,
  resolveExportProfile,
  slugifyTemplatePart,
  windowEdl,
} from '../../src/modules/podcast-studio/render/render'
import {
  recoverStalePodcastRenderJobs,
  renderIdempotencyKey,
} from '../../src/modules/podcast-studio/render/render-service'

const ptcEdl = fixture as unknown as EditEdl
const monoSources = [
  { sourceId: 'host', channels: 1 },
  { sourceId: 'guest', channels: 1 },
  { sourceId: 'music', channels: 1 },
]

describe('POD-13 render graph', () => {
  it('builds the PT-C graph: trims, delays, mixes, bus chain, exact frame pin', () => {
    const graph = buildRenderGraph(ptcEdl, monoSources, { channels: 1 })
    expect(graph.durationSec).toBe(12)
    expect(graph.frames).toBe(576_000)
    expect(graph.audibleLaneCount).toBe(3)
    // Per-clip trims from the EDL source windows.
    expect(graph.filterComplex).toContain('atrim=start=0:end=5')
    expect(graph.filterComplex).toContain('atrim=start=8:end=15')
    // Clips placed on the timeline by adelay (gap = silence semantics).
    expect(graph.filterComplex).toContain('adelay=5000:all=1')
    // Junction crossfade (PT-C 0.5 s complementary afades).
    expect(graph.filterComplex).toContain('afade=t=out:st=4.5:d=0.5')
    expect(graph.filterComplex).toContain('afade=t=in:st=0:d=0.5')
    // Program bus chain + exact sample pinning.
    for (const fragment of programBusFilters()) expect(graph.filterComplex).toContain(fragment)
    expect(graph.filterComplex).toContain('apad=whole_len=576000')
    expect(graph.filterComplex).toContain('atrim=end_sample=576000')
    // Lane gains: guest lane carries volume=0.8.
    expect(graph.filterComplex).toContain('volume=0.8')
  })

  it('excludes muted lanes and muted clips entirely', () => {
    const edl: EditEdl = {
      ...ptcEdl,
      tracks: ptcEdl.tracks.map((track) =>
        track.id === 'music' ? { ...track, muted: true } : track,
      ) as EditEdl['tracks'],
    }
    const graph = buildRenderGraph(edl, monoSources, { channels: 1 })
    expect(graph.audibleLaneCount).toBe(2)
  })

  it('refuses an EDL with no audible lanes', () => {
    const edl: EditEdl = {
      ...ptcEdl,
      tracks: ptcEdl.tracks.map((track) => ({ ...track, muted: true })) as EditEdl['tracks'],
    }
    expect(() => buildRenderGraph(edl, monoSources, { channels: 1 })).toThrow(
      /no audible \(unmuted\) lanes/,
    )
  })

  it('applies rate correction (asetrate/aresample + head offset in the trim window)', () => {
    const edl: EditEdl = {
      ...ptcEdl,
      sources: ptcEdl.sources.map((source) =>
        source.id === 'host'
          ? {
              ...source,
              rateCorrection: {
                nominalRate: 48000,
                measuredRateHz: 48003.84,
                resampleFactor: 0.99992,
                rateCorrectionPpm: 80,
                offsetSamplesAtHead: 4800,
              },
            }
          : source,
      ),
    }
    const sources = monoSources.map((source) =>
      source.sourceId === 'host'
        ? {
            ...source,
            rateCorrection: {
              nominalRate: 48000,
              measuredRateHz: 48003.84,
              resampleFactor: 0.99992,
              rateCorrectionPpm: 80,
              offsetSamplesAtHead: 4800,
            },
          }
        : source,
    )
    const graph = buildRenderGraph(edl, sources, { channels: 1 })
    expect(graph.filterComplex).toContain('asetrate=48003.84')
    // 4800 samples at 48 kHz = 0.1 s head offset inside the trim window.
    expect(graph.filterComplex).toContain('atrim=start=0.1:end=5.1')
  })

  it('maps per-lane processing with named approximations; gate only with an explicit threshold', () => {
    const withGate = laneProcessingFilters(
      {
        presetId: 'guest-chain',
        params: {
          gateThresholdDb: -40,
          highPassHz: 100,
          midGainDb: 3,
          midHz: 2500,
          compThresholdDb: -20,
          compRatio: 4,
          limiterCeilingDb: -2,
        },
      },
      48000,
    )
    const joined = withGate.filters.join(',')
    expect(joined).toContain('agate=threshold=')
    expect(joined).toContain('highpass=f=100')
    expect(joined).toContain('equalizer=f=2500:width_type=q:width=1:g=3')
    expect(joined).toContain('acompressor=threshold=')
    expect(joined).toContain('alimiter=limit=')
    expect(withGate.approximations.join(' ')).toMatch(/gate:/)
    expect(withGate.approximations.join(' ')).toMatch(/compressor:/)

    const noGate = laneProcessingFilters({ presetId: 'guest-chain', params: {} }, 48000)
    expect(noGate.filters.join(',')).not.toContain('agate')
    // POD-07 chain defaults still apply: HP + compressor.
    expect(noGate.filters.join(',')).toContain('highpass=f=80')
    expect(noGate.filters.join(',')).toContain('acompressor=')
    expect(laneProcessingFilters(undefined, 48000).filters).toEqual([])
  })
})

describe('POD-13 windowing (preview/clip shared core)', () => {
  it('intersects clips, advances source windows, shifts chapters and cues', () => {
    const windowed = windowEdl(ptcEdl, 2, 6)
    expect(windowed.tracks).toHaveLength(3)
    const host = windowed.tracks.find((track) => track.id === 'host')!
    // Clip [0,5)@0 keeps [2,5) → sourceIn 2, timelineStart 0.
    // Clip [8,15)@5 keeps [5,8) → sourceIn 8, timelineStart 3.
    expect(host.clips.map((clip) => [clip.sourceIn, clip.sourceOut, clip.timelineStart])).toEqual([
      [2, 5, 0],
      [8, 11, 3],
    ])
    expect(windowed.chapters).toEqual([
      { start: 2, title: 'Topic setup' },
      { start: 4.5, title: 'Cut segment' },
    ])
    expect(windowed.transcript.every((cue) => cue.end <= 6)).toBe(true)
  })

  it('refuses a window with no audible clips', () => {
    const gapped: EditEdl = {
      ...ptcEdl,
      tracks: [
        {
          id: 'host',
          gain: 1,
          clips: [{ sourceId: 'host', sourceIn: 0, sourceOut: 5, timelineStart: 0 }],
        },
      ] as EditEdl['tracks'],
      chapters: [],
      transcript: [],
    }
    expect(() => windowEdl(gapped, 6, 2)).toThrow(/contains no audible clips/)
  })
})

describe('POD-13 export profiles, templating, chapters', () => {
  it('resolves defaults, applies overrides, refuses invalid profiles', () => {
    const defaults = resolveExportProfile(null)
    expect(defaults.filenameTemplate).toBe('{show-slug}-{episode-slug}')
    expect(defaults.mp3BitrateKbps).toBe(192)
    const custom = resolveExportProfile({
      titleTemplate: '{episode-number}: {episode-title}',
      mp3BitrateKbps: 128,
    })
    expect(custom.titleTemplate).toBe('{episode-number}: {episode-title}')
    expect(custom.mp3BitrateKbps).toBe(128)
    expect(() => resolveExportProfile({ mp3BitrateKbps: 999 })).toThrow(/between 32 and 320/)
    expect(() => resolveExportProfile('nope')).toThrow(/must be an object/)
  })

  it('renders templates with unknown tokens empty and slugifies file names', () => {
    expect(
      renderTemplate('{show-title} — {episode-title} ({missing})', {
        'show-title': 'My Show',
        'episode-title': 'Ep 1',
      }),
    ).toBe('My Show — Ep 1 ()')
    expect(slugifyTemplatePart('My Show! Ep #1')).toBe('my-show-ep-1')
  })

  it('builds the Podcast JSON chapters document from the EDL chapter list (one source)', () => {
    const chapters = edlChaptersToPodcast([
      { start: 9, title: 'Wrap up' },
      { start: 0, title: 'Cold open' },
    ])
    expect(chapters).toEqual([
      { startTime: 0, title: 'Cold open' },
      { startTime: 9, title: 'Wrap up' },
    ])
    expect(JSON.parse(buildPodcastChaptersJson(chapters))).toEqual({
      version: '1.2.0',
      chapters,
    })
  })
})

describe('POD-13 idempotency + stale-claim recovery', () => {
  it('derives stable keys that differ by EDL hash, profile and range', () => {
    const a = renderIdempotencyKey('p1', 'hash-a', 'master')
    expect(a).toBe(renderIdempotencyKey('p1', 'hash-a', 'master'))
    expect(a).not.toBe(renderIdempotencyKey('p1', 'hash-b', 'master'))
    expect(a).not.toBe(
      renderIdempotencyKey('p1', 'hash-a', 'clip', { startSec: 0, durationSec: 5 }),
    )
    expect(renderIdempotencyKey('p1', 'hash-a', 'clip', { startSec: 0, durationSec: 5 })).not.toBe(
      renderIdempotencyKey('p1', 'hash-a', 'clip', { startSec: 5, durationSec: 5 }),
    )
  })

  it('recovers stale podcast-render claims and exhausts the budget visibly', async () => {
    const updates: Array<{ id: unknown; data: Record<string, unknown> }> = []
    const fake = {
      collections: { 'payload-jobs': {} },
      find: async () => ({
        docs: [
          { id: 'job-retry', totalTried: 1 },
          { id: 'job-dead', totalTried: 3 },
        ],
      }),
      update: async (args: { id: unknown; data: Record<string, unknown> }) => {
        updates.push(args)
        return {}
      },
    }
    const recovered = await recoverStalePodcastRenderJobs(fake as never, 1000)
    expect(recovered).toBe(2)
    const retry = updates.find((entry) => entry.id === 'job-retry')!
    expect(retry.data.processing).toBe(false)
    expect(retry.data.totalTried).toBe(2)
    const dead = updates.find((entry) => entry.id === 'job-dead')!
    expect(dead.data.hasError).toBe(true)
    expect((dead.data.error as { name: string }).name).toBe('StaleClaimRecoveryExhausted')
  })

  it('recovery is a no-op without the payload-jobs collection', async () => {
    const fake = { find: async () => ({ docs: [] }), update: async () => ({}) }
    await expect(recoverStalePodcastRenderJobs(fake as never)).resolves.toBe(0)
  })
})
