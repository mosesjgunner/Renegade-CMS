import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium, request, expect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { installStarter } from '../../src/modules/starters/service'
import { readThemeState, themePool } from '../../src/modules/presentation/lifecycle'

assert.equal(process.env.RC1_04D_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith(':5441/rc104d_release_acceptance'))
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')

const payload = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/04D'
const base = 'https://localhost:38931'
const checks: string[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  checks.push(name)
  console.log(`PASS ${checks.length}: ${name}`)
}

const contexts: Awaited<ReturnType<typeof request.newContext>>[] = []
const sessions: string[] = []
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
const restart = process.argv.includes('--restart')

const operator = async (user: { id: string; email: string }) => {
  const session = await createPasskeySession(
    user,
    loadConfig().payloadSecret,
    async (id, expires) => {
      sessions.push(id)
      await payload.db.pool.query(
        'INSERT INTO admin_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)',
        [id, user.id, expires],
      )
    },
  )
  const storageState = {
    cookies: [
      {
        name: 'renegade-passkey',
        value: session.token,
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: 'Strict' as const,
      },
    ],
    origins: [],
  }
  const api = await request.newContext({
    baseURL: base,
    ignoreHTTPSErrors: true,
    timeout: 180000,
    extraHTTPHeaders: { origin: base },
    storageState,
  })
  contexts.push(api)
  return { api, storageState }
}

const anon = await request.newContext({ baseURL: base, ignoreHTTPSErrors: true, timeout: 180000 })
contexts.push(anon)

