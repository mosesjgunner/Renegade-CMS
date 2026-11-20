/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POD-RC-01 Step 03 — creator domains are authoritative.
 *
 * Two-site fixture on one install: each site has its own canonical
 * origin (pinned in the site-settings global, snapshot + restored —
 * the global is shared by the whole suite database) and its own show.
 * The public feed route must serve each show ONLY on its own site's
 * host, build every feed URL from that site's canonical origin (never
 * the install-wide APP_URL), fail closed on the wrong or an unknown
 * host, and keep channel + episode GUIDs identical across a slug
 * rename and a domain move.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { GET as feedGet } from '../../src/app/(frontend)/podcasts/[slug]/feed.xml/route'
import { seed } from '../../src/scripts/seed'

const ORIGIN_A = 'https://alpha.example'
const ORIGIN_B = 'https://beta.example'
const ORIGIN_A_MOVED = 'https://alpha-moved.example'

let payload: Payload
let siteAId: string
let siteBId: string
let showAId: string
let showBId: string
let showASlug: string
let showBSlug: string
let settingsSnapshot: { canonicalOrigin: unknown; canonicalOriginsBySite: unknown } | null = null

const suffix = randomUUID().slice(0, 8)

async function pinSiteOrigins(origins: Record<string, string>) {
  const current = (await payload.findGlobal({
    slug: 'site-settings',
    overrideAccess: true,
  } as never)) as any
  const kept = Object.fromEntries(
    Object.entries(
      (current?.canonicalOriginsBySite as Record<string, unknown> | null) ?? {},
    ).filter(([key]) => key !== siteAId && key !== siteBId),
  )
  // Only the per-site origin map is pinned; the install-wide
  // canonicalOrigin is never touched by this suite.
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOriginsBySite: { ...kept, ...origins },
    },
    overrideAccess: true,
  } as never)
}

async function makeShow(siteId: string, label: string) {
  const runId = `${label}-${suffix}`
  const audioBlob = await payload.create({
    collection: 'media-blobs',
    data: {
      site: siteId,
      storageKey: `${siteId}/${randomUUID()}.wav`,
      storageProvider: 'local',
      mimeType: 'audio/wav',
      sizeBytes: 192000,
      checksum: `sha256:audio-${runId}`,
      state: 'ready',
    },
    overrideAccess: true,
  } as never)
  const audioAsset = await payload.create({
    collection: 'media-assets',
    data: {
      site: siteId,
      title: `Episode Audio ${runId}`,
      kind: 'audio',
      storageProvider: 'local',
      originalBlob: (audioBlob as any).id,
      storageLocation: `${siteId}/${randomUUID()}.wav`,
      mimeType: 'audio/wav',
      sizeBytes: 192000,
      checksum: `sha256:audio-${runId}`,
      durationSeconds: 12,
    } as any,
    overrideAccess: true,
  } as never)
  const artworkBlob = await payload.create({
    collection: 'media-blobs',
    data: {
      site: siteId,
      storageKey: `${siteId}/${randomUUID()}.png`,
      storageProvider: 'local',
      mimeType: 'image/png',
      sizeBytes: 42000,
      checksum: `sha256:artwork-${runId}`,
      state: 'ready',
    },
    overrideAccess: true,
  } as never)
  const artworkAsset = await payload.create({
    collection: 'media-assets',
    data: {
      site: siteId,
      title: `Show Artwork ${runId}`,
      kind: 'image',
      storageProvider: 'local',
      originalBlob: (artworkBlob as any).id,
      storageLocation: `${siteId}/${randomUUID()}.png`,
      mimeType: 'image/png',
      sizeBytes: 42000,
      checksum: `sha256:artwork-${runId}`,
      width: 1400,
      height: 1400,
    } as any,
    overrideAccess: true,
  } as never)
  const show = (await payload.create({
    collection: 'podcast-shows',
    data: {
      site: siteId,
      title: `Domain Show ${runId}`,
      slug: `domain-show-${runId}`,
      description: `Fixture show for POD-RC-01 step 03 (${label}).`,
      artwork: (artworkAsset as any).id,
      explicit: false,
      language: 'en',
      rssEnabled: true,
      status: 'published',
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
    } as any,
    overrideAccess: true,
  } as never)) as any
  const episode = (await payload.create({
    collection: 'podcast-episodes',
    data: {
      site: siteId,
      show: show.id,
      title: `Domain Episode ${runId}`,
      slug: `domain-ep-${runId}`,
      explicit: false,
      audio: (audioAsset as any).id,
      status: 'published',
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
    } as any,
    overrideAccess: true,
  } as never)) as any
  return { show, episode }
}

