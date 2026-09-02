import { expect, test } from '@playwright/test'

// This spec intentionally never imports Payload, installation services, or a database client.
// A01_SETUP_TOKEN is captured by the supported launcher from `docker compose logs renegade-web`.
// That makes the browser exercise the same local-only token handoff an operator uses.

test.use({ trace: 'on', video: 'on' })

const setupToken = process.env.A01_SETUP_TOKEN

test('operator completes setup and later logs in again through HTTP routes and WebAuthn', async ({
  page,
  context,
}) => {
  if (!setupToken) throw new Error('A01_SETUP_TOKEN must come from the local web-container log')
  expect(setupToken).toMatch(/^[A-Za-z0-9_-]{43}$/)

  const authenticator = await context.newCDPSession(page)
  await authenticator.send('WebAuthn.enable')
  await authenticator.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  // Invalid tokens cannot start a registration session and the safe error does not echo it.
  const invalid = await page.request.post('/api/setup/options', {
    data: { email: 'owner@a01.test', token: 'invalid-token' },
  })
  expect(invalid.status()).toBe(400)
  expect(await invalid.json()).toEqual({ error: 'The bootstrap token is invalid.' })

  await page.goto('/setup')
  await page.getByLabel('Bootstrap token').fill(setupToken)
  await page.getByLabel('Owner email').fill('owner@a01.test')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Site or publication name').fill('A-01 Acceptance Site')
  await page.getByLabel('Site slug').fill('a01-acceptance-site')
  await page.getByLabel('Primary URL').fill(process.env.A01_PUBLIC_URL ?? 'http://localhost:3201')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()

  await expect(page.getByRole('heading', { name: 'Your site is ready to shape.' })).toBeVisible()
  await expect(page.getByText('Save emergency recovery codes')).toBeVisible()
  await expect(page.getByText('Production HTTPS boundary')).toBeVisible()
  const recoveryCodes = await page.locator('ul.font-mono > li').allTextContents()
  expect(recoveryCodes).toHaveLength(10)
  expect(new Set(recoveryCodes).size).toBe(10)

  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'Setup Complete' })).toBeVisible()
  await expect(page.getByText(recoveryCodes[0]!)).toHaveCount(0)

  // A reused token reaches the real route but cannot reopen setup.
  const reused = await page.request.post('/api/setup/options', {
    data: { email: 'owner@a01.test', token: setupToken },
  })
  expect(reused.status()).toBe(410)

  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin/)
  const logout = await page.request.post('/api/auth/logout')
  expect(logout.ok()).toBeTruthy()
  expect((await context.cookies()).some((cookie) => cookie.name === 'renegade-passkey')).toBe(false)

  // A clean browser session still uses the enrolled passkey, but no saved auth cookie.
  await context.clearCookies()
  await page.goto('/login')
  await page.getByLabel('Owner / Staff Email').fill('owner@a01.test')
  await page.getByRole('button', { name: /Authenticate with Passkey/ }).click()
  await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 })
})
