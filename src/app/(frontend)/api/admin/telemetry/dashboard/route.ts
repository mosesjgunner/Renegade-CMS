import { loadOperatorReport, reportWindow } from '@/modules/analytics/operator-report'
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { TELEMETRY_METRIC_DEFINITIONS } from '@/modules/analytics/definitions'
import { TELEMETRY_EVENT_INVENTORY } from '@/modules/analytics/inventory'
import { maskSuppressedIdentity, type FirstPartyEvent } from '@/modules/analytics/contracts'
import { analyzeExperiment } from '@/modules/experiences/contracts'
import { getActivePublicExperiment } from '@/modules/experiences/public-experiment'
import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'

const isOperator = (user: { role?: string } | null | undefined) =>
  ['owner', 'administrator', 'staff'].includes(String(user?.role))

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })

  if (!isOperator(auth.user)) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const siteIdParam = url.searchParams.get('siteId')
  const grant = await resolveOperatorGrantContext(payload, auth.user)
  if (
    !grant.authorized ||
    (siteIdParam && !grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteIdParam))
  )
    return NextResponse.json({ error: 'Staff site access required.' }, { status: 403 })
  // 1. Fetch available sites
  const sitesRes = await payload.find({
    collection: 'sites',
    ...(grant.isGlobalOwner ? {} : { where: { id: { in: grant.authorizedSiteIds } } }),
    pagination: false,
    limit: 0,
    depth: 0,
    overrideAccess: true,
  } as never)
  const sites = sitesRes.docs.map((s) => {
    const raw = s as unknown as Record<string, unknown>
    return {
      id: String(s.id),
      name: String(raw.name ?? raw.slug ?? s.id),
    }
  })

  const activeSiteId = siteIdParam || sites[0]?.id
  if (!activeSiteId || !sites.some((site) => site.id === activeSiteId))
    return NextResponse.json({ error: 'Choose an available site.' }, { status: 400 })

  const now = new Date()
  let window
  try {
    window = reportWindow(url.searchParams, now)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
  const startIso = window.start
  const endIso = window.end
  const report = await loadOperatorReport(payload, activeSiteId, window)
  // 3. Query canonical records in parallel
  const [consentRes, suppressionsRes, activeExperiment] = await Promise.all([
    payload.find({
      collection: 'analytics-consent-records',
      where: {
        and: [
          ...(activeSiteId ? [{ site: { equals: activeSiteId } }] : []),
          { occurredAt: { greater_than_equal: startIso } },
          { occurredAt: { less_than: endIso } },
        ],
      },
      pagination: false,
      limit: 0,
      sort: '-occurredAt',
      depth: 0,
      overrideAccess: true,
    } as never),
    payload
      .find({
        collection: 'suppressions',
        where: { site: { equals: activeSiteId } },
        pagination: false,
        limit: 0,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => ({ docs: [], totalDocs: 0 })),
    getActivePublicExperiment(payload, activeSiteId),
  ])

  // Build suppression set for privacy masking
  const suppressionSet = new Set<string>()
  for (const doc of suppressionsRes.docs) {
    const raw = doc as unknown as Record<string, unknown>
    if (typeof raw.emailHash === 'string') suppressionSet.add(raw.emailHash)
  }

  const rawEvents = report.events
  const totalEventsCount = rawEvents.length

  // Map into FirstPartyEvent representation
  const domainEvents: FirstPartyEvent[] = rawEvents.map((r) => ({
    id: String(r.eventId ?? r.id),
    eventType: r.eventType as never,
    occurredAt: String(r.occurredAt),
    receivedAt: String(r.receivedAt ?? r.occurredAt),
    identity: {
      anonymousId: r.anonymousHash ? String(r.anonymousHash) : undefined,
      sessionId: r.sessionHash ? String(r.sessionHash) : undefined,
      memberId: r.member ? String(r.member) : undefined,
    },
    context: (r.context as never) ?? { siteId: activeSiteId },
    consentBasis: (r.consentBasis as never) ?? 'denied',
    schemaVersion: Number(r.schemaVersion ?? 1),
    trusted: Boolean(r.trusted),
    dedupeKey: String(r.dedupeKey ?? ''),
    properties: (r.properties as never) ?? undefined,
  }))

  // 4. Source Freshness & Health
  const lastEvent = [...domainEvents].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0]
  const lastEventReceivedAt = lastEvent ? lastEvent.receivedAt : null
  const freshnessMinutes = lastEventReceivedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(lastEventReceivedAt).getTime()) / 60000))
    : null

  const pipelineStatus: 'healthy' | 'lagging' | 'inactive' =
    freshnessMinutes === null ? 'inactive' : freshnessMinutes <= 15 ? 'healthy' : 'lagging'

  // 5. Consent & Privacy Breakdown
  const consentDocs = consentRes.docs as unknown as Array<Record<string, unknown>>
  let analyticsGrantedCount = 0
  let personalizationGrantedCount = 0
  let marketingGrantedCount = 0
  let withdrawalCount = 0
  const totalConsentRecords = consentDocs.length

  for (const c of consentDocs) {
    if (c.action === 'withdraw') {
      withdrawalCount++
    }
    const categories = c.categories as Record<string, boolean> | undefined
    if (categories?.analytics) analyticsGrantedCount++
    if (categories?.personalization) personalizationGrantedCount++
    if (categories?.marketing) marketingGrantedCount++
  }

  const consentRate =
    totalConsentRecords > 0 ? Math.round((analyticsGrantedCount / totalConsentRecords) * 100) : null

  // 6. Aggregate Metrics
  const pageViews = domainEvents.filter((e) => e.eventType === 'page_view').length
  const uniqueVisitorHashes = new Set(
    domainEvents.map((e) => e.identity.anonymousId).filter(Boolean),
  )
  const uniqueVisitors = uniqueVisitorHashes.size

  // 7. Uncertainty & Missing Data State
  const unconsentedEventsCount = null
  const missingUtmCount = domainEvents.filter(
    (e) => e.eventType === 'page_view' && !e.context.utm?.utm_campaign,
  ).length

  const { financialSummary, campaignFunnels } = report

  // 10. Live Public Experiment Statistical Analysis
  const expExposures = domainEvents.filter(
    (e) =>
      e.eventType === 'experiment_exposure' && e.properties?.experimentId === activeExperiment.id,
  )
  const expConversions = domainEvents.filter(
    (e) =>
      e.eventType === 'experiment_conversion' && e.properties?.experimentId === activeExperiment.id,
  )

  const variantStats = activeExperiment.variants.map((v) => {
    const exposures = expExposures.filter((e) => e.properties?.variantId === v.id).length
    const conversions = expConversions.filter((e) => e.properties?.variantId === v.id).length
    return {
      id: v.id,
      name: v.name,
      isControl: v.isControl,
      allocation: v.allocation,
      registeredComponent: v.registeredComponent,
      headline: v.headline,
      badge: v.badge,
      exposures,
      conversions,
    }
  })

  const statisticalAnalysis = analyzeExperiment(variantStats)

  // 11. Inspectable Source Events (with Privacy Masking & Suppression Protection)
  const inspectableEvents = domainEvents.slice(0, 30).map((e) => {
    const isSuppressed = e.identity.anonymousId ? suppressionSet.has(e.identity.anonymousId) : false
    return {
      id: e.id,
      eventType: e.eventType,
      occurredAt: e.occurredAt,
      consentBasis: e.consentBasis,
      channel: e.context.channel ?? e.context.utm?.utm_medium ?? null,
      campaign: e.context.campaignId ?? e.context.utm?.utm_campaign,
      path: e.context.path,
      // Suppression protection: masked if on suppressions ledger
      anonymousIdMasked: isSuppressed
        ? '[SUPPRESSED VISITOR]'
        : maskSuppressedIdentity(e.identity.anonymousId, suppressionSet).slice(0, 16) + '…',
      reconciledRecord: e.properties?.experimentId
        ? `Experiment: ${e.properties.experimentId}`
        : (e.context.sourceEventId ?? 'First-Party Event'),
      trusted: e.trusted,
    }
  })

  return NextResponse.json({
    activeSiteId,
    sites,
    dateWindow: window,
    domainMetrics: report.domainMetrics,
    sourceStatus: report.sourceStatus,
    sourceFreshnessByCollection: report.sourceFreshnessByCollection,
    reportingDefinitions: report.definitions,
    unattributedConversions: report.unattributedConversions,
    sourceFreshness: {
      lastEventReceivedAt,
      freshnessMinutes,
      status: pipelineStatus,
      rawEventsCount: totalEventsCount,
      sampleTruncated: false,
      countBasis: 'All retained current-consent events in selected window; not total site traffic.',
      deduplicatedCount: null,
      botFilteredCount: null,
    },
    uncertaintyAndMissingData: {
      unconsentedTrafficEstimatePct: null,
      unconsentedEventsCount,
      missingUtmCount,
      disclosureStatement:
        'Unconsented traffic is not collected; its volume and rejected or duplicate request counts are unknown.',
      suppressionExclusionsCount: suppressionSet.size,
    },
    privacyConsent: {
      totalRecords: totalConsentRecords,
      analyticsGrantedCount,
      personalizationGrantedCount,
      marketingGrantedCount,
      withdrawalCount,
      consentRatePct: consentRate,
    },
    coreMetrics: {
      pageViews,
      uniqueVisitors,
      totalEvents: totalEventsCount,
    },
    financialSummary,
    campaignFunnels,
    experiment: {
      definition: activeExperiment,
      variantStats,
      statisticalAnalysis,
      isWinnerApproved: activeExperiment.state === 'winner-selected',
    },
    inspectableEvents,
    metricDictionary: TELEMETRY_METRIC_DEFINITIONS,
    eventInventory: TELEMETRY_EVENT_INVENTORY,
  })
}
