import { chromium } from 'playwright-core'
const { readFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
await page.goto(BASE + '/admin/collections/content/' + session.articleId, { timeout: 180000, waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 15000))
const out = await page.evaluate(`(() => {
  const root = document.querySelector('.ContentEditable__root')
  const p = root ? [...root.querySelectorAll('p')].find((x) => x.textContent.includes('Button bold final')) : null
  if (!p) return { found: false }
  const strong = p.querySelector('strong.LexicalEditorTheme__textBold, strong')
  return { found: true, strongText: strong ? strong.textContent : null, pHTML: p.innerHTML.slice(0, 200) }
})()`)
console.log(JSON.stringify(out))
await browser.close().catch(() => {})
process.exit(0)
