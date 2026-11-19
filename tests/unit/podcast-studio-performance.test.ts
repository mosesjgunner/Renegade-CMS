/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-19 performance evidence on the final tree (this rig's numbers —
 * the handoff records them; budgets are reported, not hidden):
 *
 * - Feed generation at 1,000 episodes: renderPodcastFeed wall time +
 *   heap delta for a full 1k-item show.
 * - Render throughput (POD-13 re-run): a 2-track × 120 s EDL through
 *   the real master render (ffmpeg graph + two-pass loudnorm + MP3 /
 *   Opus exports), reported as ×realtime.
 *
 * The POD-12 editor scale model (3 tracks × 2 h) is re-run as its own
 * suite (tests/unit/podcast-studio-edit.test.ts) — see the POD-19
 * handoff for its numbers on this tree.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { renderPodcastFeed } from '../../src/modules/podcast-studio/feed-build'
import type { EditEdl } from '../../src/modules/podcast-studio/edit/edl-engine'
import { renderEdlToFiles } from '../../src/modules/podcast-studio/render/render'

describe('POD-19 performance — feed generation at 1k episodes', () => {
  it('renders a 1,000-episode feed (time + memory recorded)', () => {
    const show: any = {
      id: 'show-perf',
      title: 'Perf Show',
      slug: 'perf-show',
      description: 'A show with one thousand episodes.',
      language: 'en',
      explicit: false,
      podcastGuidValue: '12345678-1234-5234-9234-1234567890ab',
      lockedOwnerEmail: 'host@example.test',
      medium: 'podcast',
      persons: [{ name: 'Perf Host', role: 'host', group: 'Hosts' }],
      hosts: [],
      authors: [],
      status: 'published',
    }
    const episodes: any[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `ep-${i}`,
      guid: `urn:renegade:podcast:perf:${i}`,
      title: `Episode ${i + 1}`,
      slug: `episode-${i + 1}`,
      description: `Description for episode ${i + 1}.`,
      status: 'published',
      publishedAt: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString(),
      episodeNumber: i + 1,
      membersOnly: false,
      liveState: 'none',
      chapters: [
        { startTime: 0, title: 'Open' },
        { startTime: 600, title: 'Main' },
      ],
      audio: {
        id: `asset-${i}`,
        mimeType: 'audio/mpeg',
        sizeBytes: 48_000_000,
        durationSeconds: 3600,
      },
      authors: [],
      guests: [],
    }))
    const heapBefore = process.memoryUsage().heapUsed
    const started = performance.now()
    const feed = renderPodcastFeed(show, episodes, {
      origin: 'http://localhost:3000',
      feedPath: '/podcasts/perf-show/feed.xml',
      showPath: '/podcasts/perf-show',
      includeMembersOnly: false,
    })
    const elapsedMs = performance.now() - started
    const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024)
    const items = (feed.match(/<item>/g) ?? []).length
    console.log(
      `[pod19-perf] feed-1k: items=${items} bytes=${feed.length} time=${elapsedMs.toFixed(1)}ms heapDelta=${heapDeltaMb.toFixed(1)}MB`,
    )
    expect(items).toBe(1000)
    expect(elapsedMs).toBeLessThan(30_000)
  })
})

describe('POD-19 performance — POD-13 render throughput re-run', () => {
  const SR = 48000
  const wavBytes = (seconds: number, freq: number): Buffer => {
    const frames = SR * seconds
    const buf = Buffer.alloc(44 + frames * 2)
    buf.write('RIFF', 0)
    buf.writeUInt32LE(36 + frames * 2, 4)
    buf.write('WAVEfmt ', 8)
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20) // PCM
    buf.writeUInt16LE(1, 22) // mono
    buf.writeUInt32LE(SR, 24)
    buf.writeUInt32LE(SR * 2, 28)
    buf.writeUInt16LE(2, 32)
    buf.writeUInt16LE(16, 34)
    buf.write('data', 36)
    buf.writeUInt32LE(frames * 2, 40)
    for (let i = 0; i < frames; i++) {
      const sample = Math.round(0.4 * 32767 * Math.sin(2 * Math.PI * freq * (i / SR)))
      buf.writeInt16LE(sample, 44 + i * 2)
    }
    return buf
  }

  it('renders a 2-track × 120 s master and reports ×realtime', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod19-perf-'))
    try {
      const hostPath = path.join(dir, 'host.wav')
      const guestPath = path.join(dir, 'guest.wav')
      await writeFile(hostPath, wavBytes(120, 220))
      await writeFile(guestPath, wavBytes(120, 330))
      const edl = {
        version: 1,
        sessionRate: SR,
        sources: [
          { id: 'host', file: 'host.wav' },
          { id: 'guest', file: 'guest.wav' },
        ],
        crossfadeSec: 0,
        tracks: [
          { id: 'host', gain: 1, clips: [{ sourceIn: 0, sourceOut: 120, timelineStart: 0 }] },
          { id: 'guest', gain: 0.9, clips: [{ sourceIn: 0, sourceOut: 120, timelineStart: 0 }] },
        ],
        chapters: [{ start: 0, title: 'Open' }],
        transcript: [{ start: 0, end: 120, text: 'Perf render transcript.' }],
        loudnessTarget: { I: -16, TP: -1.5, LRA: 11 },
      } as unknown as EditEdl
      const started = performance.now()
      const result = await renderEdlToFiles({
        edl,
        sources: [
          { sourceId: 'host', path: hostPath, channels: 1, sampleRate: SR, origin: hostPath },
          { sourceId: 'guest', path: guestPath, channels: 1, sampleRate: SR, origin: guestPath },
        ],
        workDir: path.join(dir, 'work'),
        profile: 'master',
      })
      const elapsedSec = (performance.now() - started) / 1000
      const realtime = 120 / elapsedSec
      console.log(
        `[pod19-perf] render-120s-2track: wall=${elapsedSec.toFixed(2)}s realtime=${realtime.toFixed(2)}x duration=${result.durationSec}s lufs=${result.measurements.integratedLufs}`,
      )
      expect(result.durationSec).toBe(120)
      expect(result.outputs.wavMaster).toBeTruthy()
      expect(result.outputs.mp3).toBeTruthy()
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }, 300_000)
})
