/**
 * POD-09 (POD-REQ-19, POD-REQ-20): headless tests for the multitrack
 * recording layer — recorder core (program + ISO over the POD-06
 * journal), assembly/finalize engine, PT-F drift estimation +
 * correction, recording session state + guards, and the retention
 * policy. All over synthetic PCM and in-memory / temp-directory
 * storage; NO real browser, device or network is exercised (the
 * browser adapter stays UNVERIFIED — see the POD-09 handoff).
 *
 * Mandatory failure proofs covered here:
 * - tab-crash mid-record → POD-06 recovery scan across ALL tracks,
 *   alignment intact, loss ≤ 1 chunk per track;
 * - upload interrupted at ~50% → resume → assembled output identical
 *   to the uninterrupted control (byte equality at the blob layer,
 *   checksum equality at the WAV layer);
 * - one track's chunks corrupted → that track flagged degraded with a
 *   visible error, the others assemble untouched.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  findInterruptedRecordings,
  floatToInt16Bytes,
  MemoryChunkStorage,
  recoverRecording,
  sha256Hex,
  TIMESLICE_FRAMES,
  UploadBridge,
  type ChunkStorage,
  type UploadTransport,
} from '../../src/modules/podcast-studio/capture/index'
import { interleave } from '../../src/modules/podcast-studio/capture/normalize'
import { parseTrackManifest } from '../../src/modules/podcast-studio/contracts/track-manifest'
import { createRoomGate, gateForSend } from '../../src/modules/podcast-studio/mixer/processing'
import { renderBlockOnce } from '../../src/modules/podcast-studio/mixer/routing'
import {
  createStrip,
  defaultMixerState,
  type MixerState,
} from '../../src/modules/podcast-studio/mixer/state'
import { beginPlayedClip } from '../../src/modules/podcast-studio/players/played-log'
import {
  applyQuotaExhaustion,
  addMarker,
  assembleTrack,
  computeRetainUntil,
  defaultTrackDefinitions,
  DirectoryChunkStorage,
  encodeWavPcm16,
  estimateRateCorrection,
  evaluateRecordingQuota,
  finalizeAssembly,
  getRecordingState,
  guardCloseWhileRecording,
  guestTrackDefinition,
  ingestPlayedClipLog,
  loadTrackFromStorage,
  measureResiduals,
  MIXER_ISO_SILENT_EXPLANATION,
  MultitrackRecorder,
  multitrackBytesPerSecond,
  planRecordingCleanup,
  RECORDING_TRACK_KINDS,
  requestStopRecording,
  resolveRetentionPolicy,
  sessionRecordingId,
  startRecordingState,
  trackChunksFromBlobBytes,
  wavInfo,
  type AssemblyChunk,
  type FinalizeResult,
  type TrackAssemblyInput,
} from '../../src/modules/podcast-studio/recording/index'

type ManifestTrackExt = FinalizeResult['manifest']['tracks'][number]
import { createSession } from '../../src/modules/podcast-studio/session-engine'

const SR = 48_000
const CHUNK = TIMESLICE_FRAMES // 12,000 frames = 250 ms

const tone = (freq: number, amp: number, frames: number, startFrame = 0): Float32Array => {
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++)
    out[i] = amp * Math.sin((2 * Math.PI * freq * (startFrame + i)) / SR)
  return out
}

const rms = (pcm: Float32Array): number => {
  let sum = 0
  for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!
  return Math.sqrt(sum / pcm.length)
}

/** Single-frequency energy (Goertzel) — PT-A style tone proof. */
const goertzel = (pcm: Float32Array, freq: number): number => {
  const w = (2 * Math.PI * freq) / SR
  const coeff = 2 * Math.cos(w)
  let s0 = 0
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < pcm.length; i++) {
    s0 = pcm[i]! + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return (s1 * s1 + s2 * s2 - coeff * s1 * s2) / (pcm.length * pcm.length)
}

/** Decodes a finalized WAV's samples for one channel. */
const wavChannel = (bytes: Uint8Array, channel: number, channels: number): Float32Array => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const frames = (bytes.length - 44) / (channels * 2)
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++)
    out[i] = view.getInt16(44 + (i * channels + channel) * 2, true) / 32767
  return out
}

const sha256Node = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

// ---------------------------------------------------------------------------
// The scripted session: 4 chunks (1 s) of program/host/clips + a guest
// joining at 0.5 s. Chunk plan per track is in the POD-09 handoff.
// ---------------------------------------------------------------------------

type ScriptedSession = {
  storage: MemoryChunkStorage
  recorder: MultitrackRecorder
  sessionId: string
  talkbackControlProgramChunk: Float32Array
}

