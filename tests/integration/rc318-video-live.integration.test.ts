/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-18 — #16 Video & livestreaming, the two halves proven separately:
 *
 * VIDEO (upload → process → captioned public playback, end to end):
 * a real MP4 is generated with ffmpeg, uploaded through the media
 * workflow, processed by the product's own worker function
 * (processVideoAsset, the media job handler's core) with the local
 * ffmpeg recipe, published as a native video, and read back through
 * the exact query the public /videos/[slug] page runs — baseline MP4,
 * poster and caption track present — plus the real /video-captions/[id]
 * route handler returning the WebVTT bytes (200 published, 404 after
 * the video is unpublished).
 *
 * LIVESTREAM (the device/Icecast matrix leg): the product's
 * RelaySupervisor + ffmpeg spawner stream a looping tone file to a
 * REAL Icecast 2.4.4 server spawned by this test on an isolated port
 * (not the POD-16 protocol fixture). A listener receives MP3 bytes
 * that ffprobe decodes; Icecast's own status-json shows the mount; a
 * now-playing update through the product's metadata builder lands in
 * the server's status; the relay is SIGKILLed mid-stream and the
 * supervisor reconnects to the real server; stopping the relay
 * unpublishes the mount. Skipped (with the gap named) when no
 * icecast2 binary exists on the rig.
 */
import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig, type AppConfig } from '../../src/modules/core/config'
import { seed } from '../../src/scripts/seed'
import { uploadMedia } from '../../src/modules/media/workflow'
import { mediaStorage } from '../../src/modules/media/storage'
import { processVideoAsset } from '../../src/modules/media/video-workflow'
import { validateWebVtt } from '../../src/modules/media/video'
import { hasFfmpegBinaries } from '../helpers/ffmpeg-availability'
import {
  RelaySupervisor,
  buildIcecastMetadataUpdate,
  sendIcecastMetadataUpdate,
} from '../../src/modules/podcast-studio/live/relay'
import type { StreamProfile } from '../../src/modules/podcast-studio/live/stream-profile'
import { createFfmpegRelaySpawner } from '../../src/modules/podcast-studio/live/relay-process'
import { GET as captionsRouteGET } from '../../src/app/(frontend)/video-captions/[id]/route'

const execFileAsync = promisify(execFile)

let payload: Payload
let appConfig: AppConfig
let site: any
let publication: any
let user: any
let scope: { kind: 'site'; siteId: string }
let suffix: string
let tmpDir: string
let createdVideoAssetId: string | undefined

