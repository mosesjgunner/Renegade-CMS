/**
 * S2-02 regression tests: onboarding and starter upgrades must never lose
 * operator edits or leak across sites.
 *
 * - Onboarding lookups are scoped to the target site (content by
 *   site+canonicalPath, brands by site+name).
 * - A rerun refreshes only pristine starter records; edited or foreign
 *   records are preserved verbatim, as are member/profile identities.
 * - Shared site-settings identity is written only for a single-site
 *   installation; later sites merge only their per-site canonical origin.
 * - Starter upgrades stage pristine templates/patterns as draft revisions,
 *   create missing assets as drafts, and preserve customized records as
 *   conflicts. Nothing is published by an upgrade.
 */
import { describe, expect, it } from 'vitest'

import { provisionOnboardingSite, type OnboardingInput } from '@/modules/operations/onboarding'
import { getStarterStatus, upgradeStarter } from '@/modules/starters/service'
import { starterDefinitions } from '@/modules/starters/definitions'

type Rec = { id: string; collection: string; [key: string]: unknown }

function matchesWhere(rec: Rec, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'and')
      return (cond as Array<Record<string, unknown>>).every((c) => matchesWhere(rec, c))
    if (key === 'or')
      return (cond as Array<Record<string, unknown>>).some((c) => matchesWhere(rec, c))
    const expected = (cond as { equals?: unknown }).equals
    return expected === undefined || rec[key] === expected
  })
}

function makeWorld(seed: Array<Omit<Rec, 'id'> & { id?: string }> = []) {
  const records: Rec[] = seed.map((r, i) => ({ id: `seed-${i}`, ...r }) as Rec)
  const globals: Record<string, Record<string, unknown>> = {}
  const updateCalls: Array<{
    collection: string
    id: string
    data: Record<string, unknown>
    context?: unknown
  }> = []
  let seq = 0
  const payload = {
    records,
    globals,
    updateCalls,
    collections: {},
    find: async ({
      collection,
      where,
      limit,
    }: {
      collection: string
      where?: Record<string, unknown>
      limit?: number
    }) => {
      let docs = records.filter((r) => r.collection === collection)
      if (where) docs = docs.filter((r) => matchesWhere(r, where))
      if (typeof limit === 'number' && limit > 0) docs = docs.slice(0, limit)
      return { docs }
    },
    findByID: async ({ collection, id }: { collection: string; id: string }) => {
      const doc = records.find((r) => r.collection === collection && r.id === id)
      if (!doc) throw new Error('not found')
      return doc
    },
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      const rec: Rec = { id: `${collection}-${++seq}`, collection, ...data }
      records.push(rec)
      return rec
    },
    update: async (args: {
      collection: string
      id: string
      data: Record<string, unknown>
      context?: unknown
    }) => {
      updateCalls.push(args)
      const rec = records.find((r) => r.collection === args.collection && r.id === args.id)
      if (!rec) throw new Error('record not found')
      Object.assign(rec, args.data)
      return rec
    },
    findGlobal: async ({ slug }: { slug: string }) => globals[slug] ?? {},
    updateGlobal: async ({ slug, data }: { slug: string; data: Record<string, unknown> }) => {
      // Payload merges top-level global fields; model that, not replacement.
      globals[slug] = { ...(globals[slug] ?? {}), ...data }
      return globals[slug]
    },
  }
  return payload
}

const onboardingInput = (over: Partial<OnboardingInput> = {}): OnboardingInput => ({
  name: 'Alpha Journal',
  slug: 'alpha-journal',
  description: 'Alpha description.',
  primaryUrl: 'https://alpha.test',
  locale: 'en-US',
  timezone: 'America/Chicago',
  themeId: 'neutral-starter',
  starterType: 'creator-publication',
  featureProfile: 'Standard',
  optionalConnections: [],
  starterContent: true,
  ...over,
})

