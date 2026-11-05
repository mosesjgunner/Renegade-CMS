/* eslint-disable @typescript-eslint/no-explicit-any -- isolated supported HTTP acceptance */
// R-08-SOCIAL local-process variant of the frozen 08A/08B/08C
// acceptances (tests/rc1-08a/verify.ts, tests/rc1-08b/verify.ts,
// tests/rc1-08c/verify-current.ts; Windows/Docker runs of
// 2026-10-19/20, each recorded PASS bounded). Same assertion families,
// retargeted to this Docker-less host per the R-01B..R-03D local
// precedent: production standalone server + jobs worker as local
// processes behind a local HTTPS proxy
// (https://rc1-08s.test:38792), disposable PostgreSQL database
// rc1r08s_main, test authentication disabled. The owner is created by
// the real installer WebAuthn ceremony (the R-03D pattern); staff and
// foreign negative actors use labelled fixture sessions (the frozen
// 08A-08C pattern) and are never claimed as WebAuthn proof.
//
// Providers are LOCAL SINKS ONLY. One loopback receiver on
// 127.0.0.1:3141 serves both the AT Protocol (Bluesky) and Mastodon
// protocol shapes; 127.0.0.1:3142 is a deliberately UNAPPROVED origin
// that must never receive a request. No real provider API, real
// credential or real external post is involved. Claims are kept
// distinct: unconfigured safety, adapter-harness success, and
// (unclaimed) remote sandbox / real-world outcomes.
//
// Checks are counted independently per subpass (08A / 08B / 08C);
// a failure in one section is recorded against that section only.
// Evidence lands under docs/rc/evidence/rc1/repairs/R-08-SOCIAL/;
// session/state live under scratch/rc1r08s/.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { openSync } from 'node:fs'
import http from 'node:http'
import nodeHttps from 'node:https'
import { spawn, type ChildProcess } from 'node:child_process'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ensureBootstrap, rotateBootstrapToken } from '../../src/modules/operations/installation'
import { loadConfig } from '../../src/modules/core/config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { decryptSecret, encryptSecret } from '../../src/modules/social/security'
import { getProviderCapabilityTruth } from '../../src/modules/social/provider-runtime'

assert.equal(process.env.RC1R08S_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith('/rc1r08s_main'))
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const restartMode = process.argv.includes('--restart')
const base = 'https://rc1-08s.test:38792'
const proxyPort = 38792
const sinkOrigin = 'http://127.0.0.1:3141'
const blockedOrigin = 'http://127.0.0.1:3142'
const out = 'docs/rc/evidence/rc1/repairs/R-08-SOCIAL'
const scratch = 'scratch/rc1r08s'
await mkdir(out, { recursive: true })
await mkdir(scratch, { recursive: true })
const payload: any = await getPayload({ config })
const browser = await chromium.launch({
  headless: true,
  args: [
    '--ignore-certificate-errors',
    '--no-proxy-server',
    '--host-resolver-rules=MAP rc1-08s.test 127.0.0.1',
  ],
})
const context = await browser.newContext(
  restartMode
    ? { storageState: `${scratch}/session.json`, ignoreHTTPSErrors: true }
    : { ignoreHTTPSErrors: true },
)
const page = await context.newPage()
page.setDefaultTimeout(120000)
const trace: any[] = []
page.on('pageerror', (error) => trace.push({ browserError: error.message }))
const sections: Record<string, number> = { '08A': 0, '08B': 0, '08C': 0, setup: 0 }
let currentSection = 'setup'
const check = (name: string, value: unknown) => {
  assert.ok(value, `${currentSection}: ${name}`)
  sections[currentSection] = (sections[currentSection] ?? 0) + 1
  trace.push({ section: currentSection, name, passed: true })
  console.log(`PASS [${currentSection}] ${sections[currentSection]}: ${name}`)
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(name: string, test: () => Promise<boolean>, timeout = 180000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await test()) return
    await sleep(500)
  }
  throw new Error(`Timed out: ${name}`)
}
// Local transport alignment (R-03C/R-03D precedent): API calls go
// through the local HTTPS proxy by loopback IP with the proxy Host
// header. By default the browser context's own (installer) session
// cookie is used; an explicit cookie string overrides it ('' = anon).
const api = async (
  route: string,
  method = 'GET',
  data?: any,
  expected: number | number[] = 200,
  opts: { cookie?: string; origin?: string } = {},
) => {
  const cookies =
    opts.cookie !== undefined
      ? opts.cookie
      : (await context.cookies(base)).map((c) => `${c.name}=${c.value}`).join('; ')
  const payloadText = data === undefined ? undefined : JSON.stringify(data)
  const result = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const request = nodeHttps.request(
      {
        host: '127.0.0.1',
        port: proxyPort,
        path: route,
        method,
        rejectUnauthorized: false,
        headers: {
          host: 'rc1-08s.test:38792',
          origin: opts.origin ?? base,
          ...(cookies ? { cookie: cookies } : {}),
          ...(payloadText
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payloadText),
              }
            : {}),
        },
        timeout: 180000,
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          text += chunk
        })
        response.on('end', () => resolve({ status: response.statusCode ?? 0, text }))
        response.on('error', reject)
      },
    )
    request.on('error', reject)
    if (payloadText) request.write(payloadText)
    request.end()
  })
  const text = result.text
  trace.push({
    section: currentSection,
    method,
    route,
    status: result.status,
    body: result.status >= 400 ? text.slice(0, 1200) : undefined,
  })
  assert.ok(
    (Array.isArray(expected) ? expected : [expected]).includes(result.status),
    `${method} ${route}: expected ${expected}, got ${result.status}: ${text.slice(0, 2500)}`,
  )
  return { text, json: () => JSON.parse(text), response: { status: result.status } }
}
const row = (collection: string, id: string) =>
  payload.findByID({ collection, id, depth: 0, overrideAccess: true })
const find = async (collection: string, where?: any) =>
  (
    await payload.find({
      collection,
      where,
      depth: 0,
      pagination: false,
      limit: 0,
      overrideAccess: true,
    })
  ).docs
// Fixture sessions for negative actors only (labelled; not WebAuthn).
const fixtureSession = async (user: any) => {
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
const body = (text: string) => ({
  root: {
    type: 'root',
    format: '',
    direction: 'ltr',
    indent: 0,
    version: 1,
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '',
        direction: 'ltr',
        indent: 0,
        children: [
          { type: 'text', text, version: 1, format: 0, detail: 0, mode: 'normal', style: '' },
        ],
      },
    ],
  },
})

// ------------------------------------------------------------------
// Local protocol receiver (sink). Serves AT Protocol + Mastodon
// shapes on the APPROVED origin; a second server on the UNAPPROVED
// origin only counts requests (must stay 0).
// ------------------------------------------------------------------
const records = new Map<string, any>()
const requests: any[] = []
const failureCounts = new Map<string, number>()
let sessionCalls = 0
let badAuthCalls = 0
let blockedRequests = 0
const sends = (prefix: string) =>
  requests.filter((request) => request.text?.startsWith(prefix)).length
