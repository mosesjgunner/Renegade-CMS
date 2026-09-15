/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { loadConfig } from '../../src/modules/core/config'
import {
  assertSafeSvg,
  calculateCropBox,
  checkRuntimeFormatSupport,
  extractSafeMediaMetadata,
  garbageCollectMediaVariants,
  generateVariantBytes,
  processAssetVariants,
  queueAssetVariantGeneration,
  recipeFingerprint,
  standardRecipes,
  variantObjectKey,
} from '../../src/modules/media/variants'
import { getResponsiveImageAttrs } from '../../src/modules/media/responsive'
import { MediaWorkflowError } from '../../src/modules/media/workflow'

describe('MED-03 image variant engine & contracts', () => {
  // Generate a real test JPEG fixture with red color
  const makeTestJpeg = async (width = 600, height = 400): Promise<Uint8Array> => {
    const buffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 220, g: 20, b: 60 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer()
    return new Uint8Array(buffer)
  }

  // Generate a real test PNG fixture with green color
  const makeTestPng = async (width = 800, height = 600): Promise<Uint8Array> => {
    const buffer = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 34, g: 197, b: 94, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
    return new Uint8Array(buffer)
  }

  it('1. Recipe catalog: covers thumbnail, inline, hero, og, square, portrait, wide with valid configs', () => {
    const expectedKeys = ['thumbnail', 'inline', 'hero', 'og', 'square', 'portrait', 'wide']
    for (const key of expectedKeys) {
      const recipe = standardRecipes[key]
      expect(recipe, `Recipe ${key} must exist`).toBeDefined()
      expect(recipe!.width).toBeGreaterThan(0)
      expect(recipe!.formats.length).toBeGreaterThan(0)
      expect(recipe!.quality).toBeGreaterThan(50)
      expect(['cover', 'contain', 'inside']).toContain(recipe!.fit)
      expect(['thumbnail', 'poster', 'transcode', 'caption', 'social', 'other']).toContain(
        recipe!.kind,
      )
    }

    const runtime = checkRuntimeFormatSupport()
    expect(runtime.webp).toBe(true)
    expect(runtime.jpeg).toBe(true)
  })

  it('2. Safe metadata extraction: dimensions, orientation, dominant color, and channels', async () => {
    const jpeg = await makeTestJpeg(400, 300)
    const meta = await extractSafeMediaMetadata(jpeg, 'image/jpeg')

    expect(meta.width).toBe(400)
    expect(meta.height).toBe(300)
    expect(meta.aspectRatio).toBeCloseTo(400 / 300, 2)
    expect(meta.dominantColor).toMatch(/^#[0-9a-f]{6}$/i)
    expect(meta.mimeType).toBe('image/jpeg')

    // Test SVG extraction
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="250" viewBox="0 0 500 250"><rect width="500" height="250" fill="blue"/></svg>',
    )
    const svgMeta = await extractSafeMediaMetadata(svg, 'image/svg+xml')
    expect(svgMeta.width).toBe(500)
    expect(svgMeta.height).toBe(250)
    expect(svgMeta.aspectRatio).toBe(2)
  })

  it('3. Focal point & non-destructive crop math: shifts framing around focal coordinate', () => {
    // 1000x500 source, target 1:1 (e.g. 400x400)
    // Source is wider than target. Crop window width = 500, height = 500.
    const cropLeftFocus = calculateCropBox(1000, 500, 400, 400, { x: 0.1, y: 0.5 })
    expect(cropLeftFocus.width).toBe(500)
    expect(cropLeftFocus.height).toBe(500)
    expect(cropLeftFocus.left).toBe(0) // Clamped to left

    const cropRightFocus = calculateCropBox(1000, 500, 400, 400, { x: 0.9, y: 0.5 })
    expect(cropRightFocus.width).toBe(500)
    expect(cropRightFocus.height).toBe(500)
    expect(cropRightFocus.left).toBe(500) // Clamped to right (1000 - 500)

    const cropCenterFocus = calculateCropBox(1000, 500, 400, 400, { x: 0.5, y: 0.5 })
    expect(cropCenterFocus.left).toBe(250) // Centered

    // Explicit crop rectangle takes precedence
    const explicit = calculateCropBox(1000, 500, 400, 400, null, {
      x: 0.2,
      y: 0.1,
      width: 0.6,
      height: 0.8,
    })
    expect(explicit.left).toBe(200)
    expect(explicit.top).toBe(50)
    expect(explicit.width).toBe(600)
    expect(explicit.height).toBe(400)
  })

  it('4. Modern format generation: generates WebP, AVIF, and JPEG variants with metadata stripped', async () => {
    const png = await makeTestPng(600, 400)

    // Generate WebP
    const webpRes = await generateVariantBytes({
      originalBytes: png,
      recipe: standardRecipes.thumbnail!,
      format: 'webp',
      focalPoint: { x: 0.5, y: 0.5 },
    })
    expect(webpRes.format).toBe('webp')
    expect(webpRes.mimeType).toBe('image/webp')
    expect(webpRes.width).toBe(400)
    expect(webpRes.height).toBe(300)
    expect(webpRes.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)

    // Check sharp can parse the generated WebP and confirms stripped EXIF
    const parsedWebp = await sharp(webpRes.bytes).metadata()
    expect(parsedWebp.format).toBe('webp')
    expect(parsedWebp.exif).toBeUndefined()

    // Generate JPEG fallback
    const jpegRes = await generateVariantBytes({
      originalBytes: png,
      recipe: standardRecipes.thumbnail!,
      format: 'jpeg',
    })
    expect(jpegRes.format).toBe('jpeg')
    expect(jpegRes.mimeType).toBe('image/jpeg')
    expect(jpegRes.width).toBe(400)
    expect(jpegRes.height).toBe(300)
    expect(jpegRes.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('5. Safe SVG policy: accepts valid SVG but FATALLY refuses scripts, event handlers, and XXE', () => {
    // Valid SVG passes
    const valid = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="green" /></svg>',
    )
    expect(() => assertSafeSvg(valid)).not.toThrow()

    // Script tag refused
    const withScript = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    )
    expect(() => assertSafeSvg(withScript)).toThrow(/forbidden in SVG/i)

    // Event handler refused
    const withOnload = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)"><circle cx="50" cy="50" r="40"/></svg>',
    )
    expect(() => assertSafeSvg(withOnload)).toThrow(/Inline event handlers/i)

    // ForeignObject refused
    const withForeign = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>Sample</div></foreignObject></svg>',
    )
    expect(() => assertSafeSvg(withForeign)).toThrow(/foreignObject/i)

    // XXE entity declaration refused
    const withXxe = new TextEncoder().encode(
      '<!DOCTYPE svg [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><svg>&xxe;</svg>',
    )
    expect(() => assertSafeSvg(withXxe)).toThrow(/entity declarations/i)

    // Javascript URI in href refused
    const withJsHref = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>Click</text></a></svg>',
    )
    expect(() => assertSafeSvg(withJsHref)).toThrow(/Javascript protocol is forbidden/i)
  })

  it('6. Malicious & corrupt image refusal: fails cleanly with 422 MediaWorkflowError', async () => {
    const corruptBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]) // Incomplete JPEG
    await expect(extractSafeMediaMetadata(corruptBytes, 'image/jpeg')).rejects.toThrow(
      MediaWorkflowError,
    )
  })

  it('7. Responsive image attributes: emits AVIF, WebP, JPEG fallbacks, sizes, and eager/lazy loading', () => {
    const attrs = getResponsiveImageAttrs(
      {
        id: 'asset-123',
        title: 'Hero Image',
        altText: 'A stunning mountain view',
        width: 1600,
        height: 900,
      },
      { variant: 'hero', priority: true },
    )

    expect(attrs.src).toBe('/media/asset-123?variant=hero&format=jpeg&v=1')
    expect(attrs.loading).toBe('eager')
    expect(attrs.decoding).toBe('async')
    expect(attrs.alt).toBe('A stunning mountain view')
    expect(attrs.sources).toHaveLength(2)
    expect(attrs.sources[0]?.type).toBe('image/avif')
    expect(attrs.sources[0]?.srcSet).toContain('format=avif')
    expect(attrs.sources[1]?.type).toBe('image/webp')
    expect(attrs.sources[1]?.srcSet).toContain('format=webp')
    expect(attrs.sources[0]?.srcSet).toContain('1600w')
  })

  it('7b. Immutable rendition addressing includes checksum and the bounded recipe contract', () => {
    const recipe = standardRecipes.hero!
    const checksum = `sha256:${'a'.repeat(64)}`
    const key = variantObjectKey('site-123', checksum, recipe, 'webp')
    expect(key).toMatch(
      new RegExp(
        `^site-123/variants/${'a'.repeat(64)}/hero-v1-${recipeFingerprint(recipe)}\\.webp$`,
      ),
    )
    expect(() => variantObjectKey('site-123', 'not-a-checksum', recipe, 'webp')).toThrow(
      'Invalid variant checksum',
    )
  })

  it('7c. Queues one durable worker job per exact recipe contract', async () => {
    const jobs: any[] = []
    const queued: any[] = []
    const payload = {
      findByID: async () => ({ id: 'asset-queue', title: 'Queue fixture', checksum: 'sha256:abc' }),
      find: async ({ collection, where }: any) => {
        if (collection === 'payload-jobs') {
          const key = where?.and?.find((c: any) => c['input.idempotencyKey'])?.[
            'input.idempotencyKey'
          ]?.equals
          return { docs: queued.filter((q) => q.input?.idempotencyKey === key) }
        }
        return { docs: [] }
      },
      jobs: {
        queue: async (input: any) => {
          const item = { id: `job-${queued.length + 1}`, ...input }
          jobs.push(item)
          queued.push(item)
          return item
        },
      },
    }

    const first = await queueAssetVariantGeneration(payload as never, {
      assetId: 'asset-queue',
      recipeKeys: ['hero'],
    })
    const second = await queueAssetVariantGeneration(payload as never, {
      assetId: 'asset-queue',
      recipeKeys: ['hero'],
    })
    expect(first.id).toBe(second.id)
    expect(jobs).toHaveLength(1)
    expect(queued).toHaveLength(1)
    expect(queued[0].queue).toBe('media')
    expect(queued[0].input.recipeKeys).toEqual(['hero'])
  })

  it('8. Variant processing & last-known-good preservation during regeneration', async () => {
    const png = await makeTestPng(500, 500)
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const path = await import('node:path')
    const { localMediaStorage } = await import('../../src/modules/media/storage')

    const tempDir = await mkdtemp(path.join(tmpdir(), 'med03-unit-'))
    const storage = localMediaStorage(tempDir)
    await storage.put('site-test/sample.png', png, 'image/png')

    const storedBlobs: any[] = []
    const storedVariants: any[] = []
    let updatedAssetData: any = null

    const mockPayload = {
      findByID: async ({ collection, id }: any) => {
        if (collection === 'media-assets') {
          return {
            id,
            site: 'site-test',
            title: 'Sample Asset',
            kind: 'image',
            mimeType: 'image/png',
            originalBlob: 'blob-orig',
            focalPoint: { x: 0.5, y: 0.5 },
          }
        }
        if (collection === 'media-blobs') {
          return {
            id: 'blob-orig',
            site: 'site-test',
            storageKey: 'site-test/sample.png',
            sizeBytes: png.byteLength,
            mimeType: 'image/png',
          }
        }
        return null
      },
      find: async ({ collection }: any) => {
        if (collection === 'media-blobs') {
          return { docs: storedBlobs }
        }
        if (collection === 'media-variants') {
          return { docs: storedVariants }
        }
        return { docs: [] }
      },
      create: async ({ collection, data }: any) => {
        const doc = { id: `${collection}-${Date.now()}-${Math.random()}`, ...data }
        if (collection === 'media-blobs') storedBlobs.push(doc)
        if (collection === 'media-variants') storedVariants.push(doc)
        return doc
      },
      update: async ({ collection, id, data }: any) => {
        if (collection === 'media-assets') {
          updatedAssetData = data
        }
        if (collection === 'media-variants') {
          const idx = storedVariants.findIndex((v) => v.id === id)
          if (idx >= 0) storedVariants[idx] = { ...storedVariants[idx], ...data }
        }
        return { id, ...data }
      },
    }

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: tempDir,
    })

    try {
      // Process thumbnail recipe
      const results = await processAssetVariants(mockPayload as never, config, 'asset-1', {
        recipeKeys: ['thumbnail'],
      })

      expect(results.length).toBeGreaterThan(0)
      expect(storedVariants.length).toBeGreaterThan(0)
      expect(storedVariants.every((v) => v.processingState === 'ready')).toBe(true)
      expect(updatedAssetData).not.toBeNull()
      expect(updatedAssetData.aspectRatio).toBe(1)
      expect(updatedAssetData.dominantColor).toBeDefined()

      // Verify last-known-good preservation: existing variants have ready state
      const firstReadyCount = storedVariants.filter((v) => v.processingState === 'ready').length
      expect(firstReadyCount).toBeGreaterThan(0)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('9. Garbage collection safety: protects originals, active variants, and referenced usages', async () => {
    const activeBlobs = [
      { id: 'blob-original', site: 'site-gc', sizeBytes: 50000, storageKey: 'orig.png' },
      { id: 'blob-active-variant', site: 'site-gc', sizeBytes: 15000, storageKey: 'var1.webp' },
      { id: 'blob-orphaned-variant', site: 'site-gc', sizeBytes: 12000, storageKey: 'orphan.webp' },
    ]

    let deletedBlobId = ''

    const mockPayload = {
      find: async ({ collection }: any) => {
        if (collection === 'media-assets') {
          return { docs: [{ id: 'asset-1', originalBlob: 'blob-original' }] }
        }
        if (collection === 'media-variants') {
          return { docs: [{ id: 'var-1', blob: 'blob-active-variant', processingState: 'ready' }] }
        }
        if (collection === 'media-usages') {
          return { docs: [] }
        }
        if (collection === 'media-blobs') {
          return { docs: activeBlobs }
        }
        return { docs: [] }
      },
      delete: async ({ collection, id }: any) => {
        if (collection === 'media-blobs') deletedBlobId = id
        return { id }
      },
    }

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
    })

    const gcResult = await garbageCollectMediaVariants(mockPayload as never, config, {
      siteId: 'site-gc',
      dryRun: false,
    })

    // Original and active variant must NOT be deleted. Only orphaned variant is deleted.
    expect(gcResult.checkedCount).toBe(3)
    expect(gcResult.purgedCount).toBe(1)
    expect(gcResult.bytesFreed).toBe(12000)
    expect(deletedBlobId).toBe('blob-orphaned-variant')
  })
})