describe('S2-02 onboarding scope and preservation', () => {
  it('never touches another site’s record at the same canonical path', async () => {
    const payload = makeWorld([
      {
        id: 'beta-about',
        collection: 'content',
        canonicalPath: '/about',
        site: 'site-beta',
        title: 'Beta About',
      },
    ])
    await provisionOnboardingSite(payload as never, 'owner@alpha.test', onboardingInput())
    const beta = payload.records.find((r) => r.id === 'beta-about')!
    expect(beta.site).toBe('site-beta')
    expect(beta.title).toBe('Beta About')
    const alphaAbout = payload.records.find(
      (r) => r.collection === 'content' && r.canonicalPath === '/about' && r.id !== 'beta-about',
    )
    expect(alphaAbout).toBeTruthy()
    expect(alphaAbout!.site).not.toBe('site-beta')
  })

  it('preserves operator edits to starter content and the home layout on rerun', async () => {
    const payload = makeWorld()
    await provisionOnboardingSite(payload as never, 'owner@alpha.test', onboardingInput())
    const about = payload.records.find(
      (r) => r.collection === 'content' && r.canonicalPath === '/about',
    )!
    about.title = 'About Our Newsroom'
    about.summary = 'Operator-written summary.'
    const home = payload.records.find((r) => r.collection === 'page-layouts')!
    home.blocks = [
      {
        id: 'op-block',
        component: 'publisher.rich-content',
        componentVersion: 1,
        props: { title: 'Operator home' },
      },
    ]
    await provisionOnboardingSite(payload as never, 'owner@alpha.test', onboardingInput())
    const after = payload.records.find(
      (r) => r.collection === 'content' && r.canonicalPath === '/about',
    )!
    expect(after.title).toBe('About Our Newsroom')
    expect(after.summary).toBe('Operator-written summary.')
    const homeAfter = payload.records.find((r) => r.collection === 'page-layouts')!
    expect((homeAfter.blocks as unknown[])[0]).toMatchObject({ id: 'op-block' })
    // And the rerun created no duplicates.
    expect(payload.records.filter((r) => r.collection === 'content')).toHaveLength(5)
    expect(payload.records.filter((r) => r.collection === 'page-layouts')).toHaveLength(1)
  })

  it('keeps separate brands per site even with the same display name', async () => {
    const payload = makeWorld()
    await provisionOnboardingSite(payload as never, 'owner@alpha.test', onboardingInput())
    await provisionOnboardingSite(
      payload as never,
      'owner@beta.test',
      onboardingInput({ slug: 'beta-journal', primaryUrl: 'https://beta.test' }),
    )
    const brands = payload.records.filter((r) => r.collection === 'brands')
    expect(brands).toHaveLength(2)
    expect(new Set(brands.map((b) => b.site)).size).toBe(2)
  })

  it('does not replace the first site’s identity in shared settings when a second site is set up', async () => {
    const payload = makeWorld()
    await provisionOnboardingSite(payload as never, 'owner@alpha.test', onboardingInput())
    const alphaSite = payload.records.find((r) => r.collection === 'sites')!
    await provisionOnboardingSite(
      payload as never,
      'owner@beta.test',
      onboardingInput({
        slug: 'beta-journal',
        name: 'Beta Journal',
        primaryUrl: 'https://beta.test',
        themeId: 'renegade-party',
      }),
    )
    const betaSite = payload.records.find((r) => r.collection === 'sites' && r.id !== alphaSite.id)!
    const settings = payload.globals['site-settings']
    expect(settings.siteName).toBe('Alpha Journal')
    expect(settings.canonicalOrigin).toBe('https://alpha.test')
    expect(settings.themeId).toBe('neutral-starter')
    expect(settings.canonicalOriginsBySite).toMatchObject({
      [alphaSite.id]: 'https://alpha.test',
      [betaSite.id]: 'https://beta.test',
    })
  })

  it('preserves an existing member identity across sites', async () => {
    const payload = makeWorld()
    await provisionOnboardingSite(payload as never, 'owner@shared.test', onboardingInput())
    const member = payload.records.find((r) => r.collection === 'members')!
    member.displayName = 'Real Person'
    await provisionOnboardingSite(
      payload as never,
      'owner@shared.test',
      onboardingInput({ slug: 'beta-journal', primaryUrl: 'https://beta.test' }),
    )
    const members = payload.records.filter((r) => r.collection === 'members')
    expect(members).toHaveLength(1)
    expect(members[0].displayName).toBe('Real Person')
  })
})

const ethicsDefinition = starterDefinitions['publication-community'].patterns.find(
  (p) => p.path === '__pattern__/editorial-ethics',
)!