const buildScriptedSession = async (): Promise<ScriptedSession> => {
  const storage = new MemoryChunkStorage()
  const sessionId = 'sess-pod09'
  const definitions = defaultTrackDefinitions([])
  const recorder = await MultitrackRecorder.start(storage, { sessionId, tracks: definitions })

  const state: MixerState = defaultMixerState([])
  state.strips = [createStrip('host', 'host', 'Host mic'), createStrip('clips', 'clips', 'Clips')]
  const mutedState: MixerState = {
    ...state,
    strips: state.strips.map((strip) => (strip.id === 'host' ? { ...strip, muted: true } : strip)),
  }
  const faderState: MixerState = {
    ...state,
    strips: state.strips.map((strip) => (strip.id === 'host' ? { ...strip, gainDb: -6 } : strip)),
  }

  const hostChunks = [
    tone(440, 0.5, CHUNK, 0),
    tone(440, 0.5, CHUNK, CHUNK),
    tone(440, 0.5, CHUNK, 2 * CHUNK),
    tone(440, 0.004, CHUNK, 3 * CHUNK), // quiet: below the room gate
  ]
  hostChunks[0]![0] = 0.9 // head sync impulse
  const clipsChunks = [
    tone(880, 0.4, CHUNK, 0),
    tone(880, 0.4, CHUNK, CHUNK),
    tone(880, 0.4, CHUNK, 2 * CHUNK),
    new Float32Array(CHUNK),
  ]
  clipsChunks[0]![0] = 0.9

  // Program chunk 3 hears the host through the room gate (send copy);
  // the ISO keeps the raw quiet tone.
  const gate = createRoomGate(SR)
  for (let i = 0; i < 8; i++) gateForSend(gate, hostChunks[3]!)
  const gatedHost3 = gateForSend(gate, hostChunks[3]!)

  const talkbackTone = tone(2000, 0.8, CHUNK, CHUNK)
  const programInputs = [
    { host: hostChunks[0]!, clips: { left: clipsChunks[0]!, right: clipsChunks[0]! } },
    {
      host: hostChunks[1]!,
      clips: { left: clipsChunks[1]!, right: clipsChunks[1]! },
      talkback: talkbackTone,
    },
    { host: hostChunks[2]!, clips: { left: clipsChunks[2]!, right: clipsChunks[2]! } },
    { host: gatedHost3 },
  ]
  const programStates = [state, mutedState, faderState, state]
  const talkbackControl = renderBlockOnce(mutedState, {
    host: hostChunks[1]!,
    clips: { left: clipsChunks[1]!, right: clipsChunks[1]! },
  }).program

  for (let i = 0; i < 4; i++) {
    const program = renderBlockOnce(programStates[i]!, programInputs[i]).program
    await recorder.write('program', interleave([program.left, program.right]))
    const strip =
      i === 1
        ? { gainDb: 0, muted: true }
        : i === 2
          ? { gainDb: -6, muted: false }
          : { gainDb: 0, muted: false }
    await recorder.writeIso('host', hostChunks[i]!, strip)
    await recorder.writeIso('clips', interleave([clipsChunks[i]!, clipsChunks[i]!]), {
      gainDb: 0,
      muted: false,
    })
    if (i === 1) {
      // Guest joins at 0.5 s (sample 24,000 on the session clock).
      await recorder.addTrack(guestTrackDefinition('g1', 2 * CHUNK))
    }
    if (i >= 2) {
      await recorder.writeIso('guest-g1', tone(660, 0.5, CHUNK, (i - 2) * CHUNK), {
        gainDb: 0,
        muted: false,
      })
    }
  }
  return {
    storage,
    recorder,
    sessionId,
    talkbackControlProgramChunk: interleave([talkbackControl.left, talkbackControl.right]),
  }
}

