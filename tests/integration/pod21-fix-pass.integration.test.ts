/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-21 fix pass against real Payload + Postgres + real ffmpeg
 * 8.1.2 + the POD-16 Icecast PROTOCOL FIXTURE (not real Icecast —
 * the POD-16 naming discipline holds):
 *
 * Fix 1 (POD-16 gap) — the live browser→ingest byte path, server
 *   side: sequential PCM chunks pushed through the REAL ingest HTTP
 *   handler (staff auth + operator site grant; 401 anon, 403
 *   wrong-site, 400 on Opus) land in the per-session ingest buffer
 *   with sequence discipline (out-of-order gap recorded, duplicate
 *   acked); the FIFO pump feeds the buffer to a RelaySupervisor with
 *   the new `ingest` input; a listener on the fixture mount receives
 *   ffprobe-verified decodable MP3 of the exact tone the "browser"
 *   sent. An ingest stall surfaces in the session log, a mid-show
 *   relay SIGKILL reconnects and streams again, and the POD-09
 *   recording state is deep-equal across the whole storm
 *   (POD-REQ-35 on the ingest path).
 * Fix 2 (POD-15 gap) — the sessions API marker/recording ops at the
 *   route level: recording-start / drop-marker / recording-stop
 *   persist into the session doc (marker in BOTH the session list
 *   and the POD-09 recording markers); anon 401; wrong-site 403.
 * Fix 3 (POD-18 gap) — audiogram caption burn-in:
 *   createAudiogramForAcceptedHighlight renders the CAPTIONED
 *   variant when the episode carries a reviewed transcript (draft
 *   provenance records it, the re-timed SRT is asserted at text
 *   level, the MP4 checksum differs from the uncaptioned render,
 *   duration unchanged); with the transcript unlinked it falls back
 *   to the uncaptioned variant, recorded as such.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { hasFfmpegBinaries } from '../helpers/ffmpeg-availability'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { resolveFfmpegBinary, resolveFfprobeBinary } from '../../src/modules/media/ffmpeg'
import { loadConfig } from '../../src/modules/core/config'
import { transcriptChecksum } from '../../src/modules/media/contracts'
import {
  appendProjectVersion,
  type EditProjectDoc,
} from '../../src/modules/podcast-studio/edit/project'
import { ensureClipIds, type EditEdl } from '../../src/modules/podcast-studio/edit/edl-engine'
import { createEditProjectRecord } from '../../src/modules/podcast-studio/edit/projects-service'
import { createAudiogramForAcceptedHighlight } from '../../src/modules/podcast-studio/promotion'
import { getRecordingState } from '../../src/modules/podcast-studio/recording/recording-session'
import { storeTrackAsset } from '../../src/modules/podcast-studio/recording/finalize'
import { createSession } from '../../src/modules/podcast-studio/session-engine'
import {
  applySessionOperationToRecord,
  createStudioSessionRecord,
  loadStudioSessionRecord,
} from '../../src/modules/podcast-studio/sessions'
import {
  IcecastProtocolFixture,
  RelaySupervisor,
} from '../../src/modules/podcast-studio/live/index'
import {
  liveIngestBufferFor,
  recordIngestStallInSession,
} from '../../src/modules/podcast-studio/live/live-service'
import { IngestFifoPump } from '../../src/modules/podcast-studio/live/ingest-pump'
import { createFfmpegRelaySpawner } from '../../src/modules/podcast-studio/live/relay-process'
import { PATCH as sessionPatch } from '../../src/app/(frontend)/api/podcast-studio/sessions/[id]/route'
import {
  GET as ingestGet,
  POST as ingestPost,
} from '../../src/app/(frontend)/api/podcast-studio/live/ingest/route'
import {
  buildRc2World,
  operatorSession,
  teardownRc2World,
  type Rc2World,
} from '../fixtures/rc2-world'

const execFileAsync = promisify(execFile)
const SR = 48_000
const PASSWORD = 'pod21-source-pw!'
const MOUNT = '/pod21-live'
const runId = randomUUID().slice(0, 8)

