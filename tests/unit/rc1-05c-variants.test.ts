/* eslint-disable @typescript-eslint/no-explicit-any -- worker persistence boundary */
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/modules/core/config'
import { localMediaStorage } from '../../src/modules/media/storage'
import { processAssetVariants } from '../../src/modules/media/variants'
import { publicMediaPolicyAllows } from '../../src/modules/media/workflow'

describe('05C durable edited-image variants', () => {
  it.each(['dedup-race', 'storage-failure', 'regeneration-failure'])(
    'handles %s without declaring missing outputs ready',
    async (mode) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'rc105c-variants-'))
      const config = loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://u:p@localhost/db',
        PAYLOAD_SECRET: 'a'.repeat(48),
        APP_URL: 'http://localhost:3000',
        MEDIA_DIR: dir,
      })
      const bytes = await sharp({
        create: { width: 100, height: 100, channels: 3, background: '#7136af' },
      })
        .png()
        .toBuffer()
      await localMediaStorage(dir).put('site-a/original.png', bytes, 'image/png')
      const blobs: any[] = [],
        variants: any[] = [],
        assetUpdates: any[] = []
      if (mode === 'regeneration-failure') {
        for (const format of ['webp', 'avif', 'jpeg'])
          variants.push({
            id: `good-${format}`,
            recipeKey: 'thumbnail',
            format,
            processingState: 'ready',
            blob: `retained-${format}`,
          })
      }
      let raced = false
      const payload = {
        findByID: async ({ collection }: any) =>
          collection === 'media-assets'
            ? {
                id: 'asset',
                site: 'site-a',
                kind: 'image',
                mimeType: 'image/png',
                originalBlob: 'original',
              }
            : { id: 'original', storageKey: 'site-a/original.png' },
        find: async ({ collection, where }: any) => ({
          docs:
            collection === 'media-blobs'
              ? blobs.filter((b) => b.checksum === where.and[1].checksum.equals)
              : variants.filter(
                  (v) =>
                    v.recipeKey === where.and[1].recipeKey.equals &&
                    v.format === where.and[2].format.equals,
                ),
        }),
        create: async ({ collection, data }: any) => {
          if (collection === 'media-blobs') {
            if (mode !== 'dedup-race') throw new Error('database write unavailable')
            const blob = { id: `blob-${blobs.length}`, ...data }
            blobs.push(blob)
            if (!raced) {
              raced = true
              throw new Error('concurrent checksum winner')
            }
            return blob
          }
          const variant = { id: `variant-${variants.length}`, ...data }
          variants.push(variant)
          return variant
        },
        update: async ({ collection, data }: any) => {
          if (collection === 'media-assets') assetUpdates.push(data)
          return data
        },
      }
      try {
        const run = processAssetVariants(payload as never, config, 'asset', {
          recipeKeys: ['thumbnail'],
        })
        if (mode === 'dedup-race') {
          const results = await run
          expect(results).toHaveLength(3)
          expect(variants).toHaveLength(3)
          expect(variants.every((v) => blobs.some((b) => b.id === v.blob))).toBe(true)
          expect(assetUpdates.at(-1).processingState).toBe('ready')
        } else {
          await expect(run).rejects.toThrow('Media variant generation incomplete')
          if (mode === 'regeneration-failure') {
            expect(variants).toHaveLength(3)
            expect(
              variants.every(
                (v) => v.processingState === 'ready' && v.blob.startsWith('retained-'),
              ),
            ).toBe(true)
            expect(assetUpdates.at(-1).processingState).toBe('processing')
            expect(publicMediaPolicyAllows(assetUpdates.at(-1))).toBe(true)
          } else {
            expect(variants).toHaveLength(0)
            expect(assetUpdates.at(-1).processingState).toBe('failed')
          }
        }
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  )
})
