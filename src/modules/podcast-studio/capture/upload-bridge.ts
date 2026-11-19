/**
 * POD-06 — Progressive upload bridge (pure core over a transport interface).
 *
 * Maps a recording's journal chunks onto the existing media upload sessions
 * (`src/modules/media/upload-sessions.ts`: create / write / read / finalize).
 * The bridge speaks to that module only through the `UploadTransport`
 * interface below; tests use a fake transport.
 *
 * POD-23: this module is BROWSER-SAFE by construction — its only import is
 * type-only (the journal types). The production wiring
 * (`createMediaUploadTransport`, which value-imports the server-only media
 * upload machinery) lives in `upload-transport.ts` (SERVER ONLY) and must
 * never be imported from browser-reachable code: Turbopack traced it from
 * the guest page's client bundle through here into `sharp`/`fs` and the
 * production build failed.
 *
 * Safety properties (POD-REQ-18):
 * - The local master is independent of upload state: journal chunks stay in
 *   local storage whatever the network does, and capture never blocks on
 *   upload — `pump()` is called opportunistically and failures simply leave
 *   chunks pending.
 * - Per-journal-chunk ack state: a journal chunk is `acked` only when every
 *   upload-session chunk covering its byte range has been received by the
 *   server (per `readUploadSession`'s received-chunk list on resume).
 * - Resumable after reload: a fresh bridge over the same journal +
 *   uploadSessionId re-reads the server state and re-offers only pending
 *   journal chunks — already-acked bytes are never re-sent.
 */

import type { ChunkJournal, ChunkStorage } from './journal'

export type UploadTransportSession = { id: string; chunkSize: number }

export type UploadTransportState = {
  id: string
  state: string
  chunkSize: number
  expectedSize: number
  receivedChunks: number[]
}

export interface UploadTransport {
  create(input: {
    filename: string
    size: number
    checksum?: string
  }): Promise<UploadTransportSession>
  write(
    sessionId: string,
    index: number,
    start: number,
    total: number,
    bytes: Uint8Array,
  ): Promise<unknown>
  read(sessionId: string): Promise<UploadTransportState>
  finalize(sessionId: string): Promise<{ id: string }>
}

export type JournalChunkUploadState = 'pending' | 'acked'

export type UploadBridgeState = {
  /** `local-only` until an upload session exists; the local master exists in every state. */
  localState: 'local-only' | 'uploading' | 'uploaded'
  uploadSessionId: string | null
  perChunk: JournalChunkUploadState[]
  ackedChunks: number
  totalChunks: number
}

type ByteRange = { start: number; end: number }

export class UploadBridge {
  private uploadSessionId: string | null = null
  private uploadChunkSize = 0
  private ackedUploadChunks = new Set<number>()
  private uploaded = false

  constructor(
    private readonly transport: UploadTransport,
    private readonly journal: ChunkJournal,
    private readonly storage: ChunkStorage,
  ) {}

  /** Byte range of each journal chunk in the assembled recording stream. */
  private async journalRanges(): Promise<ByteRange[]> {
    const ranges: ByteRange[] = []
    let offset = 0
    for (const record of this.journal.chunkRecords) {
      ranges.push({ start: offset, end: offset + record.byteLength })
      offset += record.byteLength
    }
    return ranges
  }

  private async assembledBytes(): Promise<Uint8Array> {
    const ranges = await this.journalRanges()
    const total = ranges.length > 0 ? ranges[ranges.length - 1]!.end : 0
    const out = new Uint8Array(total)
    for (const record of this.journal.chunkRecords) {
      const bytes = await this.storage.getChunk(this.journal.meta.recordingId, record.index)
      if (!bytes) throw new Error(`Journal chunk ${record.index} is missing from local storage.`)
      out.set(bytes, ranges[record.index]!.start)
    }
    return out
  }