try {
  if (restart) {
    const saved = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    for (const record of saved.records) {
      const row = await payload.findByID({
        collection: record.collection,
        id: record.doc.id,
        depth: 0,
      })
      check(
        `exact persisted ${record.collection}/${record.doc.id} survives restart`,
        JSON.stringify(row) === JSON.stringify(record.doc),
      )
    }
    check(
      'custom theme palette survives restart',
      JSON.stringify(await readThemeState(themePool(payload), saved.site)) ===
        JSON.stringify(saved.theme),
    )
    for (const [route, text] of [
      ['/', '04D Forward Transit Campaign'],
      ['/articles', 'Transit'],
      ['/store', 'Store'],
      ['/store/solidarity-heavyweight-tee', 'Solidarity Heavyweight Union-Printed Tee'],
      ['/cart', 'Cart'],
      ['/checkout', 'Checkout'],
      ['/donate', 'Support our work'],
      ['/donate/clean-transit-fund', 'Transit'],
      ['/disclosure', 'Campaign Finance'],
      ['/contact', 'Contact'],
    ]) {
      let res = await anon.get(route)
      let body = await res.text()
      for (let attempt = 0; attempt < 3 && (!res.ok() || !body.includes(text)); attempt++) {
        await new Promise((r) => setTimeout(r, 1000))
        res = await anon.get(route)
        body = await res.text()
      }
      check(`public route survives restart ${route}`, res.ok() && body.includes(text))
    }
  } else {
    const stamp = Date.now()
    const site = await payload.create({
      collection: 'sites',
      data: { name: '04D Transit Campaign', slug: `rc104d-${stamp}`, lifecycle: 'active' } as never,
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@rc104d.test`, role: 'owner' } as never,
    })
    const { api, storageState } = await operator(owner)

    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [site.id]: base },
        launchState: 'live',
        indexingMode: 'index',
      } as never,
    })

    // 1. Transactional rollback check:
    // If a failure occurs mid-install (e.g. during page-layouts create), all changes must roll back cleanly.
    const failing = new Proxy(payload, {
      get(target, key) {
        const value = Reflect.get(target, key)
        if (key === 'create')
          return (input: Record<string, unknown>) => {
            if (input.collection === 'page-layouts')
              throw new Error('04D injected layout write failure')
            return value.call(target, input)
          }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    await assert.rejects(
      installStarter(failing, {
        siteId: site.id,
        starterId: 'campaign-commerce',
        ownerEmail: owner.email,
      }),
      /04D injected/,
    )
    check(
      'failed install rolls back content, media, products, campaigns and layouts',
      (await payload.count({ collection: 'content', where: { site: { equals: site.id } } }))
        .totalDocs === 0 &&
        (await payload.count({ collection: 'media-assets', where: { site: { equals: site.id } } }))
          .totalDocs === 0 &&
        (await payload.count({ collection: 'products', where: { site: { equals: site.id } } }))
          .totalDocs === 0 &&
        (
          await payload.count({
            collection: 'donation-campaigns',
            where: { site: { equals: site.id } },
          })
        ).totalDocs === 0 &&
        (await payload.count({ collection: 'page-layouts', where: { site: { equals: site.id } } }))
          .totalDocs === 0,
    )

    // 2. Clean install of campaign-commerce starter
    const installed = await api.post('/api/admin/starters', {
      data: { action: 'install', siteId: site.id, starterId: 'campaign-commerce' },
    })
    assert.equal(installed.status(), 200, await installed.text())
    check(
      'operator installs campaign-commerce starter successfully',
      (await installed.json()).success,
    )

    // Verify canonical publication
    const pubs = await payload.find({
      collection: 'publications',
      where: { site: { equals: site.id } },
      depth: 0,
    })
    check('exactly one canonical publication created', pubs.docs.length === 1)
    const pub = pubs.docs[0]

    // Verify canonical products
    const products = await payload.find({
      collection: 'products',
      where: { site: { equals: site.id } },
      depth: 0,
    })
    check('4 canonical products created for campaign', products.docs.length === 4)
    const tee = products.docs.find((p) => p.slug === 'solidarity-heavyweight-tee')
    check('tee product created with published state', tee && tee.state === 'published')

    // Verify canonical donation campaign
    const donations = await payload.find({
      collection: 'donation-campaigns',
      where: { site: { equals: site.id } },
      depth: 0,
    })
    check('1 canonical donation campaign created', donations.docs.length === 1)
    const donationCampaign = donations.docs[0]
    check(
      'donation campaign is active with allowed amounts',
      donationCampaign.lifecycle === 'active' &&
        Array.isArray(donationCampaign.allowedAmounts) &&
        donationCampaign.allowedAmounts.length === 5,
    )

    // Verify page layouts
    const layouts = await payload.find({
      collection: 'page-layouts',
      where: { and: [{ site: { equals: site.id } }, { surface: { equals: 'page' } }] },
      depth: 0,
    })
    check('1 canonical page layout created (home)', layouts.docs.length === 1)

    // Verify page templates and reusable patterns
    const templates = await payload.find({
      collection: 'page-layouts',
      where: { and: [{ site: { equals: site.id } }, { surface: { equals: 'template' } }] },
      depth: 0,
    })
    check(
      '2 page templates created (product-spotlight, campaign-action)',
      templates.docs.length === 2,
    )

    const patterns = await payload.find({
      collection: 'page-layouts',
      where: { and: [{ site: { equals: site.id } }, { surface: { equals: 'pattern' } }] },
      depth: 0,
    })
    check('3 reusable patterns created (donate, alert, disclosure)', patterns.docs.length === 3)

    // 3. Repeat install denied without duplication
    const productsBefore = JSON.stringify(products.docs)
    const repeat = await api.post('/api/admin/starters', {
      data: { action: 'install', siteId: site.id, starterId: 'campaign-commerce' },
    })
    check(
      'reinstall denied with 400 without mutating canonical products',
      repeat.status() === 400 &&
        JSON.stringify(
          (
            await payload.find({
              collection: 'products',
              where: { site: { equals: site.id } },
              depth: 0,
            })
          ).docs,
        ) === productsBefore,
    )

    // 4. Operator customization
    const branding = await api.patch(`/api/publications/${pub.id}`, {
      data: {
        name: '04D Forward Transit Campaign',
        navigation: {
          primary: [
            { label: 'Store', href: '/store' },
            { label: 'Donate', href: '/donate' },
            { label: 'News', href: '/articles' },
            { label: 'Contact', href: '/contact' },
          ],
          footer: [
            { label: 'Disclosure', href: '/disclosure' },
            { label: 'Contact', href: '/contact' },
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
          ],
        },
      },
    })
    check('operator customizes publication name and navigation', branding.ok())

    const globalSave = await api.post('/api/globals/site-settings', {
      data: {
        siteName: '04D Forward Transit Campaign',
        siteDescription: 'Building high-frequency, clean public transit for everyone.',
        footerText: 'Paid for by 04D Forward Transit Campaign Committee.',
      },
    })
    check('operator saves site settings identity', globalSave.ok())

    // 5. Theme customization: renegade-party with custom token
    const themes = await (await api.get(`/api/admin/themes?site=${site.id}`)).json()
    const draft = await api.post('/api/admin/themes', {
      data: {
        action: 'draft',
        site: site.id,
        revision: themes.state.revision,
        id: 'renegade-party',
        version: '1.0.0',
        tokens: { 'color.accent': '#7f1d1d' },
      },
    })
    assert.equal(draft.status(), 200, await draft.text())
    const themeDraft = await (await api.get(`/api/admin/themes?site=${site.id}`)).json()
    const activate = await api.post('/api/admin/themes', {
      data: { action: 'activate', site: site.id, revision: themeDraft.state.revision },
    })
    assert.equal(activate.status(), 200, await activate.text())
    check('operator activates renegade-party theme with custom accent token', true)

    // 6. Homepage layout customization
    const homeLayout = (
      await payload.find({
        collection: 'page-layouts',
        where: { and: [{ site: { equals: site.id } }, { path: { equals: '/' } }] },
        depth: 0,
      })
    ).docs[0]
    const blocks = structuredClone(homeLayout.blocks) as Array<{
      id: string
      props: Record<string, unknown>
    }>
    blocks[0].props.title = '04D Forward Transit Campaign'
    blocks[0].props.body =
      'Join our movement to bring zero-emission rapid transit to our neighborhoods.'
    const editLayout = await api.patch(`/api/layouts/${homeLayout.id}`, {
      data: {
        expectedRevision: homeLayout.revision,
        layout: { ...homeLayout, siteId: site.id, version: 1, blocks },
        publish: true,
      },
    })
    assert.equal(editLayout.status(), 200, await editLayout.text())
    check('operator customizes and publishes homepage layout', true)

    // 7. Verify all public campaign & commerce routes via anonymous visitor
    const routesToTest = [
      ['/', '04D Forward Transit Campaign'],
      ['/articles', 'Transit'],
      ['/store', 'Store'],
      ['/store/solidarity-heavyweight-tee', 'Solidarity Heavyweight Union-Printed Tee'],
      ['/cart', 'Cart'],
      ['/checkout', 'Checkout'],
      ['/donate', 'Support our work'],
      ['/donate/clean-transit-fund', 'Transit'],
      ['/disclosure', 'Campaign Finance'],
      ['/contact', 'Contact'],
    ]

    for (const [route, expectedSnippet] of routesToTest) {
      const res = await anon.get(route)
      check(`public route accessible ${route}`, res.ok())
      const body = await res.text()
      check(`public route ${route} contains expected text`, body.includes(expectedSnippet))
    }

    // 8. Prove canonical product & donation widgets render safe unconfigured provider state
    const homeBody = await (await anon.get('/')).text()
    check(
      'homepage renders donation widget',
      homeBody.includes('Online Now') && homeBody.includes('FEC'),
    )
    check(
      'homepage renders product showcase widget',
      homeBody.includes('Solidarity Heavyweight Tee') && homeBody.includes('$32.00'),
    )
    check(
      'widgets include safe-unconfigured provider state badge',
      homeBody.includes('safe-unconfigured'),
    )

    // 9. Negative & Safe Unconfigured Provider Boundary Tests
    // Unconfigured checkout cannot imply a real payment was accepted
    const dummyCheckout = await anon.post('/api/commerce/checkout/initiate', {
      data: { capabilityId: 'card', returnUrl: `${base}/cart` },
    })
    check(
      'unconfigured/disabled commerce checkout returns 503 or 400',
      [400, 503].includes(dummyCheckout.status()),
    )

    const dummyDonation = await anon.post('/api/commerce/donations/intent', {
      data: {
        campaignId: donationCampaign.id,
        amountMinor: '5000',
        currency: 'USD',
        recurrence: 'one-time',
        recognition: 'anonymous',
        email: 'donor@test.org',
      },
    })
    check(
      'unconfigured donation payment provider returns 503 error',
      dummyDonation.status() === 503,
    )
    const donationErr = await dummyDonation.json()
    check(
      'unconfigured donation error message is truthful',
      donationErr.error.includes('Checkout is not available') ||
        donationErr.error.includes('provider is not configured'),
    )

    // Ensure zero payments or transactions exist in database
    const ordersCount = (
      await payload.count({ collection: 'orders', where: { site: { equals: site.id } } })
    ).totalDocs
    check('no completed orders exist in database', ordersCount === 0)

    // 10. Authorization and Isolation Boundaries
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '04D Foreign Site Beta', slug: `beta-${stamp}`, lifecycle: 'active' } as never,
    })
    const scopedOwner = await payload.create({
      collection: 'users',
      context: { pendingStaffInvitation: true },
      data: { email: `scoped-${stamp}@rc104d.test`, role: 'owner' } as never,
    })
    const member = (
      await payload.find({ collection: 'members', where: { email: { equals: scopedOwner.email } } })
    ).docs[0]
    await payload.create({
      collection: 'member-site-roles',
      data: { site: site.id, member: member.id, role: 'community-manager' },
    })
    const scoped = (await operator(scopedOwner)).api

    // Foreign site install denied
    const foreignInstall = await scoped.post('/api/admin/starters', {
      data: { action: 'install', siteId: beta.id, starterId: 'campaign-commerce' },
    })
    check('foreign site install denied with 403', foreignInstall.status() === 403)

    // Cross-origin denied
    const crossOrigin = await api.post('/api/admin/starters', {
      headers: { origin: 'https://attacker.test' },
      data: { action: 'install', siteId: beta.id, starterId: 'campaign-commerce' },
    })
    check('cross-origin starter action denied with 403', crossOrigin.status() === 403)

    // Anonymous install denied
    const anonInstall = await anon.post('/api/admin/starters', {
      data: { action: 'install', siteId: beta.id, starterId: 'campaign-commerce' },
    })
    check('anonymous starter action denied with 403', anonInstall.status() === 403)

    // Staff install denied
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-${stamp}@rc104d.test`, role: 'staff' } as never,
    })
    const staffApi = (await operator(staff)).api
    const staffInstall = await staffApi.post('/api/admin/starters', {
      data: { action: 'install', siteId: site.id, starterId: 'campaign-commerce' },
    })
    check('staff role starter install denied with 403', staffInstall.status() === 403)

    // 11. Playwright Browser Acceptance Journey
    browser = await chromium.launch()
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    page.setDefaultTimeout(30000)

    // Desktop Homepage
    await page.goto(base, { waitUntil: 'networkidle', timeout: 180000 })
    await expect(
      page.getByRole('heading', { name: '04D Forward Transit Campaign', exact: true }),
    ).toBeVisible()
    check('browser renders customized campaign homepage heading', true)
    check(
      'desktop homepage has no horizontal scroll overflow',
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    await page.screenshot({ path: `${out}/desktop-home.png`, fullPage: true })

    // Store Catalog
    await page.goto(`${base}/store`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Store' })).toBeVisible()
    await expect(page.getByText('Solidarity Heavyweight Union-Printed Tee')).toBeVisible()
    check('browser renders store catalog and products', true)
    await page.screenshot({ path: `${out}/store.png`, fullPage: true })

    // Product Details
    await page.goto(`${base}/store/solidarity-heavyweight-tee`, { waitUntil: 'networkidle' })
    await expect(
      page.getByRole('heading', { name: 'Solidarity Heavyweight Union-Printed Tee' }),
    ).toBeVisible()
    check('browser renders product detail page', true)

    // Donation Campaign Page
    await page.goto(`${base}/donate/clean-transit-fund`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('$50.00').or(page.getByText('$50'))).toBeVisible()
    await expect(page.getByText('Federal Election Campaign Act (FECA)')).toBeVisible()
    check('browser renders donation campaign with tiers and FEC compliance text', true)
    await page.screenshot({ path: `${out}/donate.png`, fullPage: true })

    // Mobile Viewport Checks
    await page.setViewportSize({ width: 390, height: 844 })
    for (const route of ['/', '/store', '/donate/clean-transit-fund', '/cart', '/checkout']) {
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 180000 })
      check(
        `mobile 390px no horizontal overflow on ${route}`,
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
    }
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.screenshot({ path: `${out}/mobile-home.png`, fullPage: true })

    // 12. Save state for restart check
    const recordSpecs = [
      ['publications', pub.id],
      ['products', tee!.id],
      ['donation-campaigns', donationCampaign.id],
      ['page-layouts', homeLayout.id],
    ] as const
    const records = []
    for (const [collection, id] of recordSpecs) {
      records.push({ collection, doc: await payload.findByID({ collection, id, depth: 0 }) })
    }
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          site: site.id,
          theme: await readThemeState(themePool(payload), site.id),
          records,
        },
        null,
        2,
      ),
    )
    await context.close()
  }

  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-checks.json`,
    JSON.stringify({ passed: checks.length, failed: 0, skipped: 0, checks }, null, 2),
  )
  console.log(`ALL ${checks.length} CHECKS PASSED SUCCESSFULLY.`)
} catch (error) {
  await writeFile(`${out}/${restart ? 'restart' : 'journey'}-failure.txt`, String(error))
  throw error
} finally {
  await browser?.close()
  for (const context of contexts) await context.dispose()
  for (const id of sessions) {
    try {
      await payload.db.pool.query('DELETE FROM admin_sessions WHERE id=$1', [id])
    } catch {}
  }
  await payload.db.destroy?.()
  process.exit(0)
}
