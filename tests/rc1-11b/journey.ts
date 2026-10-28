/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator acceptance harness */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { issueMagicLink, consumeMagicLink } from '../../src/modules/identity/member-identity'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'

assert.equal(process.env.RC1_11B_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5460/rc111b_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const out = 'docs/rc/evidence/rc1/18-pass/11B'
const base = 'http://localhost:39016'
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
const request = (route: string, cookie = '', method = 'GET', data?: any, host?: string) =>
  fetch(`${base}${route}`, {
    method,
    headers: {
      origin: base,
      ...(cookie ? { cookie } : {}),
      ...(host ? { host } : {}),
      ...(data && !(data instanceof FormData) ? { 'content-type': 'application/json' } : {}),
    },
    body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
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
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39016'],
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
try {
  let state: any
  if (restart) state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
  else {
    const stamp = Date.now()
    const alpha = await payload.create({
      collection: 'sites',
      data: { name: '11B Alpha', slug: `alpha11b-${stamp}`, lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '11B Beta', slug: `beta11b-${stamp}`, lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@11b.test`, role: 'owner' },
    })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: 'http://beta.11b.test:39016' },
        launchState: 'live',
        adminExperience: { optionalCapabilities: { commerceCheckout: true } },
      },
    })
    const merchants = []
    for (const label of ['primary', 'other']) {
      const merchant = await payload.create({
        collection: 'merchant-connections',
        data: {
          site: alpha.id,
          label,
          providerKey: 'deterministic-test',
          merchantCountry: 'US',
          status: 'active',
        },
      })
      await payload.create({
        collection: 'payment-method-capabilities',
        data: {
          site: alpha.id,
          merchantConnection: merchant.id,
          providerKey: 'deterministic-test',
          railKey: label,
          family: 'card',
          flow: 'hosted',
          merchantCountries: ['US'],
          presentmentCurrencies: ['USD'],
          enabled: true,
          health: 'healthy',
        },
      })
      merchants.push(merchant.id)
    }
    const magic = await issueMagicLink(payload, `member-${stamp}@11b.test`)
    const member = await consumeMagicLink(payload, magic.token!)
    assert.ok(member?.sessionToken)
    state = { alpha: alpha.id, beta: beta.id, owner: owner.id, member: member.memberId, merchants }
    // Session capability stays only in isolated scratch, never in evidence.
    await writeFile('scratch/rc111b/session.json', JSON.stringify(member))
  }
  await startWeb()
  const operator = await session(await row('users', state.owner))
  if (!restart) {
    const product = async (slug: string, site = state.alpha, merchant = state.merchants[0]) => {
      const doc = (
        await json(
          '/api/products',
          operator,
          'POST',
          {
            site,
            merchantConnection: site === state.alpha ? merchant : undefined,
            name: `11B ${slug}`,
            slug,
            canonicalPath: `/store/${slug}`,
            kind: 'physical',
            state: 'draft',
            catalogContractVersion: 1,
            productCapabilities: ['shippable'],
            optionDimensions: [{ key: 'size', label: 'Size', values: ['small', 'large'] }],
            variants: ['small', 'large'].map((size) => ({
              sku: `${slug}-${size}`,
              title: size,
              optionValues: { size },
              status: 'active',
              inventoryPolicy: 'tracked',
              inventoryQuantity: 100,
              weightGrams: 100,
              dimensionsMm: { length: 10, width: 10, height: 10 },
            })),
            offers: [
              {
                offerId: `${slug}-usd`,
                version: 1,
                status: 'active',
                amountMinor: '1200',
                currency: 'USD',
                taxDisplay: 'exclusive',
              },
            ],
          },
          201,
        )
      ).doc
      await release(doc.id, operator)
      return doc.id
    }
    state.product = await product('cart11b')
    state.foreign = await product('foreign11b', state.beta)
    state.other = await product('other11b', state.alpha, state.merchants[1])
    const guestA = await browser.newContext()
    const guestB = await browser.newContext()
    const memberContext = await browser.newContext()
    const pageA = await guestA.newPage()
    const pageB = await guestB.newPage()
    const pageM = await memberContext.newPage()
    const addUI = async (page: any, sku = 'cart11b-small', qty = 1) => {
      await page.goto(`${base}/store/cart11b`)
      await page.waitForLoadState('networkidle')
      const privacy = page.getByRole('button', { name: 'Reject non-essential', exact: true })
      if (await privacy.isVisible()) await privacy.click()
      await page.getByLabel('Select Option').selectOption(sku)
      await page.getByLabel('Quantity', { exact: true }).fill(String(qty))
      const response = page.waitForResponse(
        (r: any) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'POST',
      )
      await page.getByRole('button', { name: 'Add 11B cart11b to cart', exact: true }).click()
      assert.equal((await response).status(), 200)
    }
    const cartOf = async (context: any) => {
      const r = await context.request.get(`${base}/api/commerce/cart`)
      assert.equal(r.status(), 200)
      return r.json()
    }
    const patch = async (context: any, data: any, expected = 200) => {
      const r = await context.request.patch(`${base}/api/commerce/cart`, { data })
      assert.equal(r.status(), expected, await r.text())
      return r.json()
    }
    await addUI(pageA, 'cart11b-small', 2)
    let a = await cartOf(guestA)
    state.cartA = a.cart.id
    check(
      'guest A browser add persists 2 units and exact 2400 server total',
      a.pricing.grandTotalMinor === '2400' &&
        (await row('carts', a.cart.id)).items[0].quantity === 2,
    )
    await addUI(pageB, 'cart11b-large')
    const b = await cartOf(guestB)
    state.cartB = b.cart.id
    check(
      'guest B isolated browser has independent cart and 1200 total',
      b.cart.id !== a.cart.id && b.pricing.grandTotalMinor === '1200',
    )
    await pageB.goto(`${base}/cart`)
    await pageB.getByLabel('Option for large', { exact: true }).selectOption('cart11b-small')
    await pageB.getByText('SKU: cart11b-small', { exact: true }).waitFor()
    check(
      'guest B edits variant in the cart UI with persisted SKU and unchanged exact price',
      (await row('carts', state.cartB)).items[0].variantSku === 'cart11b-small' &&
        (await cartOf(guestB)).pricing.grandTotalMinor === '1200',
    )
    await pageA.goto(`${base}/cart`)
    const update = pageA.waitForResponse(
      (r: any) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'PATCH',
    )
    await pageA.getByRole('button', { name: 'Increase quantity of small', exact: true }).click()
    assert.equal((await update).status(), 200)
    await pageA.reload()
    await pageA.getByText('$36.00 USD', { exact: true }).first().waitFor()
    a = await cartOf(guestA)
    check(
      'guest A UI quantity edit/reload persists quantity 3 and total 3600',
      a.pricing.grandTotalMinor === '3600' &&
        (await row('carts', a.cart.id)).items[0].quantity === 3,
    )
    await addUI(pageA, 'cart11b-large')
    a = await cartOf(guestA)
    check(
      'guest browser selects second variant and persists distinct SKU',
      a.cart.items.length === 2 && a.pricing.grandTotalMinor === '4800',
    )
    const auth = JSON.parse(await readFile('scratch/rc111b/session.json', 'utf8'))
    const memberCookies = [
      { name: 'renegade-member', value: auth.sessionToken, url: base, httpOnly: true },
      { name: 'renegade-member-csrf', value: '11b-csrf', url: base },
    ]
    await memberContext.addCookies(memberCookies)
    await addUI(pageM)
    const m = await cartOf(memberContext)
    state.cartM = m.cart.id
    check(
      'member browser add owns canonical member cart',
      (await row('carts', m.cart.id)).member === state.member &&
        m.pricing.grandTotalMinor === '1200',
    )
    // Sign-in fixture: attach canonical member session to the existing guest browser.
    await guestA.addCookies(memberCookies)
    await pageA.goto(`${base}/cart`)
    const merge = pageA.waitForResponse((r: any) => r.url().endsWith('/cart/merge'))
    await pageA
      .getByRole('button', { name: 'Merge guest cart after signing in', exact: true })
      .click()
    assert.equal((await merge).status(), 200)
    await pageA.reload()
    a = await cartOf(guestA)
    check(
      'UI guest-to-member merge combines existing quantities and exact 6000 total',
      a.cart.id === m.cart.id &&
        a.pricing.grandTotalMinor === '6000' &&
        a.cart.items.find((i: any) => i.variantSku === 'cart11b-small').quantity === 4,
    )
    const retired = await row('carts', state.cartA)
    check(
      'merge persists member ownership and retires guest capability',
      retired.state === 'converted' &&
        !retired.guestTokenHash &&
        (await row('carts', state.cartM)).member === state.member,
    )
    check(
      'other guest remains unchanged after merge',
      (await cartOf(guestB)).pricing.grandTotalMinor === '1200' &&
        (await row('carts', state.cartB)).items[0].quantity === 1,
    )
    const again = await guestA.request.post(`${base}/api/commerce/cart/merge`, {
      headers: { 'x-member-csrf': '11b-csrf' },
      data: {},
    })
    check(
      'merge replay cannot duplicate quantities',
      again.status() === 400 && (await cartOf(guestA)).pricing.grandTotalMinor === '6000',
    )
    for (const data of [
      { cartId: state.cartM, quantity: 50 },
      { siteId: state.beta },
      { merchantConnectionId: state.merchants[1] },
      { pricing: { grandTotalMinor: '1' } },
      { lineId: b.cart.items[0].lineId, quantity: 0.5 },
    ])
      await patch(guestB, data, 400)
    check(
      'malicious cart ID/site/merchant/price/fractional quantity payloads rejected without changing either cart',
      (await cartOf(guestB)).pricing.grandTotalMinor === '1200' &&
        (await cartOf(guestA)).pricing.grandTotalMinor === '6000',
    )
    const cross = await guestB.request.post(`${base}/api/commerce/cart`, {
      data: { productId: state.foreign, variantSku: 'foreign11b-small', quantity: 1 },
    })
    check(
      'cross-site published item denied',
      cross.status() === 404 && (await cartOf(guestB)).pricing.grandTotalMinor === '1200',
    )
    const other = await guestB.request.post(`${base}/api/commerce/cart`, {
      data: { productId: state.other, variantSku: 'other11b-small', quantity: 1 },
    })
    check(
      'same-site merchant substitution denied',
      other.status() === 409 && (await cartOf(guestB)).pricing.grandTotalMinor === '1200',
    )
    const native = await guestB.request.patch(`${base}/api/carts/${state.cartM}`, {
      data: { items: [], member: state.member },
    })
    check(
      'native cart ID guessing mutation denied',
      native.status() === 403 && (await cartOf(guestA)).pricing.grandTotalMinor === '6000',
    )
    const raceCart = await cartOf(guestB)
    const races = await Promise.all(
      [2, 3].map((quantity) =>
        guestB.request.patch(`${base}/api/commerce/cart`, {
          data: {
            expectedVersion: raceCart.cart.version,
            lineId: raceCart.cart.items[0].lineId,
            quantity,
          },
        }),
      ),
    )
    check(
      'concurrent same-version edits produce one success and one conflict',
      races
        .map((r: any) => r.status())
        .sort()
        .join(',') === '200,409',
    )
    const before = await row('products', state.product)
    await json(`/api/products/${state.product}`, operator, 'PATCH', {
      offers: before.offers.map((o: any) => ({ ...o, amountMinor: '1750', version: 2 })),
    })
    await release(state.product, operator)
    a = await cartOf(guestA)
    check(
      'price change refreshes browser cart from server and persists snapshots',
      a.pricing.grandTotalMinor === '8750' &&
        (await row('carts', state.cartM)).items.every(
          (i: any) => i.displaySnapshot.unitPriceMinor === '1750',
        ),
    )
    await pageA.reload()
    await pageA.getByText('$87.50 USD', { exact: true }).first().waitFor()
    await pageA.screenshot({ path: `${out}/cart.png`, fullPage: true })
    const quoteData = {
      customer: { email: 'buyer@11b.test', country: 'US' },
      shippingAddress: {
        name: 'Buyer',
        line1: '100 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      },
      consents: { termsAccepted: true, privacyAccepted: true },
    }
    const forged = await guestA.request.post(`${base}/api/commerce/proposal`, {
      data: { ...quoteData, taxTotalMinor: '0', pricingSnapshot: { grandTotalMinor: '1' } },
    })
    check('forged quote totals rejected', forged.status() === 400)
    const qr = await guestA.request.post(`${base}/api/commerce/proposal`, { data: quoteData })
    assert.equal(qr.status(), 200, await qr.text())
    const q = (await qr.json()).proposal
    state.proposal = q.id
    check(
      'quote uses current server subtotal, free shipping threshold and bounded TX tax',
      q.pricingSnapshot.subtotalMinor === '8750' &&
        q.pricingSnapshot.shippingAmountMinor === '0' &&
        q.pricingSnapshot.taxTotalMinor === '546' &&
        q.pricingSnapshot.grandTotalMinor === '9296',
    )
    check(
      'quote persists authoritative totals',
      (await row('checkout-proposals', q.id)).pricingSnapshot.grandTotalMinor === '9296',
    )
    const stolen = await guestB.request.get(`${base}/api/commerce/proposal?id=${q.id}`)
    check('guest B cannot read member quote by guessed ID', stolen.status() === 403)
    const unsupported = await guestA.request.post(`${base}/api/commerce/proposal`, {
      data: {
        ...quoteData,
        shippingAddress: { ...quoteData.shippingAddress, country: 'ZZ', state: '' },
      },
    })
    check('unconfigured tax jurisdiction blocks quote', unsupported.status() === 422)
    const promo = (
      await json(
        '/api/promotions',
        operator,
        'POST',
        {
          site: state.alpha,
          code: 'TEN11B',
          description: 'Local 10 percent',
          scope: 'order',
          discountType: 'percentage-basis-points',
          discountValue: '1000',
          currency: 'USD',
          status: 'active',
          stackingRule: 'stackable',
          stackingPriority: 0,
          usageCount: 0,
        },
        201,
      )
    ).doc
    await pageA.reload()
    await pageA.getByLabel('Promotion code', { exact: true }).fill('TEN11B')
    const couponResponse = pageA.waitForResponse(
      (r: any) => r.url().endsWith('/api/commerce/cart') && r.request().method() === 'PATCH',
    )
    await pageA.getByRole('button', { name: 'Apply', exact: true }).click()
    assert.equal((await couponResponse).status(), 200)
    check(
      'ordinary coupon UI applies persisted 10 percent server discount',
      (await cartOf(guestA)).pricing.grandTotalMinor === '7875' &&
        (await row('carts', state.cartM)).appliedCouponCodes.includes(promo.code),
    )
    const discounted = await guestA.request.post(`${base}/api/commerce/proposal`, {
      data: quoteData,
    })
    assert.equal(discounted.status(), 200, await discounted.text())
    const dq = (await discounted.json()).proposal
    check(
      'discounted quote taxes the resolved net item amount',
      dq.pricingSnapshot.adjustmentsTotalMinor === '875' &&
        dq.pricingSnapshot.taxTotalMinor === '492' &&
        dq.pricingSnapshot.grandTotalMinor === '8367',
    )
    await json(`/api/promotions/${promo.id}`, operator, 'PATCH', {
      endsAt: new Date(Date.now() - 1000).toISOString(),
    })
    check(
      'expired promotion is removed and authoritative totals restored',
      (await cartOf(guestA)).pricing.grandTotalMinor === '8750' &&
        !(await row('carts', state.cartM)).appliedCouponCodes.length,
    )
    const unknownRate = await guestA.request.post(`${base}/api/commerce/proposal`, {
      data: { ...quoteData, selectedShippingRateId: 'forged-free-rate' },
    })
    check('forged shipping selection rejected', unknownRate.status() === 400)
    // Accelerate only the expiry deadline through supported operator REST; no business status flip.
    await json(`/api/checkout-proposals/${dq.id}`, operator, 'PATCH', {
      expiresAt: new Date(Date.now() + 1500).toISOString(),
    })
    await new Promise((resolve) => setTimeout(resolve, 1700))
    const expiredRead = await guestA.request.get(`${base}/api/commerce/proposal?id=${dq.id}`)
    const expiredCheckout = await guestA.request.post(`${base}/api/commerce/checkout/initiate`, {
      data: { proposalId: dq.id, capabilityId: 'unused-expiry-probe' },
    })
    check(
      'expired quote cannot be read as active or initiated',
      expiredRead.status() === 409 && expiredCheckout.status() === 409,
    )
    const noOrders = await payload.find({
      collection: 'orders',
      where: { site: { equals: state.alpha } },
      limit: 1,
    })
    check('expiry and malicious requests create no orders', noOrders.docs.length === 0)
    await json(`/api/carts/${state.cartB}`, operator, 'PATCH', {
      expiresAt: new Date(Date.now() + 1500).toISOString(),
    })
    await new Promise((resolve) => setTimeout(resolve, 1700))
    check(
      'expired guest cart no longer resolves from its cookie',
      (await cartOf(guestB)).cart === null,
    )
    await patch(guestB, { lineId: b.cart.items[0].lineId, quantity: 1 }, 404)
    await addUI(pageB, 'cart11b-large')
    const renewed = await cartOf(guestB)
    check(
      'new purchase after expiry creates a new persistent guest capability',
      renewed.cart.id !== state.cartB && renewed.pricing.grandTotalMinor === '1750',
    )
    state.cartB = renewed.cart.id
    const flat = await guestB.request.post(`${base}/api/commerce/proposal`, { data: quoteData })
    assert.equal(flat.status(), 200, await flat.text())
    const fq = (await flat.json()).proposal
    check(
      'guest quote below threshold uses configured 500 shipping and exact 109 tax',
      fq.pricingSnapshot.shippingAmountMinor === '500' &&
        fq.pricingSnapshot.taxTotalMinor === '109' &&
        fq.pricingSnapshot.grandTotalMinor === '2359',
    )
    await json(
      '/api/promotions',
      operator,
      'POST',
      {
        site: state.alpha,
        code: 'SHIP11B',
        description: 'Local free shipping',
        scope: 'shipping',
        discountType: 'free-shipping',
        discountValue: '0',
        currency: 'USD',
        status: 'active',
        stackingRule: 'stackable',
        stackingPriority: 0,
        usageCount: 0,
      },
      201,
    )
    await patch(guestB, { appliedCouponCodes: ['SHIP11B'] })
    const shippingPromo = await guestB.request.post(`${base}/api/commerce/proposal`, {
      data: quoteData,
    })
    assert.equal(shippingPromo.status(), 200, await shippingPromo.text())
    const sq = (await shippingPromo.json()).proposal
    check(
      'supported shipping coupon discounts the actual rate without altering item tax',
      sq.pricingSnapshot.shippingAdjustmentMinor === '500' &&
        sq.pricingSnapshot.netShippingMinor === '0' &&
        sq.pricingSnapshot.grandTotalMinor === '1859',
    )
    for (const [code, limits] of [
      ['ZERO11B', { usageLimitTotal: 0 }],
      ['LIMIT11B', { usageLimitPerCustomer: 1 }],
    ] as const) {
      await json(
        '/api/promotions',
        operator,
        'POST',
        {
          site: state.alpha,
          code,
          description: 'Restricted local coupon',
          scope: 'order',
          discountType: 'fixed-minor',
          discountValue: '1000',
          currency: 'USD',
          status: 'active',
          stackingRule: 'stackable',
          stackingPriority: 0,
          usageCount: 0,
          ...limits,
        },
        201,
      )
      const rejectedCoupon = await patch(guestB, { appliedCouponCodes: [code] })
      check(
        `${code} cannot bypass zero usage or unavailable customer history`,
        rejectedCoupon.pricing.grandTotalMinor === '1750' &&
          rejectedCoupon.cart.appliedCouponCodes.length === 0 &&
          (await row('carts', state.cartB)).appliedCouponCodes.length === 0,
      )
    }
    await guestA.storageState({ path: 'scratch/rc111b/member-browser.json' })
    await guestB.storageState({ path: 'scratch/rc111b/guest-browser.json' })
    state.memberTotal = '8750'
    state.guestTotal = (await cartOf(guestB)).pricing.grandTotalMinor
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))
    await guestA.close()
    await guestB.close()
    await memberContext.close()
  } else {
    for (const [file, id, total] of [
      ['member-browser.json', state.cartM, state.memberTotal],
      ['guest-browser.json', state.cartB, state.guestTotal],
    ]) {
      const context = await browser.newContext({ storageState: `scratch/rc111b/${file}` })
      const page = await context.newPage()
      await page.goto(`${base}/cart`)
      const r = await context.request.get(`${base}/api/commerce/cart`)
      const data = await r.json()
      check(
        `restart retains browser ownership and exact total for ${id}`,
        data.cart.id === id && data.pricing.grandTotalMinor === total,
      )
      check(`restart retains persisted cart ${id}`, (await row('carts', id)).items.length > 0)
      await context.close()
    }
    check(
      'restart retains retired guest state',
      (await row('carts', state.cartA)).state === 'converted',
    )
    check(
      'restart retains immutable quote total',
      (await row('checkout-proposals', state.proposal)).pricingSnapshot.grandTotalMinor === '9296',
    )
  }
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}.json`,
    JSON.stringify(
      {
        passed: trace.length,
        failed: 0,
        skipped: 0,
        checks: trace,
        authentication:
          'Genuine guest Chromium; member session through canonical magic-link service fixture, not passkey/login ceremony.',
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
