import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { chromium, expect } from '@playwright/test'

const fixture = JSON.parse(await readFile(process.env.CRE05_BROWSER_FIXTURE, 'utf8'))
const origin = process.env.APP_URL
const root = await mkdtemp(path.join(tmpdir(), 'renegade-cre05-proof-'))
const endpoint = origin + '/api/creator-studio/media-edits'
const capture = origin + '/api/creator/capture-sessions'
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
const run = promisify(execFile)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const context = async (principal) => {
  const context = await browser.newContext()
  await context.addCookies([
    { name: 'renegade-member', value: principal.session, url: origin, httpOnly: true },
    { name: 'renegade-member-csrf', value: principal.csrf, url: origin },
  ])
  return context
}
const owner = await context(fixture.owner)
const other = await context(fixture.other)
const denied = await context(fixture.denied)
const page = await owner.newPage()
page.setDefaultNavigationTimeout(120_000)
const button = (name) => page.getByRole('button', { name, exact: true })
const field = (name) =>
  page.getByLabel(new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
const saved = () =>
  expect(page.getByRole('status').filter({ hasText: /^All changes saved$/ })).toBeVisible({
    timeout: 30_000,
  })
const get = async (url) => {
  const response = await owner.request.get(url)
  assert.equal(response.status(), 200, await response.text())
  return response.json()
}
const fetchBytes = async (id) => {
  const response = await owner.request.get(endpoint + '?asset=' + id)
  assert.equal(response.status(), 200)
  return response.body()
}
const post = (url, data) =>
  owner.request.post(url, {
    data,
    headers: { 'x-member-csrf': fixture.owner.csrf },
  })
const editPage = origin + '/studio/media-edit'
const section = (title) =>
  page.locator('summary').filter({ hasText: new RegExp('^' + title + '$') })

async function record(mode) {
  const before = new Set((await get(capture)).map(({ id }) => id))
  await expect(button('Enable preview')).toBeEnabled({ timeout: 60_000 })
  await field('Recording mode').selectOption(mode)
  await button('Enable preview').click()
  await page.getByLabel(/Everyone I.m capturing/).check()
  await button('Start recording').click()
  await expect(page.getByRole('status').filter({ hasText: /^Recording$/ })).toBeVisible({
    timeout: 15_000,
  })
  await expect(
    page.getByRole('status').filter({ hasText: /Server backup [1-9]\d* chunks/ }),
  ).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1250)
  await button('Stop recording').click()
  await page.getByRole('heading', { name: 'Review recording' }).waitFor()
  await page.getByLabel('I reviewed this recording').check()
  await button('Save private master').click()
  await expect(page.getByText('Verified master saved privately to the media library.')).toBeVisible(
    { timeout: 60_000 },
  )
  const take = (await get(capture)).find(({ id }) => !before.has(id))
  assert.equal(take.state, 'completed')
  assert.ok(take.asset)
  return take.asset
}

