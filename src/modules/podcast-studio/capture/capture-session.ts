/**
 * POD-06 — Capture session facade (pure core; browser wiring feeds it).
 *
 * Binds the capture layer into a POD-05 studio session: device prefs gate
 * (fail-closed), dual-path raw assertion, PCM ingest normalized to the
 * 48 kHz working format, the chunk journal, level metering, and the
 * progressive upload bridge. The facade owns NO browser APIs — the adapter
 * layer (devices-browser + worklet loader) delivers device lists, track
 * settings and PCM chunks; everything the facade decides is headlessly
 * testable.
 *
 * Recording states are mirrored into the POD-05 session document (desk
 * state + message-bar log entries) through the session engine, so a saved
 * session shows capture health honestly.
 */

import { postMessage, setSessionState, type StudioSessionDoc } from '../session-engine'
import { assertRawSettings, TIMESLICE_FRAMES, type TrackSettingsLike } from './capture'
import {
  assertSavedDevicesPresent,
  DeviceServiceCore,
  type CaptureDeviceInfo,
  type DeviceMissingError,
  type DeviceRole,
  type ParticipantDevicePrefs,
} from './devices'
import { ChunkJournal, type ChunkStorage } from './journal'
import { LevelMeter } from './levels'
import { deinterleave, normalizeToWorkingFormat, interleave, type WorkingKind } from './normalize'
import { UploadBridge, type UploadTransport } from './upload-bridge'

export type CaptureFacadeState = 'idle' | 'recording' | 'paused' | 'stopped' | 'denied' | 'error'

export type CaptureHealth = {
  state: CaptureFacadeState
  framesRecorded: number
  durationSec: number
  chunksJournaled: number
  chunksUploaded: number
  uploadState: 'local-only' | 'uploading' | 'uploaded'
  deviceWarnings: string[]
  rawWarning: string | null
  levels: { rmsDb: number; peakDb: number; peakHoldDb: number }
}

export type CaptureStartResult =
  | { ok: true }
  | { ok: false; code: 'device-missing'; errors: DeviceMissingError[] }
  | { ok: false; code: 'already-recording' }

export class CaptureSessionFacade {
  readonly devices = new DeviceServiceCore()
  private state: CaptureFacadeState = 'idle'
  private journal: ChunkJournal | null = null
  private bridge: UploadBridge | null = null
  private meter = new LevelMeter()
  private pending: Float32Array[] = []
  private pendingFrames = 0
  private deviceWarnings: string[] = []
  private rawWarning: string | null = null
  private uploadedChunksCache = 0
  private session: StudioSessionDoc

  constructor(
    session: StudioSessionDoc,
    private readonly storage: ChunkStorage,
    private readonly options: {
      participantId: string
      trackId?: string
      kind?: WorkingKind
      uploadTransport?: UploadTransport
    },
  ) {
    this.session = session
  }

  get sessionDoc(): StudioSessionDoc {
    return this.session
  }

  get captureState(): CaptureFacadeState {
    return this.state
  }

  /**
   * Starts capture. FAIL-CLOSED: if any saved device from the participant's
   * prefs is absent from `availableDevices`, start is refused with the
   * structured device-missing errors and nothing is recorded. When
   * `masterSettings` are supplied (from the opened track's getSettings()),
   * the raw assertion runs and a processed master produces a visible
   * warning carried in health + the session log — never silent acceptance.
   */
  async start(input: {
    availableDevices: CaptureDeviceInfo[]
    prefs: ParticipantDevicePrefs | null
    masterSettings?: TrackSettingsLike
    recordingId?: string
  }): Promise<CaptureStartResult> {
    if (this.state === 'recording') return { ok: false, code: 'already-recording' }
    const gate = assertSavedDevicesPresent(input.prefs, input.availableDevices)
    if (!gate.ok) {
      this.state = 'error'
      this.session = postMessage(
        this.session,
        `Capture refused: saved device missing for ${gate.errors
          .map((error) => `${error.role} ("${error.savedDeviceLabel}")`)
          .join(', ')}. Reconnect it or choose a replacement — no substitute was used.`,
        'error',
      )
      return { ok: false, code: 'device-missing', errors: gate.errors }
    }
    this.devices.setDevices(input.availableDevices)
    if (input.prefs) {
      for (const [role, deviceId] of Object.entries(input.prefs.assignments)) {
        if (deviceId) this.devices.assign(role as DeviceRole, deviceId)
      }
    }
    this.devices.drainEvents()
    if (input.masterSettings) {
      const assertion = assertRawSettings(input.masterSettings)
      this.rawWarning = assertion.warning
      if (assertion.warning) this.session = postMessage(this.session, assertion.warning, 'warn')
    }
    const recordingId =
      input.recordingId ?? `rec-${this.session.id}-${this.options.trackId ?? 'host'}`
    this.journal = await ChunkJournal.open(this.storage, {
      recordingId,
      sessionId: this.session.id,
      trackId: this.options.trackId ?? 'host',
      channels: this.options.kind === 'program' ? 2 : 1,
    })
    if (this.options.uploadTransport)
      this.bridge = new UploadBridge(this.options.uploadTransport, this.journal, this.storage)
    this.meter.reset()
    this.pending = []
    this.pendingFrames = 0
    this.state = 'recording'
    this.session = setSessionState(this.session, 'recording')
    return { ok: true }
  }

