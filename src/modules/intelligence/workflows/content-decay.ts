import type { ContentDecaySignal } from './contracts'

export interface PageDecayInput {
  id: string
  title: string
  canonicalPath: string
  publishedAt: string | null
  updatedAt: string
  metrics?: {
    currentTraffic: number
    previousTraffic: number
    historicalAnnualDataAvailable?: boolean
  }
  context?: {
    recentUrlChange?: boolean
    recentRedirectDate?: string
    isSeasonalTopic?: boolean
    currentSeasonIsOffPeak?: boolean
    trackingHealth?: 'healthy' | 'missing_consent' | 'broken_tracking'
  }
}

/**
 * Diagnoses content decay by rigorously distinguishing genuine search performance drop-offs
 * from seasonality, tracking gaps, and recent URL/redirect changes.
 */
export function diagnoseContentDecay(pages: PageDecayInput[]): ContentDecaySignal[] {
  const signals: ContentDecaySignal[] = []
  const now = Date.now()

  for (const page of pages) {
    const publishedTime = page.publishedAt ? new Date(page.publishedAt).getTime() : now
    const daysSincePublish = Math.max(0, Math.floor((now - publishedTime) / (1000 * 60 * 60 * 24)))

    const currentTraffic = page.metrics?.currentTraffic ?? 0
    const previousTraffic = page.metrics?.previousTraffic ?? 0
    const hasHistoricalData = page.metrics?.historicalAnnualDataAvailable ?? false

    // Calculate traffic trend
    let trafficTrend: 'declining' | 'flat' | 'growing' | 'erratic' = 'flat'
    let changePct = 0

    if (previousTraffic > 0) {
      changePct = Math.round(((currentTraffic - previousTraffic) / previousTraffic) * 100)
      if (changePct <= -25) trafficTrend = 'declining'
      else if (changePct >= 20) trafficTrend = 'growing'
      else trafficTrend = 'flat'
    } else if (currentTraffic > 0) {
      trafficTrend = 'growing'
    }

    const recentUrlChange = Boolean(page.context?.recentUrlChange)
    const recentRedirectDate = page.context?.recentRedirectDate
    const seasonalitySignal = Boolean(
      page.context?.isSeasonalTopic && page.context?.currentSeasonIsOffPeak,
    )
    const trackingHealth = page.context?.trackingHealth || 'healthy'

    let diagnosis:
      | 'genuine_decay'
      | 'seasonal_pattern'
      | 'tracking_gap'
      | 'url_migration'
      | 'stable' = 'stable'
    let recommendedAction:
      | 'refresh_content'
      | 'investigate_tracking'
      | 'monitor_seasonality'
      | 'preserve_current' = 'preserve_current'
    let notes = ''

    // 1. Distinguish URL Migration / Recent Changes
    if (recentUrlChange) {
      diagnosis = 'url_migration'
      recommendedAction = 'preserve_current'
      notes = `URL or path structure was recently modified (${recentRedirectDate || 'within past 60 days'}). Search index re-evaluation is in progress; traffic dips are standard post-migration fluctuation. Preserve published content without alterations.`
    }
    // 2. Distinguish Tracking Gaps & Instrumentation Issues
    else if (trackingHealth !== 'healthy') {
      diagnosis = 'tracking_gap'
      recommendedAction = 'investigate_tracking'
      notes = `Analytics telemetry anomaly detected (${trackingHealth === 'missing_consent' ? 'consent banner gap / drop in tracking consent' : 'telemetry delivery errors'}). Apparent traffic drop is a measurement artifact, not loss of reader engagement.`
    }
    // 3. Distinguish Seasonality Cycles
    else if (seasonalitySignal) {
      diagnosis = 'seasonal_pattern'
      recommendedAction = 'monitor_seasonality'
      notes = `Identified cyclical seasonality for this topic. Traffic decline aligns with anticipated off-peak season. Content remains topically accurate; maintain without premature rewrites.`
    }
    // 4. Genuine Decay
    else if (trafficTrend === 'declining' && daysSincePublish > 90) {
      diagnosis = 'genuine_decay'
      recommendedAction = 'refresh_content'
      notes = `Genuine content decay: Sustained decline of ${Math.abs(changePct)}% in search traffic over baseline. Tracking is healthy, URL is stable, and no seasonal factor explains the drop. An editorial content refresh or backlink audit is recommended.`
    }
    // 5. Stable / Healthy
    else {
      diagnosis = 'stable'
      recommendedAction = 'preserve_current'
      notes = `Content performance is stable (change: ${changePct >= 0 ? `+${changePct}` : changePct}%). No intervention needed.`
    }

    // Only emit non-stable signals or pages needing review
    if (diagnosis !== 'stable' || trafficTrend === 'declining') {
      signals.push({
        contentId: page.id,
        title: page.title,
        canonicalPath: page.canonicalPath,
        publishedAt: page.publishedAt,
        lastModifiedAt: page.updatedAt,
        diagnosis,
        evidence: {
          trafficTrend,
          recentUrlChange,
          recentRedirectDate,
          seasonalitySignal,
          trackingHealth,
          timeElapsedSincePublishDays: daysSincePublish,
          dataSufficiency: hasHistoricalData ? 'sufficient' : 'insufficient_historical_data',
          notes,
        },
        recommendedAction,
        status: 'open',
      })
    }
  }

  // Sort: genuine decay first, then tracking gaps, then url migrations, then seasonal
  const diagPriority = {
    genuine_decay: 4,
    tracking_gap: 3,
    url_migration: 2,
    seasonal_pattern: 1,
    stable: 0,
  }

  return signals.sort((a, b) => diagPriority[b.diagnosis] - diagPriority[a.diagnosis])
}
