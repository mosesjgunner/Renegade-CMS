/* eslint-disable @typescript-eslint/no-explicit-any -- isolated PostgreSQL and browser acceptance */
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5476/rc115b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const payload: any = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/15B'
const base = 'http://localhost:39062'
const restart = process.argv.includes('restart')
const runKey = Date.now().toString(36)
const trace: any[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push({ name, passed: true })
  console.log(`PASS ${trace.length}: ${name}`)
}
const state: any = await readFile('scratch/rc115b/state.json', 'utf8')
  .then(JSON.parse)
  .catch(() => ({}))
let web: ChildProcess | undefined
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
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
  cookie = '',
  data?: any,
  expected: number | number[] = 200,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${base}${path}`, {
    method: data ? 'POST' : 'GET',
    headers: {
      cookie,
      origin: base,
      'content-type': 'application/json',
      'user-agent': 'RC1 ordinary API browser',
      ...headers,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
  const text = await response.text()
  assert.ok(
    (Array.isArray(expected) ? expected : [expected]).includes(response.status),
    `${path} ${response.status}: ${text.slice(0, 500)}`,
  )
  return {
    body: text ? JSON.parse(text) : null,
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie,
  }
}
const events = () =>
  payload.find({
    collection: 'analytics-events',
    where: { site: { equals: state.alpha } },
    limit: 100,
    depth: 0,
  })
const save = () => writeFile('scratch/rc115b/state.json', JSON.stringify(state))
try {
  await mkdir('scratch/rc115b', { recursive: true })
  if (!state.alpha) {
    for (const key of ['alpha', 'beta'])
      state[key] = (
        await payload.create({
          collection: 'sites',
          data: { name: `15B ${key}`, slug: `15b-${key}`, lifecycle: 'active' },
        })
      ).id
    for (const role of ['owner', 'staff', 'administrator']) {
      const user = await payload.create({
        collection: 'users',
        data: { email: `${role}@15b.test`, role },
      })
      state[role] = user.id
      await payload.create({
        collection: 'member-site-roles',
        data: {
          member: typeof user.member === 'object' ? user.member.id : user.member,
          site: role === 'administrator' ? state.beta : state.alpha,
          role: 'contributor',
        },
      })
    }
    const ownerRow = await payload.findByID({ collection: 'users', id: state.owner })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof ownerRow.member === 'object' ? ownerRow.member.id : ownerRow.member,
        site: state.beta,
        role: 'contributor',
      },
    })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [state.alpha]: base, [state.beta]: 'http://beta.15b.test' },
        privacy: {
          analyticsEnabled: true,
          consentVersion: '15b-v1',
          respectDoNotTrack: true,
          respectGlobalPrivacyControl: true,
          rawEventRetentionDays: 90,
          rollupRetentionDays: 730,
        },
      },
    })
    const form = await payload.create({
      collection: 'form-definitions',
      data: {
        site: state.alpha,
        name: '15B contact',
        publicPath: '/forms/15b-contact',
        visibility: 'public',
        actions: [],
      },
    })
    const schema = await payload.create({
      collection: 'form-schemas',
      data: {
        form: form.id,
        version: 1,
        state: 'published',
        locale: 'en',
        consentText: 'Contact me about this request.',
        consentRevision: '15b-v1',
        schema: { fields: [{ key: 'email', type: 'email', label: 'Email', required: true }] },
      },
    })
    await payload.update({
      collection: 'form-definitions',
      id: form.id,
      data: { activeSchema: schema.id },
    })
    state.form = form.id
    await save()
  }
  web = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '39062',
    ],
    {
      env: { ...process.env, NODE_ENV: 'development' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const log = createWriteStream(`${out}/${restart ? 'restart-' : ''}web.log`)
  web.stdout!.pipe(log)
  web.stderr!.pipe(log)
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const r = await fetch(`${base}/api/analytics/consent`, { signal: AbortSignal.timeout(5000) })
      if (r.status === 200) {
        ready = true
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  check('Next product API booted with test routes and test auth disabled', ready)
  const owner = await session(state.owner)
  const staff = await session(state.staff)
  const foreign = await session(state.administrator)
  if (!restart) {
    const settings = await payload.findGlobal({ slug: 'site-settings' })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        ...settings,
        launchState: 'live',
        adminExperience: { optionalCapabilities: { commerceCheckout: true } },
      },
    })
    const consent = await api('/api/analytics/consent', '', {
      siteId: state.alpha,
      choices: { necessary: true, analytics: true, personalization: false, marketing: false },
    })
    state.consent = consent.cookie
    const view = {
      siteId: state.alpha,
      id: 'launch-landing-1',
      eventType: 'page_view',
      path: '/events?utm_campaign=launch&utm_source=dispatch&utm_medium=email&email=secret',
    }
    await api('/api/analytics/collect', state.consent, view, 201)
    await api('/api/analytics/collect', state.consent, view, 202)
    await api('/api/analytics/collect', state.consent, { ...view, id: 'launch-landing-2' }, 201)
    check(
      'two observed campaign landings persist; duplicate retry adds none; arbitrary query is discarded',
      (await events()).totalDocs === 2 &&
        !JSON.stringify((await events()).docs).includes('email=secret'),
    )
    const form = await api(
      `/api/forms/${state.form}`,
      state.consent,
      { values: { email: 'buyer@15b.test' }, idempotencyKey: '15b-form-conversion-0001' },
      201,
    )
    state.submission = form.body.submissionId
    await api(
      `/api/forms/${state.form}`,
      state.consent,
      { values: { email: 'buyer@15b.test' }, idempotencyKey: '15b-form-conversion-0001' },
      200,
    )
    check(
      'supported form conversion persists canonical submission with no duplicate analytics',
      (await events()).totalDocs === 3 &&
        Boolean(await payload.findByID({ collection: 'form-submissions', id: state.submission })),
    )
    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: state.alpha,
        label: '15B local adapter',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    const capability = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: state.alpha,
        merchantConnection: merchant.id,
        providerKey: 'deterministic-test',
        railKey: '15b-card',
        family: 'card',
        flow: 'hosted',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['USD'],
        settlementCurrencies: ['USD'],
        enabled: true,
        health: 'healthy',
      },
    })
    const product = (
      await api(
        '/api/products',
        owner,
        {
          site: state.alpha,
          merchantConnection: merchant.id,
          name: '15B Book',
          slug: '15b-book',
          canonicalPath: '/store/15b-book',
          kind: 'physical',
          state: 'draft',
          catalogContractVersion: 1,
          productCapabilities: ['shippable'],
          optionDimensions: [{ key: 'edition', label: 'Edition', values: ['standard'] }],
          variants: [
            {
              sku: '15B-STD',
              title: 'Standard',
              optionValues: { edition: 'standard' },
              status: 'active',
              inventoryPolicy: 'tracked',
              inventoryQuantity: 10,
              weightGrams: 250,
              dimensionsMm: { length: 200, width: 140, height: 15 },
            },
          ],
          offers: [
            {
              offerId: '15b-usd',
              version: 1,
              status: 'active',
              amountMinor: '1750',
              currency: 'USD',
              taxDisplay: 'exclusive',
            },
          ],
        },
        201,
      )
    ).body.doc
    for (const action of ['request-review', 'approve', 'publish']) {
      const response = await fetch(`${base}/api/admin/catalog`, {
        method: 'PATCH',
        headers: { cookie: owner, origin: base, 'content-type': 'application/json' },
        body: JSON.stringify({ productId: product.id, action }),
      })
      assert.equal(response.status, 200, await response.text())
    }
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    })
    await context.addCookies([
      { name: 'renegade-consent', value: state.consent.split('=').slice(1).join('='), url: base },
    ])
    const customer = async (path: string, data?: any) => {
      const response = await context.request.fetch(base + path, {
        method: data ? 'POST' : 'GET',
        headers: { origin: base },
        ...(data ? { data } : {}),
        timeout: 180000,
      })
      assert.equal(response.status(), 200, await response.text())
      return response.json()
    }
    await customer('/api/commerce/cart', {
      productId: product.id,
      variantSku: '15B-STD',
      quantity: 1,
    })
    const proposal = (
      await customer('/api/commerce/proposal', {
        customer: { email: 'buyer@15b.test', name: 'Buyer', country: 'US' },
        shippingAddress: {
          name: 'Buyer',
          line1: '100 Main St',
          city: 'Austin',
          state: 'TX',
          postalCode: '78701',
          country: 'US',
        },
        consents: { termsAccepted: true, privacyAccepted: true },
      })
    ).proposal
    const checkout = await customer('/api/commerce/checkout/initiate', {
      proposalId: proposal.id,
      capabilityId: capability.id,
    })
    state.checkout = checkout.sessionId
    check(
      'ordinary cart, quote and local checkout persist without manufacturing an order',
      (await payload.find({ collection: 'orders' })).totalDocs === 0,
    )
    const confirmed = await context.request.post(base + '/api/commerce/checkout/test/confirm', {
      form: { reference: String(checkout.actionUrl).split('/').at(-1)! },
      maxRedirects: 0,
    })
    assert.equal(confirmed.status(), 303, await confirmed.text())
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    const status = await customer(`/api/commerce/checkout/status?session=${state.checkout}`)
    state.order = status.order.id
    state.amount = status.order.amountMinor
    state.customerCookies = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
    const order = await payload.findByID({ collection: 'orders', id: state.order })
    check(
      'signed local adapter event and real commerce worker produce paid canonical order and receipt',
      order.state === 'paid' &&
        Boolean(order.receipt?.receiptNumber) &&
        state.amount === proposal.pricingSnapshot.grandTotalMinor,
    )
    await customer(`/api/commerce/checkout/status?session=${state.checkout}`)
    check(
      'authorized order status observes one consent-linked payment event across retry',
      (await events()).docs.filter((e: any) => e.eventType === 'payment_completed').length === 1,
    )
    const dashboard = (await api(`/api/admin/telemetry/dashboard?siteId=${state.alpha}`, staff))
      .body
    const funnel = dashboard.campaignFunnels.find((f: any) => f.campaign === 'launch')
    check(
      'campaign totals reconcile two landings, one distinct subject and two canonical conversions',
      funnel.landings === 2 &&
        funnel.uniqueVisitors === 1 &&
        funnel.conversions === 2 &&
        funnel.conversionRate === '100.0',
    )
    check(
      'campaign and financial amount equal persisted order in USD minor units',
      funnel.conversionAmounts.USD === order.amountMinor &&
        dashboard.financialSummary[0].grossMinor === order.amountMinor &&
        dashboard.financialSummary[0].orderCount === 1,
    )
    check(
      'content audience community commerce metrics reconcile exact canonical records',
      dashboard.domainMetrics.contentViews[0].views === 2 &&
        dashboard.domainMetrics.audience.formSubmissions === 1 &&
        dashboard.domainMetrics.commerce.paidOrders === 1 &&
        dashboard.domainMetrics.community.newPosts === 0,
    )
    const separate = (
      await api(`/api/admin/telemetry/funnel?siteId=${state.alpha}&campaign=launch`, staff)
    ).body
    check(
      'funnel endpoint and dashboard use identical definitions and totals',
      JSON.stringify(separate.campaigns[0]) === JSON.stringify(funnel),
    )
    const saved = (await events()).docs.find((e: any) => e.eventType === 'page_view')
    const edge = new URLSearchParams({
      siteId: state.alpha,
      startDate: saved.occurredAt,
      endDate: new Date(Date.parse(saved.occurredAt) + 1).toISOString(),
    })
    const included = (await api(`/api/admin/telemetry/dashboard?${edge}`, staff)).body
    edge.set('startDate', new Date(Date.parse(saved.occurredAt) - 1).toISOString())
    edge.set('endDate', saved.occurredAt)
    const excluded = (await api(`/api/admin/telemetry/dashboard?${edge}`, staff)).body
    check(
      'actual PostgreSQL timestamp filter includes start and excludes end',
      included.coreMetrics.pageViews === 1 && excluded.coreMetrics.pageViews === 0,
    )
    const offset = new URLSearchParams({
      siteId: state.alpha,
      startDate: '2026-11-01T01:00:00-05:00',
      endDate: '2026-11-01T01:00:00-06:00',
    })
    const dst = (await api(`/api/admin/telemetry/dashboard?${offset}`, staff)).body
    check(
      'DST repeated-hour offsets select distinct UTC instants',
      dst.dateWindow.start === '2026-11-01T06:00:00.000Z' &&
        dst.dateWindow.end === '2026-11-01T07:00:00.000Z',
    )
    for (const path of ['dashboard', 'funnel']) {
      await api(`/api/admin/telemetry/${path}?siteId=${state.alpha}`, foreign, undefined, 403)
      await api(`/api/admin/telemetry/${path}?siteId=${state.alpha}`, '', undefined, 403)
      await api(
        `/api/admin/telemetry/${path}?siteId=${state.alpha}&startDate=invalid`,
        staff,
        undefined,
        400,
      )
    }
    check('both reporting APIs deny wrong-site and anonymous role and reject malformed dates', true)
    await api('/api/analytics/collect', state.consent, { ...view, id: 'gpc-suppressed' }, 202, {
      'sec-gpc': '1',
    })
    check(
      'GPC suppresses an otherwise consented observation',
      !(await events()).docs.some((e: any) => e.context.sourceEventId === 'gpc-suppressed'),
    )
    const euroCapability = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: state.alpha,
        merchantConnection: merchant.id,
        providerKey: 'deterministic-test',
        railKey: '15b-euro',
        family: 'card',
        flow: 'hosted',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['EUR'],
        settlementCurrencies: ['EUR'],
        enabled: true,
        health: 'healthy',
      },
    })
    const euroProduct = (
      await api(
        '/api/products',
        owner,
        {
          site: state.alpha,
          merchantConnection: merchant.id,
          name: '15B Euro Book',
          slug: '15b-euro-book',
          canonicalPath: '/store/15b-euro-book',
          kind: 'physical',
          state: 'draft',
          catalogContractVersion: 1,
          productCapabilities: ['shippable'],
          optionDimensions: [{ key: 'edition', label: 'Edition', values: ['standard'] }],
          variants: [
            {
              sku: '15B-EUR',
              title: 'Standard',
              optionValues: { edition: 'standard' },
              status: 'active',
              inventoryPolicy: 'tracked',
              inventoryQuantity: 10,
              weightGrams: 250,
              dimensionsMm: { length: 200, width: 140, height: 15 },
            },
          ],
          offers: [
            {
              offerId: '15b-eur',
              version: 1,
              status: 'active',
              amountMinor: '2100',
              currency: 'EUR',
              taxDisplay: 'exclusive',
            },
          ],
        },
        201,
      )
    ).body.doc
    for (const action of ['request-review', 'approve', 'publish']) {
      const r = await fetch(`${base}/api/admin/catalog`, {
        method: 'PATCH',
        headers: { cookie: owner, origin: base, 'content-type': 'application/json' },
        body: JSON.stringify({ productId: euroProduct.id, action }),
      })
      assert.equal(r.status, 200, await r.text())
    }
    const euroContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 Chrome/145.0.0.0 Safari/537.36',
    })
    const euroCall = async (path: string, data?: any) => {
      const response = await euroContext.request.fetch(base + path, {
        method: data ? 'POST' : 'GET',
        headers: { origin: base },
        ...(data ? { data } : {}),
        timeout: 180000,
      })
      assert.equal(response.status(), 200, await response.text())
      return response.json()
    }
    await euroCall('/api/commerce/cart', {
      productId: euroProduct.id,
      variantSku: '15B-EUR',
      quantity: 1,
    })
    const euroQuote = (
      await euroCall('/api/commerce/proposal', {
        customer: { email: 'euro@15b.test', name: 'Euro Buyer', country: 'US' },
        shippingAddress: {
          name: 'Euro Buyer',
          line1: '100 Main St',
          city: 'Austin',
          state: 'TX',
          postalCode: '78701',
          country: 'US',
        },
        consents: { termsAccepted: true, privacyAccepted: true },
      })
    ).proposal
    const euroCheckout = await euroCall('/api/commerce/checkout/initiate', {
      proposalId: euroQuote.id,
      capabilityId: euroCapability.id,
    })
    const euroConfirmed = await euroContext.request.post(
      base + '/api/commerce/checkout/test/confirm',
      { form: { reference: String(euroCheckout.actionUrl).split('/').at(-1)! }, maxRedirects: 0 },
    )
    assert.equal(euroConfirmed.status(), 303, await euroConfirmed.text())
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    const euroStatus = await euroCall(
      `/api/commerce/checkout/status?session=${euroCheckout.sessionId}`,
    )
    state.euroAmount = euroStatus.order.amountMinor
    const currencies = (await api(`/api/admin/telemetry/dashboard?siteId=${state.alpha}`, staff))
      .body
    check(
      'two ordinary locally settled orders remain separated as exact USD and EUR canonical amounts',
      currencies.financialSummary.length === 2 &&
        currencies.financialSummary.find((r: any) => r.currency === 'USD').grossMinor ===
          state.amount &&
        currencies.financialSummary.find((r: any) => r.currency === 'EUR').grossMinor ===
          state.euroAmount,
    )
    check(
      'unconsented EUR order contributes canonical commerce but never inferred campaign credit',
      currencies.campaignFunnels.find((r: any) => r.campaign === 'launch').conversionAmounts.EUR ===
        undefined &&
        (await events()).docs.filter((r: any) => r.eventType === 'payment_completed').length === 1,
    )
    await writeFile(
      `${out}/currency-reconciliation.json`,
      JSON.stringify(
        {
          financialSummary: currencies.financialSummary,
          domainMetrics: currencies.domainMetrics,
          unconsentedEuroOrder: euroStatus.order,
        },
        null,
        2,
      ),
    )
    const beta = (await api(`/api/admin/telemetry/dashboard?siteId=${state.beta}`, owner)).body
    check(
      'empty other site exposes no campaign, content, order or financial data',
      beta.coreMetrics.totalEvents === 0 &&
        beta.campaignFunnels.length === 0 &&
        beta.financialSummary.length === 0,
    )
    const page = await context.newPage()
    const adminContext = await browser.newContext()
    await adminContext.addCookies([
      { name: 'renegade-passkey', value: owner.split('=').slice(1).join('='), url: base },
    ])
    const adminPage = await adminContext.newPage()
    await adminPage.goto(base + '/admin/telemetry', { timeout: 180000 })
    await expect(adminPage.getByRole('region', { name: 'Reporting definitions' })).toContainText(
      'never people',
      { timeout: 90000 },
    )
    await adminPage.getByRole('button', { name: 'Reject non-essential', exact: true }).click()
    await adminPage.getByLabel('Select Site').selectOption(state.alpha)
    await expect(adminPage.getByText('launch', { exact: true })).toBeVisible({ timeout: 90000 })
    await adminPage.getByLabel('Select Site').selectOption(state.beta)
    await expect(adminPage.getByRole('region', { name: 'Reporting definitions' })).toContainText(
      'No eligible campaign landings',
      { timeout: 90000 },
    )
    await adminPage.getByLabel('Select Site').selectOption(state.alpha)
    await expect(adminPage.getByText('launch', { exact: true })).toBeVisible({ timeout: 90000 })
    check('admin site selector renders isolated empty site then restores actual campaign', true)
    await adminPage
      .getByLabel('End instant, exclusive (ISO with timezone)')
      .fill('2028-11-01T00:00:00Z')
    await adminPage.getByLabel('End instant, exclusive (ISO with timezone)').press('Tab')
    await expect(adminPage.getByRole('region', { name: 'Reporting definitions' })).toContainText(
      '2028-11-01T00:00:00.000Z',
      { timeout: 90000 },
    )
    await adminPage.getByLabel('Start instant (ISO with timezone)').fill('2027-11-01T00:00:00Z')
    await adminPage.getByLabel('Start instant (ISO with timezone)').press('Tab')
    await expect(adminPage.getByRole('region', { name: 'Reporting definitions' })).toContainText(
      'No eligible campaign landings',
      { timeout: 90000 },
    )
    await adminPage.getByLabel('Start instant (ISO with timezone)').fill('')
    await adminPage.getByLabel('Start instant (ISO with timezone)').press('Tab')
    await expect(adminPage.getByRole('region', { name: 'Reporting definitions' })).toContainText(
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      { timeout: 90000 },
    )
    await adminPage.getByLabel('End instant, exclusive (ISO with timezone)').fill('')
    await adminPage.getByLabel('End instant, exclusive (ISO with timezone)').press('Tab')
    await expect(adminPage.getByText('launch', { exact: true })).toBeVisible({ timeout: 90000 })
    check(
      'admin custom date filters show no data then recover canonical campaign after clearing',
      true,
    )
    await adminPage.screenshot({ path: `${out}/admin-dashboard.png`, fullPage: true })
    check(
      'actual admin UI renders observed campaign and definitions with fixture operator session',
      true,
    )
    await page.goto(base + '/events?utm_campaign=browser&utm_source=dispatch&utm_medium=email', {
      timeout: 180000,
    })
    await expect
      .poll(
        async () =>
          (await events()).docs.some((e: any) => e.context.utm?.utm_campaign === 'browser'),
        { timeout: 90000 },
      )
      .toBe(true)
    check(
      'real browser URL campaign reaches canonical collector without arbitrary identity inference',
      true,
    )
    await api('/api/analytics/consent', state.consent, {
      siteId: state.alpha,
      choices: { necessary: true, analytics: false, personalization: false, marketing: false },
    })
    const withdrawn = (await api(`/api/admin/telemetry/dashboard?siteId=${state.alpha}`, staff))
      .body
    check(
      'withdrawal suppresses linked visitor and conversions while canonical commerce remains',
      withdrawn.coreMetrics.totalEvents === 0 &&
        withdrawn.campaignFunnels.length === 0 &&
        withdrawn.financialSummary.find((r: any) => r.currency === 'USD').grossMinor ===
          state.amount,
    )
    await api('/api/analytics/collect', state.consent, { ...view, id: 'suppressed-retry' }, 202)
    await api('/api/analytics/collect', '', { ...view, id: 'anonymous' }, 202)
    check(
      'old consent and anonymous traffic remain excluded after suppression',
      (await events()).totalDocs === 0,
    )
    state.report = withdrawn
    await save()
    await writeFile(
      `${out}/reconciliation.json`,
      JSON.stringify(
        {
          order: {
            id: order.id,
            state: order.state,
            amountMinor: order.amountMinor,
            currency: order.currency,
            receipt: order.receipt.receiptNumber,
          },
          dashboard,
          funnel: separate,
          afterWithdrawal: withdrawn,
        },
        null,
        2,
      ),
    )
  } else {
    const dashboard = (await api(`/api/admin/telemetry/dashboard?siteId=${state.alpha}`, staff))
      .body
    check(
      'web and PostgreSQL restart preserve canonical financial amount',
      dashboard.financialSummary.find((r: any) => r.currency === 'USD').grossMinor ===
        state.amount &&
        dashboard.financialSummary.find((r: any) => r.currency === 'EUR').grossMinor ===
          state.euroAmount &&
        dashboard.financialSummary.length === 2,
    )
    check(
      'restart preserves suppression and removes attributed conversions',
      dashboard.coreMetrics.totalEvents === 0 && dashboard.campaignFunnels.length === 0,
    )
    await api(`/api/commerce/checkout/status?session=${state.checkout}`, state.customerCookies)
    check(
      'withdrawn visitor order-status retry cannot resurrect payment analytics',
      (await events()).totalDocs === 0,
    )
    await api(`/api/admin/telemetry/funnel?siteId=${state.alpha}`, foreign, undefined, 403)
    check('wrong site remains denied after restart', true)
  }
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify({ passed: trace.length, failed: 0, skipped: 0, trace }, null, 2),
  )
} finally {
  await browser?.close()
  if (web?.pid)
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(web!.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.on('exit', () => resolve())
    })
  const pool = payload.db.pool
  const idle = new Set(pool._idle.map((entry: any) => entry.client))
  for (const client of [...pool._clients]) {
    if (!idle.has(client)) {
      assert.ok(!client.activeQuery, 'No active database work during teardown')
      client.release(true)
    }
  }
  await pool.end()
  await payload.destroy()
}