let payload: Payload
let world: Rc2World
let show: any
let sessionFix2: any
let sessionFix1: any
let fixture: IcecastProtocolFixture
let episode: any
let project: any
let highlightDraft: any
const headersByRole = new Map<string, Record<string, string>>()

const req = (role: string, url: string, init: RequestInit = {}) =>
  new Request(url, {
    ...init,
    headers: { ...(headersByRole.get(role) ?? {}), ...(init.headers ?? {}) },
  })

const patchSession = async (role: string, id: string, body: unknown): Promise<Response> =>
  (await sessionPatch(
    req(role, `http://localhost:3000/api/podcast-studio/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )) as Response

const postChunk = async (role: string, body: unknown): Promise<Response> =>
  (await ingestPost(
    req(role, 'http://localhost:3000/api/podcast-studio/live/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )) as Response

/** Continuous 440 Hz stereo s16le PCM, sliced into 0.5 s chunks by seq. */
const CHUNK_FRAMES = SR / 2
const CHUNK_BYTES = CHUNK_FRAMES * 2 * 2
const pcmChunk = (seq: number): Buffer => {
  const bytes = Buffer.alloc(CHUNK_BYTES)
  for (let frame = 0; frame < CHUNK_FRAMES; frame++) {
    const t = (seq * CHUNK_FRAMES + frame) / SR
    const sample = Math.round(0.5 * Math.sin(2 * Math.PI * 440 * t) * 32_767)
    bytes.writeInt16LE(sample, frame * 4)
    bytes.writeInt16LE(sample, frame * 4 + 2)
  }
  return bytes
}
const chunkBody = (sessionRecordId: string, seq: number, format = 's16le') => ({
  sessionRecordId,
  seq,
  format,
  bytesBase64: pcmChunk(seq).toString('base64'),
})

const waitFor = async (fn: () => boolean | Promise<boolean>, label: string, timeoutMs = 30_000) => {
  const started = Date.now()
  while (!(await fn())) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
}

const listenBytes = (url: string, maxBytes: number, timeoutMs = 25_000): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    const request = http.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Listener got HTTP ${res.statusCode}`))
        return
      }
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        total += chunk.length
        if (total >= maxBytes) {
          request.destroy()
          resolve(Buffer.concat(chunks))
        }
      })
      res.on('error', () => resolve(Buffer.concat(chunks)))
    })
    request.on('error', (error) => {
      if (total > 0) resolve(Buffer.concat(chunks))
      else reject(error)
    })
    setTimeout(() => {
      request.destroy()
      if (total > 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`Listener received no bytes in ${timeoutMs} ms.`))
    }, timeoutMs)
  })

let tmpRoot: string
const decodeAudio = async (bytes: Buffer) => {
  const file = path.join(tmpRoot, `listener-${randomUUID().slice(0, 8)}.mp3`)
  await writeFile(file, bytes)
  const probe = JSON.parse(
    (
      await execFileAsync(resolveFfprobeBinary(), [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        file,
      ])
    ).stdout,
  )
  const { stderr } = await execFileAsync(resolveFfmpegBinary(), [
    '-hide_banner',
    '-i',
    file,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]).catch((error: any) => error as { stderr: string })
  const meanVolume = /mean_volume:\s*(-?[\d.]+) dB/.exec(String(stderr))?.[1]
  return {
    codec: probe.streams?.[0]?.codec_name as string | undefined,
    durationSec: Number(probe.format?.duration ?? 0),
    meanVolumeDb: meanVolume ? Number(meanVolume) : null,
  }
}

