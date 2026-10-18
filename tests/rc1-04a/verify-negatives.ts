import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium, expect as baseExpect, request } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'
import { loadConfig } from '../../src/modules/core/config'
import { loadFixture } from './fixture'
import { loginEditor } from './auth'
assert.equal(process.env.RC1_04A_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith(':5438/rc104a_release_acceptance'))
const expect = baseExpect.configure({ timeout: 180000 })
const payload = await getPayload({ config })
const out = 'docs/rc/evidence/rc1/18-pass/04A'
const base = 'https://localhost:38909'
const fixture = await loadFixture(payload, `${out}/fixture.json`)
const browser = await chromium.launch()
const context = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true })
const page = await context.newPage()
page.setDefaultTimeout(180000)
const trace: string[] = []
const check = (name: string, ok: unknown) => {
  assert.ok(ok, name)
  trace.push(name)
  console.log(`PASS ${trace.length}: ${name}`)
}
const contexts: import('@playwright/test').APIRequestContext[] = []
const apiFor = async (state?: Awaited<ReturnType<typeof context.storageState>>) => {
  const api = await request.newContext({
    baseURL: base,
    ignoreHTTPSErrors: true,
    timeout: 180000,
    ...(state ? { storageState: state } : {}),
  })
  contexts.push(api)
  return api
}
let succeeded = false
try {
  await loginEditor(payload, page, context, fixture.site)
  const actorApi = await apiFor(await context.storageState())
  const anonymousApi = await apiFor()
  const anon = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true })
  await page.goto(`/builder/${fixture.id}`, { timeout: 180000 })
  await expect(page.getByText('Renegade visual editor')).toBeVisible()
  if (await page.getByRole('button', { name: 'Reject non-essential' }).isVisible())
    await page.getByRole('button', { name: 'Reject non-essential' }).click()
  await page.getByLabel('Selected block').selectOption('0')
  const read = () => payload.findByID({ collection: 'page-layouts', id: fixture.id, depth: 0 })
  const initial = await read()
  const blocks = initial.blocks as Array<{
    id: string
    component: string
    props: Record<string, unknown>
  }>
  const saved = async () => {
    await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeEnabled()
    const response = page.waitForResponse(
      (r) => r.url().endsWith(`/api/layouts/${fixture.id}`) && r.request().method() === 'PATCH',
      { timeout: 180000 },
    )
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
    const result = await response
    assert.equal(result.status(), 200)
    await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeEnabled()
    return read()
  }
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
    actorApi.patch(`/api/layouts/${fixture.id}`, {
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
  const denied = await anonymousApi.patch(`/api/layouts/${fixture.id}`, {
    data: { layout: portable, expectedRevision: current.revision },
  })
  check('anonymous editing denied 403', denied.status() === 403)
  check(
    'anonymous draft preview denied',
    (await anonymousApi.get(`/builder/${fixture.id}/preview`)).status() === 404,
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
  await restricted.addCookies([{ name: 'renegade-passkey', value: scopedSession.token, url: base }])
  const restrictedApi = await apiFor(await restricted.storageState())
  check(
    'scoped staff session can read its allowed site choices',
    (await restrictedApi.get(`/api/layouts/${fixture.id}/choices?kind=link`)).status() === 200,
  )
  const foreignBefore = await payload.findByID({
    collection: 'page-layouts',
    id: fixture.foreign,
    depth: 0,
  })
  check(
    'foreign-site save denied',
    (
      await restrictedApi.patch(`/api/layouts/${fixture.foreign}`, {
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
      await restrictedApi.post(`/api/layouts/${fixture.foreign}/rollback`, {
        data: { targetRevision: 1, expectedRevision: foreignBefore.revision },
      })
    ).status() === 403,
  )
  check(
    'foreign-site chooser denied',
    (await restrictedApi.get(`/api/layouts/${fixture.foreign}/choices?kind=media`)).status() ===
      403,
  )
  check(
    'foreign-site draft preview denied',
    (await restrictedApi.get(`/builder/${fixture.foreign}/preview`)).status() === 404,
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
      actorApi.patch(`/api/layouts/${fixture.id}`, {
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
  check('network failure preserves database state', JSON.stringify(await read()) === beforeNetwork)
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
  succeeded = true
} catch (error) {
  console.error(error instanceof Error ? error.message.split('Call log:')[0] : String(error))
  await page.screenshot({ path: `${out}/negative-failure.png`, fullPage: true }).catch(() => {})
} finally {
  await writeFile(
    `${out}/negative-trace.json`,
    JSON.stringify({ passed: trace.length, failed: succeeded ? 0 : 1, trace }, null, 2),
  )
  await Promise.all(contexts.map((api) => api.dispose()))
  await browser.close()
  await payload.db.destroy?.()
  process.exit(succeeded ? 0 : 1)
}
