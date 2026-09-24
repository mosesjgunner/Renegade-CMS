import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'
import sharp from 'sharp'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import { processAssetVariants } from '@/modules/media/variants'

test('MED-03: admin variant inspection, focal point preview, savings metrics, and regeneration', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  const payload = await getPayload({ config })
  const appConfig = loadConfig()
  const suffix = randomUUID().slice(0, 8)

  // 1. Dedicated test site and publication
  const site = await payload.create({
    collection: 'sites',
    data: { name: `Variant Site ${suffix}`, slug: `var-site-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)

  await payload.create({
    collection: 'publications',
    data: {
      site: site.id,
      name: `Variant Pub ${suffix}`,
      slug: `var-pub-${suffix}`,
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
    appConfig.payloadSecret,
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

  // 3. Generate a real 1200x800 image fixture
  const fixtureBuffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 4,
      background: { r: 66, g: 133, b: 244, alpha: 1 },
    },
  })
    .png()
    .toBuffer()

  // 4. Navigate to Media Library with site scoping
  await page.goto(`/admin/media-library?siteId=${site.id}`)
  await expect(page.getByRole('heading', { name: 'Media Library' })).toBeVisible()

  // 5. Upload image
  const fileInput = page.locator('input[type="file"]')
  const filename = `scenic-${suffix}.png`

  await fileInput.setInputFiles({
    name: filename,
    mimeType: 'image/png',
    buffer: fixtureBuffer,
  })

  await expect(page.getByText('Upload complete.')).toBeVisible({ timeout: 15_000 })

  // 6. Find asset ID and ensure variants are generated so inspection table renders immediately
  const assetRecord = (
    await payload.find({
      collection: 'media-assets',
      where: { and: [{ site: { equals: site.id } }, { originalFilename: { equals: filename } }] },
      limit: 1,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as { id: string }
  expect(assetRecord).toBeTruthy()

  await processAssetVariants(payload, appConfig, assetRecord.id, {
    recipeKeys: ['thumbnail', 'inline', 'hero', 'og'],
  })

  // 7. Select uploaded asset
  const assetButton = page.getByRole('button', { name: new RegExp(filename, 'i') })
  await expect(assetButton).toBeVisible()
  await assetButton.click()

  // 8. Verify Variant Inspection section is displayed
  await expect(
    page.getByRole('heading', { name: 'Generated Variants & Optimization' }),
  ).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText(/Saved \d+(\.\d+)?%/)).toBeVisible()

  // 9. Inspect variant table rows
  await expect(page.getByText('Thumbnail (WEBP)')).toBeVisible()
  await expect(page.getByText('Inline Content (WEBP)')).toBeVisible()
  await expect(page.getByText('Hero (WEBP)')).toBeVisible()

  // 10. Verify focal point crosshair container and interact
  const focalContainer = page.getByLabel('Focal point preview')
  await expect(focalContainer).toBeVisible()
  await focalContainer.click({ position: { x: 50, y: 50 } })

  // Save focal point
  const saveFocalBtn = page.getByRole('button', { name: 'Save Focal Point' })
  await expect(saveFocalBtn).toBeVisible()
  await saveFocalBtn.click()
  await expect(page.getByText('Focal point updated.')).toBeVisible({ timeout: 10_000 })

  // 11. Trigger variant regeneration
  const regenBtn = page.getByRole('button', { name: 'Regenerate Variants' })
  await expect(regenBtn).toBeVisible()
  await regenBtn.click()
  await expect(page.getByText(/Regeneration queued/)).toBeVisible({ timeout: 10_000 })
})
