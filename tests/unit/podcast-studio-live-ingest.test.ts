/**
 * POD-21 (POD-16 gap) — live ingest buffer, unit level:
 *
 * - Sequential PCM chunks land in the per-session buffer and the
 *   program file is exactly their concatenation in sequence order.
 * - Out-of-order chunks are buffered, the gap is recorded (status +
 *   manifest), and the program file stays the contiguous prefix
 *   until the missing chunk lands and flushes the successors.
 * - Sequence discipline (POD-11 standard): a byte-identical re-send
 *   is an idempotent ack; a re-send with different bytes is refused
 *   `chunk-conflict`; non-PCM formats (Opus) and malformed chunks
 *   are refused by name.
 * - The POD-19 traversal hardening holds for session ids (`..`
 *   collapses inside the root).
 * - Stall detection over an injected clock, and the session-doc
 *   surfacing (`applyIngestStatus`): stall/resume/gap log entries on
 *   transitions only, and the POD-09 recording subtree is deep-equal
 *   across every ingest event (POD-REQ-35 on the ingest path).
 * - The relay's `ingest` input kind builds the same s16le/48 kHz
 *   ffmpeg command as the pipe input, addressed at the FIFO.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  LiveIngestBuffer,
  LiveIngestError,
} from '../../src/modules/podcast-studio/live/ingest-buffer'
import { applyIngestStatus } from '../../src/modules/podcast-studio/live/live-session'
import { buildFfmpegArgs } from '../../src/modules/podcast-studio/live/relay'
import { createSession } from '../../src/modules/podcast-studio/session-engine'
import {
  getRecordingState,
  startRecordingState,
} from '../../src/modules/podcast-studio/recording/recording-session'

let root: string
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'pod21-ingest-'))
})
afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

/** One 100-frame stereo s16le chunk filled with a constant sample value. */
const chunk = (value: number): Uint8Array => {
  const bytes = new Uint8Array(100 * 2 * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < 100 * 2; i++) view.setInt16(i * 2, value, true)
  return bytes
}

describe('POD-21 live ingest buffer — sequence discipline', () => {
  it('in-order chunks: the program file is their exact concatenation; status tracks the head', async () => {
    const buffer = new LiveIngestBuffer(root, 'sess-in-order')
    const a = await buffer.writeChunk({ seq: 0, bytes: chunk(100) })
    expect(a.duplicate).toBe(false)
    expect(a.status.nextSeq).toBe(1)
    expect(a.status.gaps).toEqual([])
    const b = await buffer.writeChunk({ seq: 1, bytes: chunk(200) })
    expect(b.status.nextSeq).toBe(2)
    expect(b.status.flushedBytes).toBe(800)
    expect(b.status.totalBytesReceived).toBe(800)
    expect(b.status.receivedSeqs).toEqual([0, 1])
    const program = await readFile(buffer.programPath)
    expect(program.equals(Buffer.concat([chunk(100), chunk(200)]))).toBe(true)
    const tail = await buffer.readProgramFrom(400)
    expect(tail.nextOffset).toBe(800)
    expect(tail.bytes.equals(Buffer.from(chunk(200)))).toBe(true)
  })

  it('out-of-order: buffered with the gap recorded; the missing chunk flushes the successors', async () => {
    const buffer = new LiveIngestBuffer(root, 'sess-out-of-order')
    const first = await buffer.writeChunk({ seq: 1, bytes: chunk(200) })
    expect(first.status.nextSeq).toBe(0)
    expect(first.status.gaps).toEqual([{ fromSeq: 0, toSeq: 0 }])
    expect(first.status.flushedBytes).toBe(0)
    expect(first.status.totalBytesReceived).toBe(400)
    const manifest = await readFile(path.join(buffer.dir, 'manifest.jsonl'), 'utf8')
    expect(manifest).toContain('"type":"gap"')
    expect(manifest).toContain('"fromSeq":0')

    const filled = await buffer.writeChunk({ seq: 0, bytes: chunk(100) })
    expect(filled.status.gaps).toEqual([])
    expect(filled.status.nextSeq).toBe(2)
    expect(filled.status.flushedBytes).toBe(800)
    const program = await readFile(buffer.programPath)
    expect(program.equals(Buffer.concat([chunk(100), chunk(200)]))).toBe(true)
  })

  it('idempotent re-send acks; different bytes for a received seq are refused chunk-conflict', async () => {
    const buffer = new LiveIngestBuffer(root, 'sess-dupe')
    await buffer.writeChunk({ seq: 0, bytes: chunk(100) })
    const dupe = await buffer.writeChunk({ seq: 0, bytes: chunk(100) })
    expect(dupe.duplicate).toBe(true)
    expect(dupe.status.totalBytesReceived).toBe(400)
    await expect(buffer.writeChunk({ seq: 0, bytes: chunk(101) })).rejects.toMatchObject({
      code: 'PODCAST_LIVE_INGEST_CHUNK_CONFLICT',
    })
  })

  it('refuses Opus and malformed chunks by name; refuses a negative sequence', async () => {
    const buffer = new LiveIngestBuffer(root, 'sess-refusals')
    await expect(
      buffer.writeChunk({ seq: 0, bytes: chunk(1), format: 'opus' }),
    ).rejects.toMatchObject({ code: 'PODCAST_LIVE_INGEST_FORMAT_UNSUPPORTED' })
    await expect(buffer.writeChunk({ seq: 0, bytes: new Uint8Array(3) })).rejects.toMatchObject({
      code: 'PODCAST_LIVE_INGEST_BAD_CHUNK',
    })
    await expect(buffer.writeChunk({ seq: -1, bytes: chunk(1) })).rejects.toMatchObject({
      code: 'PODCAST_LIVE_INGEST_BAD_SEQ',
    })
    const status = await buffer.status()
    expect(status.receivedSeqs).toEqual([])
    expect(new LiveIngestError('x', 'y')).toBeInstanceOf(Error)
  })

  it('a hostile session id cannot escape the storage root (POD-19 hardening)', async () => {
    const buffer = new LiveIngestBuffer(root, '..')
    expect(buffer.dir.startsWith(root)).toBe(true)
    expect(buffer.dir).not.toBe(path.dirname(root))
    await buffer.writeChunk({ seq: 0, bytes: chunk(7) })
    const program = await readFile(buffer.programPath)
    expect(program.length).toBe(400)
  })

  it('stall detection: fresh chunks are not stalled; silence past the window is', async () => {
    const buffer = new LiveIngestBuffer(root, 'sess-stall')
    expect(await buffer.isStalled(Date.now() + 60_000)).toBe(false) // nothing received yet
    await buffer.writeChunk({ seq: 0, bytes: chunk(5) })
    expect(await buffer.isStalled(Date.now(), 3_000)).toBe(false)
    expect(await buffer.isStalled(Date.now() + 10_000, 3_000)).toBe(true)
  })

  it('a fresh buffer instance re-opens the same on-disk state (route-handler statelessness)', async () => {
    const first = new LiveIngestBuffer(root, 'sess-reopen')
    await first.writeChunk({ seq: 0, bytes: chunk(11) })
    await first.writeChunk({ seq: 2, bytes: chunk(33) })
    const reopened = new LiveIngestBuffer(root, 'sess-reopen')
    const status = await reopened.open()
    expect(status.receivedSeqs).toEqual([0, 2])
    expect(status.gaps).toEqual([{ fromSeq: 1, toSeq: 1 }])
    expect(status.flushedBytes).toBe(400)
    const filled = await reopened.writeChunk({ seq: 1, bytes: chunk(22) })
    expect(filled.status.flushedBytes).toBe(1200)
    const program = await readFile(reopened.programPath)
    expect(program.equals(Buffer.concat([chunk(11), chunk(22), chunk(33)]))).toBe(true)
  })
})