const findOne = async (collection: string, where: Record<string, unknown>) => {
  const result = (await payload.find({
    collection,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)) as { docs: any[] }
  return result.docs[0]
}

const waitFor = async (check: () => Promise<boolean> | boolean, label: string, ms = 30_000) => {
  const deadline = Date.now() + ms
  for (;;) {
    if (await check()) return
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  appConfig = loadConfig()
  suffix = randomUUID().slice(0, 8)
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-rc318-live-'))
  site = await findOne('sites', { slug: { equals: 'demo-publication' } })
  publication = await findOne('publications', { slug: { equals: 'main' } })
  const member = await findOne('members', { email: { equals: 'river@example.test' } })
  user = { role: 'owner', member: member.id, site: { id: site.id } }
  scope = { kind: 'site', siteId: String(site.id) }
})

afterAll(async () => {
  // The local video recipe writes HLS segments (.ts) into the media
  // dir; left behind, eslint would try to parse them as TypeScript.
  // Remove this suite's video output tree again.
  if (createdVideoAssetId && site && appConfig) {
    await rm(path.join(appConfig.storage.mediaDir, String(site.id), 'video', createdVideoAssetId), {
      recursive: true,
      force: true,
    }).catch(() => undefined)
  }
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  await payload?.db.destroy?.()
})

describe('RC3-18 #16 video journey', () => {
  it.skipIf(!hasFfmpegBinaries)(
    'uploads, processes, publishes and publicly plays back a captioned video',
    async () => {
      const mp4Path = path.join(tmpDir, `source-${suffix}.mp4`)
      await execFileAsync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=2:size=320x240:rate=10',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2',
        '-codec:v',
        'libx264',
        '-codec:a',
        'aac',
        '-shortest',
        '-y',
        mp4Path,
      ])
      const sourceAsset: any = await uploadMedia(payload, appConfig, {
        user,
        scope,
        title: `RC318 Video Source ${suffix}`,
        originalFilename: `video-${suffix}.mp4`,
        bytes: new Uint8Array(await readFile(mp4Path)),
      })
      expect(sourceAsset.kind).toBe('video')

      const videoAsset: any = await payload.create({
        collection: 'video-assets',
        data: {
          site: site.id,
          publication: publication.id,
          title: `RC318 Video ${suffix}`,
          sourceAsset: sourceAsset.id,
        },
        overrideAccess: true,
      } as never)
      createdVideoAssetId = String(videoAsset.id)
      const processed = await processVideoAsset(payload, appConfig, String(videoAsset.id))
      expect(processed.completed).toBe(true)
      const readyAsset: any = await payload.findByID({
        collection: 'video-assets',
        id: videoAsset.id,
        depth: 0,
        overrideAccess: true,
      } as never)
      expect(readyAsset.processingState).toBe('ready')
      const outputs = readyAsset.outputs as Array<Record<string, unknown>>
      const baseline = outputs.find((output) => output.filename === 'baseline.mp4')
      const poster = outputs.find((output) => output.filename === 'poster.jpg')
      expect(baseline).toBeTruthy()
      expect(poster).toBeTruthy()
      const baselineBytes = await mediaStorage(appConfig).get(String(baseline!.storageKey))
      expect(baselineBytes).toBeTruthy()
      const baselinePath = path.join(tmpDir, `baseline-${suffix}.mp4`)
      await writeFile(baselinePath, baselineBytes!)
      const probe = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name',
        '-of',
        'csv=p=0',
        baselinePath,
      ])
      expect(probe.stdout.trim()).toBe('h264')

      // Captions: a real WebVTT asset attached through the captions collection.
      const vtt = [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        'Hello from the RC318 caption track.',
        '',
        '00:00:01.000 --> 00:00:02.000',
        'Second cue, same track.',
        '',
      ].join('\n')
      const vttBytes = new TextEncoder().encode(vtt)
      const captionAsset: any = await uploadMedia(payload, appConfig, {
        user,
        scope,
        title: `RC318 Captions ${suffix}`,
        originalFilename: `captions-${suffix}.vtt`,
        bytes: vttBytes,
      })
      const video: any = await payload.create({
        collection: 'videos',
        data: {
          site: site.id,
          publication: publication.id,
          title: `RC318 Published Video ${suffix}`,
          slug: `rc318-video-${suffix}`,
          provider: 'native',
          sourceAsset: sourceAsset.id,
          videoAsset: videoAsset.id,
          status: 'draft',
          visibility: 'public',
        },
        overrideAccess: true,
      } as never)
      const caption: any = await payload.create({
        collection: 'video-captions',
        data: {
          title: `RC318 English Captions ${suffix}`,
          video: video.id,
          asset: captionAsset.id,
          language: 'en',
          label: 'English',
          default: true,
          kind: 'captions',
          validation: { valid: true, ...validateWebVtt(vttBytes) },
        },
        overrideAccess: true,
      } as never)
      await payload.update({
        collection: 'videos',
        id: video.id,
        data: {
          status: 'published',
          publishedAt: new Date().toISOString(),
          captions: [caption.id],
        },
        overrideAccess: true,
      } as never)

      // Public readback: the exact query the /videos/[slug] page runs.
      const found = (await payload.find({
        collection: 'videos',
        where: {
          and: [
            { slug: { equals: `rc318-video-${suffix}` } },
            { status: { equals: 'published' } },
            { visibility: { in: ['public', 'unlisted'] } },
          ],
        },
        limit: 1,
        depth: 2,
        overrideAccess: true,
      } as never)) as { docs: any[] }
      const publicVideo = found.docs[0]
      expect(publicVideo).toBeTruthy()
      const publicOutputs = publicVideo.videoAsset.outputs as Array<Record<string, unknown>>
      expect(publicOutputs.some((output) => output.filename === 'baseline.mp4')).toBe(true)
      expect(publicOutputs.some((output) => output.filename === 'poster.jpg')).toBe(true)
      expect((publicVideo.captions as any[]).map((entry) => String(entry.id))).toContain(
        String(caption.id),
      )

      // The real captions route serves the WebVTT bytes for a published video…
      const response = await captionsRouteGET(new Request('http://localhost/'), {
        params: Promise.resolve({ id: String(caption.id) }),
      })
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('Hello from the RC318 caption track.')

      // …and 404s once the video leaves publication.
      await payload.update({
        collection: 'videos',
        id: video.id,
        data: { status: 'draft' },
        overrideAccess: true,
      } as never)
      const gone = await captionsRouteGET(new Request('http://localhost/'), {
        params: Promise.resolve({ id: String(caption.id) }),
      })
      expect(gone.status).toBe(404)
    },
    180_000,
  )
})

