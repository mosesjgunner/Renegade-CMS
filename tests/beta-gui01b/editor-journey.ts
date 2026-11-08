/* eslint-disable @typescript-eslint/no-explicit-any -- isolated acceptance harness */
// BETA GUI-01B Pass 1 harness: authenticated publishing-editor inspection.
// Local disposable DB + fixture owner only (passkey session pattern from the
// RC1 14A closure). Usage:
//   node --import tsx tests/beta-gui01b/editor-journey.ts <before|after>
// Env (via with-env): DATABASE_URL -> gui01b_release_acceptance,
// APP_URL -> http://localhost:39061, GUI01B_HARNESS=yes.
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { openSync } from 'node:fs'
import { cp, mkdir, writeFile } from 'node:fs/promises'
import { chromium, type Page } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { fixtureRichText } from '../helpers/fixture-rich-text'

const mode = process.argv[2]
assert.ok(mode === 'before' || mode === 'after', 'mode must be before|after')
assert.equal(process.env.GUI01B_HARNESS, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith('/gui01b_release_acceptance'), 'disposable DB guard')

const outDir = `docs/beta/evidence/GUI-01B/${mode}`
const base = 'http://localhost:39061'
const port = '39061'
const trace: Array<{ name: string; pass: boolean; detail?: string }> = []
const check = (name: string, value: unknown, detail?: string) => {
  trace.push({ name, pass: Boolean(value), detail })
  console.log(`${value ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`)
}
const step = (name: string) => console.log(`STEP: ${name}`)
const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
  ])
await mkdir(outDir, { recursive: true })
const externalServer = process.env.GUI01B_EXTERNAL_SERVER === '1'
// Hard watchdog: never hang a run (dev-server deaths previously left the
// harness waiting on dead pages until an operator noticed).
setTimeout(() => {
  console.log('WATCHDOG: hard exit')
  writeFile(`${outDir}/trace.json`, JSON.stringify(trace, null, 2)).finally(() => process.exit(2))
}, 1500000)
const payload: any = await getPayload({ config })

// ---------- fixture seed (idempotent by slug/email) ----------
const existingSite = await payload.find({
  collection: 'sites',
  where: { slug: { equals: 'gui01b' } },
  limit: 1,
  overrideAccess: true,
})
const site =
  existingSite.docs[0] ??
  (await payload.create({
    collection: 'sites',
    data: { name: 'GUI01B Site', slug: 'gui01b', lifecycle: 'active' },
    overrideAccess: true,
  }))
const existingUser = await payload.find({
  collection: 'users',
  where: { email: { equals: 'owner@gui01b.test' } },
  limit: 1,
  overrideAccess: true,
})
const ownerUser =
  existingUser.docs[0] ??
  (await payload.create({
    collection: 'users',
    data: { email: 'owner@gui01b.test', role: 'owner' },
    overrideAccess: true,
  }))
const grants = await payload.find({
  collection: 'member-site-roles',
  where: { and: [{ site: { equals: site.id } }] },
  limit: 5,
  overrideAccess: true,
})
if (!grants.docs.length) {
  await payload.create({
    collection: 'member-site-roles',
    data: {
      member: String(ownerUser.member?.id ?? ownerUser.member),
      site: site.id,
      role: 'contributor',
    },
    overrideAccess: true,
  })
}
await payload.updateGlobal({
  slug: 'site-settings',
  data: {
    canonicalOrigin: base,
    canonicalOriginsBySite: { [site.id]: base },
    launchState: 'live',
  },
  overrideAccess: true,
})
const existingArticle = await payload.find({
  collection: 'content',
  where: { slug: { equals: 'gui01b-seeded-article' } },
  limit: 1,
  overrideAccess: true,
})
const article =
  existingArticle.docs[0] ??
  (await payload.create({
    collection: 'content',
    data: {
      site: site.id,
      contentType: 'article',
      title: 'Seeded GUI01B Article',
      slug: 'gui01b-seeded-article',
      body: fixtureRichText('Seeded article body paragraph for the editor inspection.'),
      status: 'draft',
      visibility: 'public',
      commentsPolicy: 'open',
      publicChangeHistoryPolicy: 'summary',
    },
    overrideAccess: true,
  }))

