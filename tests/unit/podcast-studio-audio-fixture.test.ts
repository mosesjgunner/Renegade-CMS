/**
 * Audio pass — the gap sheet's deliberately-bad-session fixture,
 * as automated proof (real ffmpeg; guarded so CI runners without
 * the engine skip cleanly — the standing CI rule).
 *
 * The fixture (synthetic, 12 s, mono 48 kHz):
 * - host: clean speech-like bursts in a quiet room;
 * - guest: speech constructed 12 dB quieter, over a continuous fan
 *   (lowpassed noise at ≈ −36 dBFS RMS), with sibilant bursts and
 *   one hard-clipped shout at 8.0–8.15 s. Note the guest LANE's
 *   integrated loudness measures ~6 LU under the host, not 12:
 *   the continuous fan and the full-scale shout both add energy
 *   the speech-only construction doesn't account for. The leveling
 *   assertions therefore use the measured lane delta; the pure
 *   plan tests prove the exact 12 LU arithmetic separately.
 *
 * Acceptance targets from the sheet:
 * (a) denoise measurably lowers the noise floor UNDER speech while
 *     speech level is preserved;
 * (b) after leveling, the inter-speaker delta is ≤ ~1 LU;
 * (c) the clipped section is FLAGGED (health report + room check),
 *     never silently repaired;
 * (d) the final master still passes the existing loudness gate.
 *
 * The fixture is synthetic: real-microphone / real-room behaviour
 * is UNVERIFIED on this rig and is labelled as such in the close
 * report.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { hasFfmpegBinaries } from '../helpers/ffmpeg-availability'
import { resolveFfmpegBinary, resolveFfprobeBinary } from '../../src/modules/media/ffmpeg'
import { applyCleanupToFile } from '../../src/modules/podcast-studio/intelligence/cleanup'
import { runRoomCheck } from '../../src/modules/podcast-studio/intelligence/room-check'
import type { EditEdl } from '../../src/modules/podcast-studio/edit/edl-engine'
import {
  applyLevelingToEdl,
  measureAllLanes,
  planLeveling,
} from '../../src/modules/podcast-studio/render/leveling'
import { renderEdlToFiles } from '../../src/modules/podcast-studio/render/render'

const SR = 48000
const SECONDS = 12
const CLIP_START = 8
// A single clipped shout (0.15 s): long enough to flag, short
// enough not to dominate the guest lane's integrated loudness —
// at full scale, even 1.5 s of clipping would outweigh the whole
// quiet lane and invert the leveling story.
const CLIP_END = 8.15

const stack = (freq: number, t: number): number =>
  0.55 * Math.sin(2 * Math.PI * freq * t) +
  0.3 * Math.sin(2 * Math.PI * 2 * freq * t) +
  0.18 * Math.sin(2 * Math.PI * 3 * freq * t)

const burstOn = (t: number): boolean => t % 1 < 0.6

/** Deterministic lowpassed noise (fan), calibrated to a target RMS. */
const fanTrack = (seconds: number, targetRmsDb: number): Float32Array => {
  const frames = Math.round(SR * seconds)
  const raw = new Float32Array(frames)
  let seed = 424242
  let lp = 0
  let acc = 0
  for (let i = 0; i < frames; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    lp += 0.06 * (seed / 0x40000000 - 1 - lp)
    raw[i] = lp * 2.4
    acc += raw[i] * raw[i]
  }
  const gain = Math.pow(10, targetRmsDb / 20) / Math.sqrt(acc / frames)
  for (let i = 0; i < frames; i++) raw[i] *= gain
  return raw
}

