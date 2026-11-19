/**
 * POD-11 (POD-REQ-25) — Guest-side local recording binding (PURE CORE
 * + recorder facade over the POD-06 journal; the browser adapter in
 * guest-recording-browser.ts feeds it real mic PCM).
 *
 * The guest's browser records its OWN raw track with the POD-06 chunk
 * journal engine — the same 250 ms s16 chunk format, the same
 * crash-proof recovery — bound to exactly one (session, invite). The
 * POD-09 guest ISO slot for this guest is populated by THIS upload,
 * not by the host's live return (the live return is only the fallback
 * ladder's rung 2 — see recording/conform.ts).
 *
 * Sync correspondence: at record start and end the guest captures a
 * sync pair {guestTrackSamples, hostTimelineSamples} — the guest
 * clock position and the host timeline position of the same instant,
 * corresponded through the POD-10 signalling channel (the host's
 * session clock rides its control messages; the guest page records
 * the pair when it starts/stops the local recorder). Head + tail
 * pairs are the conform inputs (recording/conform.ts, PT-F method).
 *
 * Lifecycle (driven by the POD-10 lobby/peer events):
 *   admit → start recording (head sync captured)
 *   peer disconnect → a gap interval OPENS on the guest clock
 *   peer reconnect → the gap interval CLOSES into a gap record
 *   leave / drop / host stop → stop recording (tail sync captured),
 *   flush the journal, then progressive upload completes the track.
 * A disconnect never stretches the track: the gap is a record, and
 * the local journal keeps the guest's own timeline honest — audio
 * the guest's mic captured while the call was down is still on the
 * guest clock where it belongs; ranges where CAPTURE itself stopped
 * are the gap records.
 *
 * Upload: two resumable paths share the POD-06 semantics (acked bytes
 * are never re-sent; resume starts from the server's received list):
 * - `GuestLocalRecorder.pumpUpload` — the POD-06 UploadBridge onto
 *   media upload sessions (the host-side pattern).
 * - `GuestChunkUploader` — the guest-credential chunk protocol
 *   (guests/guest-chunk-upload.ts + the guests/chunks route): the
 *   guest holds no account, so media upload sessions (owner-bound)
 *   cannot serve them; this protocol carries journal chunks against
 *   the POD-10 signalling credential with the same cross-session
 *   refusal discipline as clip slots.
 */

import { TIMESLICE_FRAMES, WORKING_SAMPLE_RATE } from '../capture/capture'
import { ChunkJournal, type ChunkStorage, type RecordingMeta } from '../capture/journal'
import { UploadBridge, type UploadTransport } from '../capture/upload-bridge'
import { sessionRecordingId } from '../recording/multitrack'
import { syncPair, type GuestGapInput, type GuestSyncPair } from '../recording/conform'
import type { LobbyState } from './lobby'

export type { GuestSyncPair }

// ---------------------------------------------------------------------------
// Binding: one guest, one session, one track
// ---------------------------------------------------------------------------

export type GuestRecordingBinding = {
  /** POD-05 StudioSession document id (the session clock's identity). */
  sessionId: string
  /** podcast-studio-sessions record id (the invite's session key). */
  sessionRecordId: string
  inviteId: string
  /** Guest-book guest id when the invite carries one, else null. */
  guestId: string | null
  /** POD-09 track id for this guest's ISO slot: `guest-<inviteId>`. */
  trackId: string
}

export const guestLocalTrackId = (inviteId: string): string => `guest-${inviteId}`

export function guestRecordingBinding(input: {
  sessionId: string
  sessionRecordId: string
  inviteId: string
  guestId?: string | null
}): GuestRecordingBinding {
  if (!input.sessionId || !input.sessionRecordId || !input.inviteId) {
    throw new Error('A guest recording binding requires session, session record and invite ids.')
  }
  return {
    sessionId: input.sessionId,
    sessionRecordId: input.sessionRecordId,
    inviteId: input.inviteId,
    guestId: input.guestId ?? null,
    trackId: guestLocalTrackId(input.inviteId),
  }
}

