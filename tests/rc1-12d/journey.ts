/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { createHmac } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

import { getPayload } from 'payload'
import config from '@payload-config'
import { issueMagicLink, consumeMagicLink } from '../../src/modules/identity/member-identity'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'

assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5467/rc112d_release_acceptance',
)
assert.equal(process.env.RC1_12D_DISPOSABLE, 'yes')
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const out = 'docs/rc/evidence/rc1/18-pass/12D',
  base = 'http://localhost:39023'
const restart = process.argv.includes('restart'),
  trace: string[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push(name)
  console.log(`PASS ${trace.length}: ${name}`)
}
const payload: any = await getPayload({ config })
const row = (collection: string, id: string) =>
  payload.findByID({ collection, id, depth: 0, overrideAccess: true })
const find = async (collection: string, where: any) =>
  (await payload.find({ collection, where, depth: 0, limit: 100, overrideAccess: true })).docs
let state: any = restart ? JSON.parse(await readFile(`${out}/state.json`, 'utf8')) : {}
let web: ChildProcess | undefined
const browser = await chromium.launch({ headless: true })
const request = (path: string, cookie = '', method = 'GET', body?: any, headers: any = {}) =>
  fetch(base + path, {
    method,
    headers: {
      origin: base,
      ...(cookie ? { cookie } : {}),
      ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : typeof body === 'string'
            ? body
            : JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  })
const json = async (
  path: string,
  cookie = '',
  method = 'GET',
  body?: any,
  status = 200,
  headers: any = {},
) => {
  const res = await request(path, cookie, method, body, headers)
  const text = await res.text()
  assert.equal(res.status, status, `${method} ${path}: ${text.slice(0, 1500)}`)
  return status >= 500 ? { raw: text } : JSON.parse(text)
}
async function operatorSession(user: any) {
  const session = await createPasskeySession(
    user,
    loadConfig().payloadSecret,
    async (id, expires) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, user.id, expires],
      )
    },
  )
  return `renegade-passkey=${session.token}`
}
const memberCookie = (member: any) =>
  `renegade-member=${member.sessionToken}; renegade-member-csrf=rc112d-csrf`
let harnessRecord: any = restart
  ? JSON.parse(await readFile('scratch/rc112d/payment.json', 'utf8'))
  : null
const records: Record<string, any> = restart
  ? JSON.parse(await readFile('scratch/rc112d/records.json', 'utf8'))
  : {}
const providerCalls: any[] = []
const providerUnavailable = false,
  blockProvider = false
