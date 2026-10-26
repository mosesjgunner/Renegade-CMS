/* eslint-disable @typescript-eslint/no-explicit-any -- isolated UI/local SMTP acceptance */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { suppressSubscriber } from '../../src/modules/audience/service'
import { audienceDigest } from '../../src/modules/audience/contracts'
import { sink, sockets, messages } from './smtp-sink'

const out = 'docs/rc/evidence/rc1/18-pass/09D'
assert.equal(process.env.RC1_09D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5453/rc109d_release_acceptance',
)
const payload: any = await getPayload({ config })
const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
const trace: any[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
let worker: ChildProcess | undefined, web: ChildProcess | undefined
const start = (args: string[], logName: string) => {
  const child = spawn(process.execPath, args, {
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log = createWriteStream(`${out}/${logName}.log`)
  child.stdout!.pipe(log)
  child.stderr!.pipe(log)
  return child
}
async function until(name: string, fn: () => Promise<any>, timeout = 120000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timed out: ${name}`)
}
const browser = await chromium.launch({ headless: true })
const base = 'http://localhost:39003'
const visitorEmail = `browser.visitor-${Date.now()}@example.test`
try {
  const priorVisitors = await payload.find({
    collection: 'subscribers',
    where: { site: { equals: state.alphaSiteId }, email: { like: 'browser.visitor' } },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const prior of priorVisitors.docs)
    await suppressSubscriber(payload, {
      siteId: state.alphaSiteId,
      email: prior.email,
      reason: 'unsubscribe',
    })
  await new Promise<void>((r) => sink.listen(3141, '127.0.0.1', r))
  worker = start(['--import', 'tsx', 'src/scripts/run-jobs-worker.ts'], 'browser-worker')
  web = start(
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '39003',
    ],
    'browser-web',
  )
  await until('Next boot', async () => {
    try {
      return (await fetch(`${base}/api/health`)).status !== 502
    } catch {
      return false
    }
  })
  // Compile every relevant development route before UI assertions; route compilation
  // otherwise causes a full-page refresh and discards transient client feedback.
  for (const route of [
    '/subscribe',
    '/subscribe/confirm',
    '/subscribe/preferences',
    '/api/subscribers/subscribe',
    '/api/subscribers/confirm',
    '/api/subscribers/preferences',
    '/api/admin/audience/crm',
    '/api/admin/audience/command-center',
    '/api/admin/audience/campaign',
    '/api/analytics/consent',
    '/admin/audience',
  ]) {
    const warm = await fetch(`${base}${route}`)
    await warm.arrayBuffer()
  }
  const visitor = await browser.newContext({ timezoneId: 'UTC' })
  const page = await visitor.newPage()
  page.setDefaultTimeout(120000)
  await page.goto(`${base}/subscribe`, { timeout: 180000 })
  const reject = page.getByRole('button', { name: /Reject|Necessary only/i })
  if (await reject.count()) await reject.first().click()
  await page.getByLabel('Email Address').fill(visitorEmail)
  await page.getByLabel('Consent to receive emails').check()
  await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Check your inbox' })).toBeVisible({
    timeout: 60000,
  })
  check('ordinary anonymous visitor signup UI accepted', true)
  await until('visitor confirmation MIME', async () => messages.some((m) => m.to === visitorEmail))
  const mime = messages
    .find((m) => m.to === visitorEmail)!
    .raw.replace(/=\r\n/g, '')
    .replace(/=3D/g, '=')
  const confirmationToken = /[?&]token=([^\s"<>]+)/.exec(mime)?.[1]
  assert.ok(confirmationToken)
  await page.goto(`${base}/subscribe/confirm?token=${encodeURIComponent(confirmationToken)}`)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Your subscription is confirmed.' }),
  ).toBeVisible({ timeout: 60000 })
  const sub = (
    await payload.find({
      collection: 'subscribers',
      where: {
        site: { equals: state.alphaSiteId },
        email: { equals: visitorEmail },
      },
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  check(
    'confirmation UI persisted active status and verified timestamp',
    sub.status === 'active' && Boolean(sub.verifiedAt),
  )
  // Fixture operator authentication is separate from the ordinary anonymous visitor journey.
  const admins = await payload.find({
    collection: 'users',
    where: { role: { equals: 'administrator' } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const grants = await payload.find({
    collection: 'member-site-roles',
    where: { site: { equals: state.alphaSiteId } },
    depth: 0,
    overrideAccess: true,
  })
  const memberIds = grants.docs.map((g: any) => String(g.member))
  const admin = admins.docs.find((u: any) => memberIds.includes(String(u.member)))
  assert.ok(admin)
  const session = await createPasskeySession(
    admin,
    process.env.PAYLOAD_SECRET!,
    async (id, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, admin.id, expiresAt],
      )
    },
  )
  const operator = await browser.newContext({ timezoneId: 'UTC' })
  await operator.addCookies([
    { name: 'renegade-passkey', value: session.token, url: base },
    { name: 'renegade-active-site', value: state.alphaSiteId, url: base },
  ])
  const op = await operator.newPage()
  op.setDefaultTimeout(120000)
  await op.goto(`${base}/admin/audience`, { timeout: 180000 })
  await expect(
    op.getByRole('heading', { name: 'Audience Command Center', exact: true }),
  ).toBeVisible({ timeout: 60000 })
  await expect(op.getByText(`Site: ${state.alphaSiteId}`, { exact: true })).toBeVisible({
    timeout: 120000,
  })
  check('rendered operator command center using labelled fixture session', true)
  const segment = await payload.create({
    collection: 'audience-segments',
    data: {
      site: state.alphaSiteId,
      name: '09D browser newsletter',
      version: audienceDigest('09d-browser-v1'),
      status: 'active',
      definition: { predicate: { field: 'consentPurpose', op: 'is', value: 'newsletter' } },
    },
    overrideAccess: true,
  })
  await op.getByRole('button', { name: 'Campaigns', exact: true }).click()
  await expect(op.getByTestId('email-composer-view')).toBeVisible({ timeout: 60000 })
  await op.getByTestId('campaign-subject-input').fill('09D ordinary browser campaign')
  await op.getByTestId('block-text-input').fill('09D browser campaign exact body')
  await op.getByTestId('block-legal-address').fill('09D isolated operator test address')
  await expect(
    op.getByTestId('segment-select').locator(`option[value="${segment.id}"]`),
  ).toHaveCount(1, { timeout: 120000 })
  await op.getByTestId('segment-select').selectOption(segment.id)
  await expect(op.getByTestId('count-eligible-consented')).toHaveText('1 Consented Recipients', {
    timeout: 60000,
  })
  check('UI segment counts reconcile exactly one consented unsuppressed visitor', true)
  await op
    .getByTestId('schedule-time-input')
    .fill(new Date(Date.now() - 60000).toISOString().slice(0, 16))
  const scheduled = op.waitForResponse(
    (r) =>
      r.url().includes('/api/admin/audience/campaign') &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON()?.action === 'save-and-schedule',
    { timeout: 60000 },
  )
  await op.getByTestId('schedule-campaign-btn').click()
  const scheduledResponse = await scheduled
  const scheduledBody = await scheduledResponse.json()
  check(
    'UI campaign scheduled through supported API',
    scheduledResponse.ok() && scheduledBody.status === 'scheduled',
  )
  await until('campaign local sink', async () =>
    messages.some((m) => m.raw.includes('09D browser campaign exact body')),
  )
  const campaignDelivery = (
    await payload.find({
      collection: 'email-deliveries',
      where: { message: { equals: scheduledBody.messageId }, subscriber: { equals: sub.id } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  check(
    'scheduled campaign worker persists actual SMTP acceptance',
    campaignDelivery.status === 'accepted' && campaignDelivery.attempts === 1,
  )
  const campaignMime = messages
    .find((m) => m.raw.includes('09D browser campaign exact body'))!
    .raw.replace(/=\r\n/g, '')
    .replace(/=3D/g, '=')
  const preferenceUrl = /http:\/\/localhost:39003\/subscribe\/preferences\?token=[^\s"<>]+/.exec(
    campaignMime,
  )?.[0]
  assert.ok(preferenceUrl, 'preference link must come from observed MIME')
  await page.goto(preferenceUrl)
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(page.getByRole('status')).toHaveText('Preferences saved.', { timeout: 60000 })
  const suppressed = await payload.count({
    collection: 'suppressions',
    where: { site: { equals: state.alphaSiteId }, emailHash: { equals: sub.emailHash } },
    overrideAccess: true,
  })
  check('ordinary preference UI persists suppression', suppressed.totalDocs === 1)
  await op.getByTestId('test-send-email').fill(visitorEmail)
  const blocked = op.waitForResponse(
    (r) =>
      r.url().includes('/api/admin/audience/campaign') &&
      r.request().postDataJSON()?.action === 'test-send',
  )
  await op.getByTestId('test-send-btn').click()
  const blockedBody = await (await blocked).json()
  await until(
    'late-suppressed worker',
    async () =>
      (
        await payload.findByID({
          collection: 'email-deliveries',
          id: blockedBody.deliveryId,
          depth: 0,
          overrideAccess: true,
        })
      ).status === 'cancelled',
  )
  check(
    'UI queued send suppressed with no additional MIME',
    messages.filter((m) => m.raw.includes('09D browser campaign exact body')).length === 1,
  )
  await op.getByRole('button', { name: 'Contacts', exact: true }).click()
  await op.getByPlaceholder(/Search contacts by name/).fill('NO_MATCH_SENTINEL')
  await expect(op.getByText(/No contacts found/)).toBeVisible({ timeout: 60000 })
  check('CRM rendered empty state', true)
  await op.getByRole('button', { name: 'Automations', exact: true }).click()
  await expect(
    op.getByText(/general event-driven automation execution is unavailable/),
  ).toBeVisible()
  check('automation UI explicitly bounds unavailable general execution', true)
  await op.getByRole('button', { name: 'Telecom', exact: true }).click()
  await expect(op.getByText(/Local Telecom Emulator/)).toBeVisible()
  check('telecom UI labels local emulator', true)
  await op.screenshot({ path: `${out}/operator-ui.png`, fullPage: true })
  await writeFile(
    `${out}/browser-state.json`,
    JSON.stringify(
      {
        subscriberId: sub.id,
        siteId: state.alphaSiteId,
        messageId: scheduledBody.messageId,
        deliveryId: campaignDelivery.id,
        suppressedDeliveryId: blockedBody.deliveryId,
      },
      null,
      2,
    ),
  )
} catch (error) {
  trace.push({ error: String(error), passed: false })
  console.error(error)
  process.exitCode = 1
} finally {
  await writeFile(`${out}/browser-trace.json`, JSON.stringify(trace, null, 2))
  await browser.close()
  for (const child of [web, worker])
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((r) => child.once('exit', () => r()))
      if (process.platform === 'win32') {
        await new Promise<void>((r) =>
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          }).once('exit', () => r()),
        )
      } else child.kill('SIGKILL')
      await exited
    }
  for (const socket of sockets) socket.destroy()
  if (sink.listening) await new Promise<void>((r) => sink.close(() => r()))
  await payload.destroy()
  process.exit(process.exitCode ?? 0)
}
