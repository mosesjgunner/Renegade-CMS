/* eslint-disable @typescript-eslint/no-explicit-any -- isolated protocol, fixture actor and operator acceptance */
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { openSync, writeFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { encryptSecret } from '../../src/modules/social/security'

assert.equal(process.env.RC1_08C_CURRENT_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5466/rc108c_accepted_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(process.env.SOCIAL_LOCAL_ADAPTER_ORIGINS, 'http://127.0.0.1:3132')
const base = 'http://localhost:39036',
  sinkOrigin = 'http://127.0.0.1:3132'
const out = 'docs/rc/evidence/rc1/18-pass/08C/current',
  scratch = 'scratch/rc108c-current-20261020'
await mkdir(out, { recursive: true })
await mkdir(scratch, { recursive: true })
const restart = process.argv.includes('--restart')
const payload: any = await getPayload({ config })
const browser = await chromium.launch({ headless: true })
let web: ChildProcess | undefined, worker: ChildProcess | undefined
const trace: any[] = []
let checks = 0,
  succeeded = false,
  phase = 'initialization'
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
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
function stop(child: ChildProcess | undefined) {
  if (!child?.pid || child.exitCode !== null) return
  // Only a child launched by this harness is ever terminated; no port-wide kills.
  if (process.platform === 'win32')
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
  else child.kill('SIGKILL')
}
async function startWeb() {
  const fd = openSync(`${out}/server.txt`, 'a')
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '39036',
    ],
    { windowsHide: true, stdio: ['ignore', fd, fd], env: process.env },
  )
  await until('owned web readiness', async () => {
    if (web?.exitCode !== null) throw new Error('Owned web server exited before readiness.')
    return fetch(`${base}/health/ready`)
      .then((response) => response.ok)
      .catch(() => false)
  })
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
const api = async (
  route: string,
  method = 'GET',
  data?: any,
  cookie = '',
  expected = 200,
  origin = base,
) => {
  const raw = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const request = http.request(
      `${base}${route}`,
      {
        method,
        headers: {
          origin,
          ...(cookie ? { cookie } : {}),
          ...(data ? { 'content-type': 'application/json' } : {}),
        },
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => (text += chunk))
        response.on('end', () => resolve({ status: response.statusCode!, text }))
        response.on('error', reject)
      },
    )
    request.setTimeout(180000, () => request.destroy(new Error(`Request timed out: ${route}`)))
    request.on('error', reject)
    request.end(data ? JSON.stringify(data) : undefined)
  })
  trace.push({ route, method, status: raw.status })
  assert.equal(raw.status, expected, `${method} ${route}: ${raw.text.slice(0, 1600)}`)
  return JSON.parse(raw.text)
}
// Fixture authentication only. It is not WebAuthn/login acceptance.
async function session(user: any) {
  const auth = await createPasskeySession(user, loadConfig().payloadSecret, async (id, expires) => {
    await payload.db.pool.query(
      'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
      [id, user.id, expires],
    )
  })
  return `renegade-passkey=${auth.token}`
}
const records = new Map<string, any>(),
  requests: any[] = []
