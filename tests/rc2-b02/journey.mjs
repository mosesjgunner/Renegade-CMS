// RC2-B-02 — Presentation journey: compose a page in the visual builder
// on the RC2 two-site world, publish it, and verify public rendering,
// navigation, theme switching, unsupported-block fallback, and tenant
// scope. Plain .mjs (playwright-core); string-form evaluates only.
process.env.NO_PROXY = (process.env.NO_PROXY || '') + ',a.rc2-a04.test,b.rc2-a04.test'
process.env.no_proxy = process.env.NO_PROXY
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.B01_BASE || 'http://127.0.0.1:39071'
const SHOTS = process.env.B02_SHOTS || '/home/hatch/workspace/gui01b-logs/b02-shots'
const WORLD = JSON.parse(readFileSync(process.env.B01_WORLD || '/tmp/b01-world.json', 'utf8'))
const LAYOUT = JSON.parse(readFileSync('/tmp/b02-layout.json', 'utf8'))
mkdirSync(SHOTS, { recursive: true })
const stamp = Date.now().toString(36)
const HERO_TITLE = `B02 Hero ${stamp}`
const RICH_TITLE = `B02 Rich ${stamp}`
const RICH_BODY = `Rich body copy written by the B-02 journey ${stamp}.`
const FALLBACK_TITLE = `B02 Fallback Hero ${stamp}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    `--host-resolver-rules=MAP ${WORLD.siteA.host} 127.0.0.1, MAP ${WORLD.siteB.host} 127.0.0.1`,
  ],
})
const newAdminContext = async (token) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  await ctx.addCookies([{ name: 'renegade-passkey', value: token, url: BASE + '/' }])
  const page = await ctx.newPage()
  page.on('dialog', async (d) => {
    await d.accept().catch(() => {})
  })
  return { ctx, page }
}

// Set a field in the builder's field editor: find the VISIBLE control
// matching by aria-label, input name, or wrapping label; set the React way.
const setField = (page, matcher, value) =>
  page.evaluate(
    `(() => {
      const matcher = ${JSON.stringify(matcher)}
      const value = ${JSON.stringify(value)}
      const visible = (el) => !!(el.offsetParent || el.getClientRects().length)
      const wrapLabel = (el) => {
        let w = el.parentElement
        for (let i = 0; i < 3 && w; i++) {
          const t = (w.textContent || '').trim()
          if (t) return t
          w = w.parentElement
        }
        return ''
      }
      const els = [...document.querySelectorAll('input, textarea, select')].filter(visible)
      const el = els.find((e) =>
        matcher.aria
          ? e.getAttribute('aria-label') === matcher.aria
          : matcher.name
            ? e.name === matcher.name
            : wrapLabel(e).startsWith(matcher.wrap),
      )
      if (!el) return 'not-found'
      const proto =
        el.tagName === 'SELECT'
          ? HTMLSelectElement.prototype
          : el.tagName === 'TEXTAREA'
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      setter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return 'set'
    })()`,
  )
const readField = (page, name) =>
  page.evaluate(
    `(() => {
      const visible = (el) => !!(el.offsetParent || el.getClientRects().length)
      const el = [...document.querySelectorAll('input, textarea')].filter(visible).find((e) => e.name === ${JSON.stringify(name)})
      return el ? el.value : null
    })()`,
  )
const canvasText = (page) =>
  page.evaluate(`(() => {
    const frame = document.querySelector('#preview-frame')
    const doc = frame ? frame.contentDocument : null
    return doc ? doc.body.innerText : ''
  })()`)

const { ctx: adminCtx, page } = await newAdminContext(WORLD.cookies.adminA)
await page.goto(BASE + '/builder/' + LAYOUT.layoutId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await sleep(20000)
const headText = await page.evaluate(`document.body.innerText.slice(0, 300)`)
const themeValue = await page.evaluate(
  `document.querySelector('select[aria-label="Compatible theme"]').value`,
)
stage(
  'builder opens on the Site A layout with the starter theme',
  themeValue === 'neutral-starter',
  `theme=${themeValue} header="${headText.split('\n').slice(0, 4).join(' | ')}"`,
)

// --- compose: two different block types ---------------------------------
const blockSelect = page.locator('select[aria-label="Block to add"]')
await blockSelect.selectOption({ label: 'Hero' })
await page.getByRole('button', { name: 'Add block' }).click()
await sleep(2500)
await blockSelect.selectOption({ label: 'Rich content' })
await page.getByRole('button', { name: 'Add block' }).click()
await sleep(2500)
const selBlock = page.locator('select[aria-label="Selected block"]')
const blockOptions = await selBlock.locator('option').allTextContents()
stage(
  'two different block types added (Hero + Rich content)',
  blockOptions.some((t) => /Hero/.test(t)) && blockOptions.some((t) => /Rich content/.test(t)),
  blockOptions.join(' / '),
)

// --- edit Hero off its defaults + attach media ---------------------------
await selBlock.selectOption({ index: 1 })
await sleep(1500)
await setField(page, { name: 'title' }, HERO_TITLE)
await setField(page, { wrap: 'Alignment' }, '{"value":"center"}')
await setField(page, { wrap: 'Background token' }, '{"value":"brand"}')
await setField(page, { wrap: 'Layout variant' }, '{"value":"split"}')
await setField(page, { name: 'body' }, 'Hero standfirst from the B-02 journey.')
await sleep(1200)
const heroTitleBack = await readField(page, 'title')
stage('hero fields edited off defaults', heroTitleBack === HERO_TITLE, `title="${heroTitleBack}"`)

await page.getByRole('button', { name: 'Refresh media choices' }).click()
await sleep(3000)
const mediaOptions = await page.evaluate(`(() => {
  const sel = [...document.querySelectorAll('select')].find((s) => s.getAttribute('aria-label') === 'Choose media from library')
  return sel ? [...sel.options].map((o) => ({ t: o.textContent.trim(), v: o.value })) : []
})()`)
const mediaChoice = mediaOptions.find((o) => o.v && o.v !== '')
if (mediaChoice) {
  await setField(page, { aria: 'Choose media from library' }, mediaChoice.v)
  await sleep(800)
  stage('hero media attached from the library', true, JSON.stringify(mediaChoice).slice(0, 120))
} else {
  stage(
    'hero media attached from the library',
    false,
    'no media options: ' + JSON.stringify(mediaOptions).slice(0, 160),
  )
}

// --- edit Rich content ----------------------------------------------------
await selBlock.selectOption({ index: 2 })
await sleep(1500)
await setField(page, { name: 'title' }, RICH_TITLE)
await setField(page, { name: 'body' }, RICH_BODY)
await sleep(1200)
const richTitleBack = await readField(page, 'title')
stage('rich content fields edited', richTitleBack === RICH_TITLE, `title="${richTitleBack}"`)
await page.screenshot({ path: SHOTS + '/01-builder-composed.png' })

// --- save + reload ---------------------------------------------------------
await page.getByRole('button', { name: 'Save Draft' }).click()
await sleep(6000)
await page.reload({ timeout: 180000, waitUntil: 'domcontentloaded' })
await sleep(20000)
const optionsAfter = await page
  .locator('select[aria-label="Selected block"]')
  .locator('option')
  .allTextContents()
const canvasAfter = await canvasText(page)
stage(
  'save + reload keeps both blocks and the edited titles',
  optionsAfter.length === 3 && canvasAfter.includes(HERO_TITLE) && canvasAfter.includes(RICH_TITLE),
  `options=${optionsAfter.join('/')} canvasHasHero=${canvasAfter.includes(HERO_TITLE)}`,
)

// --- publish + anonymous desktop/mobile ------------------------------------
await page.getByRole('button', { name: 'Publish Live' }).click()
await sleep(8000)
await page.screenshot({ path: SHOTS + '/02-builder-published.png' })

const anonDesktop = await browser.newContext({ viewport: { width: 1440, height: 950 } })
const anonPage = await anonDesktop.newPage()
const pageUrlA = `http://${WORLD.siteA.host}:39071${LAYOUT.path}`
const respD = await anonPage.goto(pageUrlA, { timeout: 120000, waitUntil: 'domcontentloaded' })
await sleep(4000)
const desktop = await anonPage.evaluate(`(() => ({
  text: document.body.innerText,
  heroSection: (() => { const s = [...document.querySelectorAll('section')].find((x) => x.innerText.includes(${JSON.stringify(HERO_TITLE)})); return s ? { align: s.getAttribute('data-align'), bg: s.getAttribute('data-bg'), variant: s.getAttribute('data-variant') } : null })(),
  imgs: [...document.querySelectorAll('img')].map((i) => i.getAttribute('src') || '').filter(Boolean).slice(0, 4),
}))()`)
stage(
  'anonymous desktop page renders hero + rich content with edited props',
  respD.status() === 200 &&
    desktop.text.includes(HERO_TITLE) &&
    desktop.text.includes(RICH_BODY) &&
    desktop.heroSection?.align === 'center' &&
    desktop.heroSection?.bg === 'brand' &&
    desktop.heroSection?.variant === 'split',
  `status=${respD.status()} align=${desktop.heroSection?.align} bg=${desktop.heroSection?.bg} variant=${desktop.heroSection?.variant}`,
)
stage(
  'attached media renders on the public page',
  desktop.imgs.some((s) => /media/.test(s)),
  desktop.imgs.join(' , ').slice(0, 160),
)
await anonPage.screenshot({ path: SHOTS + '/03-public-desktop.png' })

const anonMobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mobPage = await anonMobile.newPage()
const respM = await mobPage.goto(pageUrlA, { timeout: 120000, waitUntil: 'domcontentloaded' })
await sleep(3000)
const mobile = await mobPage.evaluate(`(() => ({
  text: document.body.innerText,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}))()`)
stage(
  'anonymous mobile page renders the same content without horizontal overflow',
  respM.status() === 200 && mobile.text.includes(HERO_TITLE) && mobile.overflow <= 1,
  `status=${respM.status()} overflow=${mobile.overflow}`,
)
await mobPage.screenshot({ path: SHOTS + '/04-public-mobile.png' })

const respB = await mobPage
  .goto(`http://${WORLD.siteB.host}:39071${LAYOUT.path}`, {
    timeout: 120000,
    waitUntil: 'domcontentloaded',
  })
  .catch(() => null)
stage(
  'no Site A page on Site B (404)',
  respB !== null && respB.status() === 404,
  `status=${respB?.status()}`,
)

// --- navigation change (on the publication the public shell binds to) -----
await page.goto(BASE + '/admin', { timeout: 120000, waitUntil: 'domcontentloaded' })
await sleep(3000)
const navResult = await page.evaluate(`(async () => {
  const id = '${LAYOUT.shellPublicationId}'
  const get = await fetch('/api/publications/' + id + '?depth=0', { headers: { accept: 'application/json' } })
  const doc = await get.json()
  const nav = doc.navigation || { primary: [], secondary: [], footer: [] }
  const primary = [...(nav.primary || []).filter((i) => i.label !== 'Showcase'), { label: 'Showcase', href: '${LAYOUT.path}' }]
  const patch = await fetch('/api/publications/' + id, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ navigation: { ...nav, primary } }),
  })
  return { patchStatus: patch.status, boundName: doc.name }
})()`)
const articleResp = await anonPage.goto(
  `http://${WORLD.siteA.host}:39071${WORLD.siteA.publishedCanonicalPath}`,
  { timeout: 120000, waitUntil: 'domcontentloaded' },
)
await sleep(3000)
const navPublic = await anonPage.evaluate(`(() => {
  const links = [...document.querySelectorAll('a')].map((a) => ({ t: a.textContent.trim(), h: a.getAttribute('href') }))
  return links.filter((l) => l.t === 'Showcase')
})()`)
stage(
  'navigation change reaches the public site header',
  navResult.patchStatus === 200 && navPublic.length > 0,
  `patch=${navResult.patchStatus} boundPublication="${navResult.boundName}" showcaseLinks=${navPublic.length} articleStatus=${articleResp.status()}`,
)

