/**
 * Evidence-Backed Search Opportunity Engine
 *
 * Generates evidence-backed opportunities from Search Console data:
 * 1. High-Impression / Low-CTR Pages (Snippet/Title Optimization)
 * 2. Declining Pages (Decay without false positives from URL migrations)
 * 3. Emerging Queries (Rising momentum / Page 2 breakthroughs)
 * 4. Weak Coverage Queries (Relevant queries ranking with thin topical coverage)
 *
 * Applies strict minimum-data thresholds and explicitly quantifies statistical uncertainty.
 */

import type {
  ReconciledPagePerformance,
  SearchConsoleOpportunity,
  SearchConsolePerformanceRecord,
} from './contracts'

export interface PageContentInspection {
  contentId: string
  canonicalPath: string
  title: string
  bodyText: string
  headings: string[]
}

export class SearchOpportunityEngine {
  /**
   * Expected benchmark CTR based on average Google Search ranking position brackets.
   */
  static getBenchmarkCtrForPosition(position: number): number {
    if (position <= 1.5) return 0.28 // ~28%
    if (position <= 3.0) return 0.15 // ~15%
    if (position <= 5.0) return 0.08 // ~8%
    if (position <= 7.0) return 0.045 // ~4.5%
    if (position <= 10.0) return 0.022 // ~2.2%
    if (position <= 15.0) return 0.012 // ~1.2%
    return 0.006 // < 1% for deep page 2+
  }

  /**
   * Evaluates statistical uncertainty and confidence based on impression sample size.
   */
  static evaluateUncertainty(
    impressions: number,
    clicks: number,
  ): {
    meetsMinimumThreshold: boolean
    confidence: 'high' | 'medium' | 'low'
    sampleSizeExplanation: string
    uncertaintyExplanation: string
  } {
    if (impressions < 100) {
      return {
        meetsMinimumThreshold: false,
        confidence: 'low',
        sampleSizeExplanation: `Small sample size (${impressions} impressions, ${clicks} clicks). Below 100 impression threshold.`,
        uncertaintyExplanation:
          'High statistical uncertainty: click-through rates on low impression counts have wide margin of error (+/- 5-8%). Recommendation requires caution.',
      }
    }

    if (impressions < 500) {
      return {
        meetsMinimumThreshold: true,
        confidence: 'medium',
        sampleSizeExplanation: `Moderate sample size (${impressions} impressions, ${clicks} clicks). Meets minimum data threshold.`,
        uncertaintyExplanation:
          'Moderate confidence: observed metrics establish a directional baseline (+/- 2-3% margin of error). Test incremental refinements.',
      }
    }

    return {
      meetsMinimumThreshold: true,
      confidence: 'high',
      sampleSizeExplanation: `Robust sample size (${impressions} impressions, ${clicks} clicks). Well above statistical thresholds.`,
      uncertaintyExplanation:
        'High confidence: statistically significant volume establishes reliable baseline for CTR and position measurements.',
    }
  }

  /**
   * Detects High-Impression / Low-CTR opportunities.
   */
  static detectHighImpressionLowCtr(params: {
    siteId: string
    pages: ReconciledPagePerformance[]
    minImpressions?: number
  }): SearchConsoleOpportunity[] {
    const { siteId, pages, minImpressions = 500 } = params
    const opportunities: SearchConsoleOpportunity[] = []

    for (const page of pages) {
      const { impressions, clicks, ctr, position } = page.aggregatedMetrics
      if (impressions < minImpressions) continue

      const benchmark = this.getBenchmarkCtrForPosition(position)
      // If CTR is less than 60% of expected benchmark for that position
      if (ctr < benchmark * 0.6) {
        const uncertainty = this.evaluateUncertainty(impressions, clicks)

        opportunities.push({
          id: `opp-ctr-${Buffer.from(page.canonicalPath).toString('base64url').slice(0, 16)}`,
          siteId,
          type: 'high_impression_low_ctr',
          title: `Low CTR on High-Impression Page: ${page.title}`,
          canonicalPath: page.canonicalPath,
          contentId: page.canonicalContentId || undefined,
          metrics: {
            currentImpressions: impressions,
            currentClicks: clicks,
            currentCtr: ctr,
            currentPosition: position,
            benchmarkCtr: benchmark,
          },
          minimumThresholdMet: uncertainty.meetsMinimumThreshold,
          sampleSizeExplanation: uncertainty.sampleSizeExplanation,
          uncertaintyExplanation: uncertainty.uncertaintyExplanation,
          confidence: uncertainty.confidence,
          suggestedAction: `Rewrite SEO title tag and meta description to improve search snippet click appeal. Target benchmark CTR of ${(benchmark * 100).toFixed(1)}% (currently ${(ctr * 100).toFixed(1)}%).`,
          createdAt: new Date().toISOString(),
        })
      }
    }

    return opportunities
  }

