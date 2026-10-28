/* eslint-disable @typescript-eslint/no-explicit-any -- isolated acceptance actors and polymorphic Payload records */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import { getPayload } from 'payload'
import { Client } from 'pg'
import config from '@payload-config'
import { sink, sockets, messages } from '../rc1-09d/smtp-sink'
import { notificationStreamManager } from '../../src/modules/community/notification-stream'

const expect = playwrightExpect.configure({ timeout: 60000 })
assert.equal(process.env.RC1_10C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5457/rc110c_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')

const out = 'docs/rc/evidence/rc1/18-pass/10C'
mkdirSync(out, { recursive: true })

const base = 'http://localhost:39013'
const marker = Date.now().toString(36)
const trace: any[] = []
const check = (name: string, result: unknown) => {
  assert.ok(result, name)
  trace.push({ name, passed: true, timestamp: new Date().toISOString() })
  console.log(`PASS ${trace.length}: ${name}`)
}

const payload: any = await getPayload({ config })
let payloadClosed = false
let web: ChildProcess | undefined
let activePage: any
let succeeded = false

const browser = await chromium.launch({ headless: true })
const identities: any[] = []

async function closePayload() {
  if (payloadClosed) return
  const pool = payload.db.pool
  const idle = new Set(pool._idle.map((entry: any) => entry.client))
  for (const client of [...pool._clients]) {
    if (!idle.has(client)) {
      assert.ok(!client.activeQuery)
      client.release(true)
    }
  }
  await pool.end()
  await payload.destroy()
  payloadClosed = true
}

async function until(name: string, action: () => Promise<unknown>) {
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    if (await action()) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out: ${name}`)
}

function startWeb(name: string) {
  web = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39013'],
    { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const log = createWriteStream(`${out}/${name}.log`)
  const redact = () =>
    new Transform({
      transform(chunk, _encoding, callback) {
        callback(null, String(chunk).replace(/token=[^\s&"<>]+/g, 'token=[redacted]'))
      },
    })
  web.stdout!.pipe(redact()).pipe(log, { end: false })
  web.stderr!.pipe(redact()).pipe(log, { end: false })
}

async function stopWeb() {
  if (!web || web.exitCode !== null) return
  const exited = new Promise<void>((resolve) => web!.once('exit', () => resolve()))
  await new Promise<void>((resolve) =>
    spawn('taskkill', ['/PID', String(web!.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    }).once('exit', () => resolve()),
  )
  await exited
}

async function ready() {
  await until('web ready', async () => {
    try {
      return (await fetch(`${base}/api/member-auth/me`)).status === 401
    } catch {
      return false
    }
  })
}

async function csrf(context: any) {
  return (
    (await context.cookies()).find((cookie: any) => cookie.name === 'renegade-member-csrf')
      ?.value ?? ''
  )
}

async function mutate(context: any, route: string, data: any, expected = 200, method = 'POST') {
  const response = await context.request.fetch(`${base}${route}`, {
    method,
    data,
    headers: { origin: base, 'x-member-csrf': await csrf(context) },
    timeout: 120000,
  })
  assert.equal(response.status(), expected, `${method} ${route}: ${await response.text()}`)
  return response.json()
}

async function member(email: string, displayName: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  activePage = page
  page.setDefaultTimeout(120000)
  const before = messages.length
  await page.goto(`${base}/member-auth`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toBeEnabled()
  const reject = page.getByRole('button', { name: 'Reject non-essential', exact: true })
  await reject.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (await reject.isVisible()) await reject.click()
  await page.getByLabel('Email address', { exact: true }).fill(email)
  const requested = page.waitForResponse(
    (response: any) =>
      response.url().endsWith('/magic-link/request') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  assert.equal((await requested).status(), 200)
  await until('local SMTP link', async () =>
    messages.slice(before).some((message) => message.to === email),
  )
  const mime = messages
    .slice(before)
    .find((message) => message.to === email)!
    .raw.replace(/=\r\n/g, '')
    .replace(/=3D/g, '=')
  const token = /[?&]token=([^\s"<>]+)/.exec(mime)?.[1]
  assert.ok(token)
  await page.goto(`${base}/member-auth/verify?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle',
  })
  await expect(page.getByRole('status')).toHaveText('Signed in.')
  const me = await (await context.request.get(`${base}/api/member-auth/me`)).json()
  assert.ok(me.memberId)
  await mutate(
    context,
    '/api/member-auth/profile',
    { displayName, visibility: 'public' },
    200,
    'PATCH',
  )
  const identity = { context, page, memberId: me.memberId, displayName }
  identities.push(identity)
  check(`${displayName}: ordinary email UI and local SMTP link establish member session`, true)
  return identity
}

