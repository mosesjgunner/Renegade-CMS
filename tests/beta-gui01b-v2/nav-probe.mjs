/* GUI-03D — open the Payload nav drawer and probe the grouped links.
 * Plain .mjs, string evaluates only (same constraints as capture.mjs). */
import { chromium } from 'playwright-core'
const { readFileSync, mkdirSync, writeFileSync } = await import('node:fs')
const BASE = process.env.GUI01B_BASE
const OUT = process.env.GUI01B_OUT
const session = JSON.parse(readFileSync(process.env.GUI01B_SESSION_FILE, 'utf8'))
mkdirSync(OUT, { recursive: true })
setTimeout(() => process.exit(3), 10 * 60 * 1000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
await page.goto(BASE + '/admin', { timeout: 180000, waitUntil: 'domcontentloaded' })
await sleep(12000)
// Payload's nav toggle: a button in the app header (hamburger).
const clicked = await page.evaluate(`(() => {
  const btns = [...document.querySelectorAll('button')]
  const t = btns.find(b => /nav/i.test(b.getAttribute('aria-label') || '') || b.className.includes('hamburger') || b.className.includes('nav'))
  if (t) { t.click(); return t.getAttribute('aria-label') || t.className }
  return null
})()`)
await sleep(4000)
const probe = await page.evaluate(`(() => {
  const nav = document.querySelector('nav') || document.body
  const summaries = [...nav.querySelectorAll('details > summary')].map(s => s.textContent.trim())
  const detailsCount = nav.querySelectorAll('details').length
  const strongs = [...nav.querySelectorAll('strong')].map(s => s.textContent.trim()).slice(0, 5)
  const ariaCurrent = nav.querySelectorAll('[aria-current]').length
  const links = [...nav.querySelectorAll('a')].map(a => (a.getAttribute('href') || '')).filter(Boolean).slice(0, 40)
  return { summaries, detailsCount, strongs, ariaCurrent, links, navTextStart: (nav.textContent || '').slice(0, 120) }
})()`)
await page.screenshot({
  path: `${OUT}/shell-nav-open-desktop.png`,
  fullPage: true,
  timeout: 120000,
})
writeFileSync(`${OUT}/nav-probe.json`, JSON.stringify({ toggleClicked: clicked, probe }, null, 2))
console.log('toggle:', clicked)
console.log(JSON.stringify(probe, null, 1))
await browser.close().catch(() => {})
process.exit(0)
