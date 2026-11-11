import { chromium } from 'playwright-core'
const { writeFileSync } = await import('node:fs')
const { readFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String((e && e.stack) || e).slice(0, 900)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 400))
})
await page.goto(BASE + '/admin/collections/content/' + session.articleId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await new Promise((r) => setTimeout(r, 25000))
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/probe-body6.json',
  JSON.stringify({ errors }, null, 2),
)
console.log('PROBE7_DONE errors=' + errors.length)
await browser.close().catch(() => {})
process.exit(0)
