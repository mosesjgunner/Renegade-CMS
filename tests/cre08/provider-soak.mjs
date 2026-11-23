import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const whipModule = ts.transpileModule(readFileSync('src/modules/live-media/whip.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const hlsScript = readFileSync(require.resolve('hls.js/dist/hls.min.js'))
const root = 'http://127.0.0.1:3908'
const control = process.env.CRE08_CONTROL ?? 'http://127.0.0.1:3997'
const ingest = process.env.CRE08_INGEST ?? 'http://127.0.0.1:3989'
const delivery = process.env.CRE08_DELIVERY ?? 'http://127.0.0.1:3988'
const recordings = process.env.CRE08_RECORDINGS ?? 'http://127.0.0.1:3996'
const path = process.env.CRE08_PROBE_PATH ?? randomUUID()
const minutes = Number(process.env.CRE08_SOAK_MINUTES ?? 21)
const outage = Number(process.env.CRE08_OUTAGE_SECONDS ?? 45)
const container = process.env.CRE08_MTX_CONTAINER ?? 'cre08-mtx-probe'
const server = createServer((req, res) => {
  if (req.url === '/whip.js' || req.url === '/hls.js') {
    res.setHeader('Content-Type', 'text/javascript')
    return res.end(req.url === '/whip.js' ? whipModule : hlsScript)
  }
  res.setHeader('Content-Type', 'text/html')
  res.end(
    '<!DOCTYPE html><title>Live provider proof</title><video controls autoplay muted></video>',
  )
})

function report(event, details = {}) {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...details }))
}

async function controlRequest(resource, method = 'GET', body) {
  const response = await fetch(control + resource, {
    method,
    ...(body
      ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  })
  if (!response.ok)
    throw new Error(`Control request ${method} ${resource} returned ${response.status}`)
  return response.json()
}

const host = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const viewer = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
await new Promise((resolve) => server.listen(3908, '127.0.0.1', resolve))
try {
  const response = await fetch(`${control}/v3/config/paths/get/${path}`)
  if (response.status === 404)
    await controlRequest(`/v3/config/paths/add/${path}`, 'POST', { record: true })
  else if (!response.ok) throw new Error(`Preflight returned ${response.status}`)
  else await controlRequest(`/v3/config/paths/patch/${path}`, 'PATCH', { record: true })
  const publisher = await host.newPage()
  const player = await viewer.newPage()
  await Promise.all([publisher.goto(root), player.goto(root)])
  const publish = () =>
    publisher.evaluate(async (url) => {
      const { publishWhip } = await import('/whip.js')
      window.source ||= await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 360, frameRate: 24 },
      })
      window.publisher = await publishWhip(window.source, { whipUrl: url, iceServers: [] })
    }, `${ingest}/${path}/whip`)
  const play = () =>
    player.evaluate((url) => {
      const video = document.querySelector('video')
      window.hls?.destroy()
      window.hls = new window.Hls()
      window.hls.loadSource(url)
      window.hls.attachMedia(video)
      video.play().catch(() => {})
    }, `${delivery}/${path}/index.m3u8`)
  const waitForSource = () =>
    publisher.waitForFunction(() => window.publisher?.peer.connectionState === 'connected', {
      timeout: 15000,
    })
  const stats = async () => {
    const [state, engine, playback] = await Promise.all([
      controlRequest(`/v3/paths/get/${path}`),
      promisify(execFile)('docker', ['stats', '--no-stream', '--format', '{{json .}}', container]),
      player.evaluate(() => {
        const video = document.querySelector('video')
        return {
          seconds: video.currentTime,
          frames: video.getVideoPlaybackQuality().totalVideoFrames,
          audioBytes: video.webkitAudioDecodedByteCount,
          dropped: video.getVideoPlaybackQuality().droppedVideoFrames,
        }
      }),
    ])
    report('sample', {
      bytesReceived: state.bytesReceived,
      bytesSent: state.bytesSent,
      ready: state.ready,
      playback,
      container: JSON.parse(engine.stdout),
    })
    return playback
  }
  await publish()
  await waitForSource()
  await player.addScriptTag({ url: `${root}/hls.js` })
  await play()
  await player.waitForFunction(() => document.querySelector('video').readyState >= 2)
  await player.evaluate(() => document.querySelector('video').play())
  await player.waitForFunction(() => document.querySelector('video').currentTime > 1)
  const started = Date.now()
  report('watching', {
    path,
    minutes,
    outage,
    viewer: 'separate Chromium process on publisher host',
  })
  let prior
  while (Date.now() - started < minutes * 60000) {
    await delay(Math.min(60000, minutes * 60000 - (Date.now() - started)))
    const current = await stats()
    if (prior && (current.frames <= prior.frames || current.audioBytes <= prior.audioBytes))
      throw new Error('Viewer audio or video counters stopped advancing')
    prior = current
  }
  report('encoder-offline')
  await publisher.evaluate(() => window.publisher.close())
  await delay(outage * 1000)
  const offline = await fetch(`${control}/v3/paths/get/${path}`)
  if (offline.ok && (await offline.json()).ready) throw new Error('Source still reported online')
  await publish()
  await waitForSource()
  await play()
  await player.waitForFunction(() => document.querySelector('video').readyState >= 2)
  await player.evaluate(() => document.querySelector('video').play())
  await player.waitForFunction(() => document.querySelector('video').currentTime > 1)
  await stats()
  report('reconnected', { path })
  await publisher.evaluate(() => window.publisher.close())
  await controlRequest(`/v3/config/paths/delete/${path}`, 'DELETE')
  const replay = await fetch(`${recordings}/list?path=${path}`)
  if (!replay.ok) throw new Error(`Recording list returned ${replay.status}`)
  const ranges = await replay.json()
  const replayURL = new URL(ranges[0].url)
  const bytes = await fetch(`${recordings}${replayURL.pathname}${replayURL.search}`, {
    headers: { Range: 'bytes=0-4095' },
  })
  const reader = bytes.body.getReader()
  const first = await reader.read()
  await reader.cancel()
  if (!bytes.ok || !Buffer.from(first.value ?? []).includes(Buffer.from('ftyp')))
    throw new Error('Replay did not return MP4 bytes')
  report('replay', {
    ranges: ranges.map(({ start, duration }) => ({ start, duration })),
    status: bytes.status,
  })
} finally {
  await Promise.all([host.close(), viewer.close()])
  await new Promise((resolve) => server.close(resolve))
}
