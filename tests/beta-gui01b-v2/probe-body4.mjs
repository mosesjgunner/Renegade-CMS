import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
await page.goto(BASE + '/admin/collections/content/' + session.articleId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await new Promise((r) => setTimeout(r, 20000))
const snap1 = await page.evaluate(
  `(() => { const t = document.getElementById('field-title'); const f = t?.closest('form'); return { formBytes: f ? f.innerHTML.length : -1, hasFieldBody: f ? f.innerHTML.includes('field-body') : false, ce: document.querySelectorAll('[contenteditable]').length } })()`,
)
await page.evaluate(`window.scrollTo(0, 900)`)
await new Promise((r) => setTimeout(r, 15000))
const snap2 = await page.evaluate(
  `(() => { const t = document.getElementById('field-title'); const f = t?.closest('form'); return { formBytes: f ? f.innerHTML.length : -1, hasFieldBody: f ? f.innerHTML.includes('field-body') : false, ce: document.querySelectorAll('[contenteditable]').length, seeded: document.body.innerText.includes('Seeded article body') } })()`,
)
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/probe-body4.json',
  JSON.stringify({ snap1, snap2 }, null, 2),
)
console.log('PROBE5_DONE')
await browser.close().catch(() => {})
process.exit(0)
