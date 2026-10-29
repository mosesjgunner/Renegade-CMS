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

assert.equal(process.env.RC1_13A_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5468/rc113a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(process.env.COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED, 'true')

const out = 'docs/rc/evidence/rc1/18-pass/13A'
const base = 'http://localhost:39024'
const betaBase = 'http://127.0.0.1:39024'
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
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39024'],
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
      WORKER_HEARTBEAT_FILE: 'scratch/rc113a/heartbeat.json',
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
const plan = (orderId: string) => row('orders', orderId).then((o: any) => o.fulfillmentExtension)
let state: any = restart ? JSON.parse(await readFile(`${out}/state.json`, 'utf8')) : {}
try {
  if (!restart) {
    const alpha = await payload.create({
      collection: 'sites',
      data: { name: '13A Alpha', slug: 'alpha13a', lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '13A Beta', slug: 'beta13a', lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@13a.test', role: 'owner' },
    })
    const second = await payload.create({
      collection: 'users',
      data: { email: 'second@13a.test', role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@13a.test', role: 'staff' },
    })
    const foreign = await payload.create({
      collection: 'users',
      data: { email: 'foreign@13a.test', role: 'staff' },
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
        label: '13A local payment',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    const alternate = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: alpha.id,
        label: '13A other merchant',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    const bm = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: beta.id,
        label: '13A foreign merchant',
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
        railKey: '13a-card',
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
        sanitizedEvidence: { source: '13a-local-adapter' },
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
      form.set('title', '13A artwork')
      form.set(
        'file',
        new File([small ? await sharp(art).resize(80, 80).png().toBuffer() : art], 'art13a.png', {
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
            label: `13A ${key} local planning`,
            providerKey: key,
            encryptedApiKey: encryptCredential('13a-local-harness-not-live'),
            status: 'active',
            capabilities: EMULATOR_CAPABILITIES,
          },
          201,
        )
      ).doc.id
    state.connection = await connection(state.alpha, state.merchant)
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
            name: pod ? '13A printed shirt' : '13A manual book',
            slug: (pod ? 'shirt13a' : 'book13a') + suffix,
            canonicalPath: (pod ? '/store/shirt13a' : '/store/book13a') + suffix,
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
              offerId: `13a-${pod ? 'pod' : 'manual'}-${currency}`,
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
          ...addressQuote('buyer@13a.test', 'Local recipient'),
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
        ...addressQuote('b@13a.test', 'Local').shippingAddress,
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
      sanitizedEvidence: { source: '13a-replay' },
    })
    await json('/api/commerce/webhooks/deterministic-test', '', 'POST', replayRaw.raw, 200, {
      'x-commerce-signature': replayRaw.signature,
    })
    check(
      'concurrent plan retries and duplicate payment callback retain one package of each kind',
      (await jobsFor(state.firstOrder)).length === 1 &&
        (await manualFor(state.firstOrder)).length === 1,
    )
    const revised = await save(
      mapping({
        printAreas: [
          {
            mediaAssetId: state.art,
            area: 'front',
            placement: { topMm: 50, leftMm: 50, widthMm: 120, heightMm: 100 },
          },
        ],
      }),
    )
    check(
      'later mapping review returns product to draft without changing sold order/job snapshots',
      (await row('products', state.pod)).state === 'draft' &&
        JSON.stringify((await plan(state.firstOrder)).plan) === JSON.stringify(frozen.plan) &&
        (await jobsFor(state.firstOrder))[0].itemsSnapshot[0].podMapping.version ===
          state.mappingVersion,
    )
    await release(state.pod, operator)
    const op = await newContext()
    await op.addCookies([{ name: 'renegade-passkey', value: operator.split('=')[1], url: base }])
    const opPage = await op.newPage()
    await opPage.goto(`${base}/admin/fulfillment`)
    await opPage.getByLabel('Planning site ID').fill(state.alpha)
    await opPage.getByRole('button', { name: 'Load plans and mappings' }).click()
    await opPage.getByText('Stored plans and mappings loaded.').waitFor()
    const rejectConsent = opPage.getByRole('button', { name: 'Reject non-essential' })
    if (await rejectConsent.isVisible()) await rejectConsent.click()
    await opPage
      .getByText((await row('orders', state.firstOrder)).orderNumber, { exact: false })
      .first()
      .click()
    await opPage.screenshot({ path: `${out}/operator.png`, fullPage: true })
    check(
      'normal operator UI displays the persisted plan plus held job and manual queue',
      (await opPage.getByText('podJobsCount', { exact: false }).count()) > 0,
    )
    await opPage.getByRole('button', { name: 'Manual queue (1)' }).click()
    await opPage.getByText('pending_acknowledgement', { exact: true }).waitFor()
    await opPage
      .getByRole('heading', {
        name: `Package ${(await manualFor(state.firstOrder))[0].id}`,
        exact: true,
      })
      .waitFor()
    await opPage.screenshot({ path: `${out}/manual-package.png`, fullPage: true })
    await op.close()
    const blocked = await prepare()
    state.blocked = await api(blocked.ctx, '/api/commerce/checkout/initiate', {
      proposalId: blocked.proposal.id,
      capabilityId: state.capability,
    })
    await json(`/api/pod-connections/${state.connection}`, operator, 'PATCH', {
      status: 'disabled',
    })
    const bp = await blocked.ctx.newPage()
    await bp.goto(new URL(state.blocked.actionUrl, base).href)
    await bp.getByRole('button', { name: /confirm/i }).click()
    await until('blocked paid order', async () => {
      const o = await orderFor(state.blocked.sessionId)
      return o?.state === 'paid' && o.fulfillmentExtension?.status === 'blocked'
    })
    state.blockedOrder = (await orderFor(state.blocked.sessionId)).id
    check(
      'provider disabled after checkout preserves real paid order but creates no deliverable jobs',
      (await jobsFor(state.blockedOrder)).length === 0 &&
        (await manualFor(state.blockedOrder)).length === 0,
    )
    await json(`/api/pod-connections/${state.connection}`, operator, 'PATCH', { status: 'active' })
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'reconcile-plan',
      orderId: state.blockedOrder,
    })
    state.overrideJob = (await jobsFor(state.blockedOrder))[0].id
    await json(
      '/api/admin/fulfillment',
      staff,
      'POST',
      {
        action: 'override-manual',
        orderId: state.blockedOrder,
        jobId: state.overrideJob,
        reason: 'overreach',
      },
      403,
    )
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'override-manual',
      orderId: state.blockedOrder,
      jobId: state.overrideJob,
      reason: 'Local operator chooses manual production',
    })
    const overrideReplay = await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'override-manual',
      orderId: state.blockedOrder,
      jobId: state.overrideJob,
      reason: 'retry',
    })
    check(
      'authorized operator repair and manual override persist audit and deduplicate, while staff override is denied',
      (await manualFor(state.blockedOrder)).length === 2 &&
        (await row('pod-jobs', state.overrideJob)).state === 'cancelled' &&
        overrideReplay.replay &&
        (await plan(state.blockedOrder)).activePodJobsCount === 0,
    )
    await json(
      '/api/admin/fulfillment',
      foreign,
      'POST',
      { action: 'reconcile-plan', orderId: state.firstOrder },
      403,
    )
    await json(`/api/admin/fulfillment?siteId=${state.alpha}`, foreign, 'GET', undefined, 403)
    await json(
      '/api/admin/fulfillment',
      '',
      'POST',
      { action: 'reconcile-plan', orderId: state.firstOrder },
      403,
    )
    check(
      'foreign-site and anonymous fulfillment instructions cannot access or mutate saved plans',
      (await jobsFor(state.firstOrder)).length === 1,
    )
    const partial = await json('/api/admin/commerce/refunds', operator, 'POST', {
      action: 'request',
      orderId: state.firstOrder,
      amountMinor: '100',
      reason: '13A eligibility partial refund',
    })
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'release-pod-hold', jobId: state.firstJob },
      400,
    )
    const remaining = (
      BigInt((await row('orders', state.firstOrder)).amountMinor) - 100n
    ).toString()
    const full = await json(
      '/api/admin/commerce/refunds',
      operator,
      'POST',
      {
        action: 'request',
        orderId: state.firstOrder,
        amountMinor: remaining,
        reason: '13A remaining refund',
      },
      202,
    )
    await json('/api/admin/commerce/refunds', second, 'POST', {
      action: 'approve',
      refundId: full.refund.id,
    })
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'submit-pod-job', jobId: state.firstJob },
      400,
    )
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'reconcile-plan', orderId: state.firstOrder },
      400,
    )
    check(
      'partial/full refund gates block release, submission and replanning before any provider creation',
      (await row('orders', state.firstOrder)).state === 'refunded' &&
        (await row('pod-jobs', state.firstJob)).attemptCount === 0 &&
        !(await row('pod-jobs', state.firstJob)).externalOrderId,
    )
    const cancelled = await prepare()
    state.cancelled = await api(cancelled.ctx, '/api/commerce/checkout/initiate', {
      proposalId: cancelled.proposal.id,
      capabilityId: state.capability,
    })
    await event(state.cancelled.attemptId, 'cancelled', '13a-cancelled-unpaid')
    await until(
      'cancelled checkout',
      async () => (await row('checkout-sessions', state.cancelled.sessionId)).state === 'cancelled',
    )
    await json(
      '/api/admin/fulfillment',
      operator,
      'POST',
      { action: 'reconcile-plan', checkoutSessionId: state.cancelled.sessionId },
      409,
    )
    check(
      'actual cancelled checkout cannot create a fulfillment plan or provider order',
      !(await orderFor(state.cancelled.sessionId)),
    )
    await stop(worker)
    worker = undefined
    const pending = await prepare()
    state.pending = await api(pending.ctx, '/api/commerce/checkout/initiate', {
      proposalId: pending.proposal.id,
      capabilityId: state.capability,
    })
    const pp = await pending.ctx.newPage()
    await pp.goto(new URL(state.pending.actionUrl, base).href)
    const confirmation = pp.waitForResponse(
      (response) =>
        response.url().endsWith('/api/commerce/checkout/test/confirm') &&
        response.request().method() === 'POST',
    )
    await pp.getByRole('button', { name: /confirm/i }).click()
    assert.equal((await confirmation).status(), 303)
    await until(
      'payment callback durably queued',
      async () =>
        (
          await find('payment-webhook-events', {
            providerEventId: { equals: `local-test-paid:${state.pending.attemptId}` },
          })
        ).length > 0,
    )
    check(
      'real physical payment is left queued with worker stopped for restart acceptance',
      !(await orderFor(state.pending.sessionId)),
    )
    await pending.ctx.storageState({ path: 'scratch/rc113a/browser.json' })
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))
  } else {
    check(
      'stored refund, plan and audited manual override survive PostgreSQL/web restart',
      (await row('orders', state.firstOrder)).state === 'refunded' &&
        (await plan(state.blockedOrder)).activeManualPackagesCount === 2,
    )
    startWorker()
    await until('pending paid plan recovered', async () =>
      Boolean((await orderFor(state.pending.sessionId))?.fulfillmentExtension?.planId),
    )
    const recovered = await orderFor(state.pending.sessionId)
    state.recovered = recovered.id
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'reconcile-plan',
      orderId: recovered.id,
    })
    await json('/api/admin/fulfillment', operator, 'POST', {
      action: 'reconcile-plan',
      orderId: recovered.id,
    })
    check(
      'fresh worker creates exactly one frozen plan/manual package/POD job and retries add no duplicates',
      (await jobsFor(recovered.id)).length === 1 &&
        (await manualFor(recovered.id)).length === 1 &&
        recovered.items.find((l: any) => l.fulfillmentSnapshot?.mode === 'pod').fulfillmentSnapshot
          .version > state.mappingVersion,
    )
    const ctx = await newContext({ storageState: 'scratch/rc113a/browser.json' })
    const page = await ctx.newPage()
    await page.goto(`${base}/checkout/return?session=${state.pending.sessionId}`)
    await page.getByText(/paid/i).first().waitFor()
    check(
      'restored customer browser observes the recovered paid physical order',
      Boolean(await page.textContent('body')),
    )
    const allJobs = await find('pod-jobs', {})
    check(
      'all planning jobs remain unsubmitted with zero provider orders, including refunded/cancelled instructions',
      allJobs.length === 3 &&
        allJobs.every((j: any) => !j.externalOrderId && j.attemptCount === 0) &&
        allJobs.filter((j: any) => j.state === 'cancelled').length === 1,
    )
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))
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