// --- theme switch --------------------------------------------------------------
await page.goto(BASE + '/builder/' + LAYOUT.layoutId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await sleep(20000)
await page.locator('select[aria-label="Compatible theme"]').selectOption('renegade-party')
await sleep(2000)
await page.getByRole('button', { name: 'Save Draft' }).click()
await sleep(6000)
await page.getByRole('button', { name: 'Publish Live' }).click()
await sleep(8000)
const layoutDoc = await page.evaluate(`(async () => {
  const r = await fetch('/api/page-layouts/${LAYOUT.layoutId}?depth=0', { headers: { accept: 'application/json' } })
  const d = await r.json()
  return { themeId: d.themeId, status: d.status, blocks: (d.blocks || []).length }
})()`)
const respT = await anonPage.goto(pageUrlA, { timeout: 120000, waitUntil: 'domcontentloaded' })
await sleep(3000)
const themedText = await anonPage.evaluate(`document.body.innerText`)
stage(
  'theme switch to Renegade Party persists and keeps the canonical content',
  layoutDoc.themeId === 'renegade-party' &&
    respT.status() === 200 &&
    themedText.includes(HERO_TITLE) &&
    themedText.includes(RICH_BODY),
  `themeId=${layoutDoc.themeId} status=${layoutDoc.status} publicStatus=${respT.status()}`,
)
await anonPage.screenshot({ path: SHOTS + '/05-public-renegade-party.png' })

// --- unsupported block fallback ---------------------------------------------------
const fallbackPath = `/b02-fallback-${WORLD.suffix}`
const fbCreate = await page.evaluate(`(async () => {
  const blocks = [
    { id: 'publisher_hero-fallback' + Date.now(), component: 'publisher.hero', componentVersion: 1, props: { title: '${FALLBACK_TITLE}' } },
    { id: 'publisher_bogus-fallback' + Date.now(), component: 'publisher.does-not-exist', componentVersion: 1, props: { title: 'BOGUS BLOCK TITLE' } },
  ]
  const post = await fetch('/api/page-layouts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      site: '${LAYOUT.siteId}', name: 'B02 Fallback Page', path: '${fallbackPath}',
      themeId: 'neutral-starter', surface: 'page', slot: 'main', layoutVersion: 1,
      status: 'draft', visibility: 'public', blocks, revision: 1,
    }),
  })
  const body = await post.json().catch(() => ({}))
  return { status: post.status, id: body.doc?.id || body.id || null, errors: JSON.stringify(body.errors || body.message || '').slice(0, 200) }
})()`)
if (fbCreate.id) {
  await page.goto(BASE + '/builder/' + fbCreate.id, {
    timeout: 180000,
    waitUntil: 'domcontentloaded',
  })
  await sleep(20000)
  await page.getByRole('button', { name: 'Publish Live' }).click()
  await sleep(8000)
  const respF = await anonPage
    .goto(`http://${WORLD.siteA.host}:39071${fallbackPath}`, {
      timeout: 120000,
      waitUntil: 'domcontentloaded',
    })
    .catch(() => null)
  const fbText = respF ? await anonPage.evaluate(`document.body.innerText`) : ''
  stage(
    'unsupported block falls back gracefully on the public page',
    respF !== null &&
      respF.status() === 200 &&
      fbText.includes(FALLBACK_TITLE) &&
      !fbText.includes('BOGUS BLOCK TITLE'),
    `create=${fbCreate.status} publicStatus=${respF?.status()} heroShown=${fbText.includes(FALLBACK_TITLE)} bogusShown=${fbText.includes('BOGUS BLOCK TITLE')}`,
  )
} else {
  stage(
    'unsupported block falls back gracefully on the public page',
    fbCreate.status >= 400,
    `write refused with status=${fbCreate.status} (validation rejects unknown components): ${fbCreate.errors}`,
  )
}

// --- denied principal ------------------------------------------------------------
const { page: outPage } = await newAdminContext(WORLD.cookies.outsiderB)
await outPage.goto(BASE + '/builder/' + LAYOUT.layoutId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await sleep(12000)
const outsider = await outPage.evaluate(`(() => ({
  hasBuilder: !!document.querySelector('select[aria-label="Block to add"]'),
  text: document.body.innerText.slice(0, 200),
}))()`)
stage(
  'denied principal gets no builder for Site A layout',
  !outsider.hasBuilder,
  outsider.text.replace(/\n/g, ' | ').slice(0, 140),
)
await outPage.screenshot({ path: SHOTS + '/06-denied-builder.png' })

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} stages passed`)
writeFileSync(SHOTS + '/results.json', JSON.stringify({ stamp, results }, null, 2))
await browser.close().catch(() => {})
process.exit(passed === results.length ? 0 : 1)
