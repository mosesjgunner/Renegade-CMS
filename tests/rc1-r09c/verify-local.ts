/* eslint-disable @typescript-eslint/no-explicit-any -- isolated supported HTTP acceptance */
// R-09C local-process variant of the 09C acceptance (newsletter
// delivery workers, failures, retries and deduplication). The frozen
// 09C run (2026-10-21, PowerShell harness) proved this matrix with
// fixture sessions against route handlers imported in-process. This
// variant re-executes it on the current tree against the PRODUCTION
// standalone server and the real jobs-worker process, per the
// R-01B..R-09A local precedent: production web + worker processes
// behind a local HTTPS proxy (https://rc1-09c.test:38912), disposable
// PostgreSQL database rc1r09c_main, test authentication disabled, and
// the operator owner created by the real installer WebAuthn
// ceremony. Worker processes are spawned, SIGKILLed and restarted by
// this verifier itself so the interrupted-send / natural-lease-expiry
// proof runs against the actual worker lifecycle.
//
// Email is a CONTROLLED LOCAL MAIL SINK ONLY: the app runs
// EMAIL_MODE=smtp against a failure-injecting capture SMTP server
// this verifier runs on 127.0.0.1:3243. Recipient prefixes select the
// injected behavior (frozen 09C pattern): permanent@ -> SMTP 550,
// temporary@ -> one 451 then accept, recover@ -> 451 x4 then accept,
// exhaust@ / exhaust-beta@ -> always 451, unknown@ -> DATA captured
// then the socket drops without a reply, stall@ -> the 250 reply is
// delayed past the product's 5 s send timeout, hold@ -> DATA
// captured and the reply never arrives (worker is killed mid-send).
// Telecom uses the product's deterministic local emulator with live
// carrier sends disabled (TELECOM_MODE=emulator,
// TELECOM_ALLOW_OUTBOUND=false); its handler executes in-process
// (the emulator's receipts are process-local by design — the same
// bound the frozen 09C telecom proof had).
//
// Evidence lands under docs/rc/evidence/rc1/repairs/R-09C/;
// session/state live under scratch/rc1r09c/.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { createServer as netServer, type Socket } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import nodeHttps from 'node:https'
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ensureBootstrap, rotateBootstrapToken } from '../../src/modules/operations/installation'
import { loadConfig } from '../../src/modules/core/config'
import { segmentVersion } from '../../src/modules/audience/engine'
import { audienceDigest } from '../../src/modules/audience/contracts'
import {
  isSubscriberSuppressed,
  processProviderSuppressionEvent,
  queueTestSend,
  suppressSubscriber,
} from '../../src/modules/audience/service'
import {
  processInboundTelecomMessage,
  queueTelecomCampaignDeliveries,
} from '../../src/modules/telecom/service'
import { selectTelecomAdapter, telecomDeliveryTask } from '../../src/modules/telecom/tasks'
import { getTelecomEmulatorReceipts, resetTelecomEmulator } from '../../src/modules/telecom/emulator'
import { telecomDigest } from '../../src/modules/telecom/contracts'

assert.equal(process.env.RC1R09C_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith('/rc1r09c_main'))
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(process.env.TELECOM_MODE, 'emulator')
assert.equal(process.env.TELECOM_ALLOW_OUTBOUND, 'false')
const restartMode = process.argv.includes('--restart')
const base = 'https://rc1-09c.test:38912'
const proxyPort = 38912
const smtpPort = 3243
const out = 'docs/rc/evidence/rc1/repairs/R-09C'
const scratch = 'scratch/rc1r09c'
await mkdir(out, { recursive: true })
await mkdir(scratch, { recursive: true })

const SUB1 = 'sub-one@rc1-09c.test'
const SUB2 = 'sub-two@rc1-09c.test'
const PENDING = 'sub-pending@rc1-09c.test'
const ACCEPTED = 'accepted@rc1-09c.test'
const TEMPORARY = 'temporary@rc1-09c.test'
const RECOVER = 'recover@rc1-09c.test'
const PERMANENT = 'permanent@rc1-09c.test'
const EXHAUST = 'exhaust@rc1-09c.test'
const EXHAUST_BETA = 'exhaust-beta@rc1-09c.test'
const UNKNOWN = 'unknown@rc1-09c.test'
const STALL = 'stall@rc1-09c.test'
const HOLD = 'hold@rc1-09c.test'
const DEDUP = 'dedup@rc1-09c.test'
const ENCORE = 'encore@rc1-09c.test'

const payload: any = await getPayload({ config })

