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
await new Promise((r) => setTimeout(r, 30000))
const info = await page.evaluate(`(() => ({
  url: location.href,
  title: document.title,
  hasTitleField: !!document.getElementById('field-title'),
  bodyHead: document.body.innerText.slice(0, 300),
}))()`)
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-body5.json', JSON.stringify(info, null, 2))
await page
  .screenshot({ path: '/home/hatch/workspace/gui01b-logs/probe-body5.png', timeout: 60000 })
  .catch(() => {})
console.log('PROBE6_DONE')
await browser.close().catch(() => {})
process.exit(0)
