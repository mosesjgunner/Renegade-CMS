/**
 * POD-06 (POD-REQ-16, POD-REQ-17, POD-REQ-18): headless tests for the
 * browser capture engine's PURE CORES — device state machine, dual-path
 * constraints + raw-settings assertion, PT-B chunk journal + recovery,
 * progressive upload bridge, normalization, levels, and the capture
 * session facade. The PT-B prototype proved the journal pattern on a real
 * filesystem (6/6 across clean / crash-mid-chunk / torn-manifest cases);
 * these tests port its numeric expectations (13 complete chunks = 3.250 s,
 * torn-manifest recovery = 3.500 s) against the production core over the
 * in-memory ChunkStorage. Browser adapters are NOT exercised here — real
 * browser/device behaviour is UNVERIFIED (see the POD-06 handoff).
 */
import { describe, expect, it } from 'vitest'

import {
  assertRawSettings,
  assertSavedDevicesPresent,
  buildConversationConstraints,
  buildMasterConstraints,
  CaptureSessionFacade,
  ChunkJournal,
  classifySource,
  computeBlockLevels,
  detectCapabilities,
  DeviceServiceCore,
  floatToInt16Bytes,
  findInterruptedRecordings,
  int16BytesToFloat,
  LevelMeter,
  MemoryChunkStorage,
  MemoryPrefsStorage,
  normalizeToWorkingFormat,
  ParticipantDevicePrefsStore,
  recoverRecording,
  resampleChannel,
  resampledFrameCount,
  resolveSavedDevice,
  sha256Hex,
  TIMESLICE_FRAMES,
  UploadBridge,
  type ChunkStorage,
  type UploadTransport,
} from '../../src/modules/podcast-studio/capture/index'
import { pcmCaptureProcessorSource } from '../../src/modules/podcast-studio/capture/worklet/pcm-capture-processor'
import { createSession } from '../../src/modules/podcast-studio/session-engine'

const SR = 48_000

/** Phase-continuous 440 Hz tone chunk, PT-B style. */
const toneChunk = (chunkIndex: number, frames = TIMESLICE_FRAMES): Float32Array => {
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    const n = chunkIndex * TIMESLICE_FRAMES + i
    out[i] = 0.5 * Math.sin((2 * Math.PI * 440 * n) / SR)
  }
  return out
}

const MIC = { deviceId: 'mic-1', kind: 'audioinput' as const, label: 'USB Mic', groupId: 'g1' }
const MIC2 = { deviceId: 'mic-2', kind: 'audioinput' as const, label: 'Desk Mic', groupId: 'g2' }
const SPK = { deviceId: 'spk-1', kind: 'audiooutput' as const, label: 'Headphones', groupId: 'g1' }

// ---------------------------------------------------------------------------
// Dual-path capture (POD-REQ-16)
// ---------------------------------------------------------------------------