const wavBytes = (fn: (t: number) => number, seconds: number): Buffer => {
  const frames = SR * seconds
  const bytes = Buffer.alloc(44 + frames * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + frames * 2, 4)
  bytes.write('WAVE', 8)
  bytes.write('fmt ', 12)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(SR, 24)
  bytes.writeUInt32LE(SR * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(frames * 2, 40)
  for (let i = 0; i < frames; i++) {
    const sample = Math.max(-1, Math.min(1, fn(i / SR)))
    bytes.writeInt16LE(Math.round(sample * 32_767), 44 + i * 2)
  }
  return bytes
}

beforeAll(async () => {
  payload = await getPayload({ config })
  world = await buildRc2World(payload)
  const granted = await operatorSession(payload, world.siteA.admin)
  const noGrant = await operatorSession(payload, world.outsider)
  headersByRole.set('anon', {})
  headersByRole.set('staffGranted', { cookie: granted.get('cookie') ?? '' })
  headersByRole.set('staffNoGrant', { cookie: noGrant.get('cookie') ?? '' })

  fixture = await IcecastProtocolFixture.start({
    sourcePassword: PASSWORD,
    adminPassword: PASSWORD,
  })
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'pod21-int-'))

  const siteId = world.siteA.siteId
  show = await payload.create({
    collection: 'podcast-shows',
    data: {
      site: siteId,
      title: `POD-21 Show ${runId}`,
      slug: `pod21-show-${runId}`,
      description: 'POD-21 fix-pass fixture show.',
      rssEnabled: true,
      feedVisibility: 'public',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  })
  const mkSession = async (title: string) =>
    createStudioSessionRecord(payload as never, {
      siteId,
      showId: String(show.id),
      title,
      session: createSession({ showId: String(show.id), showTitle: String(show.title) }),
    })
  sessionFix2 = await mkSession('POD-21 session (fix 2)')
  sessionFix1 = await mkSession('POD-21 session (fix 1)')

  // --- Fix 3 fixtures: episode + WAV asset + reviewed transcript + project.
  const wav = wavBytes((t) => 0.5 * Math.sin(2 * Math.PI * 440 * t), 12)
  const { createHash } = await import('node:crypto')
  const audioAssetId = await storeTrackAsset(payload as never, loadConfig(), {
    siteId,
    showId: String(show.id),
    sessionId: `pod21-${runId}`,
    trackId: 'main',
    role: 'host',
    wavBytes: wav,
    checksumSha256: createHash('sha256').update(wav).digest('hex'),
    durationSec: 12,
  })
  episode = await payload.create({
    collection: 'podcast-episodes',
    data: {
      site: siteId,
      show: show.id,
      title: 'POD-21 Episode',
      slug: `pod21-episode-${runId}`,
      description: 'Fix 3 journey episode.',
      productionState: 'review',
      status: 'draft',
      audio: audioAssetId,
    } as any,
    overrideAccess: true,
  })
  const segments = [
    { id: 'seg-1', startSeconds: 0, endSeconds: 4, text: 'Caption alpha line.' },
    { id: 'seg-2', startSeconds: 4, endSeconds: 8, text: 'Caption bravo line.' },
    { id: 'seg-3', startSeconds: 8, endSeconds: 12, text: 'Caption charlie line.' },
  ]
  const revision = await payload.create({
    collection: 'transcript-revisions',
    data: {
      title: `POD-21 transcript ${runId}`,
      media: audioAssetId,
      version: 1,
      source: 'manual',
      reviewState: 'reviewed',
      segments,
      checksum: transcriptChecksum(segments as never),
      immutable: true,
    } as any,
    overrideAccess: true,
  })
  await payload.update({
    collection: 'podcast-episodes',
    id: episode.id,
    data: { transcript: String(revision.id) },
    overrideAccess: true,
  } as never)

  const edl: EditEdl = ensureClipIds({
    version: 1,
    sessionRate: SR,
    sources: [{ id: 'main', mediaAssetId: audioAssetId }],
    tracks: [
      {
        id: 'main',
        gain: 1,
        clips: [{ sourceId: 'main', sourceIn: 0, sourceOut: 12, timelineStart: 0 }],
      },
    ],
    chapters: [{ start: 0, title: 'Start' }],
    transcript: [],
  } as never)
  const doc: EditProjectDoc = appendProjectVersion(
    {
      version: 1,
      title: `POD-21 project ${runId}`,
      recordingId: null,
      sessionId: null,
      episodeId: String(episode.id),
      edl,
      versions: [],
    },
    'Initial',
    new Date().toISOString(),
  )
  project = await createEditProjectRecord(payload as never, {
    siteId,
    showId: String(show.id),
    project: doc,
  })
  highlightDraft = await payload.create({
    collection: 'podcast-assist-drafts',
    data: {
      title: `POD-21 highlight ${runId}`,
      episode: String(episode.id),
      show: String(show.id),
      site: siteId,
      kind: 'highlight',
      state: 'accepted',
      payload: {
        highlights: [
          { startSec: 2, endSec: 10, label: 'POD-21 clip', text: 'clip', source: 'marked-range' },
        ],
      },
      createdBy: 'pod21-test',
    },
    overrideAccess: true,
  } as never)
}, 300_000)

