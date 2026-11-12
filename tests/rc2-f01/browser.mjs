// RC2-F-01 browser proof: the public product page, the buyer's post-payment
// return page, and the empty-cart state, in a real browser.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const info = JSON.parse(readFileSync('/tmp/f01-browser.json', 'utf8'))
const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const base = `http://${world.siteA.host}:39071`
const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.launch({
  args: [
    '--no-sandbox',
    `--host-resolver-rules=MAP ${world.siteA.host} 127.0.0.1, MAP ${world.siteB.host} 127.0.0.1`,
  ],
})
const errors = []
try {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })

  await page.goto(`${base}/store/${info.slug}`, { waitUntil: 'networkidle' })
  const productText = await page.locator('body').innerText()
  stage(
    'product page renders name and price in the browser',
    productText.includes(info.productName) && /\$?50/.test(productText),
    '',
  )

  const [cookieName, ...rest] = info.checkoutCookie.split('=')
  await ctx.addCookies([
    {
      name: cookieName,
      value: rest.join('='),
      domain: world.siteA.host,
      path: '/',
    },
  ])
  await page.goto(`${base}/checkout/return?session=${info.sessionId}`, {
    waitUntil: 'networkidle',
  })
  const returnText = await page.locator('body').innerText()
  console.log('PROBE return page text —', returnText.replace(/\s+/g, ' ').slice(0, 220))
  stage(
    "the buyer's return page shows the settled order status",
    /paid|complete|confirmed|thank/i.test(returnText),
    '',
  )

  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  await page2.goto(`${base}/cart`, { waitUntil: 'networkidle' })
  const cartText = await page2.locator('body').innerText()
  console.log('PROBE cart page text —', cartText.replace(/\s+/g, ' ').slice(0, 220))
  stage(
    'a fresh visitor sees an honest empty-cart page',
    /empty|no items|nothing/i.test(cartText),
    '',
  )
} finally {
  await browser.close()
}
const realErrors = errors.filter((e) => !/favicon|404/.test(e) || e.startsWith('pageerror'))
console.log('browser errors:', JSON.stringify(realErrors.slice(0, 4)))
const failed = results.filter((r) => !r.ok)
console.log(`\nF-01 BROWSER: ${results.length - failed.length}/${results.length} stages passed`)
process.exit(failed.length || realErrors.length ? 1 : 0)
