/* eslint-disable @typescript-eslint/no-explicit-any -- isolated operator acceptance harness */
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { snapshotQuotedLines } from '../../src/modules/commerce/service'

assert.equal(process.env.RC1_11A_DISPOSABLE, 'yes')
assert.equal(
  process.env.DATABASE_URL,
  'postgresql://postgres:postgres@127.0.0.1:5459/rc111a_release_acceptance',
)
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
assert.equal(process.env.ENABLE_TEST_ROUTES, 'false')
const out = 'docs/rc/evidence/rc1/18-pass/11A'
const base = 'http://localhost:39015'
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
const rawHostStatus = (host: string) =>
  new Promise<number>((resolve, reject) => {
    http
      .get(`${base}/api/catalog`, { headers: { Host: host } }, (response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      })
      .on('error', reject)
  })
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
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '39015'],
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
      data: { name: '11A Alpha', slug: `alpha11a-${stamp}`, lifecycle: 'active' },
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '11A Beta', slug: `beta11a-${stamp}`, lifecycle: 'active' },
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@11a.test`, role: 'owner' },
    })
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-${stamp}@11a.test`, role: 'staff' },
    })
    const member = typeof staff.member === 'object' ? staff.member.id : staff.member
    await payload.create({
      collection: 'member-site-roles',
      data: { member, site: beta.id, role: 'contributor' },
    })
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [alpha.id]: base, [beta.id]: 'http://beta.11a.test:39015' },
        launchState: 'live',
      },
    })
    state = { alpha: alpha.id, beta: beta.id, owner: owner.id, staff: staff.id }
  }
  await startWeb()
  const cookie = await session(await row('users', state.owner))
  if (!restart) {
    const form = new FormData()
    const image = await sharp({
      create: { width: 400, height: 400, channels: 3, background: '#7542b1' },
    })
      .png()
      .toBuffer()
    form.set('siteId', state.alpha)
    form.set('title', '11A product cover')
    form.set('altText', 'Purple catalog cover')
    form.set('file', new File([image], '11a-cover.png', { type: 'image/png' }))
    const asset = (await json('/api/media/upload', cookie, 'POST', form, 201)).asset
    const sourceForm = new FormData()
    sourceForm.set('siteId', state.alpha)
    sourceForm.set('title', '11A private digital source')
    sourceForm.set('file', new File([image], '11a-private.png', { type: 'image/png' }))
    const privateAsset = (await json('/api/media/upload', cookie, 'POST', sourceForm, 201)).asset
    await json(`/api/media-assets/${privateAsset.id}`, cookie, 'PATCH', {
      publicPolicy: 'private',
      rightsStatus: 'approved',
    })
    state.asset = asset.id
    state.privateAsset = privateAsset.id
    await payload.jobs.run({ queue: 'media', limit: 20 })
    const make = (slug: string, digital = false, site = state.alpha) => ({
      site,
      name: `11A ${slug}`,
      slug,
      canonicalPath: `/store/${slug}`,
      kind: digital ? 'digital' : 'physical',
      state: 'draft',
      catalogContractVersion: 1,
      productCapabilities: [digital ? 'digital-entitlement' : 'shippable'],
      media: digital ? [] : [asset.id],
      optionDimensions: [{ key: 'size', label: 'Size', values: ['small', 'large'] }],
      variants: ['small', 'large'].map((size) => ({
        sku: `${slug}-${size}`,
        title: size,
        optionValues: { size },
        status: 'active',
        inventoryPolicy: digital ? 'untracked' : 'tracked',
        inventoryQuantity: digital ? null : 5,
        ...(digital
          ? {}
          : { weightGrams: 100, dimensionsMm: { length: 100, width: 100, height: 10 } }),
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
      ...(digital
        ? {
            digitalDelivery: {
              entitlement: '11a.guide',
              assets: [
                {
                  mediaId: privateAsset.id,
                  rightsStatus: 'approved',
                  malwareStatus: 'clean',
                  publicOriginal: false,
                },
              ],
            },
          }
        : {}),
    })
    const physical = (await json('/api/products', cookie, 'POST', make('physical'), 201)).doc
    const digital = (await json('/api/products', cookie, 'POST', make('digital', true), 201)).doc
    state.physical = physical.id
    state.digital = digital.id
    check(
      'operator CRUD creates persisted physical and digital products with two variants each',
      (await row('products', physical.id)).variants.length === 2 &&
        (await row('products', digital.id)).variants.length === 2,
    )
    const nativeDrafts = await json('/api/products')
    check(
      'anonymous native collection excludes drafts',
      !nativeDrafts.docs.some((p: any) => p.id === physical.id || p.id === digital.id),
    )
    const premature = await request('/api/products', cookie, 'POST', {
      ...make('premature'),
      state: 'published',
    })
    check('direct published creation rejected', premature.status === 400)
    const bad = await request(`/api/products/${physical.id}`, cookie, 'PATCH', {
      variants: [{ ...physical.variants[0], optionValues: { size: 'invalid' } }],
    })
    check(
      'invalid variant rejected and persisted variants unchanged',
      bad.status === 400 && (await row('products', physical.id)).variants.length === 2,
    )
    const priceBad = await request(`/api/products/${physical.id}`, cookie, 'PATCH', {
      offers: [
        {
          offerId: 'bad',
          version: 1,
          status: 'active',
          amountMinor: '-1',
          currency: 'usd',
          taxDisplay: 'exclusive',
        },
      ],
    })
    check(
      'invalid minor money/currency rejected',
      priceBad.status === 400 &&
        (await row('products', physical.id)).offers[0].amountMinor === '1200',
    )
    const foreign = await request(
      '/api/products',
      cookie,
      'POST',
      make('foreign-media', false, state.beta),
    )
    check('cross-site product media rejected', foreign.status === 400)
    const foreignProduct = (
      await json(
        '/api/products',
        cookie,
        'POST',
        { ...make('foreign', false, state.beta), media: [] },
        201,
      )
    ).doc
    state.foreign = foreignProduct.id
    await release(physical.id, cookie)
    await release(digital.id, cookie)
    await release(foreignProduct.id, cookie)
    const foreignCookie = await session(await row('users', state.staff))
    const denied = await request(`/api/products/${physical.id}`, foreignCookie, 'PATCH', {
      summary: 'foreign mutation',
    })
    check(
      'foreign scoped staff update denied and state unchanged',
      denied.status >= 400 && (await row('products', physical.id)).summary !== 'foreign mutation',
    )
    const deniedRole = await request(`/api/products/${physical.id}`, '', 'PATCH', {
      name: 'anonymous mutation',
    })
    check('anonymous product write denied', deniedRole.status >= 400)
    const listing = await json('/api/catalog')
    check(
      'public showcase lists only local published physical/digital products',
      listing.products.length === 2 &&
        !listing.products.some((p: any) => p.id === foreignProduct.id),
    )
    const foreignRoute = await request('/store/foreign')
    check('cross-site public detail is 404', foreignRoute.status === 404)
    const page = await browser.newPage()
    await page.goto(`${base}/store`)
    check(
      'real browser public listing shows both products',
      (await page.getByRole('link', { name: '11A physical', exact: true }).count()) === 1 &&
        (await page.getByRole('link', { name: '11A digital', exact: true }).count()) === 1,
    )
    await page.goto(`${base}/store/physical`)
    check(
      'real browser detail renders variants, price and media',
      (await page.textContent('main'))?.includes('$12.00') &&
        (await page.locator('img[alt="Purple catalog cover"]').count()) > 0,
    )
    check(
      'published product cover delivers actual public bytes',
      (await request(`/media/${asset.id}`)).status === 200,
    )
    check(
      'product hero derivative delivers rendered bytes',
      (await request(`/media/${asset.id}?variant=hero`)).status === 200,
    )
    const updated = await json(`/api/products/${physical.id}`, cookie, 'PATCH', {
      offers: [{ ...physical.offers[0], version: 2, amountMinor: '1750' }],
    })
    check(
      'pricing edit persisted and returns product to draft',
      updated.doc.state === 'draft' &&
        (await row('products', physical.id)).offers[0].amountMinor === '1750',
    )
    check(
      'unreviewed edited product excluded from public listing',
      !(await json('/api/catalog')).products.some((p: any) => p.id === physical.id),
    )
    check(
      'unreviewed product cover withdrawn',
      (await request(`/media/${asset.id}`)).status === 404,
    )
    check('unapproved detail inaccessible', (await request('/store/physical')).status === 404)
    await release(physical.id, cookie)
    let stock = await row('products', physical.id)
    await json(`/api/products/${physical.id}`, cookie, 'PATCH', {
      variants: stock.variants.map((v: any) => ({ ...v, inventoryQuantity: 0 })),
    })
    stock = await row('products', physical.id)
    check(
      'inventory adjustment persists zero without unpublishing',
      stock.state === 'published' && stock.variants.every((v: any) => v.inventoryQuantity === 0),
    )
    check(
      'showcase reflects out-of-stock and edited price',
      (await json('/api/catalog')).products.some(
        (p: any) => p.id === physical.id && !p.available && p.price === '$17.50',
      ),
    )
    await page.goto(`${base}/store/physical`)
    check(
      'browser refetch displays new price and unavailable options',
      (await page.textContent('main'))?.includes('$17.50') &&
        (await page.textContent('main'))?.includes('Unavailable'),
    )
    await page.screenshot({ path: `${out}/storefront.png`, fullPage: true })
    const quote = (product: any, sku: string) =>
      snapshotQuotedLines({
        siteId: state.alpha,
        currency: 'USD',
        cartLines: [{ productId: product.id, variantSku: sku, quantity: 1 }],
        products: [product],
      } as any)
    assert.throws(() => quote(stock, stock.variants[0].sku), /unavailable|inventory/i)
    check('canonical quote rejects out-of-stock', true)
    const liveDigital = await row('products', digital.id)
    assert.throws(() => quote(liveDigital, 'missing'), /variant/i)
    check('canonical quote rejects invalid SKU', true)
    const layout = (
      await json(
        '/api/page-layouts',
        cookie,
        'POST',
        {
          site: state.alpha,
          path: '/catalog-11a',
          themeId: 'neutral-starter',
          surface: 'page',
          slot: 'main',
          layoutVersion: 1,
          status: 'draft',
          visibility: 'public',
          blocks: [],
          revision: 1,
        },
        201,
      )
    ).doc
    await json(`/api/layouts/${layout.id}`, cookie, 'PATCH', {
      expectedRevision: 1,
      publish: true,
      layout: {
        version: 1,
        id: layout.id,
        siteId: state.alpha,
        path: layout.path,
        themeId: 'neutral-starter',
        revision: 1,
        blocks: [
          {
            id: 'showcase-11a',
            component: 'publisher.product-showcase',
            componentVersion: 1,
            props: { title: '11A live catalog' },
          },
        ],
      },
    })
    await page.goto(`${base}/catalog-11a`)
    await page
      .locator('#publisher-product-showcase')
      .getByText('11A physical', { exact: true })
      .waitFor()
    check(
      'ordinary published starter showcase renders live inventory and price',
      (await page.locator('#publisher-product-showcase').textContent())?.includes('$17.50') &&
        (await page.locator('#publisher-product-showcase').textContent())?.includes('Unavailable'),
    )
    check(
      'starter removes hardcoded products and foreign products',
      !(await page.locator('#publisher-product-showcase').textContent())?.includes(
        'Solidarity Heavyweight Tee',
      ) &&
        !(await page.locator('#publisher-product-showcase').textContent())?.includes('11A foreign'),
    )

    await json('/api/admin/catalog', cookie, 'DELETE', { productIds: [digital.id] })
    check(
      'ordinary archive unpublishes digital product',
      (await row('products', digital.id)).state === 'archived' &&
        !(await json('/api/catalog')).products.some((p: any) => p.id === digital.id),
    )
    check('archived detail is 404', (await request('/store/digital')).status === 404)
    check('unknown host fails closed', (await rawHostStatus('unknown.11a.test')) === 404)
    check(
      'private digital source bytes denied anonymously',
      (await request(`/media/${privateAsset.id}`)).status === 404,
    )
    await writeFile(`${out}/state.json`, JSON.stringify(state, null, 2))
  } else {
    const physical = await row('products', state.physical)
    check(
      'restart retains zero inventory and edited price',
      physical.variants.every((v: any) => v.inventoryQuantity === 0) &&
        physical.offers[0].amountMinor === '1750',
    )
    check(
      'restart retains publication/archival states',
      physical.state === 'published' && (await row('products', state.digital)).state === 'archived',
    )
    const listing = await json('/api/catalog')
    check(
      'restart public listing remains tenant scoped with live stock and price',
      listing.products.length === 1 &&
        listing.products[0].id === state.physical &&
        listing.products[0].price === '$17.50' &&
        !listing.products[0].available,
    )
    const page = await browser.newPage()
    await page.goto(`${base}/store/physical`)
    check(
      'restart browser shows persisted price',
      (await page.textContent('main'))?.includes('$17.50'),
    )
    check(
      'restart archived and foreign products remain inaccessible',
      (await request('/store/digital')).status === 404 &&
        (await request('/store/foreign')).status === 404,
    )
    check(
      'restart workflow audit persisted',
      physical.workflowAudit.filter((v: any) => v.action === 'publish').length === 2,
    )
    await page
      .context()
      .addCookies([{ name: 'renegade-passkey', value: cookie.split('=')[1], url: base }])
    await page.goto(`${base}/admin/catalog`)
    await page.getByRole('link', { name: 'Create product', exact: true }).waitFor()
    check(
      'operator catalog UI exposes native product creation after restart',
      (await page
        .getByRole('link', { name: 'Create product', exact: true })
        .getAttribute('href')) === '/admin/collections/products/create',
    )
  }
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}.json`,
    JSON.stringify(
      {
        passed: trace.length,
        failed: 0,
        skipped: 0,
        authentication:
          'Fixture operator sessions; genuine public browser, no WebAuthn claim. No payment/provider outcome.',
        checks: trace,
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
  for (const client of [...pool._clients]) {
    if (!idle.has(client)) {
      assert.ok(!client.activeQuery)
      client.release(true)
    }
  }
  await pool.end()
  await payload.destroy()
}