// ------------------------------------------------------------------
// Failure-injecting capture SMTP sink (frozen 09C pattern, extended
// with stall/hold behaviors). Every product email is really sent by
// the worker over SMTP and really received here.
// ------------------------------------------------------------------
type Captured = { to: string; raw: string; at: string }
const captured: Captured[] = []
const sockets = new Set<Socket>()
const rcptRejections = new Map<string, number>()
let holdSeen = false
let sink: ReturnType<typeof netServer> | undefined
function decodePart(body: string, encoding: string): string {
  const enc = encoding.toLowerCase()
  if (enc === 'base64')
    return Buffer.from(body.replace(/[\r\n\s]/g, ''), 'base64').toString('utf8')
  if (enc === 'quoted-printable')
    return body
      .replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  return body
}
function parseMessage(raw: string) {
  const [head, ...rest] = raw.split(/\r\n\r\n/)
  const body = rest.join('\r\n\r\n')
  const headers = new Map<string, string>()
  for (const line of head.replace(/\r\n[ \t]+/g, ' ').split('\r\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) headers.set(line.slice(0, idx).toLowerCase(), line.slice(idx + 1).trim())
  }
  const boundary = /boundary="?([^";]+)"?/.exec(headers.get('content-type') ?? '')?.[1]
  let text = ''
  let html = ''
  if (boundary) {
    for (const part of body.split(`--${boundary}`)) {
      const [pHead, ...pRest] = part.split(/\r\n\r\n/)
      if (!pRest.length) continue
      const type = /content-type:\s*([^\s;]+)/i.exec(pHead)?.[1] ?? ''
      const enc = /content-transfer-encoding:\s*([^\s]+)/i.exec(pHead)?.[1] ?? '7bit'
      const decoded = decodePart(pRest.join('\r\n\r\n'), enc)
      if (type === 'text/plain') text += decoded
      else if (type === 'text/html') html += decoded
    }
  } else {
    const enc = headers.get('content-transfer-encoding') ?? '7bit'
    const decoded = decodePart(body, enc)
    if ((headers.get('content-type') ?? '').includes('text/html')) html = decoded
    else text = decoded
  }
  return { headers, text, html, raw }
}
const parsed = (mail: Captured) => parseMessage(mail.raw)
const linksIn = (value: string) =>
  [...value.matchAll(/https?:\/\/[^\s"'<>()\\]+/g)].map((m) => m[0].replace(/&amp;/g, '&'))
const localPart = (email: string) => email.split('@')[0]
function startSink(): Promise<void> {
  return new Promise((resolve) => {
    sink = netServer((socket) => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      socket.on('error', () => {})
      let input = ''
      let inData = false
      let lines: string[] = []
      let to = ''
      socket.write('220 rc1-09c.local ESMTP\r\n')
      socket.on('data', (chunk) => {
        input += chunk.toString()
        while (input.includes('\r\n')) {
          const end = input.indexOf('\r\n')
          const line = input.slice(0, end)
          input = input.slice(end + 2)
          if (inData) {
            if (line !== '.') {
              lines.push(line.replace(/^\.\./, '.'))
              continue
            }
            captured.push({ to, raw: lines.join('\r\n') + '\r\n', at: new Date().toISOString() })
            lines = []
            inData = false
            const kind = localPart(to)
            if (kind.startsWith('unknown')) {
              // DATA accepted locally, then the connection drops with
              // no 250: the sender cannot know the outcome.
              socket.destroy()
              continue
            }
            if (kind.startsWith('hold')) {
              // Never reply: the send stays in flight until the
              // worker is killed (verifier does this on holdSeen).
              holdSeen = true
              continue
            }
            if (kind.startsWith('stall')) {
              // Reply long after the product's 5 s send timeout.
              const count = captured.length
              setTimeout(() => {
                try {
                  socket.write(`250 captured-${count}\r\n`)
                } catch {}
              }, 20000)
              continue
            }
            socket.write(`250 captured-${captured.length}\r\n`)
          } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-rc1-09c.local\r\n250 8BITMIME\r\n')
          else if (/^MAIL FROM:/i.test(line)) socket.write('250 sender accepted\r\n')
          else if (/^RCPT TO:/i.test(line)) {
            to = /<([^>]+)>/.exec(line)?.[1] ?? ''
            const kind = localPart(to)
            const failures = rcptRejections.get(to) ?? 0
            if (kind.startsWith('permanent')) {
              socket.write('550 5.1.1 Local permanent rejection\r\n')
            } else if (
              kind.startsWith('exhaust') ||
              (kind.startsWith('temporary') && failures < 1) ||
              (kind.startsWith('recover') && failures < 4)
            ) {
              rcptRejections.set(to, failures + 1)
              socket.write('451 4.7.1 Local temporary rejection, try again later\r\n')
            } else socket.write('250 recipient accepted\r\n')
          } else if (/^DATA/i.test(line)) {
            inData = true
            socket.write('354 end with dot\r\n')
          } else if (/^QUIT/i.test(line)) {
            socket.write('221 bye\r\n')
            socket.end()
          } else socket.write('250 OK\r\n')
        }
      })
    })
    sink.listen(smtpPort, '127.0.0.1', () => resolve())
  })
}
async function stopSink(): Promise<void> {
  for (const socket of sockets) socket.destroy()
  await new Promise<void>((resolve) => (sink ? sink.close(() => resolve()) : resolve()))
  sink = undefined
}
const mailTo = (email: string, subjectPart?: string) =>
  captured.filter(
    (mail) =>
      mail.to === email && (!subjectPart || parsed(mail).headers.get('subject')?.includes(subjectPart)),
  )
const dataCount = (email: string) => captured.filter((mail) => mail.to === email).length

// ------------------------------------------------------------------
// Jobs worker lifecycle, owned by this verifier (frozen 09C pattern,
// against the production worker entrypoint). SIGKILL is the crash
// simulation; graceful stops use it too so no shutdown hook can
// "rescue" an in-flight send in the matrix.
// ------------------------------------------------------------------
let worker: ChildProcess | undefined
let workerNumber = 0
function startWorker() {
  workerNumber++
  const log = createWriteStream(`${scratch}/worker-${workerNumber}.log`)
  worker = spawn(process.execPath, ['--import', 'tsx', 'src/scripts/run-jobs-worker.ts'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  worker.stdout!.pipe(log)
  worker.stderr!.pipe(log)
  return worker
}
async function stopWorker() {
  if (worker && worker.exitCode === null) {
    const current = worker
    const exited = new Promise<void>((resolve) => current.once('exit', () => resolve()))
    current.kill('SIGKILL')
    await exited
  }
  worker = undefined
}

// ------------------------------------------------------------------
// Browser + API plumbing (R-09A pattern).
// ------------------------------------------------------------------
const browser = await chromium.launch({
  headless: true,
  args: [
    '--ignore-certificate-errors',
    '--no-proxy-server',
    '--host-resolver-rules=MAP rc1-09c.test 127.0.0.1,MAP beta.rc1-09c.test 127.0.0.1',
  ],
})
const trace: any[] = []
const failureTable: any[] = []
let checkCount = 0
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checkCount++
  trace.push({ name, passed: true })
  console.log(`PASS ${checkCount}: ${name}`)
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
let ownerContext: BrowserContext
if (restartMode) {
  ownerContext = await browser.newContext({
    storageState: `${scratch}/session.json`,
    ignoreHTTPSErrors: true,
  })
} else {
  ownerContext = await browser.newContext({ ignoreHTTPSErrors: true })
}
const visitorContext = await browser.newContext({ ignoreHTTPSErrors: true })
const page = await visitorContext.newPage()
page.setDefaultTimeout(120000)
page.on('pageerror', (error) => trace.push({ browserError: error.message }))

const api = async (
  route: string,
  method = 'GET',
  data?: any,
  expected: number | number[] = 200,
  opts: { cookie?: string; host?: string; xff?: string; origin?: string } = {},
) => {
  const host = opts.host ?? 'rc1-09c.test:38912'
  const cookies =
    opts.cookie !== undefined
      ? opts.cookie
      : (await ownerContext.cookies(base)).map((c) => `${c.name}=${c.value}`).join('; ')
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
          host,
          origin: opts.origin ?? `https://${host}`,
          ...(opts.xff ? { 'x-forwarded-for': opts.xff } : {}),
          ...(cookies ? { cookie: cookies } : {}),
          ...(payloadText
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payloadText) }
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
  trace.push({
    method,
    route,
    host: opts.host ?? 'alpha',
    status: result.status,
    body: result.status >= 400 ? result.text.slice(0, 1200) : undefined,
  })
  assert.ok(
    (Array.isArray(expected) ? expected : [expected]).includes(result.status),
    `${method} ${route}: expected ${expected}, got ${result.status}: ${result.text.slice(0, 2500)}`,
  )
  return { text: result.text, json: () => JSON.parse(result.text), status: result.status }
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
const subscriberByEmail = async (siteId: string, email: string) =>
  (await find('subscribers', { and: [{ site: { equals: siteId } }, { email: { equals: email } }] }))[0]
const deliveriesFor = async (messageId: string) =>
  find('email-deliveries', { message: { equals: messageId } })
const deliveryByRecipient = async (email: string) =>
  (await find('email-deliveries', { recipientEmail: { equals: email } }))[0]

const design = (subject: string) => ({
  version: 1,
  templateVersion: 'r09c-1',
  locale: 'en',
  tokens: {
    background: '#ffffff',
    foreground: '#172033',
    accent: '#164e9b',
    fontFamily: 'Arial, sans-serif',
  },
  blocks: [
    { type: 'heading', text: subject },
    { type: 'text', text: '09C dispatch body — worker, retry and dedup evidence.' },
    {
      type: 'legal',
      address: '1 Fixture Way, Test City, TS 00000',
      preferenceUrl: `${base}/subscribe/preferences`,
    },
  ],
  plainTextStrategy: 'generated',
  personalization: { missingValue: 'fallback', fallbacks: {} },
})

let succeeded = false
try {
  if (restartMode) {
    // ----------------------------------------------------------
    // RESTART phase (body appended below the journey in this
    // file's else-branch counterpart): persisted dispatch state,
    // no resend, retry still refused, telecom terminal rows.
    // ----------------------------------------------------------
    await startSink()
    const state = JSON.parse(await readFile(`${scratch}/state.json`, 'utf8'))
    for (const expected of state.deliveries) {
      const current = await row('email-deliveries', expected.id)
      check(
        `post-restart: ${expected.recipientEmail} keeps status/attempts/provider message id`,
        current.status === expected.status &&
          Number(current.attempts) === expected.attempts &&
          (current.providerMessageId ?? null) === expected.providerMessageId,
      )
    }
    startWorker()
    await sleep(20000)
    check(
      'post-restart: restarted worker sends nothing during the observation window',
      captured.length === 0,
    )
    for (const expected of state.deliveries) {
      const current = await row('email-deliveries', expected.id)
      check(
        `post-restart replay: ${expected.recipientEmail} gains no attempt`,
        Number(current.attempts) === expected.attempts && current.status === expected.status,
      )
    }
    const unknownRow = state.deliveries.find((d: any) => d.recipientEmail === UNKNOWN)
    const unknownRetry = await api(
      '/api/admin/audience/retry',
      'POST',
      { deliveryId: String(unknownRow.id) },
      409,
    )
    check(
      'post-restart: unknown-outcome retry is still refused',
      String(unknownRetry.json().error).includes('cannot be safely retried'),
    )
    const permanentRow = state.deliveries.find((d: any) => d.recipientEmail === PERMANENT)
    await api('/api/admin/audience/retry', 'POST', { deliveryId: String(permanentRow.id) }, 409)
    check('post-restart: permanent-failure retry is still refused', true)
    for (const expected of state.telecomRows) {
      const current = await row('telecom-deliveries', expected.id)
      check(
        `post-restart: telecom ${expected.id} keeps terminal state`,
        current.status === expected.status && Number(current.attempts) === expected.attempts,
      )
    }
    // Liveness: a fresh test send still completes end to end.
    const encore = (
      await api('/api/admin/audience/campaign', 'POST', {
        action: 'test-send',
        recipientEmail: ENCORE,
        subject: '09C Post-Restart Encore',
        messageDesign: design('09C Post-Restart Encore'),
      })
    ).json()
    assert.ok(encore.deliveryId, 'post-restart test send queued')
    await until('post-restart test send accepted', async () => {
      const current = await row('email-deliveries', encore.deliveryId)
      return current.status === 'accepted'
    })
    check(
      'post-restart: fresh dispatch still reaches the sink exactly once',
      dataCount(ENCORE) === 1 &&
        (await row('email-deliveries', encore.deliveryId)).attempts === 1,
    )
    await stopWorker()
    succeeded = true
    await writeFile(
      `${out}/restart-trace.json`,
      JSON.stringify({ checks: checkCount, succeeded: true, trace }, null, 2),
    )
  } else {
    await startSink()
    // ----------------------------------------------------------
    // SETUP: real installer WebAuthn ceremony (R-09A pattern).
    // ----------------------------------------------------------
    check(
      'fresh database has no sites or subscribers',
      (await payload.count({ collection: 'sites' })).totalDocs === 0 &&
        (await payload.count({ collection: 'subscribers' })).totalDocs === 0,
    )
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0] ?? ''))
    }
    let bootstrapToken = ''
    try {
      await ensureBootstrap(payload, loadConfig())
      if (warnings.length === 0) await rotateBootstrapToken(payload, loadConfig())
      bootstrapToken =
        warnings.map((line) => line.match(/: ([A-Za-z0-9_-]+)$/)?.[1]).find(Boolean) ?? ''
    } finally {
      console.warn = originalWarn
    }
    assert.equal(bootstrapToken.length, 43, 'one-time installer bootstrap token available')
    const ownerPage = await ownerContext.newPage()
    ownerPage.setDefaultTimeout(120000)
    const client = await ownerContext.newCDPSession(ownerPage)
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
    await ownerPage.goto(`${base}/setup`, { timeout: 180000, waitUntil: 'domcontentloaded' })
    await ownerPage.waitForFunction(
      () =>
        Object.keys(document.querySelector('input[type="email"]') ?? {}).some((key) =>
          key.startsWith('__reactProps'),
        ),
      { timeout: 60000 },
    )
    await ownerPage.getByLabel('Bootstrap token').fill(bootstrapToken)
    await ownerPage.getByLabel('Owner email').fill('owner@rc1-09c.test')
    await ownerPage.getByRole('button', { name: 'Continue', exact: true }).click()
    await ownerPage.getByLabel('Site or publication name').fill('09C Dispatch Alpha')
    await ownerPage.getByLabel('Site slug').fill('audience-alpha-09c')
    await ownerPage.getByLabel('Primary URL').fill(base)
    await ownerPage.getByRole('button', { name: 'Continue', exact: true }).click()
    await ownerPage.getByLabel('Starter site type').selectOption('blank-minimal')
    await ownerPage.getByRole('checkbox', { name: /Create starter pages/ }).uncheck()
    await ownerPage.getByRole('button', { name: 'Continue', exact: true }).click()
    await ownerPage.getByRole('button', { name: 'Continue', exact: true }).click()
    const completeResponse = ownerPage.waitForResponse(
      (response) => response.url().includes('/api/setup/complete'),
      { timeout: 180000 },
    )
    await ownerPage.getByRole('button', { name: 'Enroll passkey & create site' }).click()
    assert.equal((await completeResponse).status(), 201, 'supported installer completion HTTP 201')
    check(
      'ordinary installer completes real virtual WebAuthn ceremony',
      (await ownerContext.cookies()).some((cookie) => cookie.name === 'renegade-passkey'),
    )
    await ownerContext.storageState({ path: `${scratch}/session.json` })
    const alpha = (await find('sites', { slug: { equals: 'audience-alpha-09c' } }))[0]
    assert.ok(alpha, 'installer site exists')
    const alphaId = String(alpha.id)

    // Second site (operator fixture): only a tenant boundary for a
    // foreign delivery row; no grant is given to the owner on it.
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '09C Dispatch Beta', slug: 'audience-beta-09c', lifecycle: 'active' },
    })
    const betaId = String(beta.id)
    check('second site created as a tenant boundary (no owner grant)', Boolean(beta?.id))

    // Canonical newsletter segment (operator fixture).
    const definition = { predicate: { field: 'consentPurpose', op: 'is', value: 'newsletter' } }
    const segment = await payload.create({
      collection: 'audience-segments',
      data: {
        site: alphaId,
        name: '09C Newsletter Segment',
        definition,
        version: segmentVersion(definition as never),
        status: 'active',
      },
    })
    const segmentId = String(segment.id)

    // The worker drives every send from here on.
    startWorker()
    await sleep(3000)

    // ----------------------------------------------------------
    // SUBSCRIBERS: two confirmed, one pending (browser + API).
    // ----------------------------------------------------------
    const signupAndConfirm = async (email: string, xff: string) => {
      await api('/api/subscribers/subscribe', 'POST', { email }, 202, { cookie: '', xff })
      await until(`confirmation email captured for ${email}`, async () =>
        mailTo(email, 'Confirm your subscription').length === 1,
      )
      const link = linksIn(parsed(mailTo(email)[0]).text).find((l) =>
        l.includes('/subscribe/confirm'),
      )
      assert.ok(link, `confirmation link present for ${email}`)
      await page.goto(link, { timeout: 180000 })
      await page.getByRole('button', { name: 'Confirm', exact: true }).click()
      await page.getByText('Your subscription is confirmed.').waitFor()
      const sub = await subscriberByEmail(alphaId, email)
      assert.equal(sub?.status, 'active', `${email} active after confirmation`)
      return sub
    }
    const sub1 = await signupAndConfirm(SUB1, '198.51.100.30')
    const sub2 = await signupAndConfirm(SUB2, '198.51.100.31')
    check('two subscribers complete double opt-in and persist active', Boolean(sub1 && sub2))
    await api('/api/subscribers/subscribe', 'POST', { email: PENDING }, 202, {
      cookie: '',
      xff: '198.51.100.32',
    })
    check(
      'third subscriber stays pending (never confirms)',
      (await subscriberByEmail(alphaId, PENDING))?.status === 'pending',
    )

    // ----------------------------------------------------------
    // CAMPAIGN: preview/render, segment evaluation, scheduled
    // dispatch through the real worker to the sink.
    // ----------------------------------------------------------
    const preview = (
      await api('/api/admin/audience/campaign', 'POST', {
        action: 'preview',
        messageDesign: design('09C Campaign One'),
      })
    ).json()
    check(
      'campaign preview renders MIME with a stable render hash',
      preview.ok === true &&
        typeof preview.hash === 'string' &&
        preview.hash.length > 0 &&
        String(preview.text).includes('09C dispatch body'),
    )
    const evaluation = (
      await api('/api/admin/audience/campaign', 'POST', {
        action: 'evaluate-segment',
        segmentId,
      })
    ).json()
    check(
      'segment evaluation counts only the two confirmed subscribers as deliverable',
      evaluation.counts.totalSubscribers === 3 &&
        evaluation.counts.eligibleConsented === 2 &&
        evaluation.counts.isEmpty === false,
    )
    const campaign = (
      await api('/api/admin/audience/campaign', 'POST', {
        action: 'save-and-schedule',
        subject: '09C Campaign One',
        segmentId,
        messageDesign: design('09C Campaign One'),
        targetStatus: 'schedule',
        scheduledFor: new Date(Date.now() - 60000).toISOString(),
      })
    ).json()
    assert.ok(campaign.ok && campaign.messageId, 'campaign scheduled')
    check(
      'campaign snapshot pins exactly the two consented recipients',
      campaign.recipientCount === 2 && Boolean(campaign.snapshotHash),
    )
    await until('campaign deliveries accepted', async () => {
      const deliveries = await deliveriesFor(campaign.messageId)
      return deliveries.length === 2 && deliveries.every((d: any) => d.status === 'accepted')
    })
    await until('campaign mail reaches both subscribers', async () =>
      mailTo(SUB1, '09C Campaign One').length === 1 && mailTo(SUB2, '09C Campaign One').length === 1,
    )
    const campaignDeliveries = await deliveriesFor(campaign.messageId)
    const sub1Delivery = campaignDeliveries.find((d: any) => d.recipientEmail === SUB1)
    const sub1Mail = parsed(mailTo(SUB1, '09C Campaign One')[0])
    check(
      'campaign MIME is exact: subject, sender, recorded Message-ID, List-Unsubscribe, body',
      sub1Mail.headers.get('subject') === '09C Campaign One' &&
        sub1Mail.headers.get('from')?.includes('newsletter@rc1-09c.test') === true &&
        sub1Mail.headers.get('message-id') === sub1Delivery.rfcMessageId &&
        Boolean(sub1Mail.headers.get('list-unsubscribe')) &&
        sub1Mail.text.includes('09C dispatch body') &&
        sub1Mail.raw.includes('multipart/alternative'),
    )
    check(
      'campaign deliveries record the smtp provider, one attempt and acceptance identity',
      campaignDeliveries.every(
        (d: any) =>
          d.provider === 'smtp' && Number(d.attempts) === 1 && Boolean(d.providerMessageId),
      ),
    )
    check(
      'no campaign delivery and no campaign mail exist for the unconfirmed subscriber',
      campaignDeliveries.every((d: any) => d.recipientEmail !== PENDING) &&
        mailTo(PENDING, '09C Campaign One').length === 0,
    )
    failureTable.push({
      scenario: 'campaign-baseline',
      injected: 'none',
      recipients: 2,
      finalStatus: 'accepted',
      attempts: 1,
      dataCount: 2,
      note: 'snapshot pinned confirmed-consented only; pending excluded',
    })

    // ----------------------------------------------------------
    // FAILURE MATRIX via the operator test-send action. Each send
    // is a real campaign-route call; the worker does the sending.
    // ----------------------------------------------------------
    const testSend = async (recipientEmail: string) => {
      const response = (
        await api('/api/admin/audience/campaign', 'POST', {
          action: 'test-send',
          recipientEmail,
          subject: '09C Controlled MIME',
          messageDesign: design('09C Controlled MIME'),
        })
      ).json()
      assert.ok(response.deliveryId, `test send queued for ${recipientEmail}`)
      return String(response.deliveryId)
    }
    const retry = async (deliveryId: string, expected: number | number[], opts: any = {}) =>
      api('/api/admin/audience/retry', 'POST', { deliveryId }, expected, opts)

    // -- accepted: happy path + retry refusals -------------------
    const acceptedId = await testSend(ACCEPTED)
    check('operator test-send creates a queued persisted delivery', Boolean(acceptedId))
    await until('accepted delivery accepted', async () =>
      (await row('email-deliveries', acceptedId)).status === 'accepted',
    )
    check(
      'accepted: one attempt, one DATA, recorded Message-ID matches the wire',
      (await row('email-deliveries', acceptedId)).attempts === 1 &&
        dataCount(ACCEPTED) === 1 &&
        parsed(mailTo(ACCEPTED)[0]).headers.get('message-id') ===
          (await row('email-deliveries', acceptedId)).rfcMessageId,
    )
    await retry(acceptedId, 409)
    check('accepted delivery cannot be retried', true)
    await retry(acceptedId, 403, { origin: 'https://foreign.example.test' })
    check('foreign-origin retry is denied before any state change', true)
    failureTable.push({
      scenario: 'accept',
      injected: 'none',
      finalStatus: 'accepted',
      attempts: 1,
      retryRoute: '409 (accepted not retryable); 403 foreign origin',
      dataCount: 1,
    })

    // -- temporary: one 451, automatic retry succeeds ------------
    const temporaryId = await testSend(TEMPORARY)
    await until('temporary delivery accepted after one retry', async () =>
      (await row('email-deliveries', temporaryId)).status === 'accepted',
    )
    const temporaryRow = await row('email-deliveries', temporaryId)
    check(
      'SMTP 451 is retried automatically with bounded backoff and accepts exactly once',
      Number(temporaryRow.attempts) === 2 && dataCount(TEMPORARY) === 1,
    )
    failureTable.push({
      scenario: 'temporary-451-once',
      injected: 'SMTP 451 at RCPT (first attempt)',
      finalStatus: 'accepted',
      attempts: 2,
      retryRoute: 'n/a (automatic)',
      dataCount: 1,
    })

    // -- recover: 451 x4 -> dead-letter -> operator retry --------
    const recoverId = await testSend(RECOVER)
    await until('recoverable delivery exhausts its automatic budget', async () =>
      (await row('email-deliveries', recoverId)).status === 'dead-letter',
    )
    const recoverDead = await row('email-deliveries', recoverId)
    check(
      'four temporary failures dead-letter with no DATA sent',
      Number(recoverDead.attempts) === 4 &&
        recoverDead.outcome?.code === 'temporary_provider_error' &&
        dataCount(RECOVER) === 0,
    )
    await retry(recoverId, 200)
    check('operator retry grants a fresh budget to a dead-lettered delivery', true)
    await until('operator-retried delivery accepted', async () =>
      (await row('email-deliveries', recoverId)).status === 'accepted',
    )
    const recoverRow = await row('email-deliveries', recoverId)
    check(
      'operator retry succeeds at lifetime attempt five with exactly one DATA',
      Number(recoverRow.attempts) === 5 && dataCount(RECOVER) === 1,
    )
    failureTable.push({
      scenario: 'temporary-451-x4-then-recover',
      injected: 'SMTP 451 at RCPT (attempts 1-4)',
      finalStatus: 'accepted',
      attempts: 5,
      retryRoute: '200 (dead-letter, retryable outcome)',
      dataCount: 1,
      note: 'automatic cycle bound is 4 attempts; operator retry sets a new cycle base',
    })

    // -- permanent: 550 -> failed, never retried -----------------
    const permanentId = await testSend(PERMANENT)
    await until('permanent delivery failed', async () =>
      (await row('email-deliveries', permanentId)).status === 'failed',
    )
    const permanentRow = await row('email-deliveries', permanentId)
    check(
      'SMTP 550 is a durable permanent failure after one attempt',
      Number(permanentRow.attempts) === 1 &&
        permanentRow.outcome?.code === 'permanent_recipient_error' &&
        permanentRow.outcome?.retryable === false &&
        dataCount(PERMANENT) === 0,
    )
    await retry(permanentId, 409)
    check('permanent failure cannot be retried', true)
    failureTable.push({
      scenario: 'permanent-550',
      injected: 'SMTP 550 at RCPT',
      finalStatus: 'failed',
      attempts: 1,
      retryRoute: '409',
      dataCount: 0,
    })

    // -- exhaust: dead-letter, retry queued while worker is down,
    //    suppression lands before dispatch -> cancelled ----------
    const exhaustId = await testSend(EXHAUST)
    await until('exhaust delivery dead-letters', async () =>
      (await row('email-deliveries', exhaustId)).status === 'dead-letter',
    )
    check(
      'exhaustion persists four attempts and zero DATA',
      Number((await row('email-deliveries', exhaustId)).attempts) === 4 && dataCount(EXHAUST) === 0,
    )
    await stopWorker()
    await retry(exhaustId, 200)
    const exhaustQueued = await row('email-deliveries', exhaustId)
    check(
      'operator retry queues the exhausted delivery while no worker runs (attempts preserved)',
      exhaustQueued.status === 'queued' && Number(exhaustQueued.attempts) === 4,
    )
    await retry(exhaustId, 409)
    check('a queued delivery cannot be retried a second time', true)
    await suppressSubscriber(payload, { siteId: alphaId, email: EXHAUST, reason: 'operator' })
    check('suppression is recorded for the queued recipient before dispatch', true)
    startWorker()
    await sleep(3000)
    await until('suppressed retry is cancelled at send time', async () => {
      const current = await row('email-deliveries', exhaustId)
      return current.status === 'cancelled'
    })
    const exhaustRow = await row('email-deliveries', exhaustId)
    check(
      'suppression wins over the queued retry: cancelled, attempts preserved, never sent',
      exhaustRow.outcome?.code === 'suppressed-before-send' &&
        Number(exhaustRow.attempts) === 4 &&
        dataCount(EXHAUST) === 0,
    )
    failureTable.push({
      scenario: 'exhaust-451-then-suppress',
      injected: 'SMTP 451 at RCPT (always); operator suppression after retry queued',
      finalStatus: 'cancelled',
      attempts: 4,
      retryRoute: '200 while worker stopped; second retry 409',
      dataCount: 0,
      note: 'send-time eligibility re-check cancels before any send',
    })

    // -- unknown: DATA captured, response lost --------------------
    const unknownId = await testSend(UNKNOWN)
    await until('lost-response delivery quarantined unknown', async () =>
      (await row('email-deliveries', unknownId)).status === 'unknown',
    )
    const unknownRow = await row('email-deliveries', unknownId)
    check(
      'lost SMTP response after DATA parks unknown, non-retryable, one attempt, one DATA',
      Number(unknownRow.attempts) === 1 &&
        unknownRow.outcome?.code === 'unknown_outcome' &&
        unknownRow.outcome?.retryable === false &&
        dataCount(UNKNOWN) === 1,
    )
    await retry(unknownId, 409)
    check('unknown outcome cannot be retried', true)
    failureTable.push({
      scenario: 'lost-response-after-DATA',
      injected: 'sink captures DATA then drops the connection without a 250',
      finalStatus: 'unknown',
      attempts: 1,
      retryRoute: '409',
      dataCount: 1,
    })

    // -- stall: response delayed past the send timeout -----------
    const stallId = await testSend(STALL)
    await until(
      'timed-out delivery quarantined unknown',
      async () => (await row('email-deliveries', stallId)).status === 'unknown',
      120000,
    )
    const stallRow = await row('email-deliveries', stallId)
    check(
      'send timeout is classified unknown (never auto-retried), one attempt, one DATA',
      Number(stallRow.attempts) === 1 &&
        stallRow.outcome?.code === 'unknown_outcome' &&
        stallRow.outcome?.retryable === false &&
        dataCount(STALL) === 1,
    )
    await retry(stallId, 409)
    check('timed-out unknown outcome cannot be retried', true)
    failureTable.push({
      scenario: 'response-stall-past-timeout',
      injected: 'sink delays the 250 reply 20 s (send timeout 5 s)',
      finalStatus: 'unknown',
      attempts: 1,
      retryRoute: '409',
      dataCount: 1,
    })

    // -- hold: worker SIGKILLed mid-send; natural lease expiry ---
    const holdId = await testSend(HOLD)
    await until('held DATA reaches the sink', async () => holdSeen, 60000)
    const sendingRow = await row('email-deliveries', holdId)
    check(
      'mid-send state is persisted: sending + provider + attempt + live lease',
      sendingRow.status === 'sending' &&
        sendingRow.provider === 'smtp' &&
        Number(sendingRow.attempts) === 1 &&
        Boolean(sendingRow.leaseUntil) &&
        Date.parse(sendingRow.leaseUntil) > Date.now(),
    )
    await stopWorker()
    for (const socket of sockets) socket.destroy()
    check('worker killed mid-send (SIGKILL) with the send unacknowledged', true)
    startWorker()
    await until(
      'natural lease expiry quarantines the interrupted send',
      async () => (await row('email-deliveries', holdId)).status === 'unknown',
      180000,
    )
    const holdRow = await row('email-deliveries', holdId)
    check(
      'interrupted send quarantines as unknown after lease expiry: no resend, one DATA',
      holdRow.outcome?.code === 'interrupted_send' &&
        holdRow.outcome?.retryable === false &&
        Number(holdRow.attempts) === 1 &&
        dataCount(HOLD) === 1,
    )
    await retry(holdId, 409)
    check('interrupted-send unknown cannot be retried', true)
    failureTable.push({
      scenario: 'worker-killed-mid-send',
      injected: 'sink never replies; worker SIGKILLed during the send',
      finalStatus: 'unknown',
      attempts: 1,
      retryRoute: '409',
      dataCount: 1,
      note: 'recovery waited for natural lease expiry (~60 s); outbox scan quarantined',
    })

    // -- denials --------------------------------------------------
    await api(
      '/api/admin/audience/campaign',
      'POST',
      { action: 'test-send', recipientEmail: ACCEPTED, subject: 'x', messageDesign: design('x') },
      403,
      { cookie: '' },
    )
    check('anonymous campaign test-send is denied', true)
    await api('/api/admin/audience/retry', 'POST', { deliveryId: acceptedId }, 403, { cookie: '' })
    check('anonymous retry is denied', true)

    // Foreign tenant: a Beta delivery in the retryable dead-letter
    // state must not be reachable by the Alpha-only owner.
    const betaMessage = await payload.create({
      collection: 'email-messages',
      data: {
        site: betaId,
        subject: '09C Beta Controlled',
        kind: 'bulk',
        status: 'draft',
        blocks: [{ type: 'text', text: 'Beta controlled body' }],
      },
      overrideAccess: true,
    })
    const betaDelivery = await queueTestSend(payload, {
      messageId: betaMessage.id,
      recipientEmail: EXHAUST_BETA,
    })
    await until('beta delivery dead-letters', async () =>
      (await row('email-deliveries', betaDelivery.id)).status === 'dead-letter',
    )
    await retry(String(betaDelivery.id), 400)
    check(
      'owner of another site cannot retry a foreign tenant delivery (not found under access)',
      (await row('email-deliveries', betaDelivery.id)).status === 'dead-letter',
    )
    failureTable.push({
      scenario: 'foreign-tenant-retry',
      injected: 'none (tenant boundary)',
      finalStatus: 'dead-letter (unchanged)',
      attempts: 4,
      retryRoute: '400 for the Alpha-only owner',
      dataCount: 0,
    })

    // Native collection denials (in-process Payload access control,
    // labelled fixture staff user — same bound as frozen 09C).
    const staffDenied = await payload.create({
      collection: 'users',
      data: { email: 'staff-denied@rc1-09c.test', role: 'staff' },
      context: { skipEnrollmentToken: true },
      overrideAccess: true,
    })
    let updateDenied = false
    try {
      await payload.update({
        collection: 'email-deliveries',
        id: acceptedId,
        data: { status: 'failed' },
        user: staffDenied,
        overrideAccess: false,
      })
    } catch {
      updateDenied = true
    }
    check('native staff mutation of a delivery status is denied', updateDenied)
    let createDenied = false
    try {
      await payload.create({
        collection: 'email-deliveries',
        data: {
          message: 'invalid',
          recipientEmail: 'forged@rc1-09c.test',
          idempotencyKey: 'forged-r09c',
        },
        overrideAccess: false,
      })
    } catch {
      createDenied = true
    }
    check('anonymous native delivery creation is denied', createDenied)

    // ----------------------------------------------------------
    // BOUNCE: controlled provider event + idempotent replay.
    // (Service-level controlled event — SMTP has no remote webhook
    // in this topology; the frozen 09C proof used the same path.)
    // ----------------------------------------------------------
    await processProviderSuppressionEvent(payload, {
      siteId: alphaId,
      email: SUB1,
      event: 'bounce',
      provider: 'smtp',
      providerMessageId: String(sub1Delivery.providerMessageId),
      providerEventId: 'r09c-controlled-bounce-1',
    })
    const bouncedRow = await row('email-deliveries', sub1Delivery.id)
    check(
      'controlled bounce event marks the delivery bounced and suppresses the address',
      bouncedRow.status === 'bounced' &&
        (await isSubscriberSuppressed(payload, alphaId, (await subscriberByEmail(alphaId, SUB1)).emailHash)),
    )
    await processProviderSuppressionEvent(payload, {
      siteId: alphaId,
      email: SUB1,
      event: 'bounce',
      provider: 'smtp',
      providerMessageId: String(sub1Delivery.providerMessageId),
      providerEventId: 'r09c-controlled-bounce-1',
    })
    const bounceEvents = await find('email-delivery-events', {
      idempotencyKey: { equals: 'provider:smtp:r09c-controlled-bounce-1' },
    })
    check(
      'duplicate provider callback is idempotent: exactly one event row, state unchanged',
      bounceEvents.length === 1 &&
        (await row('email-deliveries', sub1Delivery.id)).status === 'bounced',
    )
    failureTable.push({
      scenario: 'duplicate-provider-callback',
      injected: 'same bounce event delivered twice',
      finalStatus: 'bounced',
      attempts: 1,
      retryRoute: 'n/a',
      dataCount: 1,
      note: 'second callback creates no event row and no state change',
    })

    // ----------------------------------------------------------
    // DEDUP: the canonical queue command is idempotent.
    // ----------------------------------------------------------
    const ownerUsers = await payload.find({
      collection: 'users',
      where: { email: { equals: 'owner@rc1-09c.test' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const ownerUser = ownerUsers.docs[0]
    const transactional = await payload.create({
      collection: 'email-messages',
      data: {
        site: alphaId,
        subject: '09C Dedup',
        kind: 'transactional',
        status: 'draft',
        blocks: [{ type: 'text', text: 'Dedup exact body' }],
      },
      user: ownerUser,
      overrideAccess: false,
    })
    const dedupFirst = await queueTestSend(payload, {
      messageId: transactional.id,
      recipientEmail: DEDUP,
    })
    const dedupSecond = await queueTestSend(payload, {
      messageId: transactional.id,
      recipientEmail: DEDUP,
    })
    check(
      'duplicate queue commands return the same delivery ID',
      String(dedupFirst.id) === String(dedupSecond.id),
    )
    await until('dedup delivery accepted', async () =>
      (await row('email-deliveries', dedupFirst.id)).status === 'accepted',
    )
    check(
      'deduplicated command yields one attempt and one DATA',
      Number((await row('email-deliveries', dedupFirst.id)).attempts) === 1 && dataCount(DEDUP) === 1,
    )
    failureTable.push({
      scenario: 'duplicate-queue-command',
      injected: 'queueTestSend issued twice for the same message + recipient',
      finalStatus: 'accepted',
      attempts: 1,
      retryRoute: 'n/a',
      dataCount: 1,
    })

    // ----------------------------------------------------------
    // TELECOM: local emulator / quiet hours / per-event
    // preferences / site-scoped STOP. The delivery handler runs
    // in-process (emulator receipts are process-local); queueing,
    // persistence and suppression are the real product services
    // against the production database. Worker is stopped so no
    // background job can race these assertions (frozen pattern).
    // ----------------------------------------------------------
    await stopWorker()
    const telecomTrace: any[] = []
    let telecomCount = 0
    const tcheck = (name: string, value: unknown) => {
      assert.ok(value, name)
      telecomCount++
      telecomTrace.push({ name, passed: true })
      trace.push({ name: `telecom: ${name}`, passed: true })
      console.log(`PASS telecom ${telecomCount}: ${name}`)
    }
    const tGet = (id: string) =>
      payload.findByID({ collection: 'telecom-deliveries', id, depth: 0, overrideAccess: true })
    const tCreate = (collection: string, data: any) =>
      payload.create({ collection, data, overrideAccess: true })
    const tHandler = telecomDeliveryTask.handler as any
    const tRun = (id: string) => tHandler({ input: { deliveryId: id }, req: { payload } })

    resetTelecomEmulator()
    tcheck(
      'emulation explicitly selected; live carrier disabled',
      selectTelecomAdapter().id === 'telecom-emulator' &&
        process.env.TELECOM_ALLOW_OUTBOUND === 'false',
    )
    const member = await tCreate('members', {
      displayName: '09C telecom recipient',
      email: 'telecom@rc1-09c.test',
      status: 'active',
    })
    const hour = new Date().getUTCHours()
    const offset = ((2 - hour + 36) % 24) - 12
    const quietZone = offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`
    await tCreate('profiles', {
      member: member.id,
      handle: 'rc109c-recipient',
      displayName: 'Controlled recipient',
      timeZone: quietZone,
      preferences: { relationshipNotifications: { follows: false, messages: true } },
    })
    const phone = '+14155550199'
    const contact = await tCreate('contacts', {
      site: alphaId,
      displayName: 'Controlled phone',
      phoneE164: phone,
      member: member.id,
    })
    const telecomSubscriber = await tCreate('subscribers', {
      site: alphaId,
      email: 'telecom@rc1-09c.test',
      emailHash: audienceDigest('telecom@rc1-09c.test'),
      status: 'active',
      member: member.id,
      contact: contact.id,
    })
    const telecomList = await tCreate('audience-lists', {
      site: alphaId,
      name: '09C telecom',
      slug: 'rc109c-telecom',
      title: 'Controlled only',
    })
    await tCreate('audience-memberships', {
      subscriber: telecomSubscriber.id,
      audienceList: telecomList.id,
      status: 'active',
    })
    for (const purpose of ['marketing', 'alerts'])
      await tCreate('consent-events', {
        site: alphaId,
        subscriber: telecomSubscriber.id,
        event: 'preference-granted',
        basis: 'consent',
        channel: 'sms',
        purpose,
        occurredAt: new Date().toISOString(),
      })
    const tMessage = async (title: string, purpose: string, notificationKind: string) =>
      tCreate('telecom-messages', {
        site: alphaId,
        title,
        body: '09C controlled telecom body',
        channel: 'sms',
        purpose,
        status: 'scheduled',
        scheduledFor: new Date(Date.now() - 1000).toISOString(),
        audience: { lists: [telecomList.id], notificationKind },
      })
    const tDelivery = async (messageId: string) => {
      await queueTelecomCampaignDeliveries(payload, messageId)
      return (
        await payload.find({
          collection: 'telecom-deliveries',
          where: { message: { equals: messageId } },
          depth: 0,
          overrideAccess: true,
        })
      ).docs[0]
    }
    const quietMessage = await tMessage('quiet', 'marketing', 'message.created')
    const quietDelivery = await tDelivery(quietMessage.id)
    tcheck(
      'canonical contact phone and profile timezone produce durable quiet-hour scheduling',
      quietDelivery.recipientPhone === phone &&
        Date.parse(quietDelivery.quietHoursDelayedUntil) > Date.now(),
    )
    await tRun(quietDelivery.id)
    tcheck(
      'early quiet-hours replay emits no telecom message',
      (await tGet(quietDelivery.id)).attempts === 0 && getTelecomEmulatorReceipts().length === 0,
    )
    const followMessage = await tMessage('follow off', 'alerts', 'relationship.follow')
    const followDelivery = await tDelivery(followMessage.id)
    await tRun(followDelivery.id)
    tcheck(
      'per-event follow preference cancels telecom emulation',
      (await tGet(followDelivery.id)).status === 'cancelled' &&
        getTelecomEmulatorReceipts().length === 0,
    )
    const allowedMessage = await tMessage('allowed alerts', 'alerts', 'message.created')
    const allowedDelivery = await tDelivery(allowedMessage.id)
    await tRun(allowedDelivery.id)
    tcheck(
      'allowed event accepted once with exact emulated body and persistent attempt',
      (await tGet(allowedDelivery.id)).status === 'accepted' &&
        (await tGet(allowedDelivery.id)).attempts === 1 &&
        getTelecomEmulatorReceipts().length === 1 &&
        getTelecomEmulatorReceipts()[0].text === '09C controlled telecom body',
    )
    const stoppedMessage = await tMessage('STOP race', 'alerts', 'message.created')
    const stoppedDelivery = await tDelivery(stoppedMessage.id)
    const foreignContact = await tCreate('contacts', {
      site: betaId,
      displayName: 'Same phone foreign site',
      phoneE164: phone,
    })
    const foreignSubscriber = await tCreate('subscribers', {
      site: betaId,
      email: 'foreign-phone@rc1-09c.test',
      emailHash: audienceDigest('foreign-phone@rc1-09c.test'),
      status: 'active',
      contact: foreignContact.id,
    })
    const foreignList = await tCreate('audience-lists', {
      site: betaId,
      name: 'foreign list',
      title: 'foreign',
      slug: '09c-foreign-list',
    })
    await tCreate('audience-memberships', {
      audienceList: foreignList.id,
      subscriber: foreignSubscriber.id,
      status: 'active',
    })
    await tCreate('consent-events', {
      site: betaId,
      subscriber: foreignSubscriber.id,
      event: 'preference-granted',
      basis: 'consent',
      channel: 'sms',
      purpose: 'alerts',
      occurredAt: new Date().toISOString(),
    })
    const foreignMessage = await tCreate('telecom-messages', {
      site: betaId,
      title: 'Foreign phone',
      body: 'Foreign controlled',
      purpose: 'alerts',
      status: 'scheduled',
      audience: { lists: [foreignList.id] },
    })
    const foreignDelivery = await tDelivery(foreignMessage.id)
    await processInboundTelecomMessage(payload, {
      siteId: alphaId,
      fromE164: phone,
      toE164: '+14155550198',
      text: 'STOP',
      provider: 'telecom-emulator',
      providerMessageId: 'r09c-stop-1',
    })
    await tRun(stoppedDelivery.id)
    tcheck(
      'site-scoped STOP cannot cancel a foreign tenant using the same phone',
      (await tGet(foreignDelivery.id)).status === 'queued',
    )
    tcheck(
      'STOP after queue prevents another send',
      (await tGet(stoppedDelivery.id)).status === 'cancelled' &&
        getTelecomEmulatorReceipts().length === 1,
    )
    tcheck(
      'STOP suppression persisted using canonical phone hash',
      (
        await payload.find({
          collection: 'suppressions',
          where: { emailHash: { equals: telecomDigest(phone) } },
          overrideAccess: true,
        })
      ).docs.length > 0,
    )
    tcheck(
      'campaign replay does not add deliveries',
      (await queueTelecomCampaignDeliveries(payload, allowedMessage.id)).queuedCount === 0,
    )
    const telecomRows = await find('telecom-deliveries')
    await writeFile(
      `${out}/telecom-state.json`,
      JSON.stringify(
        {
          quietZone,
          rows: telecomRows.map((r: any) => ({
            id: r.id,
            status: r.status,
            attempts: r.attempts,
            quietHoursDelayedUntil: r.quietHoursDelayedUntil,
            provider: r.provider,
            outcome: r.outcome,
          })),
          receipts: getTelecomEmulatorReceipts(),
        },
        null,
        2,
      ),
    )
    await writeFile(
      `${out}/telecom-trace.json`,
      JSON.stringify({ checks: telecomCount, succeeded: true, trace: telecomTrace }, null, 2),
    )

    // ----------------------------------------------------------
    // PERSISTENCE: cross-phase expectations + evidence files.
    // ----------------------------------------------------------
    const allDeliveries = await find('email-deliveries')
    const expectations = allDeliveries.map((d: any) => ({
      id: String(d.id),
      recipientEmail: d.recipientEmail,
      status: d.status,
      attempts: Number(d.attempts ?? 0),
      providerMessageId: d.providerMessageId ?? null,
    }))
    const telecomTerminal = [
      { id: String(allowedDelivery.id), status: 'accepted', attempts: 1 },
      { id: String(followDelivery.id), status: 'cancelled', attempts: Number((await tGet(followDelivery.id)).attempts) },
      { id: String(stoppedDelivery.id), status: 'cancelled', attempts: Number((await tGet(stoppedDelivery.id)).attempts) },
    ]
    await writeFile(
      `${scratch}/state.json`,
      JSON.stringify(
        { alphaId, betaId, deliveries: expectations, telecomRows: telecomTerminal },
        null,
        2,
      ),
    )
    await writeFile(
      `${out}/failure-table.json`,
      JSON.stringify({ scenarios: failureTable }, null, 2),
    )
    await writeFile(
      `${out}/smtp-trace.json`,
      JSON.stringify(
        {
          messages: captured.map((mail) => ({
            to: mail.to,
            at: mail.at,
            subject: parsed(mail).headers.get('subject'),
            messageId: parsed(mail).headers.get('message-id'),
            bytes: Buffer.byteLength(mail.raw),
          })),
          rcptRejections: Object.fromEntries(rcptRejections),
          boundary: 'Loopback only; no remote SMTP/carrier activity',
        },
        null,
        2,
      ),
    )
    const dedupMail = mailTo(DEDUP)[0]
    assert.ok(dedupMail, 'dedup specimen captured')
    await writeFile(`${out}/controlled-message.eml`, dedupMail.raw)
    await writeFile(
      `${out}/persistence.json`,
      JSON.stringify({ deliveries: expectations, capturedCount: captured.length }, null, 2),
    )
    check(
      'final state: every scenario delivery is in its recorded terminal/parked state',
      expectations.length >= 12,
    )
    succeeded = true
    await writeFile(
      `${out}/journey-trace.json`,
      JSON.stringify({ checks: checkCount, succeeded: true, trace }, null, 2),
    )
  }
} finally {
  if (!succeeded) {
    await writeFile(
      `${out}/${restartMode ? 'restart' : 'journey'}-trace.json`,
      JSON.stringify({ checks: checkCount, succeeded: false, trace }, null, 2),
    ).catch(() => {})
  }
  await stopWorker().catch(() => {})
  await stopSink().catch(() => {})
  await browser.close()
  await payload.db.destroy()
}
console.log(`09C ${restartMode ? 'restart' : 'journey'}: ${checkCount} checks passed`)
process.exit(succeeded ? 0 : 1)
