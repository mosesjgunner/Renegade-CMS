import { expect, test } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'

const web = 'rc1r01b20261102-renegade-web-1'
const database = 'rc1r01b20261102-postgres-1'
const ownerEmail = 'owner@rc1-01b.test'

function setupToken(): string {
  const output = spawnSync('docker', ['logs', web], { encoding: 'utf8' })
  if (output.status !== 0) throw new Error('Could not read local web logs')
  const logs = output.stdout + output.stderr
  const matches = [...logs.matchAll(/Renegade CMS setup token \(expires in 15 minutes; use once\): ([A-Za-z0-9_-]{43})/g)]
  const token = matches.at(-1)?.[1]
  if (!token) throw new Error('Setup token missing from supported web logs')
  return token
}

function recoverToken(): string {
  const command = spawnSync('docker', ['exec', web, 'npm', 'run', 'installation:recover'], { encoding: 'utf8' })
  if (command.status !== 0) throw new Error('Local installation recovery failed: ' + command.stderr)
  const output = command.stdout + command.stderr
  const token = output.match(/Renegade CMS setup token \(expires in 15 minutes; use once\): ([A-Za-z0-9_-]{43})/)?.[1]
  if (!token) throw new Error('Recovery command did not provide a setup token')
  return token
}

function state() {
  const sql = `SELECT json_build_object(
    'installation', (SELECT state FROM installation_state),
    'users', (SELECT count(*) FROM users),
    'owner_role', (SELECT role FROM users LIMIT 1),
    'passkeys', (SELECT count(*) FROM passkeys),
    'codes', (SELECT count(*) FROM recovery_codes),
    'used_codes', (SELECT count(*) FROM recovery_codes WHERE used_at IS NOT NULL),
    'sites', (SELECT count(*) FROM sites),
    'grants', (SELECT count(*) FROM member_site_roles)
  )`
  const result = execFileSync('docker', ['exec', database, 'psql', '-U', 'renegade', '-d', 'renegade', '-Atc', sql], { encoding: 'utf8' }).trim()
  return JSON.parse(result)
}

async function post(page: import('@playwright/test').Page, path: string, data: unknown) {
  return page.evaluate(async ({ path, data }) => {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    let body: any = null
    try {
      body = await response.json()
    } catch {
      body = await response.text()
    }
    return { status: response.status, body }
  }, { path, data })
}

