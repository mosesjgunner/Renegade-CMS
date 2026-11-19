/**
 * POD-21 (POD-16 gap) — Live ingest buffer (SERVER CORE): the server
 * side of the browser→ingest byte path POD-16 designed but did not
 * build. The studio browser sends program-bus audio as sequential
 * chunks; this buffer is where they land, per live session, before
 * the POD-16 relay consumes them.
 *
 * Format: raw s16le stereo PCM at the POD-00 working rate (48 kHz) —
 * exactly what the relay's pipe ingest already speaks. Opus chunks
 * are REFUSED by name: the relay consumes raw PCM and no decode stage
 * exists in this pass, so accepting Opus would be a silent lie.
 *
 * Storage follows the POD-09 chunk-storage patterns: a file-backed
 * per-session directory under the media storage area
 * (`<mediaDir>/podcast-live-ingest/<session>/`), one file per chunk
 * plus a JSONL manifest (header, one checksummed line per accepted
 * chunk, one line per detected gap) — the POD-06 journal layout
 * discipline, with bytes written BEFORE the manifest line (the PT-B
 * write order). The POD-19 traversal hardening is applied to the
 * session segment (`safeSegment`: dot-leading ids collapse, so a
 * hostile or accidental `..` session id can never escape the root).
 *
 * Sequence discipline (the POD-11 guest-chunk standard):
 * - Chunks carry sequence numbers starting at 0.
 * - A re-sent chunk with IDENTICAL bytes is an idempotent ack
 *   (`duplicate: true`), never a second copy.
 * - A re-sent chunk with DIFFERENT bytes is refused
 *   `chunk-conflict` — an ingest chunk's bytes cannot change.
 * - An out-of-order chunk is stored and buffered; a GAP is recorded
 *   in the manifest for the missing range. The relay-facing program
 *   file (`program.pcm`) only ever contains the CONTIGUOUS prefix in
 *   sequence order: when a missing chunk later arrives, the prefix
 *   extends through every buffered successor in one flush.
 *
 * Stall: the buffer tracks the last accepted chunk time; `isStalled`
 * is a pure check over an injected clock so the pump adapter (and its
 * tests) decide when "no chunks for N seconds" becomes a surfaced
 * event. Surfacing itself (relay health / session log) is the
 * caller's job — see `applyIngestStatus` in live-session.ts.
 */

import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const LIVE_INGEST_SAMPLE_RATE = 48_000
export const LIVE_INGEST_CHANNELS = 2
export const LIVE_INGEST_FORMAT = 's16le'
/** Default stall threshold: no accepted chunk for this long = stalled. */
export const LIVE_INGEST_STALL_MS = 3_000

export class LiveIngestError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'LiveIngestError'
    this.code = code
  }
}

export type LiveIngestGap = { fromSeq: number; toSeq: number }

export type LiveIngestStatus = {
  sessionRecordId: string
  format: string
  sampleRate: number
  channels: number
  /** Every accepted sequence number, sorted. */
  receivedSeqs: number[]
  /** The first not-yet-received sequence number (the contiguous prefix length). */
  nextSeq: number
  /** Missing ranges inside the received span, computed from the received set. */
  gaps: LiveIngestGap[]
  /** Bytes in the contiguous program file (what the relay can hear). */
  flushedBytes: number
  /** Bytes accepted in total, including buffered out-of-order chunks. */
  totalBytesReceived: number
  lastChunkAtIso: string | null
  startedAtIso: string | null
}

export type LiveIngestChunkResult = {
  seq: number
  /** True when this seq was already stored byte-identically (idempotent re-send). */
  duplicate: boolean
  status: LiveIngestStatus
}

type ChunkLine = {
  type: 'chunk'
  seq: number
  byteLength: number
  checksum: string
  atIso: string
}

type ManifestLine =
  | { type: 'header'; sessionRecordId: string; format: string; startedAtIso: string }
  | ChunkLine
  | { type: 'gap'; fromSeq: number; toSeq: number; atIso: string }

/** POD-19 hardening, same rule as recording/finalize.ts: dot-leading segments collapse. */
const safeSegment = (value: string): string => {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_')
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? '_' : cleaned
}

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const gapsOf = (received: Map<number, ChunkLine>): LiveIngestGap[] => {
  const gaps: LiveIngestGap[] = []
  if (received.size === 0) return gaps
  const max = Math.max(...received.keys())
  let open: number | null = null
  for (let seq = 0; seq <= max; seq++) {
    if (!received.has(seq) && open === null) open = seq
    if (received.has(seq) && open !== null) {
      gaps.push({ fromSeq: open, toSeq: seq - 1 })
      open = null
    }
  }
  return gaps
}

