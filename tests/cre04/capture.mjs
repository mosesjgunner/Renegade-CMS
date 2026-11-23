import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium, firefox, webkit } from '@playwright/test'

const origin = process.env.APP_URL || 'http://localhost:3464'
const endpoint = '/api/creator/capture-sessions'
const fixture = JSON.parse(
  await readFile(process.env.CRE04_BROWSER_FIXTURE || 'scratch/cre04-fixture.json', 'utf8'),
)
const browserName = process.argv[2] || 'chromium'
const lane = process.argv[3] || 'audio'
const profiles = {
  chromium: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  firefox: {
    firefoxUserPrefs: {
      'media.navigator.permission.disabled': true,
      'media.navigator.streams.fake': true,
    },
  },
  webkit: {},
}
const engine = { chromium, firefox, webkit }[browserName]
const fullCrash = browserName === 'chromium' && lane === 'browser-kill'
const interrupted = fullCrash || lane === 'crash'
const noSystemAudio = lane === 'screen-silent'
const noLocal = lane === 'no-local'
const mp4 = lane === 'mp4'
const denyFirstPreview = lane === 'permission-denied'
const root = 'scratch/cre04-browser-proof'
await mkdir(root, { recursive: true })
const auth = (member) => [
  { name: 'renegade-member', value: member.session, url: origin, httpOnly: true },
  { name: 'renegade-member-csrf', value: member.csrf, url: origin },
]
const browser = await engine.launch(profiles[browserName])
const ownerOptions = {
  acceptDownloads: true,
  ...(browserName === 'webkit' ? { permissions: ['camera', 'microphone'] } : {}),
}
const userData = fullCrash
  ? await mkdtemp(path.join(tmpdir(), 'renegade-capture-proof-'))
  : undefined
const launchCrashContext = () =>
  chromium.launchPersistentContext(userData, {
    ...ownerOptions,
    ...profiles.chromium,
  })
let owner = fullCrash ? await launchCrashContext() : await browser.newContext(ownerOptions)
const stranger = await browser.newContext()
await owner.addCookies(auth(fixture.author))
await stranger.addCookies(auth(fixture.other))
const page = await owner.newPage()
const api = (id) => endpoint + '?id=' + id
const readServer = async () => {
  const response = await owner.request.get(origin + endpoint)
  assert.equal(response.status(), 200, await response.text())
  return response.json()
}
const button = (name) => page.getByRole('button', { name, exact: true })
const waitStatus = (pattern) =>
  page.getByRole('status').filter({ hasText: pattern }).first().waitFor()
const ready = () =>
  page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some(
        (item) => item.textContent === 'Enable preview' && !item.disabled,
      ),
    undefined,
    { timeout: 60_000 },
  )
const recorder = page.locator('[aria-label="Recorded master"]')
const download = async (pattern, filename) => {
  const event = page.waitForEvent('download')
  await page.getByRole('link', { name: pattern }).click()
  await (await event).saveAs(filename)
  assert.ok((await readFile(filename)).length > 100)
}
const receipt = { browserName, browserVersion: browser.version(), lane }
let requestError
let localFile
page.on('response', async (response) => {
  if (response.url().includes(endpoint) && response.status() >= 400) {
    requestError = [response.status(), await response.text().catch(() => '')]
  }
})

async function probe(filename) {
  const { stdout } = await promisify(execFile)(process.env.FFPROBE_PATH || 'ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=codec_name,codec_type,width,height,sample_rate',
    '-of',
    'json',
    filename,
  ])
  return JSON.parse(stdout)
}

