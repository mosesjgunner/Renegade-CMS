/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { loadConfig } from '../../src/modules/core/config'
import { mediaStorage } from '../../src/modules/media/storage'
import {
  buildMovedFeedRedirect,
  migrateEpisodeEnclosure,
  reconcileClaimedImportShows,
} from '../../src/modules/podcast-studio/import-media'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const mp3Bytes = (seedByte: number, length = 512) => {
  const bytes = new Uint8Array(length).fill(seedByte)
  bytes.set([0x49, 0x44, 0x33], 0) // 'ID3'
  return bytes
}

/** Minimal in-memory Payload-shaped store covering the collections POD-02 touches. */
function createFakeStore() {
  const collections: Record<string, any[]> = {
    'podcast-shows': [],
    'podcast-episodes': [],
    'media-blobs': [],
    'media-assets': [],
    'payload-jobs': [],
  }
  let sequence = 0
  const matches = (doc: any, where: any): boolean => {
    if (!where) return true
    if (where.and) return where.and.every((clause: any) => matches(doc, clause))
    return Object.entries(where).every(([field, condition]: [string, any]) => {
      const expected = condition?.equals
      const actual = field.includes('.')
        ? field.split('.').reduce((value: any, key) => value?.[key], doc)
        : doc[field]
      return String(actual ?? '') === String(expected ?? '')
    })
  }
  const store: any = {
    collections,
    async find(args: any) {
      return {
        docs: collections[args.collection].filter((doc) => matches(doc, args.where)),
      }
    },
    async findByID(args: any) {
      const doc = collections[args.collection].find((value) => value.id === args.id)
      if (!doc) throw new Error('Not found')
      return doc
    },
    async create(args: any) {
      const doc = { id: `${args.collection}-${++sequence}`, ...args.data }
      collections[args.collection].push(doc)
      return doc
    },
    async update(args: any) {
      const doc = collections[args.collection].find((value) => value.id === args.id)
      Object.assign(doc, args.data)
      return doc
    },
    jobs: {
      queue: async (args: any) => {
        const job = { id: `job-${++sequence}`, taskSlug: args.task, input: args.input }
        collections['payload-jobs'].push(job)
        return job
      },
    },
  }
  return store
}

let mediaDir: string
beforeAll(async () => {
  mediaDir = await mkdtemp(path.join(os.tmpdir(), 'pod02-unit-media-'))
})
afterAll(async () => {
  await rm(mediaDir, { recursive: true, force: true }).catch(() => undefined)
})

const testConfig = () =>
  loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://renegade:renegade_dev_only@localhost:5432/renegade',
    PAYLOAD_SECRET: 'pod02-unit-secret-with-plenty-of-length-0123456789',
    APP_URL: 'http://localhost:3000',
    MEDIA_DIR: mediaDir,
  } as any)

describe('POD-02 migrateEpisodeEnclosure (core, fake store)', () => {
  it('fetches, verifies, stores and re-points an episode; a second run is a no-op', async () => {
    const store = createFakeStore()
    const bytes = mp3Bytes(7)
    const episode = await store.create({
      collection: 'podcast-episodes',
      data: {
        site: 'site-a',
        title: 'Episode One',
        externalUrl: 'https://cdn.test/one.mp3',
        enclosureBytes: bytes.byteLength,
        enclosureMimeType: 'audio/mpeg',
        mediaMigrationState: 'pending',
      },
    })
    const fetcher = async () =>
      new Response(Buffer.from(bytes), { headers: { 'content-type': 'audio/mpeg' } })
    const resolve = async () => [{ address: '93.184.216.34' }]
    const options = { config: testConfig(), fetcher: fetcher as any, resolve: resolve as any }

    const result = await migrateEpisodeEnclosure(store, episode.id, options)
    expect(result).toMatchObject({ completed: true, state: 'done', checksum: sha256(bytes) })

    const stored = store.collections['podcast-episodes'][0]
    expect(stored.mediaMigrationState).toBe('done')
    expect(stored.mediaChecksum).toBe(sha256(bytes))
    expect(stored.audio).toBe(result.mediaAssetId)
    const asset = store.collections['media-assets'][0]
    expect(asset.checksum).toBe(`sha256:${sha256(bytes)}`)
    expect(asset.sizeBytes).toBe(bytes.byteLength)
    const blob = store.collections['media-blobs'][0]
    const onDisk = await mediaStorage(testConfig()).get(String(blob.storageKey))
    expect(onDisk && Buffer.from(onDisk).equals(Buffer.from(bytes))).toBe(true)

    const again = await migrateEpisodeEnclosure(store, episode.id, options)
    expect(again).toMatchObject({ completed: true, alreadyMigrated: true })
    expect(store.collections['media-assets']).toHaveLength(1)
    expect(store.collections['media-blobs']).toHaveLength(1)
  })

  it('fails only the corrupt episode, visibly, and does not re-point it', async () => {
    const store = createFakeStore()
    const good = mp3Bytes(3, 256)
    const corrupt = mp3Bytes(9, 128) // feed will declare a larger length
    const goodEpisode = await store.create({
      collection: 'podcast-episodes',
      data: {
        site: 'site-a',
        title: 'Good',
        externalUrl: 'https://cdn.test/good.mp3',
        enclosureBytes: good.byteLength,
        enclosureMimeType: 'audio/mpeg',
        mediaMigrationState: 'pending',
      },
    })
    const corruptEpisode = await store.create({
      collection: 'podcast-episodes',
      data: {
        site: 'site-a',
        title: 'Corrupt',
        externalUrl: 'https://cdn.test/corrupt.mp3',
        enclosureBytes: corrupt.byteLength + 100,
        enclosureMimeType: 'audio/mpeg',
        mediaMigrationState: 'pending',
      },
    })
    const fetcher = async (url: string) =>
      new Response(Buffer.from(String(url).includes('corrupt') ? corrupt : good), {
        headers: { 'content-type': 'audio/mpeg' },
      })
    const resolve = async () => [{ address: '93.184.216.34' }]
    const options = { config: testConfig(), fetcher: fetcher as any, resolve: resolve as any }

    const corruptResult = await migrateEpisodeEnclosure(store, corruptEpisode.id, options)
    expect(corruptResult).toMatchObject({ completed: false, state: 'failed' })
    expect(corruptResult.error).toContain('length mismatch')
    const storedCorrupt = store.collections['podcast-episodes'].find(
      (doc: any) => doc.id === corruptEpisode.id,
    )
    expect(storedCorrupt.mediaMigrationState).toBe('failed')
    expect(storedCorrupt.mediaMigrationError).toContain('length mismatch')
    expect(storedCorrupt.audio).toBeUndefined()

    const goodResult = await migrateEpisodeEnclosure(store, goodEpisode.id, options)
    expect(goodResult.completed).toBe(true)
  })

  it('rethrows transient fetch failures after marking the episode failed, so queue retries engage', async () => {
    const store = createFakeStore()
    const episode = await store.create({
      collection: 'podcast-episodes',
      data: {
        site: 'site-a',
        title: 'Flaky',
        externalUrl: 'https://cdn.test/flaky.mp3',
        enclosureBytes: 10,
        enclosureMimeType: 'audio/mpeg',
        mediaMigrationState: 'pending',
      },
    })
    const fetcher = async () => {
      throw new Error('socket hangup')
    }
    await expect(
      migrateEpisodeEnclosure(store, episode.id, {
        config: testConfig(),
        fetcher: fetcher as any,
        resolve: (async () => [{ address: '93.184.216.34' }]) as any,
      }),
    ).rejects.toThrow('socket hangup')
    expect(store.collections['podcast-episodes'][0].mediaMigrationState).toBe('failed')
    expect(store.collections['podcast-episodes'][0].mediaMigrationError).toContain('socket hangup')
  })
})

