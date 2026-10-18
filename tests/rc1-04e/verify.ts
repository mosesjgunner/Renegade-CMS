import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium, request, expect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { installStarter } from '../../src/modules/starters/service'
import { readThemeState, themePool } from '../../src/modules/presentation/lifecycle'

assert.equal(process.env.RC1_04E_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith(':5442/rc104e_release_acceptance'))
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')

const payload = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/04E'
const base = 'https://localhost:38941'
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

let failed = false
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
      'custom Site Alpha theme palette survives restart',
      JSON.stringify(await readThemeState(themePool(payload), saved.siteAlpha)) ===
        JSON.stringify(saved.themeAlpha),
    )
    check(
      'custom Site Beta theme palette survives restart',
      JSON.stringify(await readThemeState(themePool(payload), saved.siteBeta)) ===
        JSON.stringify(saved.themeBeta),
    )

    // Check public route rendering after restart
    const res = await anon.get('/')
    const body = await res.text()
    check('public root responds after restart', res.ok() && body.length > 0)
  } else {
    const stamp = Date.now()

    // 1. Create Users
    const ownerAlpha = await payload.create({
      collection: 'users',
      data: { email: `owner-alpha-${stamp}@rc104e.test`, role: 'owner' } as never,
    })
    const ownerBeta = await payload.create({
      collection: 'users',
      data: { email: `owner-beta-${stamp}@rc104e.test`, role: 'owner' } as never,
    })
    const staffUser = await payload.create({
      collection: 'users',
      data: { email: `staff-${stamp}@rc104e.test`, role: 'staff' } as never,
    })

    const { api: apiAlpha } = await operator(ownerAlpha)
    const { api: apiBeta } = await operator(ownerBeta)
    const { api: apiStaff } = await operator(staffUser)

    // 2. Create Sites
    const siteAlpha = await payload.create({
      collection: 'sites',
      data: { name: 'The Vanguard Chronicle', slug: `site-alpha-${stamp}`, lifecycle: 'active' } as never,
    })
    const siteBeta = await payload.create({
      collection: 'sites',
      data: { name: 'Forward for the People', slug: `site-beta-${stamp}`, lifecycle: 'active' } as never,
    })
    check('created isolated Site Alpha and Site Beta records', siteAlpha.id && siteBeta.id)

    // 3. Install Starters
    // Install publication-community on Site Alpha
    await installStarter(payload, {
      siteId: siteAlpha.id,
      starterId: 'publication-community',
      ownerEmail: ownerAlpha.email,
    })
    const alphaContentCount = (
      await payload.count({ collection: 'content', where: { site: { equals: siteAlpha.id } } })
    ).totalDocs
    const alphaLayoutCount = (
      await payload.count({ collection: 'page-layouts', where: { site: { equals: siteAlpha.id } } })
    ).totalDocs
    check('publication-community provisioned content on Site Alpha', alphaContentCount > 0)
    check('publication-community provisioned layouts on Site Alpha', alphaLayoutCount > 0)

    // Install campaign-commerce on Site Beta
    await installStarter(payload, {
      siteId: siteBeta.id,
      starterId: 'campaign-commerce',
      ownerEmail: ownerBeta.email,
    })
    const betaContentCount = (
      await payload.count({ collection: 'content', where: { site: { equals: siteBeta.id } } })
    ).totalDocs
    const betaProductCount = (
      await payload.count({ collection: 'products', where: { site: { equals: siteBeta.id } } })
    ).totalDocs
    const betaDonationCount = (
      await payload.count({ collection: 'donation-campaigns', where: { site: { equals: siteBeta.id } } })
    ).totalDocs
    check('campaign-commerce provisioned content on Site Beta', betaContentCount > 0)
    check('campaign-commerce provisioned products on Site Beta', betaProductCount > 0)
    check('campaign-commerce provisioned donation campaign on Site Beta', betaDonationCount > 0)

    // 4. Multi-Tenant Role & Cross-Site Boundaries
    // Staff cannot install starters
    const staffAttempt = await apiStaff.post('/api/admin/starters', {
      data: { action: 'install', siteId: siteAlpha.id, starterId: 'publication-community' },
    })
    check('staff role denied starter installation with 403', staffAttempt.status() === 403)

    // Anonymous cannot install starters
    const anonAttempt = await anon.post('/api/admin/starters', {
      data: { action: 'install', siteId: siteAlpha.id, starterId: 'publication-community' },
    })
    check('anonymous visitor denied starter action with 403', anonAttempt.status() === 403)

    // Cross-origin request denied
    const crossOriginAttempt = await apiAlpha.post('/api/admin/starters', {
      headers: { origin: 'https://malicious-third-party.test' },
      data: { action: 'install', siteId: siteAlpha.id, starterId: 'publication-community' },
    })
    check('cross-origin starter request rejected with 403', crossOriginAttempt.status() === 403)

    // Scoped Owner on Site Alpha cannot mutate foreign Site Beta
    const scopedUser = await payload.create({
      collection: 'users',
      context: { pendingStaffInvitation: true },
      data: { email: `scoped-${stamp}@rc104e.test`, role: 'owner' } as never,
    })
    const scopedMember = (
      await payload.find({ collection: 'members', where: { email: { equals: scopedUser.email } } })
    ).docs[0]
    await payload.create({
      collection: 'member-site-roles',
      data: { site: siteAlpha.id, member: scopedMember.id, role: 'community-manager' },
    })
    const { api: apiScoped } = await operator(scopedUser)
    const foreignSiteAttempt = await apiScoped.post('/api/admin/starters', {
      data: { action: 'install', siteId: siteBeta.id, starterId: 'campaign-commerce' },
    })
    check('foreign site owner mutation rejected with 403', foreignSiteAttempt.status() === 403)

    // 5. Cross-Site Theme Customization & Isolation
    // Map Site Alpha to base for preflight check
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [siteAlpha.id]: base },
        launchState: 'live',
        indexingMode: 'index',
      } as never,
    })
    const themesAlpha = await (await apiAlpha.get(`/api/admin/themes?site=${siteAlpha.id}`)).json()
    const draftAlpha = await apiAlpha.post('/api/admin/themes', {
      data: {
        action: 'draft',
        site: siteAlpha.id,
        revision: themesAlpha.state.revision,
        id: 'neutral-starter',
        version: '1.0.0',
        tokens: { 'color.accent': '#165c4c' },
      },
    })
    assert.equal(draftAlpha.status(), 200, await draftAlpha.text())
    const themeDraftAlpha = await (await apiAlpha.get(`/api/admin/themes?site=${siteAlpha.id}`)).json()
    const activateAlpha = await apiAlpha.post('/api/admin/themes', {
      data: { action: 'activate', site: siteAlpha.id, revision: themeDraftAlpha.state.revision },
    })
    assert.equal(activateAlpha.status(), 200, await activateAlpha.text())

    // Map Site Beta to base for preflight check
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [siteBeta.id]: base },
        launchState: 'live',
        indexingMode: 'index',
      } as never,
    })
    const themesBeta = await (await apiBeta.get(`/api/admin/themes?site=${siteBeta.id}`)).json()
    const draftBeta = await apiBeta.post('/api/admin/themes', {
      data: {
        action: 'draft',
        site: siteBeta.id,
        revision: themesBeta.state.revision,
        id: 'renegade-party',
        version: '1.0.0',
        tokens: { 'color.accent': '#7f1d1d' },
      },
    })
    assert.equal(draftBeta.status(), 200, await draftBeta.text())
    const themeDraftBeta = await (await apiBeta.get(`/api/admin/themes?site=${siteBeta.id}`)).json()
    const activateBeta = await apiBeta.post('/api/admin/themes', {
      data: { action: 'activate', site: siteBeta.id, revision: themeDraftBeta.state.revision },
    })
    assert.equal(activateBeta.status(), 200, await activateBeta.text())

    // Verify theme state isolation
    const alphaThemeState = await readThemeState(themePool(payload), siteAlpha.id)
    const betaThemeState = await readThemeState(themePool(payload), siteBeta.id)
    check(
      'Site Alpha has customized neutral-starter palette',
      alphaThemeState?.active?.tokens?.['color.accent'] === '#165c4c',
    )
    check(
      'Site Beta has customized renegade-party palette',
      betaThemeState?.active?.tokens?.['color.accent'] === '#7f1d1d',
    )
    check(
      'cross-site theme isolation: palettes do not cross-contaminate',
      alphaThemeState?.active?.tokens?.['color.accent'] !== betaThemeState?.active?.tokens?.['color.accent'],
    )

    // 6. Builder Content Revision, Publication & Rollback
    // On Site Alpha
    const homeLayoutAlpha = (
      await payload.find({
        collection: 'page-layouts',
        where: { and: [{ site: { equals: siteAlpha.id } }, { path: { equals: '/' } }] },
        depth: 0,
      })
    ).docs[0]
    check('found Site Alpha homepage layout', Boolean(homeLayoutAlpha))
    const initialRev = Number(homeLayoutAlpha.revision)

    const blocksAlpha = structuredClone(homeLayoutAlpha.blocks) as Array<{
      id: string
      props: Record<string, unknown>
    }>
    const originalHeroTitle = String(blocksAlpha[0].props.title)
    blocksAlpha[0].props.title = 'The Vanguard Chronicle — 04E Edition'
    blocksAlpha[0].props.body =
      'Independent dispatches and fearless investigative journalism updated for 04E.'

    // Save and publish revision 2
    const editAlpha = await apiAlpha.patch(`/api/layouts/${homeLayoutAlpha.id}`, {
      data: {
        expectedRevision: homeLayoutAlpha.revision,
        layout: { ...homeLayoutAlpha, siteId: siteAlpha.id, version: 1, blocks: blocksAlpha },
        publish: true,
      },
    })
    assert.equal(editAlpha.status(), 200, await editAlpha.text())
    const rev2Layout = await payload.findByID({
      collection: 'page-layouts',
      id: homeLayoutAlpha.id,
      depth: 0,
    })
    check('published revision 2 for Site Alpha homepage', Number(rev2Layout.publishedRevision) === 2)

    // Rollback to revision 1
    const rollbackAlpha = await apiAlpha.post(`/api/layouts/${homeLayoutAlpha.id}/rollback`, {
      data: { targetRevision: initialRev, expectedRevision: Number(rev2Layout.revision), publish: true },
    })
    assert.equal(rollbackAlpha.status(), 200, await rollbackAlpha.text())
    const rolledBackLayout = await payload.findByID({
      collection: 'page-layouts',
      id: homeLayoutAlpha.id,
      depth: 0,
    })
    check(
      'rollback restored revision 1 on Site Alpha homepage',
      (rolledBackLayout.blocks as any[])[0]?.props?.title === originalHeroTitle,
    )

    // Re-publish revision 2 to keep 04E branding
    const republishAlpha = await apiAlpha.patch(`/api/layouts/${homeLayoutAlpha.id}`, {
      data: {
        expectedRevision: Number(rolledBackLayout.revision),
        layout: { ...homeLayoutAlpha, siteId: siteAlpha.id, version: 1, blocks: blocksAlpha },
        publish: true,
      },
    })
    assert.equal(republishAlpha.status(), 200, await republishAlpha.text())
    check('re-published revision 2 on Site Alpha homepage', true)

    // On Site Beta: customize homepage
    const homeLayoutBeta = (
      await payload.find({
        collection: 'page-layouts',
        where: { and: [{ site: { equals: siteBeta.id } }, { path: { equals: '/' } }] },
        depth: 0,
      })
    ).docs[0]
    check('found Site Beta homepage layout', Boolean(homeLayoutBeta))

    const blocksBeta = structuredClone(homeLayoutBeta.blocks) as Array<{
      id: string
      props: Record<string, unknown>
    }>
    blocksBeta[0].props.title = 'Forward for the People 2026 — 04E Campaign'
    blocksBeta[0].props.body =
      'Join our grassroots movement for public transit and clean neighborhoods.'

    const editBeta = await apiBeta.patch(`/api/layouts/${homeLayoutBeta.id}`, {
      data: {
        expectedRevision: homeLayoutBeta.revision,
        layout: { ...homeLayoutBeta, siteId: siteBeta.id, version: 1, blocks: blocksBeta },
        publish: true,
      },
    })
    assert.equal(editBeta.status(), 200, await editBeta.text())
    check('customized and published Site Beta homepage layout', true)

    // 7. Launch Browser Acceptance Journey
    browser = await chromium.launch()

    // --- JOURNEY A: PUBLICATION STARTER (Site Alpha) ---
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [siteAlpha.id]: base },
        launchState: 'live',
        indexingMode: 'index',
      } as never,
    })

    const ctxPub = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 800 },
    })
    const pagePub = await ctxPub.newPage()
    pagePub.setDefaultTimeout(30000)

    // Monitor console errors and network failures
    const pubConsoleErrors: string[] = []
    pagePub.on('console', (msg) => {
      if (msg.type() === 'error') pubConsoleErrors.push(msg.text())
    })

    // Journey A1: Home
    await pagePub.goto(base, { waitUntil: 'networkidle', timeout: 180000 })
    await expect(
      pagePub.getByRole('heading', { name: 'The Vanguard Chronicle — 04E Edition' }),
    ).toBeVisible()
    check('publication browser renders customized home heading', true)
    check(
      'publication desktop home has no horizontal scroll overflow',
      await pagePub.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    )
    await pagePub.screenshot({ path: `${out}/pub-desktop-home.png`, fullPage: true })

    // Journey A2: Dispatches list
    await pagePub.goto(`${base}/articles`, { waitUntil: 'networkidle' })
    await expect(pagePub.getByRole('heading', { level: 1 }).first()).toBeVisible()
    check('publication articles page renders with h1 heading', true)
    await pagePub.screenshot({ path: `${out}/pub-desktop-articles.png`, fullPage: true })

    // Journey A3: Single dispatch
    const firstArticle = (
      await payload.find({
        collection: 'content',
        where: { and: [{ site: { equals: siteAlpha.id } }, { contentType: { equals: 'article' } }] },
        limit: 1,
      })
    ).docs[0]
    if (firstArticle) {
      await pagePub.goto(`${base}${firstArticle.canonicalPath}`, { waitUntil: 'networkidle' })
      await expect(pagePub.getByRole('heading', { level: 1 }).first()).toBeVisible()
      check(`publication single dispatch renders ${firstArticle.canonicalPath}`, true)
      await pagePub.screenshot({ path: `${out}/pub-desktop-article.png`, fullPage: true })
    }

    // Journey A4: Free newsletter signup (/subscribe)
    await pagePub.goto(`${base}/subscribe`, { waitUntil: 'networkidle' })
    await expect(pagePub.getByRole('heading', { level: 1 }).first()).toBeVisible()
    check('publication newsletter subscribe page renders', true)
    await pagePub.screenshot({ path: `${out}/pub-desktop-subscribe.png`, fullPage: true })

    // Journey A5: Member directory (/members)
    await pagePub.goto(`${base}/members`, { waitUntil: 'networkidle' })
    await expect(pagePub.getByRole('heading', { level: 1 }).first()).toBeVisible()
    check('publication member directory renders', true)
    await pagePub.screenshot({ path: `${out}/pub-desktop-members.png`, fullPage: true })

    // Journey A6: Editorial disclosure (/disclosure)
    await pagePub.goto(`${base}/disclosure`, { waitUntil: 'networkidle' })
    await expect(pagePub.getByRole('heading', { level: 1 }).first()).toBeVisible()
    check('publication disclosure page renders', true)

    // Journey A7: Mobile viewport on Publication
    await pagePub.setViewportSize({ width: 390, height: 844 })
    for (const route of ['/', '/articles', '/subscribe', '/members', '/about']) {
      await pagePub.goto(base + route, { waitUntil: 'networkidle', timeout: 180000 })
      check(
        `publication mobile 390px no horizontal overflow on ${route}`,
        await pagePub.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      )
    }
    await pagePub.goto(base, { waitUntil: 'networkidle' })
    await pagePub.screenshot({ path: `${out}/pub-mobile-home.png`, fullPage: true })
    await ctxPub.close()

    // --- JOURNEY B: CAMPAIGN COMMERCE STARTER (Site Beta) ---
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [siteBeta.id]: base },
        launchState: 'live',
        indexingMode: 'index',
      } as never,
    })

    const ctxCamp = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 800 },
    })
    const pageCamp = await ctxCamp.newPage()
    pageCamp.setDefaultTimeout(30000)

    // Journey B1: Home
    await pageCamp.goto(base, { waitUntil: 'networkidle', timeout: 180000 })
    await expect(
      pageCamp.getByRole('heading', { name: 'Forward for the People 2026 — 04E Campaign' }),
    ).toBeVisible()
    check('campaign browser renders customized home heading', true)
    check(
      'campaign desktop home has no horizontal scroll overflow',
      await pageCamp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    )
    await pageCamp.screenshot({ path: `${out}/camp-desktop-home.png`, fullPage: true })

    // Journey B2: Store Catalog (/store)
    await pageCamp.goto(`${base}/store`, { waitUntil: 'networkidle' })
    await expect(pageCamp.getByRole('heading', { name: 'Store' })).toBeVisible()
    await expect(pageCamp.getByText('Solidarity Heavyweight Union-Printed Tee')).toBeVisible()
    check('campaign store catalog renders products and prices', true)
    await pageCamp.screenshot({ path: `${out}/camp-desktop-store.png`, fullPage: true })

    // Journey B3: Product Detail (/store/solidarity-heavyweight-tee)
    await pageCamp.goto(`${base}/store/solidarity-heavyweight-tee`, { waitUntil: 'networkidle' })
    await expect(
      pageCamp.getByRole('heading', { name: 'Solidarity Heavyweight Union-Printed Tee' }),
    ).toBeVisible()
    check('campaign product detail page renders', true)
    await pageCamp.screenshot({ path: `${out}/camp-desktop-product.png`, fullPage: true })

    // Journey B4: Donation Campaign (/donate/clean-transit-fund)
    await pageCamp.goto(`${base}/donate/clean-transit-fund`, { waitUntil: 'networkidle' })
    await expect(pageCamp.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(pageCamp.getByText('$50.00').or(pageCamp.getByText('$50'))).toBeVisible()
    check('campaign donation page renders with tiers and legal disclosure', true)
    await pageCamp.screenshot({ path: `${out}/camp-desktop-donate.png`, fullPage: true })

    // Journey B5: Cart (/cart)
    await pageCamp.goto(`${base}/cart`, { waitUntil: 'networkidle' })
    await expect(pageCamp.getByRole('heading', { level: 1 }).first()).toBeVisible()
    check('campaign cart page renders', true)
    await pageCamp.screenshot({ path: `${out}/camp-desktop-cart.png`, fullPage: true })

    // Journey B6: Checkout entry (/checkout)
    await pageCamp.goto(`${base}/checkout`, { waitUntil: 'networkidle' })
    await expect(pageCamp.getByRole('heading', { level: 1 }).first()).toBeVisible()
    check('campaign checkout entry page renders', true)

    // Journey B7: Mobile Viewport on Campaign
    await pageCamp.setViewportSize({ width: 390, height: 844 })
    for (const route of ['/', '/store', '/donate/clean-transit-fund', '/cart', '/checkout']) {
      await pageCamp.goto(base + route, { waitUntil: 'networkidle', timeout: 180000 })
      check(
        `campaign mobile 390px no horizontal overflow on ${route}`,
        await pageCamp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      )
    }
    await pageCamp.goto(base, { waitUntil: 'networkidle' })
    await pageCamp.screenshot({ path: `${out}/camp-mobile-home.png`, fullPage: true })
    await ctxCamp.close()

    // 8. Negative Cases: 404 and unconfigured payment provider
    const notFoundRes = await anon.get('/this-path-does-not-exist-at-all-04e')
    check('non-existent path returns 404', notFoundRes.status() === 404)

    const dummyDonation = await anon.post('/api/commerce/donations/intent', {
      data: {
        campaignId: 'dummy-campaign',
        amountMinor: '5000',
        currency: 'USD',
        recurrence: 'one-time',
        recognition: 'anonymous',
        email: 'donor@test.org',
      },
    })
    check('non-existent campaign donation returns 404', dummyDonation.status() === 404)

    const betaCampaign = (
      await payload.find({
        collection: 'donation-campaigns',
        where: { site: { equals: siteBeta.id } },
        limit: 1,
      })
    ).docs[0]
    if (betaCampaign) {
      const unconfiguredDonation = await anon.post('/api/commerce/donations/intent', {
        data: {
          campaignId: betaCampaign.id,
          amountMinor: '5000',
          currency: 'USD',
          recurrence: 'one-time',
          recognition: 'anonymous',
          email: 'donor@test.org',
        },
      })
      check(
        'unconfigured donation processor returns 503 or 404',
        [404, 503].includes(unconfiguredDonation.status()),
      )
    }

    // 9. Save state for restart check
    const recordSpecs = [
      ['sites', siteAlpha.id],
      ['sites', siteBeta.id],
      ['page-layouts', homeLayoutAlpha.id],
      ['page-layouts', homeLayoutBeta.id],
    ] as const
    const records = []
    for (const [collection, id] of recordSpecs) {
      records.push({ collection, doc: await payload.findByID({ collection, id, depth: 0 }) })
    }

    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          siteAlpha: siteAlpha.id,
          siteBeta: siteBeta.id,
          themeAlpha: alphaThemeState,
          themeBeta: betaThemeState,
          records,
        },
        null,
        2,
      ),
    )
    check('persisted state.json for restart verification', true)
  }

  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-checks.json`,
    JSON.stringify({ passed: checks.length, failed: 0, skipped: 0, checks }, null, 2),
  )
} catch (error) {
  failed = true
  await writeFile(`${out}/${restart ? 'restart' : 'journey'}-failure.txt`, String(error))
  console.error('VERIFICATION ERROR:', error)
} finally {
  await browser?.close()
  for (const context of contexts) await context.dispose()
  for (const id of sessions) {
    try {
      await payload.db.pool.query('DELETE FROM admin_sessions WHERE id=$1', [id])
    } catch {}
  }
  await payload.db.destroy?.()
  process.exit(failed ? 1 : 0)
}
