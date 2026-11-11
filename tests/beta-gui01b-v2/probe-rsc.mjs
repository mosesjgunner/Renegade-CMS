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
  const u = r.url()
  if (u.includes('_rsc=') && u.includes('content')) {
    try {
      bodies.push(await r.text())
    } catch {}
  }
})
await page.goto(BASE + '/admin/collections/content/' + session.articleId, {
  timeout: 180000,
  waitUntil: 'domcontentloaded',
})
await new Promise((r) => setTimeout(r, 20000))
const joined = bodies.join('\n')
const needles = {}
for (const n of [
  'sanitizedEditorConfig',
  'clientFeatures',
  'featureClientSchemaMap',
  'initialLexicalFormState',
  'WritingCanvasField',
  'RscEntryLexicalField',
  'Seeded article body',
]) {
  needles[n] = joined.split(n).length - 1
}
writeFileSync(
  '/home/hatch/workspace/gui01b-logs/probe-rsc.json',
  JSON.stringify({ payloads: bodies.length, bytes: joined.length, needles }, null, 2),
)
console.log('RSCPROBE_DONE')
await browser.close().catch(() => {})
process.exit(0)
