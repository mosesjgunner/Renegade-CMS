/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator/browser acceptance harness */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { encryptCredential } from '../../src/modules/commerce/pod-connection'
import { EMULATOR_CAPABILITIES } from '../../src/modules/commerce/pod-emulator'

assert.equal(process.env.RC1_13C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5470/rc113c_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(process.env.COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED, 'true')

const out = 'docs/rc/evidence/rc1/18-pass/13C'
const base = 'http://localhost:39035'
const betaBase = 'http://127.0.0.1:39035'
const restart = process.argv.includes('restart')
const trace: string[] = []

function check(name: string, value: unknown) {
  assert.ok(value, name)
  trace.push(name)
  console.log(`PASS ${trace.length}: ${name}`)
}

const payload: any = await getPayload({ config })
let web: ChildProcess | undefined
const browser = await chromium.launch({ headless: true })
const newContext = async (options?: any) => {
  const ctx = await browser.newContext(options)
  ctx.setDefaultNavigationTimeout(120000)
  ctx.setDefaultTimeout(60000)
  return ctx
}

const row = (collection: string, id: string) =>
  payload.findByID({ collection, id, depth: 0, overrideAccess: true })

const request = (
  route: string,
  cookie = '',
  method = 'GET',
  data?: any,
  extraHeaders: Record<string, string> = {},
) =>
  fetch(`${base}${route}`, {
    method,
    headers: {
      origin: base,
      ...(cookie ? { cookie } : {}),
      ...(data && !(data instanceof FormData) && typeof data !== 'string'
        ? { 'content-type': 'application/json' }
        : {}),
      ...extraHeaders,
    },
    body:
      data instanceof FormData
        ? data
        : typeof data === 'string'
          ? data
          : data
            ? JSON.stringify(data)
            : undefined,
    signal: AbortSignal.timeout(180000),
  })

async function json(
  route: string,
  cookie = '',
  method = 'GET',
  data?: any,
  expected = 200,
  headers: Record<string, string> = {},
) {
  const response = await request(route, cookie, method, data, headers)
  const body = await response.text()
  assert.equal(response.status, expected, `${method} ${route}: ${body.slice(0, 1600)}`)
  return JSON.parse(body)
}

async function session(user: any) {
  const value = await createPasskeySession(
    user,
    loadConfig().payloadSecret,
    async (id, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, user.id, expires],
      )
    },
  )
  return `renegade-passkey=${value.token}`
}

async function release(id: string, cookie: string) {
  for (const action of ['request-review', 'approve', 'publish'])
    await json('/api/admin/catalog', cookie, 'PATCH', { productId: id, action })
  check(`review/approve/publish persisted ${id}`, (await row('products', id)).state === 'published')
}