test('ordinary owner setup, passkey login, recovery and state persistence (R-01B)', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  // 1. Initial reaching of /setup and token issuance
  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'Make this site yours.' })).toBeVisible({ timeout: 15000 })
  const first = setupToken()
  expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
  const before = state()
  expect(before).toMatchObject({ installation: 'incomplete', users: 0, passkeys: 0, codes: 0, sites: 0, grants: 0 })

  // 2. Denial: Invalid setup token
  const bad = await post(page, '/api/setup/options', { email: ownerEmail, token: 'wrong-token-value-that-fails' })
  expect(bad.status).toBe(400)
  expect(state()).toEqual(before)

  // 3. Denial: Expired setup token
  execFileSync('docker', ['exec', database, 'psql', '-U', 'renegade', '-d', 'renegade', '-c', "UPDATE installation_state SET bootstrap_expires_at = now() - interval '1 minute';"])
  const expired = await post(page, '/api/setup/options', { email: ownerEmail, token: first })
  expect(expired.status).toBe(400)
  expect((expired.body as { error: string }).error).toContain('expired')
  expect(state()).toEqual(before)
  execFileSync('docker', ['exec', database, 'psql', '-U', 'renegade', '-d', 'renegade', '-c', "UPDATE installation_state SET bootstrap_expires_at = now() + interval '15 minutes';"])

  // 4. Interrupted enrollment & local CLI recovery
  const interrupted = await post(page, '/api/setup/options', { email: ownerEmail, token: first })
  expect(interrupted.status).toBe(200)
  expect(state().installation).toBe('installing')

  const fresh = recoverToken()
  expect(fresh).not.toBe(first)
  expect(fresh).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(state()).toEqual(before)

  // Denial: Stale token cannot be reused
  const stale = await post(page, '/api/setup/options', { email: ownerEmail, token: first })
  expect(stale.status).toBe(400)
  expect(state()).toEqual(before)

  // 5. Complete Setup UI Journey
  await page.reload()
  await page.getByLabel('Bootstrap token').fill(fresh)
  await page.getByLabel('Owner email').fill(ownerEmail)
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByLabel('Site or publication name').fill('R-01B Owner Site')
  await page.getByLabel('Site slug').fill('rc1-r01b-owner')
  await page.getByLabel('Primary URL').fill('https://rc1-01b.test:38756')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // 6. Denials: Wrong WebAuthn challenge and wrong origin
  let rejected = false
  await page.route('**/api/setup/complete', async route => {
    if (!rejected) {
      rejected = true
      const body = route.request().postDataJSON()
      const data = JSON.parse(Buffer.from(body.credential.response.clientDataJSON, 'base64url').toString())
      for (const change of [{ challenge: 'invalid' }, { origin: 'https://wrong-origin.test' }]) {
        const mutated = structuredClone(body)
        mutated.credential.response.clientDataJSON = Buffer.from(JSON.stringify({ ...data, ...change })).toString('base64url')
        const denied = await post(page, '/api/setup/complete', mutated)
        expect(denied.status).toBe(400)
        expect(state()).toEqual({ ...before, installation: 'installing' })
      }
    }
    await route.continue()
  })

  // 7. Enrolling passkey & site creation
  await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
  await expect(page.getByRole('heading', { name: 'Your site is ready to shape.' })).toBeVisible({ timeout: 30000 })
  await page.screenshot({ path: 'docs/rc/evidence/rc1/repairs/R-01B/setup.png', fullPage: true })

  const codes = await page.locator('ul.font-mono > li').allTextContents()
  expect(codes).toHaveLength(10)
  expect(new Set(codes).size).toBe(10)
  expect(codes.every(c => /^[A-F0-9]{20}$/.test(c))).toBe(true)

  // Persisted database state after setup
  expect(state()).toMatchObject({
    installation: 'complete',
    users: 1,
    owner_role: 'owner',
    passkeys: 1,
    codes: 10,
    used_codes: 0,
    sites: 1,
    grants: 1,
  })

  // Denial: Reused setup token
  const reused = await post(page, '/api/setup/options', { email: ownerEmail, token: fresh })
  expect(reused.status).toBe(410)

  // 8. Reach Dashboard, then clean-cookie logout
  const creds = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
  expect(creds.credentials.length).toBeGreaterThanOrEqual(1)

  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin/)
  await post(page, '/api/auth/logout', {})
  await context.clearCookies()

  // 9. Clean Browser Context Passkey Login
  const cleanPage = await context.newPage()
  cleanPage.on('pageerror', error => errors.push(error.message))
  const cleanCdp = await context.newCDPSession(cleanPage)
  await cleanCdp.send('WebAuthn.enable')
  const { authenticatorId: cleanAuthId } = await cleanCdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  for (const c of creds.credentials) {
    await cleanCdp.send('WebAuthn.addCredential', {
      authenticatorId: cleanAuthId,
      credential: c,
    })
  }

  await cleanPage.goto('/login')
  await cleanPage.getByLabel('Owner / Staff Email').fill(ownerEmail)
  await cleanPage.getByRole('button', { name: /Authenticate with Passkey/ }).click()
  await expect(cleanPage).toHaveURL(/\/admin/, { timeout: 20000 })
  await cleanPage.screenshot({ path: 'docs/rc/evidence/rc1/repairs/R-01B/login.png', fullPage: true })

  // 10. Emergency Recovery Code Flow
  await post(cleanPage, '/api/auth/logout', {})
  await context.clearCookies()

  await cleanPage.goto('/login')
  await cleanPage.getByRole('button', { name: 'Emergency Recovery Code' }).click()
  await cleanPage.getByLabel('Owner Email').fill(ownerEmail)
  await cleanPage.getByLabel('Emergency Recovery Code').fill(codes[0]!)
  await cleanPage.getByRole('button', { name: /Sign In with Recovery Code/ }).click()
  await expect(cleanPage).toHaveURL(/\/admin/, { timeout: 20000 })
  await cleanPage.screenshot({ path: 'docs/rc/evidence/rc1/repairs/R-01B/recovery.png', fullPage: true })

  // Recovery code used: exactly 1 used, 9 remaining
  expect(state()).toMatchObject({
    installation: 'complete',
    users: 1,
    passkeys: 1,
    codes: 10,
    used_codes: 1,
    sites: 1,
    grants: 1,
  })

  // Denial: Replaying the used recovery code must be denied
  const replay = await post(cleanPage, '/api/auth/recovery', { email: ownerEmail, recoveryCode: codes[0] })
  expect(replay.status).toBe(400)
  expect(state().used_codes).toBe(1)

  // 11. Production Restart Persistence
  execFileSync('docker', ['restart', web])
  let ready = false
  for (let i = 0; i < 30; i++) {
    try {
      const probe = spawnSync('docker', ['exec', web, 'node', '-e', 'fetch("http://127.0.0.1:3000/health/ready").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'])
      if (probe.status === 0) {
        ready = true
        break
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  expect(ready).toBe(true)

  // State persists post-restart
  const afterRestart = state()
  expect(afterRestart).toMatchObject({
    installation: 'complete',
    users: 1,
    owner_role: 'owner',
    passkeys: 1,
    codes: 10,
    used_codes: 1,
    sites: 1,
    grants: 1,
  })

  // Authenticate again with passkey after full container restart
  await post(cleanPage, '/api/auth/logout', {})
  await context.clearCookies()
  await cleanPage.goto('/login')
  await cleanPage.getByLabel('Owner / Staff Email').fill(ownerEmail)
  await cleanPage.getByRole('button', { name: /Authenticate with Passkey/ }).click()
  await expect(cleanPage).toHaveURL(/\/admin/, { timeout: 20000 })
  await cleanPage.screenshot({ path: 'docs/rc/evidence/rc1/repairs/R-01B/post-restart.png', fullPage: true })

  // 12. Denial: Revoked session cannot access /admin
  await post(cleanPage, '/api/auth/logout', {})
  await cleanPage.goto('/admin')
  await expect(cleanPage).toHaveURL(/\/login/)

  // Clean up CDP authenticators
  await cleanCdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: cleanAuthId })
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })

  expect(errors).toEqual([])
})

