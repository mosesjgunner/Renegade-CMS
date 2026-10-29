/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
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
import { hasEntitlement } from '../../src/modules/commerce/subscription-service'
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5464/rc112a_release_acceptance',
)
assert.equal(process.env.RC1_12A_DISPOSABLE, 'yes')
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const out = 'docs/rc/evidence/rc1/18-pass/12A',
  base = 'http://localhost:39020'
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
  `renegade-member=${member.sessionToken}; renegade-member-csrf=rc112a-csrf`
let harnessRecord: any = restart
  ? JSON.parse(await readFile('scratch/rc112a/payment.json', 'utf8'))
  : null
const providerCalls: any[] = []
const harness = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const form = new URLSearchParams(Buffer.concat(chunks).toString())
    if (req.url?.startsWith('/v1/prices/')) {
      const annual = req.url.endsWith('price_year12a')
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
      assert.ok(['price_month12a', 'price_year12a'].includes(form.get('line_items[0][price]')!))
      providerCalls.push(Object.fromEntries(form))
      harnessRecord = {
        id: 'sub_harness12a',
        object: 'subscription',
        customer: 'cus_harness12a',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000) - 2,
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        items: { data: [{ price: { id: form.get('line_items[0][price]') } }] },
        metadata: Object.fromEntries(
          [...form]
            .filter(([key]) => key.startsWith('subscription_data[metadata]'))
            .map(([key, value]) => [key.slice(28, -1), value]),
        ),
      }
      await writeFile('scratch/rc112a/payment.json', JSON.stringify(harnessRecord))
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          id: 'cs_harness12a',
          customer: harnessRecord.customer,
          subscription: harnessRecord.id,
          url: 'http://127.0.0.1:3144/pay',
        }),
      )
      return
    }
    if (req.url === '/v1/subscriptions/sub_harness12a') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(harnessRecord))
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
      await signed('evt_paid12a', 'invoice.paid', {
        object: 'invoice',
        id: 'in_harness12a',
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
async function signed(id: string, type: string, object: any, expected = 202) {
  const raw = JSON.stringify({
    id,
    type,
    created: Math.floor(Date.now() / 1000),
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
        port: 39020,
        path,
        headers: { host: 'beta.12a.test:39020', cookie },
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
try {
  if (!restart) {
    const stamp = Date.now()
    const alpha = await payload.create({
      collection: 'sites',
      data: { name: '12A Alpha', slug: `alpha12a-${stamp}`, lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '12A Beta', slug: `beta12a-${stamp}`, lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@12a.test`, role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-${stamp}@12a.test`, role: 'staff' },
    })
    await payload.create({
      collection: 'member-site-roles',
      data: {
        member: typeof staff.member === 'object' ? staff.member.id : staff.member,
        site: beta.id,
        role: 'contributor',
      },
    })
    const member = await consumeMagicLink(
      payload,
      (await issueMagicLink(payload, `buyer-${stamp}@12a.test`)).token!,
    )
    const other = await consumeMagicLink(
      payload,
      (await issueMagicLink(payload, `other-${stamp}@12a.test`)).token!,
    )
    await writeFile('scratch/rc112a/sessions.json', JSON.stringify({ member, other }))
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: 'http://beta.12a.test:39020' },
        launchState: 'live',
        adminExperience: { optionalCapabilities: { commerceCheckout: true } },
      },
    })
    const merchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: alpha.id,
        label: '12A harness Stripe test',
        providerKey: 'stripe-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    state = {
      alpha: alpha.id,
      beta: beta.id,
      owner: owner.id,
      staff: staff.id,
      memberId: member!.memberId,
      merchant: merchant.id,
    }
  }
  const sessions = JSON.parse(await readFile('scratch/rc112a/sessions.json', 'utf8')),
    cookie = memberCookie(sessions.member),
    otherCookie = memberCookie(sessions.other)
  const operator = await operatorSession(await row('users', state.owner)),
    staff = await operatorSession(await row('users', state.staff))
  await new Promise<void>((resolve) => harness.listen(3144, '127.0.0.1', resolve))
  web = spawn(
    process.execPath,
    [
      '--import',
      './tests/rc1-12a/stripe-preload.mjs',
      'node_modules/next/dist/bin/next',
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      '39020',
    ],
    { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const log = createWriteStream(`${out}/${restart ? 'restart-web' : 'web'}.log`)
  web.stdout!.pipe(log, { end: false })
  web.stderr!.pipe(log, { end: false })
  let ready = false
  for (let i = 0; i < 180; i++) {
    try {
      if ((await request('/api/catalog')).status < 500) {
        ready = true
        break
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  assert.ok(ready, 'Web readiness')
  if (!restart) {
    const bytes = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#445566' },
    })
      .png()
      .toBuffer()
    const form = new FormData()
    form.set('siteId', state.alpha)
    form.set('title', '12A private guide')
    form.set('file', new File([bytes], 'guide12a.png', { type: 'image/png' }))
    const asset = (await json('/api/media/upload', operator, 'POST', form, 201)).asset
    await json(`/api/media-assets/${asset.id}`, operator, 'PATCH', {
      publicPolicy: 'private',
      rightsStatus: 'approved',
    })
    await payload.jobs.run({ queue: 'media', limit: 20 })
    state.media = asset.id
    await writeFile('scratch/rc112a/guide.png', bytes)
    const entitlements = [
      { siteId: state.alpha, resource: 'journal12a', capability: 'read', term: 'subscription' },
      {
        siteId: state.alpha,
        resource: `media:${asset.id}`,
        capability: 'download',
        term: 'subscription',
      },
    ]
    const plan = {
      site: state.alpha,
      planKey: 'journal12a',
      revision: 1,
      name: 'Journal monthly 12A',
      interval: 'month',
      intervalCount: 1,
      amountMinor: '1200',
      currency: 'USD',
      trialDays: 0,
      trialEligibility: 'none',
      entitlements,
      cancelPolicy: 'period_end',
      changePolicy: 'period_end',
      taxPolicy: 'provider',
      providerMappings: { 'stripe-test': 'price_month12a' },
      publishedAt: new Date().toISOString(),
    }
    state.plan = (await json('/api/plan-revisions', operator, 'POST', plan, 201)).doc.id
    state.year = (
      await json(
        '/api/plan-revisions',
        operator,
        'POST',
        {
          ...plan,
          planKey: 'journalyear12a',
          name: 'Journal annual 12A',
          interval: 'year',
          amountMinor: '12000',
          providerMappings: { 'stripe-test': 'price_year12a' },
        },
        201,
      )
    ).doc.id
    check(
      'operator creates persisted monthly and annual immutable prices',
      (await row('plan-revisions', state.plan)).amountMinor === '1200' &&
        (await row('plan-revisions', state.year)).interval === 'year',
    )
    await json(
      '/api/plan-revisions',
      operator,
      'POST',
      { ...plan, planKey: 'invalid', amountMinor: '0.01' },
      400,
    )
    await json(
      '/api/plan-revisions',
      operator,
      'POST',
      { ...plan, planKey: 'foreign', entitlements: [{ ...entitlements[0], siteId: state.beta }] },
      400,
    )
    check(
      'invalid price and foreign-site entitlement plans rejected',
      !(await find('plan-revisions', { planKey: { in: ['invalid', 'foreign'] } })).length,
    )
    await json('/api/plan-revisions', staff, 'POST', { ...plan, planKey: 'overreach' }, 403)
    await json(`/api/plan-revisions/${state.plan}`, operator, 'PATCH', { amountMinor: '1' }, 403)
    check(
      'foreign-site operator creation and published price edits denied',
      (await row('plan-revisions', state.plan)).amountMinor === '1200',
    )
    const betaPlan = (
      await json(
        '/api/plan-revisions',
        operator,
        'POST',
        {
          ...plan,
          site: state.beta,
          planKey: 'beta12a',
          entitlements: [{ ...entitlements[0], siteId: state.beta }],
        },
        201,
      )
    ).doc.id
    await json(
      '/api/commerce/subscriptions/checkout',
      cookie,
      'POST',
      { planRevisionId: betaPlan },
      404,
      { 'idempotency-key': 'wrong-site', 'x-member-csrf': 'rc112a-csrf' },
    )
    await json(
      '/api/commerce/subscriptions/checkout',
      cookie,
      'POST',
      { planRevisionId: state.plan },
      403,
      { 'idempotency-key': 'no-csrf' },
    )
    check(
      'foreign-site plan signup and missing CSRF denied',
      !(await find('subscriptions', { site: { equals: state.alpha } })).length,
    )
    const pubs = await find('publications', { site: { equals: state.alpha } })
    const body = {
      root: {
        type: 'root',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'paragraph',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: 'SUBSCRIBER-SECRET-12A',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
        ],
      },
    }
    state.content = (
      await json(
        '/api/content',
        operator,
        'POST',
        {
          site: state.alpha,
          publication: pubs[0].id,
          slug: 'journal12a',
          title: 'Subscriber journal 12A',
          contentType: 'article',
          status: 'published',
          visibility: 'public',
          body,
          publishedAt: new Date().toISOString(),
          requiredEntitlement: { resource: 'journal12a', capability: 'read' },
        },
        201,
      )
    ).doc.id
    state.contentPath = (await row('content', state.content)).canonicalPath
    check(
      'unsubscribed member cannot read protected content',
      !(await (await request(state.contentPath, cookie)).text()).includes('SUBSCRIBER-SECRET-12A'),
    )
    check(
      'unsubscribed member cannot download private asset',
      (await request(`/api/commerce/subscriptions/download/${asset.id}`, cookie)).status === 404,
    )
    await json(
      '/api/commerce/subscriptions/checkout',
      '',
      'POST',
      { planRevisionId: state.plan },
      401,
      { 'idempotency-key': 'anon' },
    )
    await json(
      '/api/commerce/subscriptions/checkout',
      cookie,
      'POST',
      { planRevisionId: state.plan, amountMinor: '1', memberId: sessions.other.memberId },
      400,
      { 'idempotency-key': 'forge', 'x-member-csrf': 'rc112a-csrf' },
    )
    check(
      'anonymous and forged signup fields denied',
      !(await find('subscriptions', { site: { equals: state.alpha } })).length,
    )
    const ctx = await browser.newContext()
    await ctx.addCookies([
      { name: 'renegade-member', value: sessions.member.sessionToken, url: base },
      { name: 'renegade-member-csrf', value: 'rc112a-csrf', url: base },
    ])
    const page = await ctx.newPage()
    await page.goto(base + '/members/settings?tab=billing')
    await page
      .getByRole('button', { name: 'Start Journal monthly 12A', exact: true })
      .waitFor({ timeout: 120000 })
    check(
      'billing UI lists server monthly and annual prices',
      (await page.locator('#billing').innerText()).includes('120.00'),
    )
    const checkoutResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/subscriptions/checkout') &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Start Journal monthly 12A', exact: true }).click()
    await page
      .getByRole('heading', { name: 'Isolated payment harness' })
      .waitFor({ timeout: 120000 })
    const subs = await find('subscriptions', { site: { equals: state.alpha } })
    assert.equal(subs.length, 1)
    state.subscription = subs[0].id
    state.order = subs[0].settings.orderId
    check(
      'UI signup persists incomplete subscription and pending linked order',
      subs[0].state === 'incomplete' &&
        (await row('orders', state.order)).state === 'pending-payment',
    )
    check(
      'actual adapter sends selected immutable provider price and member correlation',
      providerCalls[0]['line_items[0][price]'] === 'price_month12a' &&
        providerCalls[0]['subscription_data[metadata][renegade_member_id]'] === state.memberId,
    )
    const replay = await json(
      '/api/commerce/subscriptions/checkout',
      cookie,
      'POST',
      { planRevisionId: state.plan },
      200,
      {
        'idempotency-key': (await checkoutResponse).request().headers()['idempotency-key'],
        'x-member-csrf': 'rc112a-csrf',
      },
    )
    check(
      'checkout retry returns original subscription without a second provider checkout',
      replay.replay === true &&
        replay.subscriptionId === state.subscription &&
        providerCalls.length === 1,
    )
    // Exercise event activation before payment: access derives from provider state, order awaits invoice.
    await signed('evt_subscribed12a', 'customer.subscription.created', harnessRecord)
    check(
      'signed subscribed event grants exactly selected capabilities',
      (await find('entitlements', { source: { equals: `subscription:${state.subscription}` } }))
        .length === 2,
    )
    check(
      'activation does not manufacture collected payment',
      (await row('orders', state.order)).state === 'pending-payment',
    )
    await page.getByRole('button', { name: 'Confirm harness payment' }).click()
    await page.getByRole('button', { name: 'Refresh billing status' }).waitFor({ timeout: 120000 })
    await page.getByRole('button', { name: 'Refresh billing status' }).click()
    await page.getByText('Next billing:', { exact: false }).waitFor({ timeout: 30000 })
    check(
      'harness invoice persists paid order and upcoming billing UI',
      (await row('orders', state.order)).state === 'paid' &&
        (await page.locator('#billing').innerText()).includes('active'),
    )
    await page.screenshot({ path: `${out}/billing.png` })
    await ctx.close()
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))
  }
  const sub = await row('subscriptions', state.subscription),
    order = await row('orders', state.order)
  check(
    'persisted plan/subscription/order linkage survives refetch',
    sub.planRevision === state.plan &&
      order.sourceSnapshot.subscriptionId === state.subscription &&
      order.state === 'paid',
  )
  check(
    'canonical entitlement permits purchaser only',
    (await hasEntitlement(payload, {
      subjectId: state.memberId,
      siteId: state.alpha,
      resource: 'journal12a',
      capability: 'read',
    })) &&
      !(await hasEntitlement(payload, {
        subjectId: sessions.other.memberId,
        siteId: state.alpha,
        resource: 'journal12a',
        capability: 'read',
      })),
  )
  check(
    'canonical entitlement denies wrong site and capability',
    !(await hasEntitlement(payload, {
      subjectId: state.memberId,
      siteId: state.beta,
      resource: 'journal12a',
      capability: 'read',
    })) &&
      !(await hasEntitlement(payload, {
        subjectId: state.memberId,
        siteId: state.alpha,
        resource: 'journal12a',
        capability: 'write',
      })),
  )
  check(
    'paid member observes protected published content',
    (await (await request(state.contentPath, cookie)).text()).includes('SUBSCRIBER-SECRET-12A'),
  )
  check(
    'other member and anonymous cannot observe protected body',
    !(await (await request(state.contentPath, otherCookie)).text()).includes(
      'SUBSCRIBER-SECRET-12A',
    ) && !(await (await request(state.contentPath)).text()).includes('SUBSCRIBER-SECRET-12A'),
  )
  const download = `/api/commerce/subscriptions/download/${state.media}`
  const bytes = Buffer.from(await (await request(download, cookie)).arrayBuffer())
  check(
    'subscriber download returns exact private original bytes',
    bytes.equals(await readFile('scratch/rc112a/guide.png')),
  )
  check(
    'copied download URL denies anonymous and wrong user',
    (await request(download)).status === 404 &&
      (await request(download, otherCookie)).status === 404,
  )
  check(
    'foreign host cannot use same entitlement',
    (await foreign(download, cookie)).status === 404,
  )
  const listing = await json('/api/commerce/subscriptions', otherCookie)
  check(
    'another member cannot enumerate purchased subscription',
    listing.subscriptions.length === 0,
  )
  check(
    'foreign host list excludes purchased subscription',
    JSON.parse((await foreign('/api/commerce/subscriptions', cookie)).body).subscriptions.length ===
      0,
  )
  await json(
    '/api/commerce/subscriptions',
    otherCookie,
    'POST',
    { subscriptionId: state.subscription },
    404,
    { 'x-member-csrf': 'rc112a-csrf' },
  )
  check('another member cannot claim billing portal', true)
  const version = (await row('subscriptions', state.subscription)).version
  const dup = await Promise.all([
    signed('evt_subscribed12a', 'customer.subscription.created', harnessRecord, 200),
    signed('evt_subscribed12a', 'customer.subscription.created', harnessRecord, 200),
    signed(
      'evt_paid12a',
      'invoice.paid',
      { object: 'invoice', subscription: harnessRecord.id },
      200,
    ),
  ])
  check(
    'concurrent duplicate subscribed/invoice events acknowledge replay',
    dup.every((value) => value.replay === true),
  )
  check(
    'replay leaves version, two grants and one paid order unchanged',
    (await row('subscriptions', state.subscription)).version === version &&
      (await find('entitlements', { source: { equals: `subscription:${state.subscription}` } }))
        .length === 2 &&
      (await find('orders', { orderNumber: { equals: `SUB-${state.subscription}` } })).length === 1,
  )
  await json('/api/commerce/webhooks/stripe-test', '', 'POST', '{}', 401, {
    'stripe-signature': 't=1,v1=invalid',
  })
  check(
    'invalid signature denied with persisted version unchanged',
    (await row('subscriptions', state.subscription)).version === version,
  )
  const entitlement = (
    await find('entitlements', { source: { equals: `subscription:${state.subscription}` } })
  )[0]
  await json(
    '/api/entitlements',
    operator,
    'POST',
    {
      site: state.alpha,
      supporter: sub.supporter,
      entitlement: 'forged',
      source: 'forged',
      startsAt: new Date().toISOString(),
    },
    403,
  )
  await json(`/api/entitlements/${entitlement.id}`, staff, 'PATCH', { site: state.beta }, 403)
  check(
    'native entitlement minting and foreign operator mutation denied',
    (await row('entitlements', entitlement.id)).site === state.alpha,
  )
  if (!restart) {
    const versionBefore = (await row('subscriptions', state.subscription)).version
    // Induce a storage failure, never manufacture business state. Transaction must roll back.
    await payload.db.pool.query(
      `CREATE FUNCTION rc112a_fail_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rc112a injected grant storage failure'; END $$; CREATE TRIGGER rc112a_fail_grant BEFORE UPDATE ON entitlements FOR EACH ROW EXECUTE FUNCTION rc112a_fail_grant();`,
    )
    try {
      await signed('evt_retry12a', 'customer.subscription.updated', harnessRecord, 500)
    } finally {
      await payload.db.pool.query(
        'DROP TRIGGER rc112a_fail_grant ON entitlements; DROP FUNCTION rc112a_fail_grant();',
      )
    }
    check(
      'grant storage failure rolls back subscription and replay marker',
      (await row('subscriptions', state.subscription)).version === versionBefore &&
        !(await find('subscription-events', { providerEventId: { equals: 'evt_retry12a' } }))
          .length,
    )
    await signed('evt_retry12a', 'customer.subscription.updated', harnessRecord)
    check(
      'same signed event retries successfully after storage recovery',
      (await row('subscriptions', state.subscription)).version === versionBefore + 1 &&
        (await find('subscription-events', { providerEventId: { equals: 'evt_retry12a' } }))
          .length === 1 &&
        (await find('entitlements', { source: { equals: `subscription:${state.subscription}` } }))
          .length === 2,
    )
    await json(`/api/merchant-connections/${state.merchant}`, operator, 'PATCH', {
      status: 'disabled',
    })
    try {
      const unavailable = await json('/api/commerce/subscriptions/plans', cookie)
      check(
        'unconfigured merchant exposes unavailable plans without payment claim',
        unavailable.plans.every((plan: any) => !plan.available && plan.reason),
      )
    } finally {
      await json(`/api/merchant-connections/${state.merchant}`, operator, 'PATCH', {
        status: 'active',
      })
    }
  }
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}.json`,
    JSON.stringify({ passed: trace.length, failed: 0, skipped: 0, assertions: trace }, null, 2),
  )
} finally {
  await browser.close()
  if (web?.pid) {
    await new Promise<void>((resolve) => {
      const child = spawn('taskkill', ['/pid', String(web!.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      child.on('exit', () => resolve())
    })
  }
  harness.closeAllConnections()
  await new Promise<void>((resolve) => harness.close(() => resolve()))
  const pool = payload.db.pool
  const idle = new Set(pool._idle.map((entry: any) => entry.client))
  for (const client of [...pool._clients])
    if (!idle.has(client)) {
      assert.ok(!client.activeQuery)
      client.release(true)
    }
  await pool.end()
  await payload.destroy()
}