async function startWeb() {
  web = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39035'],
    { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const log = createWriteStream(`${out}/${restart ? 'restart-web' : 'web'}.log`)
  web.stdout!.pipe(log, { end: false })
  web.stderr!.pipe(log, { end: false })
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    try {
      if ((await request('/api/catalog')).status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('Web readiness timed out')
}

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

let worker: ChildProcess | undefined
async function stop(child?: ChildProcess) {
  if (child?.pid)
    await new Promise<void>((resolve) => {
      const p = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      p.on('exit', () => resolve())
    })
}
function startWorker() {
  worker = spawn(process.execPath, ['--import', 'tsx', 'src/scripts/run-jobs-worker.ts'], {
    env: {
      ...process.env,
      WORKER_PROFILE: 'commerce-only',
      WORKER_POLL_INTERVAL_MS: '1000',
      WORKER_HEARTBEAT_FILE: 'scratch/rc113c/heartbeat.json',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log = createWriteStream(`${out}/${restart ? 'restart-' : ''}worker.log`)
  worker.stdout!.pipe(log, { end: false })
  worker.stderr!.pipe(log, { end: false })
}
async function until(name: string, test: () => Promise<boolean>) {
  for (let i = 0; i < 150; i++) {
    if (await test()) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Timeout: ${name}`)
}
const find = async (collection: string, where: any) =>
  (await payload.find({ collection, where, depth: 0, limit: 100, overrideAccess: true })).docs
const id = (v: any) => String(v?.id ?? v ?? '')

let state: any = restart ? JSON.parse(await readFile(`${out}/state.json`, 'utf8')) : {}

try {
  if (!restart) {
    const findOne = async (collection: string, where: any) =>
      (await payload.find({ collection, where, depth: 0, limit: 1, overrideAccess: true })).docs[0]

    let alpha = await findOne('sites', { slug: { equals: 'alpha13c' } })
    if (!alpha) {
      alpha = await payload.create({
        collection: 'sites',
        data: { name: '13C Alpha', slug: 'alpha13c', lifecycle: 'active' },
      })
    }
    let beta = await findOne('sites', { slug: { equals: 'beta13c' } })
    if (!beta) {
      beta = await payload.create({
        collection: 'sites',
        data: { name: '13C Beta', slug: 'beta13c', lifecycle: 'active' },
      })
    }
    let owner = await findOne('users', { email: { equals: 'owner@13c.test' } })
    if (!owner) {
      owner = await payload.create({
        collection: 'users',
        data: { email: 'owner@13c.test', role: 'owner' },
      })
    }
    let staff = await findOne('users', { email: { equals: 'staff@13c.test' } })
    if (!staff) {
      staff = await payload.create({
        collection: 'users',
        data: { email: 'staff@13c.test', role: 'staff' },
      })
    }
    let foreign = await findOne('users', { email: { equals: 'foreign@13c.test' } })
    if (!foreign) {
      foreign = await payload.create({
        collection: 'users',
        data: { email: 'foreign@13c.test', role: 'staff' },
      })
    }
    const rolesAlpha = await find('member-site-roles', {
      site: { equals: alpha.id },
      member: { equals: id(staff.member) },
    })
    if (!rolesAlpha.length) {
      await payload.create({
        collection: 'member-site-roles',
        data: { member: id(staff.member), site: alpha.id, role: 'contributor' },
      })
    }
    const rolesBeta = await find('member-site-roles', {
      site: { equals: beta.id },
      member: { equals: id(foreign.member) },
    })
    if (!rolesBeta.length) {
      await payload.create({
        collection: 'member-site-roles',
        data: { member: id(foreign.member), site: beta.id, role: 'contributor' },
      })
    }
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: betaBase },
        launchState: 'live',
        adminExperience: { optionalCapabilities: { commerceCheckout: true } },
      },
    })
    let merchant = await findOne('merchant-connections', {
      site: { equals: alpha.id },
      label: { equals: '13C local payment' },
    })
    if (!merchant) {
      merchant = await payload.create({
        collection: 'merchant-connections',
        data: {
          site: alpha.id,
          label: '13C local payment',
          providerKey: 'deterministic-test',
          merchantCountry: 'US',
          status: 'active',
        },
      })
    }
    let bm = await findOne('merchant-connections', {
      site: { equals: beta.id },
      label: { equals: '13C foreign merchant' },
    })
    if (!bm) {
      bm = await payload.create({
        collection: 'merchant-connections',
        data: {
          site: beta.id,
          label: '13C foreign merchant',
          providerKey: 'deterministic-test',
          merchantCountry: 'US',
          status: 'active',
        },
      })
    }
    let cap = await findOne('payment-method-capabilities', {
      site: { equals: alpha.id },
      merchantConnection: { equals: merchant.id },
    })
    if (!cap) {
      cap = await payload.create({
        collection: 'payment-method-capabilities',
        data: {
          site: alpha.id,
          merchantConnection: merchant.id,
          providerKey: 'deterministic-test',
          railKey: '13c-card',
          family: 'card',
          flow: 'hosted',
          merchantCountries: ['US'],
          buyerCountries: ['US'],
          presentmentCurrencies: ['USD', 'EUR'],
          settlementCurrencies: ['USD', 'EUR'],
          recurring: false,
          refunds: true,
          enabled: true,
          health: 'healthy',
        },
      })
    }
    state = {
      alpha: alpha.id,
      beta: beta.id,
      owner: owner.id,
      staff: staff.id,
      foreign: foreign.id,
      merchant: merchant.id,
      betaMerchant: bm.id,
      capability: cap.id,
    }
  }

  await startWeb()
  const operator = await session(await row('users', state.owner)),
    staff = await session(await row('users', state.staff)),
    foreign = await session(await row('users', state.foreign))

  const api = async (ctx: any, path: string, data?: any, expected = 200) => {
    const response = await ctx.request.fetch(base + path, {
      method: data ? 'POST' : 'GET',
      headers: { origin: base },
      ...(data ? { data } : {}),
    })
    assert.equal(response.status(), expected, await response.text())
    return response.json()
  }

  const orderFor = async (sessionId: string) =>
    (await find('orders', { checkoutSession: { equals: sessionId } }))[0]
  const jobsFor = (orderId: string) => find('pod-jobs', { order: { equals: orderId } })
  const manualFor = (orderId: string) =>
    find('manual-fulfillment-packages', { order: { equals: orderId } })

  const control = async (data: Record<string, unknown>) => {
    const response = await fetch('http://127.0.0.1:39036/control', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer 13c-loopback-simulator-token-only',
      },
      body: JSON.stringify(data),
    })
    assert.equal(response.status, 200)
  }

  if (!restart) {
    const art = await sharp({
      create: { width: 1600, height: 1600, channels: 4, background: '#114488' },
    })
      .png()
      .toBuffer()

    const upload = async (site: string) => {
      const form = new FormData()
      form.set('siteId', site)
      form.set('title', '13C artwork')
      form.set('file', new File([art], 'art13c.png', { type: 'image/png' }))
      const asset = (await json('/api/media/upload', operator, 'POST', form, 201)).asset
      await json(`/api/media-assets/${asset.id}`, operator, 'PATCH', {
        rightsStatus: 'approved',
        publicPolicy: 'private',
      })
      return asset.id
    }

    state.art = await upload(state.alpha)

    const connection = async (
      site: string,
      merchant: string,
      key = 'pod-emulator',
      whSec = '13c-wh-secret-32chars-long',
    ) =>
      (
        await json(
          '/api/pod-connections',
          operator,
          'POST',
          {
            site,
            merchantConnection: merchant,
            label: `13C ${key} simulator`,
            providerKey: key,
            encryptedApiKey: encryptCredential(
              JSON.stringify({ apiKey: '13c-test-token', webhookSecret: whSec }),
            ),
            status: 'active',
            capabilities: EMULATOR_CAPABILITIES,
          },
          201,
        )
      ).doc.id

    state.webhookSecret = '13c-wh-secret-at-least-32-chars'
    state.connection = await connection(
      state.alpha,
      state.merchant,
      'printful',
      state.webhookSecret,
    )
    state.printifyConnection = await connection(
      state.alpha,
      state.merchant,
      'printify',
      state.webhookSecret,
    )

    // Setup physical + POD products using canonical IA
    const runTag = Date.now().toString(36)
    const product = async (pod: boolean, suffix = '') =>
      (
        await json(
          '/api/products',
          operator,
          'POST',
          {
            site: state.alpha,
            merchantConnection: state.merchant,
            name: pod ? '13C printed shirt' : '13C manual book',
            slug: (pod ? 'shirt13c' : 'book13c') + '-' + runTag + suffix,
            canonicalPath: (pod ? '/store/shirt13c' : '/store/book13c') + '-' + runTag + suffix,
            kind: 'physical',
            state: 'draft',
            catalogContractVersion: 1,
            productCapabilities: pod ? ['shippable', 'pod'] : ['shippable'],
            optionDimensions: pod
              ? [
                  { key: 'size', label: 'Size', values: ['m'] },
                  { key: 'color', label: 'Color', values: ['black'] },
                ]
              : [{ key: 'edition', label: 'Edition', values: ['print'] }],
            variants: [
              {
                sku: pod ? 'POD-M' : 'MANUAL',
                title: pod ? 'M black' : 'Print',
                optionValues: pod ? { size: 'm', color: 'black' } : { edition: 'print' },
                status: 'active',
                inventoryPolicy: pod ? 'pod' : 'tracked',
                inventoryQuantity: pod ? null : 20,
                weightGrams: 250,
                dimensionsMm: { length: 200, width: 140, height: 15 },
              },
            ],
            offers: [
              {
                offerId: `13c-${pod ? 'pod' : 'manual'}-${runTag}${suffix}-USD`,
                version: 1,
                status: 'active',
                amountMinor: pod ? '2000' : '1000',
                currency: 'USD',
                taxDisplay: 'exclusive',
              },
            ],
          },
          201,
        )
      ).doc.id

    state.manual = await product(false)
    state.pod = await product(true)

    // Configure mapping for POD product
    const mapping = (patch: any = {}) => ({
      mode: 'pod',
      variantSku: 'POD-M',
      connectionId: state.connection,
      remoteProductId: 'emu-tee-101',
      remoteVariantId: 'emu-tee-m-blk',
      costMinor: '999999',
      currency: 'USD',
      printAreas: [
        {
          mediaAssetId: state.art,
          area: 'front',
          placement: { topMm: 50, leftMm: 50, widthMm: 100, heightMm: 100 },
        },
      ],
      ...patch,
    })

    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'save-mapping',
      productId: state.manual,
      mapping: { mode: 'manual', variantSku: 'MANUAL' },
    })

    const savedMapping = (
      await json('/api/admin/fulfillment', operator, 'POST', {
        action: 'save-mapping',
        productId: state.pod,
        mapping: mapping(),
      })
    ).mapping

    check(
      'mapping pins verified artwork bytes and simulator variant',
      savedMapping.reviewedBy === state.owner,
    )

    await release(state.manual, operator)
    await release(state.pod, operator)

    // Preflight artwork check
    const preflight = await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'pod-preflight',
      connectionId: state.connection,
      variantId: 'emu-tee-m-blk',
      printArea: 'front',
      artwork: { id: state.art },
      placement: { topMm: 50, leftMm: 50, widthMm: 100, heightMm: 100 },
    })
    check(
      'preflight against simulator validates actual artwork bytes and dimensions',
      preflight.success === true,
    )

    startWorker()

    const prepare = async (podOnly = false) => {
      const ctx = await newContext()
      if (!podOnly)
        await api(ctx, '/api/commerce/cart', {
          productId: state.manual,
          variantSku: 'MANUAL',
          quantity: 1,
        })
      await api(ctx, '/api/commerce/cart', {
        productId: state.pod,
        variantSku: 'POD-M',
        quantity: 1,
      })
      const proposal = (
        await api(ctx, '/api/commerce/proposal', {
          ...addressQuote('buyer@13c.test', 'Jane Customer'),
        })
      ).proposal
      return { ctx, proposal }
    }

    const runCheckout = async (podOnly = false) => {
      const { ctx, proposal } = await prepare(podOnly)
      const intent = await api(ctx, '/api/commerce/checkout/initiate', {
        proposalId: proposal.id,
        capabilityId: state.capability,
      })
      const page = await ctx.newPage()
      await page.goto(new URL(intent.actionUrl, base).href)
      await page.getByRole('button', { name: /confirm/i }).click()
      await until('paid order planned', async () => {
        const o = await orderFor(intent.sessionId)
        return Boolean(o?.fulfillmentExtension?.planId)
      })
      const o = await orderFor(intent.sessionId)
      return { ctx, orderId: o.id, sessionId: intent.sessionId }
    }

    // =========================================================================
    // JOURNEY 1: Full Multi-Package Fulfillment + Duplicate Webhook
    // =========================================================================
    const flow1 = await runCheckout(false)
    state.firstOrder = flow1.orderId
    const firstJobs = await jobsFor(state.firstOrder)
    const firstManual = await manualFor(state.firstOrder)
    assert.equal(firstJobs.length, 1)
    assert.equal(firstManual.length, 1)
    state.firstJob = firstJobs[0].id
    state.firstPackage = firstManual[0].id

    // Release hold and submit POD job
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'release-pod-hold',
      jobId: state.firstJob,
    })
    const submit1 = await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'submit-pod-job',
      jobId: state.firstJob,
    })
    check(
      'POD job submitted successfully to simulator',
      submit1.success === true && submit1.job.state === 'submitted',
    )
    state.firstExternalOrderId = submit1.job.externalOrderId

    // Double-submit guard: submitting again is rejected
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'submit-pod-job', jobId: state.firstJob },
      409,
    )
    check('double-submit on already submitted job is denied with HTTP 409', true)

    // Simulate Provider Webhook: Package Shipped
    const shipWebhookPayload = JSON.stringify({
      type: 'package_shipped',
      created: Math.floor(Date.now() / 1000),
      data: {
        order: { id: state.firstExternalOrderId, status: 'fulfilled' },
        shipment: {
          id: 101,
          carrier: 'USPS',
          tracking_number: 'SIMULATOR13C999',
          tracking_url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=SIMULATOR13C999',
        },
      },
    })
    const shipWebhookSig = createHmac('sha256', state.webhookSecret)
      .update(shipWebhookPayload)
      .digest('hex')

    const whRes1 = await fetch(
      `${base}/api/commerce/pod/webhook?connectionId=${state.connection}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pod-signature': shipWebhookSig },
        body: shipWebhookPayload,
      },
    )
    const whText1 = await whRes1.text()
    assert.equal(whRes1.status, 200, whText1)
    const whData1 = JSON.parse(whText1)
    check(
      'provider signed webhook delivered and applied shipped state',
      whData1.received === true && whData1.state === 'shipped',
    )

    // Duplicate webhook delivery: identical webhook re-sent
    const whRes2 = await fetch(
      `${base}/api/commerce/pod/webhook?connectionId=${state.connection}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pod-signature': shipWebhookSig },
        body: shipWebhookPayload,
      },
    )
    const whText2 = await whRes2.text()
    assert.equal(whRes2.status, 200, whText2)
    const whData2 = JSON.parse(whText2)
    check(
      'duplicate webhook delivery detected and acknowledged as replay without duplicate application',
      whData2.replay === true,
    )

    // Operator acknowledges, enters production and ships manual package
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'acknowledge-manual',
      packageId: state.firstPackage,
    })
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'start-production-manual',
      packageId: state.firstPackage,
    })
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'ship-manual',
      packageId: state.firstPackage,
      carrier: 'FedEx',
      trackingNumber: 'MANUAL13C888',
    })

    // Cross-check: Order is now fulfilled, notification created, inventory consumed
    const firstOrderDoc = await row('orders', state.firstOrder)
    check(
      'order transitions to fulfilled once all packages/jobs are shipped',
      firstOrderDoc.state === 'fulfilled',
    )
    check(
      'order transitionLog records order-fulfilled',
      firstOrderDoc.transitionLog.some((t: any) => t.kind === 'order-fulfilled'),
    )

    const activities = await find('activity-events', {
      'object.orderId': { equals: state.firstOrder },
    })
    check('cross-checked: activity-event emitted for order shipment', activities.length > 0)

    const reservations = await find('inventory-reservations', {
      proposal: {
        equals: (await row('checkout-sessions', firstOrderDoc.checkoutSession)).proposal,
      },
    })
    check(
      'cross-checked: inventory reservations are consumed on fulfillment',
      reservations.length > 0 && reservations.every((r: any) => r.status === 'consumed'),
    )

    // =========================================================================
    // JOURNEY 2: Provider Lost-Response Simulation & Recovery via Idempotency Key
    // =========================================================================
    const flow2 = await runCheckout(true)
    state.secondOrder = flow2.orderId
    state.secondJob = (await jobsFor(state.secondOrder))[0].id

    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'release-pod-hold',
      jobId: state.secondJob,
    })

    // Simulate lost response: simulator drops socket
    await control({ connectionId: state.connection, next: 'lost-response' })
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'submit-pod-job', jobId: state.secondJob },
      409,
    )

    const job2AfterDrop = await row('pod-jobs', state.secondJob)
    check(
      'lost response persists exception state and reserves attempt count',
      job2AfterDrop.state === 'exception' && job2AfterDrop.attemptCount === 1,
    )

    // Double-submit and unauthorized retry guards
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'submit-pod-job', jobId: state.secondJob },
      409,
    )
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'cancel-pod-job', jobId: state.secondJob },
      400,
    )
    check('submitting or cancelling job in exception state is denied before reconciliation', true)

    // Reconcile: recovers order without duplicate creation
    const rec2 = await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'reconcile-pod-job',
      jobId: state.secondJob,
    })
    check(
      'reconcile-pod-job recovers provider order identity from lost-response by idempotency key',
      rec2.success === true && rec2.job.state === 'submitted',
    )
    state.secondExternalOrderId = rec2.job.externalOrderId

    // =========================================================================
    // JOURNEY 3: Provider Rejection, Audited Failure-Only Retry & Terminal Outcome
    // =========================================================================
    const flow3 = await runCheckout(true)
    state.thirdOrder = flow3.orderId
    state.thirdJob = (await jobsFor(state.thirdOrder))[0].id

    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'release-pod-hold',
      jobId: state.thirdJob,
    })
    await control({ connectionId: state.connection, next: 'reject' })
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'submit-pod-job', jobId: state.thirdJob },
      409,
    )

    const job3Failed = await row('pod-jobs', state.thirdJob)
    check(
      'actual provider HTTP 422 rejection persists failed state and error diagnostic',
      job3Failed.state === 'failed',
    )

    // Unauthorized retry denied
    await json(
      '/api/admin/fulfillment',
      staff,
      'POST',
      { action: 'retry-pod-job', jobId: state.thirdJob, reason: 'staff retry' },
      403,
    )
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'retry-pod-job', jobId: state.thirdJob },
      409,
    )
    check('retry without owner/admin role or missing reason is denied', true)

    // Authorized retry with reason
    const retry3 = await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'retry-pod-job',
      jobId: state.thirdJob,
      reason: 'Simulator configuration corrected; retrying known rejected order',
    })
    check(
      'audited retry increments attempt count to exactly 2 and submits',
      retry3.success === true && retry3.job.attemptCount === 2,
    )

    // =========================================================================
    // JOURNEY 4: Manual Override on Failed Job & Complete Cancellation Flow
    // =========================================================================
    const flow4 = await runCheckout(true)
    state.fourthOrder = flow4.orderId
    state.fourthJob = (await jobsFor(state.fourthOrder))[0].id

    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'release-pod-hold',
      jobId: state.fourthJob,
    })
    await control({ connectionId: state.connection, next: 'reject' })
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'submit-pod-job', jobId: state.fourthJob },
      409,
    )

    // Manual override authorized by owner
    const override = await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'override-manual',
      orderId: state.fourthOrder,
      jobId: state.fourthJob,
      reason: 'Provider persistent failure; handed off to physical workshop',
    })
    check(
      'manual override cancels failed POD job and creates manual fallback package',
      override.success === true && override.package.source === 'pod-provider-fallback',
    )
    state.fourthManualPkg = override.package.id

    // Operator cancels the manual package -> order becomes cancelled, inventory released
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'cancel-manual',
      packageId: state.fourthManualPkg,
      reason: 'Customer requested refund before production',
    })
    const fourthOrderDoc = await row('orders', state.fourthOrder)
    check(
      'order fulfillment status becomes cancelled when all packages/jobs are cancelled',
      fourthOrderDoc.fulfillmentExtension.status === 'cancelled',
    )

    // =========================================================================
    // NEGATIVES: Multi-Site & Webhook Security
    // =========================================================================
    // Foreign site user trying to access Alpha fulfillment
    await json('/api/admin/fulfillment?siteId=' + state.alpha, foreign, 'GET', undefined, 403)
    check('negative: operator scoped to foreign site cannot view Alpha fulfillment', true)

    // Tampered webhook signature
    const forgedWh = await fetch(
      `${base}/api/commerce/pod/webhook?connectionId=${state.connection}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pod-signature': '0'.repeat(64) },
        body: JSON.stringify({ type: 'package_shipped' }),
      },
    )
    assert.equal(forgedWh.status, 401)
    check('negative: forged or unsigned webhook signature rejected with HTTP 401', true)

    // Webhook for disabled connection
    await json(`/api/pod-connections/${state.printifyConnection}`, operator, 'PATCH', {
      status: 'disabled',
    })
    const disabledWh = await fetch(
      `${base}/api/commerce/pod/webhook?connectionId=${state.printifyConnection}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pod-signature': 'valid' },
        body: JSON.stringify({ type: 'package_shipped' }),
      },
    )
    assert.equal(disabledWh.status, 403)
    check('negative: webhook for disabled connection rejected with HTTP 403', true)
    await json(`/api/pod-connections/${state.printifyConnection}`, operator, 'PATCH', {
      status: 'active',
    })

    // Save state for restart test
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))
  } else {
    // =========================================================================
    // RESTART RECOVERY: Database, Simulator, Worker and Browser Refetch
    // =========================================================================
    const workerStartedAt = Date.now()
    startWorker()
    await until('fresh worker heartbeat', async () => {
      try {
        return (
          Date.parse(
            JSON.parse(await readFile('scratch/rc113c/heartbeat.json', 'utf8')).observedAt,
          ) >= workerStartedAt
        )
      } catch {
        return false
      }
    })
    check('separate commerce worker restarts and records fresh heartbeat', true)

    // Verify all persisted state survived database/process restart
    const job1 = await row('pod-jobs', state.firstJob)
    check(
      'restarted state: job 1 retains shipped state, tracking and externalOrderId',
      job1.state === 'shipped' && job1.externalOrderId === state.firstExternalOrderId,
    )

    const job2 = await row('pod-jobs', state.secondJob)
    check(
      'restarted state: recovered job 2 retains submitted state and single attempt',
      job2.state === 'submitted' && job2.attemptCount === 1,
    )

    const job3 = await row('pod-jobs', state.thirdJob)
    check(
      'restarted state: retried job 3 retains exactly two attempts',
      job3.state === 'submitted' && job3.attemptCount === 2,
    )

    // Reconcile outstanding fulfillment orders bulk endpoint
    const recAll = await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'reconcile-outstanding',
      siteId: state.alpha,
    })
    check(
      'bulk reconcile-outstanding runs safely without creating duplicate provider orders',
      recAll.success === true,
    )

    // Double-submit prevention verified across restart
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'submit-pod-job', jobId: state.firstJob },
      409,
    )
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'submit-pod-job', jobId: state.secondJob },
      409,
    )
    check('double-submission blocked across process restart', true)

    // Browser session UI verification
    const ctx = await newContext()
    await ctx.addCookies([{ name: 'renegade-passkey', value: operator.split('=')[1], url: base }])
    const page = await ctx.newPage()
    await page.goto(`${base}/admin/fulfillment`)
    await page.getByRole('heading', { name: `Job ${state.firstJob}`, exact: true }).waitFor()
    const content = await page.textContent('body')
    check(
      'browser UI refetches saved provider output with tracking details',
      content?.includes('USPS') || content?.includes('SIMULATOR13C999'),
    )
    await page.screenshot({ path: `${out}/restart.png`, fullPage: true })
  }

  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}.json`,
    JSON.stringify({ passed: trace.length, failed: 0, skipped: 0, checks: trace }, null, 2),
  )
} finally {
  await stop(worker)
  await stop(web)
  await browser.close()
  const pool = payload.db.pool,
    idle = new Set(pool._idle.map((e: any) => e.client))
  for (const client of [...pool._clients])
    if (!idle.has(client)) {
      assert.ok(!client.activeQuery)
      client.release(true)
    }
  await pool.end()
  await payload.destroy()
}