describe('POD-09 multitrack recorder core + assembly', () => {
  it('scripted session finalizes to aligned, equal-length tracks with the brief\u2019s audio proofs', async () => {
    const { storage, recorder, sessionId, talkbackControlProgramChunk } =
      await buildScriptedSession()

    const health = recorder.health()
    expect(health.find((track) => track.trackId === 'host')).toMatchObject({
      chunksJournaled: 4,
      lastWriteSample: 4 * CHUNK,
    })
    expect(health.find((track) => track.trackId === 'guest-g1')).toMatchObject({
      chunksJournaled: 2,
      lastWriteSample: 4 * CHUNK,
    })

    const summaries = await recorder.stop()
    expect(summaries.find((entry) => entry.definition.trackId === 'guest-g1')?.totalFrames).toBe(
      2 * CHUNK,
    )

    // Talkback never reached the program journal: chunk 1 of the
    // program track is byte-identical to the no-talkback control.
    const programChunk1 = await storage.getChunk(sessionRecordingId(sessionId, 'program'), 1)
    expect(programChunk1).not.toBeNull()
    expect(
      Buffer.from(programChunk1!).equals(
        Buffer.from(floatToInt16Bytes(talkbackControlProgramChunk)),
      ),
    ).toBe(true)

    const inputs: TrackAssemblyInput[] = []
    for (const definition of recorder.trackDefinitions) {
      const loaded = await loadTrackFromStorage(storage, definition, sessionId)
      expect(loaded.checksumsVerified).toBe(true)
      expect(loaded.loadErrors).toEqual([])
      inputs.push(loaded.input)
    }
    const result = finalizeAssembly({ sessionId, sampleRate: SR, tracks: inputs })
    expect(result.degraded).toBe(false)
    expect(result.sessionFrames).toBe(4 * CHUNK)

    const byId = new Map(result.tracks.map((track) => [track.trackId, track]))
    // All track WAVs equal sample length; head impulse at sample 0.
    for (const track of result.tracks) {
      expect(wavInfo(track.wavBytes)).toMatchObject({ frames: 4 * CHUNK, sampleRate: SR })
      expect(track.checksumSha256).toBe(sha256Node(track.wavBytes))
      expect(track.checksumSha256).toBe(sha256Hex(track.wavBytes))
    }
    const hostWav = wavChannel(byId.get('host')!.wavBytes, 0, 1)
    const clipsWav = wavChannel(byId.get('clips')!.wavBytes, 0, 2)
    const programWav = wavChannel(byId.get('program')!.wavBytes, 0, 2)
    const guestWav = wavChannel(byId.get('guest-g1')!.wavBytes, 0, 1)
    expect(Math.abs(hostWav[0]! - 0.9)).toBeLessThan(0.001)
    expect(Math.abs(clipsWav[0]! - 0.9)).toBeLessThan(0.001)
    expect(Math.abs(programWav[0]!)).toBeGreaterThan(0.3)

    // Talkback-only frequency energy in the program track ≈ 0.
    expect(goertzel(programWav.subarray(CHUNK, 2 * CHUNK), 2000)).toBeLessThan(1e-9)
    // Host was muted in chunk 1: program carries no 440 Hz there either.
    expect(goertzel(programWav.subarray(CHUNK, 2 * CHUNK), 440)).toBeLessThan(1e-9)

    // Muted ISO segment is exactly silent; −6 dB fader segment measures ≈ −6 dB.
    expect(hostWav.subarray(CHUNK, 2 * CHUNK).every((sample) => sample === 0)).toBe(true)
    const ratio = rms(hostWav.subarray(2 * CHUNK, 3 * CHUNK)) / rms(hostWav.subarray(0, CHUNK))
    expect(ratio).toBeGreaterThan(0.47)
    expect(ratio).toBeLessThan(0.53)

    // Processing excluded from ISO: the gated (program) copy of the
    // quiet segment is ~20 dB under the raw ISO copy.
    const isoQuiet = rms(hostWav.subarray(3 * CHUNK, 4 * CHUNK))
    const programQuiet = rms(programWav.subarray(3 * CHUNK, 4 * CHUNK))
    expect(isoQuiet).toBeGreaterThan(0.002)
    expect(isoQuiet / programQuiet).toBeGreaterThan(7)
    expect(isoQuiet / programQuiet).toBeLessThan(13)

    // Late joiner: silence-padded head, signal after the join offset,
    // and the gap is RECORDED in the manifest — not backfilled.
    expect(guestWav.subarray(0, 2 * CHUNK).every((sample) => sample === 0)).toBe(true)
    expect(rms(guestWav.subarray(2 * CHUNK, 4 * CHUNK))).toBeGreaterThan(0.3)
    const guestManifest = result.manifest.tracks.find(
      (track) => track.trackId === 'guest-g1',
    ) as ManifestTrackExt
    expect(guestManifest.gaps).toContainEqual({
      fromSample: 0,
      toSample: 2 * CHUNK,
      frames: 2 * CHUNK,
      reason: 'late-join',
    })
    expect(guestManifest.syncEvents).toContainEqual({
      type: 'head',
      trackSamples: 0,
      timelineSamples: 2 * CHUNK,
    })

    // The manifest conforms to the POD-00 contract.
    expect(() => parseTrackManifest(result.manifest)).not.toThrow()
    expect(result.manifest.tracks.map((track) => track.trackId).sort()).toEqual([
      'clips',
      'guest-g1',
      'host',
      'program',
    ])
  })

  it('talkback is structurally not a track kind', async () => {
    expect(RECORDING_TRACK_KINDS).not.toContain('talkback')
    const recorder = await MultitrackRecorder.start(new MemoryChunkStorage(), {
      sessionId: 'sess-notb',
      tracks: [],
    })
    await expect(
      recorder.addTrack({
        trackId: 'tb',
        kind: 'talkback' as never,
        role: 'host',
        channels: 1,
        channelLayout: 'mono',
        stripId: null,
        joinedAtSample: 0,
      }),
    ).rejects.toThrow(/talkback is a send, never a track/)
  })

  it('explicit gaps are journalled as silence and recorded, never shifted', async () => {
    const storage = new MemoryChunkStorage()
    const recorder = await MultitrackRecorder.start(storage, {
      sessionId: 'sess-gap',
      tracks: [defaultTrackDefinitions([])[1]!], // host only
    })
    await recorder.writeIso('host', tone(440, 0.5, CHUNK, 0), { gainDb: 0, muted: false })
    await recorder.noteGap('host', CHUNK)
    await recorder.writeIso('host', tone(440, 0.5, CHUNK, 2 * CHUNK), { gainDb: 0, muted: false })
    const summaries = await recorder.stop()
    const loaded = await loadTrackFromStorage(storage, defaultTrackDefinitions([])[1]!, 'sess-gap')
    const result = finalizeAssembly({
      sessionId: 'sess-gap',
      sampleRate: SR,
      tracks: [
        {
          ...loaded.input,
          explicitGaps: summaries[0]!.gaps
            .filter((gap) => gap.reason === 'explicit')
            .map((gap) => ({ fromSample: gap.fromSample, frames: gap.frames })),
        },
      ],
    })
    const hostWav = wavChannel(result.tracks[0]!.wavBytes, 0, 1)
    expect(hostWav.subarray(CHUNK, 2 * CHUNK).every((sample) => sample === 0)).toBe(true)
    expect(rms(hostWav.subarray(2 * CHUNK, 3 * CHUNK))).toBeGreaterThan(0.3)
    expect(result.manifest.tracks[0]!.gaps).toContainEqual({
      fromSample: CHUNK,
      toSample: 2 * CHUNK,
      frames: CHUNK,
      reason: 'explicit',
    })
  })
})