const buildFixture = (
  dir: string,
  opts: { clip?: boolean } = {},
): { hostPath: string; guestPath: string } => {
  const frames = Math.round(SR * SECONDS)
  const fan = fanTrack(SECONDS, -36)
  const host = new Float32Array(frames)
  const guest = new Float32Array(frames)
  const guestGain = Math.pow(10, -12 / 20)
  let sibSeed = 777
  const sibRand = () => {
    sibSeed = (sibSeed * 1103515245 + 12345) & 0x7fffffff
    return sibSeed / 0x40000000
  }
  for (let i = 0; i < frames; i++) {
    const t = i / SR
    if (burstOn(t)) host[i] = 0.68 * stack(140, t)
    let g = fan[i]
    if (burstOn(t)) {
      let speech = 0.55 * guestGain * stack(190, t)
      // Sibilance: hot ~6.5 kHz bursts inside two speech windows,
      // amplitude-jittered — real sibilance is noise-like; a PURE
      // steady tone would be indistinguishable from electrical
      // whine, and a spectral denoiser would be right to eat it.
      if ((t >= 3 && t < 3.6) || (t >= 5 && t < 5.6))
        speech +=
          0.22 *
          (0.45 + 0.75 * sibRand()) *
          Math.sin(2 * Math.PI * (6500 + 300 * Math.sin(2 * Math.PI * 7 * t)) * t)
      // The clipped section: driven 10x past full scale.
      if (opts.clip !== false && t >= CLIP_START && t < CLIP_END) speech *= 10
      g += speech
    }
    guest[i] = g
  }
  const write = (samples: Float32Array, name: string): string => {
    const buf = Buffer.alloc(44 + frames * 2)
    buf.write('RIFF', 0)
    buf.writeUInt32LE(36 + frames * 2, 4)
    buf.write('WAVEfmt ', 8)
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20)
    buf.writeUInt16LE(1, 22)
    buf.writeUInt32LE(SR, 24)
    buf.writeUInt32LE(SR * 2, 28)
    buf.writeUInt16LE(2, 32)
    buf.writeUInt16LE(16, 34)
    buf.write('data', 36)
    buf.writeUInt32LE(frames * 2, 40)
    for (let i = 0; i < frames; i++)
      buf.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, samples[i]))), 44 + i * 2)
    const file = path.join(dir, name)
    writeFileSync(file, buf)
    return file
  }
  return { hostPath: write(host, 'host.wav'), guestPath: write(guest, 'guest.wav') }
}

const fixtureEdl = (): EditEdl => ({
  version: 1,
  sessionRate: SR,
  sources: [
    { id: 'host', file: 'host.wav' },
    { id: 'guest', file: 'guest.wav' },
  ],
  tracks: [
    {
      id: 'host',
      gain: 1,
      clips: [{ sourceIn: 0, sourceOut: SECONDS, timelineStart: 0 }],
    },
    {
      id: 'guest',
      gain: 1,
      clips: [{ sourceIn: 0, sourceOut: SECONDS, timelineStart: 0 }],
    },
  ],
  chapters: [],
  transcript: [],
})