describe('POD-02 reconcileClaimedImportShows (fake store)', () => {
  it('syncs claimed shows, migrates inline, and skips claimed shows without a feed URL', async () => {
    const store = createFakeStore()
    const bytes = mp3Bytes(5, 256)
    await store.create({
      collection: 'podcast-shows',
      data: {
        id: 'show-claimed',
        site: 'site-a',
        importOwnership: 'claimed-import',
        externalFeedUrl: 'https://feeds.test/show.xml',
      },
    })
    await store.create({
      collection: 'podcast-shows',
      data: { id: 'show-nofeed', site: 'site-a', importOwnership: 'claimed-import' },
    })
    await store.create({
      collection: 'podcast-shows',
      data: {
        id: 'show-local',
        site: 'site-a',
        importOwnership: 'local',
        externalFeedUrl: 'https://feeds.test/local.xml',
      },
    })
    const feed =
      '<rss><channel><item><title>One</title><guid>one</guid><pubDate>Mon, 31 Aug 2026 12:00:00 GMT</pubDate>' +
      `<enclosure url="https://cdn.test/one.mp3" length="${bytes.byteLength}" type="audio/mpeg"/></item></channel></rss>`
    const fetcher = async (url: string) =>
      String(url).endsWith('.xml')
        ? new Response(feed, { headers: { 'content-type': 'application/rss+xml' } })
        : new Response(Buffer.from(bytes), { headers: { 'content-type': 'audio/mpeg' } })

    const outcome = await reconcileClaimedImportShows(store, 'site-a', {
      inline: true,
      config: testConfig(),
      fetcher: fetcher as any,
      resolve: (async () => [{ address: '93.184.216.34' }]) as any,
    })
    expect(outcome.shows).toBe(2)
    const synced = outcome.results.find((result) => result.showId === 'show-claimed') as any
    expect(synced).toMatchObject({ created: 1, remoteMedia: { migrated: 1, failed: 0 } })
    const skipped = outcome.results.find((result) => result.showId === 'show-nofeed') as any
    expect(skipped.skipped).toBe(true)
    const episode = store.collections['podcast-episodes'][0]
    expect(episode.mediaMigrationState).toBe('done')
    expect(episode.mediaChecksum).toBe(sha256(bytes))
    // The locally owned show was never touched.
    expect(
      store.collections['podcast-episodes'].filter((doc: any) => doc.show === 'show-local'),
    ).toHaveLength(0)
  })
})

describe('POD-02 buildMovedFeedRedirect', () => {
  it('produces an unlocked redirect document and a 301-first checklist', () => {
    const artifact = buildMovedFeedRedirect(
      {
        title: 'Moving Show',
        externalFeedUrl: 'https://old.test/feed.xml',
        lockedOwnerEmail: 'host@example.com',
      },
      'https://new.test/feed.xml',
    )
    expect(artifact.redirectDocument).toContain(
      '<itunes:new-feed-url>https://new.test/feed.xml</itunes:new-feed-url>',
    )
    expect(artifact.redirectDocument).toContain(
      '<podcast:locked owner="host@example.com">no</podcast:locked>',
    )
    expect(artifact.redirectDocument).toContain(
      '<atom:link href="https://old.test/feed.xml" rel="self"',
    )
    expect(artifact.checklist).toContain('HTTP 301')
    expect(artifact.checklist).toContain('Moving Show')
    expect(artifact.checklist).toContain('https://new.test/feed.xml')
  })

  it('rejects a non-URL destination', () => {
    expect(() => buildMovedFeedRedirect({ title: 'X' }, 'not a url')).toThrow('invalid')
  })
})
