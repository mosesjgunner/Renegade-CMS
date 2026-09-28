/**
 * Renegade CMoS Content Intelligence - Google Search Console & Analytics Integration Contracts
 *
 * Site-scoped Google Search Console integration, performance ingestion, URL reconciliation,
 * first-party analytics combination, evidence-backed opportunities, and recommendation tracking.
 */

export type SearchConsoleAuthType = 'service_account' | 'oauth' | 'api_key'

export type SearchConsoleSyncStatus =
  | 'disconnected'
  | 'connected'
  | 'syncing'
  | 'rate_limited'
  | 'error'

export type DataFreshnessTier = 'realtime' | 'daily' | 'delayed_search_console' | 'stale'

export type SiteSearchConsoleConnection = {
  siteId: string
  propertyUrl: string
  authType: SearchConsoleAuthType
  credentialMasked: string
  status: SearchConsoleSyncStatus
  connectedAt: string
  lastSyncAt: string | null
  lastError: string | null
  syncWindowDays: number
  retainedDataPolicy: 'retain_on_disconnect' | 'purge_on_disconnect'
  rateLimitDetails?: {
    lastRateLimitedAt?: string
    retryAfterMs?: number
    backoffCount: number
  }
}

export type SearchConsolePerformanceRecord = {
  id: string
  siteId: string
  date: string // YYYY-MM-DD
  pageUrl: string
  query: string
  clicks: number
  impressions: number
  ctr: number // 0.0 - 1.0
  position: number // 1.0 - 100.0+
  device?: 'desktop' | 'mobile' | 'tablet'
  country?: string
}

export type SearchConsoleIngestOptions = {
  startDate: string
  endDate: string
  rowLimit?: number
  startRow?: number
  dimensions?: Array<'date' | 'page' | 'query' | 'device' | 'country'>
  backfill?: boolean
}

export type SearchConsoleSyncProgress = {
  siteId: string
  status: SearchConsoleSyncStatus
  startedAt: string
  completedAt?: string
  totalRowsIngested: number
  pagesProcessed: number
  rateLimitDelaysMs: number
  error?: string
}

// -------------------------------------------------------------------------------------------------
// URL RECONCILIATION
// -------------------------------------------------------------------------------------------------

export type ReconciledUrlMapping = {
  reportedUrl: string
  canonicalContentId: string | null
  canonicalPath: string
  isRedirect: boolean
  redirectChain: string[]
  historicalSlugs: string[]
  statusCode?: string
}

export type ReconciledPagePerformance = {
  canonicalContentId?: string | null
  canonicalPath: string
  title: string
  aggregatedMetrics: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  sourceUrls: Array<{
    reportedUrl: string
    clicks: number
    impressions: number
    isHistorical: boolean
  }>
  trendContinuityPreserved: boolean
  timeRange: { start: string; end: string }
  freshness: string
}

// -------------------------------------------------------------------------------------------------
// COMBINED ANALYTICS
// -------------------------------------------------------------------------------------------------

export type SearchConsoleMetricsSummary = {
  clicks: number
  impressions: number
  ctr: number
  position: number
  timeRange: { start: string; end: string }
  freshness: string
  definition: string
}

export type FirstPartyMetricsSummary = {
  pageviews: number
  uniqueVisitors: number
  bounceRate: number
  avgTimeOnPageSec: number
  conversions: number
  timeRange: { start: string; end: string }
  freshness: string
  definition: string
}

export type CombinedPageAnalytics = {
  canonicalPath: string
  title: string
  contentId?: string
  searchConsole: SearchConsoleMetricsSummary | null
  firstPartyAnalytics: FirstPartyMetricsSummary | null
  dataSufficiency: 'sufficient' | 'partial' | 'sparse'
  notes: string
}

// -------------------------------------------------------------------------------------------------
// EVIDENCE-BACKED OPPORTUNITIES
// -------------------------------------------------------------------------------------------------

export type OpportunityType =
  | 'high_impression_low_ctr'
  | 'declining_page'
  | 'emerging_query'
  | 'weak_coverage_query'

export type SearchConsoleOpportunity = {
  id: string
  siteId: string
  type: OpportunityType
  title: string
  canonicalPath: string
  contentId?: string
  query?: string
  metrics: {
    currentImpressions: number
    currentClicks: number
    currentCtr: number
    currentPosition: number
    benchmarkCtr?: number
    previousClicks?: number
    previousImpressions?: number
    changePercent?: number
  }
  minimumThresholdMet: boolean
  sampleSizeExplanation: string
  uncertaintyExplanation: string
  confidence: 'high' | 'medium' | 'low'
  suggestedAction: string
  createdAt: string
}

// -------------------------------------------------------------------------------------------------
// RECOMMENDATION LIFECYCLE & MEASUREMENT
// -------------------------------------------------------------------------------------------------

export type RecommendationStatus =
  | 'baseline'
  | 'proposed'
  | 'approved'
  | 'implemented'
  | 'measuring'
  | 'evaluated'

export type ConfoundingChange = {
  id: string
  date: string
  description: string
  category: 'core_algorithm_update' | 'site_redesign' | 'tracking_change' | 'seasonality' | 'other'
}

export type TrackedRecommendationMetrics = {
  clicks: number
  impressions: number
  ctr: number
  position: number
  conversions?: number
}

export type TrackedRecommendation = {
  id: string
  siteId: string
  opportunityId?: string
  contentId: string
  canonicalPath: string
  title: string
  interventionType:
    | 'title_optimization'
    | 'content_expansion'
    | 'internal_linking'
    | 'schema_addition'
    | 'custom'
  status: RecommendationStatus
  baselineWindow: {
    start: string
    end: string
    metrics: TrackedRecommendationMetrics
  }
  interventionDate: string | null
  implementedBy: string | null
  confoundingChanges: ConfoundingChange[]
  postInterventionWindow?: {
    start: string
    end: string
    metrics: TrackedRecommendationMetrics
  }
  measurementResult?: {
    clickDeltaPercent: number
    impressionDeltaPercent: number
    ctrDeltaPercent: number
    positionDelta: number
    reportStatement: string // Framed as association, not proof of causation
  }
  history: Array<{
    status: RecommendationStatus
    changedAt: string
    changedBy: string
    notes?: string
  }>
  createdAt: string
  updatedAt: string
}