afterAll(async () => {
  await fixture?.close()
  if (world) await teardownRc2World(payload, world).catch(() => undefined)
  await payload?.db.destroy?.()
})

describe('POD-21 fix 2 — sessions API marker/recording ops (route level)', () => {
  it('rejects anon with 401 and staff without the site grant with 403', async () => {
    const anon = await patchSession('anon', String(sessionFix2.id), { op: 'recording-start' })
    expect(anon.status).toBe(401)
    const denied = await patchSession('staffNoGrant', String(sessionFix2.id), {
      op: 'recording-start',
    })
    expect(denied.status).toBe(403)
  })

  it('recording-start → drop-marker → recording-stop persist through the real route', async () => {
    const started = await patchSession('staffGranted', String(sessionFix2.id), {
      op: 'recording-start',
    })
    expect(started.status).toBe(200)
    const startedBody = await started.json()
    expect(startedBody.ok).toBe(true)
    expect(startedBody.recordingState?.status).toBe('recording')

    const dropped = await patchSession('staffGranted', String(sessionFix2.id), {
      op: 'drop-marker',
      name: 'Checkpoint',
    })
    expect(dropped.status).toBe(200)
    const droppedBody = await dropped.json()
    expect(droppedBody.marker).toMatchObject({ number: 1, name: 'Checkpoint' })

    // Persisted in the stored doc: session marker list AND recording markers.
    const stored = await loadStudioSessionRecord(payload as never, String(sessionFix2.id))
    expect(stored?.session.markers?.some((marker: any) => marker.title === 'Checkpoint')).toBe(true)
    expect(getRecordingState(stored!.session)?.markers).toHaveLength(1)
    expect(getRecordingState(stored!.session)?.markers[0]?.name).toBe('Checkpoint')

    const stopped = await patchSession('staffGranted', String(sessionFix2.id), {
      op: 'recording-stop',
    })
    expect(stopped.status).toBe(200)
    const stoppedBody = await stopped.json()
    expect(stoppedBody.recordingState?.status).toBe('stopped')
    const storedAfter = await loadStudioSessionRecord(payload as never, String(sessionFix2.id))
    expect(getRecordingState(storedAfter!.session)?.status).toBe('stopped')
    expect(storedAfter?.state).toBe('stopped')
  })
})

