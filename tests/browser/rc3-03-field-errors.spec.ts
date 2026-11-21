import { expect, test, type Page } from '@playwright/test'
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

/**
 * RC3-03 — field-level editor errors (F1/F2 regression).
 *
 * A failed save must surface the failure AT the field, for a native
 * field, the custom HeadlineField, and a nested array subfield alike:
 * a visible message announced as an alert, `aria-invalid` +
 * `aria-describedby` wiring on the control, focus moved to the first
 * failing control, and a correction that persists after reload.
 *
 * On the RC2 baseline every case below fails the same way: the server
 * answers 400 with prose only (`{message}`, no per-field data — F1),
 * so the admin renders no field error at all and focus is lost to
 * BODY (recorded in docs/rc3/evidence/RC3-03/RESULT.md).
 */

let payload: Payload
let adminCookie = ''
let categoryId = ''
let draftId = ''
const suffix = Math.random().toString(36).slice(2, 10)

test.beforeAll(async () => {
  test.setTimeout(300_000)
  payload = await getPayload({ config })
  const user = (
    await payload.find({ collection: 'users', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string; email?: string }
  expect(user, 'fixture seed must provide an operator user').toBeTruthy()
  const session = await createPasskeySession(
    { id: String(user.id), email: String(user.email) },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sessionId, user.id, expiresAt],
      )
    },
  )
  adminCookie = session.token
  const site = (
    await payload.find({ collection: 'sites', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string }
  expect(site, 'fixture seed must provide a site').toBeTruthy()
  const category = await payload.create({
    collection: 'categories',
    data: {
      site: site.id,
      scope: 'site',
      name: `RC303 Category ${suffix}`,
      slug: `rc303-category-${suffix}`,
    },
    overrideAccess: true,
  } as never)
  categoryId = String((category as unknown as { id: string }).id)
  const draft = await payload.create({
    collection: 'content',
    data: {
      site: site.id,
      title: `RC303 Draft ${suffix}`,
      contentType: 'article',
      status: 'draft',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)
  draftId = String((draft as unknown as { id: string }).id)
})

const openEditor = async (page: Page, path: string) => {
  await page
    .context()
    .addCookies([{ name: 'renegade-passkey', value: adminCookie, url: 'http://localhost:3110' }])
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(1500)
}

const save = async (page: Page) => {
  // A beat between the last edit and the click, so the form has
  // registered the change before the submit reads it.
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /^save/i }).first().click()
}

/** The full field-level contract for one failing control. */
const expectFieldError = async (page: Page, inputName: string) => {
  const input = page.locator(`input[name="${inputName}"], textarea[name="${inputName}"]`).first()
  await expect(input).toHaveAttribute('aria-invalid', 'true', { timeout: 20_000 })
  const describedBy = await input.getAttribute('aria-describedby')
  expect(describedBy, 'failing control must be described by its error').toBeTruthy()
  const errorId = (describedBy ?? '').split(/\s+/).find((token) => token.includes('error'))
  expect(errorId).toBeTruthy()
  const error = page.locator(`#${errorId}`)
  await expect(error).toBeVisible()
  await expect(error).toHaveAttribute('role', 'alert')
  await expect(error).not.toHaveText('')
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('name'))
  expect(focused, 'focus must move to the first failing control').toBe(inputName)
}

const expandCollapsible = async (page: Page, label: string) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate((labelText) => {
      const span = [...document.querySelectorAll('.row-label')].find(
        (el) => el.textContent?.trim() === labelText,
      )
      const toggle = span?.closest('.collapsible-field')?.querySelector('.collapsible__toggle')
      if (toggle?.className.includes('--collapsed')) {
        ;(toggle as HTMLElement).click()
      }
    }, label)
    await page.waitForTimeout(900)
    const open = await page.evaluate((labelText) => {
      const span = [...document.querySelectorAll('.row-label')].find(
        (el) => el.textContent?.trim() === labelText,
      )
      const toggle = span?.closest('.collapsible-field')?.querySelector('.collapsible__toggle')
      return toggle ? !toggle.className.includes('--collapsed') : false
    }, label)
    if (open) return
  }
  throw new Error(`could not expand collapsible ${label}`)
}

test('RC3-03 custom HeadlineField: cleared title fails at the field and the correction persists', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await openEditor(page, `/admin/collections/content/${draftId}`)
  const title = page.locator('input[name="title"]').first()
  await title.click()
  await title.fill('')
  await save(page)
  await expectFieldError(page, 'title')
  await title.fill('RC303 Corrected Headline')
  await save(page)
  await expect(page.locator('.field-error')).toHaveCount(0, { timeout: 20_000 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await expect(page.locator('input[name="title"]').first()).toHaveValue('RC303 Corrected Headline')
})

test('RC3-03 native field: cleared category name fails at the field and the correction persists', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await openEditor(page, `/admin/collections/categories/${categoryId}`)
  const name = page.locator('input[name="name"]').first()
  await name.click()
  await name.fill('')
  await save(page)
  await expectFieldError(page, 'name')
  await name.fill('RC303 Category Corrected')
  await save(page)
  await expect(page.locator('.field-error')).toHaveCount(0, { timeout: 20_000 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await expect(page.locator('input[name="name"]').first()).toHaveValue('RC303 Category Corrected')
})

test('RC3-03 nested field: a correction notice without its label fails at the subfield and the correction persists', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await openEditor(page, `/admin/collections/content/${draftId}`)
  await expandCollapsible(page, 'Article details and classification')
  const addNotice = page.getByRole('button', { name: 'Add Correction Notice' })
  await addNotice.waitFor({ state: 'visible', timeout: 15_000 })
  await addNotice.click()
  await page.waitForTimeout(800)
  await page
    .locator('textarea[name="correctionNotices.0.detail"]')
    .first()
    .fill('A correction without its label.')
  const issued = page.locator('#field-correctionNotices__0__issuedAt input').first()
  await issued.click()
  await issued.fill('11/20/2026')
  await page.keyboard.press('Enter')
  await save(page)
  await expectFieldError(page, 'correctionNotices.0.label')
  await page.locator('input[name="correctionNotices.0.label"]').first().fill('Correction')
  await save(page)
  await expect(page.locator('.field-error')).toHaveCount(0, { timeout: 20_000 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await expandCollapsible(page, 'Article details and classification')
  // Saved array rows reload collapsed; open the row if its fields are
  // not yet rendered.
  const labelInput = page.locator('input[name="correctionNotices.0.label"]').first()
  if (!(await labelInput.isVisible().catch(() => false))) {
    await page
      .locator('.field-type.array-field')
      .filter({ hasText: 'Correction Notices' })
      .locator('button')
      .first()
      .click()
    await page.waitForTimeout(900)
  }
  await expect(labelInput).toHaveValue('Correction')
})
