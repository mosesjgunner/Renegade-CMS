/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-02 (POD-REQ-06, POD-REQ-07) integration proof against real Payload +
 * Postgres, with a local HTTP fixture server standing in for a remote
 * podcast host (fixture RSS + small audio bytes). Real external feeds
 * stay UNVERIFIED — this proves the machinery, not any live host.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { importPodcastFeed } from '../../src/modules/media/publishing'
import { mediaStorage } from '../../src/modules/media/storage'
import {
  migrateEpisodeEnclosure,
  queuePodcastImportMediaTask,
  reconcileClaimedImportShows,
} from '../../src/modules/podcast-studio/import-media'
import { seed } from '../../src/scripts/seed'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const mp3Bytes = (fill: number, length = 1024) => {
  const bytes = new Uint8Array(length).fill(fill)
  bytes.set([0x49, 0x44, 0x33], 0) // 'ID3'
  return bytes
}

const wavBytes = (fill: number) => {
  const dataSize = 200
  const bytes = new Uint8Array(44 + dataSize).fill(fill)
  const view = new DataView(bytes.buffer)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  view.setUint32(4, 36 + dataSize, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12) // 'fmt '
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  bytes.set([0x64, 0x61, 0x74, 0x61], 36) // 'data'
  view.setUint32(40, dataSize, true)
  return bytes
}

const AUDIO = {
  'a1.mp3': mp3Bytes(11),
  'a2.wav': wavBytes(22),
  'a3.mp3': mp3Bytes(33, 512),
  'b1.mp3': mp3Bytes(44),
  'b2.mp3': mp3Bytes(55),
  'c1.mp3': mp3Bytes(66),
} as const

let payload: Payload
let server: Server
let baseUrl: string
let testMediaDir: string
let site: any
let appConfig: ReturnType<typeof loadConfig>

const feedXml = (
  items: Array<{ guid: string; title: string; file: string; declaredBytes?: number; type: string }>,
) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Fixture</title>` +
  items
    .map(
      (item) =>
        `<item><title>${item.title}</title><guid>${item.guid}</guid><pubDate>Mon, 31 Aug 2026 12:00:00 GMT</pubDate>` +
        `<enclosure url="${baseUrl}/audio/${item.file}" length="${item.declaredBytes ?? AUDIO[item.file as keyof typeof AUDIO].byteLength}" type="${item.type}"/></item>`,
    )
    .join('') +
  `</channel></rss>`

const FEEDS: Record<string, () => string> = {
  'feed-a.xml': () =>
    feedXml([
      { guid: 'a-1', title: 'A One', file: 'a1.mp3', type: 'audio/mpeg' },
      { guid: 'a-2', title: 'A Two', file: 'a2.wav', type: 'audio/wav' },
      // Corrupt: the feed declares 100 bytes more than the server sends.
      {
        guid: 'a-3',
        title: 'A Three Corrupt',
        file: 'a3.mp3',
        declaredBytes: AUDIO['a3.mp3'].byteLength + 100,
        type: 'audio/mpeg',
      },
    ]),
  'feed-b.xml': () =>
    feedXml([
      { guid: 'b-1', title: 'B One', file: 'b1.mp3', type: 'audio/mpeg' },
      { guid: 'b-2', title: 'B Two', file: 'b2.mp3', type: 'audio/mpeg' },
    ]),
  'feed-c.xml': () =>
    feedXml([{ guid: 'c-1', title: 'C One', file: 'c1.mp3', type: 'audio/mpeg' }]),
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  testMediaDir = await mkdtemp(path.join(os.tmpdir(), 'pod02-int-media-'))
  appConfig = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.DATABASE_URL || 'postgresql://renegade:renegade_dev_only@localhost:5432/renegade',
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || 'pod02-integration-secret-with-length-012345',
    APP_URL: 'http://localhost:3000',
    MEDIA_DIR: testMediaDir,
  } as any)

  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const feed = FEEDS[url.pathname.slice(1)]
    if (feed) {
      res.writeHead(200, { 'content-type': 'application/rss+xml' })
      res.end(feed())
      return
    }
    const audio = AUDIO[url.pathname.replace('/audio/', '') as keyof typeof AUDIO]
    if (audio) {
      res.writeHead(200, {
        'content-type': url.pathname.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
      })
      res.end(Buffer.from(audio))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  baseUrl = `http://127.0.0.1:${address.port}`

  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'demo-publication' } },
    limit: 1,
    overrideAccess: true,
  })
  site = siteResult.docs[0]
  expect(site).toBeTruthy()
}, 120_000)

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (testMediaDir) await rm(testMediaDir, { recursive: true, force: true }).catch(() => undefined)
  await payload?.db.destroy?.()
})

const runId = Math.random().toString(36).slice(2, 8)