describe('POD-21 relay ingest input + session surfacing', () => {
  it('buildFfmpegArgs for the ingest kind reads the FIFO as s16le stereo 48 kHz', () => {
    const args = buildFfmpegArgs({
      profile: {
        sourceUrl: 'http://127.0.0.1:8000/live',
        bitrateKbps: 64,
        title: 'Show',
        enabled: true,
        nowPlayingEnabled: true,
      },
      credential: null,
      input: { kind: 'ingest', fifoPath: '/tmp/x/program.fifo' },
    })
    expect(args).toContain('/tmp/x/program.fifo')
    expect(args.join(' ')).toContain('-f s16le -ar 48000 -ac 2')
  })

  it('applyIngestStatus logs stall/resume/gap on transitions only and never touches recording state', () => {
    let session = createSession({ showId: 'show-1', showTitle: 'Show' })
    session = startRecordingState(session, { deskMode: 'one-mic' })
    const recordingBefore = JSON.parse(JSON.stringify(getRecordingState(session)))

    const stalled = applyIngestStatus(session, {
      nextSeq: 4,
      gaps: [{ fromSeq: 2, toSeq: 2 }],
      stalled: true,
      lastChunkAtIso: new Date().toISOString(),
    })
    expect(stalled.liveIngest?.stalled).toBe(true)
    expect(stalled.log.some((entry: any) => entry.type === 'live-ingest-stall')).toBe(true)
    expect(stalled.log.some((entry: any) => entry.type === 'live-ingest-gap')).toBe(true)
    expect(getRecordingState(stalled)).toEqual(recordingBefore)

    // Same snapshot again: no duplicate log entries.
    const repeated = applyIngestStatus(stalled, {
      nextSeq: 4,
      gaps: [{ fromSeq: 2, toSeq: 2 }],
      stalled: true,
      lastChunkAtIso: new Date().toISOString(),
    })
    expect(repeated.log).toHaveLength(stalled.log.length)

    const resumed = applyIngestStatus(repeated, {
      nextSeq: 5,
      gaps: [],
      stalled: false,
      lastChunkAtIso: new Date().toISOString(),
    })
    expect(resumed.log.some((entry: any) => entry.type === 'live-ingest-resumed')).toBe(true)
    expect(getRecordingState(resumed)).toEqual(recordingBefore)
  })
})
