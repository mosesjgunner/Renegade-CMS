/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SEO 1.0 regression suite (RC3-SEO-1.0-FINAL §9).
 *
 * Durable proofs for the 1.0 technical SEO contract, against the real
 * database and the real route handlers:
 *  - F2: body-derived description fallback and explicit-override precedence.
 *  - F3: site verification tokens reach the homepage document/metadata only.
 *  - F4: a loopback canonical origin raises DISC-RULE-10-CANONICAL-ORIGIN.
 *  - DEBT-14: rendered-audit scope accounting, split-origin fetching with
 *    canonical-space results, and the reconciliation invariant — an open
 *    finding resolves only when its URL was re-examined in that run.
 *  - Sitemap output carries canonical-origin URLs for the resolved site.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { seed } from '../../src/scripts/seed'
import { fixtureRichText } from '../helpers/fixture-rich-text'
import {
  auditDiscoveryDocument,
  discoveryToMetadata,
  resolveDiscoveryDocument,
} from '../../src/modules/public/discovery'
import { runRenderedAudit } from '../../src/modules/public/discovery-audit'
import { persistRenderedAuditLifecycle } from '../../src/modules/public/discovery-lifecycle'
import { GET as getSitemapPage } from '../../src/app/(frontend)/sitemaps/[page]/route'

const SUITE_ORIGIN = 'https://seo10-suite.test'

let payload: Payload
let siteId: string
let publicationId: string
let suffix: string
let originalGlobal: Record<string, unknown> = {}

function hostRequest(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set('host', new URL(url).host)
  return new Request(url, { ...init, headers })
}

const mkArticle = async (data: Record<string, unknown>) =>
  (payload as any).create({
    collection: 'content',
    data: {
      site: siteId,
      publication: publicationId,
      contentType: 'article',
      status: 'published',
      visibility: 'public',
      publishedAt: new Date().toISOString(),
      commentsPolicy: 'closed',
      retentionMode: 'permanent',
      removeFromDiscovery: false,
      publicChangeHistoryPolicy: 'summary',
      ...data,
    },
    overrideAccess: true,
  })

const mkOpenIssue = async (targetId: string, key: string) =>
  (payload as any).create({
    collection: 'quality-issues',
    data: {
      site: siteId,
      targetType: 'rendered_audit',
      targetId,
      dedupeKey: `disc-05:${key}:${targetId}`,
      severity: 'warning',
      status: 'open',
      workflowState: 'new',
      category: 'seo',
      message: `Seeded by the SEO 1.0 regression suite (${key}).`,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })

const issueStatus = async (id: string) =>
  (
    (await (payload as any).findByID({
      collection: 'quality-issues',
      id,
      depth: 0,
      overrideAccess: true,
    })) as any
  ).status

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
  publicationId = String(pub.id)
  siteId = typeof pub.site === 'string' ? pub.site : String(pub.site?.id ?? '')
  suffix = randomUUID().slice(0, 8)

  const global = (await (payload as any).findGlobal({
    slug: 'site-settings',
    depth: 0,
    overrideAccess: true,
  })) as Record<string, unknown>
  originalGlobal = {
    canonicalOrigin: global.canonicalOrigin,
    canonicalOriginsBySite: global.canonicalOriginsBySite,
    siteVerification: global.siteVerification,
  }
  await (payload as any).updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: SUITE_ORIGIN,
      canonicalOriginsBySite: { [siteId]: SUITE_ORIGIN },
    },
    overrideAccess: true,
  })
})

afterAll(async () => {
  await (payload as any).updateGlobal({
    slug: 'site-settings',
    data: {
      canonicalOrigin: originalGlobal.canonicalOrigin ?? null,
      canonicalOriginsBySite: originalGlobal.canonicalOriginsBySite ?? {},
      siteVerification: originalGlobal.siteVerification ?? {},
    },
    overrideAccess: true,
  })
  await payload?.db?.destroy?.()
})