try {
  await page.addInitScript(
    ({ noSystemAudio, noLocal, mp4, denyFirstPreview }) => {
      window.captureCalls = 0
      const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async (...args) => {
        window.captureCalls++
        if (denyFirstPreview && window.captureCalls === 1)
          throw new DOMException('Microphone permission denied for this test.', 'NotAllowedError')
        return (window.captureSource = await native(...args))
      }
      if (navigator.mediaDevices.getDisplayMedia) {
        const display = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
        navigator.mediaDevices.getDisplayMedia = async (options) =>
          (window.displaySource = await display(
            noSystemAudio ? { ...options, audio: false } : options,
          ))
      }
      if (noLocal) {
        Object.defineProperty(navigator.storage, 'estimate', {
          value: async () => ({ quota: 1024, usage: 1024 }),
        })
      }
      if (mp4) {
        const supports = MediaRecorder.isTypeSupported.bind(MediaRecorder)
        MediaRecorder.isTypeSupported = (type) => type.startsWith('video/mp4') && supports(type)
      }
    },
    { noSystemAudio, noLocal, mp4, denyFirstPreview },
  )
  await page.goto(origin + '/studio/record', { waitUntil: 'domcontentloaded' })
  await ready()
  assert.equal(await page.evaluate(() => window.captureCalls), 0)
  if (denyFirstPreview) {
    await button('Enable preview').click()
    await waitStatus('Permission was denied')
    assert.equal(await button('Start recording').count(), 0)
    receipt.permissionDeniedBeforeRecovery = true
  }
  if (lane === 'no-screen') {
    await page.addInitScript(() =>
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: undefined }),
    )
    await page.reload()
    await ready()
  }
  await page
    .getByLabel('Recording mode')
    .selectOption(
      lane === 'video' || mp4 || interrupted
        ? 'video'
        : lane.startsWith('screen')
          ? noSystemAudio
            ? 'screen'
            : lane
          : lane === 'no-screen'
            ? 'screen'
            : 'audio',
    )
  if (lane === 'no-screen') {
    await waitStatus('Screen sharing is unavailable here')
    assert.equal(await button('Enable preview').isEnabled(), false)
    await page.getByLabel('Recording mode').selectOption('audio')
  }
  if (lane.startsWith('screen')) await page.getByLabel('Request shared audio').check()
  const creation = page.waitForResponse(
    (response) =>
      response.url() === origin + endpoint &&
      response.request().method() === 'POST' &&
      response.ok(),
  )
  await button('Enable preview').click()
  await button('Start recording').waitFor({ timeout: 15_000 })
  if (lane.startsWith('screen')) {
    receipt.display = await page.evaluate(() => ({
      audioTracks: window.displaySource.getAudioTracks().length,
      settings: window.displaySource.getVideoTracks()[0].getSettings(),
    }))
    if (!receipt.display.audioTracks) await waitStatus('This share has no system audio')
  }
  assert.equal(await button('Start recording').isEnabled(), false)
  await page.getByLabel('Everyone I’m capturing').check()
  await button('Start recording').click()
  await waitStatus(/^Recording$/)
  await waitStatus(
    noLocal
      ? /Browser backup 0 chunks .* Server backup [1-9]\d* chunks/
      : /Browser backup [1-9]\d* chunks .* Server backup [1-9]\d* chunks/,
  )
  if (noLocal) await waitStatus('Only server-confirmed chunks can survive closing this tab')
  const { id } = await (await creation).json()
  const active = (await readServer()).find((take) => take.id === id)
  assert.equal(active.state, 'open')
  assert.equal(active.asset, undefined)
  receipt.active = active
  if (lane === 'audio') {
    const url = origin + api(active.id)
    const noReview = await owner.request.post(url, {
      data: { count: active.received },
      headers: { origin, 'x-member-csrf': fixture.author.csrf },
    })
    assert.equal(noReview.status(), 400)
    const noCSRF = await owner.request.post(url, {
      data: { reviewed: true, count: active.received },
    })
    assert.equal(noCSRF.status(), 403)
  }
  if (lane === 'offline' || interrupted) {
    await owner.setOffline(true)
    await page.waitForFunction(
      (min) =>
        Array.from(document.querySelectorAll('[role=status]')).some(
          (el) => Number(el.textContent.match(/Browser backup (\d+)/)?.[1]) > min + 1,
        ),
      active.received,
    )
  }
  if (interrupted) {
    const cdp = await owner.newCDPSession(page)
    if (fullCrash) {
      const closed = owner.waitForEvent('close', { timeout: 15_000 })
      void cdp.send('Browser.crash').catch(() => undefined)
      await closed
      owner = await launchCrashContext()
      await owner.addCookies(auth(fixture.author))
    } else {
      await Promise.race([
        page.waitForEvent('crash'),
        cdp.send('Page.crash').catch(() => undefined),
      ])
      await owner.setOffline(false)
      await page.close()
    }
    const recovered = await owner.newPage()
    await recovered.goto(origin + '/studio/record', { waitUntil: 'domcontentloaded' })
    await recovered.locator(`[data-recording-key="${active.key}"]`).click()
    await recovered.getByText('This take may have been interrupted.', { exact: false }).waitFor()
    await recovered.getByRole('link', { name: /Download master/ }).waitFor()
    const recoveryStatus = await recovered
      .getByRole('status')
      .filter({ hasText: 'Browser backup' })
      .textContent()
    assert.ok(Number(recoveryStatus.match(/Browser backup (\d+)/)?.[1]) > active.received)
    await recovered.getByLabel('I reviewed this recording').check()
    await recovered.getByRole('button', { name: 'Save private master' }).click()
    await recovered
      .getByText('Verified master saved privately to the media library.')
      .waitFor({ timeout: 90_000 })
    receipt.recoveryStatus = recoveryStatus
  } else {
    if (lane === 'audio' && (await button('Pause').count())) {
      await button('Pause').click()
      await waitStatus(/^Paused$/)
      await page.waitForTimeout(350)
      await button('Resume').click()
      await waitStatus(/^Recording$/)
      receipt.pausedAndResumed = true
    }
    if (lane === 'device-ended') {
      await page.evaluate(() => {
        const track = window.captureSource.getAudioTracks()[0]
        track.stop()
        track.dispatchEvent(new Event('ended'))
      })
      await page.getByText('A capture device disconnected', { exact: false }).waitFor()
    } else {
      await page.waitForTimeout(1150)
      await button('Stop recording').click()
    }
    await page.getByRole('heading', { name: 'Review recording' }).waitFor()
    localFile = root + '/' + browserName + '-' + lane + '-local'
    await download(/^Download master\./, localFile)
    receipt.localProbe = await probe(localFile)
    assert.ok(receipt.localProbe.streams.length)
    if (lane === 'offline') {
      await waitStatus(/fetch|Abort|network/i)
      const during = (await readServer()).find((take) => take.id === active.id)
      receipt.serverChunksDuringOutage = during.received
      await owner.setOffline(false)
    }
    if (noLocal) {
      await page
        .waitForResponse((response) => response.url().includes('&seal=1') && response.ok(), {
          timeout: 2000,
        })
        .catch(() => undefined)
      assert.ok((await readServer()).find((take) => take.id === active.id).endedMs > 0)
      await page.reload()
      await page.locator(`[data-recording-key="${active.key}"]`).click()
      await page.getByRole('link', { name: 'Download server master' }).waitFor()
      receipt.recoveredFromServerOnly = true
    }
    await page.getByLabel('I reviewed this recording').check()
    await button('Save private master').click()
    await page
      .getByText('Verified master saved privately to the media library.')
      .waitFor({ timeout: 90_000 })
    await page.waitForFunction(() =>
      document.querySelector('[aria-label="Recorded master"]')?.src.endsWith('&master=1'),
    )
    await recorder.evaluate(async (element) => {
      element.muted = true
      await element.play()
    })
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Recorded master"]')?.currentTime > 0,
    )
    await recorder.evaluate((element) => element.pause())
  }
  const final = (await readServer()).find((take) => take.id === active.id)
  assert.equal(final.state, 'completed')
  assert.ok(final.asset)
  const url = origin + api(final.id)
  const full = await owner.request.get(url)
  assert.equal(full.status(), 200)
  const mime = full.headers()['content-type']
  if (mp4) assert.equal(mime, 'video/mp4')
  const extension = mime === 'audio/mp4' ? 'm4a' : mime.split('/')[1]
  const canonical = root + '/' + browserName + '-' + lane + '-canonical.' + extension
  const canonicalBytes = await full.body()
  await writeFile(canonical, canonicalBytes)
  receipt.canonicalProbe = await probe(canonical)
  assert.ok(Number(receipt.canonicalProbe.format.duration) > 0)
  const range = await owner.request.get(url, { headers: { range: 'bytes=0-31' } })
  assert.equal(range.status(), 206)
  assert.deepEqual(await range.body(), canonicalBytes.subarray(0, 32))
  if (localFile && !noLocal) {
    const source = await owner.request.get(url + '&track=master')
    assert.equal(source.status(), 200)
    assert.deepEqual(await source.body(), await readFile(localFile))
  }
  assert.equal((await stranger.request.get(url)).status(), 404)
  assert.equal(
    (
      await stranger.request.post(url, {
        data: { reviewed: true },
        headers: { origin, 'x-member-csrf': fixture.other.csrf },
      })
    ).status(),
    404,
  )
  const repeat = await owner.request.post(url, {
    data: { reviewed: true, count: final.received },
    headers: { origin, 'x-member-csrf': fixture.author.csrf },
  })
  assert.equal((await repeat.json()).asset, final.asset)
  const manifest = await (await owner.request.get(url + '&manifest=1')).json()
  assert.equal(Object.keys(manifest.chunks).length, final.received)
  assert.ok(manifest.manifest.orientation.length)
  assert.ok(Object.values(manifest.chunks).every((chunk) => chunk.checksum.startsWith('sha256:')))
  if (lane === 'screen-camera')
    assert.ok(manifest.sources.camera && manifest.sources.screen && manifest.sources.mic)
  if (interrupted) assert.equal(manifest.manifest.endedMs, undefined)
  receipt.canonical = final
  receipt.sources = manifest.sources
  await writeFile(root + '/' + browserName + '-' + lane + '.json', JSON.stringify(receipt, null, 2))
  console.log(JSON.stringify(receipt))
} catch (error) {
  console.error(
    'Capture failed',
    requestError,
    await page
      .locator('main')
      .innerText({ timeout: 1000 })
      .catch(() => 'page unavailable'),
  )
  throw error
} finally {
  if (fullCrash) await owner.close().catch(() => undefined)
  await browser.close()
}
