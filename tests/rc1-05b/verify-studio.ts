/* eslint-disable @typescript-eslint/no-explicit-any -- polymorphic operator acceptance fixture */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import { processAudioRecipe } from '../../src/modules/media/audio'
import { validateWebVtt } from '../../src/modules/media/video'
import { chromium } from '@playwright/test'

assert.equal(process.env.RC1_05B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5444/rc105b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const payload = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/05B',
  base = 'http://localhost:38960'
const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
const restart = process.argv.includes('--restart')
const checks: string[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks.push(name)
  console.log(`PASS ${checks.length}: ${name}`)
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const id = (value: any) => (typeof value === 'string' ? value : value?.id)
const row = async (collection: string, recordId: string) =>
  payload.findByID({ collection, id: recordId, depth: 0, overrideAccess: true } as never) as any
const owner = await row('users', state.owner)
const token = await createPasskeySession(
  owner,
  loadConfig().payloadSecret,
  async (sid, expires) => {
    await payload.db.pool.query(
      'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES($1,$2,$3)',
      [sid, owner.id, expires],
    )
  },
)
const call = async (route: string, method = 'GET', data?: any) => {
  const r = await fetch(`${base}${route}`, {
    method,
    headers: {
      origin: base,
      cookie: `renegade-passkey=${token.token}`,
      ...(data && !(data instanceof FormData) ? { 'content-type': 'application/json' } : {}),
    },
    body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(180000),
  })
  const body = await r.text()
  assert.ok(r.ok, `${route} ${r.status} ${body.slice(0, 1000)}`)
  return JSON.parse(body)
}
const upload = async (bytes: Uint8Array, name: string) => {
  const form = new FormData()
  form.set('siteId', id((await row('media-assets', state.asset)).site))
  form.set('title', `05B ${name}`)
  form.set('file', new File([bytes as Uint8Array<ArrayBuffer>], name))
  return (await call('/api/media/upload', 'POST', form)).asset
}
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  if (restart) {
    const saved = JSON.parse(await readFile(`${out}/studio-state.json`, 'utf8'))
    for (const object of saved.objects) {
      const bytes = await mediaStorage(loadConfig()).get(object.key)
      check(`restart studio disk hash ${object.label}`, bytes && hash(bytes) === object.hash)
      const response = await fetch(`${base}${object.url}`)
      check(
        `restart studio HTTP hash ${object.label}`,
        response.ok && hash(new Uint8Array(await response.arrayBuffer())) === object.hash,
      )
    }
    const video = await row('video-assets', saved.videoAsset)
    check(
      'actual video processing state and probe survive restart',
      video.processingState === 'ready' &&
        video.metadata.processor === 'local-ffmpeg' &&
        video.metadata.width === 320,
    )
  } else {
    const source = await upload(await readFile('scratch/rc105b-20261018/source.mp4'), 'source.mp4')
    const site = id(source.site),
      stamp = Date.now()
    const asset = (
      await call('/api/video-assets', 'POST', {
        site,
        title: '05B native video',
        sourceAsset: source.id,
      })
    ).doc
    // The global video concurrency key admits one job per run, including older
    // retryable failures. Drain supported runs until this newly created job runs.
    for (let attempt = 0; attempt < 10; attempt++) {
      await payload.jobs.run({ queue: 'media-heavy', limit: 20 })
      const current = await row('video-assets', asset.id)
      if (['ready', 'failed'].includes(current.processingState)) break
    }
    const processed = await row('video-assets', asset.id)
    if (processed.processingState !== 'ready') console.log(JSON.stringify(processed.failure))
    check(
      'real FFmpeg worker produces MP4/HLS/poster/contact sheet',
      processed.processingState === 'ready' &&
        processed.outputs.length >= 5 &&
        processed.metadata.videoCodec === 'h264',
    )
    const video = (
      await call('/api/videos', 'POST', {
        site,
        title: '05B native film',
        slug: `film-${stamp}`,
        provider: 'native',
        sourceAsset: source.id,
        videoAsset: asset.id,
        status: 'published',
        visibility: 'public',
      })
    ).doc
    const objects: any[] = []
    for (const output of processed.outputs) {
      const url = `/video-media/${asset.id}/${output.filename}`
      const r = await fetch(`${base}${url}`),
        bytes = new Uint8Array(await r.arrayBuffer())
      check(
        `public real video output ${output.filename}`,
        r.ok &&
          output.checksum === `sha256:${hash(bytes)}` &&
          r.headers.get('cache-control') === 'public, max-age=0, must-revalidate',
      )
      objects.push({ label: output.filename, key: output.storageKey, hash: hash(bytes), url })
    }
    const originalBlob = await row('media-blobs', id(source.originalBlob))
    objects.push({
      label: 'video-original',
      key: originalBlob.storageKey,
      hash: hash(await readFile('scratch/rc105b-20261018/source.mp4')),
      url: `/media/${source.id}`,
    })
    await call(`/api/media-assets/${source.id}`, 'PATCH', { publicPolicy: 'private' })
    for (const object of objects) {
      const r = await fetch(`${base}${object.url}`)
      check(
        `private video source denies output ${object.label}`,
        r.status === 404 && (await r.text()) === 'Not found',
      )
    }
    await call(`/api/media-assets/${source.id}`, 'PATCH', { publicPolicy: 'published-use' })
    const captions = await upload(
      new TextEncoder().encode('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n05B captions\n'),
      'captions.vtt',
    )
    const caption = (
      await call('/api/video-captions', 'POST', {
        title: '05B captions',
        validation: validateWebVtt(
          new TextEncoder().encode('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n05B captions\n'),
        ),
        video: video.id,
        asset: captions.id,
        language: 'en',
        label: 'English',
      })
    ).doc
    const captionResponse = await fetch(`${base}/video-captions/${caption.id}`)
    check(
      'public video captions serve exact original',
      captionResponse.ok &&
        hash(new Uint8Array(await captionResponse.arrayBuffer())) ===
          captions.checksum.replace('sha256:', ''),
    )
    await call(`/api/media-assets/${captions.id}`, 'PATCH', { publicPolicy: 'private' })
    const privateCaption = await fetch(`${base}/video-captions/${caption.id}`)
    check('private caption policy denies its alternate URL', privateCaption.status === 404)
    await call(`/api/media-assets/${captions.id}`, 'PATCH', { publicPolicy: 'published-use' })
    const captionBlob = await row('media-blobs', id(captions.originalBlob))
    objects.push({
      label: 'captions',
      key: captionBlob.storageKey,
      hash: captions.checksum.replace('sha256:', ''),
      url: `/video-captions/${caption.id}`,
    })
    execFileSync(
      process.env.FFMPEG_PATH!,
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=44100:duration=1',
        '-c:a',
        'pcm_s16le',
        'scratch/rc105b-20261018/audio.wav',
      ],
      { stdio: 'ignore', windowsHide: true },
    )
    const wav = await readFile('scratch/rc105b-20261018/audio.wav'),
      audio = await upload(wav, 'audio.wav')
    const show = (
      await call('/api/podcast-shows', 'POST', {
        site,
        title: '05B local podcast',
        slug: `podcast-${stamp}`,
        status: 'published',
        rssEnabled: true,
      })
    ).doc
    const episode = (
      await call('/api/podcast-episodes', 'POST', {
        site,
        show: show.id,
        title: '05B PCM episode',
        slug: `episode-${stamp}`,
        audio: audio.id,
        status: 'published',
      })
    ).doc
    check(
      'podcast episode persists exact enclosure facts',
      episode.enclosureBytes === wav.length && episode.enclosureMimeType === 'audio/wav',
    )
    const feed = await fetch(`${base}/podcasts/${show.slug}/feed.xml`)
    check(
      'actual podcast RSS advertises real persisted enclosure',
      feed.ok && (await feed.text()).includes(`/media/${audio.id}`),
    )
    const measured = await processAudioRecipe(payload, loadConfig(), audio.id, 'measure-loudness')
    check(
      'PCM measurement retains source checksum and actual sample-derived loudness',
      measured.checksum === audio.checksum && measured.loudness!.integratedLufs < -16,
    )
    await assert.rejects(
      processAudioRecipe(payload, loadConfig(), audio.id, 'podcast-standard-lufs16'),
      /normalization requires/,
    )
    check(
      'unsupported audio normalization reports unavailable without fabricated target measurement',
      true,
    )
    const audioBlob = await row('media-blobs', id(audio.originalBlob))
    objects.push({
      label: 'podcast-original',
      key: audioBlob.storageKey,
      hash: hash(wav),
      url: `/media/${audio.id}`,
    })
    browser = await chromium.launch({ headless: true })
    const tab = await browser.newPage()
    await tab.goto(`${base}/graphics-studio`, { waitUntil: 'networkidle', timeout: 180000 })
    check(
      'graphics preview loads with honest unavailable generation status',
      (await tab.getByRole('status').textContent()) ===
        'Local layout preview. Governed graphics generation and saving are unavailable.',
    )
    await browser.close()
    browser = undefined
    await writeFile(
      `${out}/studio-state.json`,
      JSON.stringify({ videoAsset: asset.id, objects }, null, 2),
    )
  }
  await writeFile(
    `${out}/${restart ? 'studio-restart' : 'studio'}.json`,
    JSON.stringify({ passed: checks.length, failed: 0, skipped: 0, checks }, null, 2),
  )
} catch (error) {
  await writeFile(
    `${out}/${restart ? 'studio-restart' : 'studio'}-failure.json`,
    JSON.stringify({ passed: checks.length, failed: 1, checks, error: String(error) }, null, 2),
  )
  throw error
} finally {
  await browser?.close()
  await payload.db.destroy?.()
}
process.exit(0)