// ---------- passkey session ----------
const sessionValue = await createPasskeySession(
  ownerUser,
  process.env.PAYLOAD_SECRET!,
  async (id, expires) => {
    await payload.db.pool.query(
      'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING',
      [id, ownerUser.id, expires],
    )
  },
)

// ---------- web server (next dev, dedicated dist dir) ----------
let web: ChildProcess | undefined
const stopWeb = async () => {
  if (!web?.pid) return
  try {
    process.kill(-web.pid, 'SIGTERM')
  } catch {}
  await new Promise((r) => setTimeout(r, 2000))
  try {
    process.kill(-web.pid, 'SIGKILL')
  } catch {}
  web = undefined
}
if (!externalServer)
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      port,
    ],
    {
      env: {
        ...process.env,
        RENEGADE_NEXT_DIST_DIR: '.next-gui01b',
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_OPTIONS: '--max-old-space-size=6144',
      },
      detached: true,
      stdio: ['ignore', openSync(`${outDir}/web.log`, 'a'), openSync(`${outDir}/web.log`, 'a')],
    },
  )
const deadline = Date.now() + (externalServer ? 60000 : 420000)
let ready = false
while (Date.now() < deadline) {
  try {
    if ((await fetch(`${base}/api/users/me`)).status < 500) {
      ready = true
      break
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 1000))
}
assert.ok(ready, 'web readiness')

const browser = await chromium.launch({ headless: true })
const shotDir = `/tmp/gui01b-shots/${mode}`
await mkdir(shotDir, { recursive: true })
const shot = async (name: string, target: Page, fullPage = true) => {
  step(`screenshot ${name}`)
  // Captures land in /tmp during the run: writing into the watched source
  // tree mid-run triggers dev-server Fast Refresh rebuilds that wedge the
  // page. They are copied into the evidence directory when the run ends.
  await withTimeout(
    target.screenshot({ path: `${shotDir}/${name}.png`, fullPage }),
    90000,
    name,
  ).catch((e) => console.log(`screenshot ${name} failed: ${e.message}`))
}
const contexts: Array<{ close: () => Promise<void> }> = []
const newAuthedPage = async (viewport: { width: number; height: number }, colorScheme?: 'dark') => {
  const ctx = await browser.newContext({
    viewport,
    ...(colorScheme ? { colorScheme } : {}),
  })
  ctx.setDefaultTimeout(120000)
  await ctx.addCookies([{ name: 'renegade-passkey', value: sessionValue.token, url: base }])
  contexts.push(ctx)
  const page = await ctx.newPage()
  page.on('crash', () => console.log('PAGE CRASH event'))
  return page
}
const openEditor = async (page: Page, url: string) => {
  await page.goto(url, { timeout: 300000, waitUntil: 'domcontentloaded' })
  await page.locator('#field-title').waitFor({ state: 'visible', timeout: 240000 })
  await page.waitForTimeout(2500)
}

