/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/modules/core/config'
import { inspectMedia, localMediaStorage, mediaObjectKey } from '../../src/modules/media/storage'
import {
  MediaWorkflowError,
  attachMediaToContent,
  uploadMedia,
} from '../../src/modules/media/workflow'

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0,
  0, 0, 3,
])

describe('media storage', () => {
  it('sniffs bytes rather than trusting a filename and reports image metadata', () => {
    expect(inspectMedia(png)).toMatchObject({ mimeType: 'image/png', width: 2, height: 3 })
    expect(() => inspectMedia(new TextEncoder().encode('<script>alert(1)</script>'))).toThrow(
      'Unsupported',
    )
  })

  it('writes opaque site-scoped local paths and prevents traversal', async () => {
    const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-media-'))
    const key = mediaObjectKey('site-123', 'png')
    const storage = localMediaStorage(mediaDir)
    await storage.put(key, png, 'image/png')
    expect(Array.from((await storage.get(key)) ?? [])).toEqual(Array.from(png))
    await expect(storage.get('../outside.png')).rejects.toThrow('Unsafe')
    expect(await readFile(path.join(mediaDir, key))).toEqual(Buffer.from(png))
  })

  it('degrades an incomplete development S3 selection to safe local storage and rejects it in production', () => {
    const base = {
      DATABASE_URL: 'postgresql://user:pass@localhost/db',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      STORAGE_DRIVER: 's3',
      MEDIA_DIR: './media',
    }
    expect(loadConfig({ ...base, NODE_ENV: 'development' }).storage.driver).toBe('local')
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        APP_URL: 'https://cms.example.test',
        PROXY_MODE: 'direct',
      }),
    ).toThrow('S3_')
  })

  it('persists an upload, attaches it to published content, and rejects oversized and cross-site operations', async () => {
    const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-workflow-'))
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost/db',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: mediaDir,
      MEDIA_MAX_UPLOAD_BYTES: '24',
    })
    const records: Record<string, Record<string, unknown>> = {
      content: { id: 'content', site: 'site-a', status: 'published' },
    }
    const payload = {
      find: async ({ collection, where }: any) => {
        if (collection === 'team-memberships')
          return { docs: [{ id: 'membership', role: 'editor', grants: [] }] }
        if (collection === 'media-usages') return { docs: [] }
        if (collection === 'content' && where?.heroMedia) return { docs: [] }
        return { docs: [] }
      },
      findByID: async ({ collection, id }: any) =>
        records[id] ?? (collection === 'media-assets' ? undefined : undefined),
      create: async ({ data }: any) => {
        const record = { id: 'media', ...data }
        records.media = record
        return record
      },
      update: async ({ id, data }: any) => Object.assign(records[id], data),
    }
    const user = { role: 'staff', member: 'member-a' }
    const asset = await uploadMedia(payload as never, config, {
      user,
      scope: { kind: 'site', siteId: 'site-a' },
      title: 'Cover',
      altText: 'A cover',
      bytes: png,
    })
    expect(records.media.storageLocation).toMatch(/^site-a\//)
    expect(
      await localMediaStorage(mediaDir).get(String((asset as any).storageLocation)),
    ).toBeTruthy()
    await attachMediaToContent(payload as never, user, {
      scope: { kind: 'site', siteId: 'site-a' },
      mediaId: 'media',
      contentId: 'content',
    })
    expect(records.content.heroMedia).toBe('media')
    await expect(
      uploadMedia(payload as never, config, {
        user,
        scope: { kind: 'site', siteId: 'site-a' },
        title: 'Large',
        bytes: new Uint8Array(25),
      }),
    ).rejects.toMatchObject({ status: 413 })
    await expect(
      uploadMedia(payload as never, config, {
        user: null,
        scope: { kind: 'site', siteId: 'site-a' },
        title: 'Denied',
        bytes: png,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      attachMediaToContent(payload as never, user, {
        scope: { kind: 'site', siteId: 'site-b' },
        mediaId: 'media',
        contentId: 'content',
      }),
    ).rejects.toBeInstanceOf(MediaWorkflowError)
  })
})
