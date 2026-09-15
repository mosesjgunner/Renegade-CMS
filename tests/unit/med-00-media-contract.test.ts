/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/modules/core/config'
import { inspectMedia, localMediaStorage } from '../../src/modules/media/storage'
import { publicMedia, uploadMedia } from '../../src/modules/media/workflow'

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0,
  0, 0, 1,
])

describe('MED-00 canonical media contract', () => {
  it('deduplicates bytes only within a site while retaining distinct asset identities', async () => {
    const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-med00-'))
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: mediaDir,
    })
    const blobs: any[] = [],
      assets: any[] = []
    const payload = {
      find: async ({ collection, where }: any) =>
        collection === 'media-blobs'
          ? {
              docs: blobs.filter(
                (blob) =>
                  blob.site === where.and[0].site.equals &&
                  blob.checksum === where.and[1].checksum.equals,
              ),
            }
          : { docs: [] },
      create: async ({ collection, data }: any) => {
        const record = {
          id: `${collection}-${collection === 'media-blobs' ? blobs.length : assets.length}`,
          ...data,
        }
        ;(collection === 'media-blobs' ? blobs : assets).push(record)
        return record
      },
    }
    const input = {
      user: { role: 'owner' },
      scope: { kind: 'site' as const, siteId: 'site-a' },
      title: 'One',
      bytes: png,
    }
    const first = await uploadMedia(payload as never, config, input)
    const second = await uploadMedia(payload as never, config, { ...input, title: 'Two' })
    expect(blobs).toHaveLength(1)
    expect(first.id).not.toBe(second.id)
    expect((first as any).originalBlob).toBe((second as any).originalBlob)
    expect(await localMediaStorage(mediaDir).get(String((first as any).storageLocation))).toEqual(
      Buffer.from(png),
    )
  })

  it('rejects MIME spoofing and keeps public delivery derived from approved published uses', async () => {
    expect(() => inspectMedia(new TextEncoder().encode('not actually a PNG'))).toThrow(
      'Unsupported',
    )
    const asset = {
      id: 'asset',
      site: 'site-a',
      storageLocation: 'site-a/file.png',
      publicPolicy: 'published-use',
    }
    const payload = {
      findByID: async () => asset,
      find: async ({ collection, where }: any) => ({
        docs:
          collection === 'media-usages' && where.and?.[2]?.approvedForPublic?.equals
            ? [{ id: 'use' }]
            : [],
      }),
    }
    await expect(publicMedia(payload as never, 'asset')).resolves.toEqual(asset)
    const denied = { ...payload, find: async () => ({ docs: [] }) }
    await expect(publicMedia(denied as never, 'asset')).resolves.toBeUndefined()
  })

  it('removes a newly written object when the asset metadata transaction fails', async () => {
    const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-med00-cleanup-'))
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: mediaDir,
    })
    let blob: any
    const payload = {
      find: async () => ({ docs: [] }),
      create: async ({ collection, data }: any) => {
        if (collection === 'media-blobs') return (blob = { id: 'blob', ...data })
        throw new Error('simulated database failure')
      },
      delete: async () => undefined,
    }
    await expect(
      uploadMedia(payload as never, config, {
        user: { role: 'owner' },
        scope: { kind: 'site', siteId: 'site-a' },
        title: 'Fails',
        bytes: png,
      }),
    ).rejects.toThrow('simulated database failure')
    expect(await localMediaStorage(mediaDir).get(blob.storageKey)).toBeUndefined()
  })
})
