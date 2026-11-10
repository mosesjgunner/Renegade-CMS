import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
await page.goto(BASE + '/admin/collections/content/' + session.articleId, { timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 40000))
const probe = await page.evaluate(`(() => {
  const wrap = document.querySelector('.field-type.rich-text-lexical')
  const ce = document.querySelectorAll('[contenteditable]')
  return {
    url: location.href,
    wrapperPresent: !!wrap,
    wrapperTextHead: wrap ? wrap.textContent.slice(0, 160) : null,
    contenteditableCount: ce.length,
    ceClasses: [...ce].map((el) => (el.className || '').toString().slice(0, 100)),
    seededTextPresent: document.body.innerText.includes('Seeded article body paragraph'),
    bodyChunk: document.body.innerText.slice(document.body.innerText.indexOf('TITLE'), document.body.innerText.indexOf('TITLE') + 500),
  }
})()`)
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-body.json', JSON.stringify(probe, null, 2))
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/probe-body.png', fullPage: true, timeout: 120000 }).catch(() => {})
console.log('PROBE2_DONE')
await browser.close().catch(() => {})
process.exit(0)
