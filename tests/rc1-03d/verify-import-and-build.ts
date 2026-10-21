/* eslint-disable @typescript-eslint/no-explicit-any -- isolated supported HTTP acceptance */
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ensureBootstrap, rotateBootstrapToken } from '../../src/modules/operations/installation'
import { loadConfig } from '../../src/modules/core/config'
import { parseWxr } from '../../src/modules/portability/legacy-migration/parser'

assert.equal(process.env.RC1_03D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5465/rc103d_operator_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const base = 'http://localhost:39035'
const out = 'docs/rc/evidence/rc1/18-pass/03D'
const scratch = 'scratch/rc103d-frozen-20261020'
await mkdir(out, { recursive: true })
await mkdir(scratch, { recursive: true })
const payload: any = await getPayload({ config })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext(
  (process.argv.includes('--restart') || process.argv.includes('--continue')) ? { storageState: `${scratch}/session.json` } : {},
)
const page = await context.newPage()
page.setDefaultTimeout(120000)
const trace: any[] = []
page.on('pageerror', (error) => trace.push({ browserError: error.message }))
let checks = 0
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
}
const api = async (route: string, method = 'GET', data?: any, expected = 200) => {
  const response = await context.request.fetch(`${base}${route}`, {
    method,
    data,
    headers: { origin: base },
    timeout: 180000,
    maxRedirects: 0,
  })
  const text = await response.text()
  trace.push({
    method,
    route,
    status: response.status(),
    body: response.status() >= 400 ? text.slice(0, 1800) : undefined,
  })
  assert.equal(response.status(), expected, `${method} ${route}: ${text.slice(0, 3500)}`)
  return { text, json: () => JSON.parse(text), response }
}
const native = async (collection: string, data: any) => {
  if (process.argv.includes('--continue') && collection === 'content') {
    const found = (await api(`/api/content?where[site][equals]=${data.site}&where[slug][equals]=${data.slug}`)).json().docs
    if (found[0]) return found[0]
  }
  return (await api(`/api/${collection}`, 'POST', data, 201)).json().doc
}
const body = (text: string) => ({
  root: {
    type: 'root',
    format: '',
    direction: 'ltr',
    indent: 0,
    version: 1,
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '',
        direction: 'ltr',
        indent: 0,
        children: [
          { type: 'text', text, version: 1, format: 0, detail: 0, mode: 'normal', style: '' },
        ],
      },
    ],
  },
})
const rows = async (collection: string, site: string) =>
  (
    await payload.find({
      collection,
      where: { site: { equals: site } },
      depth: 0,
      pagination: false,
      limit: 0,
    })
  ).docs
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XcAAAAASUVORK5CYII=',
  'base64',
)
let passed = false
try {
  if (process.argv.includes('--restart')) {
    const state = JSON.parse(await readFile(`${scratch}/state.json`, 'utf8'))
    const records = await rows('content', state.site)
    check(
      'restart retains exact canonical content IDs',
      JSON.stringify(records.map((row: any) => row.id).sort()) ===
        JSON.stringify(state.contentIds.sort()),
    )
    check(
      'restart retains imported content count',
      (await rows('content', state.importSite)).length === state.importCount,
    )
    const report = (await api(`/api/migration/legacy/report/${state.runId}`)).json()
    check(
      'restart retains verified migration report',
      report.runId === state.runId && report.stage === state.stage,
    )
    const exported = (await api(`/api/migration/export?siteId=${state.importSite}`)).json().manifest
    check(
      'restart exports original media bytes unchanged',
      exported.media[0].objectData === png.toString('base64'),
    )
    const output = await api('/about-03d')
    check(
      'restart public output retains operator text and navigation',
      output.text.includes('03D operator authored page') && output.text.includes('About 03D'),
    )
  } else {
    if (!process.argv.includes('--continue')) {
    check(
      'fresh database has no sites or content',
      (await payload.count({ collection: 'sites' })).totalDocs === 0 &&
        (await payload.count({ collection: 'content' })).totalDocs === 0,
    )
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0] ?? ''))
    }
    let token = ''
    try {
      await ensureBootstrap(payload, loadConfig())
      if (warnings.length === 0) await rotateBootstrapToken(payload, loadConfig())
      token = warnings.map((line) => line.match(/: ([A-Za-z0-9_-]+)$/)?.[1]).find(Boolean) ?? ''
    } finally {
      console.warn = originalWarn
    }
    assert.equal(token.length, 43, 'one-time installer bootstrap token available')
    const client = await context.newCDPSession(page)
    await client.send('WebAuthn.enable')
    await client.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    })
    await page.goto(`${base}/setup`, { timeout: 180000, waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => Object.keys(document.querySelector('input[type="email"]') ?? {}).some((key) => key.startsWith('__reactProps')), { timeout: 60000 })
    console.log('Installer client hydrated')
    await page.getByLabel('Bootstrap token').click()
    await page.getByLabel('Bootstrap token').fill(token)
    await page.getByLabel('Owner email').click()
    await page.getByLabel('Owner email').fill('owner@rc103d.test')
    console.log('Installer inputs supplied')

    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByLabel('Site or publication name').fill('03D Operator Dispatch')
    await page.getByLabel('Site slug').fill('operator-dispatch-03d')
    await page.getByLabel('Primary URL').fill(base)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByLabel('Starter site type').selectOption('blank-minimal')
    await page.getByText('Create starter pages and sample content', { exact: false }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    const completeResponse = page.waitForResponse((response) => response.url().includes('/api/setup/complete'), { timeout: 180000 })
    await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
    assert.equal((await completeResponse).status(), 201, 'supported installer completion HTTP 201')
    check(
      'ordinary installer completes real virtual WebAuthn ceremony',
      (await context.cookies()).some((cookie) => cookie.name === 'renegade-passkey'),
    )
    // Recovery codes and session cookies remain outside evidence.
    await context.storageState({ path: `${scratch}/session.json` })
    }
    const site = (await api('/api/sites?limit=20'))
      .json()
      .docs.find((row: any) => row.slug === 'operator-dispatch-03d')
    assert.ok(site)
    const home = await native('content', {
      site: site.id,
      contentType: 'page',
      title: '03D Home',
      slug: 'home-03d',
      canonicalPath: '/',
      pathOverride: true,
      body: body('03D operator authored homepage'),
      status: 'published',
    })
    await api('/api/globals/site-settings', 'POST', { homepageSelection: { mode: 'page', page: home.id } })
    const about = await native('content', {
      site: site.id,
      contentType: 'page',
      title: 'About 03D',
      slug: 'about-03d',
      body: body('03D operator authored page'),
      status: 'published',
    })
    const article = await native('content', {
      site: site.id,
      contentType: 'article',
      title: '03D Report',
      slug: 'report-03d',
      body: body('03D operator reporting'),
      status: 'draft',
    })
    await api(`/api/content/${article.id}`, 'PATCH', { status: 'published' })
    const publications = (await api(`/api/publications?where[site][equals]=${site.id}`)).json().docs
    assert.ok(publications[0], 'installer publication exists')
    await api(`/api/publications/${publications[0].id}`, 'PATCH', {
      navigation: {
        primary: [
          { label: 'Home 03D', href: '/' },
          { label: 'About 03D', href: '/about-03d' },
          { label: 'Report 03D', href: '/articles/report-03d' },
        ],
      },
    })
    check(
      'native product API persisted authored pages/article',
      [home.id, about.id, article.id].every((id) => id),
    )
    const output = await api('/about-03d')
    check(
      'public HTTP shows authored page and navigation',
      output.text.includes('03D operator authored page') && output.text.includes('Report 03D'),
    )
    await page.goto(`${base}/about-03d`)
    check(
      'browser renders public navigation target',
      (await page.getByRole('link', { name: 'Report 03D', exact: true }).count()) > 0,
    )
    await page.screenshot({ path: `${out}/public-site.png`, fullPage: true })
    const wxr = await readFile('tests/fixtures/legacy-migration/wordpress-fixture.xml', 'utf8')
    const themeMapping = JSON.parse(
      await readFile('tests/fixtures/legacy-migration/theme-mapping.json', 'utf8'),
    )
    const pkg = {
      wxr,
      themeMapping,
      mediaFiles: { 'tribune-hero.png': { buffer: png, fileName: 'tribune-hero.png' } },
    }
    const options = {
      targetSiteMode: 'new-isolated-site',
      newSiteName: '03D Imported Tribune',
      newSiteSlug: 'imported-tribune-03d',
      remoteMediaDownloadAllowed: false,
    }
    await api('/api/migration/legacy/inspect', 'POST', { wxr: '<<<NOT-XML>>>' }, 422)
    check('malformed import rejected through supported endpoint', true)
    const preflight = (
      await api('/api/migration/legacy/preflight', 'POST', { pkg, options })
    ).json()
    check(
      'dry-run plans content without creating a target site',
      preflight.stage === 'dry-run' &&
        (await payload.count({ collection: 'sites' })).totalDocs === 1,
    )
    const report = (await api('/api/migration/legacy/execute', 'POST', { pkg, options })).json()
    await writeFile(`${out}/import-report.json`, JSON.stringify(report, null, 2))
    check(
      'representative import executes with no errors',
      report.stage === 'imported' && report.errors.length === 0,
    )
    const imported = await rows('content', report.siteId)
    const normalized = parseWxr(wxr)
    check(
      'exact imported content count',
      imported.length ===
        normalized.items.filter((row) => ['post', 'page'].includes(row.postType)).length,
    )
    check(
      'author relationships persisted',
      imported.some((row: any) => row.authors?.length),
    )
    const categories = await rows('categories', report.siteId)
    const child = categories.find((row: any) => row.slug === 'investigative')
    check(
      'taxonomy hierarchy persisted',
      child?.parent === categories.find((row: any) => row.slug === 'news')?.id,
    )
    const assets = await rows('media-assets', report.siteId)
    check(
      'actual imported image blob is persisted',
      assets.length === 1 &&
        assets[0].originalBlob &&
        !assets[0].storageLocation.startsWith('local://'),
    )
    const exported = (await api(`/api/migration/export?siteId=${report.siteId}`)).json().manifest
    check(
      'supported export contains original media bytes',
      exported.media[0].objectData === png.toString('base64'),
    )
    check(
      'export includes mapped authors and revision history',
      ['authors', 'revision-records', 'public-redirects'].every((name) =>
        exported.records.some((record: any) => record.collection === name),
      ),
    )
    check(
      'export excludes operator site content',
      !exported.records.some(
        (record: any) => record.collection === 'content' && record.data.site !== report.siteId,
      ),
    )
    const rerun = (
      await api('/api/migration/legacy/execute', 'POST', {
        pkg,
        options: { targetSiteMode: 'existing-site', targetSiteId: report.siteId },
      })
    ).json()
    check(
      'rerun skips duplicates without creating content or media',
      rerun.reconciliation.skipped > 0 &&
        (await rows('content', report.siteId)).length === imported.length &&
        (await rows('media-assets', report.siteId)).length === 1,
    )
    const reject = (
      await api(
        '/api/migration/legacy/execute',
        'POST',
        {
          pkg,
          options: {
            targetSiteMode: 'existing-site',
            targetSiteId: report.siteId,
            rejectDuplicates: true,
          },
        },
        422,
      )
    ).json()
    check(
      'explicit duplicate rejection returns actionable code',
      reject.errors.some((error: any) => error.code === 'DUPLICATE_ITEM_REJECTED'),
    )
    const verified = (await api(`/api/migration/legacy/verify/${report.runId}`, 'POST')).json()
    check(
      'persisted verification passes all actual checks',
      verified.stage === 'verified' && Object.values(verified.acceptanceChecklist).every(Boolean),
    )
    await api(`/api/migration/legacy/activate/${report.runId}`, 'POST')
    check(
      'activation persisted after successful server verification',
      (await api(`/api/migration/legacy/report/${report.runId}`)).json().stage === 'activated',
    )
    await writeFile(
      `${scratch}/state.json`,
      JSON.stringify(
        {
          site: site.id,
          contentIds: (await rows('content', site.id)).map((row: any) => row.id),
          importSite: report.siteId,
          importCount: imported.length,
          runId: report.runId,
          stage: 'activated',
        },
        null,
        2,
      ),
    )
  }
  passed = true
} catch (error) {
  trace.push({ failure: error instanceof Error ? error.message : String(error) })
  console.error(error)
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {})
  await writeFile(
    `${out}/failure-page.txt`,
    (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    ).replace(/[A-Za-z0-9_-]{43}/g, '[redacted token]'),
  )
  process.exitCode = 1
} finally {
  await writeFile(
    `${out}/${process.argv.includes('--restart') ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify({ checksPassed: checks, failed: passed ? 0 : 1, trace }, null, 2),
  )
  await browser.close()
  await payload.destroy()
  process.exit(process.exitCode ?? 0)
}
