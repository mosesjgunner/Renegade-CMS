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
const sel = await page.evaluate(`(() => {
  const root = document.querySelector('.ContentEditable__root')
  const p = [...root.querySelectorAll('p')].find((x) => x.textContent.includes('Fixed toolbar bold check'))
  if (!p) return { found: false }
  const span = p.querySelector('span[data-lexical-text]') || p.firstChild
  const range = document.createRange()
  range.selectNodeContents(span)
  const s = window.getSelection()
  s.removeAllRanges()
  s.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
  return { found: true, selected: s.toString() }
})()`)
await new Promise((r) => setTimeout(r, 800))
const bState = await page.evaluate(`(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.querySelector('svg') && b.closest('[class*="toolbar"]'))
  return btns.map((b) => {
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), cls: b.className.slice(0, 60), active: b.className.includes('active') }
  }).filter((b) => b.y > 300 && b.y < 420)
})()`)
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-toolbar4.json', JSON.stringify({ sel, bState }, null, 2))
console.log('TB4_DONE')
await browser.close().catch(() => {})
process.exit(0)
