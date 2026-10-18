/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/modules/core/config'
import {
  cleanupExpiredUploadSessions,
  createUploadSession,
  finalizeUploadSession,
  readUploadSession,
  writeUploadChunk,
} from '../../src/modules/media/upload-sessions'
import {
  attachMediaToContent,
  deleteOrphanedMedia,
  getScopedMediaAssetDetail,
  listScopedMediaLibrary,
  publicMedia,
  replaceMedia,
  tombstoneMedia,
  updateMediaMetadata,
  uploadMedia,
} from '../../src/modules/media/workflow'
import { executeCommandCenterAction } from '../../src/modules/media/command-center'

const pngBytes = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0,
  2, 0, 0, 0, 2, 8, 2, 0, 0, 0, 0xfd, 0xd4, 0x9a, 0x73,
])
const pdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n')
const wavBytes = () => {
  const buf = new Uint8Array(64)
  const view = new DataView(buf.buffer)
  buf.set(new TextEncoder().encode('RIFF'), 0)
  view.setUint32(4, 56, true)
  buf.set(new TextEncoder().encode('WAVEfmt '), 8)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 44100, true)
  view.setUint32(28, 88200, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  buf.set(new TextEncoder().encode('data'), 36)
  view.setUint32(40, 20, true)
  return buf
}
const mp4Bytes = () => {
  const buf = new Uint8Array(32)
  const view = new DataView(buf.buffer)
  view.setUint32(0, 20, false)
  buf.set(new TextEncoder().encode('ftypisom'), 4)
  return buf
}

function createInMemoryMediaHarness() {
  let seq = 0
  const stores = new Map<string, Map<string, Record<string, any>>>()
  const storeFor = (collection: string) => {
    let s = stores.get(collection)
    if (!s) {
      s = new Map()
      stores.set(collection, s)
    }
    return s
  }

  const matchesClause = (doc: Record<string, any>, where?: Record<string, any>): boolean => {
    if (!where || !Object.keys(where).length) return true
    if (Array.isArray(where.and)) {
      return where.and.every((clause: Record<string, any>) => matchesClause(doc, clause))
    }
    if (Array.isArray(where.or)) {
      return where.or.some((clause: Record<string, any>) => matchesClause(doc, clause))
    }
    return Object.entries(where).every(([field, cond]) => {
      if (!cond || typeof cond !== 'object') return true
      const raw = doc[field]
      const val =
        raw && typeof raw === 'object' && 'id' in raw
          ? raw.id
          : raw && typeof raw === 'object' && 'value' in raw
            ? raw.value
            : raw
      if ('equals' in cond) return String(val ?? '') === String(cond.equals ?? '')
      if ('in' in cond && Array.isArray(cond.in))
        return cond.in.map(String).includes(String(val ?? ''))
      if ('less_than' in cond) return String(val ?? '') < String(cond.less_than ?? '')
      if ('less_than_equal' in cond) return String(val ?? '') <= String(cond.less_than_equal ?? '')
      if ('exists' in cond) return cond.exists ? val !== undefined && val !== null : val == null
      return true
    })
  }

  // Seed sites and operator grants
  storeFor('sites').set('site-1', { id: 'site-1', slug: 'site-1', name: 'Site One' })
  storeFor('sites').set('site-2', { id: 'site-2', slug: 'site-2', name: 'Site Two' })
  storeFor('members').set('member-owner-1', {
    id: 'member-owner-1',
    email: 'owner@example.com',
    displayName: 'Owner',
    status: 'active',
  })
  storeFor('operator-site-grants').set('grant-1', {
    id: 'grant-1',
    user: 'user-owner-1',
    site: 'site-1',
    status: 'active',
  })

  const payload: any = {
    collections: Object.fromEntries(
      [
        'sites',
        'members',
        'operator-site-grants',
        'media-assets',
        'media-blobs',
        'media-variants',
        'media-usages',
        'media-asset-versions',
        'media-upload-sessions',
        'media-jobs',
        'content',
      ].map((slug) => [slug, { slug }]),
    ),
    find: async ({ collection, where, limit = 100 }: any) => {
      const docs = [...storeFor(collection).values()].filter((doc) => matchesClause(doc, where))
      return { docs: limit > 0 ? docs.slice(0, limit) : docs, totalDocs: docs.length }
    },
    findByID: async ({ collection, id }: any) => {
      const doc = storeFor(collection).get(String(id))
      if (!doc) throw new Error(`Not found: ${collection}/${id}`)
      return doc
    },
    create: async ({ collection, data }: any) => {
      const id = String(data?.id ?? `${collection}-${++seq}`)
      const now = new Date().toISOString()
      const record = {
        ...data,
        id,
        createdAt: data?.createdAt ?? now,
        updatedAt: data?.updatedAt ?? now,
      }
      storeFor(collection).set(id, record)
      return record
    },
    update: async ({ collection, id, data }: any) => {
      const existing = storeFor(collection).get(String(id))
      if (!existing) throw new Error(`Not found: ${collection}/${id}`)
      const updated = {
        ...existing,
        ...data,
        id: String(id),
        updatedAt: new Date().toISOString(),
      }
      storeFor(collection).set(String(id), updated)
      return updated
    },
    delete: async ({ collection, id }: any) => {
      storeFor(collection).delete(String(id))
      return { id: String(id) }
    },
  }

  return {
    payload,
    owner: {
      id: 'user-owner-1',
      email: 'owner@example.com',
      role: 'owner',
      member: 'member-owner-1',
    },
    outsider: {
      id: 'user-outsider',
      email: 'outsider@example.com',
      role: 'reader',
    },
  }
}

