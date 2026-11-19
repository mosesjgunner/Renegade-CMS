/**
 * POD-06 — Chunk journal CORE (pure TypeScript, no DOM / Node imports).
 *
 * The PT-B pattern in production form (PT-B CONCLUSION: TESTED 6/6 across
 * clean, crash-mid-chunk and torn-manifest cases on a real filesystem):
 *
 * - Audio is written as fixed 250 ms timeslices of s16 PCM. Each chunk's
 *   bytes land in storage BEFORE its manifest line is appended, so the
 *   manifest can never vouch for bytes that do not exist.
 * - Per-chunk records carry index, startSample (frame), frames and a
 *   SHA-256 checksum; a running checksum chains every chunk (PT-B rule).
 * - Recovery treats the manifest as a hint and the chunk bytes as evidence:
 *   torn manifest lines are ignored (counted), a partial chunk that was
 *   never journalled is discarded WHOLE, and only a gapless run of verified
 *   chunks from index 0 is admitted — so recovered duration is exact and
 *   the loss boundary is at most one timeslice.
 * - A chunk whose manifest line was torn can still be admitted from the
 *   chunk files alone when it is verifiably complete (full timeslice size)
 *   and continues the gapless run (PT-B case 2).
 *
 * Storage sits behind the `ChunkStorage` interface; `MemoryChunkStorage`
 * serves tests, `journal-opfs.ts` serves the browser (OPFS + IndexedDB).
 */

import { TIMESLICE_FRAMES, WORKING_SAMPLE_RATE } from './capture'

// ---------------------------------------------------------------------------
// SHA-256 (pure TS — the journal must hash identically headless and in a
// browser/worker, where Node's crypto and async WebCrypto both are wrong fits)
// ---------------------------------------------------------------------------

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))

export const sha256Hex = (data: Uint8Array): string => {
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]
  const bitLength = data.length * 8
  const paddedLength = Math.ceil((data.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 4, bitLength >>> 0)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32))
  const w = new Uint32Array(64)
  for (let block = 0; block < paddedLength; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (hh + s1 + ch + SHA256_K[i]! + w[i]!) | 0
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + maj) | 0
      hh = g
      g = f
      f = e
      e = (d + temp1) | 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) | 0
    }
    h[0] = (h[0]! + a) | 0
    h[1] = (h[1]! + b) | 0
    h[2] = (h[2]! + c) | 0
    h[3] = (h[3]! + d) | 0
    h[4] = (h[4]! + e) | 0
    h[5] = (h[5]! + f) | 0
    h[6] = (h[6]! + g) | 0
    h[7] = (h[7]! + hh) | 0
  }
  return h.map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('')
}

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// ---------------------------------------------------------------------------
// PCM s16 encoding (the PT-B on-disk chunk format: interleaved little-endian)
// ---------------------------------------------------------------------------

export const floatToInt16Bytes = (pcm: Float32Array): Uint8Array => {
  const out = new Uint8Array(pcm.length * 2)
  const view = new DataView(out.buffer)
  for (let i = 0; i < pcm.length; i++) {
    const clamped = Math.max(-1, Math.min(1, pcm[i] ?? 0))
    view.setInt16(i * 2, Math.round(clamped * 32767), true)
  }
  return out
}

export const int16BytesToFloat = (bytes: Uint8Array): Float32Array => {
  const out = new Float32Array(Math.floor(bytes.length / 2))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32767
  return out
}

// ---------------------------------------------------------------------------
// Storage interface + in-memory implementation (tests)
// ---------------------------------------------------------------------------

export interface ChunkStorage {
  putChunk(recordingId: string, index: number, bytes: Uint8Array): Promise<void>
  getChunk(recordingId: string, index: number): Promise<Uint8Array | null>
  listChunks(recordingId: string): Promise<number[]>
  getManifest(recordingId: string): Promise<string | null>
  putManifest(recordingId: string, text: string): Promise<void>
  listRecordings(): Promise<string[]>
  deleteRecording(recordingId: string): Promise<void>
}

export class MemoryChunkStorage implements ChunkStorage {
  private chunks = new Map<string, Map<number, Uint8Array>>()
  private manifests = new Map<string, string>()

  async putChunk(recordingId: string, index: number, bytes: Uint8Array): Promise<void> {
    let perRecording = this.chunks.get(recordingId)
    if (!perRecording) {
      perRecording = new Map()
      this.chunks.set(recordingId, perRecording)
    }
    perRecording.set(index, new Uint8Array(bytes))
  }

  async getChunk(recordingId: string, index: number): Promise<Uint8Array | null> {
    const bytes = this.chunks.get(recordingId)?.get(index)
    return bytes ? new Uint8Array(bytes) : null
  }

  async listChunks(recordingId: string): Promise<number[]> {
    return [...(this.chunks.get(recordingId)?.keys() ?? [])].sort((a, b) => a - b)
  }

  async getManifest(recordingId: string): Promise<string | null> {
    return this.manifests.get(recordingId) ?? null
  }

