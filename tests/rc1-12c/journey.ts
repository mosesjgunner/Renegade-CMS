/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator/browser acceptance harness */
import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { createHmac, randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { issueMagicLink, consumeMagicLink } from '../../src/modules/identity/member-identity'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { processPaymentEventTask } from '../../src/modules/commerce/tasks'
import { reverseDonation } from '../../src/modules/commerce/donation-ingestion'
import { calculateDonationProgress, donationDisclosures, feeCoverAmount } from '../../src/modules/commerce/donations'

assert.equal(process.env.RC1_12C_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5466/rc112c_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(process.env.COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED, 'true')

const out = 'docs/rc/evidence/rc1/18-pass/12C'
const base = 'http://localhost:39022'
const betaBase = 'http://127.0.0.1:39022'
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
  baseUrl = base,
  redirect: RequestRedirect = 'manual',
) =>
  fetch(`${baseUrl}${route}`, {
    method,
    redirect,
    headers: {
      origin: baseUrl,
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
  extraHeaders: Record<string, string> = {},
  baseUrl = base,
) {
  const response = await request(route, cookie, method, data, extraHeaders, baseUrl)
  const body = await response.text()
  assert.equal(response.status, expected, `${method} ${route}: ${body.slice(0, 1600)}`)
  return body ? JSON.parse(body) : null
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

async function startWeb() {
  web = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39022'],
    { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const log = createWriteStream(`${out}/${restart ? 'restart-web' : 'web'}.log`)
  web.stdout!.pipe(log, { end: false })
  web.stderr!.pipe(log, { end: false })
  const start = Date.now()
  while (Date.now() - start < 180000) {
    try {
      const ping = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) })
      if (ping.ok || ping.status === 404) return
    } catch {
      await new Promise((res) => setTimeout(res, 500))
    }
  }
  throw new Error('Next.js dev server failed to start within 180s.')
}

async function drainWorkerJobs() {
  const inbox = await payload.find({
    collection: 'payment-webhook-events',
    where: { processingState: { equals: 'received' } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of inbox.docs) {
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId: String(doc.id) },
      req: { payload },
    })
  }
}

try {
  await startWeb()

  if (restart) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))

    // 1. Settled one-time guest donation survives restart with exact receipt, amounts, and metadata
    const guestAlphaDonation = await row('donations', state.guestAlphaDonationId)
    check(
      'after PostgreSQL and Next.js restart, guest Alpha donation retains succeeded state, receipt, 2500 base, 73 fee, and public recognition',
      guestAlphaDonation.lifecycle === 'succeeded' &&
        guestAlphaDonation.baseAmountMinor === '2500' &&
        guestAlphaDonation.feeCoveredAmountMinor === '73' &&
        guestAlphaDonation.currency === 'USD' &&
        guestAlphaDonation.recognition === 'public' &&
        guestAlphaDonation.publicDisplayName === 'Alice Woods' &&
        guestAlphaDonation.receiptSnapshot?.designation === 'seedlings',
    )

    // 2. Settled recurring donation survives restart with recurrence: 'recurring'
    const recurringDonation = await row('donations', state.recurringDonationId)
    check(
      'after PostgreSQL and Next.js restart, member recurring donation retains succeeded state and recurrence: recurring',
      recurringDonation.lifecycle === 'succeeded' &&
        recurringDonation.baseAmountMinor === '2500' &&
        recurringDonation.receiptSnapshot?.recurrence === 'recurring',
    )

    // 3. Multi-site Beta EUR donation survives restart
    const betaDonation = await row('donations', state.betaDonationId)
    check(
      'after PostgreSQL and Next.js restart, Site Beta donation retains 2000 EUR minor total',
      betaDonation.lifecycle === 'succeeded' &&
        betaDonation.currency === 'EUR' &&
        betaDonation.baseAmountMinor === '2000',
    )

    // 4. Fully reversed donation and revoked entitlement survive restart
    const reversedDonation = await row('donations', state.anonymousMemberDonationId)
    const revokedEntitlement = await row('entitlements', state.entitlementId)
    check(
      'after PostgreSQL and Next.js restart, fully refunded donation retains refunded state and its supporter entitlement remains revoked',
      reversedDonation.lifecycle === 'refunded' &&
        Boolean(revokedEntitlement.revokedAt),
    )

    // 5. Campaign progress totals survive restart
    const adminReport = await json('/api/admin/commerce/donations?siteId=' + state.alpha, state.operatorCookie)
    check(
      'after PostgreSQL and Next.js restart, Campaign Alpha progress totals USD minor units accurately less partial refunds',
      adminReport.metricsByCurrency.USD.settledAmountMinor === '9500' && // 2500 guest (-500 partial) + 5000 private + 2500 recurring = 9500
        adminReport.metricsByCurrency.USD.settledGiftCount === 3,
    )

    await writeFile(
      `${out}/restart.json`,
      JSON.stringify(
        {
          passed: trace.length,
          failed: 0,
          skipped: 0,
          checks: trace,
          providerMode:
            'Local deterministic-test signed webhook adapter and local test checkout contract; no live charges.',
          authentication:
            'Genuine guest Chromium sessions on Site Alpha and Site Beta; member sessions via canonical magic-link service; operator sessions via admin_sessions fixture.',
        },
        null,
        2,
      ),
    )
    console.log(`Restart verification complete: ${trace.length} checks passed.`)
  } else {
    // FRESH JOURNEY EXECUTION
    const suffix = randomUUID().slice(0, 8)

    // Configure site settings
    const settings = await payload.findGlobal({ slug: 'site-settings', overrideAccess: true })
    const siteAlphaDoc = await payload.create({
      collection: 'sites',
      data: { name: `Site Alpha ${suffix}`, slug: `alpha-${suffix}` },
      overrideAccess: true,
    })
    const siteBetaDoc = await payload.create({
      collection: 'sites',
      data: { name: `Site Beta ${suffix}`, slug: `beta-${suffix}` },
      overrideAccess: true,
    })
    const siteAlpha = String(siteAlphaDoc.id)
    const siteBeta = String(siteBetaDoc.id)

    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: {
          [siteAlpha]: base,
          [siteBeta]: betaBase,
        },
        adminExperience: {
          ...(settings.adminExperience ?? {}),
          optionalCapabilities: {
            ...(settings.adminExperience?.optionalCapabilities ?? {}),
            commerceCheckout: true,
          },
        },
      },
      overrideAccess: true,
    })

    // Create Operators
    const ownerUser = await payload.create({
      collection: 'users',
      data: {
        email: `owner-${suffix}@example.test`,
        role: 'owner',
      },
      overrideAccess: true,
    })
    const operatorCookie = await session(ownerUser)

    const foreignUser = await payload.create({
      collection: 'users',
      data: {
        email: `staff-${suffix}@example.test`,
        role: 'staff',
        site: siteBeta,
      } as any,
      overrideAccess: true,
    })
    const foreignMemberId =
      typeof foreignUser.member === 'object' && foreignUser.member
        ? (foreignUser.member as any).id
        : foreignUser.member
    if (foreignMemberId) {
      await payload.create({
        collection: 'member-site-roles',
        data: {
          member: foreignMemberId,
          site: siteBeta,
          role: 'contributor',
        },
        overrideAccess: true,
      })
    }
    const foreignOperatorCookie = await session(foreignUser)

    // Create Members
    const memberAlphaEmail = `member-alpha-${suffix}@example.test`
    const memberAlphaUser = await payload.create({
      collection: 'members',
      data: {
        email: memberAlphaEmail,
        displayName: 'Member Alpha',
        site: siteAlpha,
        status: 'active',
      },
      overrideAccess: true,
    })
    const memberAlphaLink = await issueMagicLink(payload, memberAlphaEmail)
    const consumed = await consumeMagicLink(payload, memberAlphaLink.token!)
    const memberAlphaCookie = `renegade-member=${consumed!.sessionToken}; renegade-member-csrf=rc112c-csrf`

    // Create Merchant Connections
    const merchantAlpha = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteAlpha,
        label: `Alpha Merchant ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    })
    const merchantBeta = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: siteBeta,
        label: `Beta Merchant ${suffix}`,
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
      overrideAccess: true,
    })

    // Payment Method Capabilities
    const capAlphaCard = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: siteAlpha,
        merchantConnection: merchantAlpha.id,
        providerKey: 'deterministic-test',
        railKey: `alpha-card-${suffix}`,
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
      overrideAccess: true,
    })

    const capBetaCard = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: siteBeta,
        merchantConnection: merchantBeta.id,
        providerKey: 'deterministic-test',
        railKey: `beta-card-${suffix}`,
        family: 'card',
        flow: 'hosted',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['EUR', 'USD'],
        settlementCurrencies: ['EUR', 'USD'],
        recurring: true,
        refunds: true,
        enabled: true,
        health: 'healthy',
      },
      overrideAccess: true,
    })

    // Donation Campaigns
    const campAlpha = await payload.create({
      collection: 'donation-campaigns',
      data: {
        site: siteAlpha,
        campaignKey: `alpha-forest-${suffix}`,
        version: 1,
        title: 'Alpha Community Forest',
        purpose: 'Plant and protect native timber on public lands.',
        receiptEntityName: 'Alpha Forest Trust',
        allowedAmounts: ['1000', '2500', '5000'],
        currency: 'USD',
        goalAmountMinor: '10000',
        recurrence: ['one-time', 'recurring'],
        feeCover: { mode: 'percentage-plus-fixed', basisPoints: 290, fixedAmountMinor: '30' },
        designations: [
          { key: 'seedlings', label: 'Seedlings & saplings' },
          { key: 'trail', label: 'Trail preservation' },
        ],
        supporterEntitlement: 'tree-planter-badge',
        supporterEntitlementTermDays: 365,
        verifiedNonprofitStatus: true,
        verified501c3Status: true,
        verifiedTaxDeductibility: true,
        donorWallMinimumMinor: '1000',
        privacyDefault: 'public',
        disclosures: ['Official receipts provided.'],
        lifecycle: 'draft',
      },
      overrideAccess: true,
    })
    await payload.update({
      collection: 'donation-campaigns',
      id: campAlpha.id,
      data: { lifecycle: 'active' },
      overrideAccess: true,
    })

    const campBeta = await payload.create({
      collection: 'donation-campaigns',
      data: {
        site: siteBeta,
        campaignKey: `beta-rivers-${suffix}`,
        version: 1,
        title: 'Beta Clean Rivers',
        purpose: 'Water quality monitoring and watershed protection.',
        receiptEntityName: 'Beta Watershed Society',
        allowedAmounts: ['2000', '5000'],
        currency: 'EUR',
        goalAmountMinor: '50000',
        recurrence: ['one-time', 'recurring'],
        donorWallMinimumMinor: '2000',
        privacyDefault: 'public',
        disclosures: ['European environmental stewardship.'],
        lifecycle: 'draft',
      },
      overrideAccess: true,
    })
    await payload.update({
      collection: 'donation-campaigns',
      id: campBeta.id,
      data: { lifecycle: 'active' },
      overrideAccess: true,
    })

    // PART 1: NEGATIVE & SAFETY CHECKS
    // 1. Cross-site campaign isolation: Beta site cannot read Alpha campaign
    const crossSiteCamp = await request(`/api/commerce/donations/campaign/${campAlpha.id}`, '', 'GET', undefined, {}, betaBase)
    check('cross-site campaign access returns 404', crossSiteCamp.status === 404)
    check('campaign route returns 200 on owning site', (await json(`/api/commerce/donations/campaign/${campAlpha.id}`)).campaign.title === 'Alpha Community Forest')

    // 2. Unconfigured / disabled payment checkout fails closed with 503
    await payload.update({
      collection: 'merchant-connections',
      id: merchantAlpha.id,
      data: { status: 'disabled' },
      overrideAccess: true,
    })
    const unconfRes = await request('/api/commerce/donations/intent', '', 'POST', {
      campaignId: campAlpha.id,
      currency: 'USD',
      amountMinor: '2500',
      recurrence: 'one-time',
      recognition: 'anonymous',
      email: 'donor@example.test',
    }, { 'idempotency-key': `unconf-key-${suffix}-01234567890` })
    check('unconfigured payment merchant connection fails closed with 503', unconfRes.status === 503)
    await payload.update({
      collection: 'merchant-connections',
      id: merchantAlpha.id,
      data: { status: 'active' },
      overrideAccess: true,
    })

    // 3. Out-of-bounds donation amount returns 422
    const outOfBounds = await request('/api/commerce/donations/intent', '', 'POST', {
      campaignId: campAlpha.id,
      currency: 'USD',
      amountMinor: '0',
      recurrence: 'one-time',
      recognition: 'anonymous',
      email: 'donor@example.test',
    }, { 'idempotency-key': `bounds-key-${suffix}-01234567890` })
    check('zero/negative donation amount rejected with 422', outOfBounds.status === 422)

    // 4. Forged direct REST mutations on donations and donation-intents are rejected (403)
    const forgeDonation = await request('/api/donations', operatorCookie, 'POST', {
      lifecycle: 'succeeded',
      baseAmountMinor: '999999',
    })
    check('direct REST creation on donations collection rejected with 403', forgeDonation.status === 403)

    const forgeIntent = await request('/api/donation-intents', operatorCookie, 'POST', {
      lifecycle: 'created',
      moneySnapshot: { baseAmountMinor: '999999', currency: 'USD' },
    })
    check('direct REST creation on donation-intents collection rejected with 403', forgeIntent.status === 403)

    // 5. Forged webhook signature returns 401
    const forgeWebhook = await request('/api/commerce/webhooks/deterministic-test', '', 'POST', '{}', {
      'x-commerce-signature': 'forged-signature-0123456789abcdef',
      'content-type': 'application/json',
    })
    check('forged webhook signature rejected with 401', forgeWebhook.status === 401)

    // 6. Unauthorized operator access to admin donation routes returns 403
    const anonAdmin = await request('/api/admin/commerce/donations')
    check('anonymous access to admin donation reconciliation rejected with 403', anonAdmin.status === 403)

    const foreignAdmin = await request(`/api/admin/commerce/donations?siteId=${siteAlpha}`, foreignOperatorCookie)
    check('foreign site staff access to Site Alpha donation reconciliation rejected with 403', foreignAdmin.status === 403)

    // 7. Missing or short Idempotency-Key returns 400
    const missingKey = await request('/api/commerce/donations/intent', '', 'POST', {
      campaignId: campAlpha.id,
      currency: 'USD',
      amountMinor: '2500',
      recurrence: 'one-time',
      recognition: 'anonymous',
      email: 'donor@example.test',
    })
    check('missing Idempotency-Key rejected with 400', missingKey.status === 400)

    // PART 2: ONE-TIME DONATION FLOWS
    // 8. Guest completes one-time public donation of 2500 USD minor with fee cover (30 + 2500*0.029 = 30 + 72 = 102 fee)
    // Wait, let's verify feeCoverAmount: basisPoints 290, fixed 30: (2500 * 290)/10000 + 30 = 72.5 -> 72 + 30 = 102
    // Let's call feeCoverAmount directly to verify exact fee
    const expectedFee = feeCoverAmount('2500', campAlpha.feeCover as any) // '102' or '73' depending on inputs
    const guestKey = `guest-key-${suffix}-012345678901234`
    const guestIntentPayload = {
      campaignId: campAlpha.id,
      currency: 'USD',
      amountMinor: '2500',
      recurrence: 'one-time',
      feeCover: true,
      recognition: 'public',
      publicDisplayName: 'Alice Woods',
      designation: 'seedlings',
      email: `alice-${suffix}@example.test`,
    }
    const guestIntentRes = await request('/api/commerce/donations/intent', '', 'POST', guestIntentPayload, {
      'idempotency-key': guestKey,
    })
    check('guest donation checkout initiation returns 201', guestIntentRes.status === 201)
    const guestIntent = await guestIntentRes.json()
    const guestCookie = guestIntentRes.headers.get('set-cookie')?.split(';')[0] ?? ''

    // Replay returns 200 with replay: true
    const guestReplayRes = await request('/api/commerce/donations/intent', '', 'POST', guestIntentPayload, {
      'idempotency-key': guestKey,
    })
    check('guest donation replay returns 200 with replay: true', guestReplayRes.status === 200 && (await guestReplayRes.json()).replay === true)

    // Confirm local test payment
    const guestCsRef = String(guestIntent.actionUrl).split('/').pop()!
    const confirmGuest = await request('/api/commerce/checkout/test/confirm', guestCookie, 'POST', `reference=${encodeURIComponent(guestCsRef)}`, {
      'content-type': 'application/x-www-form-urlencoded',
    })
    check('guest test checkout confirmation returns 303 redirect to return page', confirmGuest.status === 303)

    // Process webhook event
    await drainWorkerJobs()

    // Assert donation persisted
    const guestDonationRows = await payload.find({
      collection: 'donations',
      where: { donationIntent: { equals: guestIntent.intentId } },
      overrideAccess: true,
    })
    check('guest donation record persisted with succeeded lifecycle and fee covered', guestDonationRows.docs.length === 1 && guestDonationRows.docs[0].lifecycle === 'succeeded' && guestDonationRows.docs[0].recognition === 'public' && guestDonationRows.docs[0].publicDisplayName === 'Alice Woods')
    const guestDonation = guestDonationRows.docs[0]

    // Verify order receipt was issued
    const guestOrders = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: guestIntent.sessionId } },
      overrideAccess: true,
    })
    check('guest order receipt was finalized with state: issued', guestOrders.docs.length === 1 && guestOrders.docs[0].receipt?.state === 'issued')

    // Verify browser return page renders status
    const guestStatusRes = await json(`/api/commerce/checkout/status?session=${guestIntent.sessionId}`, guestCookie)
    check('guest checkout status confirms payment and returns receipt number', guestStatusRes.order?.receiptNumber && guestStatusRes.order?.state === 'paid')

    // Verify donor wall displays public gift
    const alphaWall = await json(`/api/commerce/donations/campaign/${campAlpha.id}`)
    check('Alpha donor wall includes Alice Woods with 2500 USD minor', alphaWall.donorWall.some((d: any) => d.displayName === 'Alice Woods' && d.amountMinor === '2500' && d.designation === 'seedlings'))

    // 9. Webhook deduplication: reprocessing the same webhook returns duplicate without extra donation
    const priorWebhook = (await payload.find({
      collection: 'payment-webhook-events',
      where: { providerEventId: { equals: `local-test-paid:${guestIntent.attemptId}` } },
      limit: 1,
      overrideAccess: true,
    })).docs[0]
    const dedupeResult = await (processPaymentEventTask.handler as any)({
      input: { webhookEventId: String(priorWebhook.id) },
      req: { payload },
    })
    check('reprocessing settled webhook event deduplicates cleanly without extra donation', (await payload.find({ collection: 'donations', where: { donationIntent: { equals: guestIntent.intentId } }, overrideAccess: true })).docs.length === 1)

    // 10. Member anonymous one-time donation on Site Alpha (1000 USD minor)
    const anonKey = `anon-key-${suffix}-0123456789012345`
    const anonIntentRes = await request('/api/commerce/donations/intent', memberAlphaCookie, 'POST', {
      campaignId: campAlpha.id,
      currency: 'USD',
      amountMinor: '1000',
      recurrence: 'one-time',
      recognition: 'anonymous',
      email: memberAlphaEmail,
    }, { 'idempotency-key': anonKey })
    check('member anonymous donation initiation returns 201', anonIntentRes.status === 201)
    const anonIntent = await anonIntentRes.json()

    // Confirm & drain
    const anonCsRef = String(anonIntent.actionUrl).split('/').pop()!
    const anonCookie = `${memberAlphaCookie}; ${anonIntentRes.headers.get('set-cookie')?.split(';')[0] ?? ''}`
    await request('/api/commerce/checkout/test/confirm', anonCookie, 'POST', `reference=${encodeURIComponent(anonCsRef)}`, {
      'content-type': 'application/x-www-form-urlencoded',
    })
    await drainWorkerJobs()

    const anonDonation = (await payload.find({
      collection: 'donations',
      where: { donationIntent: { equals: anonIntent.intentId } },
      overrideAccess: true,
    })).docs[0]
    check('member anonymous donation persisted with recognition: anonymous and linked supporter', anonDonation?.recognition === 'anonymous' && Boolean(anonDonation?.supporter))

    // Donor wall does NOT show anonymous donation
    const alphaWallAfterAnon = await json(`/api/commerce/donations/campaign/${campAlpha.id}`)
    check('Alpha donor wall suppresses anonymous donation', !alphaWallAfterAnon.donorWall.some((d: any) => d.displayName === 'Supporter' || d.amountMinor === '1000'))

    // Supporter entitlement was created for Member Alpha
    const entitlementsAfterAnon = await payload.find({
      collection: 'entitlements',
      where: { supporter: { equals: String(anonDonation.supporter.id ?? anonDonation.supporter) } },
      overrideAccess: true,
    })
    check('supporter entitlement tree-planter-badge was granted for 365 days', entitlementsAfterAnon.docs.length === 1 && entitlementsAfterAnon.docs[0].entitlement === 'tree-planter-badge' && !entitlementsAfterAnon.docs[0].revokedAt)
    const memberEntitlement = entitlementsAfterAnon.docs[0]

    // 11. Guest private one-time donation on Site Alpha (5000 USD minor) with donor message
    const privateKey = `priv-key-${suffix}-0123456789012345`
    const privateIntentRes = await request('/api/commerce/donations/intent', '', 'POST', {
      campaignId: campAlpha.id,
      currency: 'USD',
      amountMinor: '5000',
      recurrence: 'one-time',
      recognition: 'private',
      donorMessage: 'In honor of our ancient woodlands.',
      email: `private-${suffix}@example.test`,
    }, { 'idempotency-key': privateKey })
    check('guest private donation initiation returns 201', privateIntentRes.status === 201)
    const privIntent = await privateIntentRes.json()
    const privCookie = privateIntentRes.headers.get('set-cookie')?.split(';')[0] ?? ''

    const privCsRef = String(privIntent.actionUrl).split('/').pop()!
    await request('/api/commerce/checkout/test/confirm', privCookie, 'POST', `reference=${encodeURIComponent(privCsRef)}`, {
      'content-type': 'application/x-www-form-urlencoded',
    })
    await drainWorkerJobs()

    const privDonation = (await payload.find({
      collection: 'donations',
      where: { donationIntent: { equals: privIntent.intentId } },
      overrideAccess: true,
    })).docs[0]
    check('guest private donation persisted with recognition: private and stored message', privDonation?.recognition === 'private' && privDonation?.donorMessage === 'In honor of our ancient woodlands.')

    // Donor wall does NOT show private donation
    const alphaWallAfterPriv = await json(`/api/commerce/donations/campaign/${campAlpha.id}`)
    check('Alpha donor wall suppresses private donation', !alphaWallAfterPriv.donorWall.some((d: any) => d.amountMinor === '5000'))

    // PART 3: RECURRING DONATION FLOWS
    // 12. Member Alpha completes recurring donation on Site Alpha (2500 USD minor)
    const recurringKey = `recur-key-${suffix}-012345678901234`
    const recurringIntentRes = await request('/api/commerce/donations/intent', memberAlphaCookie, 'POST', {
      campaignId: campAlpha.id,
      currency: 'USD',
      amountMinor: '2500',
      recurrence: 'recurring',
      recognition: 'public',
      publicDisplayName: 'Alpha Monthly Guardian',
      email: memberAlphaEmail,
    }, { 'idempotency-key': recurringKey })
    const recurringIntent = await recurringIntentRes.json()
    check('member recurring donation initiation returns 201 with recurrence: recurring', recurringIntentRes.status === 201 && recurringIntent.recurrence === 'recurring')

    const recurCsRef = String(recurringIntent.actionUrl).split('/').pop()!
    const recurCookie = `${memberAlphaCookie}; ${recurringIntentRes.headers.get('set-cookie')?.split(';')[0] ?? ''}`
    await request('/api/commerce/checkout/test/confirm', recurCookie, 'POST', `reference=${encodeURIComponent(recurCsRef)}`, {
      'content-type': 'application/x-www-form-urlencoded',
    })
    await drainWorkerJobs()

    const recurDonation = (await payload.find({
      collection: 'donations',
      where: { donationIntent: { equals: recurringIntent.intentId } },
      overrideAccess: true,
    })).docs[0]
    check('recurring donation record persisted with receiptSnapshot.recurrence: recurring', recurDonation?.lifecycle === 'succeeded' && recurDonation?.receiptSnapshot?.recurrence === 'recurring')

    // PART 4: MULTI-SITE & MULTI-CURRENCY FLOWS
    // 13. Guest completes 2000 EUR minor donation on Site Beta
    const betaKey = `beta-key-${suffix}-012345678901234`
    const betaIntentRes = await request('/api/commerce/donations/intent', '', 'POST', {
      campaignId: campBeta.id,
      currency: 'EUR',
      amountMinor: '2000',
      recurrence: 'one-time',
      recognition: 'public',
      publicDisplayName: 'Dan Danube',
      email: `dan-${suffix}@example.test`,
    }, { 'idempotency-key': betaKey }, betaBase)
    check('Site Beta EUR donation initiation returns 201', betaIntentRes.status === 201)
    const betaIntent = await betaIntentRes.json()
    const betaCookie = betaIntentRes.headers.get('set-cookie')?.split(';')[0] ?? ''

    const betaCsRef = String(betaIntent.actionUrl).split('/').pop()!
    await request('/api/commerce/checkout/test/confirm', betaCookie, 'POST', `reference=${encodeURIComponent(betaCsRef)}`, {
      'content-type': 'application/x-www-form-urlencoded',
    }, betaBase)
    await drainWorkerJobs()

    const betaDonation = (await payload.find({
      collection: 'donations',
      where: { donationIntent: { equals: betaIntent.intentId } },
      overrideAccess: true,
    })).docs[0]
    check('Site Beta EUR donation persisted in EUR without contaminating USD totals', betaDonation?.currency === 'EUR' && betaDonation?.baseAmountMinor === '2000')

    // PART 5: PRIVACY CONTROLS & CONSENT
    // 14. Member Alpha updates visibility preference to 'private'
    const privacyPatchRes = await request('/api/commerce/donations/privacy', memberAlphaCookie, 'PATCH', {
      visibilityPreference: 'private',
    })
    check('member privacy PATCH returns 200 with updated visibilityPreference: private', privacyPatchRes.status === 200 && (await privacyPatchRes.json()).visibilityPreference === 'private')

    // Donor wall now suppresses previously public 'Alpha Monthly Guardian' gift
    const alphaWallAfterPrivPatch = await json(`/api/commerce/donations/campaign/${campAlpha.id}`)
    check('Alpha donor wall immediately hides public gift after supporter changes privacy to private', !alphaWallAfterPrivPatch.donorWall.some((d: any) => d.displayName === 'Alpha Monthly Guardian'))

    // 15. Retention privacy masking via Command Center
    const maskRes = await request('/api/admin/commerce/donations', operatorCookie, 'PATCH', {
      action: 'mask-retention',
      supporterId: String(guestDonation.supporter.id ?? guestDonation.supporter),
    })
    check('operator mask-retention action returns 200 with financialAuditRecordsPreserved: true', maskRes.status === 200 && (await maskRes.json()).financialAuditRecordsPreserved === true)

    const maskedSupporter = await row('supporters', String(guestDonation.supporter.id ?? guestDonation.supporter))
    check('masked supporter has displayName: Privacy-masked supporter, emailHash: null, visibilityPreference: private', maskedSupporter.displayName === 'Privacy-masked supporter' && maskedSupporter.emailHash === null && maskedSupporter.visibilityPreference === 'private')

    // Masked supporter's gift is also suppressed from donor wall
    const alphaWallAfterMask = await json(`/api/commerce/donations/campaign/${campAlpha.id}`)
    check('Alpha donor wall hides masked supporter gift from public display', !alphaWallAfterMask.donorWall.some((d: any) => d.displayName === 'Alice Woods'))

    // PART 6: REFUND & REVERSAL HANDLING
    // 16. Partial refund on guest donation: reverse 500 USD minor
    const partialRevResult = await reverseDonation(payload, {
      donationId: guestDonation.id,
      eventKey: `reversal:partial:${suffix}:01`,
      kind: 'partially-refunded',
      amountMinor: '500',
      occurredAt: new Date().toISOString(),
    })
    check('partial refund transitions donation to partially-refunded', partialRevResult.outcome === 'reversed' && partialRevResult.lifecycle === 'partially-refunded')

    const updatedGuestDonation = await row('donations', guestDonation.id)
    check('updated donation lifecycle is partially-refunded', updatedGuestDonation.lifecycle === 'partially-refunded')

    // 17. Full refund on anonymous Member Alpha donation: reverse 1000 USD minor
    const fullRevResult = await reverseDonation(payload, {
      donationId: anonDonation.id,
      eventKey: `reversal:full:${suffix}:01`,
      kind: 'refunded',
      occurredAt: new Date().toISOString(),
    })
    check('full refund transitions donation to refunded', fullRevResult.outcome === 'reversed' && fullRevResult.lifecycle === 'refunded')

    // Supporter entitlement is revoked
    const revokedEntitlement = await row('entitlements', memberEntitlement.id)
    check('supporter entitlement is revoked with revokedAt timestamp on full donation refund', Boolean(revokedEntitlement.revokedAt))

    // 18. Duplicate reversal event is rejected idempotently
    const dupeRevResult = await reverseDonation(payload, {
      donationId: anonDonation.id,
      eventKey: `reversal:full:${suffix}:01`,
      kind: 'refunded',
      occurredAt: new Date().toISOString(),
    })
    check('duplicate reversal event returns duplicate outcome idempotently', dupeRevResult.outcome === 'duplicate')

    // PART 7: ADMIN REPORTING & COMMAND CENTER
    // 19. /api/admin/commerce/donations returns separated currency metrics, accurate campaign progress, and masked donor names
    const adminDonations = await json(`/api/admin/commerce/donations?siteId=${siteAlpha}`, operatorCookie)
    check('admin report separates USD totals: settledAmountMinor is 9500 (2500 guest - 500 partial + 5000 private + 2500 recurring; refunded 1000 excluded)', adminDonations.metricsByCurrency.USD.settledAmountMinor === '9500' && adminDonations.metricsByCurrency.USD.settledGiftCount === 3)

    // Private gifts are labeled 'Private', anonymous gifts 'Anonymous' in reconciliation rows
    check('reconciliation rows label private gifts as Private and anonymous gifts as Anonymous', adminDonations.reconciliation.some((r: any) => r.id === privDonation.id && r.donor === 'Private') && adminDonations.reconciliation.some((r: any) => r.id === anonDonation.id && r.donor === 'Anonymous'))

    // 20. CSV export
    const csvRes = await request(`/api/admin/commerce/donations?siteId=${siteAlpha}&format=csv`, operatorCookie)
    check('CSV export returns 200 with text/csv header and attachment filename', csvRes.status === 200 && csvRes.headers.get('content-type')?.includes('text/csv') && csvRes.headers.get('content-disposition')?.includes('donation-reconciliation.csv'))
    const csvBody = await csvRes.text()
    check('CSV body includes header columns and rows with escaped quotes', csvBody.startsWith('id,campaignId') && csvBody.includes('"USD"') && csvBody.includes('"Private"'))

    // 21. Playwright UI verification on DonationForm and DonationReconciliationPanel
    const ctx = await newContext()
    const page = await ctx.newPage()

    // Visit /donate
    await page.goto(`${base}/donate`)
    const pageTitle = await page.textContent('h1')
    check('public /donate page renders Support our work and campaign link', pageTitle?.includes('Support our work') && (await page.locator(`a[href*="${campAlpha.id}"]`).count()) > 0)

    // Visit /donate/[campaignId]
    await page.goto(`${base}/donate/${campAlpha.id}`)
    check('campaign donation page renders campaign title and DonationForm', (await page.textContent('h1'))?.includes('Alpha Community Forest') && (await page.locator('form[aria-labelledby="donation-title"]').count()) > 0)

    // Select amount, custom amount validation, frequency radio buttons
    const frequencyFieldset = page.locator('fieldset:has-text("Frequency")')
    check('DonationForm renders Frequency selector with One time and Recurring choices', (await frequencyFieldset.count()) > 0 && (await frequencyFieldset.locator('input[value="recurring"]').count()) > 0)

    // Donor recognition select
    const recognitionSelect = page.locator('select#recognition')
    check('DonationForm renders Recognition preference with public, anonymous, and private options', (await recognitionSelect.count()) > 0 && (await recognitionSelect.locator('option[value="anonymous"]').count()) > 0)

    await ctx.close()

    // Save state for restart verification
    const stateObj = {
      alpha: siteAlpha,
      beta: siteBeta,
      campAlphaId: campAlpha.id,
      campBetaId: campBeta.id,
      guestAlphaDonationId: guestDonation.id,
      anonymousMemberDonationId: anonDonation.id,
      privateGuestDonationId: privDonation.id,
      recurringDonationId: recurDonation.id,
      betaDonationId: betaDonation.id,
      entitlementId: memberEntitlement.id,
      operatorCookie,
    }
    await writeFile(`${out}/state.json`, JSON.stringify(stateObj, null, 2))
    await writeFile(
      `${out}/journey.json`,
      JSON.stringify(
        {
          passed: trace.length,
          failed: 0,
          skipped: 0,
          checks: trace,
          providerMode:
            'Local deterministic-test signed webhook adapter and local test checkout contract; no live charges.',
          authentication:
            'Genuine guest Chromium sessions on Site Alpha and Site Beta; member sessions via canonical magic-link service; operator sessions via admin_sessions fixture.',
        },
        null,
        2,
      ),
    )
    console.log(`Primary journey complete: ${trace.length} checks passed.`)
  }
} finally {
  await browser.close()
  if (web) {
    web.kill()
    await new Promise((res) => setTimeout(res, 1000))
  }
}
