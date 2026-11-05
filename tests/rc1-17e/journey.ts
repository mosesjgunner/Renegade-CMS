/* eslint-disable @typescript-eslint/no-explicit-any -- isolated interruption-recovery acceptance harness */
// RC1 17E — interruption recovery, deduplication and job integrity.
// Real web/worker processes are SIGKILLed at five boundaries (publication
// lease, message dispatch, payment settle, subscription grant, fulfillment
// transition) against isolated provider harnesses. Pending and failed state
// is created only through ordinary product actions; success is never written
// into the database by hand. Effects are counted at the provider harness and
// in persisted business rows.
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import sharp from 'sharp'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { issueMagicLink, consumeMagicLink } from '../../src/modules/identity/member-identity'
import {
  createEditorialArticle,
  requestEditorialReview,
  decideEditorialReview,
  scheduleEditorialPublication,
  loadBundleByArticleId,
} from '../../src/modules/editorial/persistence'
import { executeScheduledPublishJob } from '../../src/modules/editorial/scheduler'
import { recoverStaleCommerceJobs } from '../../src/modules/commerce/tasks'
import { reconcileOutstandingFulfillmentOrders } from '../../src/modules/commerce/fulfillment-operator'
import { recoverEmailOutbox, emailDeliveryTask } from '../../src/modules/audience/tasks'
import { localMailSinkReceipts, resetLocalMailSink } from '../../src/modules/email/delivery'
import { signedLocalPaymentEvent } from '../../src/modules/commerce/local-test-checkout'
import { encryptCredential } from '../../src/modules/commerce/pod-connection'
import { EMULATOR_CAPABILITIES } from '../../src/modules/commerce/pod-emulator'

assert.equal(process.env.RC117E_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5432/rc117e_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(process.env.COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED, 'true')

const section = process.argv[2]
const out = 'docs/rc/evidence/rc1/18-pass/17E'
const base = 'http://127.0.0.1:39075'
const scratch = 'scratch/rc117e'
await mkdir(out, { recursive: true })
await mkdir(scratch, { recursive: true })

const trace: string[] = []
function check(name: string, value: unknown) {
  assert.ok(value, name)
  trace.push(name)
  console.log(`PASS ${trace.length}: ${name}`)
}
async function saveTrace() {
  await writeFile(
    `${out}/trace-${section}.json`,
    JSON.stringify({ section, passed: trace.length, checks: trace }, null, 2),
  )
}

const payload: any = await getPayload({ config })
const row = (collection: string, id: string) =>
  payload.findByID({ collection, id, depth: 0, overrideAccess: true })
const find = async (collection: string, where: any) =>
  (await payload.find({ collection, where, depth: 0, limit: 100, overrideAccess: true })).docs
const id = (v: any) => String(v?.id ?? v ?? '')

let state: any = {}
try {
  state = JSON.parse(await readFile(`${scratch}/state.json`, 'utf8'))
} catch {}
const saveState = () => writeFile(`${scratch}/state.json`, JSON.stringify(state, null, 2))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(name: string, fn: () => Promise<boolean>, timeoutMs = 120000, stepMs = 500) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return
    await sleep(stepMs)
  }
  throw new Error(`Timeout: ${name}`)
}

// ---------------------------------------------------------------- HTTP utils
function request(route: string, cookie = '', method = 'GET', body?: any, headers: any = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: {
      origin: base,
      ...(cookie ? { cookie } : {}),
      ...(body &&
      !(body instanceof FormData) &&
      !(body instanceof URLSearchParams) &&
      typeof body !== 'string'
        ? { 'content-type': 'application/json' }
        : {}),
      ...headers,
    },
    body:
      body instanceof FormData || body instanceof URLSearchParams || typeof body === 'string'
        ? body
        : body
          ? JSON.stringify(body)
          : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(240000),
  })
}
async function json(
  route: string,
  cookie = '',
  method = 'GET',
  body?: any,
  expected = 200,
  headers: any = {},
) {
  const response = await request(route, cookie, method, body, headers)
  const text = await response.text()
  assert.equal(response.status, expected, `${method} ${route}: ${text.slice(0, 1200)}`)
  return JSON.parse(text)
}
/** Minimal cookie jar for guest cart/checkout flows. */
class Jar {
  cookies = new Map<string, string>()
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  async call(route: string, method = 'GET', body?: any, expected = 200) {
    const response = await request(route, this.header(), method, body)
    for (const set of (response.headers as any).getSetCookie?.() ?? []) {
      const [pair] = set.split(';')
      const eq = pair.indexOf('=')
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
    const text = await response.text()
    assert.equal(response.status, expected, `${method} ${route}: ${text.slice(0, 1200)}`)
    return text ? JSON.parse(text) : {}
  }
}

async function operatorSession(user: any) {
  const value = await createPasskeySession(
    user,
    loadConfig().payloadSecret,
    async (sid, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sid, user.id, expires],
      )
    },
  )
  return `renegade-passkey=${value.token}`
}

