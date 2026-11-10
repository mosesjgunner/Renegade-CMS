/* GUI-04E — in-editor journey: create → site prefill → type → autosave → reload → history.
 * Plain .mjs, string-form evaluates only (tsx closure rule). Writes journey.json. */
import { chromium } from 'playwright-core'
const { readFileSync, mkdirSync, writeFileSync } = await import('node:fs')
const BASE = process.env.GUI01B_BASE
const OUT = process.env.GUI01B_OUT
const session = JSON.parse(readFileSync(process.env.GUI01B_SESSION_FILE, 'utf8'))
mkdirSync(OUT, { recursive: true })
setTimeout(() => { console.error('WATCHDOG'); process.exit(3) }, 15 * 60 * 1000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const steps = []
const step = (name, ok, detail) => { steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} — ${detail}`) }
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([
  { name: session.cookieName, value: session.token, url: BASE },
  { name: 'renegade-active-site', value: process.env.GUI01B_SITE_ID, url: BASE },
])
const page = await ctx.newPage()
await page.goto(BASE + '/admin/collections/content/create?contentType=article', { timeout: 180000, waitUntil: 'domcontentloaded' })
// 1) wait for the title field and the Lexical editable to actually mount
let mounted = false
for (let i = 0; i < 18 && !mounted; i++) {
  await sleep(10000)
  mounted = await page.evaluate(`!!document.querySelector('.ContentEditable__root') && !!document.getElementById('field-title')`).catch(() => false)
}
step('editor mounts (title + Lexical)', mounted, mounted ? 'both present' : 'not mounted after 3 min')
// 2) site prefill: the sidebar Site relationship shows a selected value before typing
const prefill = await page.evaluate(`(() => {
  const el = document.getElementById('field-site')
  const wrap = el ? el.closest('.field-type, .relationship-field, div') : null
  const text = (wrap?.textContent || '').trim().slice(0, 120)
  const sel = document.querySelector('#field-site input, #field-site [class*=value]')
  return { text, hasValue: !!el && (el.value ? true : /GUI01B Site/i.test(text)) }
})()`).catch(() => ({ text: 'probe error', hasValue: false }))
step('site prefilled from active-site context', !!prefill.hasValue, JSON.stringify(prefill.text))
// 3) type title + body
const TITLE = 'Journey Article — typed live in the editor'
const BODY = 'This paragraph was typed into the Lexical canvas by the GUI-04E journey and must round-trip.'
await page.locator('#field-title').click()
await page.keyboard.type(TITLE)
const ed = page.locator('.ContentEditable__root').first()
await ed.click()
await page.keyboard.type(BODY)
await sleep(500)
// 4) autosave: DraftAutosave should announce saving/saved within ~30s
let autosaveText = ''
for (let i = 0; i < 6; i++) {
  await sleep(6000)
  autosaveText = await page.evaluate(`(document.querySelector('[aria-label="Draft autosave"]')?.textContent || '').trim()`).catch(() => '')
  if (/saved automatically/i.test(autosaveText)) break
}
step('autosave fires and reports', /saved automatically|Unsaved draft changes/i.test(autosaveText), autosaveText.slice(0, 100))
await page.screenshot({ path: `${OUT}/journey-editor-typed.png`, fullPage: true, timeout: 120000 }).catch(() => {})
// 5) reload: title + body must round-trip
await page.reload({ waitUntil: 'domcontentloaded' })
let roundTrip = { title: '', body: '' }
for (let i = 0; i < 12; i++) {
  await sleep(8000)
  roundTrip = await page.evaluate(`(() => ({
    title: document.getElementById('field-title')?.value || '',
    body: document.querySelector('.ContentEditable__root')?.textContent || ''
  }))()`).catch(() => ({ title: '', body: '' }))
  if (roundTrip.title && roundTrip.body) break
}
step('reload round-trips title', roundTrip.title === TITLE, JSON.stringify(roundTrip.title.slice(0, 60)))
step('reload round-trips body', roundTrip.body.includes('typed into the Lexical canvas'), JSON.stringify(roundTrip.body.slice(0, 80)))
await page.screenshot({ path: `${OUT}/journey-editor-reloaded.png`, fullPage: true, timeout: 120000 }).catch(() => {})
// 6) history view for this document — capture whatever state it renders (empty or populated)
const docUrl = page.url()
const docId = (docUrl.match(/content\/([0-9a-f-]{36})/) || [])[1] || ''
if (docId) {
  await page.goto(BASE + `/admin/history?contentId=${docId}`, { timeout: 120000, waitUntil: 'domcontentloaded' })
  await sleep(8000)
  await page.screenshot({ path: `${OUT}/journey-history-view.png`, fullPage: true, timeout: 120000 }).catch(() => {})
  const crumb = await page.evaluate(`(document.querySelector('nav[aria-label="Breadcrumb"]')?.textContent || '').trim()`).catch(() => '')
  step('history view renders with breadcrumb', /History/.test(crumb), crumb.slice(0, 80))
} else {
  step('history view renders with breadcrumb', false, 'no document id in URL after save: ' + docUrl)
}
writeFileSync(`${OUT}/journey.json`, JSON.stringify({ steps }, null, 2))
await browser.close().catch(() => {})
process.exit(steps.every((s) => s.ok) ? 0 : 1)
