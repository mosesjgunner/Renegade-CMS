/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-19 RESTORE PROOF verification (closes POD-04's PARTIAL L1
 * recovery leg). This suite runs against the RESTORED scratch
 * database (pod19_restore) + restored media directory produced by
 * scripts/pod19-restore-proof.sh from a pg_dump + media tar of the
 * acceptance install. It skips itself against any database whose
 * name does not contain "pod19" (so the canonical shared integration
 * run stays green); the harness in scripts/pod19-restore-proof.sh
 * runs it for real against the restored scratch database.
 *
 * Assertions: the POD-19 fixture show survived a full platform backup
 * restore — its feed renders and validates with the POD-01 validator,
 * and an episode enclosure byte-matches its recorded checksum.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { validatePodcastFeed } from '../../src/modules/media/publishing'
import { mediaStorage } from '../../src/modules/media/storage'
import { mediaStorageKey } from '../../src/modules/media/workflow'
import { renderPodcastFeed } from '../../src/modules/podcast-studio/feed-build'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const FIXTURE_PATH = path.resolve(process.env.POD19_FIXTURE ?? 'scratch/pod19/fixture.json')

let payload: Payload
let fixture: any
let show: any
let episodes: any[]

const isPod19Db = (process.env.DATABASE_URL ?? '').includes('pod19')

beforeAll(async () => {
  if (!isPod19Db) return
  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  payload = await getPayload({ config })
  const shows = await payload.find({
    collection: 'podcast-shows',
    where: { slug: { equals: fixture.showSlug } },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  } as never)
  show = shows.docs[0]
  const result = await payload.find({
    collection: 'podcast-episodes',
    where: { show: { equals: show.id } },
    limit: 100,
    depth: 2,
    overrideAccess: true,
  } as never)
  episodes = result.docs
}, 180_000)

describe.skipIf(!isPod19Db)('POD-19 restore proof (pg_dump + media restore)', () => {
  it('finds the fixture show in the restored database', () => {
    expect(show).toBeTruthy()
    expect(String(show.podcastGuidValue)).toBe(fixture.podcastGuidValue)
    expect(episodes).toHaveLength(2)
  })

  it('renders a feed that validates with the POD-01 validator', () => {
    const published = episodes.filter((episode: any) =>
      ['published', 'updated'].includes(String(episode.status)),
    )
    const feed = renderPodcastFeed(show, published, {
      origin: loadConfig().appUrl,
      feedPath: `/podcasts/${show.slug}/feed.xml`,
      showPath: `/podcasts/${show.slug}`,
      includeMembersOnly: false,
    })
    expect(() => validatePodcastFeed(feed)).not.toThrow()
    expect(feed).toContain(fixture.publicEpisodeGuid)
    expect(feed).not.toContain(fixture.membersEpisodeGuid)
  })

  it('serves an episode enclosure that byte-matches its recorded checksum', async () => {
    const episode = episodes.find((entry: any) => String(entry.guid) === fixture.publicEpisodeGuid)
    expect(episode).toBeTruthy()
    expect(String(episode.mediaChecksum)).toBe(fixture.enclosureSha256)
    const storage = mediaStorage(loadConfig())
    const key = await mediaStorageKey(payload as never, episode.audio)
    expect(key).toBeTruthy()
    const bytes = await storage.get(String(key))
    expect(bytes).toBeTruthy()
    expect(sha256(bytes!)).toBe(fixture.enclosureSha256)
    // Chapters + transcript survived the platform restore too.
    expect(episode.chapters).toEqual(fixture.chapters)
    expect(episode.transcript?.segments).toEqual(fixture.segments)
  })
})