describe('RC1 05A: Upload, library, replacement stability, and asset lifecycle', () => {
  let mediaDir = ''

  beforeEach(async () => {
    mediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-rc1-05a-unit-'))
  })

  afterEach(async () => {
    if (mediaDir) await rm(mediaDir, { recursive: true, force: true })
  })

  const configForTest = () =>
    loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://renegade:renegade@127.0.0.1:5432/renegade',
      PAYLOAD_SECRET: 'test-secret-with-at-least-thirty-two-characters-long-123456',
      APP_URL: 'https://newsroom.example.com',
      MEDIA_DIR: mediaDir,
      MAX_UPLOAD_BYTES: '2097152',
    })

  it('ingests image, document, audio, and video fixtures, lists/searches/filters, and refetches detail with cross-site isolation', async () => {
    const harness = createInMemoryMediaHarness()
    const config = configForTest()
    const scope = { kind: 'site' as const, siteId: 'site-1' }

    const img = await uploadMedia(harness.payload, config, {
      user: harness.owner,
      scope,
      title: 'Newsroom Masthead Graphic',
      altText: 'Masthead graphic',
      caption: 'Primary masthead illustration',
      originalFilename: 'masthead-graphic.png',
      bytes: pngBytes,
    })
    const doc = await uploadMedia(harness.payload, config, {
      user: harness.owner,
      scope,
      title: 'FOIA Source Dossier',
      caption: 'Redacted court filing PDF',
      originalFilename: 'foia-dossier-2026.pdf',
      bytes: pdfBytes,
    })
    const aud = await uploadMedia(harness.payload, config, {
      user: harness.owner,
      scope,
      title: 'Reporter Field Briefing',
      caption: 'Interview clip WAV',
      originalFilename: 'field-briefing.wav',
      bytes: wavBytes(),
    })
    const vid = await uploadMedia(harness.payload, config, {
      user: harness.owner,
      scope,
      title: 'Press Conference Clip',
      caption: 'B-roll footage MP4',
      originalFilename: 'press-conference.mp4',
      bytes: mp4Bytes(),
    })

    const all = await listScopedMediaLibrary(harness.payload, harness.owner, { siteId: 'site-1' })
    expect(all).toHaveLength(4)
    expect(all.map((item) => item.kind).sort()).toEqual(['audio', 'document', 'image', 'video'])

    const pdfSearch = await listScopedMediaLibrary(harness.payload, harness.owner, {
      siteId: 'site-1',
      q: 'foia-dossier-2026.pdf',
    })
    expect(pdfSearch.map((item) => item.id)).toEqual([String(doc.id)])

    const audioFiltered = await listScopedMediaLibrary(harness.payload, harness.owner, {
      siteId: 'site-1',
      kind: 'audio',
    })
    expect(audioFiltered.map((item) => item.id)).toEqual([String(aud.id)])

    const videoDetail = await getScopedMediaAssetDetail(harness.payload, harness.owner, {
      siteId: 'site-1',
      mediaId: String(vid.id),
    })
    expect(videoDetail.originalFilename).toBe('press-conference.mp4')
    expect(videoDetail.kind).toBe('video')
    expect(videoDetail.caption).toBe('B-roll footage MP4')

    await expect(
      getScopedMediaAssetDetail(harness.payload, harness.outsider, {
        siteId: 'site-1',
        mediaId: String(img.id),
      }),
    ).rejects.toMatchObject({ status: 403 })

    await expect(
      getScopedMediaAssetDetail(harness.payload, harness.owner, {
        siteId: 'site-2',
        mediaId: String(img.id),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('recovers interrupted/failed chunked upload sessions and cleans up expired sessions', async () => {
    const harness = createInMemoryMediaHarness()
    const config = configForTest()
    const scope = { kind: 'site' as const, siteId: 'site-1' }
    const payloadBytes = new Uint8Array(600 * 1024)
    payloadBytes.set(pngBytes, 0)

    const session = await createUploadSession(harness.payload, config, {
      user: harness.owner,
      scope,
      filename: 'resumable-hero.png',
      title: 'Resumable Hero Image',
      caption: 'Recovered after interruption',
      size: payloadBytes.byteLength,
    })
    // Ensure hex/uuid-compatible ID for chunkPath validation
    const validSessionId = '01234567-89ab-4cde-8f01-23456789abcd'
    const stored = await harness.payload.findByID({
      collection: 'media-upload-sessions',
      id: session.id,
    })
    await harness.payload.delete({ collection: 'media-upload-sessions', id: session.id })
    await harness.payload.create({
      collection: 'media-upload-sessions',
      data: { ...stored, id: validSessionId },
    })

    const chunkSize = Number(session.chunkSize)
    const firstChunk = payloadBytes.slice(0, chunkSize)

    await writeUploadChunk(
      harness.payload,
      config,
      harness.owner,
      validSessionId,
      0,
      0,
      payloadBytes.byteLength,
      firstChunk,
    )

    // Simulate an interrupted finalization attempt that marked the session failed
    await expect(
      finalizeUploadSession(harness.payload, config, harness.owner, validSessionId),
    ).rejects.toMatchObject({ status: 409 })

    const interruptedState = await readUploadSession(harness.payload, harness.owner, validSessionId)
    expect(interruptedState.state).toBe('open')
    expect(interruptedState.receivedChunks).toEqual([0])

    // Also simulate a transient finalization failure setting state='failed' and verify chunk upload recovers it
    await harness.payload.update({
      collection: 'media-upload-sessions',
      id: validSessionId,
      data: { state: 'failed', failureReason: 'Simulated transient I/O interruption' },
    })

    // Recover and upload remaining chunks without re-sending chunk 0
    for (
      let index = 1, offset = chunkSize;
      offset < payloadBytes.byteLength;
      index++, offset += chunkSize
    ) {
      const slice = payloadBytes.slice(
        offset,
        Math.min(payloadBytes.byteLength, offset + chunkSize),
      )
      await writeUploadChunk(
        harness.payload,
        config,
        harness.owner,
        validSessionId,
        index,
        offset,
        payloadBytes.byteLength,
        slice,
      )
    }

    const recoveredAsset = await finalizeUploadSession(
      harness.payload,
      config,
      harness.owner,
      validSessionId,
    )
    expect(recoveredAsset.title).toBe('Resumable Hero Image')
    expect(recoveredAsset.originalFilename).toBe('resumable-hero.png')

    // Create an abandoned session, expire it, and verify cleanup removes staging directory
    const abandonedId = 'fedcba98-7654-4321-89ab-cdef01234567'
    const abandoned = await createUploadSession(harness.payload, config, {
      user: harness.owner,
      scope,
      filename: 'abandoned.png',
      size: pngBytes.byteLength,
    })
    const abandonedDoc = await harness.payload.findByID({
      collection: 'media-upload-sessions',
      id: abandoned.id,
    })
    await harness.payload.delete({ collection: 'media-upload-sessions', id: abandoned.id })
    await harness.payload.create({
      collection: 'media-upload-sessions',
      data: { ...abandonedDoc, id: abandonedId },
    })

    await writeUploadChunk(
      harness.payload,
      config,
      harness.owner,
      abandonedId,
      0,
      0,
      pngBytes.byteLength,
      pngBytes,
    )
    const stagingDir = path.join(mediaDir, '.upload-sessions', abandonedId)
    expect((await stat(stagingDir)).isDirectory()).toBe(true)

    await harness.payload.update({
      collection: 'media-upload-sessions',
      id: abandonedId,
      data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
    })

    const cleaned = await cleanupExpiredUploadSessions(harness.payload, config)
    expect(cleaned).toBe(1)
    await expect(stat(stagingDir)).rejects.toThrow()
  })

  it('keeps content references stable on replacement, refuses unsafe replacements, and enforces tombstone/delete semantics', async () => {
    const harness = createInMemoryMediaHarness()
    const config = configForTest()
    const scope = { kind: 'site' as const, siteId: 'site-1' }

    const hero = await uploadMedia(harness.payload, config, {
      user: harness.owner,
      scope,
      title: 'Original Article Hero',
      altText: 'Original alt',
      caption: 'Original caption',
      originalFilename: 'hero-v1.png',
      bytes: pngBytes,
    })

    const article = await harness.payload.create({
      collection: 'content',
      data: {
        site: 'site-1',
        title: 'Governed Media Story',
        status: 'published',
        visibility: 'public',
        publishedAt: '2026-04-01T00:00:00.000Z',
        body: { root: { type: 'root', children: [] } },
      },
    })

    await attachMediaToContent(harness.payload, harness.owner, {
      scope,
      mediaId: String(hero.id),
      contentId: String(article.id),
    })

    // Refuse unsafe replacement: replacing an image with a PDF in all-usages mode
    await expect(
      replaceMedia(harness.payload, config, {
        user: harness.owner,
        scope,
        replacedMediaId: String(hero.id),
        title: 'Wrong Kind Replacement',
        originalFilename: 'wrong.pdf',
        bytes: pdfBytes,
        mode: 'all-usages',
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Unsafe replacement refused'),
    })

    // Valid global replacement with new image bytes and updated caption
    const replacementPng = new Uint8Array([...pngBytes, 9, 9, 9])
    const replaced = await replaceMedia(harness.payload, config, {
      user: harness.owner,
      scope,
      replacedMediaId: String(hero.id),
      title: 'Updated Article Hero v2',
      altText: 'Updated alt v2',
      caption: 'Updated caption v2',
      originalFilename: 'hero-v2.png',
      bytes: replacementPng,
      mode: 'all-usages',
      reason: 'High-contrast newsroom revision',
    })

    // Article reference stays stable at hero.id while publicMedia resolves to replaced.id
    const persistedArticle = await harness.payload.findByID({
      collection: 'content',
      id: article.id,
    })
    expect(persistedArticle.heroMedia).toBe(String(hero.id))

    const resolvedPublic = await publicMedia(harness.payload, String(hero.id))
    expect(resolvedPublic?.id).toBe(replaced.id)
    expect(resolvedPublic?.caption).toBe('Updated caption v2')

    // Deleting either the original referenced asset OR the active replacement target is refused with 409
    await expect(
      deleteOrphanedMedia(harness.payload, config, harness.owner, {
        scope,
        mediaId: String(hero.id),
      }),
    ).rejects.toMatchObject({ status: 409 })

    await expect(
      deleteOrphanedMedia(harness.payload, config, harness.owner, {
        scope,
        mediaId: String(replaced.id),
      }),
    ).rejects.toMatchObject({ status: 409 })

    // Detail refetch shows version history and active usage
    const heroDetail = await getScopedMediaAssetDetail(harness.payload, harness.owner, {
      siteId: 'site-1',
      mediaId: String(hero.id),
    })
    expect(heroDetail.referenced).toBe(true)
    expect(heroDetail.versionCount).toBe(1)
    expect(heroDetail.effectiveAssetId).toBe(String(replaced.id))

    // Applying tombstone policy withdraws public delivery immediately while keeping audit record
    const tombstoned = await tombstoneMedia(harness.payload, harness.owner, {
      scope,
      mediaId: String(hero.id),
      tombstoneLabel: '[Withdrawn per editorial correction]',
      reason: 'Editorial withdrawal test',
    })
    expect((tombstoned as Record<string, unknown>).retentionMode).toBe('tombstone')
    expect((tombstoned as Record<string, unknown>).removeFromDiscovery).toBe(true)
    expect(await publicMedia(harness.payload, String(hero.id))).toBeUndefined()

    // Tombstoned asset cannot be attached to new content or replaced
    await expect(
      attachMediaToContent(harness.payload, harness.owner, {
        scope,
        mediaId: String(hero.id),
        contentId: String(article.id),
      }),
    ).rejects.toMatchObject({ status: 409 })

    await expect(
      replaceMedia(harness.payload, config, {
        user: harness.owner,
        scope,
        replacedMediaId: String(hero.id),
        title: 'Cannot Replace Tombstone',
        bytes: pngBytes,
        mode: 'new-asset',
      }),
    ).rejects.toMatchObject({ status: 409 })

    // Update metadata retentionMode works via updateMediaMetadata and Command Center archive-asset
    const docAsset = await uploadMedia(harness.payload, config, {
      user: harness.owner,
      scope,
      title: 'Standalone Document',
      bytes: pdfBytes,
    })
    const archivedRes = await executeCommandCenterAction(
      harness.payload,
      config,
      harness.owner,
      'site-1',
      'archive-asset',
      { mediaId: String(docAsset.id), tombstoneLabel: '[Archived via Command Center]' },
    )
    expect(archivedRes.archived).toBe(true)

    const restoredDoc = (await updateMediaMetadata(harness.payload, harness.owner, {
      scope,
      mediaId: String(docAsset.id),
      retentionMode: 'permanent',
      removeFromDiscovery: false,
    })) as Record<string, unknown>
    expect(restoredDoc.retentionMode).toBe('permanent')

    // Unreferenced orphan asset can be hard-deleted cleanly
    await deleteOrphanedMedia(harness.payload, config, harness.owner, {
      scope,
      mediaId: String(docAsset.id),
    })
    await expect(
      getScopedMediaAssetDetail(harness.payload, harness.owner, {
        siteId: 'site-1',
        mediaId: String(docAsset.id),
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