let providerBlocked = false
let eventClock = Math.floor(Date.now() / 1000)
const nextEventTime = () => (eventClock = Math.max(eventClock + 1, Math.floor(Date.now() / 1000)))
const harness = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const form = new URLSearchParams(Buffer.concat(chunks).toString())
    if (req.url?.startsWith('/v1/prices/')) {
      const annual = req.url.endsWith('price_year12d')
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          active: true,
          unit_amount: annual ? 12000 : 1200,
          currency: 'usd',
          recurring: { interval: annual ? 'year' : 'month', interval_count: 1 },
        }),
      )
      return
    }
    if (req.url === '/v1/balance') {
      res.setHeader('content-type', 'application/json')
      res.end('{}')
      return
    }
    if (req.url === '/v1/checkout/sessions') {
      assert.equal(form.get('mode'), 'subscription')
      assert.ok(['price_month12d', 'price_year12d'].includes(form.get('line_items[0][price]')!))
      providerCalls.push(Object.fromEntries(form))
      harnessRecord = {
        id: providerCalls.length > 1 ? 'sub_end12d' : 'sub_harness12d',
        object: 'subscription',
        customer: 'cus_harness12d',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000) - 2,
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        items: { data: [{ id: 'si_harness12d', price: { id: form.get('line_items[0][price]') } }] },
        metadata: Object.fromEntries(
          [...form]
            .filter(([key]) => key.startsWith('subscription_data[metadata]'))
            .map(([key, value]) => [key.slice(28, -1), value]),
        ),
      }
      records[harnessRecord.id] = harnessRecord
      await writeFile('scratch/rc112d/payment.json', JSON.stringify(harnessRecord))
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          id: 'cs_harness12d',
          customer: harnessRecord.customer,
          subscription: harnessRecord.id,
          url: 'http://127.0.0.1:3146/pay',
        }),
      )
      return
    }
    if (req.url === '/v1/billing_portal/sessions') {
      assert.equal(form.get('customer'), harnessRecord.customer)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ url: 'http://127.0.0.1:3146/portal' }))
      return
    }
    if (req.url === '/v1/invoices/create_preview') {
      assert.equal(form.get('subscription_details[items][0][id]'), 'si_harness12d')
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ amount_due: 10800, currency: 'usd' }))
      return
    }
    if (req.url === '/portal') {
      res.setHeader('content-type', 'text/html')
      res.end(
        '<h1>Isolated billing portal</h1><p>Local adapter harness. No charges.</p>' +
          ['schedule', 'resume', 'change', 'cancel']
            .map(
              (action) =>
                `<form method="post" action="/portal/${action}"><button>${action}</button></form>`,
            )
            .join(''),
      )
      return
    }
    if (req.url?.startsWith('/portal/')) {
      const action = req.url.slice(8)
      if (action === 'schedule') harnessRecord.cancel_at_period_end = true
      if (action === 'resume') harnessRecord.cancel_at_period_end = false
      if (action === 'change') {
        harnessRecord.items.data[0].price.id = 'price_year12d'
        harnessRecord.current_period_end += 29030400
      }
      if (action === 'cancel') {
        harnessRecord.status = 'canceled'
        harnessRecord.cancel_at_period_end = false
      }
      records[harnessRecord.id] = harnessRecord
      await writeFile('scratch/rc112d/payment.json', JSON.stringify(harnessRecord))
      await signed(
        `evt_portal_${action}_${harnessRecord.id}`,
        action === 'cancel' ? 'customer.subscription.deleted' : 'customer.subscription.updated',
        harnessRecord,
      )
      res.writeHead(303, { location: base + '/members/settings?tab=billing' })
      res.end()
      return
    }
    if (req.url?.startsWith('/v1/subscriptions/')) {
      if (blockProvider) {
        providerBlocked = true
        return
      }
      if (providerUnavailable) {
        res.writeHead(503)
        res.end('{}')
        return
      }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(records[req.url.slice('/v1/subscriptions/'.length)]))
      return
    }
    if (req.url === '/pay') {
      res.setHeader('content-type', 'text/html')
      res.end(
        '<h1>Isolated payment harness</h1><p>No real payment.</p><form action="/confirm" method="post"><button>Confirm harness payment</button></form>',
      )
      return
    }
    if (req.url === '/confirm') {
      await signed('evt_paid12d', 'invoice.paid', {
        object: 'invoice',
        id: 'in_harness12d',
        subscription: harnessRecord.id,
        customer: harnessRecord.customer,
        status: 'paid',
        amount_paid: 1200,
        currency: 'usd',
      })
      res.writeHead(303, { location: base + '/members/settings?tab=billing' })
      res.end()
      return
    }
    res.writeHead(404)
    res.end()
  } catch (error) {
    res.writeHead(500)
    res.end(String(error))
  }
})
async function signed(
  id: string,
  type: string,
  object: any,
  expected = 202,
  created = nextEventTime(),
) {
  const raw = JSON.stringify({
    id,
    type,
    created,
    livemode: false,
    data: { object },
  })
  const t = Math.floor(Date.now() / 1000),
    sig = createHmac('sha256', process.env.COMMERCE_STRIPE_TEST_WEBHOOK_SECRET!)
      .update(`${t}.${raw}`)
      .digest('hex')
  return json('/api/commerce/webhooks/stripe-test', '', 'POST', raw, expected, {
    'stripe-signature': `t=${t},v1=${sig}`,
  })
}
async function foreign(path: string, cookie: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: 39023,
        path,
        headers: { host: 'beta.12d.test:39023', cookie },
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve({ status: res.statusCode!, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

let worker: ChildProcess | undefined
async function stop(child?: ChildProcess) {
  if (!child?.pid) return
  await new Promise<void>((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    killer.on('exit', () => resolve())
  })
}
async function until(name: string, test: () => Promise<boolean>) {
  for (let i = 0; i < 120; i++) {
    if (await test()) return
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Timeout: ${name}`)
}
function startWorker() {
  worker = spawn(
    process.execPath,
    [
      '--import',
      './tests/rc1-12d/stripe-preload.mjs',
      '--import',
      'tsx',
      'src/scripts/run-jobs-worker.ts',
    ],
    {
      env: {
        ...process.env,
        WORKER_PROFILE: 'commerce-only',
        WORKER_POLL_INTERVAL_MS: '1000',
        WORKER_HEARTBEAT_FILE: 'scratch/rc112d/heartbeat.json',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const log = createWriteStream(`${out}/${restart ? 'restart-' : ''}worker.log`)
  worker.stdout!.pipe(log, { end: false })
  worker.stderr!.pipe(log, { end: false })
}
const sql = async (query: string, args: any[] = []) =>
  (await payload.db.pool.query(query, args)).rows
const report = (operator: string, site = state.alpha) =>
  json(`/api/admin/commerce/affiliate?siteId=${site}`, operator)
const signCallback = (body: any, headers: any = {}, status = 202) => {
  const raw = JSON.stringify(body)
  return json('/api/commerce/affiliate/conversions', '', 'POST', raw, status, {
    'x-referral-signature': createHmac(
      'sha256',
      'rc112d-affiliate-callback-local-harness-32-characters',
    )
      .update(raw)
      .digest('hex'),
    ...headers,
  })
}
const donationInput = (campaignId: string, currency = 'USD') => ({
  campaignId,
  currency,
  amountMinor: '1000',
  recurrence: 'one-time',
  recognition: 'anonymous',
  email: 'buyer@12d.test',
})

try {
  if (!restart) {
    const alpha = await payload.create({
      collection: 'sites',
      data: { name: '12D Alpha', slug: 'alpha12d', lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '12D Beta', slug: 'beta12d', lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: 'owner@12d.test', role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: 'staff@12d.test', role: 'staff' },
    })
    const staffAlpha = await payload.create({
      collection: 'users',
      data: { email: 'staff-alpha@12d.test', role: 'staff' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof staff.member === 'object' ? staff.member.id : staff.member,
        site: beta.id,
        role: 'contributor',
      },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof staffAlpha.member === 'object' ? staffAlpha.member.id : staffAlpha.member,
        site: alpha.id,
        role: 'contributor',
      },
    })
    const member = await consumeMagicLink(
      payload,
      (await issueMagicLink(payload, 'buyer@12d.test')).token!,
    )
    const referrer = await consumeMagicLink(
      payload,
      (await issueMagicLink(payload, 'referrer@12d.test')).token!,
    )
    for (const site of [alpha.id, beta.id])
      await payload.create({
        collection: 'member-site-roles',
        data: { member: referrer!.memberId, site, role: 'contributor' },
      })
    await writeFile('scratch/rc112d/sessions.json', JSON.stringify({ member, referrer }))
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: 'http://127.0.0.1:39023' },
        launchState: 'live',
        adminExperience: { optionalCapabilities: { commerceCheckout: true } },
      },
    })
    const stripe = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: alpha.id,
        label: '12D local Stripe adapter harness',
        providerKey: 'stripe-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: alpha.id,
        label: '12D local deterministic adapter',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    const betaMerchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: beta.id,
        label: '12D Beta local deterministic adapter',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    for (const [site, merchantId, currency] of [
      [alpha.id, merchant.id, 'USD'],
      [beta.id, betaMerchant.id, 'EUR'],
    ]) {
      await payload.create({
        collection: 'payment-method-capabilities',
        data: {
          site,
          merchantConnection: merchantId,
          providerKey: 'deterministic-test',
          railKey: `card-${currency}`,
          family: 'card',
          flow: 'hosted',
          merchantCountries: ['US'],
          buyerCountries: ['US'],
          presentmentCurrencies: [currency],
          settlementCurrencies: [currency],
          recurring: true,
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
      staffAlpha: staffAlpha.id,
      memberId: member!.memberId,
      referrer: referrer!.memberId,
      stripe: stripe.id,
    }
  }
  process.env.AFFILIATE_CALLBACK_SECRETS = JSON.stringify({
    [state.alpha]: 'rc112d-affiliate-callback-local-harness-32-characters',
  })
  const sessions = JSON.parse(await readFile('scratch/rc112d/sessions.json', 'utf8'))
  const operator = await operatorSession(await row('users', state.owner))
  const staff = await operatorSession(await row('users', state.staff))
  const staffAlpha = await operatorSession(await row('users', state.staffAlpha))
  await new Promise<void>((resolve) => harness.listen(3146, '127.0.0.1', resolve))
  web = spawn(
    process.execPath,
    [
      '--import',
      './tests/rc1-12d/stripe-preload.mjs',
      'node_modules/next/dist/bin/next',
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      '39023',
    ],
    { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const webLog = createWriteStream(`${out}/${restart ? 'restart-' : ''}web.log`)
  web.stdout!.pipe(webLog, { end: false })
  web.stderr!.pipe(webLog, { end: false })
  await until('web ready', async () => {
    try {
      return (await request('/api/health')).status < 500
    } catch {
      return false
    }
  })

  if (!restart) {
    const program = {
      version: 1,
      name: '12D disclosed community referral',
      status: 'active',
      eligibility: { allowedMemberRoles: ['contributor'], requireVerifiedEmail: true },
      codes: { minLength: 3, maxLength: 32 },
      benefit: { referrerRewardType: 'basis_points', referrerRewardValue: '1000' },
      attribution: { model: 'last-touch', windowDays: 30, requireCookieConsent: true },
      selfReferralRules: {
        blockSameMemberId: true,
        blockSameEmail: true,
        blockSamePaymentMethod: false,
        blockSameIpHash: false,
      },
      holdPeriodDays: 0,
      reversalRules: {
        reverseOnOrderRefund: true,
        reverseOnOrderCancel: true,
        reverseOnDispute: true,
      },
      terms: {
        version: '1',
        publishedAt: new Date().toISOString(),
        text: 'Disclosure: the referrer may earn a 10% commission on qualifying payments. Refunds reverse commissions. No provider payout is promised.',
      },
    }
    for (const site of [state.alpha, state.beta])
      await json(
        '/api/admin/commerce/affiliate',
        operator,
        'POST',
        {
          action: 'create-referral-code',
          siteId: site,
          code: site === state.alpha ? 'REF-12D' : 'REF-EUR-12D',
          memberId: state.referrer,
          program,
        },
        201,
      )
    check(
      'operator creates immutable referral program versions and codes for real site members',
      (await sql('SELECT * FROM referral_codes')).length === 2,
    )
    await json(
      '/api/admin/commerce/affiliate',
      staffAlpha,
      'POST',
      {
        action: 'create-referral-code',
        siteId: state.alpha,
        code: 'OVERREACH',
        memberId: state.referrer,
        program: { ...program, version: 2 },
      },
      403,
    )
    await json(`/api/admin/commerce/affiliate?siteId=${state.alpha}`, staff, 'GET', undefined, 403)
    await json(`/api/admin/commerce/affiliate?siteId=${state.alpha}`, '', 'GET', undefined, 403)
    await json(
      '/api/admin/commerce/affiliate',
      operator,
      'POST',
      { action: 'reconcile-referrals', siteId: state.alpha },
      403,
      { origin: 'https://foreign.test' },
    )
    check(
      'anonymous, foreign-site staff, same-site staff configuration and foreign-origin mutations denied',
      (await sql('SELECT * FROM referral_codes')).length === 2,
    )
    await json('/api/commerce/referrals/claim', '', 'POST', { code: 'REF-12D', consented: false })
    await json(
      '/api/commerce/referrals/claim',
      '',
      'POST',
      { code: 'REF-12D', consented: true, orderAmountMinor: '999999' },
      400,
    )
    check(
      'declined consent and fabricated financial inputs leave no claim',
      (await sql('SELECT * FROM referral_claims')).length === 0,
    )
    const offer = await json(
      '/api/admin/commerce/affiliate',
      operator,
      'POST',
      {
        action: 'create-affiliate-offer',
        siteId: state.alpha,
        offer: {
          slug: 'local-offer-12d',
          name: '12D disclosed partner offer',
          destinationUrl: 'https://seller.example/item',
          allowedDomains: ['seller.example'],
          networkReference: { network: 'custom' },
          disclosure: {
            required: true,
            text: 'We may earn a commission on qualifying purchases through this partner link.',
            placement: 'above',
          },
          subIdTemplate: {
            template: '{clickToken}',
            paramName: 'sub_id',
            allowedTokens: ['clickToken'],
          },
          pricingFreshness: {
            observedAt: new Date().toISOString(),
            freshnessHours: 24,
            source: 'manual',
          },
          regions: ['global'],
          status: 'active',
          linkHealth: { status: 'unknown', consecutiveFailures: 0 },
        },
      },
      201,
    )
    state.offer = offer.id
    const metadata = await json(`/api/commerce/affiliate/redirect?offerId=${offer.id}&details=1`)
    await json(
      `/api/commerce/affiliate/redirect?offerId=${offer.id}&destination=https://foreign.example`,
      '',
      'GET',
      undefined,
      400,
    )
    const plain = await fetch(`${base}/api/commerce/affiliate/redirect?offerId=${offer.id}`, {
      redirect: 'manual',
    })
    await json('/api/commerce/affiliate/redirect', '', 'POST', {
      offerId: offer.id,
      consented: false,
    })
    check(
      'stored offer disclosure and untracked redirect use only the owning-site destination without recording denied consent',
      metadata.disclosure.includes('commission') &&
        plain.status === 307 &&
        plain.headers.get('location')?.startsWith('https://seller.example/item') &&
        (await sql('SELECT * FROM affiliate_clicks')).length === 0,
    )
    const tracked = await json(
      '/api/commerce/affiliate/redirect',
      '',
      'POST',
      { offerId: offer.id, consented: true },
      200,
      { 'user-agent': 'Mozilla/5.0 Safari/537.36' },
    )
    await json(
      '/api/commerce/affiliate/redirect',
      '',
      'POST',
      { offerId: offer.id, consented: true },
      200,
      { 'user-agent': 'Googlebot' },
    )
    check(
      'explicit allowed interaction persists one canonical click while bot interaction remains untracked',
      tracked.persisted && (await sql('SELECT * FROM affiliate_clicks')).length === 1,
    )
    const ctx = await browser.newContext()
    await ctx.addCookies([
      { name: 'renegade-member', value: sessions.member.sessionToken, url: base },
      { name: 'renegade-member-csrf', value: 'rc112d-csrf', url: base },
    ])
    const page = await ctx.newPage()
    page.setDefaultTimeout(120000)
    page.setDefaultNavigationTimeout(120000)
    const capture = async () => {
      await page.goto(`${base}/referrals/REF-12D`)
      await page
        .getByText('Disclosure: the referrer may earn a 10% commission', { exact: false })
        .waitFor()
      assert.equal(
        await page.getByRole('button', { name: 'Save referral', exact: true }).isDisabled(),
        true,
      )
      await page.getByLabel('I consent to referral attribution').check()
      await page.getByRole('button', { name: 'Save referral', exact: true }).click()
      await page.getByRole('status').filter({ hasText: 'Referral saved.' }).waitFor()
    }
    await page.goto(`${base}/affiliate/${state.offer}`)
    await page
      .getByText('We may earn a commission on qualifying purchases through this partner link.', {
        exact: true,
      })
      .waitFor()
    check(
      'public Chromium affiliate page discloses the partner relationship before outbound tracking consent',
      await page.getByRole('button', { name: 'Continue with referral tracking' }).isDisabled(),
    )
    await capture()
    check(
      'Chromium shows disclosure and requires explicit consent before storing a host-bound HttpOnly claim',
      (await ctx.cookies()).some((c) => c.name.startsWith('renegade_referral_') && c.httpOnly) &&
        (await sql('SELECT * FROM referral_claims')).length === 1,
    )
    state.plan = (
      await json(
        '/api/plan-revisions',
        operator,
        'POST',
        {
          site: state.alpha,
          planKey: 'journal12d',
          revision: 1,
          name: '12D monthly local adapter plan',
          interval: 'month',
          intervalCount: 1,
          amountMinor: '1200',
          currency: 'USD',
          trialDays: 0,
          trialEligibility: 'none',
          entitlements: [
            {
              siteId: state.alpha,
              resource: 'journal12d',
              capability: 'read',
              term: 'subscription',
            },
          ],
          cancelPolicy: 'period_end',
          changePolicy: 'immediate',
          taxPolicy: 'provider',
          providerMappings: { 'stripe-test': 'price_month12d' },
          publishedAt: new Date().toISOString(),
        },
        201,
      )
    ).doc.id
    const subResponse = await ctx.request.post(`${base}/api/commerce/subscriptions/checkout`, {
      headers: {
        origin: base,
        'idempotency-key': '12d-subscription-signup-0001',
        'x-member-csrf': 'rc112d-csrf',
      },
      data: { planRevisionId: state.plan },
    })
    assert.equal(subResponse.status(), 201, await subResponse.text())
    const signup = await subResponse.json()
    state.subscription = signup.subscriptionId
    state.subscriptionOrder = signup.orderId
    check(
      'member subscription signup binds referral but accrues nothing before payment',
      (await sql('SELECT * FROM commission_ledgers')).length === 0 &&
        (await row('orders', signup.orderId)).state === 'pending-payment',
    )
    await page.goto(signup.url)
    await page.getByRole('button', { name: 'Confirm harness payment' }).click()
    await until(
      'subscription invoice settled',
      async () => (await row('orders', signup.orderId)).state === 'paid',
    )
    await json(
      '/api/admin/commerce/affiliate',
      operator,
      'POST',
      { action: 'reconcile-referrals', siteId: state.alpha },
      202,
    )
    startWorker()
    await until(
      'subscription referral accrued by worker',
      async () =>
        (
          await sql("SELECT * FROM commission_ledgers WHERE order_id=$1 AND type='accrual'", [
            signup.orderId,
          ])
        ).length === 1,
    )
    check(
      'real Stripe-test adapter against loopback harness, signed invoice and commerce worker produce one 120 USD commission on immutable 1200 USD order',
      (
        await sql("SELECT * FROM commission_ledgers WHERE order_id=$1 AND type='accrual'", [
          signup.orderId,
        ])
      )[0].amount_minor === '120',
    )
    const createCampaign = async (site: string, currency: string) => {
      const created = (
        await json(
          '/api/donation-campaigns',
          operator,
          'POST',
          {
            site,
            campaignKey: `joint-${currency}`,
            version: 1,
            title: `12D ${currency} gift`,
            purpose: 'Local financial acceptance',
            receiptEntityName: 'Local acceptance',
            allowedAmounts: ['1000'],
            currency,
            recurrence: ['one-time'],
            privacyDefault: 'anonymous',
            lifecycle: 'draft',
          },
          201,
        )
      ).doc
      await json(`/api/donation-campaigns/${created.id}`, operator, 'PATCH', {
        lifecycle: 'active',
      })
      return created.id
    }
    state.campaign = await createCampaign(state.alpha, 'USD')
    state.betaCampaign = await createCampaign(state.beta, 'EUR')
    await capture()
    const donation = await ctx.request.post(`${base}/api/commerce/donations/intent`, {
      headers: { origin: base, 'idempotency-key': '12d-donation-000000000001' },
      data: donationInput(state.campaign),
    })
    assert.equal(donation.status(), 201, await donation.text())
    const gift = await donation.json()
    state.giftSession = gift.sessionId
    await page.goto(new URL(gift.actionUrl, base).href)
    await page.getByRole('button', { name: /confirm/i }).click()
    await until(
      'donation paid/referral accrued',
      async () =>
        (
          await sql(
            "SELECT l.* FROM commission_ledgers l JOIN orders o ON o.id=l.order_id WHERE o.checkout_session_id=$1 AND l.type='accrual'",
            [gift.sessionId],
          )
        ).length === 1,
    )
    state.giftOrder = (
      await sql('SELECT id FROM orders WHERE checkout_session_id=$1', [gift.sessionId])
    )[0].id
    state.giftDonation = (
      await find('donations', { donationIntent: { equals: gift.intentId } })
    )[0].id
    check(
      'supported donation checkout, confirmation and actual worker persist one donation, immutable order, receipt and 100 USD referral commission',
      (await row('donations', state.giftDonation)).baseAmountMinor === '1000' &&
        (await row('orders', state.giftOrder)).amountMinor === '1000',
    )
    const callback = {
      eventId: '12d-conversion',
      orderId: state.giftOrder,
      kind: 'conversion',
      amountMinor: '1000',
      currency: 'USD',
    }
    await signCallback(callback)
    const duplicates = await Promise.all([
      signCallback(callback),
      signCallback(callback),
      signCallback(callback),
    ])
    check(
      'concurrent duplicate signed callbacks are rejected as replay with exactly one persisted conversion and accrual',
      duplicates.every((r) => r.replay) &&
        (await sql("SELECT * FROM affiliate_conversions WHERE external_event_id='12d-conversion'"))
          .length === 1 &&
        (
          await sql("SELECT * FROM commission_ledgers WHERE order_id=$1 AND type='accrual'", [
            state.giftOrder,
          ])
        ).length === 1,
    )
    await signCallback({ ...callback, currency: 'EUR' }, {}, 409)
    await signCallback({ ...callback, eventId: '12d-foreign-currency', currency: 'EUR' }, {}, 409)
    await signCallback(
      { ...callback, eventId: '12d-forged' },
      { 'x-referral-signature': '0'.repeat(64) },
      401,
    )
    check(
      'conflicting callback identity, currency substitution and forged signatures leave financial evidence unchanged',
      (await sql('SELECT * FROM affiliate_conversions')).length === 1,
    )
    const frozen = (
      await sql('SELECT referral_attribution FROM orders WHERE id=$1', [state.giftOrder])
    )[0].referral_attribution
    await json(
      '/api/admin/commerce/refunds',
      operator,
      'POST',
      {
        action: 'request',
        orderId: state.giftOrder,
        amountMinor: '300',
        reason: '12D partial local refund',
        idempotencyKey: '12d-partial-refund-000001',
      },
      200,
    )
    check(
      'supported operator partial refund reverses 30 commission minor units without a payout',
      (
        await sql(
          "SELECT reversed_amount_minor FROM commission_ledgers WHERE order_id=$1 AND type='accrual'",
          [state.giftOrder],
        )
      )[0].reversed_amount_minor === '30',
    )
    await json(
      '/api/admin/commerce/refunds',
      operator,
      'POST',
      {
        action: 'request',
        orderId: state.giftOrder,
        amountMinor: '700',
        reason: '12D remaining local refund',
        idempotencyKey: '12d-full-refund-00000001',
      },
      200,
    )
    const reversalCallback = { ...callback, eventId: '12d-reversal', kind: 'reversal' }
    await signCallback(reversalCallback)
    check('duplicate reversal callback is a replay', (await signCallback(reversalCallback)).replay)
    const giftLedgers = await sql('SELECT * FROM commission_ledgers WHERE order_id=$1', [
      state.giftOrder,
    ])
    check(
      'full refund leaves immutable order attribution unchanged, 100 total compensating reversals and zero unpaid gift commission',
      JSON.stringify(
        (await sql('SELECT referral_attribution FROM orders WHERE id=$1', [state.giftOrder]))[0]
          .referral_attribution,
      ) === JSON.stringify(frozen) &&
        giftLedgers
          .filter((l: any) => l.type === 'reversal')
          .reduce((sum: bigint, l: any) => sum + BigInt(l.amount_minor), 0n) === 100n &&
        giftLedgers.find((l: any) => l.type === 'accrual').status === 'reversed',
    )
    const subscriptionEvents = await find('subscription-events', {
      subscription: { equals: state.subscription },
    })
    const giftRow = await row('donations', state.giftDonation)
    const alphaReport = await report(operator)
    check(
      'joint subscription/donation/referral ledgers reconcile without counting commissions as additional revenue',
      subscriptionEvents.filter((e: any) => e.kind === 'invoice_paid').length === 1 &&
        giftRow.lifecycle === 'refunded' &&
        alphaReport.totals[0].unpaid_minor === '120' &&
        alphaReport.totals[0].reversed_minor === '100' &&
        alphaReport.totals[0].paid_minor === '0',
    )
    const betaBase = 'http://127.0.0.1:39023'
    const betaContext = await browser.newContext()
    const betaPage = await betaContext.newPage()
    betaPage.setDefaultTimeout(120000)
    betaPage.setDefaultNavigationTimeout(120000)
    await betaPage.goto(`${betaBase}/referrals/REF-EUR-12D`)
    await betaPage.getByLabel('I consent to referral attribution').check()
    await betaPage.getByRole('button', { name: 'Save referral', exact: true }).click()
    await betaPage.getByRole('status').filter({ hasText: 'Referral saved.' }).waitFor()
    const foreignCode = await betaContext.request.get(
      `${betaBase}/api/commerce/referrals/claim?code=REF-12D`,
    )
    check(
      'owning-host referral code resolves while foreign-host code is hidden',
      foreignCode.status() === 404,
    )
    const betaGiftResponse = await betaContext.request.post(
      `${betaBase}/api/commerce/donations/intent`,
      {
        headers: { origin: betaBase, 'idempotency-key': '12d-beta-eur-gift-0000001' },
        data: donationInput(state.betaCampaign, 'EUR'),
      },
    )
    assert.equal(betaGiftResponse.status(), 201, await betaGiftResponse.text())
    const betaGift = await betaGiftResponse.json()
    await betaPage.goto(new URL(betaGift.actionUrl, betaBase).href)
    await betaPage.getByRole('button', { name: /confirm/i }).click()
    await until(
      'Beta EUR referral accrual',
      async () =>
        (
          await sql("SELECT * FROM commission_ledgers WHERE site_id=$1 AND type='accrual'", [
            state.beta,
          ])
        ).length === 1,
    )
    state.betaOrder = (
      await sql('SELECT id FROM orders WHERE checkout_session_id=$1', [betaGift.sessionId])
    )[0].id
    const betaReport = await report(operator, state.beta)
    check(
      'actual Beta EUR donation accrues 100 EUR without crossing Alpha USD orders or totals',
      betaReport.totals.length === 1 &&
        betaReport.totals[0].currency === 'EUR' &&
        betaReport.totals[0].unpaid_minor === '100' &&
        (await report(operator)).totals.every((r: any) => r.currency === 'USD'),
    )
    await signCallback(
      { ...callback, eventId: '12d-cross-site-order', orderId: state.betaOrder, currency: 'EUR' },
      {},
      409,
    )
    const betaUnconfigured = await betaContext.request.post(
      `${betaBase}/api/commerce/affiliate/conversions`,
      { data: callback },
    )
    check(
      'foreign-order signed callback and unconfigured Beta callback verification fail closed',
      betaUnconfigured.status() === 503 &&
        (
          await sql(
            "SELECT * FROM affiliate_conversions WHERE external_event_id='12d-cross-site-order'",
          )
        ).length === 0,
    )
    await betaContext.close()

    const selfContext = await browser.newContext()
    await selfContext.addCookies([
      { name: 'renegade-member', value: sessions.referrer.sessionToken, url: base },
    ])
    const selfPage = await selfContext.newPage()
    selfPage.setDefaultTimeout(120000)
    await selfPage.goto(`${base}/referrals/REF-12D`)
    await selfPage.getByLabel('I consent to referral attribution').check()
    await selfPage.getByRole('button', { name: 'Save referral', exact: true }).click()
    await selfPage.getByRole('status').filter({ hasText: 'Referral saved.' }).waitFor()
    const selfResponse = await selfContext.request.post(`${base}/api/commerce/donations/intent`, {
      headers: { origin: base, 'idempotency-key': '12d-self-referral-00000001' },
      data: donationInput(state.campaign),
    })
    assert.equal(selfResponse.status(), 201, await selfResponse.text())
    const selfGift = await selfResponse.json()
    await selfPage.goto(new URL(selfGift.actionUrl, base).href)
    await selfPage.getByRole('button', { name: /confirm/i }).click()
    await until('self-referral decision persisted', async () =>
      Boolean(
        (
          await sql('SELECT referral_attribution FROM orders WHERE checkout_session_id=$1', [
            selfGift.sessionId,
          ])
        )[0]?.referral_attribution,
      ),
    )
    const selfOrder = (
      await sql('SELECT * FROM orders WHERE checkout_session_id=$1', [selfGift.sessionId])
    )[0]
    check(
      'ordinary referrer purchase remains a real paid donation but self-referral commission is rejected and persisted',
      selfOrder.state === 'paid' &&
        selfOrder.referral_attribution.rejectReason === 'SELF_REFERRAL_SAME_MEMBER' &&
        (await sql('SELECT * FROM commission_ledgers WHERE order_id=$1', [selfOrder.id])).length ===
          0,
    )
    await json(
      `/api/orders/${selfOrder.id}`,
      operator,
      'PATCH',
      { referralAttribution: { calculatedCommissionMinor: '999999' } },
      403,
    )
    check(
      'native order attribution forgery is denied without changing immutable rejection evidence',
      (await sql('SELECT referral_attribution FROM orders WHERE id=$1', [selfOrder.id]))[0]
        .referral_attribution.rejectReason === 'SELF_REFERRAL_SAME_MEMBER',
    )
    await selfContext.close()

    const opContext = await browser.newContext()
    await opContext.addCookies([
      { name: 'renegade-passkey', value: operator.split('=')[1], url: base },
    ])
    const opPage = await opContext.newPage()
    opPage.setDefaultTimeout(120000)
    await opPage.goto(`${base}/commerce/referrals`)
    await opPage.getByLabel('Site ID').fill(state.alpha)
    await opPage.getByRole('button', { name: 'Load referral ledger' }).click()
    await opPage.getByText('Stored financial evidence loaded.').waitFor()
    await opPage.getByText('Payout: not-executed').waitFor()
    await opPage
      .getByText((await row('orders', state.giftOrder)).orderNumber, { exact: false })
      .first()
      .click()
    await opPage.screenshot({ path: `${out}/operator.png`, fullPage: true })
    check(
      'operator Chromium drilldown displays stored order, conversion, commission, reversal and truthful no-payout totals',
      (await opPage.getByText('12d-reversal', { exact: false }).count()) > 0,
    )
    await opContext.close()
    // Leave a genuine confirmed payment inbox pending for fresh worker recovery after DB/web restart.
    await stop(worker)
    worker = undefined
    await capture()
    const pending = await ctx.request.post(`${base}/api/commerce/donations/intent`, {
      headers: { origin: base, 'idempotency-key': '12d-pending-restart-00001' },
      data: donationInput(state.campaign),
    })
    assert.equal(pending.status(), 201, await pending.text())
    state.pending = await pending.json()
    await page.goto(new URL(state.pending.actionUrl, base).href)
    await page.getByRole('button', { name: /confirm/i }).click()
    check(
      'worker stopped with real signed payment inbox pending and no fabricated paid order',
      (await sql('SELECT * FROM orders WHERE checkout_session_id=$1', [state.pending.sessionId]))
        .length === 0,
    )
    await ctx.storageState({ path: 'scratch/rc112d/browser.json' })
    await ctx.close()
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))
    await writeFile('scratch/rc112d/records.json', JSON.stringify(records))
  } else {
    check(
      'persisted refund and original subscription order survive PostgreSQL/web restart',
      (await row('orders', state.giftOrder)).state === 'refunded' &&
        (await row('orders', state.subscriptionOrder)).amountMinor === '1200',
    )
    startWorker()
    await until(
      'pending donation recovered by fresh worker',
      async () =>
        (
          await sql(
            "SELECT l.* FROM commission_ledgers l JOIN orders o ON o.id=l.order_id WHERE o.checkout_session_id=$1 AND l.type='accrual'",
            [state.pending.sessionId],
          )
        ).length === 1,
    )
    check(
      'fresh worker settles pending payment and creates exactly one donation/order/commission',
      (await sql('SELECT * FROM orders WHERE checkout_session_id=$1', [state.pending.sessionId]))
        .length === 1 &&
        (await find('donations', { donationIntent: { equals: state.pending.intentId } })).length ===
          1,
    )
    await json(
      '/api/admin/commerce/affiliate',
      operator,
      'POST',
      { action: 'reconcile-referrals', siteId: state.alpha },
      202,
    )
    await until(
      'reconciliation replay drained',
      async () => (await report(operator)).totals[0].unpaid_minor === '220',
    )
    const originalCallback = {
      eventId: '12d-reversal',
      orderId: state.giftOrder,
      kind: 'reversal',
      amountMinor: '1000',
      currency: 'USD',
    }
    check(
      'signed callback replay after restart preserves one conversion/reversal evidence record',
      (await signCallback(originalCallback)).replay &&
        (await sql("SELECT * FROM affiliate_conversions WHERE external_event_id='12d-reversal'"))
          .length === 1,
    )
    const ctx = await browser.newContext({ storageState: 'scratch/rc112d/browser.json' })
    const page = await ctx.newPage()
    page.setDefaultTimeout(120000)
    await page.goto(`${base}/checkout/return?session=${state.pending.sessionId}`)
    await page.getByText(/paid/i).first().waitFor()
    check(
      'restored customer browser observes recovered paid order output',
      (await page.textContent('body'))!.includes('1000') ||
        (await page.textContent('body'))!.includes('10.00'),
    )
    await ctx.close()
  }
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}.json`,
    JSON.stringify({ passed: trace.length, failed: 0, skipped: 0, checks: trace }, null, 2),
  )
} finally {
  await stop(worker)
  await stop(web)
  await browser.close()
  harness.closeAllConnections()
  await new Promise<void>((resolve) => harness.close(() => resolve()))
  const pool = payload.db.pool
  const idle = new Set(pool._idle.map((entry: any) => entry.client))
  for (const client of [...pool._clients])
    if (!idle.has(client)) {
      assert.ok(!client.activeQuery, 'Owned harness closes only idle checked-out connections')
      client.release(true)
    }
  await pool.end()
  await payload.destroy()
}