// ---------------------------------------------------------------------------
// Failure proof 1: tab-crash mid-record → recovery across ALL tracks
// ---------------------------------------------------------------------------

describe('POD-09 crash recovery (tab dies mid-record)', () => {
  it('POD-06 recovery scan finds every track, alignment intact, loss ≤ 1 chunk per track', async () => {
    const storage = new MemoryChunkStorage()
    const sessionId = 'sess-crash'
    const recorder = await MultitrackRecorder.start(storage, {
      sessionId,
      tracks: defaultTrackDefinitions([]),
    })
    for (let i = 0; i < 3; i++) {
      const host = tone(440, 0.5, CHUNK, i * CHUNK)
      if (i === 0) host[0] = 0.9
      const clips = tone(880, 0.4, CHUNK, i * CHUNK)
      if (i === 0) clips[0] = 0.9
      await recorder.write('program', interleave([clips, clips]))
      await recorder.writeIso('host', host, { gainDb: 0, muted: false })
      await recorder.writeIso('clips', interleave([clips, clips]), { gainDb: 0, muted: false })
    }
    // CRASH: no stop(), no finalize — the tab is gone. A partial
    // in-flight chunk lands on the host track (never journalled).
    const partial = floatToInt16Bytes(tone(440, 0.5, 5000, 3 * CHUNK))
    await storage.putChunk(sessionRecordingId(sessionId, 'host'), 3, partial)

    const interrupted = await findInterruptedRecordings(storage)
    expect(interrupted.map((report) => report.trackId).sort()).toEqual(['clips', 'host', 'program'])
    const hostReport = interrupted.find((report) => report.trackId === 'host')!
    expect(hostReport.lossTimeslices).toBe(1) // exactly the in-flight slice
    expect(hostReport.recoveredFrames).toBe(3 * CHUNK)
    for (const report of interrupted) expect(report.lossTimeslices).toBeLessThanOrEqual(1)

    // Assembly from the recovered journals: alignment intact.
    const inputs: TrackAssemblyInput[] = []
    for (const definition of defaultTrackDefinitions([])) {
      const loaded = await loadTrackFromStorage(storage, definition, sessionId)
      expect(loaded.recoveredFromCrash).toBe(true)
      inputs.push(loaded.input)
    }
    const result = finalizeAssembly({
      sessionId,
      sampleRate: SR,
      tracks: inputs,
      sessionFrames: 3 * CHUNK,
    })
    for (const track of result.tracks) expect(wavInfo(track.wavBytes).frames).toBe(3 * CHUNK)
    const hostWav = wavChannel(
      result.tracks.find((track) => track.trackId === 'host')!.wavBytes,
      0,
      1,
    )
    expect(Math.abs(hostWav[0]! - 0.9)).toBeLessThan(0.001) // head sync survived the crash
  })
})

// ---------------------------------------------------------------------------
// Failure proof 2: upload interrupted at ~50% → resume → identical output
// ---------------------------------------------------------------------------

class FakeUploadTransport implements UploadTransport {
  private sessions = new Map<
    string,
    { chunkSize: number; size: number; chunks: Map<number, Uint8Array> }
  >()
  private nextId = 1
  failAfterWrites: number | null = null
  writes = 0
  assembled = new Map<string, Uint8Array>()

  constructor(private readonly chunkSize: number) {}

  async create(input: { filename: string; size: number }) {
    const id = `up-${this.nextId++}`
    this.sessions.set(id, { chunkSize: this.chunkSize, size: input.size, chunks: new Map() })
    return { id, chunkSize: this.chunkSize }
  }

