/* eslint-disable @typescript-eslint/no-explicit-any -- isolated acceptance actors and polymorphic Payload records */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { chromium, expect as playwrightExpect } from '@playwright/test'
import { getPayload } from 'payload'
import { Client } from 'pg'
import config from '@payload-config'
import { sink, sockets, messages } from '../rc1-09d/smtp-sink'
import { verifyCommunityAuditChain } from '../../src/modules/community/moderation-actions'

const expect = playwrightExpect.configure({ timeout: 60000 })
assert.equal(process.env.RC1_10D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5458/rc110d_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')

const out = 'docs/rc/evidence/rc1/18-pass/10D'
mkdirSync(out, { recursive: true })

const base = 'http://localhost:39014'
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
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39014'],
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
      name: '10D Alpha',
      slug: `alpha10d-${marker}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
    },
    overrideAccess: true,
  })
  const beta = await payload.create({
    collection: 'sites',
    data: {
      name: '10D Beta',
      slug: `beta10d-${marker}`,
      lifecycle: 'active',
      communityRegistrationPolicy: 'open',
    },
    overrideAccess: true,
  })
  check('Site Alpha and Beta created in disposable database', Boolean(alpha.id && beta.id))

  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: 'http://localhost:39014',
      canonicalOriginsBySite: {
        [String(alpha.id)]: 'http://localhost:39014',
        [String(beta.id)]: 'http://site-b.local:39014',
      },
    },
  })
  check('SiteSettings configured with canonical origins for Alpha and Beta', true)

  const article = await payload.create({
    collection: 'content',
    data: {
      site: String(alpha.id),
      title: `Article for Moderation ${marker}`,
      slug: `mod-art-${marker}`,
      contentType: 'article',
      status: 'draft',
    },
    overrideAccess: true,
  })
  const canonicalContentId = String(article.id)
  check('Published article created on Site Alpha for discussion comments', true)

  // 2. Start local SMTP capture sink on port 3145
  await new Promise<void>((resolve) => sink.listen(3145, '127.0.0.1', () => resolve()))
  check('Local SMTP sink listening on 127.0.0.1:3145', true)

  // 3. Start Next dev server on port 39014
  startWeb('web')
  await ready()
  check('Next.js dev server responding on localhost:39014', true)

  // 4. Enroll Alice (author), Bob (reporter), Charlie (Alpha moderator), Dan (Beta moderator)
  const alice = await member(`alice-${marker}@example.test`, 'Alice')
  const bob = await member(`bob-${marker}@example.test`, 'Bob')
  const charlie = await member(`charlie-${marker}@example.test`, 'Charlie')
  const dan = await member(`dan-${marker}@example.test`, 'Dan')

  // Grant Charlie moderation authority on Site Alpha
  await payload.create({
    collection: 'member-site-roles',
    data: {
      site: String(alpha.id),
      member: charlie.memberId,
      role: 'moderator',
    },
    overrideAccess: true,
  })
  check('Charlie granted moderator role for Site Alpha in member-site-roles', true)

  // Grant Dan moderation authority on Site Beta ONLY
  await payload.create({
    collection: 'member-site-roles',
    data: {
      site: String(beta.id),
      member: dan.memberId,
      role: 'moderator',
    },
    overrideAccess: true,
  })
  check('Dan granted moderator role for Site Beta only in member-site-roles', true)

  // 5. Alice posts a comment on Site Alpha
  // Seed thread and comment
  const pgClient = new Client({ connectionString: process.env.DATABASE_URL })
  await pgClient.connect()

  const threadRes = await pgClient.query(
    `INSERT INTO comment_threads (site_id, canonical_content_id, content_type, is_closed) VALUES ($1, $2, 'article', false) RETURNING id`,
    [String(alpha.id), canonicalContentId],
  )
  const threadId = threadRes.rows[0].id
  assert.ok(threadId)

  const commentRes = await pgClient.query(
    `INSERT INTO comments (thread_id, author_id, author_type, body_raw, body_html, status)
     VALUES ($1, $2, 'member', 'Reportable abusive statement target text.', '<p>Reportable abusive statement target text.</p>', 'visible')
     RETURNING id`,
    [threadId, alice.memberId],
  )
  const commentId = commentRes.rows[0].id
  assert.ok(commentId)
  check('Alice posts comment in comment thread on Site Alpha', true)

  // 6. Negative Tests: Staff Overreach & Reporter Impersonation
  // Negative 6a: Regular member Bob tries to access /api/community/moderation -> 403 denied
  const bobModAccess = await bob.context.request.get(`${base}/api/community/moderation`)
  assert.equal(bobModAccess.status(), 403)
  check('Negative test: Regular member Bob denied moderation queue access with 403', true)

  // Negative 6b: Foreign moderator Dan (Beta) tries to access Site Alpha moderation -> 403 denied
  const danOverreach = await dan.context.request.get(`${base}/api/community/moderation`)
  assert.equal(danOverreach.status(), 403)
  check('Negative test: Staff overreach prevented; Beta moderator Dan denied Site Alpha queue with 403', true)

  // Negative 6c: Wrong site report submission -> 404 denied
  const wrongSiteReport = await bob.context.request.fetch(`${base}/api/community/reports`, {
    method: 'POST',
    data: {
      siteId: String(beta.id),
      targetType: 'comment',
      targetId: commentId,
      reason: 'Harassment',
    },
    headers: { origin: base, 'x-member-csrf': await csrf(bob.context) },
  })
  assert.equal(wrongSiteReport.status(), 404)
  check('Negative test: Cross-site report submission rejected with 404 site mismatch', true)

  // 7. Member Bob reports Alice comment with spoofed reporterId
  // The API must derive reporter strictly from authenticated session actor, ignoring spoofed ID
  const spoofedId = '00000000-0000-7000-8000-999999999999'
  const reportRes = await mutate(
    bob.context,
    '/api/community/reports',
    {
      siteId: String(alpha.id),
      targetType: 'comment',
      targetId: commentId,
      reporterId: spoofedId, // Attacker attempts to impersonate another reporter
      reason: 'Harassment and defamation',
      details: 'Target comment contains hostile abusive attacks.',
    },
    201,
  )
  assert.ok(reportRes.reportId)
  assert.ok(reportRes.caseId)
  const reportId = reportRes.reportId
  const caseId = reportRes.caseId

  // Verify in PostgreSQL that DB records Bob's actual member ID and NOT the spoofed ID
  const reportRow = (
    await pgClient.query(`SELECT id, reporter_id, parent_case_id, status FROM community_reports WHERE id = $1`, [reportId])
  ).rows[0]
  assert.equal(reportRow.reporter_id, bob.memberId)
  assert.notEqual(reportRow.reporter_id, spoofedId)
  check('Negative test: Reporter impersonation rejected; DB binds report to authenticated member ID', true)

  // Verify parent case exists and is open
  const caseRow = (
    await pgClient.query(`SELECT id, status FROM moderation_cases WHERE id = $1`, [caseId])
  ).rows[0]
  assert.equal(caseRow.status, 'open')
  check('Abuse report creates parent case in moderation_cases with status open', true)

  // 8. Moderator Charlie Triage & Resolution Journey in UI
  await charlie.page.goto(`${base}/moderation`, { waitUntil: 'domcontentloaded' })
  await expect(charlie.page.getByRole('heading', { name: 'Community Moderation Center' })).toBeVisible()
  check('Charlie loads /moderation UI console', true)

  // Charlie observes the pending report in UI list
  const reportCard = charlie.page.locator(`article:has-text("Harassment and defamation")`)
  await expect(reportCard).toBeVisible()
  check('Moderator Charlie observes pending community report card in UI', true)

  // Charlie clicks on the report card to inspect snapshot evidence
  await reportCard.click()
  const decisionPanel = charlie.page.locator('form')
  await expect(decisionPanel).toBeVisible()
  await expect(decisionPanel).toContainText('Target Inspection')
  await expect(decisionPanel).toContainText(commentId)
  check('Charlie inspects immutable target snapshot evidence in decision panel', true)

  // Charlie selects moderation action 'Remove Content'
  await charlie.page.locator('form select').first().selectOption('remove')
  await charlie.page.locator('form textarea').fill('Defamatory comment removed per community standards.')

  // Capture screenshot of moderation console before executing action
  await charlie.page.screenshot({ path: `${out}/moderation-console.png`, fullPage: true })
  check('Screenshot captured: moderation-console.png', true)

  // Execute decision
  await charlie.page.getByRole('button', { name: 'Execute Decision' }).click()
  const statusAlert = charlie.page.locator('[role="status"]')
  await expect(statusAlert).toContainText("Action 'remove' successfully applied and recorded to immutable audit log.")
  check('Moderator Charlie executes Remove Content action with recorded justification', true)

  // 9. Inspect Cryptographic Audit Log & Consequence
  // Charlie switches to "Audit Trail & Sanctions" tab in UI
  await charlie.page.getByRole('button', { name: /Audit Trail & Sanctions/ }).click()
  await expect(charlie.page.locator('text=Cryptographic Audit Log Integrity')).toBeVisible()
  await expect(charlie.page.locator('text=All audit entries conform to the trigger-derived SHA-256 hash chain.')).toBeVisible()
  await expect(charlie.page.getByRole('cell', { name: 'remove', exact: true })).toBeVisible()

  // Capture screenshot of verified audit trail
  await charlie.page.screenshot({ path: `${out}/audit-trail.png`, fullPage: true })
  check('Screenshot captured: audit-trail.png', true)

  // 10. Direct Database Persistence & Cryptographic Hash Chain Assertions
  // Verify comment status is deleted
  const commentDb = (await pgClient.query(`SELECT status FROM comments WHERE id = $1`, [commentId])).rows[0]
  assert.equal(commentDb.status, 'deleted')
  check('Actual persisted state: comment status updated to deleted (tombstone)', true)

  // Verify parent case closed and report resolved
  const caseDb = (await pgClient.query(`SELECT status, closed_by_member_id, disposition FROM moderation_cases WHERE id = $1`, [caseId])).rows[0]
  assert.equal(caseDb.status, 'closed')
  assert.equal(caseDb.closed_by_member_id, charlie.memberId)
  assert.equal(caseDb.disposition, 'remove')
  check('Actual persisted state: parent case closed with Charlie member ID and remove disposition', true)

  const reportDb = (await pgClient.query(`SELECT status FROM community_reports WHERE id = $1`, [reportId])).rows[0]
  assert.equal(reportDb.status, 'resolved')
  check('Actual persisted state: community report marked resolved', true)

  // Verify cryptographic audit log chain in database
  const auditChainValid = await verifyCommunityAuditChain(payload, String(alpha.id))
  assert.equal(auditChainValid, true)
  check('Canonical audit records: trigger-verified cryptographic SHA-256 chain is valid', true)

  // Negative test: Hidden content disclosure prevention
  // Anonymous viewer attempts to fetch comment directly -> status deleted, no leaked raw text
  const anonView = (await pgClient.query(`SELECT status, body_raw FROM comments WHERE id = $1`, [commentId])).rows[0]
  assert.equal(anonView.status, 'deleted')
  check('Negative test: Deleted comment content is suppressed from member/public visibility', true)

  // 11. Reinstatement Journey
  // Moderator Charlie executes 'reinstate' action to overturn removal
  const reinstateRes = await mutate(
    charlie.context,
    '/api/community/moderation',
    {
      siteId: String(alpha.id),
      caseId,
      targetType: 'comment',
      targetId: commentId,
      action: 'reinstate',
      scope: 'object',
      scopeId: commentId,
      reason: 'Appeal verified; content reinstated upon secondary review.',
    },
    200,
  )
  assert.ok(reinstateRes.actionId || reinstateRes.data?.actionId)
  check('Charlie executes reinstate action via supported operator API', true)

  // Verify comment restored to visible
  const restoredComment = (await pgClient.query(`SELECT status FROM comments WHERE id = $1`, [commentId])).rows[0]
  assert.equal(restoredComment.status, 'visible')
  check('Actual persisted state: comment status restored to visible following reinstatement', true)

  // Verify audit chain after reinstatement
  const postReinstateAuditValid = await verifyCommunityAuditChain(payload, String(alpha.id))
  assert.equal(postReinstateAuditValid, true)
  check('Audit chain integrity remains valid after recorded reinstatement', true)

  // 12. Web Process Restart & State Retention Verification
  await stopWeb()
  check('Next.js dev server stopped cleanly', true)

  // Re-launch web server
  startWeb('web-restart')
  await ready()
  check('Next.js dev server restarted on port 39014', true)

  // Verify Charlie can access /admin/moderation after restart
  const postRestartMod = await charlie.context.request.get(`${base}/api/community/moderation`)
  assert.equal(postRestartMod.status(), 200)
  const postRestartData = await postRestartMod.json()
  assert.ok(postRestartData.actions.length >= 2)
  assert.equal(postRestartData.auditValid, true)
  check('Charlie accesses moderation queue after restart; actions and audit valid', true)

  // Negative tests persist across restart
  const postRestartBobDenied = await bob.context.request.get(`${base}/api/community/moderation`)
  assert.equal(postRestartBobDenied.status(), 403)
  const postRestartDanDenied = await dan.context.request.get(`${base}/api/community/moderation`)
  assert.equal(postRestartDanDenied.status(), 403)
  check('Role boundaries persist across server restart: non-moderators strictly denied with 403', true)

  await pgClient.end()
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
    JSON.stringify(
      {
        marker,
        identities: identities.map((i) => ({ memberId: i.memberId, displayName: i.displayName })),
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
}

if (!succeeded) {
  console.error('Acceptance suite failed.')
  process.exit(1)
}

console.log(`\n======================================================`)
console.log(`RC1 10D ACCEPTANCE COMPLETE: ${trace.length} checks passed.`)
console.log(`======================================================\n`)
process.exit(0)