// ------------------------------------------------------------- child control
const children: ChildProcess[] = []
function spawnLogged(
  label: string,
  args: string[],
  env: Record<string, string> = {},
  importPreload = false,
) {
  const child = spawn(
    process.execPath,
    [...(importPreload ? ['--import', './tests/rc1-17e/stripe-preload.mjs'] : []), ...args],
    { env: { ...process.env, ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const log = createWriteStream(`${out}/${label}.log`)
  child.stdout!.pipe(log, { end: false })
  child.stderr!.pipe(log, { end: false })
  children.push(child)
  return child
}
async function killGroup(child: ChildProcess, signal: NodeJS.Signals = 'SIGKILL') {
  if (!child.pid) return
  try {
    process.kill(-child.pid, signal)
  } catch {}
  await Promise.race([new Promise((r) => child.once('exit', r)), sleep(10000)])
}
async function startWeb(label = 'web', preload = true, env: Record<string, string> = {}) {
  const web = spawnLogged(
    label,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39075'],
    env,
    preload,
  )
  await until(
    'web readiness',
    async () => {
      try {
        return (await request('/api/catalog')).status < 500
      } catch {
        return false
      }
    },
    240000,
    1000,
  )
  return web
}
function startWorker(label: string, env: Record<string, string> = {}) {
  return spawnLogged(
    label,
    ['--import', 'tsx', 'src/scripts/run-jobs-worker.ts'],
    {
      WORKER_POLL_INTERVAL_MS: '1000',
      WORKER_HEARTBEAT_FILE: `${scratch}/heartbeat-${label}.json`,
      ...env,
    },
    true,
  )
}
function startChild(label: string, childArgs: string[], preload = false) {
  return spawnLogged(
    label,
    ['--import', 'tsx', 'tests/rc1-17e/child.ts', ...childArgs],
    {},
    preload,
  )
}
async function stopAll() {
  for (const child of children.splice(0)) await killGroup(child).catch(() => undefined)
}

// ------------------------------------------------------------ stripe harness
const stripe = {
  calls: [] as any[],
  sessions: new Map<string, any>(),
  sessionsByKey: new Map<string, any>(),
  subscriptions: new Map<string, any>(),
  blockSubscriptions: false,
  subscriptionBlocked: false,
  dropNextPaymentSessionCreate: false,
  seq: 0,
}
function startStripeHarness() {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer))
    const form = new URLSearchParams(Buffer.concat(chunks).toString())
    const url = req.url ?? ''
    const call = {
      method: req.method,
      path: url,
      idempotencyKey: req.headers['idempotency-key'] ?? null,
    }
    stripe.calls.push(call)
    const sendJson = (value: any, status = 200) => {
      res.setHeader('content-type', 'application/json')
      res.writeHead(status)
      res.end(JSON.stringify(value))
    }
    if (url === '/v1/balance') return sendJson({})
    if (url.startsWith('/v1/prices/'))
      return sendJson({
        active: true,
        unit_amount: 1200,
        currency: 'usd',
        recurring: { interval: 'month', interval_count: 1 },
      })
    if (url === '/v1/checkout/sessions' && req.method === 'POST') {
      const key = String(req.headers['idempotency-key'] ?? '')
      if (key && stripe.sessionsByKey.has(key)) return sendJson(stripe.sessionsByKey.get(key))
      const mode = form.get('mode')
      if (mode === 'subscription') {
        const sub = {
          id: 'sub_17e',
          object: 'subscription',
          customer: 'cus_17e',
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000) - 2,
          current_period_end: Math.floor(Date.now() / 1000) + 2592000,
          cancel_at_period_end: false,
          items: {
            data: [{ id: 'si_17e', price: { id: form.get('line_items[0][price]') } }],
          },
          metadata: {
            renegade_member_id: form.get('subscription_data[metadata][renegade_member_id]') ?? '',
          },
        }
        stripe.subscriptions.set(sub.id, sub)
        const sessionObj = {
          id: 'cs_17e_sub',
          customer: sub.customer,
          subscription: sub.id,
          url: 'http://127.0.0.1:39098/pay',
        }
        if (key) stripe.sessionsByKey.set(key, sessionObj)
        stripe.sessions.set(sessionObj.id, sessionObj)
        return sendJson(sessionObj)
      }
      // mode=payment (hosted checkout)
      stripe.seq += 1
      const sessionObj = {
        id: `cs_17e_pay_${stripe.seq}`,
        object: 'checkout.session',
        payment_status: 'unpaid',
        status: 'open',
        amount_total: Number(form.get('line_items[0][price_data][unit_amount]') ?? 0),
        currency: String(form.get('line_items[0][price_data][currency]') ?? 'usd'),
        url: 'http://127.0.0.1:39098/pay',
        payment_intent: `pi_17e_${stripe.seq}`,
        expires_at: Number(form.get('expires_at') ?? 0),
      }
      if (key) stripe.sessionsByKey.set(key, sessionObj)
      stripe.sessions.set(sessionObj.id, sessionObj)
      if (stripe.dropNextPaymentSessionCreate) {
        stripe.dropNextPaymentSessionCreate = false
        ;(call as any).droppedAfterCreate = true
        req.socket.destroy()
        return
      }
      return sendJson(sessionObj)
    }
    if (url.startsWith('/v1/checkout/sessions/')) {
      const found = stripe.sessions.get(url.slice('/v1/checkout/sessions/'.length))
      return found ? sendJson(found) : sendJson({ error: { message: 'not found' } }, 404)
    }
    if (url.startsWith('/v1/subscriptions/')) {
      if (stripe.blockSubscriptions) {
        stripe.subscriptionBlocked = true
        return // lost response: never answer; caller is killed or times out
      }
      const found = stripe.subscriptions.get(url.slice('/v1/subscriptions/'.length))
      return found ? sendJson(found) : sendJson({ error: { message: 'not found' } }, 404)
    }
    if (url.startsWith('/v1/invoices/'))
      return sendJson({
        id: url.slice('/v1/invoices/'.length),
        object: 'invoice',
        subscription: 'sub_17e',
        amount_paid: 1200,
        currency: 'usd',
        status: 'paid',
      })
    if (url === '/v1/billing_portal/sessions')
      return sendJson({ url: 'http://127.0.0.1:39098/portal' })
    return sendJson({ error: { message: `unhandled ${url}` } }, 404)
  })
  return new Promise<typeof server>((resolve) =>
    server.listen(39098, '127.0.0.1', () => resolve(server)),
  )
}
let eventClock = Math.floor(Date.now() / 1000)
const nextEventTime = () => (eventClock = Math.max(eventClock + 1, Math.floor(Date.now() / 1000)))
async function signedStripe(eventId: string, type: string, object: any, expected = 202) {
  const raw = JSON.stringify({
    id: eventId,
    type,
    created: nextEventTime(),
    livemode: false,
    data: { object },
  })
  const t = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', process.env.COMMERCE_STRIPE_TEST_WEBHOOK_SECRET!)
    .update(`${t}.${raw}`)
    .digest('hex')
  const response = await request('/api/commerce/webhooks/stripe-test', '', 'POST', raw, {
    'content-type': 'application/json',
    'stripe-signature': `t=${t},v1=${sig}`,
  })
  const text = await response.text()
  assert.equal(response.status, expected, `webhook ${eventId}: ${text.slice(0, 800)}`)
  return text ? JSON.parse(text) : {}
}

// -------------------------------------------------------------- base fixture
async function ensureBase() {
  if (state.base) return state
  const stamp = '17e'
  const site = await payload.create({
    collection: 'sites',
    data: { name: '17E Site', slug: `site${stamp}`, lifecycle: 'active' },
  })
  const owner = await payload.create({
    collection: 'users',
    data: { email: `owner@${stamp}.test`, role: 'owner' },
  })
  const staff = await payload.create({
    collection: 'users',
    data: { email: `staff@${stamp}.test`, role: 'staff' },
  })
  const member = await consumeMagicLink(
    payload,
    (await issueMagicLink(payload, `buyer@${stamp}.test`)).token!,
  )
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: base,
      canonicalOriginsBySite: { [site.id]: base },
      launchState: 'live',
      adminExperience: { optionalCapabilities: { commerceCheckout: true } },
    },
  })
  const merchantDet = await payload.create({
    collection: 'merchant-connections',
    data: {
      site: site.id,
      label: '17E deterministic payments',
      providerKey: 'deterministic-test',
      merchantCountry: 'US',
      status: 'active',
    },
  })
  const capabilityDet = await payload.create({
    collection: 'payment-method-capabilities',
    data: {
      site: site.id,
      merchantConnection: merchantDet.id,
      providerKey: 'deterministic-test',
      railKey: '17e-card',
      family: 'card',
      flow: 'hosted',
      merchantCountries: ['US'],
      buyerCountries: ['US'],
      presentmentCurrencies: ['USD'],
      settlementCurrencies: ['USD'],
      recurring: false,
      refunds: true,
      enabled: true,
      health: 'healthy',
    },
  })
  const merchantStripe = await payload.create({
    collection: 'merchant-connections',
    data: {
      site: site.id,
      label: '17E stripe harness payments',
      providerKey: 'stripe-test',
      merchantCountry: 'US',
      status: 'active',
    },
  })
  const capabilityStripe = await payload.create({
    collection: 'payment-method-capabilities',
    data: {
      site: site.id,
      merchantConnection: merchantStripe.id,
      providerKey: 'stripe-test',
      railKey: '17e-stripe-card',
      family: 'card',
      flow: 'hosted',
      merchantCountries: ['US'],
      buyerCountries: ['US'],
      presentmentCurrencies: ['USD'],
      settlementCurrencies: ['USD'],
      recurring: true,
      refunds: true,
      enabled: true,
      health: 'healthy',
    },
  })
  const publication = await payload.create({
    collection: 'publications',
    data: { site: site.id, name: '17E Publication', slug: `pub${stamp}`, status: 'active' },
  })
  const author = await payload.create({
    collection: 'authors',
    data: { displayName: '17E Author', slug: `author${stamp}` },
  })
  state.base = {
    site: site.id,
    owner: owner.id,
    staff: staff.id,
    memberId: member!.memberId,
    memberToken: member!.sessionToken,
    merchantDet: merchantDet.id,
    capabilityDet: capabilityDet.id,
    merchantStripe: merchantStripe.id,
    capabilityStripe: capabilityStripe.id,
    publication: publication.id,
    author: author.id,
  }
  await saveState()
  return state
}
const memberCookie = () =>
  `renegade-member=${state.base.memberToken}; renegade-member-csrf=rc117e-csrf`

async function makeArticle(suffix: string, title: string) {
  const created = await createEditorialArticle(payload, {
    siteId: state.base.site,
    publicationId: state.base.publication,
    title,
    slug: `art17e-${suffix}`,
    canonicalPath: `/articles/art17e-${suffix}`,
    summary: `17E ${suffix} article`,
    authorIds: [state.base.author],
    actor: { id: state.base.author, role: 'author' },
    sourceMarkdown: `# ${title}\n\nBody for ${suffix}.`,
  })
  const articleId = id(created.article.id)
  await requestEditorialReview(payload, {
    articleId,
    actor: { id: state.base.author, role: 'author' },
  })
  await decideEditorialReview(payload, {
    articleId,
    actor: { id: 'user-editor-17e', role: 'editor' },
    approved: 'approved',
    comment: 'Approved in 17E harness',
  })
  return articleId
}

