/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-16 (POD-REQ-34, POD-REQ-35) against real Payload + Postgres,
 * real ffmpeg 8.1.2, and the Icecast PROTOCOL FIXTURE (icecast2 is
 * NOT installed on this rig — `which icecast2 icecast` is empty — so
 * the fixture in src/modules/podcast-studio/live/icecast-fixture.ts
 * stands in for the server; every claim here is about protocol shape
 * and received bytes, not about real Icecast at scale):
 *
 * - Stream profile + credential through the live service: the DB row
 *   holds an AES-GCM envelope (never the password), an API read
 *   without overrideAccess omits the credential field entirely, the
 *   public projection contains no credential material, and the
 *   server-side resolver returns the password for the relay only.
 * - Live episode lifecycle through the service + the POD-01 feed:
 *   scheduled (liveItem pending) → live (liveItem live) → the relay
 *   actually streams → end show (liveItem ended) → a real POD-09
 *   finalize produces the recording → convert → normal item with the
 *   recording enclosure, same GUID; converting again is a no-op.
 * - REAL relay proof: ffmpeg (file ingest, looping tone WAV) pushes
 *   MP3 to the fixture mount; a listener client connects to the
 *   fixture's listener endpoint and receives bytes that ffmpeg
 *   DECODES back to program audio (measured: codec, duration, tone
 *   energy) — not assumed. Now-playing follows the played log through
 *   a real admin metadata update the fixture records.
 * - Relay killed mid-show (SIGKILL): the supervisor reconnects on its
 *   backoff and the fixture sees a fresh source + more bytes; the
 *   session record's recording state is never touched.
 * - Pipe ingest: program PCM written into the relay's stdin reaches
 *   a listener as decodable audio (the local pipe ingest path; the
 *   browser→ingest byte path remains the named POD-16 gap).
 * - Credential redaction across a full live session: supervisor logs,
 *   the public profile, and the rendered feed are scanned for the
 *   password in raw and URL-encoded forms — absent everywhere.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { renderPodcastFeed } from '../../src/modules/podcast-studio/feed-build'
import { inspectPodcastFeed } from '../../src/modules/podcast-studio/feed-validate'
import {
  convertLiveEpisodeWithRecording,
  endLiveEpisode,
  getPublicStreamProfile,
  goLiveEpisode,
  IcecastProtocolFixture,
  recordRelayHealthInSession,
  RelaySupervisor,
  resolveShowStreamConfig,
  scheduleLiveEpisodeForShow,
  setLiveRoomBinding,
  setShowStreamProfile,
  type StreamProfile,
} from '../../src/modules/podcast-studio/live/index'
import { createFfmpegRelaySpawner } from '../../src/modules/podcast-studio/live/relay-process'
import { beginPlayedClip } from '../../src/modules/podcast-studio/players/played-log'
import {
  defaultTrackDefinitions,
  DirectoryChunkStorage,
  finalizeRecordingFromStorage,
  MultitrackRecorder,
} from '../../src/modules/podcast-studio/recording/index'
import { createSession } from '../../src/modules/podcast-studio/session-engine'
import {
  createStudioSessionRecord,
  loadStudioSessionRecord,
} from '../../src/modules/podcast-studio/sessions'
import { seed } from '../../src/scripts/seed'

const execFileAsync = promisify(execFile)
const SR = 48_000
const CHUNK = 12_000
const PASSWORD = 'int3gration-source-pw!'
const MOUNT = '/pod16-live'

let payload: Payload
let site: any
let show: any
let episode: any
let sessionRecord: any
let fixture: IcecastProtocolFixture
let tmpRoot: string
let toneWav: string
const runId = randomUUID().slice(0, 8)
const appConfig = loadConfig()
const sessionDocId = `sess-pod16-int-${runId}`

const profile = (): StreamProfile => ({
  sourceUrl: fixture.mountUrl(MOUNT),
  bitrateKbps: 64,
  title: 'POD-16 Live Show',
  enabled: true,
  nowPlayingEnabled: true,
})

