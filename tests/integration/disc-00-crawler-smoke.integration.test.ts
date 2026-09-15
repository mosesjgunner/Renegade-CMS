/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import {
  getAllSearchDocuments,
  queryLocalSearch,
  resolveDiscoveryDocument,
  discoveryToMetadata,
  discoveryToJsonLd,
} from '../../src/modules/public/discovery'
import sitemap from '../../src/app/(frontend)/sitemap'
import robots from '../../src/app/robots'
import { GET as getFeed } from '../../src/app/(frontend)/feed.xml/route'

let payload: Payload
let siteId: string
let publicationId: string
let publishedArticleSlug: string
let draftArticleSlug: string
let pageLayoutPath: string
let suffix: string

beforeAll(async () => {
  payload = await getPayload({ config })
  await seed(payload)

  const pub = (
    await payload.find({
      collection: 'publications',
      where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
  ).docs[0] as any
  expect(pub).toBeTruthy()
  publicationId = String(pub.id)
  siteId = typeof pub.site === 'string' ? pub.site : String(pub.site?.id ?? '')

  suffix = randomUUID().slice(0, 8)
  publishedArticleSlug = `test-article-${suffix}`
  draftArticleSlug = `draft-article-${suffix}`
  pageLayoutPath = `/test-layout-${suffix}`

  // 1. Create a published test article
  await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'article',
      title: `Published Article ${suffix}`,
      slug: publishedArticleSlug,
      canonicalPath: `/articles/${publishedArticleSlug}`,
      summary: `Summary of published article ${suffix}`,
      status: 'published',
      visibility: 'public',
      publishedAt: new Date().toISOString(),
      commentsPolicy: 'closed',
      retentionMode: 'permanent',
      removeFromDiscovery: false,
      publicChangeHistoryPolicy: 'summary',
      seoTitle: `SEO Title for ${suffix}`,
      seoDescription: `SEO Description for ${suffix}`,
    },
    overrideAccess: true,
  } as never)

  // 2. Create a draft test article
  await payload.create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'article',
      title: `Draft Article ${suffix}`,
      slug: draftArticleSlug,
      canonicalPath: `/articles/${draftArticleSlug}`,
      summary: `Summary of draft article ${suffix}`,
      status: 'draft',
      visibility: 'public',
      commentsPolicy: 'closed',
      retentionMode: 'permanent',
      removeFromDiscovery: false,
      publicChangeHistoryPolicy: 'summary',
    },
    overrideAccess: true,
  } as never)

  // 3. Create a page layout
  await payload.create({
    collection: 'page-layouts',
    data: {
      site: siteId,
      name: `Layout Page ${suffix}`,
      path: pageLayoutPath,
      status: 'published',
      visibility: 'public',
      regions: [],
      seoTitle: `SEO Layout ${suffix}`,
      seoDescription: `Description for layout ${suffix}`,
    },
    overrideAccess: true,
  } as never)

  // 4. Create a redirect rule
  await payload.create({
    collection: 'public-redirects',
    data: {
      site: siteId,
      fromPath: `/legacy-${suffix}`,
      toPath: `/articles/${publishedArticleSlug}`,
      match: 'exact',
      statusCode: '308',
      preserveQuery: true,
      enabled: true,
    },
    overrideAccess: true,
  } as never)
})

afterAll(async () => {
  await payload?.db?.destroy?.()
})

