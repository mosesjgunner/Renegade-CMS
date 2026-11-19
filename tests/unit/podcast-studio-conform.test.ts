/**
 * POD-11 (POD-REQ-25): headless tests for guest local recording,
 * sync & conform — the conform core (PT-F method over POD-09's
 * drift.ts), the guest recording lifecycle + journal, resumable
 * upload (kill at ~50% → resume → no duplicates → checksum match),
 * disconnect gaps, the fallback ladder, and a REAL ffmpeg conform of
 * a synthetic drifted WAV. All drift proof is synthetic, exactly as
 * PT-F recorded; real-device drift stays UNVERIFIED.
 */
import { describe, expect, it } from 'vitest'

import {
  MemoryChunkStorage,
  recoverRecording,
  sha256Hex,
  TIMESLICE_FRAMES,
  type UploadTransport,
} from '../../src/modules/podcast-studio/capture/index'
import { int16BytesToFloat } from '../../src/modules/podcast-studio/capture/journal'
import { parseEdl } from '../../src/modules/podcast-studio/contracts/edl'
import { parseTrackManifest } from '../../src/modules/podcast-studio/contracts/track-manifest'
import {
  GuestChunkUploader,
  GuestLocalRecorder,
  createGuestRecordingState,
  guestJournalRecordingId,
  guestRecordingBinding,
  guestRecordingTelemetry,
  transitionGuestRecording,
  validateGuestChunkUpload,
  type GuestChunkTransport,
} from '../../src/modules/podcast-studio/guests/guest-recording'
import {
  assembleGuestWithFallback,
  computeConformPlan,
  conformGuestTrack,
  decideGuestTrackFallback,
  evaluateConformReadiness,
  rateCorrectionFilter,
  syncPair,
  type GuestSyncPair,
} from '../../src/modules/podcast-studio/recording/conform'
import {
  decodeWavPcm16,
  runFfmpegRateCorrection,
} from '../../src/modules/podcast-studio/recording/conform-service'
import {
  encodeWavPcm16,
  finalizeAssembly,
  type AssemblyChunk,
} from '../../src/modules/podcast-studio/recording/index'

const SR = 48_000
const CHUNK = TIMESLICE_FRAMES

const tone = (freq: number, amp: number, frames: number, startFrame = 0): Float32Array => {
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++)
    out[i] = amp * Math.sin((2 * Math.PI * freq * (startFrame + i)) / SR)
  return out
}

const rms = (pcm: Float32Array): number => {
  let sum = 0
  for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!
  return Math.sqrt(sum / Math.max(1, pcm.length))
}

/** Positions of samples above `threshold` (impulse peaks), de-duplicated to one per cluster. */
const impulsePositions = (pcm: Float32Array, threshold = 0.4): number[] => {
  const positions: number[] = []
  let last = -100
  for (let i = 0; i < pcm.length; i++) {
    if (Math.abs(pcm[i]!) > threshold && i - last > 50) {
      positions.push(i)
      last = i
    }
  }
  return positions
}

const binding = guestRecordingBinding({
  sessionId: 'sess-pod11',
  sessionRecordId: 'rec-pod11',
  inviteId: 'inv-pod11',
})

/** Loads a recovered journal's admitted chunks as cumulative-position assembly chunks. */
const loadRecoveredChunks = async (
  storage: MemoryChunkStorage,
  recordingId: string,
): Promise<AssemblyChunk[]> => {
  const report = await recoverRecording(storage, recordingId)
  expect(report).not.toBeNull()
  const chunks: AssemblyChunk[] = []
  let cursor = 0
  for (const index of report!.admittedChunks) {
    const bytes = await storage.getChunk(recordingId, index)
    const pcm = int16BytesToFloat(bytes!)
    chunks.push({ startSample: cursor, pcm })
    cursor += pcm.length
  }
  return chunks
}

// ---------------------------------------------------------------------------
// PT-F simulation over the conform core (80 ppm, simulated hour)
// ---------------------------------------------------------------------------