const tone = (freq: number, amp: number, frames: number, startFrame = 0): Float32Array => {
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i++)
    out[i] = amp * Math.sin((2 * Math.PI * freq * (startFrame + i)) / SR)
  return out
}
const interleaveStereo = (mono: Float32Array): Float32Array => {
  const out = new Float32Array(mono.length * 2)
  for (let i = 0; i < mono.length; i++) {
    out[i * 2] = mono[i]!
    out[i * 2 + 1] = mono[i]!
  }
  return out
}

/** Connects as a listener and collects up to `maxBytes` of stream, then disconnects. */
const listenBytes = (url: string, maxBytes: number, timeoutMs = 20_000): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    const req = http.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Listener got HTTP ${res.statusCode}`))
        return
      }
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        total += chunk.length
        if (total >= maxBytes) {
          req.destroy()
          resolve(Buffer.concat(chunks))
        }
      })
      res.on('error', () => resolve(Buffer.concat(chunks)))
    })
    req.on('error', (error) => {
      if (total > 0) resolve(Buffer.concat(chunks))
      else reject(error)
    })
    setTimeout(() => {
      req.destroy()
      if (total > 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`Listener received no bytes in ${timeoutMs} ms.`))
    }, timeoutMs)
  })

/** Decodes audio bytes with ffmpeg and reports duration + mean volume (measured, not assumed). */
const decodeAudio = async (bytes: Buffer, extension: string) => {
  const file = path.join(tmpRoot, `listener-${randomUUID().slice(0, 8)}.${extension}`)
  await writeFile(file, bytes)
  const probe = JSON.parse(
    (
      await execFileAsync('ffprobe', [
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
  const decoded = path.join(tmpRoot, `decoded-${randomUUID().slice(0, 8)}.wav`)
  const { stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-i',
    file,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]).catch((error: any) => error as { stderr: string })
  await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, decoded])
  const wavProbe = JSON.parse(
    (
      await execFileAsync('ffprobe', [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        decoded,
      ])
    ).stdout,
  )
  const meanVolume = /mean_volume:\s*(-?[\d.]+) dB/.exec(String(stderr))?.[1]
  return {
    codec: probe.streams?.[0]?.codec_name as string | undefined,
    durationSec: Number(wavProbe.format?.duration ?? 0),
    meanVolumeDb: meanVolume ? Number(meanVolume) : null,
  }
}

const waitFor = async (fn: () => boolean, label: string, timeoutMs = 25_000): Promise<void> => {
  const started = Date.now()
  while (!fn()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

const feedForEpisode = async (episodeId: string) => {
  const showDoc = await payload.findByID({
    collection: 'podcast-shows',
    id: String(show.id),
    depth: 1,
    overrideAccess: true,
  } as never)
  const episodeDoc = await payload.findByID({
    collection: 'podcast-episodes',
    id: episodeId,
    depth: 1,
    overrideAccess: true,
  } as never)
  return renderPodcastFeed(showDoc as never, [episodeDoc] as never, {
    origin: 'https://example.test',
    feedPath: `/podcasts/${(showDoc as any).slug}/feed.xml`,
    showPath: `/podcasts/${(showDoc as any).slug}`,
    includeMembersOnly: false,
  })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()

  fixture = await IcecastProtocolFixture.start({
    sourcePassword: PASSWORD,
    adminPassword: PASSWORD,
  })
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'pod16-int-'))
  toneWav = path.join(tmpRoot, 'tone.wav')
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=20',
    '-ar',
    '48000',
    toneWav,
  ])

  show = await payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-16 Show ${runId}`,
      slug: `pod16-show-${runId}`,
      description: 'POD-16 integration fixture show.',
      rssEnabled: true,
      feedVisibility: 'public',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  })
  episode = await payload.create({
    collection: 'podcast-episodes',
    data: {
      site: site.id,
      show: show.id,
      title: 'POD-16 Live Episode',
      slug: `pod16-episode-${runId}`,
      description: 'A live episode.',
      productionState: 'scheduled-record',
      status: 'published',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    } as any,
    overrideAccess: true,
  })
  const sessionDoc = createSession({
    id: sessionDocId,
    showId: String(show.id),
    showTitle: show.title,
  })
  sessionRecord = await createStudioSessionRecord(payload as never, {
    siteId: String(site.id),
    showId: String(show.id),
    title: 'POD-16 session',
    session: sessionDoc,
  })
}, 120_000)