const getFeed = (host: string, slug: string) =>
  feedGet(new Request(`https://${host}/podcasts/${slug}/feed.xml`), {
    params: Promise.resolve({ slug }),
  })

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)

  const siteA = (await payload.create({
    collection: 'sites',
    data: { name: `PODRC01 Site A ${suffix}`, slug: `podrc01-a-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)) as any
  const siteB = (await payload.create({
    collection: 'sites',
    data: { name: `PODRC01 Site B ${suffix}`, slug: `podrc01-b-${suffix}`, lifecycle: 'active' },
    overrideAccess: true,
  } as never)) as any
  siteAId = String(siteA.id)
  siteBId = String(siteB.id)

  const current = (await payload.findGlobal({
    slug: 'site-settings',
    overrideAccess: true,
  } as never)) as any
  settingsSnapshot = {
    canonicalOrigin: current?.canonicalOrigin ?? null,
    canonicalOriginsBySite: current?.canonicalOriginsBySite ?? null,
  }
  void settingsSnapshot.canonicalOrigin
  await pinSiteOrigins({ [siteAId]: ORIGIN_A, [siteBId]: ORIGIN_B })

  const a = await makeShow(siteAId, 'a')
  const b = await makeShow(siteBId, 'b')
  showAId = String(a.show.id)
  showBId = String(b.show.id)
  showASlug = String(a.show.slug)
  showBSlug = String(b.show.slug)
  expect(a.show.podcastGuidValue).toBeTruthy()
  expect(b.show.podcastGuidValue).toBeTruthy()
})

afterAll(async () => {
  if (settingsSnapshot) {
    await payload
      .updateGlobal({
        slug: 'site-settings',
        data: {
          canonicalOriginsBySite: settingsSnapshot.canonicalOriginsBySite ?? {},
        },
        overrideAccess: true,
      } as never)
      .catch(() => undefined)
  }
  await payload?.db.destroy?.()
})

describe('POD-RC-01 step 03 — domain-authoritative public feeds', () => {
  it('serves site A\u2019s show on site A\u2019s host with site A URLs everywhere', async () => {
    const res = await getFeed('alpha.example', showASlug)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(`href="${ORIGIN_A}/podcasts/${showASlug}/feed.xml"`)
    expect(body).toContain(`${ORIGIN_A}/media/`)
    expect(body).toContain(`${ORIGIN_A}/podcasts/episodes/`)
    expect(body).not.toContain('beta.example')
    expect(body).not.toContain('127.0.0.1:3100')
  })

  it('serves site B\u2019s show on site B\u2019s host with site B URLs everywhere', async () => {
    const res = await getFeed('beta.example', showBSlug)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(`href="${ORIGIN_B}/podcasts/${showBSlug}/feed.xml"`)
    expect(body).toContain(`${ORIGIN_B}/media/`)
    expect(body).not.toContain('alpha.example')
    expect(body).not.toContain('127.0.0.1:3100')
  })

  it('404s site A\u2019s slug on site B\u2019s host (no cross-site leak)', async () => {
    const res = await getFeed('beta.example', showASlug)
    expect(res.status).toBe(404)
  })

  it('404s site B\u2019s slug on site A\u2019s host', async () => {
    const res = await getFeed('alpha.example', showBSlug)
    expect(res.status).toBe(404)
  })

  it('fails closed on an unknown host', async () => {
    const res = await getFeed('unknown.example', showASlug)
    expect(res.status).toBe(404)
  })

  it('serves on a local/dev host, at the show\u2019s own canonical origin', async () => {
    // Dev hosts carry no binding authority: local tooling reaches any
    // show via localhost, but the feed URLs still belong to the
    // show's site — never to the dev host or another site.
    const res = await getFeed('localhost:3000', showASlug)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(`href="${ORIGIN_A}/podcasts/${showASlug}/feed.xml"`)
    expect(body).not.toContain('localhost:3000/podcasts')
  })

  it('keeps GUIDs identical across a slug rename and a domain move', async () => {
    const before = await (await getFeed('alpha.example', showASlug)).text()
    const channelGuid = before.match(/<podcast:guid>([^<]+)<\/podcast:guid>/)?.[1]
    const episodeGuid = before.match(/<guid isPermaLink="false">([^<]+)<\/guid>/)?.[1]
    expect(channelGuid).toBeTruthy()
    expect(episodeGuid).toBeTruthy()

    // Slug rename on the same domain.
    const renamedSlug = `${showASlug}-renamed`
    await payload.update({
      collection: 'podcast-shows',
      id: showAId,
      data: { slug: renamedSlug } as any,
      overrideAccess: true,
    } as never)
    const afterRename = await (await getFeed('alpha.example', renamedSlug)).text()
    expect(afterRename).toContain(`<podcast:guid>${channelGuid}</podcast:guid>`)
    expect(afterRename).toContain(`<guid isPermaLink="false">${episodeGuid}</guid>`)

    // Domain move: same show, new canonical origin for site A.
    await pinSiteOrigins({ [siteAId]: ORIGIN_A_MOVED, [siteBId]: ORIGIN_B })
    try {
      const res = await getFeed('alpha-moved.example', renamedSlug)
      expect(res.status).toBe(200)
      const afterMove = await res.text()
      expect(afterMove).toContain(`href="${ORIGIN_A_MOVED}/podcasts/${renamedSlug}/feed.xml"`)
      expect(afterMove).toContain(`<podcast:guid>${channelGuid}</podcast:guid>`)
      expect(afterMove).toContain(`<guid isPermaLink="false">${episodeGuid}</guid>`)
      // The old host no longer speaks for the show.
      const stale = await getFeed('alpha.example', renamedSlug)
      expect(stale.status).toBe(404)
    } finally {
      await pinSiteOrigins({ [siteAId]: ORIGIN_A, [siteBId]: ORIGIN_B })
    }
  })
})