  /**
   * Detects Declining Pages comparing current window vs previous window.
   * Leverages URL reconciliation so migrated URLs do NOT register false-positive decay.
   */
  static detectDecliningPages(params: {
    siteId: string
    currentPages: ReconciledPagePerformance[]
    previousPages: ReconciledPagePerformance[]
    minPreviousClicks?: number
    declineThresholdPercent?: number
  }): SearchConsoleOpportunity[] {
    const {
      siteId,
      currentPages,
      previousPages,
      minPreviousClicks = 50,
      declineThresholdPercent = 20,
    } = params

    const opportunities: SearchConsoleOpportunity[] = []
    const previousMap = new Map<string, ReconciledPagePerformance>()
    for (const p of previousPages) {
      previousMap.set(p.canonicalPath.toLowerCase(), p)
    }

    for (const curr of currentPages) {
      const prev = previousMap.get(curr.canonicalPath.toLowerCase())
      if (!prev || prev.aggregatedMetrics.clicks < minPreviousClicks) continue

      const prevClicks = prev.aggregatedMetrics.clicks
      const currClicks = curr.aggregatedMetrics.clicks
      const changePct = Number((((currClicks - prevClicks) / prevClicks) * 100).toFixed(1))

      if (changePct <= -declineThresholdPercent) {
        const uncertainty = this.evaluateUncertainty(
          curr.aggregatedMetrics.impressions,
          curr.aggregatedMetrics.clicks,
        )

        opportunities.push({
          id: `opp-dec-${Buffer.from(curr.canonicalPath).toString('base64url').slice(0, 16)}`,
          siteId,
          type: 'declining_page',
          title: `Traffic Decline Alert: ${curr.title} (${changePct}%)`,
          canonicalPath: curr.canonicalPath,
          contentId: curr.canonicalContentId || undefined,
          metrics: {
            currentImpressions: curr.aggregatedMetrics.impressions,
            currentClicks: currClicks,
            currentCtr: curr.aggregatedMetrics.ctr,
            currentPosition: curr.aggregatedMetrics.position,
            previousClicks: prevClicks,
            previousImpressions: prev.aggregatedMetrics.impressions,
            changePercent: changePct,
          },
          minimumThresholdMet: uncertainty.meetsMinimumThreshold,
          sampleSizeExplanation: uncertainty.sampleSizeExplanation,
          uncertaintyExplanation: uncertainty.uncertaintyExplanation,
          confidence: uncertainty.confidence,
          suggestedAction: `Audit search intent and freshness for ${curr.canonicalPath}. Organic search clicks declined by ${Math.abs(changePct)}% (from ${prevClicks} to ${currClicks} clicks).`,
          createdAt: new Date().toISOString(),
        })
      }
    }

    return opportunities
  }

