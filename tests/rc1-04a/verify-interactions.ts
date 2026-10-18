import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium, expect as baseExpect } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { loginEditor } from './auth'
import { loadFixture } from './fixture'
const expect = baseExpect.configure({ timeout: 180000 })
assert.equal(process.env.RC1_04A_DISPOSABLE, 'yes')
assert.ok(process.env.DATABASE_URL?.endsWith(':5438/rc104a_release_acceptance'))
const out = process.env.RC1_04A_EVIDENCE_DIR ?? 'docs/rc/evidence/rc1/18-pass/04A'
const payload = await getPayload({ config })
const fixture = await loadFixture(payload, `${out}/fixture.json`)
const browser = await chromium.launch()
const context = await browser.newContext({
  baseURL: 'https://localhost:38909',
  ignoreHTTPSErrors: true,
  viewport: { width: 1920, height: 1080 },
})
const page = await context.newPage()
page.setDefaultTimeout(180000)
const trace: string[] = []
const check = (name: string, ok: unknown) => {
  assert.ok(ok, name)
  trace.push(name)
  console.log(`PASS ${trace.length}: ${name}`)
}
let succeeded = false
try {
  await loginEditor(payload, page, context, fixture.site)
  const layout = await payload.create({
    collection: 'page-layouts',
    data: {
      site: fixture.site,
      path: `/interaction-04a-${Date.now()}`,
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      layoutVersion: 1,
      status: 'draft',
      blocks: [],
      revision: 1,
    } as never,
  })
  await page.goto(`/builder/${layout.id}`, { timeout: 120000 })
  await expect(page.getByText('Renegade visual editor')).toBeVisible()
  if (await page.getByRole('button', { name: 'Reject non-essential' }).isVisible())
    await page.getByRole('button', { name: 'Reject non-essential' }).click()
  const source = await page.getByRole('button', { name: 'Hero', exact: true }).boundingBox()
  const target = await page.locator('iframe').boundingBox()
  assert.ok(source && target)
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + source.width / 2 + 15, source.y + source.height / 2 + 15, {
    steps: 5,
  })
  await page.mouse.move(target.x + target.width / 2, target.y + 90, { steps: 30 })
  await page.waitForTimeout(500)
  await page.mouse.up()
  await expect(page.getByLabel('Selected block').locator('option')).toHaveCount(2)
  check('native Puck pointer drag inserts a block into the canvas', true)
  await page.getByLabel('Selected block').selectOption('0')
  await page.locator('input[id$="_text_title"]:visible').fill('04A Dragged Hero')
  const save = page.waitForResponse(
    (r) => r.url().endsWith(`/api/layouts/${layout.id}`) && r.request().method() === 'PATCH',
  )
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  assert.equal((await save).status(), 200)
  const persisted = await payload.findByID({ collection: 'page-layouts', id: layout.id, depth: 0 })
  check(
    'dragged and configured block persists in PostgreSQL',
    JSON.stringify(persisted.blocks).includes('04A Dragged Hero'),
  )
  const activate = async (name: string) => {
    const button = page.getByRole('button', { name, exact: true })
    await button.focus()
    await page.keyboard.press('Enter')
  }
  await page.getByLabel('Selected block').selectOption('0')
  await activate('Duplicate block')
  await expect(page.getByLabel('Selected block').locator('option')).toHaveCount(3)
  check('keyboard Enter duplicates the selected block', true)
  await page.getByLabel('Selected block').selectOption('0')
  await activate('Move down')
  const saveKeyboard = async () => {
    await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeEnabled()
    const response = page.waitForResponse(
      (r) => r.url().endsWith(`/api/layouts/${layout.id}`) && r.request().method() === 'PATCH',
    )
    await activate('Save Draft')
    assert.equal((await response).status(), 200)
  }
  await saveKeyboard()
  const reordered = await payload.findByID({ collection: 'page-layouts', id: layout.id, depth: 0 })
  const originalId = (persisted.blocks as Array<{ id: string }>)[0].id
  check(
    'keyboard reorder persists the original block after its distinct duplicate',
    (reordered.blocks as Array<{ id: string }>)[1].id === originalId &&
      (reordered.blocks as Array<{ id: string }>)[0].id !== originalId,
  )
  await page.getByLabel('Selected block').selectOption('1')
  await activate('Delete block')
  await expect(page.getByLabel('Selected block').locator('option')).toHaveCount(2)
  await saveKeyboard()
  const remaining = await payload.findByID({ collection: 'page-layouts', id: layout.id, depth: 0 })
  check(
    'keyboard delete and save persist only the duplicate',
    (remaining.blocks as Array<{ id: string }>).length === 1 &&
      (remaining.blocks as Array<{ id: string }>)[0].id !== originalId,
  )
  await page.reload()
  await expect(page.getByLabel('Selected block').locator('option')).toHaveCount(2)
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: '04A Dragged Hero', exact: true }),
  ).toBeVisible()
  check('reload restores the keyboard-edited layout', true)
  await page.screenshot({ path: `${out}/drag.png`, fullPage: true })
  const broken = await payload.create({
    collection: 'page-layouts',
    data: {
      site: fixture.site,
      path: `/broken-04a-${Date.now()}`,
      themeId: 'neutral-starter',
      surface: 'page',
      slot: 'main',
      layoutVersion: 1,
      status: 'draft',
      blocks: [
        {
          id: 'legacy-section',
          component: 'removed.legacy',
          componentVersion: 1,
          props: { title: 'Preserve historical payload' },
        },
      ],
      revision: 1,
    } as never,
  })
  const before = JSON.stringify(broken.unknownBlocks)
  await page.goto(`/builder/${broken.id}`)
  await expect(page.getByRole('status').filter({ hasText: 'Repair required' })).toBeVisible()
  check('broken block shows usable repair notice', true)
  const saveBroken = page.waitForResponse(
    (r) => r.url().endsWith(`/api/layouts/${broken.id}`) && r.request().method() === 'PATCH',
  )
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  assert.equal((await saveBroken).status(), 200)
  check(
    'saving preserves unavailable block payload exactly',
    JSON.stringify(
      (await payload.findByID({ collection: 'page-layouts', id: broken.id, depth: 0 }))
        .unknownBlocks,
    ) === before,
  )
  await page.goto(`/builder/${broken.id}/preview`)
  await expect(page.locator('[data-unavailable-component="removed.legacy"]')).toBeVisible()
  check('preview renders safe unavailable-section fallback', true)
  succeeded = true
} catch (error) {
  console.error(error)
  await page.screenshot({ path: `${out}/interaction-failure.png`, fullPage: true }).catch(() => {})
} finally {
  await writeFile(
    `${out}/interactions.json`,
    JSON.stringify({ passed: trace.length, failed: succeeded ? 0 : 1, trace }, null, 2),
  )
  await browser.close()
  await payload.db.destroy?.()
  process.exit(succeeded ? 0 : 1)
}
