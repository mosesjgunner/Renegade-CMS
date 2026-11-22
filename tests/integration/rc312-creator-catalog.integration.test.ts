import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import config from '../../src/payload.config'
import type { CatalogManifest } from '../../src/modules/creator-catalog/contracts'
import {
  applyCatalogImport,
  catalogSearchProjection,
  exportCatalogManifest,
  listPublicCatalog,
  stageCatalogImport,
} from '../../src/modules/creator-catalog/service'
import { buildRc2World, teardownRc2World, type Rc2World } from '../fixtures/rc2-world'

/**
 * RC3-12 proof (non-podcast slice): a creator's catalog is staged from
 * a versioned manifest with per-item verdicts before anything is
 * written; apply persists only ready items under durable keys so a
 * partial import resumes without duplicates; listing policy and
 * access policy stay separate, and the search projection filters
 * private works before entries, facets or snippets exist; the same
 * graph exports and restores on a second site. Podcast episode/feed
 * legs are deferred to RC3-10/11 by the owner's option A decision.
 */

let payload: Payload
let world: Rc2World

type PoolQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>
const pool = () => (payload as unknown as { db: { pool: { query: PoolQuery } } }).db.pool
const sql = async (text: string, values: unknown[] = []) => (await pool().query(text, values)).rows
const code = (error: unknown) => (error as { code?: string }).code
const siteA = () => world.siteA.siteId
const siteB = () => world.siteB.siteId
const owner = () => world.siteA.owner.memberId
const member = () => world.siteA.member.memberId
const ownerB = () => world.siteB.owner.memberId

const manifest: CatalogManifest = {
  formatVersion: 1,
  source: 'career-archive-2026',
  series: [
    {
      sourceId: 'career',
      title: 'Career Works',
      items: [
        {
          sourceId: 'a1',
          kind: 'article',
          title: 'First Post',
          legacyUrl: 'https://old.example.com/first-post',
          workRef: { collection: 'content', id: 'legacy-1' },
        },
        {
          sourceId: 'a2',
          kind: 'video',
          title: 'Launch Talk',
          season: 1,
          position: 1,
          transcript: 'hello world transcript from the launch talk',
          variants: [{ quality: '1080p' }, { quality: '720p' }],
        },
        { sourceId: 'a3', kind: 'audio', title: 'Members Only Session', accessPolicy: 'member' },
        {
          sourceId: 'a4',
          kind: 'article',
          title: 'Unlisted Draft Note',
          listingPolicy: 'unlisted',
        },
        { sourceId: 'a5', kind: 'article', title: 'First Post' },
        { sourceId: 'a6', kind: 'article', title: 'Rights Unclear Essay', rightsStatus: 'unknown' },
        { sourceId: 'a7', kind: 'article' } as never,
        { sourceId: 'a8', kind: 'roster-entry', title: 'Imported Members', roster: true },
        { sourceId: 'a9', kind: 'article', title: 'Consent Gap Post', consentStatus: 'missing' },
      ],
    },
    {
      sourceId: 'vault',
      title: 'The Vault',
      accessPolicy: 'member',
      items: [{ sourceId: 'v1', kind: 'article', title: 'Vault Essay' }],
    },
  ],
}

const notificationCount = async (siteId: string) =>
  Number(
    (
      await sql(
        `SELECT (SELECT count(*) FROM notifications) +
                (SELECT count(*) FROM inbox_notifications WHERE site_id=$1) AS n`,
        [siteId],
      )
    )[0]!.n,
  )

beforeAll(async () => {
  payload = await getPayload({ config })
  world = await buildRc2World(payload)
}, 240000)

afterAll(async () => {
  await teardownRc2World(payload, world)
})

describe('RC3-12 creator catalog: staging verdicts', () => {
  it('stages with ready/review/blocked verdicts and writes nothing yet', async () => {
    const before = await notificationCount(siteA())
    const staged = await stageCatalogImport(payload, {
      siteId: siteA(),
      actorMemberId: owner(),
      manifest,
    })
    expect(staged.replayed).toBe(false)
    expect(staged.classification.counts).toEqual({ ready: 5, review: 2, blocked: 3 })
    const byId = new Map(staged.classification.items.map((v) => [v.itemSourceId, v]))
    expect(byId.get('a7')!.state).toBe('blocked')
    expect(byId.get('a7')!.reasons.join(' ')).toMatch(/malformed/)
    expect(byId.get('a8')!.reasons.join(' ')).toMatch(/grant workflow/)
    expect(byId.get('a9')!.reasons.join(' ')).toMatch(/consent not recorded/)
    expect(byId.get('a5')!.state).toBe('review')
    expect(byId.get('a6')!.state).toBe('review')
    // Stage-first: the catalog tables are still empty and no notification moved.
    expect(
      (await sql('SELECT count(*) AS n FROM creator_catalog_items WHERE site_id=$1', [siteA()]))[0]!
        .n,
    ).toBe('0')
    expect(await notificationCount(siteA())).toBe(before)
    // Re-staging the identical manifest replays the same run.
    const replay = await stageCatalogImport(payload, {
      siteId: siteA(),
      actorMemberId: owner(),
      manifest,
    })
    expect(replay.replayed).toBe(true)
    expect(replay.runId).toBe(staged.runId)
  })

  it('refuses staging by a non-staff member and on a site without standing', async () => {
    await expect(
      stageCatalogImport(payload, { siteId: siteA(), actorMemberId: member(), manifest }),
    ).rejects.toMatchObject({ code: 'CATALOG_STAFF_REQUIRED' })
    await expect(
      stageCatalogImport(payload, { siteId: siteB(), actorMemberId: owner(), manifest }),
    ).rejects.toMatchObject({ code: 'CATALOG_NO_STANDING' })
  })
})

