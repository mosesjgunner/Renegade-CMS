/* eslint-disable @typescript-eslint/no-explicit-any -- isolated supported HTTP acceptance */
// R-09A local-process variant of the 09A acceptance (signup,
// confirmation, consent and suppression; the frozen 09A was never
// executed — no frozen evidence folder or ledger row exists). Same
// assertion families as the frozen prompt and the canonical
// aud-public-subscription-journey integration test, executed as an
// ordinary browser + operator HTTP journey per the R-01B..R-08-SOCIAL
// local precedent: production standalone server + jobs worker as
// local processes behind a local HTTPS proxy
// (https://rc1-09a.test:38812), disposable PostgreSQL database
// rc1r09a_main, test authentication disabled. The operator owner is
// created by the real installer WebAuthn ceremony; visitor flows are
// anonymous browser flows.
//
// Email is a CONTROLLED LOCAL MAIL SINK ONLY: the app runs
// EMAIL_MODE=smtp against a capture SMTP server this verifier runs on
// 127.0.0.1:3143 (the frozen 09C loopback pattern). Every product
// email (confirmation, campaigns) is really sent by the worker over
// SMTP and really received here; links are extracted from the
// captured MIME exactly as a recipient would use them. No real
// provider, real address or external delivery is involved.
//
// Evidence lands under docs/rc/evidence/rc1/repairs/R-09A/;
// session/state live under scratch/rc1r09a/.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createServer as netServer, type Socket } from 'node:net'
import nodeHttps from 'node:https'
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ensureBootstrap, rotateBootstrapToken } from '../../src/modules/operations/installation'
import { loadConfig } from '../../src/modules/core/config'
import { segmentVersion } from '../../src/modules/audience/engine'
import { audienceDigest } from '../../src/modules/audience/contracts'
import {
  deriveAudienceEligibility,
  isSubscriberSuppressed,
  issueAudienceAccessToken,
  suppressSubscriber,
} from '../../src/modules/audience/service'

assert.equal(process.env.RC1R09A_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith('/rc1r09a_main'))
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const restartMode = process.argv.includes('--restart')
const base = 'https://rc1-09a.test:38812'
const betaBase = 'https://beta.rc1-09a.test:38812'
const proxyPort = 38812
const smtpPort = 3143
const out = 'docs/rc/evidence/rc1/repairs/R-09A'
const scratch = 'scratch/rc1r09a'
await mkdir(out, { recursive: true })
await mkdir(scratch, { recursive: true })

const V1 = 'visitor-one@rc1-09a.test'
const V2 = 'visitor-two@rc1-09a.test'
const V5 = 'blocked-five@rc1-09a.test'
const V6 = 'visitor-six@rc1-09a.test'
const V7 = 'visitor-seven@rc1-09a.test'
const V8 = 'visitor-eight@rc1-09a.test'

const payload: any = await getPayload({ config })

