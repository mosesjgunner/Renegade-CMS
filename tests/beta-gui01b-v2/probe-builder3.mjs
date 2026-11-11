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

// Add a Hero block via the shell controls
const blockSelect = page.locator('select[aria-label="Block to add"]')
result.blockOptions = await blockSelect.locator('option').allTextContents()
await blockSelect.selectOption({ label: 'Hero' })
await page.getByRole('button', { name: 'Add block' }).click()
await new Promise((r) => setTimeout(r, 2500))
result.afterAdd = await page.evaluate(`(() => {
  const frame = document.querySelector('#preview-frame')
  const doc = frame ? frame.contentDocument : null
  return {
    bodyText: document.body.innerText.slice(0, 400),
    canvasText: doc ? doc.body.innerText.slice(0, 300) : 'no-frame-doc',
  }
})()`)
await page.screenshot({ path: '/home/hatch/workspace/gui01b-logs/builder-added.png' })

// Save Draft
await page.getByRole('button', { name: 'Save Draft' }).click()
await new Promise((r) => setTimeout(r, 5000))
result.afterSaveText = await page.evaluate(`document.body.innerText.slice(0, 500)`)

// Reload builder and check the block persists in the draft
await page.reload({ timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 20000))
result.afterReload = await page.evaluate(`(() => {
  const frame = document.querySelector('#preview-frame')
  const doc = frame ? frame.contentDocument : null
  const sel = document.querySelector('select[aria-label="Selected block"]')
  return {
    selectedOptions: sel ? [...sel.options].map((o) => o.textContent.trim()) : [],
    canvasText: doc ? doc.body.innerText.slice(0, 300) : 'no-frame-doc',
  }
})()`)
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/probe-builder3.json',
  JSON.stringify({ result, pageErrors }, null, 2),
)
console.log('B3_DONE')
await browser.close().catch(() => {})
process.exit(0)
