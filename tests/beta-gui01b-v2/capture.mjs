/* GUI-01B (pack) — authenticated visual baseline capture.
 * Plain .mjs on purpose: the tsx transform broke page.evaluate closures
 * during GUI-04A closeout ("__name is not defined"). This runner uses the
 * Playwright library directly (no @playwright/test runner), string-form
 * evaluates only, and a hard watchdog so it can never hang silently.
 * Server: an already-running production build (GUI01B_BASE), because the
 * dev server dies under sustained authenticated load in the Harbor VM.
 * Fixtures + session: seeded over HTTP-free local APIs via a tiny tsx
 * helper (seed.mjs shells to seed.ts through tsx's programmatic API is
 * overkill — instead the runner expects GUI01B_SESSION_FILE, a JSON file
 * { cookieName, token } produced by seed-session.mts run with tsx, which
 * never touches page.evaluate). */
import { chromium } from 'playwright-core'

const BASE = process.env.GUI01B_BASE
const OUT = process.env.GUI01B_OUT
const SESSION_FILE = process.env.GUI01B_SESSION_FILE
if (!BASE || !OUT || !SESSION_FILE) {
  console.error('GUI01B_BASE, GUI01B_OUT, GUI01B_SESSION_FILE are required')
  process.exit(2)
}
const { readFileSync, mkdirSync, writeFileSync } = await import('node:fs')
mkdirSync(OUT, { recursive: true })
const session = JSON.parse(readFileSync(SESSION_FILE, 'utf8'))

setTimeout(
  () => {
    console.error('WATCHDOG: hard exit at 20 min')
    process.exit(3)
  },
  20 * 60 * 1000,
)

const PROBE = `(() => {
  const q = (s) => document.querySelector(s)
  const top = (el) => el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null
  const ti = document.getElementById('field-title')
  const ed = q('.ContentEditable__root')
  return {
    url: location.pathname,
    title: document.title,
    docHeight: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    fieldTitleTop: top(ti),
    fieldTitleFontPx: ti ? Math.round(parseFloat(getComputedStyle(ti).fontSize)) : null,
    bodyTop: top(q('.field-type.rich-text-lexical')),
    editableCount: document.querySelectorAll('.ContentEditable__root').length,
    editableHeight: ed ? Math.round(ed.getBoundingClientRect().height) : null,
    hasSidebar: Boolean(q('.document-fields__sidebar-fields')),
    collapsibles: document.querySelectorAll('.collapsible').length,
    theme: document.documentElement.getAttribute('data-theme'),
  }
})()`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function capturePage(browser, spec, results) {
  const ctx = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    ...(spec.dark ? { colorScheme: 'dark' } : {}),
  })
  ctx.setDefaultTimeout(90000)
  await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
  const page = await ctx.newPage()
  const rec = {
    name: spec.name,
    route: spec.route,
    viewport: `${spec.width}x${spec.height}`,
    theme: spec.dark ? 'dark' : 'light',
  }
  try {
    await page.goto(BASE + spec.route, { timeout: 180000, waitUntil: 'domcontentloaded' })
    if (spec.waitFor)
      await page.locator(spec.waitFor).first().waitFor({ state: 'visible', timeout: 180000 })
    // settle: Lexical mounts lazily; poll the probe until stable or 3 min pass
    let last = ''
    for (let i = 0; i < 12; i++) {
      await sleep(10000)
      const p = await page.evaluate(PROBE).catch(() => null)
      const sig = p ? `${p.docHeight}|${p.editableCount}|${p.fieldTitleTop}` : 'null'
      if (p) rec.probe = p
      if (sig === last && p && (spec.waitFor !== '#field-title' || p.editableCount > 0)) break
      last = sig
    }
    await page.screenshot({ path: `${OUT}/${spec.name}.png`, fullPage: true, timeout: 120000 })
    rec.captured = true
  } catch (e) {
    rec.captured = false
    rec.error = String(e?.message ?? e).slice(0, 300)
  }
  results.push(rec)
  console.log(
    `${rec.captured ? 'CAPTURED' : 'FAILED'}: ${spec.name}${rec.error ? ' — ' + rec.error : ''}`,
  )
  await ctx.close().catch(() => {})
}

const SPECS = JSON.parse(readFileSync(process.env.GUI01B_SPECS, 'utf8'))
const browser = await chromium.launch({ headless: true })
const results = []
for (const spec of SPECS) await capturePage(browser, spec, results)
await browser.close().catch(() => {})
writeFileSync(`${OUT}/captures-raw.json`, JSON.stringify(results, null, 2))
console.log(`DONE: ${results.filter((r) => r.captured).length}/${results.length} captured`)
process.exit(0)
