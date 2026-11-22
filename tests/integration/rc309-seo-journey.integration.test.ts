/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-09 — SEO and site quality: issue → source row → operator fix →
 * publish → re-audit, on two sites.
 *
 * The audit engine consumes HTTP responses. In this harness the fetcher
 * answers from the site's live database state: redirect rules resolve
 * through the product's own resolveRedirectForSite (the request path),
 * and page HTML is composed from the product's own discovery projection
 * (discoveryToMetadata / discoveryToJsonLd) plus the anchors stored in
 * the document's Lexical body — the same data the public page template
 * emits. Everything else is product code against real Postgres: the
 * rendered audit, the persisted quality-issue lifecycle, the sitemap
 * projection and the sitemap/robots route handlers.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

// robots() resolves its site from the request Host header; give the
// harness the seeded site's host the same way the sitemap route
// handlers receive it on their Request objects.
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000' }),
}))

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import {
  resolveDiscoveryDocument,
  discoveryToMetadata,
  discoveryToJsonLd,
  resolveRedirectForSite,
} from '../../src/modules/public/discovery'
import { runRenderedAudit, type RenderedAudit } from '../../src/modules/public/discovery-audit'
import {
  persistRenderedAuditLifecycle,
  type DiscoveryLifecycleSummary,
} from '../../src/modules/public/discovery-lifecycle'
import {
  getSitemapEntries,
  getSitemapIndexSummary,
} from '../../src/modules/public/sitemap-projection'
import robots from '../../src/app/robots'
import { GET as getSitemapIndex } from '../../src/app/(frontend)/sitemap.xml/route'
import { GET as getSitemapPage } from '../../src/app/(frontend)/sitemaps/[page]/route'

const PUBLIC_RESOLVE = async () => [{ address: '93.184.216.34' }]

const textNode = (text: string) => ({
  type: 'text',
  version: 1,
  text,
  format: 0,
  detail: 0,
  mode: 'normal',
  style: '',
})
const linkNode = (url: string, text: string) => ({
  type: 'link',
  version: 3,
  format: '',
  indent: 0,
  direction: 'ltr',
  fields: { url, linkType: 'custom', newTab: false },
  children: [textNode(text)],
})
const bodyWithLinks = (links: Array<{ url: string; text: string }>) => ({
  root: {
    type: 'root',
    version: 1,
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [textNode('Journey fixture paragraph with outbound references.')],
      },
      ...links.map((link) => ({
        type: 'paragraph',
        version: 1,
        children: [linkNode(link.url, link.text)],
      })),
    ],
  },
})
const extractLinks = (node: any, out: string[] = []): string[] => {
  if (!node || typeof node !== 'object') return out
  if (node.type === 'link' && typeof node.fields?.url === 'string') out.push(node.fields.url)
  const children = node.children ?? node.root?.children ?? []
  for (const child of children) extractLinks(child, out)
  return out
}
function hostRequest(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set('host', new URL(url).host)
  return new Request(url, { ...init, headers })
}

let payload: Payload
let suffix: string
let settingsSnapshot: { canonicalOrigin: unknown; canonicalOriginsBySite: unknown } | null = null

type SiteFixture = {
  siteId: string
  publicationId: string
  origin: string
  ids: Record<string, string>
  paths: Record<string, string>
}
let siteA: SiteFixture
let siteB: SiteFixture
let authorId: string

async function createContent(
  site: SiteFixture,
  key: string,
  overrides: Record<string, unknown>,
): Promise<string> {
  const slug = `${key}-${suffix}`
  const doc = (await payload.create({
    collection: 'content',
    data: {
      site: site.siteId,
      publication: site.publicationId,
      contentType: 'article',
      body: bodyWithLinks([]),
      title: `Journey ${key} article ${suffix}`,
      slug,
      canonicalPath: `/articles/${slug}`,
      summary: `Journey summary for ${key} ${suffix} with enough detail to describe the page.`,
      status: 'published',
      visibility: 'public',
      publishedAt: new Date().toISOString(),
      commentsPolicy: 'closed',
      retentionMode: 'permanent',
      removeFromDiscovery: false,
      publicChangeHistoryPolicy: 'summary',
      seoTitle: `Journey ${key} article ${suffix}`,
      seoDescription: `Journey description for ${key} ${suffix}, written to sit inside the review range.`,
      ...overrides,
    },
    overrideAccess: true,
  } as never)) as any
  site.ids[key] = String(doc.id)
  site.paths[key] = `/articles/${slug}`
  return site.ids[key]
}

