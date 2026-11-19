import config from '@payload-config'
import { getPayload } from 'payload'

import { resolveSiteSettings } from '@/modules/core/site-settings'
import { runRenderedAudit } from '@/modules/public/discovery-audit'
import { allowConfiguredSelfAudit } from '@/modules/public/local-audit-origin'
import { getAllIndexableDiscoveryDocuments } from '@/modules/public/discovery'
import { crossCheckDiscoveryOutputs } from '@/modules/public/discovery-cross-checks'
import { analyzeCannibalization } from '@/modules/public/cannibalization'
import { generateSeoAiSuggestions } from '@/modules/public/ai-boundary-suggestions'
import { persistRenderedAuditLifecycle } from '@/modules/public/discovery-lifecycle'
import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Staff-only: targets are derived from canonical published documents, never request URLs. */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role)))
    return Response.json({ error: 'Staff access required.' }, { status: 403 })

  // RC2-DEBT-07: audit results persist into the quality module's
  // collections. When that module is not enabled (lean floor), refuse
  // cleanly instead of running an audit whose results cannot be saved.
  if (!payload.collections['quality-scans'])
    return Response.json(
      { error: 'The quality module is not enabled on this install.' },
      { status: 503 },
    )

  const body = (await request.json().catch(() => ({}))) as {
    siteId?: unknown
    concurrency?: unknown
    robotsTxt?: unknown
  }

  const sites = await payload.find({
    collection: 'sites',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user,
  })
  const defaultSiteId = sites.docs[0]?.id ? String(sites.docs[0].id) : null

  const siteId = typeof body.siteId === 'string' ? body.siteId : defaultSiteId
  if (!siteId || !(await checkOperatorSiteAccess(payload, user, siteId)))
    return Response.json({ error: 'Staff site access required.' }, { status: 403 })

  const settings = await resolveSiteSettings(payload)
  const origin = (siteId && settings.canonicalOriginsBySite[siteId]) || settings.canonicalOrigin

  try {
    // DEBT-14: documents stay addressed by their canonical origin; the
    // crawl fetches them from the server-configured app origin (APP_URL)
    // presenting the canonical host, so split-origin, staging, proxy and
    // local topologies audit the real pages instead of silently auditing
    // nothing. This subsumes the old LOCAL_E2E_TEST_MODE origin swap.
    let fetchBase = origin
    if (process.env.APP_URL) {
      try {
        fetchBase = new URL(process.env.APP_URL).origin
      } catch {
        fetchBase = origin
      }
    }
    const siteHost = new URL(origin).host
    const documents = await getAllIndexableDiscoveryDocuments(payload, siteId)
    const audit = await runRenderedAudit({
      origin,
      paths: documents.map((document) => document.canonicalUrl),
      fetchBase,
      siteHost,
      concurrency:
        typeof body.concurrency === 'number' && Number.isInteger(body.concurrency)
          ? body.concurrency
          : 4,
      allowPrivate: allowConfiguredSelfAudit(fetchBase, process.env.APP_URL),
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

    // 4. Persist Findings & Lifecycle Tracking. Only URLs this run
    // actually examined count as re-examination evidence (DEBT-14).
    const examinedUrls = audit.pages.filter((page) => page.status > 0).map((page) => page.url)
    const lifecycle = await persistRenderedAuditLifecycle(
      payload,
      siteId,
      allIssues,
      audit.scope
        ? {
            state: audit.scope.state,
            eligible: audit.scope.eligible,
            examined: audit.scope.examined,
            failed: audit.scope.failed,
            skipped: audit.scope.skipped.length,
            complete: audit.scope.complete,
            examinedUrls,
          }
        : undefined,
    )

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