const failureCounts = new Map<string, number>()
function persistSink() {
  writeFileSync(
    `${scratch}/provider-state.json`,
    JSON.stringify({ records: [...records.values()], requests }, null, 2),
  )
}
let sink: http.Server | undefined
let blockedSink: http.Server | undefined
let blockedRequests = 0
async function startSink() {
  sink = http.createServer((request, response) => {
    const url = new URL(request.url || '/', sinkOrigin)
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      response.setHeader('content-type', 'application/json')
      const data = body ? JSON.parse(body) : {}
      if (url.pathname.endsWith('com.atproto.server.createSession')) {
        const n = failureCounts.get(data.identifier) ?? 0
        failureCounts.set(data.identifier, n + 1)
        if (data.identifier === 'rate.local' && n === 0) {
          response.statusCode = 429
          response.setHeader('retry-after', '15')
          response.end(JSON.stringify({ error: 'RateLimitExceeded', message: 'Local rate limit' }))
          return
        }
        response.end(
          JSON.stringify({
            did: 'did:plc:rc108c',
            handle: 'operator.local',
            accessJwt: 'local-protocol-session',
            refreshJwt: 'local-refresh',
          }),
        )
        return
      }
      if (url.pathname.endsWith('com.atproto.repo.getRecord')) {
        const record = records.get(`bsky:${url.searchParams.get('rkey')}`)
        response.statusCode = record ? 200 : 404
        response.end(
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
        return
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
          persistSink()
          response.statusCode = 400
          response.end(JSON.stringify({ error: 'RecordAlreadyExists' }))
          return
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
        persistSink()
        if (data.record.text.startsWith('LOST')) {
          request.socket.destroy()
          return
        }
        if (data.record.text.startsWith('CRASH')) return // Provider accepted; worker will be killed before receiving a response.
        response.end(JSON.stringify({ uri: record.remoteId, cid: record.id }))
        return
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
          persistSink()
          response.statusCode = 500
          response.end(JSON.stringify({ error: 'Local deliberately failed delivery' }))
          return
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
        persistSink()
        if (data.status.startsWith('TIMEOUT')) return // Real socket timeout; outcome remains unknown in CMS.
        response.end(
          JSON.stringify({ id: record.id, url: record.remoteUrl, created_at: record.receivedAt }),
        )
        return
      }
      const record = [...records.values()].find(
        (value) => value.remoteUrl === sinkOrigin + url.pathname,
      )
      if (record) {
        response.end(JSON.stringify(record))
        return
      }
      response.statusCode = 404
      response.end(JSON.stringify({ error: 'NotFound' }))
    })
  })
  await new Promise<void>((resolve, reject) => {
    sink!.once('error', reject)
    sink!.listen(3132, '127.0.0.1', resolve)
  })
}
const sends = (prefix: string) =>
  requests.filter((request) => request.text.startsWith(prefix)).length
