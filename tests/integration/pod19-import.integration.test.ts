/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-19 bundle IMPORT into a FRESH database (POD-REQ-41/42 round trip).
 *
 * This suite runs against a SCRATCH database (pod19_scratch — see
 * scripts/pod19-restore-proof.sh, which creates it and generates the
 * env file this run uses). It must NEVER run against the shared
 * acceptance DB: the suite skips itself unless the database name
 * contains "pod19" (so the canonical shared integration run stays
 * green), and inside the harness beforeAll still fails loudly if the
 * scratch schema is missing. The scratch DB starts empty; migrations are applied by
 * src/scripts/pod19-migrate-scratch.ts (tsx, run by the proof script —
 * Payload's migrate() fails under vitest ESM interop here), then the
 * suite creates one site, imports the bundle produced by
 * pod19-portability.integration.test.ts, and asserts the show is
 * restored with its channel GUID, episode GUIDs, enclosure checksums,
 * chapters and transcripts intact — and that its feed validates.
 * A tampered bundle is refused before anything is written.
 */
import { createHash } from 'node:crypto'
import { cp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import { validatePodcastFeed } from '../../src/modules/media/publishing'
import { mediaStorage } from '../../src/modules/media/storage'
import { renderPodcastFeed } from '../../src/modules/podcast-studio/feed-build'
import { importShowBundle } from '../../src/modules/podcast-studio/portability'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const BUNDLE_DIR = path.resolve(process.env.POD19_BUNDLE_DIR ?? 'scratch/pod19/bundle')
const FIXTURE_PATH = path.resolve(process.env.POD19_FIXTURE ?? 'scratch/pod19/fixture.json')

let payload: Payload
let fixture: any
let site: any
let imported: Awaited<ReturnType<typeof importShowBundle>>

const isPod19Db = (process.env.DATABASE_URL ?? '').includes('pod19')

beforeAll(async () => {
  if (!isPod19Db) return

  fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'))
  payload = await getPayload({ config })
  // Migrations are applied by src/scripts/pod19-migrate-scratch.ts
  // (tsx) before this suite runs — Payload's migrate() dynamicImport
  // fails under vitest's ESM interop in this repo. Fail loudly if the
  // schema is not there.
  const probe = await (payload.db as any).pool.query(
    "select to_regclass('public.podcast_shows') as present",
  )
  if (!probe.rows[0]?.present) {
    throw new Error(
      'pod19_scratch is not migrated — run scripts/pod19-restore-proof.sh (it applies migrations via tsx first).',
    )
  }
  site = await payload.create({
    collection: 'sites',
    data: { name: 'POD-19 Import Target', slug: `pod19-import-${fixture.runId}` },
    overrideAccess: true,
  } as never)
  imported = await importShowBundle(payload as never, BUNDLE_DIR, {
    siteId: String(site.id),
    config: loadConfig(),
  })
}, 300_000)

describe.skipIf(!isPod19Db)('POD-19 bundle import into a fresh database', () => {
  it('restores the show with channel + episode GUIDs intact', async () => {
    expect(imported.episodes).toBe(2)
    expect(imported.sessions).toBe(1)
    expect(imported.editProjects).toBe(1)
    expect(imported.mediaManifestOnly).toEqual([])
    const show = await payload.findByID({
      collection: 'podcast-shows',
      id: imported.showId,
      depth: 0,
      overrideAccess: true,
    } as never)
    expect(String((show as any).slug)).toBe(fixture.showSlug)
    expect(String((show as any).podcastGuidValue)).toBe(fixture.podcastGuidValue)

    const episodes = await payload.find({
      collection: 'podcast-episodes',
      where: { show: { equals: imported.showId } },
      limit: 10,
      depth: 2,
      overrideAccess: true,
    } as never)
    const byGuid = new Map(episodes.docs.map((doc: any) => [String(doc.guid), doc]))
    expect(byGuid.has(fixture.publicEpisodeGuid)).toBe(true)
    expect(byGuid.has(fixture.membersEpisodeGuid)).toBe(true)

    const pub: any = byGuid.get(fixture.publicEpisodeGuid)
    expect(pub.chapters).toEqual(fixture.chapters)
    expect(String(pub.mediaChecksum)).toBe(fixture.enclosureSha256)
    // Enclosure bytes byte-match the recorded checksum.
    const storage = mediaStorage(loadConfig())
    const key = String(pub.audio.storageLocation)
    const bytes = await storage.get(key)
    expect(bytes).toBeTruthy()
    expect(sha256(bytes!)).toBe(fixture.enclosureSha256)
    // Transcript restored as a revision with the same segments.
    expect(pub.transcript?.segments).toEqual(fixture.segments)
  })

  it('renders a validating feed from the restored show', async () => {
    const show = await payload.findByID({
      collection: 'podcast-shows',
      id: imported.showId,
      depth: 2,
      overrideAccess: true,
    } as never)
    const episodes = await payload.find({
      collection: 'podcast-episodes',
      where: {
        and: [{ show: { equals: imported.showId } }, { status: { in: ['published', 'updated'] } }],
      },
      limit: 1000,
      depth: 2,
      overrideAccess: true,
    } as never)
    const feed = renderPodcastFeed(show, episodes.docs as any[], {
      origin: loadConfig().appUrl,
      feedPath: `/podcasts/${(show as any).slug}/feed.xml`,
      showPath: `/podcasts/${(show as any).slug}`,
      includeMembersOnly: false,
    })
    expect(() => validatePodcastFeed(feed)).not.toThrow()
    expect(feed).toContain(fixture.publicEpisodeGuid)
    expect(feed).not.toContain(fixture.membersEpisodeGuid)
  })

  it('refuses a tampered bundle before writing anything', async () => {
    const tampered = path.join(os.tmpdir(), `pod19-tampered-${fixture.runId}`)
    await cp(BUNDLE_DIR, tampered, { recursive: true })
    const episodeFile = path.join(tampered, 'episodes', `${fixture.publicEpisodeSlug}.json`)
    const doc = JSON.parse(await readFile(episodeFile, 'utf8'))
    doc.title = 'Tampered title'
    await writeFile(episodeFile, JSON.stringify(doc, null, 2))
    const showsBefore = await payload.count({
      collection: 'podcast-shows',
      overrideAccess: true,
    } as never)
    await expect(
      importShowBundle(payload as never, tampered, {
        siteId: String(site.id),
        config: loadConfig(),
      }),
    ).rejects.toMatchObject({ code: 'bundle-checksum-mismatch' })
    const showsAfter = await payload.count({
      collection: 'podcast-shows',
      overrideAccess: true,
    } as never)
    expect(showsAfter.totalDocs).toBe(showsBefore.totalDocs)
  })
})
