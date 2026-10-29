/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator/browser acceptance harness */
import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { createHmac } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { getPayload } from 'payload'
import config from '@payload-config'
import { issueMagicLink, consumeMagicLink } from '../../src/modules/identity/member-identity'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { encryptCredential } from '../../src/modules/commerce/pod-connection'
import { EMULATOR_CAPABILITIES } from '../../src/modules/commerce/pod-emulator'

assert.equal(process.env.RC1_13B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5469/rc113b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(process.env.COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED, 'true')

const out = 'docs/rc/evidence/rc1/18-pass/13B'
const base = 'http://localhost:39025'
const betaBase = 'http://127.0.0.1:39025'
const restart = process.argv.includes('restart')
const trace: string[] = []

function check(name: string, value: unknown) {
  assert.ok(value, name)
  trace.push(name)
  console.log(`PASS ${trace.length}: ${name}`)
}

const payload: any = await getPayload({ config })
let web: ChildProcess | undefined
const browser = await chromium.launch({
  headless: true,
})
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
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39025'],
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

function signDeterministicWebhook(body: Record<string, unknown>) {
  const secret = process.env.COMMERCE_TEST_WEBHOOK_SECRET!
  const raw = JSON.stringify(body)
  const signature = createHmac('sha256', secret).update(raw).digest('hex')
  return { raw, signature }
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
      WORKER_HEARTBEAT_FILE: 'scratch/rc113b/heartbeat.json',
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
const scopedSimulatorOrders = (snapshot: any) =>
  Object.entries(snapshot.orders).filter(([, order]: any) =>
    [state.connection, state.printifyConnection].includes(order.connection),
  )
const plan = (orderId: string) => row('orders', orderId).then((o: any) => o.fulfillmentExtension)
let state: any = restart ? JSON.parse(await readFile(`${out}/state.json`, 'utf8')) : {}
try {
  if (!restart) {
    const alpha = await payload.create({
      collection: 'sites',
      data: { name: '13B Alpha', slug: 'alpha13b', lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '13B Beta', slug: 'beta13b', lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@13b.test', role: 'owner' },
    })
    const second = await payload.create({
      collection: 'users',
      data: { email: 'second@13b.test', role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@13b.test', role: 'staff' },
    })
    const foreign = await payload.create({
      collection: 'users',
      data: { email: 'foreign@13b.test', role: 'staff' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: { member: id(staff.member), site: alpha.id, role: 'contributor' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: { member: id(foreign.member), site: beta.id, role: 'contributor' },
    })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: betaBase },
        launchState: 'live',
        adminExperience: { optionalCapabilities: { commerceCheckout: true } },
      },
    })
    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: alpha.id,
        label: '13B local payment',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    const alternate = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: alpha.id,
        label: '13B other merchant',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    const bm = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: beta.id,
        label: '13B foreign merchant',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    const cap = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: alpha.id,
        merchantConnection: merchant.id,
        providerKey: 'deterministic-test',
        railKey: '13b-card',
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
    state = {
      alpha: alpha.id,
      beta: beta.id,
      owner: owner.id,
      second: second.id,
      staff: staff.id,
      foreign: foreign.id,
      merchant: merchant.id,
      alternate: alternate.id,
      betaMerchant: bm.id,
      capability: cap.id,
    }
  }
  await startWeb()
  const operator = await session(await row('users', state.owner)),
    second = await session(await row('users', state.second)),
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
  const event = async (attemptId: string, kind: string, eventId: string, amountMinor?: string) => {
    const a = await row('payment-attempts', attemptId),
      signed = signDeterministicWebhook({
        providerEventId: eventId,
        providerReference: a.providerReference,
        kind,
        amountMinor: amountMinor ?? a.amountMinor,
        currency: a.currency,
        occurredAt: new Date().toISOString(),
        sanitizedEvidence: { source: '13b-local-adapter' },
      })
    return json('/api/commerce/webhooks/deterministic-test', '', 'POST', signed.raw, 202, {
      'x-commerce-signature': signed.signature,
    })
  }
  if (!restart) {
    const art = await sharp({
      create: { width: 1600, height: 1600, channels: 4, background: '#335577' },
    })
      .png()
      .toBuffer()
    const upload = async (site: string, small = false) => {
      const form = new FormData()
      form.set('siteId', site)
      form.set('title', '13B artwork')
      form.set(
        'file',
        new File([small ? await sharp(art).resize(80, 80).png().toBuffer() : art], 'art13b.png', {
          type: 'image/png',
        }),
      )
      const asset = (await json('/api/media/upload', operator, 'POST', form, 201)).asset
      await json(`/api/media-assets/${asset.id}`, operator, 'PATCH', {
        rightsStatus: 'approved',
        publicPolicy: 'private',
      })
      return asset.id
    }
    state.art = await upload(state.alpha)
    state.foreignArt = await upload(state.beta)
    state.smallArt = await upload(state.alpha, true)
    const connection = async (site: string, merchant: string, key = 'pod-emulator') =>
      (
        await json(
          '/api/pod-connections',
          operator,
          'POST',
          {
            site,
            merchantConnection: merchant,
            label: `13B ${key} local planning`,
            providerKey: key,
            encryptedApiKey: encryptCredential('13b-local-harness-not-live'),
            status: 'active',
            capabilities: EMULATOR_CAPABILITIES,
          },
          201,
        )
      ).doc.id
    state.connection = await connection(state.alpha, state.merchant, 'printful')
    state.foreignConnection = await connection(state.beta, state.betaMerchant)
    state.otherConnection = await connection(state.alpha, state.alternate)
    state.unconfigured = await connection(state.alpha, state.merchant, 'printful')
    const product = async (pod: boolean, suffix = '') =>
      (
        await json(
          '/api/products',
          operator,
          'POST',
          {
            site: state.alpha,
            merchantConnection: state.merchant,
            name: pod ? '13B printed shirt' : '13B manual book',
            slug: (pod ? 'shirt13b' : 'book13b') + suffix,
            canonicalPath: (pod ? '/store/shirt13b' : '/store/book13b') + suffix,
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
            offers: (suffix === 'eur' ? ['EUR'] : ['USD', 'EUR']).map((currency) => ({
              offerId: `13b-${pod ? 'pod' : 'manual'}-${currency}`,
              version: 1,
              status: 'active',
              amountMinor: pod ? '2000' : '1000',
              currency,
              taxDisplay: 'exclusive',
            })),
          },
          201,
        )
      ).doc.id
    state.manual = await product(false)
    state.pod = await product(true)
    state.eurPod = await product(true, 'eur')
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
    const save = (value: any, cookie = operator, expected = 200) =>
      json(
        '/api/admin/fulfillment',
        cookie,
        'POST',
        { action: 'save-mapping', productId: state.pod, mapping: value },
        expected,
      )
    await save(mapping(), staff, 403)
    await save(mapping(), foreign, 403)
    await json(
      `/api/products/${state.pod}`,
      staff,
      'PATCH',
      { podMappings: [{ reviewStatus: 'approved' }] },
      403,
    )
    await json(
      '/api/pod-connections',
      staff,
      'POST',
      {
        site: state.alpha,
        merchantConnection: state.merchant,
        providerKey: 'printful',
        label: 'forged',
        encryptedApiKey: 'not-encrypted',
      },
      403,
    )
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'save-mapping', productId: state.pod, mapping: mapping() },
      403,
      { origin: 'https://foreign.test' },
    )
    check(
      'wrong-role, foreign-site, native mapping bypass, provider configuration overreach and foreign origin rejected before persistence',
      (await row('products', state.pod)).podMappings == null,
    )
    await save(mapping({ connectionId: state.foreignConnection }), operator, 400)
    await save(mapping({ connectionId: state.otherConnection }), operator, 400)
    await save(
      mapping({
        printAreas: [
          {
            mediaAssetId: state.foreignArt,
            area: 'front',
            placement: { topMm: 50, leftMm: 50, widthMm: 100, heightMm: 100 },
          },
        ],
      }),
      operator,
      400,
    )
    await save(
      mapping({
        printAreas: [
          {
            mediaAssetId: state.smallArt,
            area: 'front',
            placement: { topMm: 50, leftMm: 50, widthMm: 100, heightMm: 100 },
          },
        ],
      }),
      operator,
      400,
    )
    await save(mapping({ remoteVariantId: 'emu-tee-s-blk' }), operator, 400)
    await save(
      mapping({
        printAreas: [
          {
            mediaAssetId: state.art,
            area: 'front',
            placement: { topMm: 0, leftMm: 0, widthMm: 100, heightMm: 100 },
          },
        ],
      }),
      operator,
      400,
    )
    check(
      'provider/site/merchant, foreign artwork, insufficient pixels, wrong provider variant and template placement fail preflight',
      (await row('products', state.pod)).podMappings == null,
    )
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'save-mapping',
      productId: state.manual,
      mapping: { mode: 'manual', variantSku: 'MANUAL' },
    })
    const saved = (await save(mapping())).mapping
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'save-mapping',
      productId: state.eurPod,
      mapping: mapping(),
    })
    state.mappingVersion = saved.version
    check(
      'reviewed mappings pin real private artwork bytes and adapter-observed variant/cost, ignoring caller-supplied cost',
      saved.snapshot.costMinor === '1250' &&
        saved.providerMode === 'deterministic-emulator' &&
        saved.artworkEvidence[0].width === 1600 &&
        saved.reviewedBy === state.owner,
    )
    await release(state.manual, operator)
    await release(state.pod, operator)
    await release(state.eurPod, operator)
    const publicProduct = await json(`/api/products/${state.pod}`)
    const visibleConnection = await json(`/api/pod-connections/${state.connection}`, staff)
    check(
      'public catalog hides private mapping/artwork metadata and operator reads do not expose credentials',
      publicProduct.id === state.pod &&
        publicProduct.podMappings === undefined &&
        visibleConnection.encryptedApiKey === undefined,
    )
    startWorker()
    const prepare = async (currency = 'USD', quotePatch: any = {}) => {
      const ctx = await newContext()
      if (currency === 'USD')
        await api(ctx, '/api/commerce/cart', {
          productId: state.manual,
          variantSku: 'MANUAL',
          quantity: 1,
        })
      await api(ctx, '/api/commerce/cart', {
        productId: currency === 'EUR' ? state.eurPod : state.pod,
        variantSku: 'POD-M',
        quantity: 1,
      })
      const proposal = (
        await api(ctx, '/api/commerce/proposal', {
          ...addressQuote('buyer@13b.test', 'Local recipient'),
          ...quotePatch,
        })
      ).proposal
      return { ctx, proposal }
    }
    const wrongCurrency = await prepare('EUR')
    await api(
      wrongCurrency.ctx,
      '/api/commerce/checkout/initiate',
      { proposalId: wrongCurrency.proposal.id, capabilityId: state.capability },
      409,
    )
    await wrongCurrency.ctx.close()
    const poBox = await prepare('USD', {
      shippingAddress: {
        ...addressQuote('b@13b.test', 'Local').shippingAddress,
        line1: 'PO Box 123',
      },
    })
    await api(
      poBox.ctx,
      '/api/commerce/checkout/initiate',
      { proposalId: poBox.proposal.id, capabilityId: state.capability },
      409,
    )
    await poBox.ctx.close()
    check(
      'currency and provider PO Box policy reject checkout before a payment attempt or job exists',
      (await find('payment-attempts', {})).length === 0 &&
        (await find('pod-jobs', {})).length === 0,
    )
    const first = await prepare()
    state.first = await api(first.ctx, '/api/commerce/checkout/initiate', {
      proposalId: first.proposal.id,
      capabilityId: state.capability,
    })
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'reconcile-plan', checkoutSessionId: state.first.sessionId },
      409,
    )
    await json(
      '/api/pod-jobs',
      operator,
      'POST',
      {
        site: state.alpha,
        order: state.first.sessionId,
        providerKey: 'printful',
        state: 'created',
      },
      403,
    )
    check(
      'unpaid physical checkout and native job forgery cannot create fulfillment or a provider order',
      (await find('pod-jobs', {})).length === 0 &&
        (await find('manual-fulfillment-packages', {})).length === 0,
    )
    const page = await first.ctx.newPage()
    await page.goto(new URL(state.first.actionUrl, base).href)
    await page.getByRole('button', { name: /confirm/i }).click()
    await until('first paid order planned', async () => {
      const o = await orderFor(state.first.sessionId)
      return Boolean(o?.fulfillmentExtension?.planId)
    })
    state.firstOrder = (await orderFor(state.first.sessionId)).id
    state.firstJob = (await jobsFor(state.firstOrder))[0].id
    const frozen = await plan(state.firstOrder)
    check(
      'real confirmation UI -> signed local payment -> actual worker persists paid mixed order, full plan, manual package and held POD job',
      frozen.podJobsCount === 1 &&
        frozen.manualPackagesCount === 1 &&
        (await jobsFor(state.firstOrder))[0].state === 'on_hold' &&
        (await manualFor(state.firstOrder)).length === 1,
    )
    await Promise.all([
      json('/api/admin/fulfillment', operator, 'POST', {
        action: 'reconcile-plan',
        orderId: state.firstOrder,
      }),
      json('/api/admin/fulfillment', operator, 'POST', {
        action: 'reconcile-plan',
        orderId: state.firstOrder,
      }),
    ])
    const paidInbox = (
      await find('payment-webhook-events', {
        providerEventId: { equals: `local-test-paid:${state.first.attemptId}` },
      })
    )[0]
    const replayRaw = signDeterministicWebhook({
      providerEventId: paidInbox.providerEventId,
      providerReference: (await row('payment-attempts', state.first.attemptId)).providerReference,
      kind: 'succeeded',
      amountMinor: state.first.amountMinor,
      currency: 'USD',
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { source: '13b-replay' },
    })
    await json('/api/commerce/webhooks/deterministic-test', '', 'POST', replayRaw.raw, 200, {
      'x-commerce-signature': replayRaw.signature,
    })
    check(
      'concurrent plan retries and duplicate payment callback retain one package of each kind',
      (await jobsFor(state.firstOrder)).length === 1 &&
        (await manualFor(state.firstOrder)).length === 1,
    )
    const control = async (data: any) => {
      const result = await fetch('http://127.0.0.1:39026/control', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.RENEGADE_POD_SIMULATOR_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(data),
      })
      assert.equal(result.status, 200)
    }
    const action = (name: string, jobId: string, cookie = operator, expected = 200) =>
      json('/api/admin/fulfillment', cookie, 'POST', { action: name, jobId }, expected)
    await action('release-pod-hold', state.firstJob)
    await action('submit-pod-job', state.firstJob, staff, 403)
    await action('submit-pod-job', state.firstJob, foreign, 403)
    await action('submit-pod-job', state.firstJob, '', 403)
    check(
      'staff, foreign-site and anonymous provider submission denied with zero attempts',
      (await row('pod-jobs', state.firstJob)).attemptCount === 0,
    )
    const submits = await Promise.all([
      request('/api/admin/fulfillment', operator, 'POST', {
        action: 'submit-pod-job',
        jobId: state.firstJob,
      }),
      request('/api/admin/fulfillment', operator, 'POST', {
        action: 'submit-pod-job',
        jobId: state.firstJob,
      }),
    ])
    assert.deepEqual(submits.map((r) => r.status).sort(), [200, 409])
    const firstJob = await row('pod-jobs', state.firstJob)
    check(
      'concurrent Printful simulator submit persists one request/actual provider ID and one reserved attempt',
      firstJob.state === 'submitted' &&
        firstJob.attemptCount === 1 &&
        firstJob.externalOrderId.startsWith('sim-') &&
        firstJob.auditTrail.some((a: any) => a.action === 'provider_request_reserved') &&
        firstJob.auditTrail.some((a: any) => a.details?.providerStatus === 'simulated:submitted'),
    )
    await control({ externalOrderId: firstJob.externalOrderId, state: 'in_production' })
    await action('reconcile-pod-job', state.firstJob)
    check(
      'operator polling persists actual simulator production outcome',
      (await row('pod-jobs', state.firstJob)).state === 'in_production',
    )
    await control({ externalOrderId: firstJob.externalOrderId, state: 'shipped' })
    await action('reconcile-pod-job', state.firstJob)
    check(
      'explicit local simulator shipment remains labeled simulator, with actual response request ID',
      (await row('pod-jobs', state.firstJob)).state === 'shipped' &&
        (await row('pod-jobs', state.firstJob)).auditTrail.at(-1).details.evidenceClass ===
          'deterministic-emulator',
    )
    const op = await newContext()
    await op.addCookies([{ name: 'renegade-passkey', value: operator.split('=')[1], url: base }])
    const opPage = await op.newPage()
    await opPage.goto(`${base}/admin/fulfillment`)
    await opPage.getByRole('heading', { name: `Job ${state.firstJob}`, exact: true }).waitFor()
    await opPage.getByText(firstJob.externalOrderId, { exact: false }).first().waitFor()
    await opPage.screenshot({ path: `${out}/operator.png`, fullPage: true })
    check(
      'operator UI refetch displays persisted provider order and shipped simulator observation',
      (await opPage.textContent('body'))?.includes('simulated:shipped'),
    )
    await op.close()
    state.printifyConnection = await connection(state.alpha, state.merchant, 'printify')
    await save(mapping({ connectionId: state.printifyConnection }))
    await release(state.pod, operator)
    const secondCheckout = await prepare()
    const secondIntent = await api(secondCheckout.ctx, '/api/commerce/checkout/initiate', {
      proposalId: secondCheckout.proposal.id,
      capabilityId: state.capability,
    })
    const secondPage = await secondCheckout.ctx.newPage()
    await secondPage.goto(new URL(secondIntent.actionUrl, base).href)
    await secondPage.getByRole('button', { name: /confirm/i }).click()
    await until('Printify paid plan', async () =>
      Boolean((await orderFor(secondIntent.sessionId))?.fulfillmentExtension?.planId),
    )
    state.secondOrder = (await orderFor(secondIntent.sessionId)).id
    state.secondJob = (await jobsFor(state.secondOrder))[0].id
    await action('release-pod-hold', state.secondJob)
    await control({ connectionId: state.printifyConnection, next: 'lost-response' })
    await action('submit-pod-job', state.secondJob, operator, 409)
    check(
      'lost Printify simulator response persists exception, one attempt and no fabricated provider ID',
      (await row('pod-jobs', state.secondJob)).state === 'exception' &&
        (await row('pod-jobs', state.secondJob)).attemptCount === 1 &&
        !(await row('pod-jobs', state.secondJob)).externalOrderId,
    )
    await action('submit-pod-job', state.secondJob, operator, 409)
    await action('cancel-pod-job', state.secondJob, operator, 400)
    await action('reconcile-pod-job', state.secondJob, foreign, 403)
    await action('reconcile-pod-job', state.secondJob, staff, 403)
    check(
      'unknown outcome blocks resubmit/cancel and unauthorized repair',
      (await row('pod-jobs', state.secondJob)).attemptCount === 1 &&
        (await manualFor(state.secondOrder)).length === 1,
    )
    await action('reconcile-pod-job', state.secondJob)
    check(
      'stable request lookup recovers actual persisted Printify simulator order without a second submission',
      (await row('pod-jobs', state.secondJob)).state === 'submitted' &&
        (await row('pod-jobs', state.secondJob)).externalOrderId?.startsWith('sim-') &&
        (await row('pod-jobs', state.secondJob)).attemptCount === 1,
    )
    const thirdCheckout = await prepare()
    const thirdIntent = await api(thirdCheckout.ctx, '/api/commerce/checkout/initiate', {
      proposalId: thirdCheckout.proposal.id,
      capabilityId: state.capability,
    })
    const thirdPage = await thirdCheckout.ctx.newPage()
    await thirdPage.goto(new URL(thirdIntent.actionUrl, base).href)
    await thirdPage.getByRole('button', { name: /confirm/i }).click()
    await until('rejection paid plan', async () =>
      Boolean((await orderFor(thirdIntent.sessionId))?.fulfillmentExtension?.planId),
    )
    state.thirdOrder = (await orderFor(thirdIntent.sessionId)).id
    state.thirdJob = (await jobsFor(state.thirdOrder))[0].id
    await action('release-pod-hold', state.thirdJob)
    await control({ connectionId: state.printifyConnection, next: 'reject' })
    await action('submit-pod-job', state.thirdJob, operator, 409)
    check(
      'actual known provider rejection persists failed state and redacted diagnostic',
      (await row('pod-jobs', state.thirdJob)).state === 'failed' &&
        (await row('pod-jobs', state.thirdJob)).lastError.includes('invalid-request'),
    )
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'retry-pod-job', jobId: state.thirdJob },
      409,
    )
    await json(
      '/api/admin/fulfillment',
      staff,
      'POST',
      { action: 'retry-pod-job', jobId: state.thirdJob, reason: 'forged' },
      403,
    )
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'retry-pod-job',
      jobId: state.thirdJob,
      reason: 'Local simulator validation repaired; retry known rejected request',
    })
    check(
      'explicit operator repair retries only known rejection, retaining reason and exactly two attempts',
      (await row('pod-jobs', state.thirdJob)).state === 'submitted' &&
        (await row('pod-jobs', state.thirdJob)).attemptCount === 2 &&
        (await row('pod-jobs', state.thirdJob)).auditTrail.some(
          (a: any) => a.action === 'operator_retry_authorized',
        ),
    )
    const unknown = await connection(state.alpha, state.merchant, 'unsupported-provider')
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'check-provider-health', connectionId: unknown },
      503,
    )
    check(
      'unsupported provider fails safely without substituting another adapter',
      (await row('pod-connections', unknown)).lastHealthStatus === 'unavailable',
    )
    const persisted = JSON.parse(await readFile('scratch/rc113b/provider/state.json', 'utf8'))
    check(
      'actual durable simulator calls retain two distinct provider identities, exact signed artwork requests and unique order identities',
      scopedSimulatorOrders(persisted).length === 3 &&
        Object.values(persisted.orders).some((o: any) => o.provider === 'printful') &&
        Object.values(persisted.orders).some((o: any) => o.provider === 'printify'),
    )
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))
  } else {
    const workerStartedAt = Date.now()
    startWorker()
    await until('fresh worker heartbeat', async () => {
      try {
        return (
          Date.parse(
            JSON.parse(await readFile('scratch/rc113b/heartbeat.json', 'utf8')).observedAt,
          ) >= workerStartedAt
        )
      } catch {
        return false
      }
    })
    check('separate commerce worker restarts and records a fresh durable heartbeat', true)
    const action = (name: string, jobId: string, expected = 200) =>
      json('/api/admin/fulfillment', operator, 'POST', { action: name, jobId }, expected)
    const before = JSON.parse(await readFile('scratch/rc113b/provider/state.json', 'utf8'))
    for (const jobId of [state.firstJob, state.secondJob]) {
      await action('reconcile-pod-job', jobId)
      await action('submit-pod-job', jobId, 409)
      check(
        `provider/DB/web restart retains provider identity and denies duplicate ${jobId}`,
        (await row('pod-jobs', jobId)).attemptCount === 1,
      )
    }
    check(
      'operator-repaired known rejection survives restart without automatic manual production',
      (await row('pod-jobs', state.thirdJob)).state === 'submitted' &&
        (await row('pod-jobs', state.thirdJob)).attemptCount === 2,
    )
    const after = JSON.parse(await readFile('scratch/rc113b/provider/state.json', 'utf8'))
    check(
      'durable provider ledger retains exact order count and original order identity across independent process restart',
      scopedSimulatorOrders(after).length === 3 &&
        JSON.stringify(scopedSimulatorOrders(before).map(([key]) => key)) ===
          JSON.stringify(scopedSimulatorOrders(after).map(([key]) => key)),
    )
    const providerSnapshot = JSON.parse(
      await readFile('scratch/rc113b/provider/state.json', 'utf8'),
    )
    const owned = Object.values(providerSnapshot.orders).find(
      (o: any) => o.connection === state.connection,
    ) as any
    const assetUrl = owned.input.items[0].printAreas[0].artworkUrl
    const correct = await fetch(assetUrl)
    assert.equal(correct.status, 200)
    const { createHash } = await import('node:crypto')
    assert.equal(
      createHash('sha256')
        .update(Buffer.from(await correct.arrayBuffer()))
        .digest('hex'),
      owned.input.items[0].printAreas[0].artworkHash.replace(/^sha256:/, ''),
    )
    for (const [key, value] of [
      ['site', state.beta],
      ['sig', 'forged'],
      ['exp', '0'],
      ['hash', '0'.repeat(64)],
    ]) {
      const forged = new URL(assetUrl)
      forged.searchParams.set(key, value)
      assert.equal((await fetch(forged)).status, 403)
    }
    check(
      'signed private artwork survives restart byte-for-byte; foreign site, forged signature, expired grant and changed checksum are denied',
      true,
    )
    const previousJob = await row('pod-jobs', state.secondJob)
    await json(`/api/pod-connections/${state.printifyConnection}`, operator, 'PATCH', {
      status: 'disabled',
    })
    await action('reconcile-pod-job', state.secondJob, 503)
    assert.equal(
      (await row('pod-jobs', state.secondJob)).externalOrderId,
      previousJob.externalOrderId,
    )
    await json(`/api/pod-connections/${state.printifyConnection}`, operator, 'PATCH', {
      status: 'active',
    })
    await action('reconcile-pod-job', state.secondJob)
    check(
      'disabled provider repair retains persisted provider identity and re-enabling allows reconciliation without resubmission',
      (await row('pod-jobs', state.secondJob)).attemptCount === 1,
    )
    const ctx = await newContext()
    await ctx.addCookies([{ name: 'renegade-passkey', value: operator.split('=')[1], url: base }])
    const page = await ctx.newPage()
    await page.goto(`${base}/admin/fulfillment`)
    await page.getByRole('heading', { name: `Job ${state.firstJob}`, exact: true }).waitFor()
    check(
      'fresh browser context refetches saved provider output after restart',
      (await page.textContent('body'))?.includes('simulated:shipped'),
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