  /**
   * Ingests interleaved PCM at its source rate; normalization to the
   * working format happens here so the journal only ever holds canonical
   * 48 kHz chunks. Full timeslices are journaled immediately; the remainder
   * is buffered for the next ingest or the stop() flush.
   */
  async ingest(pcm: Float32Array, source: { sampleRate: number; channels: number }): Promise<void> {
    if (this.state !== 'recording' || !this.journal)
      throw new Error('Capture is not recording; ingest refused.')
    const normalized = normalizeToWorkingFormat(
      { channels: deinterleave(pcm, source.channels), sampleRate: source.sampleRate },
      this.options.kind ?? 'voice',
    )
    const interleaved = interleave(normalized.channels)
    this.meter.push(interleaved, (this.journal.framesRecorded / 48_000) * 1000)
    this.pending.push(interleaved)
    this.pendingFrames += normalized.frames
    while (this.pendingFrames >= TIMESLICE_FRAMES) {
      const chunk = this.takePending(TIMESLICE_FRAMES)
      await this.journal.appendChunk(chunk)
    }
  }

  private takePending(frames: number): Float32Array {
    const channels = this.options.kind === 'program' ? 2 : 1
    const out = new Float32Array(frames * channels)
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

  /** Handles a fresh device enumeration mid-session: a lost mic is diagnosed into health + the session log. */
  handleDevicesChanged(devices: CaptureDeviceInfo[]): void {
    this.devices.setDevices(devices)
    for (const event of this.devices.drainEvents()) {
      if (event.type === 'device-lost') {
        const warning = `Device lost during capture: ${event.role} ("${event.label || event.deviceId}", id ${event.deviceId}) is gone. Recording continues on the remaining sources — no substitute device was switched in. Recovery: ${event.recoveryOptions.join(', ')}.`
        this.deviceWarnings.push(warning)
        this.session = postMessage(this.session, warning, 'error')
      } else if (event.type === 'device-recovered') {
        const note = `Device recovered: ${event.role} ("${event.label || event.deviceId}") is back.`
        this.deviceWarnings = this.deviceWarnings.filter(
          (warning) => !warning.includes(event.deviceId),
        )
        this.session = postMessage(this.session, note, 'info')
      }
    }
  }

  pause(): void {
    if (this.state !== 'recording') return
    this.state = 'paused'
    this.session = setSessionState(this.session, 'paused')
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.state = 'recording'
    this.session = setSessionState(this.session, 'recording')
  }

  /** Flushes the buffered tail as the final chunk, finalizes the journal, and (optionally) begins progressive upload without blocking on it. */
  async stop(input: { uploadFilename?: string } = {}): Promise<CaptureHealth> {
    if (!this.journal) return this.health()
    if (this.pendingFrames > 0) {
      const tail = this.takePending(this.pendingFrames)
      await this.journal.appendChunk(tail, { final: true })
    }
    await this.journal.finalize()
    this.state = 'stopped'
    this.session = setSessionState(this.session, 'stopped')
    if (this.bridge && input.uploadFilename) {
      await this.bridge.begin(input.uploadFilename)
      await this.bridge.pump().catch(() => undefined)
      this.uploadedChunksCache = (await this.bridge.state()).ackedChunks
    }
    return this.health()
  }

  /** Upload progress for the current recording (bridge state, or local-only). */
  async uploadProgress(): Promise<{ acked: number; total: number }> {
    if (!this.bridge) return { acked: 0, total: this.journal?.chunkCount ?? 0 }
    const state = await this.bridge.state()
    return { acked: state.ackedChunks, total: state.totalChunks }
  }

  health(): CaptureHealth {
    const meter = this.meter.snapshot()
    return {
      state: this.state,
      framesRecorded: this.journal?.framesRecorded ?? 0,
      durationSec: (this.journal?.framesRecorded ?? 0) / 48_000,
      chunksJournaled: this.journal?.chunkCount ?? 0,
      chunksUploaded: this.uploadedChunksCache,
      uploadState: this.bridge ? 'uploading' : 'local-only',
      deviceWarnings: [...this.deviceWarnings],
      rawWarning: this.rawWarning,
      levels: { rmsDb: meter.rmsDb, peakDb: meter.peakDb, peakHoldDb: meter.peakHoldDb },
    }
  }
}