async function verify(row, width, height) {
  assert.equal(row.state, 'ready')
  const bytes = await fetchBytes(row.video)
  assert.equal(row.report.videoChecksum, 'sha256:' + digest(bytes))
  const name = path.join(root, row.id + '.mp4')
  await writeFile(name, bytes)
  const { stdout } = await run(ffprobe, [
    '-v',
    'error',
    '-show_streams',
    '-show_chapters',
    '-show_format',
    '-of',
    'json',
    name,
  ])
  const inspection = JSON.parse(stdout)
  const video = inspection.streams.find(({ codec_type }) => codec_type === 'video')
  assert.deepEqual([video.codec_name, video.width, video.height], ['h264', width, height])
  assert.equal(
    inspection.streams.find(({ codec_type }) => codec_type === 'audio').codec_name,
    'aac',
  )
  assert.equal(
    inspection.streams.find(({ codec_type }) => codec_type === 'subtitle').codec_name,
    'mov_text',
  )
  assert.equal(inspection.chapters[0].tags.title, 'Opening')
  const captions = await run(ffmpeg, ['-v', 'error', '-i', name, '-map', '0:s:0', '-f', 'srt', '-'])
  assert.match(captions.stdout, /Caption from the timeline/)
  const mix = await run(ffmpeg, [
    '-hide_banner',
    '-i',
    name,
    '-af',
    'volumedetect',
    '-vn',
    '-f',
    'null',
    '-',
  ])
  assert.ok(Number(/max_volume: (-?[\d.]+) dB/.exec(mix.stderr)?.[1]) > -45, mix.stderr)
  const title = await run(
    ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      '0.4',
      '-i',
      name,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:-2',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      '-',
    ],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 },
  )
  const pixel = title.stdout
  let magenta = 0
  for (let index = 0; index < pixel.length; index += 3)
    if (pixel[index] > 145 && pixel[index + 1] < 100 && pixel[index + 2] > 145) magenta++
  assert.ok(magenta > 20, 'The encoded frame must contain the timed magenta title')
  const thumbnail = await fetchBytes(row.thumbnail)
  assert.equal(row.report.thumbnailChecksum, 'sha256:' + digest(thumbnail))
  assert.equal(thumbnail.readUInt16BE(), 0xffd8)
  return {
    id: row.id,
    sha256: digest(bytes),
    width,
    height,
    duration: Number(inspection.format.duration),
    magenta,
  }
}