let sink: http.Server | undefined
let blockedSink: http.Server | undefined
async function startSink() {
  sink = http.createServer((request, response) => {
    const url = new URL(request.url || '/', sinkOrigin)
    let raw = ''
    request.on('data', (chunk) => (raw += chunk))
    request.on('end', () => {
      response.setHeader('content-type', 'application/json')
      const data = raw ? JSON.parse(raw) : {}
      if (url.pathname.endsWith('com.atproto.server.createSession')) {
        if (data.identifier === 'bad.credentials.handle' || data.password === 'wrong-password') {
          badAuthCalls++
          response.statusCode = 401
          return response.end(
            JSON.stringify({
              error: 'AuthenticationFailed',
              message: 'Invalid identifier or password',
            }),
          )
        }
        const n = failureCounts.get(`session:${data.identifier}`) ?? 0
        failureCounts.set(`session:${data.identifier}`, n + 1)
        if (data.identifier === 'rate.local' && n === 0) {
          response.statusCode = 429
          response.setHeader('retry-after', '15')
          return response.end(
            JSON.stringify({ error: 'RateLimitExceeded', message: 'Local rate limit' }),
          )
        }
        sessionCalls++
        return response.end(
          JSON.stringify({
            accessJwt: `jwt-${data.identifier}`,
            refreshJwt: `refresh-${data.identifier}`,
            did: `did:plc:${String(data.identifier).split('.')[0]}`,
            handle: data.identifier,
          }),
        )
      }
      if (url.pathname.endsWith('com.atproto.repo.getRecord')) {
        const record = records.get(`bsky:${url.searchParams.get('rkey')}`)
        response.statusCode = record ? 200 : 404
        return response.end(
          JSON.stringify(
            record
              ? {
                  uri: record.remoteId,
                  cid: record.id,
                  value: { text: record.text, createdAt: record.receivedAt },
                }
              : { error: 'RecordNotFound' },
          ),
        )
      }
      if (url.pathname.endsWith('com.atproto.repo.createRecord')) {
        const key = `bsky:${data.rkey}`
        requests.push({
          network: 'bluesky',
          key,
          text: data.record.text,
          receivedAt: new Date().toISOString(),
        })
        if (records.has(key)) {
          response.statusCode = 400
          return response.end(JSON.stringify({ error: 'RecordAlreadyExists' }))
        }
        const record = {
          key,
          id: `local-cid-${records.size}`,
          remoteId: `at://${data.repo}/app.bsky.feed.post/${data.rkey}`,
          text: data.record.text,
          remoteUrl: `${sinkOrigin}/posts/${data.rkey}`,
          receivedAt: new Date().toISOString(),
        }
        records.set(key, record)
        if (data.record.text.startsWith('LOST')) {
          request.socket.destroy()
          return
        }
        if (data.record.text.startsWith('CRASH')) return // accepted; response never returns
        return response.end(JSON.stringify({ uri: record.remoteId, cid: record.id }))
      }
      if (url.pathname === '/api/v1/statuses') {
        const key = `masto:${request.headers['idempotency-key']}`
        const token = String(request.headers.authorization ?? '')
        const n = failureCounts.get(token) ?? 0
        failureCounts.set(token, n + 1)
        requests.push({
          network: 'mastodon',
          key,
          text: data.status,
          receivedAt: new Date().toISOString(),
        })
        if (token.includes('always-fail') || (token.includes('partial') && n === 0)) {
          response.statusCode = 500
          return response.end(JSON.stringify({ error: 'Local deliberately failed delivery' }))
        }
        const record = records.get(key) ?? {
          key,
          id: `local-masto-${records.size}`,
          remoteId: `local-masto-${records.size}`,
          text: data.status,
          remoteUrl: `${sinkOrigin}/masto/${records.size}`,
          receivedAt: new Date().toISOString(),
        }
        records.set(key, record)
        if (data.status.startsWith('TIMEOUT')) return // accepted; response never returns
        return response.end(
          JSON.stringify({ id: record.id, url: record.remoteUrl, created_at: record.receivedAt }),
        )
      }
      const record = [...records.values()].find(
        (value) => value.remoteUrl === sinkOrigin + url.pathname,
      )
      if (record) return response.end(JSON.stringify(record))
      response.statusCode = 404
      return response.end(JSON.stringify({ error: 'NotFound' }))
    })
  })
  await new Promise<void>((resolve, reject) => {
    sink!.once('error', reject)
    sink!.listen(3141, '127.0.0.1', resolve)
  })
  blockedSink = http.createServer((_request, response) => {
    blockedRequests++
    response.statusCode = 500
    response.end('Unapproved origin must never be contacted')
  })
  await new Promise<void>((resolve, reject) => {
    blockedSink!.once('error', reject)
    blockedSink!.listen(3142, '127.0.0.1', resolve)
  })
}