/** The POD-06 journal recording id for this guest's track. */
export const guestJournalRecordingId = (binding: GuestRecordingBinding): string =>
  sessionRecordingId(binding.sessionId, binding.trackId)

// ---------------------------------------------------------------------------
// Lifecycle state machine
// ---------------------------------------------------------------------------

export type GuestRecordingPhase =
  | 'idle'
  | 'recording'
  | 'reconnecting'
  | 'stopped'
  | 'uploading'
  | 'uploaded'
  | 'failed'

export type GuestRecordingEvent =
  | 'admit'
  | 'disconnect'
  | 'reconnect'
  | 'stop'
  | 'upload-begin'
  | 'upload-complete'
  | 'upload-failed'

const GUEST_RECORDING_TRANSITIONS: Record<GuestRecordingPhase, readonly GuestRecordingEvent[]> = {
  idle: ['admit'],
  recording: ['disconnect', 'stop'],
  reconnecting: ['reconnect', 'stop'],
  stopped: ['upload-begin'],
  uploading: ['upload-complete', 'upload-failed'],
  uploaded: [],
  failed: ['upload-begin'],
}

export type GuestRecordingState = {
  binding: GuestRecordingBinding
  phase: GuestRecordingPhase
  headSync: GuestSyncPair | null
  tailSync: GuestSyncPair | null
  /** Closed disconnect/capture gaps, on the guest track clock. */
  gaps: GuestGapInput[]
  /** Guest sample where the currently-open gap began, if any. */
  openGapFromGuestSample: number | null
  chunksJournaled: number
  chunksUploaded: number
  log: Array<{ event: string; atGuestSample: number; detail?: string }>
}

export const createGuestRecordingState = (binding: GuestRecordingBinding): GuestRecordingState => ({
  binding,
  phase: 'idle',
  headSync: null,
  tailSync: null,
  gaps: [],
  openGapFromGuestSample: null,
  chunksJournaled: 0,
  chunksUploaded: 0,
  log: [],
})

export type GuestRecordingTransitionResult =
  | { ok: true; state: GuestRecordingState }
  | { ok: false; code: 'illegal-guest-recording-transition'; message: string }

/**
 * Applies one lifecycle event at the guest clock position
 * `atGuestSample` (journal frames recorded so far). Disconnect opens
 * a gap CANDIDATE; it becomes a gap record only when the recorder
 * facade proves capture actually stopped (see GuestLocalRecorder —
 * a network disconnect whose local capture kept running leaves NO
 * gap, because the audio exists). Gap records are added explicitly
 * through `recordGuestGap`, never inferred from elapsed samples.
 */
export function transitionGuestRecording(
  state: GuestRecordingState,
  event: GuestRecordingEvent,
  input: { atGuestSample: number; sync?: GuestSyncPair; detail?: string } = { atGuestSample: 0 },
): GuestRecordingTransitionResult {
  if (!(GUEST_RECORDING_TRANSITIONS[state.phase] ?? []).includes(event)) {
    return {
      ok: false,
      code: 'illegal-guest-recording-transition',
      message: `Guest recording cannot take event "${event}" while ${state.phase}.`,
    }
  }
  const at = Math.max(0, Math.floor(input.atGuestSample))
  switch (event) {
    case 'admit':
      state.phase = 'recording'
      state.headSync = input.sync ?? syncPair(0, 0)
      break
    case 'disconnect':
      state.phase = 'reconnecting'
      if (state.openGapFromGuestSample === null) state.openGapFromGuestSample = at
      break
    case 'reconnect':
      state.openGapFromGuestSample = null
      state.phase = 'recording'
      break
    case 'stop':
      state.openGapFromGuestSample = null
      state.phase = 'stopped'
      state.tailSync = input.sync ?? syncPair(at, at)
      break
    case 'upload-begin':
      state.phase = 'uploading'
      break
    case 'upload-complete':
      state.phase = 'uploaded'
      break
    case 'upload-failed':
      state.phase = 'failed'
      break
  }
  state.log.push({ event, atGuestSample: at, ...(input.detail ? { detail: input.detail } : {}) })
  return { ok: true, state }
}

