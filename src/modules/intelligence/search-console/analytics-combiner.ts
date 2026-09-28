/**
 * Search Console & First-Party Analytics Combiner
 *
 * Blends external search engine visibility (Search Console) with on-site telemetry
 * (first-party consented analytics), maintaining strict semantic separation of definitions,
 * distinct freshness intervals, and data sufficiency indicators.
 */

import type {
  CombinedPageAnalytics,
  FirstPartyMetricsSummary,
  ReconciledPagePerformance,
  SearchConsoleMetricsSummary,
} from './contracts'

export interface FirstPartyTelemetryInput {
  canonicalPath: string
  pageviews: number
  uniqueVisitors: number
  bounceRate: number // 0.0 - 1.0
  avgTimeOnPageSec: number
  conversions: number
  timeRange: { start: string; end: string }
  freshness: string
}

export class AnalyticsCombiner {
  /**
   * Combines reconciled Search Console page performance with first-party on-site telemetry.
   */
  static combineMetrics(params: {
    searchConsolePages: ReconciledPagePerformance[]
    firstPartyPages: FirstPartyTelemetryInput[]
  }): CombinedPageAnalytics[] {
    const { searchConsolePages, firstPartyPages } = params

    const combinedMap = new Map<string, CombinedPageAnalytics>()

    // Index Search Console records
    for (const sc of searchConsolePages) {
      const path = sc.canonicalPath.toLowerCase()
      const scSummary: SearchConsoleMetricsSummary = {
        clicks: sc.aggregatedMetrics.clicks,
        impressions: sc.aggregatedMetrics.impressions,
        ctr: sc.aggregatedMetrics.ctr,
        position: sc.aggregatedMetrics.position,
        timeRange: sc.timeRange,
        freshness: sc.freshness,
        definition:
          'External Google Search metrics: impressions (search result appearances), organic clicks, CTR, and average rank.',
      }

      combinedMap.set(path, {
        canonicalPath: sc.canonicalPath,
        title: sc.title,
        contentId: sc.canonicalContentId || undefined,
        searchConsole: scSummary,
        firstPartyAnalytics: null,
        dataSufficiency: 'partial',
        notes: 'Search Console data present; awaiting first-party on-site telemetry matching.',
      })
    }

    // Blend in First-Party telemetry
    for (const fp of firstPartyPages) {
      const path = fp.canonicalPath.toLowerCase()
      const fpSummary: FirstPartyMetricsSummary = {
        pageviews: fp.pageviews,
        uniqueVisitors: fp.uniqueVisitors,
        bounceRate: fp.bounceRate,
        avgTimeOnPageSec: fp.avgTimeOnPageSec,
        conversions: fp.conversions,
        timeRange: fp.timeRange,
        freshness: fp.freshness,
        definition:
          'First-party on-site consented telemetry: pageviews, unique visitors, bounce rate, dwell time, and goal conversions.',
      }

      if (combinedMap.has(path)) {
        const item = combinedMap.get(path)!
        item.firstPartyAnalytics = fpSummary

        // Evaluate data sufficiency
        const scSufficient = (item.searchConsole?.impressions || 0) >= 100
        const fpSufficient = fp.pageviews >= 50
        if (scSufficient && fpSufficient) {
          item.dataSufficiency = 'sufficient'
          item.notes = 'Both Search Console and first-party telemetry meet sufficiency thresholds.'
        } else {
          item.dataSufficiency = 'partial'
          item.notes = 'Combined data present but one or more metrics have modest sample sizes.'
        }
      } else {
        combinedMap.set(path, {
          canonicalPath: fp.canonicalPath,
          title: `Page (${fp.canonicalPath})`,
          searchConsole: null,
          firstPartyAnalytics: fpSummary,
          dataSufficiency: fp.pageviews >= 50 ? 'partial' : 'sparse',
          notes:
            'First-party telemetry present; zero organic Google Search appearances recorded in window.',
        })
      }
    }

    return Array.from(combinedMap.values()).sort((a, b) => {
      const aScore = (a.searchConsole?.clicks || 0) + (a.firstPartyAnalytics?.pageviews || 0)
      const bScore = (b.searchConsole?.clicks || 0) + (b.firstPartyAnalytics?.pageviews || 0)
      return bScore - aScore
    })
  }
}
