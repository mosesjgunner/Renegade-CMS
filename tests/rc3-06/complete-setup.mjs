// RC3-06 leg 1: complete first-run setup through the real /setup UI on
// the production build, then verify the first public page, the admin
// studio, and a returning-owner passkey login. Timings are recorded so
// the RESULT can report how long the documented path actually takes.
import {
  addAuthenticator,
  BASE,
  bodyText,
  fillReliable,
  launch,
  out,
  readToken,
  shot,
} from './lib.mjs'

const token = readToken()
const email = process.env.RC306_EMAIL ?? 'owner@rc306.test'
const siteName = process.env.RC306_SITE_NAME ?? 'RC306 Rehearsal Site'
const slug = process.env.RC306_SLUG ?? 'rc306-rehearsal'
const started = Date.now()
const marks = []
const mark = (label) => marks.push({ label, atSeconds: (Date.now() - started) / 1000 })

const { browser, context, page } = await launch()
try {
  await addAuthenticator(context, page)
  page.on('pageerror', (err) => console.log('[BROWSER ERROR]', err.message))

  await page.goto(BASE + '/setup')
  await page.getByRole('heading', { name: 'Make this site yours.' }).waitFor({ timeout: 30_000 })
  mark('setup page rendered')

  await fillReliable(page, 'Bootstrap token', token)
  await fillReliable(page, 'Owner email', email)
  const continueButton = page.getByRole('button', { name: 'Continue' })
  await continueButton.waitFor({ state: 'visible' })
  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Continue')
      return btn && !btn.disabled
    },
    { timeout: 15_000 },
  )
  await continueButton.click()
  mark('step 1 (secure owner) submitted')

  await page.getByLabel('Site or publication name').waitFor({ timeout: 15_000 })
  await fillReliable(page, 'Site or publication name', siteName)
  await fillReliable(page, 'Site slug', slug)
  await fillReliable(page, 'Primary URL', BASE)
  await page.getByRole('button', { name: 'Continue' }).click()
  mark('step 2 (site identity) submitted')

  // Step 3 - Brand & starter (defaults).
  await page.getByRole('button', { name: 'Continue' }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Continue' }).click()
  mark('step 3 (brand & starter) submitted')

  // Step 4 - Features: capture the live readiness/provider display.
  await page.waitForTimeout(2500)
  const featuresText = await bodyText(page)
  await shot(page, 'leg1-features-step')
  await page.getByRole('button', { name: 'Continue' }).click()
  mark('step 4 (features) submitted')

  // Step 5 - Finish: enroll passkey & create site.
  await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
  await page
    .getByRole('heading', { name: 'Your site is ready to shape.' })
    .waitFor({ timeout: 30_000 })
  mark('setup complete - recovery codes screen')
  const codes = await page.locator('ul.font-mono > li').allTextContents()
  await shot(page, 'leg1-recovery-codes')

  // Acknowledge the codes the way the quick start describes, if the
  // control is present, and open the Admin Studio.
  const ack = page.getByRole('checkbox').first()
  if (await ack.count()) await ack.check().catch(() => {})
  const studioButton = page.getByRole('button', { name: /Admin Studio|Open admin|Go to admin/i })
  const linkButton = page.getByRole('link', { name: /Admin Studio|Open admin/i })
  if (await studioButton.count()) await studioButton.first().click()
  else if (await linkButton.count()) await linkButton.first().click()
  else await page.goto(BASE + '/admin')
  await page.waitForURL(/\/admin/, { timeout: 20_000 })
  mark('admin studio reached')
  await shot(page, 'leg1-admin')

  // First public page as a logged-out visitor would see it.
  const anon = await context.browser().newContext()
  const anonPage = await anon.newPage()
  const homeResponse = await anonPage.goto(BASE + '/')
  const homeText = await bodyText(anonPage)
  await shot(anonPage, 'leg1-public-home')
  mark('public homepage checked')

  // Returning owner: log out, then log back in with the passkey.
  await page.request.post(BASE + '/api/auth/logout')
  await context.clearCookies()
  await page.goto(BASE + '/login')
  await fillReliable(page, 'Owner / Staff Email', email)
  await page.getByRole('button', { name: /Authenticate with Passkey/ }).click()
  await page.waitForURL(/\/admin/, { timeout: 20_000 })
  mark('returning owner passkey login')

  out('leg1', {
    ok: true,
    totalSeconds: (Date.now() - started) / 1000,
    marks,
    recoveryCodes: codes.length,
    featuresStepMentions: {
      database: /database/i.test(featuresText),
      storage: /storage/i.test(featuresText),
      audioEngine: /audio|ffmpeg/i.test(featuresText),
      email: /email/i.test(featuresText),
    },
    featuresExcerpt: featuresText.slice(0, 1200),
    publicHome: {
      status: homeResponse?.status(),
      showsSiteName: homeText.includes(siteName),
      excerpt: homeText.slice(0, 400),
    },
  })
} finally {
  await browser.close()
}