/** Records an explicit gap (positive length only) on the guest clock. */
export function recordGuestGap(state: GuestRecordingState, gap: GuestGapInput): void {
  if (!Number.isInteger(gap.fromGuestSample) || gap.fromGuestSample < 0 || !(gap.frames > 0)) {
    throw new Error('A guest gap requires a non-negative start and a positive frame count.')
  }
  state.gaps.push({ ...gap })
}

// ---------------------------------------------------------------------------
// Telemetry: recording state surfaced to the host over POD-10 signalling
// (a control `hello` payload — no media, allowed by the signalling core)
// ---------------------------------------------------------------------------

export type GuestRecordingTelemetry = {
  kind: 'guest-recording'
  inviteId: string
  trackId: string
  phase: GuestRecordingPhase
  chunksJournaled: number
  chunksUploaded: number
  gapCount: number
  hasHeadSync: boolean
  hasTailSync: boolean
}

export const guestRecordingTelemetry = (state: GuestRecordingState): GuestRecordingTelemetry => ({
  kind: 'guest-recording',
  inviteId: state.binding.inviteId,
  trackId: state.binding.trackId,
  phase: state.phase,
  chunksJournaled: state.chunksJournaled,
  chunksUploaded: state.chunksUploaded,
  gapCount: state.gaps.length,
  hasHeadSync: state.headSync !== null,
  hasTailSync: state.tailSync !== null,
})

// ---------------------------------------------------------------------------
// Chunk-upload authorization (pure verdict; the server service in
// guest-chunk-upload.ts enforces it after credential resolution)
// ---------------------------------------------------------------------------

/** One full journal chunk, mono s16: 12,000 frames × 2 bytes. */
export const GUEST_CHUNK_MAX_BYTES = TIMESLICE_FRAMES * 2

/** Lobby states from which a guest track upload may proceed: admitted
 * live, or completing the upload after leaving/being dropped (the
 * Riverside safety property — the session ending must not strand a
 * nearly-complete track). Never before admission: no recording exists. */
export const GUEST_UPLOAD_LOBBY_STATES: readonly LobbyState[] = ['admitted', 'left', 'dropped']

export type GuestChunkUploadVerdict =
  | { ok: true }
  | {
      ok: false
      code: 'chunk-wrong-session' | 'chunk-not-admitted' | 'chunk-bad-index' | 'chunk-too-large'
      message: string
    }

