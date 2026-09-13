/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import {
  createUploadSession,
  finalizeUploadSession,
  writeUploadChunk,
} from '../../src/modules/media/upload-sessions'
import {
  garbageCollectMediaVariants,
  processAssetVariants,
  standardRecipes,
} from '../../src/modules/media/variants'
import { GET as mediaGet } from '../../src/app/(frontend)/media/[id]/route'
import {
  GET as variantApiGet,
  POST as variantApiPost,
} from '../../src/app/(frontend)/api/media/[id]/variants/route'
import { attachMediaToContent } from '../../src/modules/media/workflow'
import { seed } from '../../src/scripts/seed'

let payload: Payload
let testMediaDir: string
let site: any
let user: any

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  testMediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-med03-int-'))
  process.env.MEDIA_DIR = testMediaDir

  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()

  const membersResult = await payload.find({
    collection: 'members',
    where: { email: { equals: 'river@example.test' } },
    limit: 1,
    overrideAccess: true,
  })
  const member = membersResult.docs[0] as any
  expect(member).toBeTruthy()

  user = {
    role: 'owner',
    member: member.id,
    site: { id: site.id },
  }
})

afterAll(async () => {
  if (testMediaDir) {
    await rm(testMediaDir, { recursive: true, force: true }).catch(() => undefined)
  }
  await payload?.db.destroy?.()
})

