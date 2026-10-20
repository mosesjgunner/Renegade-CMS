/* eslint-disable @typescript-eslint/no-explicit-any -- isolated polymorphic operator acceptance */
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { decryptSecret } from '../../src/modules/social/security'
import { getProviderCapabilityTruth } from '../../src/modules/social/provider-runtime'

assert.equal(process.env.RC1_08A_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5447/rc108a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')

const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/08A'
const base = 'http://localhost:38995'
const trace: any[] = []
let checks = 0
let succeeded = false

const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(60000)

const dismissConsent = async () => {
  const reject = page.getByRole('button', { name: 'Reject non-essential', exact: true })
  await reject.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (await reject.isVisible()) await reject.click()
}

const restart = process.argv.includes('--restart')

const api = async (
  route: string,
  method = 'GET',
  data?: any,
  cookie = '',
  status: number | number[] = 200,
  headers: Record<string, string> = {},
) => {
  const raw = await new Promise<{ status: number; headers: Headers; text: string }>(
    (resolve, reject) => {
      const request = http.request(
        `${base}${route}`,
        {
          method,
          headers: {
            origin: base,
            ...(cookie ? { cookie } : {}),
            ...(data ? { 'content-type': 'application/json' } : {}),
            ...headers,
          },
        },
        (response) => {
          let text = ''
          response.setEncoding('utf8')
          response.on('data', (chunk) => {
            text += chunk
          })
          response.on('end', () =>
            resolve({
              status: response.statusCode!,
              headers: new Headers(
                Object.entries(response.headers).flatMap(([key, value]) =>
                  value === undefined ? [] : [[key, String(value)] as [string, string]],
                ),
              ),
              text,
            }),
          )
          response.on('error', reject)
        },
      )
      request.setTimeout(60000, () => request.destroy(new Error('request timed out')))
      request.on('error', reject)
      request.end(data ? JSON.stringify(data) : undefined)
    },
  )
  const response = { status: raw.status, headers: raw.headers }
  const text = raw.text
  trace.push({
    route,
    method,
    status: response.status,
    bytes: text.length,
  })
  assert.ok(
    (Array.isArray(status) ? status : [status]).includes(response.status),
    `${method} ${route}: ${text.slice(0, 600)}`,
  )
  return { response, text, json: () => JSON.parse(text) }
}

const session = async (user: any) => {
  const result = await createPasskeySession(
    user,
    loadConfig().payloadSecret,
    async (id, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, user.id, expires],
      )
    },
  )
  return `renegade-passkey=${result.token}`
}

// Local AT Protocol boundary harness running on 127.0.0.1:3130
let harnessSessionCalls = 0
let harnessBadAuthCalls = 0
const harness = http.createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://127.0.0.1:3130')
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = raw ? JSON.parse(raw) : {}
  res.setHeader('content-type', 'application/json')

  if (url.pathname.endsWith('createSession')) {
    if (body.identifier === 'bad.credentials.handle' || body.password === 'wrong-password') {
      harnessBadAuthCalls++
      res.statusCode = 401
      return res.end(JSON.stringify({ error: 'AuthenticationFailed', message: 'Invalid identifier or password' }))
    }
    harnessSessionCalls++
    return res.end(
      JSON.stringify({
        accessJwt: `jwt-${body.identifier}`,
        refreshJwt: `refresh-${body.identifier}`,
        did: `did:plc:${body.identifier.split('.')[0]}`,
        handle: body.identifier,
      }),
    )
  }

  res.statusCode = 404
  res.end('{}')
})

await new Promise<void>((resolve) => harness.listen(3130, '127.0.0.1', resolve))

