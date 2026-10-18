import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { chromium, request, expect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { readThemeState, themePool } from '../../src/modules/presentation/lifecycle'

assert.equal(process.env.RC1_04B_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith(':5439/rc104b_release_acceptance'))
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const payload = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/04B'
const base = 'https://localhost:38911'
const packageRoot = process.env.RENEGADE_THEME_PACKAGES_DIR!
assert.equal(path.resolve(packageRoot), path.resolve('scratch/rc104b-20261018/theme-packages'))
const trace: string[] = []
const check = (name: string, value: unknown) => {
  assert.ok(value, name)
  trace.push(name)
  console.log(`PASS ${trace.length}: ${name}`)
}
const restart = process.argv.includes('--restart')
const contexts: Awaited<ReturnType<typeof request.newContext>>[] = []
const sessions: string[] = []
let success = false
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
  const api = await request.newContext({
    baseURL: base,
    ignoreHTTPSErrors: true,
    timeout: 180000,
    extraHTTPHeaders: { origin: base },
    storageState: {
      cookies: [
        {
          name: 'renegade-passkey',
          value: session.token,
          domain: 'localhost',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: 'Strict',
        },
      ],
      origins: [],
    },
  })
  contexts.push(api)
  return { api, token: session.token }
}
const anon = await request.newContext({ baseURL: base, ignoreHTTPSErrors: true, timeout: 180000 })
contexts.push(anon)
try {
  if (restart) {
    const saved = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    check(
      'theme state survives PostgreSQL/web restart',
      JSON.stringify(await readThemeState(themePool(payload), saved.site)) ===
        JSON.stringify(saved.theme),
    )
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
    const html = await (await anon.get(saved.path)).text()
    check(
      'canonical URL and content still render after restart',
      html.includes('Canonical 04B') && html.includes('data-theme="neutral-starter"'),
    )
    for (const slot of ['header', 'footer', 'announcement', 'cta'])
      check(`global ${slot} survives restart`, html.includes(`04B ${slot} edited`))
    const media = await anon.get(`/media/${saved.asset}`)
    check(
      'media original bytes survive restart',
      media.ok() &&
        createHash('sha256')
          .update(await media.body())
          .digest('hex') === saved.assetHash,
    )
    check(
      'published media reference survives restart',
      (await (await anon.get(saved.mediaPath)).text()).includes(`/media/${saved.asset}`),
    )
  } else {
    const stamp = Date.now()
    const site = await payload.create({
      collection: 'sites',
      data: { name: '04B Alpha', slug: `alpha-04b-${stamp}`, lifecycle: 'active' } as never,
    })
    const beta = await payload.create({
      collection: 'sites',
      data: { name: '04B Beta', slug: `beta-04b-${stamp}`, lifecycle: 'active' } as never,
    })
    const owner = await payload.create({
      collection: 'users',
      data: { email: `owner-${stamp}@rc104b.test`, role: 'owner' } as never,
    })
    const { api, token } = await operator(owner)
    await payload.updateGlobal({
      slug: 'site-settings',
      user: owner,
      overrideAccess: false,
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [site.id]: base, [beta.id]: 'https://beta.rc104b.test:38911' },
        launchState: 'live',
        indexingMode: 'index',
      } as never,
    })
    const create = async (collection: string, data: unknown) => {
      const res = await api.post(`/api/${collection}`, { data })
      assert.equal(res.status(), 201, await res.text())
      return (await res.json()).doc
    }
    const pub = (
      await payload.find({
        collection: 'publications',
        where: { site: { equals: site.id } },
        depth: 0,
      })
    ).docs[0]
    assert.ok(pub)
    const content = await create('content', {
      site: site.id,
      publication: pub.id,
      title: 'Canonical 04B',
      slug: `canonical-04b-${stamp}`,
      contentType: 'page',
      status: 'draft',
      visibility: 'public',
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
                  text: 'Content preserved across theme switching 04B',
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
    const published = await api.patch(`/api/content/${content.id}`, {
      data: { status: 'published' },
    })
    assert.equal(published.status(), 200, await published.text())
    const canonical = await payload.findByID({ collection: 'content', id: content.id, depth: 0 })
    check(
      'supported content API publishes a canonical page',
      canonical.status === 'published' && canonical.canonicalPath,
    )
    const records: Array<{ collection: string; doc: unknown }> = [
      { collection: 'content', doc: canonical },
    ]
    const png = await sharp({
      create: { width: 80, height: 60, channels: 3, background: '#be123c' },
    })
      .png()
      .toBuffer()
    const upload = await api.post('/api/media/upload', {
      multipart: {
        siteId: site.id,
        title: '04B asset',
        altText: '04B red image',
        file: { name: '04b.png', mimeType: 'image/png', buffer: png },
      },
    })
    assert.equal(upload.status(), 201, await upload.text())
    const asset = (await upload.json()).asset
    const mediaPage = await create('page-layouts', {
      site: site.id,
      path: `/media-04b-${stamp}`,
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      layoutVersion: 1,
      status: 'draft',
      visibility: 'public',
      blocks: [],
      revision: 1,
    })
    const mediaChoice = (
      await (await api.get(`/api/layouts/${mediaPage.id}/choices?kind=media`)).json()
    ).options.find((v: { id: string }) => v.id === asset.id)
    assert.ok(mediaChoice)
    const mediaSave = await api.patch(`/api/layouts/${mediaPage.id}`, {
      data: {
        expectedRevision: 1,
        publish: true,
        layout: {
          version: 1,
          id: mediaPage.id,
          siteId: site.id,
          path: mediaPage.path,
          themeId: 'neutral-starter',
          revision: 1,
          blocks: [
            {
              id: 'media-04b',
              component: 'publisher.hero',
              componentVersion: 1,
              props: { title: '04B media reference', media: mediaChoice },
            },
          ],
        },
      },
    })
    assert.equal(mediaSave.status(), 200, await mediaSave.text())
    records.push({
      collection: 'page-layouts',
      doc: await payload.findByID({ collection: 'page-layouts', id: mediaPage.id, depth: 0 }),
    })
    const assetHash = createHash('sha256').update(png).digest('hex')
    check('supported upload and chooser publish a real media reference', !!asset.id)
    const block = (title: string) => ({
      id: 'cta-04b',
      component: 'publisher.cta',
      componentVersion: 1,
      props: {
        title,
        body: 'Preserved global region',
        link: {
          id: `content:${canonical.id}`,
          siteId: site.id,
          label: 'Read',
          href: canonical.canonicalPath,
        },
      },
    })
    for (const slot of ['header', 'footer', 'announcement', 'cta']) {
      const row = await create('page-layouts', {
        site: site.id,
        path: `__global__/${slot}-${stamp}`,
        name: `04B ${slot}`,
        surface: 'global',
        slot,
        themeId: 'neutral-starter',
        layoutVersion: 1,
        status: 'draft',
        visibility: 'public',
        blocks: [],
        revision: 1,
      })
      const save = async (revision: number, title: string) => {
        const result = await api.patch(`/api/layouts/${row.id}`, {
          data: {
            expectedRevision: revision,
            publish: true,
            layout: {
              version: 1,
              id: row.id,
              siteId: site.id,
              path: row.path,
              themeId: 'neutral-starter',
              revision,
              blocks: [block(title)],
            },
          },
        })
        assert.equal(result.status(), 200, await result.text())
      }
      await save(1, `04B ${slot} original`)
      await save(2, `04B ${slot} edited`)
      const persisted = await payload.findByID({ collection: 'page-layouts', id: row.id, depth: 0 })
      check(
        `supported layout API edits and publishes global ${slot}`,
        persisted.revision === 3 &&
          JSON.stringify(persisted.publishedPresentation).includes(`04B ${slot} edited`),
      )
      records.push({ collection: 'page-layouts', doc: persisted })
    }
    const pattern = await api.post('/api/layouts/patterns', {
      data: {
        action: 'save',
        siteId: site.id,
        name: '04B reusable',
        themeId: 'neutral-starter',
        blocks: [block('04B reusable')],
      },
    })
    assert.equal(pattern.status(), 201, await pattern.text())
    const patternId = (await pattern.json()).pattern.id
    const instance = await api.post('/api/layouts/patterns', {
      data: { action: 'instantiate', siteId: site.id, patternId, mode: 'snapshot' },
    })
    check(
      'reusable component saves and instantiates through operator API',
      instance.ok() && (await instance.json()).blocks[0].props.title === '04B reusable',
    )
    records.push({
      collection: 'page-layouts',
      doc: await payload.findByID({ collection: 'page-layouts', id: patternId, depth: 0 }),
    })
    const state = () => readThemeState(themePool(payload), site.id)
    const act = async (action: string, extra: object = {}, expected = 200) => {
      const res = await api.post('/api/admin/themes', {
        data: { action, site: site.id, revision: (await state()).revision, ...extra },
      })
      assert.equal(res.status(), expected, await res.text())
      return res
    }
    const inspect = async (id: string, version: string) => {
      const response = await anon.get(canonical.canonicalPath!)
      const html = await response.text()
      check(
        `public canonical URL renders ${id}@${version}`,
        response.ok() &&
          html.includes(`data-theme="${id}"`) &&
          html.includes(`data-theme-version="${version}"`) &&
          html.includes('Canonical 04B'),
      )
      for (const slot of ['header', 'footer', 'announcement', 'cta'])
        assert.ok(html.includes(`04B ${slot} edited`), slot)
      for (const record of records)
        assert.deepEqual(
          await payload.findByID({
            collection: record.collection as 'content',
            id: (record.doc as { id: string }).id,
            depth: 0,
          }),
          record.doc,
        )
      check(
        `theme ${id}@${version} preserves complete content, URLs, globals and reusable blocks`,
        true,
      )
      const mediaHTML = await (await anon.get(mediaPage.path)).text()
      const bytes = await anon.get(`/media/${asset.id}`)
      check(
        `theme ${id}@${version} retains media reference and original bytes`,
        mediaHTML.includes(`/media/${asset.id}`) &&
          bytes.ok() &&
          createHash('sha256')
            .update(await bytes.body())
            .digest('hex') === assetHash,
      )
    }
    check(
      'discovery offers two themes and upgrade',
      (await (await api.get(`/api/admin/themes?site=${site.id}`)).json()).installed.filter(
        (p: { compatible: boolean }) => p.compatible,
      ).length === 3,
    )
    for (const [id, version] of [
      ['neutral-starter', '1.0.0'],
      ['renegade-party', '1.0.0'],
    ]) {
      await act('draft', { id, version, tokens: { 'spacing.normal': '2rem' } })
      await act('preview')
      const preview = await (await api.get(canonical.canonicalPath!)).text()
      check(
        `authenticated preview renders ${id} with edited token`,
        preview.includes(`data-theme="${id}"`) &&
          preview.includes('--presentation-spacing-normal:2rem'),
      )
      if (id === 'renegade-party')
        check(
          'anonymous readers cannot see the owner theme preview',
          !(await (await anon.get(canonical.canonicalPath!)).text()).includes(
            'data-theme="renegade-party"',
          ),
        )
      await act('activate')
      check(
        `activation ${id} persists selected tokens`,
        (await state()).active?.tokens['spacing.normal'] === '2rem',
      )
      await inspect(id, version)
    }
    await act('rollback')
    await inspect('neutral-starter', '1.0.0')
    const upgradeDir = path.join(packageRoot, 'neutral-starter-1.1.0')
    const upgradeManifest = JSON.parse(
      await readFile('theme-packages/neutral-starter-1.1.0/theme.json', 'utf8'),
    )
    await mkdir(path.join(upgradeDir, 'assets'), { recursive: true })
    await writeFile(path.join(upgradeDir, 'assets', 'reference.png'), png)
    await writeFile(
      path.join(upgradeDir, 'theme.json'),
      JSON.stringify({
        ...upgradeManifest,
        assets: [{ path: 'assets/reference.png', sha256: assetHash }],
      }),
    )
    await act('draft', { id: 'neutral-starter', version: '1.1.0' })
    const pinnedDraft = await state()
    await writeFile(path.join(upgradeDir, 'assets', 'reference.png'), 'damaged asset')
    await act('activate', {}, 400)
    check(
      'damaged package asset rejects activation and retains exact theme state',
      JSON.stringify(await state()) === JSON.stringify(pinnedDraft),
    )
    await writeFile(path.join(upgradeDir, 'assets', 'reference.png'), png)
    await act('activate')
    check(
      'repaired package retries activation successfully',
      (await state()).active?.version === '1.1.0',
    )
    check(
      'upgrade migrates and preserves custom token',
      (await state()).active?.version === '1.1.0' &&
        (await state()).active?.tokens['spacing.normal'] === '2rem',
    )
    await inspect('neutral-starter', '1.1.0')
    await act('rollback')
    await inspect('neutral-starter', '1.0.0')
    const before = await state()
    const root = process.env.RENEGADE_THEME_PACKAGES_DIR!
    assert.ok(
      root.endsWith('rc104b-20261018\\theme-packages') ||
        root.endsWith('rc104b-20261018/theme-packages'),
    )
    const manifest = JSON.parse(
      await readFile('theme-packages/neutral-starter-1.0.0/theme.json', 'utf8'),
    )
    for (const [directory, value] of [
      ['broken-04b', '{broken'],
      ['future-04b', JSON.stringify({ ...manifest, id: 'future-04b', renegade: '^99.0.0' })],
    ]) {
      await mkdir(path.join(root, directory), { recursive: true })
      await writeFile(path.join(root, directory, 'theme.json'), value)
    }
    const discovered = (await (await api.get(`/api/admin/themes?site=${site.id}`)).json()).installed
    check(
      'operator-installed malformed and incompatible packages have clear discovery failures',
      discovered.some(
        (p: { directory: string; error: string }) =>
          p.directory === 'broken-04b' && p.error.includes('Malformed'),
      ) &&
        discovered.some(
          (p: { directory: string; compatible: boolean }) =>
            p.directory === 'future-04b' && !p.compatible,
        ),
    )
    await act('draft', { id: 'future-04b', version: '1.0.0' }, 400)
    await act('draft', { id: 'missing-broken-package', version: '1.0.0' }, 400)
    await act(
      'draft',
      { id: 'neutral-starter', version: '1.0.0', tokens: { 'color.ink': 'url(evil)' } },
      400,
    )
    await act('activate', { revision: 0 }, 400)
    check(
      'missing package, invalid token and stale retry retain exact active state',
      JSON.stringify(await state()) === JSON.stringify(before),
    )
    check(
      'anonymous theme mutation denied',
      (
        await anon.post('/api/admin/themes', {
          data: { action: 'rollback', site: site.id, revision: before.revision },
        })
      ).status() === 403,
    )
    check(
      'cross-origin mutation denied',
      (
        await api.post('/api/admin/themes', {
          headers: { origin: 'https://evil.test' },
          data: { action: 'rollback', site: site.id, revision: before.revision },
        })
      ).status() === 403,
    )
    const staff = await payload.create({
      collection: 'users',
      data: { email: `staff-${stamp}@rc104b.test`, role: 'staff' } as never,
    })
    const member = (
      await payload.find({ collection: 'members', where: { email: { equals: staff.email } } })
    ).docs[0]
    await payload.create({
      collection: 'member-site-roles',
      data: { member: member.id, site: site.id, role: 'contributor' },
    })
    const staffAPI = (await operator(staff)).api
    const scopedOwner = await payload.create({
      collection: 'users',
      context: { pendingStaffInvitation: true },
      data: { email: `scoped-owner-${stamp}@rc104b.test`, role: 'owner' } as never,
    })
    const scopedMember = (
      await payload.find({ collection: 'members', where: { email: { equals: scopedOwner.email } } })
    ).docs[0]
    await payload.create({
      collection: 'member-site-roles',
      data: { member: scopedMember.id, site: site.id, role: 'community-manager' },
    })
    const scopedAPI = (await operator(scopedOwner)).api
    check(
      'scoped owner cannot discover foreign theme state',
      (await scopedAPI.get(`/api/admin/themes?site=${beta.id}`)).status() === 403,
    )
    const foreignStateBefore = await readThemeState(themePool(payload), beta.id)
    const foreignWrite = await scopedAPI.post('/api/admin/themes', {
      data: {
        action: 'draft',
        site: beta.id,
        revision: foreignStateBefore.revision,
        id: 'renegade-party',
        version: '1.0.0',
      },
    })
    check(
      'scoped owner foreign theme mutation denied with unchanged state',
      foreignWrite.status() >= 400 &&
        JSON.stringify(await readThemeState(themePool(payload), beta.id)) ===
          JSON.stringify(foreignStateBefore),
    )
    check(
      'staff cannot change themes',
      (
        await staffAPI.post('/api/admin/themes', {
          data: { action: 'rollback', site: site.id, revision: before.revision },
        })
      ).status() === 403,
    )
    for (const route of ['patterns', 'templates', 'overview'])
      check(
        `foreign-site ${route} read denied`,
        (await staffAPI.get(`/api/layouts/${route}?siteId=${beta.id}`)).status() === 403,
      )
    check(
      'foreign-site reusable creation denied',
      (
        await staffAPI.post('/api/layouts/patterns', {
          data: {
            action: 'save',
            siteId: beta.id,
            name: 'forbidden',
            themeId: 'neutral-starter',
            blocks: [block('forbidden')],
          },
        })
      ).status() === 403,
    )
    const foreignTemplate = await create('page-layouts', {
      site: beta.id,
      path: `__template__/foreign-${stamp}`,
      surface: 'template',
      slot: 'main',
      themeId: 'neutral-starter',
      layoutVersion: 1,
      status: 'draft',
      blocks: [],
      revision: 1,
    })
    check(
      'foreign template ID cannot bypass an authorized site hint',
      (
        await staffAPI.get(
          `/api/layouts/templates?siteId=${site.id}&templateId=${foreignTemplate.id}`,
        )
      ).status() >= 400,
    )
    check(
      'denied foreign reusable creation leaves no forbidden record',
      (
        await payload.count({
          collection: 'page-layouts',
          where: { and: [{ site: { equals: beta.id } }, { name: { equals: 'forbidden' } }] },
        })
      ).totalDocs === 0,
    )
    const betaBefore = await readThemeState(themePool(payload), beta.id)
    const betaDraft = await api.post('/api/admin/themes', {
      data: {
        action: 'draft',
        site: beta.id,
        revision: betaBefore.revision,
        id: 'renegade-party',
        version: '1.0.0',
      },
    })
    assert.equal(betaDraft.status(), 200, await betaDraft.text())
    const betaSaved = await readThemeState(themePool(payload), beta.id)
    const foreignActivation = await api.post('/api/admin/themes', {
      data: { action: 'activate', site: beta.id, revision: betaSaved.revision },
    })
    check(
      'activation from wrong public host safely rejected',
      foreignActivation.status() === 400 &&
        JSON.stringify(await readThemeState(themePool(payload), beta.id)) ===
          JSON.stringify(betaSaved),
    )
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          site: site.id,
          path: canonical.canonicalPath,
          theme: await state(),
          records,
          asset: asset.id,
          assetHash,
          mediaPath: mediaPage.path,
        },
        null,
        2,
      ),
    )
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true })
      await context.addCookies([{ name: 'renegade-passkey', value: token, url: base }])
      const page = await context.newPage()
      page.on('pageerror', (error) => console.log('BROWSER ERROR', error.message))
      await page.goto('/admin/capabilities', { timeout: 180000, waitUntil: 'domcontentloaded' })
      await writeFile(`${out}/studio-dom.txt`, await page.locator('body').innerText())
      await page.screenshot({ path: `${out}/studio-entry.png` })
      await page.getByLabel('Theme site').selectOption(site.id)
      const themeTab = page.getByRole('tab', { name: 'Themes & Design Tokens' })
      await themeTab.click({ timeout: 180000 })
      await expect(themeTab).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByLabel('Design token overrides')).toHaveValue(/2rem/, {
        timeout: 60000,
      })
      check('Theme Studio reloads persisted tokens in actual Chromium UI', true)
      await page.screenshot({ path: `${out}/theme-studio.png`, fullPage: false })
      await page.goto(`/builder/${mediaPage.id}`, {
        timeout: 180000,
        waitUntil: 'domcontentloaded',
      })
      await page
        .getByRole('heading', { name: 'Renegade visual editor page / main', exact: true })
        .waitFor({ timeout: 180000 })
      check('editor loads separately from public theme pages', true)
    } finally {
      await browser.close()
    }
    await writeFile(
      `${out}/state.json`,
      JSON.stringify(
        {
          site: site.id,
          path: canonical.canonicalPath,
          theme: await state(),
          records,
          asset: asset.id,
          assetHash,
          mediaPath: mediaPage.path,
        },
        null,
        2,
      ),
    )
  }
  success = true
} catch (error) {
  console.error(error)
} finally {
  await writeFile(
    `${out}/${restart ? 'restart' : 'journey'}-trace.json`,
    JSON.stringify({ passed: trace.length, failed: success ? 0 : 1, skipped: 0, trace }, null, 2),
  )
  for (const id of sessions)
    await payload.db.pool.query('DELETE FROM admin_sessions WHERE id=$1', [id])
  await Promise.all(contexts.map((context) => context.dispose()))
  await payload.db.destroy?.()
  process.exit(success ? 0 : 1)
}
