/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import {
  bookNavigation,
  externalIdentityKey,
  transcriptChecksum,
} from '../../src/modules/media/contracts'
import { seed } from '../../src/scripts/seed'

let payload: Payload
const findOne = async (collection: string, where: Record<string, unknown>) => {
  const result = (await payload.find({
    collection,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)) as { docs: any[] }
  expect(result.docs[0]).toBeTruthy()
  return result.docs[0]
}
const upsert = async (collection: string, key: string, data: Record<string, unknown>) => {
  const existing = (await payload.find({
    collection,
    where: { providerIdentity: { equals: key } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)) as { docs: any[] }
  return existing.docs[0]
    ? payload.update({ collection, id: existing.docs[0].id, data, overrideAccess: true } as never)
    : payload.create({
        collection,
        data: { ...data, providerIdentity: key },
        overrideAccess: true,
      } as never)
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
})
afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('M10 media publication acceptance', () => {
  it('fixture-syncs an episode and a video twice, publishes ordered book chapters, and preserves derived media boundaries', async () => {
    const site = await findOne('sites', { slug: { equals: 'demo-publication' } })
    const publication = await findOne('publications', { slug: { equals: 'main' } })
    const suffix = randomUUID().slice(0, 8)
    const scope = { site: site.id, publication: publication.id }
    const asset = (await payload.create({
      collection: 'media-assets',
      data: {
        ...scope,
        title: 'Acceptance audio',
        kind: 'audio',
        storageLocation: `local://fixtures/${suffix}.mp3`,
        storageProvider: 'fixture',
        mimeType: 'audio/mpeg',
        originalExportAllowed: false,
        retentionMode: 'permanent',
        retentionHold: 'none',
        removeFromDiscovery: false,
      },
      overrideAccess: true,
    } as never)) as any
    const show = (await payload.create({
      collection: 'podcast-shows',
      data: {
        ...scope,
        title: 'Acceptance show',
        slug: `show-${suffix}`,
        canonicalPath: `/podcasts/show-${suffix}`,
        rssEnabled: true,
      },
      overrideAccess: true,
    } as never)) as any
    const episodeKey = externalIdentityKey({
      provider: 'fixture-rss',
      scopeId: 'show',
      externalId: 'episode-1',
    })
    await upsert('podcast-episodes', episodeKey, {
      ...scope,
      title: 'Fixture episode',
      slug: `episode-${suffix}`,
      canonicalPath: `/podcasts/episode-${suffix}`,
      show: show.id,
      audio: asset.id,
      externalUrl: 'https://example.test/episode',
    })
    await upsert('podcast-episodes', episodeKey, {
      ...scope,
      title: 'Fixture episode updated',
      slug: `episode-${suffix}`,
      canonicalPath: `/podcasts/episode-${suffix}`,
      show: show.id,
      audio: asset.id,
      externalUrl: 'https://example.test/episode',
    })
    const episodes = await payload.find({
      collection: 'podcast-episodes',
      where: { providerIdentity: { equals: episodeKey } },
      limit: 10,
      overrideAccess: true,
    } as never)
    expect(episodes.totalDocs).toBe(1)

    const channel = (await payload.create({
      collection: 'video-channels',
      data: {
        ...scope,
        title: 'Fixture channel',
        slug: `channel-${suffix}`,
        canonicalPath: `/videos/channel-${suffix}`,
        provider: 'youtube',
        externalId: 'channel-1',
      },
      overrideAccess: true,
    } as never)) as any
    const videoKey = externalIdentityKey({
      provider: 'youtube',
      scopeId: 'channel-1',
      externalId: 'video-1',
    })
    const videoData = {
      ...scope,
      title: 'Fixture video',
      slug: `video-${suffix}`,
      canonicalPath: `/videos/video-${suffix}`,
      channel: channel.id,
      provider: 'youtube',
      externalId: 'video-1',
      embedUrl: 'https://www.youtube-nocookie.com/embed/video-1',
    }
    await upsert('videos', videoKey, videoData)
    await upsert('videos', videoKey, videoData)
    const videos = await payload.find({
      collection: 'videos',
      where: { providerIdentity: { equals: videoKey } },
      limit: 10,
      overrideAccess: true,
    } as never)
    expect(videos.totalDocs).toBe(1)

    const bookContent = (await payload.create({
      collection: 'content',
      data: {
        ...scope,
        contentType: 'book',
        title: 'Acceptance book',
        slug: `book-${suffix}`,
        canonicalPath: `/books/book-${suffix}`,
        status: 'published',
      },
      overrideAccess: true,
    } as never)) as any
    const book = (await payload.create({
      collection: 'books',
      data: {
        ...scope,
        title: 'Acceptance book',
        slug: `book-${suffix}`,
        canonicalPath: `/books/book-${suffix}`,
        content: bookContent.id,
        isbn: '9780000000000',
      },
      overrideAccess: true,
    } as never)) as any
    const first = (await payload.create({
      collection: 'book-chapters',
      data: { book: book.id, title: 'First', displayOrder: 1, preview: true },
      overrideAccess: true,
    } as never)) as any
    const second = (await payload.create({
      collection: 'book-chapters',
      data: { book: book.id, title: 'Second', displayOrder: 2 },
      overrideAccess: true,
    } as never)) as any
    expect(
      bookNavigation(
        [
          { id: String(first.id), displayOrder: 1 },
          { id: String(second.id), displayOrder: 2 },
        ],
        String(first.id),
      ).next?.id,
    ).toBe(String(second.id))

    const segments = [{ id: 's1', startSeconds: 0, endSeconds: 2, text: 'Correctable transcript.' }]
    const transcript = (await payload.create({
      collection: 'transcript-revisions',
      data: {
        title: 'Provider transcript',
        media: asset.id,
        version: 1,
        source: 'provider',
        segments,
        checksum: transcriptChecksum(segments),
        immutable: true,
      },
      overrideAccess: true,
    } as never)) as any
    const manual = (await payload.create({
      collection: 'transcript-revisions',
      data: {
        title: 'Manual correction',
        media: asset.id,
        version: 2,
        source: 'manual',
        sourceRevision: transcript.id,
        segments: [{ ...segments[0], text: 'Manually corrected transcript.' }],
        checksum: transcriptChecksum([{ ...segments[0], text: 'Manually corrected transcript.' }]),
        immutable: true,
      },
      overrideAccess: true,
    } as never)) as any
    expect(String((manual.sourceRevision as { id?: string })?.id ?? manual.sourceRevision)).toBe(
      String(transcript.id),
    )
    const tts = await payload.create({
      collection: 'tts-outputs',
      data: {
        title: 'Revision bound TTS',
        content: bookContent.id,
        mode: 'tts',
        voiceSettings: { provider: 'fixture', pronunciation: {} },
        licensedOutputMetadata: { license: 'fixture-test' },
        status: 'ready',
        audio: asset.id,
      },
      overrideAccess: true,
    } as never)
    const publisherRead = (await payload.create({
      collection: 'tts-outputs',
      data: {
        title: 'Unfinished publisher read',
        content: bookContent.id,
        mode: 'publisher-read',
        status: 'processing',
      },
      overrideAccess: true,
    } as never)) as any
    expect((tts as any).audio).toBeTruthy()
    expect(publisherRead.audio).toBeNull()
    const graphic = (await payload.create({
      collection: 'graphic-documents',
      data: {
        title: 'Layered acceptance graphic',
        sourceMedia: asset.id,
        sourceRevision: 'sha256:immutable-source',
        layers: [
          {
            id: 'base',
            opacity: 1,
            recipe: {
              version: 1,
              edits: [
                { type: 'crop', x: 0, y: 0, width: 1, height: 1 },
                { type: 'text', value: 'Headline', x: 2, y: 2, font: 'system', color: '#000' },
              ],
            },
          },
        ],
        history: [],
      },
      overrideAccess: true,
    } as never)) as any
    const derivative = await payload.create({
      collection: 'media-derivatives',
      data: {
        title: 'OG output',
        document: graphic.id,
        sourceMedia: asset.id,
        preset: 'og',
        recipe: { version: 1, edits: [] },
        status: 'approved',
        usageReferences: [{ target: 'article', targetId: bookContent.id, approved: true }],
      },
      overrideAccess: true,
    } as never)
    expect((derivative as any).sourceMedia).toBeTruthy()
  }, 30_000)
})
