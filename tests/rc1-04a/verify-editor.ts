import { loadFixture } from './fixture'
import assert from 'node:assert/strict'
import { writeFile, readFile } from 'node:fs/promises'
import { chromium, expect as baseExpect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import sharp from 'sharp'
import { loginEditor } from './auth'
import { loadConfig } from '../../src/modules/core/config'

const expect = baseExpect.configure({ timeout: 180000 })
assert.equal(process.env.RC1_04A_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith(':5438/rc104a_release_acceptance'))
assert.equal(process.env.LOCAL_E2E_TEST_MODE, 'false')
const payload = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/04A'
const base = 'https://localhost:38909'
const trace: object[] = []
let checks = 0
const check = (name: string, ok: unknown) => {
  assert.ok(ok, name)
  checks++
  trace.push({ name, passed: true })
  console.log(`PASS ${checks}: ${name}`)
}
const browser = await chromium.launch()
const context = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true })
const page = await context.newPage()
page.setDefaultTimeout(180000)
page.on('response', async (response) => {
  if (response.url().includes('/api/layouts/') && response.status() >= 400)
    console.log('SAVE ERROR', response.status(), await response.text())
})
page.on('pageerror', (error) => console.log('BROWSER ERROR', error.message))
let succeeded = false
try {
  if (process.argv.includes('--restart')) {
    const state = JSON.parse(await readFile(`${out}/state.json`, 'utf8'))
    const row = await payload.findByID({ collection: 'page-layouts', id: state.id, depth: 0 })
    check(
      'exact layout blocks survive database and web restart',
      JSON.stringify(row.blocks) === JSON.stringify(state.blocks),
    )
    check('revision survives restart', row.revision === state.revision)
    const publicResponse = await page.request.get('/custom-04a-final', { timeout: 180000 })
    check(
      'publication survives restart',
      publicResponse.status() === 200 && (await publicResponse.text()).includes('04A Welcome'),
    )
  } else {
    const fixture = await loadFixture(payload, `${out}/fixture.json`)
    if (fixture.version !== 2) {
      const fresh = await payload.create({
        collection: 'page-layouts',
        data: {
          site: fixture.site,
          path: '/custom-04a-final',
          name: '04A final custom page',
          themeId: 'neutral-starter',
          surface: 'page',
          slot: 'main',
          status: 'draft',
          visibility: 'public',
          layoutVersion: 1,
          blocks: [],
          unknownBlocks: [],
          revision: 1,
          revisionHistory: [],
        } as never,
      })
      fixture.id = fresh.id
      fixture.version = 2
      await writeFile(`${out}/fixture.json`, JSON.stringify(fixture))
    }
    await payload.updateGlobal({
      slug: 'site-settings',
      overrideAccess: false,
      user: await payload.findByID({ collection: 'users', id: fixture.owner }),
      data: {
        canonicalOrigin: base,
        canonicalOriginsBySite: { [fixture.site]: base },
        launchState: 'live',
        indexingMode: 'index',
      } as never,
    })
    await loginEditor(payload, page, context, fixture.site)
    check(
      'genuine Chromium CTAP2 enrollment and UI passkey login',
      (await context.cookies()).some((cookie) => cookie.name === 'renegade-passkey'),
    )
    const layout = await payload.findByID({ collection: 'page-layouts', id: fixture.id })
    await page.goto(`/admin/collections/page-layouts/${layout.id}`, { timeout: 180000 })
    await expect(page.getByRole('link', { name: 'Open visual editor', exact: true })).toBeVisible({
      timeout: 180000,
    })
    check('native layout record exposes visual editor entry point', true)
    await page.getByRole('link', { name: 'Open visual editor', exact: true }).click()
    await expect(page.getByText('Renegade visual editor')).toBeVisible({ timeout: 180000 })
    if (await page.getByRole('button', { name: 'Reject non-essential' }).isVisible())
      await page.getByRole('button', { name: 'Reject non-essential' }).click()
    const read = () => payload.findByID({ collection: 'page-layouts', id: fixture.id, depth: 0 })
    const saved = async () => {
      await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeEnabled({
        timeout: 180000,
      })
      const response = page.waitForResponse(
        (r) => r.url().endsWith(`/api/layouts/${fixture.id}`) && r.request().method() === 'PATCH',
        { timeout: 180000 },
      )
      await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
      const r = await response
      assert.equal(r.status(), 200, await r.text())
      await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeEnabled({
        timeout: 180000,
      })
      return read()
    }
    while ((await page.getByLabel('Selected block').locator('option').count()) > 1) {
      await page.getByLabel('Selected block').selectOption('0')
      await page.getByRole('button', { name: 'Delete block', exact: true }).click()
    }
    await saved()
    const add = async (type: string, heading: string, index: number) => {
      await page.getByLabel('Block to add').selectOption(type)
      await page.getByRole('button', { name: 'Add block', exact: true }).focus()
      await page.keyboard.press('Enter')
      await page.getByLabel('Selected block').selectOption(String(index))
      await page.locator('input[id$="_text_title"]:visible').fill(heading)
    }
    await add('publisher.hero', '04A Welcome', 0)
    await page.locator('select[id$="_select_alignment"]:visible').selectOption({ label: 'center' })
    await page.locator('select[id$="_select_spacing"]:visible').selectOption({ label: 'relaxed' })
    await page
      .locator('select[id$="_select_background"]:visible')
      .selectOption({ label: 'surface' })
    await page.locator('select[id$="_select_emphasis"]:visible').selectOption({ label: 'bold' })
    await page
      .locator('textarea[id$="_textarea_body"]:visible')
      .fill('A complete page arranged visually.')
    await add('publisher.rich-content', '04A Story', 1)
    await page
      .locator('textarea[id$="_textarea_body"]:visible')
      .fill('Text written in the visual editor.')
    await add('publisher.image', '04A Photo', 2)
    const png = await sharp({
      create: { width: 80, height: 60, channels: 3, background: '#be123c' },
    })
      .png()
      .toBuffer()
    const upload = await page.request.post('/api/media/upload', {
      timeout: 180000,
      multipart: {
        siteId: fixture.site,
        title: '04A image',
        altText: '04A red image',
        file: { name: '04a.png', mimeType: 'image/png', buffer: png },
      },
    })
    assert.equal(upload.status(), 201, await upload.text())
    const media = (await upload.json()).asset
    const draftReader = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true })
    check(
      'draft-only media is unavailable to anonymous readers',
      (await draftReader.request.get(`/media/${media.id}`, { timeout: 180000 })).status() === 404,
    )
    await draftReader.close()
    // Wait for the refreshed chooser response before selecting the newly uploaded record.
    const choiceResponse = page.waitForResponse((r) =>
      r.url().endsWith(`/api/layouts/${fixture.id}/choices?kind=media`),
    )
    await page
      .locator('button:visible')
      .filter({ hasText: /^Refresh media choices$/ })
      .click()
    await choiceResponse
    await expect(
      page
        .locator('select[aria-label="Choose media from library"]:visible')
        .locator(`option[value="${media.id}"]`),
    ).toHaveCount(1, { timeout: 180000 })
    await page
      .locator('select[aria-label="Choose media from library"]:visible')
      .selectOption(String(media.id))
    check('canonical media upload and visual chooser work', !!media.id)
    const pub = (
      await payload.find({
        collection: 'publications',
        where: { site: { equals: fixture.site } },
        depth: 0,
      })
    ).docs[0]
    const destination = await payload.create({
      collection: 'content',
      data: {
        site: fixture.site,
        publication: pub.id,
        contentType: 'page',
        title: '04A Destination',
        slug: `destination-${Date.now()}`,
        status: 'published',
        visibility: 'public',
        body: {
          root: {
            type: 'root',
            version: 1,
            children: [
              {
                type: 'paragraph',
                version: 1,
                children: [{ type: 'text', text: '04A destination body', version: 1 }],
              },
            ],
          },
        },
      } as never,
    })
    await add('publisher.navigation', '04A Navigation', 3)
    await page
      .locator('select[aria-label="Choose internal destination"]:visible')
      .first()
      .selectOption(`content:${destination.id}`)
    await add('publisher.cta', '04A Join us', 4)
    await page
      .locator('select[aria-label="Choose internal destination"]:visible')
      .selectOption(`content:${destination.id}`)
    await page.getByRole('button', { name: 'Duplicate block', exact: true }).click()
    check(
      'duplicate creates a sixth block',
      (await page.getByLabel('Selected block').locator('option').count()) === 7,
    )
    await page.getByLabel('Selected block').selectOption('5')
    await page.getByRole('button', { name: 'Delete block', exact: true }).click()
    await page.getByLabel('Selected block').selectOption('4')
    await page.getByRole('button', { name: 'Move up', exact: true }).click()
    const row = await saved()
    const blocks = row.blocks as Array<{
      id: string
      component: string
      props: Record<string, unknown>
    }>
    check(
      'UI insertion configuration reorder duplicate delete persist',
      blocks.map((b) => b.component).join(',') ===
        'publisher.hero,publisher.rich-content,publisher.image,publisher.cta,publisher.navigation',
    )
    check(
      'text and canonical media persist',
      blocks[0].props.title === '04A Welcome' &&
        (blocks[2].props.media as { id: string }).id === media.id,
    )
    const firstRevision = row.revision
    await page.reload()
    await expect(page.getByLabel('Selected block').locator('option')).toHaveCount(6, {
      timeout: 180000,
    })
    check('reload restores all five blocks in order', (await read()).revision === firstRevision)
    await page.getByRole('button', { name: 'Switch to Mobile viewport', exact: true }).click()
    await expect
      .poll(() =>
        page
          .locator('iframe')
          .evaluate((e) => (e as HTMLIFrameElement).contentDocument!.documentElement.clientWidth),
      )
      .toBe(375)
    check('mobile canvas width is 375', true)
    await page.getByRole('button', { name: 'Switch to Tablet viewport', exact: true }).click()
    await page.getByRole('button', { name: 'Switch to Desktop viewport', exact: true }).click()
    await page.screenshot({ path: `${out}/layout.png`, fullPage: true })
    const preview = await context.newPage()
    await preview.goto(`/builder/${fixture.id}/preview?viewport=mobile`, { timeout: 180000 })
    await expect(preview.locator('[data-authenticated-draft-preview]')).toContainText('04A Welcome')
    await expect(preview.locator('[data-block="Hero"]')).toHaveCSS('text-align', 'center')
    await expect(preview.locator('[data-block="Hero"]')).toHaveCSS('padding-top', '48px')
    check('visual configuration changes rendered alignment and spacing', true)
    await expect(preview.getByRole('navigation', { name: '04A Navigation' })).toContainText(
      '04A Destination',
    )
    await expect
      .poll(() =>
        preview.getByAltText('04A red image').evaluate((e) => (e as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0)
    check('draft preview renders saved text navigation and media', true)
    await preview.close()
    const published = page.waitForResponse(
      (r) => r.url().endsWith(`/api/layouts/${fixture.id}`) && r.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Publish Live', exact: true }).click()
    assert.equal((await published).status(), 200)
    const anon = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true })
    const publicPage = await anon.newPage()
    await publicPage.goto('/custom-04a-final', { timeout: 180000 })
    await expect(publicPage.getByRole('heading', { name: '04A Welcome' })).toBeVisible()
    check(
      'anonymous public output is actual published visual page',
      (await publicPage.content()).includes('04A Story'),
    )
    await expect
      .poll(() =>
        publicPage
          .getByAltText('04A red image')
          .evaluate((e) => (e as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0)
    check('published image serves actual original bytes to anonymous browser', true)
    await page.getByLabel('Selected block').selectOption('0')
    await page.locator('input[id$="_text_title"]:visible').fill('04A Private later draft')
    await saved()
    await publicPage.reload()
    check(
      'later draft does not change published snapshot',
      !(await publicPage.content()).includes('04A Private later draft'),
    )
    const anonymousLayout = await anon.request.get(`/api/page-layouts/${fixture.id}`, {
      timeout: 180000,
    })
    const anonymousBody = await anonymousLayout.json()
    check(
      'anonymous native API excludes private draft blocks and history',
      !('blocks' in anonymousBody) &&
        !('revisionHistory' in anonymousBody) &&
        !JSON.stringify(anonymousBody).includes('04A Private later draft'),
    )
    // Rollback is invoked through the ordinary UI; it must update both stored blocks and Puck.
    await page.getByText('Revision history and rollback', { exact: true }).click()
    await page.getByPlaceholder('Target Revision Number').fill(String(firstRevision))
    await page.getByRole('button', { name: 'Rollback Revision' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Rolled back' })).toBeVisible({
      timeout: 180000,
    })
    await page.getByLabel('Selected block').selectOption('0')
    await expect(page.locator('input[id$="_text_title"]:visible')).toHaveValue('04A Welcome')
    check(
      'rollback restores persisted blocks and live canvas',
      JSON.stringify((await read()).blocks) === JSON.stringify(row.blocks),
    )
    const current = await read()
    const portable = {
      version: 1,
      id: fixture.id,
      siteId: fixture.site,
      path: current.path,
      status: current.status,
      themeId: current.themeId,
      surface: 'page',
      slot: 'main',
      blocks: current.blocks,
      unknownBlocks: [],
      revision: current.revision,
    }
    const patch = (value: object, expectedRevision = current.revision) =>
      page.request.patch(`/api/layouts/${fixture.id}`, {
        timeout: 180000,
        data: { layout: value, expectedRevision },
      })
    const before = JSON.stringify(current)
    const invalid = await patch({
      ...portable,
      blocks: [
        {
          id: 'bad',
          component: 'publisher.hero',
          componentVersion: 1,
          props: { title: '<script>bad</script>' },
        },
      ],
    })
    check('invalid block schema returns 422', invalid.status() === 422)
    const malformed = await patch({ ...portable, blocks: [null] })
    check('malformed block shape returns 422', malformed.status() === 422)
    const unknown = await patch({
      ...portable,
      blocks: [{ id: 'new-unknown', component: 'missing.block', componentVersion: 1, props: {} }],
    })
    check('new unknown blocks return 422', unknown.status() === 422)
    const stale = await patch(portable, 1)
    check('stale revision returns 409', stale.status() === 409)
    check('negative saves preserve exact database row', JSON.stringify(await read()) === before)
    const denied = await anon.request.patch(`/api/layouts/${fixture.id}`, {
      timeout: 180000,
      data: { layout: portable, expectedRevision: current.revision },
    })
    check('anonymous editing denied 403', denied.status() === 403)
    check(
      'anonymous draft preview denied',
      (await anon.request.get(`/builder/${fixture.id}/preview`, { timeout: 180000 })).status() ===
        404,
    )
    await anon.close()
    const scoped = await payload.create({
      collection: 'users',
      data: { email: `scoped-${Date.now()}@rc104a.test`, role: 'staff' } as never,
    })
    const member = (
      await payload.find({ collection: 'members', where: { email: { equals: scoped.email } } })
    ).docs[0]
    await payload.create({
      collection: 'member-site-roles',
      data: { member: member.id, site: fixture.site, role: 'contributor' },
    })
    const scopedSession = await createPasskeySession(
      { id: scoped.id, email: scoped.email },
      loadConfig().payloadSecret,
      async (id, expiresAt) => {
        await payload.db.pool.query(
          'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
          [id, scoped.id, expiresAt],
        )
      },
    )
    const restricted = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true })
    await restricted.addCookies([
      { name: 'renegade-passkey', value: scopedSession.token, url: base },
    ])
    const foreignBefore = await payload.findByID({
      collection: 'page-layouts',
      id: fixture.foreign,
      depth: 0,
    })
    check(
      'foreign-site save denied',
      (
        await restricted.request.patch(`/api/layouts/${fixture.foreign}`, {
          timeout: 180000,
          data: {
            layout: { ...portable, id: fixture.foreign },
            expectedRevision: foreignBefore.revision,
          },
        })
      ).status() === 403,
    )
    check(
      'foreign-site rollback denied',
      (
        await restricted.request.post(`/api/layouts/${fixture.foreign}/rollback`, {
          timeout: 180000,
          data: { targetRevision: 1, expectedRevision: foreignBefore.revision },
        })
      ).status() === 403,
    )
    check(
      'foreign-site chooser denied',
      (
        await restricted.request.get(`/api/layouts/${fixture.foreign}/choices?kind=media`, {
          timeout: 180000,
        })
      ).status() === 403,
    )
    check(
      'foreign-site draft preview denied',
      (
        await restricted.request.get(`/builder/${fixture.foreign}/preview`, { timeout: 180000 })
      ).status() === 404,
    )
    check(
      'foreign record remains byte-for-byte unchanged',
      JSON.stringify(
        await payload.findByID({ collection: 'page-layouts', id: fixture.foreign, depth: 0 }),
      ) === JSON.stringify(foreignBefore),
    )
    await restricted.close()
    const serverWrite = await patch({
      ...portable,
      blocks: blocks.map((block, i) =>
        i ? block : { ...block, props: { ...block.props, title: '04A Server win' } },
      ),
    })
    check('second editor saves a newer revision', serverWrite.status() === 200)
    await page.locator('input[id$="_text_title"]:visible').fill('04A Local conflicting work')
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Save conflict' })).toContainText(
      'Save conflict',
      { timeout: 180000 },
    )
    check(
      'conflict preserves local work for recovery',
      (
        await page.evaluate(
          (id) => sessionStorage.getItem(`renegade-layout-recovery:${id}`),
          fixture.id,
        )
      )?.includes('04A Local conflicting work'),
    )
    await page.getByRole('button', { name: 'Reload server version' }).click()
    await page.getByLabel('Selected block').selectOption('0')
    await expect(page.locator('input[id$="_text_title"]:visible')).toHaveValue('04A Server win')
    check('conflict reload replaces Puck canvas with server version', true)
    const concurrentBase = await read()
    const concurrent = await Promise.all(
      ['04A Concurrent A', '04A Concurrent B'].map((title) =>
        page.request.patch(`/api/layouts/${fixture.id}`, {
          timeout: 180000,
          data: {
            expectedRevision: concurrentBase.revision,
            layout: {
              ...portable,
              blocks: blocks.map((block, i) =>
                i ? block : { ...block, props: { ...block.props, title } },
              ),
            },
          },
        }),
      ),
    )
    check(
      'simultaneous writers produce one success and one 409',
      concurrent
        .map((r) => r.status())
        .sort()
        .join(',') === '200,409',
    )
    await page.reload()
    await page.getByLabel('Selected block').selectOption('0')
    const beforeNetwork = JSON.stringify(await read())
    await page.route(`**/api/layouts/${fixture.id}`, (route) =>
      route.request().method() === 'PATCH' ? route.abort('failed') : route.continue(),
    )
    await page.locator('input[id$="_text_title"]:visible').fill('04A Retried after network failure')
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Network error' })).toBeVisible()
    let protectedNavigation = false
    page.once('dialog', async (dialog) => {
      protectedNavigation = dialog.message().includes('unsaved')
      await dialog.dismiss()
    })
    await page.locator('a[href="/"]').filter({ hasText: 'Back' }).click()
    check(
      'unsaved-change guard cancels navigation after network failure',
      protectedNavigation && page.url().includes('/builder/'),
    )
    check(
      'network failure preserves database state',
      JSON.stringify(await read()) === beforeNetwork,
    )
    await page.unroute(`**/api/layouts/${fixture.id}`)
    await saved()
    check(
      'explicit retry persists the retained local work',
      JSON.stringify((await read()).blocks).includes('04A Retried after network failure'),
    )
    const final = await read()
    await writeFile(
      `${out}/state.json`,
      JSON.stringify({ id: final.id, blocks: final.blocks, revision: final.revision }, null, 2),
    )
  }
  succeeded = true
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {})
  console.log('FAILURE UI', (await page.locator('body').innerText()).slice(-5000))
  console.error(error instanceof Error ? error.message.split('Call log:')[0] : String(error))
} finally {
  await writeFile(`${out}/trace.json`, JSON.stringify({ checks, trace }, null, 2))
  await browser.close()
  await payload.db.destroy?.()
  process.exit(succeeded ? 0 : 1)
}