let passed = false
try {
  if (restartMode) {
    // --------------------------------------------------------------
    // RESTART: web+worker processes AND the PostgreSQL cluster were
    // restarted by the supervisor between phases.
    // --------------------------------------------------------------
    const state = JSON.parse(await readFile(`${scratch}/state.json`, 'utf8'))
    currentSection = '08C'
    for (const saved of state.queues) {
      const actual = await row('social-queue-items', saved.id)
      check(
        `restart retains queue ${saved.id} status and attempts`,
        actual.status === saved.status && actual.attemptCount === saved.attemptCount,
      )
    }
    check(
      'restart retains exact external post count',
      (await find('external-posts')).length === state.externalCount,
    )
    check(
      'restart retains exact attempt count',
      (await find('social-publish-attempts')).length === state.attemptCount,
    )
    currentSection = '08B'
    const draft1 = await row('social-drafts', state.draft1Id)
    check('restart retains scheduled 08B draft', draft1.status === 'scheduled')
    const futureQueue = await row('social-queue-items', state.futureQueueId)
    check(
      'restart retains future queue item scheduled with zero attempts',
      futureQueue.status === 'scheduled' && futureQueue.attemptCount === 0,
    )
    currentSection = '08A'
    const account = await row('social-accounts', state.accountId)
    check(
      'restart retains connected account healthy in local-harness mode',
      account.credentialHealth === 'healthy' && account.diagnostics?.mode === 'local-harness',
    )
    currentSection = '08C'
    const dispatched = (
      await api('/api/admin/social/worker', 'POST', { action: 'dispatch' })
    ).json()
    check(
      'restart dispatch replays no published or unknown work',
      dispatched.summary.processedCount === 0,
    )
    check(
      'restart dispatch leaves exact attempt count unchanged',
      (await find('social-publish-attempts')).length === state.attemptCount,
    )
    const output = await api(state.articlePath)
    check(
      'restart public output retains the published article',
      output.text.includes('08S operator reporting'),
    )
    passed = true
  } else {
    await startSink()
    // ------------------------------------------------------------
    // SETUP: real installer WebAuthn ceremony (R-03D pattern) and a
    // real published article to distribute.
    // ------------------------------------------------------------
    currentSection = 'setup'
    check(
      'fresh database has no sites or content',
      (await payload.count({ collection: 'sites' })).totalDocs === 0 &&
        (await payload.count({ collection: 'content' })).totalDocs === 0,
    )
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0] ?? ''))
    }
    let token = ''
    try {
      await ensureBootstrap(payload, loadConfig())
      if (warnings.length === 0) await rotateBootstrapToken(payload, loadConfig())
      token = warnings.map((line) => line.match(/: ([A-Za-z0-9_-]+)$/)?.[1]).find(Boolean) ?? ''
    } finally {
      console.warn = originalWarn
    }
    assert.equal(token.length, 43, 'one-time installer bootstrap token available')
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
    await page.goto(`${base}/setup`, { timeout: 180000, waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () =>
        Object.keys(document.querySelector('input[type="email"]') ?? {}).some((key) =>
          key.startsWith('__reactProps'),
        ),
      { timeout: 60000 },
    )
    await page.getByLabel('Bootstrap token').fill(token)
    await page.getByLabel('Owner email').fill('owner@rc108s.test')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByLabel('Site or publication name').fill('08S Operator Social')
    await page.getByLabel('Site slug').fill('social-dispatch-08s')
    await page.getByLabel('Primary URL').fill(base)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByLabel('Starter site type').selectOption('blank-minimal')
    await page.getByRole('checkbox', { name: /Create starter pages/ }).uncheck()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    const completeResponse = page.waitForResponse(
      (response) => response.url().includes('/api/setup/complete'),
      { timeout: 180000 },
    )
    await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
    assert.equal((await completeResponse).status(), 201, 'supported installer completion HTTP 201')
    check(
      'ordinary installer completes real virtual WebAuthn ceremony',
      (await context.cookies()).some((cookie) => cookie.name === 'renegade-passkey'),
    )
    await context.storageState({ path: `${scratch}/session.json` })
    const site = (await api('/api/sites?limit=20'))
      .json()
      .docs.find((rowDoc: any) => rowDoc.slug === 'social-dispatch-08s')
    assert.ok(site, 'installer site exists')
    const native = async (collection: string, data: any) =>
      (await api(`/api/${collection}`, 'POST', data, 201)).json().doc
    const article = await native('content', {
      site: site.id,
      contentType: 'article',
      title: '08S Report',
      slug: 'report-08s',
      body: body('08S operator reporting'),
      status: 'draft',
    })
    await api(`/api/content/${article.id}`, 'PATCH', { status: 'published' })
    const articlePath = '/articles/report-08s'
    const publicArticle = await api(articlePath, 'GET', undefined, 200, { cookie: '' })
    check(
      'real published article is anonymously reachable',
      publicArticle.text.includes('08S operator reporting'),
    )

    // Fixture negative actors (labelled): same-site staff and a
    // foreign-site staff member. Sessions are fixture-issued; the
    // owner above is the only WebAuthn claim.
    const memberIdOf = async (userId: string) => {
      const fresh = await row('users', userId)
      const member = fresh.member
      return typeof member === 'string' ? member : member?.id
    }
    // Product behavior observed on this tree: creating a member
    // auto-grants `contributor` on the existing site, and
    // (site, member) is unique — so fixture grants upsert the role.
    const ensureGrant = async (memberId: string, siteId: string, role: string) => {
      const existing = await find('member-site-roles', {
        and: [{ member: { equals: memberId } }, { site: { equals: siteId } }],
      })
      if (existing.length)
        await payload.update({
          collection: 'member-site-roles',
          id: existing[0].id,
          data: { role },
          overrideAccess: true,
        })
      else
        await payload.create({
          collection: 'member-site-roles',
          data: { member: memberId, site: siteId, role },
          overrideAccess: true,
        })
    }
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-${Date.now()}@rc108s.test`, role: 'staff' },
    })
    await ensureGrant(await memberIdOf(staff.id), site.id, 'community-manager')
    const foreignSite = await payload.create({
      collection: 'sites',
      data: { name: '08S Foreign Site', slug: `foreign-${Date.now()}`, lifecycle: 'active' },
    })
    const foreignStaff = await payload.create({
      collection: 'users',
      data: { email: `foreign-${Date.now()}@rc108s.test`, role: 'staff' },
    })
    await ensureGrant(await memberIdOf(foreignStaff.id), foreignSite.id, 'community-manager')
    // Fixture boundary: if member auto-join also granted the foreign
    // member a role on the target site, remove it so the foreign
    // actor is genuinely foreign to that site.
    const foreignMemberId = await memberIdOf(foreignStaff.id)
    for (const stray of await find('member-site-roles', {
      and: [{ member: { equals: foreignMemberId } }, { site: { equals: site.id } }],
    }))
      await payload.delete({ collection: 'member-site-roles', id: stray.id, overrideAccess: true })
    const staffCookie = `${await fixtureSession(staff)}; renegade-active-site=${site.id}`
    const foreignCookie = `${await fixtureSession(foreignStaff)}; renegade-active-site=${foreignSite.id}`

    // ------------------------------------------------------------
    // 08A: provider setup, capability truth, redaction, lifecycle.
    // ------------------------------------------------------------
    currentSection = '08A'
    await api('/api/admin/social/accounts', 'GET', undefined, 403, { cookie: '' })
    check('unauthenticated GET accounts rejected (403)', true)
    await api(
      '/api/admin/social/accounts',
      'POST',
      { action: 'connect', siteId: site.id, network: 'bluesky', displayName: 'Hacker Account' },
      403,
      { cookie: foreignCookie },
    )
    check('foreign operator denied connect on target site (403)', true)
    const validConnect = (
      await api('/api/admin/social/accounts', 'POST', {
        action: 'connect',
        siteId: site.id,
        network: 'bluesky',
        displayName: 'Renegade Official Bluesky',
        externalAccountId: 'renegade.bsky.test',
        mode: 'local-harness',
        credentials: {
          identifier: 'renegade.bsky.test',
          appPassword: 'correct-app-password',
          service: sinkOrigin,
        },
      })
    ).json()
    check('connect local-harness Bluesky succeeds truthfully', validConnect.success === true)
    check('credentialHealth is healthy', validConnect.account.credentialHealth === 'healthy')
    check(
      'mode reported truthfully as local-harness (not live/sandbox)',
      validConnect.capabilityTruth.mode === 'local-harness',
    )
    check(
      'capabilities declare textLimit 300',
      validConnect.capabilityTruth.capabilities.textLimit === 300,
    )
    check('local AT harness received a real createSession call', sessionCalls >= 1)
    const bskyAccountId = validConnect.account.id
    const dbAccount = await row('social-accounts', bskyAccountId)
    check(
      'plaintext password never stored in database',
      !JSON.stringify(dbAccount).includes('correct-app-password'),
    )
    check(
      'connectionReference is an encrypted envelope',
      String(dbAccount.connectionReference).startsWith('enc:'),
    )
    check(
      'encrypted envelope decrypts to the supplied secret (diagnostic path)',
      JSON.parse(decryptSecret(String(dbAccount.connectionReference).slice(4))).appPassword ===
        'correct-app-password',
    )
    check(
      'API output returns no credential or secret',
      !JSON.stringify(validConnect).includes('correct-app-password'),
    )
    const integrations = (
      await api(`/api/admin/integrations?siteId=${site.id}`, 'GET', undefined, 200)
    ).json()
    const socialConnection = integrations.connections.find(
      (c: any) => c.collection === 'social-accounts' && c.id === bskyAccountId,
    )
    check('integrations dashboard includes the social account', Boolean(socialConnection))
    check(
      'integrations reflect healthy status and true publish scopes',
      socialConnection.status === 'active' &&
        socialConnection.healthState === 'healthy' &&
        socialConnection.scopes.includes('social.publish.text'),
    )
    await page.goto(`${base}/admin/social`, { timeout: 180000, waitUntil: 'domcontentloaded' })
    await page.getByTestId('draft-workflow-panel').waitFor({ timeout: 120000 })
    const rejectConsent = page.getByRole('button', { name: 'Reject non-essential', exact: true })
    await rejectConsent.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    if (await rejectConsent.isVisible()) await rejectConsent.click()
    await page
      .getByText('Renegade Official Bluesky')
      .first()
      .waitFor({ timeout: 30000 })
      .catch(() => {})
    check(
      'Social Command Center displays the connected account',
      await page.getByText('Renegade Official Bluesky').first().isVisible(),
    )
    await page.screenshot({ path: `${out}/social-command-center.png`, fullPage: true })
    check('captured social command center screenshot', true)

    // ------------------------------------------------------------
    // 08B: composer, approval and scheduling. The main draft is
    // created from the real published article above through the UI
    // (the frozen 08B pattern); a second, source-bound draft proves
    // attribution binding, editing and the decline/unsent gate.
    // ------------------------------------------------------------
    currentSection = '08B'
    const mastoAccount = await payload.create({
      collection: 'social-accounts',
      data: {
        site: site.id,
        network: 'activitypub',
        displayName: '@renegade@mastodon.social',
        actorType: 'site',
        externalAccountId: 'renegade-masto-id-456',
        capabilityState: 'available',
        capabilities: { textLimit: 500, postTypes: ['text', 'media'] },
        credentialHealth: 'healthy',
        diagnostics: { mode: 'local-harness' },
        connectionReference: `enc:${encryptSecret(
          JSON.stringify({ accessToken: 'partial', serverUrl: sinkOrigin }),
        )}`,
      },
    })
    check('created ActivityPub/Mastodon local-harness account', Boolean(mastoAccount.id))
    await api('/api/admin/social/drafts', 'GET', undefined, 403, { cookie: '' })
    check('unauthenticated GET drafts rejected (403)', true)
    await api('/api/admin/social/drafts', 'GET', undefined, 403, {
      cookie: 'renegade-passkey=bogus-unauthorized-session-token; renegade-active-site=' + site.id,
    })
    check('bogus session GET drafts rejected (403)', true)
    await api(`/api/admin/social/drafts?siteId=${site.id}`, 'GET', undefined, 403, {
      cookie: foreignCookie,
    })
    check('foreign staff GET drafts on target site rejected (403)', true)
    const overLimit = (
      await api(
        '/api/admin/social/drafts',
        'POST',
        {
          action: 'create-draft',
          siteId: site.id,
          title: 'Draft with Over-Limit Bluesky Copy',
          variants: [{ accountId: bskyAccountId, network: 'bluesky', text: 'B'.repeat(350) }],
        },
        400,
        { cookie: staffCookie },
      )
    ).json()
    check(
      'adapter pre-flight rejects Bluesky copy over the 300 limit (400)',
      String(overLimit.error).includes('BLUESKY') && String(overLimit.error).includes('300'),
    )
    // Browser UI journey for draft 1.
    await page.goto(`${base}/admin/social`, { timeout: 180000, waitUntil: 'domcontentloaded' })
    await page.getByTestId('draft-workflow-panel').waitFor({ timeout: 120000 })
    check('browser: draft-workflow-panel loaded', true)
    await page.getByTestId('account-card-bluesky').first().waitFor({ timeout: 30000 })
    await page.getByTestId('account-card-activitypub').first().waitFor({ timeout: 30000 })
    check('browser: Bluesky and ActivityPub account cards visible', true)
    const articleUrl = `${base}${articlePath}`
    await page.fill('[data-testid="draft-title-input"]', '08S Release Announcement')
    await page.fill('[data-testid="canonical-url-input"]', articleUrl)
    await page.fill(
      '[data-testid="canonical-copy-textarea"]',
      'Renegade CMS social distribution is live! Sovereign publishing with native social reach.',
    )
    await page.click('[data-testid="network-tab-bluesky"]')
    await page.check('[data-testid="variant-override-checkbox"]')
    await page.fill(
      '[data-testid="variant-copy-textarea"]',
      'Renegade CMS social is here! Sovereign publishing for modern movements. #RenegadeCMS',
    )
    await page.click('[data-testid="network-tab-activitypub"]')
    await page.check('[data-testid="variant-override-checkbox"]')
    await page.fill(
      '[data-testid="variant-copy-textarea"]',
      'Announcing Renegade CMS social distribution! A sovereign publishing platform with native federation. #RenegadeCMS #ActivityPub',
    )
    await page.fill('[data-testid="mastodon-cw-input"]', 'Software Release')
    await page.waitForSelector('[data-testid="validation-gate-passed"]', { timeout: 30000 })
    check('browser: pre-flight validation gate passed', true)
    await page.click('[data-testid="save-draft-btn"]')
    await page.waitForSelector('[data-testid="workflow-message"]', { timeout: 60000 })
    const saveMsg = await page.textContent('[data-testid="workflow-message"]')
    check(
      'browser: draft saved through the UI',
      Boolean(saveMsg?.includes('Draft successfully saved')),
    )
    const draft1Id = (await page.textContent('[data-testid="current-draft-id"]'))
      ?.replace('ID: ', '')
      .trim()
    assert.ok(draft1Id, 'draft1Id extracted from UI')
    check('browser: draft 1 ID resolved from UI', Boolean(draft1Id))
    const dbDraft1 = await row('social-drafts', draft1Id)
    check('db: draft 1 persisted with status draft', dbDraft1.status === 'draft')
    check(
      'db: draft 1 canonicalUrl is the published article URL',
      dbDraft1.canonicalUrl === articleUrl,
    )
    const dbVariants1 = await find('social-network-variants', { draft: { equals: draft1Id } })
    check('db: exactly 2 per-platform variants created', dbVariants1.length === 2)
    check(
      'db: Bluesky tailored copy persisted',
      dbVariants1.find((v: any) => v.network === 'bluesky')?.text.includes('#RenegadeCMS'),
    )
    check(
      'db: Mastodon tailored copy persisted',
      dbVariants1.find((v: any) => v.network === 'activitypub')?.text.includes('#ActivityPub'),
    )
    await page.click('[data-testid="submit-review-btn"]')
    await page.waitForSelector('[data-testid="draft-status-badge"]:has-text("review")', {
      timeout: 60000,
    })
    check('browser: draft 1 status badge updated to review', true)
    check(
      'db: draft 1 status is review after submit',
      (await row('social-drafts', draft1Id)).status === 'review',
    )
    await api('/api/admin/social/drafts', 'POST', { action: 'approve', draftId: draft1Id }, 403, {
      cookie: staffCookie,
    })
    check('staff role cannot approve drafts (403)', true)
    await api('/api/admin/social/drafts', 'POST', { action: 'schedule', draftId: draft1Id }, 400)
    check('unapproved (in-review) draft cannot be scheduled (400)', true)
    await page.click('[data-testid="approve-draft-btn"]')
    await page.waitForSelector('[data-testid="draft-status-badge"]:has-text("approved")', {
      timeout: 60000,
    })
    check('browser: draft 1 status badge updated to approved', true)
    const dbApprovedVariants = await find('social-network-variants', {
      draft: { equals: draft1Id },
    })
    check(
      'db: every variant carries a sha256 approvalHash and approvedBy',
      dbApprovedVariants.every(
        (v: any) => v.approvalHash?.startsWith('sha256:') && Boolean(v.approvedBy),
      ),
    )
    await api('/api/admin/social/drafts', 'POST', { action: 'schedule', draftId: draft1Id }, 403, {
      cookie: staffCookie,
    })
    check('staff role cannot schedule drafts (403)', true)
    await page.click('[data-testid="schedule-draft-btn"]')
    await page.waitForSelector('[data-testid="draft-status-badge"]:has-text("scheduled")', {
      timeout: 60000,
    })
    check('browser: draft 1 status badge updated to scheduled', true)
    await page.waitForSelector('[data-testid="persisted-queue-count"]', { timeout: 30000 })
    const queueCountText = await page.textContent('[data-testid="persisted-queue-count"]')
    check('browser: persisted queue count in UI is 2', queueCountText === '2')
    const dbQueue1 = await find('social-queue-items', {
      variant: { in: dbApprovedVariants.map((v: any) => v.id) },
    })
    check('db: exactly 2 queue items created for draft 1', dbQueue1.length === 2)
    check(
      'db: queue items are scheduled with deterministic idempotency keys naming the draft',
      dbQueue1.every(
        (q: any) => q.status === 'scheduled' && String(q.idempotencyKey).includes(draft1Id),
      ),
    )
    await page.screenshot({ path: `${out}/composer-scheduled.png`, fullPage: true })
    check('browser: scheduled composer screenshot captured', true)
    // Draft 2: source-bound, edited, declined, unsent.
    const draft2 = (
      await api(
        '/api/admin/social/drafts',
        'POST',
        {
          action: 'create-draft',
          siteId: site.id,
          title: '08S Speculative Pitch',
          sourceContentId: article.id,
          variants: [
            { accountId: bskyAccountId, network: 'bluesky', text: 'Speculative draft for Bluesky' },
            {
              accountId: mastoAccount.id,
              network: 'activitypub',
              text: 'Speculative draft for Mastodon',
            },
          ],
        },
        201,
        { cookie: staffCookie },
      )
    ).json()
    const draft2Id = draft2.draft.id
    check('draft 2 created by staff through the API', Boolean(draft2Id))
    check(
      'draft 2 is bound to the real published article (sourceContent)',
      String((await row('social-drafts', draft2Id)).sourceContent) === String(article.id),
    )
    const draft2Variant = draft2.variants.find((v: any) => v.network === 'bluesky')
    await api('/api/admin/social/drafts', 'POST', {
      action: 'update-draft',
      draftId: draft2Id,
      variants: [
        {
          id: draft2Variant.id,
          network: 'bluesky',
          accountId: bskyAccountId,
          text: 'Speculative draft for Bluesky — edited',
        },
      ],
    })
    const editedVariant = await row('social-network-variants', draft2Variant.id)
    check(
      'draft 2 variant edit persists through update-draft',
      editedVariant.text.endsWith('— edited'),
    )
    await api(
      '/api/admin/social/drafts',
      'POST',
      { action: 'submit-review', draftId: draft2Id },
      200,
      { cookie: staffCookie },
    )
    const decline = (
      await api('/api/admin/social/drafts', 'POST', {
        action: 'decline',
        draftId: draft2Id,
        reason: 'Declined during editorial review',
      })
    ).json()
    check('draft 2 declined by owner', decline.status === 'cancelled')
    check(
      'db: draft 2 and its variants are cancelled',
      (await row('social-drafts', draft2Id)).status === 'cancelled' &&
        (await find('social-network-variants', { draft: { equals: draft2Id } })).every(
          (v: any) => v.status === 'cancelled',
        ),
    )
    const draft2Variants = await find('social-network-variants', { draft: { equals: draft2Id } })
    check(
      'db: declined draft has exactly 0 queue items (remains unsent)',
      (await find('social-queue-items', { variant: { in: draft2Variants.map((v: any) => v.id) } }))
        .length === 0,
    )
    await api('/api/admin/social/drafts', 'POST', { action: 'schedule', draftId: draft2Id }, 400)
    check('scheduling a cancelled draft is rejected (400)', true)
    // Queued records persist after a browser reload.
    await page.goto(`${base}/admin/social`, { timeout: 180000, waitUntil: 'domcontentloaded' })
    await page.getByTestId('draft-workflow-panel').waitFor({ timeout: 120000 })
    await page.getByTestId('draft-select').selectOption(draft1Id)
    await page
      .getByTestId('current-draft-id')
      .filter({ hasText: draft1Id })
      .waitFor({ timeout: 60000 })
    check('queued records persist after reload (draft 1 reselected in UI)', true)
    // 08A remainder (deferred until after the composer journey so
    // the revoked/unconfigured accounts created here cannot block
    // the composer's all-targets validation gate — the frozen 08B
    // run had only healthy accounts on its site):
    currentSection = '08A'
    const badConnect = (
      await api('/api/admin/social/accounts', 'POST', {
        action: 'connect',
        siteId: site.id,
        network: 'bluesky',
        displayName: 'Invalid Bluesky',
        externalAccountId: 'bad.credentials.handle',
        mode: 'local-harness',
        credentials: {
          identifier: 'bad.credentials.handle',
          appPassword: 'wrong-password',
          service: sinkOrigin,
        },
      })
    ).json()
    check('invalid credentials fail truthfully without fake success', badConnect.success === false)
    check(
      'invalid credentials set credentialHealth revoked',
      badConnect.account.credentialHealth === 'revoked',
    )
    check(
      'diagnostics record a sanitized error',
      Boolean(badConnect.account.diagnostics?.lastError),
    )
    check('harness received the bad-auth call', badAuthCalls >= 1)
    const absentConnect = (
      await api('/api/admin/social/accounts', 'POST', {
        action: 'connect',
        siteId: site.id,
        network: 'x',
        displayName: 'Unconfigured X Profile',
        externalAccountId: 'renegade_x',
      })
    ).json()
    check(
      'absent credentials report not-configured (unconfigured safety, distinct claim)',
      absentConnect.account.credentialHealth === 'not-configured',
    )
    check(
      'unconfigured manual-handoff provider is not upgraded to available',
      absentConnect.account.capabilityState === 'manual-handoff' ||
        absentConnect.account.capabilityState === 'unavailable',
    )
    const truthModes = {
      local: getProviderCapabilityTruth('bluesky', 'local-harness').mode,
      sandbox: getProviderCapabilityTruth('bluesky', 'remote-sandbox').mode,
      live: getProviderCapabilityTruth('bluesky', 'live').mode,
      manual: getProviderCapabilityTruth('manual').mode,
    }
    check(
      'capability truth keeps local-harness / remote-sandbox / live / manual-handoff distinct',
      truthModes.local === 'local-harness' &&
        truthModes.sandbox === 'remote-sandbox' &&
        truthModes.live === 'live' &&
        truthModes.manual === 'manual-handoff',
    )
    const ping = (
      await api('/api/admin/social/accounts', 'POST', { action: 'test', accountId: bskyAccountId })
    ).json()
    check('test ping on healthy account succeeds (non-publishing)', ping.success === true)
    check('test ping updates lastVerifiedAt', Boolean(ping.account.lastVerifiedAt))
    const disconnectBad = (
      await api('/api/admin/social/accounts', 'POST', {
        action: 'disconnect',
        accountId: badConnect.account.id,
      })
    ).json()
    check('disconnect action succeeds', disconnectBad.success === true)
    check(
      'disconnect sets revoked and clears connectionReference',
      disconnectBad.account.credentialHealth === 'revoked' &&
        disconnectBad.account.connectionReference === null,
    )
    currentSection = '08C'

    // ------------------------------------------------------------
    // 08C: dispatch, outbox, retries and recovery through the real
    // worker endpoints -> queue -> adapter -> local receiver path.
    // ------------------------------------------------------------
    currentSection = '08C'
    const mkAccount = async (name: string, network: string, credentials: any) =>
      payload.create({
        collection: 'social-accounts',
        data: {
          site: site.id,
          displayName: name,
          network,
          actorType: 'site',
          externalAccountId: name,
          capabilityState: 'available',
          capabilities: {},
          credentialHealth: 'healthy',
          diagnostics: { mode: 'local-harness' },
          connectionReference: `enc:${encryptSecret(JSON.stringify(credentials))}`,
        },
      })
    const bskyMain = await row('social-accounts', bskyAccountId)
    const rateAccount = await mkAccount('rate.local', 'bluesky', {
      identifier: 'rate.local',
      appPassword: 'local-only',
      service: sinkOrigin,
    })
    const permanentAccount = await mkAccount('permanent.local', 'activitypub', {
      accessToken: 'always-fail',
      serverUrl: sinkOrigin,
    })
    const timeoutAccount = await mkAccount('timeout.local', 'activitypub', {
      accessToken: 'timeout',
      serverUrl: sinkOrigin,
    })
    const revokedAccount = await mkAccount('disconnect.local', 'bluesky', {
      identifier: 'disconnect.local',
      appPassword: 'local-only',
      service: sinkOrigin,
    })
    const blockedAccount = await mkAccount('blocked.local', 'activitypub', {
      accessToken: 'local-only',
      serverUrl: blockedOrigin,
    })
    check('isolated local-harness accounts configured for dispatch scenarios', true)
    const make = async (title: string, destinations: any[], future = false) => {
      const result = (
        await api(
          '/api/admin/social/drafts',
          'POST',
          {
            action: 'create-draft',
            siteId: site.id,
            title,
            variants: destinations.map(([account, text]) => ({
              accountId: account.id,
              network: account.network,
              text,
            })),
          },
          201,
        )
      ).json()
      const id = result.draft.id
      await api('/api/admin/social/drafts', 'POST', { action: 'submit-review', draftId: id })
      await api('/api/admin/social/drafts', 'POST', { action: 'approve', draftId: id })
      const scheduled = (
        await api('/api/admin/social/drafts', 'POST', {
          action: 'schedule',
          draftId: id,
          scheduledFor: new Date(Date.now() + (future ? 3600000 : -1000)).toISOString(),
        })
      ).json()
      return { id, queues: scheduled.queueItems }
    }
    const worker = async (bodyData: any, expected: number | number[] = 200, opts: any = {}) =>
      (await api('/api/admin/social/worker', 'POST', bodyData, expected, opts)).json()
    // -- Partial destination failure + failed-only retry ----------
    const partial = await make('08C partial destinations', [
      [bskyMain, 'PARTIAL successful local Bluesky'],
      [mastoAccount, 'PARTIAL deliberately failing local Mastodon'],
    ])
    const future = await make(
      '08C future must not dispatch',
      [[bskyMain, 'FUTURE must remain unsent']],
      true,
    )
    // Due work executes through the real worker path: scheduling
    // enqueued a durable operations job (waitUntil reached), and the
    // jobs worker's outbox sweep also drains due queue items. Poll
    // until both destinations settle; the operator dispatch endpoint
    // is exercised directly by the later scenarios.
    await until(
      'partial destinations settle through the worker/outbox path',
      async () => {
        const rowsNow = await Promise.all(
          partial.queues.map((q: any) => row('social-queue-items', q.id)),
        )
        return (
          rowsNow.some((q: any) => q.status === 'published') &&
          rowsNow.some((q: any) => q.status === 'failed')
        )
      },
      120000,
    )
    const partialRows = await Promise.all(
      partial.queues.map((q: any) => row('social-queue-items', q.id)),
    )
    const successQueue = partialRows.find((q: any) => q.status === 'published')
    const failedQueue = partialRows.find((q: any) => q.status === 'failed')
    check(
      'dispatch persists one adapter success and one deliberate failure',
      Boolean(successQueue && failedQueue),
    )
    check(
      'parent draft persists partial failure truthfully',
      (await row('social-drafts', partial.id)).status === 'partially-published',
    )
    check(
      'local receiver holds the exact dispatched Bluesky text',
      [...records.values()].some((r: any) => r.text === 'PARTIAL successful local Bluesky'),
    )
    const successPost = (
      await find('external-posts', { variant: { equals: successQueue.variant } })
    )[0]
    check(
      'confirmed external post receipt persisted for the success',
      Boolean(successPost?.remoteId),
    )
    check(
      'future-scheduled work is not sent early',
      sends('FUTURE') === 0 &&
        (await row('social-queue-items', future.queues[0].id)).status === 'scheduled',
    )
    await page.goto(`${base}/admin/social`, { timeout: 180000, waitUntil: 'domcontentloaded' })
    await page.getByTestId('draft-workflow-panel').waitFor({ timeout: 120000 })
    await page.getByTestId('draft-select').selectOption(partial.id)
    await page
      .getByTestId('current-draft-id')
      .filter({ hasText: partial.id })
      .waitFor({ timeout: 60000 })
    await page
      .getByTestId(`item-status-${successQueue.id}`)
      .filter({ hasText: 'published' })
      .waitFor({ timeout: 60000 })
    await page
      .getByTestId(`item-status-${failedQueue.id}`)
      .filter({ hasText: 'failed' })
      .waitFor({ timeout: 60000 })
    check('browser presents persisted success and failure states', true)
    const modePill = await page
      .getByTestId(`provider-mode-pill-${successQueue.id}`)
      .textContent()
      .catch(() => '')
    check(
      'browser receipt mode pill says local-harness (truthful claim level)',
      modePill?.trim() === 'local-harness',
    )
    await page.screenshot({ path: `${out}/partial-destination.png`, fullPage: true })
    const successSendsBefore = sends('PARTIAL successful')
    const failedState = await row('social-queue-items', failedQueue.id)
    await sleep(Math.max(0, Date.parse(failedState.nextAttemptAt) - Date.now()) + 50)
    // The queued retry job and this endpoint call the same canonical
    // service; either may land first — the outcome must be identical.
    await worker({ action: 'retry-failed', queueItemId: failedQueue.id })
    await until(
      'failed destination recovers',
      async () => (await row('social-queue-items', failedQueue.id)).status === 'published',
      60000,
    )
    check(
      'failed-only retry publishes the failure without resending the success',
      (await row('social-queue-items', failedQueue.id)).status === 'published' &&
        sends('PARTIAL successful') === successSendsBefore &&
        sends('PARTIAL deliberately') === 2,
    )
    check(
      'partial draft reaches published after only its failed destination recovers',
      (await row('social-drafts', partial.id)).status === 'published',
    )
    // -- Security / forgery guards --------------------------------
    for (const action of ['dispatch-item', 'retry-failed', 'reconcile']) {
      await worker({ action, queueItemId: successQueue.id }, 403, { cookie: foreignCookie })
      check(`foreign scoped actor denied worker ${action} (403)`, true)
    }
    await worker({ action: 'dispatch' }, 403, { cookie: '' })
    check('anonymous worker dispatch denied (403)', true)
    await worker({ action: 'dispatch-item', queueItemId: future.queues[0].id }, 403, {
      origin: 'https://foreign.invalid',
    })
    check('cross-origin worker dispatch denied (403)', true)
    await api(
      `/api/social-queue-items/${future.queues[0].id}`,
      'PATCH',
      { status: 'published' },
      403,
    )
    check('native API cannot forge queue completion (403)', true)
    await api(
      '/api/external-posts',
      'POST',
      { account: bskyAccountId, variant: successQueue.variant, remoteId: 'forged' },
      403,
    )
    check('native API cannot forge a provider receipt (403)', true)
    const futureVariantBefore = await row(
      'social-network-variants',
      (await row('social-queue-items', future.queues[0].id)).variant,
    )
    await api(
      `/api/social-network-variants/${futureVariantBefore.id}`,
      'PATCH',
      { status: 'published', approvalHash: 'forged', approvedBy: staff.id },
      [200, 403],
      { cookie: staffCookie },
    )
    const futureVariantAfter = await row('social-network-variants', futureVariantBefore.id)
    check(
      'native scoped staff cannot forge approval or variant publication state',
      futureVariantAfter.status === 'scheduled' &&
        futureVariantAfter.approvalHash === futureVariantBefore.approvalHash &&
        String(futureVariantAfter.approvedBy) === String(futureVariantBefore.approvedBy),
    )
    await api(`/api/social-drafts/${future.id}`, 'PATCH', { status: 'published' }, [200, 403], {
      cookie: staffCookie,
    })
    check(
      'native scoped staff cannot forge parent publication state',
      (await row('social-drafts', future.id)).status === 'scheduled',
    )
    const futureUnchanged = await row('social-queue-items', future.queues[0].id)
    check(
      'denied writes preserve scheduled future work with zero attempts',
      futureUnchanged.status === 'scheduled' &&
        futureUnchanged.attemptCount === 0 &&
        (await find('social-publish-attempts', { queueItem: { equals: futureUnchanged.id } }))
          .length === 0,
    )
    check(
      'no forged external post was persisted',
      (await find('external-posts', { remoteId: { equals: 'forged' } })).length === 0,
    )
    const premature = await worker({ action: 'dispatch-item', queueItemId: future.queues[0].id })
    check(
      'single-item dispatch also enforces future due time (skipped, no send)',
      Boolean(premature.results[0].skipped) && sends('FUTURE') === 0,
    )
    // -- Rate limiting + bounded retry ----------------------------
    const limited = await make('08C rate limit', [[rateAccount, 'RATE real local rate limit']])
    await until(
      'rate-limited row settles as failed',
      async () => (await row('social-queue-items', limited.queues[0].id)).status === 'failed',
      120000,
    )
    const limitedRow = await row('social-queue-items', limited.queues[0].id)
    check(
      'real 429 persists failed with rate-limit kind and a future retry time',
      limitedRow.status === 'failed' &&
        limitedRow.deadLetterReason?.kind === 'rate-limit' &&
        Date.parse(limitedRow.nextAttemptAt) > Date.now(),
    )
    const earlyRetry = await worker({ action: 'retry-failed', queueItemId: limitedRow.id })
    check(
      'manual retry cannot bypass the provider rate limit',
      earlyRetry.summary.retriedCount === 0 &&
        (await row('social-queue-items', limitedRow.id)).attemptCount === 1 &&
        sends('RATE') === 0,
    )
    await sleep(Math.max(0, Date.parse(limitedRow.nextAttemptAt) - Date.now()) + 50)
    await worker({ action: 'retry-failed', queueItemId: limitedRow.id })
    await until(
      'rate-limited row publishes after expiry',
      async () => (await row('social-queue-items', limitedRow.id)).status === 'published',
      60000,
    )
    check(
      'eligible retry succeeds once after the rate limit expires',
      (await row('social-queue-items', limitedRow.id)).status === 'published' &&
        sends('RATE') === 1,
    )
    const hard = await make('08C bounded failure', [
      [permanentAccount, 'HARD always failed delivery'],
    ])
    // Drive the bounded retry path: the queued retry jobs and the
    // retry endpoint are the same canonical service; loop until the
    // attempt budget is exhausted, calling the endpoint each round.
    await until(
      'bounded failure exhausts its attempt budget',
      async () => {
        const saved = await row('social-queue-items', hard.queues[0].id)
        if (Number(saved.attemptCount ?? 0) >= 3) return true
        if (saved.nextAttemptAt)
          await sleep(Math.max(0, Date.parse(saved.nextAttemptAt) - Date.now()) + 50)
        await worker({ action: 'retry-failed', queueItemId: saved.id }).catch(() => {})
        return false
      },
      180000,
    )
    await worker({ action: 'retry-failed', queueItemId: hard.queues[0].id })
    check(
      'failed delivery is bounded at exactly 3 sends and 3 attempts',
      sends('HARD') === 3 &&
        (await row('social-queue-items', hard.queues[0].id)).attemptCount === 3,
    )
    // -- Lost response, reconciliation, timeout -------------------
    const lost = await make('08C lost response', [
      [bskyMain, 'LOST provider accepted then socket closed'],
    ])
    await until(
      'lost-response row settles as unknown',
      async () => (await row('social-queue-items', lost.queues[0].id)).status === 'unknown',
      120000,
    )
    check(
      'lost provider response persists unknown (not failure, not success)',
      (await row('social-queue-items', lost.queues[0].id)).status === 'unknown' &&
        sends('LOST') === 1,
    )
    await worker({ action: 'retry-failed', queueItemId: lost.queues[0].id })
    check('failed-only retry excludes uncertain delivery (no resend)', sends('LOST') === 1)
    await worker({ action: 'reconcile', queueItemId: lost.queues[0].id })
    check(
      'read-only reconciliation finds the accepted post without resending',
      (await row('social-queue-items', lost.queues[0].id)).status === 'published' &&
        sends('LOST') === 1,
    )
    const timed = await make('08C timeout', [
      [timeoutAccount, 'TIMEOUT accepted but response never returned'],
    ])
    await until(
      'timeout row settles as unknown',
      async () => (await row('social-queue-items', timed.queues[0].id)).status === 'unknown',
      120000,
    )
    const timedRow = await row('social-queue-items', timed.queues[0].id)
    check(
      'actual adapter timeout remains unknown and quarantined',
      timedRow.status === 'unknown' && timedRow.deadLetterReason?.remoteOutcome === 'unknown',
    )
    await worker({ action: 'retry-failed', queueItemId: timedRow.id })
    await worker({ action: 'reconcile', queueItemId: timedRow.id })
    check(
      'unsupported reconciliation does not replay the uncertain Mastodon post',
      (await row('social-queue-items', timedRow.id)).status === 'unknown' && sends('TIMEOUT') === 1,
    )
    check(
      'uncertain outcome has no published receipt',
      (await find('external-posts', { variant: { equals: timedRow.variant } })).length === 0,
    )
    // -- Disconnect + unapproved origin ---------------------------
    // Revoke BEFORE the draft is scheduled, so no healthy-send race
    // can exist; whichever product path executes the due item (worker
    // job or this endpoint) must observe the revoked state.
    await api(`/api/social-accounts/${revokedAccount.id}`, 'PATCH', {
      credentialHealth: 'revoked',
      connectionReference: '',
    })
    const disconnect = await make('08C safe disconnect', [
      [revokedAccount, 'REVOKED must remain unsent'],
    ])
    await worker({ action: 'dispatch-item', queueItemId: disconnect.queues[0].id }).catch(() => {})
    await until(
      'disconnected row settles as failed',
      async () => (await row('social-queue-items', disconnect.queues[0].id)).status === 'failed',
      120000,
    )
    const disconnectedRow = await row('social-queue-items', disconnect.queues[0].id)
    check(
      'disconnected provider is never called and persists reconnect-required',
      disconnectedRow.status === 'failed' &&
        disconnectedRow.deadLetterReason?.kind === 'reconnect-required' &&
        sends('REVOKED') === 0,
    )
    const blocked = await make('08C explicit local-origin safety', [
      [blockedAccount, 'BLOCKED unapproved local origin'],
    ])
    await worker({ action: 'dispatch-item', queueItemId: blocked.queues[0].id }).catch(() => {})
    await until(
      'blocked-origin row settles as failed',
      async () => (await row('social-queue-items', blocked.queues[0].id)).status === 'failed',
      120000,
    )
    const blockedRow = await row('social-queue-items', blocked.queues[0].id)
    check(
      'unapproved local origin fails truthfully before any provider request',
      blockedRow.status === 'failed' &&
        blockedRow.deadLetterReason?.kind === 'validation' &&
        blockedRequests === 0,
    )
    check(
      'configuration refusal is terminal (no automatic retry scheduled)',
      blockedRow.nextAttemptAt === null && blockedRow.attemptCount === 1,
    )

    // -- Killed-web lease recovery through the real jobs worker ---
    // Deterministic interruption requires that no other executor can
    // claim the due item first (the frozen 08C run owned its worker
    // for the same reason): stop the supervisor's jobs worker, run
    // the dispatch through a dedicated web process, kill THAT process
    // mid-response, then start a fresh jobs worker and let the
    // natural 60-second lease expire. No database status/deadline
    // edits are made.
    const { execFileSync } = await import('node:child_process')
    try {
      execFileSync('pkill', ['-f', 'run-jobs-worker'])
    } catch {}
    await sleep(1000)
    const crash = await make('08C worker interruption', [
      [bskyMain, 'CRASH accepted before web termination'],
    ])
    const crashQueueId = crash.queues[0].id
    const crashWebLog = openSync(`${scratch}/crash-web.log`, 'w')
    const crashWeb: ChildProcess = spawn(process.execPath, ['.next/standalone/server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: '38793',
        HOSTNAME: '127.0.0.1',
        SOCIAL_LOCAL_ADAPTER_TIMEOUT_MS: '30000',
      },
      stdio: ['ignore', crashWebLog, crashWebLog],
    })
    try {
      await until(
        'crash web readiness',
        async () =>
          fetch('http://127.0.0.1:38793/health/ready')
            .then((r) => r.ok)
            .catch(() => false),
        120000,
      )
      const crashCookies = (await context.cookies(base))
        .map((c) => `${c.name}=${c.value}`)
        .join('; ')
      let pendingResponse: string | undefined
      const pending = new Promise<void>((resolve) => {
        const request = http.request(
          'http://127.0.0.1:38793/api/admin/social/worker',
          {
            method: 'POST',
            headers: {
              // The app validates Origin against its canonical
              // APP_URL, not the transport address of this dedicated
              // process — send the canonical origin.
              origin: base,
              cookie: crashCookies,
              'content-type': 'application/json',
            },
          },
          (response) => {
            let text = ''
            response.on('data', (chunk) => (text += chunk))
            response.on('end', () => {
              pendingResponse = `${response.statusCode}: ${text.slice(0, 600)}`
              resolve()
            })
          },
        )
        request.on('error', () => resolve())
        request.end(JSON.stringify({ action: 'dispatch-item', queueItemId: crashQueueId }))
      })
      await until(
        'provider accepted the crash post',
        async () => {
          if (pendingResponse)
            throw new Error(
              `crash dispatch returned before provider acceptance: ${pendingResponse}`,
            )
          return sends('CRASH') === 1
        },
        60000,
      )
      crashWeb.kill('SIGKILL')
      await pending
      const interrupted = await row('social-queue-items', crashQueueId)
      check(
        'killed web leaves a real persisted publishing lease and a started attempt',
        interrupted.status === 'publishing' &&
          Boolean(interrupted.leaseUntil) &&
          (await find('social-publish-attempts', { queueItem: { equals: interrupted.id } }))[0]
            ?.status === 'started',
      )
      console.log('Waiting for the natural 60-second lease to expire; no database edits.')
      const workerFd = openSync(`${scratch}/recovery-worker.log`, 'w')
      const recoveryWorker: ChildProcess = spawn(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'src/scripts/run-jobs-worker.ts'],
        { cwd: process.cwd(), env: { ...process.env }, stdio: ['ignore', workerFd, workerFd] },
      )
      try {
        await until(
          'jobs worker read-only recovery after natural lease expiry',
          async () => (await row('social-queue-items', crashQueueId)).status === 'published',
          240000,
        )
      } finally {
        recoveryWorker.kill('SIGTERM')
      }
      check(
        'actual jobs worker recovers the expired publication without a duplicate send',
        sends('CRASH') === 1 && (await row('social-queue-items', crashQueueId)).attemptCount === 1,
      )
    } finally {
      if (crashWeb.exitCode === null) crashWeb.kill('SIGKILL')
    }
    await page.goto(`${base}/admin/social`, { timeout: 180000, waitUntil: 'domcontentloaded' })
    await page.getByTestId('draft-workflow-panel').waitFor({ timeout: 120000 })
    await page.getByTestId('draft-select').selectOption(crash.id)
    await page
      .getByTestId('current-draft-id')
      .filter({ hasText: crash.id })
      .waitFor({ timeout: 60000 })
    await page
      .getByTestId(`item-status-${crashQueueId}`)
      .filter({ hasText: 'published' })
      .waitFor({ timeout: 60000 })
    check('browser reload presents the recovered persisted publication', true)
    await page.screenshot({ path: `${out}/recovered-publication.png`, fullPage: true })
    // -- Final integrity ------------------------------------------
    const allQueues = await find('social-queue-items')
    const external = await find('external-posts')
    const attempts = await find('social-publish-attempts')
    check(
      'no duplicate confirmed provider IDs in persisted external posts',
      new Set(external.map((post: any) => `${post.account}:${post.remoteId}`)).size ===
        external.length,
    )
    check(
      'every published attempt receipt identifies the local protocol harness',
      attempts
        .filter((attempt: any) => attempt.status === 'published')
        .every((attempt: any) => attempt.response?.providerMode === 'local-harness'),
    )
    check(
      'the unapproved origin received zero requests across the whole journey',
      blockedRequests === 0,
    )
    await writeFile(
      `${out}/provider-state.json`,
      JSON.stringify({ records: [...records.values()], requests }, null, 2),
    )
    await writeFile(
      `${scratch}/state.json`,
      JSON.stringify(
        {
          ownerId: (await payload.find({ collection: 'users', limit: 1 })).docs[0]?.id,
          siteId: site.id,
          accountId: bskyAccountId,
          draft1Id,
          futureQueueId: future.queues[0].id,
          articlePath,
          queues: allQueues.map((q: any) => ({
            id: q.id,
            status: q.status,
            attemptCount: q.attemptCount,
          })),
          externalCount: external.length,
          attemptCount: attempts.length,
        },
        null,
        2,
      ),
    )
    await writeFile(
      `${out}/persistence.json`,
      JSON.stringify({ queues: allQueues, attempts, external }, null, 2),
    )
    passed = true
  }
} catch (error) {
  trace.push({
    section: currentSection,
    failure: error instanceof Error ? error.message : String(error),
  })
  console.error(error)
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {})
  await writeFile(
    `${out}/failure-page.txt`,
    (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    ).replace(/[A-Za-z0-9_-]{43}/g, '[redacted token]'),
  ).catch(() => {})
  process.exitCode = 1
} finally {
  await writeFile(
    `${out}/${restartMode ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify(
      {
        checksPassedBySection: sections,
        totalChecks: Object.values(sections).reduce((a, b) => a + b, 0),
        failed: passed ? 0 : 1,
        trace,
      },
      null,
      2,
    ),
  )
  if (sink) {
    sink.closeAllConnections()
    await new Promise<void>((resolve) => sink!.close(() => resolve()))
  }
  if (blockedSink) {
    blockedSink.closeAllConnections()
    await new Promise<void>((resolve) => blockedSink!.close(() => resolve()))
  }
  await browser.close()
  await payload.destroy()
  process.exit(process.exitCode ?? 0)
}