// ------------------------------------------------------- publication section
async function publicationSection() {
  await ensureBase()
  const owner = await row('users', state.base.owner)
  const operator = await operatorSession(owner)
  void operator
  const articleId = await makeArticle('crash', '17E Crash Lease Article')
  const past = new Date(Date.now() - 60000).toISOString()
  await scheduleEditorialPublication(payload, {
    articleId,
    actor: { id: state.base.owner, role: 'publisher' },
    actorUserId: state.base.owner,
    scheduledFor: past,
    timeZone: 'UTC',
    idempotencyKey: '17e-pub-crash',
  })
  const job = (
    await find('scheduled-publish-jobs', { idempotencyKey: { equals: '17e-pub-crash' } })
  )[0]
  check(
    'schedule created a queued lease job through the editorial service',
    job?.status === 'queued',
  )
  const bundle = await loadBundleByArticleId(payload, articleId)
  const contentId = id(bundle.content.id)

  // Crash at the publication lease: a child executor takes the lease, then
  // blocks inside publishScheduledArticle on the publication advisory lock
  // held by this parent process; the parent SIGKILLs it mid-publish.
  const lockClient = await payload.db.pool.connect()
  await lockClient.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
    `publication:${contentId}`,
  ])
  const child = startChild('pub-crash', ['publish-job', String(job.id), 'worker-A', '3'])
  await until('child holds the publication lease', async () => {
    const current = await row('scheduled-publish-jobs', job.id)
    return current.status === 'processing' && current.leaseOwner === 'worker-A'
  })
  check('child executor acquired the lease (status processing, owner worker-A)', true)
  check('child still alive while blocked inside publish', child.exitCode === null)
  await killGroup(child)
  const afterKill = await loadBundleByArticleId(payload, articleId)
  check(
    'killed mid-publish: article was NOT published and no partial publication persisted',
    id(afterKill.article.latestPublishedRevision) !== id(job.revision) &&
      afterKill.article.lifecycle !== 'published',
  )
  const leasedRow = await row('scheduled-publish-jobs', job.id)
  check(
    'job remains truthfully processing under the dead worker lease',
    leasedRow.status === 'processing' && leasedRow.leaseOwner === 'worker-A',
  )
  await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
    `publication:${contentId}`,
  ])
  lockClient.release()

  const refused = await executeScheduledPublishJob(payload, String(job.id), {
    workerId: 'worker-B',
    leaseDurationSeconds: 3,
  })
  check(
    'a second worker is refused while the lease is still valid',
    refused.success === false && /leased by worker/.test(String(refused.error)),
  )
  await until('dead worker lease expires', async () => {
    const current = await row('scheduled-publish-jobs', job.id)
    return Date.parse(current.leaseExpiresAt) < Date.now()
  })

  const web = await startWeb('pub-web')
  const reconcile1 = await json('/api/admin/schedule-health', '', 'POST', {
    action: 'reconcile',
  })
  check('operator schedule-health reconcile ran the recovery sweep', reconcile1.ok === true)
  const doneJob = await row('scheduled-publish-jobs', job.id)
  const doneBundle = await loadBundleByArticleId(payload, articleId)
  check(
    'after lease expiry the job completes and publishes exactly the pinned revision',
    doneJob.status === 'completed' &&
      id(doneBundle.article.latestPublishedRevision) === id(job.revision),
  )
  const render = await request(`/articles/art17e-crash`)
  const renderText = await render.text()
  check(
    'published article renders publicly after recovery',
    render.status === 200 && renderText.includes('17E Crash Lease Article'),
  )
  await json('/api/admin/schedule-health', '', 'POST', { action: 'reconcile' })
  const stillDone = await loadBundleByArticleId(payload, articleId)
  check(
    're-running reconcile does not republish (single publication effect)',
    id(stillDone.article.latestPublishedRevision) === id(job.revision) &&
      (await row('scheduled-publish-jobs', job.id)).status === 'completed',
  )
  await payload.jobs.run({ queue: 'operations', limit: 50 })
  const payloadJob = (
    await find('payload-jobs', { taskSlug: { equals: 'editorial-publish' } })
  ).find((j: any) => j.input?.key === '17e-pub-crash')
  check(
    'the queued Payload publish job drains as an idempotent no-op after lease recovery',
    Boolean(payloadJob?.completedAt) &&
      id((await loadBundleByArticleId(payload, articleId)).article.latestPublishedRevision) ===
        id(job.revision),
  )

  // Failed state through a normal action: hero media without approved rights
  // makes publication fail; retries exhaust; operator retry repairs it.
  const asset = await payload.create({
    collection: 'media-assets',
    data: {
      site: state.base.site,
      title: '17E gated artwork',
      kind: 'image',
      rightsStatus: 'pending',
      publicPolicy: 'published-use',
    },
  })
  const article2 = await makeArticle('gated', '17E Rights Gated Article')
  const bundle2 = await loadBundleByArticleId(payload, article2)
  await payload.update({
    collection: 'content',
    id: id(bundle2.content.id),
    data: { heroMedia: asset.id },
    overrideAccess: true,
  })
  await scheduleEditorialPublication(payload, {
    articleId: article2,
    actor: { id: state.base.owner, role: 'publisher' },
    actorUserId: state.base.owner,
    scheduledFor: past,
    timeZone: 'UTC',
    idempotencyKey: '17e-pub-gated',
  })
  const job2 = (
    await find('scheduled-publish-jobs', { idempotencyKey: { equals: '17e-pub-gated' } })
  )[0]
  let lastResult: any
  for (let i = 0; i < 3; i++)
    lastResult = await executeScheduledPublishJob(payload, String(job2.id), {
      workerId: 'worker-C',
      leaseDurationSeconds: 5,
    })
  const failedJob = await row('scheduled-publish-jobs', job2.id)
  check(
    'publication failure through the rights gate retries then lands in failed state with a sanitized error',
    lastResult.success === false &&
      failedJob.status === 'failed' &&
      failedJob.retryCount === 3 &&
      /Rights approval/.test(String(failedJob.lastError)) &&
      id((await loadBundleByArticleId(payload, article2)).article.latestPublishedRevision) !==
        id(job2.revision),
  )
  await json('/api/admin/schedule-health', '', 'POST', { action: 'retry', jobId: String(job2.id) })
  const resetJob = await row('scheduled-publish-jobs', job2.id)
  check(
    'operator retry resets the failed job truthfully (queued, retryCount 0, lease cleared)',
    resetJob.status === 'queued' && resetJob.retryCount === 0 && !resetJob.leaseOwner,
  )
  await payload.update({
    collection: 'media-assets',
    id: asset.id,
    data: { rightsStatus: 'approved' },
    overrideAccess: true,
  })
  await json('/api/admin/schedule-health', '', 'POST', { action: 'reconcile' })
  const repairedJob = await row('scheduled-publish-jobs', job2.id)
  check(
    'after the rights fix, reconcile publishes the previously failed job exactly once',
    repairedJob.status === 'completed' &&
      id((await loadBundleByArticleId(payload, article2)).article.latestPublishedRevision) ===
        id(job2.revision),
  )

  // A future-dated job stays pending through every sweep above.
  const article3 = await makeArticle('future', '17E Future Article')
  await scheduleEditorialPublication(payload, {
    articleId: article3,
    actor: { id: state.base.owner, role: 'publisher' },
    actorUserId: state.base.owner,
    scheduledFor: new Date(Date.now() + 2 * 3600000).toISOString(),
    timeZone: 'UTC',
    idempotencyKey: '17e-pub-future',
  })
  const job3 = (
    await find('scheduled-publish-jobs', { idempotencyKey: { equals: '17e-pub-future' } })
  )[0]
  check('future-dated job remains queued and unpublished', job3.status === 'queued')
  state.publication = { job1: job.id, article1: articleId, job3: job3.id, article3 }
  await saveState()
  await stopAll()
  void web
}

