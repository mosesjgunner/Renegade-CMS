// RC2-E-01 — browser proof: a clean public member clicks the emailed
// sign-in link, lands in member settings, edits the profile in the real
// UI, is private to the public by default, and signs out. Plain .mjs
// (playwright-core); string-form evaluates only.
process.env.NO_PROXY = (process.env.NO_PROXY || '') + ',a.rc2-a04.test,b.rc2-a04.test'
process.env.no_proxy = process.env.NO_PROXY
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'node:fs'

const WORLD = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const TOKENS = JSON.parse(readFileSync('/tmp/e01-tokens-1.json', 'utf8'))
const EMAILS = JSON.parse(readFileSync('/tmp/e01-emails.json', 'utf8'))
const HOST = WORLD.siteA.host
const BASE = `http://${HOST}:39071`
const tokenA = TOKENS.tokens[EMAILS.a]

const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    `--host-resolver-rules=MAP ${WORLD.siteA.host} 127.0.0.1, MAP ${WORLD.siteB.host} 127.0.0.1`,
  ],
})
const ctx = await browser.newContext()
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 200)))

// B1 — the emailed link itself signs the member in. The email carries
// the verify PAGE (which POSTs the token); follow the real user path.
await page.goto(`${BASE}/member-auth/verify?token=${encodeURIComponent(tokenA)}`, {
  waitUntil: 'load',
})
await page
  .waitForFunction(() => document.body.innerText.includes('Signed in.'), { timeout: 30000 })
  .catch(() => {})
const signedInText = await page.evaluate(() => document.body.innerText)
await page.getByRole('link', { name: 'Member settings' }).click()
await page.waitForURL('**/members/settings', { timeout: 30000 }).catch(() => {})
const landedSettings =
  page.url().includes('/members/settings') && signedInText.includes('Signed in.')
let profileLoaded = false
try {
  await page.waitForFunction(
    () => {
      const input = document.querySelector('input[aria-label="Display name"]')
      return input && input.value && input.value.length > 0
    },
    { timeout: 20000 },
  )
  profileLoaded = true
} catch {}
const initialName = profileLoaded
  ? await page.getByLabel('Display name').inputValue()
  : '(not loaded)'
stage(
  'browser: clicking the emailed sign-in link lands the new member in settings with a profile',
  landedSettings && profileLoaded,
  `url=${page.url()} displayName=${initialName}`,
)

// Identity for later stages (written immediately, before later stages
// can fail, so the API journey can still converge on this member).
// Fetched in-page: Playwright's APIRequestContext does not honor the
// browser's --host-resolver-rules, so page.request cannot reach the
// fixture hosts.
const me = await page.evaluate(
  "fetch('/api/member-auth/me').then((r) => r.json()).catch(() => ({}))",
)
const memberId = me.memberId ?? null
const handle = me.profile?.handle ?? null
writeFileSync('/tmp/e01-browser.json', JSON.stringify({ memberId, handle }, null, 2))

// B2 — the settings UI edits the real profile.
let saved = false
try {
  // Element-scoped locators: the form also renders per-field audience
  // selects whose labels contain "Bio"/"Display name", so bare
  // getByLabel matches two elements and throws in strict mode.
  await page.locator('input[aria-label="Display name"]').fill('Ada Lovelace E01')
  await page.locator('textarea[aria-label="Bio"]').fill('Browser-written bio for the E-01 journey.')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await page.waitForFunction(() => document.body.innerText.includes('Profile saved.'), {
    timeout: 20000,
  })
  saved = true
} catch {}
stage('browser: profile edit in the settings UI saves', saved)

// B3 — private by default: the public profile page refuses anonymous view.
const anon = await browser.newContext()
const anonPage = await anon.newPage()
const pubResp = await anonPage.goto(`${BASE}/members/${handle}`, { waitUntil: 'load' })
const anonText = await anonPage.evaluate(() => document.body.innerText)
stage(
  'browser: a brand-new profile is private to the public by default',
  pubResp.status() === 404 && !anonText.includes('Browser-written bio'),
  `status=${pubResp.status()}`,
)
await anon.close()

// B4 — sign out returns to the sign-in page and settings close again.
let atAuth = false
try {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL('**/member-auth', { timeout: 20000 })
  atAuth = page.url().includes('/member-auth')
} catch {}
await page.goto(`${BASE}/members/settings`, { waitUntil: 'load' })
await sleep(2500)
const settingsClosed =
  page.url().includes('/member-auth') ||
  (await page.evaluate(() => !document.querySelector('input[aria-label="Display name"]')))
stage(
  'browser: sign out ends the session and settings require sign-in again',
  atAuth && settingsClosed,
  `afterSignOut=${page.url()}`,
)

await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} browser stages passed`)
process.exit(failed ? 1 : 0)
