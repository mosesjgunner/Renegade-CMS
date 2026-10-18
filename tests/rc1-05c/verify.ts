/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator fixtures and browser engine inspection */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { chromium, expect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'

assert.equal(process.env.RC1_05C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5445/rc105c_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(path.resolve(process.env.MEDIA_DIR!), path.resolve('scratch/rc105c-20261018/media'))
const payload = await getPayload({ config })
const base = 'http://localhost:38970',
  out = 'docs/rc/evidence/rc1/18-pass/05C'
const checks: string[] = [],
  network: any[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks.push(name)
  console.log(`PASS ${checks.length}: ${name}`)
}
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const record = async (collection: string, id: any): Promise<any> =>
  payload.findByID({
    collection,
    id: typeof id === 'object' ? id.id : id,
    depth: 0,
    overrideAccess: true,
  } as never)
const api = async (route: string, cookie = '', method = 'GET', body?: any) => {
  const response = await fetch(base + route, {
    method,
    headers: {
      origin: base,
      ...(cookie ? { cookie } : {}),
      ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180000),
  })
  network.push({
    method,
    route,
    status: response.status,
    type: response.headers.get('content-type'),
  })
  return response
}
const json = async (route: string, cookie: string, method: string, data: any, status = 200) => {
  const r = await api(route, cookie, method, data),
    text = await r.text()
  assert.equal(r.status, status, `${route}: ${text.slice(0, 1000)}`)
  return JSON.parse(text)
}
const form = (site: string, bytes: Uint8Array, mode = 'all-usages') => {
  const data = new FormData()
  data.set('siteId', site)
  data.set('mode', mode)
  data.set('title', '05C API edit')
  data.set('file', new File([new Uint8Array(bytes)], 'edited.png', { type: 'image/png' }))
  return data
}
const session = async (user: any) => {
  const result = await createPasskeySession(
    user,
    loadConfig().payloadSecret,
    async (id, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, user.id, expires],
      )
    },
  )
  return `renegade-passkey=${result.token}`
}
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await mkdir(out, { recursive: true })
  if (process.argv.includes('--restart')) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    for (const a of state.assets) {
      const row = await record('media-assets', a.id)
      check(
        `restart record ${a.id}`,
        row.checksum === a.checksum && row.storageLocation === a.storageLocation,
      )
      check(
        `restart bytes ${a.id}`,
        hash((await mediaStorage(loadConfig()).get(row.storageLocation))!) ===
          a.checksum.replace('sha256:', ''),
      )
    }
    const r = await api(state.articlePath)
    check('restart public article', r.ok && (await r.text()).includes('05C edited photograph'))
    const img = await api(`/media/${state.originalId}`)
    check(
      'restart replacement delivery',
      img.ok && hash(new Uint8Array(await img.arrayBuffer())) === state.editedHash,
    )
    await writeFile(
      `${out}/restart.json`,
      JSON.stringify({ passed: checks.length, failed: 0, checks }, null, 2),
    )
  } else {
    const stamp = Date.now()
    const site = await payload.create({
      collection: 'sites',
      data: { name: '05C Alpha', slug: `05c-${stamp}`, lifecycle: 'active' } as never,
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '05C Beta', slug: `05c-beta-${stamp}`, lifecycle: 'active' } as never,
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@05c.test`, role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-${stamp}@05c.test`, role: 'staff' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof staff.member === 'string' ? staff.member : staff.member!.id,
        site: beta.id,
        role: 'contributor',
      },
    })
    const cookie = await session(owner),
      foreign = await session(staff)
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [site.id]: base, [beta.id]: 'http://beta.05c.test:38970' },
        launchState: 'live',
        indexingMode: 'index',
      } as never,
    })
    const originalBytes = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#7136af' },
    })
      .png()
      .toBuffer()
    const upload = form(site.id, originalBytes)
    upload.set('title', `05C original ${stamp}`)
    upload.set('altText', '05C edited photograph')
    const asset = (await json('/api/media/upload', cookie, 'POST', upload, 201)).asset
    await json(`/api/media/${asset.id}`, cookie, 'PATCH', {
      siteId: site.id,
      creatorCredit: '05C Photographer',
      copyrightOwner: '05C Operator',
      rightsStatus: 'approved',
      governanceEnabled: true,
      consentReference: '05C-local-consent',
      licenseType: 'owned',
    })
    check(
      'uploaded original has exact checksum and dimensions',
      asset.checksum === `sha256:${hash(originalBytes)}` &&
        asset.width === 1200 &&
        asset.height === 800,
    )
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    await context.tracing.start({ screenshots: true, snapshots: true })
    await context.addCookies([{ name: 'renegade-passkey', value: cookie.split('=')[1], url: base }])
    const tab = await context.newPage()
    tab.setDefaultTimeout(30000)
    tab.on('response', (r) => {
      if (r.url().includes('/api/media') || r.url().includes('/media/'))
        network.push({ method: r.request().method(), url: r.url(), status: r.status() })
    })
    await tab.goto(`${base}/admin/media-library?siteId=${site.id}`, { timeout: 180000 })
    const assetsTab = tab.getByRole('button', { name: /Assets \(/ })
    if (await assetsTab.count()) await assetsTab.click()
    const open = async (title: string) => {
      await tab
        .locator('tr', { hasText: title })
        .getByRole('button', { name: 'Edit Image' })
        .click()
      await expect(tab.getByRole('button', { name: 'Save version', exact: true })).toBeEnabled({
        timeout: 45000,
      })
      const frame = await tab.locator('iframe[title="miniPaint Editor"]').elementHandle()
      return (await frame!.contentFrame())!
    }
    let frame = await open(asset.title)
    check(
      'miniPaint opens uploaded dimensions',
      await frame.evaluate(() => {
        const w = window as any
        return w.Layers.get_dimensions().width === 1200 && w.Layers.get_dimensions().height === 800
      }),
    )
    await writeFile(
      `${out}/editor-controls.json`,
      JSON.stringify(
        await frame.locator('button,a,input').evaluateAll((els) =>
          els.map((e) => ({
            tag: e.tagName,
            title: e.getAttribute('title'),
            id: e.id,
            text: e.textContent?.slice(0, 70),
          })),
        ),
        null,
        2,
      ),
    )
    // Change the actual miniPaint layer rotation through its visible native control.
    await frame.locator('#detail_rotate').fill('15')
    await frame.locator('#detail_rotate').press('Tab')
    await expect(tab.getByText('Unsaved edits', { exact: true })).toBeVisible()
    await tab.screenshot({ path: `${out}/editor.png`, fullPage: true })
    await tab.getByLabel('Filename', { exact: true }).fill(`05C edited ${stamp}`)
    await tab.getByRole('button', { name: 'Save version', exact: true }).click()
    await expect(
      tab.getByRole('heading', { name: `Editing: ${asset.title}`, exact: true }),
    ).not.toBeVisible({ timeout: 45000 })
    const original = await record('media-assets', asset.id),
      edited = await record('media-assets', original.replaceGloballyWith)
    const editedBytes = (await mediaStorage(loadConfig()).get(edited.storageLocation))!
    check(
      'editor version changes actual bytes',
      edited.checksum !== asset.checksum && edited.checksum === `sha256:${hash(editedBytes)}`,
    )
    check(
      'source original bytes preserved',
      hash((await mediaStorage(loadConfig()).get(original.storageLocation))!) ===
        hash(originalBytes),
    )
    check(
      'version inherits rights and consent',
      edited.consentReference === '05C-local-consent' &&
        edited.creatorCredit === '05C Photographer',
    )
    await tab.getByRole('button', { name: 'Refresh', exact: true }).click()
    frame = await open(edited.title)
    await tab.getByLabel(/^Save as/).selectOption('new-asset')
    await tab.getByLabel('Filename', { exact: true }).fill(`05C copy ${stamp}`)
    await context.clearCookies()
    await tab.getByRole('button', { name: 'Save As', exact: true }).click()
    await expect(
      tab.getByRole('status').filter({ hasText: 'Staff access is required.' }),
    ).toBeVisible()
    check(
      'permission failure keeps editor open for retry',
      await tab.getByRole('button', { name: 'Save As', exact: true }).isVisible(),
    )
    await context.addCookies([{ name: 'renegade-passkey', value: cookie.split('=')[1], url: base }])
    await tab.getByRole('button', { name: 'Save As', exact: true }).click()
    await expect(
      tab.getByRole('heading', { name: `Editing: ${edited.title}`, exact: true }),
    ).not.toBeVisible({ timeout: 45000 })
    const copies = await payload.find({
      collection: 'media-assets',
      where: { title: { equals: `05C copy ${stamp}` } },
      depth: 0,
    })
    const copy = copies.docs[0] as any
    check(
      'save-as copy preserves governance without changing source link',
      copy?.consentReference === edited.consentReference &&
        !(await record('media-assets', edited.id)).replaceGloballyWith,
    )
    const versions = await payload.find({
      collection: 'media-asset-versions',
      where: { asset: { equals: copy.id } },
      depth: 0,
    })
    check(
      'save-as copy has canonical provenance',
      versions.docs.some((v: any) => v.mode === 'new-asset' && v.replacesAsset === edited.id),
    )
    await tab.getByRole('button', { name: 'Refresh', exact: true }).click()
    frame = await open(copy.title)
    await frame.locator('#detail_rotate').fill('30')
    await frame.locator('#detail_rotate').press('Tab')
    await expect(tab.getByText('Unsaved edits', { exact: true })).toBeVisible()
    await tab.getByRole('button', { name: /Back to Media/ }).click()
    await expect(tab.getByRole('alertdialog')).toBeVisible()
    await tab.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await tab.getByRole('button', { name: /Back to Media/ }).click()
    await tab.getByRole('button', { name: 'Discard edits', exact: true }).click()
    check(
      'cancel leaves persisted copy unchanged',
      (await record('media-assets', copy.id)).checksum === copy.checksum,
    )
    await context.route(`**/media/${copy.id}`, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: 'corrupt image' }),
    )
    await tab
      .locator('tr', { hasText: copy.title })
      .getByRole('button', { name: 'Edit Image' })
      .click()
    await expect(
      tab.getByRole('status').filter({ hasText: 'Failed to load CMoS asset bytes' }),
    ).toBeVisible({ timeout: 30000 })
    await expect(tab.getByRole('button', { name: 'Save version', exact: true })).toBeDisabled()
    check(
      'bad source bytes cannot save a blank editor canvas',
      (await record('media-assets', copy.id)).checksum === copy.checksum,
    )
    await tab.screenshot({ path: `${out}/bad-source.png`, fullPage: true })
    await tab.getByRole('button', { name: /Back to Media/ }).click()
    await context.unroute(`**/media/${copy.id}`)
    const before = await payload.count({ collection: 'media-assets' })
    for (const [label, auth, siteId, bytes, status] of [
      ['anonymous', '', site.id, originalBytes, 403],
      ['foreign role', foreign, site.id, originalBytes, 403],
      ['forged site', cookie, beta.id, originalBytes, 403],
      ['bad format', cookie, site.id, Buffer.from('bad image'), 400],
      ['stale editor', cookie, site.id, originalBytes, 409],
    ] as const) {
      const target = label === 'stale editor' ? original.id : copy.id
      const r = await api(`/api/media/${target}`, auth, 'PUT', form(siteId, bytes))
      check(`${label} refused`, r.status === status)
    }
    check(
      'denied saves create no assets',
      (await payload.count({ collection: 'media-assets' })).totalDocs === before.totalDocs,
    )
    const raceSource = (
      await json('/api/media/upload', cookie, 'POST', form(site.id, originalBytes), 201)
    ).asset
    const races = await Promise.all([
      api(`/api/media/${raceSource.id}`, cookie, 'PUT', form(site.id, originalBytes)),
      api(`/api/media/${raceSource.id}`, cookie, 'PUT', form(site.id, originalBytes)),
    ])
    check(
      'concurrent replacement has one winner and one conflict',
      races
        .map((r) => r.status)
        .sort()
        .join(',') === '201,409',
    )
    const queuedImages = await payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'media-variant-generate' } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    check(
      'each saved editor asset queues exactly one canonical variant job',
      [original, edited, copy].every(
        (a) =>
          queuedImages.docs.filter((job: any) => job.input?.mediaAssetId === a.id).length === 1,
      ),
    )
    await payload.jobs.run({ queue: 'media', limit: 30 })
    const publication = (
      await payload.find({
        collection: 'publications',
        where: { site: { equals: site.id } },
        limit: 1,
      })
    ).docs[0]!
    const content = (
      await json(
        '/api/content',
        cookie,
        'POST',
        {
          site: site.id,
          publication: publication.id,
          title: '05C edited image article',
          slug: `05c-edited-${stamp}`,
          contentType: 'article',
          status: 'draft',
          visibility: 'public',
          heroMedia: original.id,
          body: {
            root: {
              type: 'root',
              version: 1,
              format: '',
              indent: 0,
              direction: 'ltr',
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  format: '',
                  indent: 0,
                  direction: 'ltr',
                  children: [
                    {
                      type: 'text',
                      version: 1,
                      text: '05C edited photograph retained through canonical media references.',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                    },
                  ],
                },
              ],
            },
          },
        },
        201,
      )
    ).doc
    await json(`/api/content/${content.id}`, cookie, 'PATCH', { status: 'published' })
    const article = await record('content', content.id)
    const variants = (
      await json(`/api/media/${edited.id}/variants?siteId=${site.id}`, cookie, 'GET', undefined)
    ).variants
    check(
      'edited asset has ready responsive variants',
      variants.length === 20 && variants.every((v: any) => v.processingState === 'ready'),
    )
    for (const v of variants) {
      const r = await api(v.url),
        bytes = new Uint8Array(await r.arrayBuffer()),
        m = await sharp(bytes).metadata()
      check(
        `public derivative ${v.recipeKey}/${v.format}`,
        r.ok && m.width === v.width && m.height === v.height,
      )
    }
    const publicBytes = await api(`/media/${original.id}`)
    check(
      'public original URL resolves edited bytes',
      publicBytes.ok && hash(new Uint8Array(await publicBytes.arrayBuffer())) === hash(editedBytes),
    )
    const publicTab = await browser.newPage()
    for (const width of [390, 1440]) {
      await publicTab.setViewportSize({ width, height: 900 })
      await publicTab.goto(base + article.canonicalPath, {
        waitUntil: 'networkidle',
        timeout: 180000,
      })
      const img = publicTab.locator('picture img[alt="05C edited photograph"]')
      await expect(img).toBeVisible()
      check(
        `public image decoded at ${width}px`,
        await img.evaluate(
          (i: any) => i.complete && i.naturalWidth > 0 && i.currentSrc.includes('variant='),
        ),
      )
      await publicTab.screenshot({ path: `${out}/article-${width}.png`, fullPage: true })
    }
    await context.tracing.stop({ path: `${out}/browser-trace.zip` })
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          siteId: site.id,
          originalId: original.id,
          editedHash: hash(editedBytes),
          articleId: article.id,
          articlePath: article.canonicalPath,
          assets: [original, edited, copy],
        },
        null,
        2,
      ),
    )
    await writeFile(
      `${out}/journey.json`,
      JSON.stringify({ passed: checks.length, failed: 0, skipped: 0, checks }, null, 2),
    )
  }
} catch (error) {
  await writeFile(
    `${out}/failure.json`,
    JSON.stringify({ passed: checks.length, failed: 1, checks, error: String(error) }, null, 2),
  )
  throw error
} finally {
  await writeFile(
    `${out}/${process.argv.includes('--restart') ? 'restart-network' : 'network'}.json`,
    JSON.stringify(network, null, 2),
  )
  await browser?.close()
  await payload.db.destroy?.()
}