// ------------------------------------------------------------ payment section
const addressQuote = (email: string, name: string) => ({
  customer: { email, name, country: 'US' },
  shippingAddress: {
    name,
    line1: '100 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  consents: { termsAccepted: true, privacyAccepted: true },
})

async function paymentSection() {
  await ensureBase()
  await startStripeHarness()
  const web = await startWeb('pay-web')
  const operator = await operatorSession(await row('users', state.base.owner))
  const product = (
    await json(
      '/api/products',
      operator,
      'POST',
      {
        site: state.base.site,
        merchantConnection: state.base.merchantDet,
        name: '17E manual book',
        slug: 'book17e',
        canonicalPath: '/store/book17e',
        kind: 'physical',
        state: 'draft',
        catalogContractVersion: 1,
        productCapabilities: ['shippable'],
        optionDimensions: [{ key: 'edition', label: 'Edition', values: ['print'] }],
        variants: [
          {
            sku: 'MANUAL',
            title: 'Print',
            optionValues: { edition: 'print' },
            status: 'active',
            inventoryPolicy: 'tracked',
            inventoryQuantity: 20,
            weightGrams: 250,
            dimensionsMm: { length: 200, width: 140, height: 15 },
          },
        ],
        offers: [
          {
            offerId: '17e-manual-USD',
            version: 1,
            status: 'active',
            amountMinor: '1000',
            currency: 'USD',
            taxDisplay: 'exclusive',
          },
        ],
      },
      201,
    )
  ).doc.id
  for (const action of ['request-review', 'approve', 'publish'])
    await json('/api/admin/catalog', operator, 'PATCH', { productId: product, action })
  check(
    'manual product published through the catalog workflow',
    (await row('products', product)).state === 'published',
  )
  // One-time checkout scope binds cart, product merchant and capability
  // merchant together, so the Stripe-harness flow needs its own product sold
  // by the Stripe merchant connection.
  const stripeProduct = (
    await json(
      '/api/products',
      operator,
      'POST',
      {
        site: state.base.site,
        merchantConnection: state.base.merchantStripe,
        name: '17E stripe book',
        slug: 'book17e-stripe',
        canonicalPath: '/store/book17e-stripe',
        kind: 'physical',
        state: 'draft',
        catalogContractVersion: 1,
        productCapabilities: ['shippable'],
        optionDimensions: [{ key: 'edition', label: 'Edition', values: ['print'] }],
        variants: [
          {
            sku: 'MANUAL',
            title: 'Print',
            optionValues: { edition: 'print' },
            status: 'active',
            inventoryPolicy: 'tracked',
            inventoryQuantity: 20,
            weightGrams: 250,
            dimensionsMm: { length: 200, width: 140, height: 15 },
          },
        ],
        offers: [
          {
            offerId: '17e-stripe-USD',
            version: 1,
            status: 'active',
            amountMinor: '1000',
            currency: 'USD',
            taxDisplay: 'exclusive',
          },
        ],
      },
      201,
    )
  ).doc.id
  for (const action of ['request-review', 'approve', 'publish'])
    await json('/api/admin/catalog', operator, 'PATCH', { productId: stripeProduct, action })

  async function guestCheckout(capabilityId: string, expected = 200, productId = product) {
    const jar = new Jar()
    await jar.call('/api/commerce/cart', 'POST', {
      productId,
      variantSku: 'MANUAL',
      quantity: 1,
    })
    const proposal = (
      await jar.call('/api/commerce/proposal', 'POST', addressQuote('buyer@17e.test', 'Buyer 17E'))
    ).proposal
    const initiated = await jar.call(
      '/api/commerce/checkout/initiate',
      'POST',
      { proposalId: proposal.id, capabilityId },
      expected,
    )
    return { jar, proposal, initiated }
  }

  // ---- Crash at settlement: worker SIGKILLed inside the finalize transaction
  const first = await guestCheckout(state.base.capabilityDet)
  const session1 = String(first.initiated.sessionId)
  const attempt1 = await row('payment-attempts', String(first.initiated.attemptId))
  check(
    'ordinary checkout created an action-required attempt with a provider reference',
    attempt1.state === 'action-required' &&
      String(attempt1.providerReference).startsWith('det_cs_'),
  )
  const lockClient = await payload.db.pool.connect()
  await lockClient.query('BEGIN')
  await lockClient.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [product])
  const confirm = await request(
    '/api/commerce/checkout/test/confirm',
    first.jar.header(),
    'POST',
    new URLSearchParams({ reference: String(attempt1.providerReference) }),
  )
  check('test confirmation accepted the signed local payment event (303)', confirm.status === 303)
  const event1 = `local-test-paid:${attempt1.id}`
  const inbox1 = (await find('payment-webhook-events', { providerEventId: { equals: event1 } }))[0]
  check(
    'webhook stored a received inbox event and queued settlement',
    inbox1?.processingState === 'received',
  )
  const worker1 = startWorker('pay-crash')
  await until('settlement interrupted mid-finalize', async () => {
    const inbox = await row('payment-webhook-events', inbox1.id)
    const attempt = await row('payment-attempts', attempt1.id)
    return inbox.processingState === 'processing' && attempt.state === 'succeeded'
  })
  await killGroup(worker1)
  const stuckInbox = await row('payment-webhook-events', inbox1.id)
  const stuckAttempt = await row('payment-attempts', attempt1.id)
  const ordersAtCrash = await find('orders', { checkoutSession: { equals: session1 } })
  check(
    'crash at settle: attempt/intent show provider success but NO order exists yet (atomic finalize rolled back)',
    stuckInbox.processingState === 'processing' &&
      stuckAttempt.state === 'succeeded' &&
      ordersAtCrash.length === 0,
  )
  await lockClient.query('ROLLBACK')
  lockClient.release()
  const recoveredCount = await recoverStaleCommerceJobs(payload, 0)
  const resetInbox = await row('payment-webhook-events', inbox1.id)
  check(
    'worker recovery sweep requeues the interrupted event (processing -> received)',
    recoveredCount >= 1 && resetInbox.processingState === 'received',
  )
  const worker2 = startWorker('pay-recover')
  await until(
    'interrupted settlement completes after worker reboot',
    async () => (await row('payment-webhook-events', inbox1.id)).processingState === 'processed',
    180000,
  )
  await killGroup(worker2)
  const doneInbox = await row('payment-webhook-events', inbox1.id)
  const doneAttempt = await row('payment-attempts', attempt1.id)
  const orders1 = await find('orders', { checkoutSession: { equals: session1 } })
  const order1 = orders1[0]
  const receipts = await find('email-deliveries', {
    idempotencyKey: { equals: `commerce-receipt:${order1?.id}:${order1?.receipt?.receiptNumber}` },
  })
  const intent1 = await row('payment-intents', id(attempt1.paymentIntent))
  check(
    'recovered settlement produced exactly one order and one receipt delivery',
    orders1.length === 1 && receipts.length === 1,
  )
  check(
    'attempts counted (2) and the provider event recorded exactly once on attempt and intent',
    doneInbox.attempts === 2 &&
      (doneAttempt.processedEventIds ?? []).filter((e: string) => e === event1).length === 1 &&
      (intent1.financialEvents ?? []).filter(
        (e: any) => e.id === `provider:deterministic-test:${event1}`,
      ).length === 1,
  )
  const replay = await (async () => {
    const { raw, signature } = signedLocalPaymentEvent({
      attemptId: String(attempt1.id),
      providerReference: String(attempt1.providerReference),
      amountMinor: String(attempt1.amountMinor),
      currency: String(attempt1.currency),
      secret: process.env[['COMMERCE', 'TEST', 'WEBHOOK', 'SECRET'].join('_')] as string,
    })
    const response = await request('/api/commerce/webhooks/deterministic-test', '', 'POST', raw, {
      'content-type': 'application/json',
      'x-commerce-signature': signature,
    })
    return { status: response.status, body: JSON.parse(await response.text()) }
  })()
  check(
    'duplicate webhook replay is acknowledged without a second inbox row, order or charge effect',
    replay.status === 200 &&
      replay.body.replay === true &&
      (await find('payment-webhook-events', { providerEventId: { equals: event1 } })).length ===
        1 &&
      (await find('orders', { checkoutSession: { equals: session1 } })).length === 1,
  )

  // ---- Failed payment through a normal signed event
  const second = await guestCheckout(state.base.capabilityDet)
  const attempt2 = await row('payment-attempts', String(second.initiated.attemptId))
  const failedRaw = JSON.stringify({
    providerEventId: 'evt-17e-failed-1',
    providerReference: attempt2.providerReference,
    kind: 'failed',
    amountMinor: attempt2.amountMinor,
    currency: attempt2.currency,
    occurredAt: new Date().toISOString(),
    sanitizedEvidence: { source: '17e-harness' },
  })
  const failedSig = createHmac('sha256', process.env.COMMERCE_TEST_WEBHOOK_SECRET!)
    .update(failedRaw)
    .digest('hex')
  const failedResponse = await request(
    '/api/commerce/webhooks/deterministic-test',
    '',
    'POST',
    failedRaw,
    {
      'content-type': 'application/json',
      'x-commerce-signature': failedSig,
    },
  )
  check('signed failed event accepted into the inbox (202)', failedResponse.status === 202)
  const worker3 = startWorker('pay-failed')
  await until(
    'failed event processed',
    async () =>
      (await find('payment-webhook-events', { providerEventId: { equals: 'evt-17e-failed-1' } }))[0]
        ?.processingState === 'processed',
    180000,
  )
  await killGroup(worker3)
  check(
    'failed payment settles truthfully: attempt and session failed, no order created',
    (await row('payment-attempts', attempt2.id)).state === 'failed' &&
      (await find('orders', { checkoutSession: { equals: String(second.initiated.sessionId) } }))
        .length === 0,
  )

  // ---- Lost creation response (Stripe harness drops the response after creating)
  stripe.dropNextPaymentSessionCreate = true
  const third = await guestCheckout(state.base.capabilityStripe, 202, stripeProduct)
  check(
    'lost provider creation response leaves the checkout truthfully unknown with reconcile required',
    third.initiated.state === 'unknown' && third.initiated.reconcileRequired === true,
  )
  const attempt3 = await row('payment-attempts', String(third.initiated.attemptId))
  check(
    'attempt persisted as unknown with no provider reference (never marked success)',
    attempt3.state === 'unknown' && !attempt3.providerReference,
  )
  const attemptKey = String(attempt3.idempotencyKey)
  const providerSession = stripe.sessionsByKey.get(attemptKey)
  check(
    'provider harness did create exactly one session for the idempotency key',
    Boolean(providerSession),
  )
  providerSession.payment_status = 'paid'
  providerSession.status = 'complete'
  const reconcileChild = startChild('pay-reconcile', ['reconcile-payments'], true)
  await new Promise((r) => reconcileChild.once('exit', r))
  const reconciledAttempt = await row('payment-attempts', attempt3.id)
  const reconcileEvents = await find('payment-webhook-events', {
    providerEventId: { equals: `reconcile:${attempt3.id}:succeeded` },
  })
  check(
    'reconciliation recovers the same provider session by idempotency key and converges the attempt',
    reconciledAttempt.state === 'succeeded' &&
      reconciledAttempt.providerReference === providerSession.id &&
      reconcileEvents.length === 1,
  )
  const session3 = id(attempt3.checkoutSession)
  const worker4 = startWorker('pay-reconcile-worker')
  await until(
    'reconciled settlement completes',
    async () =>
      (await row('payment-webhook-events', reconcileEvents[0].id)).processingState === 'processed',
    180000,
  )
  await killGroup(worker4)
  const orders3 = await find('orders', { checkoutSession: { equals: session3 } })
  check('reconciled payment produced exactly one order', orders3.length === 1)
  const reconcileChild2 = startChild('pay-reconcile-2', ['reconcile-payments'], true)
  await new Promise((r) => reconcileChild2.once('exit', r))
  const sessionCreates = stripe.calls.filter(
    (c) => c.path === '/v1/checkout/sessions' && c.idempotencyKey === attemptKey,
  )
  check(
    'second reconciliation is a no-op: no new session, inbox event or order',
    sessionCreates.length === 2 &&
      (
        await find('payment-webhook-events', {
          providerEventId: { equals: `reconcile:${attempt3.id}:succeeded` },
        })
      ).length === 1 &&
      (await find('orders', { checkoutSession: { equals: session3 } })).length === 1,
  )
  state.payment = {
    order1: order1.id,
    session1,
    attempt1: attempt1.id,
    event1,
    stripeAttempt: attempt3.id,
    stripeSession: providerSession.id,
  }
  await saveState()
  await stopAll()
  void web
}

