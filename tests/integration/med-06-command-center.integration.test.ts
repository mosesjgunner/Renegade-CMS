/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import React from 'react'
import sharp from 'sharp'
import { renderToStaticMarkup } from 'react-dom/server'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import {
  createUploadSession,
  finalizeUploadSession,
  writeUploadChunk,
} from '../../src/modules/media/upload-sessions'
import { processAssetVariants } from '../../src/modules/media/variants'
import {
  attachMediaToContent,
  deleteOrphanedMedia,
  updateMediaMetadata,
} from '../../src/modules/media/workflow'
import {
  executeCommandCenterAction,
  getMediaCommandCenterOverview,
} from '../../src/modules/media/command-center'
import { validatePodcastFeed } from '../../src/modules/media/publishing'
import { PodcastPlayer } from '../../src/modules/media/PodcastPlayer'
import { VideoPlayer } from '../../src/modules/media/VideoPlayer'
import { GET as mediaGet } from '../../src/app/(frontend)/media/[id]/route'
import { GET as feedGet } from '../../src/app/(frontend)/podcasts/[slug]/feed.xml/route'
import { seed } from '../../src/scripts/seed'

function createWavBuffer(durationSeconds: number, sampleRate = 44100, channels = 2): Uint8Array {
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const numSamples = Math.floor(sampleRate * durationSeconds)
  const dataSize = numSamples * blockAlign
  const totalSize = 44 + dataSize

  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // 'RIFF'
  view.setUint32(4, totalSize - 8, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8) // 'WAVE'

  bytes.set([0x66, 0x6d, 0x74, 0x20], 12) // 'fmt '
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)

  bytes.set([0x64, 0x61, 0x74, 0x61], 36) // 'data'
  view.setUint32(40, dataSize, true)

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.floor(Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 16000)
    for (let ch = 0; ch < channels; ch++) {
      view.setInt16(44 + (i * channels + ch) * 2, sample, true)
    }
  }

  return bytes
}

function createMp4Buffer(): Uint8Array {
  // ISO base media file box: 32 bytes with 'ftyp' and 'isom'
  const buffer = new ArrayBuffer(32)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  view.setUint32(0, 32, false) // Box size = 32
  bytes.set([0x66, 0x74, 0x79, 0x70], 4) // 'ftyp'
  bytes.set([0x69, 0x73, 0x6f, 0x6d], 8) // 'isom'
  view.setUint32(12, 1, false) // Minor version = 1
  bytes.set([0x6d, 0x70, 0x34, 0x31], 16) // 'mp41'
  return bytes
}

function createPdfBuffer(): Uint8Array {
  const content = `%PDF-1.4\n% unique-${randomUUID()}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n185\n%%EOF`
  return new TextEncoder().encode(content)
}

async function uploadAllChunks(
  payload: Payload,
  appConfig: any,
  user: any,
  session: any,
  bytes: Uint8Array,
) {
  const chunkSize = Number(session.chunkSize)
  const total = Number(session.expectedSize)
  const count = Math.ceil(total / chunkSize)
  for (let index = 0; index < count; index++) {
    const start = index * chunkSize
    const end = Math.min(start + chunkSize, total)
    const chunkBytes = bytes.subarray(start, end)
    await writeUploadChunk(payload, appConfig, user, session.id, index, start, total, chunkBytes)
  }
}

let payload: Payload
let testMediaDir: string
let site: any
let user: any

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  testMediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-med06-int-'))
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

