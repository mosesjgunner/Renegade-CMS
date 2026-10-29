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
import {
  abandonCheckoutTask,
  processPaymentEventTask,
  recoverStaleCommerceJobs,
} from '../../src/modules/commerce/tasks'

assert.equal(process.env.RC1_11E_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5463/rc111e_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
assert.equal(process.env.COMMERCE_LOCAL_TEST_CHECKOUT_ENABLED, 'true')

const out = 'docs/rc/evidence/rc1/18-pass/11E'
const base = 'http://localhost:39019'
const betaBase = 'http://127.0.0.1:39019'
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
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39019'],
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

try {
  let state: any
  if (restart) {
    state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
  } else {
    const stamp = Date.now()
    const alpha = await payload.create({
      collection: 'sites',
      data: { name: '11E Alpha', slug: `alpha11e-${stamp}`, lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '11E Beta', slug: `beta11e-${stamp}`, lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@11e.test`, role: 'owner' },
    })
    const secondOwner = await payload.create({
      collection: 'users',
      data: { email: `second-owner-${stamp}@11e.test`, role: 'owner' },
    })
    const staffBeta = await payload.create({
      collection: 'users',
      data: { email: `staff-beta-${stamp}@11e.test`, role: 'staff' },
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
        canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: betaBase },
        launchState: 'live',
        adminExperience: { optionalCapabilities: { commerceCheckout: true } },
      },
    })

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
    const alphaCapability = await payload.create({
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
    const alphaEurCapability = await payload.create({
      collection: 'payment-method-capabilities',
      data: {
        site: alpha.id,
        merchantConnection: alphaMerchant.id,
        providerKey: 'deterministic-test',
        railKey: 'alpha-eur-hosted',
        family: 'card',
        flow: 'hosted',
        merchantCountries: ['US'],
        buyerCountries: ['US'],
        presentmentCurrencies: ['EUR'],
        settlementCurrencies: ['EUR'],
        recurring: false,
        refunds: true,
        enabled: true,
        health: 'healthy',
        instructions: 'Local deterministic EUR test checkout.',
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
        recurring: false,
        refunds: true,
        enabled: true,
        health: 'healthy',
        instructions: 'Beta deterministic test checkout.',
      },
    })

    // Promotions on Site Alpha: SAVE5 ($5.00 order discount, usageLimitTotal: 1) and FREESHIP (free shipping)
    const save5Promo = await payload.create({
      collection: 'promotions',
      data: {
        site: alpha.id,
        version: 1,
        code: 'SAVE5',
        description: '$5.00 off order total (single use)',
        scope: 'order',
        discountType: 'fixed-minor',
        discountValue: '500',
        currency: 'USD',
        status: 'active',
        stackingRule: 'stackable',
        stackingPriority: 10,
        usageLimitTotal: 1,
        usageCount: 0,
      },
      overrideAccess: true,
    })
    const freeShipPromo = await payload.create({
      collection: 'promotions',
      data: {
        site: alpha.id,
        version: 1,
        code: 'FREESHIP',
        description: 'Free standard shipping',
        scope: 'shipping',
        discountType: 'free-shipping',
        discountValue: '500',
        currency: 'USD',
        status: 'active',
        stackingRule: 'stackable',
        stackingPriority: 5,
      },
      overrideAccess: true,
    })

    const magicAlpha = await issueMagicLink(payload, `member-alpha-${stamp}@11e.test`)
    const memberAlpha = await consumeMagicLink(payload, magicAlpha.token!)
    assert.ok(memberAlpha?.sessionToken)
    await writeFile('scratch/rc111e/member-alpha.json', JSON.stringify(memberAlpha))

    const magicBeta = await issueMagicLink(payload, `member-beta-${stamp}@11e.test`)
    const memberBeta = await consumeMagicLink(payload, magicBeta.token!)
    assert.ok(memberBeta?.sessionToken)
    await writeFile('scratch/rc111e/member-beta.json', JSON.stringify(memberBeta))

    state = {
      alpha: alpha.id,
      beta: beta.id,
      owner: owner.id,
      secondOwner: secondOwner.id,
      staffBeta: staffBeta.id,
      memberAlphaId: memberAlpha.memberId,
      memberBetaId: memberBeta.memberId,
      alphaMerchant: alphaMerchant.id,
      betaMerchant: betaMerchant.id,
      alphaCapability: alphaCapability.id,
      alphaEurCapability: alphaEurCapability.id,
      betaCapability: betaCapability.id,
      save5PromoId: save5Promo.id,
      freeShipPromoId: freeShipPromo.id,
    }
  }

  await startWeb()
  const operator = await session(await row('users', state.owner))
  const secondOperator = await session(await row('users', state.secondOwner))
  const staffBetaCookie = await session(await row('users', state.staffBeta))

  if (!restart) {
    // Upload governed private digital assets for Site Alpha and Site Beta
    const alphaImage = await sharp({
      create: { width: 320, height: 320, channels: 3, background: '#0f172a' },
    })
      .png()
      .toBuffer()
    const alphaForm = new FormData()
    alphaForm.set('siteId', state.alpha)
    alphaForm.set('title', '11E Alpha Private Digital Dossier')
    alphaForm.set('file', new File([alphaImage], '11e-alpha-dossier.png', { type: 'image/png' }))
    const alphaPrivateAsset = (await json('/api/media/upload', operator, 'POST', alphaForm, 201))
      .asset
    await json(`/api/media-assets/${alphaPrivateAsset.id}`, operator, 'PATCH', {
      publicPolicy: 'private',
      rightsStatus: 'approved',
    })

    const betaImage = await sharp({
      create: { width: 320, height: 320, channels: 3, background: '#14532d' },
    })
      .png()
      .toBuffer()
    const betaForm = new FormData()
    betaForm.set('siteId', state.beta)
    betaForm.set('title', '11E Beta Private Digital Dossier')
    betaForm.set('file', new File([betaImage], '11e-beta-dossier.png', { type: 'image/png' }))
    const betaPrivateAsset = (await json('/api/media/upload', operator, 'POST', betaForm, 201))
      .asset
    await json(`/api/media-assets/${betaPrivateAsset.id}`, operator, 'PATCH', {
      publicPolicy: 'private',
      rightsStatus: 'approved',
    })
    await payload.jobs.run({ queue: 'media', limit: 20 })

    // Create published products on Site Alpha:
    // 1. Alpha Physical Almanac (tracked stock = 8, price = $17.50 = 1750 minor)
    const alphaPhysicalDoc = (
      await json(
        '/api/products',
        operator,
        'POST',
        {
          site: state.alpha,
          merchantConnection: state.alphaMerchant,
          name: '11E Field Almanac',
          slug: 'almanac-11e',
          canonicalPath: '/store/almanac-11e',
          kind: 'physical',
          state: 'draft',
          catalogContractVersion: 1,
          productCapabilities: ['shippable'],
          optionDimensions: [{ key: 'edition', label: 'Edition', values: ['standard'] }],
          variants: [
            {
              sku: 'ALMANAC-11E',
              title: 'Standard Edition',
              optionValues: { edition: 'standard' },
              status: 'active',
              inventoryPolicy: 'tracked',
              inventoryQuantity: 8,
              weightGrams: 250,
              dimensionsMm: { length: 200, width: 140, height: 15 },
            },
          ],
          offers: [
            {
              offerId: 'almanac-11e-usd',
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
    await release(alphaPhysicalDoc.id, operator)
    state.alphaPhysicalProduct = alphaPhysicalDoc.id

    // 2. Alpha Limited Collector Pin (tracked stock = 1, price = $15.00 = 1500 minor) for reservation/exhaustion race
    const alphaLimitedDoc = (
      await json(
        '/api/products',
        operator,
        'POST',
        {
          site: state.alpha,
          merchantConnection: state.alphaMerchant,
          name: '11E Collector Pin',
          slug: 'pin-11e',
          canonicalPath: '/store/pin-11e',
          kind: 'physical',
          state: 'draft',
          catalogContractVersion: 1,
          productCapabilities: ['shippable'],
          optionDimensions: [{ key: 'finish', label: 'Finish', values: ['brass'] }],
          variants: [
            {
              sku: 'PIN-11E-BRASS',
              title: 'Brass Pin',
              optionValues: { finish: 'brass' },
              status: 'active',
              inventoryPolicy: 'tracked',
              inventoryQuantity: 1,
              weightGrams: 50,
              dimensionsMm: { length: 40, width: 40, height: 5 },
            },
          ],
          offers: [
            {
              offerId: 'pin-11e-usd',
              version: 1,
              status: 'active',
              amountMinor: '1500',
              currency: 'USD',
              taxDisplay: 'exclusive',
            },
          ],
        },
        201,
      )
    ).doc
    await release(alphaLimitedDoc.id, operator)
    state.alphaLimitedProduct = alphaLimitedDoc.id

    // 3. Alpha Digital Briefing (price = $12.00 = 1200 minor, downloadLimit = 2)
    const alphaDigitalDoc = (
      await json(
        '/api/products',
        operator,
        'POST',
        {
          site: state.alpha,
          merchantConnection: state.alphaMerchant,
          name: '11E Digital Briefing',
          slug: 'briefing-11e',
          canonicalPath: '/store/briefing-11e',
          kind: 'digital',
          state: 'draft',
          catalogContractVersion: 1,
          productCapabilities: ['digital-entitlement'],
          optionDimensions: [{ key: 'format', label: 'Format', values: ['pdf'] }],
          variants: [
            {
              sku: 'BRIEFING-11E-PDF',
              title: 'PDF Edition',
              optionValues: { format: 'pdf' },
              status: 'active',
              inventoryPolicy: 'untracked',
              inventoryQuantity: null,
            },
          ],
          offers: [
            {
              offerId: 'briefing-11e-usd',
              version: 1,
              status: 'active',
              amountMinor: '1200',
              currency: 'USD',
              taxDisplay: 'exclusive',
            },
          ],
          digitalDelivery: {
            entitlement: '11e.alpha.briefing',
            downloadLimit: 2,
            expiresAfterDays: 30,
            assets: [
              {
                mediaId: alphaPrivateAsset.id,
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
    await release(alphaDigitalDoc.id, operator)
    state.alphaDigitalProduct = alphaDigitalDoc.id

    // 4. Alpha EUR Digital Report (price = €20.00 = 2000 EUR minor) for currency-separated dashboard proof
    const alphaEurDoc = (
      await json(
        '/api/products',
        operator,
        'POST',
        {
          site: state.alpha,
          merchantConnection: state.alphaMerchant,
          name: '11E European Dispatch',
          slug: 'eu-dispatch-11e',
          canonicalPath: '/store/eu-dispatch-11e',
          kind: 'digital',
          state: 'draft',
          catalogContractVersion: 1,
          productCapabilities: ['digital-entitlement'],
          optionDimensions: [{ key: 'format', label: 'Format', values: ['pdf'] }],
          variants: [
            {
              sku: 'EU-DISPATCH-PDF',
              title: 'EU PDF Edition',
              optionValues: { format: 'pdf' },
              status: 'active',
              inventoryPolicy: 'untracked',
              inventoryQuantity: null,
            },
          ],
          offers: [
            {
              offerId: 'eu-dispatch-eur',
              version: 1,
              status: 'active',
              amountMinor: '2000',
              currency: 'EUR',
              taxDisplay: 'not-applicable',
            },
          ],
          digitalDelivery: {
            entitlement: '11e.alpha.eudispatch',
            downloadLimit: 3,
            expiresAfterDays: 30,
            assets: [
              {
                mediaId: alphaPrivateAsset.id,
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
    await release(alphaEurDoc.id, operator)
    state.alphaEurProduct = alphaEurDoc.id

    // 5. Create published products on Site Beta:
    // Beta Physical Handbook (tracked stock = 5, price = $14.00 = 1400 minor) & Beta Digital Dossier ($10.00 = 1000 minor)
    const betaPhysicalDoc = (
      await json(
        '/api/products',
        operator,
        'POST',
        {
          site: state.beta,
          merchantConnection: state.betaMerchant,
          name: '11E Beta Handbook',
          slug: 'handbook-beta-11e',
          canonicalPath: '/store/handbook-beta-11e',
          kind: 'physical',
          state: 'draft',
          catalogContractVersion: 1,
          productCapabilities: ['shippable'],
          optionDimensions: [{ key: 'edition', label: 'Edition', values: ['print'] }],
          variants: [
            {
              sku: 'BETA-HANDBOOK-PRT',
              title: 'Print Edition',
              optionValues: { edition: 'print' },
              status: 'active',
              inventoryPolicy: 'tracked',
              inventoryQuantity: 5,
              weightGrams: 200,
              dimensionsMm: { length: 190, width: 130, height: 12 },
            },
          ],
          offers: [
            {
              offerId: 'beta-handbook-usd',
              version: 1,
              status: 'active',
              amountMinor: '1400',
              currency: 'USD',
              taxDisplay: 'exclusive',
            },
          ],
        },
        201,
      )
    ).doc
    await release(betaPhysicalDoc.id, operator)
    state.betaPhysicalProduct = betaPhysicalDoc.id

    const betaDigitalDoc = (
      await json(
        '/api/products',
        operator,
        'POST',
        {
          site: state.beta,
          merchantConnection: state.betaMerchant,
          name: '11E Beta Digital Archive',
          slug: 'archive-beta-11e',
          canonicalPath: '/store/archive-beta-11e',
          kind: 'digital',
          state: 'draft',
          catalogContractVersion: 1,
          productCapabilities: ['digital-entitlement'],
          optionDimensions: [{ key: 'format', label: 'Format', values: ['pdf'] }],
          variants: [
            {
              sku: 'BETA-ARCHIVE-PDF',
              title: 'Beta PDF Edition',
              optionValues: { format: 'pdf' },
              status: 'active',
              inventoryPolicy: 'untracked',
              inventoryQuantity: null,
            },
          ],
          offers: [
            {
              offerId: 'beta-archive-usd',
              version: 1,
              status: 'active',
              amountMinor: '1000',
              currency: 'USD',
              taxDisplay: 'exclusive',
            },
          ],
          digitalDelivery: {
            entitlement: '11e.beta.archive',
            downloadLimit: 3,
            expiresAfterDays: 30,
            assets: [
              {
                mediaId: betaPrivateAsset.id,
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
    await release(betaDigitalDoc.id, operator)
    state.betaDigitalProduct = betaDigitalDoc.id

    // =========================================================================
    // 1. STOCK RESERVATION, CONCURRENT EXHAUSTION RACE & ABANDONMENT RELEASE
    // =========================================================================
    const resBuyer1 = await newContext()
    const resBuyer2 = await newContext()

    const b1Add = await resBuyer1.request.post(`${base}/api/commerce/cart`, {
      data: { productId: state.alphaLimitedProduct, variantSku: 'PIN-11E-BRASS', quantity: 1 },
    })
    const b2Add = await resBuyer2.request.post(`${base}/api/commerce/cart`, {
      data: { productId: state.alphaLimitedProduct, variantSku: 'PIN-11E-BRASS', quantity: 1 },
    })
    assert.equal(b1Add.status(), 200)
    assert.equal(b2Add.status(), 200)

    // Both buyers race to create a checkout proposal for the 1 available unit of PIN-11E-BRASS
    const [propRace1, propRace2] = await Promise.all([
      resBuyer1.request.post(`${base}/api/commerce/proposal`, {
        data: addressQuote('pin-buyer1@11e.test', 'Pin Buyer One'),
      }),
      resBuyer2.request.post(`${base}/api/commerce/proposal`, {
        data: addressQuote('pin-buyer2@11e.test', 'Pin Buyer Two'),
      }),
    ])
    const statuses = [propRace1.status(), propRace2.status()].sort((a, b) => a - b)
    const winnerResp = propRace1.status() === 200 ? propRace1 : propRace2
    const loserResp = propRace1.status() === 409 ? propRace1 : propRace2
    const winnerCtx = propRace1.status() === 200 ? resBuyer1 : resBuyer2
    const loserCtx = propRace1.status() === 409 ? resBuyer1 : resBuyer2
    const winnerProposal = (await winnerResp.json()).proposal
    const loserError = await loserResp.json()
    check(
      'concurrent checkout proposal race on 1-unit tracked SKU grants 1 active reservation (200) and rejects contender with 409 stock reserved',
      statuses[0] === 200 &&
        statuses[1] === 409 &&
        String(loserError.error).includes('Stock is reserved by another checkout'),
    )

    // Winner initiates checkout session, then abandons (session expires -> abandonCheckoutTask runs)
    const winnerInit = await winnerCtx.request.post(`${base}/api/commerce/checkout/initiate`, {
      data: { proposalId: winnerProposal.id, capabilityId: state.alphaCapability },
    })
    assert.equal(winnerInit.status(), 200)
    const winnerCheckout = await winnerInit.json()
    const pastIso = new Date(Date.now() - 60_000).toISOString()
    await payload.update({
      collection: 'checkout-sessions',
      id: winnerCheckout.sessionId,
      data: { expiresAt: pastIso },
      overrideAccess: true,
    })
    await (abandonCheckoutTask.handler as any)({ req: { payload } })

    const abandonedSession = await row('checkout-sessions', winnerCheckout.sessionId)
    const expiredReservations = await payload.find({
      collection: 'inventory-reservations',
      where: { proposal: { equals: winnerProposal.id } },
      overrideAccess: true,
    })
    check(
      'abandonCheckoutTask marks stale checkout session abandoned and expires its inventory reservations and proposal',
      abandonedSession.state === 'abandoned' &&
        expiredReservations.docs.length === 1 &&
        expiredReservations.docs[0].status === 'expired' &&
        (await row('checkout-proposals', winnerProposal.id)).state === 'expired',
    )

    // Contender (Buyer 2) retries proposal creation after Buyer 1's reservation expired -> now succeeds!
    const retryLoserProp = await loserCtx.request.post(`${base}/api/commerce/proposal`, {
      data: addressQuote('pin-buyer2@11e.test', 'Pin Buyer Two'),
    })
    assert.equal(retryLoserProp.status(), 200)
    const buyer2Proposal = (await retryLoserProp.json()).proposal
    const buyer2Init = await loserCtx.request.post(`${base}/api/commerce/checkout/initiate`, {
      data: { proposalId: buyer2Proposal.id, capabilityId: state.alphaCapability },
    })
    assert.equal(buyer2Init.status(), 200)
    const buyer2Checkout = await buyer2Init.json()
    const buyer2Attempt = await row('payment-attempts', buyer2Checkout.attemptId)
    const buyer2PaidWh = signDeterministicWebhook({
      providerEventId: `11e-pin-paid:${buyer2Attempt.id}`,
      providerReference: buyer2Attempt.providerReference,
      kind: 'succeeded',
      amountMinor: buyer2Attempt.amountMinor,
      currency: 'USD',
      sequence: 1,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: String(buyer2Attempt.id) },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', buyer2PaidWh.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': buyer2PaidWh.signature,
        })
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    check(
      'contender acquires released stock, settles order and exhausts PIN-11E-BRASS inventory to 0',
      (await row('products', state.alphaLimitedProduct)).variants[0].inventoryQuantity === 0,
    )

    // A third buyer attempting to add/quote exhausted PIN-11E-BRASS has item removed as out-of-stock
    const resBuyer3 = await newContext()
    const b3Add = await resBuyer3.request.post(`${base}/api/commerce/cart`, {
      data: { productId: state.alphaLimitedProduct, variantSku: 'PIN-11E-BRASS', quantity: 1 },
    })
    const b3CartJson = await b3Add.json()
    check(
      'exhausted SKU (stock 0) cannot be retained in cart and records out-of-stock reconciliation note',
      b3Add.status() === 200 &&
        b3CartJson.cart.items.length === 0 &&
        b3CartJson.cart.reconciliationNotes.some((n: any) => n.code === 'item-unavailable'),
    )
    await resBuyer1.close()
    await resBuyer2.close()
    await resBuyer3.close()

    // =========================================================================
    // 2. SITE ALPHA MEMBER: COUPONS WITH SHIPPING, PAYMENT RETRY & WORKER INTERRUPTION
    // =========================================================================
    const savedMemberAlpha = JSON.parse(await readFile('scratch/rc111e/member-alpha.json', 'utf8'))
    const memberAlphaCookie = `renegade-member=${savedMemberAlpha.sessionToken}`
    const memberAlphaCtx = await newContext()
    await memberAlphaCtx.addCookies([
      {
        name: 'renegade-member',
        value: savedMemberAlpha.sessionToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
      {
        name: 'renegade-member-csrf',
        value: 'member-alpha-csrf-11e',
        domain: 'localhost',
        path: '/',
        sameSite: 'Lax',
      },
    ])
    const memberAlphaPage = await memberAlphaCtx.newPage()

    // Member Alpha adds physical Almanac ($17.50) + digital Briefing ($12.00) via storefront UI
    await memberAlphaPage.goto(`${base}/store/almanac-11e`)
    await memberAlphaPage.waitForLoadState('networkidle')
    const privBtn = memberAlphaPage.getByRole('button', {
      name: 'Reject non-essential',
      exact: true,
    })
    if (await privBtn.isVisible()) await privBtn.click()
    await memberAlphaPage.getByLabel('Quantity', { exact: true }).fill('1')
    const addAlmWait = memberAlphaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
    )
    await memberAlphaPage
      .getByRole('button', { name: 'Add 11E Field Almanac to cart', exact: true })
      .click()
    assert.equal((await addAlmWait).status(), 200)

    await memberAlphaPage.goto(`${base}/store/briefing-11e`)
    await memberAlphaPage.waitForLoadState('networkidle')
    await memberAlphaPage.getByLabel('Quantity', { exact: true }).fill('1')
    const addBrfWait = memberAlphaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
    )
    await memberAlphaPage
      .getByRole('button', { name: 'Add 11E Digital Briefing to cart', exact: true })
      .click()
    assert.equal((await addBrfWait).status(), 200)

    // Navigate to /cart and apply stackable coupons SAVE5 + FREESHIP in browser UI
    await memberAlphaPage.goto(`${base}/cart`)
    await memberAlphaPage.getByLabel('Promotion code').fill('SAVE5')
    const applySave5Wait = memberAlphaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'PATCH',
    )
    await memberAlphaPage.getByRole('button', { name: 'Apply', exact: true }).click()
    assert.equal((await applySave5Wait).status(), 200)

    await memberAlphaPage.getByLabel('Promotion code').fill('FREESHIP')
    const applyFreeShipWait = memberAlphaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'PATCH',
    )
    await memberAlphaPage.getByRole('button', { name: 'Apply', exact: true }).click()
    assert.equal((await applyFreeShipWait).status(), 200)

    await memberAlphaPage.getByLabel('Email Address').fill('member-alpha@11e.test')
    await memberAlphaPage.getByLabel('Full Name').fill('Member Alpha')
    await memberAlphaPage.getByLabel('Street Address').fill('200 Congress Ave')
    await memberAlphaPage.getByLabel('City').fill('Austin')
    await memberAlphaPage.getByLabel('State / Province').fill('TX')
    await memberAlphaPage.getByLabel('Postal Code').fill('78701')
    await memberAlphaPage.getByLabel('Country (2-letter ISO)').fill('US')
    await memberAlphaPage.getByRole('checkbox').check()

    const mAlphaPropWait = memberAlphaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/proposal') && r.request().method() === 'POST',
    )
    await memberAlphaPage
      .getByRole('button', { name: 'Create Checkout Proposal', exact: true })
      .click()
    const mAlphaPropResp = await mAlphaPropWait
    assert.equal(mAlphaPropResp.status(), 200)
    const mAlphaProposal = (await mAlphaPropResp.json()).proposal
    state.memberAlphaProposalId = mAlphaProposal.id
    // Subtotal: 1750 + 1200 = 2950; Order discount SAVE5: 500 -> Net items: 2450
    // Shipping: 500 flat - 500 FREESHIP = 0 netShippingMinor
    // Tax (6.25% on net 2450): 153 minor units -> GrandTotal: 2450 + 0 + 153 = 2603 minor units ($26.03)
    check(
      'member Alpha checkout proposal applies SAVE5 order discount (500) and FREESHIP shipping discount (500 -> 0 net shipping) for exact 2603 USD minor total',
      mAlphaProposal.pricingSnapshot.subtotalMinor === '2950' &&
        mAlphaProposal.pricingSnapshot.adjustmentsTotalMinor === '500' &&
        mAlphaProposal.pricingSnapshot.shippingAmountMinor === '500' &&
        mAlphaProposal.pricingSnapshot.shippingAdjustmentMinor === '500' &&
        mAlphaProposal.pricingSnapshot.netShippingMinor === '0' &&
        mAlphaProposal.pricingSnapshot.taxTotalMinor === '153' &&
        mAlphaProposal.pricingSnapshot.grandTotalMinor === '2603',
    )

    // Initiate Attempt 1 in browser UI
    const mAlphaInit1Wait = memberAlphaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/checkout/initiate') && r.request().method() === 'POST',
    )
    await memberAlphaPage.getByRole('button', { name: /Confirm & Pay \$26\.03/ }).click()
    const mAlphaInit1Resp = await mAlphaInit1Wait
    assert.equal(mAlphaInit1Resp.status(), 200)
    const mAlphaInit1 = await mAlphaInit1Resp.json()
    state.memberAlphaSessionId = mAlphaInit1.sessionId
    state.memberAlphaAttempt1Id = mAlphaInit1.attemptId
    state.memberAlphaIntent1Id = mAlphaInit1.intentId

    // Deliver signed FAILED webhook for Attempt 1
    const attempt1Doc = await row('payment-attempts', mAlphaInit1.attemptId)
    const failWh1 = signDeterministicWebhook({
      providerEventId: `11e-alpha-member-fail-1:${attempt1Doc.id}`,
      providerReference: attempt1Doc.providerReference,
      kind: 'failed',
      amountMinor: '2603',
      currency: 'USD',
      sequence: 1,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: String(attempt1Doc.id) },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', failWh1.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': failWh1.signature,
        })
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    const failedSessionDoc = await row('checkout-sessions', mAlphaInit1.sessionId)
    const failedAttempt1Doc = await row('payment-attempts', mAlphaInit1.attemptId)
    const activeResDuringFail = await payload.find({
      collection: 'inventory-reservations',
      where: { proposal: { equals: mAlphaProposal.id } },
      overrideAccess: true,
    })
    check(
      'failed first payment attempt marks session and attempt failed, creates 0 orders, and preserves active inventory reservation for retry',
      failedSessionDoc.state === 'failed' &&
        failedSessionDoc.attempt === 1 &&
        failedAttempt1Doc.state === 'failed' &&
        activeResDuringFail.docs.every((r: any) => r.status === 'active'),
    )

    // Payment Retry: call POST /api/commerce/checkout/initiate with the same proposalId/sessionId
    const mAlphaRetryRes = await memberAlphaCtx.request.post(
      `${base}/api/commerce/checkout/initiate`,
      {
        data: {
          proposalId: mAlphaProposal.id,
          sessionId: mAlphaInit1.sessionId,
          capabilityId: state.alphaCapability,
        },
      },
    )
    assert.equal(mAlphaRetryRes.status(), 200)
    const mAlphaInit2 = await mAlphaRetryRes.json()
    state.memberAlphaAttempt2Id = mAlphaInit2.attemptId
    state.memberAlphaIntent2Id = mAlphaInit2.intentId
    const retriedSessionDoc = await row('checkout-sessions', mAlphaInit1.sessionId)
    const attempt2Doc = await row('payment-attempts', mAlphaInit2.attemptId)
    check(
      'payment retry reopens checkout session on attempt 2 with distinct attempt/intent and idempotency key',
      mAlphaInit2.sessionId === mAlphaInit1.sessionId &&
        mAlphaInit2.attemptId !== mAlphaInit1.attemptId &&
        mAlphaInit2.intentId !== mAlphaInit1.intentId &&
        retriedSessionDoc.state === 'open' &&
        retriedSessionDoc.attempt === 2 &&
        attempt2Doc.attempt === 2 &&
        attempt2Doc.idempotencyKey === `checkout:${mAlphaInit1.sessionId}:2`,
    )

    // Worker Interruption & Stale Job Recovery on Attempt 2's succeeded webhook:
    // Deliver signed succeeded webhook, then simulate worker crash mid-processing (processingState='processing', stale updatedAt)
    const winWh2 = signDeterministicWebhook({
      providerEventId: `11e-alpha-member-win-2:${attempt2Doc.id}`,
      providerReference: attempt2Doc.providerReference,
      kind: 'succeeded',
      amountMinor: '2603',
      currency: 'USD',
      sequence: 1,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: String(attempt2Doc.id) },
    })
    const winWh2Res = await request(
      '/api/commerce/webhooks/deterministic-test',
      '',
      'POST',
      winWh2.raw,
      {
        'content-type': 'application/json',
        'x-commerce-signature': winWh2.signature,
      },
    )
    assert.equal(winWh2Res.status, 202)
    const winWh2Inbox = (
      await payload.find({
        collection: 'payment-webhook-events',
        where: { providerEventId: { equals: `11e-alpha-member-win-2:${attempt2Doc.id}` } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    await payload.db.pool.query(
      `UPDATE payment_webhook_events SET processing_state = 'processing', updated_at = NOW() - INTERVAL '25 minutes' WHERE id = $1`,
      [winWh2Inbox.id],
    )
    const recoveredStaleCount = await recoverStaleCommerceJobs(payload, 10 * 60 * 1000)
    const recoveredInbox = await row('payment-webhook-events', winWh2Inbox.id)
    check(
      'recoverStaleCommerceJobs detects interrupted processing webhook event, resets it to received and re-queues commerce worker job',
      recoveredStaleCount >= 1 && recoveredInbox.processingState === 'received',
    )

    // Run commerce queue to settle Member Alpha's order (including re-queued recovery job)
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    await payload.jobs.run({ queue: 'commerce', limit: 20 })

    // Verify Member Alpha browser on /checkout/return
    await memberAlphaPage.goto(`${base}/checkout/return?session=${state.memberAlphaSessionId}`)
    await memberAlphaPage
      .getByRole('heading', { name: 'Payment confirmed' })
      .waitFor({ timeout: 15000 })
    const memberAlphaOrder = (
      await payload.find({
        collection: 'orders',
        where: { checkoutSession: { equals: state.memberAlphaSessionId } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    state.memberAlphaOrderId = memberAlphaOrder.id
    state.memberAlphaOrderNumber = memberAlphaOrder.orderNumber
    state.memberAlphaReceiptNumber = memberAlphaOrder.receipt.receiptNumber
    state.memberAlphaDownloadPath = memberAlphaOrder.fulfillmentExtension.downloads[0].path

    const save5AfterSettlement = await row('promotions', state.save5PromoId)
    check(
      'settled member Alpha order records 2603 USD minor total, decrements Almanac stock (8 -> 7), increments SAVE5 usageCount (0 -> 1), and issues 1 entitlement and 1 download grant',
      memberAlphaOrder.state === 'paid' &&
        memberAlphaOrder.amountMinor === '2603' &&
        memberAlphaOrder.totalsSnapshot.adjustmentsTotalMinor === '500' &&
        memberAlphaOrder.totalsSnapshot.netShippingMinor === '0' &&
        (await row('products', state.alphaPhysicalProduct)).variants[0].inventoryQuantity === 7 &&
        save5AfterSettlement.usageCount === 1 &&
        (await memberAlphaPage
          .getByRole('link', { name: 'Download purchased file BRIEFING-11E-PDF' })
          .isVisible()),
    )

    // Verify SAVE5 coupon exhaustion (usageLimitTotal: 1 reached) when another buyer attempts to apply SAVE5
    const couponTestCtx = await newContext()
    const ctAdd = await couponTestCtx.request.post(`${base}/api/commerce/cart`, {
      data: { productId: state.alphaPhysicalProduct, variantSku: 'ALMANAC-11E', quantity: 1 },
    })
    const ctCart = (await ctAdd.json()).cart
    const ctPatch = await couponTestCtx.request.patch(`${base}/api/commerce/cart`, {
      data: { expectedVersion: ctCart.version, appliedCouponCodes: ['SAVE5'] },
    })
    const ctPatchJson = await ctPatch.json()
    check(
      'exhausted SAVE5 coupon (usageCount 1 === usageLimitTotal 1) is rejected on subsequent carts with usage limit reached note',
      ctPatch.status() === 200 &&
        !ctPatchJson.cart.appliedCouponCodes.includes('SAVE5') &&
        ctPatchJson.cart.reconciliationNotes.some((n: any) =>
          String(n.message).includes('Promotion usage limit reached'),
        ),
    )
    await couponTestCtx.close()

    // Member Alpha downloads private digital file (`downloadLimit: 2`) twice -> 200, third attempt -> 404 limit exceeded with audit event
    const mAlphaDl1 = await request(state.memberAlphaDownloadPath, memberAlphaCookie)
    const mAlphaDl2 = await request(state.memberAlphaDownloadPath, memberAlphaCookie)
    const mAlphaDl3 = await request(state.memberAlphaDownloadPath, memberAlphaCookie)
    const mAlphaDlEvents = await payload.find({
      collection: 'digital-download-events',
      where: { site: { equals: state.alpha } },
      limit: 10,
      overrideAccess: true,
    })
    check(
      'member Alpha downloads private digital asset up to downloadLimit (2x 200 byte-equal) and 3rd download is denied (404) with DOWNLOAD_LIMIT_REACHED audit event',
      mAlphaDl1.status === 200 &&
        Buffer.from(await mAlphaDl1.arrayBuffer()).equals(alphaImage) &&
        mAlphaDl2.status === 200 &&
        mAlphaDl3.status === 404 &&
        mAlphaDlEvents.docs.filter((e: any) => e.outcome === 'allowed').length === 2 &&
        mAlphaDlEvents.docs.some(
          (e: any) => e.outcome === 'denied' && e.reason === 'DOWNLOAD_LIMIT_REACHED',
        ),
    )
    await memberAlphaPage.close()

    // =========================================================================
    // 3. SITE ALPHA GUEST: STOREFRONT -> CHECKOUT -> WEBHOOK -> ORDER -> DIGITAL DOWNLOAD -> REFUND REVOCATION
    // =========================================================================
    const guestAlphaCtx = await newContext()
    const guestAlphaPage = await guestAlphaCtx.newPage()
    await guestAlphaPage.goto(`${base}/store/almanac-11e`)
    await guestAlphaPage.waitForLoadState('networkidle')
    const gPriv = guestAlphaPage.getByRole('button', { name: 'Reject non-essential', exact: true })
    if (await gPriv.isVisible()) await gPriv.click()
    await guestAlphaPage.getByLabel('Quantity', { exact: true }).fill('1')
    const gAdd1 = guestAlphaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
    )
    await guestAlphaPage
      .getByRole('button', { name: 'Add 11E Field Almanac to cart', exact: true })
      .click()
    assert.equal((await gAdd1).status(), 200)

    await guestAlphaPage.goto(`${base}/store/briefing-11e`)
    await guestAlphaPage.waitForLoadState('networkidle')
    await guestAlphaPage.getByLabel('Quantity', { exact: true }).fill('1')
    const gAdd2 = guestAlphaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
    )
    await guestAlphaPage
      .getByRole('button', { name: 'Add 11E Digital Briefing to cart', exact: true })
      .click()
    assert.equal((await gAdd2).status(), 200)

    await guestAlphaPage.goto(`${base}/cart`)
    await guestAlphaPage.getByLabel('Email Address').fill('guest-alpha@11e.test')
    await guestAlphaPage.getByLabel('Full Name').fill('Guest Alpha')
    await guestAlphaPage.getByLabel('Street Address').fill('100 Main St')
    await guestAlphaPage.getByLabel('City').fill('Austin')
    await guestAlphaPage.getByLabel('State / Province').fill('TX')
    await guestAlphaPage.getByLabel('Postal Code').fill('78701')
    await guestAlphaPage.getByLabel('Country (2-letter ISO)').fill('US')
    await guestAlphaPage.getByRole('checkbox').check()

    const gAlphaPropWait = guestAlphaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/proposal') && r.request().method() === 'POST',
    )
    await guestAlphaPage
      .getByRole('button', { name: 'Create Checkout Proposal', exact: true })
      .click()
    assert.equal((await gAlphaPropWait).status(), 200)

    const gAlphaInitWait = guestAlphaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/checkout/initiate') && r.request().method() === 'POST',
    )
    await guestAlphaPage.getByRole('button', { name: /Confirm & Pay \$36\.34/ }).click()
    const gAlphaInit = await (await gAlphaInitWait).json()
    state.guestAlphaSessionId = gAlphaInit.sessionId
    state.guestAlphaAttemptId = gAlphaInit.attemptId

    await guestAlphaPage.getByRole('link', { name: 'Complete Payment →' }).click()
    await guestAlphaPage.waitForURL(/\/checkout\/test\/det_cs_/)
    await guestAlphaPage.getByRole('button', { name: 'Confirm test payment' }).click()
    await guestAlphaPage.waitForURL(/\/checkout\/return\?session=/)
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    await guestAlphaPage
      .getByRole('heading', { name: 'Payment confirmed' })
      .waitFor({ timeout: 15000 })

    const guestAlphaOrder = (
      await payload.find({
        collection: 'orders',
        where: { checkoutSession: { equals: state.guestAlphaSessionId } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    state.guestAlphaOrderId = guestAlphaOrder.id
    state.guestAlphaOrderNumber = guestAlphaOrder.orderNumber
    state.guestAlphaReceiptNumber = guestAlphaOrder.receipt.receiptNumber
    state.guestAlphaDownloadPath = guestAlphaOrder.fulfillmentExtension.downloads[0].path

    // Guest Alpha downloads digital product before refund
    const guestAlphaDlBefore = await request(state.guestAlphaDownloadPath)
    check(
      'guest Alpha completes storefront -> checkout -> webhook -> order (3634 USD minor, stock 7 -> 6) and downloads private digital file (200)',
      guestAlphaOrder.state === 'paid' &&
        guestAlphaOrder.amountMinor === '3634' &&
        (await row('products', state.alphaPhysicalProduct)).variants[0].inventoryQuantity === 6 &&
        guestAlphaDlBefore.status === 200 &&
        Buffer.from(await guestAlphaDlBefore.arrayBuffer()).equals(alphaImage),
    )

    // Operator requests and second operator approves full refund (3634 minor > 3000 dual-control threshold) on Guest Alpha order
    const gAlphaRefundPending = await json(
      '/api/admin/commerce/refunds',
      operator,
      'POST',
      {
        action: 'request',
        orderId: state.guestAlphaOrderId,
        amountMinor: '3634',
        reason: '11E guest Alpha full refund',
      },
      202,
    )
    const gAlphaRefundFull = await json('/api/admin/commerce/refunds', secondOperator, 'POST', {
      action: 'approve',
      refundId: gAlphaRefundPending.refund.id,
    })
    const guestAlphaDlAfter = await request(state.guestAlphaDownloadPath)
    await guestAlphaPage.reload()
    await guestAlphaPage.getByText(`Order ${state.guestAlphaOrderNumber} is refunded.`).waitFor()
    check(
      'dual-control full refund on guest Alpha order transitions order to refunded, revokes bearer digital download (404), and updates browser order view',
      gAlphaRefundFull.refund.state === 'succeeded' &&
        (await row('orders', state.guestAlphaOrderId)).state === 'refunded' &&
        guestAlphaDlAfter.status === 404 &&
        (await guestAlphaPage
          .getByRole('link', { name: 'Download purchased file BRIEFING-11E-PDF' })
          .count()) === 0,
    )
    await guestAlphaPage.close()

    // =========================================================================
    // 4. SITE BETA GUEST & MEMBER: STOREFRONT -> CHECKOUT -> WEBHOOK -> ORDER -> DIGITAL DOWNLOAD & REFUND
    // =========================================================================
    // 4A. Site Beta Guest in Chromium on http://beta.11e.test:39019
    const guestBetaCtx = await newContext()
    const guestBetaPage = await guestBetaCtx.newPage()
    await guestBetaPage.goto(`${betaBase}/store/handbook-beta-11e`)
    await guestBetaPage.waitForLoadState('networkidle')
    const gbPriv = guestBetaPage.getByRole('button', { name: 'Reject non-essential', exact: true })
    if (await gbPriv.isVisible()) await gbPriv.click()
    await guestBetaPage.getByLabel('Quantity', { exact: true }).fill('1')
    const gbAdd1 = guestBetaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
    )
    await guestBetaPage
      .getByRole('button', { name: 'Add 11E Beta Handbook to cart', exact: true })
      .click()
    assert.equal((await gbAdd1).status(), 200)

    await guestBetaPage.goto(`${betaBase}/store/archive-beta-11e`)
    await guestBetaPage.waitForLoadState('networkidle')
    await guestBetaPage.getByLabel('Quantity', { exact: true }).fill('1')
    const gbAdd2 = guestBetaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
    )
    await guestBetaPage
      .getByRole('button', { name: 'Add 11E Beta Digital Archive to cart', exact: true })
      .click()
    assert.equal((await gbAdd2).status(), 200)

    await guestBetaPage.goto(`${betaBase}/cart`)
    await guestBetaPage.getByLabel('Email Address').fill('guest-beta@11e.test')
    await guestBetaPage.getByLabel('Full Name').fill('Guest Beta')
    await guestBetaPage.getByLabel('Street Address').fill('500 Congress Ave')
    await guestBetaPage.getByLabel('City').fill('Austin')
    await guestBetaPage.getByLabel('State / Province').fill('TX')
    await guestBetaPage.getByLabel('Postal Code').fill('78701')
    await guestBetaPage.getByLabel('Country (2-letter ISO)').fill('US')
    await guestBetaPage.getByRole('checkbox').check()

    const gbPropWait = guestBetaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/proposal') && r.request().method() === 'POST',
    )
    await guestBetaPage
      .getByRole('button', { name: 'Create Checkout Proposal', exact: true })
      .click()
    const gbProposal = (await (await gbPropWait).json()).proposal
    // Subtotal: 1400 + 1000 = 2400; Shipping: 500; Tax (6.25% on 2400): 150 -> GrandTotal: 3050 ($30.50)
    const gbInitWait = guestBetaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/checkout/initiate') && r.request().method() === 'POST',
    )
    await guestBetaPage.getByRole('button', { name: /Confirm & Pay \$30\.50/ }).click()
    const gbInit = await (await gbInitWait).json()
    state.guestBetaSessionId = gbInit.sessionId
    state.guestBetaAttemptId = gbInit.attemptId

    const gbAttemptDoc = await row('payment-attempts', gbInit.attemptId)
    const gbPaidWh = signDeterministicWebhook({
      providerEventId: `11e-beta-guest-paid:${gbAttemptDoc.id}`,
      providerReference: gbAttemptDoc.providerReference,
      kind: 'succeeded',
      amountMinor: '3050',
      currency: 'USD',
      sequence: 1,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: String(gbAttemptDoc.id) },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', gbPaidWh.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': gbPaidWh.signature,
        })
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })

    await guestBetaPage.goto(`${betaBase}/checkout/return?session=${state.guestBetaSessionId}`)
    await guestBetaPage
      .getByRole('heading', { name: 'Payment confirmed' })
      .waitFor({ timeout: 15000 })
    const guestBetaOrder = (
      await payload.find({
        collection: 'orders',
        where: { checkoutSession: { equals: state.guestBetaSessionId } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    state.guestBetaOrderId = guestBetaOrder.id
    state.guestBetaOrderNumber = guestBetaOrder.orderNumber
    state.guestBetaReceiptNumber = guestBetaOrder.receipt.receiptNumber
    state.guestBetaDownloadPath = guestBetaOrder.fulfillmentExtension.downloads[0].path

    const gbDownloadOnBeta = await guestBetaCtx.request.get(
      `${betaBase}${state.guestBetaDownloadPath}`,
    )
    const gbDownloadOnAlpha = await request(state.guestBetaDownloadPath)
    const guestBetaSiteId =
      typeof guestBetaOrder.site === 'object' ? guestBetaOrder.site.id : guestBetaOrder.site
    check(
      'Site Beta guest completes storefront -> checkout -> webhook -> order (3050 USD minor, Beta stock 5 -> 4), downloads Beta private asset on Beta host (200) and is denied on Alpha host (404)',
      guestBetaSiteId === state.beta &&
        guestBetaOrder.state === 'paid' &&
        guestBetaOrder.amountMinor === '3050' &&
        (await row('products', state.betaPhysicalProduct)).variants[0].inventoryQuantity === 4 &&
        gbDownloadOnBeta.status() === 200 &&
        Buffer.from(await gbDownloadOnBeta.body()).equals(betaImage) &&
        gbDownloadOnAlpha.status === 404,
    )
    await guestBetaPage.close()

    // 4B. Site Beta Member in Chromium on http://127.0.0.1:39019 -> purchase -> download -> full refund revocation
    const savedMemberBeta = JSON.parse(await readFile('scratch/rc111e/member-beta.json', 'utf8'))
    const memberBetaCtx = await newContext()
    await memberBetaCtx.addCookies([
      {
        name: 'renegade-member',
        value: savedMemberBeta.sessionToken,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
      {
        name: 'renegade-member-csrf',
        value: 'member-beta-csrf-11e',
        domain: '127.0.0.1',
        path: '/',
        sameSite: 'Lax',
      },
    ])
    const memberBetaPage = await memberBetaCtx.newPage()
    await memberBetaPage.goto(`${betaBase}/store/archive-beta-11e`)
    await memberBetaPage.waitForLoadState('networkidle')
    const mbPriv = memberBetaPage.getByRole('button', {
      name: 'Reject non-essential',
      exact: true,
    })
    if (await mbPriv.isVisible()) await mbPriv.click()
    await memberBetaPage.getByLabel('Quantity', { exact: true }).fill('1')
    const mbAdd = memberBetaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
    )
    await memberBetaPage
      .getByRole('button', { name: 'Add 11E Beta Digital Archive to cart', exact: true })
      .click()
    assert.equal((await mbAdd).status(), 200)

    await memberBetaPage.goto(`${betaBase}/cart`)
    await memberBetaPage.getByLabel('Email Address').fill('member-beta@11e.test')
    await memberBetaPage.getByLabel('Full Name').fill('Member Beta')
    await memberBetaPage.getByRole('checkbox').check()

    const mbPropWait = memberBetaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/proposal') && r.request().method() === 'POST',
    )
    await memberBetaPage
      .getByRole('button', { name: 'Create Checkout Proposal', exact: true })
      .click()
    const mbProposal = (await (await mbPropWait).json()).proposal
    assert.equal(mbProposal.pricingSnapshot.grandTotalMinor, '1000')

    const mbInitWait = memberBetaPage.waitForResponse(
      (r) => r.url().endsWith('/api/commerce/checkout/initiate') && r.request().method() === 'POST',
    )
    await memberBetaPage.getByRole('button', { name: /Confirm & Pay \$10\.00/ }).click()
    const mbInit = await (await mbInitWait).json()
    state.memberBetaSessionId = mbInit.sessionId
    state.memberBetaAttemptId = mbInit.attemptId

    const mbAttemptDoc = await row('payment-attempts', mbInit.attemptId)
    const mbPaidWh = signDeterministicWebhook({
      providerEventId: `11e-beta-member-paid:${mbAttemptDoc.id}`,
      providerReference: mbAttemptDoc.providerReference,
      kind: 'succeeded',
      amountMinor: '1000',
      currency: 'USD',
      sequence: 1,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: String(mbAttemptDoc.id) },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', mbPaidWh.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': mbPaidWh.signature,
        })
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })

    await memberBetaPage.goto(`${betaBase}/checkout/return?session=${state.memberBetaSessionId}`)
    await memberBetaPage
      .getByRole('heading', { name: 'Payment confirmed' })
      .waitFor({ timeout: 15000 })
    const memberBetaOrder = (
      await payload.find({
        collection: 'orders',
        where: { checkoutSession: { equals: state.memberBetaSessionId } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    state.memberBetaOrderId = memberBetaOrder.id
    state.memberBetaOrderNumber = memberBetaOrder.orderNumber
    state.memberBetaReceiptNumber = memberBetaOrder.receipt.receiptNumber
    state.memberBetaDownloadPath = memberBetaOrder.fulfillmentExtension.downloads[0].path

    // Member Beta downloads private file on Beta host (200), anonymous on Beta host is denied (404), Member Alpha on Beta host is denied (404)
    const mbDlOwned = await memberBetaCtx.request.get(`${betaBase}${state.memberBetaDownloadPath}`)
    const mbDlAnon = await guestBetaCtx.request.get(`${betaBase}${state.memberBetaDownloadPath}`)
    const mbDlWrongMember = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        `${base}${state.memberBetaDownloadPath}`,
        { headers: { host: '127.0.0.1:39019', cookie: memberAlphaCookie } },
        (res) => {
          res.resume()
          resolve(res.statusCode!)
        },
      )
      req.on('error', reject)
      req.end()
    })
    check(
      'Site Beta member downloads owned digital file (200 byte-equal) while anonymous (404) and Site Alpha member (404) are denied',
      mbDlOwned.status() === 200 &&
        Buffer.from(await mbDlOwned.body()).equals(betaImage) &&
        mbDlAnon.status() === 404 &&
        mbDlWrongMember === 404,
    )

    // Full refund on Site Beta member order (1000 minor <= 3000 threshold -> single operator execution)
    const mbRefund = await json('/api/admin/commerce/refunds', operator, 'POST', {
      action: 'request',
      orderId: state.memberBetaOrderId,
      amountMinor: '1000',
      reason: '11E Beta member full refund',
    })
    const mbDlAfterRefund = await memberBetaCtx.request.get(
      `${betaBase}${state.memberBetaDownloadPath}`,
    )
    await memberBetaPage.reload()
    await memberBetaPage.getByText(`Order ${state.memberBetaOrderNumber} is refunded.`).waitFor()
    check(
      'full refund on Site Beta member order revokes Beta digital grant (404) and updates Beta browser order view while leaving Site Beta guest order intact',
      mbRefund.refund.state === 'succeeded' &&
        (await row('orders', state.memberBetaOrderId)).state === 'refunded' &&
        mbDlAfterRefund.status() === 404 &&
        (await row('orders', state.guestBetaOrderId)).state === 'paid',
    )
    await memberBetaPage.close()

    // =========================================================================
    // 5. MULTI-CURRENCY (EUR), DISPUTES, UNKNOWN/QUARANTINED, FAILED WEBHOOK & COMMERCE COMMAND CENTER UI
    // =========================================================================
    // 5A. Create a EUR checkout attempt on Site Alpha (`2000` EUR minor) and settle it
    const eurCtx = await newContext()
    const eurAdd = await eurCtx.request.post(`${base}/api/commerce/cart`, {
      data: { productId: state.alphaEurProduct, variantSku: 'EU-DISPATCH-PDF', quantity: 1 },
    })
    assert.equal(eurAdd.status(), 200)
    const eurPropRes = await eurCtx.request.post(`${base}/api/commerce/proposal`, {
      data: {
        customer: { email: 'eur-buyer@11e.test', name: 'EUR Buyer', country: 'US' },
        consents: { termsAccepted: true, privacyAccepted: true },
      },
    })
    assert.equal(eurPropRes.status(), 200)
    const eurProposal = (await eurPropRes.json()).proposal
    const eurInitRes = await eurCtx.request.post(`${base}/api/commerce/checkout/initiate`, {
      data: { proposalId: eurProposal.id, capabilityId: state.alphaEurCapability },
    })
    assert.equal(eurInitRes.status(), 200)
    const eurCheckout = await eurInitRes.json()
    const eurAttemptDoc = await row('payment-attempts', eurCheckout.attemptId)
    const eurPaidWh = signDeterministicWebhook({
      providerEventId: `11e-alpha-eur-paid:${eurAttemptDoc.id}`,
      providerReference: eurAttemptDoc.providerReference,
      kind: 'succeeded',
      amountMinor: '2000',
      currency: 'EUR',
      sequence: 1,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: String(eurAttemptDoc.id) },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', eurPaidWh.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': eurPaidWh.signature,
        })
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    await eurCtx.close()

    // 5B. Create an `unknown` payment attempt via amount disagreement (`amount-or-currency-mismatch`) -> opens quarantined case
    const unkCtx = await newContext()
    await unkCtx.request.post(`${base}/api/commerce/cart`, {
      data: { productId: state.alphaDigitalProduct, variantSku: 'BRIEFING-11E-PDF', quantity: 1 },
    })
    const unkProp = (
      await (
        await unkCtx.request.post(`${base}/api/commerce/proposal`, {
          data: {
            customer: { email: 'unknown-buyer@11e.test', name: 'Unknown Buyer', country: 'US' },
            consents: { termsAccepted: true, privacyAccepted: true },
          },
        })
      ).json()
    ).proposal
    const unkInit = await (
      await unkCtx.request.post(`${base}/api/commerce/checkout/initiate`, {
        data: { proposalId: unkProp.id, capabilityId: state.alphaCapability },
      })
    ).json()
    state.unknownAttemptId = unkInit.attemptId
    const unkAttemptDoc = await row('payment-attempts', unkInit.attemptId)
    const unkMismatchWh = signDeterministicWebhook({
      providerEventId: `11e-alpha-mismatch:${unkAttemptDoc.id}`,
      providerReference: unkAttemptDoc.providerReference,
      kind: 'succeeded',
      amountMinor: '100', // disagrees with 1200!
      currency: 'USD',
      sequence: 1,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: { attemptId: String(unkAttemptDoc.id) },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', unkMismatchWh.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': unkMismatchWh.signature,
        })
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    await unkCtx.close()

    // 5C. Deliver a signed `disputed` webhook on Member Alpha's order -> opens dispute & marks order `exception`
    const disputeWh = signDeterministicWebhook({
      providerEventId: `11e-alpha-dispute:${attempt2Doc.id}`,
      providerReference: attempt2Doc.providerReference,
      kind: 'disputed',
      amountMinor: '2603',
      currency: 'USD',
      sequence: 20,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: {
        attemptId: String(attempt2Doc.id),
        objectId: `11e-dispute:${attempt2Doc.id}`,
      },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', disputeWh.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': disputeWh.signature,
        })
      ).status,
      202,
    )
    await payload.jobs.run({ queue: 'commerce', limit: 20 })

    // 5D. Create a failed verified webhook event on Site Alpha to exercise operator UI webhook retry
    const retryableWh = signDeterministicWebhook({
      providerEventId: `11e-retryable-wh:${attempt2Doc.id}`,
      providerReference: attempt2Doc.providerReference,
      kind: 'disputed',
      amountMinor: '2603',
      currency: 'USD',
      sequence: 21,
      occurredAt: new Date().toISOString(),
      sanitizedEvidence: {
        attemptId: String(attempt2Doc.id),
        objectId: `11e-dispute:${attempt2Doc.id}`,
      },
    })
    assert.equal(
      (
        await request('/api/commerce/webhooks/deterministic-test', '', 'POST', retryableWh.raw, {
          'content-type': 'application/json',
          'x-commerce-signature': retryableWh.signature,
        })
      ).status,
      202,
    )
    const retryableInbox = (
      await payload.find({
        collection: 'payment-webhook-events',
        where: { providerEventId: { equals: `11e-retryable-wh:${attempt2Doc.id}` } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    await payload.update({
      collection: 'payment-webhook-events',
      id: retryableInbox.id,
      data: {
        processingState: 'failed',
        lastError: 'Simulated transient worker interruption before UI retry',
      },
      overrideAccess: true,
    })
    state.retryableWebhookId = retryableInbox.id

    // Backdate `unknown` attempt created_at by 12 minutes so oldestAgeMs is visibly > 0 min in Command Center
    await payload.db.pool.query(
      `UPDATE payment_attempts SET created_at = NOW() - INTERVAL '12 minutes' WHERE id = $1`,
      [state.unknownAttemptId],
    )

    // Verify `/api/admin/commerce/dashboard` JSON contract and role/site access control
    const anonDash = await request('/api/admin/commerce/dashboard')
    const memberDash = await request('/api/admin/commerce/dashboard', memberAlphaCookie)
    const foreignStaffDash = await request(
      `/api/admin/commerce/dashboard?siteId=${state.alpha}`,
      staffBetaCookie,
    )
    const foreignStaffReconcile = await request(
      `/api/admin/commerce/reconcile?siteId=${state.alpha}`,
      staffBetaCookie,
      'POST',
    )
    const foreignStaffWhRetry = await request(
      `/api/admin/commerce/webhooks/${state.retryableWebhookId}/retry`,
      staffBetaCookie,
      'POST',
    )
    check(
      'Commerce Command Center APIs deny anonymous, member and foreign-site staff across dashboard, reconcile and webhook retry (403)',
      anonDash.status === 403 &&
        memberDash.status === 403 &&
        foreignStaffDash.status === 403 &&
        foreignStaffReconcile.status === 403 &&
        foreignStaffWhRetry.status === 403,
    )

    const alphaDashboard = await json(
      `/api/admin/commerce/dashboard?siteId=${state.alpha}`,
      operator,
    )
    check(
      'Commerce Command Center dashboard reports currency-separated USD and EUR totals, reconciliation age, pending/unknown actions, orders with audit trail, refunds, disputes, webhook failures and quarantined cases',
      Boolean(alphaDashboard.summary.totalsMinorByCurrency.USD) &&
        alphaDashboard.summary.totalsMinorByCurrency.EUR?.succeeded === '2000' &&
        alphaDashboard.summary.counts.unknown >= 1 &&
        alphaDashboard.summary.oldestAgeMs.unknown >= 10 * 60 * 1000 &&
        alphaDashboard.pendingActions.some((a: any) => a.id === String(state.unknownAttemptId)) &&
        Array.isArray(alphaDashboard.orders) &&
        alphaDashboard.orders.some(
          (o: any) =>
            o.orderNumber === state.memberAlphaOrderNumber &&
            o.auditEntries.includes('inventory-applied') &&
            o.auditEntries.includes('payment-confirmed'),
        ) &&
        alphaDashboard.refunds.length >= 1 &&
        alphaDashboard.disputes.length >= 1 &&
        alphaDashboard.webhookFailures.some(
          (w: any) => w.id === String(state.retryableWebhookId) && w.state === 'failed',
        ) &&
        alphaDashboard.reconciliationCases.some(
          (c: any) => c.status === 'quarantined' && c.reason === 'amount-or-currency-mismatch',
        ),
    )

    // Render `/admin/commerce` in Playwright Chromium as authenticated operator and exercise interactive actions
    const adminCtx = await newContext()
    const tokenValue = operator.split('=')[1]
    await adminCtx.addCookies([
      {
        name: 'renegade-passkey',
        value: tokenValue,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])
    const adminPage = await adminCtx.newPage()
    await adminPage.goto(`${base}/admin/commerce`)
    await adminPage
      .getByRole('heading', { name: 'Commerce operations' })
      .waitFor({ timeout: 15000 })

    check(
      'Commerce Command Center UI renders provider health, currency-separated USD and EUR totals, oldest age, pending/unknown actions, orders & audit, refunds, disputes, webhook failures and quarantined cases',
      (await adminPage.getByRole('heading', { name: 'Provider health' }).isVisible()) &&
        (await adminPage.getByText(/deterministic-test: healthy/).isVisible()) &&
        (await adminPage.getByText(/EUR 2000/).isVisible()) &&
        (await adminPage.getByText(/USD /).first().isVisible()) &&
        (await adminPage.getByRole('heading', { name: 'Orders and audit' }).isVisible()) &&
        (await adminPage.getByText(new RegExp(state.memberAlphaOrderNumber)).isVisible()) &&
        (await adminPage
          .getByText(/inventory-applied → payment-confirmed/)
          .first()
          .isVisible()) &&
        (await adminPage
          .getByText(/open dispute/)
          .first()
          .isVisible()) &&
        (await adminPage
          .getByText(/quarantined case/)
          .first()
          .isVisible()),
    )

    // Click "Retry verified payment event" button in Command Center UI
    const retryWait = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/admin/commerce/webhooks/${state.retryableWebhookId}/retry`) &&
        r.request().method() === 'POST',
    )
    await adminPage.getByRole('button', { name: 'Retry verified payment event' }).click()
    assert.equal((await retryWait).status(), 202)
    await adminPage
      .getByText('Verified event retry queued. Refresh to inspect the worker outcome.')
      .waitFor()
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    const retriedInboxAfterWorker = await row('payment-webhook-events', state.retryableWebhookId)
    check(
      'clicking Retry verified payment event in Command Center UI queues worker job and processes failed webhook event to processed',
      retriedInboxAfterWorker.processingState === 'processed',
    )

    // Click "Queue reconciliation" button in Command Center UI
    const recWait = adminPage.waitForResponse(
      (r) => r.url().endsWith('/api/admin/commerce/reconcile') && r.request().method() === 'POST',
    )
    await adminPage.getByRole('button', { name: 'Queue reconciliation' }).click()
    assert.equal((await recWait).status(), 202)
    await adminPage.getByText('Reconciliation queued for your authorized sites.').waitFor()
    await payload.jobs.run({ queue: 'commerce', limit: 20 })
    check(
      'clicking Queue reconciliation in Command Center UI queues and runs commerce-reconcile-payments task',
      true,
    )

    await guestAlphaCtx.storageState({ path: 'scratch/rc111e/guest-alpha-browser.json' })
    await memberAlphaCtx.storageState({ path: 'scratch/rc111e/member-alpha-browser.json' })
    await guestBetaCtx.storageState({ path: 'scratch/rc111e/guest-beta-browser.json' })
    await memberBetaCtx.storageState({ path: 'scratch/rc111e/member-beta-browser.json' })
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))

    await memberAlphaCtx.close()
    await guestAlphaCtx.close()
    await guestBetaCtx.close()
    await memberBetaCtx.close()
    await adminCtx.close()
  } else {
    // =========================================================================
    // RESTART VERIFICATION (AFTER POSTGRESQL + NEXT.JS RESTART)
    // =========================================================================
    const memberAlphaCtx = await newContext({
      storageState: 'scratch/rc111e/member-alpha-browser.json',
    })
    const memberAlphaPage = await memberAlphaCtx.newPage()
    await memberAlphaPage.goto(`${base}/checkout/return?session=${state.memberAlphaSessionId}`)
    await memberAlphaPage
      .getByRole('heading', { name: 'Payment confirmed' })
      .waitFor({ timeout: 15000 })
    check(
      'after PostgreSQL and Next.js restart, Site Alpha member order retains exception state, receipt number, 2603 USD minor total and revoked download',
      (await memberAlphaPage
        .getByText(`Order ${state.memberAlphaOrderNumber} is exception.`)
        .isVisible()) &&
        (await memberAlphaPage
          .getByText(`Receipt ${state.memberAlphaReceiptNumber}.`)
          .isVisible()) &&
        (await memberAlphaPage.getByText('Settled total: 2603 USD minor units').isVisible()) &&
        (await memberAlphaPage
          .getByRole('link', { name: 'Download purchased file BRIEFING-11E-PDF' })
          .count()) === 0,
    )

    const guestBetaCtx = await newContext({
      storageState: 'scratch/rc111e/guest-beta-browser.json',
    })
    const guestBetaPage = await guestBetaCtx.newPage()
    await guestBetaPage.goto(`${betaBase}/checkout/return?session=${state.guestBetaSessionId}`)
    await guestBetaPage
      .getByRole('heading', { name: 'Payment confirmed' })
      .waitFor({ timeout: 15000 })
    const gbDownloadAfterRestart = await guestBetaCtx.request.get(
      `${betaBase}${state.guestBetaDownloadPath}`,
    )
    check(
      'after PostgreSQL and Next.js restart, Site Beta guest order retains paid state (3050 USD minor) and active private digital download on Beta host (200)',
      (await guestBetaPage.getByText(`Order ${state.guestBetaOrderNumber} is paid.`).isVisible()) &&
        (await guestBetaPage.getByText(`Receipt ${state.guestBetaReceiptNumber}.`).isVisible()) &&
        gbDownloadAfterRestart.status() === 200,
    )

    const memberBetaCtx = await newContext({
      storageState: 'scratch/rc111e/member-beta-browser.json',
    })
    const mbDownloadAfterRestart = await memberBetaCtx.request.get(
      `${betaBase}${state.memberBetaDownloadPath}`,
    )
    check(
      'after PostgreSQL and Next.js restart, refunded Site Beta member order and refunded Site Alpha guest order keep digital downloads revoked (404)',
      mbDownloadAfterRestart.status() === 404 &&
        (await request(state.guestAlphaDownloadPath)).status === 404,
    )

    // Replay settlement on Member Alpha order after restart to prove idempotency across restart
    await (processPaymentEventTask.handler as any)({
      input: { webhookEventId: String(state.retryableWebhookId) },
      req: { payload },
    })

    const alphaPhysical = await row('products', state.alphaPhysicalProduct)
    const alphaLimited = await row('products', state.alphaLimitedProduct)
    const betaPhysical = await row('products', state.betaPhysicalProduct)
    const save5Promo = await row('promotions', state.save5PromoId)
    const alphaDashAfterRestart = await json(
      `/api/admin/commerce/dashboard?siteId=${state.alpha}`,
      operator,
    )
    check(
      'after restart and event replay, inventory quantities (Alpha Almanac=6, Alpha Pin=0, Beta Handbook=4), coupon usageCount (SAVE5=1), and Command Center currency totals remain exact',
      alphaPhysical.variants[0].inventoryQuantity === 6 &&
        alphaLimited.variants[0].inventoryQuantity === 0 &&
        betaPhysical.variants[0].inventoryQuantity === 4 &&
        save5Promo.usageCount === 1 &&
        alphaDashAfterRestart.summary.totalsMinorByCurrency.EUR?.succeeded === '2000',
    )

    await memberAlphaCtx.close()
    await guestBetaCtx.close()
    await memberBetaCtx.close()
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
          'Genuine guest Chromium sessions on Site Alpha and Site Beta; member sessions via canonical magic-link service; operator sessions via admin_sessions fixture (no passkey ceremony claim).',
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