async function createClaimedShow(suffix: string, feedFile: string) {
  return payload.create({
    collection: 'podcast-shows',
    data: {
      site: site.id,
      title: `POD-02 Fixture ${suffix} ${runId}`,
      slug: `pod02-${suffix}-${runId}`,
      importOwnership: 'claimed-import',
      externalFeedUrl: `${baseUrl}/${feedFile}`,
      status: 'draft',
    } as any,
    overrideAccess: true,
  }) as Promise<any>
}

async function episodesOf(showId: string) {
  const result = await payload.find({
    collection: 'podcast-episodes',
    where: { show: { equals: showId } },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs as any[]
}

const inlineMigration = (fetcher?: typeof fetch) => (episodeId: string) =>
  migrateEpisodeEnclosure(payload as never, episodeId, {
    allowPrivate: true,
    config: appConfig,
    fetcher,
  })

describe('POD-02 podcast import media migration + reconciliation', () => {
  it('imports a feed twice: audio lands locally with matching checksums, the corrupt enclosure fails alone, nothing duplicates', async () => {
    const show = await createClaimedShow('a', 'feed-a.xml')
    const input = {
      siteId: site.id,
      showId: show.id,
      feedUrl: `${baseUrl}/feed-a.xml`,
      allowPrivate: true,
      migrateRemoteMedia: true,
      runMediaMigration: inlineMigration(),
    }
    const first = await importPodcastFeed(payload as never, input)
    expect(first).toMatchObject({
      created: 3,
      updated: 0,
      remoteMedia: { requested: true, migrated: 2, queued: 0, failed: 1 },
    })

    const episodes = await episodesOf(show.id)
    expect(episodes).toHaveLength(3)
    const byGuid = new Map(
      episodes.map((episode) => [String(episode.providerIdentity).split(':').pop(), episode]),
    )
    // providerIdentity is a hash key; match by title instead for readability.
    const byTitle = new Map(episodes.map((episode) => [episode.title, episode]))
    expect(byGuid.size).toBe(3)

    const one = byTitle.get('A One')
    expect(one.mediaMigrationState).toBe('done')
    expect(one.mediaChecksum).toBe(sha256(AUDIO['a1.mp3']))
    expect(one.audio).toBeTruthy()
    const asset = await payload.findByID({
      collection: 'media-assets',
      id: one.audio,
      depth: 0,
      overrideAccess: true,
    })
    expect(asset.checksum).toBe(`sha256:${sha256(AUDIO['a1.mp3'])}`)
    const storedBytes = await mediaStorage(appConfig).get(String(asset.storageLocation))
    expect(storedBytes && Buffer.from(storedBytes).equals(Buffer.from(AUDIO['a1.mp3']))).toBe(true)

    const two = byTitle.get('A Two')
    expect(two.mediaMigrationState).toBe('done')
    expect(two.mediaChecksum).toBe(sha256(AUDIO['a2.wav']))

    const corrupt = byTitle.get('A Three Corrupt')
    expect(corrupt.mediaMigrationState).toBe('failed')
    expect(corrupt.mediaMigrationError).toContain('length mismatch')
    expect(corrupt.audio).toBeFalsy()

    const second = await importPodcastFeed(payload as never, input)
    expect(second).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 3,
      // Done episodes are not re-driven; the corrupt one is retried and fails again.
      remoteMedia: { migrated: 0, failed: 1 },
    })
    expect(await episodesOf(show.id)).toHaveLength(3)
    const assets = await payload.find({
      collection: 'media-assets',
      where: {
        and: [
          { site: { equals: site.id } },
          {
            checksum: {
              in: [`sha256:${sha256(AUDIO['a1.mp3'])}`, `sha256:${sha256(AUDIO['a2.wav'])}`],
            },
          },
        ],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    expect(assets.docs).toHaveLength(2)
    // Import writes never flipped ownership.
    const showAfter = await payload.findByID({
      collection: 'podcast-shows',
      id: show.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(showAfter.importOwnership).toBe('claimed-import')
  })

  it('resumes after a mid-import kill: the failed episode completes on rerun with no duplicates', async () => {
    const show = await createClaimedShow('b', 'feed-b.xml')
    const killingFetcher = (async (url: any, init: any) => {
      if (String(url).includes('b2.mp3')) throw new Error('simulated mid-import kill')
      return fetch(url, init)
    }) as typeof fetch
    const first = await importPodcastFeed(payload as never, {
      siteId: site.id,
      showId: show.id,
      feedUrl: `${baseUrl}/feed-b.xml`,
      allowPrivate: true,
      migrateRemoteMedia: true,
      runMediaMigration: inlineMigration(killingFetcher),
    })
    expect(first).toMatchObject({ created: 2, remoteMedia: { migrated: 1, failed: 1 } })
    let episodes = await episodesOf(show.id)
    const failed = episodes.find((episode) => episode.title === 'B Two')
    expect(failed.mediaMigrationState).toBe('failed')
    expect(failed.mediaMigrationError).toContain('simulated mid-import kill')

    const second = await importPodcastFeed(payload as never, {
      siteId: site.id,
      showId: show.id,
      feedUrl: `${baseUrl}/feed-b.xml`,
      allowPrivate: true,
      migrateRemoteMedia: true,
      runMediaMigration: inlineMigration(),
    })
    expect(second).toMatchObject({ created: 0, remoteMedia: { migrated: 1, failed: 0 } })
    episodes = await episodesOf(show.id)
    expect(episodes).toHaveLength(2)
    for (const episode of episodes) {
      expect(episode.mediaMigrationState).toBe('done')
      expect(episode.audio).toBeTruthy()
    }
    const blobs = await payload.find({
      collection: 'media-blobs',
      where: {
        and: [
          { site: { equals: site.id } },
          {
            checksum: {
              in: [`sha256:${sha256(AUDIO['b1.mp3'])}`, `sha256:${sha256(AUDIO['b2.mp3'])}`],
            },
          },
        ],
      },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    expect(blobs.docs).toHaveLength(2)
  })

  it('drives migration through the Payload queue task, which enforces SSRF on the fixture host; inline recovery completes it', async () => {
    const show = await createClaimedShow('c', 'feed-c.xml')
    let queuedJobId = ''
    const result = await importPodcastFeed(payload as never, {
      siteId: site.id,
      showId: show.id,
      feedUrl: `${baseUrl}/feed-c.xml`,
      allowPrivate: true,
      migrateRemoteMedia: true,
      enqueueMediaMigration: async (episodeId) => {
        const queued = await queuePodcastImportMediaTask(payload as never, episodeId)
        queuedJobId = queued.id
      },
    })
    expect(result).toMatchObject({ created: 1, remoteMedia: { queued: 1, migrated: 0 } })
    expect(queuedJobId).toBeTruthy()
    let [episode] = await episodesOf(show.id)
    expect(episode.mediaMigrationState).toBe('pending')

    const jobs = await payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'podcast-import-media' } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    expect(jobs.docs.some((job: any) => String(job.id) === queuedJobId)).toBe(true)

    // Execute the real task through Payload's job runner. The handler runs
    // with production SSRF policy (no allowPrivate), so it must refuse the
    // 127.0.0.1 fixture enclosure and record that failure on the episode —
    // proving the queued task, not a test double, drove the state machine.
    await payload.jobs.runByID({ id: queuedJobId as never, silent: true })
    ;[episode] = await episodesOf(show.id)
    expect(episode.mediaMigrationState).toBe('failed')
    expect(episode.mediaMigrationError).toContain('private')

    // Recovery path: the same episode completes via the core function.
    const recovered = await migrateEpisodeEnclosure(payload as never, episode.id, {
      allowPrivate: true,
      config: appConfig,
    })
    expect(recovered.completed).toBe(true)
    ;[episode] = await episodesOf(show.id)
    expect(episode.mediaMigrationState).toBe('done')
    expect(episode.mediaChecksum).toBe(sha256(AUDIO['c1.mp3']))
  })

  it('flips ownership on a local edit; reconciliation and import then skip the show', async () => {
    // The acceptance DB persists across runs: retire claimed-import shows
    // left by earlier tests/runs (their fixture servers are gone) so the
    // site-wide reconciliation below only sees this test's show.
    const priorClaimed = await payload.find({
      collection: 'podcast-shows',
      where: {
        and: [{ site: { equals: site.id } }, { importOwnership: { equals: 'claimed-import' } }],
      },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    for (const prior of priorClaimed.docs) {
      await payload.update({
        collection: 'podcast-shows',
        id: prior.id,
        data: { importOwnership: 'local' },
        overrideAccess: true,
      })
    }
    const show = await createClaimedShow('d', 'feed-c.xml')
    await importPodcastFeed(payload as never, {
      siteId: site.id,
      showId: show.id,
      feedUrl: `${baseUrl}/feed-c.xml`,
      allowPrivate: true,
      migrateRemoteMedia: true,
      runMediaMigration: inlineMigration(),
    })
    let showDoc = await payload.findByID({
      collection: 'podcast-shows',
      id: show.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(showDoc.importOwnership).toBe('claimed-import')

    const [episode] = await episodesOf(show.id)
    // A plain user edit: no import context on the request.
    await payload.update({
      collection: 'podcast-episodes',
      id: episode.id,
      data: { title: 'C One — edited by the owner' },
      overrideAccess: true,
    })
    showDoc = await payload.findByID({
      collection: 'podcast-shows',
      id: show.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(showDoc.importOwnership).toBe('local')
    expect((showDoc as any).ownershipChangedAt).toBeTruthy()

    await expect(
      importPodcastFeed(payload as never, {
        siteId: site.id,
        showId: show.id,
        feedUrl: `${baseUrl}/feed-c.xml`,
        allowPrivate: true,
      }),
    ).rejects.toThrow('has not been claimed')

    const reconciliation = await reconcileClaimedImportShows(payload as never, site.id, {
      inline: true,
      allowPrivate: true,
      config: appConfig,
    })
    expect(reconciliation.results.some((result) => String(result.showId) === String(show.id))).toBe(
      false,
    )
  })
})
