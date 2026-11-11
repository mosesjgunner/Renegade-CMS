import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
await page.goto(BASE + '/admin/collections/content/' + session.articleId, { timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 15000))
const info = await page.evaluate(`(() => {
  const all = [...document.querySelectorAll('[class*="toolbar" i]')].map((e) => e.className.slice(0, 100))
  const field = document.querySelector('.field-type.rich-text-lexical')
  const chain = []
  let el = field
  for (let i = 0; i < 5 && el; i++) { chain.push(el.className.slice(0, 140)); el = el.parentElement }
  const innerKids = field ? [...field.querySelectorAll(':scope *')].slice(0, 12).map((e) => e.tagName + '.' + String(e.className).slice(0, 80)) : []
  const btnLabels = [...document.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.title || '')).filter((t) => /bold|italic|underline|link|align|heading/i.test(t))
  return { allToolbarClasses: all, fieldChain: chain, innerKids, btnLabels }
})()`)
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-tb2.json', JSON.stringify(info, null, 2))
console.log('TB2_DONE')
await browser.close().catch(() => {})
process.exit(0)
