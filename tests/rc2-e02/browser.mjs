// RC2-E-02 — browser proof: the forum is publicly browsable, the thread
// renders its visible posts after moderation, and the script-laden
// comment never executes on the article page. Plain .mjs
// (playwright-core); string-form evaluates only.
process.env.NO_PROXY = (process.env.NO_PROXY || '') + ',a.rc2-a04.test,b.rc2-a04.test'
process.env.no_proxy = process.env.NO_PROXY
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const WORLD = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const STATE = JSON.parse(readFileSync('/tmp/e02-state.json', 'utf8'))
const HOST = WORLD.siteA.host
const BASE = `http://${HOST}:39071`

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    `--host-resolver-rules=MAP ${WORLD.siteA.host} 127.0.0.1, MAP ${WORLD.siteB.host} 127.0.0.1`,
  ],
})
const page = await (await browser.newContext()).newPage()
page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 200)))

// B1 — the forum page lists the journey's thread.
await page.goto(`${BASE}/forums/${STATE.forumSlug}`, { waitUntil: 'load' })
await page
  .waitForFunction(
    (title) => document.body.innerText.includes(title),
    `E-02 thread ${STATE.stamp}`,
    { timeout: 20000 },
  )
  .catch(() => {})
const forumText = await page.evaluate(() => document.body.innerText)
stage(
  'browser: the public forum page lists the member-created thread',
  forumText.includes(`E-02 thread ${STATE.stamp}`),
)

// B2 — following the thread shows the posts that survived moderation
// (the quarantined-then-reinstated troll reply is public again).
let threadShown = false
try {
  await page.getByText(`E-02 thread ${STATE.stamp}`).first().click()
  await page.waitForLoadState('load')
  await page
    .waitForFunction(() => document.body.innerText.includes('Author reply to the troll.'), {
      timeout: 20000,
    })
    .catch(() => {})
  const text = await page.evaluate(() => document.body.innerText)
  threadShown = text.includes('Author reply to the troll.') && text.includes('Troll reply')
} catch {}
stage('browser: the thread page renders the visible reply tree', threadShown, `url=${page.url()}`)

// B3 — the article page never executes the stored script payload.
await page.goto(`${BASE}${WORLD.siteA.publishedCanonicalPath}`, { waitUntil: 'load' })
await new Promise((r) => setTimeout(r, 3000))
const xss = await page.evaluate(() => window.__e02xss ?? 0)
stage('browser: the stored comment payload does not execute on the article page', xss === 0)

await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} browser stages passed`)
process.exit(failed ? 1 : 0)