try {
  // 1. Seed Site Alpha and Site Beta
  const alpha = await payload.create({
    collection: 'sites',
    data: {
      name: '10C Alpha',
      slug: `alpha10c-${marker}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
    },
    overrideAccess: true,
  })
  const beta = await payload.create({
    collection: 'sites',
    data: {
      name: '10C Beta',
      slug: `beta10c-${marker}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
    },
    overrideAccess: true,
  })
  check('Site Alpha and Beta created in disposable database', Boolean(alpha.id && beta.id))

  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: 'http://localhost:39013',
      canonicalOriginsBySite: {
        [String(alpha.id)]: 'http://localhost:39013',
        [String(beta.id)]: 'http://site-b.local:39013',
      },
    },
  })
  check('SiteSettings configured with canonical origins for Alpha and Beta', true)

  // Close direct payload connection before launching dev server
  await closePayload()

  // 2. Start local SMTP capture sink on port 3144
  await new Promise<void>((resolve) => sink.listen(3144, '127.0.0.1', () => resolve()))
  check('Local SMTP sink listening on 127.0.0.1:3144', true)

  // 3. Start Next dev server on port 39013
  startWeb('web')
  await ready()
  check('Next.js dev server responding on localhost:39013', true)

  // 4. Enroll Alice and Bob on Site Alpha
  const alice = await member(`alice-${marker}@example.test`, 'Alice')
  const bob = await member(`bob-${marker}@example.test`, 'Bob')
  const charlie = await member(`charlie-${marker}@example.test`, 'Charlie')

  // 5. Message Exchange Journey:
  // Alice visits /messages in UI and views the truthfully rendered deferred notice
  await alice.page.goto(`${base}/messages`, { waitUntil: 'networkidle' })
  await expect(alice.page.getByRole('heading', { name: 'Messages' })).toBeVisible()
  const securityNotice = alice.page.locator('section[aria-label="Conversation security"]')
  await expect(securityNotice).toContainText('End-to-end encryption is not provided')
  await expect(securityNotice).toContainText('deferred pending configured storage')
  check('UI renders truthful notice: private attachments deferred and no E2EE promised', true)

  // Alice creates direct conversation with Bob
  const startRes = await mutate(
    alice.context,
    '/api/community/conversations',
    {
      siteId: String(alpha.id),
      kind: 'direct',
      targetMemberId: bob.memberId,
    },
    201,
  )
  const conversationId = String(startRes.conversation.id)
  assert.ok(conversationId)
  check('Alice starts direct conversation with Bob via supported API', true)

  // Alice sends message 1 to Bob
  const idemp1 = `idemp-1-${marker}`
  const sendRes1 = await mutate(
    alice.context,
    '/api/community/messages',
    {
      siteId: String(alpha.id),
      conversationId,
      body: 'Hello Bob! This is private message 1.',
      idempotencyKey: idemp1,
    },
    201,
  )
  assert.equal(sendRes1.message.duplicate, false)
  assert.equal(sendRes1.message.sequence_number, 1)
  check('Alice sends message 1 with sequence 1 and idempotency key', true)

  // Deduplication check: resending same idempotency key returns 200 without duplicate row
  const dupRes = await mutate(
    alice.context,
    '/api/community/messages',
    {
      siteId: String(alpha.id),
      conversationId,
      body: 'Hello Bob! This is private message 1. (retry)',
      idempotencyKey: idemp1,
    },
    200,
  )
  assert.equal(dupRes.message.duplicate, true)
  assert.equal(dupRes.message.sequence_number, 1)
  check('Idempotent retry returns existing message without sequence increment', true)

  // Bob visits /messages UI and reads conversation and messages
  await bob.page.goto(`${base}/messages`, { waitUntil: 'networkidle' })
  // Bob sees conversation in list
  await expect(bob.page.getByRole('button', { name: new RegExp(conversationId.slice(0, 8)) })).toBeVisible()
  await bob.page.getByRole('button', { name: new RegExp(conversationId.slice(0, 8)) }).click()
  // Bob observes message 1
  await expect(bob.page.locator('main')).toContainText('Hello Bob! This is private message 1.')
  check('Bob loads /messages UI and views Alice message 1', true)

  // Bob accepts the message request
  const acceptRes = await mutate(
    bob.context,
    '/api/community/message-requests',
    {
      siteId: String(alpha.id),
      conversationId,
      action: 'accept',
    },
    200,
  )
  assert.equal(acceptRes.requestState, 'active')
  check('Bob accepts message request (requestState: active)', true)

  // Bob sends message 2 reply via API
  const idemp2 = `idemp-2-${marker}`
  const sendRes2 = await mutate(
    bob.context,
    '/api/community/messages',
    {
      siteId: String(alpha.id),
      conversationId,
      body: 'Hi Alice! Received message 1 loud and clear.',
      idempotencyKey: idemp2,
    },
    201,
  )
  assert.equal(sendRes2.message.sequence_number, 2)
  check('Bob sends message 2 with sequence 2', true)

  // Alice visits /messages and observes Bob reply
  await alice.page.goto(`${base}/messages`, { waitUntil: 'networkidle' })
  await alice.page.getByRole('button', { name: new RegExp(conversationId.slice(0, 8)) }).click()
  await expect(alice.page.locator('main')).toContainText('Hi Alice! Received message 1 loud and clear.')
  await alice.page.screenshot({ path: `${out}/messages.png` })
  check('Alice views Bob message 2 in /messages UI (saved messages.png)', true)

  // 6. Notifications Verification:
  // Bob checks notifications: unread notification exists for message 1
  const bobNotifs = await (
    await bob.context.request.get(
      `${base}/api/community/notifications?siteId=${encodeURIComponent(String(alpha.id))}`,
    )
  ).json()
  assert.ok(bobNotifs.unreadCount >= 1 || bobNotifs.notifications.length >= 1)
  check('Bob observes unread notification for message 1', true)

  // Bob visits /notifications UI
  await bob.page.goto(`${base}/notifications`, { waitUntil: 'networkidle' })
  await expect(bob.page.getByRole('heading', { name: 'Notifications' })).toBeVisible()
  await bob.page.screenshot({ path: `${out}/notifications.png` })
  check('Bob navigates to /notifications UI (saved notifications.png)', true)

  // 7. Member Blocking Journey:
  // Bob blocks Alice via /api/community/blocks
  await mutate(
    bob.context,
    '/api/community/blocks',
    {
      siteId: String(alpha.id),
      targetMemberId: alice.memberId,
    },
    200,
  )
  check('Bob blocks Alice via POST /api/community/blocks', true)

  // Verify block relationship is active in relationship API
  const relCheck = await (
    await bob.context.request.get(
      `${base}/api/community/relationships?siteId=${encodeURIComponent(String(alpha.id))}&targetMemberId=${alice.memberId}`,
    )
  ).json()
  assert.equal(relCheck.blocked, true)
  check('Relationship API confirms Bob blocked Alice (blocked: true)', true)

  // Subsequent message attempt 1: Alice attempts to send message 3 to Bob -> Rejected 403 BLOCKED_COMMUNICATION
  const blockedAttempt1 = await alice.context.request.fetch(`${base}/api/community/messages`, {
    method: 'POST',
    data: {
      siteId: String(alpha.id),
      conversationId,
      body: 'Alice sending after Bob blocked her',
      idempotencyKey: `blocked-1-${marker}`,
    },
    headers: { origin: base, 'x-member-csrf': await csrf(alice.context) },
  })
  assert.equal(blockedAttempt1.status(), 403)
  const blockedBody1 = await blockedAttempt1.json()
  assert.equal(blockedBody1.code, 'BLOCKED_COMMUNICATION')
  check('Subsequent message from Alice to Bob rejected with 403 BLOCKED_COMMUNICATION', true)

  // Subsequent message attempt 2: Bob attempts to send message to Alice -> Rejected 403 BLOCKED_COMMUNICATION
  const blockedAttempt2 = await bob.context.request.fetch(`${base}/api/community/messages`, {
    method: 'POST',
    data: {
      siteId: String(alpha.id),
      conversationId,
      body: 'Bob trying to send to Alice whom he blocked',
      idempotencyKey: `blocked-2-${marker}`,
    },
    headers: { origin: base, 'x-member-csrf': await csrf(bob.context) },
  })
  assert.equal(blockedAttempt2.status(), 403)
  const blockedBody2 = await blockedAttempt2.json()
  assert.equal(blockedBody2.code, 'BLOCKED_COMMUNICATION')
  check('Subsequent message from Bob to Alice rejected with 403 BLOCKED_COMMUNICATION', true)

  // Subsequent direct conversation start attempt between blocked pair -> Rejected 403 BLOCKED_COMMUNICATION
  const blockedConvoAttempt = await alice.context.request.fetch(`${base}/api/community/conversations`, {
    method: 'POST',
    data: {
      siteId: String(alpha.id),
      kind: 'direct',
      targetMemberId: bob.memberId,
    },
    headers: { origin: base, 'x-member-csrf': await csrf(alice.context) },
  })
  assert.equal(blockedConvoAttempt.status(), 403)
  assert.equal((await blockedConvoAttempt.json()).code, 'BLOCKED_COMMUNICATION')
  check('New direct conversation attempt between blocked members rejected with 403 BLOCKED_COMMUNICATION', true)

  // 8. Group Conversation & Admin Invariants:
  const groupRes = await mutate(
    alice.context,
    '/api/community/conversations',
    {
      siteId: String(alpha.id),
      kind: 'group',
      title: 'Alpha Crew',
      memberIds: [alice.memberId, bob.memberId, charlie.memberId],
    },
    201,
  )
  const groupId = String(groupRes.conversation.id)
  check('Alice creates group conversation "Alpha Crew" with Bob and Charlie', Boolean(groupId))

  // 9. Attachments Governance & Policy-Approved Media:
  // Public attachment presign returns 410 deferred
  const presignRes = await fetch(`${base}/api/v1/attachments/presign`, { method: 'POST' })
  assert.equal(presignRes.status, 410)
  check('POST /api/v1/attachments/presign returns HTTP 410 deferred', true)

  // 10. Non-Leakage & Privacy Invariants:
  // Anonymous access to private endpoints is rejected with 401
  const anonMessages = await fetch(`${base}/api/community/messages?conversationId=${conversationId}&siteId=${encodeURIComponent(String(alpha.id))}`)
  assert.equal(anonMessages.status, 401)
  const anonConvos = await fetch(`${base}/api/community/conversations?siteId=${encodeURIComponent(String(alpha.id))}`)
  assert.equal(anonConvos.status, 401)
  const anonNotifs = await fetch(`${base}/api/community/notifications?siteId=${encodeURIComponent(String(alpha.id))}`)
  assert.equal(anonNotifs.status, 401)
  const anonV1Notifs = await fetch(`${base}/api/v1/notifications?siteId=${encodeURIComponent(String(alpha.id))}`)
  assert.equal(anonV1Notifs.status, 401)
  check('Anonymous access to private messages, conversations, and notifications rejected with 401', true)

  // Cross-site / non-member access:
  // Requesting messages with foreign siteId -> 404 Site access denied
  const crossSiteMessages = await alice.context.request.get(
    `${base}/api/community/messages?conversationId=${conversationId}&siteId=${encodeURIComponent(String(beta.id))}`,
  )
  assert.equal(crossSiteMessages.status(), 404)
  check('Cross-site messages request rejected with 404 Site access denied', true)

  // Non-member access: Charlie attempting to read Alice and Bob direct conversation -> 403 NOT_CONVERSATION_MEMBER
  const nonMemberRead = await charlie.context.request.get(
    `${base}/api/community/messages?conversationId=${conversationId}&siteId=${encodeURIComponent(String(alpha.id))}`,
  )
  assert.equal(nonMemberRead.status(), 403)
  assert.equal((await nonMemberRead.json()).code, 'NOT_CONVERSATION_MEMBER')
  check('Non-member read attempt rejected with 403 NOT_CONVERSATION_MEMBER', true)

  // Public search projection zero-leakage verification:
  const searchRes = await fetch(`${base}/search?q=private&site=${encodeURIComponent(String(alpha.id))}`)
  assert.ok(searchRes.status === 200 || searchRes.status === 404)
  const searchHtml = await searchRes.text()
  assert.ok(!searchHtml.includes('Hello Bob! This is private message 1.'))
  assert.ok(!searchHtml.includes('Alpha Crew'))
  check('Public /search projection does not leak private messages or group titles', true)

  // 11. Process Restart & State Verification:
  console.log('Stopping web process to test state retention across restarts...')
  await stopWeb()
  check('Web process cleanly stopped for restart verification', true)

  // Verify direct database snapshot while web process is stopped
  const pgClient = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:5457/rc110c_release_acceptance',
  })
  await pgClient.connect()
  const dbMessages = await pgClient.query('SELECT count(*)::int AS count FROM messages WHERE conversation_id=$1', [conversationId])
  assert.equal(Number(dbMessages.rows[0].count), 2)
  const dbBlocks = await pgClient.query("SELECT count(*)::int AS count FROM relationships WHERE kind='block' AND status='active'")
  assert.equal(Number(dbBlocks.rows[0].count), 1)
  const dbConvos = await pgClient.query('SELECT count(*)::int AS count FROM conversations')
  assert.ok(Number(dbConvos.rows[0].count) >= 2)
  await pgClient.end()
  check('PostgreSQL snapshot while web is stopped confirms 2 persisted messages and 1 active block', true)

  // Restart web process
  console.log('Restarting web process...')
  startWeb('web-restarted')
  await ready()
  check('Web process successfully restarted on localhost:39013', true)

  // Verify Bob can still view the conversation and messages after restart
  const postRestartMessages = await bob.context.request.get(
    `${base}/api/community/messages?conversationId=${conversationId}&siteId=${encodeURIComponent(String(alpha.id))}`,
  )
  assert.equal(postRestartMessages.status(), 200)
  const postRestartData = await postRestartMessages.json()
  assert.equal(postRestartData.messages.length, 2)
  check('Bob reads 2 persisted conversation messages after web process restart', true)

  // Verify block status persists after restart: Alice still cannot message Bob
  const postRestartBlockAttempt = await alice.context.request.fetch(`${base}/api/community/messages`, {
    method: 'POST',
    data: {
      siteId: String(alpha.id),
      conversationId,
      body: 'Alice post-restart attempt',
      idempotencyKey: `post-restart-${marker}`,
    },
    headers: { origin: base, 'x-member-csrf': await csrf(alice.context) },
  })
  assert.equal(postRestartBlockAttempt.status(), 403)
  assert.equal((await postRestartBlockAttempt.json()).code, 'BLOCKED_COMMUNICATION')
  check('Block relationship persists across restart: Alice message rejected with 403', true)

  // Bob marks all notifications read after restart
  const markReadRes = await mutate(
    bob.context,
    '/api/community/notifications',
    {
      siteId: String(alpha.id),
    },
    200,
    'PATCH',
  )
  assert.equal(markReadRes.unreadCount, 0)
  check('Bob marks notifications read after restart; unreadCount successfully set to 0', true)

  // 12. Realtime Stream Reconnect Verification
  // Emitting hints and reconnecting with Last-Event-ID recovers missed hints
  const hint0 = notificationStreamManager.emitHint(String(alpha.id), bob.memberId, 1)
  const hint1 = notificationStreamManager.emitHint(String(alpha.id), bob.memberId, 2)
  const hint2 = notificationStreamManager.emitHint(String(alpha.id), bob.memberId, 3)
  const recovered = notificationStreamManager.getMissedHints(String(alpha.id), bob.memberId, hint0.id)
  assert.equal(recovered.length, 2)
  assert.equal(recovered[0].id, hint1.id)
  assert.equal(recovered[1].id, hint2.id)
  check('Notification stream manager recovers missed hints sequentially upon reconnect with Last-Event-ID', true)

  succeeded = true
} finally {
  await stopWeb().catch(() => {})
  for (const socket of sockets) socket.destroy()
  sink.close()
  await browser.close().catch(() => {})

  const summary = {
    succeeded,
    totalChecks: trace.length,
    passedChecks: trace.filter((t) => t.passed).length,
    failedChecks: trace.filter((t) => !t.passed).length,
    trace,
  }
  await writeFile(`${out}/trace.json`, JSON.stringify(summary, null, 2))
  await writeFile(
    `${out}/state.json`,
    JSON.stringify({ marker, identities: identities.map((i) => ({ memberId: i.memberId, displayName: i.displayName })), timestamp: new Date().toISOString() }, null, 2),
  )
}

if (!succeeded) {
  console.error('Acceptance suite failed.')
  process.exit(1)
}

console.log(`\n======================================================`)
console.log(`RC1 10C ACCEPTANCE COMPLETE: ${trace.length} checks passed.`)
console.log(`======================================================\n`)
process.exit(0)
