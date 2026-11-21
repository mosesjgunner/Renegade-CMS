// RC3-06 leg 7 (second half): once the operator is on the Security
// Center (/admin/security — a registered admin view), can the recovery
// task itself be done keyboard-only at 360px? Also records whether the
// admin navigation exposes a Security link a keyboard operator could
// follow from the dashboard, since the headless harness cannot focus a
// browser address bar the way a person would with Ctrl+L.
import { addAuthenticator, BASE, fillReliable, launch, out, readToken, shot } from './lib.mjs'

const token = readToken()
const email = process.env.RC306_EMAIL ?? 'owner@rc306.test'
const { browser, context, page } = await launch({ width: 360, height: 740 })
const result = {}
try {
  await addAuthenticator(context, page)
  page.on('dialog', (dialog) => void dialog.accept())
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
  await fillReliable(page, 'Site or publication name', 'Keyboard Security Site')
  await fillReliable(page, 'Site slug', 'keyboard-security-site')
  await fillReliable(page, 'Primary URL', 'http://localhost:3110')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(1200)
  await page
    .getByRole('button', { name: 'Continue' })
    .click()
    .catch(() => {})
  await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
  await page
    .getByRole('heading', { name: 'Your site is ready to shape.' })
    .waitFor({ timeout: 30_000 })

  await page.goto(BASE + '/admin')
  await page.waitForTimeout(2000)
  result.adminNavLinks = await page.evaluate(() =>
    [...document.querySelectorAll('a')].map((a) => (a.textContent ?? '').trim()).filter(Boolean),
  )
  result.navHasSecurity = result.adminNavLinks.some((t) => /security/i.test(t))

  await page.goto(BASE + '/admin/security')
  await page
    .getByRole('button', { name: 'Generate new recovery codes' })
    .waitFor({ timeout: 20_000 })
  result.securityCenterRendered = true
  result.overflow360 = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  await shot(page, 'leg7-security-center-360')

  // Keyboard-only from here: Tab from the top to the rotate button.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
  })
  const trail = []
  let reached = false
  for (let i = 0; i < 80 && !reached; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return { tag: null, text: '' }
      const cs = getComputedStyle(el)
      return {
        tag: el.tagName,
        text: (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 50),
        outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
      }
    })
    trail.push(info)
    if (info.tag === 'BUTTON' && /Generate new recovery codes/.test(info.text ?? '')) reached = true
  }
  result.tabStopsToRotateButton = reached ? trail.length : null
  result.trailTail = trail.slice(-6)
  if (reached) {
    await page.keyboard.press('Enter')
    await page.waitForTimeout(3000)
    const text = await page.evaluate(() => document.body.innerText)
    result.rotationByKeyboard = /new recovery codes|recovery codes/i.test(text)
    result.afterRotateExcerpt = text.slice(0, 500)
    await shot(page, 'leg7-rotated-360')
  }
  out('leg7-security', result)
} finally {
  await browser.close()
}
