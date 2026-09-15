import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

test('MED-01: publisher media library, chunk upload, media picker selection, and metadata management', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)

  // 1. Create a dedicated test site and publication
  const site = await payload.create({
    collection: 'sites',
    data: { name: `Media Site ${suffix}`, slug: `med-site-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)

  await payload.create({
    collection: 'publications',
    data: {
      site: site.id,
      name: `Media Pub ${suffix}`,
      slug: `med-pub-${suffix}`,
      canonicalBasePath: '/',
      status: 'active',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)

  // 2. Authenticate as administrative user
  const user = (
    await payload.find({ collection: 'users', limit: 1, overrideAccess: true } as never)
  ).docs[0] as unknown as { id: string | number; email?: string }
  expect(user).toBeTruthy()

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

  await context.addCookies([
    { name: 'renegade-passkey', value: session.token, url: 'http://localhost:3110' },
  ])

  // 3. Navigate to Media Library with site scoping
  await page.goto(`/admin/media-library?siteId=${site.id}`)

  await expect(page.getByRole('heading', { name: 'Media Library' })).toBeVisible()
  await expect(
    page.getByText(
      'Upload, organize, and select canonical media assets. Storage locations are never displayed.',
    ),
  ).toBeVisible()

  // 4. Exercise MediaUploader with file input
  const fileInput = page.locator('input[type="file"]')
  const filename = `hero-${suffix}.png`

  await fileInput.setInputFiles({
    name: filename,
    mimeType: 'image/png',
    buffer: PNG_BYTES,
  })

  // Verify upload progress and completion status
  await expect(page.getByText('Upload complete.')).toBeVisible({ timeout: 15_000 })

  // 5. Verify asset appears in MediaPicker
  const assetItemButton = page.getByRole('button', { name: new RegExp(filename, 'i') })
  await expect(assetItemButton).toBeVisible()

  // 6. Select asset via MediaPicker
  await assetItemButton.click()
  await expect(assetItemButton).toHaveAttribute('aria-pressed', 'true')

  // 7. Verify Selected Media Management section appears
  const managementSection = page.getByRole('region', { name: 'Selected media management' })
  await expect(managementSection).toBeVisible()

  // Verify delivery URL is canonical and internal storage path is NOT displayed
  const urlLocator = managementSection.locator('p').first()
  await expect(urlLocator).toBeVisible()
  const displayedUrl = await urlLocator.innerText()
  expect(displayedUrl).toMatch(/^\/media\/[a-f0-9-]+$/)
  expect(displayedUrl).not.toContain('/app/media')
  expect(displayedUrl).not.toContain('.upload-sessions')
  expect(displayedUrl).not.toContain('s3://')

  // 8. Update asset metadata
  const updatedTitle = `Updated Hero ${suffix}`
  const updatedAltText = `Accessible description for ${suffix}`
  const updatedCaption = `Captured by Renegade Test Suite ${suffix}`

  await managementSection.getByLabel('Title').fill(updatedTitle)
  await managementSection.getByLabel('Alt text').fill(updatedAltText)
  await managementSection.getByLabel('Caption').fill(updatedCaption)

  await managementSection.getByRole('button', { name: 'Save metadata' }).click()
  await expect(page.getByText('Metadata saved.')).toBeVisible()

  // 9. Confirm MediaPicker and Heading reflect updated metadata
  await expect(page.getByRole('button', { name: new RegExp(updatedTitle, 'i') })).toBeVisible()
  await expect(managementSection.getByRole('heading', { name: updatedTitle })).toBeVisible()

  // 10. Exercise Delete Orphaned Media
  page.on('dialog', (dialog) => dialog.accept())
  await managementSection.getByRole('button', { name: 'Delete orphaned media' }).click()
  await expect(page.getByText('Media deleted.')).toBeVisible()

  // Verify asset is removed from the picker list
  await expect(page.getByRole('button', { name: new RegExp(updatedTitle, 'i') })).not.toBeVisible()
})