async function canonicalUrl(site: SiteFixture, key: string): Promise<string> {
  const doc = await resolveDiscoveryDocument(payload, {
    siteId: site.siteId,
    path: site.paths[key],
  })
  expect(doc, `discovery doc for ${key}`).toBeTruthy()
  return doc!.canonicalUrl
}

function makeFetcher(siteId: string) {
  return (async (input: unknown) => {
    const url = new URL(String((input as Request)?.url ?? input))
    const path = url.pathname
    const { resolution } = await resolveRedirectForSite(payload, siteId, path)
    if (resolution && !('error' in resolution))
      return new Response('', { status: resolution.statusCode })
    const found = await payload.find({
      collection: 'content',
      where: { and: [{ site: { equals: siteId } }, { canonicalPath: { equals: path } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const content = found.docs[0] as any
    if (!content || content.status !== 'published')
      return new Response('not found', { status: 404 })
    const doc = await resolveDiscoveryDocument(payload, { siteId, path })
    if (!doc) return new Response('not found', { status: 404 })
    const meta = discoveryToMetadata(doc)
    const jsonLd = discoveryToJsonLd(doc)
    const anchors = extractLinks(content.body)
      .map((href) => `<a href="${href}">${href}</a>`)
      .join('')
    const robotsMeta = doc.indexability.robotsDirectives.index
      ? ''
      : '<meta name="robots" content="noindex">'
    const html =
      `<!doctype html><html><head><title>${meta.title ?? ''}</title>` +
      `<meta name="description" content="${meta.description ?? ''}">` +
      `<link rel="canonical" href="${doc.canonicalUrl}">${robotsMeta}` +
      `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head>` +
      `<body><h1>${doc.title.value}</h1>${anchors}</body></html>`
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
  }) as unknown as typeof fetch
}

async function runSiteAudit(
  site: SiteFixture,
  paths: string[],
): Promise<{ audit: RenderedAudit; lifecycle: DiscoveryLifecycleSummary }> {
  const audit = await runRenderedAudit({
    origin: site.origin,
    paths,
    fetcher: makeFetcher(site.siteId),
    resolve: PUBLIC_RESOLVE as never,
    allowPrivate: true,
    concurrency: 2,
  })
  const lifecycle = await persistRenderedAuditLifecycle(payload, site.siteId, audit.issues, {
    state: audit.scope.state,
    eligible: audit.scope.eligible,
    examined: audit.scope.examined,
    failed: audit.scope.failed,
    skipped: audit.scope.skipped.length,
    complete: audit.scope.complete,
    examinedUrls: audit.pages.filter((p) => p.status > 0).map((p) => p.url),
    inboundLinksComplete:
      audit.scope.state === 'complete' &&
      audit.pages.every((p) => p.status >= 200 && p.status < 300),
  })
  return { audit, lifecycle }
}

const ruleIdsFor = (audit: RenderedAudit, url: string) =>
  audit.issues.filter((i) => i.url === url).map((i) => i.ruleId)

async function issueRow(siteId: string, dedupeKey: string) {
  const res = await payload.find({
    collection: 'quality-issues',
    where: { and: [{ site: { equals: siteId } }, { dedupeKey: { equals: dedupeKey } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return res.docs[0] as any
}

async function buildSiteFixture(
  siteId: string,
  publicationId: string,
  origin: string,
): Promise<SiteFixture> {
  const site: SiteFixture = { siteId, publicationId, origin, ids: {}, paths: {} }
  const p = (key: string) => `/articles/${key}-${suffix}`
  await createContent(site, 'hub', {
    body: bodyWithLinks([
      { url: p('alpha'), text: 'alpha' },
      { url: p('noindex'), text: 'noindex' },
      { url: p('schemagap'), text: 'schemagap' },
    ]),
  })
  await createContent(site, 'alpha', {
    body: bodyWithLinks([
      { url: p('hub'), text: 'hub' },
      { url: p('gone'), text: 'gone' },
    ]),
  })
  await createContent(site, 'orphan', {})
  await createContent(site, 'noindex', { seoNoIndex: true })
  await createContent(site, 'schemagap', {})
  await createContent(site, 'legacy', {})
  await createContent(site, 'draft', { status: 'draft' })
  // The legacy article moved: a redirect rule maps its canonical path to
  // the new path, but the document itself still lives at the old path —
  // the classic stale-canonical redirect issue.
  site.paths['legacyNew'] = p('legacy-new')
  await payload.create({
    collection: 'public-redirects',
    data: {
      site: siteId,
      fromPath: p('legacy'),
      toPath: p('legacy-new'),
      match: 'exact',
      statusCode: '308',
      preserveQuery: true,
      enabled: true,
    },
    overrideAccess: true,
  } as never)
  return site
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)
  suffix = randomUUID().slice(0, 8)

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
  const siteAId = typeof pub.site === 'string' ? pub.site : String(pub.site?.id ?? '')

  const siteBDoc = (await payload.create({
    collection: 'sites',
    data: {
      name: `RC3-09 Satellite ${suffix}`,
      slug: `rc309-satellite-${suffix}`,
      domain: `satellite-${suffix}.example.test`,
      status: 'published',
    },
    overrideAccess: true,
  } as never)) as any
  const siteBId = String(siteBDoc.id)
  const pubB = (await payload.create({
    collection: 'publications',
    data: {
      name: `RC3-09 Satellite Publication ${suffix}`,
      slug: `rc309-satellite-pub-${suffix}`,
      site: siteBId,
      status: 'active',
      visibility: 'public',
    },
    overrideAccess: true,
  } as never)) as any

  const author = (await payload.create({
    collection: 'authors',
    data: { displayName: `Journey Author ${suffix}`, slug: `journey-author-${suffix}` },
    overrideAccess: true,
  } as never)) as any
  authorId = String(author.id)

  // Pin both sites' canonical origins (snapshot + restore in afterAll).
  const currentSettings = (await payload.findGlobal({
    slug: 'site-settings',
    overrideAccess: true,
  } as never)) as any
  settingsSnapshot = {
    canonicalOrigin: currentSettings?.canonicalOrigin ?? null,
    canonicalOriginsBySite: currentSettings?.canonicalOriginsBySite ?? null,
  }
  const kept = Object.fromEntries(
    Object.entries(
      (currentSettings?.canonicalOriginsBySite as Record<string, unknown> | null) ?? {},
    ).filter(([key, value]) => {
      if (key === siteAId || key === siteBId) return false
      try {
        const hostname = new URL(String(value)).hostname.toLowerCase()
        return hostname !== 'localhost' && hostname !== '127.0.0.1'
      } catch {
        return false
      }
    }),
  )
  const originA = 'http://localhost:3000'
  const originB = `http://satellite-${suffix}.example.test`
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: originA,
      canonicalOriginsBySite: { ...kept, [siteAId]: originA, [siteBId]: originB },
    },
    overrideAccess: true,
  } as never)

  siteA = await buildSiteFixture(siteAId, String(pub.id), originA)
  siteB = await buildSiteFixture(siteBId, String(pubB.id), originB)
})

afterAll(async () => {
  if (settingsSnapshot) {
    await payload
      .updateGlobal({
        slug: 'site-settings',
        data: {
          canonicalOrigin: settingsSnapshot.canonicalOrigin,
          canonicalOriginsBySite: settingsSnapshot.canonicalOriginsBySite,
        },
        overrideAccess: true,
      } as never)
      .catch(() => undefined)
  }
  await payload?.db?.destroy?.()
})

describe('RC3-09 SEO issue → fix → re-audit journey', () => {
  it('1. detects broken link, orphan, canonical/robots contradiction and schema gap on site A, traced to quality-issue rows', async () => {
    const paths = [
      await canonicalUrl(siteA, 'hub'),
      await canonicalUrl(siteA, 'alpha'),
      await canonicalUrl(siteA, 'orphan'),
      await canonicalUrl(siteA, 'noindex'),
      await canonicalUrl(siteA, 'schemagap'),
    ]
    const { audit, lifecycle } = await runSiteAudit(siteA, paths)
    expect(audit.scope.state).toBe('complete')

    const alphaUrl = await canonicalUrl(siteA, 'alpha')
    const orphanUrl = await canonicalUrl(siteA, 'orphan')
    const noindexUrl = await canonicalUrl(siteA, 'noindex')
    expect(ruleIdsFor(audit, alphaUrl)).toContain('DISC-05-INTERNAL-LINK-UNREACHABLE')
    expect(ruleIdsFor(audit, orphanUrl)).toContain('DISC-05-NO-AUDITED-INBOUND-LINK')
    expect(ruleIdsFor(audit, noindexUrl)).toContain('DISC-05-INDEXABILITY-CONTRADICTION')

    // Schema gap: the article renders without an author in its JSON-LD
    // graph and the product's own schema validation names the gap.
    const schemaDoc = await resolveDiscoveryDocument(payload, {
      siteId: siteA.siteId,
      path: siteA.paths.schemagap,
    })
    expect(
      (schemaDoc?.schema.validationIssues ?? []).some(
        (issue) => issue.field === 'author' && issue.repairField === 'authors',
      ),
    ).toBe(true)
    const graph = discoveryToJsonLd(schemaDoc!) as any
    const articleNode = graph['@graph'].find((n: any) => n['@type'] === 'Article')
    expect(articleNode).toBeTruthy()
    expect(articleNode.author).toBeFalsy()

    // Findings trace to persisted source rows for this site.
    expect(lifecycle.created).toBeGreaterThanOrEqual(3)
    for (const [rule, url] of [
      ['DISC-05-INTERNAL-LINK-UNREACHABLE', alphaUrl],
      ['DISC-05-NO-AUDITED-INBOUND-LINK', orphanUrl],
      ['DISC-05-INDEXABILITY-CONTRADICTION', noindexUrl],
    ] as const) {
      const row = await issueRow(siteA.siteId, `disc-05:${rule}:${url}`)
      expect(row, `quality issue row for ${rule}`).toBeTruthy()
      expect(row.status).toBe('open')
      expect(String(row.targetId)).toBe(url)
    }
  })

  it('2. detects the redirect-shadowed canonical on site A', async () => {
    // The discovery projection itself reports the path as a redirect to
    // the new location; the audit is run against the stored (old) URL,
    // which is the address whose response is the redirect.
    const legacyDoc = await resolveDiscoveryDocument(payload, {
      siteId: siteA.siteId,
      path: siteA.paths.legacy,
    })
    expect(legacyDoc?.redirect.isRedirect).toBe(true)
    expect(legacyDoc?.redirect.targetUrl).toBe(siteA.paths.legacyNew)
    const legacyUrl = `${siteA.origin}${siteA.paths.legacy}`
    const { audit } = await runSiteAudit(siteA, [
      await canonicalUrl(siteA, 'hub'),
      await canonicalUrl(siteA, 'alpha'),
      legacyUrl,
    ])
    expect(ruleIdsFor(audit, legacyUrl)).toContain('DISC-05-REDIRECT')
    const row = await issueRow(siteA.siteId, `disc-05:DISC-05-REDIRECT:${legacyUrl}`)
    expect(row?.status).toBe('open')
  })

  it('3. verifies rendered metadata/JSON-LD plus sitemap and robots outputs before fixes', async () => {
    const hubDoc = await resolveDiscoveryDocument(payload, {
      siteId: siteA.siteId,
      path: siteA.paths.hub,
    })
    const meta = discoveryToMetadata(hubDoc!)
    expect(meta.alternates?.canonical).toBe(hubDoc!.canonicalUrl)
    const jsonLd = discoveryToJsonLd(hubDoc!) as any
    expect(jsonLd['@context']).toBe('https://schema.org')
    expect(jsonLd['@graph'].some((n: any) => n['@type'] === 'WebPage')).toBe(true)

    // Sitemap projection: published indexable docs in, draft + noindex out,
    // canonical-URL order, index summary consistent with the entries.
    const entries = await getSitemapEntries(payload, siteA.siteId)
    const urls = entries.map((e) => e.url)
    expect(urls).toContain(await canonicalUrl(siteA, 'hub'))
    expect(urls).toContain(await canonicalUrl(siteA, 'orphan'))
    expect(urls.some((u) => u.includes(siteA.paths.draft))).toBe(false)
    expect(urls.some((u) => u.includes(siteA.paths.noindex))).toBe(false)
    expect([...urls].sort((a, b) => a.localeCompare(b))).toEqual(urls)
    const summary = await getSitemapIndexSummary(payload, siteA.siteId)
    expect(summary.total).toBe(entries.length)
    expect(summary.pageLastmods).toHaveLength(Math.max(1, Math.ceil(entries.length / 1000)))

    // Route handlers render the same projection for the site's host.
    const indexRes = await getSitemapIndex(hostRequest(`${siteA.origin}/sitemap.xml`))
    expect(indexRes.status).toBe(200)
    const indexXml = await indexRes.text()
    expect(indexXml).toContain('<sitemapindex')
    expect(indexXml).toContain('/sitemaps/1.xml')
    const childRes = await getSitemapPage(hostRequest(`${siteA.origin}/sitemaps/1.xml`), {
      params: Promise.resolve({ page: '1.xml' }),
    })
    expect(childRes.status).toBe(200)
    const childXml = await childRes.text()
    expect(childXml).toContain('<urlset')
    expect(childXml).toContain(await canonicalUrl(siteA, 'hub'))
    expect(childXml).not.toContain(siteA.paths.draft)

    const robotsRes = await robots()
    expect(JSON.stringify(robotsRes.rules)).toContain('"allow":"/"')
    expect(robotsRes.sitemap).toBe(`${siteA.origin}/sitemap.xml`)
  })

  it('4. operator fixes all five defects through the normal write paths; re-audit resolves them', async () => {
    const p = (key: string) => siteA.paths[key]
    // Broken link: retarget alpha's dead link at the hub.
    await payload.update({
      collection: 'content',
      id: siteA.ids.alpha,
      data: {
        body: bodyWithLinks([
          { url: p('hub'), text: 'hub' },
          { url: p('hub'), text: 'hub again' },
        ]),
      },
      overrideAccess: true,
    } as never)
    // Orphan: the hub now links to it. The hub also links to the legacy
    // article's new path (its move is applied below) so the moved page
    // keeps an inbound link, as an operator completing a move would do.
    await payload.update({
      collection: 'content',
      id: siteA.ids.hub,
      data: {
        body: bodyWithLinks([
          { url: p('alpha'), text: 'alpha' },
          { url: p('noindex'), text: 'noindex' },
          { url: p('schemagap'), text: 'schemagap' },
          { url: p('orphan'), text: 'orphan' },
          { url: p('legacyNew'), text: 'legacy new' },
        ]),
      },
      overrideAccess: true,
    } as never)
    // Canonical/robots contradiction: the page was meant to be indexed.
    await payload.update({
      collection: 'content',
      id: siteA.ids.noindex,
      data: { seoNoIndex: false },
      overrideAccess: true,
    } as never)
    // Schema gap: attach an author.
    await payload.update({
      collection: 'content',
      id: siteA.ids.schemagap,
      data: { authors: [{ author: authorId, displayOrder: 0 }] },
      overrideAccess: true,
    } as never)
    // Redirect issue: move the document to the path the redirect already
    // promises; the rule stays as the historical record of the move.
    await payload.update({
      collection: 'content',
      id: siteA.ids.legacy,
      data: { slug: `legacy-new-${suffix}`, canonicalPath: p('legacyNew') },
      overrideAccess: true,
    } as never)

    const { resolution } = await resolveRedirectForSite(payload, siteA.siteId, p('legacy'))
    expect(resolution && !('error' in resolution) ? resolution.target : null).toBe(p('legacyNew'))
    expect(resolution && !('error' in resolution) ? resolution.statusCode : null).toBe(308)

    const paths = [
      await canonicalUrl(siteA, 'hub'),
      await canonicalUrl(siteA, 'alpha'),
      await canonicalUrl(siteA, 'orphan'),
      await canonicalUrl(siteA, 'noindex'),
      await canonicalUrl(siteA, 'schemagap'),
      await canonicalUrl(siteA, 'legacy'),
    ]
    const { audit } = await runSiteAudit(siteA, paths)
    const fixed = [
      'DISC-05-INTERNAL-LINK-UNREACHABLE',
      'DISC-05-NO-AUDITED-INBOUND-LINK',
      'DISC-05-INDEXABILITY-CONTRADICTION',
      'DISC-05-REDIRECT',
    ]
    for (const rule of fixed)
      expect(
        audit.issues.some((i) => i.ruleId === rule),
        `${rule} should be gone after fixes`,
      ).toBe(false)

    const schemaDoc = await resolveDiscoveryDocument(payload, {
      siteId: siteA.siteId,
      path: siteA.paths.schemagap,
    })
    expect(
      (schemaDoc?.schema.validationIssues ?? []).some((issue) => issue.field === 'author'),
    ).toBe(false)
    const graph = discoveryToJsonLd(schemaDoc!) as any
    expect(graph['@graph'].find((n: any) => n['@type'] === 'Article')?.author).toBeTruthy()

    // The persisted rows for the re-audited findings are now resolved.
    for (const [rule, url] of [
      ['DISC-05-INTERNAL-LINK-UNREACHABLE', `${siteA.origin}${siteA.paths.alpha}`],
      ['DISC-05-NO-AUDITED-INBOUND-LINK', `${siteA.origin}${siteA.paths.orphan}`],
      ['DISC-05-INDEXABILITY-CONTRADICTION', `${siteA.origin}${siteA.paths.noindex}`],
    ] as const) {
      const row = await issueRow(siteA.siteId, `disc-05:${rule}:${url}`)
      expect(row?.status, `${rule} row resolved`).toBe('resolved')
    }

    // The redirect row is different by design: the old address keeps
    // redirecting to the new one (that is its job), so a re-audit of the
    // canonical set can never clear it. The operator confirms the move —
    // old address redirects, new canonical serves 200 in the audit
    // above — and closes the row in the Quality Center.
    const redirectRow = await issueRow(
      siteA.siteId,
      `disc-05:DISC-05-REDIRECT:${siteA.origin}${siteA.paths.legacy}`,
    )
    expect(redirectRow?.status).toBe('open')
    await payload.update({
      collection: 'quality-issues',
      id: redirectRow.id,
      data: { status: 'resolved' },
      overrideAccess: true,
    } as never)
    const closedRow = await issueRow(
      siteA.siteId,
      `disc-05:DISC-05-REDIRECT:${siteA.origin}${siteA.paths.legacy}`,
    )
    expect(closedRow?.status).toBe('resolved')
  })

  it('5. site B detects independently and its lifecycle never touches site A', async () => {
    const paths = [
      await canonicalUrl(siteB, 'hub'),
      await canonicalUrl(siteB, 'alpha'),
      await canonicalUrl(siteB, 'orphan'),
      await canonicalUrl(siteB, 'noindex'),
      await canonicalUrl(siteB, 'schemagap'),
    ]
    const { audit } = await runSiteAudit(siteB, paths)
    const alphaUrl = await canonicalUrl(siteB, 'alpha')
    const orphanUrl = await canonicalUrl(siteB, 'orphan')
    expect(ruleIdsFor(audit, alphaUrl)).toContain('DISC-05-INTERNAL-LINK-UNREACHABLE')
    expect(ruleIdsFor(audit, orphanUrl)).toContain('DISC-05-NO-AUDITED-INBOUND-LINK')
    const rowB = await issueRow(
      siteB.siteId,
      `disc-05:DISC-05-INTERNAL-LINK-UNREACHABLE:${alphaUrl}`,
    )
    expect(rowB?.status).toBe('open')

    // Site A's resolved rows are untouched by site B's audit.
    const rowA = await issueRow(
      siteA.siteId,
      `disc-05:DISC-05-INTERNAL-LINK-UNREACHABLE:${siteA.origin}${siteA.paths.alpha}`,
    )
    expect(rowA?.status).toBe('resolved')
  })
})