export function validateGuestChunkUpload(input: {
  lobbyState: LobbyState
  inviteSessionId: string
  sessionId: string
  index: number
  byteLength: number
}): GuestChunkUploadVerdict {
  if (input.sessionId !== input.inviteSessionId) {
    return {
      ok: false,
      code: 'chunk-wrong-session',
      message: 'Chunk upload refused: the invite belongs to a different session.',
    }
  }
  if (!GUEST_UPLOAD_LOBBY_STATES.includes(input.lobbyState)) {
    return {
      ok: false,
      code: 'chunk-not-admitted',
      message: 'Chunk upload refused: the guest has not been admitted, so no guest track exists.',
    }
  }
  if (!Number.isInteger(input.index) || input.index < 0) {
    return {
      ok: false,
      code: 'chunk-bad-index',
      message: 'Chunk index must be a non-negative integer.',
    }
  }
  if (
    !Number.isFinite(input.byteLength) ||
    input.byteLength <= 0 ||
    input.byteLength % 2 !== 0 ||
    input.byteLength > GUEST_CHUNK_MAX_BYTES
  ) {
    return {
      ok: false,
      code: 'chunk-too-large',
      message: `Chunk must be an even number of bytes between 2 and ${GUEST_CHUNK_MAX_BYTES} (one 250 ms s16 timeslice).`,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Guest chunk uploader (the credential chunk protocol's client core)
// ---------------------------------------------------------------------------

export interface GuestChunkTransport {
  /** The server's received-chunk list for this guest's track. */
  listReceived(): Promise<number[]>
  /** Sends one journal chunk's bytes; resolves when the server acks it. */
  sendChunk(index: number, bytes: Uint8Array): Promise<void>
  /** Declares the journal complete (footer facts + sync pairs + gaps). */
  complete(input: {
    totalChunks: number
    totalFrames: number
    checksum: string
    headSync: GuestSyncPair
    tailSync: GuestSyncPair
    gaps: GuestGapInput[]
  }): Promise<{ ok: true }>
}

export type GuestChunkUploadResult = {
  sentChunks: number[]
  skippedAckedChunks: number[]
  totalChunks: number
  complete: boolean
}

/**
 * Progressive, resumable upload of a finished (or in-progress)
 * journal over the credential chunk protocol. Resume semantics are
 * the POD-06 bridge's: the server's received list is re-read first
 * and acked chunks are NEVER re-sent — an interrupted upload (tab
 * closed, network killed at ~50%) resumes exactly where it stopped,
 * with no duplicates. A transport failure stops the pump and reports
 * progress; nothing is marked complete until every chunk is acked
 * and the footer declaration lands.
 */
export class GuestChunkUploader {
  constructor(
    private readonly transport: GuestChunkTransport,
    private readonly storage: ChunkStorage,
    private readonly journal: ChunkJournal,
  ) {}

  async pump(): Promise<GuestChunkUploadResult & { failedAtChunk: number | null }> {
    const received = new Set(await this.transport.listReceived())
    const sentChunks: number[] = []
    const skippedAckedChunks: number[] = []
    let failedAtChunk: number | null = null
    for (const record of this.journal.chunkRecords) {
      if (received.has(record.index)) {
        skippedAckedChunks.push(record.index)
        continue
      }
      const bytes = await this.storage.getChunk(this.journal.meta.recordingId, record.index)
      if (!bytes) {
        failedAtChunk = record.index
        break
      }
      try {
        await this.transport.sendChunk(record.index, bytes)
        sentChunks.push(record.index)
      } catch {
        failedAtChunk = record.index
        break
      }
    }
    return {
      sentChunks,
      skippedAckedChunks,
      totalChunks: this.journal.chunkCount,
      complete: failedAtChunk === null,
      failedAtChunk,
    }
  }

  /** Pumps, then declares completion with the journal's footer facts + sync pairs + gaps. */
  async finish(input: {
    headSync: GuestSyncPair
    tailSync: GuestSyncPair
    gaps: GuestGapInput[]
    footer: { totalChunks: number; totalFrames: number; checksum: string }
  }): Promise<GuestChunkUploadResult> {
    const pumped = await this.pump()
    if (!pumped.complete) return pumped
    await this.transport.complete({
      totalChunks: input.footer.totalChunks,
      totalFrames: input.footer.totalFrames,
      checksum: input.footer.checksum,
      headSync: input.headSync,
      tailSync: input.tailSync,
      gaps: input.gaps,
    })
    return pumped
  }
}

// ---------------------------------------------------------------------------
// GuestLocalRecorder — the facade the guest page drives
// ---------------------------------------------------------------------------

/**
 * Binds the lifecycle machine + POD-06 journal + optional POD-06
 * upload bridge into one guest-side recorder. PCM arrives from the
 * browser adapter already normalized to the 48 kHz working format
 * (mono); full timeslices journal immediately, the tail flushes at
 * stop. All decisions live here and are headlessly tested; the
 * adapter only moves PCM and lifecycle events.
 */
export class GuestLocalRecorder {
  readonly state: GuestRecordingState
  private journal: ChunkJournal | null = null
  private bridge: UploadBridge | null = null
  private pending: Float32Array[] = []
  private pendingFrames = 0
  private footer: { totalChunks: number; totalFrames: number; checksum: string } | null = null

  private constructor(
    binding: GuestRecordingBinding,
    private readonly storage: ChunkStorage,
    private readonly uploadTransport?: UploadTransport,
  ) {
    this.state = createGuestRecordingState(binding)
  }

  static async start(
    storage: ChunkStorage,
    binding: GuestRecordingBinding,
    headSync: GuestSyncPair,
    options: { uploadTransport?: UploadTransport } = {},
  ): Promise<GuestLocalRecorder> {
    const recorder = new GuestLocalRecorder(binding, storage, options.uploadTransport)
    const admitted = transitionGuestRecording(recorder.state, 'admit', {
      atGuestSample: 0,
      sync: headSync,
    })
    if (!admitted.ok) throw new Error(admitted.message)
    recorder.journal = await ChunkJournal.open(storage, {
      recordingId: guestJournalRecordingId(binding),
      sessionId: binding.sessionId,
      trackId: binding.trackId,
      channels: 1,
      sampleRate: WORKING_SAMPLE_RATE,
    } satisfies RecordingMeta)
    if (options.uploadTransport) {
      recorder.bridge = new UploadBridge(options.uploadTransport, recorder.journal, storage)
    }
    return recorder
  }

  get journalRef(): ChunkJournal | null {
    return this.journal
  }

  get journalFooter(): { totalChunks: number; totalFrames: number; checksum: string } | null {
    return this.footer
  }

  /** Guest-clock position: journalled frames + buffered frames. */
  get guestSample(): number {
    return (this.journal?.framesRecorded ?? 0) + this.pendingFrames
  }

  /** Ingests interleaved mono PCM at the working rate. */
  async ingest(pcm: Float32Array): Promise<void> {
    if (this.state.phase !== 'recording' && this.state.phase !== 'reconnecting') {
      throw new Error(`Guest recorder is ${this.state.phase}; ingest refused.`)
    }
    if (!this.journal) throw new Error('Guest recorder has no journal.')
    this.pending.push(new Float32Array(pcm))
    this.pendingFrames += pcm.length
    while (this.pendingFrames >= TIMESLICE_FRAMES) {
      const chunk = this.takePending(TIMESLICE_FRAMES)
      await this.journal.appendChunk(chunk)
      this.state.chunksJournaled = this.journal.chunkCount
    }
  }

  private takePending(frames: number): Float32Array {
    const out = new Float32Array(frames)
    let written = 0
    while (written < out.length && this.pending.length > 0) {
      const head = this.pending[0]!
      const take = Math.min(head.length, out.length - written)
      out.set(head.subarray(0, take), written)
      written += take
      if (take === head.length) this.pending.shift()
      else this.pending[0] = head.subarray(take)
    }
    this.pendingFrames -= frames
    return out
  }

  private pendingGap: { fromSample: number; atMs: number } | null = null

  /** POD-10 peer disconnect: opens a gap candidate on the guest clock. */
  noteDisconnect(atMs: number = Date.now()): void {
    const result = transitionGuestRecording(this.state, 'disconnect', {
      atGuestSample: this.guestSample,
    })
    if (!result.ok) throw new Error(result.message)
    this.pendingGap = { fromSample: this.guestSample, atMs }
  }

  /**
   * Resolves a pending disconnect gap: the missing range is the
   * wall-clock interval (at the working rate) minus the frames the
   * journal actually captured during it. When capture kept running
   * (the normal local-recording case) the difference is ~0 and NO
   * gap exists — the audio is real. When capture stopped, the
   * missing frames are journalled as silence (keeping the guest
   * clock aligned to the timeline) AND recorded as a gap — named,
   * never silently stretched over.
   */
  private async resolvePendingGap(atMs: number): Promise<void> {
    if (!this.pendingGap) return
    const pending = this.pendingGap
    this.pendingGap = null
    const capturedDuring = this.guestSample - pending.fromSample
    const wallFrames = Math.round(((atMs - pending.atMs) / 1000) * WORKING_SAMPLE_RATE)
    const missing = wallFrames - capturedDuring
    if (missing <= 0) return
    recordGuestGap(this.state, {
      fromGuestSample: this.guestSample,
      frames: missing,
      reason: 'disconnect',
    })
    let remaining = missing
    while (remaining > 0) {
      const take = Math.min(remaining, TIMESLICE_FRAMES)
      await this.ingest(new Float32Array(take))
      remaining -= take
    }
  }

  /** POD-10 peer reconnect inside grace: resolves the gap candidate. */
  async noteReconnect(atMs: number = Date.now()): Promise<void> {
    const result = transitionGuestRecording(this.state, 'reconnect', {
      atGuestSample: this.guestSample,
    })
    if (!result.ok) throw new Error(result.message)
    await this.resolvePendingGap(atMs)
  }

  /**
   * Stops on leave / drop / host stop: seals any open gap, flushes
   * the buffered tail as the journal's final chunk, finalizes the
   * journal, and records the tail sync pair. The track is now ready
   * for progressive upload + conform.
   */
  async stop(tailSync: GuestSyncPair, atMs: number = Date.now()): Promise<GuestRecordingState> {
    if (!this.journal) throw new Error('Guest recorder has no journal.')
    // A stop that lands mid-disconnect resolves the gap first (the
    // reconnect transition is the machine's way back to `recording`,
    // from which `stop` is legal and the silence can be journalled).
    if (this.state.phase === 'reconnecting') {
      const back = transitionGuestRecording(this.state, 'reconnect', {
        atGuestSample: this.guestSample,
      })
      if (!back.ok) throw new Error(back.message)
      await this.resolvePendingGap(atMs)
    }
    // Flush first so the stop position (and any gap it seals) is the
    // track's true final frame, tail chunk included.
    if (this.pendingFrames > 0) {
      const tail = this.takePending(this.pendingFrames)
      await this.journal.appendChunk(tail, { final: true })
      this.state.chunksJournaled = this.journal.chunkCount
    }
    const stopped = transitionGuestRecording(this.state, 'stop', {
      atGuestSample: this.journal.framesRecorded,
      sync: tailSync,
    })
    if (!stopped.ok) throw new Error(stopped.message)
    this.footer = await this.journal.finalize()
    return this.state
  }

  /**
   * POD-06 bridge pump (media-upload-session path). Failures leave
   * chunks pending; a later pump/resume re-offers only those.
   */
  async pumpBridgeUpload(filename: string): Promise<{ acked: number; total: number }> {
    if (!this.bridge || !this.journal) return { acked: 0, total: this.journal?.chunkCount ?? 0 }
    if (this.state.phase === 'stopped' || this.state.phase === 'failed') {
      transitionGuestRecording(this.state, 'upload-begin', { atGuestSample: this.guestSample })
    }
    await this.bridge.begin(filename)
    const pumped = await this.bridge.pump()
    this.state.chunksUploaded = pumped.ackedChunks
    if (pumped.failedAtUploadChunk !== null) {
      if (this.state.phase === 'uploading') {
        transitionGuestRecording(this.state, 'upload-failed', {
          atGuestSample: this.guestSample,
          detail: `upload chunk ${pumped.failedAtUploadChunk} failed; resume re-offers pending chunks only`,
        })
      }
    } else if (pumped.ackedChunks === pumped.totalChunks && this.state.phase === 'uploading') {
      transitionGuestRecording(this.state, 'upload-complete', {
        atGuestSample: this.guestSample,
      })
    }
    return { acked: pumped.ackedChunks, total: pumped.totalChunks }
  }

  telemetry(): GuestRecordingTelemetry {
    return guestRecordingTelemetry(this.state)
  }
}