describe('POD-11 conform core — PT-F reproduction', () => {
  it('recovers 80 ppm from head+tail, residual < 5 ms/hr budget, head-only demonstrably insufficient (F4)', () => {
    const points: GuestSyncPair[] = []
    for (let sec = 0; sec <= 3600; sec += 10) {
      const host = sec * SR
      points.push(syncPair(Math.round(host * 1.00008), host))
    }
    const plan = computeConformPlan({
      nominalRate: SR,
      head: points[0]!,
      tail: points[points.length - 1]!,
      checkPoints: points.slice(1, -1),
    })
    expect(plan.rateCorrection.rateCorrectionPpm).toBeCloseTo(80, 0)
    expect(plan.rateCorrection.measuredRateHz).toBeCloseTo(48003.84, 1)
    expect(plan.rateCorrection.resampleFactor).toBeCloseTo(0.99992, 4)
    expect(plan.report.residualBasis).toBe('check-points')
    expect(plan.report.residualEstimateMs).toBeLessThan(5) // the PT-F budget
    expect(plan.report.residualEstimateMs).toBeLessThan(0.05) // quantisation-only residue, as PT-F measured
    // F4 control: head offset alone leaves the tail ~288 ms out.
    expect(plan.report.headOnlyTailErrorMs).toBeGreaterThan(100)
    expect(plan.report.headOnlyTailErrorMs).toBeCloseTo(288, 0)
    expect(rateCorrectionFilter(plan)).toBe('asetrate=48003.84,aresample=48000')

    // The artefact parses under the POD-00 EDL contract (POD-12's input).
    const edl = parseEdl({
      version: 1,
      sessionRate: SR,
      sources: [{ id: 'guest-track', file: 'guest.wav', rateCorrection: plan.rateCorrection }],
      tracks: [],
      chapters: [],
      transcript: [],
    })
    expect(edl.sources[0]!.rateCorrection?.rateCorrectionPpm).toBeCloseTo(80, 0)

    // Geometry-only residual (no check points) is still under budget.
    const bounded = computeConformPlan({
      nominalRate: SR,
      head: points[0]!,
      tail: points[points.length - 1]!,
    })
    expect(bounded.report.residualBasis).toBe('sync-pair-geometry')
    expect(bounded.report.residualEstimateMs).toBeLessThan(5)
  })
})

// ---------------------------------------------------------------------------
// Conform alignment: synthetic guest journal, known offset + known drift
// ---------------------------------------------------------------------------

describe('POD-11 conform alignment (offset + drift → timeline)', () => {
  it('aligns a drifted guest track at its join offset with residual < 5 ms and the offset recorded', () => {
    const sessionFrames = 10 * SR
    const joinOffset = 24_000 // guest joins at 0.5 s
    const ppm = 800
    const factor = 1 + ppm / 1_000_000
    const hostSpan = sessionFrames - joinOffset
    const guestFrames = Math.round(hostSpan * factor)
    // Guest PCM: a quiet tone plus impulses at timeline seconds.
    const guestPcm = tone(660, 0.05, guestFrames)
    const expectedImpulses: number[] = []
    for (let t = joinOffset; t < sessionFrames; t += SR) {
      const guestPos = Math.round((t - joinOffset) * factor)
      guestPcm[guestPos] = 0.95
      expectedImpulses.push(t)
    }
    const chunks: AssemblyChunk[] = []
    for (let offset = 0; offset < guestFrames; offset += CHUNK) {
      chunks.push({
        startSample: offset,
        pcm: guestPcm.subarray(offset, Math.min(offset + CHUNK, guestFrames)),
      })
    }
    const { track, plan } = conformGuestTrack(
      {
        trackId: binding.trackId,
        guestId: 'guest-1',
        chunks,
        head: syncPair(0, joinOffset),
        tail: syncPair(guestFrames, sessionFrames),
      },
      sessionFrames,
      SR,
    )
    expect(plan.report.offsetSamplesAtHead).toBe(joinOffset)
    expect(plan.rateCorrection.offsetSamplesAtHead).toBe(joinOffset)
    expect(Math.abs(plan.rateCorrection.rateCorrectionPpm - ppm)).toBeLessThan(5)
    expect(plan.report.residualEstimateMs).toBeLessThan(5)
    expect(track.frames).toBe(sessionFrames)
    // Silence before the join offset; impulses land on the timeline.
    expect(track.pcm.subarray(0, joinOffset - 100).every((s) => s === 0)).toBe(true)
    const found = impulsePositions(track.pcm)
    expect(found.length).toBe(expectedImpulses.length)
    let maxError = 0
    for (let i = 0; i < expectedImpulses.length; i++) {
      maxError = Math.max(maxError, Math.abs(found[i]! - expectedImpulses[i]!))
    }
    expect(maxError).toBeLessThan(240) // < 5 ms at 48 kHz
    expect(maxError).toBeLessThan(48) // in practice sub-ms after whole-track resample

    // Slots into POD-09 assembly as the guest ISO track; manifest parses.
    const result = finalizeAssembly({
      sessionId: 'sess-pod11',
      sampleRate: SR,
      tracks: [
        {
          trackId: 'host',
          role: 'host',
          channels: 1,
          joinedAtSample: 0,
          chunks: [{ startSample: 0, pcm: tone(440, 0.5, sessionFrames) }],
        },
        {
          trackId: binding.trackId,
          role: 'guest',
          guestId: 'guest-1',
          channels: 1,
          joinedAtSample: plan.report.offsetSamplesAtHead,
          chunks,
          syncEvents: plan.syncEvents,
        },
      ],
    })
    expect(() => parseTrackManifest(result.manifest)).not.toThrow()
    const guestManifest = result.manifest.tracks.find((t) => t.trackId === binding.trackId)!
    expect(guestManifest.rateCorrectionPpm).toBeCloseTo(ppm, 0)
    expect(guestManifest.syncEvents).toContainEqual({
      type: 'head',
      trackSamples: 0,
      timelineSamples: joinOffset,
    })
  })
})