  async write(sessionId: string, index: number, start: number, total: number, bytes: Uint8Array) {
    this.writes++
    if (this.failAfterWrites !== null && this.writes > this.failAfterWrites)
      throw new Error('network down')
    const session = this.sessions.get(sessionId)!
    void start
    void total
    session.chunks.set(index, new Uint8Array(bytes))
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
    const session = this.sessions.get(sessionId)!
    const out = new Uint8Array(session.size)
    for (const [index, bytes] of session.chunks) out.set(bytes, index * session.chunkSize)
    this.assembled.set(sessionId, out)
    return { id: `asset-${sessionId}` }
  }
}

describe('POD-09 upload interruption → resume → identical output', () => {
  it('bridge fail at ~50% per track, resume, assembled WAV checksums match the control', async () => {
    const { storage, recorder, sessionId } = await buildScriptedSession()
    await recorder.stop()
    const definitions = recorder.trackDefinitions.filter((def) => def.kind !== 'guest')

    const runBridge = async (failAfterWrites: number | null) => {
      const checksums: Record<string, string> = {}
      for (const definition of definitions) {
        const recordingId = sessionRecordingId(sessionId, definition.trackId)
        // Rebuild a journal facade over the same storage for the bridge:
        // the bridge reads chunkRecords from a ChunkJournal; open a fresh
        // journal view by replaying the stored manifest is POD-06's
        // recovery path — here we drive the bridge from a journal whose
        // records mirror the stored ones.
        const report = await recoverRecording(storage, recordingId)
        expect(report).not.toBeNull()
        const journal = await journalView(storage, recordingId, definition, report!)
        const chunkBytes = definition.channels * CHUNK * 2
        const transport = new FakeUploadTransport(chunkBytes)
        transport.failAfterWrites = failAfterWrites
        const bridge = new UploadBridge(transport, journal, storage)
        await bridge.begin(`${definition.trackId}.pcm`)
        const first = await bridge.pump()
        if (failAfterWrites !== null) {
          expect(first.failedAtUploadChunk).not.toBeNull()
          expect(first.ackedChunks).toBeLessThan(first.totalChunks)
          // The network comes back; resume with a FRESH bridge over the
          // same journal + upload session.
          transport.failAfterWrites = null
          const resumed = new UploadBridge(transport, journal, storage)
          await resumed.resume(first.uploadSessionId!)
          const second = await resumed.pump()
          expect(second.failedAtUploadChunk).toBeNull()
          expect(second.ackedChunks).toBe(second.totalChunks)
          await resumed.finalize()
        } else {
          expect(first.failedAtUploadChunk).toBeNull()
          await bridge.finalize()
        }
        const blobBytes = transport.assembled.get([...transport.assembled.keys()][0]!)!
        const input = trackChunksFromBlobBytes(blobBytes, definition)
        const result = finalizeAssembly({ sessionId, sampleRate: SR, tracks: [input] })
        checksums[definition.trackId] = result.tracks[0]!.checksumSha256
      }
      return checksums
    }

    const control = await runBridge(null)
    const interrupted = await runBridge(2) // ~half of each track's 4 chunks land, then the network dies
    expect(interrupted).toEqual(control)
  })
})

/** A ChunkJournal-shaped view over an existing stored journal (bridge input). */
const journalView = async (
  storage: ChunkStorage,
  recordingId: string,
  definition: { channels: number },
  report: NonNullable<Awaited<ReturnType<typeof recoverRecording>>>,
) => {
  void definition
  const records = []
  for (const index of report.admittedChunks) {
    records.push({
      type: 'chunk' as const,
      index,
      startSample: index * CHUNK,
      frames: CHUNK,
      byteLength: (await storage.getChunk(recordingId, index))!.length,
      checksum: '',
      runningChecksum: '',
    })
  }
  return {
    meta: {
      recordingId,
      sessionId: report.sessionId ?? '',
      trackId: report.trackId ?? '',
      channels: report.channels,
    },
    chunkRecords: records,
  } as never
}

// ---------------------------------------------------------------------------
// Failure proof 3: one track's chunks corrupted → flagged, others clean
// ---------------------------------------------------------------------------

