import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'
import sharp from 'sharp'

import { loadConfig } from '@/modules/core/config'
import { createPasskeySession } from '@/modules/operations/passkey-auth'
import { processAssetVariants } from '@/modules/media/variants'

const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3110'

test('editorial media: upload, attach, reopen, publish, render a hero rendition, and replace', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000)
  const payload = await getPayload({ config })
  const suffix = randomUUID().slice(0, 8)
  const site = await payload.create({
    collection: 'sites',
    data: { name: `Editor media ${suffix}`, slug: `editor-media-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)
  await payload.create({
    collection: 'publications',
    data: {
      site: site.id,
      name: `Editor media ${suffix}`,
      slug: `editor-media-${suffix}`,
      canonicalBasePath: '/',
      status: 'active',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)
  const user = (await payload.create({
    collection: 'users',
    data: { email: `editor-media-${suffix}@example.test`, role: 'owner' },
    overrideAccess: true,
  } as never)) as unknown as { id: string; email: string }
  const session = await createPasskeySession(
    { id: String(user.id), email: user.email },
    loadConfig().payloadSecret,
    async (sessionId, expiresAt) => {
      await payload.db.pool.query(
        'INSERT INTO admin_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)',
        [sessionId, user.id, expiresAt],
      )
    },
  )
  await context.addCookies([
    { name: 'renegade-passkey', value: session.token, url: appUrl },
  ])

  const requests: Array<{ method: string; url: string; status: number }> = []
  page.on('response', (response) => {
    if (/\/api\/(?:admin\/editorial|media)/.test(response.url()))
      requests.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
      })
  })

  const title = `Media lifecycle ${suffix}`
  const slug = `media-lifecycle-${suffix}`
  const filename = `hero-${suffix}.png`
  const image = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 4,
      background: { r: 45, g: 90, b: 180, alpha: 1 },
    },
  })
    .png()
    .toBuffer()
  await page.goto(`/admin/posts?siteId=${site.id}`)
  await page.getByRole('button', { name: 'Create Post' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('URL slug').fill(slug)
  await page.getByLabel('Body').fill(`A real media draft ${suffix}.`)
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Post save.', { exact: true })).toBeVisible()

  await page
    .getByRole('region', { name: 'Post media' })
    .locator('input[type="file"]')
    .setInputFiles({
      name: filename,
      mimeType: 'image/png',
      buffer: image,
    })
  await expect(page.getByText(new RegExp(`${filename}: complete`, 'i'))).toBeVisible({
    timeout: 20_000,
  })
  const assetButton = page.getByRole('button', { name: new RegExp(filename, 'i') })
  await assetButton.click()
  await page.getByRole('button', { name: 'Attach selected media' }).click()
  await expect(page.getByText('Post save.', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('editor-attached-media.png'), fullPage: true })

  await page.getByRole('button', { name: 'Back to Posts' }).click()
  await page.getByRole('button', { name: title }).click()
  await expect(page.getByText('Selected hero media: Attached media', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(filename, 'i') })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const asset = (
    await payload.find({
      collection: 'media-assets',
      where: { and: [{ site: { equals: site.id } }, { originalFilename: { equals: filename } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as unknown as { id: string; kind: string; mimeType: string }
  expect(asset).toBeTruthy()
  expect(asset.kind).toBe('image')

  // The admin UI requests durable rendition work; the worker performs it separately.
  await page.goto(`/admin/media-library?siteId=${site.id}`)
  await page.getByRole('button', { name: new RegExp(filename, 'i') }).click()
  await page.getByRole('button', { name: 'Regenerate Variants' }).click()
  await expect(page.getByText(/Regeneration queued/)).toBeVisible()
  const processed = await processAssetVariants(payload, loadConfig(), asset.id, { force: true })
  expect(processed).not.toHaveLength(0)

  await page.goto(`/admin/posts?siteId=${site.id}`)
  await page.getByRole('button', { name: title }).click()
  await page.getByRole('button', { name: 'Request review' }).click()
  await expect(page.getByText('Post request review.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Post approve.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Schedule' }).click()
  await expect(page.getByText('Post schedule.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText('Post published.', { exact: true })).toBeVisible()
  const publicHref = await page
    .getByRole('link', { name: new RegExp(`/${slug}$`) })
    .getAttribute('href')
  expect(publicHref).toBeTruthy()
  await page.goto(new URL(publicHref!, appUrl).pathname)
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  const publicHero = page.locator('picture img').first()
  await expect(publicHero).toHaveAttribute('src', new RegExp(`/media/${asset.id}\\?variant=hero`))
  const rendition = await page.request.get(`/media/${asset.id}?variant=hero&format=jpeg&v=1`)
  expect(rendition.status()).toBe(200)
  expect(rendition.headers()['content-type']).toBe('image/jpeg')
  await page.screenshot({ path: testInfo.outputPath('public-hero-rendition.png'), fullPage: true })

  await page.goto(`/admin/media-library?siteId=${site.id}`)
  await page.getByRole('button', { name: new RegExp(filename, 'i') }).click()
  await page.getByText('Replace this asset').click()
  await page.getByRole('button', { name: 'Preview impact' }).click()
  await expect(page.getByLabel('Replacement impact')).toBeVisible()
  const replacementForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create replacement' }) })
  await replacementForm.locator('input[name="file"]').setInputFiles({
    name: `replacement-${filename}`,
    mimeType: 'image/png',
    buffer: image,
  })
  await replacementForm.locator('select[name="mode"]').selectOption('all-usages')
  await replacementForm.getByRole('button', { name: 'Create replacement' }).click()
  await expect(page.getByText('Replacement created with immutable audit evidence.')).toBeVisible()
  const original = (await payload.findByID({
    collection: 'media-assets',
    id: asset.id,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as { replaceGloballyWith?: string }
  expect(original.replaceGloballyWith).toBeTruthy()
  const versions = await payload.find({
    collection: 'media-asset-versions',
    where: { replacesAsset: { equals: asset.id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  expect(versions.docs).toHaveLength(1)
  await processAssetVariants(payload, loadConfig(), String(original.replaceGloballyWith), {
    recipeKeys: ['hero'],
    force: true,
  })
  const replacementRendition = await page.request.get(
    `/media/${asset.id}?variant=hero&format=jpeg&v=1`,
  )
  expect(replacementRendition.status()).toBe(200)

  const networkEvidence = JSON.stringify(requests, null, 2)
  await writeFile(testInfo.outputPath('editor-media-network.json'), networkEvidence)
  await testInfo.attach('editor-media-network.json', {
    body: networkEvidence,
    contentType: 'application/json',
  })
})