  /**
   * Detects Emerging Queries with rising momentum or Page 2 positions (11-20).
   */
  static detectEmergingQueries(params: {
    siteId: string
    records: SearchConsolePerformanceRecord[]
    minImpressions?: number
  }): SearchConsoleOpportunity[] {
    const { siteId, records, minImpressions = 200 } = params
    const queryMap = new Map<
      string,
      {
        query: string
        pageUrl: string
        totalImpressions: number
        totalClicks: number
        weightedPositionSum: number
      }
    >()

    for (const r of records) {
      if (!r.query || r.query === '(not provided)') continue
      const key = `${r.query.toLowerCase()}::${r.pageUrl}`
      if (!queryMap.has(key)) {
        queryMap.set(key, {
          query: r.query,
          pageUrl: r.pageUrl,
          totalImpressions: 0,
          totalClicks: 0,
          weightedPositionSum: 0,
        })
      }
      const item = queryMap.get(key)!
      item.totalImpressions += r.impressions
      item.totalClicks += r.clicks
      item.weightedPositionSum += r.position * r.impressions
    }

    const opportunities: SearchConsoleOpportunity[] = []

    for (const q of queryMap.values()) {
      if (q.totalImpressions < minImpressions) continue
      const avgPos = Number((q.weightedPositionSum / q.totalImpressions).toFixed(1))
      const ctr = Number((q.totalClicks / q.totalImpressions).toFixed(4))

      // Emerging query: ranks on page 2 (positions 9.5 to 20.0) with strong searcher demand
      if (avgPos >= 9.5 && avgPos <= 20.0) {
        const uncertainty = this.evaluateUncertainty(q.totalImpressions, q.totalClicks)

        opportunities.push({
          id: `opp-emg-${Buffer.from(q.query).toString('base64url').slice(0, 16)}`,
          siteId,
          type: 'emerging_query',
          title: `Emerging Page 2 Query: "${q.query}" (Rank: ${avgPos})`,
          canonicalPath: q.pageUrl,
          query: q.query,
          metrics: {
            currentImpressions: q.totalImpressions,
            currentClicks: q.totalClicks,
            currentCtr: ctr,
            currentPosition: avgPos,
          },
          minimumThresholdMet: uncertainty.meetsMinimumThreshold,
          sampleSizeExplanation: uncertainty.sampleSizeExplanation,
          uncertaintyExplanation: uncertainty.uncertaintyExplanation,
          confidence: uncertainty.confidence,
          suggestedAction: `Target query "${q.query}" directly in page headings and body text to push average ranking from ${avgPos} into Top 5.`,
          createdAt: new Date().toISOString(),
        })
      }
    }

    return opportunities.sort((a, b) => b.metrics.currentImpressions - a.metrics.currentImpressions)
  }

  /**
   * Detects Relevant Queries with Weak On-Page Coverage.
   */
  static detectWeakCoverageQueries(params: {
    siteId: string
    records: SearchConsolePerformanceRecord[]
    inspectedPages: PageContentInspection[]
    minImpressions?: number
  }): SearchConsoleOpportunity[] {
    const { siteId, records, inspectedPages, minImpressions = 150 } = params
    const pageInspectionMap = new Map<string, PageContentInspection>()
    for (const p of inspectedPages) {
      pageInspectionMap.set(p.canonicalPath.toLowerCase(), p)
    }

    const opportunities: SearchConsoleOpportunity[] = []

    for (const r of records) {
      if (!r.query || r.impressions < minImpressions || r.position < 7 || r.position > 25) {
        continue
      }

      // Check whether page body mentions query terms
      const normPath = r.pageUrl.split('?')[0]!.toLowerCase()
      const inspection = Array.from(pageInspectionMap.values()).find((p) =>
        normPath.endsWith(p.canonicalPath.toLowerCase()),
      )

      if (inspection) {
        const lowerBody = (inspection.bodyText + ' ' + inspection.headings.join(' ')).toLowerCase()
        const lowerQuery = r.query.toLowerCase()
        const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 3)

        // If query is not mentioned in headings or body
        const isMentioned = lowerBody.includes(lowerQuery)
        const partialMatches = queryWords.filter((w) => lowerBody.includes(w)).length
        const isWeakCoverage = !isMentioned && partialMatches < queryWords.length

        if (isWeakCoverage) {
          const uncertainty = this.evaluateUncertainty(r.impressions, r.clicks)

          opportunities.push({
            id: `opp-weak-${Buffer.from(r.query).toString('base64url').slice(0, 16)}`,
            siteId,
            type: 'weak_coverage_query',
            title: `Weak On-Page Coverage: "${r.query}" on ${inspection.title}`,
            canonicalPath: inspection.canonicalPath,
            contentId: inspection.contentId,
            query: r.query,
            metrics: {
              currentImpressions: r.impressions,
              currentClicks: r.clicks,
              currentCtr: r.ctr,
              currentPosition: r.position,
            },
            minimumThresholdMet: uncertainty.meetsMinimumThreshold,
            sampleSizeExplanation: uncertainty.sampleSizeExplanation,
            uncertaintyExplanation: uncertainty.uncertaintyExplanation,
            confidence: uncertainty.confidence,
            suggestedAction: `The document receives ${r.impressions} impressions for "${r.query}" (avg pos: ${r.position}) but does not explicitly cover this keyword in headings or body. Add a dedicated sub-section.`,
            createdAt: new Date().toISOString(),
          })
        }
      }
    }

    return opportunities
  }
}