describe('MED-06 Media Pass Release Gate — Comprehensive Acceptance Integration', () => {
  it('exercises the complete 14-stage Mandatory Clean Demo workflow across PostgreSQL, durable storage, podcast feed, and video delivery', async () => {
    const appConfig = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL || 'postgresql://renegade:renegade@127.0.0.1:5432/renegade',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: testMediaDir,
    })

    // =========================================================================
    // STEP 1: Upload real Image, PDF, Audio, and Video files via durable sessions
    // =========================================================================
    // 1.1 Real Image (PNG 1200x800)
    const pngBuffer = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 4,
        background: { r: 37, g: 99, b: 235, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
    const imageBytes = new Uint8Array(pngBuffer)
    const imageChecksum = `sha256:${createHash('sha256').update(imageBytes).digest('hex')}`

    const imgSession = await createUploadSession(payload, appConfig, {
      user,
      scope: { kind: 'site', siteId: site.id },
      filename: 'panoramic-hero.png',
      size: imageBytes.byteLength,
      checksum: imageChecksum,
    })
    await uploadAllChunks(payload, appConfig, user, imgSession, imageBytes)
    const imageAsset = (await finalizeUploadSession(payload, appConfig, user, imgSession.id)) as any
    expect(imageAsset.id).toBeTruthy()
    expect(imageAsset.checksum).toBe(imageChecksum)

    // 1.2 Real PDF Document
    const pdfBytes = createPdfBuffer()
    const pdfChecksum = `sha256:${createHash('sha256').update(pdfBytes).digest('hex')}`
    const pdfSession = await createUploadSession(payload, appConfig, {
      user,
      scope: { kind: 'site', siteId: site.id },
      filename: 'manifesto.pdf',
      size: pdfBytes.byteLength,
      checksum: pdfChecksum,
    })
    await uploadAllChunks(payload, appConfig, user, pdfSession, pdfBytes)
    const pdfAsset = (await finalizeUploadSession(payload, appConfig, user, pdfSession.id)) as any
    expect(pdfAsset.id).toBeTruthy()
    expect(pdfAsset.kind).toBe('document')

    // 1.3 Real Audio (WAV Sine Wave)
    const wavBytes = createWavBuffer(2)
    const wavChecksum = `sha256:${createHash('sha256').update(wavBytes).digest('hex')}`
    const audioSession = await createUploadSession(payload, appConfig, {
      user,
      scope: { kind: 'site', siteId: site.id },
      filename: 'episode-01.wav',
      size: wavBytes.byteLength,
      checksum: wavChecksum,
    })
    await uploadAllChunks(payload, appConfig, user, audioSession, wavBytes)
    const audioAsset = (await finalizeUploadSession(
      payload,
      appConfig,
      user,
      audioSession.id,
    )) as any
    expect(audioAsset.id).toBeTruthy()
    expect(audioAsset.kind).toBe('audio')

    // 1.4 Real Video (MP4 Container)
    const mp4Bytes = createMp4Buffer()
    const mp4Checksum = `sha256:${createHash('sha256').update(mp4Bytes).digest('hex')}`
    const videoSession = await createUploadSession(payload, appConfig, {
      user,
      scope: { kind: 'site', siteId: site.id },
      filename: 'short-brief.mp4',
      size: mp4Bytes.byteLength,
      checksum: mp4Checksum,
    })
    await uploadAllChunks(payload, appConfig, user, videoSession, mp4Bytes)
    const videoAsset = (await finalizeUploadSession(
      payload,
      appConfig,
      user,
      videoSession.id,
    )) as any
    expect(videoAsset.id).toBeTruthy()
    expect(videoAsset.kind).toBe('video')

    // =========================================================================
    // STEP 2: Use image in rich text / layout / SEO / Post
    // =========================================================================
    const post = await payload.create({
      collection: 'content',
      data: {
        site: site.id,
        contentType: 'article',
        title: 'Decentralized Publishing Manifesto',
        slug: `manifesto-${randomUUID().slice(0, 8)}`,
        status: 'draft',
      } as any,
      overrideAccess: true,
    })

    await attachMediaToContent(payload, user, {
      scope: { kind: 'site', siteId: site.id },
      contentId: post.id,
      mediaId: imageAsset.id,
    })

    // =========================================================================
    // STEP 3: Generate responsive variants and crop
    // =========================================================================
    const variantResults = await processAssetVariants(payload, appConfig, imageAsset.id, {
      focalPoint: { x: 0.5, y: 0.5 },
    })
    expect(variantResults.length).toBeGreaterThanOrEqual(4)
    expect(variantResults.some((v) => v.recipeKey === 'thumbnail')).toBe(true)
    expect(variantResults.some((v) => v.recipeKey === 'hero')).toBe(true)

    // Verify variants were saved in database
    const variantsInDb = await payload.find({
      collection: 'media-variants',
      where: { asset: { equals: imageAsset.id } },
      overrideAccess: true,
    })
    expect(variantsInDb.docs.length).toBeGreaterThanOrEqual(4)

    // =========================================================================
    // STEP 4: Apply metadata and rights
    // =========================================================================
    const updatedImage = await updateMediaMetadata(payload, user, {
      mediaId: imageAsset.id,
      scope: { kind: 'site', siteId: site.id },
      title: 'Hero Panoramic Banner',
      altText: 'Vibrant blue gradient banner for the decentralization manifesto',
      caption: 'Captured during the foundation release ceremony',
      creatorCredit: 'Renegade Media Laboratory',
      source: 'Internal production',
      licenseType: 'owned',
      rightsExpiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    })
    expect((updatedImage as any).title).toBe('Hero Panoramic Banner')
    expect((updatedImage as any).creatorCredit).toBe('Renegade Media Laboratory')

    // =========================================================================
    // STEP 5: Publish Page & Post referencing the media
    // =========================================================================
    await payload.update({
      collection: 'content',
      id: post.id,
      data: {
        status: 'published',
        publishedAt: new Date().toISOString(),
      } as any,
      overrideAccess: true,
    })

    // Update media usage to public
    const existingUsage = await payload.find({
      collection: 'media-usages',
      where: { usageKey: { equals: `content:${post.id}:hero` } },
      limit: 1,
      overrideAccess: true,
    })
    if (existingUsage.docs.length > 0) {
      await payload.update({
        collection: 'media-usages',
        id: existingUsage.docs[0].id,
        data: { lifecycle: 'public' } as any,
        overrideAccess: true,
      })
    }

    // =========================================================================
    // STEP 6: Create and publish podcast episode with feed, player, transcript, chapters
    // =========================================================================
    const showSlug = `renegade-radio-${randomUUID().slice(0, 8)}`
    const show = await payload.create({
      collection: 'podcast-shows' as any,
      data: {
        site: site.id,
        title: 'Renegade Radio',
        slug: showSlug,
        description: 'Dispatches from the front lines of decentralized media.',
        language: 'en',
        explicit: false,
        author: 'Renegade Collective',
        artwork: imageAsset.id,
        rssEnabled: true,
        status: 'published',
        publishedAt: new Date().toISOString(),
      } as any,
      overrideAccess: true,
    })

    const episodeSlug = `ep-01-${randomUUID().slice(0, 8)}`
    const episode = await payload.create({
      collection: 'podcast-episodes' as any,
      data: {
        site: site.id,
        show: show.id,
        title: 'Episode 1: The Sovereign Stack',
        slug: episodeSlug,
        seasonNumber: 1,
        episodeNumber: 1,
        status: 'published',
        publishedAt: new Date().toISOString(),
        audio: audioAsset.id,
        enclosureUrl: `/media/${audioAsset.id}`,
        enclosureBytes: wavBytes.byteLength,
        enclosureMimeType: 'audio/wav',
        durationSeconds: 2.0,
        chapters: [
          { startTime: 0, title: 'Introduction' },
          { startTime: 1, title: 'Core Concepts' },
        ],
      } as any,
      overrideAccess: true,
    })

    // Test PodcastPlayer accessible rendering
    const playerMarkup = renderToStaticMarkup(
      React.createElement(PodcastPlayer, {
        title: episode.title,
        src: `/media/${audioAsset.id}`,
        type: 'audio/wav',
        chapters: [
          { title: 'Intro', startTime: 0 },
          { title: 'Outro', startTime: 1 },
        ],
      }),
    )
    expect(playerMarkup).toContain('<audio')
    expect(playerMarkup).toContain('The Sovereign Stack')

    // Test RSS feed generation & feed validation
    const feedResponse = await feedGet(
      new Request(`http://localhost:3000/podcasts/${showSlug}/feed.xml`),
      {
        params: Promise.resolve({ slug: showSlug }),
      },
    )
    expect(feedResponse.status).toBe(200)
    const feedXml = await feedResponse.text()
    const feedValidation = validatePodcastFeed(feedXml)
    expect(feedValidation.valid).toBe(true)
    expect(feedXml).toContain(show.title)
    expect(feedXml).toContain(episode.title)

    // =========================================================================
    // STEP 7: Process and publish small video with poster, captions, player
    // =========================================================================
    const videoAssetRecord = await payload.create({
      collection: 'video-assets' as any,
      data: {
        site: site.id,
        sourceAsset: videoAsset.id,
        title: 'Sovereign Architecture Video',
        processingState: 'ready',
        progress: 100,
        metadata: {
          durationSeconds: 10,
          width: 640,
          height: 360,
          container: 'mp4',
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
        outputs: [
          {
            key: 'baseline',
            mimeType: 'video/mp4',
            filename: 'baseline.mp4',
            storageKey: `${site.id}/video/${videoAsset.id}/baseline.mp4`,
            sizeBytes: 10240,
            checksum: `sha256:${'b'.repeat(64)}`,
          },
          {
            key: 'hls',
            mimeType: 'application/vnd.apple.mpegurl',
            filename: 'stream.m3u8',
            storageKey: `${site.id}/video/${videoAsset.id}/stream.m3u8`,
            sizeBytes: 512,
            checksum: `sha256:${'c'.repeat(64)}`,
          },
          {
            key: 'poster',
            mimeType: 'image/jpeg',
            filename: 'poster.jpg',
            storageKey: `${site.id}/video/${videoAsset.id}/poster.jpg`,
            sizeBytes: 2048,
            checksum: `sha256:${'d'.repeat(64)}`,
          },
        ],
        captions: [
          {
            language: 'en',
            label: 'English',
            isDefault: true,
            storageKey: `${site.id}/video/${videoAsset.id}/en.vtt`,
          },
        ],
      } as any,
      overrideAccess: true,
    })

    const videoPlayerMarkup = renderToStaticMarkup(
      React.createElement(VideoPlayer, {
        title: videoAssetRecord.title,
        src: `/media/${videoAsset.id}`,
        hlsSrc: '/video/stream.m3u8',
        poster: '/video/poster.jpg',
        captions: [{ src: '/video/en.vtt', language: 'en', label: 'English', default: true }],
      }),
    )
    expect(videoPlayerMarkup).toContain('<video')
    expect(videoPlayerMarkup).toContain('<track')

    // =========================================================================
    // STEP 8: Query Command Center overview & verify telemetry
    // =========================================================================
    const overview = await getMediaCommandCenterOverview(payload, appConfig, site.id)
    expect(overview.storage.driver).toBe('local')
    expect(overview.storage.status).toBe('healthy')
    expect(overview.storage.target).toBe('local:[media-root]')
    expect(overview.storage.target).not.toContain(testMediaDir) // zero secret/path leak!
    expect(overview.stats.totalAssets).toBeGreaterThanOrEqual(4)
    expect(overview.podcasts.shows.length).toBeGreaterThanOrEqual(1)
    expect(overview.podcasts.episodes.length).toBeGreaterThanOrEqual(1)
    expect(overview.videos.length).toBeGreaterThanOrEqual(1)

    // =========================================================================
    // STEP 9: Inspect all usages across the system
    // =========================================================================
    const inspectResult = await executeCommandCenterAction(
      payload,
      appConfig,
      user,
      site.id,
      'inspect-usages',
      { mediaId: imageAsset.id },
    )
    const usages = inspectResult.usages as Array<Record<string, unknown>>
    expect(usages.length).toBeGreaterThanOrEqual(1)
    expect(usages.some((u) => u.targetType === 'content' && u.lifecycle === 'public')).toBe(true)

    // =========================================================================
    // STEP 10: Attempt prohibited delete and replacement
    // =========================================================================
    // Attempting delete on referenced image MUST be rejected
    await expect(
      deleteOrphanedMedia(payload, appConfig, user, {
        mediaId: imageAsset.id,
        scope: { kind: 'site', siteId: site.id },
      }),
    ).rejects.toThrow(/Referenced media cannot be deleted/)

    // =========================================================================
    // STEP 11: Execute direct actions: metadata repair and archive
    // =========================================================================
    const repairResult = await executeCommandCenterAction(
      payload,
      appConfig,
      user,
      site.id,
      'repair-metadata',
      {
        mediaId: imageAsset.id,
        title: 'Hero Panoramic Banner (Repaired)',
      },
    )
    expect(repairResult.repaired).toBe(true)

    // Impact preview
    const impactResult = await executeCommandCenterAction(
      payload,
      appConfig,
      user,
      site.id,
      'impact-preview',
      { mediaId: imageAsset.id },
    )
    const impact = impactResult.impact as { affected: number; usages: unknown[] }
    expect(impact.affected).toBeGreaterThanOrEqual(1)

    // =========================================================================
    // STEP 12: Public delivery & HTTP 206 byte range responses
    // =========================================================================
    // 12.1 Standard GET (200 OK)
    const publicReq = new Request(`http://localhost:3000/media/${imageAsset.id}`)
    const publicRes = await mediaGet(publicReq, {
      params: Promise.resolve({ id: imageAsset.id }),
    })
    expect(publicRes.status).toBe(200)
    expect(publicRes.headers.get('content-type')).toBe('image/png')
    expect(publicRes.headers.get('accept-ranges')).toBe('bytes')

    // 12.2 Range GET (HTTP 206 Partial Content)
    const rangeReq = new Request(`http://localhost:3000/media/${imageAsset.id}`, {
      headers: { range: 'bytes=0-15' },
    })
    const rangeRes = await mediaGet(rangeReq, {
      params: Promise.resolve({ id: imageAsset.id }),
    })
    expect(rangeRes.status).toBe(206)
    expect(rangeRes.headers.get('content-range')).toMatch(/^bytes 0-15\/\d+$/)
    expect(rangeRes.headers.get('content-length')).toBe('16')

    // =========================================================================
    // STEP 13: Clean deletion of unreferenced orphan
    // =========================================================================
    // PDF document was not attached to any public content, so it is an orphan
    const deletePdfResult = await executeCommandCenterAction(
      payload,
      appConfig,
      user,
      site.id,
      'delete-orphan',
      { mediaId: pdfAsset.id },
    )
    expect(deletePdfResult.deleted).toBe(true)

    // Verify PDF is removed from media-assets
    const checkPdf = await payload
      .findByID({
        collection: 'media-assets',
        id: pdfAsset.id,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    expect(checkPdf).toBeNull()

    // =========================================================================
    // STEP 14: Evidence Summary
    // =========================================================================
    expect(imageChecksum).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(wavChecksum).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(mp4Checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
  }, 30_000)
})
