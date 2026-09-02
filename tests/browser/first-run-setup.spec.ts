import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { ensureBootstrap } from '@/modules/operations/installation'
import { loadConfig } from '@/modules/core/config'

// True end-to-end coverage of the first-run installer, driven through the real
// /setup UI in a real browser with a virtual WebAuthn authenticator. This is the
// path a normal operator takes: enroll a passkey, make onboarding choices, and
// complete installation. It exercises `completeInstallation` ->
// `provisionOnboardingSite`, the code path where the owner-profile `handle` bug
// used to crash setup with a generic "Setup is unavailable." error.
//
// If the handle fix is reverted, /api/setup/complete returns an error instead of
// 201, the recovery codes never render, and this test fails — so the installer
// cannot silently regress.

const CANONICAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

test('a normal operator completes first-run setup, sees recovery codes once, and setup then locks', async ({
  page,
  context,
}) => {
  // Reset the install gate and mint a fresh one-time bootstrap token. ensureBootstrap
  // logs the token via console.warn; capture it the same way the integration suite does.
  const payload = await getPayload({ config })
  await payload.db.pool.query('DELETE FROM installation_state')
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(String(args[0] ?? ''))
  }
  let token = ''
  try {
    const status = await ensureBootstrap(payload, loadConfig())
    expect(status.state).toBe('incomplete')
    token = warnings.map((line) => line.match(/: ([A-Za-z0-9_-]+)$/)?.[1]).find(Boolean) ?? ''
  } finally {
    console.warn = originalWarn
  }
  expect(token).toHaveLength(43)

  // Register a virtual WebAuthn authenticator so navigator.credentials.create()
  // succeeds without any real hardware or user gesture.
  const client = await context.newCDPSession(page)
  await client.send('WebAuthn.enable')
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  const slug = `firstrun-${randomUUID().slice(0, 8)}`
  const ownerEmail = `${slug}@owner.test`

  page.on('console', (msg) => console.log('[BROWSER CONSOLE]', msg.text()))
  page.on('pageerror', (err) => console.log('[BROWSER ERROR]', err.message))

  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'Make this site yours.' })).toBeVisible()

  // Step 1 - Secure owner: bootstrap token + owner email. Re-fill until the
  // controlled inputs register (guards against a client hydration race where an
  // early fill sets the DOM value before React attaches its onChange handlers).
  const continueButton = page.getByRole('button', { name: 'Continue' })
  await page.getByLabel('Bootstrap token').click()
  await page.getByLabel('Bootstrap token').fill(token)
  await page.getByLabel('Owner email').click()
  await page.getByLabel('Owner email').fill(ownerEmail)
  await expect(continueButton).toBeEnabled({ timeout: 15_000 })
  await continueButton.click()

  // Step 2 - Site identity.
  await page.getByLabel('Site or publication name').fill('First Run Site')
  await page.getByLabel('Site slug').fill(slug)
  await page.getByLabel('Primary URL').fill('http://localhost:3110')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 3 - Brand & starter (defaults are valid).
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 4 - Features (defaults are valid).
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 5 - Finish: enroll passkey & create the site.
  await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()

  // Success: the completion screen renders recovery codes exactly once.
  await expect(page.getByRole('heading', { name: 'Your site is ready to shape.' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText('Save emergency recovery codes')).toBeVisible()
  const codes = page.locator('ul.font-mono > li')
  expect(await codes.count()).toBeGreaterThan(0)

  // The authenticated owner session cookie is set.
  const cookies = await context.cookies()
  const sessionCookie = cookies.find((cookie) => cookie.name === 'renegade-passkey')
  expect(sessionCookie?.value).toBeTruthy()

  // The owner profile was provisioned with a valid, canonical handle (the fix).
  const member = (
    await payload.find({
      collection: 'members',
      where: { email: { equals: ownerEmail } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as { id: string } | undefined
  expect(member).toBeTruthy()
  const profile = (
    await payload.find({
      collection: 'profiles',
      where: { member: { equals: member!.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as { handle?: string } | undefined
  expect(profile?.handle).toBeTruthy()
  expect(profile!.handle!).toMatch(CANONICAL_SLUG)

  // Revisiting /setup is now permanently locked - setup cannot be re-run from the browser.
  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'Setup Complete' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Make this site yours.' })).toHaveCount(0)

  await payload.db.destroy?.()
})
