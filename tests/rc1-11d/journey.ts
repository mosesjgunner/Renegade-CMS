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
import { createDeterministicPaymentAdapter } from '../../src/modules/commerce/payment-provider'

assert.equal(process.env.RC1_11D_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5462/rc111d_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(process.env.COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED, 'true')

const out = 'docs/rc/evidence/rc1/18-pass/11D'
const base = 'http://localhost:39018'
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

async function json(route: string, cookie = '', method = 'GET', data?: any, expected = 200) {
  const response = await request(route, cookie, method, data)
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
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39018'],
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

async function processEvent(eventId: string) {
  for (let run = 0; run < 20; run++) {
    const inbox = await payload.find({
      collection: 'payment-webhook-events',
      where: { providerEventId: { equals: eventId } },
      limit: 1,
      overrideAccess: true,
    })
    assert.equal(inbox.docs.length, 1)
    if (inbox.docs[0].processingState === 'processed') return
    if (inbox.docs[0].processingState === 'failed') throw new Error(inbox.docs[0].lastError)
    await payload.jobs.run({ queue: 'commerce', limit: 100 })
  }
  throw new Error(`Worker did not process ${eventId}`)
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

try {
  let state: any
  if (restart) {
    state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
  } else {
    const stamp = Date.now()
    const alpha = await payload.create({
      collection: 'sites',
      data: { name: '11D Alpha', slug: `alpha11d-${stamp}`, lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '11D Beta', slug: `beta11d-${stamp}`, lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@11d.test`, role: 'owner' },
    })
    const staffBeta = await payload.create({
      collection: 'users',
      data: { email: `staff-beta-${stamp}@11d.test`, role: 'staff' },
    })
    const staffBetaMember =
      typeof staffBeta.member === 'object' ? staffBeta.member.id : staffBeta.member
    await payload.create({
      collection: 'member-site-roles',
      data: { member: staffBetaMember, site: beta.id, role: 'contributor' },
    })

    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: 'http://beta.11d.test:39018' },
        launchState: 'live',
        adminExperience: { optionalCapabilities: { commerceCheckout: true } },
      },
    })

    // Merchant connections & capabilities
    const alphaMerchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: alpha.id,
        label: 'Alpha Deterministic Merchant',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    const betaMerchant = await payload.create({
      collection: 'merchant-connections',
      data: {
        site: beta.id,
        label: 'Beta Deterministic Merchant',
        providerKey: 'deterministic-test',
        merchantCountry: 'US',
        status: 'active',
      },
    })
    const alphaValidCapability = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: alpha.id,
        merchantConnection: alphaMerchant.id,
        providerKey: 'deterministic-test',
        railKey: 'alpha-card-hosted',
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
        instructions: 'Local deterministic test checkout — no real money charged.',
      },
    })
    // Ineligible capabilities on Alpha (disabled, degraded, wrong currency, wrong buyer country)
    await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: alpha.id,
        merchantConnection: alphaMerchant.id,
        providerKey: 'deterministic-test',
        railKey: 'alpha-disabled-rail',
        family: 'card',
        flow: 'hosted',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['USD'],
        settlementCurrencies: ['USD'],
        enabled: false,
        health: 'healthy',
      },
    })
    await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: alpha.id,
        merchantConnection: alphaMerchant.id,
        providerKey: 'deterministic-test',
        railKey: 'alpha-degraded-rail',
        family: 'card',
        flow: 'hosted',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['USD'],
        settlementCurrencies: ['USD'],
        enabled: true,
        health: 'degraded',
      },
    })
    await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: alpha.id,
        merchantConnection: alphaMerchant.id,
        providerKey: 'deterministic-test',
        railKey: 'alpha-eur-only-rail',
        family: 'bank-transfer',
        flow: 'hosted',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['EUR'],
        settlementCurrencies: ['EUR'],
        enabled: true,
        health: 'healthy',
      },
    })
    const betaCapability = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: beta.id,
        merchantConnection: betaMerchant.id,
        providerKey: 'deterministic-test',
        railKey: 'beta-card-hosted',
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

    const magic = await issueMagicLink(payload, `member-${stamp}@11d.test`)
    const member = await consumeMagicLink(payload, magic.token!)
    assert.ok(member?.sessionToken)
    await writeFile('scratch/rc111d/member-session.json', JSON.stringify(member))

    state = {
      alpha: alpha.id,
      beta: beta.id,
      owner: owner.id,
      staffBeta: staffBeta.id,
      memberId: member.memberId,
      alphaMerchant: alphaMerchant.id,
      betaMerchant: betaMerchant.id,
      alphaCapability: alphaValidCapability.id,
      betaCapability: betaCapability.id,
    }
  }

  await startWeb()
  const operator = await session(await row('users', state.owner))
  const staffBetaCookie = await session(await row('users', state.staffBeta))

  if (!restart) {
    // Upload private asset for digital delivery
    const image = await sharp({
      create: { width: 320, height: 320, channels: 3, background: '#1e3a8a' },
    })
      .png()
      .toBuffer()
    const sourceForm = new FormData()
    sourceForm.set('siteId', state.alpha)
    sourceForm.set('title', '11D Private Digital Guide')
    sourceForm.set('file', new File([image], '11d-guide.png', { type: 'image/png' }))
    const privateAsset = (await json('/api/media/upload', operator, 'POST', sourceForm, 201)).asset
    await json(`/api/media-assets/${privateAsset.id}`, operator, 'PATCH', {
      publicPolicy: 'private',
      rightsStatus: 'approved',
    })
    await payload.jobs.run({ queue: 'media', limit: 20 })

    // Create published physical product (stock = 10, price = $17.50 = 1750 minor)
    const physicalDoc = (
      await json(
        '/api/products',
        operator,
        'POST',
        {
          site: state.alpha,
          merchantConnection: state.alphaMerchant,
          name: '11D Field Almanac',
          slug: 'almanac-11d',
          canonicalPath: '/store/almanac-11d',
          kind: 'physical',
          state: 'draft',
          catalogContractVersion: 1,
          productCapabilities: ['shippable'],
          optionDimensions: [{ key: 'edition', label: 'Edition', values: ['standard'] }],
          variants: [
            {
              sku: 'ALMANAC-STD',
              title: 'Standard Edition',
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
              offerId: 'almanac-usd',
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
    ).doc
    await release(physicalDoc.id, operator)
    state.physicalProduct = physicalDoc.id

    // Create published digital product (price = $12.00 = 1200 minor)
    const digitalDoc = (
      await json(
        '/api/products',
        operator,
        'POST',
        {
          site: state.alpha,
          merchantConnection: state.alphaMerchant,
          name: '11D Digital Briefing',
          slug: 'briefing-11d',
          canonicalPath: '/store/briefing-11d',
          kind: 'digital',
          state: 'draft',
          catalogContractVersion: 1,
          productCapabilities: ['digital-entitlement'],
          optionDimensions: [{ key: 'format', label: 'Format', values: ['pdf'] }],
          variants: [
            {
              sku: 'BRIEFING-PDF',
              title: 'PDF Edition',
              optionValues: { format: 'pdf' },
              status: 'active',
              inventoryPolicy: 'untracked',
              inventoryQuantity: null,
            },
          ],
          offers: [
            {
              offerId: 'briefing-usd',
              version: 1,
              status: 'active',
              amountMinor: '1200',
              currency: 'USD',
              taxDisplay: 'exclusive',
            },
          ],
          digitalDelivery: {
            entitlement: '11d.briefing.read',
            downloadLimit: 3,
            expiresAfterDays: 30,
            assets: [
              {
                mediaId: privateAsset.id,
                rightsStatus: 'approved',
                malwareStatus: 'clean',
                publicOriginal: false,
              },
            ],
          },
        },
        201,
      )
    ).doc
    await release(digitalDoc.id, operator)
    state.digitalProduct = digitalDoc.id

    // =========================================================================
    // 1. CONTROLLED GUEST CHECKOUT IN CHROMIUM -> LOCAL TEST SETTLEMENT -> ORDER VIEW
    // =========================================================================
    const guestContext = await browser.newContext()
    const guestPage = await guestContext.newPage()
    await guestPage.goto(`${base}/store/almanac-11d`)
    await guestPage.waitForLoadState('networkidle')
    const privacyBtn = guestPage.getByRole('button', { name: 'Reject non-essential', exact: true })
    if (await privacyBtn.isVisible()) await privacyBtn.click()
    await guestPage.getByLabel('Quantity', { exact: true }).fill('1')
    const addWait = guestPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
    )
    await guestPage
      .getByRole('button', { name: 'Add 11D Field Almanac to cart', exact: true })
      .click()
    assert.equal((await addWait).status(), 200)

    await guestPage.goto(`${base}/cart`)
    await guestPage.getByLabel('Email Address').fill('guest-buyer@11d.test')
    await guestPage.getByLabel('Full Name').fill('Guest Buyer')
    await guestPage.getByLabel('Street Address').fill('100 Main St')
    await guestPage.getByLabel('City').fill('Austin')
    await guestPage.getByLabel('State / Province').fill('TX')
    await guestPage.getByLabel('Postal Code').fill('78701')
    await guestPage.getByLabel('Country (2-letter ISO)').fill('US')
    await guestPage.getByRole('checkbox').check()

    const proposalWait = guestPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/proposal') && r.request().method() === 'POST',
    )
    const methodsWait = guestPage.waitForResponse((r) =>
      r.url().includes('/api/commerce/checkout/methods?proposal='),
    )
    await guestPage.getByRole('button', { name: 'Create Checkout Proposal', exact: true }).click()
    const proposalResp = await proposalWait
    const methodsResp = await methodsWait
    assert.equal(proposalResp.status(), 200)
    assert.equal(methodsResp.status(), 200)
    const guestProposal = (await proposalResp.json()).proposal
    const guestMethods = (await methodsResp.json()).methods
    state.guestProposalId = guestProposal.id
    check(
      'guest proposal binds to active site merchant and filters eligible payment methods strictly to 1 healthy USD method',
      guestProposal.pricingSnapshot.grandTotalMinor === '2359' &&
        guestMethods.length === 1 &&
        guestMethods[0].id === state.alphaCapability &&
        guestMethods[0].label === 'alpha-card-hosted',
    )

    // Cross-site payment capability rejection before initiating valid checkout
    const crossSiteCapRes = await guestContext.request.post(
      `${base}/api/commerce/checkout/initiate`,
      {
        data: { proposalId: guestProposal.id, capabilityId: state.betaCapability },
      },
    )
    check('cross-site payment capability rejected with 403', crossSiteCapRes.status() === 403)

    // Initiate checkout in browser UI
    const initWait = guestPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/checkout/initiate') && r.request().method() === 'POST',
    )
    await guestPage.getByRole('button', { name: /Confirm & Pay \$23\.59/ }).click()
    const initResp = await initWait
    assert.equal(initResp.status(), 200)
    const guestCheckout = await initResp.json()
    state.guestSessionId = guestCheckout.sessionId
    state.guestIntentId = guestCheckout.intentId
    state.guestAttemptId = guestCheckout.attemptId
    check(
      'guest browser checkout initiation creates open session, requires-action intent and action-required attempt',
      guestCheckout.state === 'action-required' &&
        String(guestCheckout.actionUrl).startsWith('/checkout/test/det_cs_'),
    )

    // Idempotent replay of POST /api/commerce/checkout/initiate with the same proposalId
    const replayInitRes = await guestContext.request.post(
      `${base}/api/commerce/checkout/initiate`,
      {
        data: { proposalId: guestProposal.id, capabilityId: state.alphaCapability },
      },
    )
    assert.equal(replayInitRes.status(), 200)
    const replayInitJson = await replayInitRes.json()
    check(
      'replaying checkout initiation returns existing intent and attempt without duplicate creation',
      replayInitJson.replay === true &&
        replayInitJson.intentId === state.guestIntentId &&
        replayInitJson.attemptId === state.guestAttemptId,
    )

    // Navigate to local test checkout page in browser
    await guestPage.getByRole('link', { name: 'Complete Payment →' }).click()
    await guestPage.waitForURL(/\/checkout\/test\/det_cs_/)
    await guestPage.getByRole('heading', { name: 'Local test checkout' }).waitFor()
    check(
      'guest browser renders local test checkout page with exact 2359 USD minor units',
      await guestPage.getByText('Amount: 2359 USD minor units').isVisible(),
    )

    // Confirm test payment in browser -> redirects to /checkout/return?session=...
    await guestPage.getByRole('button', { name: 'Confirm test payment' }).click()
    await guestPage.waitForURL(/\/checkout\/return\?session=/)

    // Before worker runs, browser redirect alone must NOT settle the order
    const preWorkerOrders = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: state.guestSessionId } },
      overrideAccess: true,
    })
    check(
      'browser return redirect does not settle payment or create order before verified webhook job runs',
      preWorkerOrders.docs.length === 0 &&
        (await row('payment-attempts', state.guestAttemptId)).state === 'action-required',
    )

    // Run commerce worker queue to process the signed webhook event
    await payload.jobs.run({ queue: 'commerce', limit: 20 })

    // Wait for browser polling on /checkout/return to observe settled order
    await guestPage.getByRole('heading', { name: 'Payment confirmed' }).waitFor({ timeout: 15000 })
    const guestOrderDoc = (
      await payload.find({
        collection: 'orders',
        where: { checkoutSession: { equals: state.guestSessionId } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    state.guestOrderId = guestOrderDoc.id
    state.guestOrderNumber = guestOrderDoc.orderNumber
    state.guestReceiptNumber = guestOrderDoc.receipt.receiptNumber

    check(
      'guest browser order view renders confirmed order number, receipt number, settled total and line item',
      (await guestPage.getByText(`Order ${state.guestOrderNumber} is paid.`).isVisible()) &&
        (await guestPage.getByText(`Receipt ${state.guestReceiptNumber}.`).isVisible()) &&
        (await guestPage.getByText('Settled total: 2359 USD minor units').isVisible()) &&
        (await guestPage
          .getByText(/Standard Edition \(ALMANAC-STD\) × 1 — 1750 USD minor units/)
          .isVisible()),
    )

    const guestIntentDoc = await row('payment-intents', state.guestIntentId)
    const guestSessionDoc = await row('checkout-sessions', state.guestSessionId)
    const guestCartDoc = await row('carts', guestSessionDoc.cart)
    const guestProposalDoc = await row('checkout-proposals', state.guestProposalId)
    const guestReservations = await payload.find({
      collection: 'inventory-reservations',
      where: { proposal: { equals: state.guestProposalId } },
      overrideAccess: true,
    })
    const guestReceiptDeliveries = await payload.find({
      collection: 'email-deliveries',
      where: { recipientEmail: { equals: 'guest-buyer@11d.test' } },
      overrideAccess: true,
    })
    check(
      'guest settlement persists completed session, paid intent with financialEvents, paid order, decremented stock (10 -> 9), converted cart, consumed reservation and receipt email',
      guestSessionDoc.state === 'completed' &&
        guestIntentDoc.state === 'paid' &&
        Array.isArray(guestIntentDoc.financialEvents) &&
        guestIntentDoc.financialEvents.length === 1 &&
        guestOrderDoc.state === 'paid' &&
        guestOrderDoc.amountMinor === '2359' &&
        guestOrderDoc.receipt?.state === 'issued' &&
        (await row('products', state.physicalProduct)).variants[0].inventoryQuantity === 9 &&
        guestCartDoc.state === 'converted' &&
        guestProposalDoc.state === 'consumed' &&
        guestReservations.docs.every((r: any) => r.status === 'consumed') &&
        guestReceiptDeliveries.docs.length === 1,
    )

    // =========================================================================
    // 2. CONTROLLED MEMBER CHECKOUT IN CHROMIUM -> LOCAL TEST SETTLEMENT -> ORDER VIEW & DIGITAL GRANT
    // =========================================================================
    const savedMember = JSON.parse(await readFile('scratch/rc111d/member-session.json', 'utf8'))
    const memberContext = await browser.newContext()
    await memberContext.addCookies([
      {
        name: 'renegade-member',
        value: savedMember.sessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
      {
        name: 'renegade-member-csrf',
        value: 'member-csrf-11d',
        domain: 'localhost',
        path: '/',
        sameSite: 'Lax',
      },
    ])
    const memberPage = await memberContext.newPage()

    // Member adds physical Almanac + digital Briefing in browser
    await memberPage.goto(`${base}/store/almanac-11d`)
    await memberPage.waitForLoadState('networkidle')
    const mPriv = memberPage.getByRole('button', { name: 'Reject non-essential', exact: true })
    if (await mPriv.isVisible()) await mPriv.click()
    await memberPage.getByLabel('Quantity', { exact: true }).fill('1')
    const mAdd1 = memberPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
    )
    await memberPage
      .getByRole('button', { name: 'Add 11D Field Almanac to cart', exact: true })
      .click()
    assert.equal((await mAdd1).status(), 200)

    await memberPage.goto(`${base}/store/briefing-11d`)
    await memberPage.waitForLoadState('networkidle')
    await memberPage.getByLabel('Quantity', { exact: true }).fill('1')
    const mAdd2 = memberPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
    )
    await memberPage
      .getByRole('button', { name: 'Add 11D Digital Briefing to cart', exact: true })
      .click()
    assert.equal((await mAdd2).status(), 200)

    await memberPage.goto(`${base}/cart`)
    await memberPage.getByLabel('Email Address').fill('member-buyer@11d.test')
    await memberPage.getByLabel('Full Name').fill('Member Buyer')
    await memberPage.getByLabel('Street Address').fill('200 Congress Ave')
    await memberPage.getByLabel('City').fill('Austin')
    await memberPage.getByLabel('State / Province').fill('TX')
    await memberPage.getByLabel('Postal Code').fill('78701')
    await memberPage.getByLabel('Country (2-letter ISO)').fill('US')
    await memberPage.getByRole('checkbox').check()

    const mPropWait = memberPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/proposal') && r.request().method() === 'POST',
    )
    await memberPage.getByRole('button', { name: 'Create Checkout Proposal', exact: true }).click()
    const mPropResp = await mPropWait
    assert.equal(mPropResp.status(), 200)
    const memberProposal = (await mPropResp.json()).proposal
    state.memberProposalId = memberProposal.id
    // Subtotal: 1750 + 1200 = 2950; Shipping: 500; Tax (6.25% on 2950): 184; GrandTotal: 3634
    check(
      'member proposal computes exact 3634 minor units across physical and digital items',
      memberProposal.pricingSnapshot.subtotalMinor === '2950' &&
        memberProposal.pricingSnapshot.netShippingMinor === '500' &&
        memberProposal.pricingSnapshot.taxTotalMinor === '184' &&
        memberProposal.pricingSnapshot.grandTotalMinor === '3634',
    )

    const mInitWait = memberPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/checkout/initiate') && r.request().method() === 'POST',
    )
    await memberPage.getByRole('button', { name: /Confirm & Pay \$36\.34/ }).click()
    const mInitResp = await mInitWait
    assert.equal(mInitResp.status(), 200)
    const memberCheckout = await mInitResp.json()
    state.memberSessionId = memberCheckout.sessionId
    state.memberIntentId = memberCheckout.intentId
    state.memberAttemptId = memberCheckout.attemptId

    // Member clicks Complete Payment -> views /checkout/test/det_cs_... authorized by member session ownership
    await memberPage.getByRole('link', { name: 'Complete Payment →' }).click()
    await memberPage.waitForURL(/\/checkout\/test\/det_cs_/)
    await memberPage.getByRole('heading', { name: 'Local test checkout' }).waitFor()
    check(
      'authenticated member browser accesses local test checkout page without guest cookie',
      await memberPage.getByText('Amount: 3634 USD minor units').isVisible(),
    )

    // Guest cannot confirm member's test checkout reference
    const memberReference = String(memberCheckout.actionUrl).split('/').at(-1)!
    const crossConfirmRes = await guestContext.request.post(
      `${base}/api/commerce/checkout/test/confirm`,
      {
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        data: `reference=${encodeURIComponent(memberReference)}`,
      },
    )
    check(
      'guest cannot confirm member test checkout reference (403)',
      crossConfirmRes.status() === 403,
    )

    // Member confirms test payment in browser
    await memberPage.getByRole('button', { name: 'Confirm test payment' }).click()
    await memberPage.waitForURL(/\/checkout\/return\?session=/)

    // Run commerce worker queue to settle member payment
    await payload.jobs.run({ queue: 'commerce', limit: 20 })

    await memberPage.getByRole('heading', { name: 'Payment confirmed' }).waitFor({ timeout: 15000 })
    const memberOrderDoc = (
      await payload.find({
        collection: 'orders',
        where: { checkoutSession: { equals: state.memberSessionId } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    state.memberOrderId = memberOrderDoc.id
    state.memberOrderNumber = memberOrderDoc.orderNumber
    state.memberReceiptNumber = memberOrderDoc.receipt.receiptNumber

    check(
      'member browser order view renders paid order, receipt, settled total, items and digital download link',
      (await memberPage.getByText(`Order ${state.memberOrderNumber} is paid.`).isVisible()) &&
        (await memberPage.getByText(`Receipt ${state.memberReceiptNumber}.`).isVisible()) &&
        (await memberPage.getByText('Settled total: 3634 USD minor units').isVisible()) &&
        (await memberPage
          .getByRole('link', { name: 'Download purchased file BRIEFING-PDF' })
          .isVisible()),
    )

    const memberGrants = await payload.find({
      collection: 'digital-delivery-grants',
      where: { member: { equals: state.memberId } },
      overrideAccess: true,
    })
    const memberEntitlements = await payload.find({
      collection: 'entitlements',
      where: { paymentIntent: { equals: state.memberIntentId } },
      overrideAccess: true,
    })
    check(
      'member settlement creates 1 order, decrements stock once more (9 -> 8), and issues 1 entitlement and 1 digital delivery grant',
      memberOrderDoc.state === 'paid' &&
        memberOrderDoc.partySnapshot?.memberId === state.memberId &&
        (await row('products', state.physicalProduct)).variants[0].inventoryQuantity === 8 &&
        memberEntitlements.docs.length === 1 &&
        memberGrants.docs.length === 1,
    )

    // =========================================================================
    // 3. IMMUTABLE FINANCIAL SNAPSHOTS AFTER CATALOG PRICE CHANGE
    // =========================================================================
    await json(`/api/products/${state.physicalProduct}`, operator, 'PATCH', {
      offers: [
        {
          offerId: 'almanac-usd',
          version: 2,
          status: 'active',
          amountMinor: '2900',
          currency: 'USD',
          taxDisplay: 'exclusive',
        },
      ],
    })
    await release(state.physicalProduct, operator)
    const guestStatusAfterPriceChange = await (
      await guestContext.request.get(
        `${base}/api/commerce/checkout/status?session=${state.guestSessionId}`,
      )
    ).json()
    const memberStatusAfterPriceChange = await (
      await memberContext.request.get(
        `${base}/api/commerce/checkout/status?session=${state.memberSessionId}`,
      )
    ).json()
    check(
      'later catalog price update (1750 -> 2900) leaves settled guest and member order snapshots and totals immutable',
      guestStatusAfterPriceChange.order.amountMinor === '2359' &&
        guestStatusAfterPriceChange.order.items[0].unitAmountMinor === '1750' &&
        memberStatusAfterPriceChange.order.amountMinor === '3634' &&
        (await row('orders', state.guestOrderId)).totalsSnapshot.grandTotalMinor === '2359',
    )

    // =========================================================================
    // 4. WEBHOOK FORGERY, REPLAY & OUT-OF-ORDER SEQUENCE PROTECTION
    // =========================================================================
    const forgedDetRes = await request(
      '/api/commerce/webhooks/deterministic-test',
      '',
      'POST',
      JSON.stringify({
        providerEventId: 'forged-evt-1',
        providerReference: 'det_cs_0123456789abcdef01234567',
        kind: 'succeeded',
        amountMinor: '2359',
        currency: 'USD',
        occurredAt: new Date().toISOString(),
        sanitizedEvidence: { attemptId: state.guestAttemptId },
      }),
      { 'content-type': 'application/json', 'x-commerce-signature': 'invalid-hmac-signature' },
    )
    const unknownProviderRes = await request(
      '/api/commerce/webhooks/unconfigured-provider',
      '',
      'POST',
      '{}',
      { 'content-type': 'application/json' },
    )
    check(
      'forged webhook signature rejected (401) and unconfigured provider returns 404',
      forgedDetRes.status === 401 && unknownProviderRes.status === 404,
    )

    // Replay the exact signed webhook event for guestAttemptId
    const guestAttemptDoc = await row('payment-attempts', state.guestAttemptId)
    const replayPayload = signDeterministicWebhook({
      providerEventId: `local-test-paid:${state.guestAttemptId}`,
      providerReference: guestAttemptDoc.providerReference,
      kind: 'succeeded',
      amountMinor: '2359',
      currency: 'USD',
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: state.guestAttemptId, source: 'local-test-checkout' },
    })
    const replayWebhookRes = await request(
      '/api/commerce/webhooks/deterministic-test',
      '',
      'POST',
      replayPayload.raw,
      {
        'content-type': 'application/json',
        'x-commerce-signature': replayPayload.signature,
      },
    )
    const replayWebhookJson = await replayWebhookRes.json()
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    const guestOrdersAfterReplay = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: state.guestSessionId } },
      overrideAccess: true,
    })
    check(
      'webhook replay is deduplicated without duplicate order, receipt or stock decrement',
      replayWebhookRes.status === 200 &&
        replayWebhookJson.replay === true &&
        guestOrdersAfterReplay.docs.length === 1 &&
        (await row('products', state.physicalProduct)).variants[0].inventoryQuantity === 8,
    )

    // Out-of-order / stale lower-sequence failure event arriving after succeeded
    const seqHighPayload = signDeterministicWebhook({
      providerEventId: `seq-high:${state.guestAttemptId}`,
      providerReference: guestAttemptDoc.providerReference,
      kind: 'succeeded',
      amountMinor: '2359',
      currency: 'USD',
      sequence: 20,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: state.guestAttemptId },
    })
    const seqLowFailPayload = signDeterministicWebhook({
      providerEventId: `seq-low-fail:${state.guestAttemptId}`,
      providerReference: guestAttemptDoc.providerReference,
      kind: 'failed',
      amountMinor: '2359',
      currency: 'USD',
      sequence: 5,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: state.guestAttemptId },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', seqHighPayload.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': seqHighPayload.signature,
        })
      ).status,
      202,
    )
    assert.equal(
      (
        await request(
          '/api/commerce/webhooks/deterministic-test',
          '',
          'POST',
          seqLowFailPayload.raw,
          {
            'content-type': 'application/json',
            'x-commerce-signature': seqLowFailPayload.signature,
          },
        )
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    const guestAttemptAfterStale = await row('payment-attempts', state.guestAttemptId)
    const guestOrderAfterStale = await row('orders', state.guestOrderId)
    check(
      'out-of-order stale failure event does not regress succeeded attempt or paid order',
      guestAttemptAfterStale.state === 'succeeded' &&
        guestAttemptAfterStale.lastProviderSequence === 20 &&
        guestAttemptAfterStale.processedEventIds.includes(`seq-low-fail:${state.guestAttemptId}`) &&
        guestOrderAfterStale.state === 'paid',
    )

    // =========================================================================
    // 5. PAYMENT DISAGREEMENT QUARANTINE & TERMINAL-SUCCESS CONFLICT QUARANTINE
    // =========================================================================
    // Helper to create an isolated guest checkout attempt for negative settlement tests
    const startIsolatedCheckout = async (email: string, digital = false) => {
      const ctx = await browser.newContext()
      const add = await ctx.request.post(`${base}/api/commerce/cart`, {
        data: {
          productId: digital ? state.digitalProduct : state.physicalProduct,
          variantSku: digital ? 'BRIEFING-PDF' : 'ALMANAC-STD',
          quantity: 1,
        },
      })
      assert.equal(add.status(), 200)
      const prop = await ctx.request.post(`${base}/api/commerce/proposal`, {
        data: addressQuote(email, 'Negative Test Buyer'),
      })
      assert.equal(prop.status(), 200)
      const proposal = (await prop.json()).proposal
      const init = await ctx.request.post(`${base}/api/commerce/checkout/initiate`, {
        data: { proposalId: proposal.id, capabilityId: state.alphaCapability },
      })
      assert.equal(init.status(), 200)
      const checkout = await init.json()
      await ctx.close()
      return checkout
    }

    // 5A. Amount disagreement (signed webhook reports 100 minor units instead of 3581)
    const mismatchCheckout = await startIsolatedCheckout('mismatch@11d.test')
    state.mismatchAttemptId = mismatchCheckout.attemptId
    const mismatchAttemptDoc = await row('payment-attempts', mismatchCheckout.attemptId)
    const mismatchWebhook = signDeterministicWebhook({
      providerEventId: `mismatch-amt:${mismatchCheckout.attemptId}`,
      providerReference: mismatchAttemptDoc.providerReference,
      kind: 'succeeded',
      amountMinor: '100', // disagrees with 3581!
      currency: 'USD',
      sequence: 1,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: mismatchCheckout.attemptId },
    })
    assert.equal(
      (
        await request(
          '/api/commerce/webhooks/deterministic-test',
          '',
          'POST',
          mismatchWebhook.raw,
          { 'content-type': 'application/json', 'x-commerce-signature': mismatchWebhook.signature },
        )
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    const mismatchAttemptAfter = await row('payment-attempts', mismatchCheckout.attemptId)
    const mismatchOrders = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: mismatchCheckout.sessionId } },
      overrideAccess: true,
    })
    const mismatchCases = await payload.find({
      collection: 'commerce-reconciliation-cases',
      where: {
        and: [
          { legacyType: { equals: 'payment-attempt' } },
          { legacyId: { equals: String(mismatchCheckout.attemptId) } },
        ],
      },
      overrideAccess: true,
    })
    check(
      'payment amount disagreement transitions attempt to unknown, creates quarantined reconciliation case and creates 0 orders',
      mismatchAttemptAfter.state === 'unknown' &&
        mismatchAttemptAfter.failure?.code === 'amount-or-currency-mismatch' &&
        mismatchOrders.docs.length === 0 &&
        mismatchCases.docs.length === 1 &&
        mismatchCases.docs[0].reason === 'amount-or-currency-mismatch' &&
        mismatchCases.docs[0].status === 'quarantined' &&
        (await row('products', state.physicalProduct)).variants[0].inventoryQuantity === 8,
    )

    // 5B. Terminal-success conflict (attempt fails first, then late succeeded arrives)
    const conflictCheckout = await startIsolatedCheckout('conflict@11d.test')
    state.conflictAttemptId = conflictCheckout.attemptId
    const conflictAttemptDoc = await row('payment-attempts', conflictCheckout.attemptId)
    const failFirstWebhook = signDeterministicWebhook({
      providerEventId: `fail-first:${conflictCheckout.attemptId}`,
      providerReference: conflictAttemptDoc.providerReference,
      kind: 'failed',
      amountMinor: conflictAttemptDoc.amountMinor,
      currency: 'USD',
      sequence: 1,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: conflictCheckout.attemptId },
    })
    const lateWinWebhook = signDeterministicWebhook({
      providerEventId: `late-win:${conflictCheckout.attemptId}`,
      providerReference: conflictAttemptDoc.providerReference,
      kind: 'succeeded',
      amountMinor: conflictAttemptDoc.amountMinor,
      currency: 'USD',
      sequence: 2,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: conflictCheckout.attemptId },
    })
    assert.equal(
      (
        await request(
          '/api/commerce/webhooks/deterministic-test',
          '',
          'POST',
          failFirstWebhook.raw,
          {
            'content-type': 'application/json',
            'x-commerce-signature': failFirstWebhook.signature,
          },
        )
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    assert.equal((await row('payment-attempts', conflictCheckout.attemptId)).state, 'failed')

    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', lateWinWebhook.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': lateWinWebhook.signature,
        })
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    const conflictAttemptAfter = await row('payment-attempts', conflictCheckout.attemptId)
    const conflictOrders = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: conflictCheckout.sessionId } },
      overrideAccess: true,
    })
    const conflictCases = await payload.find({
      collection: 'commerce-reconciliation-cases',
      where: {
        and: [
          { legacyType: { equals: 'payment-attempt' } },
          { legacyId: { equals: String(conflictCheckout.attemptId) } },
        ],
      },
      overrideAccess: true,
    })
    check(
      'late success after terminal failure quarantines attempt as terminal-success-conflict without creating an order',
      conflictAttemptAfter.state === 'unknown' &&
        conflictAttemptAfter.failure?.code === 'terminal-success-conflict' &&
        conflictOrders.docs.length === 0 &&
        conflictCases.docs.length === 1 &&
        conflictCases.docs[0].reason === 'terminal-success-conflict',
    )

    // =========================================================================
    // 6. CONCURRENT CHECKOUT INITIATION & WEBHOOK PROCESSING RACE
    // =========================================================================
    const raceCtx = await browser.newContext()
    await raceCtx.request.post(`${base}/api/commerce/cart`, {
      data: { productId: state.physicalProduct, variantSku: 'ALMANAC-STD', quantity: 1 },
    })
    const racePropRes = await raceCtx.request.post(`${base}/api/commerce/proposal`, {
      data: addressQuote('race@11d.test', 'Race Buyer'),
    })
    const raceProposal = (await racePropRes.json()).proposal
    const [raceInit1, raceInit2, raceInit3] = await Promise.all([
      raceCtx.request.post(`${base}/api/commerce/checkout/initiate`, {
        data: { proposalId: raceProposal.id, capabilityId: state.alphaCapability },
      }),
      raceCtx.request.post(`${base}/api/commerce/checkout/initiate`, {
        data: { proposalId: raceProposal.id, capabilityId: state.alphaCapability },
      }),
      raceCtx.request.post(`${base}/api/commerce/checkout/initiate`, {
        data: { proposalId: raceProposal.id, capabilityId: state.alphaCapability },
      }),
    ])
    assert.equal(raceInit1.status(), 200)
    assert.equal(raceInit2.status(), 200)
    assert.equal(raceInit3.status(), 200)
    const rj1 = await raceInit1.json()
    const rj2 = await raceInit2.json()
    const rj3 = await raceInit3.json()
    const raceSessions = await payload.find({
      collection: 'checkout-sessions',
      where: { proposal: { equals: raceProposal.id } },
      overrideAccess: true,
    })
    const raceIntents = await payload.find({
      collection: 'payment-intents',
      where: { checkoutSession: { equals: rj1.sessionId } },
      overrideAccess: true,
    })
    const raceAttempts = await payload.find({
      collection: 'payment-attempts',
      where: { checkoutSession: { equals: rj1.sessionId } },
      overrideAccess: true,
    })
    check(
      'concurrent checkout initiation requests serialize via execution lock and produce 1 session, 1 intent and 1 attempt',
      rj1.intentId === rj2.intentId &&
        rj2.intentId === rj3.intentId &&
        rj1.attemptId === rj2.attemptId &&
        raceSessions.docs.length === 1 &&
        raceIntents.docs.length === 1 &&
        raceAttempts.docs.length === 1,
    )

    // Concurrent webhook deliveries & concurrent settlement worker invocations for the race attempt
    const raceAttemptDoc = raceAttempts.docs[0]
    const raceWh1 = signDeterministicWebhook({
      providerEventId: `race-wh-1:${raceAttemptDoc.id}`,
      providerReference: raceAttemptDoc.providerReference,
      kind: 'succeeded',
      amountMinor: raceAttemptDoc.amountMinor,
      currency: 'USD',
      sequence: 10,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: String(raceAttemptDoc.id) },
    })
    const raceWh2 = signDeterministicWebhook({
      providerEventId: `race-wh-2:${raceAttemptDoc.id}`,
      providerReference: raceAttemptDoc.providerReference,
      kind: 'succeeded',
      amountMinor: raceAttemptDoc.amountMinor,
      currency: 'USD',
      sequence: 11,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: String(raceAttemptDoc.id) },
    })
    await Promise.all([
      request('/api/commerce/webhooks/deterministic-test', '', 'POST', raceWh1.raw, {
        'content-type': 'application/json',
        'x-commerce-signature': raceWh1.signature,
      }),
      request('/api/commerce/webhooks/deterministic-test', '', 'POST', raceWh1.raw, {
        'content-type': 'application/json',
        'x-commerce-signature': raceWh1.signature,
      }),
      request('/api/commerce/webhooks/deterministic-test', '', 'POST', raceWh2.raw, {
        'content-type': 'application/json',
        'x-commerce-signature': raceWh2.signature,
      }),
    ])
    const raceInbox = await payload.find({
      collection: 'payment-webhook-events',
      where: {
        providerEventId: {
          in: [`race-wh-1:${raceAttemptDoc.id}`, `race-wh-2:${raceAttemptDoc.id}`],
        },
      },
      overrideAccess: true,
    })
    const { processPaymentEventTask } = await import('../../src/modules/commerce/tasks')
    await Promise.all(
      raceInbox.docs.map((evt: any) =>
        (processPaymentEventTask.handler as any)({
          input: { webhookEventId: String(evt.id) },
          req: { payload },
        }),
      ),
    )
    const raceOrders = await payload.find({
      collection: 'orders',
      where: { checkoutSession: { equals: rj1.sessionId } },
      overrideAccess: true,
    })
    state.raceOrderId = raceOrders.docs[0]?.id
    check(
      'concurrent webhook deliveries and concurrent worker executions produce 1 order and decrement stock once (8 -> 7)',
      raceOrders.docs.length === 1 &&
        raceOrders.docs[0].state === 'paid' &&
        (await row('products', state.physicalProduct)).variants[0].inventoryQuantity === 7,
    )
    await raceCtx.close()

    // =========================================================================
    // 8. ACCESS CONTROL, HOST ISOLATION & NATIVE REST DENIALS
    // =========================================================================
    // Guest cannot read member's checkout status; member cannot read guest's checkout status without guest cookie
    const guestReadsMemberStatus = await guestContext.request.get(
      `${base}/api/commerce/checkout/status?session=${state.memberSessionId}`,
    )
    const memberReadsGuestStatus = await memberContext.request.get(
      `${base}/api/commerce/checkout/status?session=${state.guestSessionId}`,
    )
    const { GET: statusGET } = await import(
      '../../src/app/(frontend)/api/commerce/checkout/status/route'
    )
    const foreignHostStatus = await statusGET(
      new Request(
        `http://beta.11d.test:39018/api/commerce/checkout/status?session=${state.guestSessionId}`,
        {
          headers: { host: 'beta.11d.test:39018' },
        },
      ),
    )
    const crossOriginInit = await request(
      '/api/commerce/checkout/initiate',
      '',
      'POST',
      { proposalId: state.guestProposalId, capabilityId: state.alphaCapability },
      { origin: 'https://evil.example' },
    )
    check(
      'checkout status and initiate enforce actor ownership, host site binding and origin CSRF',
      guestReadsMemberStatus.status() === 403 &&
        memberReadsGuestStatus.status() === 403 &&
        foreignHostStatus.status === 404 &&
        crossOriginInit.status === 403,
    )

    // Native REST write denials on financial collections even for owner/anonymous
    for (const col of ['orders', 'payment-intents', 'payment-attempts', 'payment-webhook-events']) {
      const anonWrite = await request(`/api/${col}`, '', 'POST', { state: 'paid' })
      const ownerDirectWrite = await request(`/api/${col}`, operator, 'POST', { state: 'paid' })
      check(
        `direct native POST /api/${col} is denied for anonymous (${anonWrite.status}) and operator (${ownerDirectWrite.status})`,
        anonWrite.status === 403 && ownerDirectWrite.status === 403,
      )
    }

    // Operator dashboard scope check
    const betaDashboardOnAlpha = await request(
      `/api/admin/commerce/dashboard?siteId=${state.alpha}`,
      staffBetaCookie,
    )
    const ownerDashboard = await json(
      `/api/admin/commerce/dashboard?siteId=${state.alpha}`,
      operator,
    )
    check(
      'commerce operator dashboard denies foreign staff (403) and reports quarantined cases for owner',
      betaDashboardOnAlpha.status === 403 &&
        Array.isArray(ownerDashboard.reconciliationCases) &&
        ownerDashboard.reconciliationCases.length >= 2,
    )

    // 11D: ordinary owned download -> authorized partial/full refund -> persisted revocation.
    const memberCookie = `renegade-member=${savedMember.sessionToken}`
    const beforeStatus = await json(
      `/api/commerce/checkout/status?session=${state.memberSessionId}`,
      memberCookie,
    )
    state.downloadPath = beforeStatus.downloads[0].path
    check(
      'copied member download denied anonymously and to another authenticated member',
      (await request(state.downloadPath)).status === 404,
    )
    const otherMagic = await issueMagicLink(payload, `other-${Date.now()}@11d.test`)
    const other = await consumeMagicLink(payload, otherMagic.token!)
    const otherCookie = `renegade-member=${other!.sessionToken}`
    check(
      'wrong member cannot read order status or download owned bytes',
      (await request(state.downloadPath, otherCookie)).status === 404 &&
        (
          await request(
            `/api/commerce/checkout/status?session=${state.memberSessionId}`,
            otherCookie,
          )
        ).status === 403,
    )
    const downloaded = await request(state.downloadPath, memberCookie)
    check(
      'owned private download returns exact uploaded bytes and no-store',
      downloaded.status === 200 &&
        Buffer.from(await downloaded.arrayBuffer()).equals(image) &&
        downloaded.headers.get('cache-control') === 'private, no-store',
    )
    const foreignDownloadStatus = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        `${base}${state.downloadPath}`,
        { headers: { host: 'beta.11d.test:39018', cookie: memberCookie } },
        (response) => {
          response.resume()
          resolve(response.statusCode!)
        },
      )
      req.on('error', reject)
      req.end()
    })
    check('foreign host cannot use copied download', foreignDownloadStatus === 404)
    const resendPath = `/api/admin/commerce/receipts/${state.memberOrderId}/resend`
    check(
      'receipt resend denies customer and foreign operator',
      (await request(resendPath, memberCookie, 'POST')).status === 403 &&
        (await request(resendPath, staffBetaCookie, 'POST')).status === 403,
    )
    const resent = await json(resendPath, operator, 'POST', {}, 202)
    const delivery = await row('email-deliveries', resent.deliveryId)
    check(
      'authorized receipt resend queues immutable price and recipient snapshot',
      delivery.status === 'queued' && delivery.messageSnapshot.variables.amountMinor === '3634',
    )
    const refundBody = {
      action: 'request',
      orderId: state.memberOrderId,
      amountMinor: '100',
      reason: '11D partial refund',
    }
    for (const [label, cookie] of [
      ['anonymous', ''],
      ['customer', memberCookie],
      ['foreign staff', staffBetaCookie],
    ]) {
      check(
        `${label} refund denied`,
        (await request('/api/admin/commerce/refunds', cookie, 'POST', refundBody)).status === 403,
      )
    }
    check(
      'refund cross-origin denied',
      (
        await request('/api/admin/commerce/refunds', operator, 'POST', refundBody, {
          origin: 'https://evil.test',
        })
      ).status === 403,
    )
    check(
      'refund invalid action denied',
      (
        await request('/api/admin/commerce/refunds', operator, 'POST', {
          ...refundBody,
          action: 'invented',
        })
      ).status === 400,
    )
    check(
      'refund exceeding captured total denied',
      (
        await request('/api/admin/commerce/refunds', operator, 'POST', {
          ...refundBody,
          amountMinor: '99999',
        })
      ).status === 422,
    )
    const partial = await json('/api/admin/commerce/refunds', operator, 'POST', refundBody)
    check(
      'authorized partial refund persisted and retains owned access',
      partial.refund.state === 'succeeded' &&
        (await row('orders', state.memberOrderId)).refundExtension.refundedAmountMinor === '100' &&
        (await request(state.downloadPath, memberCookie)).status === 200,
    )
    const pending = await json(
      '/api/admin/commerce/refunds',
      operator,
      'POST',
      { ...refundBody, amountMinor: '3534', reason: '11D remaining balance' },
      202,
    )
    check(
      'large refund requires second operator and blocks a new pending refund',
      pending.approvalRequired &&
        (await request('/api/admin/commerce/refunds', operator, 'POST', refundBody)).status ===
          409 &&
        (
          await request('/api/admin/commerce/refunds', operator, 'POST', {
            action: 'approve',
            refundId: pending.refund.id,
          })
        ).status === 409,
    )
    const secondOwner = await payload.create({
      collection: 'users',
      data: { email: `second-${Date.now()}@11d.test`, role: 'owner' },
    })
    const secondCookie = await session(secondOwner)
    const full = await json('/api/admin/commerce/refunds', secondCookie, 'POST', {
      action: 'approve',
      refundId: pending.refund.id,
    })
    state.refundId = full.refund.id
    const refunded = await row('orders', state.memberOrderId)
    const grantRows = await payload.find({
      collection: 'digital-delivery-grants',
      where: { member: { equals: state.memberId } },
      depth: 1,
      overrideAccess: true,
    })
    check(
      'full refund persists financial reconciliation and revokes grant plus entitlement',
      full.refund.state === 'succeeded' &&
        refunded.state === 'refunded' &&
        refunded.refundExtension.refundedAmountMinor === '3634' &&
        grantRows.docs.every((grant: any) => grant.revokedAt && grant.entitlement.revokedAt),
    )
    check(
      'old owned link denied after full refund',
      (await request(state.downloadPath, memberCookie)).status === 404,
    )
    const corrections = await payload.find({
      collection: 'email-deliveries',
      where: { idempotencyKey: { equals: `commerce-refund-receipt:${full.refund.id}` } },
      overrideAccess: true,
    })
    check(
      'one durable correction notification queued without claiming delivery',
      corrections.docs.length === 1 && corrections.docs[0].status === 'queued',
    )
    await json('/api/admin/commerce/refunds', operator, 'POST', {
      action: 'reconcile',
      refundId: full.refund.id,
    })
    const afterReplay = await row('orders', state.memberOrderId)
    check(
      'confirmed refund reconciliation replay keeps one history entry and immutable snapshots',
      afterReplay.transitionLog.filter((entry: any) => entry.refundId === full.refund.id).length ===
        1 &&
        afterReplay.amountMinor === '3634' &&
        JSON.stringify(afterReplay.items) === JSON.stringify(memberOrderDoc.items) &&
        JSON.stringify(afterReplay.totalsSnapshot) ===
          JSON.stringify(memberOrderDoc.totalsSnapshot),
    )
    await memberPage.reload()
    await memberPage.getByText(`Order ${state.memberOrderNumber} is refunded.`).waitFor()
    check(
      'customer sees refunded order receipt history and no download link',
      (await memberPage.getByText(`Receipt ${state.memberReceiptNumber}.`).isVisible()) &&
        (await memberPage.getByText('Refund: 3634 USD minor units (full).').isVisible()) &&
        (await memberPage
          .getByRole('link', { name: 'Download purchased file BRIEFING-PDF' })
          .count()) === 0,
    )

    // Verified provider dispute: persisted local review state, no invented resolution.
    const dispute = signDeterministicWebhook({
      providerEventId: `11d-dispute:${state.guestAttemptId}`,
      providerReference: guestAttemptDoc.providerReference,
      kind: 'disputed',
      amountMinor: '2359',
      currency: 'USD',
      sequence: 30,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { objectId: `11d-dispute:${state.guestAttemptId}` },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', dispute.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': dispute.signature,
        })
      ).status,
      202,
    )
    await processEvent(`11d-dispute:${state.guestAttemptId}`)
    const disputes = await payload.find({
      collection: 'commerce-disputes',
      where: { order: { equals: state.guestOrderId } },
      overrideAccess: true,
    })
    check(
      'signed dispute persists review record and order exception without claiming provider resolution',
      disputes.docs.length === 1 &&
        disputes.docs[0].state === 'open' &&
        (await row('orders', state.guestOrderId)).state === 'exception',
    )
    check(
      'financial records cannot be deleted or disputes fabricated through native REST',
      (await request(`/api/orders/${state.memberOrderId}`, operator, 'DELETE')).status === 403 &&
        (await request('/api/commerce-disputes', operator, 'POST', { state: 'won' })).status ===
          403,
    )
    const providerRefund = signDeterministicWebhook({
      providerEventId: `11d-refund:${raceAttemptDoc.id}`,
      providerReference: raceAttemptDoc.providerReference,
      kind: 'refunded',
      amountMinor: raceAttemptDoc.amountMinor,
      currency: 'USD',
      sequence: 30,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: {
        objectId: `11d-refund:${raceAttemptDoc.id}`,
        amountMinor: raceAttemptDoc.amountMinor,
      },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', providerRefund.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': providerRefund.signature,
        })
      ).status,
      202,
    )
    await processEvent(`11d-refund:${raceAttemptDoc.id}`)
    const raceRefunded = await row('orders', raceOrders.docs[0].id)
    check(
      'provider-originated refund uses canonical durable financial reconciliation',
      raceRefunded.state === 'refunded' &&
        raceRefunded.refundExtension.refundedAmountMinor === raceAttemptDoc.amountMinor,
    )

    state.terminalDownloads = []
    for (const terminal of ['cancelled', 'disputed', 'refunded']) {
      const checkout = await startIsolatedCheckout(`${terminal}@11d.test`, true)
      const attempt = await row('payment-attempts', checkout.attemptId)
      const send = async (kind: string, sequence: number) => {
        const event = signDeterministicWebhook({
          providerEventId: `11d-${kind}:${attempt.id}`,
          providerReference: attempt.providerReference,
          kind,
          amountMinor: attempt.amountMinor,
          currency: 'USD',
          sequence,
          occurredAt: new Date().toISOString(),
          sanitizedEvidence: {
            objectId: `11d-${kind}:${attempt.id}`,
            amountMinor: attempt.amountMinor,
          },
        })
        assert.equal(
          (
            await request('/api/commerce/webhooks/deterministic-test', '', 'POST', event.raw, {
              'content-type': 'application/json',
              'x-commerce-signature': event.signature,
            })
          ).status,
          202,
        )
        await processEvent(`11d-${kind}:${attempt.id}`)
      }
      await send('succeeded', 1)
      const orders = await payload.find({
        collection: 'orders',
        where: { checkoutSession: { equals: checkout.sessionId } },
        overrideAccess: true,
      })
      assert.equal(orders.docs.length, 1)
      const order = orders.docs[0]
      const path = order.fulfillmentExtension.downloads[0].path
      check(
        `fresh digital ${terminal} test starts with settled receipt and byte-equal owned bearer download`,
        Boolean(order.receipt.receiptNumber) &&
          Buffer.from(await (await request(path)).arrayBuffer()).equals(image),
      )
      await send(terminal, 2)
      const finalOrder = await row('orders', order.id)
      const entitlements = await payload.find({
        collection: 'entitlements',
        where: { source: { equals: `order:${order.id}` } },
        overrideAccess: true,
      })
      check(
        `verified ${terminal} revokes digital access and persists truthful order state`,
        entitlements.docs.length === 1 &&
          Boolean(entitlements.docs[0].revokedAt) &&
          (await request(path)).status === 404 &&
          finalOrder.state === (terminal === 'disputed' ? 'exception' : terminal),
      )
      state.terminalDownloads.push(path)
    }

    await guestContext.storageState({ path: 'scratch/rc111d/guest-browser.json' })
    await memberContext.storageState({ path: 'scratch/rc111d/member-browser.json' })
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))
    await guestContext.close()
    await memberContext.close()
  } else {
    // =========================================================================
    // RESTART VERIFICATION (AFTER POSTGRESQL + NEXT.JS RESTART)
    // =========================================================================
    const guestContext = await browser.newContext({
      storageState: 'scratch/rc111d/guest-browser.json',
    })
    const guestPage = await guestContext.newPage()
    await guestPage.goto(`${base}/checkout/return?session=${state.guestSessionId}`)
    await guestPage.getByRole('heading', { name: 'Payment confirmed' }).waitFor({ timeout: 15000 })
    check(
      'after PostgreSQL and Next.js restart, guest browser retains disputed order exception and original receipt',
      (await guestPage.getByText(`Order ${state.guestOrderNumber} is exception.`).isVisible()) &&
        (await guestPage.getByText(`Receipt ${state.guestReceiptNumber}.`).isVisible()) &&
        (await guestPage.getByText('Settled total: 2359 USD minor units').isVisible()),
    )

    const memberContext = await browser.newContext({
      storageState: 'scratch/rc111d/member-browser.json',
    })
    const memberPage = await memberContext.newPage()
    await memberPage.goto(`${base}/checkout/return?session=${state.memberSessionId}`)
    await memberPage.getByRole('heading', { name: 'Payment confirmed' }).waitFor({ timeout: 15000 })
    check(
      'after PostgreSQL and Next.js restart, member browser retains refunded order, receipt and no download link',
      (await memberPage.getByText(`Order ${state.memberOrderNumber} is refunded.`).isVisible()) &&
        (await memberPage.getByText(`Receipt ${state.memberReceiptNumber}.`).isVisible()) &&
        (await memberPage
          .getByRole('link', { name: 'Download purchased file BRIEFING-PDF' })
          .count()) === 0,
    )

    const guestOrder = await row('orders', state.guestOrderId)
    const memberOrder = await row('orders', state.memberOrderId)
    const physicalProduct = await row('products', state.physicalProduct)
    const quarantinedCases = await payload.find({
      collection: 'commerce-reconciliation-cases',
      where: { site: { equals: state.alpha } },
      overrideAccess: true,
    })
    check(
      'restart preserves immutable order totals, receipt states, inventory quantity (7) and quarantined cases',
      guestOrder.state === 'exception' &&
        guestOrder.amountMinor === '2359' &&
        guestOrder.receipt?.receiptNumber === state.guestReceiptNumber &&
        memberOrder.state === 'refunded' &&
        memberOrder.amountMinor === '3634' &&
        memberOrder.receipt?.receiptNumber === state.memberReceiptNumber &&
        physicalProduct.variants[0].inventoryQuantity === 7 &&
        quarantinedCases.docs.length >= 2,
    )

    const saved = JSON.parse(await readFile('scratch/rc111d/member-session.json', 'utf8'))
    check(
      'restart retains revoked download and refund totals',
      (await request(state.downloadPath, `renegade-member=${saved.sessionToken}`)).status === 404 &&
        memberOrder.refundExtension.refundedAmountMinor === '3634',
    )
    for (const path of state.terminalDownloads)
      check(
        'restart retains terminal financial access revocation',
        (await request(path)).status === 404,
      )
    await guestContext.close()
    await memberContext.close()
  }

  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}.json`,
    JSON.stringify(
      {
        passed: trace.length,
        failed: 0,
        skipped: 0,
        checks: trace,
        providerMode:
          'Local deterministic-test signed webhook adapter and Stripe-test signature/replay contract; no live external charges.',
        authentication:
          'Genuine guest Chromium session; member session via canonical magic-link service; operator session via admin_sessions fixture (no passkey ceremony claim).',
      },
      null,
      2,
    ),
  )
} catch (error) {
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-failure.json`,
    JSON.stringify(
      { passed: trace.length, failed: 1, checks: trace, error: String(error) },
      null,
      2,
    ),
  )
  throw error
} finally {
  await browser.close()
  if (web?.pid)
    await new Promise((resolve) =>
      spawn('taskkill', ['/PID', String(web!.pid), '/T', '/F'], { windowsHide: true }).once(
        'exit',
        resolve,
      ),
    )
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
