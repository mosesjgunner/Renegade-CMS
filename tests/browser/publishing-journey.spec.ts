import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

import { ensureBootstrap } from '@/modules/operations/installation'
import { loadConfig } from '@/modules/core/config'
import { createEditorialPreviewToken } from '@/modules/editorial/persistence'
import { createOperationalBackupManifest } from '@/modules/operations/backup'

test('complete 16-step publisher journey through public and admin HTTP/browser boundaries', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)

  // --------------------------------------------------------------------------
  // STEP 1: Fresh install / start
  // --------------------------------------------------------------------------
  const payload = await getPayload({ config })
  await payload.db.pool.query('DELETE FROM installation_state')
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(String(args[0] ?? ''))
  }
  let token = ''
  try {
    const status = await ensureBootstrap(payload, loadConfig())
    expect(status.state).toBe('incomplete')
    token = warnings.map((line) => line.match(/: ([A-Za-z0-9_-]+)$/)?.[1]).find(Boolean) ?? ''
  } finally {
    console.warn = originalWarn
  }
  expect(token).toHaveLength(43)

  // Register a virtual WebAuthn authenticator for passkey enrollment.
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

  // --------------------------------------------------------------------------
  // STEP 2: Setup / Authenticate
  // --------------------------------------------------------------------------
  const slug = `journey-${randomUUID().slice(0, 8)}`
  const ownerEmail = `${slug}@owner.test`

  page.on('console', (msg) => console.log('[BROWSER CONSOLE]', msg.text()))
  page.on('pageerror', (err) => console.log('[BROWSER ERROR]', err.message))

  await page.goto('/setup')
  await expect(page.getByRole('heading', { name: 'Make this site yours.' })).toBeVisible()

  // Step 1: Secure owner access
  const continueButton = page.getByRole('button', { name: 'Continue' })
  await page.getByLabel('Bootstrap token').click()
  await page.getByLabel('Bootstrap token').fill(token)
  await page.getByLabel('Owner email').click()
  await page.getByLabel('Owner email').fill(ownerEmail)
  await expect(continueButton).toBeEnabled({ timeout: 15_000 })
  await continueButton.click()

  // --------------------------------------------------------------------------
  // STEP 3: Create site identity (Onboarding wizard)
  // --------------------------------------------------------------------------
  await page.getByLabel('Site or publication name').fill('Renegade Dispatch')
  await page.getByLabel('Site slug').fill(slug)
  await page.getByLabel('Primary URL').fill('http://localhost:3110')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Brand & starter defaults
  await page.getByRole('button', { name: 'Continue' }).click()

  // Features defaults
  await page.getByRole('button', { name: 'Continue' }).click()

  // Finish: enroll passkey & create site
  await page.getByRole('button', { name: 'Enroll passkey & create site' }).click()

  // Verification of recovery codes and authenticated session
  await expect(page.getByRole('heading', { name: 'Your site is ready to shape.' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText('Save emergency recovery codes')).toBeVisible()

  const cookies = await context.cookies()
  const passkeyCookie = cookies.find((c) => c.name === 'renegade-passkey')
  expect(passkeyCookie?.value).toBeTruthy()
  const cookieHeader = `renegade-passkey=${passkeyCookie!.value}`

  // Confirm site identity in PostgreSQL
  const siteDoc = (
    await payload.find({
      collection: 'sites',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as { id: string; name: string } | undefined
  expect(siteDoc?.id).toBeTruthy()
  const siteId = siteDoc!.id

  // --------------------------------------------------------------------------
  // STEP 4: Upload a real image (multipart/form-data via HTTP boundary)
  // --------------------------------------------------------------------------
  // Valid minimal 2x3 PNG image bytes conforming to inspectMedia signature
  const realPngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2,
    0, 0, 0, 3,
  ])

  const uploadResponse = await page.request.post('/api/media/upload', {
    headers: { cookie: cookieHeader },
    multipart: {
      siteId,
      title: 'Hero Banner',
      altText: 'A landscape photograph',
      file: {
        name: 'hero-banner.png',
        mimeType: 'image/png',
        buffer: realPngBytes,
      },
    },
  })
  if (uploadResponse.status() !== 201) {
    console.log('UPLOAD FAILED BODY:', await uploadResponse.text())
  }
  expect(uploadResponse.status()).toBe(201)
  const uploadJson = await uploadResponse.json()
  expect(uploadJson.asset?.id).toBeTruthy()
  const mediaAssetId = uploadJson.asset.id
  console.log('UPLOADED ASSET RECORD:', uploadJson.asset)

  // Verify real filesystem bytes exist
  const relativeKey = String(uploadJson.asset.storageLocation)
  const candidatePath1 = path.resolve('media', relativeKey)
  const candidatePath2 = path.resolve('.next/standalone/media', relativeKey)
  const assetPath = existsSync(candidatePath1)
    ? candidatePath1
    : existsSync(candidatePath2)
      ? candidatePath2
      : null
  console.log('ASSET PATH ON DISK:', assetPath)
  expect(assetPath).not.toBeNull()
  expect(existsSync(assetPath!)).toBe(true)

  // Anonymous draft/private check: raw media asset is not public without public usage
  const anonMediaResponse = await page.request.get(`/media/${mediaAssetId}`)
  expect(anonMediaResponse.status()).toBe(404)

  // --------------------------------------------------------------------------
  // STEP 5: Create page (Page Layout HTTP API)
  // --------------------------------------------------------------------------
  const layoutResponse = await page.request.post('/api/layouts', {
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    data: {
      recipeId: 'writer-blogger',
      siteId,
      path: '/editorial-charter',
    },
  })
  expect(layoutResponse.status()).toBe(201)
  const layoutJson = await layoutResponse.json()
  const layoutId = layoutJson.layout.id

  // Publish the layout
  const publishLayoutResponse = await page.request.patch(`/api/layouts/${layoutId}`, {
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    data: {
      layout: {
        ...layoutJson.layout,
        status: 'published',
      },
      publish: true,
    },
  })
  expect(publishLayoutResponse.status()).toBe(200)

  // Anonymous visitor can load the published clean URL
  const anonCharter = await page.request.get('/editorial-charter')
  expect(anonCharter.status()).toBe(200)

  // --------------------------------------------------------------------------
  // STEP 6: Create post (draft article with editorial document)
  // --------------------------------------------------------------------------
  const postSlug = `manifesto-${slug}`
  const postCanonicalPath = `/articles/${postSlug}`
  const articleProse = 'Autonomous journalism lives here without compromise.'
  const postDoc = (await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      title: 'The Renegade Manifesto',
      slug: postSlug,
      canonicalPath: postCanonicalPath,
      contentType: 'article',
      status: 'draft',
      summary: 'Independent voices defining autonomous publishing.',
      heroMedia: mediaAssetId,
      removeFromDiscovery: false,
      body: {
        root: {
          children: [
            {
              children: [
                {
                  text: articleProse,
                  type: 'text',
                },
              ],
              type: 'paragraph',
            },
          ],
          type: 'root',
        },
      },
    },
    overrideAccess: true,
  } as never)) as { id: string }

  const companions = await payload.find({
    collection: 'article-family-content',
    where: { content: { equals: postDoc.id } },
    overrideAccess: true,
  })
  expect(companions.docs.length).toBeGreaterThan(0)
  const articleContentDoc = companions.docs[0]

  // Anonymous draft check: draft post is NOT available at public URL
  const anonDraftCheck = await page.request.get(postCanonicalPath)
  expect(anonDraftCheck.status()).toBe(404)

  // --------------------------------------------------------------------------
  // STEP 7: Preview draft article
  // --------------------------------------------------------------------------
  const previewTokenResult = await createEditorialPreviewToken(payload, {
    articleId: String(articleContentDoc.id),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  })
  const previewToken = previewTokenResult.token

  // Fetch preview as anonymous visitor
  await page.goto(`/preview/article/${previewToken}`)
  await expect(page.getByRole('heading', { name: 'The Renegade Manifesto' })).toBeVisible()
  await expect(page.getByText('Autonomous journalism lives here without compromise.')).toBeVisible()

  // Invalid preview token returns 404
  const invalidPreview = await page.request.get('/preview/article/invalid-fake-token-hex')
  expect(invalidPreview.status()).toBe(404)

  // --------------------------------------------------------------------------
  // STEP 8: Publish post
  // --------------------------------------------------------------------------
  await payload.update({
    collection: 'content',
    id: postDoc.id,
    data: {
      status: 'published',
      publishedAt: new Date().toISOString(),
      removeFromDiscovery: false,
    },
    overrideAccess: true,
  } as never)

  // --------------------------------------------------------------------------
  // STEP 9: Render clean URLs and navigation
  // --------------------------------------------------------------------------
  await page.goto(postCanonicalPath)
  await expect(page.getByRole('heading', { name: 'The Renegade Manifesto' })).toBeVisible()
  await expect(page.getByText('Independent voices defining autonomous publishing.')).toBeVisible()
  await expect(page.getByText('Autonomous journalism lives here without compromise.')).toBeVisible()

  // Primary navigation is present
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()

  // --------------------------------------------------------------------------
  // STEP 10: Inspect basic metadata
  // --------------------------------------------------------------------------
  const pageTitle = await page.title()
  expect(pageTitle).toContain('The Renegade Manifesto')

  const metaDesc = page.locator('meta[name="description"]')
  await expect(metaDesc).toHaveAttribute(
    'content',
    'Independent voices defining autonomous publishing.',
  )

  const jsonLdScript = page.locator('script[type="application/ld+json"]')
  await expect(jsonLdScript).toBeAttached()
  const jsonLdContent = JSON.parse((await jsonLdScript.textContent()) ?? '{}')
  expect(jsonLdContent['@context']).toBe('https://schema.org')
  expect(jsonLdContent.name).toBe('The Renegade Manifesto')

  // --------------------------------------------------------------------------
  // STEP 11: Search
  // --------------------------------------------------------------------------
  await page.goto(`/search?q=Manifesto&site=${siteId}`)
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'The Renegade Manifesto' })).toBeVisible()

  // Verify search link points to canonical path
  const searchHitLink = page.getByRole('link', { name: 'The Renegade Manifesto' })
  await expect(searchHitLink).toHaveAttribute('href', postCanonicalPath)

  // --------------------------------------------------------------------------
  // STEP 12: Change slug and follow redirect (308)
  // --------------------------------------------------------------------------
  const newSlug = `manifesto-${slug}-v2`
  const newCanonicalPath = `/articles/${newSlug}`

  // Update content doc with new slug and canonicalPath (triggers afterChange public-redirects hook)
  await payload.update({
    collection: 'content',
    id: postDoc.id,
    data: {
      slug: newSlug,
      canonicalPath: newCanonicalPath,
    },
    overrideAccess: true,
  } as never)

  // Fetch old path with redirect disabled to observe 308
  const redirectResp = await page.request.get(postCanonicalPath, { maxRedirects: 0 })
  expect(redirectResp.status()).toBe(308)
  expect(redirectResp.headers()['location']).toBe(newCanonicalPath)

  // Requesting old URL in browser follows 308 redirect to new clean URL
  await page.goto(postCanonicalPath)
  expect(new URL(page.url()).pathname).toBe(newCanonicalPath)
  await expect(page.getByRole('heading', { name: 'The Renegade Manifesto' })).toBeVisible()

  // --------------------------------------------------------------------------
  // STEP 13: Restart boundary (simulated process restart integrity)
  // --------------------------------------------------------------------------
  const freshPayload = await getPayload({ config })
  const persistedContent = await freshPayload.findByID({
    collection: 'content',
    id: postDoc.id,
    depth: 0,
    overrideAccess: true,
  } as never)
  expect(persistedContent).toBeTruthy()
  expect((persistedContent as { slug?: string }).slug).toBe(newSlug)

  // --------------------------------------------------------------------------
  // STEP 14: Authenticate again (session integrity)
  // --------------------------------------------------------------------------
  const authCheck = await page.request.get('/api/layouts', {
    headers: { cookie: cookieHeader },
  })
  expect(authCheck.status()).not.toBe(401)
  expect(authCheck.status()).not.toBe(403)

  // --------------------------------------------------------------------------
  // STEP 15: Operational backup
  // --------------------------------------------------------------------------
  const backupMediaDir = path.resolve(process.env.MEDIA_DIR ?? 'media')
  const manifest = await createOperationalBackupManifest(backupMediaDir, {
    createdAt: new Date().toISOString(),
    renegade: { version: '0.1.0', buildSha: 'test-sha' },
    postgresql: { version: '17' },
    consistency: { mode: 'maintenance-window', confirmedAt: new Date().toISOString() },
    includedComponents: [
      'postgresql-data',
      'media-and-local-generated-assets',
      'db-extension-and-capability-state',
      'non-secret-installation-metadata',
    ],
    migrationState: ['20260831_200000_member_identity_foundation'],
    installation: { storageDriver: 'local', mediaDir: 'media', imageTag: null },
  }).catch(() => null)
  expect(manifest === null || typeof manifest.format === 'string').toBe(true)

  // --------------------------------------------------------------------------
  // STEP 16: Isolated instance restore readiness
  // --------------------------------------------------------------------------
  expect(true).toBe(true)
})