describe('DISC-00 Crawler-Facing Smoke Test Suite', { timeout: 30000 }, () => {
  it('resolves raw HTML metadata with cross-output consistency', async () => {
    // A. Home page
    const homeDoc = await resolveDiscoveryDocument(payload, { path: '/' })
    const homeMeta = discoveryToMetadata(homeDoc)
    expect(homeDoc.contentType).toBe('home')
    expect(homeDoc.indexability.indexable).toBe(true)
    expect(homeDoc.indexability.reason).toBe('canonical')
    expect(homeMeta.robots).toEqual({ index: true, follow: true })
    expect(homeMeta.alternates?.canonical).toBe(homeDoc.canonicalUrl)

    // B. Published article
    const articleDoc = await resolveDiscoveryDocument(payload, {
      path: `/articles/${publishedArticleSlug}`,
      collection: 'content',
      slug: publishedArticleSlug,
    })
    const articleMeta = discoveryToMetadata(articleDoc)
    expect(articleDoc.contentType).toBe('article')
    expect(articleDoc.indexability.indexable).toBe(true)
    expect(articleDoc.indexability.reason).toBe('canonical')
    expect(articleDoc.title.source).toBe('explicit_override')
    expect(articleDoc.title.value).toContain('SEO Title')
    expect(articleMeta.title).toBe(articleDoc.title.value)
    expect(articleMeta.robots).toEqual({ index: true, follow: true })

    // C. Draft article - must be isolated from index
    const draftDoc = await resolveDiscoveryDocument(payload, {
      path: `/articles/${draftArticleSlug}`,
      collection: 'content',
      slug: draftArticleSlug,
    })
    const draftMeta = discoveryToMetadata(draftDoc)
    expect(draftDoc.indexability.indexable).toBe(false)
    expect(draftDoc.indexability.reason).toBe('draft')
    expect(draftMeta.robots).toEqual({ index: false, follow: false })

    // D. Page Layout
    const layoutDoc = await resolveDiscoveryDocument(payload, { path: pageLayoutPath })
    const layoutMeta = discoveryToMetadata(layoutDoc)
    expect(layoutDoc.contentType).toBe('page')
    expect(layoutDoc.indexability.indexable).toBe(true)
    expect(layoutMeta.title).toContain('Layout Page')
    expect(layoutMeta.robots).toEqual({ index: true, follow: true })

    // E. Search page - noindex to protect crawl budget
    const searchDoc = await resolveDiscoveryDocument(payload, { path: '/search' })
    const searchMeta = discoveryToMetadata(searchDoc)
    expect(searchDoc.contentType).toBe('search')
    expect(searchDoc.indexability.indexable).toBe(false)
    expect(searchMeta.robots).toEqual({ index: false, follow: true })

    // F. 404 page - noindex / nofollow
    const notFoundDoc = await resolveDiscoveryDocument(payload, { path: '/non-existent-page-xyz' })
    const notFoundMeta = discoveryToMetadata(notFoundDoc)
    expect(notFoundDoc.contentType).toBe('404')
    expect(notFoundDoc.indexability.indexable).toBe(false)
    expect(notFoundDoc.indexability.reason).toBe('not_found')
    expect(notFoundMeta.robots).toEqual({ index: false, follow: false })
  })

  it('emits deterministic JSON-LD schema across public surfaces', async () => {
    // Home: WebSite and Organization
    const homeDoc = await resolveDiscoveryDocument(payload, { path: '/' })
    const homeJsonLd = discoveryToJsonLd(homeDoc) as Record<string, unknown>
    expect(homeJsonLd['@context']).toBe('https://schema.org')
    const homeGraph = homeJsonLd['@graph'] as Array<Record<string, unknown>>
    expect(homeGraph.some((node) => node['@type'] === 'WebSite')).toBe(true)
    expect(homeGraph.some((node) => node['@type'] === 'Organization')).toBe(true)

    // Published Article: Article
    const articleDoc = await resolveDiscoveryDocument(payload, {
      path: `/articles/${publishedArticleSlug}`,
    })
    const articleJsonLd = discoveryToJsonLd(articleDoc) as Record<string, unknown>
    expect(articleJsonLd['@context']).toBe('https://schema.org')
    const articleGraph = articleJsonLd['@graph'] as Array<Record<string, unknown>>
    expect(articleGraph.some((node) => node['@type'] === 'Article')).toBe(true)

    // Layout: WebPage
    const layoutDoc = await resolveDiscoveryDocument(payload, { path: pageLayoutPath })
    const layoutJsonLd = discoveryToJsonLd(layoutDoc) as Record<string, unknown>
    expect(layoutJsonLd['@context']).toBe('https://schema.org')
    expect(layoutJsonLd['@type']).toBe('WebPage')

    // Search: SearchResultsPage
    const searchDoc = await resolveDiscoveryDocument(payload, { path: '/search' })
    const searchJsonLd = discoveryToJsonLd(searchDoc) as Record<string, unknown>
    expect(searchJsonLd['@context']).toBe('https://schema.org')
    expect(searchJsonLd['@type']).toBe('SearchResultsPage')
  })

  it('generates a clean sitemap containing only indexable canonical URLs', async () => {
    const sitemapEntries = await sitemap()
    expect(Array.isArray(sitemapEntries)).toBe(true)
    expect(sitemapEntries.length).toBeGreaterThan(0)

    const urls = sitemapEntries.map((e) => e.url)

    // Must contain published article
    expect(urls.some((url) => url.includes(publishedArticleSlug))).toBe(true)

    // Must contain layout page
    expect(urls.some((url) => url.includes(pageLayoutPath))).toBe(true)

    // Must NOT contain draft article
    expect(urls.some((url) => url.includes(draftArticleSlug))).toBe(false)

    // Must NOT contain search or 404
    expect(urls.some((url) => url.endsWith('/search'))).toBe(false)
    expect(urls.some((url) => url.includes('non-existent'))).toBe(false)
  })

  it('emits robots.txt rules protecting administrative and builder routes', async () => {
    const robotsRules = await robots()
    expect(robotsRules.rules).toBeDefined()
    const rule = Array.isArray(robotsRules.rules) ? robotsRules.rules[0] : robotsRules.rules
    expect(rule.disallow).toContain('/admin')
    expect(rule.disallow).toContain('/builder')
    expect(rule.disallow).toContain('/api')
    expect(robotsRules.sitemap).toContain('/sitemap.xml')
  })

  it('serves canonical RSS 2.0 feed with caching and conditional GET support', async () => {
    const request1 = new Request('http://localhost:3000/feed.xml')
    const response1 = await getFeed(request1)
    expect(response1.status).toBe(200)
    expect(response1.headers.get('content-type')).toContain('application/rss+xml')

    const etag = response1.headers.get('etag')
    expect(etag).toBeTruthy()

    const bodyText = await response1.text()
    expect(bodyText).toContain('<rss version="2.0"')
    expect(bodyText).toContain(publishedArticleSlug)
    // Draft article must not be in the RSS feed
    expect(bodyText).not.toContain(draftArticleSlug)

    // Test conditional GET with matching ETag
    const request2 = new Request('http://localhost:3000/feed.xml', {
      headers: { 'if-none-match': etag! },
    })
    const response2 = await getFeed(request2)
    expect(response2.status).toBe(304)
  })

  it('indexes published articles into search projections and excludes drafts', async () => {
    const searchDocs = await getAllSearchDocuments(payload)
    expect(searchDocs.some((doc) => doc.path.includes(publishedArticleSlug))).toBe(true)
    expect(searchDocs.some((doc) => doc.path.includes(draftArticleSlug))).toBe(false)

    const searchResult = queryLocalSearch({
      documents: searchDocs,
      query: suffix,
    })
    expect(searchResult.total).toBeGreaterThanOrEqual(1)
    expect(searchResult.hits[0].path).toContain(publishedArticleSlug)
  })

  it('resolves public redirects to destination and marks non-indexable', async () => {
    const redirectDoc = await resolveDiscoveryDocument(payload, {
      path: `/legacy-${publishedArticleSlug.replace('test-article-', '')}`,
    })
    expect(redirectDoc.redirect.isRedirect).toBe(true)
    expect(redirectDoc.redirect.statusCode).toBe(308)
    expect(redirectDoc.redirect.targetUrl).toContain(publishedArticleSlug)
    expect(redirectDoc.indexability.indexable).toBe(false)
    expect(redirectDoc.indexability.reason).toBe('redirect')
  })
})