const nextSeqOf = (received: Map<number, ChunkLine>): number => {
  let seq = 0
  while (received.has(seq)) seq++
  return seq
}

// Writes to one session's buffer are serialized in-process: the
// browser sender is sequential by design, and this lock keeps a
// retry racing its own original from interleaving manifest lines.
const writeLocks = new Map<string, Promise<unknown>>()
const withWriteLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const previous = writeLocks.get(key) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  writeLocks.set(
    key,
    run.catch(() => undefined),
  )
  return run
}

export class LiveIngestBuffer {
  constructor(
    private readonly root: string,
    readonly sessionRecordId: string,
  ) {}

  get dir(): string {
    return join(this.root, safeSegment(this.sessionRecordId))
  }

  /** The contiguous, in-sequence program PCM the relay consumes. */
  get programPath(): string {
    return join(this.dir, 'program.pcm')
  }

  /** The named pipe the pump adapter feeds the program file into. */
  get fifoPath(): string {
    return join(this.dir, 'program.fifo')
  }

  private get manifestPath(): string {
    return join(this.dir, 'manifest.jsonl')
  }

  private chunkPath(seq: number): string {
    return join(this.dir, `chunk-${String(seq).padStart(6, '0')}.pcm`)
  }

  private async readManifest(): Promise<ManifestLine[]> {
    const text = await readFile(this.manifestPath, 'utf8').catch(() => '')
    const lines: ManifestLine[] = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        lines.push(JSON.parse(line) as ManifestLine)
      } catch {
        // Torn lines are ignored, exactly as the POD-06 recovery scan does.
      }
    }
    return lines
  }

  private async appendManifestLine(line: ManifestLine): Promise<void> {
    await appendFile(this.manifestPath, `${JSON.stringify(line)}\n`)
  }

  /** Opens (creating on first use) the buffer and returns its status. */
  async open(): Promise<LiveIngestStatus> {
    await mkdir(this.dir, { recursive: true })
    const lines = await this.readManifest()
    if (!lines.some((line) => line.type === 'header')) {
      await this.appendManifestLine({
        type: 'header',
        sessionRecordId: this.sessionRecordId,
        format: LIVE_INGEST_FORMAT,
        startedAtIso: new Date().toISOString(),
      })
    }
    return this.status()
  }

  async status(): Promise<LiveIngestStatus> {
    const lines = await this.readManifest()
    const header = lines.find((line) => line.type === 'header')
    const received = new Map<number, ChunkLine>()
    for (const line of lines) if (line.type === 'chunk') received.set(line.seq, line)
    const nextSeq = nextSeqOf(received)
    let flushedBytes = 0
    for (let seq = 0; seq < nextSeq; seq++) flushedBytes += received.get(seq)!.byteLength
    let totalBytesReceived = 0
    for (const line of received.values()) totalBytesReceived += line.byteLength
    const chunkLines = [...received.values()].sort((a, b) => a.seq - b.seq)
    return {
      sessionRecordId: this.sessionRecordId,
      format: LIVE_INGEST_FORMAT,
      sampleRate: LIVE_INGEST_SAMPLE_RATE,
      channels: LIVE_INGEST_CHANNELS,
      receivedSeqs: chunkLines.map((line) => line.seq),
      nextSeq,
      gaps: gapsOf(received),
      flushedBytes,
      totalBytesReceived,
      lastChunkAtIso: chunkLines[chunkLines.length - 1]?.atIso ?? null,
      startedAtIso: header?.type === 'header' ? header.startedAtIso : null,
    }
  }

  /**
   * Accepts one chunk. `format` must be the buffer's PCM format —
   * anything else (e.g. Opus) is refused by name rather than stored
   * as bytes the relay cannot consume.
   */
  async writeChunk(input: {
    seq: number
    bytes: Uint8Array
    format?: string
  }): Promise<LiveIngestChunkResult> {
    const format = input.format ?? LIVE_INGEST_FORMAT
    if (format !== LIVE_INGEST_FORMAT)
      throw new LiveIngestError(
        'PODCAST_LIVE_INGEST_FORMAT_UNSUPPORTED',
        `Live ingest accepts ${LIVE_INGEST_FORMAT} PCM chunks only; "${format}" would need a decode stage the relay does not have.`,
      )
    if (!Number.isInteger(input.seq) || input.seq < 0)
      throw new LiveIngestError(
        'PODCAST_LIVE_INGEST_BAD_SEQ',
        `Live ingest chunk sequence must be a non-negative integer; got ${String(input.seq)}.`,
      )
    if (input.bytes.byteLength === 0 || input.bytes.byteLength % 4 !== 0)
      throw new LiveIngestError(
        'PODCAST_LIVE_INGEST_BAD_CHUNK',
        `Live ingest chunks are s16le stereo frames (a multiple of 4 bytes, non-empty); got ${input.bytes.byteLength} bytes.`,
      )
    return withWriteLock(this.dir, async () => {
      await this.open()
      const lines = await this.readManifest()
      const received = new Map<number, ChunkLine>()
      for (const line of lines) if (line.type === 'chunk') received.set(line.seq, line)
      const checksum = sha256Hex(input.bytes)
      const existing = received.get(input.seq)
      if (existing) {
        if (existing.checksum !== checksum)
          throw new LiveIngestError(
            'PODCAST_LIVE_INGEST_CHUNK_CONFLICT',
            `Chunk ${input.seq} was already received with different bytes; an ingest chunk cannot change.`,
          )
        return { seq: input.seq, duplicate: true, status: await this.status() }
      }

      const gapBefore = gapsOf(received)
      // Bytes land BEFORE the manifest line (the PT-B write order).
      await writeFile(this.chunkPath(input.seq), input.bytes)
      const line: ChunkLine = {
        type: 'chunk',
        seq: input.seq,
        byteLength: input.bytes.byteLength,
        checksum,
        atIso: new Date().toISOString(),
      }
      await this.appendManifestLine(line)
      received.set(input.seq, line)

      // A chunk landing ahead of the contiguous prefix opens a gap:
      // record it in the manifest the moment it is detected.
      const gapsAfter = gapsOf(received)
      for (const gap of gapsAfter) {
        const known = gapBefore.some(
          (entry) => entry.fromSeq === gap.fromSeq && entry.toSeq === gap.toSeq,
        )
        const recorded = lines.some(
          (entry) =>
            entry.type === 'gap' && entry.fromSeq === gap.fromSeq && entry.toSeq === gap.toSeq,
        )
        if (!known && !recorded)
          await this.appendManifestLine({ type: 'gap', ...gap, atIso: new Date().toISOString() })
      }

      await this.flushProgramFile(received)
      return { seq: input.seq, duplicate: false, status: await this.status() }
    })
  }

  /**
   * Keeps `program.pcm` exactly equal to the contiguous prefix's
   * bytes, in sequence order. If the file's size disagrees with the
   * manifest prefix (a crash mid-append), it is rebuilt from the
   * chunk files; otherwise only the newly contiguous tail is appended.
   */
  private async flushProgramFile(received: Map<number, ChunkLine>): Promise<void> {
    const nextSeq = nextSeqOf(received)
    let expected = 0
    for (let seq = 0; seq < nextSeq; seq++) expected += received.get(seq)!.byteLength
    const currentSize = await stat(this.programPath)
      .then((entry) => entry.size)
      .catch(() => 0)
    if (currentSize === expected) return
    if (currentSize > expected || currentSize === 0) {
      // Rebuild: the file cannot be trusted as a prefix of the manifest.
      const parts: Buffer[] = []
      for (let seq = 0; seq < nextSeq; seq++) {
        const bytes = await readFile(this.chunkPath(seq)).catch(() => null)
        if (!bytes) break
        parts.push(bytes)
      }
      await writeFile(this.programPath, Buffer.concat(parts))
      return
    }
    // Append only the chunks that extend the prefix beyond currentSize.
    let offset = 0
    for (let seq = 0; seq < nextSeq; seq++) {
      const line = received.get(seq)!
      if (offset + line.byteLength <= currentSize) {
        offset += line.byteLength
        continue
      }
      const bytes = await readFile(this.chunkPath(seq))
      await appendFile(this.programPath, bytes.subarray(Math.max(0, currentSize - offset)))
      offset += line.byteLength
    }
  }

  /**
   * Reads program bytes from `offset` to the current flushed end —
   * the pump adapter's tail read. Returns the bytes and the offset
   * to resume from (== the flushed byte count when caught up).
   */
  async readProgramFrom(offset: number): Promise<{ bytes: Buffer; nextOffset: number }> {
    const size = await stat(this.programPath)
      .then((entry) => entry.size)
      .catch(() => 0)
    if (offset >= size) return { bytes: Buffer.alloc(0), nextOffset: size }
    const handle = await readFile(this.programPath)
    return { bytes: handle.subarray(offset, size), nextOffset: size }
  }

  /**
   * Pure stall check over an injected clock: true when at least one
   * chunk has landed and none has arrived for `stallMs`.
   */
  async isStalled(nowMs: number, stallMs = LIVE_INGEST_STALL_MS): Promise<boolean> {
    const status = await this.status()
    if (!status.lastChunkAtIso) return false
    return nowMs - Date.parse(status.lastChunkAtIso) >= stallMs
  }
}
