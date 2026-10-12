import { test, expect } from '@playwright/test'
import fs from 'node:fs'
test('Owner invites staff through Security, staff enrolls and logs in with WebAuthn', async ({
  browser,
}) => {
  const owner = await browser.newContext({
    storageState: process.env.RC02_OWNER_STORAGE_STATE ?? 'scratch/rc02-owner.json',
    ignoreHTTPSErrors: true,
  })
  owner.setDefaultTimeout(20_000)
  const email = `staff-${Date.now()}@renegadeparty.test`
  const page = await owner.newPage()
  await page.goto(process.env.APP_URL + '/admin/security')
  await expect(page.getByRole('heading', { name: 'Invite staff', exact: true })).toBeVisible()
  await page.getByLabel('Staff email', { exact: true }).fill(email)
  await page.getByRole('button', { name: 'Create staff invitation', exact: true }).click()
  await expect(page.getByLabel('Private enrollment link')).toHaveValue(/\/enroll\?token=/)
  const revokedLink = await page.getByLabel('Private enrollment link').inputValue()
  await page.getByRole('button', { name: 'Revoke invitation', exact: true }).click()
  await expect(page.getByLabel('Private enrollment link')).toHaveCount(0)
  const staff = await browser.newContext({ ignoreHTTPSErrors: true })
  staff.setDefaultTimeout(20_000)
  const memberPage = await staff.newPage()
  const cdp = await staff.newCDPSession(memberPage)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  await memberPage.goto(revokedLink)
  await expect(memberPage.getByRole('heading', { name: 'Invitation Already Used' })).toBeVisible()
  await page.getByRole('button', { name: 'Create staff invitation', exact: true }).click()
  await expect(page.getByLabel('Private enrollment link')).toHaveValue(/\/enroll\?token=/)
  const link = await page.getByLabel('Private enrollment link').inputValue()
  expect(link).not.toBe(revokedLink)
  await memberPage.goto(link)
  await expect(memberPage.getByRole('heading', { name: 'Staff Passkey Enrollment' })).toBeVisible()
  await memberPage.getByRole('button', { name: /Register Hardware Passkey/ }).click()
  await expect(memberPage.getByRole('status')).toContainText('Passkey registered successfully')
  const codes = await memberPage.locator('ul.font-mono li').allTextContents()
  expect(codes).toHaveLength(10)
  expect(new Set(codes).size).toBe(10)
  await memberPage.getByRole('button', { name: /I saved my codes/ }).click()
  await expect(memberPage).toHaveURL(/\/login/)
  await memberPage.getByLabel('Owner / Staff Email').fill(email)
  await memberPage.getByRole('button', { name: /Authenticate with Passkey/ }).click()
  await expect(memberPage).toHaveURL(/\/admin/)
  await expect(memberPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  expect((await memberPage.request.post(process.env.APP_URL + '/api/auth/logout')).ok()).toBe(true)
  await staff.clearCookies()
  await memberPage.goto(process.env.APP_URL + '/login')
  await memberPage.getByRole('button', { name: 'Emergency Recovery Code', exact: true }).click()
  await memberPage.getByLabel('Owner Email', { exact: true }).fill(email)
  await memberPage.getByLabel('Emergency Recovery Code', { exact: true }).fill(codes[0]!)
  await memberPage.getByRole('button', { name: /Sign In with Recovery Code/ }).click()
  await expect(memberPage).toHaveURL(/\/admin/)
  const replay = await memberPage.request.post(process.env.APP_URL + '/api/auth/recovery', {
    data: { email, recoveryCode: codes[0] },
  })
  expect(replay.status()).toBe(400)
  expect(
    (
      await memberPage.request.post(process.env.APP_URL + '/api/admin/staff/invite', {
        data: { email: 'attack@example.test' },
      })
    ).status(),
  ).toBe(403)
  await memberPage.goto(link)
  await expect(memberPage.getByRole('heading', { name: 'Invitation Already Used' })).toBeVisible()
  await staff.storageState({ path: 'scratch/rc02-staff-session.json' })
  await owner.close()
  await staff.close()
})
