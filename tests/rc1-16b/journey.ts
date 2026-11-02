/* eslint-disable @typescript-eslint/no-explicit-any -- isolated disposable PostgreSQL + local receiver harness acceptance */
/**
 * RC1 16B acceptance: webhooks, outbound delivery and reconciliation.
 *
 * Proves, against a disposable database and a local receiver harness (a
 * local test double — NOT a real-world provider):
 *  - outbound lifecycle through operator/API paths: subscription creation
 *    with endpoint verification, idempotent enqueue from execution events,
 *    signed delivery, truthful reconciliation, due-time gating;
 *  - failure handling: bounded retries with exponential backoff recorded on
 *    the delivery, dead-letter at the limit, subscription auto-disable,
 *    foreign-site denial, manual redelivery with a fresh idempotency key;
 *  - lost response: the receiver applies its effect then drops the first
 *    response; the retry is deduplicated by event id at the receiver, so
 *    the business effect stays exactly-once while delivery completes;
 *  - inbound email callbacks: signature required, replay deduplicated,
 *    wrong-site rejected, out-of-order (stale) callbacks recorded without
 *    regressing status or re-applying suppression, deferred never
 *    regresses a terminal status;
 *  - inbound commerce callbacks (deterministic test adapter): signature
 *    required, inbox + durable job applies the payment effect exactly
 *    once, replay answered from the inbox without a second effect;
 *  - inbound rate limiting: floods are shed with 429 + Retry-After before
 *    any processing, per route/provider key;
 *  - restart: queued and retrying deliveries persist across a web +
 *    PostgreSQL restart and drain afterwards with effects still exact-once.
 *
 * Operator sessions are fixture passkey sessions (createPasskeySession),
 * the same convention as the 15E/16A harnesses; no genuine passkey claim
 * is made. Failure-arc retries are invoked back-to-back through
 * deliverWebhook instead of waiting out the wall-clock backoff; the
 * recorded nextAttemptAt progression is asserted instead.
 */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createWriteStream, readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'

import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { recordExecutionEvent } from '../../src/modules/execution/service'
import {
  deliverWebhook,
  verifyWebhookDeliverySignature,
} from '../../src/modules/integrations/webhooks'

assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5432/rc116b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')

const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/16B'
const base = 'http://127.0.0.1:39066'
const receiverPort = 39166
const receiverBase = `http://127.0.0.1:${receiverPort}`
const restart = process.argv.includes('restart')
const trace: any[] = []
const bodies: string[] = []

const WH_SECRET = process.env.WEBHOOK_SECRET_RC116B_SUB!
const EMAIL_SECRET = process.env.EMAIL_WEBHOOK_SECRET!
const COMMERCE_SECRET = process.env.COMMERCE_TEST_WEBHOOK_SECRET!
const CANARIES = [WH_SECRET, EMAIL_SECRET, COMMERCE_SECRET]

const check = async (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify(trace, null, 2),
  )
}

const state: any = await readFile('scratch/rc116b/state.json', 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))
const save = () => writeFile('scratch/rc116b/state.json', JSON.stringify(state, null, 2))

let web: ChildProcess | undefined
let receiver: Server | undefined

// ---- Local receiver harness -------------------------------------------
// Modes: /ok applies the effect once per event id and answers 200;
// /flaky applies the effect then drops the first response per event id
// (endpoint-verification pings are always answered); /fail answers 500
// without processing; /mutable answers 500 while `mutableFails` is set,
// otherwise behaves like /ok. State persists to scratch so the restart
// phase observes the same receiver history.
type ReceiverHit = {
  path: string
  eventId: string | null
  eventType: string | null
  signatureValid: boolean
}
const receiverLogPath = 'scratch/rc116b/receiver-log.json'
const receiverState: {
  hits: ReceiverHit[]
  processed: string[]
  dropped: string[]
} = (() => {
  try {
    return JSON.parse(readFileSync(receiverLogPath, 'utf8'))
  } catch {
    return { hits: [], processed: [], dropped: [] }
  }
})()
let mutableFails = false
const persistReceiver = () => writeFileSync(receiverLogPath, JSON.stringify(receiverState, null, 2))
const hitsFor = (eventId: string) =>
  receiverState.hits.filter(
    (hit) => hit.eventId === eventId && hit.eventType !== 'webhook.endpoint.verify',
  )
const processedCount = (eventId: string) =>
  receiverState.processed.filter((id) => id === eventId).length
const applyEffect = (eventId: string | null) => {
  if (eventId && !receiverState.processed.includes(eventId)) receiverState.processed.push(eventId)
}