// --------------------------------------------------------- subscription section
async function subscriptionSection() {
  await ensureBase()
  await startStripeHarness()
  const web = await startWeb('sub-web')
  const operator = await operatorSession(await row('users', state.base.owner))
  const plan = {
    site: state.base.site,
    planKey: 'journal17e',
    revision: 1,
    name: 'Journal monthly 17E',
    interval: 'month',
    intervalCount: 1,
    amountMinor: '1200',
    currency: 'USD',
    trialDays: 0,
    trialEligibility: 'none',
    entitlements: [
      { siteId: state.base.site, resource: 'journal17e', capability: 'read', term: 'subscription' },
      {
        siteId: state.base.site,
        resource: 'journal17e',
        capability: 'download',
        term: 'subscription',
      },
    ],
    cancelPolicy: 'period_end',
    changePolicy: 'immediate',
    taxPolicy: 'provider',
    providerMappings: { 'stripe-test': 'price_month17e' },
    publishedAt: new Date().toISOString(),
  }
  const planId = (await json('/api/plan-revisions', operator, 'POST', plan, 201)).doc.id
  const checkout = await json(
    '/api/commerce/subscriptions/checkout',
    memberCookie(),
    'POST',
    { planRevisionId: planId },
    201,
    { 'idempotency-key': '17e-sub-1', 'x-member-csrf': 'rc117e-csrf' },
  )
  const subs = await find('subscriptions', { site: { equals: state.base.site } })
  check(
    'member subscription checkout persists one incomplete subscription',
    subs.length === 1 && subs[0].state === 'incomplete' && Boolean(checkout?.subscriptionId),
  )
  const subscription = subs[0]
  const replay = await json(
    '/api/commerce/subscriptions/checkout',
    memberCookie(),
    'POST',
    { planRevisionId: planId },
    200,
    { 'idempotency-key': '17e-sub-1', 'x-member-csrf': 'rc117e-csrf' },
  )
  const subCheckoutCalls = stripe.calls.filter(
    (c) => c.path === '/v1/checkout/sessions' && c.method === 'POST',
  )
  check(
    'checkout retry with the same idempotency key replays without a second provider checkout or subscription',
    replay.replay === true &&
      subCheckoutCalls.length === 1 &&
      (await find('subscriptions', { site: { equals: state.base.site } })).length === 1,
  )
  const subRecord = stripe.subscriptions.get('sub_17e')
  await signedStripe('evt-17e-sub-created', 'customer.subscription.created', subRecord)
  const grantsAfterCreate = await find('entitlements', {
    source: { equals: `subscription:${subscription.id}` },
  })
  const orderId = String(checkout.orderId ?? id(subscription.settings?.orderId))
  check(
    'signed subscription-created event grants exactly the two plan entitlements and does not fake payment',
    grantsAfterCreate.length === 2 && (await row('orders', orderId)).state === 'pending-payment',
  )
  // Crash at the grant/settlement boundary: the provider reconcile call hangs
  // inside the webhook transaction; the web process is SIGKILLed mid-flight.
  const versionBefore = Number((await row('subscriptions', subscription.id)).version ?? 1)
  stripe.blockSubscriptions = true
  const invoiceObject = {
    object: 'invoice',
    id: 'in_17e',
    subscription: 'sub_17e',
    customer: 'cus_17e',
    status: 'paid',
    amount_paid: 1200,
    currency: 'usd',
  }
  const inflight = signedStripe('evt-17e-invoice-paid', 'invoice.paid', invoiceObject, 202).catch(
    (e) => ({ error: String(e) }),
  )
  await until(
    'provider reconcile blocked inside the webhook transaction',
    async () => stripe.subscriptionBlocked,
    120000,
  )
  await killGroup(web)
  await sleep(3000)
  const eventsAfterKill = await find('subscription-events', {
    subscription: { equals: subscription.id },
  })
  check(
    'killed mid-grant: the invoice event, order payment and entitlement change all rolled back atomically',
    eventsAfterKill.filter((e: any) => e.kind === 'invoice_paid').length === 0 &&
      (await row('orders', orderId)).state === 'pending-payment' &&
      Number((await row('subscriptions', subscription.id)).version ?? 1) === versionBefore &&
      (await find('entitlements', { source: { equals: `subscription:${subscription.id}` } }))
        .length === 2,
  )
  stripe.blockSubscriptions = false
  const web2 = await startWeb('sub-web2')
  void inflight
  await signedStripe('evt-17e-invoice-paid', 'invoice.paid', invoiceObject, 202)
  const eventsAfterReplay = await find('subscription-events', {
    subscription: { equals: subscription.id },
  })
  check(
    'redelivered invoice event settles exactly once: order paid, one event row, grants still exactly two',
    (await row('orders', orderId)).state === 'paid' &&
      eventsAfterReplay.filter((e: any) => e.kind === 'invoice_paid').length === 1 &&
      (await find('entitlements', { source: { equals: `subscription:${subscription.id}` } }))
        .length === 2,
  )
  const replayBody = await signedStripe('evt-17e-invoice-paid', 'invoice.paid', invoiceObject, 200)
  check(
    'third delivery of the same signed event is a replay no-op',
    replayBody.replay === true &&
      (await find('subscription-events', { subscription: { equals: subscription.id } })).length ===
        eventsAfterReplay.length &&
      (await find('entitlements', { source: { equals: `subscription:${subscription.id}` } }))
        .length === 2,
  )
  const versionSettled = Number((await row('subscriptions', subscription.id)).version ?? 1)
  const child1 = startChild(
    'sub-reconcile-1',
    ['reconcile-subscription', String(subscription.id)],
    true,
  )
  await new Promise((r) => child1.once('exit', r))
  const child2 = startChild(
    'sub-reconcile-2',
    ['reconcile-subscription', String(subscription.id)],
    true,
  )
  await new Promise((r) => child2.once('exit', r))
  check(
    'worker subscription reconciliation is idempotent: no version bump, event or duplicate grant on replay',
    Number((await row('subscriptions', subscription.id)).version ?? 1) === versionSettled &&
      (await find('subscription-events', { subscription: { equals: subscription.id } })).length ===
        eventsAfterReplay.length &&
      (await find('entitlements', { source: { equals: `subscription:${subscription.id}` } }))
        .length === 2,
  )
  state.subscription = { id: subscription.id, orderId }
  await saveState()
  await stopAll()
  void web2
}

