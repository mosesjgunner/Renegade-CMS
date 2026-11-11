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
page.on('dialog', async (d) => {
  await d.accept()
})
const result = {}
await page.goto(BASE + '/builder/' + layout.layoutId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await new Promise((r) => setTimeout(r, 20000))
await page.getByRole('button', { name: 'Publish Live' }).click()
await new Promise((r) => setTimeout(r, 6000))
result.afterPublish = await page.evaluate(`document.body.innerText.slice(0, 420)`)
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/builder-published.png' })
// Anonymous public view of the published path
const anon = await ctx.newPage()
await anon.context().clearCookies()
const resp = await anon
  .goto(BASE + '/builder-fixture', { timeout: 120000, waitUntil: 'domcontentloaded' })
  .catch((e) => null)
await new Promise((r) => setTimeout(r, 6000))
result.publicView = await anon.evaluate(`(() => ({
  url: location.href,
  hasHeroComponent: !!document.querySelector('[data-component="publisher.hero"]'),
  text: document.body.innerText.slice(0, 400),
}))()`)
result.publicStatus = resp ? resp.status() : 'nav-failed'
await anon.screenshot({ path: '/home/hatch/workspace/gui01b-logs/builder-public.png' })
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/probe-builder4.json',
  JSON.stringify({ result, pageErrors }, null, 2),
)
console.log('B4_DONE')
await browser.close().catch(() => {})
process.exit(0)
