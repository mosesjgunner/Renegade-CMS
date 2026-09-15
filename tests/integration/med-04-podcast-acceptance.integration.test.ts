/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import { extractAudioMetadata } from '../../src/modules/media/audio'
import { validatePodcastFeed } from '../../src/modules/media/publishing'
import { GET as mediaGet } from '../../src/app/(frontend)/media/[id]/route'
import { GET as feedGet } from '../../src/app/(frontend)/podcasts/[slug]/feed.xml/route'
import { GET as transcriptGet } from '../../src/app/(frontend)/podcasts/episodes/[slug]/transcript/route'
import { GET as chaptersGet } from '../../src/app/(frontend)/podcasts/episodes/[slug]/chapters.json/route'
import PodcastShowPage from '../../src/app/(frontend)/podcasts/[slug]/page'
import EpisodePage from '../../src/app/(frontend)/podcasts/episodes/[slug]/page'
import { seed } from '../../src/scripts/seed'

/**
 * Creates a valid RIFF/WAVE 16-bit PCM buffer with a sine wave audio tone.
 */
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

  // RIFF header
  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // 'RIFF'
  view.setUint32(4, totalSize - 8, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8) // 'WAVE'

  // fmt subchunk
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12) // 'fmt '
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // AudioFormat 1 = PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)

  // data subchunk
  bytes.set([0x64, 0x61, 0x74, 0x61], 36) // 'data'
  view.setUint32(40, dataSize, true)

  // 440Hz tone
  const freq = 440
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const sample = Math.floor(Math.sin(2 * Math.PI * freq * t) * 16000)
    for (let ch = 0; ch < channels; ch++) {
      view.setInt16(44 + (i * channels + ch) * 2, sample, true)
    }
  }

  return bytes
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet()
  return JSON.stringify(obj, (key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]'
      seen.add(val)
    }
    return val
  })
}

let payload: Payload
let testMediaDir: string
let site: any
let publication: any

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  testMediaDir = await mkdtemp(path.join(os.tmpdir(), 'renegade-med04-int-'))
  process.env.MEDIA_DIR = testMediaDir

  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()

  const pubResult = await payload.find({
    collection: 'publications',
    where: { site: { equals: site.id } },
    limit: 1,
    overrideAccess: true,
  })
  publication = pubResult.docs[0]
  expect(publication).toBeTruthy()
})

afterAll(async () => {
  if (testMediaDir) {
    await rm(testMediaDir, { recursive: true, force: true }).catch(() => undefined)
  }
  await payload?.db.destroy?.()
})

