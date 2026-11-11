import { chromium } from 'playwright-core'
const { readFileSync, writeFileSync } = await import('node:fs')
const BASE = 'http://127.0.0.1:39071'
const session = JSON.parse(readFileSync('/tmp/gui01b-session.json', 'utf8'))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
await ctx.addCookies([{ name: session.cookieName, value: session.token, url: BASE }])
const page = await ctx.newPage()
const bodies = []
page.on('response', async (r) => {
  try {
    const t = await r.text()
    if (
      t &&
      (t.includes('Seeded GUI01B') || t.includes('formState') || t.includes('customComponents'))
    )
      bodies.push({ url: r.url().slice(-110), bytes: t.length, text: t })
  } catch {}
})
await page.goto(BASE + '/admin/collections/content/' + session.articleId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await new Promise((r) => setTimeout(r, 20000))
const joined = bodies.map((b) => b.text).join('\n')
const needles = {}
for (const n of [
  'clientFeatures',
  'featureClientSchemaMap',
  'initialLexicalFormState',
  'sanitizedEditorConfig',
  'body',
  'WritingCanvas',
])
  needles[n] = joined.split(n).length - 1
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/probe-rsc2.json',
  JSON.stringify(
    { count: bodies.length, meta: bodies.map((b) => ({ url: b.url, bytes: b.bytes })), needles },
    null,
    2,
  ),
)
if (bodies.length)
  writeFileSync('/home/hatch/workspace/gui01b-logs/probe-rsc2-body.txt', joined.slice(0, 200000))
console.log('RSC2_DONE')
await browser.close().catch(() => {})
process.exit(0)