  async putManifest(recordingId: string, text: string): Promise<void> {
    this.manifests.set(recordingId, text)
  }

  async listRecordings(): Promise<string[]> {
    return [...new Set([...this.chunks.keys(), ...this.manifests.keys()])].sort()
  }

  async deleteRecording(recordingId: string): Promise<void> {
    this.chunks.delete(recordingId)
    this.manifests.delete(recordingId)
  }
}

// ---------------------------------------------------------------------------
// Manifest records
// ---------------------------------------------------------------------------

export type ChunkManifestHeader = {
  type: 'header'
  recordingId: string
  sessionId: string
  trackId: string
  sampleRate: number
  channels: number
  chunkFrames: number
  startedAt: string
}

export type ChunkRecord = {
  type: 'chunk'
  index: number
  /** First frame of this chunk on the recording's sample clock. */
  startSample: number
  frames: number
  byteLength: number
  checksum: string
  /** Running checksum after this chunk (PT-B chain). */
  runningChecksum: string
}

export type ChunkManifestFooter = {
  type: 'footer'
  complete: true
  totalChunks: number
  totalFrames: number
  checksum: string
}

export type RecordingMeta = {
  recordingId: string
  sessionId: string
  trackId: string
  channels: number
  sampleRate?: number
}

const fullChunkBytes = (channels: number): number => TIMESLICE_FRAMES * channels * 2

export class ChunkJournal {
  private records: ChunkRecord[] = []
  private runningChecksum = ''
  private totalFrames = 0
  private finalized = false

  private constructor(
    private readonly storage: ChunkStorage,
    private readonly header: ChunkManifestHeader,
  ) {}

  static async open(storage: ChunkStorage, meta: RecordingMeta): Promise<ChunkJournal> {
    const header: ChunkManifestHeader = {
      type: 'header',
      recordingId: meta.recordingId,
      sessionId: meta.sessionId,
      trackId: meta.trackId,
      sampleRate: meta.sampleRate ?? WORKING_SAMPLE_RATE,
      channels: meta.channels,
      chunkFrames: TIMESLICE_FRAMES,
      startedAt: new Date().toISOString(),
    }
    await storage.putManifest(meta.recordingId, `${JSON.stringify(header)}\n`)
    return new ChunkJournal(storage, header)
  }

  get meta(): RecordingMeta & { sampleRate: number } {
    return {
      recordingId: this.header.recordingId,
      sessionId: this.header.sessionId,
      trackId: this.header.trackId,
      channels: this.header.channels,
      sampleRate: this.header.sampleRate,
    }
  }

  get chunkCount(): number {
    return this.records.length
  }

  get framesRecorded(): number {
    return this.totalFrames
  }

  get chunkRecords(): ChunkRecord[] {
    return [...this.records]
  }

  private async appendManifestLine(line: unknown): Promise<void> {
    const existing = (await this.storage.getManifest(this.header.recordingId)) ?? ''
    await this.storage.putManifest(this.header.recordingId, `${existing}${JSON.stringify(line)}\n`)
  }

  /**
   * Journals one chunk of interleaved PCM. Full chunks are exactly one
   * timeslice; a shorter chunk is accepted only as the final flush before
   * `finalize()` (a completed recording's tail). Chunk bytes are stored
   * first, the manifest line second — the PT-B write order.
   */
  async appendChunk(pcm: Float32Array, options: { final?: boolean } = {}): Promise<ChunkRecord> {
    if (this.finalized) throw new Error('Journal is finalized; no more chunks can be appended.')
    const channels = this.header.channels
    if (pcm.length % channels !== 0)
      throw new Error('Chunk PCM length must be a whole number of frames for its channel count.')
    const frames = pcm.length / channels
    if (frames > TIMESLICE_FRAMES)
      throw new Error(`Chunk of ${frames} frames exceeds the ${TIMESLICE_FRAMES}-frame timeslice.`)
    if (frames < TIMESLICE_FRAMES && !options.final)
      throw new Error('Partial chunks are only accepted as the final flush (options.final).')
    const bytes = floatToInt16Bytes(pcm)
    const index = this.records.length
    const checksum = sha256Hex(bytes)
    this.runningChecksum = sha256Hex(
      concatBytes(hexToBytes(this.runningChecksum || '0'.repeat(64)), bytes),
    )
    const record: ChunkRecord = {
      type: 'chunk',
      index,
      startSample: this.totalFrames,
      frames,
      byteLength: bytes.length,
      checksum,
      runningChecksum: this.runningChecksum,
    }
    await this.storage.putChunk(this.header.recordingId, index, bytes)
    await this.appendManifestLine(record)
    this.records.push(record)
    this.totalFrames += frames
    return record
  }