describe('S2-02 starter upgrade preservation', () => {
  it('preserves a customized pattern and reports a conflict instead of publishing over it', async () => {
    const payload = makeWorld([
      {
        id: 'pat-doc',
        collection: 'page-layouts',
        site: 'site-a',
        path: '__pattern__/editorial-ethics',
        surface: 'pattern',
        revision: 8,
        publishedRevision: 8,
        publishedPresentation: { marker: 'live' },
        blocks: [
          {
            id: 'pat-pub-ethics',
            component: 'publisher.rich-content',
            componentVersion: 1,
            props: { title: 'OPERATOR CUSTOM TITLE', body: 'Custom ethics text.' },
          },
        ],
        revisionHistory: [{ revision: 8, blocks: [], action: 'edited' }],
      },
    ])
    const result = await upgradeStarter(payload as never, {
      siteId: 'site-a',
      starterId: 'publication-community',
    })
    expect(result.success).toBe(true)
    expect(result.conflicts.map((c) => c.path)).toContain('__pattern__/editorial-ethics')
    const doc = payload.records.find((r) => r.id === 'pat-doc')!
    expect(doc.revision).toBe(8)
    expect(doc.publishedRevision).toBe(8)
    expect(doc.publishedPresentation).toEqual({ marker: 'live' })
    expect((doc.blocks as Array<{ props: { title: string } }>)[0].props.title).toBe(
      'OPERATOR CUSTOM TITLE',
    )
    expect(
      payload.updateCalls.some(
        (call) => (call.context as { publishPresentation?: boolean })?.publishPresentation,
      ),
    ).toBe(false)
  })

  it('preserves a record edited after its starter baseline', async () => {
    const baseline = structuredClone(ethicsDefinition.blocks)
    const payload = makeWorld([
      {
        id: 'pat-doc',
        collection: 'page-layouts',
        site: 'site-a',
        path: '__pattern__/editorial-ethics',
        surface: 'pattern',
        revision: 2,
        publishedRevision: 1,
        blocks: [
          {
            id: 'pat-pub-ethics',
            component: 'publisher.rich-content',
            componentVersion: 1,
            props: { title: 'Edited after install', body: 'Operator words.' },
          },
        ],
        revisionHistory: [{ revision: 1, blocks: baseline, action: 'starter-install' }],
      },
    ])
    const result = await upgradeStarter(payload as never, {
      siteId: 'site-a',
      starterId: 'publication-community',
    })
    expect(result.conflicts.map((c) => c.path)).toContain('__pattern__/editorial-ethics')
    expect(payload.records.find((r) => r.id === 'pat-doc')!.revision).toBe(2)
  })

  it('refreshes a pristine pattern as a draft revision and never publishes it', async () => {
    const oldBlocks = structuredClone(ethicsDefinition.blocks) as Array<{
      props: Record<string, unknown>
    }>
    oldBlocks[0].props.body = 'An older starter body text.'
    const payload = makeWorld([
      {
        id: 'pat-doc',
        collection: 'page-layouts',
        site: 'site-a',
        path: '__pattern__/editorial-ethics',
        surface: 'pattern',
        revision: 1,
        publishedRevision: 1,
        publishedPresentation: { marker: 'live-v1' },
        blocks: oldBlocks,
        revisionHistory: [{ revision: 1, blocks: oldBlocks, action: 'starter-install' }],
      },
    ])
    const result = await upgradeStarter(payload as never, {
      siteId: 'site-a',
      starterId: 'publication-community',
    })
    expect(result.conflicts.map((c) => c.path)).not.toContain('__pattern__/editorial-ethics')
    const doc = payload.records.find((r) => r.id === 'pat-doc')!
    expect(doc.revision).toBe(2)
    expect(doc.publishedRevision).toBe(1)
    expect(doc.publishedPresentation).toEqual({ marker: 'live-v1' })
    expect((doc.blocks as Array<{ props: { body: string } }>)[0].props.body).toBe(
      (ethicsDefinition.blocks[0].props as { body: string }).body,
    )
    const update = payload.updateCalls.find((call) => call.id === 'pat-doc')!
    expect(
      (update.context as { publishPresentation?: boolean } | undefined)?.publishPresentation,
    ).toBeUndefined()
    // Missing starter assets were staged as drafts, not published.
    const created = payload.records.filter(
      (r) => r.collection === 'page-layouts' && r.id !== 'pat-doc',
    )
    expect(created.length).toBeGreaterThan(0)
    for (const record of created) {
      expect(record.status).toBe('draft')
      expect(record.publishedRevision).toBeUndefined()
    }
  })

  it('reports starter status from the records, not constants', async () => {
    const payload = makeWorld([
      {
        id: 'c1',
        collection: 'content',
        site: 'site-a',
        contentType: 'article',
        importSourceSystem: 'starter:publication-community',
      },
      {
        id: 'pat-doc',
        collection: 'page-layouts',
        site: 'site-a',
        path: '__pattern__/editorial-ethics',
        surface: 'pattern',
        revision: 8,
        blocks: [],
        revisionHistory: [{ revision: 8, blocks: [], action: 'edited' }],
      },
    ])
    const status = await getStarterStatus(payload as never, 'site-a')
    expect(status.installed).toBe(true)
    expect(status.starterId).toBe('publication-community')
    expect(status.version).toBe(starterDefinitions['publication-community'].version)
    // A customized record with no baseline is upgrade work (a conflict to review).
    expect(status.upgradable).toBe(true)
    expect(status.availableUpgradeVersion).toBe(starterDefinitions['publication-community'].version)

    const empty = await getStarterStatus(makeWorld() as never, 'site-none')
    expect(empty.installed).toBe(false)
    expect(empty.upgradable).toBe(false)
    expect(empty.version).toBeUndefined()
  })
})
