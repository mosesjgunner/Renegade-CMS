import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { chromium, request, expect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { installStarter } from '../../src/modules/starters/service'
import { readThemeState, themePool } from '../../src/modules/presentation/lifecycle'
import { localMailSinkReceipts } from '../../src/modules/email/delivery'

assert.equal(process.env.RC1_04C_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith(':5440/rc104c_release_acceptance'))
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const payload = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/04C'
const base = 'https://localhost:38921'
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
      'exact site identity and homepage selection survive restart',
      JSON.stringify(await payload.findGlobal({ slug: 'site-settings', depth: 0 })) ===
        JSON.stringify(saved.settings),
    )
    const original = await anon.get(`/media/${saved.hero.id}`)
    check(
      'starter original bytes survive restart',
      original.ok() &&
        createHash('sha256')
          .update(await original.body())
          .digest('hex') === saved.hero.sha256,
    )
    check(
      'palette survives restart',
      JSON.stringify(await readThemeState(themePool(payload), saved.site)) ===
        JSON.stringify(saved.theme),
    )
    for (const [route, text] of [
      ['/', '04C Civic Journal'],
      [saved.path, '04C report persisted body'],
      ['/privacy', 'Information We Collect'],
      ['/contact', 'verified contact details'],
    ]) {
      const res = await anon.get(route)
      check(`public output after restart ${route}`, res.ok() && (await res.text()).includes(text))
    }
  } else {
    const stamp = Date.now()
    const site = await payload.create({
      collection: 'sites',
      data: { name: '04C Clean Site', slug: `rc104c-${stamp}`, lifecycle: 'active' } as never,
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@rc104c.test`, role: 'owner' } as never,
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
    const create = async (collection: string, data: unknown) => {
      const res = await api.post(`/api/${collection}`, { data })
      assert.equal(res.status(), 201, await res.text())
      return (await res.json()).doc
    }
    // A real transaction abort after canonical content writes must leave no partial starter.
    const failing = new Proxy(payload, {
      get(target, key) {
        const value = Reflect.get(target, key)
        if (key === 'create')
          return (input: Record<string, unknown>) => {
            if (input.collection === 'page-layouts')
              throw new Error('04C injected layout write failure')
            return value.call(target, input)
          }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    await assert.rejects(
      installStarter(failing, {
        siteId: site.id,
        starterId: 'publication-community',
        ownerEmail: owner.email,
      }),
      /04C injected/,
    )
    check(
      'failed install rolls back content, media and layouts',
      (await payload.count({ collection: 'content', where: { site: { equals: site.id } } }))
        .totalDocs === 0 &&
        (await payload.count({ collection: 'media-assets', where: { site: { equals: site.id } } }))
          .totalDocs === 0 &&
        (await payload.count({ collection: 'page-layouts', where: { site: { equals: site.id } } }))
          .totalDocs === 0,
    )
    const rolledBackFiles = await readdir(`${process.env.MEDIA_DIR}/starters/${site.id}`, {
      recursive: true,
      withFileTypes: true,
    }).catch(() => [])
    check(
      'failed installation removes newly copied original bytes',
      rolledBackFiles.every((file) => !file.isFile()),
    )
    check(
      'failed installation rolls back indexing outbox',
      (
        await payload.count({
          collection: 'execution-events',
          where: { site: { equals: site.id } },
        })
      ).totalDocs === 0,
    )
    const selection = await api.get(`/api/admin/starters?site=${site.id}`)
    check(
      'clean site can select publication starter',
      selection.ok() && !(await selection.json()).status.installed,
    )
    const installed = await api.post('/api/admin/starters', {
      data: { action: 'install', siteId: site.id, starterId: 'publication-community' },
    })
    assert.equal(installed.status(), 200, await installed.text())
    check('operator installs starter successfully after failure', (await installed.json()).success)
    const pubs = await payload.find({
      collection: 'publications',
      where: { site: { equals: site.id } },
      depth: 0,
    })
    check(
      'installer reuses exactly one canonical publication and persists footer legal links',
      pubs.docs.length === 1 && JSON.stringify(pubs.docs[0].navigation).includes('/privacy'),
    )
    const pub = pubs.docs[0]
    const assets = await payload.find({
      collection: 'media-assets',
      where: { site: { equals: site.id } },
      depth: 0,
    })
    for (const asset of assets.docs) {
      check(
        `sample asset rights ${asset.originalFilename}`,
        asset.licenseType === 'licensed' && asset.license?.includes('AGPL-3.0'),
      )
    }
    const contentBefore = JSON.stringify(
      (await payload.find({ collection: 'content', limit: 100, depth: 0 })).docs,
    )
    const repeat = await api.post('/api/admin/starters', {
      data: { action: 'install', siteId: site.id, starterId: 'publication-community' },
    })
    check(
      'reinstall denied without overwriting canonical content',
      repeat.status() === 400 &&
        JSON.stringify(
          (await payload.find({ collection: 'content', limit: 100, depth: 0 })).docs,
        ) === contentBefore,
    )
    const branding = await api.patch(`/api/publications/${pub.id}`, {
      data: {
        name: '04C Civic Journal',
        navigation: {
          primary: [
            { label: 'Reports', href: '/articles' },
            { label: 'Community', href: '/members' },
            { label: 'Newsletter', href: '/subscribe' },
            { label: 'Search', href: '/search' },
          ],
          footer: [
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
        siteName: '04C Civic Journal',
        logo: assets.docs.find((asset) => asset.originalFilename === 'publication-commons.svg')!.id,
        siteDescription: 'Local reporting, public knowledge',
        footerText: '04C independent sample publication',
      },
    })
    check('operator saves identity without editing code', globalSave.ok())
    const themes = await (await api.get(`/api/admin/themes?site=${site.id}`)).json()
    const draft = await api.post('/api/admin/themes', {
      data: {
        action: 'draft',
        site: site.id,
        revision: themes.state.revision,
        id: 'neutral-starter',
        version: '1.0.0',
        tokens: { 'color.accent': '#165c4c' },
      },
    })
    assert.equal(draft.status(), 200, await draft.text())
    const themeDraft = await (await api.get(`/api/admin/themes?site=${site.id}`)).json()
    const activate = await api.post('/api/admin/themes', {
      data: { action: 'activate', site: site.id, revision: themeDraft.state.revision },
    })
    assert.equal(activate.status(), 200, await activate.text())
    check('operator activates custom palette with public render preflight', true)
    const home = (
      await payload.find({
        collection: 'page-layouts',
        where: { and: [{ site: { equals: site.id } }, { path: { equals: '/' } }] },
        depth: 0,
      })
    ).docs[0]
    const blocks = structuredClone(home.blocks) as Array<{
      id: string
      props: Record<string, unknown>
    }>
    blocks[0].props.title = '04C Civic Journal'
    blocks[0].props.body = 'Independent reporting from your neighborhood.'
    const edit = await api.patch(`/api/layouts/${home.id}`, {
      data: {
        expectedRevision: home.revision,
        layout: { ...home, siteId: site.id, version: 1, blocks },
        publish: true,
      },
    })
    assert.equal(edit.status(), 200, await edit.text())
    check('operator customizes and publishes homepage', true)
    const article = await create('content', {
      site: site.id,
      publication: pub.id,
      title: '04C Neighbors restore the commons',
      slug: `04c-neighbors-${stamp}`,
      contentType: 'article',
      status: 'draft',
      visibility: 'public',
      summary: 'A local report from our new publication',
      body: {
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: 'ltr',
          children: [
            {
              type: 'paragraph',
              version: 1,
              format: '',
              indent: 0,
              direction: 'ltr',
              children: [
                {
                  type: 'text',
                  version: 1,
                  text: '04C report persisted body',
                  format: 0,
                  detail: 0,
                  mode: 'normal',
                  style: '',
                },
              ],
            },
          ],
        },
      },
    })
    const articlePath = article.canonicalPath
    check('draft article not public', (await anon.get(articlePath)).status() === 404)
    const publish = await api.patch(`/api/content/${article.id}`, { data: { status: 'published' } })
    check('ordinary content publish succeeds', publish.ok())
    const publicArticle = await anon.get(articlePath)
    check(
      'published article has persisted body in public output',
      publicArticle.ok() && (await publicArticle.text()).includes('04C report persisted body'),
    )
    for (const route of [
      '/',
      '/articles',
      '/search?q=Neighbors',
      '/subscribe',
      '/members',
      '/contact',
      '/privacy',
      '/terms',
      '/about',
      '/disclosure',
    ]) {
      const res = await anon.get(route)
      check(`visitor route ${route}`, res.ok())
    }
    check(
      'full legal body is public',
      (await (await anon.get('/privacy')).text()).includes('Information We Collect'),
    )
    check(
      'contact surface truthful about configuration',
      (await (await anon.get('/contact')).text()).includes('verified contact details'),
    )
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '04C Beta', slug: `beta-${stamp}`, lifecycle: 'active' } as never,
    })
    const scopedOwner = await payload.create({
      collection: 'users',
      context: { pendingStaffInvitation: true },
      data: { email: `scoped-${stamp}@rc104c.test`, role: 'owner' } as never,
    })
    const member = (
      await payload.find({ collection: 'members', where: { email: { equals: scopedOwner.email } } })
    ).docs[0]
    await payload.create({
      collection: 'member-site-roles',
      data: { site: site.id, member: member.id, role: 'community-manager' },
    })
    const scoped = (await operator(scopedOwner)).api
    const settingsBefore = JSON.stringify(
      await payload.findGlobal({ slug: 'site-settings', depth: 0 }),
    )
    for (const action of ['install', 'upgrade', 'rollback', 'preview']) {
      const res = await scoped.post('/api/admin/starters', {
        data: {
          action,
          siteId: beta.id,
          starterId: 'publication-community',
          path: '/',
          targetRevision: 1,
        },
      })
      check(`foreign site ${action} denied`, res.status() === 403)
    }
    check(
      'foreign discovery denied',
      (await scoped.get(`/api/admin/starters?site=${beta.id}`)).status() === 403,
    )
    check(
      'foreign site and global settings remain unchanged',
      (await payload.count({ collection: 'content', where: { site: { equals: beta.id } } }))
        .totalDocs === 0 &&
        JSON.stringify(await payload.findGlobal({ slug: 'site-settings', depth: 0 })) ===
          settingsBefore,
    )
    await payload.updateGlobal({
      slug: 'site-settings',
      data: {
        canonicalOriginsBySite: { [site.id]: base, [beta.id]: 'http://beta.rc104c.test:38920' },
      } as never,
    })
    const betaHome = await anon.get('http://127.0.0.1:38920/', {
      headers: { host: 'beta.rc104c.test:38920' },
    })
    check(
      'foreign public host cannot render selected starter homepage',
      betaHome.ok() &&
        !(await betaHome.text()).includes('Independent reporting from your neighborhood.'),
    )
    check(
      'cross-origin install denied',
      (
        await api.post('/api/admin/starters', {
          headers: { origin: 'https://evil.test' },
          data: { action: 'install', siteId: beta.id, starterId: 'publication-community' },
        })
      ).status() === 403,
    )
    check(
      'anonymous install denied',
      (
        await anon.post('/api/admin/starters', {
          data: { action: 'install', siteId: beta.id, starterId: 'publication-community' },
        })
      ).status() === 403,
    )
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-${stamp}@rc104c.test`, role: 'staff' } as never,
    })
    check(
      'staff cannot install starter',
      (
        await (
          await operator(staff)
        ).api.post('/api/admin/starters', {
          data: { action: 'install', siteId: site.id, starterId: 'publication-community' },
        })
      ).status() === 403,
    )
    browser = await chromium.launch()
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    const browserErrors: string[] = []
    page.on('pageerror', (error) => browserErrors.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') console.log('BROWSER ERROR:', message.text())
    })
    page.setDefaultTimeout(30000)
    await page.goto(base, { waitUntil: 'networkidle', timeout: 180000 })
    await expect(
      page.getByRole('heading', { name: '04C Civic Journal', exact: true }),
    ).toBeVisible()
    check('desktop visitor sees customized homepage', true)
    check(
      'desktop no horizontal overflow',
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    await page.getByRole('button', { name: 'Reject non-essential', exact: true }).click()
    await page.screenshot({ path: `${out}/desktop-home.png`, fullPage: true })
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.keyboard.press('Tab')
    check(
      'keyboard reaches skip link',
      await page.evaluate(() => document.activeElement?.textContent?.includes('Skip')),
    )
    await page.keyboard.press('Enter')
    check(
      'keyboard skip link moves focus to content',
      await page.evaluate(() => document.activeElement?.id === 'publication-main'),
    )
    await page.getByRole('link', { name: 'Join the newsletter', exact: true }).click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Subscribe to Newsletter' })).toBeVisible()
    // Actual UI request failure then retry, without changing persisted business rows.
    let releaseError!: () => void
    const errorGate = new Promise<void>((resolve) => {
      releaseError = resolve
    })
    await page.route('**/api/subscribers/subscribe', async (route) => {
      await errorGate
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Subscription temporarily unavailable. Please retry.' }),
      })
    })
    const email = `reader-${stamp}@rc104c.test`
    await page.getByRole('textbox', { name: 'Email Address' }).fill(email)
    await page.getByRole('checkbox', { name: 'Consent to receive emails' }).check()
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Subscribing...', exact: true })).toBeDisabled()
    check('signup pending state prevents duplicate submission', true)
    releaseError()
    await expect(
      page.getByRole('status').filter({ hasText: 'temporarily unavailable' }),
    ).toBeVisible()
    check(
      'signup UI shows request error and permits retry',
      await page.getByRole('button', { name: 'Subscribe', exact: true }).isEnabled(),
    )
    await page.unroute('**/api/subscribers/subscribe')
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Check your inbox' })).toBeVisible()
    const subscriber = (
      await payload.find({
        collection: 'subscribers',
        where: { email: { equals: email } },
        depth: 0,
      })
    ).docs[0]
    check('browser signup persists pending subscriber', subscriber?.status === 'pending')
    const deliveriesBefore = (await payload.count({ collection: 'email-deliveries' })).totalDocs
    const replay = await anon.post('/api/subscribers/subscribe', { data: { email } })
    check(
      'signup retry creates no duplicate email delivery',
      replay.status() === 202 &&
        (await payload.count({ collection: 'email-deliveries' })).totalDocs === deliveriesBefore,
    )
    await payload.jobs.run({ queue: 'operations', limit: 25 })
    const receipt = localMailSinkReceipts().find((row) => row.to === email)
    assert.ok(receipt, 'worker delivered confirmation into isolated local capture adapter')
    check(
      'real worker captures rendered confirmation in local adapter',
      receipt.links.some((link) => link.includes('/subscribe/confirm')),
    )
    const confirmLink = receipt.links.find((link) => link.includes('/subscribe/confirm'))!
    await page.goto(confirmLink, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Your subscription is confirmed' }),
    ).toBeVisible()
    check(
      'browser confirmation persists active subscriber',
      (await payload.findByID({ collection: 'subscribers', id: subscriber.id })).status ===
        'active',
    )
    check(
      'invalid confirmation rejected',
      (await anon.post('/api/subscribers/confirm', { data: { token: 'invalid-04c' } })).status() >=
        400,
    )
    check(
      'foreign host/site signup rejected',
      (
        await anon.post('/api/subscribers/subscribe', {
          data: { email: `foreign-${stamp}@rc104c.test`, siteId: beta.id },
        })
      ).status() >= 400,
    )
    const tokenText = JSON.stringify(
      await payload.find({ collection: 'subscriber-confirmation-tokens', depth: 0 }),
    )
    check('confirmation token consumed', tokenText.includes('usedAt'))
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const route of [
        '/',
        articlePath,
        '/articles',
        '/search?q=not-found-04c',
        '/members',
        '/subscribe',
        '/contact',
        '/privacy',
        '/terms',
      ]) {
        await page.goto(base + route, { waitUntil: 'networkidle', timeout: 180000 })
        if (route === articlePath)
          await page.screenshot({
            path: `${out}/${width === 390 ? 'mobile' : 'desktop'}-article.png`,
            fullPage: true,
          })
        check(
          `${width}px route has visible main and no overflow ${route}`,
          (await page.locator('main').first().isVisible()) &&
            (await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)),
        )
      }
      await page.goto(base, { waitUntil: 'networkidle' })
      check(
        `${width}px artwork loads and has alternative text`,
        await page.locator('main img').evaluateAll(
          (images) =>
            images.length > 0 &&
            images.every((image) => {
              const img = image as HTMLImageElement
              return img.complete && img.naturalWidth > 0 && Boolean(img.alt)
            }),
        ),
      )
      if (width === 390) {
        await page.locator('summary[aria-controls="mobile-navigation"]').focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
        check('mobile menu opens with keyboard', true)
        await page.locator('summary[aria-controls="mobile-navigation"]').click()
      }
      await page.screenshot({
        path: `${out}/${width === 390 ? 'mobile' : 'desktop'}-home.png`,
        fullPage: true,
      })
    }
    await page.goto(base + '/search?q=not-found-04c', { waitUntil: 'networkidle' })
    check(
      'search empty state visible',
      (await page.locator('main').innerText()).match(/no .*found|no results|nothing|0 results/i),
    )
    await page.goto(base + '/members', { waitUntil: 'networkidle' })
    await page.getByRole('textbox', { name: 'Search members' }).fill('unlisted-04c')
    await page.locator('main').getByRole('button', { name: 'Search', exact: true }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'No listed members found' }),
    ).toBeVisible()
    check('member directory empty state uses actual public API', true)
    // Prove starter revision rollback uses the actual endpoint and keeps canonical article intact.
    const beforeUpgrade = JSON.stringify(
      (await payload.findByID({ collection: 'page-layouts', id: home.id, depth: 0 })).blocks,
    )
    const upgrade = await api.post('/api/admin/starters', {
      data: { action: 'upgrade', siteId: site.id, starterId: 'publication-community' },
    })
    check(
      'starter templates upgrade through canonical references without changing homepage',
      upgrade.ok() &&
        JSON.stringify(
          (await payload.findByID({ collection: 'page-layouts', id: home.id, depth: 0 })).blocks,
        ) === beforeUpgrade,
    )
    const currentHome = await payload.findByID({
      collection: 'page-layouts',
      id: home.id,
      depth: 0,
    })
    const rollback = await api.post('/api/admin/starters', {
      data: { action: 'rollback', siteId: site.id, path: '/', targetRevision: 1 },
    })
    assert.equal(rollback.status(), 200, await rollback.text())
    check(
      'starter layout rollback restores initial hero',
      JSON.stringify(
        (await payload.findByID({ collection: 'page-layouts', id: home.id })).blocks,
      ).includes('The Vanguard Chronicle'),
    )
    const restore = await api.patch(`/api/layouts/${home.id}`, {
      data: {
        expectedRevision: Number(currentHome.revision) + 1,
        layout: { ...currentHome, siteId: site.id, version: 1, blocks },
        publish: true,
      },
    })
    assert.equal(restore.status(), 200, await restore.text())
    check(
      'customization reapplied after rollback without article loss',
      (await payload.findByID({ collection: 'content', id: article.id })).status === 'published',
    )
    const membership = (
      await payload.find({
        collection: 'audience-memberships',
        where: { subscriber: { equals: subscriber.id } },
        depth: 0,
      })
    ).docs[0]
    check('confirmed subscription has active audience membership', membership.status === 'active')
    const recordSpecs = [
      ['publications', pub.id],
      ['content', article.id],
      ['page-layouts', home.id],
      ['subscribers', subscriber.id],
      ['audience-memberships', membership.id],
    ] as const
    const records = []
    for (const [collection, id] of recordSpecs)
      records.push({ collection, doc: await payload.findByID({ collection, id, depth: 0 }) })
    const hero = assets.docs.find((asset) => asset.originalFilename === 'publication-hero.svg')!
    const original = await anon.get(`/media/${hero.id}`)
    const heroHash = createHash('sha256')
      .update(await original.body())
      .digest('hex')
    check(
      'canonical starter image matches approved repository bytes',
      original.ok() &&
        heroHash ===
          createHash('sha256')
            .update(await readFile('public/starter-assets/publication-hero.svg'))
            .digest('hex'),
    )
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          site: site.id,
          path: articlePath,
          hero: { id: hero.id, sha256: heroHash },
          settings: await payload.findGlobal({ slug: 'site-settings', depth: 0 }),
          theme: await readThemeState(themePool(payload), site.id),
          records,
        },
        null,
        2,
      ),
    )
    check('visitor pages have no uncaught JavaScript errors', browserErrors.length === 0)
    await context.close()
  }
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-checks.json`,
    JSON.stringify({ passed: checks.length, failed: 0, skipped: 0, checks }, null, 2),
  )
} catch (error) {
  await writeFile(`${out}/${restart ? 'restart' : 'journey'}-failure.txt`, String(error))
  throw error
} finally {
  await browser?.close()
  for (const context of contexts) await context.dispose()
  for (const id of sessions)
    await payload.db.pool.query('DELETE FROM admin_sessions WHERE id=$1', [id])
  await payload.db.destroy?.()
}

// The command owns its lifetime after all assertions and cleanup have completed.
console.log('04C verification and cleanup complete.')
process.exit(0)
