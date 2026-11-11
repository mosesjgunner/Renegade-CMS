import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
const events = []
page.on('pageerror', (e) =>
  events.push('PAGEERROR: ' + String((e && e.message) || e).slice(0, 400)),
)
page.on('console', (m) => {
  if (m.type() === 'error') events.push('CONSOLE: ' + m.text().slice(0, 250))
})
const failed = []
page.on('requestfailed', (r) =>
  failed.push('REQFAIL: ' + r.url().slice(-90) + ' :: ' + (r.failure()?.errorText || '?')),
)
await page.goto(BASE + '/admin/collections/content/' + session.articleId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await new Promise((r) => setTimeout(r, 5000))
// Diagnostic: what is below the subtitle in the DOM? Scroll the main column into view.
const diag = await page.evaluate(`(() => {
  const title = document.getElementById('field-title')
  const all = []
  let el = title
  // walk forward through siblings/containers collecting class hints
  const main = title?.closest('form') || document.body
  main.querySelectorAll('[class*="rich"], [class*="lexical"], [class*="field-type"], [data-field-path], [id^="field-"]').forEach((n) => {
    all.push({ id: n.id || null, cls: (n.className || '').toString().slice(0, 90), path: n.getAttribute('data-field-path') })
  })
  return { count: all.length, items: all.slice(0, 40) }
})()`)
await page.evaluate(`window.scrollTo(0, 700)`)
await new Promise((r) => setTimeout(r, 25000))
const after = await page.evaluate(`(() => ({
  ce: document.querySelectorAll('[contenteditable]').length,
  seeded: document.body.innerText.includes('Seeded article body paragraph'),
  wrap: !!document.querySelector('.field-type.rich-text-lexical'),
}))()`)
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/probe-body2.json',
  JSON.stringify(
    { diag, after, events: events.slice(0, 12), failed: failed.slice(0, 12) },
    null,
    2,
  ),
)
await page
  .screenshot({ path: '/home/hatch/workspace/gui01b-logs/probe-body2.png', timeout: 60000 })
  .catch(() => {})
console.log('PROBE3_DONE')
await browser.close().catch(() => {})
process.exit(0)