// ---------------------------------------------------------------------------
// Real Icecast leg
// ---------------------------------------------------------------------------

const ICECAST_PORT = 18431
const ICECAST_PASSWORD = 'rc318-real-icecast-pw'
const ICECAST_MOUNT = '/rc318-live'

const hasIcecastBinary = async (): Promise<boolean> => {
  try {
    await execFileAsync('which', ['icecast2'])
    return true
  } catch {
    return false
  }
}

/** Synchronous availability for skipIf: on a rig without icecast2 the
 * real-server leg skips VISIBLY (and the gap is named in the RC3-18
 * RESULT.md) instead of silently passing or breaking unrelated CI. */
const icecastPresentSync = ((): boolean => {
  try {
    execFileSync('which', ['icecast2'])
    return true
  } catch {
    return false
  }
})()

const icecastSource = async (): Promise<Record<string, any> | undefined> => {
  try {
    const response = await fetch(`http://127.0.0.1:${ICECAST_PORT}/status-json.xsl`)
    if (!response.ok) return undefined
    const json = (await response.json()) as any
    const source = json?.icestats?.source
    const list = Array.isArray(source) ? source : source ? [source] : []
    return list.find((entry) => String(entry.listenurl ?? '').endsWith(ICECAST_MOUNT))
  } catch {
    return undefined
  }
}

const listenBytes = (url: string, targetBytes: number, ms = 20_000): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    const request = http.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Listener HTTP ${response.statusCode}`))
        return
      }
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        received += chunk.length
        if (received >= targetBytes) {
          request.destroy()
          resolve(Buffer.concat(chunks))
        }
      })
      response.on('error', reject)
    })
    request.on('error', (error) => {
      const partial = Buffer.concat(chunks)
      if (partial.length >= targetBytes) resolve(partial)
      else reject(error)
    })
    setTimeout(() => {
      const partial = Buffer.concat(chunks)
      if (partial.length >= targetBytes) resolve(partial)
      else reject(new Error(`Listener timed out at ${partial.length} bytes`))
    }, ms).unref()
  })

describe('RC3-18 #16 livestream against a real Icecast server', () => {
  let icecast: ChildProcess | undefined
  let icecastDir: string | undefined
  let icecastAvailable = false

  beforeAll(async () => {
    icecastAvailable = (await hasIcecastBinary()) && hasFfmpegBinaries
    if (!icecastAvailable) return
    icecastDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-rc318-icecast-'))
    const logDir = path.join(icecastDir, 'logs')
    await mkdir(logDir, { recursive: true })
    const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0
    if (runningAsRoot) {
      // Icecast refuses to run as root; it setuids to the icecast2 user
      // via changeowner, which needs the working dirs owned by it.
      await execFileAsync('chown', ['-R', 'icecast2:icecast', icecastDir])
    }
    const configXml = `<icecast>
  <limits><sources>4</sources><clients>10</clients></limits>
  <authentication>
    <source-password>${ICECAST_PASSWORD}</source-password>
    <admin-user>admin</admin-user>
    <admin-password>${ICECAST_PASSWORD}</admin-password>
  </authentication>
  <hostname>127.0.0.1</hostname>
  <listen-socket><port>${ICECAST_PORT}</port><bind-address>127.0.0.1</bind-address></listen-socket>
  <fileserve>1</fileserve>
  <paths>
    <basedir>${icecastDir}</basedir>
    <logdir>${logDir}</logdir>
    <webroot>/usr/share/icecast2/web</webroot>
    <adminroot>/usr/share/icecast2/admin</adminroot>
  </paths>
  <logging><accesslog>access.log</accesslog><errorlog>error.log</errorlog><loglevel>2</loglevel></logging>
  ${runningAsRoot ? '<security><chroot>0</chroot><changeowner><user>icecast2</user><group>icecast</group></changeowner></security>' : ''}
