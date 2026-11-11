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
await page.keyboard.type('Bold persistence proof.')
await page.keyboard.press('Home')
await page.keyboard.press('Shift+End')
await page.keyboard.press('Control+b')
await new Promise((r) => setTimeout(r, 2500))
const fmtState = await page.evaluate(`(() => {
  const root = document.querySelector('.ContentEditable__root')
  const p = root ? [...root.querySelectorAll('p')].find((x) => x.textContent.includes('Bold persistence')) : null
  if (!p) return { found: false }
  return {
    found: true,
    pHTML: p.innerHTML.slice(0, 300),
    spanStyles: [...p.querySelectorAll('span')].map((s) => s.getAttribute('style') || ''),
    spanData: [...p.querySelectorAll('span')].map((s) => s.getAttribute('data-lexical-text') + '|' + s.className),
    strongCount: p.querySelectorAll('strong,b').length,
  }
})()`)
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/toolbar-bold-v2.png' })
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
  const p = root ? [...root.querySelectorAll('p')].find((x) => x.textContent.includes('Bold persistence')) : null
  return p ? {
    pHTML: p.innerHTML.slice(0, 300),
    spanStyles: [...p.querySelectorAll('span')].map((s) => s.getAttribute('style') || ''),
    strongCount: p.querySelectorAll('strong,b').length,
  } : { found: false }
})()`)
writeFileSync('/home/hatch/workspace/gui01b-logs/probe-toolbar3.json', JSON.stringify({ fmtState, autosaved, after, pageErrors }, null, 2))
console.log('TB3_DONE')
await browser.close().catch(() => {})
process.exit(0)