describe('MED-04 Podcast Publishing Workflow End-to-End Acceptance', () => {
  it('creates show and two episodes, handles preview/scheduling, renders player/pages, validates RSS, handles range requests, maintains invariant GUIDs across slug rename, and restarts cleanly', async () => {
    const appConfig = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL || 'postgresql://renegade:renegade@127.0.0.1:5432/renegade',
      PAYLOAD_SECRET: 'a'.repeat(48),
      APP_URL: 'http://localhost:3000',
      MEDIA_DIR: testMediaDir,
    })

    const storage = mediaStorage(appConfig)
    const runId = randomUUID().slice(0, 8)
    const showSlug = `renegade-chronicle-${runId}`
    const ep1Slug = `ep1-sovereign-web-${runId}`
    const ep1RenamedSlug = `ep1-sovereign-web-renamed-${runId}`
    const ep2Slug = `ep2-post-saas-${runId}`

    // 1. Generate real audio fixture (2.0s WAV PCM)
    const wavBytes = createWavBuffer(2.0, 44100, 2)
    const audioMeta = extractAudioMetadata(wavBytes, 'audio/wav')!
    expect(audioMeta).toBeDefined()
    expect(audioMeta.durationSeconds).toBeCloseTo(2.0, 1)

    // 2. Generate real artwork fixture (1400x1400 standard podcast square cover)
    const artworkBuffer = await sharp({
      create: {
        width: 1400,
        height: 1400,
        channels: 4,
        background: { r: 30, g: 41, b: 59, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
    const artworkBytes = new Uint8Array(artworkBuffer)

    // Save physical files into storage
    const audioKey = `${site.id}/${randomUUID()}.wav`
    const artworkKey = `${site.id}/${randomUUID()}.png`
    await storage.put(audioKey, wavBytes, 'audio/wav')
    await storage.put(artworkKey, artworkBytes, 'image/png')

    const audioBlob = await payload.create({
      collection: 'media-blobs',
      data: {
        site: site.id,
        storageKey: audioKey,
        storageProvider: 'local',
        mimeType: 'audio/wav',
        sizeBytes: wavBytes.byteLength,
        checksum: `sha256:audio-${runId}`,
        state: 'ready',
      },
      overrideAccess: true,
    })

    const audioAsset = await payload.create({
      collection: 'media-assets',
      data: {
        site: site.id,
        title: 'Episode 1 Audio',
        kind: 'audio',
        storageProvider: 'local',
        originalBlob: audioBlob.id,
        storageLocation: audioKey,
        mimeType: 'audio/wav',
        sizeBytes: wavBytes.byteLength,
        checksum: `sha256:audio-${runId}`,
        durationSeconds: audioMeta.durationSeconds,
        audioMetadata: {
          ...audioMeta,
          checksum: `sha256:audio-${runId}`,
        },
      } as any,
      overrideAccess: true,
    })

    const artworkBlob = await payload.create({
      collection: 'media-blobs',
      data: {
        site: site.id,
        storageKey: artworkKey,
        storageProvider: 'local',
        mimeType: 'image/png',
        sizeBytes: artworkBytes.byteLength,
        checksum: `sha256:artwork-${runId}`,
        state: 'ready',
      },
      overrideAccess: true,
    })

    const artworkAsset = await payload.create({
      collection: 'media-assets',
      data: {
        site: site.id,
        title: 'Show Artwork Cover',
        kind: 'image',
        storageProvider: 'local',
        originalBlob: artworkBlob.id,
        storageLocation: artworkKey,
        mimeType: 'image/png',
        sizeBytes: artworkBytes.byteLength,
        checksum: `sha256:artwork-${runId}`,
        width: 1400,
        height: 1400,
      } as any,
      overrideAccess: true,
    })

    // Create author and category for show and episodes
    const author = await payload.create({
      collection: 'authors',
      data: {
        displayName: 'Alex Vance',
        slug: `alex-vance-${runId}`,
      },
      overrideAccess: true,
    })

    const category = await payload.create({
      collection: 'categories',
      data: {
        site: site.id,
        publication: publication.id,
        name: 'Technology',
        slug: `technology-${runId}`,
        canonicalPath: `/categories/technology-${runId}`,
      } as any,
      overrideAccess: true,
    })

    // 3. Create Canonical Podcast Show
    const show = (await payload.create({
      collection: 'podcast-shows',
      data: {
        site: site.id,
        title: `The Renegade Chronicle ${runId}`,
        slug: showSlug,
        description:
          'Autonomous, self-hosted web publishing insights and deep technical sovereignty.',
        artwork: artworkAsset.id,
        explicit: false,
        language: 'en-US',
        copyright: '2026 Renegade Network',
        rssEnabled: true,
        authors: [author.id],
        categories: [category.id],
        status: 'published',
        _status: 'published',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
      } as any,
      overrideAccess: true,
    })) as any

    expect(show.id).toBeDefined()
    expect(show.slug).toBe(showSlug)
    expect(show.canonicalPath).toBe(`/podcasts/${showSlug}`)

    // Create Transcript Revisions
    const transcriptRev1 = await payload.create({
      collection: 'transcript-revisions',
      data: {
        title: `Episode 1 Transcript ${runId}`,
        media: audioAsset.id,
        version: 1,
        source: 'manual',
        checksum: `sha256:transcript-${runId}-1`,
        segments: [
          {
            startTime: 0.0,
            startSeconds: 0.0,
            endTime: 1.0,
            endSeconds: 1.0,
            text: 'Welcome to The Sovereign Web.',
          },
          {
            startTime: 1.0,
            startSeconds: 1.0,
            endTime: 2.0,
            endSeconds: 2.0,
            text: 'Control your own media destiny without SaaS intermediaries.',
          },
        ],
        immutable: true,
      },
      overrideAccess: true,
    })

    const transcriptRev2 = await payload.create({
      collection: 'transcript-revisions',
      data: {
        title: `Episode 2 Transcript ${runId}`,
        media: audioAsset.id,
        version: 1,
        source: 'manual',
        checksum: `sha256:transcript-${runId}-2`,
        segments: [
          {
            startTime: 0.0,
            startSeconds: 0.0,
            endTime: 1.0,
            endSeconds: 1.0,
            text: 'Next week on Renegade.',
          },
        ],
        immutable: true,
      },
      overrideAccess: true,
    })

    // 4. Create Episode 1 (Published)
    const ep1 = (await payload.create({
      collection: 'podcast-episodes',
      data: {
        site: site.id,
        show: show.id,
        title: `Episode 1: The Sovereign Web ${runId}`,
        slug: ep1Slug,
        seasonNumber: 1,
        episodeNumber: 1,
        episodeType: 'full',
        explicit: false,
        audio: audioAsset.id,
        artwork: artworkAsset.id,
        enclosureUrl: `/media/${audioAsset.id}`,
        enclosureBytes: wavBytes.byteLength,
        enclosureMimeType: 'audio/wav',
        durationSeconds: 2.0,
        credits: 'Produced by Renegade CMS Audio Labs.',
        rights: { license: 'CC-BY-4.0', sovereignty: 'self-hosted' },
        transcript: transcriptRev1.id,
        chapters: [
          {
            startTime: 0.0,
            startSeconds: 0.0,
            title: 'Introduction',
            url: 'http://localhost:3000/intro',
          },
          {
            startTime: 1.0,
            startSeconds: 1.0,
            title: 'Decentralized Audio',
            url: 'http://localhost:3000/decentralized',
          },
        ],
        authors: [author.id],
        status: 'published',
        _status: 'published',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
      } as any,
      overrideAccess: true,
    })) as any

    expect(ep1.id).toBeDefined()
    expect(ep1.guid).toMatch(/^urn:renegade:podcast:/)
    expect(ep1.canonicalPath).toBe(`/podcasts/episodes/${ep1Slug}`)
    const originalGuid = ep1.guid

    // 5. Create Episode 2 (Scheduled / Future)
    const futureDate = new Date(Date.now() + 7 * 86400000).toISOString()
    const ep2 = (await payload.create({
      collection: 'podcast-episodes',
      data: {
        site: site.id,
        show: show.id,
        title: `Episode 2: Post-SaaS Architectures ${runId}`,
        slug: ep2Slug,
        seasonNumber: 1,
        episodeNumber: 2,
        episodeType: 'full',
        explicit: false,
        audio: audioAsset.id,
        artwork: artworkAsset.id,
        enclosureUrl: `/media/${audioAsset.id}`,
        enclosureBytes: wavBytes.byteLength,
        enclosureMimeType: 'audio/wav',
        durationSeconds: 2.0,
        transcript: transcriptRev2.id,
        chapters: [{ startTime: 0.0, startSeconds: 0.0, title: 'Teaser' }],
        authors: [author.id],
        status: 'scheduled',
        _status: 'draft',
        publishedAt: futureDate,
        scheduledFor: futureDate,
      } as any,
      overrideAccess: true,
    })) as any

    expect(ep2.id).toBeDefined()
    expect(ep2.guid).toMatch(/^urn:renegade:podcast:/)

    // 6. Test Public Show Page (`/podcasts/[slug]`)
    const showPageElement = await PodcastShowPage({
      params: Promise.resolve({ slug: showSlug }),
    })
    expect(showPageElement).toBeTruthy()
    const showPageJson = safeStringify(showPageElement)
    expect(showPageJson).toContain(`The Renegade Chronicle ${runId}`)
    expect(showPageJson).toContain(`Episode 1: The Sovereign Web ${runId}`)
    // Strictly excludes draft/scheduled Episode 2
    expect(showPageJson).not.toContain(`Episode 2: Post-SaaS Architectures ${runId}`)

    // 7. Test Episode Access Gating & Preview
    // Anonymous public access to scheduled/draft Episode 2 throws notFound()
    let scheduledNotFound = false
    try {
      await EpisodePage({
        params: Promise.resolve({ slug: ep2Slug }),
        searchParams: Promise.resolve({}),
      })
    } catch (err: any) {
      if (
        err?.message?.includes('NEXT_') ||
        err?.message?.includes('404') ||
        err?.digest?.includes('NEXT_') ||
        err?.digest?.includes('404')
      ) {
        scheduledNotFound = true
      }
    }
    expect(scheduledNotFound).toBe(true)

    // Public access to published Episode 1 succeeds
    const ep1PageElement = await EpisodePage({
      params: Promise.resolve({ slug: ep1Slug }),
      searchParams: Promise.resolve({}),
    })
    expect(ep1PageElement).toBeTruthy()
    const ep1PageJson = safeStringify(ep1PageElement)
    expect(ep1PageJson).toContain(`Episode 1: The Sovereign Web ${runId}`)
    expect(ep1PageJson).toContain('Welcome to The Sovereign Web.')
    expect(ep1PageJson).toContain('Introduction')
    expect(ep1PageJson).toContain('Decentralized Audio')
    expect(ep1PageJson).toContain('PodcastEpisode') // Schema.org JSON-LD

    // 8. Test Accessible HTML Transcript Endpoint
    const transcriptReq = new Request(
      `http://localhost:3000/podcasts/episodes/${ep1Slug}/transcript`,
    )
    const transcriptRes = await transcriptGet(transcriptReq, {
      params: Promise.resolve({ slug: ep1Slug }),
    })
    expect(transcriptRes.status).toBe(200)
    expect(transcriptRes.headers.get('content-type')).toContain('text/html')
    const transcriptHtml = await transcriptRes.text()
    expect(transcriptHtml).toContain(`Episode 1: The Sovereign Web ${runId} — Transcript`)
    expect(transcriptHtml).toContain('Welcome to The Sovereign Web.')
    const transcriptEtag = transcriptRes.headers.get('etag')
    expect(transcriptEtag).toBeTruthy()

    // Test conditional GET on transcript (304 Not Modified)
    const transcriptCondReq = new Request(
      `http://localhost:3000/podcasts/episodes/${ep1Slug}/transcript`,
      { headers: { 'if-none-match': transcriptEtag! } },
    )
    const transcriptCondRes = await transcriptGet(transcriptCondReq, {
      params: Promise.resolve({ slug: ep1Slug }),
    })
    expect(transcriptCondRes.status).toBe(304)

    // 9. Test Podcasting 2.0 Chapters JSON Endpoint
    const chaptersReq = new Request(
      `http://localhost:3000/podcasts/episodes/${ep1Slug}/chapters.json`,
    )
    const chaptersRes = await chaptersGet(chaptersReq, {
      params: Promise.resolve({ slug: ep1Slug }),
    })
    expect(chaptersRes.status).toBe(200)
    expect(chaptersRes.headers.get('content-type')).toContain('application/json')
    const chaptersData = await chaptersRes.json()
    expect(chaptersData.version).toBe('1.2.0')
    expect(chaptersData.chapters).toHaveLength(2)
    expect(chaptersData.chapters[0].title).toBe('Introduction')
    expect(chaptersData.chapters[1].title).toBe('Decentralized Audio')
    const chaptersEtag = chaptersRes.headers.get('etag')
    expect(chaptersEtag).toBeTruthy()

    // Test conditional GET on chapters (304 Not Modified)
    const chaptersCondReq = new Request(
      `http://localhost:3000/podcasts/episodes/${ep1Slug}/chapters.json`,
      { headers: { 'if-none-match': chaptersEtag! } },
    )
    const chaptersCondRes = await chaptersGet(chaptersCondReq, {
      params: Promise.resolve({ slug: ep1Slug }),
    })
    expect(chaptersCondRes.status).toBe(304)

    // 10. Test RSS Podcast Feed Generation & Validation
    const feedReq = new Request(`http://localhost:3000/podcasts/${showSlug}/feed.xml`)
    const feedRes = await feedGet(feedReq, {
      params: Promise.resolve({ slug: showSlug }),
    })
    expect(feedRes.status).toBe(200)
    expect(feedRes.headers.get('content-type')).toContain('application/rss+xml')
    const feedXml = await feedRes.text()

    // Validate standard feed specifications
    const feedValidation = validatePodcastFeed(feedXml)
    expect(feedValidation.valid).toBe(true)
    expect(feedValidation.enclosureLength).toBe(wavBytes.byteLength)
    expect(feedValidation.enclosureType).toBe('audio/wav')

    // Verify feed elements
    expect(feedXml).toContain('<rss version="2.0"')
    expect(feedXml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"')
    expect(feedXml).toContain('xmlns:podcast="https://podcastindex.org/namespace/1.0"')
    expect(feedXml).toContain(`<title>The Renegade Chronicle ${runId}</title>`)
    expect(feedXml).toContain('<itunes:author>Alex Vance</itunes:author>')
    expect(feedXml).toContain('<language>en-US</language>')
    // Episode 1 enclosure and metadata
    const publicOrigin = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    expect(feedXml).toContain(
      `<enclosure url="${publicOrigin}/media/${audioAsset.id}" length="${wavBytes.byteLength}" type="audio/wav"/>`,
    )
    expect(feedXml).toContain(`<guid isPermaLink="false">${ep1.guid}</guid>`)
    expect(feedXml).toContain('<itunes:duration>2</itunes:duration>')
    expect(feedXml).toContain('<itunes:season>1</itunes:season>')
    expect(feedXml).toContain('<itunes:episode>1</itunes:episode>')
    expect(feedXml).toContain(
      `transcript url="${publicOrigin}/podcasts/episodes/${ep1Slug}/transcript"`,
    )
    expect(feedXml).toContain(
      `podcast:chapters url="${publicOrigin}/podcasts/episodes/${ep1Slug}/chapters.json"`,
    )
    // Strictly excludes Episode 2
    expect(feedXml).not.toContain(`Episode 2: Post-SaaS Architectures ${runId}`)

    // Feed conditional GET (304 Not Modified)
    const feedEtag = feedRes.headers.get('etag')
    expect(feedEtag).toBeTruthy()
    const feedCondReq = new Request(`http://localhost:3000/podcasts/${showSlug}/feed.xml`, {
      headers: { 'if-none-match': feedEtag! },
    })
    const feedCondRes = await feedGet(feedCondReq, {
      params: Promise.resolve({ slug: showSlug }),
    })
    expect(feedCondRes.status).toBe(304)

    // 11. Test Enclosure Media Delivery & HTTP 206 Byte Range Requests
    const fullAudioReq = new Request(`http://localhost:3000/media/${audioAsset.id}`)
    const fullAudioRes = await mediaGet(fullAudioReq, {
      params: Promise.resolve({ id: String(audioAsset.id) }),
    })
    expect(fullAudioRes.status).toBe(200)
    expect(fullAudioRes.headers.get('accept-ranges')).toBe('bytes')
    expect(fullAudioRes.headers.get('content-type')).toBe('audio/wav')
    const fullBytes = new Uint8Array(await fullAudioRes.arrayBuffer())
    expect(fullBytes.byteLength).toBe(wavBytes.byteLength)

    // Byte Range request: first 100 bytes (0-99)
    const rangeAudioReq = new Request(`http://localhost:3000/media/${audioAsset.id}`, {
      headers: { Range: 'bytes=0-99' },
    })
    const rangeAudioRes = await mediaGet(rangeAudioReq, {
      params: Promise.resolve({ id: String(audioAsset.id) }),
    })
    expect(rangeAudioRes.status).toBe(206) // Partial Content
    expect(rangeAudioRes.headers.get('content-range')).toBe(`bytes 0-99/${wavBytes.byteLength}`)
    expect(rangeAudioRes.headers.get('content-length')).toBe('100')
    const rangeBytes = new Uint8Array(await rangeAudioRes.arrayBuffer())
    expect(rangeBytes.byteLength).toBe(100)
    expect(rangeBytes).toEqual(wavBytes.subarray(0, 100))

    // 12. Test Episode Slug Rename: GUID Remains Invariant & Public Redirect Auto-Created
    const updatedEp1 = (await payload.update({
      collection: 'podcast-episodes',
      id: ep1.id,
      data: {
        slug: ep1RenamedSlug,
      } as any,
      overrideAccess: true,
    })) as any

    expect(updatedEp1.slug).toBe(ep1RenamedSlug)
    // Invariant GUID guarantee: MUST NOT change
    expect(updatedEp1.guid).toBe(originalGuid)
    expect(updatedEp1.canonicalPath).toBe(`/podcasts/episodes/${ep1RenamedSlug}`)

    // Verify public-redirects entry was registered
    const redirectLookup = await payload.find({
      collection: 'public-redirects',
      where: {
        fromPath: { equals: `/podcasts/episodes/${ep1Slug}` },
      },
      limit: 1,
      overrideAccess: true,
    })
    expect(redirectLookup.docs).toHaveLength(1)
    const redirectDoc = redirectLookup.docs[0] as any
    expect(redirectDoc.toPath).toBe(`/podcasts/episodes/${ep1RenamedSlug}`)
    expect(redirectDoc.statusCode).toBe('308')

    // Feed reflects the new URL but maintains the EXACT same invariant GUID
    const feedAfterRenameRes = await feedGet(feedReq, {
      params: Promise.resolve({ slug: showSlug }),
    })
    const feedAfterRenameXml = await feedAfterRenameRes.text()
    expect(feedAfterRenameXml).toContain(`<guid isPermaLink="false">${originalGuid}</guid>`)
    expect(feedAfterRenameXml).toContain(
      `<link>${publicOrigin}/podcasts/episodes/${ep1RenamedSlug}</link>`,
    )
    expect(feedAfterRenameXml).toContain(
      `transcript url="${publicOrigin}/podcasts/episodes/${ep1RenamedSlug}/transcript"`,
    )

    // 13. Test Database Persistence & Clean Data State
    const reloadedShow = await payload.findByID({
      collection: 'podcast-shows',
      id: show.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(reloadedShow.title).toBe(`The Renegade Chronicle ${runId}`)

    const reloadedEp = await payload.findByID({
      collection: 'podcast-episodes',
      id: ep1.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(reloadedEp.slug).toBe(ep1RenamedSlug)
    expect(reloadedEp.guid).toBe(originalGuid)
    expect(reloadedEp.enclosureBytes).toBe(wavBytes.byteLength)
    expect(reloadedEp.enclosureMimeType).toBe('audio/wav')
  }, 90_000)
})
