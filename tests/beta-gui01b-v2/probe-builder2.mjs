import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const layout = JSON.parse(readFileSync('/tmp/gui01b-layout.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
await page.goto(BASE + '/builder/' + layout.layoutId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await new Promise((r) => setTimeout(r, 20000))
const info = await page.evaluate(`(() => {
  const all = [...document.querySelectorAll('button, select, a')]
  const addBtn = all.find((e) => e.textContent.trim() === 'Add block')
  let addCtx = null
  if (addBtn) {
    let el = addBtn
    for (let i = 0; i < 4 && el; i++) el = el.parentElement
    addCtx = el ? el.outerHTML.slice(0, 900) : 'no-parent'
  }
  const selects = [...document.querySelectorAll('select')].map((s) => ({
    name: s.name || s.getAttribute('aria-label') || '',
    options: [...s.options].slice(0, 8).map((o) => o.textContent.trim()),
  }))
  return { addCtx, selects }
})()`)
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/probe-builder2.json',
  JSON.stringify(info, null, 2),
)
console.log('B2_DONE')
await browser.close().catch(() => {})
process.exit(0)
