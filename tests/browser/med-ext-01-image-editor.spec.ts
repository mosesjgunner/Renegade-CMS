import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'

// 16x16 valid PNG image
const TEST_IMAGE_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff,
  0x61, 0x00, 0x00, 0x00, 0x19, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfc, 0xcf, 0x80, 0x01,
  0x30, 0x30, 0x30, 0xc0, 0x82, 0xa1, 0x08, 0x00, 0x00, 0x00, 0xff, 0xff, 0x03, 0x00, 0x0b, 0x50,
  0x01, 0x91, 0x58, 0x8e, 0x88, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
])

test('MED-EXT-01: miniPaint Image Editor opens CMoS image asset, initializes canvas layer, and handles modal controls', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)

  // 1. Create a dedicated test site and publication
  const site = await payload.create({
    collection: 'sites',
    data: { name: `Editor Site ${suffix}`, slug: `editor-site-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)

  await payload.create({
    collection: 'publications',
    data: {
      site: site.id,
      name: `Editor Pub ${suffix}`,
      slug: `editor-pub-${suffix}`,
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

  // 3. Navigate to Media Command Center
  await page.goto(`/admin/media-library?siteId=${site.id}`)

  await expect(page.getByRole('heading', { name: 'Media Command Center' })).toBeVisible({
    timeout: 15_000,
  })

  // 4. Open Uploader via "+ Upload Media" button
  await page.getByRole('button', { name: '+ Upload Media' }).click()

  const fileInput = page.locator('input[type="file"]')
  const filename = `editable-banner-${suffix}.png`

  await fileInput.setInputFiles({
    name: filename,
    mimeType: 'image/png',
    buffer: TEST_IMAGE_BYTES,
  })

  await expect(page.getByText(/Upload (finalized|complete)/i)).toBeVisible({ timeout: 15_000 })

  // 5. Navigate to Assets tab
  await page.getByRole('button', { name: /Assets \(/ }).click()

  // 6. Find the uploaded asset row in the table
  const assetRow = page.locator('tr', { hasText: filename })
  await expect(assetRow).toBeVisible({ timeout: 10_000 })

  // 7. Click "Edit Image" button on the asset row
  const editImageBtn = assetRow.getByRole('button', { name: 'Edit Image' })
  await expect(editImageBtn).toBeVisible()
  await editImageBtn.click()

  // 8. Verify modal container, header, and controls
  const modalHeader = page.getByRole('heading', { name: new RegExp(`Editing: ${filename}`, 'i') })
  await expect(modalHeader).toBeVisible()

  await expect(page.getByText('miniPaint')).toBeVisible()
  await expect(page.getByRole('button', { name: /Back to Media/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Redo' })).toBeVisible()
  await expect(page.getByText('Filename')).toBeVisible()
  await expect(page.getByText('Save as')).toBeVisible()

  // 9. Inspect iframe and miniPaint engine loading
  const iframeLocator = page.locator('iframe[title="miniPaint Editor"]')
  await expect(iframeLocator).toBeVisible()

  const iframe = page.frameLocator('iframe[title="miniPaint Editor"]')
  // Verify canvas element inside miniPaint iframe
  const canvas = iframe.locator('#canvas_minipaint')
  await expect(canvas).toBeVisible({ timeout: 20_000 })

  // 10. Verify through frame evaluation that miniPaint state and layers exist
  const frameHandle = await iframeLocator.elementHandle()
  expect(frameHandle).toBeTruthy()
  const contentFrame = await frameHandle?.contentFrame()
  expect(contentFrame).toBeTruthy()

  const isMiniPaintReady = await contentFrame?.evaluate(() => {
    const win = window as unknown as {
      Layers?: {
        get_dimensions: () => { width: number; height: number }
        get_active_layer?: () => { name: string }
      }
      app?: unknown
    }
    return Boolean(win.Layers && win.app)
  })
  expect(isMiniPaintReady).toBe(true)

  // 11. Save a non-destructive version through the Media API, then verify its persisted lifecycle.
  const editedTitle = `edited-banner-${suffix}`
  await page.getByLabel('Filename').fill(editedTitle)
  await page.getByRole('button', { name: 'Save version' }).click()
  await expect(modalHeader).not.toBeVisible()

  const original = (
    await payload.find({
      collection: 'media-assets',
      where: { originalFilename: { equals: filename } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as { id: string; replaceGloballyWith?: string }
  expect(original).toBeTruthy()
  expect(original.replaceGloballyWith).toBeTruthy()

  const replacement = (await payload.findByID({
    collection: 'media-assets',
    id: original.replaceGloballyWith,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as {
    id: string
    mimeType: string
    width: number
    height: number
    checksum: string
    originalFilename: string
  }
  expect(replacement).toMatchObject({
    title: editedTitle,
    mimeType: 'image/png',
    width: 16,
    height: 16,
    originalFilename: `${editedTitle}.png`,
  })
  expect(replacement.checksum).toMatch(/^sha256:/)

  const versions = await payload.find({
    collection: 'media-asset-versions',
    where: {
      and: [{ asset: { equals: replacement.id } }, { replacesAsset: { equals: original.id } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  expect(versions.docs[0]).toBeTruthy()

  // 12. The replacement is a media-library asset and can be reopened in the editor.
  await page.getByRole('button', { name: 'Refresh' }).click()
  const replacementRow = page.locator('tr', { hasText: editedTitle })
  await expect(replacementRow).toBeVisible({ timeout: 10_000 })
  await replacementRow.getByRole('button', { name: 'Edit Image' }).click()
  await expect(
    page.getByRole('heading', { name: new RegExp(`Editing: ${editedTitle}`, 'i') }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Back to Media/ }).click()
})
