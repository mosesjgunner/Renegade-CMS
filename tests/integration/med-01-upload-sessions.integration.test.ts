/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import {
  cancelUploadSession,
  cleanupExpiredUploadSessions,
  createUploadSession,
  finalizeUploadSession,
  readUploadSession,
  writeUploadChunk,
} from '../../src/modules/media/upload-sessions'
import { attachMediaToContent, publicMedia } from '../../src/modules/media/workflow'
import { seed } from '../../src/scripts/seed'

let payload: Payload
let testMediaDir: string

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0,
  0, 0, 1,
])

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  testMediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-med01-pg-'))
})

afterAll(async () => {
  if (testMediaDir) {
    await rm(testMediaDir, { recursive: true, force: true }).catch(() => undefined)
  }
  await payload?.db.destroy?.()
})

describe('MED-01 durable upload sessions PostgreSQL integration', () => {
  it('exercises complete session lifecycle: creation, chunking, idempotency, finalization, recovery, cancel, cleanup, and attachment', async () => {
    const siteResult = await payload.find({
      collection: 'sites',
      where: { slug: { equals: 'demo-publication' } },
      limit: 1,
      overrideAccess: true,
    })
    const site = siteResult.docs[0] as any
    expect(site).toBeTruthy()

    const membersResult = await payload.find({
      collection: 'members',
      where: { email: { equals: 'river@example.test' } },
      limit: 1,
      overrideAccess: true,
    })
    const member = membersResult.docs[0] as any
    expect(member).toBeTruthy()

    // Staff user context
    const user = {
      role: 'owner',
      member: member.id,
      site: { id: site.id },
    }

    const appConfig = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL || 'postgresql://renegade:renegade@127.0.0.1:5432/renegade',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: testMediaDir,
    })

    // 1. CREATE SESSION
    const session = await createUploadSession(payload, appConfig, {
      user,
      scope: { kind: 'site', siteId: site.id },
      filename: 'hero-banner.png',
      title: 'Hero Banner Image',
      size: png.length,
    })

    expect(session).toBeTruthy()
    expect(session.id).toMatch(/^[a-f0-9-]{36}$/)
    expect(session.state).toBe('open')
    expect(Number(session.expectedSize)).toBe(png.length)
    expect(Number(session.receivedBytes)).toBe(0)
    expect(session.filename).toBe('hero-banner.png')

    // Read session metadata (excludes internal storage paths)
    const readSession = await readUploadSession(payload, user, session.id)
    expect(readSession.id).toBe(session.id)
    expect(readSession.state).toBe('open')
    expect(readSession.expectedSize).toBe(png.length)
    expect(readSession.receivedBytes).toBe(0)
    expect(readSession.receivedChunks).toEqual([])

    // 2. WRITE CHUNK
    const chunkResult1 = await writeUploadChunk(
      payload,
      appConfig,
      user,
      session.id,
      0,
      0,
      png.length,
      png,
    )
    expect(chunkResult1.received).toBe(png.length)
    expect(chunkResult1.receivedBytes).toBe(png.length)
    expect(chunkResult1.complete).toBe(true)

    // Staging part file exists on disk in private staging area
    const partFile = path.join(testMediaDir, '.upload-sessions', session.id, '0.part')
    expect(existsSync(partFile)).toBe(true)

    // 3. IDEMPOTENT CHUNK RETRY
    const chunkResult2 = await writeUploadChunk(
      payload,
      appConfig,
      user,
      session.id,
      0,
      0,
      png.length,
      png,
    )
    expect(chunkResult2.received).toBe(0) // No new bytes added
    expect(chunkResult2.receivedBytes).toBe(png.length)

    // 4. CHUNK INTEGRITY MISMATCH
    const badBytes = new Uint8Array([0x00, 0x01, 0x02])
    await expect(
      writeUploadChunk(payload, appConfig, user, session.id, 0, 0, png.length, badBytes),
    ).rejects.toMatchObject({ status: 409 })

    // 5. FINALIZE SESSION INTO CANONICAL ASSET
    const asset = await finalizeUploadSession(payload, appConfig, user, session.id)
    expect(asset).toBeTruthy()
    expect(asset.id).toBeTruthy()
    expect(asset.title).toBe('Hero Banner Image')
    expect(asset.mimeType).toBe('image/png')
    expect(asset.sizeBytes).toBe(png.length)
    expect(asset.originalBlob).toBeTruthy()

    // Staging directory must be cleaned up immediately upon completion
    const stagingDir = path.join(testMediaDir, '.upload-sessions', session.id)
    expect(existsSync(stagingDir)).toBe(false)

    // Session in DB is marked completed with asset link
    const completedSession = (await payload.findByID({
      collection: 'media-upload-sessions',
      id: session.id,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(completedSession.state).toBe('completed')
    expect(completedSession.asset).toBe(asset.id)

    // Re-finalizing is idempotent and safe
    const refinalized = await finalizeUploadSession(payload, appConfig, user, session.id)
    expect(refinalized.id).toBe(asset.id)

    // 6. PROCESS-RESTART RECOVERY FOR FINALIZING SESSIONS
    const retrySession = await createUploadSession(payload, appConfig, {
      user,
      scope: { kind: 'site', siteId: site.id },
      filename: 'retry-image.png',
      title: 'Retry Image',
      size: png.length,
    })
    await writeUploadChunk(payload, appConfig, user, retrySession.id, 0, 0, png.length, png)

    // Simulate process death after state transition to 'finalizing'
    await payload.update({
      collection: 'media-upload-sessions',
      id: retrySession.id,
      overrideAccess: true,
      data: { state: 'finalizing' },
    })

    // Recovery succeeds cleanly
    const recoveredAsset = await finalizeUploadSession(payload, appConfig, user, retrySession.id)
    expect(recoveredAsset.id).toBeTruthy()
    const recoveredDbSession = (await payload.findByID({
      collection: 'media-upload-sessions',
      id: retrySession.id,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(recoveredDbSession.state).toBe('completed')
    expect(recoveredDbSession.asset).toBe(recoveredAsset.id)

    // 7. CANCELLATION
    const cancelSession = await createUploadSession(payload, appConfig, {
      user,
      scope: { kind: 'site', siteId: site.id },
      filename: 'cancel-image.png',
      size: png.length,
    })
    await writeUploadChunk(payload, appConfig, user, cancelSession.id, 0, 0, png.length, png)
    const cancelStagingDir = path.join(testMediaDir, '.upload-sessions', cancelSession.id)
    expect(existsSync(cancelStagingDir)).toBe(true)

    await cancelUploadSession(payload, appConfig, user, cancelSession.id)
    expect(existsSync(cancelStagingDir)).toBe(false)
    const cancelledDb = (await payload.findByID({
      collection: 'media-upload-sessions',
      id: cancelSession.id,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(cancelledDb.state).toBe('cancelled')

    // 8. WORKER CLEANUP OF EXPIRED SESSIONS
    const expiredSession = await createUploadSession(payload, appConfig, {
      user,
      scope: { kind: 'site', siteId: site.id },
      filename: 'expired-image.png',
      size: png.length,
    })
    await writeUploadChunk(payload, appConfig, user, expiredSession.id, 0, 0, png.length, png)
    const expiredStagingDir = path.join(testMediaDir, '.upload-sessions', expiredSession.id)
    expect(existsSync(expiredStagingDir)).toBe(true)

    // Manually set expiry in the past
    await payload.update({
      collection: 'media-upload-sessions',
      id: expiredSession.id,
      overrideAccess: true,
      data: { expiresAt: new Date(Date.now() - 3600_000).toISOString() },
    })

    const cleanedCount = await cleanupExpiredUploadSessions(payload, appConfig)
    expect(cleanedCount).toBeGreaterThanOrEqual(1)
    expect(existsSync(expiredStagingDir)).toBe(false)
    const cleanedDb = (await payload.findByID({
      collection: 'media-upload-sessions',
      id: expiredSession.id,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(cleanedDb.state).toBe('expired')

    // 9. ATTACH TO CONTENT & VERIFY PUBLIC ACCESS
    const articles = await payload.find({
      collection: 'content',
      where: { and: [{ site: { equals: site.id } }, { status: { equals: 'published' } }] },
      limit: 1,
      overrideAccess: true,
    })
    if (articles.docs.length > 0) {
      const article = articles.docs[0] as any
      await attachMediaToContent(payload, user, {
        scope: { kind: 'site', siteId: site.id },
        mediaId: asset.id,
        contentId: article.id,
      })

      const resolved = await publicMedia(payload, asset.id)
      expect(resolved).toBeTruthy()
      expect(resolved?.id).toBe(asset.id)
    }
  }, 45_000)
})
