import {
  type NormalizedAnalytics,
  type SocialNetwork,
  type SocialProviderAdapter,
  type AuthContext,
} from './contracts'

export interface AggregatedSocialAnalytics {
  totalImpressions: number
  totalReach: number
  totalViews: number
  totalClicks: number
  totalLikes: number
  totalComments: number
  totalShares: number
  totalSaves: number
  overallEngagementRate: number
  networkBreakdown: Record<
    SocialNetwork,
    {
      postsTracked: number
      impressions: number
      likes: number
      comments: number
      shares: number
      clicks: number
      engagementRate: number
    }
  >
}

export interface AnalyticsSnapshot {
  id: string
  canonicalPostId: string
  capturedAt: Date
  perDelivery: NormalizedAnalytics[]
  aggregate: AggregatedSocialAnalytics
}

/**
 * Calculates aggregated social engagement across multiple delivery records.
 */
export function aggregateAnalytics(
  reports: Array<{ network: SocialNetwork; analytics: NormalizedAnalytics }>,
): AggregatedSocialAnalytics {
  const breakdown: Partial<AggregatedSocialAnalytics['networkBreakdown']> = {}

  let totalImpressions = 0
  let totalReach = 0
  let totalViews = 0
  let totalClicks = 0
  let totalLikes = 0
  let totalComments = 0
  let totalShares = 0
  let totalSaves = 0

  for (const item of reports) {
    const net = item.network
    const m = item.analytics.metrics

    totalImpressions += m.impressions
    totalReach += m.reach
    totalViews += m.views
    totalClicks += m.clicks
    totalLikes += m.likes
    totalComments += m.comments
    totalShares += m.shares
    totalSaves += m.saves

    if (!breakdown[net]) {
      breakdown[net] = {
        postsTracked: 0,
        impressions: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        clicks: 0,
        engagementRate: 0,
      }
    }

    const current = breakdown[net]!
    current.postsTracked += 1
    current.impressions += m.impressions
    current.likes += m.likes
    current.comments += m.comments
    current.shares += m.shares
    current.clicks += m.clicks
  }

  // Calculate engagement rate per network
  for (const key of Object.keys(breakdown) as SocialNetwork[]) {
    const b = breakdown[key]!
    const totalEngagements = b.likes + b.comments + b.shares + b.clicks
    b.engagementRate = b.impressions > 0 ? Number(((totalEngagements / b.impressions) * 100).toFixed(2)) : 0
  }

  const grandEngagements = totalLikes + totalComments + totalShares + totalClicks
  const overallEngagementRate = totalImpressions > 0
    ? Number(((grandEngagements / totalImpressions) * 100).toFixed(2))
    : 0

  return {
    totalImpressions,
    totalReach,
    totalViews,
    totalClicks,
    totalLikes,
    totalComments,
    totalShares,
    totalSaves,
    overallEngagementRate,
    networkBreakdown: breakdown as AggregatedSocialAnalytics['networkBreakdown'],
  }
}

export class SocialAnalyticsCollector {
  private adapters: Map<SocialNetwork, SocialProviderAdapter> = new Map()

  registerAdapter(adapter: SocialProviderAdapter): void {
    this.adapters.set(adapter.network, adapter)
  }

  /**
   * Polls analytics for an array of remote deliveries.
   */
  async pollDeliveries(
    deliveries: Array<{
      deliveryId: string
      network: SocialNetwork
      remotePostId: string
      authContext: AuthContext
    }>,
  ): Promise<NormalizedAnalytics[]> {
    const results: NormalizedAnalytics[] = []

    for (const delivery of deliveries) {
      const adapter = this.adapters.get(delivery.network)
      if (!adapter || !adapter.fetchAnalytics) {
        continue
      }

      try {
        const analytics = await adapter.fetchAnalytics(delivery.remotePostId, delivery.authContext)
        results.push(analytics)
      } catch {
        // Individual provider telemetry timeouts do not crash batch ingestion
      }
    }

    return results
  }

  /**
   * Generates a point-in-time cross-network snapshot.
   */
  createSnapshot(
    canonicalPostId: string,
    reports: Array<{ network: SocialNetwork; analytics: NormalizedAnalytics }>,
  ): AnalyticsSnapshot {
    return {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      canonicalPostId,
      capturedAt: new Date(),
      perDelivery: reports.map((r) => r.analytics),
      aggregate: aggregateAnalytics(reports),
    }
  }
}