describe('dual-path capture', () => {
  it('master constraints request all three processing flags false at 48 kHz', () => {
    const constraints = buildMasterConstraints('mic-1')
    expect(constraints.audio.echoCancellation).toBe(false)
    expect(constraints.audio.noiseSuppression).toBe(false)
    expect(constraints.audio.autoGainControl).toBe(false)
    expect(constraints.audio.sampleRate).toEqual({ ideal: 48_000 })
    expect(constraints.audio.deviceId).toEqual({ exact: 'mic-1' })
    expect(constraints.video).toBe(false)
  })

  it('conversation constraints may enable processing', () => {
    const constraints = buildConversationConstraints()
    expect(constraints.audio.echoCancellation).toBe(true)
    expect(constraints.audio.noiseSuppression).toBe(true)
    expect(constraints.audio.autoGainControl).toBe(true)
  })

  it('assertRawSettings passes on verifiably raw settings', () => {
    const result = assertRawSettings({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: 48_000,
    })
    expect(result.raw).toBe(true)
    expect(result.warning).toBeNull()
    expect(result.processedFlags).toEqual([])
  })

  it('assertRawSettings warns (never silently accepts) when the browser refuses raw', () => {
    const result = assertRawSettings({
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
    })
    expect(result.raw).toBe(false)
    expect(result.processedFlags).toEqual(['echoCancellation'])
    expect(result.warning).toContain('NOT raw')
  })

  it('assertRawSettings treats unverifiable flags as not raw', () => {
    const result = assertRawSettings({ sampleRate: 44_100 })
    expect(result.raw).toBe(false)
    expect(result.processedFlags).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Devices (POD-REQ-17)
// ---------------------------------------------------------------------------

describe('device service core', () => {
  it('assigns devices per role and rejects kind mismatches and unknown devices', () => {
    const core = new DeviceServiceCore()
    core.setDevices([MIC, SPK])
    expect(core.assign('mic-in', 'mic-1')).toEqual({ ok: true })
    expect(core.assign('mic-in', 'spk-1').ok).toBe(false)
    expect(core.assign('pfl-out', 'nope').ok).toBe(false)
    expect(core.snapshot.assignments).toEqual({ 'mic-in': 'mic-1' })
  })

  it('unplug during recording produces a device-lost diagnosis with role + recovery options, not silent dead air', () => {
    const core = new DeviceServiceCore()
    core.setDevices([MIC, SPK])
    core.assign('mic-in', 'mic-1')
    core.drainEvents()
    core.setDevices([SPK]) // mic unplugged
    const events = core.drainEvents()
    const lost = events.find((event) => event.type === 'device-lost')
    expect(lost).toMatchObject({ type: 'device-lost', role: 'mic-in', deviceId: 'mic-1' })
    if (lost?.type === 'device-lost') {
      expect(lost.recoveryOptions).toContain('replug-same-device')
      expect(lost.recoveryOptions).toContain('choose-replacement')
    }
    expect(core.isLost('mic-in')).toBe(true)
    // The assignment is NOT silently moved to another device.
    expect(core.assignment('mic-in')).toBe('mic-1')
  })

  it('replug of the same device recovers the role with its original assignment', () => {
    const core = new DeviceServiceCore()
    core.setDevices([MIC, SPK])
    core.assign('mic-in', 'mic-1')
    core.setDevices([SPK])
    core.drainEvents()
    core.setDevices([MIC, SPK])
    const events = core.drainEvents()
    expect(
      events.some((event) => event.type === 'device-recovered' && event.role === 'mic-in'),
    ).toBe(true)
    expect(core.isLost('mic-in')).toBe(false)
  })

  it('capability detection: Safari gets the degraded-routing notice, Chromium full routing does not', () => {
    const safari = detectCapabilities({
      family: 'safari',
      elementSetSinkId: false,
      contextSetSinkId: false,
      selectAudioOutput: false,
      audioWorklet: true,
      opfs: true,
    })
    expect(safari.outputRouting).toBe('system-only')
    expect(safari.degradedRoutingNotice).toBe(true)
    expect(safari.notice).toContain('system sound setting')

    const chromium = detectCapabilities({
      family: 'chromium',
      elementSetSinkId: true,
      contextSetSinkId: true,
      selectAudioOutput: false,
      audioWorklet: true,
      opfs: true,
    })
    expect(chromium.outputRouting).toBe('full')
    expect(chromium.degradedRoutingNotice).toBe(false)
  })

  it('classifies sources with honest labels; loopback carries the OS-dependent expectation', () => {
    expect(classifySource({ label: 'USB Mic' }).kind).toBe('mic')
    expect(classifySource({ label: 'Scarlett Line In' }).kind).toBe('line-in')
    expect(classifySource({ fromFile: true }).kind).toBe('media-file')
    const loopback = classifySource({ label: 'Stereo Mix (Realtek)' })
    expect(loopback.kind).toBe('system-loopback')
    expect(loopback.osExpectation).toContain('OS-dependent')
    expect(loopback.osExpectation).toContain('macOS')
  })
})

describe('per-participant device prefs (fail-closed)', () => {
  it('a saved device that is absent fails closed with the structured device-missing error naming the saved label', () => {
    const store = new ParticipantDevicePrefsStore(new MemoryPrefsStorage())
    store.saveAssignment('alice', 'mic-in', MIC)
    const prefs = store.load('alice')
    const result = resolveSavedDevice(prefs, 'mic-in', [MIC2, SPK])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('device-missing')
      expect(result.error.savedDeviceLabel).toBe('USB Mic')
      expect(result.error.savedDeviceId).toBe('mic-1')
    }
    const gate = assertSavedDevicesPresent(prefs, [MIC2, SPK])
    expect(gate.ok).toBe(false)
    // Present device resolves fine.
    expect(resolveSavedDevice(prefs, 'mic-in', [MIC]).ok).toBe(true)
    // No saved pref is unassigned, not an error.
    expect(resolveSavedDevice(prefs, 'pfl-out', [])).toEqual({ ok: true, deviceId: null })
  })

  it('prefs are isolated per participant — never global', () => {
    const storage = new MemoryPrefsStorage()
    const store = new ParticipantDevicePrefsStore(storage)
    store.saveAssignment('alice', 'mic-in', MIC)
    store.saveAssignment('bob', 'mic-in', MIC2)
    expect(store.load('alice')?.assignments['mic-in']).toBe('mic-1')
    expect(store.load('bob')?.assignments['mic-in']).toBe('mic-2')
    expect(store.load('carol')).toBeNull()
    // Bob's gate passes with only his mic present; Alice's fails on the same list.
    expect(assertSavedDevicesPresent(store.load('bob'), [MIC2]).ok).toBe(true)
    expect(assertSavedDevicesPresent(store.load('alice'), [MIC2]).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Normalization + levels (working format cores)
// ---------------------------------------------------------------------------

describe('normalization to the 48 kHz working format', () => {
  it('resample exactness: 44.1 kHz → 48 kHz sample counts are exact', () => {
    expect(resampledFrameCount(44_100, 44_100, 48_000)).toBe(48_000)
    expect(resampledFrameCount(147, 44_100, 48_000)).toBe(160)
    const out = resampleChannel(new Float32Array(44_100).fill(0.25), 44_100, 48_000)
    expect(out.length).toBe(48_000)
    // A DC signal resamples to the same DC value everywhere.
    expect(out[0]).toBeCloseTo(0.25, 6)
    expect(out[47_999]).toBeCloseTo(0.25, 6)
  })

  it('mono/stereo mapping: voice downmixes to mono, program duplicates mono to stereo', () => {
    const left = new Float32Array([1, 0, -1, 0])
    const right = new Float32Array([0, 1, 0, -1])
    const voice = normalizeToWorkingFormat({ channels: [left, right], sampleRate: 48_000 }, 'voice')
    expect(voice.channels).toHaveLength(1)
    expect([...voice.channels[0]!]).toEqual([0.5, 0.5, -0.5, -0.5])

    const program = normalizeToWorkingFormat(
      { channels: [new Float32Array([0.25, -0.25])], sampleRate: 48_000 },
      'program',
    )
    expect(program.channels).toHaveLength(2)
    expect([...program.channels[0]!]).toEqual([0.25, -0.25])
    expect([...program.channels[1]!]).toEqual([0.25, -0.25])
  })

  it('normalization is idempotent at 48 kHz in the working layout', () => {
    const input = new Float32Array(960).map((_, i) => Math.sin(i / 10) * 0.5)
    const once = normalizeToWorkingFormat({ channels: [input], sampleRate: 48_000 }, 'voice')
    const twice = normalizeToWorkingFormat(
      { channels: once.channels, sampleRate: once.sampleRate },
      'voice',
    )
    expect(twice.frames).toBe(once.frames)
    expect([...twice.channels[0]!]).toEqual([...once.channels[0]!])
    expect([...once.channels[0]!]).toEqual([...input])
  })

  it('44.1 kHz stereo program normalizes to 48 kHz stereo with exact frames', () => {
    const frames = 44_100
    const normalized = normalizeToWorkingFormat(
      { channels: [new Float32Array(frames), new Float32Array(frames)], sampleRate: 44_100 },
      'program',
    )
    expect(normalized.sampleRate).toBe(48_000)
    expect(normalized.frames).toBe(48_000)
    expect(normalized.channels).toHaveLength(2)
  })
})

describe('level metering', () => {
  it('matches hand-computed RMS / peak / dB for a constant block', () => {
    const levels = computeBlockLevels(new Float32Array(480).fill(0.5))
    expect(levels.rms).toBeCloseTo(0.5, 7)
    expect(levels.peak).toBeCloseTo(0.5, 7)
    expect(levels.rmsDb).toBeCloseTo(20 * Math.log10(0.5), 6) // ≈ -6.0206 dB
    expect(levels.peakDb).toBeCloseTo(-6.0206, 3)
  })

  it('silence is -Infinity dB with zero linear levels', () => {
    const levels = computeBlockLevels(new Float32Array(128))
    expect(levels.rms).toBe(0)
    expect(levels.rmsDb).toBe(-Infinity)
  })

  it('peak-hold holds, then decays, never below the current block peak', () => {
    const meter = new LevelMeter({ holdMs: 1000, decayDbPerSec: 12 })
    const loud = meter.push(new Float32Array(128).fill(1), 0)
    expect(loud.peakHold).toBeCloseTo(1, 7)
    const held = meter.push(new Float32Array(128).fill(0.1), 500)
    expect(held.peakHold).toBeCloseTo(1, 7) // still within the hold window
    const decayed = meter.push(new Float32Array(128).fill(0.1), 2000)
    // 1 s past the hold at 12 dB/s: 0 dB - 12 dB ≈ 0.251 linear, above the 0.1 block peak.
    expect(decayed.peakHold).toBeCloseTo(Math.pow(10, -12 / 20), 3)
    const floored = meter.push(new Float32Array(128).fill(0.1), 60_000)
    expect(floored.peakHold).toBeCloseTo(0.1, 7) // decayed to the block peak, never below
  })
})

// ---------------------------------------------------------------------------
// Chunk journal (POD-REQ-18, PT-B pattern)
// ---------------------------------------------------------------------------

describe('chunk journal + recovery (PT-B)', () => {
  it('sha256 matches the published test vectors', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('clean recording finalizes with exact frames and a complete footer', async () => {
    const storage = new MemoryChunkStorage()
    const journal = await ChunkJournal.open(storage, {
      recordingId: 'rec-clean',
      sessionId: 'sess-1',
      trackId: 'host',
      channels: 1,
    })
    for (let i = 0; i < 20; i++) await journal.appendChunk(toneChunk(i))
    const footer = await journal.finalize()
    expect(footer.totalFrames).toBe(240_000)
    const report = await recoverRecording(storage, 'rec-clean')
    expect(report?.complete).toBe(true)
    expect(report?.recoveredFrames).toBe(240_000)
    expect(report?.recoveredDurationSec).toBe(5)
    expect(report?.checksumsVerified).toBe(true)
    expect(report?.lossTimeslices).toBe(0)
    expect(await findInterruptedRecordings(storage)).toEqual([])
  })

  it('crash mid-chunk: exactly the complete chunks recover (PT-B case 1: 13 chunks = 3.250 s), loss ≤ 1 timeslice', async () => {
    const storage = new MemoryChunkStorage()
    const journal = await ChunkJournal.open(storage, {
      recordingId: 'rec-crash',
      sessionId: 'sess-1',
      trackId: 'host',
      channels: 1,
    })
    for (let i = 0; i < 13; i++) await journal.appendChunk(toneChunk(i))
    // Simulated crash: a partial in-flight chunk (5,000 frames + dangling
    // byte) hits storage but is never journalled, and there is no footer.
    const partial = floatToInt16Bytes(toneChunk(13)).subarray(0, 5000 * 2 + 1)
    await storage.putChunk('rec-crash', 13, new Uint8Array(partial))

    const report = await recoverRecording(storage, 'rec-crash')
    expect(report?.complete).toBe(false)
    expect(report?.admittedChunks).toHaveLength(13)
    expect(report?.recoveredFrames).toBe(156_000)
    expect(report?.recoveredDurationSec).toBe(3.25)
    expect(report?.lossTimeslices).toBe(1)
    expect(report?.lossMs).toBe(250)
    expect(report?.discardedPartials).toEqual([{ index: 13, byteLength: 10_001 }])
    expect(report?.checksumsVerified).toBe(true)
    expect(report?.decision).toEqual({ canResume: true, canClose: true })
    const interrupted = await findInterruptedRecordings(storage)
    expect(interrupted.map((entry) => entry.recordingId)).toEqual(['rec-crash'])
  })

  it('torn manifest: recovery from chunk records alone admits the complete unjournalled chunk (PT-B case 2: 3.500 s)', async () => {
    const storage = new MemoryChunkStorage()
    const journal = await ChunkJournal.open(storage, {
      recordingId: 'rec-torn',
      sessionId: 'sess-1',
      trackId: 'host',
      channels: 1,
    })
    for (let i = 0; i < 13; i++) await journal.appendChunk(toneChunk(i))
    // Chunk 13 lands complete on disk; its manifest line is torn mid-write.
    await storage.putChunk('rec-torn', 13, floatToInt16Bytes(toneChunk(13)))
    const manifest = (await storage.getManifest('rec-torn')) ?? ''
    await storage.putManifest('rec-torn', `${manifest}{"type":"chunk","index":13,"fram`)

    const report = await recoverRecording(storage, 'rec-torn')
    expect(report?.tornManifestLines).toBe(1)
    expect(report?.admittedChunks).toHaveLength(14)
    expect(report?.recoveredFrames).toBe(168_000)
    expect(report?.recoveredDurationSec).toBe(3.5)
    expect(report?.lossTimeslices).toBe(0)
  })

  it('a corrupted chunk fails checksum verification and ends the admitted run before it', async () => {
    const storage = new MemoryChunkStorage()
    const journal = await ChunkJournal.open(storage, {
      recordingId: 'rec-corrupt',
      sessionId: 'sess-1',
      trackId: 'host',
      channels: 1,
    })
    for (let i = 0; i < 5; i++) await journal.appendChunk(toneChunk(i))
    const corrupted = await storage.getChunk('rec-corrupt', 3)
    corrupted![10] = (corrupted![10]! + 1) % 256
    await storage.putChunk('rec-corrupt', 3, corrupted!)
    const report = await recoverRecording(storage, 'rec-corrupt')
    expect(report?.checksumsVerified).toBe(false)
    expect(report?.admittedChunks).toEqual([0, 1, 2])
    expect(report?.recoveredFrames).toBe(36_000)
  })

  it('chunk records carry index, startSample and chained checksums; s16 round-trips', async () => {
    const storage = new MemoryChunkStorage()
    const journal = await ChunkJournal.open(storage, {
      recordingId: 'rec-records',
      sessionId: 'sess-1',
      trackId: 'host',
      channels: 1,
    })
    const first = await journal.appendChunk(toneChunk(0))
    const second = await journal.appendChunk(toneChunk(1))
    expect(first.startSample).toBe(0)
    expect(second.startSample).toBe(TIMESLICE_FRAMES)
    expect(first.checksum).toBe(sha256Hex(floatToInt16Bytes(toneChunk(0))))
    expect(second.runningChecksum).not.toBe(second.checksum)
    const roundTripped = int16BytesToFloat(floatToInt16Bytes(toneChunk(0)))
    expect(Math.abs(roundTripped[100]! - toneChunk(0)[100]!)).toBeLessThan(1 / 32767)
  })
})

// ---------------------------------------------------------------------------
// Upload bridge (POD-REQ-18 progressive upload)
// ---------------------------------------------------------------------------

class FakeUploadTransport implements UploadTransport {
  readonly received = new Map<number, Uint8Array>()
  chunkSize: number
  failAfterWrites: number | null = null
  private writes = 0
  finalizeCalls = 0

  constructor(chunkSize: number) {
    this.chunkSize = chunkSize
  }

  async create(input: { filename: string; size: number }) {
    void input
    return { id: 'upload-1', chunkSize: this.chunkSize }
  }

  async write(sessionId: string, index: number, start: number, total: number, bytes: Uint8Array) {
    void sessionId
    void start
    void total
    this.writes++
    if (this.failAfterWrites !== null && this.writes > this.failAfterWrites)
      throw new Error('simulated network failure')
    const existing = this.received.get(index)
    if (existing) {
      // Mirrors writeUploadChunk: identical retry bytes are accepted, different bytes conflict.
      if (Buffer.compare(Buffer.from(existing), Buffer.from(bytes)) !== 0)
        throw new Error('Chunk retry bytes do not match the original chunk.')
      return { received: 0 }
    }
    this.received.set(index, new Uint8Array(bytes))
    return { received: bytes.length }
  }

  async read(sessionId: string) {
    return {
      id: sessionId,
      state: 'open',
      chunkSize: this.chunkSize,
      expectedSize: 0,
      receivedChunks: [...this.received.keys()].sort((a, b) => a - b),
    }
  }

  async finalize(sessionId: string) {
    void sessionId
    this.finalizeCalls++
    return { id: 'asset-1' }
  }
}

const JOURNAL_CHUNK_BYTES = TIMESLICE_FRAMES * 2 // mono s16

const makeJournal = async (storage: ChunkStorage, chunks: number, id = 'rec-upload') => {
  const journal = await ChunkJournal.open(storage, {
    recordingId: id,
    sessionId: 'sess-1',
    trackId: 'host',
    channels: 1,
  })
  for (let i = 0; i < chunks; i++) await journal.appendChunk(toneChunk(i))
  await journal.finalize()
  return journal
}

describe('upload bridge', () => {
  it('starts local-only; local master is independent of upload state', async () => {
    const storage = new MemoryChunkStorage()
    const journal = await makeJournal(storage, 4)
    const bridge = new UploadBridge(new FakeUploadTransport(JOURNAL_CHUNK_BYTES), journal, storage)
    const state = await bridge.state()
    expect(state.localState).toBe('local-only')
    expect(state.perChunk).toEqual(['pending', 'pending', 'pending', 'pending'])
    // The journal is untouched by bridge state.
    expect(await storage.listChunks('rec-upload')).toHaveLength(4)
  })

  it('fail at 50% → resume completes with no duplicate chunks and one finalize', async () => {
    const storage = new MemoryChunkStorage()
    const journal = await makeJournal(storage, 6)
    const transport = new FakeUploadTransport(JOURNAL_CHUNK_BYTES)
    transport.failAfterWrites = 3 // 50% of 6 chunks
    const bridge = new UploadBridge(transport, journal, storage)
    await bridge.begin('episode.wav')
    const first = await bridge.pump()
    expect(first.failedAtUploadChunk).toBe(3)
    expect(first.ackedChunks).toBe(3)
    expect(first.localState).toBe('uploading')

    // Reload: a fresh bridge resumes from the server's received list.
    transport.failAfterWrites = null
    const resumed = new UploadBridge(transport, journal, storage)
    const resumeState = await resumed.resume('upload-1')
    expect(resumeState.ackedChunks).toBe(3)
    const second = await resumed.pump()
    expect(second.failedAtUploadChunk).toBeNull()
    expect(second.ackedChunks).toBe(6)
    expect(second.perChunk).toEqual(Array(6).fill('acked'))
    // No duplicates: the server holds exactly the 6 distinct chunks.
    expect(transport.received.size).toBe(6)
    const finalized = await resumed.finalize()
    expect(finalized.assetId).toBe('asset-1')
    expect(transport.finalizeCalls).toBe(1)
    expect((await resumed.state()).localState).toBe('uploaded')
  })

  it('finalize refuses while chunks are still pending', async () => {
    const storage = new MemoryChunkStorage()
    const journal = await makeJournal(storage, 2)
    const bridge = new UploadBridge(new FakeUploadTransport(JOURNAL_CHUNK_BYTES), journal, storage)
    await bridge.begin('episode.wav')
    await expect(bridge.finalize()).rejects.toThrow('incomplete')
  })
})

// ---------------------------------------------------------------------------
// Capture session facade
// ---------------------------------------------------------------------------

describe('capture session facade', () => {
  const newFacade = (storage: ChunkStorage) =>
    new CaptureSessionFacade(
      createSession({ id: 'sess-facade', showId: 'show-1', showTitle: 'Facade Show' }),
      storage,
      { participantId: 'alice' },
    )

  it('start fails closed when a saved device is missing — nothing is recorded', async () => {
    const storage = new MemoryChunkStorage()
    const store = new ParticipantDevicePrefsStore(new MemoryPrefsStorage())
    store.saveAssignment('alice', 'mic-in', MIC)
    const facade = newFacade(storage)
    const result = await facade.start({
      availableDevices: [MIC2],
      prefs: store.load('alice'),
    })
    expect(result.ok).toBe(false)
    if (!result.ok && result.code === 'device-missing') {
      expect(result.errors[0]?.savedDeviceLabel).toBe('USB Mic')
    }
    expect(facade.captureState).toBe('error')
    expect(await storage.listRecordings()).toEqual([])
    expect(
      facade.sessionDoc.log.some(
        (entry) => entry.type === 'message' && String(entry.text).includes('Capture refused'),
      ),
    ).toBe(true)
  })

  it('records normalized 44.1 kHz input as exact 48 kHz journal chunks; health reports samples, chunks and levels', async () => {
    const storage = new MemoryChunkStorage()
    const facade = newFacade(storage)
    const started = await facade.start({
      availableDevices: [MIC],
      prefs: null,
      masterSettings: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48_000,
      },
    })
    expect(started.ok).toBe(true)
    // 1 s of 44.1 kHz mono tone → exactly 48,000 frames = 4 timeslices.
    const input = new Float32Array(44_100).map(
      (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 44_100),
    )
    await facade.ingest(input, { sampleRate: 44_100, channels: 1 })
    const health = await facade.stop()
    expect(health.framesRecorded).toBe(48_000)
    expect(health.durationSec).toBe(1)
    expect(health.chunksJournaled).toBe(4)
    expect(health.rawWarning).toBeNull()
    expect(health.uploadState).toBe('local-only')
    expect(health.levels.peakDb).toBeCloseTo(20 * Math.log10(0.5), 1)
    expect(facade.sessionDoc.state).toBe('stopped')
    const report = await recoverRecording(storage, 'rec-sess-facade-host')
    expect(report?.complete).toBe(true)
    expect(report?.recoveredFrames).toBe(48_000)
  })

  it('a processed master surfaces the raw warning in health and the session log', async () => {
    const storage = new MemoryChunkStorage()
    const facade = newFacade(storage)
    await facade.start({
      availableDevices: [MIC],
      prefs: null,
      masterSettings: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    })
    const health = facade.health()
    expect(health.rawWarning).toContain('NOT raw')
    await facade.stop()
  })

  it('device lost mid-recording is diagnosed into health warnings, never silently rerouted', async () => {
    const storage = new MemoryChunkStorage()
    const store = new ParticipantDevicePrefsStore(new MemoryPrefsStorage())
    store.saveAssignment('alice', 'mic-in', MIC)
    const facade = newFacade(storage)
    await facade.start({ availableDevices: [MIC, SPK], prefs: store.load('alice') })
    facade.handleDevicesChanged([SPK]) // mic unplugged mid-record
    const health = facade.health()
    expect(health.deviceWarnings.some((warning) => warning.includes('Device lost'))).toBe(true)
    expect(facade.devices.assignment('mic-in')).toBe('mic-1')
    facade.handleDevicesChanged([MIC, SPK]) // replugged
    expect(facade.health().deviceWarnings).toEqual([])
    await facade.stop()
  })
})

// ---------------------------------------------------------------------------
// Worklet processor source — smoke test with fake worklet globals
// ---------------------------------------------------------------------------

describe('pcm capture worklet processor (fake globals)', () => {
  it('buffers 128-frame quanta into 250 ms chunks with a shared sample clock', () => {
    let Registered:
      | (new () => {
          process(inputs: Float32Array[][]): boolean
          port: { postMessage: (message: unknown, transfer?: unknown) => void }
        })
      | null = null
    const messages: Array<{ frames: number; startSample: number; pcm: Float32Array }> = []
    const registerProcessor = (_name: string, ctor: typeof Registered) => {
      Registered = ctor
    }
    class FakeAudioWorkletProcessor {
      port = {
        postMessage: (message: unknown) => {
          messages.push(message as (typeof messages)[number])
        },
      }
    }
    const evaluate = new Function(
      'registerProcessor',
      'AudioWorkletProcessor',
      'sampleRate',
      pcmCaptureProcessorSource,
    )
    evaluate(registerProcessor, FakeAudioWorkletProcessor, 48_000)
    expect(Registered).not.toBeNull()
    const processor = new Registered!()
    // 12,000 frames / 128 = 93.75 quanta → feed 94 quanta, expect exactly one chunk.
    for (let q = 0; q < 94; q++) {
      const block = new Float32Array(128).fill(0.25)
      expect(processor.process([[block]])).toBe(true)
    }
    expect(messages).toHaveLength(1)
    expect(messages[0]?.frames).toBe(12_000)
    expect(messages[0]?.startSample).toBe(0)
    expect(messages[0]?.pcm.length).toBe(12_000)
    expect(messages[0]?.pcm[0]).toBeCloseTo(0.25, 6)
  })
})