describe('MED-03 image variant lifecycle & governance integration', () => {
  it('exercises real image upload, metadata extraction, variant generation, delivery headers, crop regeneration, and GC protection', async () => {
    const appConfig = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL || 'postgresql://renegade:renegade@127.0.0.1:5432/renegade',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: testMediaDir,
    })

    // 1. Generate real image fixture (1200x800 PNG with colored content)
    const testImageBuffer = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 4,
        background: { r: 59, g: 130, b: 246, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
    const imageBytes = new Uint8Array(testImageBuffer)

    // 2. Upload via MED-01 durable upload session
    const session = await createUploadSession(payload, appConfig, {
      user,
      scope: { kind: 'site', siteId: site.id },
      filename: 'panoramic-hero.png',
      title: 'Panoramic Hero View',
      size: imageBytes.length,
      altText: 'Vibrant blue panoramic sky',
    })

    await writeUploadChunk(
      payload,
      appConfig,
      user,
      session.id,
      0,
      0,
      imageBytes.length,
      imageBytes,
    )

    const finalAsset = await finalizeUploadSession(payload, appConfig, user, session.id)

    expect(finalAsset.id).toBeTruthy()
    const assetId = String(finalAsset.id)

    // 3. Run variant processor across standard recipes
    const genResults = await processAssetVariants(payload, appConfig, assetId, {
      recipeKeys: ['thumbnail', 'inline', 'hero', 'og'],
    })

    expect(genResults.length).toBeGreaterThanOrEqual(4)

    // Verify media-assets metadata extraction & enrichment
    const assetDoc = (await payload.findByID({
      collection: 'media-assets',
      id: assetId,
      depth: 0,
      overrideAccess: true,
    } as never)) as Record<string, any>

    expect(assetDoc.kind).toBe('image')
    expect(assetDoc.width).toBe(1200)
    expect(assetDoc.height).toBe(800)
    expect(assetDoc.aspectRatio).toBeCloseTo(1.5, 2)
    expect(assetDoc.dominantColor).toMatch(/^#[0-9a-f]{6}$/i)
    expect(assetDoc.originalBlob).toBeTruthy()

    // 4. Check media-variants in PostgreSQL

    // Check media-variants in PostgreSQL
    const variantsInDb = (
      await payload.find({
        collection: 'media-variants',
        where: { asset: { equals: assetId } },
        limit: 50,
        depth: 1,
        overrideAccess: true,
      } as never)
    ).docs as Record<string, any>[]

    expect(variantsInDb.length).toBeGreaterThanOrEqual(4)

    const thumbVar = variantsInDb.find((v) => v.recipeKey === 'thumbnail' && v.format === 'webp')
    expect(thumbVar).toBeDefined()
    expect(thumbVar.processingState).toBe('ready')
    expect(thumbVar.width).toBe(standardRecipes.thumbnail?.width)
    expect(thumbVar.height).toBe(standardRecipes.thumbnail?.height)
    expect(thumbVar.sizeBytes).toBeLessThan(imageBytes.length)

    // 5. Test Admin Inspection API (GET /api/media/:id/variants)
    const { createPasskeySession } = await import('../../src/modules/operations/passkey-auth')
    const userDoc = await payload.find({
      collection: 'users',
      where: { email: { equals: 'river@example.test' } },
      limit: 1,
      overrideAccess: true,
    })
    let adminUser = userDoc.docs[0] as any
    expect(adminUser).toBeTruthy()

    adminUser = (await payload.update({
      collection: 'users',
      id: adminUser.id,
      data: { role: 'owner' },
      overrideAccess: true,
    })) as any

    const pool = (payload.db as any).pool
    const passkey = await createPasskeySession(
      { id: adminUser.id, email: adminUser.email },
      appConfig.payloadSecret,
      async (sid, expiresAt) => {
        await pool.query(
          `INSERT INTO "admin_sessions" ("id", "user_id", "expires_at", "created_at", "last_seen_at") VALUES ($1, $2, $3, now(), now())`,
          [sid, adminUser.id, expiresAt],
        )
      },
    )

    const inspectReq = new Request(`http://localhost:3000/api/media/${assetId}/variants`, {
      headers: {
        host: 'localhost:3000',
        cookie: `renegade-passkey=${passkey.token}`,
      },
    })
    const inspectRes = await variantApiGet(inspectReq, { params: Promise.resolve({ id: assetId }) })
    if (inspectRes.status !== 200) {
      const errText = await inspectRes.text()
      console.error('INSPECT_API_ERROR_BODY:', inspectRes.status, errText)
    }
    expect(inspectRes.status).toBe(200)
    const inspectData = await inspectRes.json()

    expect(inspectData.asset.id).toBe(assetId)
    expect(inspectData.asset.width).toBe(1200)
    expect(inspectData.asset.height).toBe(800)
    expect(inspectData.asset.originalSizeBytes).toBe(imageBytes.length)
    expect(inspectData.summary.totalVariants).toBeGreaterThanOrEqual(4)
    expect(inspectData.summary.readyVariants).toBeGreaterThanOrEqual(4)
    expect(inspectData.summary.bytesSaved).toBeGreaterThan(0)
    expect(inspectData.summary.percentSaved).toBeGreaterThan(0)

    // 6. Test Public Delivery Route (GET /media/:id?variant=thumbnail&format=webp)
    const deliveryReq = new Request(
      `http://localhost:3000/media/${assetId}?variant=thumbnail&format=webp`,
    )
    const deliveryRes = await mediaGet(deliveryReq, { params: Promise.resolve({ id: assetId }) })

    expect(deliveryRes.status).toBe(200)
    expect(deliveryRes.headers.get('Content-Type')).toBe('image/webp')
    expect(deliveryRes.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    const etag = deliveryRes.headers.get('ETag')
    expect(etag).toBeTruthy()

    // Test Conditional GET (HTTP 304 Not Modified)
    const condReq = new Request(
      `http://localhost:3000/media/${assetId}?variant=thumbnail&format=webp`,
      {
        headers: { 'if-none-match': etag! },
      },
    )
    const condRes = await mediaGet(condReq, { params: Promise.resolve({ id: assetId }) })
    expect(condRes.status).toBe(304)

    // Test Download query param
    const dlReq = new Request(
      `http://localhost:3000/media/${assetId}?variant=thumbnail&format=webp&download=true`,
    )
    const dlRes = await mediaGet(dlReq, { params: Promise.resolve({ id: assetId }) })
    expect(dlRes.status).toBe(200)
    expect(dlRes.headers.get('Content-Disposition')).toContain('attachment')

    // 7. Non-destructive crop & focal point update via Admin API
    const updateReq = new Request(`http://localhost:3000/api/media/${assetId}/variants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `renegade-passkey=${passkey.token}`,
      },
      body: JSON.stringify({
        focalPoint: { x: 0.8, y: 0.2 },
        cropSettings: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        regenerate: true,
      }),
    })
    const updateRes = await variantApiPost(updateReq, { params: Promise.resolve({ id: assetId }) })
    expect(updateRes.status).toBe(200)
    const updateData = await updateRes.json()
    expect(updateData.focalPoint).toEqual({ x: 0.8, y: 0.2 })
    expect(updateData.cropSettings).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })

    // 8. Test Garbage Collection Safety:
    // Attach asset to story to guarantee reference tracking
    await attachMediaToContent(payload, {
      assetId,
      collection: 'stories',
      documentId: 'story-demo-1',
      fieldPath: 'coverImage',
    })

    // Run GC: active variants and referenced originals must NOT be deleted
    const gcResult = await garbageCollectMediaVariants(payload, appConfig, {
      siteId: site.id,
      dryRun: false,
    })

    expect(gcResult.purgedCount).toBe(0)

    // Verify original asset and its variants are completely intact
    const verifyAsset = await payload.findByID({
      collection: 'media-assets',
      id: assetId,
      depth: 0,
      overrideAccess: true,
    })
    expect(verifyAsset).toBeTruthy()

    const remainingVariants = await payload.find({
      collection: 'media-variants',
      where: { asset: { equals: assetId } },
      limit: 10,
      overrideAccess: true,
    })
    expect(remainingVariants.docs.length).toBeGreaterThan(0)
  })
})
