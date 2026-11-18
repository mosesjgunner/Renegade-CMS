/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sitemap projection parity: `getSitemapEntries` (the batched, page-sliced
 * projection the sitemap routes serve) must return exactly the entries of
 * the original `crawlerEntries(getAllIndexableDiscoveryDocuments(...))`
 * pipeline for the same site and database state — including the records
 * whose indexability, canonical, or media verdicts are easy to get wrong
 * (noindex, unlisted, scheduled, canonical overrides, hero-image readiness,
 * topic usage gating, layout dedup, redirect-shadowed shows).
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import { fixtureRichText } from '../helpers/fixture-rich-text'
import { crawlerEntries } from '../../src/modules/public/crawler'
import { getAllIndexableDiscoveryDocuments } from '../../src/modules/public/discovery'
import {
  getSitemapEntries,
  getSitemapIndexSummary,
} from '../../src/modules/public/sitemap-projection'

vi.mock('next/headers', async () => ({
  ...(await vi.importActual<typeof import('next/headers')>('next/headers')),
  headers: async () => new Headers({ host: 'localhost:3000' }),
}))

let payload: Payload
let siteId: string
let publicationId: string
let suffix: string
let settingsSnapshot: Record<string, unknown> | null = null

const ORIGIN = 'http://localhost:3000'

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)

  const pub = (
    await payload.find({
      collection: 'publications',
      where: {
        and: [
          { slug: { equals: 'main' } },
          { status: { equals: 'active' } },
          { visibility: { equals: 'public' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as any
  expect(pub).toBeTruthy()
  publicationId = String(pub.id)
  siteId = typeof pub.site === 'string' ? pub.site : String(pub.site?.id ?? '')

  // Pin the shared site-settings global for deterministic verdicts (other
  // suites reconfigure it for their own scenarios); restored in afterAll.
  const currentSettings = (await payload.findGlobal({
    slug: 'site-settings',
    overrideAccess: true,
  } as never)) as any
  settingsSnapshot = {
    canonicalOrigin: currentSettings?.canonicalOrigin ?? null,
    canonicalOriginsBySite: currentSettings?.canonicalOriginsBySite ?? null,
    indexingMode: currentSettings?.indexingMode ?? null,
    launchState: currentSettings?.launchState ?? null,
  }
  const foreignOrigins = Object.fromEntries(
    Object.entries(
      (currentSettings?.canonicalOriginsBySite as Record<string, unknown> | null) ?? {},
    ).filter(([key, value]) => {
      if (key === siteId) return false
      try {
        const hostname = new URL(String(value)).hostname.toLowerCase()
        return hostname !== 'localhost' && hostname !== '127.0.0.1'
      } catch {
        return false
      }
    }),
  )
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: ORIGIN,
      canonicalOriginsBySite: { ...foreignOrigins, [siteId]: ORIGIN },
      indexingMode: 'index',
      launchState: 'live',
    },
    overrideAccess: true,
  } as never)

  suffix = randomUUID().slice(0, 8)
  const past = new Date(Date.now() - 86_400_000).toISOString()
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString()

  const anyAsset = (
    await payload.find({
      collection: 'media-assets',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as any
  const assetId = anyAsset ? String(anyAsset.id) : null

  const topicUsed = await payload.create({
    collection: 'topics',
    data: {
      site: siteId,
      publication: publicationId,
      name: `Projection Parity Topic ${suffix}`,
      slug: `projection-parity-topic-${suffix}`,
      status: 'published',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)
  const topicNoindexOnly = await payload.create({
    collection: 'topics',
    data: {
      site: siteId,
      publication: publicationId,
      name: `Projection Parity Noindex Topic ${suffix}`,
      slug: `projection-parity-noindex-topic-${suffix}`,
      status: 'published',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)

  const article = (slug: string, extra: Record<string, any> = {}) => ({
    site: siteId,
    publication: publicationId,
    contentType: 'article',
    body: fixtureRichText(),
    title: `Projection Parity ${slug}`,
    slug,
    canonicalPath: `/articles/${slug}`,
    summary: `Projection parity summary ${slug}`,
    status: 'published',
    visibility: 'public',
    publishedAt: past,
    commentsPolicy: 'closed',
    retentionMode: 'permanent',
    removeFromDiscovery: false,
    publicChangeHistoryPolicy: 'summary',
    ...extra,
  })
  const ctlSlug = `projection-parity-ctl-${suffix}`
  await payload.create({
    collection: 'content',
    data: article(ctlSlug, { topics: [String((topicUsed as any).id)] }),
    overrideAccess: true,
  } as never)
  await payload.create({
    collection: 'content',
    data: article(`projection-parity-noindex-${suffix}`, {
      seoNoIndex: true,
      topics: [String((topicNoindexOnly as any).id)],
    }),
    overrideAccess: true,
  } as never)
  await payload.create({
    collection: 'content',
    data: article(`projection-parity-unlisted-${suffix}`, { visibility: 'unlisted' }),
    overrideAccess: true,
  } as never)
  await payload.create({
    collection: 'content',
    data: article(`projection-parity-future-${suffix}`, { publishedAt: future }),
    overrideAccess: true,
  } as never)
  await payload.create({
    collection: 'content',
    data: article(`projection-parity-canon-${suffix}`, {
      seoCanonicalURL: `${ORIGIN}/articles/${ctlSlug}`,
    }),
    overrideAccess: true,
  } as never)
  if (assetId) {
    await payload.create({
      collection: 'content',
      data: article(`projection-parity-hero-${suffix}`, { heroMedia: assetId }),
      overrideAccess: true,
    } as never)
  }
  // A layout sharing the control article's path exercises the layout dedup
  // against already-accumulated documents; a plain layout is a normal entry.
  await payload.create({
    collection: 'page-layouts',
    data: {
      site: siteId,
      name: `Projection Parity Layout ${suffix}`,
      path: `/projection-parity-layout-${suffix}`,
      status: 'published',
      visibility: 'public',
      regions: [],
    },
    overrideAccess: true,
  } as never)
  await payload.create({
    collection: 'page-layouts',
    data: {
      site: siteId,
      name: `Projection Parity Shared Layout ${suffix}`,
      path: `/articles/${ctlSlug}`,
      status: 'published',
      visibility: 'public',
      regions: [],
    },
    overrideAccess: true,
  } as never)
  // A redirect-shadowed show: record-less resolution in the original
  // pipeline returns the redirect document, so the show leaves the sitemap.
  const showSlug = `projection-parity-show-${suffix}`
  await payload.create({
    collection: 'podcast-shows',
    data: {
      site: siteId,
      title: `Projection Parity Show ${suffix}`,
      slug: showSlug,
      status: 'published',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)
  await payload.create({
    collection: 'public-redirects',
    data: {
      site: siteId,
      fromPath: `/podcasts/${showSlug}`,
      toPath: `/articles/${ctlSlug}`,
      match: 'exact',
      statusCode: '308',
      preserveQuery: true,
      enabled: true,
    },
    overrideAccess: true,
  } as never)
})

afterAll(async () => {
  try {
    if (settingsSnapshot) {
      await payload.updateGlobal({
        slug: 'site-settings',
        data: settingsSnapshot,
        overrideAccess: true,
      } as never)
    }
  } catch {
    // Cleanup is best-effort; never fail the suite over shared-state restore.
  }
  await payload?.db?.destroy?.()
})

describe('Sitemap projection parity', { timeout: 120000 }, () => {
  it('returns exactly the legacy pipeline entries for the seeded site', async () => {
    const legacy = crawlerEntries(await getAllIndexableDiscoveryDocuments(payload, siteId))
    const projected = await getSitemapEntries(payload, siteId)
    // Non-vacuous: the seeded corpus must produce real entries, including
    // the control article and the plain layout, and must exclude the
    // noindex article, the noindex-only topic, and the redirected show.
    const urls = projected.map((entry) => entry.url)
    expect(urls.length).toBeGreaterThanOrEqual(5)
    expect(urls).toContain(`${ORIGIN}/articles/projection-parity-ctl-${suffix}`)
    expect(urls).toContain(`${ORIGIN}/projection-parity-layout-${suffix}`)
    expect(urls).toContain(`${ORIGIN}/topics/projection-parity-topic-${suffix}`)
    expect(urls.some((url) => url.includes('projection-parity-noindex'))).toBe(false)
    expect(urls.some((url) => url.includes('projection-parity-unlisted'))).toBe(false)
    expect(urls.some((url) => url.includes('projection-parity-future'))).toBe(false)
    expect(urls.some((url) => url.includes('projection-parity-show'))).toBe(false)
    expect(projected).toEqual(legacy)
  })

  it('matches the legacy pipeline for the default (publication-resolved) scope', async () => {
    const legacy = crawlerEntries(await getAllIndexableDiscoveryDocuments(payload))
    const projected = await getSitemapEntries(payload)
    expect(projected).toEqual(legacy)
  })

  it('index summary agrees with the full entry list', async () => {
    const entries = await getSitemapEntries(payload, siteId)
    const summary = await getSitemapIndexSummary(payload, siteId)
    expect(summary.total).toBe(entries.length)
    const expected: Array<string | null> = []
    for (let i = 0; i < entries.length; i += 1000) {
      let latest: string | null = null
      for (const entry of entries.slice(i, i + 1000)) {
        if (entry.lastmod && (!latest || entry.lastmod > latest)) latest = entry.lastmod
      }
      expected.push(latest)
    }
    expect(summary.pageLastmods).toEqual(expected)
  })
})
