/**
 * POD-21 — Live ingest pump (ADAPTER; the only file in the live
 * module besides relay-process.ts that touches processes/FIFOs).
 *
 * The bridge between the ingest buffer and the relay: ffmpeg cannot
 * tail a growing file in real time, so the buffer's program file is
 * pumped into a NAMED PIPE (FIFO) that the relay's `ingest` input
 * reads exactly like its stdin pipe. The pump:
 *
 * - creates the FIFO inside the buffer's session directory,
 * - opens the write end (which rendezvous-blocks until the relay's
 *   ffmpeg opens the read end — start the pump first, then the
 *   relay, or in any order: both sides block until they meet),
 * - polls the buffer's program file and writes every newly flushed
 *   byte, in order, respecting FIFO backpressure (`drain`),
 * - survives relay restarts: when ffmpeg dies, the FIFO write end
 *   errors (EPIPE) and the pump re-opens it for the supervisor's
 *   next spawn. Bytes offered while no reader was attached are lost
 *   — exactly like a network drop on a live stream; the pump never
 *   rewinds the program file into a restarted relay,
 * - watches for an INGEST STALL: no new program bytes for `stallMs`
 *   while the pump is running fires `onStall` ONCE per stall episode
 *   (and `onResume` when bytes flow again). The caller surfaces the
 *   stall into the relay health / session log (live-service's
 *   `recordIngestStallInSession`); the pump itself never touches the
 *   session doc, the recorder, or any store — the POD-REQ-35
 *   separation holds for the ingest path too.
 *
 * Flow pacing is natural: bytes appear in the buffer as the browser
 * sends them (real time), and the pump forwards them as they land.
 * A backlog buffered before the relay starts is forwarded as fast as
 * the FIFO drains — ffmpeg/Icecast pacing from there is the same as
 * the POD-16 pipe path.
 */

import { execFile } from 'node:child_process'
import { createWriteStream, type WriteStream } from 'node:fs'
import { promisify } from 'node:util'

import { LIVE_INGEST_STALL_MS, type LiveIngestBuffer } from './ingest-buffer'

const execFileAsync = promisify(execFile)

export type IngestPumpOptions = {
  buffer: LiveIngestBuffer
  /** No new program bytes for this long = a stall episode (default 3 s). */
  stallMs?: number
  /** Program-file poll interval (default 50 ms). */
  pollMs?: number
  onStall?: (info: { stalledForMs: number; lastChunkAtIso: string | null }) => void
  onResume?: () => void
  log?: (line: string) => void
}

export class IngestFifoPump {
  private stream: WriteStream | null = null
  private streamOpen = false
  private timer: ReturnType<typeof setInterval> | null = null
  private offset = 0
  private lastProgressAtMs = Date.now()
  private stalled = false
  private writing = false
  private stopped = false
  private opened: Promise<void> | null = null
  private resolveOpened: (() => void) | null = null

  constructor(private readonly options: IngestPumpOptions) {}

  get fifoPath(): string {
    return this.options.buffer.fifoPath
  }

  get isStalled(): boolean {
    return this.stalled
  }

  /** Creates the FIFO and starts polling; the write end opens when ffmpeg reads. */
  async start(): Promise<void> {
    if (this.timer) return
    await execFileAsync('mkfifo', [this.fifoPath]).catch(() => {
      // EEXIST: a previous pump for this session already made it.
    })
    this.opened = new Promise<void>((resolve) => {
      this.resolveOpened = resolve
    })
    this.openStream()
    await this.options.buffer.open()
    this.lastProgressAtMs = Date.now()
    const pollMs = this.options.pollMs ?? 50
    this.timer = setInterval(() => {
      void this.tick()
    }, pollMs)
  }

  /** Resolves when the FIFO write end is open (ffmpeg is reading). */
  async waitUntilOpen(): Promise<void> {
    if (this.opened) await this.opened
  }

  private openStream(): void {
    const stream = createWriteStream(this.fifoPath)
    this.stream = stream
    this.streamOpen = false
    stream.once('open', () => {
      if (this.stream !== stream) return
      this.streamOpen = true
      this.resolveOpened?.()
    })
    stream.on('error', () => {
      // Reader gone (relay restart) or FIFO removed: drop the stream;
      // the next tick re-opens for the supervisor's next spawn.
      if (this.stream === stream) {
        this.stream = null
        this.streamOpen = false
      }
    })
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.writing) return
    if (!this.stream || this.stream.destroyed) this.openStream()
    this.writing = true
    try {
      const { bytes, nextOffset } = await this.options.buffer.readProgramFrom(this.offset)
      if (bytes.length > 0 && this.stream && this.streamOpen && !this.stream.destroyed) {
        this.offset = nextOffset
        const flushed = this.stream.write(bytes)
        if (!flushed) {
          await new Promise<void>((resolve) => {
            const done = () => resolve()
            this.stream!.once('drain', done)
            this.stream!.once('error', done)
            setTimeout(done, 1_000)
          })
        }
        this.lastProgressAtMs = Date.now()
        if (this.stalled) {
          this.stalled = false
          this.options.log?.('live ingest resumed: program bytes flowing again')
          this.options.onResume?.()
        }
      } else if (bytes.length === 0) {
        const stallMs = this.options.stallMs ?? LIVE_INGEST_STALL_MS
        const silentFor = Date.now() - this.lastProgressAtMs
        if (!this.stalled && silentFor >= stallMs) {
          this.stalled = true
          const status = await this.options.buffer.status()
          this.options.log?.(
            `live ingest stall: no program chunks for ${silentFor} ms (relay is streaming silence-starved input)`,
          )
          this.options.onStall?.({
            stalledForMs: silentFor,
            lastChunkAtIso: status.lastChunkAtIso,
          })
        }
      }
    } catch {
      // A transient read error mid-poll is retried on the next tick;
      // the pump never throws into the relay's process.
    } finally {
      this.writing = false
    }
  }

  /** Stops polling and closes the FIFO write end (ffmpeg then sees EOF). */
  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const stream = this.stream
    this.stream = null
    this.streamOpen = false
    if (stream && !stream.destroyed) {
      await new Promise<void>((resolve) => {
        stream.once('close', () => resolve())
        stream.end(() => resolve())
        setTimeout(resolve, 500)
      }).catch(() => undefined)
    }
  }
}
