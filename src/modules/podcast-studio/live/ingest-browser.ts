/**
 * POD-21 — Live ingest browser adapter (THIN; real-browser behaviour
 * UNVERIFIED, like every POD-06/07/09 browser adapter).
 *
 * Taps the POD-07 mixer graph's program destination stream through
 * the POD-06 PCM capture worklet (250 ms chunks on the shared sample
 * clock — the same tap the POD-09 recording adapter uses), converts
 * each chunk to the ingest buffer's wire format (s16le stereo PCM;
 * a mono capture is duplicated to stereo so the relay's format is
 * never silently wrong), and uploads the chunks SEQUENTIALLY with
 * sequence numbers to the POD-21 ingest endpoint.
 *
 * Upload discipline mirrors the server's sequence rules: one POST in
 * flight at a time; a failed POST retries the SAME sequence number
 * (the server acks a byte-identical re-send idempotently, so a retry
 * after a lost response is safe); after the retry budget the chunk
 * is dropped and the failure is reported through `onError` — the
 * server records the resulting gap, and the desk sees it in the
 * session's ingest status rather than losing the show silently.
 */

import { floatToInt16Bytes } from '../capture/journal'
import { connectCaptureNode, type CaptureNodeHandle } from '../capture/worklet/loader'
import type { MixerGraphHandle } from '../mixer/engine-browser'

export type LiveIngestUploadState = {
  /** Next sequence number to send. */
  nextSeq: number
  /** Highest sequence the server has acked. */
  ackedSeq: number
  /** Chunks currently queued behind the in-flight POST. */
  queued: number
  lastError: string | null
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const slice = 32_768
  for (let offset = 0; offset < bytes.length; offset += slice) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + slice))
  }
  return btoa(binary)
}

/** Interleaved Float32 chunk → s16le bytes in the buffer's stereo format. */
export const programChunkToIngestBytes = (pcm: Float32Array, channels: number): Uint8Array => {
  if (channels === 2) return floatToInt16Bytes(pcm)
  // Mono (or unexpected) capture: duplicate the single channel to
  // stereo rather than sending bytes the relay would misread.
  const frames = Math.floor(pcm.length / Math.max(1, channels))
  const stereo = new Float32Array(frames * 2)
  for (let frame = 0; frame < frames; frame++) {
    const sample = pcm[frame * Math.max(1, channels)] ?? 0
    stereo[frame * 2] = sample
    stereo[frame * 2 + 1] = sample
  }
  return floatToInt16Bytes(stereo)
}

export class LiveIngestUploader {
  private handle: CaptureNodeHandle | null = null
  private queue: Array<{ seq: number; bytes: Uint8Array }> = []
  private sending = false
  private stopped = false
  private nextSeq = 0
  private ackedSeq = -1
  private lastError: string | null = null

  constructor(
    private readonly options: {
      sessionRecordId: string
      endpoint?: string
      fetchImpl?: typeof fetch
      maxRetries?: number
      onError?: (message: string) => void
    },
  ) {}

  get state(): LiveIngestUploadState {
    return {
      nextSeq: this.nextSeq,
      ackedSeq: this.ackedSeq,
      queued: this.queue.length,
      lastError: this.lastError,
    }
  }

  /**
   * Starts uploading the graph's program bus. One uploader per
   * session; calling attach twice is refused rather than double-tapping.
   */
  async attach(context: AudioContext, graph: MixerGraphHandle): Promise<void> {
    if (this.handle) throw new Error('Live ingest uploader is already attached.')
    this.stopped = false
    this.handle = await connectCaptureNode(context, graph.programDestination.stream, (message) => {
      if (this.stopped) return
      const bytes = programChunkToIngestBytes(message.pcm, message.channels)
      this.queue.push({ seq: this.nextSeq++, bytes })
      void this.drain()
    })
  }

  detach(): void {
    this.stopped = true
    this.handle?.disconnect()
    this.handle = null
    this.queue = []
  }

  private async drain(): Promise<void> {
    if (this.sending) return
    this.sending = true
    try {
      while (!this.stopped && this.queue.length > 0) {
        const chunk = this.queue[0]!
        const delivered = await this.sendWithRetries(chunk)
        if (!delivered) {
          // The chunk is dropped; the server records the gap and the
          // desk surfaces it. Later chunks still flow.
          this.queue.shift()
          continue
        }
        this.ackedSeq = chunk.seq
        this.queue.shift()
      }
    } finally {
      this.sending = false
    }
  }

  private async sendWithRetries(chunk: { seq: number; bytes: Uint8Array }): Promise<boolean> {
    const fetchImpl = this.options.fetchImpl ?? fetch
    const endpoint = this.options.endpoint ?? '/api/podcast-studio/live/ingest'
    const maxRetries = this.options.maxRetries ?? 3
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionRecordId: this.options.sessionRecordId,
            seq: chunk.seq,
            format: 's16le',
            bytesBase64: bytesToBase64(chunk.bytes),
          }),
        })
        if (response.ok) return true
        this.lastError = `Live ingest chunk ${chunk.seq} refused: HTTP ${response.status}`
      } catch (error) {
        this.lastError = `Live ingest chunk ${chunk.seq} failed: ${error instanceof Error ? error.message : String(error)}`
      }
      if (attempt < maxRetries)
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
    this.options.onError?.(this.lastError ?? `Live ingest chunk ${chunk.seq} was not delivered.`)
    return false
  }
}