describe('POD-09 corrupted track isolation', () => {
  it('checksum failure flags the host track in the manifest + errors; program/clips assemble untouched', async () => {
    const { storage, recorder, sessionId } = await buildScriptedSession()
    await recorder.stop()

    // Corrupt host chunk 2 in storage (bytes no longer match the journal).
    const hostRecordingId = sessionRecordingId(sessionId, 'host')
    const chunk2 = await storage.getChunk(hostRecordingId, 2)
    const corrupted = new Uint8Array(chunk2!)
    corrupted[10] = corrupted[10]! ^ 0xff
    corrupted[11] = corrupted[11]! ^ 0xff
    await storage.putChunk(hostRecordingId, 2, corrupted)

    const inputs: TrackAssemblyInput[] = []
    const loadErrors: Record<string, string[]> = {}
    for (const definition of recorder.trackDefinitions) {
      const loaded = await loadTrackFromStorage(storage, definition, sessionId)
      loadErrors[definition.trackId] = loaded.loadErrors
      inputs.push(loaded.input)
    }
    expect(loadErrors['host']!.join(' ')).toMatch(/checksum/)
    expect(loadErrors['program']).toEqual([])
    expect(loadErrors['clips']).toEqual([])

    const result = finalizeAssembly({ sessionId, sampleRate: SR, tracks: inputs })
    const hostTrack = result.manifest.tracks.find(
      (track) => track.trackId === 'host',
    ) as ManifestTrackExt
    // The corrupt tail (chunks 2–3 unrecovered) is a recorded gap.
    expect(
      hostTrack.gaps.some((gap) => gap.reason === 'track-short' && gap.fromSample === 2 * CHUNK),
    ).toBe(true)
    const hostWav = wavChannel(
      result.tracks.find((track) => track.trackId === 'host')!.wavBytes,
      0,
      1,
    )
    expect(rms(hostWav.subarray(0, CHUNK))).toBeGreaterThan(0.3) // chunk 0 intact
    expect(hostWav.subarray(2 * CHUNK).every((sample) => sample === 0)).toBe(true)
    for (const trackId of ['program', 'clips']) {
      const track = result.tracks.find((entry) => entry.trackId === trackId)!
      expect(track.degraded).toBe(false)
      expect(track.gaps).toEqual([])
      expect(wavInfo(track.wavBytes).frames).toBe(4 * CHUNK)
    }
    expect(() => parseTrackManifest(result.manifest)).not.toThrow()
  })

  it('an assembly-level corrupt chunk becomes a named gap on its track only', () => {
    const good: AssemblyChunk[] = [
      { startSample: 0, pcm: tone(440, 0.5, CHUNK, 0) },
      { startSample: CHUNK, pcm: tone(440, 0.5, CHUNK, CHUNK) },
    ]
    const withCorrupt: AssemblyChunk[] = [
      { startSample: 0, pcm: tone(440, 0.5, CHUNK, 0) },
      { startSample: CHUNK, pcm: tone(440, 0.5, CHUNK, CHUNK), corrupt: true },
    ]
    const base = { role: 'host' as const, channels: 1, joinedAtSample: 0 }
    const clean = assembleTrack({ ...base, trackId: 'a', chunks: good }, 2 * CHUNK, SR)
    const flagged = assembleTrack({ ...base, trackId: 'b', chunks: withCorrupt }, 2 * CHUNK, SR)
    expect(clean.degraded).toBe(false)
    expect(flagged.degraded).toBe(true)
    expect(flagged.errors.join(' ')).toMatch(/checksum/)
    expect(flagged.gaps).toContainEqual({
      fromSample: CHUNK,
      toSample: 2 * CHUNK,
      frames: CHUNK,
      reason: 'corrupt-chunk',
    })
    expect(rms(flagged.pcm.subarray(0, CHUNK))).toBeGreaterThan(0.3)
    expect(flagged.pcm.subarray(CHUNK).every((sample) => sample === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Drift: PT-F reproduction + assemble-level fixtures (+50 / −30 ppm, jitter)
// ---------------------------------------------------------------------------

describe('POD-09 drift estimation + correction (PT-F method)', () => {
  it('PT-F reproduction: +80 ppm over one hour, head+tail estimate, residual sub-ms', () => {
    const points = []
    for (let sec = 0; sec <= 3600; sec += 10) {
      const timeline = sec * SR
      points.push({ trackSamples: Math.round(timeline * 1.00008), timelineSamples: timeline })
    }
    const correction = estimateRateCorrection(points[0]!, points[points.length - 1]!)
    expect(correction.rateCorrectionPpm).toBeCloseTo(80, 1)
    const residuals = measureResiduals(correction, points, SR)
    expect(residuals.maxAbsResidualMs).toBeLessThan(5) // PT-F bound
    expect(residuals.maxAbsResidualMs).toBeLessThan(0.05) // quantisation-only residue, as PT-F measured (0.0083 ms)
  })

  const driftedTrack = (ppm: number, jitterSeed: number | null): TrackAssemblyInput => {
    const timelineFrames = 10 * SR // 10 s — long enough for ppm precision at 1-sample quantisation
    const trackFrames = Math.round(timelineFrames * (1 + ppm / 1_000_000))
    const pcm = tone(440, 0.5, trackFrames)
    const chunks: AssemblyChunk[] = []
    let trackCursor = 0
    let timelineCursor = 0
    let lcg = 1234567
    const nextJitter = () => {
      lcg = (lcg * 1103515245 + 12345) % 2 ** 31
      return (lcg % 17) - 8 // ±8 samples ≈ ±0.167 ms
    }
    if (jitterSeed !== null) lcg = jitterSeed
    while (trackCursor < trackFrames) {
      const frames = Math.min(CHUNK, trackFrames - trackCursor)
      chunks.push({
        startSample: trackCursor,
        pcm: pcm.subarray(trackCursor, trackCursor + frames),
        timelineStartSample:
          timelineCursor + (jitterSeed !== null && trackCursor > 0 ? nextJitter() : 0),
      })
      trackCursor += frames
      timelineCursor = Math.round(trackCursor / (1 + ppm / 1_000_000))
    }
    return {
      trackId: `drift-${ppm}`,
      role: 'guest',
      channels: 1,
      joinedAtSample: 0,
      chunks,
      syncEvents: [
        { type: 'head', trackSamples: 0, timelineSamples: 0 },
        { type: 'tail', trackSamples: trackFrames, timelineSamples: timelineFrames },
      ],
    }
  }

  it.each([
    { ppm: 50, jitter: null },
    { ppm: -30, jitter: null },
    { ppm: 50, jitter: 42 },
  ])(
    'assemble corrects $ppm ppm (jitter seed $jitter) to the timeline with sub-ms residual',
    ({ ppm, jitter }) => {
      const input = driftedTrack(ppm, jitter)
      const assembled = assembleTrack(input, 10 * SR, SR)
      expect(assembled.drift.corrected).toBe(true)
      expect(Math.abs(assembled.drift.rateCorrectionPpm - ppm)).toBeLessThan(1.5)
      expect(assembled.drift.maxResidualMs).toBeLessThan(0.5)
      expect(assembled.frames).toBe(10 * SR)
      expect(rms(assembled.pcm)).toBeGreaterThan(0.3) // the tone survived resampling
      expect(assembled.gaps.filter((gap) => gap.reason === 'track-short')).toEqual([])
    },
  )

  it('identical clocks need no correction (the local multitrack case)', () => {
    const input = driftedTrack(0, null)
    const assembled = assembleTrack(input, 10 * SR, SR)
    expect(assembled.drift.corrected).toBe(false)
    expect(assembled.drift.rateCorrectionPpm).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Recording session state: markers, guards, quota, MIXER rule
// ---------------------------------------------------------------------------

describe('POD-09 recording session state + guards', () => {
  it('markers: typed name wins, Esc (null) keeps the auto number; both land in the session markers', () => {
    let session = createSession({ showId: 'show-1', showTitle: 'Show' })
    session = startRecordingState(session, { deskMode: 'one-mic' })
    const first = addMarker(session, { promptResult: null, atElapsedSec: 12 })
    expect(first.marker).toMatchObject({ number: 1, name: 'Marker 1', atElapsedSec: 12 })
    const second = addMarker(first.session, { promptResult: 'Intro done', atElapsedSec: 30 })
    expect(second.marker).toMatchObject({ number: 2, name: 'Intro done' })
    expect(second.session.markers?.map((marker) => marker.title)).toEqual([
      'Marker 1',
      'Intro done',
    ])
  })

  it('confirm-stop guard refuses an unconfirmed stop and changes nothing', () => {
    let session = createSession({ showId: 'show-1', showTitle: 'Show' })
    session = startRecordingState(session, { deskMode: 'one-mic' })
    const refused = requestStopRecording(session, { confirmed: false })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.code).toBe('confirm-required')
    expect(guardCloseWhileRecording(session)).toEqual({ ok: false, code: 'recording-in-progress' })
    const stopped = requestStopRecording(session, { confirmed: true })
    expect(stopped.ok).toBe(true)
    if (stopped.ok) {
      expect(stopped.session.recordingState?.status).toBe('stopped')
      expect(guardCloseWhileRecording(stopped.session)).toEqual({ ok: true })
    }
  })

  it('quota monitor: hours-remaining math, warn threshold, graceful stopped-quota with chunks intact', async () => {
    const bytesPerSecond = multitrackBytesPerSecond(
      [{ channels: 2 }, { channels: 1 }, { channels: 2 }],
      SR,
    )
    expect(bytesPerSecond).toBe(5 * 2 * SR)
    expect(
      evaluateRecordingQuota({ quotaBytes: bytesPerSecond * 3600 * 2, bytesPerSecond })
        .hoursRemaining,
    ).toBe(2)
    expect(evaluateRecordingQuota({ quotaBytes: bytesPerSecond * 1800, bytesPerSecond }).warn).toBe(
      true,
    )
    expect(evaluateRecordingQuota({ quotaBytes: 0, bytesPerSecond }).exhausted).toBe(true)
    expect(evaluateRecordingQuota({ quotaBytes: null, bytesPerSecond }).hoursRemaining).toBeNull()

    // Graceful stop: the journal is untouched by the quota transition.
    const storage = new MemoryChunkStorage()
    const recorder = await MultitrackRecorder.start(storage, {
      sessionId: 'sess-quota',
      tracks: defaultTrackDefinitions([]),
    })
    await recorder.writeIso('host', tone(440, 0.5, CHUNK, 0), { gainDb: 0, muted: false })
    const chunksBefore = recorder
      .health()
      .find((track) => track.trackId === 'host')!.chunksJournaled

    let session = createSession({ id: 'sess-quota', showId: 'show-1', showTitle: 'Show' })
    session = startRecordingState(session, { deskMode: 'one-mic' })
    session = applyQuotaExhaustion(session)
    expect(getRecordingState(session)?.status).toBe('stopped-quota')
    expect(session.state).toBe('stopped')
    expect(session.log.some((entry) => String(entry.text ?? '').includes('quota exhausted'))).toBe(
      true,
    )
    expect(recorder.health().find((track) => track.trackId === 'host')!.chunksJournaled).toBe(
      chunksBefore,
    )
    const report = await recoverRecording(storage, sessionRecordingId('sess-quota', 'host'))
    expect(report?.recoveredFrames).toBe(CHUNK)
  })

  it('MIXER mode surfaces isoSilentByDesign with the explanation; ONE MIC does not', () => {
    const base = createSession({ showId: 'show-1', showTitle: 'Show' })
    const mixer = startRecordingState(base, { deskMode: 'mixer' })
    expect(mixer.recordingState?.isoSilentByDesign).toBe(true)
    expect(mixer.recordingState?.isoSilentExplanation).toBe(MIXER_ISO_SILENT_EXPLANATION)
    const oneMic = startRecordingState(base, { deskMode: 'one-mic' })
    expect(oneMic.recordingState?.isoSilentByDesign).toBe(false)
    expect(oneMic.recordingState?.isoSilentExplanation).toBeNull()
  })

  it('played-clip log is ingested into the recording state for POD-12', () => {
    let session = createSession({ showId: 'show-1', showTitle: 'Show' })
    session = startRecordingState(session, { deskMode: 'one-mic' })
    const begun = beginPlayedClip(session, {
      source: 'cart',
      clipId: 'cart-1',
      title: 'Intro sting',
      startedAtSessionSec: 5,
    })
    session = ingestPlayedClipLog(begun.session)
    expect(getRecordingState(session)?.playedClipLog).toHaveLength(1)
    expect(getRecordingState(session)?.playedClipLog[0]).toMatchObject({
      clipId: 'cart-1',
      outcome: 'playing',
      endedAtSessionSec: null,
    })
  })
})

// ---------------------------------------------------------------------------
// Storage policy + WAV + directory chunk storage
// ---------------------------------------------------------------------------

describe('POD-09 storage policy (data) + WAV + directory storage', () => {
  it('policy: default 30 days, show override wins, unpublished retains indefinitely', () => {
    expect(resolveRetentionPolicy(null).daysAfterPublish).toBe(30)
    expect(resolveRetentionPolicy({ recordingRetentionDays: 7 }).daysAfterPublish).toBe(7)
    expect(resolveRetentionPolicy({ recordingRetentionDays: 0 }).daysAfterPublish).toBe(30)
    const policy = resolveRetentionPolicy(null)
    expect(computeRetainUntil(policy, null)).toBeNull()
    expect(
      computeRetainUntil(policy, {
        productionState: 'editing',
        publishedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBeNull()
    expect(
      computeRetainUntil(policy, {
        productionState: 'published',
        publishedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe('2026-01-31T00:00:00.000Z')
  })

  it('cleanup plan partitions expired vs retained and never re-plans the expired', () => {
    const now = new Date('2026-02-15T00:00:00.000Z')
    const plan = planRecordingCleanup(
      [
        { id: 'a', state: 'finalized', retainUntil: '2026-01-31T00:00:00.000Z' },
        { id: 'b', state: 'finalized', retainUntil: '2026-03-01T00:00:00.000Z' },
        { id: 'c', state: 'finalized', retainUntil: null },
        { id: 'd', state: 'expired', retainUntil: '2026-01-01T00:00:00.000Z' },
      ],
      now,
    )
    expect(plan.counts).toEqual({ scanned: 4, expired: 1, retained: 3 })
    expect(plan.expired.map((entry) => entry.id)).toEqual(['a'])
  })

  it('WAV encode/decode round-trips the working format', () => {
    const pcm = tone(440, 0.5, CHUNK)
    const wav = encodeWavPcm16(pcm, 1, SR)
    expect(wavInfo(wav)).toEqual({ frames: CHUNK, channels: 1, sampleRate: SR })
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF')
    expect(sha256Hex(wav)).toBe(sha256Node(wav))
  })

  it('DirectoryChunkStorage carries a journal end-to-end on a real filesystem (scratch dir)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pod09-chunks-'))
    try {
      const storage = new DirectoryChunkStorage(root)
      const recorder = await MultitrackRecorder.start(storage, {
        sessionId: 'sess-dir',
        tracks: defaultTrackDefinitions([]).slice(0, 2),
      })
      const host = tone(440, 0.5, CHUNK, 0)
      host[0] = 0.9
      await recorder.write('program', interleave([host, host]))
      await recorder.writeIso('host', host, { gainDb: 0, muted: false })
      await recorder.stop()
      const loaded = await loadTrackFromStorage(
        storage,
        defaultTrackDefinitions([])[1]!,
        'sess-dir',
      )
      expect(loaded.checksumsVerified).toBe(true)
      expect(loaded.input.chunks).toHaveLength(1)
      expect(Math.abs(loaded.input.chunks[0]!.pcm[0]! - 0.9)).toBeLessThan(0.001)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