function startReceiver(): Promise<void> {
  receiver = createHttpServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      let parsed: any = {}
      try {
        parsed = JSON.parse(raw)
      } catch {}
      const eventId = typeof parsed?.id === 'string' ? parsed.id : null
      const eventType = typeof parsed?.type === 'string' ? parsed.type : null
      const signature = req.headers['x-renegade-signature']
      const signatureValid =
        typeof signature === 'string'
          ? verifyWebhookDeliverySignature({ raw, signature, secret: WH_SECRET }).valid
          : false
      receiverState.hits.push({ path: req.url ?? '', eventId, eventType, signatureValid })
      const isVerify = eventType === 'webhook.endpoint.verify'
      const path = (req.url ?? '').split('?')[0]
      const ok = () => {
        if (!isVerify) applyEffect(eventId)
        persistReceiver()
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ received: true }))
      }
      if (path === '/ok') return ok()
      if (path === '/flaky') {
        if (isVerify) return ok()
        if (eventId && !receiverState.dropped.includes(eventId)) {
          receiverState.dropped.push(eventId)
          applyEffect(eventId)
          persistReceiver()
          // Lost response: the effect is applied, the answer never arrives.
          req.socket.destroy()
          return
        }
        return ok()
      }
      if (path === '/fail') {
        persistReceiver()
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'receiver unavailable' }))
        return
      }
      if (path === '/mutable') {
        if (mutableFails) {
          persistReceiver()
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'receiver unavailable' }))
          return
        }
        return ok()
      }
      persistReceiver()
      res.writeHead(404)
      res.end()
    })
  })
  return new Promise((resolve) => receiver!.listen(receiverPort, '127.0.0.1', resolve))
}

async function stopReceiver(): Promise<void> {
  if (!receiver) return
  const server = receiver
  receiver = undefined
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

// ---- Shared helpers -----------------------------------------------------
async function session(id: string) {
  const user = await payload.findByID({ collection: 'users', id })
  const value = await createPasskeySession(
    user,
    process.env.PAYLOAD_SECRET!,
    async (sid, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sid, id, expires],
      )
    },
  )
  return `renegade-passkey=${value.token}`
}

async function api(
  path: string,
  options: { method?: string; cookie?: string; body?: unknown } = {},
): Promise<{ status: number; text: string; json: any }> {
  const response = await fetch(`${base}${path}`, {
    method: options.method || 'GET',
    redirect: 'manual',
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  bodies.push(text)
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: response.status, text, json }
}

async function rawPost(
  path: string,
  raw: string,
  headers: Record<string, string>,
): Promise<{ status: number; text: string; json: any; retryAfter: string | null }> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  })
  const text = await response.text()
  bodies.push(text)
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: response.status, text, json, retryAfter: response.headers.get('retry-after') }
}

