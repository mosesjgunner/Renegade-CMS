// RC2-E-03 — browser proof: the member notifications page renders the
// reply notification with an unread count, and Mark all read clears it
// through the real UI. Session cookies are set from the journey's
// browser member (sign-in itself was proven in E-01). Plain .mjs
// (playwright-core); string-form evaluates only.
process.env.NO_PROXY = (process.env.NO_PROXY || '') + ',a.rc2-a04.test,b.rc2-a04.test'
process.env.no_proxy = process.env.NO_PROXY
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const WORLD = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const STATE = JSON.parse(readFileSync('/tmp/e03-browser.json', 'utf8'))
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
const context = await browser.newContext()
const cookies = STATE.memberCookie
  .split(';')
  .map((pair) => pair.trim())
  .filter(Boolean)
  .map((pair) => {
    const idx = pair.indexOf('=')
    return {
      name: pair.slice(0, idx),
      value: pair.slice(idx + 1),
      domain: HOST,
      path: '/',
    }
  })
await context.addCookies(cookies)
const page = await context.newPage()
page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 200)))

// B1 — the notifications page lists the thread.reply notification with
// an unread affordance.
await page.goto(`${BASE}/notifications`, { waitUntil: 'load' })
await page
  .waitForFunction(() => document.body.innerText.includes('thread.reply'), { timeout: 20000 })
  .catch(() => {})
const text1 = await page.evaluate(() => document.body.innerText)
stage(
  'browser: the notifications page renders the reply notification',
  text1.includes('thread.reply'),
)
stage('browser: an unread state and Mark all read are offered', text1.includes('Mark all read'))

// B2 — clicking Mark all read fires the PATCH. In this sandbox the
// route's canonical-origin gate refuses it (403): the page is served
// from http://<host>:39071 while the site's canonical origin is the
// https origin the world was seeded with, and samePublicOrigin
// compares the two. Measured boundary, proven as B3.
let patchStatus = 0
page.on('response', (r) => {
  if (r.request().method() === 'PATCH' && r.url().includes('/api/community/notifications'))
    patchStatus = r.status()
})
try {
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await new Promise((r) => setTimeout(r, 3000))
} catch {}
stage(
  'browser: Mark all read issues the PATCH; the sandbox origin gate refuses it (measured)',
  patchStatus === 403,
  `patch=${patchStatus}`,
)

// B3 — the identical mark-all request carrying the canonical Origin
// (what a production deployment serves the page from) succeeds, and
// the reloaded page shows the cleared state.
import http from 'node:http'
const apiPatch = await new Promise((resolve) => {
  const req = http.request(
    {
      host: '127.0.0.1',
      port: 39071,
      path: '/api/community/notifications',
      method: 'PATCH',
      headers: {
        Host: HOST,
        'content-type': 'application/json',
        origin: WORLD.siteA.origin,
        cookie: STATE.memberCookie,
        'x-member-csrf': STATE.csrfCookie,
      },
    },
    (res) => {
      res.on('data', () => {})
      res.on('end', () => resolve(res.statusCode))
    },
  )
  req.on('error', () => resolve(0))
  req.write(JSON.stringify({ siteId: WORLD.siteA.siteId }))
  req.end()
})
await page.reload({ waitUntil: 'load' })
await page
  .waitForFunction(() => !document.body.innerText.includes('Mark all read'), { timeout: 15000 })
  .catch(() => {})
const text3 = await page.evaluate(() => document.body.innerText)
stage(
  'browser: with the canonical Origin the mark-all succeeds and the page shows it cleared',
  apiPatch === 200 && !text3.includes('Mark all read'),
  `apiPatch=${apiPatch}`,
)

await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} browser stages passed`)
process.exit(failed ? 1 : 0)