try {
  const clips = []
  for (let i = 0; i < 3; i++) {
    await page.goto(origin + '/studio/record', { waitUntil: 'domcontentloaded' })
    clips.push(await record('video'))
    console.log('Verified browser video source', i + 1)
  }
  await page.goto(editPage, { waitUntil: 'domcontentloaded' })
  await expect(button('New project')).toBeEnabled({ timeout: 60_000 })
  await button('New project').click()
  await saved()
  await field('Project title').fill('Editor acceptance')
  for (const id of clips) {
    await field('Source media').selectOption(id)
    await button('Add clip').click()
    await saved()
  }
  const project = new URL(page.url()).searchParams.get('project')
  const url = endpoint + '?id=' + project
  const first = await get(url)
  assert.equal(first.recipe.clips.length, 3)
  await page.getByRole('button', { name: /^1\. Recording/ }).click()
  await field('Source out (s)').fill('1.4')
  await field('Split at source time (s)').fill('0.7')
  await button('Split clip').click()
  await field('Source in (s)').fill('0.1')
  await saved()
  const edited = await get(url)
  assert.deepEqual(
    edited.recipe.clips.slice(0, 2).map(({ in: a, out }) => [a, out]),
    [
      [0.1, 0.7],
      [0.7, 1.4],
    ],
  )
  assert.equal(
    (await post(url, { action: 'save', revision: first.revision, recipe: first.recipe })).status(),
    409,
  )

  await button('Undo').click()
  await expect(button('Redo')).toBeEnabled()
  assert.notEqual((await get(url)).hash, edited.hash)
  await button('Redo').click()
  await saved()
  assert.equal((await get(url)).hash, edited.hash)

  await section('Voiceover').click()
  await button('Open voiceover recorder').click()
  const voice = await record('audio')
  await button('Back to voiceover selection').click()
  await field('Voiceover source').selectOption(voice)
  await field('Voiceover source out (s)').fill('1.7')
  await field('Voiceover starts at (s)').fill('0.2')
  await field('Audio fade in (s)').filter({ visible: true }).fill('0.1')
  await page.getByRole('checkbox', { name: 'Voice correction', exact: true }).check()
  await saved()
  console.log('Verified saved split, trim, undo, redo and recorded voiceover')

  await section('Text, graphics and brand').click()
  await button('Add title').click()
  await field('Title text').fill('CRE-05 Overlay')
  await field('Text color').fill('#ff00ff')
  await field('Layer end (s)').fill('1.35')
  await button('Add graphic').click()
  await page
    .getByRole('group', { name: 'Layer 2' })
    .getByRole('combobox', { name: 'Graphic', exact: true })
    .selectOption(fixture.still)
  await page
    .getByRole('group', { name: 'Layer 2' })
    .getByLabel('Layer vertical position (%)')
    .fill('75')
  await section('Captions and chapters').click()
  await button('Add caption').click()
  await field('Caption text').fill('Caption from the timeline')
  await button('Add chapter').click()
  await field('Chapter title').fill('Opening')
  await field('Thumbnail time (s)').fill('0.4')
  await saved()
  const before = Object.fromEntries(
    await Promise.all(
      [...clips, voice, fixture.still].map(async (id) => [id, digest(await fetchBytes(id))]),
    ),
  )
  const current = await get(url)
  assert.equal(current.dependencies.length, 5)
  assert.deepEqual(
    Object.fromEntries(current.dependencies.map(({ id, checksum }) => [id, checksum.slice(7)])),
    before,
  )
  assert.equal((await other.request.get(url)).status(), 404)
  assert.equal((await other.request.get(endpoint + '?asset=' + clips[0])).status(), 404)
  assert.equal((await denied.request.get(endpoint)).status(), 403)
  assert.equal(
    (
      await owner.request.post(url, { data: { action: 'undo', revision: current.revision } })
    ).status(),
    403,
  )
  const range = await owner.request.get(endpoint + '?asset=' + clips[0], {
    headers: { range: 'bytes=0-63' },
  })
  assert.equal(range.status(), 206)
  assert.equal((await range.body()).length, 64)
  const waitExports = async (count) => {
    await expect
      .poll(
        async () => {
          const rows = await get(url + '&exports=1')
          assert.ok(
            rows.every(({ state }) => state !== 'failed'),
            JSON.stringify(rows),
          )
          return rows.filter(({ state }) => state === 'ready').length
        },
        { timeout: 120_000, intervals: [500, 1000, 2000] },
      )
      .toBe(count)
    return get(url + '&exports=1')
  }
  await button('Export landscape MP4').click()
  await expect(button('Export vertical MP4')).toBeEnabled()
  await button('Export vertical MP4').click()
  const firstOutputs = await waitExports(2)
  const landscape = await verify(
    firstOutputs.find(({ profile }) => profile === 'landscape'),
    1280,
    720,
  )
  const vertical = await verify(
    firstOutputs.find(({ profile }) => profile === 'vertical'),
    720,
    1280,
  )
  assert.equal(
    (await other.request.get(endpoint + '?asset=' + firstOutputs[0].video)).status(),
    404,
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(field('Project title')).toHaveValue('Editor acceptance', { timeout: 60_000 })
  assert.equal((await get(url)).hash, current.hash)
  await expect(button('Play export')).toHaveCount(2, { timeout: 30_000 })
  await button('Play export').first().click()
  await page.waitForFunction(
    async () => {
      const video = document.querySelector('video[aria-label="Verified MP4 preview"]')
      if (!video || video.readyState < 2) return false
      video.muted = true
      await video.play()
      return video.currentTime > 0
    },
    undefined,
    { timeout: 30_000 },
  )
  await page.getByRole('checkbox', { name: 'Render a fresh copy', exact: true }).check()
  await button('Export landscape MP4').click()
  const all = await waitExports(3)
  const rebuilt = await verify(
    all.find(({ id }) => !firstOutputs.some((row) => row.id === id)),
    1280,
    720,
  )
  assert.equal(rebuilt.sha256, landscape.sha256)
  for (const [id, expected] of Object.entries(before))
    assert.equal(digest(await fetchBytes(id)), expected)
  const receipt = {
    project,
    revision: current.revision,
    dependencyHash: current.hash,
    sources: before,
    landscape,
    vertical,
    rebuilt,
    browser: browser.version(),
  }
  await writeFile(path.join(root, 'receipt.json'), JSON.stringify(receipt, null, 2))
  console.log(JSON.stringify({ ...receipt, receipt: path.join(root, 'receipt.json') }, null, 2))
} catch (error) {
  await page
    .screenshot({ path: path.join(root, 'failure.png'), fullPage: true })
    .catch(() => undefined)
  console.error('Browser journey artifacts:', root)
  throw error
} finally {
  await browser.close()
}