describe('SEO 1.0 regression suite', () => {
  it('F2: a body-only article derives its description; an explicit one wins', async () => {
    const bodyText =
      'Ledger clerks in the northern depot logged every crate twice, once for the railway and once for the river office, so a missing seal could be traced to the exact platform where the chain of custody broke.'
    const bodyOnly = await mkArticle({
      title: `Suite Body Only ${suffix}`,
      slug: `suite-body-${suffix}`,
      canonicalPath: `/articles/suite-body-${suffix}`,
      body: fixtureRichText(bodyText),
    })
    const derived = await resolveDiscoveryDocument(payload, {
      collection: 'content',
      id: String(bodyOnly.id),
    })
    expect(derived.description.source).toBe('content_derived')
    expect(derived.description.value).toContain('Ledger clerks in the northern depot')
    expect(derived.description.value?.length ?? 0).toBeLessThanOrEqual(171)

    const explicit = await mkArticle({
      title: `Suite Explicit ${suffix}`,
      slug: `suite-explicit-${suffix}`,
      canonicalPath: `/articles/suite-explicit-${suffix}`,
      body: fixtureRichText(bodyText),
      seoDescription: `Explicit suite description ${suffix}.`,
    })
    const explicitDoc = await resolveDiscoveryDocument(payload, {
      collection: 'content',
      id: String(explicit.id),
    })
    expect(explicitDoc.description.source).toBe('explicit_override')
    expect(explicitDoc.description.value).toBe(`Explicit suite description ${suffix}.`)
  })

  it('F3: verification tokens land on the homepage document and metadata only', async () => {
    await (payload as any).updateGlobal({
      slug: 'site-settings',
      data: { siteVerification: { google: 'SuiteToken7', bing: 'BingToken9' } },
      overrideAccess: true,
    })
    const home = await resolveDiscoveryDocument(payload, { path: '/', siteId })
    expect(home.verification?.google).toBe('SuiteToken7')
    const metadata = discoveryToMetadata(home) as any
    expect(metadata.verification?.google).toBe('SuiteToken7')
    expect(metadata.verification?.other?.['msvalidate.01']).toBe('BingToken9')

    const article = await mkArticle({
      title: `Suite Verify Scope ${suffix}`,
      slug: `suite-verify-${suffix}`,
      canonicalPath: `/articles/suite-verify-${suffix}`,
      body: fixtureRichText('Verification scope article body.'),
    })
    const articleDoc = await resolveDiscoveryDocument(payload, {
      collection: 'content',
      id: String(article.id),
    })
    expect(articleDoc.verification).toBeUndefined()
    await (payload as any).updateGlobal({
      slug: 'site-settings',
      data: { siteVerification: {} },
      overrideAccess: true,
    })
  })

  it('F4: a loopback canonical origin raises DISC-RULE-10', async () => {
    const article = await mkArticle({
      title: `Suite Origin ${suffix}`,
      slug: `suite-origin-${suffix}`,
      canonicalPath: `/articles/suite-origin-${suffix}`,
      body: fixtureRichText('Origin rule article body.'),
    })
    const doc = await resolveDiscoveryDocument(payload, {
      collection: 'content',
      id: String(article.id),
    })
    expect(doc.issues.map((i) => i.ruleId)).not.toContain('DISC-RULE-10-CANONICAL-ORIGIN')
    const loopbackDoc = {
      ...doc,
      canonicalUrl: 'http://localhost:3000/articles/suite-origin',
      publicUrl: 'http://localhost:3000/articles/suite-origin',
    }
    const issues = auditDiscoveryDocument(loopbackDoc as never)
    expect(issues.map((i) => i.ruleId)).toContain('DISC-RULE-10-CANONICAL-ORIGIN')
  })

  it('DEBT-14: split-origin audit examines pages and reports canonical-space results', async () => {
    const html =
      '<html><head><title>Suite Page</title><link rel="canonical" href="https://seo10-suite.test/articles/suite-audit"></head><body><h1>Suite</h1></body></html>'
    const audit = await runRenderedAudit({
      origin: SUITE_ORIGIN,
      fetchBase: 'http://127.0.0.1:9',
      siteHost: 'seo10-suite.test',
      // Mirrors the audit route's allowConfiguredSelfAudit decision for a
      // configured self-audit origin; without it the SSRF guard correctly
      // refuses the private fetch base and the scope is empty.
      allowPrivate: true,
      paths: ['/articles/suite-audit'],
      fetcher: async () => new Response(html, { status: 200 }),
    } as never)
    expect(audit.scope.state).toBe('complete')
    expect(audit.scope.examined).toBe(1)
    expect(audit.pages[0]?.url).toBe(`${SUITE_ORIGIN}/articles/suite-audit`)
    expect(audit.pages[0]?.finalUrl.startsWith(SUITE_ORIGIN)).toBe(true)
    expect(JSON.stringify(audit.pages)).not.toContain('127.0.0.1')
  })

  it('DEBT-14: an empty-scope run is persisted incomplete and resolves nothing', async () => {
    const target = `${SUITE_ORIGIN}/articles/never-examined-${suffix}`
    const seeded = await mkOpenIssue(target, 'SEO10-SUITE-EMPTY')
    const summary = await persistRenderedAuditLifecycle(payload, siteId, [], {
      state: 'empty',
      eligible: 1,
      examined: 0,
      examinedUrls: [],
      complete: false,
    })
    expect(summary.resolved).toBe(0)
    expect(summary.unverified).toBeGreaterThanOrEqual(1)
    const scan = (await (payload as any).findByID({
      collection: 'quality-scans',
      id: summary.scanId,
      depth: 0,
      overrideAccess: true,
    })) as any
    expect(scan.status).toBe('incomplete')
    expect(await issueStatus(seeded.id)).toBe('open')
  })

  it('DEBT-14: a complete run resolves only the findings it re-examined', async () => {
    const examinedTarget = `${SUITE_ORIGIN}/articles/re-examined-${suffix}`
    const otherTarget = `${SUITE_ORIGIN}/articles/not-re-examined-${suffix}`
    const examinedIssue = await mkOpenIssue(examinedTarget, 'SEO10-SUITE-DONE')
    const otherIssue = await mkOpenIssue(otherTarget, 'SEO10-SUITE-LEFT')
    const summary = await persistRenderedAuditLifecycle(payload, siteId, [], {
      state: 'complete',
      eligible: 1,
      examined: 1,
      examinedUrls: [examinedTarget],
      complete: true,
    })
    expect(summary.resolved).toBeGreaterThanOrEqual(1)
    expect(await issueStatus(examinedIssue.id)).toBe('resolved')
    expect(await issueStatus(otherIssue.id)).toBe('open')
  })

  it('sitemap child carries canonical-origin URLs for the resolved site', async () => {
    const req = hostRequest('http://localhost:3110/sitemaps/1.xml')
    const res = await getSitemapPage(req, { params: Promise.resolve({ page: '1.xml' }) })
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain(SUITE_ORIGIN)
    expect(xml).not.toContain('localhost:3110/articles')
  })
})
