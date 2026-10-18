import { expect, test } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'

const web = 'rc101b20261017-renegade-web-1'
const database = 'rc101b20261017-postgres-1'
const ownerEmail = 'owner@rc1-01b.test'

function setupToken() {
  const output = spawnSync('docker', ['logs', web], { encoding: 'utf8' })
  if (output.status !== 0) throw new Error('Could not read local web logs')
  const logs = output.stdout + output.stderr
  const matches = [...logs.matchAll(/Renegade CMS setup token \(expires in 15 minutes; use once\): ([A-Za-z0-9_-]{43})/g)]
  const token = matches.at(-1)?.[1]
  if (!token) throw new Error('Setup token missing from supported web logs')
  return token
}

function recoverToken() {
  const command = spawnSync('docker', ['exec', web, 'npm', 'run', 'installation:recover'], { encoding: 'utf8' })
  if (command.status !== 0) throw new Error('Local installation recovery failed')
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
    'sites', (SELECT count(*) FROM sites),
    'grants', (SELECT count(*) FROM member_site_roles)
  )`
  return JSON.parse(execFileSync('docker', ['exec', database, 'psql', '-U', 'renegade', '-d', 'renegade', '-Atc', sql], { encoding: 'utf8' }).trim())
}

async function post(page: import('@playwright/test').Page, path: string, data: unknown) {
  return page.evaluate(async ({ path, data }) => {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    return { status: response.status, body: await response.json() }
  }, { path, data })
}

test('ordinary owner setup, passkey login, recovery and state', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } })
  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'Make this site yours.' })).toBeVisible()
  const first = setupToken()
  const before = state()
  expect(before).toMatchObject({ installation: 'incomplete', users: 0, passkeys: 0, codes: 0, sites: 0, grants: 0 })

  // Invalid token denial
  const bad = await post(page, '/api/setup/options', { email: ownerEmail, token: 'wrong-token' })
  expect(bad.status).toBe(400)
  expect(state()).toEqual(before)

  // Expired token denial
  execFileSync('docker', ['exec', database, 'psql', '-U', 'renegade', '-d', 'renegade', '-c', "UPDATE installation_state SET bootstrap_expires_at = now() - interval '1 minute';"])
  const expired = await post(page, '/api/setup/options', { email: ownerEmail, token: first })
  expect(expired.status).toBe(400)
  expect((expired.body as { error: string }).error).toContain('expired')
  expect(state()).toEqual(before)
  execFileSync('docker', ['exec', database, 'psql', '-U', 'renegade', '-d', 'renegade', '-c', "UPDATE installation_state SET bootstrap_expires_at = now() + interval '15 minutes';"])

  // Interrupt enrollment after options and recover through the supported local CLI.
  const interrupted = await post(page, '/api/setup/options', { email: ownerEmail, token: first })
  expect(interrupted.status).toBe(200)
  expect(state().installation).toBe('installing')
  const fresh = recoverToken()
  expect(fresh).not.toBe(first)
  expect(state()).toEqual(before)
  const stale = await post(page, '/api/setup/options', { email: ownerEmail, token: first })
  expect(stale.status).toBe(400)
  expect(state()).toEqual(before)

  await page.reload()
  await page.getByLabel('Bootstrap token').fill(fresh)
  await page.getByLabel('Owner email').fill(ownerEmail)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Site or publication name').fill('01B Owner Site')
  await page.getByLabel('Site slug').fill('rc1-01b-owner')
  await page.getByLabel('Primary URL').fill('https://rc1-01b.test:38743')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
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
  await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
  await expect(page.getByRole('heading', { name: 'Your site is ready to shape.' })).toBeVisible({ timeout: 30000 })
  await page.screenshot({ path: 'docs/rc/evidence/rc1/18-pass/01B/setup.png', fullPage: true })
  const codes = await page.locator('ul.font-mono > li').allTextContents()
  expect(codes).toHaveLength(10)
  expect(state()).toMatchObject({ installation: 'complete', users: 1, owner_role: 'owner', passkeys: 1, codes: 10, sites: 1, grants: 1 })
  const reused = await post(page, '/api/setup/options', { email: ownerEmail, token: fresh })
  expect(reused.status).toBe(410)

  const creds = await cdp.send('WebAuthn.getCredentials', { authenticatorId })

  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin/)
  await post(page, '/api/auth/logout', {})
  await context.clearCookies()

  const cleanPage = await context.newPage()
  cleanPage.on('pageerror', error => errors.push(error.message))
  const cleanCdp = await context.newCDPSession(cleanPage)
  await cleanCdp.send('WebAuthn.enable')
  const { authenticatorId: cleanAuthId } = await cleanCdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true,
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
  await cleanPage.screenshot({ path: 'docs/rc/evidence/rc1/18-pass/01B/login.png', fullPage: true })

  await post(cleanPage, '/api/auth/logout', {})
  await context.clearCookies()
  await cleanPage.goto('/login')
  await cleanPage.getByRole('button', { name: 'Emergency Recovery Code' }).click()
  await cleanPage.getByLabel('Owner Email').fill(ownerEmail)
  await cleanPage.getByLabel('Emergency Recovery Code').fill(codes[0]!)
  await cleanPage.getByRole('button', { name: /Sign In with Recovery Code/ }).click()
  await expect(cleanPage).toHaveURL(/\/admin/, { timeout: 20000 })
  const replay = await post(cleanPage, '/api/auth/recovery', { email: ownerEmail, recoveryCode: codes[0] })
  expect(replay.status).toBe(400)
  expect(state()).toMatchObject({ installation: 'complete', users: 1, passkeys: 1, codes: 10, sites: 1, grants: 1 })

  // Web container restart: ensure initial site state and sensitive credentials persist
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

  const afterRestart = state()
  expect(afterRestart).toMatchObject({
    installation: 'complete',
    users: 1,
    owner_role: 'owner',
    passkeys: 1,
    codes: 10,
    sites: 1,
    grants: 1,
  })

  // Authenticate again after restart to prove credentials work post-restart
  await post(cleanPage, '/api/auth/logout', {})
  await context.clearCookies()
  await cleanPage.goto('/login')
  await cleanPage.getByLabel('Owner / Staff Email').fill(ownerEmail)
  await cleanPage.getByRole('button', { name: /Authenticate with Passkey/ }).click()
  await expect(cleanPage).toHaveURL(/\/admin/, { timeout: 20000 })

  await cleanCdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: cleanAuthId })
  await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
  expect(errors).toEqual([])
})