  private uploadChunksCovering(range: ByteRange): number[] {
    if (this.uploadChunkSize <= 0) return []
    const first = Math.floor(range.start / this.uploadChunkSize)
    const last = Math.floor((range.end - 1) / this.uploadChunkSize)
    const indexes: number[] = []
    for (let i = first; i <= last; i++) indexes.push(i)
    return indexes
  }

  async state(): Promise<UploadBridgeState> {
    const ranges = await this.journalRanges()
    const perChunk = ranges.map((range) =>
      this.uploadSessionId !== null &&
      this.uploadChunksCovering(range).every((index) => this.ackedUploadChunks.has(index))
        ? ('acked' as const)
        : ('pending' as const),
    )
    return {
      localState: this.uploaded ? 'uploaded' : this.uploadSessionId ? 'uploading' : 'local-only',
      uploadSessionId: this.uploadSessionId,
      perChunk,
      ackedChunks: perChunk.filter((state) => state === 'acked').length,
      totalChunks: perChunk.length,
    }
  }

  /** Creates the upload session sized to the journal's current assembled bytes. Call after finalize, or with a stable chunk set. */
  async begin(filename: string): Promise<UploadBridgeState> {
    if (this.uploadSessionId) return this.state()
    const bytes = await this.assembledBytes()
    if (bytes.length === 0) throw new Error('Cannot upload an empty recording.')
    const session = await this.transport.create({ filename, size: bytes.length })
    this.uploadSessionId = session.id
    this.uploadChunkSize = session.chunkSize
    return this.state()
  }

  /** Reattaches to an existing upload session after a reload and adopts the server's received-chunk list. */
  async resume(uploadSessionId: string): Promise<UploadBridgeState> {
    const server = await this.transport.read(uploadSessionId)
    this.uploadSessionId = server.id
    this.uploadChunkSize = server.chunkSize
    this.ackedUploadChunks = new Set(server.receivedChunks)
    if (server.state === 'completed') this.uploaded = true
    return this.state()
  }

  /**
   * Uploads every upload-chunk covering a pending journal chunk, in order.
   * Stops at the first transport failure and reports the state reached —
   * pending chunks stay pending and are re-offered by the next pump/resume.
   * Never throws for a transport write failure; never touches the journal.
   */
  async pump(): Promise<UploadBridgeState & { failedAtUploadChunk: number | null }> {
    if (!this.uploadSessionId) throw new Error('Upload bridge has no session; call begin() first.')
    const ranges = await this.journalRanges()
    const bytes = await this.assembledBytes()
    const pendingUploadChunks = new Set<number>()
    ranges.forEach((range, journalIndex) => {
      const covered = this.uploadChunksCovering(range)
      const journalAcked = covered.every((index) => this.ackedUploadChunks.has(index))
      if (!journalAcked) for (const index of covered) pendingUploadChunks.add(index)
      void journalIndex
    })
    let failedAtUploadChunk: number | null = null
    for (const index of [...pendingUploadChunks].sort((a, b) => a - b)) {
      if (this.ackedUploadChunks.has(index)) continue
      const start = index * this.uploadChunkSize
      const slice = bytes.subarray(start, Math.min(start + this.uploadChunkSize, bytes.length))
      try {
        await this.transport.write(this.uploadSessionId, index, start, bytes.length, slice)
        this.ackedUploadChunks.add(index)
      } catch {
        failedAtUploadChunk = index
        break
      }
    }
    return { ...(await this.state()), failedAtUploadChunk }
  }

  /** Finalizes once every journal chunk is acked; returns the media asset id. */
  async finalize(): Promise<{ assetId: string }> {
    if (!this.uploadSessionId) throw new Error('Upload bridge has no session; call begin() first.')
    const state = await this.state()
    if (state.ackedChunks !== state.totalChunks)
      throw new Error(
        `Upload is incomplete: ${state.ackedChunks}/${state.totalChunks} journal chunks acked.`,
      )
    const asset = await this.transport.finalize(this.uploadSessionId)
    this.uploaded = true
    return { assetId: asset.id }
  }
}
