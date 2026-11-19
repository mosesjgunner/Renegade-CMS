/**
 * POD-14 — audio cleanup chain against REAL ffmpeg 8.1.2 with
 * synthetic fixtures (the before/after measurements are the proof):
 *
 * - Hum fixture (440 Hz tone + loud 60 Hz hum): after the hum notch,
 *   the measured 60 Hz band energy drops by at least 8 dB while the
 *   programme tone survives.
 * - Silence fixture (1.5 s silence + 3 s tone + 2 s silence): the
 *   measured head/tail trim lands the cleaned file at ≈ the tone
 *   length.
 * - Gate + de-esser presets run as a valid chain (duration kept).
 * - The named filter construction is asserted directly.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { hasFfmpegBinaries } from '../helpers/ffmpeg-availability'

import {
  applyCleanupToFile,
  cleanupProgramFilters,
  detectSilenceTrim,
  measureBandEnergyDb,
  probeDurationSec,
  VOICE_CLEANUP_PRESET,
} from '../../src/modules/podcast-studio/intelligence/cleanup'

const SR = 48000

const wavBytes = (fn: (t: number) => number, seconds: number): Buffer => {
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
  for (let i = 0; i < frames; i++) {
    buf.writeInt16LE(Math.round(32767 * fn(i / SR)), 44 + i * 2)
  }
  return buf
}

describe('POD-14 cleanup filters (construction)', () => {
  it('builds the named chain in order and honours toggles', () => {
    const all = cleanupProgramFilters(VOICE_CLEANUP_PRESET)
    expect(all.names).toEqual(['hum-notch-60hz', 'noise-gate-voice', 'de-esser-voice'])
    expect(all.filters[0]).toContain('bandreject=f=60')
    expect(all.filters[1]).toContain('bandreject=f=120')
    expect(all.filters[2]).toContain('agate=')
    expect(all.filters[3]).toContain('deesser=')
    const off = cleanupProgramFilters({
      humRemoval: { enabled: false },
      noiseGate: { enabled: false },
      deEsser: { enabled: false },
    })
    expect(off).toEqual({ filters: [], names: [] })
    const fifty = cleanupProgramFilters({ humRemoval: { enabled: true, frequencyHz: 50 } })
    expect(fifty.names).toEqual(['hum-notch-50hz'])
    expect(fifty.filters[0]).toContain('bandreject=f=50')
  })
})

describe.skipIf(!hasFfmpegBinaries)('POD-14 cleanup measurements (real ffmpeg)', () => {
  it('hum notch measurably reduces 60 Hz band energy', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod14-hum-'))
    const input = path.join(dir, 'hum.wav')
    const output = path.join(dir, 'clean.wav')
    // Programme tone at 440 Hz plus an equally loud 60 Hz hum.
    await writeFile(
      input,
      wavBytes(
        (t) => 0.35 * Math.sin(2 * Math.PI * 440 * t) + 0.35 * Math.sin(2 * Math.PI * 60 * t),
        3,
      ),
    )
    const before = await measureBandEnergyDb(input, 60)
    const result = await applyCleanupToFile({
      inputPath: input,
      outputPath: output,
      options: { humRemoval: { enabled: true, frequencyHz: 60 } },
    })
    expect(result.humEnergyBeforeDb).not.toBeNull()
    expect(result.humEnergyAfterDb).not.toBeNull()
    expect(result.humEnergyBeforeDb!).toBeCloseTo(before, 0)
    const reduction = result.humEnergyBeforeDb! - result.humEnergyAfterDb!
    expect(reduction).toBeGreaterThanOrEqual(8)
    expect(result.appliedFilters).toEqual(['hum-notch-60hz'])
    expect(result.durationAfterSec).toBeCloseTo(3, 0)
    // The programme tone survives the notch.
    const toneAfter = await measureBandEnergyDb(output, 440)
    expect(toneAfter).toBeGreaterThan(-30)
  }, 60_000)

  it('silence trim measures head/tail and trims to the expected length', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod14-trim-'))
    const input = path.join(dir, 'padded.wav')
    const output = path.join(dir, 'trimmed.wav')
    await writeFile(
      input,
      wavBytes((t) => (t >= 1.5 && t < 4.5 ? 0.4 * Math.sin(2 * Math.PI * 440 * t) : 0), 6.5),
    )
    const duration = await probeDurationSec(input)
    expect(duration).toBeCloseTo(6.5, 1)
    const trim = await detectSilenceTrim(input, { durationSec: duration })
    expect(trim.headSilenceSec).toBeGreaterThanOrEqual(1.3)
    expect(trim.headSilenceSec).toBeLessThanOrEqual(1.7)
    expect(trim.tailSilenceSec).toBeGreaterThanOrEqual(1.8)
    expect(trim.tailSilenceSec).toBeLessThanOrEqual(2.2)
    expect(trim.thresholdDb).toBe(-45)

    const result = await applyCleanupToFile({
      inputPath: input,
      outputPath: output,
      options: { silenceTrim: { enabled: true } },
    })
    expect(result.trim).not.toBeNull()
    expect(result.durationBeforeSec).toBeCloseTo(6.5, 1)
    expect(result.durationAfterSec).toBeGreaterThanOrEqual(2.7)
    expect(result.durationAfterSec).toBeLessThanOrEqual(3.3)
  }, 60_000)

  it('gate + de-esser presets run as a valid chain, duration kept', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pod14-gate-'))
    const input = path.join(dir, 'voice.wav')
    const output = path.join(dir, 'gated.wav')
    // Speech-like bursts over a low noise floor.
    await writeFile(
      input,
      wavBytes(
        (t) =>
          (Math.floor(t * 2) % 2 === 0 ? 0.4 : 0.01) *
          Math.sin(2 * Math.PI * 300 * t) *
          (0.8 + 0.2 * Math.sin(2 * Math.PI * 3 * t)),
        3,
      ),
    )
    const result = await applyCleanupToFile({
      inputPath: input,
      outputPath: output,
      options: { noiseGate: { enabled: true }, deEsser: { enabled: true } },
    })
    expect(result.appliedFilters).toEqual(['noise-gate-voice', 'de-esser-voice'])
    expect(result.durationAfterSec).toBeCloseTo(3, 0)
    expect(result.humFrequencyHz).toBeNull()
  }, 60_000)
})
