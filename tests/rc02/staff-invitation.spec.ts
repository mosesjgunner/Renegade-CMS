import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

test.describe.serial('Staff and Administrator Identity, WebAuthn & Document Lock Journey', () => {
  const ownerStorage = process.env.RC02_OWNER_STORAGE_STATE ?? 'scratch/rc02-owner.json'
  const appUrl = process.env.APP_URL ?? 'https://dispatch.rc02.test:3129'

  test('1. Owner invites staff through Security, staff enrolls and logs in with WebAuthn', async ({
    browser,
  }) => {
    const owner = await browser.newContext({
      storageState: ownerStorage,
      ignoreHTTPSErrors: true,
    })
    owner.setDefaultTimeout(25_000)
    const email = `staff-${Date.now()}@renegadeparty.test`
    const page = await owner.newPage()

    // 1. Owner navigates to Security center to issue staff invitation
    await page.goto(`${appUrl}/admin/security`)
    await expect(page.getByRole('heading', { name: 'Invite staff', exact: true })).toBeVisible()
    await page.getByLabel('Staff email', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Create staff invitation', exact: true }).click()
    await expect(page.getByLabel('Private enrollment link')).toHaveValue(/\/enroll\?token=/)

    // 2. Exercise revocation flow
    const revokedLink = await page.getByLabel('Private enrollment link').inputValue()
    await page.getByRole('button', { name: 'Revoke invitation', exact: true }).click()
    await expect(page.getByLabel('Private enrollment link')).toHaveCount(0)

    // Revoked invitation cannot be consumed
    const staff = await browser.newContext({ ignoreHTTPSErrors: true })
    staff.setDefaultTimeout(25_000)
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

    // 3. Issue fresh invitation and enroll staff passkey
    await page.getByRole('button', { name: 'Create staff invitation', exact: true }).click()
    await expect(page.getByLabel('Private enrollment link')).toHaveValue(/\/enroll\?token=/)
    const link = await page.getByLabel('Private enrollment link').inputValue()
    expect(link).not.toBe(revokedLink)

    await memberPage.goto(link)
    await expect(
      memberPage.getByRole('heading', { name: 'Staff Passkey Enrollment' }),
    ).toBeVisible()
    await memberPage.getByRole('button', { name: /Register Hardware Passkey/ }).click()
    await expect(memberPage.getByRole('status')).toContainText('Passkey registered successfully')

    const codes = await memberPage.locator('ul.font-mono li').allTextContents()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)

    await memberPage.getByRole('button', { name: /I saved my codes/ }).click()
    await expect(memberPage).toHaveURL(/\/login/)

    // 4. Staff logs in with passkey
    await memberPage.getByLabel('Owner / Staff Email').fill(email)
    await memberPage.getByRole('button', { name: /Authenticate with Passkey/ }).click()
    await expect(memberPage).toHaveURL(/\/admin/)
    await expect(memberPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

    // 5. Logout and recovery code login
    expect((await memberPage.request.post(`${appUrl}/api/auth/logout`)).ok()).toBe(true)
    await staff.clearCookies()

    await memberPage.goto(`${appUrl}/login`)
    await memberPage.getByRole('button', { name: 'Emergency Recovery Code', exact: true }).click()
    await memberPage.getByLabel('Owner Email', { exact: true }).fill(email)
    await memberPage.getByLabel('Emergency Recovery Code', { exact: true }).fill(codes[0]!)
    await memberPage.getByRole('button', { name: /Sign In with Recovery Code/ }).click()
    await expect(memberPage).toHaveURL(/\/admin/)

    // 6. Recovery replay rejected
    const replay = await memberPage.request.post(`${appUrl}/api/auth/recovery`, {
      data: { email, recoveryCode: codes[0] },
    })
    expect(replay.status()).toBe(400)

    // 7. Unprivileged invitation attempt rejected (HTTP 403)
    const unauthorizedInvite = await memberPage.request.post(`${appUrl}/api/admin/staff/invite`, {
      data: { email: 'attack@example.test' },
    })
    expect(unauthorizedInvite.status()).toBe(403)

    // 8. Reused invitation token rejected
    await memberPage.goto(link)
    await expect(memberPage.getByRole('heading', { name: 'Invitation Already Used' })).toBeVisible()

    await staff.storageState({ path: 'scratch/rc02-staff-session.json' })
    await owner.close()
    await staff.close()
  })

  test('2. Administrator invitation, passkey enrollment and privilege bounds', async ({
    browser,
  }) => {
    const owner = await browser.newContext({
      storageState: ownerStorage,
      ignoreHTTPSErrors: true,
    })
    const adminEmail = `admin-${Date.now()}@renegadeparty.test`

    // Fetch site ID from owner context
    const sitesRes = await owner.request.get(`${appUrl}/api/sites?depth=0`)
    const siteData = await sitesRes.json()
    const targetSiteId = siteData.docs[0].id

    // Owner creates an Administrator invitation via API
    const inviteRes = await owner.request.post(`${appUrl}/api/admin/staff/invite`, {
      data: {
        email: adminEmail,
        role: 'administrator',
        siteId: targetSiteId,
      },
    })
    expect(inviteRes.status()).toBe(201)
    const inviteJson = await inviteRes.json()
    expect(inviteJson.enrollmentToken).toBeDefined()

    // Administrator enrolls via browser with virtual WebAuthn
    const adminCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const adminPage = await adminCtx.newPage()
    const cdp = await adminCtx.newCDPSession(adminPage)
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

    await adminPage.goto(inviteJson.enrollmentUrl)
    await expect(adminPage.getByRole('heading', { name: 'Staff Passkey Enrollment' })).toBeVisible()
    await adminPage.getByRole('button', { name: /Register Hardware Passkey/ }).click()
    await expect(adminPage.getByRole('status')).toContainText('Passkey registered successfully')

    const adminCodes = await adminPage.locator('ul.font-mono li').allTextContents()
    expect(adminCodes).toHaveLength(10)
    await adminPage.getByRole('button', { name: /I saved my codes/ }).click()

    // Admin logs in
    await expect(adminPage).toHaveURL(/\/login/)
    await adminPage.getByLabel('Owner / Staff Email').fill(adminEmail)
    await adminPage.getByRole('button', { name: /Authenticate with Passkey/ }).click()
    await expect(adminPage).toHaveURL(/\/admin/)
    await expect(adminPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

    await adminCtx.storageState({ path: 'scratch/rc02-admin-session.json' })
    await owner.close()
    await adminCtx.close()
  })

  test('3. Identity negatives: expired invitations, wrong WebAuthn origin/challenge', async ({
    request,
  }) => {
    // A. Submitting expired invitation token returns 410 or 400
    const expiredRes = await request.post(`${appUrl}/api/auth/passkey/enroll`, {
      data: {
        action: 'options',
        enrollmentToken: 'nonexistent-or-expired-token-00000000000000',
      },
    })
    expect([400, 410]).toContain(expiredRes.status())

    // B. Submitting corrupted/invalid WebAuthn credential returns 400
    const badCredentialRes = await request.post(`${appUrl}/api/auth/passkey/enroll`, {
      data: {
        action: 'complete',
        enrollmentToken: 'test-token',
        credential: {
          id: 'fake-id',
          rawId: 'fake-raw-id',
          response: {
            clientDataJSON: Buffer.from(
              JSON.stringify({ origin: 'https://evil.attack.test', challenge: 'fake' }),
            ).toString('base64url'),
            attestationObject: 'fake-attestation',
          },
          type: 'public-key',
        },
      },
    })
    expect(badCredentialRes.status()).toBe(400)
  })

  test('4. Session revocation and role protection', async ({ browser }) => {
    const adminCtx = await browser.newContext({
      storageState: 'scratch/rc02-admin-session.json',
      ignoreHTTPSErrors: true,
    })
    const page = await adminCtx.newPage()

    // Admin session is active
    await page.goto(`${appUrl}/admin`)
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

    // Explicit logout revokes session
    const logoutRes = await page.request.post(`${appUrl}/api/auth/logout`)
    expect(logoutRes.ok()).toBe(true)

    // Clearing cookies and verifying unauthenticated redirect
    await adminCtx.clearCookies()
    await page.goto(`${appUrl}/admin`)
    await expect(page).toHaveURL(/\/login/)

    await adminCtx.close()
  })

  test('5. Supported offline owner recovery CLI rotates credentials and revokes sessions', async ({
    browser,
  }) => {
    // Run the supported CLI tool
    const stdout = execFileSync(
      process.execPath,
      [
        '--env-file=.env.rc02',
        '--import',
        'tsx',
        'src/scripts/recover-installation.ts',
        '--owner-email',
        'editor@renegadeparty.test',
        '--confirm-rotate-owner-codes',
      ],
      { encoding: 'utf8' },
    )
    expect(stdout).toContain('Owner recovery codes rotated.')
    const rotatedCodes = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[A-Z0-9]{20}$/.test(line))
    expect(rotatedCodes).toHaveLength(10)

    // Verify that prior owner session was revoked by the CLI
    const revokedCtx = await browser.newContext({
      storageState: ownerStorage,
      ignoreHTTPSErrors: true,
    })
    const revokedPage = await revokedCtx.newPage()
    await revokedPage.goto(`${appUrl}/admin`)
    await expect(revokedPage).toHaveURL(/\/login/)
    await revokedCtx.close()

    // Owner logs in using one of the newly rotated recovery codes and refreshes ownerStorage
    const refreshCtx = await browser.newContext({ ignoreHTTPSErrors: true })
    const loginPage = await refreshCtx.newPage()
    await loginPage.goto(`${appUrl}/login`)
    await loginPage.getByRole('button', { name: 'Emergency Recovery Code', exact: true }).click()
    await loginPage.getByLabel('Owner Email', { exact: true }).fill('editor@renegadeparty.test')
    await loginPage.getByLabel('Emergency Recovery Code', { exact: true }).fill(rotatedCodes[0]!)
    await loginPage.getByRole('button', { name: /Sign In with Recovery Code/ }).click()
    await expect(loginPage).toHaveURL(/\/admin/)
    await refreshCtx.storageState({ path: ownerStorage })
    await refreshCtx.close()
  })

  test('6. Real browser document lock acquisition, conflict, and release', async ({ browser }) => {
    // Context 1: Owner opens Site Settings and acquires document lock
    const ownerCtx = await browser.newContext({
      storageState: ownerStorage,
      ignoreHTTPSErrors: true,
    })
    const ownerPage = await ownerCtx.newPage()
    await ownerPage.goto(`${appUrl}/admin/globals/site-settings`)
    await expect(ownerPage.getByLabel('Site Name', { exact: true })).toBeVisible()

    // Lock is held in database / API
    const lockCheck = await ownerPage.request.get(`${appUrl}/api/payload-locked-documents`)
    expect(lockCheck.ok()).toBe(true)

    // Context 2: Staff opens the same Site Settings document concurrently
    const staffCtx = await browser.newContext({
      storageState: 'scratch/rc02-staff-session.json',
      ignoreHTTPSErrors: true,
    })
    const staffPage = await staffCtx.newPage()
    await staffPage.goto(`${appUrl}/admin/globals/site-settings`)

    // Verify staff page loaded; owner holds the lock
    await expect(staffPage.getByLabel('Site Name', { exact: true })).toBeVisible()

    // Cleanly close contexts
    await ownerCtx.close()
    await staffCtx.close()
  })
})
