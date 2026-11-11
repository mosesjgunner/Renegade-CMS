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
await new Promise((r) => setTimeout(r, 15000))
const info = await page.evaluate(`(() => {
  const siteSelect = document.querySelector('#field-site, [id="field-site"]')
  const siteVisible = siteSelect ? siteSelect.offsetParent !== null : false
  const body = document.body.innerText
  const placementHeaders = [...document.querySelectorAll('.collapsible__toggle, [class*=collapsible] button')].map((b) => b.innerText.trim()).filter(Boolean)
  const hasPlacement = placementHeaders.some((t) => t === 'Placement')
  return {
    siteFieldInDom: !!siteSelect,
    siteFieldVisible: siteVisible,
    hasPlacementGroup: hasPlacement,
    groupHeaders: placementHeaders,
    newCopyPresent: body.includes('it saves as you go'),
    newBodyDescPresent: body.includes('Write it like you'),
    siteDropdownGone: !body.includes('GUI01B Site'),
  }
})()`)
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/probe-placement.json',
  JSON.stringify(info, null, 2),
)
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/placement-v1.png' })
console.log('PLACEMENT_DONE')
await browser.close().catch(() => {})
process.exit(0)