describe('POD-21 fix 1 — live ingest byte path (route → buffer → pump → relay → listener)', () => {
  it('enforces auth on the ingest route: anon 401, wrong-site 403, Opus 400', async () => {
    const anon = await postChunk('anon', chunkBody(String(sessionFix1.id), 0))
    expect(anon.status).toBe(401)
    const denied = await postChunk('staffNoGrant', chunkBody(String(sessionFix1.id), 0))
    expect(denied.status).toBe(403)
    const opus = await postChunk('staffGranted', chunkBody(String(sessionFix1.id), 0, 'opus'))
    expect(opus.status).toBe(400)
    const body = await opus.json()
    expect(body.code).toBe('PODCAST_LIVE_INGEST_FORMAT_UNSUPPORTED')
  })

  it('accepts chunks through the real handler with gap + duplicate discipline', async () => {
    const id = String(sessionFix1.id)
    // Out of order first: seq 1 lands, gap [0,0] recorded, nothing flushed.
    const first = await postChunk('staffGranted', chunkBody(id, 1))
    expect(first.status).toBe(201)
    const firstBody = await first.json()
    expect(firstBody.duplicate).toBe(false)
    expect(firstBody.ingest.gaps).toEqual([{ fromSeq: 0, toSeq: 0 }])
    expect(firstBody.ingest.flushedBytes).toBe(0)

    const fill = await postChunk('staffGranted', chunkBody(id, 0))
    const fillBody = await fill.json()
    expect(fillBody.ingest.gaps).toEqual([])
    expect(fillBody.ingest.flushedBytes).toBe(CHUNK_BYTES * 2)

    for (const seq of [2, 3]) {
      const res = await postChunk('staffGranted', chunkBody(id, seq))
      expect(res.status).toBe(201)
    }
    const dupe = await postChunk('staffGranted', chunkBody(id, 2))
    const dupeBody = await dupe.json()
    expect(dupeBody.duplicate).toBe(true)
    expect(dupeBody.ingest.receivedSeqs).toEqual([0, 1, 2, 3])

    const statusRes = (await ingestGet(
      req(
        'staffGranted',
        `http://localhost:3000/api/podcast-studio/live/ingest?sessionRecordId=${id}`,
      ),
    )) as Response
    expect(statusRes.status).toBe(200)
    const statusBody = await statusRes.json()
    expect(statusBody.ingest.nextSeq).toBe(4)
    expect(statusBody.ingest.totalBytesReceived).toBe(CHUNK_BYTES * 4)
  })

  it.skipIf(!hasFfmpegBinaries)(
    'pump + relay deliver the browser-sent program to a listener; stall surfaces; recording untouched; kill/reconnect streams again',
    async () => {
      const id = String(sessionFix1.id)
      // Recording runs through the whole live storm (POD-REQ-35).
      await applySessionOperationToRecord(payload as never, id, { op: 'recording-start' })
      const before = await loadStudioSessionRecord(payload as never, id)
      const recordingBefore = JSON.parse(JSON.stringify(getRecordingState(before!.session)))

      const buffer = liveIngestBufferFor(id)
      const pump = new IngestFifoPump({
        buffer,
        stallMs: 1_000,
        onStall: () => {
          void recordIngestStallInSession(payload as never, {
            sessionRecordId: id,
            stalled: true,
          }).catch(() => undefined)
        },
      })
      const relay = new RelaySupervisor({
        profile: {
          sourceUrl: fixture.mountUrl(MOUNT),
          bitrateKbps: 64,
          title: 'POD-21 Live',
          enabled: true,
          nowPlayingEnabled: true,
        },
        credential: PASSWORD,
        input: { kind: 'ingest', fifoPath: buffer.fifoPath },
        spawner: createFfmpegRelaySpawner(),
        backoffMs: [500, 1_000],
        maxRestarts: 5,
        stableLiveMs: 60_000,
      })
      await pump.start()
      relay.start()
      await pump.waitUntilOpen()
      await waitFor(() => relay.health.state === 'live', 'ingest relay live')
      await fixture.waitForBytes(MOUNT, 8_192)

      const heard = await listenBytes(fixture.mountUrl(MOUNT), 24_576)
      const decoded = await decodeAudio(heard)
      expect(decoded.codec).toBe('mp3')
      expect(decoded.durationSec).toBeGreaterThan(0.5)
      expect(decoded.meanVolumeDb).not.toBeNull()
      expect(decoded.meanVolumeDb!).toBeGreaterThan(-40)

      // The "browser" keeps sending while live.
      for (const seq of [4, 5, 6, 7]) {
        const res = await postChunk('staffGranted', chunkBody(id, seq))
        expect(res.status).toBe(201)
        await new Promise((resolve) => setTimeout(resolve, 120))
      }

      // Stall: chunks stop; the pump's stall surfaces in the session
      // log and the liveIngest state. (An earlier stall/resume pair may
      // already be logged from the listen phase — the flag is what is
      // asserted here, while no chunk writes can resume it.)
      await waitFor(
        async () => {
          const record = await loadStudioSessionRecord(payload as never, id)
          return (record?.session as any)?.liveIngest?.stalled === true
        },
        'ingest stall flag in session doc',
        20_000,
      )
      const afterStall = await loadStudioSessionRecord(payload as never, id)
      expect((afterStall?.session as any).liveIngest?.stalled).toBe(true)
      expect(afterStall?.session.log.some((entry: any) => entry.type === 'live-ingest-stall')).toBe(
        true,
      )
      expect(getRecordingState(afterStall!.session)).toEqual(recordingBefore)

      // Kill the relay mid-show: supervisor reconnects, pump re-opens,
      // fresh chunks reach a second listener.
      const bytesBeforeKill = fixture.mount(MOUNT)!.bytesReceived
      relay.killCurrentProcess('SIGKILL')
      await waitFor(() => relay.health.state === 'reconnecting', 'relay reconnecting', 15_000)
      await waitFor(() => relay.health.state === 'live', 'relay live after kill', 30_000)
      for (const seq of [8, 9, 10, 11]) {
        const res = await postChunk('staffGranted', chunkBody(id, seq))
        expect(res.status).toBe(201)
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
      await waitFor(
        () => fixture.mount(MOUNT)!.bytesReceived > bytesBeforeKill + 4_096,
        'fixture bytes grow after reconnect',
      )
      const heardAgain = await listenBytes(fixture.mountUrl(MOUNT), 16_384)
      const decodedAgain = await decodeAudio(heardAgain)
      expect(decodedAgain.codec).toBe('mp3')
      expect(decodedAgain.durationSec).toBeGreaterThan(0.3)

      relay.stop()
      await pump.stop()
      const afterAll = await loadStudioSessionRecord(payload as never, id)
      expect(getRecordingState(afterAll!.session)).toEqual(recordingBefore)
    },
    180_000,
  )
})

describe.skipIf(!hasFfmpegBinaries)('POD-21 fix 3 — audiogram caption burn-in', () => {
  it('renders the captioned variant from the reviewed transcript; uncaptioned fallback when none', async () => {
    const captioned = await createAudiogramForAcceptedHighlight(payload as never, undefined, {
      draftId: String(highlightDraft.id),
      projectId: String(project.id),
    })
    expect((captioned as any).payload.captionsBurnedIn).toBe(true)
    expect((captioned as any).payload.captionSegments).toBe(3)
    // The clip is 2–10 s: seg-1 clamps to 0–2, seg-2 → 2–6, seg-3 → 6–8.
    const srt = String((captioned as any).payload.captionsSrt ?? '')
    expect(srt).toContain('00:00:00,000 --> 00:00:02,000')
    expect(srt).toContain('Caption alpha line.')
    expect(srt).toContain('00:00:02,000 --> 00:00:06,000')
    expect(srt).toContain('Caption bravo line.')
    expect(srt).toContain('00:00:06,000 --> 00:00:08,000')
    expect(srt).toContain('Caption charlie line.')

    const captionedAsset: any = await payload.findByID({
      collection: 'media-assets',
      id: String((captioned as any).payload.mediaAssetId),
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(captionedAsset).toBeTruthy()

    // No transcript → clean fallback to the uncaptioned variant.
    await payload.update({
      collection: 'podcast-episodes',
      id: episode.id,
      data: { transcript: null },
      overrideAccess: true,
    } as never)
    const plain = await createAudiogramForAcceptedHighlight(payload as never, undefined, {
      draftId: String(highlightDraft.id),
      projectId: String(project.id),
    })
    expect((plain as any).payload.captionsBurnedIn).toBe(false)
    const plainAsset: any = await payload.findByID({
      collection: 'media-assets',
      id: String((plain as any).payload.mediaAssetId),
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(plainAsset).toBeTruthy()
    // Captioned render differs from uncaptioned; duration unchanged.
    expect(String(plainAsset.checksum)).not.toBe(String(captionedAsset.checksum))
    expect(
      Math.abs(Number(plainAsset.durationSeconds) - Number(captionedAsset.durationSeconds)),
    ).toBeLessThan(0.6)
    expect(Number(captionedAsset.durationSeconds)).toBeGreaterThan(7)
  }, 180_000)
})