// ---------------------------------------------------------------------------
// ffmpeg conform of a real (synthetic) drifted WAV
// ---------------------------------------------------------------------------

describe('POD-11 ffmpeg conform (real ffmpeg, injected rate error)', () => {
  it('corrects duration and impulse position within tolerance', async () => {
    const timelineFrames = 2 * SR
    const ppm = 800
    const measuredRate = SR * (1 + ppm / 1_000_000)
    const guestFrames = Math.round(timelineFrames * (1 + ppm / 1_000_000))
    // Samples produced by a clock running at the measured rate: a
    // 440 Hz tone in guest-time, plus an impulse at timeline 1 s.
    const guestPcm = new Float32Array(guestFrames)
    for (let i = 0; i < guestFrames; i++) {
      guestPcm[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / measuredRate)
    }
    guestPcm[Math.round(SR * (1 + ppm / 1_000_000))] = 0.95
    const rawWav = encodeWavPcm16(guestPcm, 1, SR) // header claims nominal — the lie conform fixes
    const plan = computeConformPlan({
      nominalRate: SR,
      head: syncPair(0, 0),
      tail: syncPair(guestFrames, timelineFrames),
    })
    const correctedWav = await runFfmpegRateCorrection(rawWav, plan, { channels: 1 })
    // ffmpeg's WAV carries extra chunks, so frames are read through
    // the chunk-scanning decoder, not the fixed-offset wavInfo.
    const { pcm } = decodeWavPcm16(correctedWav)
    expect(Math.abs(pcm.length - timelineFrames)).toBeLessThanOrEqual(48) // ≤ 1 ms duration error
    const found = impulsePositions(pcm)
    expect(found.length).toBeGreaterThan(0)
    const impulseError = Math.min(...found.map((pos) => Math.abs(pos - SR)))
    expect(impulseError).toBeLessThan(240) // < 5 ms
    expect(rms(pcm)).toBeGreaterThan(0.15) // the tone survived
  })
})

// ---------------------------------------------------------------------------
// Guest recording lifecycle + journal + disconnect gaps
// ---------------------------------------------------------------------------

