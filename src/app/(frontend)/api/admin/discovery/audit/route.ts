import config from '@payload-config'
import { getPayload } from 'payload'

import { resolveSiteSettings } from '@/modules/core/site-settings'
import { runRenderedAudit } from '@/modules/public/discovery-audit'
import { getAllIndexableDiscoveryDocuments } from '@/modules/public/discovery'
import { crossCheckDiscoveryOutputs } from '@/modules/public/discovery-cross-checks'
import { analyzeCannibalization } from '@/modules/public/cannibalization'
import { generateSeoAiSuggestions } from '@/modules/public/ai-boundary-suggestions'
import { persistRenderedAuditLifecycle } from '@/modules/public/discovery-lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Staff-only: targets are derived from canonical published documents, never request URLs. */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role)))
    return Response.json({ error: 'Staff access required.' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as {
    siteId?: unknown
    concurrency?: unknown
    robotsTxt?: unknown
  }

  const sites = await payload.find({
    collection: 'sites',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const defaultSiteId = sites.docs[0]?.id ? String(sites.docs[0].id) : 'default-site'

  const siteId = typeof body.siteId === 'string' ? body.siteId : defaultSiteId
  const settings = await resolveSiteSettings(payload)
  const origin = (siteId && settings.canonicalOriginsBySite[siteId]) || settings.canonicalOrigin

  try {
    const documents = await getAllIndexableDiscoveryDocuments(payload, siteId)
    const audit = await runRenderedAudit({
      origin,
      paths: documents.map((document) => document.canonicalUrl),
      concurrency:
        typeof body.concurrency === 'number' && Number.isInteger(body.concurrency)
          ? body.concurrency
          : 4,
      allowPrivate: false,
    })

    // 1. Sitemap & Feed Cross-checks
    const sitemapEntries = documents.map((doc) => ({
      url: doc.canonicalUrl,
      lastmod: doc.dates.modifiedAt || doc.dates.publishedAt || undefined,
    }))
    const feedItems = documents.map((doc) => ({
      url: doc.canonicalUrl,
      title: doc.title.value,
    }))
    const robotsTxt =
      typeof body.robotsTxt === 'string'
        ? body.robotsTxt
        : `User-agent: *\nDisallow: /admin\nSitemap: ${origin}/sitemap.xml`

    const crossChecks = crossCheckDiscoveryOutputs({
      origin,
      pages: audit.pages,
      sitemapEntries,
      feedItems,
      robotsTxt,
    })

    // 2. Lexical Similarity & Cannibalization Analysis
    const cannibalization = analyzeCannibalization(audit.pages)

    // Combine all issues
    const allIssues = [...audit.issues, ...crossChecks.issues, ...cannibalization.issues]

    // 3. AI Boundary Suggestions
    const aiSuggestions = generateSeoAiSuggestions(audit.pages, allIssues)

    // 4. Persist Findings & Lifecycle Tracking
    const lifecycle = await persistRenderedAuditLifecycle(payload, siteId, allIssues)

    return Response.json(
      {
        ...audit,
        issues: allIssues,
        crossChecks,
        cannibalization,
        aiSuggestions,
        lifecycle,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Rendered audit failed.' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