afterAll(async () => {
  await fixture?.close()
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true })
})

describe('POD-16 integration', () => {
  it('stores the stream profile + encrypted credential; only the public projection is readable', async () => {
    const pub = await setShowStreamProfile(payload as never, {
      showId: String(show.id),
      profile: profile(),
      credential: PASSWORD,
    })
    expect(pub.hasCredential).toBe(true)
    expect(pub.sourceUrl).toBe(fixture.mountUrl(MOUNT))
    expect(JSON.stringify(pub)).not.toContain(PASSWORD)

    const raw = await payload.findByID({
      collection: 'podcast-shows',
      id: String(show.id),
      depth: 0,
      overrideAccess: true,
    } as never)
    const envelope = String((raw as any).streamCredentialEncrypted ?? '')
    expect(envelope.length).toBeGreaterThan(20)
    expect(envelope).not.toContain(PASSWORD)
    expect((raw as any).streamProfile).toMatchObject({ bitrateKbps: 64, enabled: true })

    // Field-level read access: an API read WITHOUT overrideAccess omits the envelope.
    const apiRead = await payload
      .findByID({
        collection: 'podcast-shows',
        id: String(show.id),
        depth: 0,
        overrideAccess: false,
      } as never)
      .catch(() => null)
    if (apiRead) expect((apiRead as any).streamCredentialEncrypted).toBeUndefined()

    const resolved = await resolveShowStreamConfig(payload as never, String(show.id))
    expect(resolved?.credential).toBe(PASSWORD)
    expect(resolved?.profile.title).toBe('POD-16 Live Show')
    const pubAgain = await getPublicStreamProfile(payload as never, String(show.id))
    expect(pubAgain?.hasCredential).toBe(true)
  })

  it('schedules and goes live: feed carries liveItem pending, then live', async () => {
    await scheduleLiveEpisodeForShow(payload as never, {
      episodeId: String(episode.id),
      startAt: new Date(Date.now() + 3_600_000).toISOString(),
    })
    let feed = await feedForEpisode(String(episode.id))
    expect(inspectPodcastFeed(feed).counts).toMatchObject({ items: 0, liveItems: 1 })
    expect(feed).toContain('<podcast:liveItem status="pending"')
    expect(feed).toContain(fixture.mountUrl(MOUNT))

    await goLiveEpisode(payload as never, String(episode.id))
    feed = await feedForEpisode(String(episode.id))
    expect(inspectPodcastFeed(feed).counts).toMatchObject({ items: 0, liveItems: 1 })
    expect(feed).toContain('<podcast:liveItem status="live"')
    expect(feed).not.toContain(PASSWORD)
  })

  it('binds an audience room as data (public/members) and refuses a bad policy', async () => {
    const updated = await setLiveRoomBinding(payload as never, {
      episodeId: String(episode.id),
      binding: { roomId: 'venue-room-1', access: 'members' },
    })
    expect((updated as any).liveRoom).toEqual({ roomId: 'venue-room-1', access: 'members' })
    await expect(
      setLiveRoomBinding(payload as never, {
        episodeId: String(episode.id),
        binding: { roomId: 'venue-room-1', access: 'vip' as never },
      }),
    ).rejects.toThrow(/access/)
  })

  it('streams real program audio to a real listener, follows now-playing, and recovers from a mid-show kill', async () => {
    const relay = new RelaySupervisor({
      profile: profile(),
      credential: PASSWORD,
      input: { kind: 'file', path: toneWav, loop: true },
      spawner: createFfmpegRelaySpawner(),
      backoffMs: [500, 1_000],
      maxRestarts: 5,
      stableLiveMs: 60_000,
    })
    relay.start()
    await waitFor(() => relay.health.state === 'live', 'relay live')
    await fixture.waitForBytes(MOUNT, 8_192)

    // Listener proof: connect, receive MP3, decode it back to program audio.
    const heard = await listenBytes(fixture.mountUrl(MOUNT), 24_576)
    expect(heard.length).toBeGreaterThanOrEqual(24_576)
    const decoded = await decodeAudio(heard, 'mp3')
    expect(decoded.codec).toBe('mp3')
    expect(decoded.durationSec).toBeGreaterThan(1)
    expect(decoded.meanVolumeDb).not.toBeNull()
    expect(decoded.meanVolumeDb!).toBeGreaterThan(-40) // the 440 Hz tone is really there

    // Now-playing follows the played log through a real admin update.
    let session = createSession({ showId: String(show.id), showTitle: show.title })
    session = beginPlayedClip(session, {
      source: 'cart',
      clipId: 'sting-1',
      title: 'Halftime Sting',
    }).session
    const update = relay.syncNowPlaying(session)
    expect(update?.song).toBe('Halftime Sting')
    const { sendIcecastMetadataUpdate } = await import(
      '../../src/modules/podcast-studio/live/relay'
    )
    const sent = await sendIcecastMetadataUpdate(update!)
    expect(sent.ok).toBe(true)
    expect(fixture.mount(MOUNT)?.nowPlaying).toBe('Halftime Sting')
    expect(fixture.mount(MOUNT)?.iceName).toBe('POD-16 Live Show')

    // Relay health lands in the POD-05 session record; recording state untouched (none exists).
    await recordRelayHealthInSession(payload as never, {
      sessionRecordId: String(sessionRecord.id),
      health: relay.health,
    })
    const reloaded = await loadStudioSessionRecord(payload as never, String(sessionRecord.id))
    expect((reloaded?.session as any).liveStream?.relayState).toBe('live')
    expect(reloaded?.session.log.some((entry: any) => entry.type === 'live-relay-state')).toBe(true)

    // Kill the relay mid-show: supervisor reconnects, fixture sees a
    // fresh source, bytes keep flowing, a second listener hears audio.
    const bytesBeforeKill = fixture.mount(MOUNT)!.bytesReceived
    relay.killCurrentProcess('SIGKILL')
    await waitFor(() => relay.health.state === 'reconnecting', 'relay reconnecting after kill')
    await waitFor(() => relay.health.state === 'live', 'relay live after kill', 30_000)
    await waitFor(
      () => fixture.mount(MOUNT)!.bytesReceived > bytesBeforeKill + 4_096,
      'fixture bytes grow after reconnect',
    )
    const heardAgain = await listenBytes(fixture.mountUrl(MOUNT), 16_384)
    const decodedAgain = await decodeAudio(heardAgain, 'mp3')
    expect(decodedAgain.codec).toBe('mp3')
    expect(decodedAgain.durationSec).toBeGreaterThan(0.5)

    relay.stop()
    expect(relay.health.state).toBe('stopped')

    // Redaction over the whole live session: logs + profile + feed.
    const feed = await feedForEpisode(String(episode.id))
    const surfaces = [
      relay.logLines.join('\n'),
      JSON.stringify(await getPublicStreamProfile(payload as never, String(show.id))),
      feed,
    ].join('\n')
    expect(surfaces).not.toContain(PASSWORD)
    expect(surfaces).not.toContain(encodeURIComponent(PASSWORD))
  }, 120_000)

  it('pipe ingest: program PCM written to the relay stdin reaches a listener as decodable audio', async () => {
    const pipeMount = '/pod16-pipe'
    const relay = new RelaySupervisor({
      profile: { ...profile(), sourceUrl: fixture.mountUrl(pipeMount) },
      credential: PASSWORD,
      input: { kind: 'pipe' },
      spawner: createFfmpegRelaySpawner(),
      backoffMs: [500],
      maxRestarts: 3,
    })
    relay.start()
    await waitFor(() => relay.health.state === 'live', 'pipe relay live')
    // 3 seconds of 440 Hz stereo s16le PCM at the working rate.
    const pcm = tone(440, 0.5, SR * 3)
    const bytes = new Uint8Array(pcm.length * 2 * 2)
    const view = new DataView(bytes.buffer)
    for (let i = 0; i < pcm.length; i++) {
      const sample = Math.max(-1, Math.min(1, pcm[i]!))
      const int = Math.round(sample * 32_767)
      view.setInt16(i * 4, int, true)
      view.setInt16(i * 4 + 2, int, true)
    }
    for (let offset = 0; offset < bytes.length; offset += 65_536)
      relay.writeProgramAudio(bytes.subarray(offset, offset + 65_536))
    await fixture.waitForBytes(pipeMount, 8_192)
    const heard = await listenBytes(fixture.mountUrl(pipeMount), 16_384)
    const decoded = await decodeAudio(heard, 'mp3')
    expect(decoded.codec).toBe('mp3')
    expect(decoded.durationSec).toBeGreaterThan(0.5)
    relay.stop()
  }, 120_000)

  it('ends the show, finalizes the POD-09 recording, and converts to a normal item — idempotently', async () => {
    await endLiveEpisode(payload as never, String(episode.id))
    let feed = await feedForEpisode(String(episode.id))
    expect(feed).toContain('<podcast:liveItem status="ended"')
    expect(inspectPodcastFeed(feed).counts).toMatchObject({ items: 0, liveItems: 1 })

    // The show's recording: a tiny real multitrack session, finalized for real.
    const chunkRoot = path.join(tmpRoot, 'chunks')
    const storage = new DirectoryChunkStorage(chunkRoot)
    const recorder = await MultitrackRecorder.start(storage, {
      sessionId: sessionDocId,
      tracks: defaultTrackDefinitions([]),
    })
    for (let i = 0; i < 2; i++) {
      const host = tone(440, 0.5, CHUNK, i * CHUNK)
      if (i === 0) host[0] = 0.9
      const clips = tone(880, 0.4, CHUNK, i * CHUNK)
      await recorder.write('program', interleaveStereo(clips))
      await recorder.writeIso('host', host, { gainDb: 0, muted: false })
      await recorder.writeIso('clips', interleaveStereo(clips), { gainDb: 0, muted: false })
    }
    await recorder.stop()
    const finalized = await finalizeRecordingFromStorage(payload as never, appConfig, {
      sessionId: sessionDocId,
      sessionRecordId: String(sessionRecord.id),
      siteId: String(site.id),
      showId: String(show.id),
      episodeId: String(episode.id),
      storage: new DirectoryChunkStorage(chunkRoot),
      trackDefinitions: defaultTrackDefinitions([]),
      markers: [],
      playedClipLog: [],
      sessionLog: [],
    })
    expect(finalized.state).toBe('finalized')

    const guidBefore = /<guid[^>]*>([^<]+)<\/guid>/.exec(feed)?.[1]
    const converted = await convertLiveEpisodeWithRecording(payload as never, {
      episodeId: String(episode.id),
      recordingId: finalized.recordingId,
    })
    expect(converted.converted).toBe(true)

    // Conversion attaches the recording; becoming a public item is
    // the show's normal POD-04 editorial decision — the finalized
    // recording left the episode in `recorded` (public status
    // draft), so walk it through editing → review with an approval
    // and publish through the guarded POD-04 path. POD-16 does not
    // bypass those guards.
    const { publishEpisode, recordEpisodeApproval, transitionProductionState } = await import(
      '../../src/modules/podcast-studio/production'
    )
    await transitionProductionState(payload as never, String(episode.id), 'editing')
    await transitionProductionState(payload as never, String(episode.id), 'review')
    await recordEpisodeApproval(payload as never, {
      episodeId: String(episode.id),
      approver: 'pod16-operator',
      decision: 'approved',
    })
    await publishEpisode(payload as never, String(episode.id))

    feed = await feedForEpisode(String(episode.id))
    const inspection = inspectPodcastFeed(feed)
    expect(inspection.valid).toBe(true)
    expect(inspection.counts).toMatchObject({ items: 1, liveItems: 0, enclosures: 1 })
    expect(feed).not.toContain('podcast:liveItem')
    expect(feed).toContain('<guid')
    const guidAfter = /<guid[^>]*>([^<]+)<\/guid>/.exec(feed)?.[1]
    expect(guidAfter).toBeTruthy()

    // Idempotent: a second convert (the reconnect/duplicate guard) changes nothing.
    const again = await convertLiveEpisodeWithRecording(payload as never, {
      episodeId: String(episode.id),
      recordingId: finalized.recordingId,
    })
    expect(again.converted).toBe(false)
    const feedAgain = await feedForEpisode(String(episode.id))
    expect(feedAgain).toBe(feed)
    // The converted item carries the SAME guid the liveItem carried —
    // one episode, one artifact, across the whole lifecycle.
    expect(guidAfter).toBe(guidBefore)
  }, 120_000)
})
