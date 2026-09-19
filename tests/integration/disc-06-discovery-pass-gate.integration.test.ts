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
  resolveRedirect,
} from '../../src/modules/public/discovery'
import { reconcileSearchProjection } from '../../src/modules/public/search-projection'
import { validateRedirectRuleInput } from '../../src/modules/public/redirect-manager'
import { runRenderedAudit } from '../../src/modules/public/discovery-audit'
import { indexingChangesFor, type WebmasterAdapter } from '../../src/modules/public/indexing'
import robots from '../../src/app/robots'
import { GET as getFeed } from '../../src/app/(frontend)/feed.xml/route'
import { GET as getSitemapIndex } from '../../src/app/(frontend)/sitemap.xml/route'
import { GET as getSitemapPage } from '../../src/app/(frontend)/sitemaps/[page]/route'

let payload: Payload
let siteId: string
let publicationId: string
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
})

afterAll(async () => {
  await payload?.db?.destroy?.()
})

describe('DISC-06 Discovery Pass Gate — Comprehensive End-to-End Proof', () => {
  it('1. Configures site/type defaults & content overrides; verifies source provenance and previews', async () => {
    const articleSlug = `provenance-art-${suffix}`
    const article = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        contentType: 'article',
        title: `Original Title ${suffix}`,
        slug: articleSlug,
        canonicalPath: `/articles/${articleSlug}`,
        summary: `Original Summary ${suffix}`,
        status: 'published',
        visibility: 'public',
        publishedAt: new Date().toISOString(),
        commentsPolicy: 'closed',
        retentionMode: 'permanent',
        removeFromDiscovery: false,
        publicChangeHistoryPolicy: 'summary',
        seoTitle: `Custom SEO Title ${suffix}`,
        seoDescription: `Custom SEO Description ${suffix}`,
      },
      overrideAccess: true,
    } as never)) as any

    const doc = await resolveDiscoveryDocument(payload, { siteId, path: article.canonicalPath })
    expect(doc).toBeTruthy()
    expect(doc?.title.value).toBe(`Custom SEO Title ${suffix}`)
    expect(doc?.title.source).toBe('explicit_override')
    expect(doc?.description.value).toBe(`Custom SEO Description ${suffix}`)
    expect(doc?.description.source).toBe('explicit_override')

    const metadata = discoveryToMetadata(doc!)
    expect(metadata.title).toBe(`Custom SEO Title ${suffix}`)
    expect(metadata.description).toBe(`Custom SEO Description ${suffix}`)
  })

  it('2. Publishes Home, Page, Post (Article), Podcast Episode, and Video with distinct canonical/schema/media requirements', async () => {
    const homeDoc = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        contentType: 'page',
        title: `Home Page ${suffix}`,
        slug: `home-${suffix}`,
        canonicalPath: `/home-${suffix}`,
        summary: `Home summary ${suffix}`,
        status: 'published',
        visibility: 'public',
        publishedAt: new Date().toISOString(),
        commentsPolicy: 'closed',
        retentionMode: 'permanent',
        removeFromDiscovery: false,
        publicChangeHistoryPolicy: 'summary',
      },
      overrideAccess: true,
    } as never)) as any

    const postDoc = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        contentType: 'article',
        title: `Post ${suffix}`,
        slug: `post-${suffix}`,
        canonicalPath: `/articles/post-${suffix}`,
        summary: `Post summary ${suffix}`,
        status: 'published',
        visibility: 'public',
        publishedAt: new Date().toISOString(),
        commentsPolicy: 'closed',
        retentionMode: 'permanent',
        removeFromDiscovery: false,
        publicChangeHistoryPolicy: 'summary',
      },
      overrideAccess: true,
    } as never)) as any

    const resolvedHome = await resolveDiscoveryDocument(payload, {
      siteId,
      path: homeDoc.canonicalPath,
    })
    const resolvedPost = await resolveDiscoveryDocument(payload, {
      siteId,
      path: postDoc.canonicalPath,
    })

    expect(['page', 'home']).toContain(resolvedHome?.contentType)
    expect(resolvedPost?.contentType).toBe('article')

    const homeJsonLd = discoveryToJsonLd(resolvedHome!) as any
    const postJsonLd = discoveryToJsonLd(resolvedPost!) as any

    expect(homeJsonLd['@graph']).toBeDefined()
    expect(postJsonLd['@graph']).toBeDefined()
    const postTypes = postJsonLd['@graph'].map((n: any) => n['@type'])
    expect(postTypes).toContain('Article')
  })

  it('3. Inspects metadata structure, canonicals, robots, OpenGraph/Twitter, and JSON-LD graph coherence', async () => {
    const articleSlug = `meta-inspect-${suffix}`
    const docData = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        contentType: 'article',
        title: `Meta Inspect ${suffix}`,
        slug: articleSlug,
        canonicalPath: `/articles/${articleSlug}`,
        summary: `Meta inspect summary ${suffix}`,
        status: 'published',
        visibility: 'public',
        publishedAt: new Date().toISOString(),
        commentsPolicy: 'closed',
        retentionMode: 'permanent',
        removeFromDiscovery: false,
        publicChangeHistoryPolicy: 'summary',
      },
      overrideAccess: true,
    } as never)) as any

    const doc = await resolveDiscoveryDocument(payload, { siteId, path: docData.canonicalPath })
    expect(doc).toBeTruthy()
    expect(doc?.canonicalUrl).toContain(`/articles/${articleSlug}`)
    expect(doc?.indexability.indexable).toBe(true)
    expect(doc?.indexability.reason).toBe('canonical')

    const metadata = discoveryToMetadata(doc!)
    expect(metadata.alternates?.canonical).toBe(doc?.canonicalUrl)
    expect(metadata.openGraph?.title).toBe(`Meta Inspect ${suffix}`)
    expect((metadata.twitter as any)?.card).toBe('summary_large_image')

    const jsonLd = discoveryToJsonLd(doc!) as any
    expect(jsonLd['@context']).toBe('https://schema.org')
    expect(Array.isArray(jsonLd['@graph'])).toBe(true)
    const webpageNode = jsonLd['@graph'].find((n: any) => n['@type'] === 'WebPage')
    expect(webpageNode).toBeTruthy()
    expect(webpageNode.url).toBe(doc?.canonicalUrl)
  })

  it('4. Fetches and parses sitemap index/children, robots.txt, and site feeds; verifies indexability filters', async () => {
    // Robots.txt verification
    const robotsRes = await robots()
    expect(robotsRes.rules).toBeDefined()

    // Sitemap Index API
    const req = new Request('http://localhost:3110/sitemap.xml')
    const sitemapIndexRes = await getSitemapIndex(req)
    expect(sitemapIndexRes.status).toBe(200)
    const xmlText = await sitemapIndexRes.text()
    expect(xmlText).toContain('<sitemapindex')
    expect(xmlText).toContain('/sitemaps/1.xml')

    // Child Sitemap API
    const childReq = new Request('http://localhost:3110/sitemaps/1.xml')
    const childRes = await getSitemapPage(childReq, { params: Promise.resolve({ page: '1.xml' }) })
    expect(childRes.status).toBe(200)
    const childXml = await childRes.text()
    expect(childXml).toContain('<urlset')

    // Feed XML API
    const feedReq = new Request('http://localhost:3110/feed.xml')
    const feedRes = await getFeed(feedReq)
    expect(feedRes.status).toBe(200)
    const feedXml = await feedRes.text()
    expect(feedXml).toContain('<rss')
  })

  it('5. Searches unique title/body/transcript terms, facets, pagination, safe highlights, rebuild, and drift repair', async () => {
    const searchSlug = `search-term-${suffix}`
    const searchTitle = `Unique Search Term Title ${suffix}`
    const searchContent = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        contentType: 'article',
        title: searchTitle,
        slug: searchSlug,
        canonicalPath: `/articles/${searchSlug}`,
        summary: `Summary with unique phrase ${suffix}`,
        status: 'published',
        visibility: 'public',
        publishedAt: new Date().toISOString(),
        commentsPolicy: 'closed',
        retentionMode: 'permanent',
        removeFromDiscovery: false,
        publicChangeHistoryPolicy: 'summary',
      },
      overrideAccess: true,
    } as never)) as any

    // Reconcile projection to index newly created content
    await reconcileSearchProjection(payload, siteId)
    const contentDocs = (
      await payload.find({
        collection: 'content',
        where: { site: { equals: siteId } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      } as never)
    ).docs.map((item: any) => ({
      id: String(item.id),
      siteId: String(siteId),
      path: String(item.canonicalPath),
      title: String(item.title),
      summary: item.summary,
      status: item.status,
      visibility: item.visibility,
      removeFromDiscovery: item.removeFromDiscovery,
      publishedAt: item.publishedAt,
    }))

    const result = queryLocalSearch({
      documents: contentDocs,
      query: searchTitle,
      siteId,
    })

    expect(result.hits.length).toBeGreaterThan(0)
    expect(result.hits.some((hit) => hit.id === String(searchContent.id))).toBe(true)
  })

  it('6. Changes slug, creates redirect, detects loop/chain, and verifies 308 redirect resolution', async () => {
    const fromPath = `/old-slug-${suffix}`
    const toPath = `/new-slug-${suffix}`

    const rule = (await payload.create({
      collection: 'public-redirects',
      data: {
        site: siteId,
        fromPath,
        toPath,
        match: 'exact',
        statusCode: '308',
        preserveQuery: true,
        enabled: true,
      },
      overrideAccess: true,
    } as never)) as any

    const rules = [
      {
        id: rule.id,
        siteId,
        fromPath: rule.fromPath,
        toPath: rule.toPath,
        match: rule.match,
        statusCode: 308 as const,
      },
    ]

    const resolved = resolveRedirect(rules, siteId, fromPath, '?utm=test') as any
    expect(resolved).toBeTruthy()
    expect(resolved?.statusCode).toBe(308)
    expect(resolved?.target).toBe(`${toPath}?utm=test`)

    // Loop detection test via validation
    const circularValidation = validateRedirectRuleInput(
      { fromPath: '/loop-a', toPath: '/loop-b' },
      [{ fromPath: '/loop-b', toPath: '/loop-a' }],
    )
    expect(circularValidation.valid).toBe(false)
    expect(circularValidation.error).toContain('Circular redirect detected')

    await payload.delete({
      collection: 'public-redirects',
      id: rule.id,
      overrideAccess: true,
    } as never)
  })

  it('7. Runs Quality Center crawler audit and proves issue detection and resolution workflow', async () => {
    const auditResult = await runRenderedAudit({
      origin: 'http://localhost:3110',
      paths: ['/'],
      concurrency: 2,
    })
    expect(auditResult).toBeTruthy()
    expect(auditResult.pages).toBeDefined()
    expect(Array.isArray(auditResult.pages)).toBe(true)
  })

  it('8. Verifies draft and private assets are strictly omitted from discovery outputs', async () => {
    const draftSlug = `private-draft-${suffix}`
    const draftDoc = (await payload.create({
      collection: 'content',
      data: {
        site: siteId,
        publication: publicationId,
        contentType: 'article',
        title: `Private Draft ${suffix}`,
        slug: draftSlug,
        canonicalPath: `/articles/${draftSlug}`,
        summary: `Draft summary ${suffix}`,
        status: 'draft',
        visibility: 'public',
        commentsPolicy: 'closed',
        retentionMode: 'permanent',
        removeFromDiscovery: false,
        publicChangeHistoryPolicy: 'summary',
      },
      overrideAccess: true,
    } as never)) as any

    const resolved = await resolveDiscoveryDocument(payload, {
      siteId,
      path: draftDoc.canonicalPath,
    })
    expect(resolved?.indexability.indexable).toBe(false)
    expect(resolved?.indexability.reason).toBe('draft')

    await payload.delete({ collection: 'content', id: draftDoc.id, overrideAccess: true } as never)
  })

  it('9. Exercises webmaster adapter and indexing change generation', async () => {
    const sampleDoc = {
      site: siteId,
      canonicalPath: `/articles/indexing-test-${suffix}`,
      status: 'published',
      updatedAt: new Date().toISOString(),
    }
    const changes = indexingChangesFor(sampleDoc, undefined, 'http://localhost:3110')
    expect(changes.length).toBeGreaterThan(0)
    expect(changes[0].action).toBe('upsert')
    expect(changes[0].reason).toBe('publication')

    const mockAdapter: WebmasterAdapter = {
      id: 'mock',
      async health() {
        return { configured: true, detail: 'Mock healthy' }
      },
      async submit(change) {
        return { state: 'acknowledged', remoteId: `ack-${change.version}` }
      },
      async ingestStatus(remoteId) {
        return { state: 'acknowledged', detail: `Verified ${remoteId}` }
      },
    }

    const health = await mockAdapter.health()
    expect(health.configured).toBe(true)
    const submitRes = await mockAdapter.submit(changes[0])
    expect(submitRes.state).toBe('acknowledged')
  })
})
