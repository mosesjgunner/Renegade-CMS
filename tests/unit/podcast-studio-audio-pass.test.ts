/**
 * Audio pass — pure-core proofs (no ffmpeg):
 *
 * - PCM health: a hard-clipped flat top is detected as a range with
 *   the right times; isolated full-scale peaks are NOT flagged
 *   (a hot peak is not proof of clipping); window percentiles put
 *   the noise floor and speech level where the fixture puts them.
 * - Leveling plan: a 12 LU gap closes to the reference inside the
 *   clamps; an impossible gap reports `capped` honestly instead of
 *   pretending; applying the plan multiplies lane gains on a clone
 *   and never mutates the caller's EDL.
 * - Room check verdicts: the bad room warns in plain language with
 *   specific fixes (and no raw dB on the primary surface); the good
 *   room passes.
 * - Filter construction: afftdn/adeclick strings, the measured-floor
 *   clamp, lane-param denoise ahead of the gate, and the request
 *   default losing to a lane's explicit denoiseNrDb=0.
 * - Leveling deferral: a lane that cannot be measured because it
 *   is silent/empty is recorded on the report (status + deferred
 *   lanes + notes), never an error — the pure report contract here,
 *   and the real-engine measurement split in one guarded describe
 *   at the end (the only ffmpeg in this file).
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { hasFfmpegBinaries } from '../helpers/ffmpeg-availability'

import {
  analyzePcmHealth,
  type PcmHealth,
} from '../../src/modules/podcast-studio/intelligence/audio-health'
import {
  cleanupProgramFilters,
  deClickFilter,
  denoiseFilter,
  denoiseFloorForMeasurement,
  VOICE_CLEANUP_PRESET,
} from '../../src/modules/podcast-studio/intelligence/cleanup'
import { buildRoomCheckReport } from '../../src/modules/podcast-studio/intelligence/room-check'
import type { EditEdl } from '../../src/modules/podcast-studio/edit/edl-engine'
import {
  applyLevelingToEdl,
  deferredLevelingReport,
  measureAllLanesDetailed,
  planLeveling,
  type DeferredLane,
} from '../../src/modules/podcast-studio/render/leveling'
import {
  buildRenderGraph,
  laneProcessingFilters,
} from '../../src/modules/podcast-studio/render/render'

const SR = 48000

const pcmFromFn = (fn: (t: number) => number, seconds: number): Int16Array => {
  const frames = Math.round(SR * seconds)
  const samples = new Int16Array(frames)
  for (let i = 0; i < frames; i++)
    samples[i] = Math.round(32767 * Math.max(-1, Math.min(1, fn(i / SR))))
  return samples
}

describe('audio health — clip detection', () => {
  it('flags a hard-clipped section as a range with the right times', () => {
    // Clean 300 Hz speech-like tone, driven 6x past full scale and
    // hard-clipped between 2.0 s and 3.0 s.
    const samples = pcmFromFn((t) => {
      const base = 0.3 * Math.sin(2 * Math.PI * 300 * t)
      return t >= 2 && t < 3 ? base * 6 : base
    }, 5)
    const health = analyzePcmHealth(samples, { channels: 1, sampleRate: SR })
    expect(health.clippedRanges).toHaveLength(1)
    expect(health.clippedRanges[0].startSec).toBeGreaterThanOrEqual(1.95)
    expect(health.clippedRanges[0].startSec).toBeLessThanOrEqual(2.05)
    expect(health.clippedRanges[0].endSec).toBeGreaterThanOrEqual(2.95)
    expect(health.clippedRanges[0].endSec).toBeLessThanOrEqual(3.05)
    expect(health.peakDbfs).toBeCloseTo(0, 0)
  })

  it('does not flag isolated full-scale peaks (hot is not clipped)', () => {
    // A sine peaking exactly at 0 dBFS touches the rail briefly at
    // each crest — never 4 consecutive frames.
    const samples = pcmFromFn((t) => Math.sin(2 * Math.PI * 2000 * t), 2)
    const health = analyzePcmHealth(samples, { channels: 1, sampleRate: SR })
    expect(health.clippedRanges).toEqual([])
    expect(health.atRailFrames).toBeGreaterThan(0)
  })

  it('measures noise floor and speech level from window percentiles', () => {
    // Continuous quiet noise at ~-40 dBFS RMS + loud bursts.
    let seed = 99
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x40000000 - 1
    }
    const samples = pcmFromFn((t) => {
      const noise = rand() * 0.018
      const burst = t % 1 < 0.5 ? 0.4 * Math.sin(2 * Math.PI * 300 * t) : 0
      return noise + burst
    }, 4)
    const health = analyzePcmHealth(samples, { channels: 1, sampleRate: SR })
    expect(health.noiseFloorDbfs).toBeGreaterThan(-48)
    expect(health.noiseFloorDbfs).toBeLessThan(-32)
    expect(health.speechLevelDbfs).toBeGreaterThan(-21)
    expect(health.speechLevelDbfs).toBeLessThan(-6)
  })
})

describe('leveling plan', () => {
  const lanes = [
    { trackId: 'host', integratedLufs: -20 },
    { trackId: 'guest', integratedLufs: -32 },
  ]

  it('closes a 12 LU gap to the loudest lane', () => {
    const report = planLeveling(lanes)
    expect(report.targetLufs).toBe(-20)
    expect(report.beforeDeltaLu).toBe(12)
    expect(report.afterDeltaLu).toBe(0)
    const guest = report.lanes.find((lane) => lane.trackId === 'guest')!
    expect(guest.appliedGainDb).toBe(12)
    expect(guest.capped).toBe(false)
    const host = report.lanes.find((lane) => lane.trackId === 'host')!
    expect(host.appliedGainDb).toBe(0)
  })

  it('reports capped honestly when the gap exceeds the boost clamp', () => {
    const report = planLeveling([
      { trackId: 'host', integratedLufs: -18 },
      { trackId: 'guest', integratedLufs: -40 },
    ])
    const guest = report.lanes.find((lane) => lane.trackId === 'guest')!
    expect(guest.appliedGainDb).toBe(15)
    expect(guest.capped).toBe(true)
    expect(report.afterDeltaLu).toBe(7)
  })

  it('honours an explicit target and the cut clamp', () => {
    const report = planLeveling(lanes, { targetLufs: -26 })
    const host = report.lanes.find((lane) => lane.trackId === 'host')!
    expect(host.appliedGainDb).toBe(-6)
    const guest = report.lanes.find((lane) => lane.trackId === 'guest')!
    expect(guest.appliedGainDb).toBe(6)
    expect(report.afterDeltaLu).toBe(0)
  })

  it('records deferred lanes on the plan instead of hiding the skip', () => {
    const deferred: DeferredLane[] = [
      {
        trackId: 'voice',
        reason: 'Lane "voice" measured -inf LUFS — it is effectively silent and cannot be leveled.',
      },
    ]
    const report = planLeveling(lanes, {}, deferred)
    expect(report.status).toBe('partially-deferred')
    expect(report.deferredLanes).toEqual(deferred)
    expect(report.notes).toHaveLength(1)
    expect(report.notes[0]).toContain('"voice"')
    // The measured lanes are still planned exactly as before.
    expect(report.lanes.find((lane) => lane.trackId === 'guest')!.appliedGainDb).toBe(12)
    expect(report.targetLufs).toBe(-20)
  })

  it('builds an honest deferred report when no lane could be measured', () => {
    const deferred: DeferredLane[] = [
      {
        trackId: 'voice',
        reason: 'Lane "voice" measured -inf LUFS — it is effectively silent and cannot be leveled.',
      },
    ]
    const report = deferredLevelingReport({}, deferred)
    expect(report.status).toBe('deferred')
    expect(report.lanes).toEqual([])
    expect(report.deferredLanes).toEqual(deferred)
    // No lane measured → no reference exists; the report says so
    // (null) instead of inventing a target, and the notes hand the
    // verdict back to the loudness gate.
    expect(report.targetLufs).toBeNull()
    expect(report.notes[0]).toMatch(/loudness gate/i)
    expect(report.notes[1]).toContain('"voice"')
  })

  it('applyLevelingToEdl multiplies gains on a clone only', () => {
    const edl: EditEdl = {
      version: 1,
      sessionRate: SR,
      sources: [{ id: 'host' }, { id: 'guest' }],
      tracks: [
        { id: 'host', gain: 1, clips: [{ sourceIn: 0, sourceOut: 5, timelineStart: 0 }] },
        { id: 'guest', gain: 0.8, clips: [{ sourceIn: 0, sourceOut: 5, timelineStart: 0 }] },
      ],
      chapters: [],
      transcript: [],
    }
    const leveled = applyLevelingToEdl(edl, planLeveling(lanes))
    const guest = leveled.tracks.find((track) => track.id === 'guest')!
    expect(guest.gain).toBeCloseTo(0.8 * Math.pow(10, 12 / 20), 4)
    expect(edl.tracks.find((track) => track.id === 'guest')!.gain).toBe(0.8)
  })
})

describe('room check verdicts', () => {
  const health = (overrides: Partial<PcmHealth>): PcmHealth => ({
    durationSec: 3.5,
    sampleRate: SR,
    channels: 1,
    peakDbfs: -3,
    rmsDbfs: -24,
    noiseFloorDbfs: -68,
    speechLevelDbfs: -20,
    clippedRanges: [],
    atRailFrames: 0,
    ...overrides,
  })

  it('passes a good room in plain language', () => {
    const report = buildRoomCheckReport(health({}))
    expect(report.status).toBe('good')
    expect(report.items.every((item) => item.status === 'pass')).toBe(true)
  })

  it('warns on the bad room with specific fixes and no raw dB up front', () => {
    const report = buildRoomCheckReport(
      health({
        noiseFloorDbfs: -36,
        peakDbfs: 0,
        clippedRanges: [{ startSec: 1.2, endSec: 1.5, peakDbfs: 0, frames: 400 }],
      }),
    )
    expect(report.status).toBe('needs-attention')
    const noise = report.items.find((item) => item.id === 'noise')!
    expect(noise.status).toBe('warn')
    expect(noise.hint).toMatch(/fan|closer/i)
    const clipping = report.items.find((item) => item.id === 'clipping')!
    expect(clipping.status).toBe('warn')
    expect(clipping.hint).toMatch(/input level/i)
    // The primary surface is plain language; numbers live in detail.
    for (const item of report.items) {
      expect(item.headline).not.toMatch(/dB/)
      expect(item.hint ?? '').not.toMatch(/dB/)
    }
    expect(report.summary).toMatch(/still record/i)
  })

  it('warns on a quiet guest and on a hot one', () => {
    const quiet = buildRoomCheckReport(health({ speechLevelDbfs: -46 }))
    expect(quiet.items.find((item) => item.id === 'level')!.status).toBe('warn')
    expect(quiet.items.find((item) => item.id === 'level')!.hint).toMatch(/closer|input level/i)
    const hot = buildRoomCheckReport(health({ speechLevelDbfs: -6 }))
    expect(hot.items.find((item) => item.id === 'level')!.status).toBe('warn')
  })
})

describe('audio pass filter construction', () => {
  it('builds afftdn from the measured floor, with tracking on', () => {
    const filter = denoiseFilter({ enabled: true, strengthDb: 12, floorDb: -31 })
    expect(filter).toContain('afftdn=nr=12:nf=-31')
    expect(filter).toContain('tn=1')
    expect(denoiseFloorForMeasurement(-36)).toBe(-30)
    expect(denoiseFloorForMeasurement(-90)).toBe(-70)
    expect(denoiseFloorForMeasurement(-10)).toBe(-20)
  })

  it('builds the de-click filter and keeps denoise OUT of the bus chain', () => {
    expect(deClickFilter()).toContain('adeclick=')
    const bus = cleanupProgramFilters(VOICE_CLEANUP_PRESET)
    expect(bus.names).toEqual(['hum-notch-60hz', 'noise-gate-voice', 'de-esser-voice'])
    expect(bus.filters.join(',')).not.toContain('afftdn')
  })

  it('lane denoise runs ahead of the gate in lane processing', () => {
    const { filters } = laneProcessingFilters(
      { presetId: 'guest-chain', params: { denoiseNrDb: 10, gateThresholdDb: -40 } },
      SR,
    )
    expect(filters[0]).toContain('afftdn=')
    expect(filters[1]).toContain('agate=')
  })

  const graphEdl = (guestParams?: Record<string, number>): EditEdl => ({
    version: 1,
    sessionRate: SR,
    sources: [{ id: 'host' }, { id: 'guest' }],
    tracks: [
      { id: 'host', gain: 1, clips: [{ sourceIn: 0, sourceOut: 5, timelineStart: 0 }] },
      {
        id: 'guest',
        gain: 1,
        clips: [{ sourceIn: 0, sourceOut: 5, timelineStart: 0 }],
        ...(guestParams ? { processing: { presetId: 'guest-chain', params: guestParams } } : {}),
      },
    ],
    chapters: [],
    transcript: [],
  })
  const graphSources = [
    { sourceId: 'host', channels: 1 },
    { sourceId: 'guest', channels: 1 },
  ]

  it('request-level denoise lands in the graph; a lane can switch it off', () => {
    const on = buildRenderGraph(graphEdl(), graphSources, {
      channels: 1,
      denoise: { enabled: true, strengthDb: 10, floorDb: -40 },
    })
    expect(on.filterComplex).toContain('afftdn=nr=10:nf=-40')
    const off = buildRenderGraph(graphEdl({ denoiseNrDb: 0 }), graphSources, {
      channels: 1,
      denoise: { enabled: true, strengthDb: 10, floorDb: -40 },
    })
    // The opt-out is per-lane: the guest lane (clip1x0) stays dry
    // while the host lane still takes the request-level default.
    expect(off.filterComplex).toContain('[clip0x0]afftdn')
    expect(off.filterComplex).not.toContain('[clip1x0]afftdn')
    expect(off.filterComplex.match(/afftdn/g)).toHaveLength(1)
  })
})

describe.skipIf(!hasFfmpegBinaries)('leveling deferral (real engine)', () => {
  const writeWav = (dir: string, name: string, fn: (t: number) => number): string => {
    const seconds = 2
    const frames = Math.round(SR * seconds)
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
      buf.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, fn(i / SR)))), 44 + i * 2)
    const file = path.join(dir, name)
    writeFileSync(file, buf)
    return file
  }

  const deferralEdl = (trackIds: string[]): EditEdl => ({
    version: 1,
    sessionRate: SR,
    sources: trackIds.map((id) => ({ id })),
    tracks: trackIds.map((id) => ({
      id,
      gain: 1,
      clips: [{ sourceIn: 0, sourceOut: 2, timelineStart: 0 }],
    })),
    chapters: [],
    transcript: [],
  })

  it('a silent lane defers — measured lanes still level, nothing throws', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'audio-pass-defer-'))
    const hostPath = writeWav(dir, 'host.wav', (t) => 0.5 * Math.sin(2 * Math.PI * 300 * t))
    const silencePath = writeWav(dir, 'voice.wav', () => 0)
    const measurement = await measureAllLanesDetailed(
      deferralEdl(['host', 'voice']),
      [
        { sourceId: 'host', path: hostPath, channels: 1 },
        { sourceId: 'voice', path: silencePath, channels: 1 },
      ],
      { channels: 1 },
    )
    expect(measurement.measured.map((lane) => lane.trackId)).toEqual(['host'])
    expect(measurement.deferred).toHaveLength(1)
    expect(measurement.deferred[0].trackId).toBe('voice')
    expect(measurement.deferred[0].reason).toMatch(/silent/i)
    const report = planLeveling(measurement.measured, {}, measurement.deferred)
    expect(report.status).toBe('partially-deferred')
    expect(report.deferredLanes).toEqual(measurement.deferred)
  }, 60_000)

  it('a fully silent program defers the whole stage instead of throwing', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'audio-pass-defer-all-'))
    const silencePath = writeWav(dir, 'voice.wav', () => 0)
    const measurement = await measureAllLanesDetailed(
      deferralEdl(['voice']),
      [{ sourceId: 'voice', path: silencePath, channels: 1 }],
      { channels: 1 },
    )
    expect(measurement.measured).toEqual([])
    expect(measurement.deferred).toHaveLength(1)
    const report = deferredLevelingReport({}, measurement.deferred)
    expect(report.status).toBe('deferred')
    expect(report.lanes).toEqual([])
  }, 60_000)
})
