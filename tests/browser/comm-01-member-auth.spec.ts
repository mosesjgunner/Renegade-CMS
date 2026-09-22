import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { issueMagicLink } from '@/modules/identity/member-identity'

test('COMM-01 member browser journey keeps admin and member auth separate and supports passkey recovery', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  const email = `comm01-${randomUUID()}@example.test`

  try {
    // The magic-link token is minted by the real identity service; email
    // adapter capture is covered separately because the standalone browser
    // server cannot expose process-local development mail to this test process.
    const issued = await issueMagicLink(payload as never, email)
    expect(issued.token).toBeTruthy()

    await page.goto(`/member-auth/verify?token=${encodeURIComponent(issued.token!)}`)
    await expect(page.getByRole('status')).toHaveText('Signed in.')
    await expect(page.getByRole('link', { name: 'Member settings' })).toBeVisible()
    const memberCookie = (await context.cookies()).find(
      (cookie) => cookie.name === 'renegade-member',
    )
    expect(memberCookie?.httpOnly).toBe(true)
    expect((await context.cookies()).some((cookie) => cookie.name === 'renegade-passkey')).toBe(
      false,
    )

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

    await page.getByRole('link', { name: 'Member settings' }).click()
    await expect(page.getByRole('heading', { name: 'Member settings' })).toBeVisible()
    await page.getByRole('button', { name: 'Add a passkey' }).click()
    await expect(page.getByRole('status')).toHaveText('Passkey enrolled.')

    // CDP virtual authenticators are scoped to a browser context. Clearing all
    // cookies gives this context the same unauthenticated state as a clean
    // member browser session while preserving the enrolled authenticator.
    await context.clearCookies()
    await page.goto('/member-auth')
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click()
    await expect(page).toHaveURL(/\/members\/settings/, { timeout: 20_000 })
    const cleanCookies = await context.cookies()
    expect(cleanCookies.some((cookie) => cookie.name === 'renegade-member')).toBe(true)
    expect(cleanCookies.some((cookie) => cookie.name === 'renegade-passkey')).toBe(false)
  } finally {
    await payload.db.destroy?.()
  }
})