// ---------------------------------------------------------- fulfillment section
async function podStateFile() {
  return JSON.parse(await readFile(`${scratch}/provider/pod-state.json`, 'utf8'))
}
async function podControl(body: any) {
  const response = await fetch('http://127.0.0.1:39097/control', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.RENEGADE_POD_SIMULATOR_TOKEN}`,
    },
    body: JSON.stringify(body),
  })
  assert.equal(response.status, 200)
}
async function fulfillmentSection() {
  await ensureBase()
  const sim = spawnLogged('pod-sim', ['--import', 'tsx', 'tests/rc1-17e/pod-simulator.ts'])
  await until(
    'pod simulator readiness',
    async () => {
      try {
        const r = await fetch('http://127.0.0.1:39097/adapter/printful/x/health', {
          method: 'POST',
          headers: { authorization: `Bearer ${process.env.RENEGADE_POD_SIMULATOR_TOKEN}` },
          body: '{}',
        })
        return r.status < 500
      } catch {
        return false
      }
    },
    60000,
    500,
  )
  const web = await startWeb('ful-web')
  const operator = await operatorSession(await row('users', state.base.owner))
  const artBytes = await sharp({
    create: { width: 1600, height: 1600, channels: 4, background: '#335577' },
  })
    .png()
    .toBuffer()
  const form = new FormData()
  form.set('siteId', state.base.site)
  form.set('title', '17E POD artwork')
  form.set('file', new File([artBytes], 'art17e.png', { type: 'image/png' }))
  const asset = (await json('/api/media/upload', operator, 'POST', form, 201)).asset
  await json(`/api/media-assets/${asset.id}`, operator, 'PATCH', {
    rightsStatus: 'approved',
    publicPolicy: 'private',
  })
  const connection = (
    await json(
      '/api/pod-connections',
      operator,
      'POST',
      {
        site: state.base.site,
        merchantConnection: state.base.merchantDet,
        label: '17E printful via local simulator',
        providerKey: 'printful',
        encryptedApiKey: encryptCredential('17e-local-harness-not-live'),
        status: 'active',
        capabilities: EMULATOR_CAPABILITIES,
      },
      201,
    )
  ).doc.id
  const podProduct = (
    await json(
      '/api/products',
      operator,
      'POST',
      {
        site: state.base.site,
        merchantConnection: state.base.merchantDet,
        name: '17E printed shirt',
        slug: 'shirt17e',
        canonicalPath: '/store/shirt17e',
        kind: 'physical',
        state: 'draft',
        catalogContractVersion: 1,
        productCapabilities: ['shippable', 'pod'],
        optionDimensions: [
          { key: 'size', label: 'Size', values: ['m'] },
          { key: 'color', label: 'Color', values: ['black'] },
        ],
        variants: [
          {
            sku: 'POD-M',
            title: 'M black',
            optionValues: { size: 'm', color: 'black' },
            status: 'active',
            inventoryPolicy: 'pod',
            inventoryQuantity: null,
            weightGrams: 250,
            dimensionsMm: { length: 200, width: 140, height: 15 },
          },
        ],
        offers: [
          {
            offerId: '17e-pod-USD',
            version: 1,
            status: 'active',
            amountMinor: '2000',
            currency: 'USD',
            taxDisplay: 'exclusive',
          },
        ],
      },
      201,
    )
  ).doc.id
  await json('/api/admin/fulfillment', operator, 'POST', {
    action: 'save-mapping',
    productId: podProduct,
    mapping: {
      mode: 'pod',
      variantSku: 'POD-M',
      connectionId: connection,
      remoteProductId: 'emu-tee-101',
      remoteVariantId: 'emu-tee-m-blk',
      costMinor: '999999',
      currency: 'USD',
      printAreas: [
        {
          mediaAssetId: asset.id,
          area: 'front',
          placement: { topMm: 50, leftMm: 50, widthMm: 100, heightMm: 100 },
        },
      ],
    },
  })
  for (const action of ['request-review', 'approve', 'publish'])
    await json('/api/admin/catalog', operator, 'PATCH', { productId: podProduct, action })
  check(
    'POD product mapped and published',
    (await row('products', podProduct)).state === 'published',
  )

  async function podOrder() {
    const jar = new Jar()
    await jar.call('/api/commerce/cart', 'POST', {
      productId: podProduct,
      variantSku: 'POD-M',
      quantity: 1,
    })
    const proposal = (
      await jar.call('/api/commerce/proposal', 'POST', addressQuote('pod@17e.test', 'Pod Buyer'))
    ).proposal
    const initiated = await jar.call('/api/commerce/checkout/initiate', 'POST', {
      proposalId: proposal.id,
      capabilityId: state.base.capabilityDet,
    })
    const attempt = await row('payment-attempts', String(initiated.attemptId))
    const confirm = await request(
      '/api/commerce/checkout/test/confirm',
      jar.header(),
      'POST',
      new URLSearchParams({ reference: String(attempt.providerReference) }),
    )
    assert.equal(confirm.status, 303)
    const worker = startWorker('ful-settle')
    let order: any
    await until(
      'paid POD order planned with a held job',
      async () => {
        order = (
          await find('orders', { checkoutSession: { equals: String(initiated.sessionId) } })
        )[0]
        if (!order) return false
        const jobs = await find('pod-jobs', { order: { equals: order.id } })
        return jobs.length === 1
      },
      180000,
    )
    await killGroup(worker)
    const job = (await find('pod-jobs', { order: { equals: order.id } }))[0]
    return { order, job }
  }

  const first = await podOrder()
  check('paid order created exactly one held POD job', first.job.state === 'on_hold')
  const released = await json('/api/admin/fulfillment', operator, 'POST', {
    action: 'release-pod-hold',
    jobId: String(first.job.id),
  })
  check(
    'operator released the fulfillment hold',
    released.success === true && (await row('pod-jobs', first.job.id)).state !== 'on_hold',
  )
  // Crash at the fulfillment transition: the operator action persists its
  // reservation (exception + attempt) and then the provider accepts the order
  // but never responds; the submitting process is SIGKILLed.
  await podControl({ connectionId: connection, next: 'hang' })
  const submitChild = startChild('pod-submit-crash', ['pod-submit', String(first.job.id)])
  await until(
    'provider persisted the order while the response is held',
    async () => Object.keys((await podStateFile()).orders).length === 1,
    120000,
  )
  const reservedJob = await row('pod-jobs', first.job.id)
  check(
    'crash mid-submission: job is truthfully in exception with the attempt reserved, no external id claimed',
    reservedJob.state === 'exception' &&
      reservedJob.attemptCount === 1 &&
      !reservedJob.externalOrderId,
  )
  await killGroup(submitChild)
  const simAfterKill = await podStateFile()
  check(
    'provider holds exactly one order for the job idempotency key after the crash',
    Object.keys(simAfterKill.orders).length === 1,
  )
  const recovery = await reconcileOutstandingFulfillmentOrders(payload, { olderThanMs: 0 })
  const recoveredJob = await row('pod-jobs', first.job.id)
  const simAfterRecovery = await podStateFile()
  const jobKey = String(first.job.idempotencyKey)
  const createCalls = simAfterRecovery.calls.filter(
    (c: any) => c.path?.includes('/create') && c.input?.idempotencyKey === jobKey,
  )
  check(
    'reconciliation recovers the external order by idempotency key without resubmitting',
    recovery.reconciledJobsCount >= 1 &&
      recoveredJob.externalOrderId &&
      recoveredJob.state === 'submitted' &&
      createCalls.length === 1 &&
      recoveredJob.attemptCount === 1,
  )
  const externalOrderId = String(recoveredJob.externalOrderId)
  await podControl({ externalOrderId, state: 'shipped' })
  await reconcileOutstandingFulfillmentOrders(payload, { olderThanMs: 0 })
  const shippedJob = await row('pod-jobs', first.job.id)
  const shippedOrder = await row('orders', first.order.id)
  check(
    'provider shipment reconciles the job and completes order fulfillment without new submissions',
    shippedJob.state === 'shipped' &&
      (['fulfilled', 'completed'].includes(String(shippedOrder.state)) ||
        Boolean(shippedOrder.fulfilledAt) ||
        shippedOrder.fulfillmentExtension?.status === 'completed'),
  )

  // Known rejection -> failed state -> audited operator retry succeeds once.
  const second = await podOrder()
  await json('/api/admin/fulfillment', operator, 'POST', {
    action: 'release-pod-hold',
    jobId: String(second.job.id),
  })
  await podControl({ connectionId: connection, next: 'reject' })
  const rejected = await request('/api/admin/fulfillment', operator, 'POST', {
    action: 'submit-pod-job',
    jobId: String(second.job.id),
  })
  const rejectedJob = await row('pod-jobs', second.job.id)
  check(
    'known provider rejection lands the job in failed state (no unknown-outcome limbo)',
    rejected.status === 409 && rejectedJob.state === 'failed' && rejectedJob.attemptCount === 1,
  )
  const noReason = await request('/api/admin/fulfillment', operator, 'POST', {
    action: 'retry-pod-job',
    jobId: String(second.job.id),
  })
  check(
    'retry without an audited repair reason is refused',
    noReason.status === 409 && (await row('pod-jobs', second.job.id)).state === 'failed',
  )
  const retried = await json('/api/admin/fulfillment', operator, 'POST', {
    action: 'retry-pod-job',
    jobId: String(second.job.id),
    reason: '17E operator repair after known provider rejection',
  })
  const retriedJob = await row('pod-jobs', second.job.id)
  const simFinal = await podStateFile()
  const secondKey = String(second.job.idempotencyKey)
  const secondOrders = Object.values(simFinal.orders).filter(
    (o: any) => o.input?.idempotencyKey === secondKey,
  )
  check(
    'audited retry submits exactly once and records the recovered external order',
    retried.success === true &&
      Boolean(retriedJob.externalOrderId) &&
      secondOrders.length === 1 &&
      retriedJob.attemptCount === 2,
  )
  state.fulfillment = {
    job1: first.job.id,
    order1: first.order.id,
    externalOrderId,
    job2: second.job.id,
  }
  await saveState()
  await stopAll()
  void sim
  void web
}

// ---------------------------------------------------------------- email sections
import { createConnection } from 'node:net'
import { rm } from 'node:fs/promises'
function tcpReady(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}
async function smtpStored() {
  try {
    const text = await readFile(`${scratch}/smtp-stored.jsonl`, 'utf8')
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}
async function smtpControl(mode: string) {
  await writeFile(`${scratch}/smtp-control.json`, JSON.stringify({ mode }))
}
async function makeDelivery(suffix: string) {
  const key = `17e-email-${suffix}`
  const message = await payload.create({
    collection: 'email-messages',
    data: {
      site: state.base.site,
      subject: `17E ${suffix} message`,
      purpose: '17e-acceptance',
      kind: 'transactional',
      status: 'queued',
      blocks: [{ type: 'text', text: `Body for ${suffix}` }],
      idempotencyKey: key,
    },
    overrideAccess: true,
  })
  const delivery = await payload.create({
    collection: 'email-deliveries',
    data: {
      message: message.id,
      recipientEmail: `rcpt-${suffix}@17e.test`,
      idempotencyKey: key,
      status: 'queued',
      messageSnapshot: {
        subject: `17E ${suffix} message`,
        purpose: '17e-acceptance',
        kind: 'transactional',
        blocks: [{ type: 'text', text: `Body for ${suffix}` }],
      },
    },
    overrideAccess: true,
  })
  return { key, delivery }
}

async function emailSmtpSection() {
  await ensureBase()
  await rm(`${scratch}/smtp-stored.jsonl`, { force: true })
  await rm(`${scratch}/smtp-retryable-once.marker`, { force: true })
  await smtpControl('accept')
  const smtp = spawnLogged('smtp-harness', ['--import', 'tsx', 'tests/rc1-17e/smtp-harness.ts'])
  await until('smtp harness readiness', async () => tcpReady(39096), 60000, 500)

  // Crash/lost response at dispatch: provider stores the message, the final
  // response never arrives, and the worker is SIGKILLed mid-send.
  const crash = await makeDelivery('crash')
  await smtpControl('hang-after-data')
  await payload.jobs.queue({
    task: 'audience-email-delivery',
    input: { deliveryId: String(crash.delivery.id) },
    queue: 'operations',
  })
  const worker1 = startWorker('smtp-crash', { EMAIL_MODE: 'smtp' })
  await until(
    'provider stored the message while the worker is blocked in send',
    async () => {
      const stored = await smtpStored()
      const delivery = await row('email-deliveries', crash.delivery.id)
      return (
        stored.filter((m: any) => m.idempotencyKey === crash.key).length === 1 &&
        delivery.status === 'sending'
      )
    },
    120000,
  )
  await killGroup(worker1)
  const stuckDelivery = await row('email-deliveries', crash.delivery.id)
  check(
    'killed mid-dispatch: delivery remains sending under its lease, provider already holds exactly one copy',
    stuckDelivery.status === 'sending' && stuckDelivery.attempts === 1,
  )
  await until(
    'dispatch lease expires',
    async () =>
      Date.parse((await row('email-deliveries', crash.delivery.id)).leaseUntil) < Date.now(),
    120000,
    2000,
  )
  const worker2 = startWorker('smtp-recover', { EMAIL_MODE: 'smtp' })
  await until(
    'interrupted send quarantined as unknown after worker reboot',
    async () => (await row('email-deliveries', crash.delivery.id)).status === 'unknown',
    180000,
  )
  await killGroup(worker2)
  const unknownDelivery = await row('email-deliveries', crash.delivery.id)
  const storedAfterRecovery = await smtpStored()
  check(
    'unknown outcome is never resent: provider copy count stays one, attempts stay one',
    storedAfterRecovery.filter((m: any) => m.idempotencyKey === crash.key).length === 1 &&
      unknownDelivery.attempts === 1 &&
      unknownDelivery.outcome?.code === 'interrupted_send',
  )
  const web = await startWeb('smtp-web', true, { EMAIL_MODE: 'smtp' })
  const operator = await operatorSession(await row('users', state.base.owner))
  const retryUnknown = await request('/api/admin/audience/retry', operator, 'POST', {
    deliveryId: String(crash.delivery.id),
  })
  check(
    'operator retry truthfully refuses an unreconcilable unknown outcome (409, no resend)',
    retryUnknown.status === 409 &&
      (await smtpStored()).filter((m: any) => m.idempotencyKey === crash.key).length === 1,
  )
  state.emailUnknown = { deliveryId: crash.delivery.id, key: crash.key }
  await saveState()

  // Retryable failure -> backoff -> exactly one acceptance.
  const retry = await makeDelivery('retry')
  await smtpControl('retryable-once')
  await payload.jobs.queue({
    task: 'audience-email-delivery',
    input: { deliveryId: String(retry.delivery.id) },
    queue: 'operations',
  })
  const worker3 = startWorker('smtp-retry', { EMAIL_MODE: 'smtp' })
  await until(
    'retryable delivery eventually accepted',
    async () => (await row('email-deliveries', retry.delivery.id)).status === 'accepted',
    240000,
  )
  const retryRow = await row('email-deliveries', retry.delivery.id)
  check(
    'retry with backoff succeeded exactly once (attempts 2, one provider copy)',
    retryRow.attempts === 2 &&
      (await smtpStored()).filter((m: any) => m.idempotencyKey === retry.key).length === 1,
  )
  await killGroup(worker3)

  // Exhaustion -> dead-letter -> audited operator retry repairs it.
  const dead = await makeDelivery('dead')
  await smtpControl('retryable')
  await payload.jobs.queue({
    task: 'audience-email-delivery',
    input: { deliveryId: String(dead.delivery.id) },
    queue: 'operations',
  })
  const worker4 = startWorker('smtp-dead', { EMAIL_MODE: 'smtp' })
  await until(
    'delivery exhausts retries into dead-letter',
    async () => (await row('email-deliveries', dead.delivery.id)).status === 'dead-letter',
    420000,
    1000,
  )
  const deadRow = await row('email-deliveries', dead.delivery.id)
  check(
    'four bounded attempts then dead-letter; provider never stored a copy',
    deadRow.attempts === 4 &&
      (await smtpStored()).filter((m: any) => m.idempotencyKey === dead.key).length === 0,
  )
  await smtpControl('accept')
  const retryDead = await json('/api/admin/audience/retry', operator, 'POST', {
    deliveryId: String(dead.delivery.id),
  })
  check('operator retry requeues the dead-letter delivery', retryDead.status === 'queued')
  await until(
    'repaired delivery accepted after operator retry',
    async () => (await row('email-deliveries', dead.delivery.id)).status === 'accepted',
    240000,
  )
  const repairedRow = await row('email-deliveries', dead.delivery.id)
  check(
    'repaired delivery accepted exactly once with the attempt cycle restarted truthfully',
    repairedRow.attempts === 5 &&
      (await smtpStored()).filter((m: any) => m.idempotencyKey === dead.key).length === 1,
  )
  await killGroup(worker4)
  await stopAll()
  void smtp
  void web
}

async function emailDevSection() {
  await ensureBase()
  resetLocalMailSink()
  const first = await makeDelivery('devdup')
  const handler = emailDeliveryTask.handler as any
  await Promise.all([
    handler({ input: { deliveryId: String(first.delivery.id) }, req: { payload } }),
    handler({ input: { deliveryId: String(first.delivery.id) }, req: { payload } }),
  ])
  const firstRow = await row('email-deliveries', first.delivery.id)
  check(
    'concurrent duplicate dispatch of one delivery sends exactly one message (attempts 1)',
    firstRow.status === 'accepted' &&
      firstRow.attempts === 1 &&
      localMailSinkReceipts().filter((r) => r.idempotencyKey === first.key).length === 1,
  )
  const second = await makeDelivery('devqueue')
  await payload.jobs.queue({
    task: 'audience-email-delivery',
    input: { deliveryId: String(second.delivery.id) },
    queue: 'operations',
  })
  await payload.jobs.queue({
    task: 'audience-email-delivery',
    input: { deliveryId: String(second.delivery.id) },
    queue: 'operations',
  })
  const worker = startWorker('dev-worker')
  await Promise.all([
    recoverEmailOutbox(payload).catch(() => undefined),
    payload.jobs.run({ queue: 'operations', limit: 10 }).catch(() => undefined),
  ])
  await until(
    'double-queued delivery accepted once',
    async () => (await row('email-deliveries', second.delivery.id)).status === 'accepted',
    120000,
  )
  await killGroup(worker)
  const secondRow = await row('email-deliveries', second.delivery.id)
  check(
    'double-queued job plus outbox recovery still produces a single send attempt',
    secondRow.attempts === 1,
  )
  if (state.emailUnknown?.deliveryId) {
    const before = await row('email-deliveries', state.emailUnknown.deliveryId)
    await handler({
      input: { deliveryId: String(state.emailUnknown.deliveryId) },
      req: { payload },
    })
    const after = await row('email-deliveries', state.emailUnknown.deliveryId)
    check(
      'a different provider never reconciles or resends an interrupted SMTP delivery',
      before.status === 'unknown' &&
        after.status === 'unknown' &&
        after.attempts === before.attempts,
    )
  }
  await stopAll()
}

// --------------------------------------------------------------- restart section
async function restartSection() {
  await ensureBase()
  const storedBefore = (await smtpStored()).filter(
    (m: any) => m.idempotencyKey === state.emailUnknown?.key,
  ).length
  const web = await startWeb('restart-web')
  const worker = startWorker('restart-worker')
  await payload.jobs.run({ queue: 'operations', limit: 50 }).catch(() => undefined)
  await sleep(12000)
  const job3 = await row('scheduled-publish-jobs', state.publication.job3)
  check(
    'after web/worker reboot the future publication job is still truthfully pending, not executed early or lost',
    job3.status === 'queued' &&
      !(await loadBundleByArticleId(payload, state.publication.article3)).article
        .latestPublishedRevision,
  )
  check(
    'payment effects survive reboot exactly once (one order for the recovered session)',
    (await find('orders', { checkoutSession: { equals: state.payment.session1 } })).length === 1,
  )
  const sub = await row('subscriptions', state.subscription.id)
  check(
    'subscription remains active with exactly its two grants after reboot',
    sub.state === 'active' &&
      (await find('entitlements', { source: { equals: `subscription:${sub.id}` } })).length === 2,
  )
  check(
    'fulfillment outcome persists after reboot (job shipped, external order recorded)',
    (await row('pod-jobs', state.fulfillment.job1)).state === 'shipped' &&
      String((await row('pod-jobs', state.fulfillment.job1)).externalOrderId) ===
        state.fulfillment.externalOrderId,
  )
  const unknown = await row('email-deliveries', state.emailUnknown.deliveryId)
  const storedAfter = (await smtpStored()).filter(
    (m: any) => m.idempotencyKey === state.emailUnknown?.key,
  ).length
  check(
    'unknown dispatch is not silently resent or dropped after reboot (still unknown, one provider copy)',
    unknown.status === 'unknown' && storedBefore === 1 && storedAfter === 1,
  )
  await stopAll()
  void web
  void worker
}

// ------------------------------------------------------------------- dispatch
try {
  if (section === 'publication') await publicationSection()
  else if (section === 'payment') await paymentSection()
  else if (section === 'subscription') await subscriptionSection()
  else if (section === 'fulfillment') await fulfillmentSection()
  else if (section === 'email-smtp') await emailSmtpSection()
  else if (section === 'email-dev') await emailDevSection()
  else if (section === 'restart') await restartSection()
  else throw new Error(`Unknown section ${section}`)
  await saveTrace()
  console.log(`SECTION ${section} COMPLETE: ${trace.length} checks`)
} catch (error) {
  console.error(`SECTION ${section} FAILED after ${trace.length} checks:`)
  console.error(error)
  await stopAll().catch(() => undefined)
  process.exit(1)
} finally {
  await stopAll().catch(() => undefined)
  process.exit(0)
}
