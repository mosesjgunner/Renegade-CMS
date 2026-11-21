// RC3-06 leg 7: admin recovery with keyboard only at a narrow
// (phone-width) viewport. The script first completes setup normally
// (mouse allowed — setup itself is legs 1-2), then clears the session
// and performs the recovery-relevant journey keyboard-only:
//   login with passkey -> Admin -> Security Center -> rotate recovery
//   codes (the documented "lost your codes" path, kit task card 6).
// After every Tab stop it records the focused element and whether a
// visible focus indicator is computed; it also measures horizontal
// overflow at 360px on each surface it visits.
import { addAuthenticator, BASE, fillReliable, launch, out, readToken, shot } from './lib.mjs'

const token = readToken()
const email = process.env.RC306_EMAIL ?? 'owner@rc306.test'
const VIEWPORT = { width: 360, height: 740 }

const { browser, context, page } = await launch(VIEWPORT)
const focusTrail = []
async function recordFocus(pageRef, label) {
  const info = await pageRef.evaluate(() => {
    const el = document.activeElement
    if (!el) return { label, tag: null }
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName,
      text: (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 60),
      outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
      boxShadow: cs.boxShadow === 'none' ? 'none' : 'present',
    }
  })
  focusTrail.push({ label, ...info })
  return info
}
async function overflow(pageRef, label) {
  const data = await pageRef.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  return { label, ...data, overflows: data.scrollWidth > data.innerWidth + 1 }
}

const result = { viewport: VIEWPORT, overflow: [] }
try {
  await addAuthenticator(context, page)
  page.on('dialog', (dialog) => void dialog.accept())

  // --- Setup (prerequisite; mouse permitted here) ---
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
  await fillReliable(page, 'Site or publication name', 'Keyboard Site')
  await fillReliable(page, 'Site slug', 'keyboard-site')
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
  result.setupDone = true

  // --- Sign out; from here on: keyboard only ---
  await page.request.post(BASE + '/api/auth/logout')
  await context.clearCookies()
  await page.goto(BASE + '/login')
  await page.waitForTimeout(800)
  result.overflow.push(await overflow(page, '/login @360px'))
  await shot(page, 'leg7-login-360')

  // Tab from the top of the login page to the email field.
  await page.evaluate(() => document.body.focus())
  let reachedEmail = false
  for (let i = 0; i < 25 && !reachedEmail; i++) {
    await page.keyboard.press('Tab')
    const info = await recordFocus(page, `login tab ${i + 1}`)
    if (info.tag === 'INPUT') reachedEmail = true
  }
  result.reachedEmailByTab = reachedEmail
  await page.keyboard.type(email)
  // Tab onward to the passkey button and press it with Enter.
  let reachedButton = false
  for (let i = 0; i < 25 && !reachedButton; i++) {
    await page.keyboard.press('Tab')
    const info = await recordFocus(page, `login->button tab ${i + 1}`)
    if (info.tag === 'BUTTON' && /passkey/i.test(info.text ?? '')) reachedButton = true
  }
  result.reachedPasskeyButtonByTab = reachedButton
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/admin/, { timeout: 20_000 })
  result.keyboardLoginReachedAdmin = true
  result.overflow.push(await overflow(page, '/admin @360px'))
  await shot(page, 'leg7-admin-360')

  // Keyboard to the address bar, go to the Security Center.
  await page.keyboard.press('Control+l')
  await page.keyboard.type('http://localhost:3110/admin/security')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  result.securityUrl = page.url()
  result.overflow.push(await overflow(page, '/admin/security @360px'))
  await shot(page, 'leg7-security-360')

  // Tab to "Generate new recovery codes" and activate it by keyboard.
  let reachedRotate = false
  for (let i = 0; i < 60 && !reachedRotate; i++) {
    await page.keyboard.press('Tab')
    const info = await recordFocus(page, `security tab ${i + 1}`)
    if (info.tag === 'BUTTON' && /Generate new recovery codes/.test(info.text ?? ''))
      reachedRotate = true
  }
  result.reachedRotateByTab = reachedRotate
  if (reachedRotate) {
    await page.keyboard.press('Enter')
    await page.waitForTimeout(3000)
    const text = await page.evaluate(() => document.body.innerText)
    result.rotationProducedCodes = /recovery/i.test(text) && text.length > 200
    result.securityExcerpt = text.slice(0, 700)
    await shot(page, 'leg7-rotated-360')
  }
  result.focusTrail = focusTrail
  out('leg7', result)
} finally {
  await browser.close()
}