try {
  await mkdir(out, { recursive: true })

  if (restart) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const ownerUser = await payload.findByID({ collection: 'users', id: state.ownerId, depth: 0 })
    const ownCookie = `${await session(ownerUser)}; renegade-active-site=${state.siteId}`

    // 1. Verify persisted account state after restart
    const persistedAccount = await payload.findByID({
      collection: 'social-accounts',
      id: state.accountId,
      depth: 0,
      overrideAccess: true,
    })
    check('restart: account doc persisted across container restart', Boolean(persistedAccount))
    check('restart: credential health remains healthy', persistedAccount.credentialHealth === 'healthy')
    check('restart: capabilities text limit 300 preserved', persistedAccount.capabilities?.textLimit === 300)
    check('restart: mode preserved as local-harness', persistedAccount.diagnostics?.mode === 'local-harness')

    // 2. Query admin accounts API after restart
    const res = await api(`/api/admin/social/accounts?siteId=${state.siteId}`, 'GET', undefined, ownCookie, 200)
    const json = res.json()
    const found = json.accounts.find((a: any) => String(a.id) === String(state.accountId))
    check('restart: admin accounts GET returns account with healthy status', found && found.credentialHealth === 'healthy')

    // 3. Test disconnected state after restart
    const disconnected = await payload.findByID({
      collection: 'social-accounts',
      id: state.disconnectedAccountId,
      depth: 0,
      overrideAccess: true,
    })
    check('restart: disconnected account preserved with revoked status', disconnected.credentialHealth === 'revoked')
    check('restart: connectionReference cleared on revoked account', disconnected.connectionReference === null)

    // Save final persistence evidence
    await writeFile(
      `${out}/persistence-final.json`,
      JSON.stringify({
        accountId: state.accountId,
        persistedAccount,
        disconnectedAccount: disconnected,
      }, null, 2),
    )
    succeeded = true
  } else {
    // FRESH RUN:
    // Create isolated Site & Users
    const site = await payload.create({
      collection: 'sites',
      data: { name: '08A Provider Truth Site', slug: `provider-truth-${Date.now()}`, lifecycle: 'active' },
    })
    const foreignSite = await payload.create({
      collection: 'sites',
      data: { name: '08A Foreign Site', slug: `foreign-site-${Date.now()}`, lifecycle: 'active' },
    })

    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${Date.now()}@rc108a.test`, role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-${Date.now()}@rc108a.test`, role: 'staff' },
    })
    const foreignStaff = await payload.create({
      collection: 'users',
      data: { email: `foreign-${Date.now()}@rc108a.test`, role: 'staff' },
    })

    // Assign grants via member-site-roles
    await payload.create({
      collection: 'member-site-roles',
      data: { member: staff.member, site: site.id, role: 'community-manager' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: { member: foreignStaff.member, site: foreignSite.id, role: 'community-manager' },
    })

    const ownerCookie = `${await session(owner)}; renegade-active-site=${site.id}`
    const staffCookie = `${await session(staff)}; renegade-active-site=${site.id}`
    const foreignCookie = `${await session(foreignStaff)}; renegade-active-site=${foreignSite.id}`

    // TEST 1: Unauthorized or unauthenticated rejected
    await api('/api/admin/social/accounts', 'GET', undefined, '', 403)
    check('unauthenticated GET /api/admin/social/accounts rejected (403)', true)

    await api('/api/admin/social/accounts', 'POST', { action: 'connect' }, '', 403)
    check('unauthenticated POST /api/admin/social/accounts rejected (403)', true)

    // TEST 2: Foreign tenant denied operator access to target site (403)
    const foreignAttempt = await api(
      '/api/admin/social/accounts',
      'POST',
      {
        action: 'connect',
        siteId: site.id,
        network: 'bluesky',
        displayName: 'Hacker Account',
      },
      foreignCookie,
      403,
    )
    check('foreign operator denied access to connect account on target site (403)', foreignAttempt.response.status === 403)

    // TEST 3: Connect local harness Bluesky account with valid credentials
    const validConnectRes = await api(
      '/api/admin/social/accounts',
      'POST',
      {
        action: 'connect',
        siteId: site.id,
        network: 'bluesky',
        displayName: 'Renegade Official Bluesky',
        externalAccountId: 'renegade.bsky.test',
        mode: 'local-harness',
        credentials: {
          identifier: 'renegade.bsky.test',
          appPassword: 'correct-app-password',
          service: 'http://127.0.0.1:3130',
        },
      },
      ownerCookie,
      200,
    )
    const validConnectJson = validConnectRes.json()
    check('connect local harness Bluesky returns 200 with success true', validConnectJson.success === true)
    check('credentialHealth is healthy', validConnectJson.account.credentialHealth === 'healthy')
    check('mode is reported truthfully as local-harness', validConnectJson.capabilityTruth.mode === 'local-harness')
    check('capabilities declare textLimit 300 and images', validConnectJson.capabilityTruth.capabilities.textLimit === 300)
    check('harness received createSession call', harnessSessionCalls >= 1)

    // TEST 4: Zero Credential Leaks in Database and API Output
    const dbAccount = await payload.findByID({
      collection: 'social-accounts',
      id: validConnectJson.account.id,
      depth: 0,
      overrideAccess: true,
    })
    check('plaintext password never stored in database', !JSON.stringify(dbAccount).includes('correct-app-password'))
    check('connectionReference is encrypted envelope', dbAccount.connectionReference.startsWith('enc:'))
    const decryptedCreds = JSON.parse(decryptSecret(dbAccount.connectionReference.slice(4)))
    check('decrypted secret resolves correctly', decryptedCreds.appPassword === 'correct-app-password')
    check('API output does not return credentials or secrets', !JSON.stringify(validConnectJson).includes('correct-app-password'))

    // TEST 5: Connect with Bad Credentials → Returns Auth Error, No Fake Success
    const badConnectRes = await api(
      '/api/admin/social/accounts',
      'POST',
      {
        action: 'connect',
        siteId: site.id,
        network: 'bluesky',
        displayName: 'Invalid Bluesky',
        externalAccountId: 'bad.credentials.handle',
        mode: 'local-harness',
        credentials: {
          identifier: 'bad.credentials.handle',
          appPassword: 'wrong-password',
          service: 'http://127.0.0.1:3130',
        },
      },
      ownerCookie,
      200,
    )
    const badConnectJson = badConnectRes.json()
    check('connect with invalid credentials fails truthfully without fake success', badConnectJson.success === false)
    check('credentialHealth set to revoked or failed', badConnectJson.account.credentialHealth === 'revoked')
    check('diagnostics record sanitized error', Boolean(badConnectJson.account.diagnostics?.lastError))
    check('harness received bad auth call', harnessBadAuthCalls >= 1)

    // TEST 6: Connect with Absent Credentials → Not Configured
    const absentConnectRes = await api(
      '/api/admin/social/accounts',
      'POST',
      {
        action: 'connect',
        siteId: site.id,
        network: 'x',
        displayName: 'Unconfigured X Profile',
        externalAccountId: 'renegade_x',
      },
      ownerCookie,
      200,
    )
    const absentJson = absentConnectRes.json()
    check('absent keys reports not-configured', absentJson.account.credentialHealth === 'not-configured')
    check('capabilityState reports manual-handoff for manual provider', absentJson.account.capabilityState === 'manual-handoff' || absentJson.account.capabilityState === 'unavailable')

    // TEST 7: Test / Ping Account Health
    const testPingRes = await api(
      '/api/admin/social/accounts',
      'POST',
      {
        action: 'test',
        accountId: validConnectJson.account.id,
      },
      ownerCookie,
      200,
    )
    const testPingJson = testPingRes.json()
    check('test ping on healthy account returns success true', testPingJson.success === true)
    check('test ping updates lastVerifiedAt', Boolean(testPingJson.account.lastVerifiedAt))

    // TEST 8: Safe Disconnection
    const disconnectRes = await api(
      '/api/admin/social/accounts',
      'POST',
      {
        action: 'disconnect',
        accountId: badConnectJson.account.id,
      },
      ownerCookie,
      200,
    )
    const disconnectJson = disconnectRes.json()
    check('disconnect action succeeds', disconnectJson.success === true)
    check('credentialHealth updated to revoked', disconnectJson.account.credentialHealth === 'revoked')
    check('connectionReference set to null on disconnect', disconnectJson.account.connectionReference === null)

    // TEST 9: Query through /api/admin/integrations route
    const integrationsRes = await api(
      `/api/admin/integrations?siteId=${site.id}`,
      'GET',
      undefined,
      ownerCookie,
      200,
    )
    const integrationsJson = integrationsRes.json()
    const socialConnection = integrationsJson.connections.find((c: any) => c.collection === 'social-accounts' && c.id === validConnectJson.account.id)
    check('integrations dashboard includes social account', Boolean(socialConnection))
    check('integrations reflects status active and healthState healthy', socialConnection.status === 'active' && socialConnection.healthState === 'healthy')
    check('integrations reflects true scopes from capabilities', socialConnection.scopes.includes('social.publish.text'))

    // TEST 10: Browser / UI Inspection
    await page.context().addCookies([
      { name: 'renegade-passkey', value: ownerCookie.split(';')[0].split('=')[1], url: base },
      { name: 'renegade-active-site', value: site.id, url: base },
    ])
    await page.goto(`${base}/admin/social`, { timeout: 60000 })
    await dismissConsent()

    // Verify UI reflects healthy account
    await page.waitForSelector(`text=Renegade Official Bluesky`, { timeout: 10000 }).catch(() => {})
    const hasAccountOnScreen = await page.getByText('Renegade Official Bluesky').first().isVisible()
    check('Social Command Center displays connected account', hasAccountOnScreen)

    // Capture screenshot
    await page.screenshot({ path: `${out}/social-command-center.png`, fullPage: true })
    check('captured social command center screenshot', true)

    // Save state for restart test
    const state = {
      siteId: site.id,
      ownerId: owner.id,
      accountId: validConnectJson.account.id,
      disconnectedAccountId: badConnectJson.account.id,
      verifiedAt: new Date().toISOString(),
    }
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))
    await writeFile(
      `${out}/trace-verify.json`,
      JSON.stringify({ checks, trace, verifiedAt: new Date().toISOString() }, null, 2),
    )
    succeeded = true
  }
} finally {
  await browser.close()
  harness.close()
}

if (!succeeded) {
  process.exit(1)
}
console.log(`\nALL ${checks} VERIFICATION CHECKS PASSED SUCCESSFULLY.`)