describe('POD-11 guest local recorder (journal lifecycle)', () => {
  it('records on the POD-06 journal, bound to (session, invite), with head/tail sync', async () => {
    const storage = new MemoryChunkStorage()
    const recorder = await GuestLocalRecorder.start(storage, binding, syncPair(0, 24_000))
    await recorder.ingest(tone(660, 0.5, 2 * CHUNK))
    const state = await recorder.stop(syncPair(2 * CHUNK, 24_000 + 2 * CHUNK))
    expect(state.phase).toBe('stopped')
    expect(state.headSync).toEqual({ guestTrackSamples: 0, hostTimelineSamples: 24_000 })
    expect(state.tailSync).toEqual({
      guestTrackSamples: 2 * CHUNK,
      hostTimelineSamples: 24_000 + 2 * CHUNK,
    })
    expect(recorder.journalFooter?.totalFrames).toBe(2 * CHUNK)
    const report = await recoverRecording(storage, guestJournalRecordingId(binding))
    expect(report?.complete).toBe(true)
    expect(report?.recoveredFrames).toBe(2 * CHUNK)
    expect(guestRecordingTelemetry(state)).toMatchObject({
      kind: 'guest-recording',
      trackId: binding.trackId,
      chunksJournaled: 2,
      hasHeadSync: true,
      hasTailSync: true,
    })
  })

  it('disconnect with capture stopped journals silence + a named gap; capture continuing leaves no gap', async () => {
    const storage = new MemoryChunkStorage()
    const recorder = await GuestLocalRecorder.start(storage, binding, syncPair(0, 0))
    await recorder.ingest(tone(660, 0.5, 2 * CHUNK))
    recorder.noteDisconnect(1_000)
    await recorder.noteReconnect(2_000) // 1 s of wall time, zero frames captured
    expect(recorder.state.gaps).toEqual([
      { fromGuestSample: 2 * CHUNK, frames: SR, reason: 'disconnect' },
    ])
    await recorder.ingest(tone(660, 0.5, 2 * CHUNK))
    const state = await recorder.stop(syncPair(4 * CHUNK + SR, 4 * CHUNK + SR))
    expect(state.tailSync?.guestTrackSamples).toBe(2 * CHUNK + SR + 2 * CHUNK)

    // The gap conforms as a listed region, NOT stretched: total
    // duration is the full session length and the gap region is silent.
    const chunks = await loadRecoveredChunks(storage, guestJournalRecordingId(binding))
    const sessionFrames = 2 * CHUNK + SR + 2 * CHUNK
    const { track, plan } = conformGuestTrack(
      {
        trackId: binding.trackId,
        chunks,
        head: syncPair(0, 0),
        tail: syncPair(sessionFrames, sessionFrames),
        gaps: state.gaps,
      },
      sessionFrames,
      SR,
    )
    expect(track.frames).toBe(sessionFrames)
    expect(plan.report.gaps).toHaveLength(1)
    expect(plan.report.gaps[0]).toMatchObject({
      fromTimelineSample: 2 * CHUNK,
      frames: SR,
      reason: 'disconnect',
    })
    expect(rms(track.pcm.subarray(2 * CHUNK, 2 * CHUNK + SR))).toBe(0)
    expect(rms(track.pcm.subarray(2 * CHUNK + SR))).toBeGreaterThan(0.3)

    // Second recorder: capture CONTINUES at real-time rate during
    // the disconnect (the local-recording point) → no gap is invented.
    const storage2 = new MemoryChunkStorage()
    const recorder2 = await GuestLocalRecorder.start(storage2, binding, syncPair(0, 0))
    await recorder2.ingest(tone(660, 0.5, CHUNK))
    recorder2.noteDisconnect(1_000)
    await recorder2.ingest(tone(660, 0.5, 2 * CHUNK)) // 0.5 s of audio during 0.5 s of wall time
    await recorder2.noteReconnect(1_500)
    expect(recorder2.state.gaps).toEqual([])
    await recorder2.stop(syncPair(3 * CHUNK, 3 * CHUNK))
  })

  it('lifecycle machine refuses illegal events', () => {
    const state = createGuestRecordingState(binding)
    expect(transitionGuestRecording(state, 'disconnect', { atGuestSample: 0 }).ok).toBe(false)
    expect(transitionGuestRecording(state, 'admit', { atGuestSample: 0 }).ok).toBe(true)
    expect(transitionGuestRecording(state, 'admit', { atGuestSample: 0 }).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Upload: kill at ~50% → resume → no duplicates → checksum → conform runs
// ---------------------------------------------------------------------------

class FakeGuestChunkTransport implements GuestChunkTransport {
  received = new Map<number, Uint8Array>()
  sendLog: number[] = []
  failAfterSends: number | null = null
  completedWith: Parameters<GuestChunkTransport['complete']>[0] | null = null

  async listReceived(): Promise<number[]> {
    return [...this.received.keys()].sort((a, b) => a - b)
  }

  async sendChunk(index: number, bytes: Uint8Array): Promise<void> {
    if (this.failAfterSends !== null && this.sendLog.length >= this.failAfterSends) {
      throw new Error('network down')
    }
    this.sendLog.push(index)
    this.received.set(index, new Uint8Array(bytes))
  }

  async complete(input: Parameters<GuestChunkTransport['complete']>[0]): Promise<{ ok: true }> {
    this.completedWith = input
    return { ok: true }
  }
}

class FakeUploadTransport implements UploadTransport {
  private sessions = new Map<
    string,
    { chunkSize: number; size: number; chunks: Map<number, Uint8Array> }
  >()
  private nextId = 1
  failAfterWrites: number | null = null
  writes = 0

  constructor(private readonly chunkSize: number) {}

  async create(input: { filename: string; size: number }) {
    const id = `up-${this.nextId++}`
    this.sessions.set(id, { chunkSize: this.chunkSize, size: input.size, chunks: new Map() })
    return { id, chunkSize: this.chunkSize }
  }

  async write(sessionId: string, index: number, _start: number, _total: number, bytes: Uint8Array) {
    this.writes++
    if (this.failAfterWrites !== null && this.writes > this.failAfterWrites) {
      throw new Error('network down')
    }
    this.sessions.get(sessionId)!.chunks.set(index, new Uint8Array(bytes))
  }

  async read(sessionId: string) {
    const session = this.sessions.get(sessionId)!
    return {
      id: sessionId,
      state: 'open',
      chunkSize: session.chunkSize,
      expectedSize: session.size,
      receivedChunks: [...session.chunks.keys()].sort((a, b) => a - b),
    }
  }

  async finalize(sessionId: string) {
    return { id: `asset-${sessionId}` }
  }
}

describe('POD-11 resumable guest upload', () => {
  it('chunk protocol: killed at ~50%, fresh uploader resumes from the received list with no duplicates, checksum matches, conform runs', async () => {
    const storage = new MemoryChunkStorage()
    const recorder = await GuestLocalRecorder.start(storage, binding, syncPair(0, 0))
    await recorder.ingest(tone(660, 0.5, 6 * CHUNK))
    const state = await recorder.stop(syncPair(6 * CHUNK, 6 * CHUNK))
    const journal = recorder.journalRef!
    const footer = recorder.journalFooter!

    const transport = new FakeGuestChunkTransport()
    transport.failAfterSends = 3 // 3 of 6 chunks land, then the network dies
    const first = await new GuestChunkUploader(transport, storage, journal).pump()
    expect(first.failedAtChunk).toBe(3)
    expect(first.sentChunks).toEqual([0, 1, 2])

    transport.failAfterSends = null
    const resumed = new GuestChunkUploader(transport, storage, journal)
    const finished = await resumed.finish({
      headSync: state.headSync!,
      tailSync: state.tailSync!,
      gaps: state.gaps,
      footer,
    })
    expect(finished.complete).toBe(true)
    expect(finished.skippedAckedChunks).toEqual([0, 1, 2]) // acked chunks never re-sent
    expect(transport.sendLog).toEqual([0, 1, 2, 3, 4, 5]) // no duplicates anywhere
    expect(transport.completedWith?.checksum).toBe(footer.checksum)
    expect(transport.completedWith?.totalFrames).toBe(6 * CHUNK)

    // The uploaded bytes reassemble to the journal's track, and the
    // track conforms (readiness ok on the recovered journal).
    const report = await recoverRecording(storage, guestJournalRecordingId(binding))
    expect(evaluateConformReadiness(report, footer.totalChunks)).toEqual({ ok: true })
    const chunks = await loadRecoveredChunks(storage, guestJournalRecordingId(binding))
    const { track } = conformGuestTrack(
      {
        trackId: binding.trackId,
        chunks,
        head: state.headSync!,
        tail: state.tailSync!,
      },
      6 * CHUNK,
      SR,
    )
    expect(rms(track.pcm)).toBeGreaterThan(0.3)
    expect(sha256Hex(encodeWavPcm16(track.pcm, 1, SR))).toHaveLength(64)
  })

  it('POD-06 bridge path: pump fails mid-upload, resume completes with every chunk acked', async () => {
    const storage = new MemoryChunkStorage()
    const transport = new FakeUploadTransport(CHUNK * 2)
    const recorder = await GuestLocalRecorder.start(storage, binding, syncPair(0, 0), {
      uploadTransport: transport,
    })
    await recorder.ingest(tone(660, 0.5, 4 * CHUNK))
    await recorder.stop(syncPair(4 * CHUNK, 4 * CHUNK))
    transport.failAfterWrites = 2 // half the upload chunks land
    const first = await recorder.pumpBridgeUpload('guest.pcm')
    expect(first.acked).toBeLessThan(first.total)
    expect(recorder.state.phase).toBe('failed')
    transport.failAfterWrites = null
    const second = await recorder.pumpBridgeUpload('guest.pcm')
    expect(second.acked).toBe(second.total)
    expect(recorder.state.phase).toBe('uploaded')
  })
})

// ---------------------------------------------------------------------------
// Fallback ladder + readiness + chunk-upload authorization
// ---------------------------------------------------------------------------

describe('POD-11 fallback ladder (the guest is never silently lost)', () => {
  const okReadiness = evaluateConformReadiness(
    { complete: true, checksumsVerified: true, admittedChunks: [0, 1], recoveredFrames: 2 * CHUNK },
    2,
  )
  const incompleteReadiness = evaluateConformReadiness(
    { complete: false, checksumsVerified: true, admittedChunks: [0], recoveredFrames: CHUNK },
    2,
  )

  it('readiness names its refusal states', () => {
    expect(okReadiness).toEqual({ ok: true })
    expect(evaluateConformReadiness(null)).toMatchObject({ state: 'track-missing' })
    expect(incompleteReadiness).toMatchObject({ state: 'track-incomplete' })
    expect(
      evaluateConformReadiness(
        { complete: true, checksumsVerified: false, admittedChunks: [0], recoveredFrames: CHUNK },
        1,
      ),
    ).toMatchObject({ state: 'track-checksum-failed' })
  })

  it('decides all three rungs', () => {
    expect(
      decideGuestTrackFallback({
        guestLabel: 'Ada',
        local: { present: true, readiness: okReadiness },
        liveCapture: { present: true },
      }),
    ).toMatchObject({ rung: 1, state: 'conformed', degraded: false })
    const rung2 = decideGuestTrackFallback({
      guestLabel: 'Ada',
      local: { present: true, readiness: incompleteReadiness },
      liveCapture: { present: true },
    })
    expect(rung2).toMatchObject({ rung: 2, state: 'degraded-live-capture', degraded: true })
    expect(rung2.manifestError).toContain('degraded: live-capture')
    const rung3 = decideGuestTrackFallback({
      guestLabel: 'Ada',
      local: { present: false, readiness: evaluateConformReadiness(null) },
      liveCapture: { present: false },
    })
    expect(rung3).toMatchObject({ rung: 3, state: 'missing-gap', degraded: true })
    expect(rung3.manifestError).toContain('guest track missing')
  })

  it('assembles rung 2 from live capture (marked degraded) and rung 3 as a named full-range gap', () => {
    const sessionFrames = 2 * CHUNK
    const rung2 = assembleGuestWithFallback(
      {
        trackId: binding.trackId,
        guestLabel: 'Ada',
        local: null,
        liveCapture: {
          chunks: [{ startSample: 0, pcm: tone(660, 0.5, sessionFrames) }],
          joinedAtSample: 0,
        },
      },
      sessionFrames,
      SR,
    )
    expect(rung2.decision.rung).toBe(2)
    expect(rung2.track.degraded).toBe(true)
    expect(rung2.track.errors.join(' ')).toContain('degraded: live-capture')
    expect(rms(rung2.track.pcm)).toBeGreaterThan(0.3)

    const rung3 = assembleGuestWithFallback(
      {
        trackId: binding.trackId,
        guestLabel: 'Ada',
        local: null,
        liveCapture: null,
      },
      sessionFrames,
      SR,
    )
    expect(rung3.decision.rung).toBe(3)
    expect(rung3.track.degraded).toBe(true)
    expect(rung3.track.pcm.every((s) => s === 0)).toBe(true)
    expect(rung3.track.gaps.some((gap) => gap.frames === sessionFrames)).toBe(true)
    expect(rung3.track.errors.join(' ')).toContain('guest track missing')
  })

  it('chunk-upload verdicts: cross-session refused, pre-admission refused, oversize refused', () => {
    const base = { inviteSessionId: 'rec-a', sessionId: 'rec-a', index: 0, byteLength: 24_000 }
    expect(validateGuestChunkUpload({ ...base, lobbyState: 'admitted' })).toEqual({ ok: true })
    expect(validateGuestChunkUpload({ ...base, lobbyState: 'left' })).toEqual({ ok: true })
    expect(
      validateGuestChunkUpload({ ...base, lobbyState: 'admitted', sessionId: 'rec-b' }),
    ).toMatchObject({ code: 'chunk-wrong-session' })
    expect(validateGuestChunkUpload({ ...base, lobbyState: 'waiting' })).toMatchObject({
      code: 'chunk-not-admitted',
    })
    expect(
      validateGuestChunkUpload({ ...base, lobbyState: 'admitted', byteLength: 24_002 }),
    ).toMatchObject({ code: 'chunk-too-large' })
    expect(validateGuestChunkUpload({ ...base, lobbyState: 'admitted', index: -1 })).toMatchObject({
      code: 'chunk-bad-index',
    })
  })
})