// ------------------------------------------------------------------
// Capture SMTP sink (frozen 09C pattern). The verifier owns it, so it
// can take the sink down to force a retryable send failure and bring
// it back to prove a suppressed recipient is never sent to.
// ------------------------------------------------------------------
type Captured = { to: string; raw: string; at: string }
const captured: Captured[] = []
const sockets = new Set<Socket>()
let sink: ReturnType<typeof netServer> | undefined
// 'accept' captures normally; 'tempfail' answers RCPT with an SMTP
// 450 so the product classifies the failure retryable (a greylist-
// style temporary failure). A fully closed sink instead produces a
// socket error, which the product deliberately classifies as an
// unknown outcome (never auto-retried) — exercised separately below.
let sinkMode: 'accept' | 'tempfail' = 'accept'
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
const hrefsIn = (html: string) =>
  [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
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
      socket.write('220 rc1-09a.local ESMTP\r\n')
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
            socket.write('250 captured\r\n')
          } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-rc1-09a.local\r\n250 8BITMIME\r\n')
          else if (/^MAIL FROM:/i.test(line)) socket.write('250 sender accepted\r\n')
          else if (/^RCPT TO:/i.test(line)) {
            if (sinkMode === 'tempfail') {
              socket.write('450 4.7.1 Temporary local failure, try again later\r\n')
            } else {
              to = /<([^>]+)>/.exec(line)?.[1] ?? ''
              socket.write('250 recipient accepted\r\n')
            }
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

// ------------------------------------------------------------------
// Browser + API plumbing (R-08 pattern).
// ------------------------------------------------------------------
const browser = await chromium.launch({
  headless: true,
  args: [
    '--ignore-certificate-errors',
    '--no-proxy-server',
    '--host-resolver-rules=MAP rc1-09a.test 127.0.0.1,MAP beta.rc1-09a.test 127.0.0.1',
  ],
})
const trace: any[] = []
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
  const host = opts.host ?? 'rc1-09a.test:38812'
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

const design = (subject: string) => ({
  version: 1,
  templateVersion: 'r09a-1',
  locale: 'en',
  tokens: {
    background: '#ffffff',
    foreground: '#172033',
    accent: '#164e9b',
    fontFamily: 'Arial, sans-serif',
  },
  blocks: [
    { type: 'heading', text: subject },
    { type: 'text', text: 'A dispatch from the 09A acceptance audience.' },
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
    // RESTART phase: persisted consent/suppression state, no
    // resend, and a fresh lifecycle after web+worker+PG restart.
    // ----------------------------------------------------------
    await startSink()
    const state = JSON.parse(await readFile(`${scratch}/state.json`, 'utf8'))
    const alphaId = state.alphaId
    const betaId = state.betaId
    const v1Alpha = await subscriberByEmail(alphaId, V1)
    check(
      'post-restart: Alpha visitor-one remains unsubscribed with an unsubscribe suppression',
      v1Alpha?.status === 'unsubscribed' &&
        (await isSubscriberSuppressed(payload, alphaId, v1Alpha.emailHash)) &&
        (await find('suppressions', {
          and: [
            { site: { equals: alphaId } },
            { emailHash: { equals: v1Alpha.emailHash } },
            { reason: { equals: 'unsubscribe' } },
          ],
        })).length === 1,
    )
    const v1Beta = await subscriberByEmail(betaId, V1)
    check(
      'post-restart: Beta visitor-one remains active (site isolation survives restart)',
      v1Beta?.status === 'active',
    )
    const v1Events = await find('consent-events', { subscriber: { equals: v1Alpha.id } })
    check(
      'post-restart: consent history is intact (same event count as before restart)',
      v1Events.length === state.v1ConsentEvents,
    )
    const raceDelivery = await row('email-deliveries', state.raceDeliveryId)
    check(
      'post-restart: suppressed-before-send delivery stays cancelled, never resent',
      raceDelivery.status === 'cancelled' && raceDelivery.outcome?.code === 'suppressed-before-send',
    )
    const snapshot = await row('recipient-snapshots', state.campaign1SnapshotId)
    check(
      'post-restart: campaign recipient snapshot hash is unchanged',
      snapshot.hash === state.campaign1SnapshotHash,
    )
    await sleep(20000)
    check(
      'post-restart: no email is sent by restarted web/worker within the observation window',
      captured.length === 0,
    )
    // Fresh lifecycle after restart: signup -> sink -> confirm.
    await page.goto(`${base}/subscribe`, { timeout: 180000 })
    await page.getByLabel('Email Address').fill(V6)
    await page.getByLabel('Consent to receive emails').check()
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await page.getByText('Check your inbox to confirm your subscription.').waitFor()
    await until('post-restart confirmation email captured', async () =>
      mailTo(V6, 'Confirm your subscription').length === 1,
    )
    const confirmLink = linksIn(parsed(mailTo(V6)[0]).text).find((link) =>
      link.includes('/subscribe/confirm'),
    )
    assert.ok(confirmLink, 'post-restart confirmation link present')
    await page.goto(confirmLink, { timeout: 180000 })
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.getByText('Your subscription is confirmed.').waitFor()
    const v6 = await subscriberByEmail(alphaId, V6)
    check('post-restart: new signup confirms and persists as active', v6?.status === 'active')
    const evaluation = (
      await api(
        '/api/admin/audience/campaign',
        'POST',
        { action: 'evaluate-segment', segmentId: state.segmentId },
        200,
      )
    ).json()
    check(
      'post-restart: deliverable count includes only the newly confirmed subscriber',
      evaluation.counts.totalSubscribers === state.alphaTotalAtRestart &&
        evaluation.counts.eligibleConsented === 1 &&
        evaluation.eligibleRecipientsSample?.[0]?.email === V6,
    )
    succeeded = true
    await writeFile(
      `${out}/restart-trace.json`,
      JSON.stringify({ checks: checkCount, succeeded: true, trace }, null, 2),
    )
  } else {
    await startSink()
    // ----------------------------------------------------------
    // SETUP: real installer WebAuthn ceremony (R-03D pattern).
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
    await ownerPage.getByLabel('Owner email').fill('owner@rc1-09a.test')
    await ownerPage.getByRole('button', { name: 'Continue', exact: true }).click()
    await ownerPage.getByLabel('Site or publication name').fill('09A Audience Alpha')
    await ownerPage.getByLabel('Site slug').fill('audience-alpha-09a')
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
    const alpha = (await find('sites', { slug: { equals: 'audience-alpha-09a' } }))[0]
    assert.ok(alpha, 'installer site exists')
    const alphaId = String(alpha.id)

    // Second site + host resolution (operator fixture, R-03C pattern).
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '09A Audience Beta', slug: 'audience-beta-09a', lifecycle: 'active' },
    })
    const betaId = String(beta.id)
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOriginsBySite: { [alphaId]: base, [betaId]: betaBase },
      },
      overrideAccess: true,
    })
    check(
      'second site created and both canonical origins registered',
      Boolean(beta?.id),
    )

    // Canonical newsletter segment (operator fixture).
    const definition = { predicate: { field: 'consentPurpose', op: 'is', value: 'newsletter' } }
    const segment = await payload.create({
      collection: 'audience-segments',
      data: {
        site: alphaId,
        name: '09A Newsletter Segment',
        definition,
        version: segmentVersion(definition as never),
        status: 'active',
      },
    })
    const segmentId = String(segment.id)
    const betaSegment = await payload.create({
      collection: 'audience-segments',
      data: {
        site: betaId,
        name: '09A Beta Newsletter Segment',
        definition,
        version: segmentVersion(definition as never),
        status: 'active',
      },
    })
    const betaSegmentId = String(betaSegment.id)
    // The ceremony owner is member-linked, so it is not a global
    // owner for grant purposes: Alpha works because site creation
    // granted it a role there. Beta (a Local-API fixture) needs the
    // equivalent operator grant for the campaign API to serve it.
    const ownerUsers = await payload.find({
      collection: 'users',
      where: { email: { equals: 'owner@rc1-09a.test' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const memberValue = (ownerUsers.docs[0] as any)?.member
    const ownerMemberId = String(
      typeof memberValue === 'object' && memberValue ? memberValue.id : (memberValue ?? ''),
    )
    assert.ok(ownerMemberId, 'owner member link present')
    await payload.create({
      collection: 'member-site-roles',
      data: { member: ownerMemberId, site: betaId, role: 'community-manager' },
      overrideAccess: true,
    })

    // ----------------------------------------------------------
    // SIGNUP: anonymous browser double opt-in request.
    // ----------------------------------------------------------
    await page.goto(`${base}/subscribe`, { timeout: 180000 })
    await page.getByLabel('Email Address').fill(V1)
    await page.getByLabel('Consent to receive emails').check()
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await page.getByText('Check your inbox to confirm your subscription.').waitFor()
    check('anonymous published signup form accepts a visitor subscription request', true)
    const v1Pending = await subscriberByEmail(alphaId, V1)
    const requestedEvents = await find('consent-events', {
      and: [{ subscriber: { equals: v1Pending.id } }, { event: { equals: 'requested' } }],
    })
    check(
      'signup persists a pending subscriber and a consent-provenance event',
      v1Pending?.status === 'pending' &&
        requestedEvents.length === 1 &&
        String(requestedEvents[0].wording).includes('consent to receive newsletter') &&
        requestedEvents[0].evidence?.source === 'public-subscribe',
    )
    const lists = await find('audience-lists', { site: { equals: alphaId } })
    const listId = String(lists[0].id)
    const membership1 = (
      await find('audience-memberships', { subscriber: { equals: v1Pending.id } })
    )[0]
    check(
      'signup auto-resolves the site list (double opt-in) with a pending membership',
      lists.length === 1 && lists[0].doubleOptIn === true && membership1?.status === 'pending',
    )
    await until('confirmation email reaches the local sink', async () =>
      mailTo(V1, 'Confirm your subscription').length === 1,
    )
    const confirmMail = parsed(mailTo(V1)[0])
    const confirmLink = linksIn(confirmMail.text).find((link) =>
      link.includes('/subscribe/confirm'),
    )
    check(
      'worker delivers the confirmation to the local mail sink with a confirm link',
      Boolean(confirmLink) && confirmMail.headers.get('subject') === 'Confirm your subscription',
    )
    const confirmationDeliveries = await find('email-deliveries', {
      subscriber: { equals: v1Pending.id },
    })
    check(
      'confirmation delivery is recorded accepted via the smtp provider',
      confirmationDeliveries.length === 1 &&
        confirmationDeliveries[0].status === 'accepted' &&
        confirmationDeliveries[0].provider === 'smtp',
    )

    // Duplicate signup is idempotent: no second record, token or email.
    await page.goto(`${base}/subscribe`, { timeout: 180000 })
    await page.getByLabel('Email Address').fill(V1)
    await page.getByLabel('Consent to receive emails').check()
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await page.getByText('Check your inbox to confirm your subscription.').waitFor()
    await sleep(4000)
    const v1Tokens = await find('subscriber-confirmation-tokens', {
      subscriber: { equals: v1Pending.id },
    })
    check(
      'duplicate signup creates no duplicate subscriber, live token or confirmation email',
      (await find('subscribers', { and: [{ site: { equals: alphaId } }, { email: { equals: V1 } }] }))
        .length === 1 &&
        v1Tokens.filter((t: any) => !t.usedAt).length === 1 &&
        mailTo(V1, 'Confirm your subscription').length === 1,
    )

    // A second visitor signs up (API path) and never confirms.
    const v2Response = await api(
      '/api/subscribers/subscribe',
      'POST',
      { email: V2 },
      202,
      { cookie: '', xff: '198.51.100.10' },
    )
    check(
      'second visitor signup returns pending and persists unconfirmed',
      v2Response.json().status === 'pending' &&
        (await subscriberByEmail(alphaId, V2))?.status === 'pending',
    )

    // ----------------------------------------------------------
    // CONFIRM: one-time token through the browser link.
    // ----------------------------------------------------------
    await page.goto(confirmLink!, { timeout: 180000 })
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.getByText('Your subscription is confirmed.').waitFor()
    const v1Active = await subscriberByEmail(alphaId, V1)
    const usedToken = (
      await find('subscriber-confirmation-tokens', { subscriber: { equals: v1Pending.id } })
    )[0]
    const confirmedEvents = await find('consent-events', {
      and: [{ subscriber: { equals: v1Pending.id } }, { event: { equals: 'double-opt-in-confirmed' } }],
    })
    check(
      'confirmation activates subscriber and membership and records consent with token evidence',
      v1Active?.status === 'active' &&
        Boolean(v1Active?.verifiedAt) &&
        Boolean(usedToken?.usedAt) &&
        (await find('audience-memberships', { subscriber: { equals: v1Pending.id } }))[0]
          ?.status === 'active' &&
        confirmedEvents.length === 1 &&
        confirmedEvents[0].evidence?.tokenId === String(usedToken.id),
    )
    await page.goto(confirmLink!, { timeout: 180000 })
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.getByText('Confirmation link is invalid or already used.').waitFor()
    check(
      'reused confirmation link is denied and state is unchanged',
      (await subscriberByEmail(alphaId, V1))?.status === 'active' &&
        (await find('consent-events', { subscriber: { equals: v1Pending.id } })).length === 2,
    )
    const forged = await api(
      '/api/subscribers/confirm',
      'POST',
      { token: '<MASKED_SECRET_001>' },
      400,
      { cookie: '' },
    )
    check(
      'forged confirmation token is denied',
      String(forged.json().error).includes('invalid or already used'),
    )

    // ----------------------------------------------------------
    // CAMPAIGN 1: segmentation counts + real marketing delivery.
    // ----------------------------------------------------------
    const evaluation1 = (
      await api('/api/admin/audience/campaign', 'POST', {
        action: 'evaluate-segment',
        segmentId,
      })
    ).json()
    check(
      'segmentation counts exclude the unconfirmed visitor from deliverable',
      evaluation1.counts.totalSubscribers === 2 &&
        evaluation1.counts.matchedSubscribers === 1 &&
        evaluation1.counts.eligibleConsented === 1 &&
        evaluation1.counts.isEmpty === false &&
        evaluation1.eligibleRecipientsSample[0].email === V1,
    )
    const campaign1 = (
      await api('/api/admin/audience/campaign', 'POST', {
        action: 'save-and-schedule',
        subject: '09A Campaign One',
        segmentId,
        messageDesign: design('09A Campaign One'),
        targetStatus: 'schedule',
        scheduledFor: new Date(Date.now() - 60000).toISOString(),
      })
    ).json()
    assert.ok(campaign1.ok && campaign1.messageId, 'campaign 1 scheduled')
    check(
      'campaign 1 snapshot pins exactly the one consented recipient',
      campaign1.recipientCount === 1 && Boolean(campaign1.snapshotHash),
    )
    await until('campaign 1 delivery accepted', async () => {
      const deliveries = await deliveriesFor(campaign1.messageId)
      return deliveries.length === 1 && deliveries[0].status === 'accepted'
    })
    await until('campaign 1 email reaches the sink', async () =>
      mailTo(V1, '09A Campaign One').length === 1,
    )
    const campaign1Mail = parsed(mailTo(V1, '09A Campaign One')[0])
    const campaign1Hrefs = hrefsIn(campaign1Mail.html)
    const preferencesLink = campaign1Hrefs.find((link) =>
      link.includes('/subscribe/preferences?token='),
    )
    const unsubscribeLink = campaign1Hrefs.find((link) => link.includes('/unsubscribe?token='))
    check(
      'campaign email carries real per-recipient preference and unsubscribe links',
      Boolean(preferencesLink) &&
        Boolean(unsubscribeLink) &&
        Boolean(campaign1Mail.headers.get('list-unsubscribe')),
    )
    check(
      'no campaign delivery exists for the unconfirmed visitor',
      (await deliveriesFor(campaign1.messageId)).every(
        (d: any) => d.recipientEmail !== V2,
      ) && mailTo(V2, '09A Campaign One').length === 0,
    )

    // ----------------------------------------------------------
    // PREFERENCES: grant then withdraw through the emailed link.
    // ----------------------------------------------------------
    await page.goto(preferencesLink!, { timeout: 180000 })
    await page.getByLabel(/Receive newsletter email/).check()
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
    await page.getByText('Preferences saved.').waitFor()
    const eligibilityGranted = await deriveAudienceEligibility(payload, alphaId, v1Pending.id)
    check(
      'preference grant is recorded as consent evidence and keeps the subscriber eligible',
      eligibilityGranted.choices['email:marketing'] === true &&
        eligibilityGranted.eligible === true &&
        (await find('consent-events', {
          and: [{ subscriber: { equals: v1Pending.id } }, { event: { equals: 'preference-granted' } }],
        })).length === 1,
    )
    await page.goto(preferencesLink!, { timeout: 180000 })
    await page.getByLabel(/Receive newsletter email/).uncheck()
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
    await page.getByText('Preferences saved.').waitFor()
    const v1Withdrawn = await subscriberByEmail(alphaId, V1)
    check(
      'preference withdrawal unsubscribes and suppresses the record with consent evidence',
      v1Withdrawn?.status === 'unsubscribed' &&
        Boolean(v1Withdrawn?.globalUnsubscribedAt) &&
        (await isSubscriberSuppressed(payload, alphaId, v1Withdrawn.emailHash)) &&
        (await find('consent-events', {
          and: [
            { subscriber: { equals: v1Pending.id } },
            { event: { equals: 'preference-withdrawn' } },
          ],
        })).length === 1,
    )

    // ----------------------------------------------------------
    // SUPPRESSION GATE: nothing deliverable, scheduling refused.
    // ----------------------------------------------------------
    const evaluation2 = (
      await api('/api/admin/audience/campaign', 'POST', {
        action: 'evaluate-segment',
        segmentId,
      })
    ).json()
    check(
      'after withdrawal the segment has no deliverable recipients',
      evaluation2.counts.totalSubscribers === 2 &&
        evaluation2.counts.matchedSubscribers === 0 &&
        evaluation2.counts.eligibleConsented === 0 &&
        evaluation2.counts.isEmpty === true,
    )
    const emptySchedule = await api(
      '/api/admin/audience/campaign',
      'POST',
      {
        action: 'save-and-schedule',
        subject: '09A Campaign Blocked',
        segmentId,
        messageDesign: design('09A Campaign Blocked'),
        targetStatus: 'schedule',
        scheduledFor: new Date(Date.now() - 60000).toISOString(),
      },
      400,
    )
    check(
      'scheduling a campaign to an all-unconsented/suppressed audience is refused',
      emptySchedule.json().emptyAudience === true,
    )

    // ----------------------------------------------------------
    // RESUBSCRIBE: fresh double opt-in lifts the suppression.
    // ----------------------------------------------------------
    await page.goto(`${base}/subscribe`, { timeout: 180000 })
    await page.getByLabel('Email Address').fill(V1)
    await page.getByLabel('Consent to receive emails').check()
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await page.getByText('Check your inbox to confirm your subscription.').waitFor()
    await until('resubscribe confirmation email captured', async () =>
      mailTo(V1, 'Confirm your subscription').length === 2,
    )
    const resubConfirmLink = linksIn(parsed(mailTo(V1, 'Confirm your subscription')[1]).text).find(
      (link) => link.includes('/subscribe/confirm'),
    )
    assert.ok(resubConfirmLink, 'resubscribe confirmation link present')
    await page.goto(resubConfirmLink, { timeout: 180000 })
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.getByText('Your subscription is confirmed.').waitFor()
    const v1Resubscribed = await subscriberByEmail(alphaId, V1)
    check(
      're-subscription reconfirms, reactivates and lifts the unsubscribe suppression',
      v1Resubscribed?.status === 'active' &&
        !(await isSubscriberSuppressed(payload, alphaId, v1Resubscribed.emailHash)) &&
        (await find('consent-events', {
          and: [{ subscriber: { equals: v1Pending.id } }, { event: { equals: 'resubscribe' } }],
        })).length === 1,
    )

    // ----------------------------------------------------------
    // CAMPAIGN 3 + QUEUED-SUPPRESSION RACE: a delivery queued
    // before unsubscribe must be cancelled, never sent.
    // ----------------------------------------------------------
    const campaign3 = (
      await api('/api/admin/audience/campaign', 'POST', {
        action: 'save-and-schedule',
        subject: '09A Campaign Three',
        segmentId,
        messageDesign: design('09A Campaign Three'),
        targetStatus: 'schedule',
        scheduledFor: new Date(Date.now() - 60000).toISOString(),
      })
    ).json()
    assert.ok(campaign3.ok && campaign3.messageId, 'campaign 3 scheduled')
    await until('campaign 3 email reaches the sink', async () =>
      mailTo(V1, '09A Campaign Three').length === 1,
    )
    const campaign3Unsub = hrefsIn(parsed(mailTo(V1, '09A Campaign Three')[0]).html).find((link) =>
      link.includes('/unsubscribe?token='),
    )
    assert.ok(campaign3Unsub, 'campaign 3 unsubscribe link present')
    check('campaign 3 delivers to the reconsented subscriber', true)

    sinkMode = 'tempfail'
    check('mail sink switched to SMTP 450 temporary failure to force a retryable send failure', true)
    const campaign4 = (
      await api('/api/admin/audience/campaign', 'POST', {
        action: 'save-and-schedule',
        subject: '09A Campaign Four',
        segmentId,
        messageDesign: design('09A Campaign Four'),
        targetStatus: 'schedule',
        scheduledFor: new Date(Date.now() - 60000).toISOString(),
      })
    ).json()
    assert.ok(campaign4.ok && campaign4.messageId, 'campaign 4 scheduled')
    let raceDelivery: any
    await until('campaign 4 delivery queued and attempted against the failing sink', async () => {
      const deliveries = await deliveriesFor(campaign4.messageId)
      raceDelivery = deliveries[0]
      return deliveries.length === 1 && Number(raceDelivery?.attempts ?? 0) >= 1 &&
        raceDelivery?.status === 'queued'
    })
    check(
      'campaign 4 delivery is queued and attempted but only meets a temporary SMTP failure',
      raceDelivery?.recipientEmail === V1 && raceDelivery?.status === 'queued',
    )
    await page.goto(campaign3Unsub, { timeout: 180000 })
    await page.getByRole('button', { name: 'Unsubscribe', exact: true }).click()
    await page.getByText('You have been unsubscribed.').waitFor()
    const v1Unsubbed = await subscriberByEmail(alphaId, V1)
    check(
      'unsubscribe page flow suppresses the subscriber again',
      v1Unsubbed?.status === 'unsubscribed' &&
        (await isSubscriberSuppressed(payload, alphaId, v1Unsubbed.emailHash)),
    )
    sinkMode = 'accept'
    await until('queued delivery is cancelled by the send-time suppression check', async () => {
      const current = await row('email-deliveries', raceDelivery.id)
      return current.status === 'cancelled' && current.outcome?.code === 'suppressed-before-send'
    })
    await sleep(15000)
    check(
      'suppressed-before-send: the queued campaign is never delivered after suppression',
      mailTo(V1, '09A Campaign Four').length === 0 &&
        (await row('email-deliveries', raceDelivery.id)).status === 'cancelled',
    )

    // ----------------------------------------------------------
    // CROSS-SITE: same address on Beta is an independent record.
    // ----------------------------------------------------------
    await page.goto(`${betaBase}/subscribe`, { timeout: 180000 })
    await page.getByLabel('Email Address').fill(V1)
    await page.getByLabel('Consent to receive emails').check()
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await page.getByText('Check your inbox to confirm your subscription.').waitFor()
    const v1BetaPending = await subscriberByEmail(betaId, V1)
    check(
      'same address on the second site creates an independent pending subscriber',
      Boolean(v1BetaPending) &&
        v1BetaPending?.status === 'pending' &&
        String(v1BetaPending?.id) !== String(v1Pending.id) &&
        (await subscriberByEmail(alphaId, V1))?.status === 'unsubscribed',
    )
    await until('beta confirmation email captured', async () =>
      mailTo(V1, 'Confirm your subscription').length === 3,
    )
    const betaConfirmLink = linksIn(parsed(mailTo(V1, 'Confirm your subscription')[2]).text).find(
      (link) => link.includes('/subscribe/confirm'),
    )
    assert.ok(betaConfirmLink, 'beta confirmation link present')
    await page.goto(betaConfirmLink, { timeout: 180000 })
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.getByText('Your subscription is confirmed.').waitFor()
    check(
      'beta confirmation activates only the beta subscriber; alpha stays unsubscribed',
      (await subscriberByEmail(betaId, V1))?.status === 'active' &&
        (await subscriberByEmail(alphaId, V1))?.status === 'unsubscribed',
    )
    const crossSite = await api(
      '/api/subscribers/subscribe',
      'POST',
      { email: 'cross-site@rc1-09a.test', siteId: betaId },
      400,
      { cookie: '', xff: '198.51.100.20' },
    )
    check(
      'subscribe naming a foreign site for the host is denied',
      String(crossSite.json().error).includes('Community site unavailable'),
    )
    const betaLists = await find('audience-lists', { site: { equals: betaId } })
    const foreignList = await api(
      '/api/subscribers/subscribe',
      'POST',
      { email: 'cross-list@rc1-09a.test', listId: String(betaLists[0].id) },
      400,
      { cookie: '', xff: '198.51.100.21' },
    )
    check(
      'subscribe naming a foreign list for the host site is denied',
      String(foreignList.json().error).includes('Newsletter unavailable'),
    )

    // ----------------------------------------------------------
    // TOKEN DENIALS: purpose swap, tampering, expiry.
    // ----------------------------------------------------------
    const campaign3Prefs = hrefsIn(parsed(mailTo(V1, '09A Campaign Three')[0]).html).find((link) =>
      link.includes('/subscribe/preferences?token='),
    )
    const prefsToken = new URL(campaign3Prefs!).searchParams.get('token')!
    const unsubToken = new URL(campaign3Unsub).searchParams.get('token')!
    const swap1 = await api(
      '/api/subscribers/unsubscribe',
      'POST',
      { token: prefsToken },
      400,
      { cookie: '' },
    )
    const swap2 = await api(
      '/api/subscribers/preferences',
      'POST',
      { token: unsubToken, choices: [{ channel: 'email', purpose: 'marketing', granted: true }] },
      400,
      { cookie: '', xff: '198.51.100.22' },
    )
    check(
      'access tokens are purpose-bound (preferences token cannot unsubscribe and vice versa)',
      String(swap1.json().error).includes('Invalid unsubscribe link') &&
        String(swap2.json().error).includes('Invalid preference link'),
    )
    const [claimsPart, signaturePart] = unsubToken.split('.')
    const claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8'))
    claims.subscriberId = v1BetaPending.id
    const tampered = `${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signaturePart}`
    const tamperedResult = await api(
      '/api/subscribers/unsubscribe',
      'POST',
      { token: tampered },
      400,
      { cookie: '' },
    )
    check(
      'a tampered access token (foreign subscriber id, original signature) is denied',
      String(tamperedResult.json().error).includes('Invalid unsubscribe link') &&
        (await subscriberByEmail(betaId, V1))?.status === 'active',
    )
    const expiredAccess = await issueAudienceAccessToken(payload, {
      siteId: betaId,
      subscriberId: String(v1BetaPending.id),
      purpose: 'preferences',
      ttlSeconds: -60,
    })
    const expiredAccessResult = await api(
      '/api/subscribers/preferences',
      'POST',
      {
        token: expiredAccess,
        choices: [{ channel: 'email', purpose: 'marketing', granted: true }],
      },
      400,
      { cookie: '', xff: '198.51.100.23' },
    )
    check(
      'an expired access token is denied',
      String(expiredAccessResult.json().error).includes('Invalid preference link'),
    )
    // Expired confirmation token (labelled fixture: a token row whose
    // expiry has passed, the state an old email link reaches).
    await api('/api/subscribers/subscribe', 'POST', { email: V8 }, 202, {
      cookie: '',
      xff: '198.51.100.24',
    })
    const v8 = await subscriberByEmail(alphaId, V8)
    assert.ok(v8, 'visitor eight pending')
    const expiredRaw = 'expired-confirmation-fixture-token'
    await payload.create({
      collection: 'subscriber-confirmation-tokens',
      data: {
        site: alphaId,
        subscriber: v8.id,
        audienceList: listId,
        tokenHash: audienceDigest(expiredRaw),
        expiresAt: new Date(Date.now() - 60000).toISOString(),
        locale: 'en',
        consentWording: 'I consent to receive newsletter updates from this publication.',
      },
      overrideAccess: true,
    })
    const expiredConfirm = await api(
      '/api/subscribers/confirm',
      'POST',
      { token: expiredRaw },
      400,
      { cookie: '' },
    )
    check(
      'an expired confirmation token is denied and the subscriber stays pending',
      String(expiredConfirm.json().error).includes('invalid or already used') &&
        (await subscriberByEmail(alphaId, V8))?.status === 'pending',
    )

    // ----------------------------------------------------------
    // SUPPRESSED ADDRESS: bounce suppression blocks re-signup.
    // ----------------------------------------------------------
    await suppressSubscriber(payload, { siteId: alphaId, email: V5, reason: 'bounce' })
    await page.goto(`${base}/subscribe`, { timeout: 180000 })
    await page.getByLabel('Email Address').fill(V5)
    await page.getByLabel('Consent to receive emails').check()
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await page.getByText('This address cannot be subscribed.').waitFor()
    check(
      'an address suppressed for bounce cannot sign up again and no subscriber is created',
      (await find('subscribers', { and: [{ site: { equals: alphaId } }, { email: { equals: V5 } }] }))
        .length === 0 &&
        (await find('suppressions', {
          and: [{ site: { equals: alphaId } }, { reason: { equals: 'bounce' } }],
        })).length === 1,
    )

    // ----------------------------------------------------------
    // UNKNOWN-OUTCOME PARKING (Beta): a socket-level send failure
    // (sink fully down) is classified unknown and parked by the
    // product — never auto-retried, and the operator retry route
    // refuses it. Observed on the first harness run; these are the
    // frozen 09C semantics, recorded here because a parked unknown
    // delivery is the other way queued work can never leak a send
    // after suppression.
    // ----------------------------------------------------------
    await page.goto(`${betaBase}/subscribe`, { timeout: 180000 })
    await page.getByLabel('Email Address').fill(V2)
    await page.getByLabel('Consent to receive emails').check()
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await page.getByText('Check your inbox to confirm your subscription.').waitFor()
    await until('beta visitor-two confirmation email captured', async () =>
      mailTo(V2, 'Confirm your subscription').length === 2,
    )
    const betaV2Link = linksIn(parsed(mailTo(V2, 'Confirm your subscription')[1]).text).find(
      (link) => link.includes('/subscribe/confirm'),
    )
    assert.ok(betaV2Link, 'beta visitor-two confirmation link present')
    await page.goto(betaV2Link, { timeout: 180000 })
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.getByText('Your subscription is confirmed.').waitFor()
    check(
      'visitor-two confirms on Beta while remaining merely pending on Alpha',
      (await subscriberByEmail(betaId, V2))?.status === 'active' &&
        (await subscriberByEmail(alphaId, V2))?.status === 'pending',
    )
    await stopSink()
    // Admin mutations are only trusted from the APP_URL origin (the
    // Next proxy guard), so the Beta context is selected with the
    // supported ?siteId= operator parameter instead of the Beta host.
    const campaign5 = (
      await api(
        `/api/admin/audience/campaign?siteId=${betaId}`,
        'POST',
        {
          action: 'save-and-schedule',
          subject: '09A Campaign Five',
          segmentId: betaSegmentId,
          messageDesign: design('09A Campaign Five'),
          targetStatus: 'schedule',
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
        },
        200,
      )
    ).json()
    assert.ok(campaign5.ok && campaign5.messageId, 'campaign 5 scheduled')
    let betaDeliveries: any[] = []
    await until('campaign 5 deliveries parked as unknown', async () => {
      betaDeliveries = await deliveriesFor(campaign5.messageId)
      return (
        betaDeliveries.length === 2 &&
        betaDeliveries.every((d: any) => d.status === 'unknown' && Number(d.attempts) >= 1)
      )
    })
    check(
      'socket-level send failure parks both deliveries unknown and non-retryable',
      betaDeliveries.every(
        (d: any) => d.outcome?.code === 'unknown_outcome' && d.outcome?.retryable === false,
      ),
    )
    await startSink()
    await suppressSubscriber(payload, { siteId: betaId, email: V2, reason: 'unsubscribe' })
    const betaV2Delivery = betaDeliveries.find((d: any) => d.recipientEmail === V2)
    const betaV1Delivery = betaDeliveries.find((d: any) => d.recipientEmail === V1)
    assert.ok(betaV2Delivery && betaV1Delivery, 'beta deliveries identified')
    // The delivery handler re-checks eligibility before its
    // unknown-outcome branch, so the periodic reconciliation pass
    // cancels the parked delivery of a now-suppressed subscriber
    // instead of ever sending it; the still-eligible subscriber's
    // delivery stays parked (SMTP offers no reconciliation proof).
    await until('parked delivery of the suppressed subscriber is cancelled, not sent', async () => {
      const current = await row('email-deliveries', betaV2Delivery.id)
      return current.status === 'cancelled' && current.outcome?.code === 'suppressed-before-send'
    })
    check(
      'parked unknown delivery is cancelled by suppression and never sent; the eligible one stays parked',
      (await row('email-deliveries', betaV1Delivery.id)).status === 'unknown' &&
        mailTo(V2, '09A Campaign Five').length === 0 &&
        mailTo(V1, '09A Campaign Five').length === 0,
    )
    const retryRefused = await api(
      '/api/admin/audience/retry',
      'POST',
      { deliveryId: String(betaV1Delivery.id) },
      409,
    )
    check(
      'operator retry of an unknown-outcome delivery is refused as unsafe',
      String(retryRefused.json().error).includes('cannot be safely retried') &&
        (await subscriberByEmail(betaId, V1))?.status === 'active',
    )

    // ----------------------------------------------------------
    // CONCURRENT DUPLICATE: one record, one token, one email.
    // ----------------------------------------------------------
    const [dupA, dupB] = await Promise.all([
      api('/api/subscribers/subscribe', 'POST', { email: V7 }, 202, {
        cookie: '',
        xff: '198.51.100.11',
      }),
      api('/api/subscribers/subscribe', 'POST', { email: V7 }, 202, {
        cookie: '',
        xff: '198.51.100.11',
      }),
    ])
    assert.ok(dupA.status === 202 && dupB.status === 202)
    await until('duplicate-pair confirmation email captured', async () =>
      mailTo(V7, 'Confirm your subscription').length >= 1,
    )
    await sleep(4000)
    const v7 = await subscriberByEmail(alphaId, V7)
    check(
      'concurrent duplicate signups converge to one subscriber, one live token, one email',
      Boolean(v7) &&
        (await find('subscriber-confirmation-tokens', { subscriber: { equals: v7.id } })).filter(
          (t: any) => !t.usedAt,
        ).length === 1 &&
        mailTo(V7, 'Confirm your subscription').length === 1,
    )

    // Persist the cross-phase state for the restart verification.
    const v1Final = await subscriberByEmail(alphaId, V1)
    await writeFile(
      `${scratch}/state.json`,
      JSON.stringify(
        {
          alphaId,
          betaId,
          segmentId,
          v1ConsentEvents: (await find('consent-events', { subscriber: { equals: v1Final.id } }))
            .length,
          raceDeliveryId: String(raceDelivery.id),
          campaign1SnapshotId: String(campaign1.snapshotId),
          campaign1SnapshotHash: campaign1.snapshotHash,
          alphaTotalAtRestart:
            (await find('subscribers', { site: { equals: alphaId } })).length + 1,
        },
        null,
        2,
      ),
    )
    await writeFile(
      `${out}/persistence.json`,
      JSON.stringify(
        {
          alphaSubscribers: await find('subscribers', { site: { equals: alphaId } }),
          betaSubscribers: await find('subscribers', { site: { equals: betaId } }),
          suppressions: await find('suppressions'),
          capturedSubjects: captured.map((mail) => ({
            to: mail.to,
            subject: parsed(mail).headers.get('subject'),
          })),
        },
        null,
        2,
      ),
    )
    await page.screenshot({ path: `${out}/unsubscribed.png`, fullPage: true })
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
  await stopSink().catch(() => {})
  await browser.close()
  await payload.db.destroy()
}
console.log(`09A ${restartMode ? 'restart' : 'journey'}: ${checkCount} checks passed`)
process.exit(succeeded ? 0 : 1)