describe('RC3-12 creator catalog: apply, resume, policies', () => {
  it('applies only ready items, partially first, then resumes without duplicates', async () => {
    const staged = await stageCatalogImport(payload, {
      siteId: siteA(),
      actorMemberId: owner(),
      manifest,
    })
    const partial = await applyCatalogImport(payload, {
      siteId: siteA(),
      actorMemberId: owner(),
      runId: staged.runId,
      maxItems: 2,
    })
    expect(partial.created).toBe(2)
    expect(partial.state).toBe('partially-applied')
    expect(partial.remaining).toBe(3)

    const resumed = await applyCatalogImport(payload, {
      siteId: siteA(),
      actorMemberId: owner(),
      runId: staged.runId,
    })
    expect(resumed.created).toBe(3)
    expect(resumed.state).toBe('applied')
    expect(resumed.remaining).toBe(0)

    const again = await applyCatalogImport(payload, {
      siteId: siteA(),
      actorMemberId: owner(),
      runId: staged.runId,
    })
    expect(again.created).toBe(0)
    expect(again.skipped).toBe(5)

    const rows = await sql(
      'SELECT durable_key, provenance, checksum FROM creator_catalog_items WHERE site_id=$1 ORDER BY durable_key',
      [siteA()],
    )
    expect(rows.map((row) => row.durable_key)).toEqual([
      'career/a1',
      'career/a2',
      'career/a3',
      'career/a4',
      'vault/v1',
    ])
    const a1 = rows[0]!
    expect((a1.provenance as { legacyUrl?: string }).legacyUrl).toBe(
      'https://old.example.com/first-post',
    )
    expect(String(a1.checksum)).toHaveLength(64)
  })

  it('keeps member and unlisted works out of the anonymous listing and search projection', async () => {
    const anonymous = await listPublicCatalog(payload, { siteId: siteA(), viewer: {} })
    const anonymousTitles = anonymous.flatMap((s) =>
      s.items.map((i) => (i as { title: string }).title),
    )
    // Series order: seasoned items first (season NULLS LAST), then position.
    expect(anonymousTitles).toEqual(['Launch Talk', 'First Post'])

    const entitled = await listPublicCatalog(payload, {
      siteId: siteA(),
      viewer: { entitled: true },
    })
    const entitledTitles = entitled.flatMap((s) =>
      s.items.map((i) => (i as { title: string }).title),
    )
    expect(entitledTitles).toContain('Members Only Session')
    expect(entitledTitles).toContain('Vault Essay')
    expect(entitledTitles).not.toContain('Unlisted Draft Note')

    const search = await catalogSearchProjection(payload, { siteId: siteA(), viewer: {} })
    expect(search.entries.map((entry) => entry.title)).toEqual(['First Post', 'Launch Talk'])
    expect(search.facets).toEqual({ article: 1, video: 1 })
    const talk = search.entries.find((entry) => entry.title === 'Launch Talk')!
    expect(talk.snippet).toContain('hello world transcript')
    // A query naming a member-only work finds nothing anonymously.
    const leaked = await catalogSearchProjection(payload, {
      siteId: siteA(),
      viewer: {},
      query: 'Members Only',
    })
    expect(leaked.entries).toEqual([])
  })
})

describe('RC3-12 creator catalog: export and restore', () => {
  it('exports the graph and restores it on a second site under the same durable keys', async () => {
    const exported = await exportCatalogManifest(payload, {
      siteId: siteA(),
      actorMemberId: owner(),
    })
    expect(exported.series).toHaveLength(2)
    const staged = await stageCatalogImport(payload, {
      siteId: siteB(),
      actorMemberId: ownerB(),
      manifest: exported,
    })
    expect(staged.classification.counts).toEqual({ ready: 5, review: 0, blocked: 0 })
    const applied = await applyCatalogImport(payload, {
      siteId: siteB(),
      actorMemberId: ownerB(),
      runId: staged.runId,
    })
    expect(applied.created).toBe(5)
    const keysA = (
      await sql(
        'SELECT durable_key FROM creator_catalog_items WHERE site_id=$1 ORDER BY durable_key',
        [siteA()],
      )
    ).map((row) => row.durable_key)
    const keysB = (
      await sql(
        'SELECT durable_key FROM creator_catalog_items WHERE site_id=$1 ORDER BY durable_key',
        [siteB()],
      )
    ).map((row) => row.durable_key)
    expect(keysB).toEqual(keysA)
    // Site isolation: site B's anonymous listing shows only its own works.
    const listingB = await listPublicCatalog(payload, { siteId: siteB(), viewer: {} })
    expect(listingB.flatMap((s) => s.items)).toHaveLength(2)
  })
})
