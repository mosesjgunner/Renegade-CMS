import { expect, test } from '@playwright/test'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ensureBootstrap } from '@/modules/operations/installation'
import { loadConfig } from '@/modules/core/config'

test('owner can find publishing actions and saved history after ordinary setup', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => warnings.push(String(args[0] ?? ''))
  let status
  try {
    status = await ensureBootstrap(payload, loadConfig())
  } finally {
    console.warn = originalWarn
  }
  expect(status.state).toBe('incomplete')
  const token = warnings.map((line) => line.match(/: ([A-Za-z0-9_-]+)$/)?.[1]).find(Boolean)
  expect(token).toHaveLength(43)

  const client = await context.newCDPSession(page)
  await client.send('WebAuthn.enable')
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/setup')
  await page.getByLabel('Bootstrap token').fill(token!)
  await page.getByLabel('Owner email').fill('product-ui-owner@example.test')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Site or publication name').fill('Product UI Test')
  await page.getByLabel('Site slug').fill('product-ui-test')
  await page.getByLabel('Primary URL').fill('http://localhost:3110')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()
  await expect(page.getByRole('heading', { name: 'Your site is ready to shape.' })).toBeVisible()

  await page.goto('/admin/posts')
  await expect(page.getByRole('heading', { name: 'Posts', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create Post' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Your first draft' })).toBeVisible()
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'Saved revisions' })).toBeVisible()
  await expect(page.getByText('No saved body revisions are available.')).toBeVisible()
  await page.goto('/admin/posts')
  await page.getByRole('link', { name: 'Create Post' }).click()
  await expect(page.getByText('Editing a post.')).toBeVisible()

  await page.goto('/admin/pages')
  await expect(page.getByRole('heading', { name: 'Pages', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Create Page' }).click()
  await expect(page.getByText('Editing a page.')).toBeVisible()

  await page.goto('/admin/posts')
  await page.getByRole('link', { name: 'Your first draft' }).click()
  const editor = page.locator('[contenteditable="true"]').first()
  await expect(editor).toBeVisible()
  for (const phrase of ['First saved change for history.', 'Second saved change for history.']) {
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await editor.pressSequentially(phrase)
    await expect(editor).toContainText(phrase)
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/content/') && response.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await page.reload()
    await expect(editor).toContainText(phrase)
  }
  await page.goto('/admin/posts')
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.getByText('Second saved change for history.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore revision 1' })).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Restore revision 1' }).click()
  await expect(
    page.getByText('Revision 1 was restored as a new saved revision.', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByText('First saved change for history.', { exact: true }).first(),
  ).toBeVisible()

  const editorPath = await page.getByRole('link', { name: 'Back to editor' }).getAttribute('href')
  const contentId = editorPath!.split('/').pop()!
  const approved = await page.request.patch(`/api/content/${contentId}`, {
    data: { status: 'approved' },
  })
  expect(approved.status()).toBe(200)
  await page.goto('/admin/posts?status=approved')
  await expect(page.getByRole('link', { name: 'Your first draft' })).toBeVisible()
  await page.getByText('Schedule', { exact: true }).click()
  await page.getByLabel('Local date and time').fill('2030-01-01T12:00')
  const scheduled = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/calendar/schedule') &&
      response.request().method() === 'POST',
  )
  const reloaded = page.waitForEvent('load')
  await page.getByRole('button', { name: 'Confirm schedule' }).click()
  expect((await scheduled).status()).toBe(200)
  await reloaded
  await page.goto('/admin/posts?status=scheduled')
  await expect(page.getByRole('link', { name: 'Your first draft' })).toBeVisible()
  await page.screenshot({ path: 'test-results/product-publishing-desktop.png', fullPage: true })

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/admin/posts')
  await expect(page.getByRole('heading', { name: 'Posts', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create Post' })).toBeVisible()
  await page.screenshot({ path: 'test-results/product-publishing-mobile.png', fullPage: true })

  const denied = await page.request.get('/api/admin/workflow/revisions?contentId=missing')
  expect(denied.status()).toBe(403)
  expect(errors).toEqual([])
})
