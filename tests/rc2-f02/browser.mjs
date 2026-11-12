// RC2-F-02 browser proof: the member billing surface renders the member's
// granted subscriptions (the same records the journey granted and partially
// canceled) on the site they belong to.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const state = JSON.parse(readFileSync('/tmp/f02-browser.json', 'utf8'))
const host = state.host || world.siteB.host
const name = host.split(':')[0]
const origin = `http://${name}:39071`

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({
  args: ['--no-sandbox', `--host-resolver-rules=MAP ${name} 127.0.0.1`],
})
const context = await browser.newContext({ baseURL: origin })
const pairs = state.cookie.split('; ').filter(Boolean)
await context.addCookies(
  pairs.map((pair) => {
    const idx = pair.indexOf('=')
    return {
      name: pair.slice(0, idx),
      value: pair.slice(idx + 1),
      domain: name,
      path: '/',
      httpOnly: pair.startsWith('renegade-member='),
      sameSite: 'Lax',
    }
  }),
)
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(`${origin}/members/settings?tab=billing`, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
})
await page.waitForTimeout(3500)
const text = await page.evaluate(() => document.body.innerText)
const url = page.url()

stage(
  'member billing page renders for the signed-in member',
  url.includes('/members/settings') && pageErrors.length === 0,
  `url=${url} errors=${pageErrors.length}`,
)
stage(
  'billing page shows the granted membership plans',
  text.includes('F-02 Premium Reading') && text.includes('F-02 Media Downloads'),
  `premium=${text.includes('F-02 Premium Reading')} media=${text.includes('F-02 Media Downloads')}`,
)

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\nF-02 BROWSER: ${results.length - failed.length}/${results.length} stages passed`)
process.exit(failed.length ? 1 : 0)
