import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { ensureBootstrap } from '@/modules/operations/installation'
import { loadConfig } from '@/modules/core/config'

test('RC-02: ordinary operator builds Renegade Party Dispatch from an empty install', async ({
  page,
  context,
  browser,
}) => {
  mkdirSync('docs/rc/evidence/rc-02', { recursive: true })
  const observations: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => {
    observations.push(`PAGE ERROR: ${error.message}`)
    pageErrors.push(error.message)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) observations.push(`${response.status()} ${response.url()}`)
  })
  // Installer bootstrap is the sole internal write allowed in this journey.
  const payload = await getPayload({ config })
  const warnings: string[] = []
  const warn = console.warn
  let token = ''
  let siteId = ''
  let publicationId = ''
  let mediaId = ''
  let articleId = ''
  let privateMediaId = ''
  const records: Array<{ collection: string; id: string; title?: string }> = []
  const api = async (method: string, url: string, data?: unknown, status = 200) => {
    const response = await page.request.fetch(url, { method, data })
    const body = await response.text()
    expect(response.status(), `${method} ${url}: ${body.slice(0, 1500)}`).toBe(status)
    return JSON.parse(body)
  }
  try {
    console.warn = (...args: unknown[]) => warnings.push(String(args[0] ?? ''))
    expect((await ensureBootstrap(payload, loadConfig())).state).toBe('incomplete')
    token = warnings.map((line) => line.match(/: ([A-Za-z0-9_-]+)$/)?.[1]).find(Boolean) ?? ''
  } finally {
    console.warn = warn
  }
  expect(token).toHaveLength(43)
  await payload.db.destroy?.()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  try {
    await test.step('Owner enrollment and blank Standard onboarding', async () => {
      await page.goto('/setup')
      await expect(page.getByRole('heading', { name: 'Make this site yours.' })).toBeVisible()
      await page.getByLabel('Bootstrap token').fill(token)
      await page.getByLabel('Owner email').fill('editor@renegadeparty.test')
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByLabel('Site or publication name').fill('Renegade Party Dispatch')
      await page
        .getByLabel('Description')
        .fill('Independent civic reporting, local organizing and public accountability.')
      await page.getByLabel('Site slug').fill('renegadeparty')
      await page.getByLabel('Primary URL').fill(process.env.APP_URL!)
      await page.getByLabel('Locale').fill('en-US')
      await page.getByLabel('Timezone').fill('America/Chicago')
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByLabel('Starter site type').selectOption('blank-minimal')
      await page.getByLabel('Create starter pages and sample content').uncheck()
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByText('Standard', { exact: true }).click()
      await page.getByLabel('Search indexing').selectOption('noindex')
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
      await expect(page.getByRole('heading', { name: 'Your site is ready to shape.' })).toBeVisible(
        { timeout: 30_000 },
      )
      await expect(page.getByText('Save emergency recovery codes')).toBeVisible()
      expect((await context.cookies()).some((cookie) => cookie.name === 'renegade-passkey')).toBe(
        true,
      )
      await context.storageState({ path: 'scratch/rc02-owner.json' })
      await page.goto('/admin')
      await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
      const sites = await api('GET', '/api/sites?depth=0')
      expect(sites.docs).toHaveLength(1)
      siteId = sites.docs[0].id
      const publications = await api('GET', '/api/publications?depth=0')
      expect(publications.docs).toHaveLength(1)
      publicationId = publications.docs[0].id
      expect((await api('GET', '/api/content?depth=0')).totalDocs).toBe(0)
      await page.screenshot({
        path: 'docs/rc/evidence/rc-02/admin.png',
        fullPage: true,
        caret: 'initial',
      })
    })
    await test.step('Site settings through the normal admin form', async () => {
      await page.goto('/admin/globals/site-settings')
      await expect(page.getByLabel('Site Name', { exact: true })).toHaveValue(
        'Renegade Party Dispatch',
      )
      await page
        .getByLabel('Footer Text', { exact: true })
        .fill('Renegade Party Dispatch — independent reporting for an accountable republic.')
      const settingsSaved = page.waitForResponse(
        (r) => r.url().includes('/api/globals/site-settings') && r.request().method() === 'POST',
      )
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      expect((await settingsSaved).status()).toBe(200)
      await page.reload()
      await expect(page.getByLabel('Footer Text', { exact: true })).toHaveValue(
        'Renegade Party Dispatch — independent reporting for an accountable republic.',
      )
      const settings = await api('GET', '/api/globals/site-settings?depth=0')
      expect(settings.canonicalOrigin).toBe(process.env.APP_URL)
      expect(settings.locale).toBe('en-US')
      expect(settings.timezone).toBe('America/Chicago')
      expect(settings.indexingMode).toBe('noindex')
      await page.screenshot({
        path: 'docs/rc/evidence/rc-02/settings.png',
        fullPage: true,
        caret: 'initial',
      })
    })
    await test.step('Activate a theme and configure supported tokens in Theme Studio', async () => {
      await page.goto('/admin/capabilities')
      await page.getByRole('tab', { name: /Themes/ }).click()
      await page.getByLabel('Draft package', { exact: true }).selectOption('renegade-party@1.0.0')
      await page
        .getByLabel('Design token overrides', { exact: true })
        .fill(JSON.stringify({ 'color.canvas': '#f8f6f0', 'color.accent': '#b91c1c' }))
      const draft = page.waitForResponse(
        (r) => r.url().endsWith('/api/admin/themes') && r.request().method() === 'POST',
      )
      await page.getByRole('button', { name: 'Save theme draft', exact: true }).click()
      expect((await draft).status()).toBe(200)
      await expect(page.getByRole('button', { name: 'Activate theme', exact: true })).toBeEnabled()
      const activation = page.waitForResponse(
        (r) => r.url().endsWith('/api/admin/themes') && r.request().method() === 'POST',
      )
      await page.getByRole('button', { name: 'Activate theme', exact: true }).click()
      expect((await activation).status()).toBe(200)
      await page.screenshot({
        path: 'docs/rc/evidence/rc-02/theme.png',
        fullPage: true,
        caret: 'initial',
      })
    })
    await test.step('Upload original image and metadata through the normal media API', async () => {
      const bytes = readFileSync('fixtures/renegadeparty-demo/assets/hero-liberty.png')
      const response = await page.request.post('/api/media/upload', {
        multipart: {
          siteId,
          publicationId,
          title: 'Liberty and civic assembly',
          altText: 'Liberty Bell banner for civic reporting',
          caption: 'A publication banner for the Renegade Party Dispatch.',
          file: { name: 'liberty-banner.png', mimeType: 'image/png', buffer: bytes },
        },
      })
      expect(response.status(), await response.text()).toBe(201)
      const { asset } = await response.json()
      mediaId = asset.id
      records.push({ collection: 'media-assets', id: asset.id, title: asset.title })
      const checksum = createHash('sha256').update(bytes).digest('hex')
      writeFileSync(
        'docs/rc/evidence/rc-02/media.json',
        JSON.stringify({ sourceSha256: checksum, asset }, null, 2),
      )
      const stored = readFileSync(`${process.env.MEDIA_DIR}/${asset.storageLocation}`)
      expect(createHash('sha256').update(stored).digest('hex')).toBe(checksum)
      expect(asset.checksum).toBe(`sha256:${checksum}`)
      await api('PATCH', `/api/media/${asset.id}`, {
        siteId,
        creatorCredit: 'Dispatch Visual Desk',
        copyrightOwner: 'Renegade Party Dispatch',
        license: 'Publication-owned artwork',
        rightsStatus: 'approved',
        governanceEnabled: true,
      })
      await page.goto('/admin/media-library')
      await page.getByRole('tab', { name: 'Assets & DAM', exact: true }).click()
      await expect(
        page.getByText('Liberty and civic assembly', { exact: true }).first(),
      ).toBeVisible()
      const privateUpload = await page.request.post('/api/media/upload', {
        multipart: {
          siteId,
          title: 'PRIVATE RC02 unused artwork',
          altText: 'Private unused artwork',
          file: {
            name: 'private-logo.png',
            mimeType: 'image/png',
            buffer: readFileSync('fixtures/renegadeparty-demo/assets/logo.png'),
          },
        },
      })
      expect(privateUpload.status()).toBe(201)
      privateMediaId = (await privateUpload.json()).asset.id
      records.push({
        collection: 'media-assets',
        id: privateMediaId,
        title: 'PRIVATE RC02 unused artwork',
      })
    })
    await test.step('Create coherent editorial records through authenticated product REST', async () => {
      const category = (
        await api(
          'POST',
          '/api/categories',
          {
            site: siteId,
            scope: 'site',
            name: 'Civic accountability',
            slug: 'civic-accountability',
            canonicalPath: '/categories/civic-accountability',
          },
          201,
        )
      ).doc
      const topic = (
        await api(
          'POST',
          '/api/topics',
          { site: siteId, scope: 'site', name: 'Local governance', slug: 'local-governance' },
          201,
        )
      ).doc
      const author = (
        await api(
          'POST',
          '/api/authors',
          {
            displayName: 'Dispatch Editorial Board',
            slug: 'dispatch-editors',
            bio: 'Independent reporters covering local government and civic participation.',
          },
          201,
        )
      ).doc
      for (const [collection, doc] of [
        ['categories', category],
        ['topics', topic],
        ['authors', author],
      ] as const)
        records.push({ collection, id: doc.id })
      const text = (value: string) => ({
        type: 'text',
        text: value,
        version: 1,
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
      })
      const paragraph = (value: string) => ({
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        children: [text(value)],
      })
      const body = {
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: 'ltr',
          children: [
            {
              type: 'heading',
              tag: 'h2',
              version: 1,
              format: '',
              indent: 0,
              direction: 'ltr',
              children: [text('Local power, public records')],
            },
            ...Array.from({ length: 8 }, (_, i) =>
              paragraph(
                `Section ${i + 1}: Citizens deserve a clear record of public decisions. The Dispatch follows council agendas, interviews neighborhood organizers and checks budget claims against primary documents. Civicledger reporting connects these records with the people affected by each decision. Readers can reproduce our findings and send corrections to the editorial board.`,
              ),
            ),
            {
              ...paragraph(''),
              children: [
                {
                  type: 'link',
                  version: 3,
                  fields: { linkType: 'custom', url: '/about', newTab: false },
                  format: '',
                  indent: 0,
                  direction: 'ltr',
                  children: [text('Read our editorial charter')],
                },
              ],
            },
          ],
        },
      }
      const create = async (contentType: string, title: string, slug: string) => {
        const { doc } = await api(
          'POST',
          '/api/content',
          {
            site: siteId,
            publication: publicationId,
            contentType,
            title,
            slug,
            status: 'draft',
            body,
            summary:
              'Independent civic reporting with verifiable sources and public accountability.',
            excerpt: 'Reporting that puts public records in the hands of citizens.',
            authors: [{ author: author.id, displayOrder: 0, role: 'Author' }],
            categories: [category.id],
            topics: [topic.id],
            heroMedia: mediaId,
            seoTitle: `${title} | Dispatch`,
            seoDescription:
              'Read independent civic reporting from Renegade Party Dispatch, with primary sources, clear context and corrections.',
          },
          201,
        )
        records.push({ collection: 'content', id: doc.id, title })
        return doc
      }
      const about = await create('page', 'Our editorial charter', 'about')
      const first = await create('article', 'A republic built in the open', 'republic-in-the-open')
      articleId = first.id
      const second = await create(
        'article',
        'Neighborhood assemblies in practice',
        'neighborhood-assemblies',
      )
      await create('article', 'PRIVATE RC02 editorial investigation', 'private-rc02-investigation')
      await api('PATCH', `/api/content/${first.id}`, { relatedContent: [second.id] })
      await api('PATCH', `/api/content/${second.id}`, { relatedContent: [first.id] })
      expect((await page.request.get(first.canonicalPath)).status()).toBe(404)
      // Exercise the ordinary structured editor and persist an additional revision.
      await page.goto(`/admin/collections/content/${first.id}`)
      const editor = page.locator('[contenteditable="true"]').first()
      await expect(editor).toBeVisible()
      await editor.click()
      await page.keyboard.press('Control+End')
      await page.keyboard.press('Enter')
      await editor.pressSequentially(
        'Editor note: Our evidence policy includes an open corrections log.',
        { delay: 10 },
      )
      await expect(editor).toContainText('open corrections log')
      const saved = page.waitForResponse(
        (r) => r.url().includes(`/api/content/${first.id}`) && r.request().method() === 'PATCH',
      )
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      expect((await saved).status()).toBe(200)
      await page.reload()
      await expect(page.locator('[contenteditable="true"]').first()).toContainText(
        'open corrections log',
      )
      await page.getByRole('button', { name: 'SEO', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Discovery preview' })).toBeVisible()
      await page.getByRole('button', { name: 'Create saved draft preview', exact: true }).click()
      const previewLink = page.getByRole('link', { name: 'Open saved draft preview', exact: true })
      await expect(previewLink).toBeVisible()
      const preview = await context.newPage()
      await preview.goto((await previewLink.getAttribute('href'))!)
      await expect(
        preview.getByRole('heading', { name: 'A republic built in the open', exact: true }),
      ).toBeVisible()
      await expect(preview.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
      await preview.screenshot({
        path: 'docs/rc/evidence/rc-02/draft-preview.png',
        fullPage: true,
        caret: 'initial',
      })
      await preview.close()
      await page.screenshot({
        path: 'docs/rc/evidence/rc-02/article-editor.png',
        fullPage: true,
        caret: 'initial',
      })
      // Current product lifecycle values are exposed by the normal editor/REST.
      for (const doc of [about, first, second]) {
        await api('PATCH', `/api/content/${doc.id}`, { status: 'review' })
        await api('PATCH', `/api/content/${doc.id}`, { status: 'approved' })
        await api('PATCH', `/api/content/${doc.id}`, {
          status: 'published',
          publishedAt: new Date().toISOString(),
        })
      }
      const event = (
        await api(
          'POST',
          '/api/events',
          {
            site: siteId,
            publication: publicationId,
            title: 'Open civic assembly',
            slug: 'open-civic-assembly',
            summary: 'A public meeting on transparent local government.',
            status: 'published',
            startsAt: '2026-11-07T18:00:00.000Z',
            endsAt: '2026-11-07T20:00:00.000Z',
            timeZone: 'America/Chicago',
            visibility: 'public',
            venueName: 'Community Hall',
            venueAddress: '123 Civic Avenue',
            venueRegion: 'Chicago',
            organizerName: 'Renegade Party Dispatch',
          },
          201,
        )
      ).doc
      records.push({ collection: 'events', id: event.id, title: event.title })
      const navigation = ['primary', 'footer'].reduce(
        (acc, key) => ({
          ...acc,
          [key]: [
            { label: 'Our charter', href: '/about', children: [] },
            { label: 'Reporting', href: '/articles', children: [] },
            { label: 'Assembly', href: event.canonicalPath, children: [] },
          ],
        }),
        { secondary: [] },
      )
      await api('POST', '/api/admin/navigation', { publicationId, navigation })
      await api('POST', '/api/globals/site-settings', {
        indexingMode: 'index',
        launchState: 'live',
        defaultSocialImage: mediaId,
      })
      const family = await api(
        'GET',
        `/api/article-family-content?where[content][equals]=${first.id}&depth=0`,
      )
      expect(family.docs).toHaveLength(1)
      const revisions = await api(
        'GET',
        `/api/revision-records?where[article][equals]=${family.docs[0].id}&depth=0`,
      )
      expect(revisions.totalDocs).toBeGreaterThanOrEqual(2)
      writeFileSync('docs/rc/evidence/rc-02/revisions.json', JSON.stringify(revisions, null, 2))
    })
    await test.step('Build homepage using Puck and publish a reusable composition', async () => {
      const created = await api(
        'POST',
        '/api/layouts',
        { recipeId: 'writer-blogger', siteId, path: '/' },
        201,
      )
      const layoutId = created.layout.id
      records.push({ collection: 'page-layouts', id: layoutId })
      await page.goto(`/builder/${layoutId}`)
      await expect(page.getByRole('heading', { name: /Renegade visual editor/ })).toBeVisible()
      await page.getByLabel('Compatible theme').selectOption('renegade-party')
      await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeEnabled()
      await page.screenshot({
        path: 'docs/rc/evidence/rc-02/builder.png',
        fullPage: true,
        caret: 'initial',
      })
      // Every edit below is driven by the visible Puck property form.
      await page.frameLocator('iframe').locator('[data-puck-component]').first().click()
      await page
        .getByRole('textbox', { name: 'Heading', exact: true })
        .fill('Renegade Party Dispatch')
      await page
        .getByRole('textbox', { name: 'Text', exact: true })
        .fill(
          'Independent civic reporting. Local power, public records and an accountable republic.',
        )
      await page
        .getByRole('combobox', { name: 'Choose media from library', exact: true })
        .selectOption(mediaId)
      await page.getByText('Outline', { exact: true }).first().click()
      await page
        .locator('button')
        .filter({ hasText: /^Article list$/ })
        .click()
      await expect(page.getByRole('textbox', { name: 'Heading', exact: true })).toHaveValue(
        'Article list',
      )
      await page
        .getByRole('textbox', { name: 'Heading', exact: true })
        .fill('Latest civic reporting')
      await page.getByRole('spinbutton', { name: 'Maximum results' }).fill('4')
      await page
        .locator('button')
        .filter({ hasText: /^Newsletter CTA$/ })
        .click()
      await expect(page.getByRole('textbox', { name: 'Heading', exact: true })).toHaveValue(
        'Newsletter CTA',
      )
      await page
        .getByRole('textbox', { name: 'Heading', exact: true })
        .fill('Our corrections pledge')
      await page
        .getByRole('textbox', { name: 'Text', exact: true })
        .fill(
          'Every investigation has a source trail. Send corrections to the Dispatch editorial board; we publish material changes openly.',
        )
      await page.getByRole('button', { name: 'Publish Live', exact: true }).click()
      await expect(page.getByText(/Published successfully/)).toBeVisible()
      await page.goto('/')
      await expect(
        page.getByRole('heading', { name: 'Renegade Party Dispatch', exact: true }),
      ).toBeVisible()
    })
    await test.step('Reusable templates, patterns and published global regions', async () => {
      const blocks = [
        {
          id: 'dispatch-mission',
          component: 'publisher.rich-content',
          componentVersion: 1,
          props: {
            title: 'Public records. Public power.',
            headingLevel: 'h1',
            body: 'Local reporting with sources, context and corrections.',
            alignment: 'left',
            spacing: 'normal',
            variant: 'default',
          },
        },
      ]
      const pattern = await api(
        'POST',
        '/api/layouts/patterns',
        { action: 'save', siteId, name: 'Dispatch mission', themeId: 'renegade-party', blocks },
        201,
      )
      records.push({ collection: 'page-layouts', id: pattern.pattern.id })
      const instance = await api('POST', '/api/layouts/patterns', {
        action: 'instantiate',
        siteId,
        patternId: pattern.pattern.id,
        mode: 'snapshot',
      })
      const template = await api(
        'POST',
        '/api/layouts/templates',
        {
          action: 'create',
          siteId,
          name: 'Dispatch landing',
          themeId: 'renegade-party',
          blocks: instance.blocks,
        },
        201,
      )
      records.push({ collection: 'page-layouts', id: template.template.id })
      const landing = await api(
        'POST',
        '/api/layouts/templates',
        {
          action: 'create-page',
          siteId,
          name: 'Get involved with the Dispatch',
          path: '/get-involved',
          templateId: template.template.id,
          templateMode: 'explicit',
        },
        201,
      )
      records.push({ collection: 'page-layouts', id: landing.page.id })
      await api('PATCH', `/api/layouts/${landing.page.id}`, {
        layout: landing.page,
        publish: true,
        expectedRevision: landing.page.revision,
      })
      for (const slot of ['header', 'footer']) {
        const region = (
          await api(
            'POST',
            '/api/page-layouts',
            {
              site: siteId,
              path: `__global__/${slot}`,
              name: `Dispatch ${slot}`,
              themeId: 'renegade-party',
              surface: 'global',
              slot,
              layoutVersion: 1,
              status: 'draft',
              visibility: 'public',
              revision: 1,
              blocks: [
                {
                  ...blocks[0],
                  id: `mission-${slot}`,
                  props: {
                    ...blocks[0].props,
                    headingLevel: 'h2',
                    title:
                      slot === 'header'
                        ? 'Independent civic journalism'
                        : 'Our public accountability promise',
                  },
                },
              ],
              unknownBlocks: [],
              revisionHistory: [],
            },
            201,
          )
        ).doc
        records.push({ collection: 'page-layouts', id: region.id })
        const layout = { ...region, version: 1, siteId, id: region.id }
        await api('PATCH', `/api/layouts/${region.id}`, {
          layout,
          publish: true,
          expectedRevision: 1,
        })
      }
      await page.goto('/')
      await expect(
        page.getByRole('heading', { name: 'Independent civic journalism', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'Our public accountability promise', exact: true }),
      ).toBeVisible()
    })
    await test.step('Media usage tracking and nondestructive replacement', async () => {
      await api('POST', '/api/media/attach', { siteId, contentId: articleId, mediaId })
      const impact = await api('POST', `/api/media/${mediaId}`, { siteId })
      expect(
        impact.impact.usages.some((usage: { targetId: string }) => usage.targetId === articleId),
      ).toBe(true)
      const bytes = readFileSync('fixtures/renegadeparty-demo/assets/inline-assembly.png')
      const replacement = await page.request.put(`/api/media/${mediaId}`, {
        multipart: {
          siteId,
          mode: 'new-asset',
          title: 'Civic assembly diagram',
          altText: 'A diagram of the civic assembly structure',
          reason: 'Retain the existing publication banner while preparing a new illustration.',
          file: { name: 'assembly.png', mimeType: 'image/png', buffer: bytes },
        },
      })
      expect(replacement.status(), await replacement.text()).toBe(201)
      const result = await replacement.json()
      expect(result.replacement.id).not.toBe(mediaId)
      expect(result.replacement.checksum).toBe(
        `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      )
      const article = await api('GET', `/api/content/${articleId}?depth=0`)
      expect(article.heroMedia).toBe(mediaId)
      records.push({
        collection: 'media-assets',
        id: result.replacement.id,
        title: 'Civic assembly diagram',
      })
      writeFileSync(
        'docs/rc/evidence/rc-02/media-replacement.json',
        JSON.stringify(
          { impact, replacement: result.replacement, retainedHeroMedia: article.heroMedia },
          null,
          2,
        ),
      )
    })
    await test.step('Theme preview and switching preserve canonical editorial records', async () => {
      const before = await api('GET', '/api/content?depth=0&limit=100&sort=id')
      const fingerprint = createHash('sha256').update(JSON.stringify(before.docs)).digest('hex')
      const change = async (action: string, extra: Record<string, unknown> = {}) => {
        const model = await api('GET', `/api/admin/themes?site=${siteId}`)
        const response = await page.request.post('/api/admin/themes', {
          headers: { origin: process.env.APP_URL! },
          data: { action, site: siteId, revision: model.state.revision, ...extra },
        })
        expect(response.status(), await response.text()).toBe(200)
      }
      await change('draft', { id: 'neutral-starter', version: '1.0.0', tokens: {} })
      await change('preview')
      await page.goto('/')
      await expect(page.locator('[data-theme]').first()).toHaveAttribute(
        'data-theme',
        'neutral-starter',
      )
      await change('end-preview')
      await change('activate')
      await change('draft', {
        id: 'renegade-party',
        version: '1.0.0',
        tokens: { 'color.canvas': '#f8f6f0', 'color.accent': '#b91c1c' },
      })
      await change('activate')
      const after = await api('GET', '/api/content?depth=0&limit=100&sort=id')
      const afterFingerprint = createHash('sha256').update(JSON.stringify(after.docs)).digest('hex')
      expect(afterFingerprint).toBe(fingerprint)
      writeFileSync(
        'docs/rc/evidence/rc-02/theme-content-proof.json',
        JSON.stringify(
          {
            beforeSha256: fingerprint,
            afterSha256: afterFingerprint,
            preview: 'neutral-starter',
            active: 'renegade-party',
          },
          null,
          2,
        ),
      )
    })
    await test.step('Anonymous public site, metadata, discovery and responsive media', async () => {
      const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
      const visitor = await anonymous.newPage()
      visitor.on('pageerror', (error) => {
        observations.push(`PUBLIC PAGE ERROR: ${error.message}`)
        pageErrors.push(error.message)
      })
      visitor.on('console', (message) => {
        if (message.type() === 'error') observations.push(`PUBLIC CONSOLE: ${message.text()}`)
      })
      const publicProof: Record<string, unknown> = {}
      expect(
        (
          await anonymous.request.get(`${process.env.APP_URL}/articles/private-rc02-investigation`)
        ).status(),
      ).toBe(404)
      expect(
        (await anonymous.request.get(`${process.env.APP_URL}/media/${privateMediaId}`)).status(),
      ).toBe(404)
      for (const path of [
        '/',
        '/about',
        '/articles/republic-in-the-open',
        '/articles/neighborhood-assemblies',
        '/events/open-civic-assembly',
        '/articles',
        '/categories/civic-accountability',
        '/topics/local-governance',
        '/get-involved',
      ]) {
        const response = await visitor.goto(`${process.env.APP_URL}${path}`)
        expect(response?.status(), path).toBe(200)
        await expect(visitor.locator('body')).not.toContainText('Application error')
        await expect(visitor.locator('body')).not.toContainText('editor@renegadeparty.test')
        const schemas = (
          await visitor.locator('script[type="application/ld+json"]').allTextContents()
        ).map((value) => JSON.parse(value))
        publicProof[path] = { status: response?.status(), title: await visitor.title(), schemas }
        if (path === '/events/open-civic-assembly')
          expect(JSON.stringify(schemas)).toContain('"@type":"Event"')
        if (path === '/') {
          expect(JSON.stringify(schemas)).toContain('"@type":"WebSite"')
          await expect(
            visitor.getByRole('link', { name: 'A republic built in the open', exact: true }),
          ).toBeVisible()
          await expect(
            visitor.getByRole('link', { name: 'Neighborhood assemblies in practice', exact: true }),
          ).toBeVisible()
          await expect(visitor.locator('body')).not.toContainText(
            'PRIVATE RC02 editorial investigation',
          )
        }
        if (path.startsWith('/categories/') || path.startsWith('/topics/'))
          expect(JSON.stringify(schemas)).toContain('"@type":"CollectionPage"')
      }
      await visitor.goto(`${process.env.APP_URL}/articles/republic-in-the-open`)
      await expect(visitor).toHaveTitle(/A republic built in the open/)
      await expect(visitor.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        'Read independent civic reporting from Renegade Party Dispatch, with primary sources, clear context and corrections.',
      )
      await expect(visitor.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${process.env.APP_URL}/articles/republic-in-the-open`,
      )
      await expect(visitor.locator('meta[property="og:title"]')).toHaveAttribute(
        'content',
        /republic built in the open/,
      )
      await expect(visitor.locator('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image',
      )
      await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute('content', /index/)
      const schema = await visitor.locator('script[type="application/ld+json"]').allTextContents()
      expect(JSON.stringify(schema.map((value) => JSON.parse(value)))).toContain(
        '"@type":"Article"',
      )
      expect(schema.join('')).toContain('Dispatch Editorial Board')
      publicProof.metadata = { schema: schema.map((value) => JSON.parse(value)) }
      await expect(
        visitor
          .getByRole('link', { name: 'Neighborhood assemblies in practice', exact: true })
          .first(),
      ).toBeVisible()
      const variants = await api('GET', `/api/media/${mediaId}/variants?siteId=${siteId}`)
      expect(variants.summary.readyVariants).toBeGreaterThan(0)
      publicProof.derivatives = variants
      const pictures = visitor.locator('picture')
      expect(await pictures.count()).toBeGreaterThan(0)
      for (const format of ['webp', 'avif']) {
        const sources = visitor.locator(`picture source[type="image/${format}"]`)
        expect(await sources.count()).toBeGreaterThan(0)
        const srcset = await sources.first().getAttribute('srcset')
        expect(srcset).toContain(`/media/${mediaId}?variant=hero&format=${format}`)
        const renderedUrl = srcset!.split(' ')[0]
        const rendered = await anonymous.request.get(`${process.env.APP_URL}${renderedUrl}`)
        expect(rendered.status()).toBe(200)
        expect(rendered.headers()['content-type']).toBe(`image/${format}`)
      }
      const derivative = await anonymous.request.get(
        `${process.env.APP_URL}${variants.variants.find((v: { processingState: string }) => v.processingState === 'ready').url}`,
      )
      expect(derivative.status()).toBe(200)
      expect(derivative.headers()['content-type']).toMatch(/^image\//)
      for (const term of ['republic', 'civicledger', 'Civic accountability']) {
        await visitor.goto(
          `${process.env.APP_URL}/search?q=${encodeURIComponent(term)}&site=${siteId}`,
        )
        await expect(
          visitor.getByRole('link', { name: /A republic built in the open/ }).first(),
        ).toBeVisible()
        await expect(
          visitor.getByRole('link', { name: /A republic built in the open/ }).first(),
        ).toHaveAttribute('href', '/articles/republic-in-the-open')
      }
      for (const path of ['/sitemap.xml', '/robots.txt', '/feed.xml', '/feed.json']) {
        const response = await anonymous.request.get(`${process.env.APP_URL}${path}`)
        expect(response.status(), path).toBe(200)
        publicProof[path] = {
          status: response.status(),
          headers: response.headers(),
          body: await response.text(),
        }
        if (path === '/sitemap.xml') {
          const childUrls = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
            (match) => match[1],
          )
          expect(childUrls.length).toBeGreaterThan(0)
          let sitemapBody = ''
          for (const url of childUrls) {
            expect(new URL(url).origin).toBe(process.env.APP_URL)
            const child = await anonymous.request.get(url)
            expect(child.status()).toBe(200)
            const body = await child.text()
            publicProof[url] = { status: child.status(), body }
            sitemapBody += body
          }
          expect(sitemapBody).toContain('/articles/republic-in-the-open')
          expect(sitemapBody).not.toContain('private-rc02-investigation')
          expect(sitemapBody).not.toMatch(/__(?:global|pattern|template)__\//)
        } else if (path !== '/robots.txt')
          expect(await response.text()).toContain('/articles/republic-in-the-open')
        expect(await response.text()).not.toContain('private-rc02-investigation')
        expect(await response.text()).not.toContain('PRIVATE RC02')
      }
      const missing = await visitor.goto(`${process.env.APP_URL}/rc02-page-does-not-exist`)
      expect(missing?.status()).toBe(404)
      await expect(visitor.getByRole('heading', { name: /not found/i })).toBeVisible()
      publicProof.notFound = { status: missing?.status() }
      expect([401, 403]).toContain(
        (await anonymous.request.get(`${process.env.APP_URL}/api/content`)).status(),
      )
      await visitor.goto(`${process.env.APP_URL}/`)
      await expect(
        visitor
          .getByRole('navigation', { name: 'Primary navigation', exact: true })
          .getByRole('link', { name: 'Our charter', exact: true }),
      ).toBeVisible()
      await visitor.screenshot({
        path: 'docs/rc/evidence/rc-02/public-desktop.png',
        fullPage: true,
        caret: 'initial',
      })
      await visitor.setViewportSize({ width: 390, height: 844 })
      await visitor.getByRole('button', { name: 'Menu', exact: true }).click()
      await visitor
        .getByRole('navigation', { name: 'Mobile navigation', exact: true })
        .getByRole('link', { name: 'Our charter', exact: true })
        .click()
      await expect(visitor).toHaveURL(`${process.env.APP_URL}/about`)
      await visitor.screenshot({
        path: 'docs/rc/evidence/rc-02/public-mobile.png',
        fullPage: true,
        caret: 'initial',
      })
      writeFileSync(
        'docs/rc/evidence/rc-02/public-proof.json',
        JSON.stringify(publicProof, null, 2),
      )
      await anonymous.close()
    })
    await test.step('Published edit, revision history and exact slug redirect', async () => {
      const article = await api('GET', `/api/content/${articleId}?depth=0`)
      const updatedBody = structuredClone(article.body)
      updatedBody.root.children.push({
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        children: [
          {
            type: 'text',
            version: 1,
            text: 'PUBLIC RC02 UPDATE: New source documents have been added to our reporting.',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
          },
        ],
      })
      await api('PATCH', `/api/content/${articleId}`, { body: updatedBody, status: 'updated' })
      await api('PATCH', `/api/content/${articleId}`, {
        summary: 'A saved revision awaiting republication.',
      })
      await page.goto('/articles/republic-in-the-open')
      await expect(page.locator('body')).not.toContainText('PUBLIC RC02 UPDATE')
      const searchVisitor = await browser.newContext({ ignoreHTTPSErrors: true })
      const searchUrl = `${process.env.APP_URL}/search?q=${encodeURIComponent('RC02 UPDATE')}&site=${siteId}`
      const unpublishedSearch = await searchVisitor.request.get(searchUrl)
      expect(unpublishedSearch.status()).toBe(200)
      expect(await unpublishedSearch.text()).not.toContain('/articles/republic-in-the-open')
      await api('PATCH', `/api/content/${articleId}`, { status: 'published' })
      await page.reload()
      await expect(page.locator('body')).toContainText('PUBLIC RC02 UPDATE')
      const publishedSearch = await searchVisitor.request.get(searchUrl)
      expect(publishedSearch.status()).toBe(200)
      expect(await publishedSearch.text()).toContain('/articles/republic-in-the-open')
      await searchVisitor.close()
      await api('PATCH', `/api/content/${articleId}`, {
        slug: 'republic-public-records',
        status: 'updated',
        summary: 'Updated reporting on transparent public records and civic accountability.',
      })
      const redirect = await page.request.get('/articles/republic-in-the-open', { maxRedirects: 0 })
      expect(redirect.status()).toBe(308)
      expect(redirect.headers().location).toBe('/articles/republic-public-records')
      writeFileSync(
        'docs/rc/evidence/rc-02/redirect.json',
        JSON.stringify({ status: redirect.status(), location: redirect.headers().location }),
      )
      await page.goto('/articles/republic-public-records')
      await expect(
        page.getByRole('heading', { name: 'A republic built in the open', exact: true }),
      ).toBeVisible()
    })
    await test.step('Rendered Quality performs real HTTP checks against this site', async () => {
      const family = await api(
        'GET',
        `/api/article-family-content?where[content][equals]=${articleId}&depth=0`,
      )
      const scan = (
        await api(
          'POST',
          '/api/quality-scans',
          { site: siteId, targetType: 'document', targetId: family.docs[0].id },
          201,
        )
      ).doc
      await expect
        .poll(async () => (await api('GET', `/api/quality-scans/${scan.id}?depth=0`)).status, {
          timeout: 60_000,
        })
        .toBe('completed')
      const completed = await api('GET', `/api/quality-scans/${scan.id}?depth=0`)
      writeFileSync('docs/rc/evidence/rc-02/quality-scan.json', JSON.stringify(completed, null, 2))
      await page.goto(`/admin/collections/quality-scans/${scan.id}`)
      await expect(page.locator('body')).toContainText(scan.id)
      await page.goto('/admin/rendered-quality')
      const response = page.waitForResponse(
        (r) => r.url().endsWith('/api/admin/discovery/audit') && r.request().method() === 'POST',
        { timeout: 60_000 },
      )
      await page.getByRole('button', { name: 'Run Rendered Audit', exact: true }).click()
      const result = await response
      expect(result.status()).toBe(200)
      const audit = await result.json()
      writeFileSync('docs/rc/evidence/rc-02/rendered-quality.json', JSON.stringify(audit, null, 2))
      expect(audit.pages.length).toBeGreaterThan(0)
      expect(audit.pages.every((entry: { status: number }) => entry.status === 200)).toBe(true)
      expect(
        audit.issues.filter(
          (entry: { severity: string; ruleId: string }) =>
            entry.severity === 'publication_blocking' ||
            [
              'DISC-05-INTERNAL-LINK-UNREACHABLE',
              'DISC-05-DESCRIPTION-MISSING',
              'DISC-05-HEADING-HIERARCHY',
            ].includes(entry.ruleId),
        ),
      ).toEqual([])
    })
    await test.step('Actual web and worker process restart, then fresh anonymous browse', async () => {
      const request = { nonce: Date.now() }
      writeFileSync('scratch/rc02-restart-request.json', JSON.stringify(request))
      await expect
        .poll(
          () =>
            existsSync('scratch/rc02-restart-receipt.json')
              ? JSON.parse(readFileSync('scratch/rc02-restart-receipt.json', 'utf8')).request.nonce
              : 0,
          { timeout: 60_000 },
        )
        .toBe(request.nonce)
      const receipt = JSON.parse(readFileSync('scratch/rc02-restart-receipt.json', 'utf8'))
      expect(receipt.current.web).not.toBe(receipt.previous.web)
      expect(receipt.current.worker).not.toBe(receipt.previous.worker)
      await expect
        .poll(() => JSON.parse(readFileSync('scratch/rc02-worker-heartbeat.json', 'utf8')).pid, {
          timeout: 60_000,
        })
        .toBe(receipt.current.worker)
      await expect
        .poll(
          async () => {
            try {
              return (await page.request.get('/api/setup/readiness')).status()
            } catch {
              return 0
            }
          },
          { timeout: 60_000 },
        )
        .toBe(200)
      const fresh = await browser.newContext({ ignoreHTTPSErrors: true })
      for (const path of [
        '/',
        '/about',
        '/articles/republic-public-records',
        '/events/open-civic-assembly',
        '/sitemap.xml',
        '/feed.xml',
      ])
        expect((await fresh.request.get(`${process.env.APP_URL}${path}`)).status(), path).toBe(200)
      const restartedVisitor = await fresh.newPage()
      await restartedVisitor.goto(`${process.env.APP_URL}/articles/republic-public-records`)
      await expect(
        restartedVisitor.getByRole('heading', {
          name: 'A republic built in the open',
          exact: true,
        }),
      ).toBeVisible()
      await expect(restartedVisitor.locator('body')).toContainText('PUBLIC RC02 UPDATE')
      const restoredMedia = await fresh.request.get(
        `${process.env.APP_URL}/media/${mediaId}?variant=hero&format=webp&v=1`,
      )
      expect(restoredMedia.status()).toBe(200)
      expect(restoredMedia.headers()['content-type']).toBe('image/webp')
      writeFileSync('docs/rc/evidence/rc-02/restart.json', JSON.stringify(receipt, null, 2))
      await fresh.close()
    })
    expect(pageErrors).toEqual([])
  } finally {
    writeFileSync(
      'docs/rc/evidence/rc-02/browser-observations.json',
      JSON.stringify(observations, null, 2),
    )
    writeFileSync('docs/rc/evidence/rc-02/records.json', JSON.stringify(records, null, 2))
  }
})
