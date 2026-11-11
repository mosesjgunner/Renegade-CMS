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
  const ce = document.querySelector('.ContentEditable__root')
  const title = document.getElementById('field-title')
  const wrap = ce ? ce.closest('.field-type.rich-text-lexical') : null
  const cs = ce ? getComputedStyle(ce) : null
  const ws = wrap ? getComputedStyle(wrap) : null
  const ts = title ? getComputedStyle(title) : null
  return {
    ceMinHeight: cs ? cs.minHeight : null,
    ceFontSize: cs ? cs.fontSize : null,
    wrapBg: ws ? ws.backgroundColor : null,
    wrapBorderLeft: ws ? ws.borderLeftWidth + ' ' + ws.borderLeftColor : null,
    wrapShadow: ws ? ws.boxShadow : null,
    titleBorder: ts ? ts.borderTopWidth : null,
    titleFontSize: ts ? ts.fontSize : null,
  }
})()`)
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-sheet.json', JSON.stringify(info, null, 2))
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/sheet-v4.png' })
console.log('SHEET_DONE')
await browser.close().catch(() => {})
process.exit(0)