try {
  const page = await newAuthedPage({ width: 1440, height: 950 })

  // ---------- create view (article) ----------
  step('goto create view')
  await openEditor(page, `${base}/admin/collections/content/create?contentType=article`)
  await shot('create-article-desktop', page)
  check('create view renders an editor form', await page.locator('form').first().isVisible())
  check(
    'new document does not falsely report autosave before first save',
    (await page.getByText('Draft saved automatically').count()) === 0,
  )

  step('geometry')
  const evaluateGeometry = () =>
    withTimeout(
      page.evaluate(() => {
        const top = (el: Element | null) =>
          el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null
        const inSidebar = (el: Element | null) =>
          Boolean(el?.closest('.document-fields__sidebar-fields, [class*="sidebar-fields"]'))
        return {
          title: top(document.getElementById('field-title')),
          body: top(document.querySelector('.field-type.rich-text-lexical')),
          site: top(document.getElementById('field-site')),
          siteInSidebar: inSidebar(document.getElementById('field-site')),
          statusInSidebar: inSidebar(document.getElementById('field-status')),
          hasSidebar: Boolean(
            document.querySelector('.document-fields__sidebar-fields, [class*="sidebar-fields"]'),
          ),
          titleInputFontPx: (() => {
            const input = document.getElementById('field-title')
            return input ? Math.round(parseFloat(getComputedStyle(input).fontSize)) : null
          })(),
          editableMinHeight: (() => {
            const ed = document.querySelector('.ContentEditable__root')
            return ed ? Math.round(ed.getBoundingClientRect().height) : null
          })(),
        }
      }),
      45000,
      'geometry evaluate',
    )
  const geometry = await evaluateGeometry().catch(async () => {
    console.log('geometry evaluate timed out once; retrying after settle')
    await page.waitForTimeout(5000)
    return evaluateGeometry()
  })
  console.log('GEOMETRY', JSON.stringify(geometry))
  if (mode === 'before') {
    check(
      'baseline: administrative fields precede the headline (Writing tab order)',
      geometry.site !== null && geometry.title !== null && geometry.site < geometry.title,
      `site@${geometry.site} title@${geometry.title}`,
    )
  }
  if (mode === 'after') {
    check(
      'Gate A: headline is identifiable above the writing canvas',
      geometry.title !== null && geometry.body !== null && geometry.title < geometry.body,
      `title@${geometry.title} body@${geometry.body}`,
    )
    check(
      'Phase 4: headline input renders at headline scale (>= 24px)',
      (geometry.titleInputFontPx ?? 0) >= 24,
      `font=${geometry.titleInputFontPx}px`,
    )
    check(
      'Phase 4: writing canvas has writing-room height (>= 300px)',
      (geometry.editableMinHeight ?? 0) >= 300,
      `height=${geometry.editableMinHeight}px`,
    )
    check(
      'Phase 2: identity/publishing essentials live in the sidebar',
      geometry.hasSidebar && geometry.siteInSidebar && geometry.statusInSidebar,
    )
    const settingsLabels = [
      'Article details and classification',
      'Authors and attribution',
      'Media and featured image',
      'SEO and discovery',
      'URL and page configuration',
      'Publishing and visibility',
      'Advanced settings and technical metadata',
    ]
    for (const label of settingsLabels) {
      check(`Gate B: settings group present: ${label}`, (await page.getByText(label).count()) > 0)
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    check('no horizontal page overflow at 1440px', overflow <= 1, `overflow=${overflow}`)

    // ----- writing flow through the real form -----
    step('writing flow')
    // Site (sidebar relationship select): choose the fixture site if unset.
    const siteField = page.locator('#field-site')
    if ((await siteField.locator('.rs__single-value').count()) === 0) {
      await siteField.locator('.rs__control').first().click()
      await page
        .locator('.rs__option', { hasText: 'GUI01B Site' })
        .first()
        .click({ timeout: 30000 })
        .catch(() => {})
      await page.waitForTimeout(800)
    }
    // Content type (sidebar select): ContentTypeEntry normally applies the
    // ?contentType=article preset; fall back to the select UI when needed.
    const typeField = page.locator('#field-contentType')
    if ((await typeField.locator('.rs__single-value').count()) === 0) {
      await typeField.locator('.rs__control').first().click()
      await page
        .locator('.rs__option', { hasText: 'article' })
        .first()
        .click({ timeout: 30000 })
        .catch(() => {})
      await page.waitForTimeout(800)
    }
    await page.locator('#field-title').fill('GUI01B Journey Article')
    const editable = page.locator('.ContentEditable__root').first()
    await editable.click()
    await editable.type('Written in the reconstructed editor during GUI-01B verification.')
    await page.getByRole('button', { name: 'Save', exact: true }).first().click()
    await page.waitForURL(/\/admin\/collections\/content\/[0-9a-f-]{36}/, { timeout: 180000 })
    check('Gate C: article created through the UI form and persisted (URL now has doc id)', true)
    await page.waitForTimeout(1500)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('#field-title').waitFor({ state: 'visible', timeout: 240000 })
    await page.waitForTimeout(2500)
    const persistedTitle = await page
      .locator('#field-title input')
      .inputValue()
      .catch(() => '')
    const persistedBody = await page
      .locator('.ContentEditable__root')
      .first()
      .innerText()
      .catch(() => '')
    check(
      'Gate C: title persists after reload',
      persistedTitle === 'GUI01B Journey Article',
      persistedTitle,
    )
    check(
      'Gate C: body persists after reload',
      persistedBody.includes('Written in the reconstructed editor'),
      persistedBody.slice(0, 60),
    )
    await shot('edit-article-desktop', page)

    // ----- collapsed-group validation signalling (slug lives in URL group) -----
    step('collapsed group error signalling')
    const urlHeader = page.getByText('URL and page configuration').first()
    await urlHeader.scrollIntoViewIfNeeded()
    await urlHeader.click()
    await page.waitForTimeout(800)
    const slugInput = page.locator('#field-slug input')
    const originalSlug = await slugInput.inputValue()
    await slugInput.fill('INVALID SLUG')
    await page.getByRole('button', { name: 'Save', exact: true }).first().click()
    await page.waitForTimeout(3000)
    const errorGroups = await page.locator('.collapsible-field--has-error').count()
    check(
      'Gate B: collapsed group containing a validation error is flagged (has-error + pill)',
      errorGroups > 0,
      `errorGroups=${errorGroups}`,
    )
    await shot('edit-article-error-state', page, false)
    await slugInput.fill(originalSlug)

    // ----- page-conditional controls -----
    step('page conditional controls')
    const typeSelect = page.locator('#field-contentType .rs__control')
    await typeSelect.click()
    await page
      .locator('.rs__option', { hasText: 'page' })
      .first()
      .click({ timeout: 30000 })
      .catch(() => {})
    await page.waitForTimeout(1000)
    const templateVisible = await page
      .locator('#field-pageTemplate')
      .isVisible()
      .catch(() => false)
    check('Gate C: page-specific controls appear when content type is Page', templateVisible)
  }

  // ---------- edit view (seeded article), responsive + themes ----------
  step('goto seeded edit view')
  await openEditor(page, `${base}/admin/collections/content/${article.id}`)
  if (mode === 'before') await shot('edit-article-desktop', page)

  try {
    const mobile = await newAuthedPage({ width: 375, height: 800 })
    step('goto mobile create')
    await openEditor(mobile, `${base}/admin/collections/content/create?contentType=article`)
    await shot('create-article-mobile-375', mobile)
    const mobileOverflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    check('no horizontal page overflow at 375px', mobileOverflow <= 1, `overflow=${mobileOverflow}`)
  } catch (e: any) {
    check('mobile 375px inspection completed', false, String(e?.message ?? e).slice(0, 120))
  }

  try {
    const tablet = await newAuthedPage({ width: 768, height: 1000 })
    step('goto tablet edit')
    await openEditor(tablet, `${base}/admin/collections/content/${article.id}`)
    await shot('edit-article-tablet-768', tablet)
  } catch (e: any) {
    check('tablet 768px inspection completed', false, String(e?.message ?? e).slice(0, 120))
  }

  try {
    const dark = await newAuthedPage({ width: 1440, height: 950 }, 'dark')
    step('goto dark edit')
    await openEditor(dark, `${base}/admin/collections/content/${article.id}`)
    const darkAttr = await dark.evaluate(() => document.documentElement.getAttribute('data-theme'))
    check(
      'dark appearance engages (data-theme=dark)',
      darkAttr === 'dark',
      `data-theme=${darkAttr}`,
    )
    await shot('edit-article-dark', dark)
  } catch (e: any) {
    check('dark appearance inspection completed', false, String(e?.message ?? e).slice(0, 120))
  }
} finally {
  await cp(shotDir, outDir, { recursive: true }).catch(() => {})
  await writeFile(`${outDir}/trace.json`, JSON.stringify(trace, null, 2))
  const failed = trace.filter((t) => !t.pass)
  console.log(`HARNESS ${mode}: ${trace.length - failed.length}/${trace.length} checks passed`)
  for (const ctx of contexts) await ctx.close().catch(() => {})
  await browser.close().catch(() => {})
  await stopWeb()
  await (payload as any).db?.pool?.end?.().catch(() => {})
}
process.exit(0)
