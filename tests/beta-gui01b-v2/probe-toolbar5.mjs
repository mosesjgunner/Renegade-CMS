import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
await page.goto(BASE + '/admin/collections/content/' + session.articleId, { timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 15000))
await page.click('.ContentEditable__root')
await page.keyboard.press('Control+End')
await page.keyboard.press('Enter')
await page.keyboard.type('Button bold final proof.')
await page.keyboard.press('Shift+Home')
await new Promise((r) => setTimeout(r, 600))
// Click the real Bold button of the FIXED toolbar (topmost toolbar row on the page)
await page.click('.toolbar-popup__button-bold >> nth=0')
await new Promise((r) => setTimeout(r, 2000))
const mid = await page.evaluate(`(() => {
  const root = document.querySelector('.ContentEditable__root')
  const p = root ? [...root.querySelectorAll('p')].find((x) => x.textContent.includes('Button bold final')) : null
  if (!p) return { found: false }
  return {
    found: true,
    boldSpans: [...p.querySelectorAll('span')].filter((s) => s.className.includes('textBold')).map((s) => s.textContent),
    pHTML: p.innerHTML.slice(0, 220),
  }
})()`)
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/toolbar-final.png' })
let autosaved = false
for (let i = 0; i < 25; i++) {
  const t = await page.evaluate(`document.body.innerText`)
  if (/saved automatically/i.test(t)) { autosaved = true; break }
  await new Promise((r) => setTimeout(r, 2000))
}
await page.reload({ timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 15000))
const after = await page.evaluate(`(() => {
  const root = document.querySelector('.ContentEditable__root')
  const p = root ? [...root.querySelectorAll('p')].find((x) => x.textContent.includes('Button bold final')) : null
  if (!p) return { found: false }
  return {
    found: true,
    boldSpans: [...p.querySelectorAll('span')].filter((s) => s.className.includes('textBold')).map((s) => s.textContent),
  }
})()`)
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-toolbar5.json', JSON.stringify({ mid, autosaved, after, pageErrors }, null, 2))
console.log('TB5_DONE')
await browser.close().catch(() => {})
process.exit(0)