describe.skipIf(!hasFfmpegBinaries)('audio pass — bad-session fixture', () => {
  it('denoise lowers the floor under speech, speech preserved, clip flagged', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'audio-pass-denoise-'))
    // (a) runs on the no-clip variant: the full fixture's loudest
    // windows ARE the clipped section, whose flat tops afftdn's
    // spectral windows smear (measured: peak 0 → −12 dBFS) — that
    // would contaminate a speech-preservation percentile. Speech
    // preservation is a claim about speech, so it is measured on
    // speech.
    const { guestPath: cleanGuestPath } = buildFixture(dir, { clip: false })
    const m = await applyCleanupToFile({
      inputPath: cleanGuestPath,
      outputPath: path.join(dir, 'guest-clean.wav'),
      options: {
        // The shipped default strength — the claim under test is
        // what a podcaster gets out of the box.
        denoise: { enabled: true },
        humRemoval: { enabled: false },
        noiseGate: { enabled: false },
        deEsser: { enabled: false },
      },
    })
    expect(m.noiseFloorBeforeDb).not.toBeNull()
    expect(m.noiseFloorAfterDb).not.toBeNull()
    // (a) the measured noise floor drops…
    expect(m.noiseFloorBeforeDb! - m.noiseFloorAfterDb!).toBeGreaterThanOrEqual(2.5)
    expect(m.appliedFilters).toContain('denoise-afftdn')
    // …and the segment-level proof says by how much, where it
    // matters: fan-only audio drops hard, speech and sibilance
    // segments are preserved. (Percentile "speech level" mixes
    // window populations; segments are the honest measure.)
    const segmentDb = (file: string, startSec: number, endSec: number): number => {
      const pcm = execFileSync(
        resolveFfmpegBinary(),
        ['-v', 'error', '-i', file, '-f', 's16le', '-'],
        {
          maxBuffer: 256 * 1024 * 1024,
        },
      )
      const samples = new Int16Array(
        pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength - (pcm.byteLength % 2)),
      )
      let acc = 0
      let n = 0
      for (let i = Math.round(startSec * SR); i < Math.round(endSec * SR); i++) {
        acc += (samples[i] / 32768) ** 2
        n++
      }
      return 10 * Math.log10(acc / n)
    }
    const cleanedPath = path.join(dir, 'guest-clean.wav')
    const fanDelta = segmentDb(cleanedPath, 0.65, 0.95) - segmentDb(cleanGuestPath, 0.65, 0.95)
    const speechDelta = segmentDb(cleanedPath, 2.05, 2.55) - segmentDb(cleanGuestPath, 2.05, 2.55)
    const sibDelta = segmentDb(cleanedPath, 3.05, 3.55) - segmentDb(cleanGuestPath, 3.05, 3.55)
    expect(fanDelta).toBeLessThanOrEqual(-3)
    expect(Math.abs(speechDelta)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(sibDelta)).toBeLessThanOrEqual(1.5)
    // (c) on the full fixture, the clipped section is reported by
    // the same chain, at the right place — from the SOURCE
    // measurement (flagged, never "repaired").
    const { guestPath } = buildFixture(dir)
    const clipped = await applyCleanupToFile({
      inputPath: guestPath,
      outputPath: path.join(dir, 'guest-clipped-clean.wav'),
      options: {
        denoise: { enabled: true, strengthDb: 12 },
        humRemoval: { enabled: false },
        noiseGate: { enabled: false },
        deEsser: { enabled: false },
      },
    })
    expect(clipped.clippedRanges.length).toBeGreaterThanOrEqual(1)
    const clip = clipped.clippedRanges[0]
    expect(clip.startSec).toBeGreaterThan(CLIP_START - 0.3)
    expect(clip.endSec).toBeLessThan(CLIP_END + 0.3)
  }, 120_000)

  it('room check warns on the bad room and passes the good one', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'audio-pass-room-'))
    const { hostPath, guestPath } = buildFixture(dir)
    const bad = await runRoomCheck(guestPath)
    expect(bad.status).toBe('needs-attention')
    expect(bad.items.find((item) => item.id === 'noise')!.status).toBe('warn')
    expect(bad.items.find((item) => item.id === 'clipping')!.status).toBe('warn')
    const good = await runRoomCheck(hostPath)
    expect(good.status).toBe('good')
  }, 120_000)

  it('leveling closes the inter-speaker gap to ~1 LU on re-measurement', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'audio-pass-level-'))
    const { hostPath, guestPath } = buildFixture(dir)
    const edl = fixtureEdl()
    const sources = [
      { sourceId: 'host', path: hostPath, channels: 1 },
      { sourceId: 'guest', path: guestPath, channels: 1 },
    ]
    const before = await measureAllLanes(edl, sources, { channels: 1 })
    const plan = planLeveling(before)
    // Measured lane delta ≈ 5.8 LU (see the fixture note: the
    // full-scale clipped section pulls the guest lane up).
    expect(plan.beforeDeltaLu).toBeGreaterThanOrEqual(5)
    const guest = plan.lanes.find((lane) => lane.trackId === 'guest')!
    expect(guest.appliedGainDb).toBeGreaterThanOrEqual(4)
    expect(guest.appliedGainDb).toBeLessThanOrEqual(8)
    const leveled = applyLevelingToEdl(edl, plan)
    const after = await measureAllLanes(leveled, sources, { channels: 1 })
    const levels = after.map((lane) => lane.integratedLufs)
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1)
  }, 120_000)

  it('full master render: leveling + denoise on, gate passes, clip flagged', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'audio-pass-render-'))
    const { hostPath, guestPath } = buildFixture(dir)
    const result = await renderEdlToFiles({
      edl: fixtureEdl(),
      sources: [
        { sourceId: 'host', path: hostPath, channels: 1, sampleRate: SR, origin: 'host.wav' },
        { sourceId: 'guest', path: guestPath, channels: 1, sampleRate: SR, origin: 'guest.wav' },
      ],
      workDir: dir,
      profile: 'master',
      channels: 1,
      denoise: { enabled: true, strengthDb: 12 },
      leveling: { enabled: true },
      cleanup: { deEsser: { enabled: true } },
    })
    // (d) the existing loudness gate still has the final word.
    expect(result.gate.passed).toBe(true)
    expect(result.measurements.integratedLufs).toBeGreaterThanOrEqual(-19.5)
    expect(result.measurements.integratedLufs).toBeLessThanOrEqual(-18.5)
    // (b) the leveling report rides with the render.
    expect(result.leveling).not.toBeNull()
    expect(result.leveling!.beforeDeltaLu).toBeGreaterThanOrEqual(5)
    expect(result.leveling!.afterDeltaLu).toBeLessThanOrEqual(1)
    // (c) clipping is flagged per source, at the right place.
    expect(result.audioHealth).not.toBeNull()
    expect(result.audioHealth!.anyClipping).toBe(true)
    const guest = result.audioHealth!.sources.find((s) => s.sourceId === 'guest')!
    expect(guest.clippedRanges.length).toBeGreaterThanOrEqual(1)
    expect(guest.clippedRanges[0].startSec).toBeGreaterThan(CLIP_START - 0.3)
    const host = result.audioHealth!.sources.find((s) => s.sourceId === 'host')!
    expect(host.clippedRanges).toEqual([])
    expect(result.outputs.mp3).toBeTruthy()
    expect(() =>
      execFileSync(resolveFfprobeBinary(), ['-v', 'error', result.outputs.mp3!.path]),
    ).not.toThrow()
  }, 300_000)
})