</icecast>
`
    const configPath = path.join(icecastDir, 'icecast.xml')
    await writeFile(configPath, configXml)
    if (runningAsRoot) await execFileAsync('chown', ['icecast2:icecast', configPath])
    icecast = spawn('icecast2', ['-c', configPath], { stdio: 'ignore' })
    await waitFor(
      async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${ICECAST_PORT}/status-json.xsl`)
          return response.ok
        } catch {
          return false
        }
      },
      'real icecast status endpoint',
      20_000,
    )
  }, 60_000)

  afterAll(async () => {
    if (icecast && !icecast.killed) icecast.kill('SIGTERM')
    if (icecastDir) await rm(icecastDir, { recursive: true, force: true }).catch(() => undefined)
  })

  it.skipIf(!icecastPresentSync || !hasFfmpegBinaries)(
    'streams through the product relay to real listeners, takes a now-playing update, and recovers from a mid-stream kill',
    async () => {
      const tonePath = path.join(tmpDir, `tone-${suffix}.wav`)
      await execFileAsync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2',
        '-codec:a',
        'pcm_s16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-y',
        tonePath,
      ])
      const profile: StreamProfile = {
        sourceUrl: `http://127.0.0.1:${ICECAST_PORT}${ICECAST_MOUNT}`,
        bitrateKbps: 64,
        title: 'RC318 Real Icecast Show',
        enabled: true,
        nowPlayingEnabled: true,
      }
      const relay = new RelaySupervisor({
        profile,
        credential: ICECAST_PASSWORD,
        input: { kind: 'file', path: tonePath, loop: true },
        spawner: createFfmpegRelaySpawner(),
        backoffMs: [500, 1_000],
        maxRestarts: 5,
        stableLiveMs: 60_000,
      })
      relay.start()
      await waitFor(() => relay.health.state === 'live', 'relay live against real icecast')
      await waitFor(async () => Boolean(await icecastSource()), 'mount visible in icecast status')

      const heard = await listenBytes(profile.sourceUrl, 16_384)
      expect(heard.length).toBeGreaterThanOrEqual(16_384)
      const heardPath = path.join(tmpDir, `heard-${suffix}.mp3`)
      await writeFile(heardPath, heard)
      const probe = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_name',
        '-of',
        'csv=p=0',
        heardPath,
      ])
      expect(probe.stdout.trim()).toBe('mp3')

      const update = buildIcecastMetadataUpdate({
        profile,
        credential: ICECAST_PASSWORD,
        song: 'RC318 Now Playing',
      })
      const sent = await sendIcecastMetadataUpdate(update)
      expect(sent.ok).toBe(true)
      await waitFor(
        async () => (await icecastSource())?.title === 'RC318 Now Playing',
        'now-playing visible in icecast status',
      )

      // Mid-stream kill: the supervisor reconnects to the real server and
      // a fresh listener hears program audio again.
      relay.killCurrentProcess('SIGKILL')
      await waitFor(() => relay.health.state === 'reconnecting', 'relay reconnecting after kill')
      await waitFor(() => relay.health.state === 'live', 'relay live after kill', 30_000)
      const heardAgain = await listenBytes(profile.sourceUrl, 8_192)
      expect(heardAgain.length).toBeGreaterThanOrEqual(8_192)

      // The source password never appears in the supervisor's log lines.
      expect(relay.logLines.join('\n')).not.toContain(ICECAST_PASSWORD)

      relay.stop()
      expect(relay.health.state).toBe('stopped')
      await waitFor(async () => !(await icecastSource()), 'mount unpublished after stop', 20_000)
    },
    240_000,
  )
})
