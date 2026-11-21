// RC3-06 leg 2b / kit task card 5: the owner cancels (or loses) the
// passkey prompt at the Finish step. The quick start promises: "If you
// cancel the passkey prompt, nothing is lost — press the button again
// and finish. Your answers stay on the page." This script tries to
// enroll with NO authenticator available (the prompt cannot succeed),
// records what the page says and whether the answers survive, then
// attaches an authenticator and finishes without re-entering anything.
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
const siteName = process.env.RC306_SITE_NAME ?? 'Cancel Test Site'

const { browser, context, page } = await launch()
const result = {}
try {
  // Deliberately NO virtual authenticator yet.
  await page.goto(BASE + '/setup')
  await page.getByRole('heading', { name: 'Make this site yours.' }).waitFor({ timeout: 30_000 })
  await fillReliable(page, 'Bootstrap token', token)
  await fillReliable(page, 'Owner email', email)
  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Continue')
      return btn && !btn.disabled
    },
    { timeout: 15_000 },
  )
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Site or publication name').waitFor({ timeout: 15_000 })
  await fillReliable(page, 'Site or publication name', siteName)
  await fillReliable(page, 'Site slug', 'cancel-test-site')
  await fillReliable(page, 'Primary URL', 'http://localhost:3110')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(1500)
  await page
    .getByRole('button', { name: 'Continue' })
    .click()
    .catch(() => {})
  const enroll = page.getByRole('button', { name: 'Enroll passkey & create site' })
  await enroll.waitFor({ timeout: 15_000 })

  // Attempt enrollment with no authenticator: the ceremony must fail.
  await enroll.click()
  await page.waitForTimeout(6000)
  const afterCancel = await bodyText(page)
  result.afterFailedEnroll = {
    stillOnWizard: afterCancel.includes('Make this site yours.'),
    siteReady: afterCancel.includes('Your site is ready to shape.'),
    excerpt: afterCancel.slice(0, 900),
  }
  await shot(page, 'leg2b-after-cancel')

  // Attach an authenticator and press the button again — no re-typing.
  await addAuthenticator(context, page)
  await enroll.click()
  await page
    .getByRole('heading', { name: 'Your site is ready to shape.' })
    .waitFor({ timeout: 30_000 })
  result.secondAttemptSucceededWithoutReentry = true
  const codes = await page.locator('ul.font-mono > li').allTextContents()
  result.recoveryCodes = codes.length
  await shot(page, 'leg2b-completed')
  out('leg2b', result)
} finally {
  await browser.close()
}