let page: any
try {
  if (!restart) {
    await startSink()
    blockedSink = http.createServer((_request, response) => {
      blockedRequests++
      response.statusCode = 500
      response.end('Unapproved origin must never be contacted')
    })
    await new Promise<void>((resolve, reject) => {
      blockedSink!.once('error', reject)
      blockedSink!.listen(3133, '127.0.0.1', resolve)
    })
  }
  await startWeb()
  if (restart) {
    phase = 'database-restart'
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const owner = await row('users', state.ownerId),
      cookie = await session(owner)
    for (const saved of state.queues) {
      const actual = await row('social-queue-items', saved.id)
      check(
        `database restart retains ${saved.id} status and attempts`,
        actual.status === saved.status && actual.attemptCount === saved.attemptCount,
      )
    }
    check(
      'database restart retains exact external post count',
      (await find('external-posts')).length === state.externalCount,
    )
    check(
      'database restart retains exact attempt count',
      (await find('social-publish-attempts')).length === state.attemptCount,
    )
    const dispatched = await api('/api/admin/social/worker', 'POST', { action: 'dispatch' }, cookie)
    check(
      'restart dispatch does not replay published or unknown work',
      dispatched.summary.processedCount === 0,
    )
    check(
      'restart dispatch leaves exact attempt count unchanged',
      (await find('social-publish-attempts')).length === state.attemptCount,
    )
  } else {
    phase = 'fixture-boundary'
    const enumLabels = await payload.db.pool.query(
      "SELECT typname, enumlabel FROM pg_type JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid WHERE typname IN ('enum_social_drafts_status','enum_social_network_variants_status','enum_social_queue_items_status','enum_campaigns_status') AND enumlabel='unknown'",
    )
    check(
      'physical schema retains truthful unknown state in every shared social enum',
      enumLabels.rows.length === 4,
    )

    assert.equal(
      (await payload.count({ collection: 'social-drafts', overrideAccess: true })).totalDocs,
      0,
      'new isolated social database required',
    )
    const stamp = Date.now()
    const site = await payload.create({
      collection: 'sites',
      data: { name: '08C Current Alpha', slug: `dispatch-alpha-${stamp}`, lifecycle: 'active' },
    })
    const foreignSite = await payload.create({
      collection: 'sites',
      data: { name: '08C Current Beta', slug: `dispatch-beta-${stamp}`, lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@08c.test`, role: 'owner' },
    })
    const foreign = await payload.create({
      collection: 'users',
      data: { email: `foreign-${stamp}@08c.test`, role: 'staff' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: { member: foreign.member, site: foreignSite.id, role: 'community-manager' },
    })
    const sameSiteStaff = await payload.create({
      collection: 'users',
      data: { email: `staff-${stamp}@08c.test`, role: 'staff' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member:
          typeof sameSiteStaff.member === 'string' ? sameSiteStaff.member : sameSiteStaff.member.id,
        site: site.id,
        role: 'community-manager',
      },
    })
    const sameSiteStaffCookie = await session(sameSiteStaff)
    const own = await session(owner),
      other = await session(foreign)
    const account = async (name: string, network: string, credentials: any) =>
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
          connectionReference: `enc:${encryptSecret(JSON.stringify(credentials))}`,
        },
      })
    const bsky = await account('normal.local', 'bluesky', {
      identifier: 'normal.local',
      appPassword: 'local-only',
      service: sinkOrigin,
    })
    const masto = await account('partial.local', 'activitypub', {
      accessToken: 'partial',
      serverUrl: sinkOrigin,
    })
    const rate = await account('rate.local', 'bluesky', {
      identifier: 'rate.local',
      appPassword: 'local-only',
      service: sinkOrigin,
    })
    const permanent = await account('permanent.local', 'activitypub', {
      accessToken: 'always-fail',
      serverUrl: sinkOrigin,
    })
    const revoked = await account('disconnect.local', 'bluesky', {
      identifier: 'disconnect.local',
      appPassword: 'local-only',
      service: sinkOrigin,
    })
    const timeout = await account('timeout.local', 'activitypub', {
      accessToken: 'timeout',
      serverUrl: sinkOrigin,
    })
    check(
      'isolated actor, site, account and session fixtures configured; no passkey acceptance claimed',
      true,
    )
    const context = await browser.newContext()
    await context.addCookies([
      { name: 'renegade-passkey', value: own.slice('renegade-passkey='.length), url: base },
      { name: 'renegade-active-site', value: site.id, url: base },
    ])
    page = await context.newPage()
    page.setDefaultTimeout(120000)
    page.on('pageerror', (error: Error) => trace.push({ browserError: error.message }))
    await page.goto(`${base}/admin/social`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.getByTestId('draft-workflow-panel').waitFor()
    const reject = page.getByRole('button', { name: 'Reject non-essential', exact: true })
    await reject.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    if (await reject.isVisible()) await reject.click()
    check('Social Command Center loads in Chromium with fixture operator session', true)
    const make = async (title: string, destinations: any[], future = false) => {
      const result = await api(
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
        own,
        201,
      )
      const id = result.draft.id
      await api('/api/admin/social/drafts', 'POST', { action: 'submit-review', draftId: id }, own)
      await api('/api/admin/social/drafts', 'POST', { action: 'approve', draftId: id }, own)
      const scheduled = await api(
        '/api/admin/social/drafts',
        'POST',
        {
          action: 'schedule',
          draftId: id,
          scheduledFor: new Date(Date.now() + (future ? 3600000 : -1000)).toISOString(),
        },
        own,
      )
      return { id, queues: scheduled.queueItems }
    }
    const select = async (draftId: string) => {
      await page.goto(`${base}/admin/social`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.getByTestId('draft-select').selectOption(draftId)
      await expect(page.getByTestId('current-draft-id')).toContainText(draftId)
    }
    const uiAction = async (testId: string) => {
      const response = page.waitForResponse(
        (response: any) =>
          response.url().includes('/api/admin/social/worker') &&
          response.request().method() === 'POST',
        { timeout: 180000 },
      )
      await page.getByTestId(testId).click()
      const actual = await response
      assert.equal(actual.status(), 200, await actual.text())
      return actual.json()
    }
    phase = 'partial-destination-and-browser'
    const partial = await make('08C Current partial destinations', [
      [bsky, 'PARTIAL successful local Bluesky'],
      [masto, 'PARTIAL deliberately failing local Mastodon'],
    ])
    const future = await make(
      '08C Future must not dispatch',
      [[bsky, 'FUTURE must remain unsent']],
      true,
    )
    await select(partial.id)
    const dispatchedDue = await uiAction('dispatch-queue-btn')
    check(
      'due selection excludes future work before applying the batch limit',
      dispatchedDue.results.length === 2,
    )
    const partialRows = await Promise.all(
      partial.queues.map((queue: any) => row('social-queue-items', queue.id)),
    )
    const successQueue = partialRows.find((queue: any) => queue.status === 'published'),
      failedQueue = partialRows.find((queue: any) => queue.status === 'failed')
    check(
      'UI dispatch persists one actual adapter success and one deliberate failure',
      successQueue && failedQueue,
    )
    check(
      'parent draft persists partial destination failure truthfully',
      (await row('social-drafts', partial.id)).status === 'partially-published',
    )
    await expect(page.getByTestId(`item-status-${successQueue.id}`)).toHaveText('published')
    await expect(page.getByTestId(`item-status-${failedQueue.id}`)).toHaveText('failed')
    await expect(page.getByTestId(`provider-mode-pill-${successQueue.id}`)).toHaveText(
      'local-harness',
    )
    check('browser presents persisted success, failure and local receipt mode', true)
    const post = (await find('external-posts', { variant: { equals: successQueue.variant } }))[0]
    check(
      'observed provider sink output contains the exact dispatched text',
      (await (await fetch(post.remoteUrl)).json()).text === 'PARTIAL successful local Bluesky',
    )
    check(
      'future scheduling guard prevented provider send',
      sends('FUTURE') === 0 &&
        (await row('social-queue-items', future.queues[0].id)).status === 'scheduled',
    )
    await page.screenshot({ path: `${out}/partial-destination.png`, fullPage: true })
    const countBefore = sends('PARTIAL successful')
    const failedState = await row('social-queue-items', failedQueue.id)
    await sleep(Math.max(0, Date.parse(failedState.nextAttemptAt) - Date.now()) + 30)
    await uiAction('retry-failed-btn')
    check(
      'failed-only UI retry publishes the failure without resending success',
      (await row('social-queue-items', failedQueue.id)).status === 'published' &&
        sends('PARTIAL successful') === countBefore &&
        sends('PARTIAL deliberately') === 2,
    )
    check(
      'partial draft reaches published after only its failed destination recovers',
      (await row('social-drafts', partial.id)).status === 'published',
    )
    phase = 'security-and-native-state-guards'
    for (const action of ['dispatch-item', 'retry-failed', 'reconcile']) {
      await api(
        '/api/admin/social/worker',
        'POST',
        { action, queueItemId: successQueue.id },
        other,
        403,
      )
      check(`foreign scoped actor denied ${action}`, true)
    }
    await api('/api/admin/social/worker', 'POST', { action: 'dispatch' }, '', 403)
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'dispatch-item', queueItemId: future.queues[0].id },
      own,
      403,
      'https://foreign.invalid',
    )
    check('anonymous and authenticated cross-origin dispatch denied', true)
    await api(
      `/api/social-queue-items/${future.queues[0].id}`,
      'PATCH',
      { status: 'published' },
      own,
      403,
    )
    await api(
      '/api/external-posts',
      'POST',
      { account: bsky.id, variant: successQueue.variant, remoteId: 'forged' },
      own,
      403,
    )
    check('native API cannot forge queue completion or provider receipts', true)
    const premature = await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'dispatch-item', queueItemId: future.queues[0].id },
      own,
    )
    check(
      'single-item dispatch also enforces future due time',
      premature.results[0].skipped && sends('FUTURE') === 0,
    )
    const authorizedStaffStats = await api(
      '/api/admin/social/worker',
      'GET',
      undefined,
      sameSiteStaffCookie,
    )
    check(
      'site-scoped staff has real read authority before denied approval test',
      authorizedStaffStats.success,
    )
    const deniedApproval = await api(
      '/api/admin/social/drafts',
      'POST',
      { action: 'approve', draftId: partial.id },
      sameSiteStaffCookie,
      403,
    )
    check(
      'authorized staff role cannot approve delivery',
      deniedApproval.error.includes('owners or administrators'),
    )
    const scheduledFuture = await row('social-queue-items', future.queues[0].id)
    const futureVariantBefore = await row('social-network-variants', scheduledFuture.variant)
    await api(
      `/api/social-network-variants/${futureVariantBefore.id}`,
      'PATCH',
      {
        status: 'published',
        approvalHash: 'forged',
        approvedBy: sameSiteStaff.id,
      },
      sameSiteStaffCookie,
    )
    const futureVariantAfter = await row('social-network-variants', futureVariantBefore.id)
    check(
      'native scoped staff cannot forge approval or variant publication state',
      futureVariantAfter.status === 'scheduled' &&
        futureVariantAfter.approvalHash === futureVariantBefore.approvalHash &&
        futureVariantAfter.approvedBy === futureVariantBefore.approvedBy,
    )
    await api(
      `/api/social-drafts/${future.id}`,
      'PATCH',
      { status: 'published' },
      sameSiteStaffCookie,
    )
    check(
      'native scoped staff cannot forge parent publication state',
      (await row('social-drafts', future.id)).status === 'scheduled',
    )
    const futureUnchanged = await row('social-queue-items', future.queues[0].id)
    check(
      'denied state writes preserve scheduled future work and zero attempts',
      futureUnchanged.status === 'scheduled' &&
        futureUnchanged.attemptCount === 0 &&
        (await find('social-publish-attempts', { queueItem: { equals: futureUnchanged.id } }))
          .length === 0,
    )
    check(
      'denied native receipt creation persists no forged output',
      (await find('external-posts', { remoteId: { equals: 'forged' } })).length === 0,
    )
    phase = 'rate-limit-and-bounded-retry'
    const limited = await make('08C Rate limit', [[rate, 'RATE real local rate limit']])
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'dispatch-item', queueItemId: limited.queues[0].id },
      own,
    )
    const limitedRow = await row('social-queue-items', limited.queues[0].id)
    check(
      'real 429 response persists a future provider retry time',
      limitedRow.status === 'failed' &&
        limitedRow.deadLetterReason.kind === 'rate-limit' &&
        Date.parse(limitedRow.nextAttemptAt) > Date.now(),
    )
    const early = await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'retry-failed', queueItemId: limitedRow.id },
      own,
    )
    check(
      'manual retry cannot bypass provider rate limit',
      early.summary.retriedCount === 0 &&
        (await row('social-queue-items', limitedRow.id)).attemptCount === 1 &&
        sends('RATE') === 0,
    )
    await sleep(Math.max(0, Date.parse(limitedRow.nextAttemptAt) - Date.now()) + 30)
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'retry-failed', queueItemId: limitedRow.id },
      own,
    )
    check(
      'eligible retry succeeds once after rate limit expires',
      (await row('social-queue-items', limitedRow.id)).status === 'published' &&
        sends('RATE') === 1,
    )
    const hard = await make('08C Bounded failure', [[permanent, 'HARD always failed delivery']])
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'dispatch-item', queueItemId: hard.queues[0].id },
      own,
    )
    for (let attempt = 1; attempt < 3; attempt++) {
      const saved = await row('social-queue-items', hard.queues[0].id)
      await sleep(Math.max(0, Date.parse(saved.nextAttemptAt) - Date.now()) + 30)
      await api(
        '/api/admin/social/worker',
        'POST',
        { action: 'retry-failed', queueItemId: saved.id },
        own,
      )
    }
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'retry-failed', queueItemId: hard.queues[0].id },
      own,
    )
    check(
      'failed delivery is bounded at exactly three sends and attempts',
      sends('HARD') === 3 &&
        (await row('social-queue-items', hard.queues[0].id)).attemptCount === 3,
    )
    phase = 'lost-response-timeout-disconnect'
    const lost = await make('08C Lost response', [
      [bsky, 'LOST provider accepted then socket closed'],
    ])
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'dispatch-item', queueItemId: lost.queues[0].id },
      own,
    )
    check(
      'lost provider response persists unknown, not known failure or success',
      (await row('social-queue-items', lost.queues[0].id)).status === 'unknown' &&
        sends('LOST') === 1,
    )
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'retry-failed', queueItemId: lost.queues[0].id },
      own,
    )
    check('failed-only retry excludes uncertain delivery', sends('LOST') === 1)
    await select(lost.id)
    await expect(page.getByTestId(`item-status-${lost.queues[0].id}`)).toContainText(
      'reconciliation required',
    )
    await uiAction(`reconcile-item-btn-${lost.queues[0].id}`)
    check(
      'read-only UI reconciliation finds accepted post without resending',
      (await row('social-queue-items', lost.queues[0].id)).status === 'published' &&
        sends('LOST') === 1,
    )
    const timed = await make('08C Timeout', [
      [timeout, 'TIMEOUT accepted but response never returned'],
    ])
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'dispatch-item', queueItemId: timed.queues[0].id },
      own,
    )
    const timedRow = await row('social-queue-items', timed.queues[0].id)
    check(
      'actual socket timeout remains unknown and quarantined',
      timedRow.status === 'unknown' && timedRow.deadLetterReason.remoteOutcome === 'unknown',
    )
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'retry-failed', queueItemId: timedRow.id },
      own,
    )
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'reconcile', queueItemId: timedRow.id },
      own,
    )
    check(
      'unsupported reconciliation does not replay uncertain Mastodon publication',
      (await row('social-queue-items', timedRow.id)).status === 'unknown' && sends('TIMEOUT') === 1,
    )
    const disconnect = await make('08C Safe disconnect', [[revoked, 'REVOKED must remain unsent']])
    await api(
      `/api/social-accounts/${revoked.id}`,
      'PATCH',
      { credentialHealth: 'revoked', connectionReference: '' },
      own,
    )
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'dispatch-item', queueItemId: disconnect.queues[0].id },
      own,
    )
    const disconnected = await row('social-queue-items', disconnect.queues[0].id)
    check(
      'ordinary disconnect prevents provider calls and persists reconnect-required',
      disconnected.status === 'failed' &&
        disconnected.deadLetterReason.kind === 'reconnect-required' &&
        sends('REVOKED') === 0,
    )
    const blockedAccount = await account('blocked.local', 'activitypub', {
      accessToken: 'local-only',
      serverUrl: 'http://127.0.0.1:3133',
    })
    const blocked = await make('08C Explicit local-origin safety', [
      [blockedAccount, 'BLOCKED unapproved local origin'],
    ])
    await api(
      '/api/admin/social/worker',
      'POST',
      { action: 'dispatch-item', queueItemId: blocked.queues[0].id },
      own,
    )
    const blockedRow = await row('social-queue-items', blocked.queues[0].id)
    check(
      'unconfigured local origin fails truthfully before any provider request',
      blockedRow.status === 'failed' &&
        blockedRow.deadLetterReason.kind === 'validation' &&
        blockedRequests === 0,
    )
    check(
      'configuration refusal remains terminal without automatic retry',
      blockedRow.nextAttemptAt === null && blockedRow.attemptCount === 1,
    )
    phase = 'real-worker-interruption-and-natural-lease-recovery'
    const crash = await make('08C Worker interruption', [
      [bsky, 'CRASH accepted before worker termination'],
    ])
    const pending = api(
      '/api/admin/social/worker',
      'POST',
      { action: 'dispatch-item', queueItemId: crash.queues[0].id },
      own,
    ).catch((error) => ({ interrupted: String(error) }))
    await until('provider accepted crash post', async () => sends('CRASH') === 1, 30000)
    stop(web)
    web = undefined
    await pending
    const interrupted = await row('social-queue-items', crash.queues[0].id)
    check(
      'killed worker leaves real persisted publishing lease and started attempt',
      interrupted.status === 'publishing' &&
        interrupted.leaseUntil &&
        (await find('social-publish-attempts', { queueItem: { equals: interrupted.id } }))[0]
          .status === 'started',
    )
    const workerFd = openSync(`${out}/worker.txt`, 'a')
    worker = spawn(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'src/scripts/run-jobs-worker.ts'],
      { windowsHide: true, stdio: ['ignore', workerFd, workerFd], env: process.env },
    )
    console.log(
      'Waiting for the actual 60-second lease to expire; no database status or deadline edits.',
    )
    await until(
      'automatic worker read-only recovery after natural lease expiry',
      async () => (await row('social-queue-items', interrupted.id)).status === 'published',
      100000,
    )
    check(
      'actual jobs worker recovers expired publication without duplicate provider send',
      sends('CRASH') === 1 && (await row('social-queue-items', interrupted.id)).attemptCount === 1,
    )
    stop(worker)
    worker = undefined
    await startWeb()
    await page.close()
    page = await context.newPage()
    page.setDefaultTimeout(120000)
    await page.goto(`${base}/admin/social`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.getByTestId('draft-workflow-panel').waitFor()
    await select(crash.id)
    await expect(page.getByTestId(`item-status-${interrupted.id}`)).toHaveText('published')
    check('browser reload presents the recovered persisted publication', true)
    await page.screenshot({ path: `${out}/recovered-publication.png`, fullPage: true })
    const queues = await find('social-queue-items')
    const external = await find('external-posts'),
      attempts = await find('social-publish-attempts')
    check(
      'no duplicate confirmed provider IDs in persisted external posts',
      new Set(external.map((post: any) => `${post.account}:${post.remoteId}`)).size ===
        external.length,
    )
    check(
      'uncertain Mastodon outcome remains excluded from published receipts',
      !(await find('external-posts', { variant: { equals: timedRow.variant } })).length,
    )
    check(
      'all persisted receipts identify the actual local protocol harness',
      attempts
        .filter((attempt: any) => attempt.status === 'published')
        .every((attempt: any) => attempt.response.providerMode === 'local-harness'),
    )
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          ownerId: owner.id,
          queues: queues.map((queue: any) => ({
            id: queue.id,
            status: queue.status,
            attemptCount: queue.attemptCount,
          })),
          externalCount: external.length,
          attemptCount: attempts.length,
          sinkRequests: requests,
          sinkRecords: [...records.values()],
        },
        null,
        2,
      ),
    )
    await writeFile(
      `${out}/persistence.json`,
      JSON.stringify({ queues, attempts, external }, null, 2),
    )
    phase = 'completed'
  }
  succeeded = true
} catch (error) {
  trace.push({ phase, failure: error instanceof Error ? error.message : String(error) })
  console.error(error)
  process.exitCode = 1
  if (page) await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {})
} finally {
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify(
      { checksPassed: checks, failed: succeeded ? 0 : 1, skipped: 0, phase, trace },
      null,
      2,
    ),
  )
  stop(worker)
  stop(web)
  await browser.close()
  if (sink) {
    sink.closeAllConnections()
    await new Promise<void>((resolve) => sink!.close(() => resolve()))
  }
  if (blockedSink) {
    blockedSink.closeAllConnections()
    await new Promise<void>((resolve) => blockedSink!.close(() => resolve()))
  }
  await payload.destroy()
  process.exit(process.exitCode ?? 0)
}