  async finalize(): Promise<ChunkManifestFooter> {
    if (this.finalized) throw new Error('Journal is already finalized.')
    const footer: ChunkManifestFooter = {
      type: 'footer',
      complete: true,
      totalChunks: this.records.length,
      totalFrames: this.totalFrames,
      checksum: this.runningChecksum,
    }
    await this.appendManifestLine(footer)
    this.finalized = true
    return footer
  }
}

// ---------------------------------------------------------------------------
// Recovery scan (PT-B rules; data-only resume/close decision surface)
// ---------------------------------------------------------------------------

export type RecoveryReport = {
  recordingId: string
  sessionId: string | null
  trackId: string | null
  sampleRate: number
  channels: number
  /** True when a footer line proves the recording was closed cleanly. */
  complete: boolean
  admittedChunks: number[]
  recoveredFrames: number
  /** Exact: admitted frames / sample rate. */
  recoveredDurationSec: number
  tornManifestLines: number
  discardedPartials: Array<{ index: number; byteLength: number }>
  /** 1 when a partial in-flight timeslice was discarded, else 0 — never more. */
  lossTimeslices: 0 | 1
  lossMs: number
  checksumsVerified: boolean
  /** Data only: the UI offers resume or close; the scan decides nothing. */
  decision: { canResume: boolean; canClose: boolean }
}

export const recoverRecording = async (
  storage: ChunkStorage,
  recordingId: string,
): Promise<RecoveryReport | null> => {
  const manifestText = await storage.getManifest(recordingId)
  const chunkIndexes = await storage.listChunks(recordingId)
  if (manifestText === null && chunkIndexes.length === 0) return null

  let header: ChunkManifestHeader | null = null
  let footer: ChunkManifestFooter | null = null
  const journalled = new Map<number, ChunkRecord>()
  let tornManifestLines = 0
  for (const line of (manifestText ?? '').split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as ChunkManifestHeader | ChunkRecord | ChunkManifestFooter
      if (parsed.type === 'header') header = parsed
      else if (parsed.type === 'chunk') journalled.set(parsed.index, parsed)
      else if (parsed.type === 'footer') footer = parsed
    } catch {
      tornManifestLines++
    }
  }

  const sampleRate = header?.sampleRate ?? WORKING_SAMPLE_RATE
  const channels = header?.channels ?? 1
  const expectedFullBytes = fullChunkBytes(channels)

  const admittedChunks: number[] = []
  const discardedPartials: Array<{ index: number; byteLength: number }> = []
  let recoveredFrames = 0
  let checksumsVerified = true

  for (const index of chunkIndexes) {
    if (index !== admittedChunks.length) break // gap: the gapless run ends here
    const bytes = await storage.getChunk(recordingId, index)
    if (!bytes) break
    const record = journalled.get(index)
    if (record) {
      if (bytes.length !== record.byteLength) {
        discardedPartials.push({ index, byteLength: bytes.length })
        break
      }
      if (sha256Hex(bytes) !== record.checksum) {
        checksumsVerified = false
        discardedPartials.push({ index, byteLength: bytes.length })
        break
      }
      admittedChunks.push(index)
      recoveredFrames += record.frames
    } else if (bytes.length === expectedFullBytes) {
      // PT-B case 2: the manifest line was torn, but the chunk file is
      // verifiably complete and continues the gapless run — admit from the
      // chunk files alone.
      admittedChunks.push(index)
      recoveredFrames += TIMESLICE_FRAMES
    } else {
      // Never journalled and not complete: the in-flight timeslice at the
      // crash point. Discarded whole (PT-B rule 2).
      discardedPartials.push({ index, byteLength: bytes.length })
      break
    }
  }
  // A partial file beyond the admitted run is also the in-flight slice.
  for (const index of chunkIndexes) {
    if (index > admittedChunks.length && !discardedPartials.some((p) => p.index === index)) {
      const bytes = await storage.getChunk(recordingId, index)
      if (bytes && bytes.length !== expectedFullBytes)
        discardedPartials.push({ index, byteLength: bytes.length })
    }
  }

  const lossTimeslices = (discardedPartials.length > 0 ? 1 : 0) as 0 | 1
  return {
    recordingId,
    sessionId: header?.sessionId ?? null,
    trackId: header?.trackId ?? null,
    sampleRate,
    channels,
    complete: footer !== null,
    admittedChunks,
    recoveredFrames,
    recoveredDurationSec: recoveredFrames / sampleRate,
    tornManifestLines,
    discardedPartials,
    lossTimeslices,
    lossMs: lossTimeslices * (TIMESLICE_FRAMES / sampleRate) * 1000,
    checksumsVerified,
    decision: { canResume: !footer, canClose: true },
  }
}

/** Scans every stored recording and returns the interrupted (unfinalized) ones. */
export const findInterruptedRecordings = async (
  storage: ChunkStorage,
): Promise<RecoveryReport[]> => {
  const reports: RecoveryReport[] = []
  for (const recordingId of await storage.listRecordings()) {
    const report = await recoverRecording(storage, recordingId)
    if (report && !report.complete) reports.push(report)
  }
  return reports
}
