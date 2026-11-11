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
await page.goto(BASE + '/admin/collections/content/' + session.articleId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await new Promise((r) => setTimeout(r, 15000))

const before = await page.evaluate(`(() => {
  const field = document.querySelector('.field-type.rich-text-lexical')
  const toolbars = field ? [...field.querySelectorAll('[class*="toolbar"]')] : []
  const toolbarInfo = toolbars.map((t) => ({
    cls: t.className.slice(0, 120),
    buttons: [...t.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim()).filter(Boolean).slice(0, 40),
  }))
  return {
    fieldPresent: !!field,
    editableCount: document.querySelectorAll('.ContentEditable__root').length,
    toolbarCount: toolbars.length,
    toolbarInfo,
  }
})()`)

// Act: type a fresh line at the end of the body, select it, click Bold.
await page.click('.ContentEditable__root')
await page.keyboard.press('Control+End')
await page.keyboard.press('Enter')
await page.keyboard.type('Toolbar proof sentence.')
await page.keyboard.press('Home')
await page.keyboard.press('Shift+End')
const boldClicked = await page.evaluate(`(() => {
  const field = document.querySelector('.field-type.rich-text-lexical')
  if (!field) return 'no-field'
  const btns = [...field.querySelectorAll('button')]
  const bold = btns.find((b) => /bold/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '')))
  if (!bold) return 'no-bold-button'
  bold.click()
  return 'clicked'
})()`)
await new Promise((r) => setTimeout(r, 1500))
const afterBold = await page.evaluate(`(() => {
  const root = document.querySelector('.ContentEditable__root')
  const strongs = root ? [...root.querySelectorAll('strong, b')].map((s) => s.textContent) : []
  return { strongs, htmlHasProof: root ? root.innerHTML.includes('Toolbar proof') : false }
})()`)
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/toolbar-v1.png' })

// Wait for autosave, then reload and re-check.
let autosaved = false
for (let i = 0; i < 20; i++) {
  const t = await page.evaluate(`document.body.innerText`)
  if (/saved automatically/i.test(t)) { autosaved = true; break }
  await new Promise((r) => setTimeout(r, 2000))
}
await page.reload({ timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 15000))
const afterReload = await page.evaluate(`(() => {
  const root = document.querySelector('.ContentEditable__root')
  const strongs = root ? [...root.querySelectorAll('strong, b')].map((s) => s.textContent) : []
  return { strongs, text: root ? root.innerText.slice(0, 300) : '' }
})()`)
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/toolbar-reloaded.png' })

writeFileSync(
  '/home/hatch/workspace/gui01b-logs/probe-toolbar.json',
  JSON.stringify({ before, boldClicked, afterBold, autosaved, afterReload, pageErrors }, null, 2),
)
console.log('TOOLBAR_DONE')
await browser.close().catch(() => {})
process.exit(0)
