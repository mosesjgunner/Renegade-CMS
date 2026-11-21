// RC3-06 leg 2 (browser half): interrupt setup mid-wizard, then reopen
// it — first in the same browser (the quick start promises resume),
// then in a fresh browser profile (the draft must not leak across
// browsers). Server-kill interruption is driven from the shell, not
// here; this script covers the tab-close case (kit task card 8 shape).
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
const siteName = process.env.RC306_SITE_NAME ?? 'Interrupted Site'

const { browser, context, page } = await launch()
const result = {}
try {
  await addAuthenticator(context, page)
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
  await fillReliable(page, 'Site slug', 'interrupted-site')
  await fillReliable(page, 'Primary URL', 'http://localhost:3110')
  await page.getByRole('button', { name: 'Continue' }).click()
  // Now on step 3 (Brand & starter). Give the draft save a moment.
  await page.waitForTimeout(2000)
  result.beforeInterrupt = await bodyText(page).then((t) => t.slice(0, 300))
  await shot(page, 'leg2-before-interrupt')

  // Interrupt: close the tab entirely.
  await page.close()

  // Reopen in the SAME browser profile.
  const page2 = await context.newPage()
  await addAuthenticator(context, page2)
  await page2.goto(BASE + '/setup')
  await page2.waitForTimeout(2500)
  const resumedText = await bodyText(page2)
  result.sameBrowser = {
    showsWizard: resumedText.includes('Make this site yours.'),
    siteNameRestored: resumedText.includes(siteName),
    excerpt: resumedText.slice(0, 600),
  }
  await shot(page2, 'leg2-same-browser-resume')
  // If the name field is visible, read its value directly.
  const nameField = page2.getByLabel('Site or publication name')
  if (await nameField.count()) {
    result.sameBrowser.nameFieldValue = await nameField.inputValue()
    result.sameBrowser.atIdentityStep = true
  } else {
    result.sameBrowser.atIdentityStep = false
  }

  // Fresh browser profile: the draft belongs to the first browser's
  // claim and must not appear here.
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await pageB.goto(BASE + '/setup')
  await pageB.waitForTimeout(2000)
  const freshText = await bodyText(pageB)
  result.freshBrowser = {
    showsWizardStart: freshText.includes('Make this site yours.'),
    siteNameLeaked: freshText.includes(siteName),
    excerpt: freshText.slice(0, 400),
  }
  await shot(pageB, 'leg2-fresh-browser')
  out('leg2', result)
} finally {
  await browser.close()
}