async function bootWeb(logName: string): Promise<boolean> {
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '39066',
    ],
    { env: { ...process.env, NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const log = createWriteStream(`${out}/${logName}`)
  web.stdout!.pipe(log)
  web.stderr!.pipe(log)
  for (let attempt = 0; attempt < 240; attempt++) {
    try {
      const r = await fetch(`${base}/connections`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      })
      if (r.status === 307) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function stopWeb(): Promise<void> {
  if (web?.pid) {
    try {
      process.kill(web.pid)
    } catch {}
    web = undefined
    await new Promise((r) => setTimeout(r, 1500))
  }
}

const runJobs = async () => {
  await (payload.jobs as any).run({ allQueues: true })
}
const dispatchOutbox = async () => {
  await (payload.jobs as any).queue({
    task: 'execution-outbox-dispatch',
    input: {},
    queue: 'operations',
  })
  await runJobs()
  await runJobs()
}
const dispatchDeliveries = async () => {
  await (payload.jobs as any).queue({
    task: 'webhook-delivery-dispatch',
    input: {},
    queue: 'operations',
  })
  await runJobs()
}
const recordEvent = (eventType: string, key: string) =>
  recordExecutionEvent(payload, {
    siteId: state.alpha,
    tenantId: state.alpha,
    actor: { kind: 'service', id: 'rc1-16b-harness' },
    eventType: eventType as any,
    idempotencyKey: key,
    privacyClass: 'public',
    payload: { harness: 'rc1-16b', key },
  })
const findDeliveries = async (eventId: string) =>
  (
    await payload.find({
      collection: 'webhook-deliveries',
      where: { eventId: { equals: eventId } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs as any[]
const getDelivery = (id: string) =>
  payload.findByID({ collection: 'webhook-deliveries', id, depth: 0, overrideAccess: true })
const getSubscription = (id: string) =>
  payload.findByID({ collection: 'webhook-subscriptions', id, depth: 0, overrideAccess: true })
const reconciliationFor = (json: any, subscriptionId: string) =>
  (json?.webhookReconciliation ?? []).find(
    (entry: any) => String(entry.subscriptionId) === String(subscriptionId),
  )

const emailSign = (raw: string) =>
  createHmac('sha256', EMAIL_SECRET).update(raw).digest('base64url')
const commerceSign = (raw: string) =>
  createHmac('sha256', COMMERCE_SECRET).update(raw).digest('hex')
const emailEventsFor = async (deliveryId: string) =>
  (
    await payload.find({
      collection: 'email-delivery-events',
      where: { delivery: { equals: deliveryId } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs as any[]

try {
  await mkdir('scratch/rc116b', { recursive: true })
  await mkdir(out, { recursive: true })

  if (!restart) {
    // ---- Fixtures ------------------------------------------------------
    state.alpha = (
      await payload.create({
        collection: 'sites',
        data: { name: '16B Alpha', slug: '16b-alpha', lifecycle: 'active' },
      })
    ).id
    state.beta = (
      await payload.create({
        collection: 'sites',
        data: { name: '16B Beta', slug: '16b-beta', lifecycle: 'active' },
      })
    ).id
    const ownerUser = await payload.create({
      collection: 'users',
      data: { email: 'owner@16b.test', role: 'owner' },
    })
    state.owner = ownerUser.id
    const adminUser = await payload.create({
      collection: 'users',
      data: { email: 'admin@16b.test', role: 'administrator' },
    })
    state.admin = adminUser.id
    const ownerMember =
      typeof ownerUser.member === 'object' ? ownerUser.member.id : ownerUser.member
    const adminMember =
      typeof adminUser.member === 'object' ? adminUser.member.id : adminUser.member
    for (const site of [state.alpha, state.beta]) {
      await payload.create({
        collection: 'member-site-roles',
        data: { member: ownerMember, site, role: 'community-manager' },
      })
    }
    await payload.create({
      collection: 'member-site-roles',
      data: { member: adminMember, site: state.beta, role: 'moderator' },
    })
    await save()
  }

  const ownerCookie = await session(state.owner)
  const adminCookie = await session(state.admin)

  await startReceiver()
  const booted = await bootWeb(restart ? 'restart-web.log' : 'web.log')
  await check(
    `${restart ? 'restart: ' : ''}Next.js web process booted on ${base} (anonymous /connections redirects to login)`,
    booted,
  )

  if (!restart) {
    // ---- Anonymous + foreign-site gates --------------------------------
    const anon = await api(`/api/admin/integrations?siteId=${state.alpha}`)
    const foreignGet = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: adminCookie,
    })
    const foreignControl = await api(`/api/admin/integrations?siteId=${state.beta}`, {
      cookie: adminCookie,
    })
    await check(
      'anonymous (403) and foreign-site administrator (403) are denied the integrations API; the same administrator reads its own site (200)',
      anon.status === 403 && foreignGet.status === 403 && foreignControl.status === 200,
    )

    // ---- Subscription creation through the operator API -----------------
    const createSub = (target: string, events: string[]) =>
      api('/api/admin/integrations', {
        method: 'POST',
        cookie: ownerCookie,
        body: {
          action: 'create-webhook',
          siteId: state.alpha,
          target,
          secretRef: 'rc116b-sub',
          events,
        },
      })
    const subOkRes = await createSub(`${receiverBase}/ok`, ['content.created'])
    state.subOk = subOkRes.json?.subscription?.id
    const subFlakyRes = await createSub(`${receiverBase}/flaky`, ['content.updated'])
    state.subFlaky = subFlakyRes.json?.subscription?.id
    mutableFails = false
    const subMutableRes = await createSub(`${receiverBase}/mutable`, ['content.deleted'])
    state.subMutable = subMutableRes.json?.subscription?.id
    mutableFails = true
    await save()
    await check(
      'owner creates three webhook subscriptions through the operator API (201 each) after signed endpoint verification',
      subOkRes.status === 201 &&
        subFlakyRes.status === 201 &&
        subMutableRes.status === 201 &&
        Boolean(state.subOk && state.subFlaky && state.subMutable),
    )
    await check(
      'receiver observed a signature-valid endpoint-verification POST for each target',
      ['/ok', '/flaky', '/mutable'].every((path) =>
        receiverState.hits.some(
          (hit) =>
            hit.path === path && hit.eventType === 'webhook.endpoint.verify' && hit.signatureValid,
        ),
      ),
    )

    // ---- Outbound happy path -------------------------------------------
    const rec1: any = await recordEvent('content.created', 'evt-happy-1')
    const event1 = String(rec1.event.id)
    await dispatchOutbox()
    const queued1 = await findDeliveries(event1)
    await check(
      'recording an execution event enqueues exactly one queued delivery for the subscribed event type',
      rec1.duplicate === false &&
        queued1.length === 1 &&
        String(queued1[0].subscription) === String(state.subOk) &&
        queued1[0].state === 'queued',
    )
    const rec1Dup: any = await recordEvent('content.created', 'evt-happy-1')
    await dispatchOutbox()
    await check(
      're-recording the same event (same idempotency key) is a duplicate and enqueues no second delivery',
      rec1Dup.duplicate === true && (await findDeliveries(event1)).length === 1,
    )
    await dispatchDeliveries()
    const delivered1 = await getDelivery(queued1[0].id)
    await check(
      'dispatch delivers once: receiver got exactly one signature-valid POST and the delivery is delivered',
      delivered1.state === 'delivered' &&
        hitsFor(event1).length === 1 &&
        hitsFor(event1)[0].signatureValid === true &&
        processedCount(event1) === 1,
    )
    const center1 = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: ownerCookie,
    })
    const recon1 = reconciliationFor(center1.json, state.subOk)
    const webhookConnection1 = (center1.json?.connections ?? []).find(
      (c: any) => c.collection === 'webhook-subscriptions' && String(c.id) === String(state.subOk),
    )
    await check(
      'reconciliation reports the subscription healthy with one delivered record and a lastDeliveredAt taken from that record; the connection lastSuccessAt agrees',
      center1.status === 200 &&
        recon1?.healthy === true &&
        recon1?.counts?.delivered === 1 &&
        Boolean(recon1?.lastDeliveredAt) &&
        Boolean(webhookConnection1?.lastSuccessAt),
    )
    const page1 = await api('/connections', { cookie: ownerCookie })
    await check(
      'Connections page renders for the owner (200) with the webhook subscription present; the reconciliation panel itself renders client-side under the Webhooks tab from the same server-computed prop proven via the API above',
      page1.status === 200 && page1.text.includes('Webhook: /ok'),
    )

    // ---- Due-time gating --------------------------------------------------
    const rec2: any = await recordEvent('content.created', 'evt-due-1')
    const event2 = String(rec2.event.id)
    await dispatchOutbox()
    const queued2 = (await findDeliveries(event2))[0]
    await payload.update({
      collection: 'webhook-deliveries',
      id: queued2.id,
      data: { nextAttemptAt: new Date(Date.now() + 3600_000).toISOString() },
      overrideAccess: true,
    })
    await dispatchDeliveries()
    const notYet = await getDelivery(queued2.id)
    await check(
      'dispatch does not attempt a delivery whose nextAttemptAt is in the future',
      notYet.state === 'queued' && hitsFor(event2).length === 0,
    )
    await payload.update({
      collection: 'webhook-deliveries',
      id: queued2.id,
      data: { nextAttemptAt: new Date(Date.now() - 1000).toISOString() },
      overrideAccess: true,
    })
    await dispatchDeliveries()
    const dueNow = await getDelivery(queued2.id)
    await check(
      'once due, the same delivery is attempted and delivered',
      dueNow.state === 'delivered' && hitsFor(event2).length === 1,
    )

    // ---- Failure arc: bounded retries, dead-letter, auto-disable ---------
    const rec3: any = await recordEvent('content.deleted', 'evt-fail-1')
    const event3 = String(rec3.event.id)
    await dispatchOutbox()
    const failing = (await findDeliveries(event3))[0]
    state.deadDelivery = failing.id
    const progression: any[] = []
    for (let attempt = 1; attempt <= 5; attempt++) {
      const before = Date.now()
      await deliverWebhook(payload, failing.id)
      const current = await getDelivery(failing.id)
      progression.push({
        attempt,
        state: current.state,
        attempts: current.attempts,
        backoffSeconds: current.nextAttemptAt
          ? (Date.parse(current.nextAttemptAt) - before) / 1000
          : null,
      })
    }
    await check(
      'five failing attempts move the delivery retrying x4 then dead-letter, with recorded backoff growing ~30/60/120/240s (attempts invoked back-to-back; wall-clock backoff not waited out)',
      progression.slice(0, 4).every((p, i) => p.state === 'retrying' && p.attempts === i + 1) &&
        progression[4].state === 'dead-letter' &&
        progression[4].attempts === 5 &&
        progression.slice(0, 4).every((p, i) => {
          const expected = 30 * 2 ** i
          return (
            p.backoffSeconds !== null &&
            p.backoffSeconds > expected - 10 &&
            p.backoffSeconds < expected + 30
          )
        }),
    )
    const subAfterFail = await getSubscription(state.subMutable)
    await check(
      'at the failure limit the subscription is auto-disabled with failureCount 5, and the receiver saw exactly 5 signature-valid attempts',
      subAfterFail.status === 'disabled' &&
        Number(subAfterFail.failureCount) === 5 &&
        hitsFor(event3).length === 5 &&
        hitsFor(event3).every((hit) => hit.signatureValid),
    )
    const center2 = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: ownerCookie,
    })
    const recon2 = reconciliationFor(center2.json, state.subMutable)
    await check(
      'reconciliation flags the dead-letter as critical, reports no delivered success time, and marks the subscription unhealthy',
      recon2?.healthy === false &&
        recon2?.counts?.deadLetter === 1 &&
        recon2?.lastDeliveredAt === null &&
        (recon2?.findings ?? []).some(
          (f: any) => f.code === 'dead-letter-awaiting-action' && f.severity === 'critical',
        ),
    )

    // ---- Foreign-site denial on redeliver / toggle ------------------------
    const foreignRedeliver = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: adminCookie,
      body: { action: 'redeliver-webhook', deliveryId: state.deadDelivery },
    })
    const foreignToggle = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: adminCookie,
      body: { action: 'toggle-webhook', subscriptionId: state.subMutable, status: 'active' },
    })
    await check(
      'foreign-site administrator is denied redelivery (403) and re-enable (403); nothing new is persisted',
      foreignRedeliver.status === 403 &&
        foreignToggle.status === 403 &&
        (await findDeliveries(event3)).length === 1 &&
        (await getSubscription(state.subMutable)).status === 'disabled',
    )

    // ---- Manual redelivery with a fresh idempotency key -------------------
    const redeliver = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: { action: 'redeliver-webhook', deliveryId: state.deadDelivery },
    })
    const redelivered = redeliver.json?.delivery
    state.redeliveredDelivery = redelivered?.id
    const original = await getDelivery(state.deadDelivery)
    await check(
      'owner redelivers the dead-letter: 202, a NEW delivery row with a fresh idempotency key for the same event, queued',
      redeliver.status === 202 &&
        Boolean(redelivered) &&
        redelivered.id !== state.deadDelivery &&
        redelivered.idempotencyKey !== original.idempotencyKey &&
        redelivered.state === 'queued' &&
        String(redelivered.eventId) === event3,
    )
    const toggle = await api('/api/admin/integrations', {
      method: 'POST',
      cookie: ownerCookie,
      body: { action: 'toggle-webhook', subscriptionId: state.subMutable, status: 'active' },
    })
    mutableFails = false
    await dispatchDeliveries()
    const redeliveredAfter = await getDelivery(state.redeliveredDelivery)
    await check(
      'after re-enable and receiver recovery the redelivered delivery succeeds; the event effect applied exactly once at the receiver',
      toggle.status === 200 &&
        redeliveredAfter.state === 'delivered' &&
        hitsFor(event3).length === 6 &&
        processedCount(event3) === 1,
    )
    const center3 = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: ownerCookie,
    })
    const recon3 = reconciliationFor(center3.json, state.subMutable)
    await check(
      'reconciliation now treats the dead-letter as resolved history: subscription healthy again with delivered and dead-letter counts both visible',
      recon3?.healthy === true &&
        recon3?.counts?.deadLetter === 1 &&
        recon3?.counts?.delivered === 1,
    )

    // ---- Lost response: exactly-once business effect ----------------------
    const rec4: any = await recordEvent('content.updated', 'evt-flaky-1')
    const event4 = String(rec4.event.id)
    await dispatchOutbox()
    const flakyDelivery = (await findDeliveries(event4))[0]
    await deliverWebhook(payload, flakyDelivery.id)
    const afterDrop = await getDelivery(flakyDelivery.id)
    await check(
      'lost response: receiver applied the effect but the dropped answer leaves the delivery retrying with a recorded error',
      afterDrop.state === 'retrying' &&
        Number(afterDrop.attempts) === 1 &&
        Boolean(afterDrop.lastError) &&
        hitsFor(event4).length === 1 &&
        processedCount(event4) === 1,
    )
    await deliverWebhook(payload, flakyDelivery.id)
    const afterRetry = await getDelivery(flakyDelivery.id)
    await check(
      'retry completes the delivery; receiver saw 2 HTTP attempts but the business effect stayed exactly-once (deduped by event id)',
      afterRetry.state === 'delivered' &&
        hitsFor(event4).length === 2 &&
        processedCount(event4) === 1,
    )

    // ---- Inbound email callbacks ------------------------------------------
    const message = await payload.create({
      collection: 'email-messages',
      data: {
        site: state.alpha,
        subject: '16B Callback Fixture',
        purpose: 'newsletter',
        channel: 'email',
        language: 'en',
        kind: 'bulk',
        status: 'draft',
        blocks: [{ type: 'text', text: 'Fixture body' }],
      },
      overrideAccess: true,
    })
    const mkEmailDelivery = (suffix: string) =>
      payload.create({
        collection: 'email-deliveries',
        data: {
          message: message.id,
          recipientEmail: 'reader@16b.test',
          idempotencyKey: `email-del-16b-${suffix}`,
          status: 'accepted',
          provider: 'smtp-gateway',
          providerMessageId: `pm-16b-${suffix}`,
        },
        overrideAccess: true,
      })
    const ed1 = await mkEmailDelivery('1')
    const ed2 = await mkEmailDelivery('2')
    state.emailDelivery1 = ed1.id
    state.emailDelivery2 = ed2.id
    await save()
    const t = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()
    const emailBody = (overrides: Record<string, unknown>) =>
      JSON.stringify({
        siteId: state.alpha,
        email: 'reader@16b.test',
        providerMessageId: 'pm-16b-1',
        event: 'delivered',
        provider: 'smtp-gateway',
        ...overrides,
      })
    const postEmail = (raw: string, signature: string) =>
      rawPost('/api/email/webhook', raw, { 'x-audience-signature': signature })

    const mailRaw1 = emailBody({ providerEventId: 'evt-mail-1', occurredAt: t(50) })
    const mail1 = await postEmail(mailRaw1, emailSign(mailRaw1))
    const ed1After = await payload.findByID({
      collection: 'email-deliveries',
      id: ed1.id,
      overrideAccess: true,
    })
    await check(
      'valid signed email callback is accepted (200), the delivery status persists as delivered, and one event record exists',
      mail1.status === 200 &&
        mail1.json?.accepted === true &&
        ed1After.status === 'delivered' &&
        (await emailEventsFor(ed1.id)).length === 1,
    )
    const mailReplay = await postEmail(mailRaw1, emailSign(mailRaw1))
    await check(
      'exact replay of the same provider event is accepted without a second event record or re-applied effect',
      mailReplay.status === 200 && (await emailEventsFor(ed1.id)).length === 1,
    )
    const mailTampered = await postEmail(mailRaw1, emailSign(`${mailRaw1}x`))
    await check(
      'tampered signature is rejected 401 and records nothing',
      mailTampered.status === 401 && (await emailEventsFor(ed1.id)).length === 1,
    )
    const mailWrongSiteRaw = emailBody({
      siteId: state.beta,
      providerEventId: 'evt-mail-wrong-site',
      occurredAt: t(45),
    })
    const mailWrongSite = await postEmail(mailWrongSiteRaw, emailSign(mailWrongSiteRaw))
    await check(
      'a correctly signed callback naming the wrong site for the delivery is rejected 400 and records nothing',
      mailWrongSite.status === 400 && (await emailEventsFor(ed1.id)).length === 1,
    )
    const bounceRaw = emailBody({
      providerMessageId: 'pm-16b-2',
      event: 'bounce',
      providerEventId: 'evt-mail-2',
      occurredAt: t(30),
    })
    const bounce = await postEmail(bounceRaw, emailSign(bounceRaw))
    const ed2AfterBounce = await payload.findByID({
      collection: 'email-deliveries',
      id: ed2.id,
      overrideAccess: true,
    })
    const suppressions = await payload.find({
      collection: 'suppressions',
      where: { site: { equals: state.alpha } },
      depth: 0,
      overrideAccess: true,
    })
    await check(
      'in-order bounce applies: delivery bounced and a suppression is recorded for the site',
      bounce.status === 200 &&
        ed2AfterBounce.status === 'bounced' &&
        suppressions.docs.length === 1,
    )
    const staleRaw = emailBody({
      providerMessageId: 'pm-16b-2',
      event: 'delivered',
      providerEventId: 'evt-mail-3',
      occurredAt: t(40),
    })
    const stale = await postEmail(staleRaw, emailSign(staleRaw))
    const ed2AfterStale = await payload.findByID({
      collection: 'email-deliveries',
      id: ed2.id,
      overrideAccess: true,
    })
    await check(
      'out-of-order stale callback (delivered, occurred BEFORE the bounce) is recorded for history but does not regress the bounced status',
      stale.status === 200 &&
        (await emailEventsFor(ed2.id)).length === 2 &&
        ed2AfterStale.status === 'bounced',
    )
    const deferredRaw = emailBody({
      event: 'deferred',
      providerEventId: 'evt-mail-4',
      occurredAt: t(20),
    })
    const deferred = await postEmail(deferredRaw, emailSign(deferredRaw))
    const ed1AfterDeferred = await payload.findByID({
      collection: 'email-deliveries',
      id: ed1.id,
      overrideAccess: true,
    })
    await check(
      'a deferred callback never regresses a terminal delivered status, even with a newer timestamp',
      deferred.status === 200 &&
        ed1AfterDeferred.status === 'delivered' &&
        (await emailEventsFor(ed1.id)).length === 2,
    )

    // ---- Inbound commerce callbacks (deterministic test adapter) ----------
    const suffix = '16b'
    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: state.alpha,
        label: `16B Webhook Merchant ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    })
    const cart = await payload.create({
      collection: 'carts',
      data: {
        site: state.alpha,
        merchantConnection: merchant.id,
        currency: 'USD',
        items: [],
        state: 'active',
        version: 1,
      },
      overrideAccess: true,
    })
    const checkoutSession = await payload.create({
      collection: 'checkout-sessions',
      data: {
        site: state.alpha,
        merchantConnection: merchant.id,
        cart: cart.id,
        currency: 'USD',
        amountMinor: '2500',
        customerKey: `cust-key-${suffix}`,
        attempt: 1,
        bindingKey: `bind-${suffix}`,
        state: 'open',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      overrideAccess: true,
    })
    const intent = await payload.create({
      collection: 'payment-intents',
      data: {
        site: state.alpha,
        checkoutSession: checkoutSession.id,
        merchantConnection: merchant.id,
        capabilityId: 'deterministic-test-card',
        providerKey: 'deterministic-test',
        amountMinor: '2500',
        currency: 'USD',
        state: 'requires-action',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      overrideAccess: true,
    })
    const attempt = await payload.create({
      collection: 'payment-attempts',
      data: {
        site: state.alpha,
        merchantConnection: merchant.id,
        checkoutSession: checkoutSession.id,
        paymentIntent: intent.id,
        idempotencyKey: `attempt-${suffix}`,
        providerKey: 'deterministic-test',
        providerContractVersion: '1.0.0',
        providerImplementationVersion: '1.0.0',
        providerApiVersion: '1.0.0',
        state: 'action-required',
        amountMinor: '2500',
        currency: 'USD',
        attempt: 1,
        providerReference: `det_ref_${suffix}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        processedEventIds: [],
      },
      overrideAccess: true,
    })
    state.paymentAttempt = attempt.id
    await save()
    const commerceBody = (overrides: Record<string, unknown>) =>
      JSON.stringify({
        providerEventId: 'evt_pay_16b_1',
        occurredAt: new Date().toISOString(),
        providerReference: `det_ref_${suffix}`,
        kind: 'succeeded',
        amountMinor: '2500',
        currency: 'USD',
        sanitizedEvidence: { attemptId: String(attempt.id) },
        ...overrides,
      })
    const postCommerce = (raw: string, signature?: string) =>
      rawPost(
        '/api/commerce/webhooks/deterministic-test',
        raw,
        signature ? { 'x-commerce-signature': signature } : {},
      )
    const inboxFor = async (providerEventId: string) =>
      (
        await payload.find({
          collection: 'payment-webhook-events',
          where: { providerEventId: { equals: providerEventId } },
          depth: 0,
          overrideAccess: true,
        })
      ).docs as any[]

    const payRaw = commerceBody({})
    const unsigned = await postCommerce(payRaw)
    await check(
      'unsigned commerce callback is rejected 401 and no inbox record is created',
      unsigned.status === 401 && (await inboxFor('evt_pay_16b_1')).length === 0,
    )
    const payValid = await postCommerce(payRaw, commerceSign(payRaw))
    await check(
      'valid signed commerce callback is accepted 202 with exactly one durable inbox record',
      payValid.status === 202 && (await inboxFor('evt_pay_16b_1')).length === 1,
    )
    await runJobs()
    const attemptAfter = await payload.findByID({
      collection: 'payment-attempts',
      id: attempt.id,
      overrideAccess: true,
    })
    await check(
      'the durable payment job applies the effect exactly once: attempt succeeded with the event id recorded once',
      attemptAfter.state === 'succeeded' &&
        (attemptAfter.processedEventIds ?? []).filter((id: string) => id === 'evt_pay_16b_1')
          .length === 1,
    )
    await runJobs()
    const payReplay = await postCommerce(payRaw, commerceSign(payRaw))
    const attemptAfterReplay = await payload.findByID({
      collection: 'payment-attempts',
      id: attempt.id,
      overrideAccess: true,
    })
    await check(
      'replayed commerce callback is answered as a replay (200) with no second inbox record and no re-applied effect',
      payReplay.status === 200 &&
        payReplay.json?.replay === true &&
        (await inboxFor('evt_pay_16b_1')).length === 1 &&
        attemptAfterReplay.state === 'succeeded' &&
        (attemptAfterReplay.processedEventIds ?? []).filter((id: string) => id === 'evt_pay_16b_1')
          .length === 1,
    )
    const unknownRaw = commerceBody({
      providerEventId: 'evt_pay_16b_2',
      sanitizedEvidence: { attemptId: 'missing-attempt' },
    })
    const unknownAttempt = await postCommerce(unknownRaw, commerceSign(unknownRaw))
    await check(
      'a valid signed callback for an unknown attempt is accepted as uncorrelated (202) without crashing or applying an effect',
      unknownAttempt.status === 202,
    )
    const badSig = await postCommerce(payRaw, 'deadbeef')
    await check('bad-signature commerce callback is rejected 401', badSig.status === 401)

    // ---- Inbound rate limiting (last: it exhausts the per-key budgets) -----
    let email429: { status: number; retryAfter: string | null } | null = null
    for (let i = 0; i < 60 && !email429; i++) {
      const res = await postEmail(mailRaw1, 'deadbeef')
      if (res.status === 429) email429 = res
    }
    const mailRlRaw = emailBody({ providerEventId: 'evt-mail-ratelimit', occurredAt: t(10) })
    const mailLimited = await postEmail(mailRlRaw, emailSign(mailRlRaw))
    await check(
      'email webhook flood is shed with 429 + Retry-After, and a valid callback during the limit window is not processed (no event recorded)',
      email429 !== null &&
        Boolean(email429.retryAfter) &&
        mailLimited.status === 429 &&
        (await emailEventsFor(ed1.id)).length === 2,
    )
    let commerce429: { status: number; retryAfter: string | null } | null = null
    for (let i = 0; i < 60 && !commerce429; i++) {
      const res = await postCommerce(payRaw, 'deadbeef')
      if (res.status === 429) commerce429 = res
    }
    const payRlRaw = commerceBody({ providerEventId: 'evt_pay_16b_3' })
    const payLimited = await postCommerce(payRlRaw, commerceSign(payRlRaw))
    await check(
      'commerce webhook flood is shed with 429 + Retry-After on its own per-provider budget, and a valid callback during the window creates no inbox record',
      commerce429 !== null &&
        Boolean(commerce429.retryAfter) &&
        payLimited.status === 429 &&
        (await inboxFor('evt_pay_16b_3')).length === 0,
    )

    // ---- Restart setup: one queued + one retrying delivery -----------------
    const rec5: any = await recordEvent('content.created', 'evt-restart-queued')
    state.restartQueuedEvent = String(rec5.event.id)
    const rec6: any = await recordEvent('content.updated', 'evt-restart-retry')
    state.restartRetryEvent = String(rec6.event.id)
    await dispatchOutbox()
    const queuedDelivery = (await findDeliveries(state.restartQueuedEvent))[0]
    state.restartQueuedDelivery = queuedDelivery.id
    const retryDelivery = (await findDeliveries(state.restartRetryEvent))[0]
    state.restartRetryDelivery = retryDelivery.id
    await deliverWebhook(payload, retryDelivery.id)
    const retryBefore = await getDelivery(retryDelivery.id)
    state.restartRetryNextAttemptAt = retryBefore.nextAttemptAt
    await save()
    await check(
      'restart setup persists: one delivery queued untouched, one retrying after a lost response with a future nextAttemptAt',
      queuedDelivery.state === 'queued' &&
        retryBefore.state === 'retrying' &&
        Number(retryBefore.attempts) === 1 &&
        Date.parse(retryBefore.nextAttemptAt) > Date.now() &&
        processedCount(state.restartRetryEvent) === 1,
    )

    await stopWeb()
    const webLog = await readFile(`${out}/web.log`, 'utf8').catch(() => '')
    const joined = bodies.join('\n')
    await check(
      'no harness secret appears in any journey-phase response body, page HTML, or the web log',
      CANARIES.every((canary) => !joined.includes(canary) && !webLog.includes(canary)),
    )
    console.log(`\nJOURNEY ACCEPTANCE PASSED: ${trace.length} checks exit 0`)
  } else {
    // ---- Restart phase ------------------------------------------------------
    const queuedBefore = await getDelivery(state.restartQueuedDelivery)
    const retryBefore = await getDelivery(state.restartRetryDelivery)
    await check(
      'restart: queued and retrying deliveries persisted unchanged across the web + PostgreSQL restart',
      queuedBefore.state === 'queued' &&
        retryBefore.state === 'retrying' &&
        Number(retryBefore.attempts) === 1 &&
        String(retryBefore.nextAttemptAt) === String(state.restartRetryNextAttemptAt),
    )
    const subOkAfter = await getSubscription(state.subOk)
    await check(
      'restart: subscription records persisted unchanged (active, truthful failure counts)',
      subOkAfter.status === 'active' && Number(subOkAfter.failureCount) === 0,
    )
    const deadline = Date.now() + 180_000
    let due = false
    while (Date.now() < deadline) {
      const current = await getDelivery(state.restartRetryDelivery)
      if (Date.parse(current.nextAttemptAt) <= Date.now()) {
        due = true
        break
      }
      await new Promise((r) => setTimeout(r, 5000))
    }
    await check('restart: the retrying delivery reaches its recorded due time', due)
    await dispatchDeliveries()
    const queuedAfter = await getDelivery(state.restartQueuedDelivery)
    const retryAfter = await getDelivery(state.restartRetryDelivery)
    await check(
      'restart: dispatch after restart delivers both the queued and the previously retrying delivery',
      queuedAfter.state === 'delivered' &&
        retryAfter.state === 'delivered' &&
        Number(retryAfter.attempts) === 2,
    )
    await check(
      'restart: receiver history spans the restart — retry event saw 2 HTTP attempts total with the business effect still exactly-once; queued event delivered exactly once',
      hitsFor(state.restartRetryEvent).length === 2 &&
        processedCount(state.restartRetryEvent) === 1 &&
        hitsFor(state.restartQueuedEvent).length === 1 &&
        processedCount(state.restartQueuedEvent) === 1,
    )
    const ownerCookie2 = ownerCookie
    const center = await api(`/api/admin/integrations?siteId=${state.alpha}`, {
      cookie: ownerCookie2,
    })
    const reconFlaky = reconciliationFor(center.json, state.subFlaky)
    await check(
      'restart: reconciliation reflects the drained state truthfully for the flaky subscription',
      center.status === 200 &&
        reconFlaky?.healthy === true &&
        reconFlaky?.counts?.delivered >= 2 &&
        Boolean(reconFlaky?.lastDeliveredAt),
    )
    await stopWeb()
    const webLog = await readFile(`${out}/restart-web.log`, 'utf8').catch(() => '')
    const joined = bodies.join('\n')
    await check(
      'no harness secret appears in any restart-phase response body or the restart web log',
      CANARIES.every((canary) => !joined.includes(canary) && !webLog.includes(canary)),
    )
    console.log(`\nRESTART ACCEPTANCE PASSED: ${trace.length} checks exit 0`)
  }
} catch (error) {
  console.error('16B harness failure:', error)
  process.exitCode = 1
} finally {
  await stopReceiver().catch(() => {})
  await stopWeb().catch(() => {})
  // Give the killed web child a moment to release the port, then exit
  // explicitly: the Payload DB pool would otherwise hold the process open.
  await new Promise((r) => setTimeout(r, 500))
  process.exit(process.exitCode ?? 0)
}
