import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })

// CREATE form, light
let ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
let page = await ctx.newPage()
await page.goto(BASE + '/admin/collections/content/create', { timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 15000))
const create = await page.evaluate(`(() => {
  const ce = document.querySelector('.ContentEditable__root')
  const siteSelect = document.querySelector('#field-site')
  return {
    editorMounted: !!ce,
    siteFieldVisible: siteSelect ? siteSelect.offsetParent !== null : false,
    bodyText: document.body.innerText.slice(0, 0),
  }
})()`)
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/create-v1.png' })
await ctx.close()

// EDIT form, dark theme via prefers-color-scheme emulation
ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
page = await ctx.newPage()
await page.goto(BASE + '/admin/collections/content/' + session.articleId, { timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 15000))
const dark = await page.evaluate(`(() => {
  const html = document.documentElement
  const ce = document.querySelector('.ContentEditable__root')
  const wrap = ce ? ce.closest('.field-type.rich-text-lexical') : null
  const ws = wrap ? getComputedStyle(wrap) : null
  return {
    dataTheme: html.getAttribute('data-theme'),
    sheetBg: ws ? ws.backgroundColor : null,
    editorMounted: !!ce,
  }
})()`)
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/dark-v1.png' })
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-views.json', JSON.stringify({ create, dark }, null, 2))
console.log('VIEWS_DONE')
await browser.close().catch(() => {})
process.exit(0)
