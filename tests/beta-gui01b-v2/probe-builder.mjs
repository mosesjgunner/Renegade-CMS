import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const layout = JSON.parse(readFileSync('/tmp/gui01b-layout.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
await page.goto(BASE + '/builder/' + layout.layoutId, { timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 20000))
const info = await page.evaluate(`(() => {
  const text = document.body.innerText
  const puckRoot = document.querySelector('[class*="Puck"], [class*="puck"]')
  const iframes = [...document.querySelectorAll('iframe')].map((f) => f.id || f.title || f.src.slice(0, 60))
  return {
    url: location.href,
    title: document.title,
    hasPuck: !!puckRoot,
    puckClass: puckRoot ? puckRoot.className.slice(0, 100) : null,
    iframes,
    textHead: text.slice(0, 1200),
  }
})()`)
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/builder-v1.png' })
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-builder.json', JSON.stringify({ info, pageErrors }, null, 2))
console.log('BUILDER_DONE')
await browser.close().catch(() => {})
process.exit(0)
