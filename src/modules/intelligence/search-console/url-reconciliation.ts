/**
 * URL Reconciliation Engine
 *
 * Reconciles Google Search Console reported URLs against canonical URLs,
 * active redirects (including multi-hop redirect chains), and historical slugs.
 * Ensures URL migrations and redirects do not silently fragment performance trends.
 */

import type {
  ReconciledPagePerformance,
  ReconciledUrlMapping,
  SearchConsolePerformanceRecord,
} from './contracts'

export type CanonicalContentTarget = {
  id: string
  title: string
  canonicalPath: string
  slug: string
  historicalSlugs?: string[]
}

export type RedirectRule = {
  fromPath: string
  toPath: string
  statusCode?: '301' | '302' | '307' | '308'
  enabled?: boolean
}

export class UrlReconciliationEngine {
  /**
   * Normalizes a raw URL into a clean pathname without domain, protocol, query, or trailing slash.
   */
  static normalizePath(rawUrl: string): string {
    if (!rawUrl) return '/'
    try {
      // If full URL with protocol
      const parsed =
        rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
          ? new URL(rawUrl)
          : new URL(`https://placeholder.domain${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`)

      let pathname = parsed.pathname
      // Strip trailing slash unless it's the root '/'
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1)
      }
      return pathname.toLowerCase()
    } catch {
      let p = rawUrl.split('?')[0]!.split('#')[0]!
      if (!p.startsWith('/')) p = `/${p}`
      if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
      return p.toLowerCase()
    }
  }

  /**
   * Follows redirect chains up to maxHops to resolve the final destination path.
   * Handles loops gracefully.
   */
  static resolveRedirectChain(
    initialPath: string,
    redirects: RedirectRule[],
    maxHops = 10,
  ): { finalPath: string; chain: string[]; hasLoop: boolean } {
    const chain: string[] = [initialPath]
    let current = initialPath
    const visited = new Set<string>([initialPath])

    const redirectMap = new Map<string, string>()
    for (const r of redirects) {
      if (r.enabled !== false) {
        const fromNorm = this.normalizePath(r.fromPath)
        const toNorm = this.normalizePath(r.toPath)
        if (fromNorm !== toNorm) {
          redirectMap.set(fromNorm, toNorm)
        }
      }
    }

    let hops = 0
    while (redirectMap.has(current) && hops < maxHops) {
      hops++
      const next = redirectMap.get(current)!
      if (visited.has(next)) {
        // Redirect loop detected
        return { finalPath: current, chain, hasLoop: true }
      }
      visited.add(next)
      chain.push(next)
      current = next
    }

    return { finalPath: current, chain, hasLoop: false }
  }

  /**
   * Builds reconciled URL mapping for a reported path against known canonical content and redirects.
   */
  static buildUrlMapping(
    reportedUrl: string,
    canonicalEntities: CanonicalContentTarget[],
    redirects: RedirectRule[],
  ): ReconciledUrlMapping {
    const normalizedReported = this.normalizePath(reportedUrl)
    const { finalPath, chain } = this.resolveRedirectChain(normalizedReported, redirects)
    const isRedirect = chain.length > 1

    // 1. Direct match with canonicalPath
    let match = canonicalEntities.find((c) => this.normalizePath(c.canonicalPath) === finalPath)

    // 2. Match with slug
    if (!match) {
      match = canonicalEntities.find(
        (c) =>
          this.normalizePath(`/${c.slug}`) === finalPath ||
          this.normalizePath(c.slug) === finalPath,
      )
    }

    // 3. Match with historical slugs
    if (!match) {
      match = canonicalEntities.find((c) =>
        (c.historicalSlugs || []).some(
          (hs) =>
            this.normalizePath(hs) === normalizedReported ||
            this.normalizePath(`/${hs}`) === normalizedReported,
        ),
      )
    }

    return {
      reportedUrl,
      canonicalContentId: match?.id || null,
      canonicalPath: match ? this.normalizePath(match.canonicalPath) : finalPath,
      isRedirect,
      redirectChain: chain,
      historicalSlugs: match?.historicalSlugs || [],
      statusCode: isRedirect ? '308' : undefined,
    }
  }

  /**
   * Reconciles a collection of Search Console performance records, aggregating all historical
   * and redirected variants into unified canonical page performance records.
   */
  static reconcilePerformance(params: {
    records: SearchConsolePerformanceRecord[]
    canonicalEntities: CanonicalContentTarget[]
    redirects: RedirectRule[]
  }): ReconciledPagePerformance[] {
    const { records, canonicalEntities, redirects } = params
    const pageGroups = new Map<
      string,
      {
        canonicalContentId: string | null
        canonicalPath: string
        title: string
        sources: Map<
          string,
          { reportedUrl: string; clicks: number; impressions: number; isHistorical: boolean }
        >
        weightedPositionSum: number
        totalImpressions: number
        totalClicks: number
        dates: string[]
      }
    >()

    for (const record of records) {
      const mapping = this.buildUrlMapping(record.pageUrl, canonicalEntities, redirects)
      const groupKey = mapping.canonicalPath

      if (!pageGroups.has(groupKey)) {
        const entity = canonicalEntities.find(
          (c) => this.normalizePath(c.canonicalPath) === groupKey,
        )
        pageGroups.set(groupKey, {
          canonicalContentId: mapping.canonicalContentId,
          canonicalPath: groupKey,
          title: entity?.title || `Page (${groupKey})`,
          sources: new Map(),
          weightedPositionSum: 0,
          totalImpressions: 0,
          totalClicks: 0,
          dates: [],
        })
      }

      const group = pageGroups.get(groupKey)!
      group.totalClicks += record.clicks
      group.totalImpressions += record.impressions
      group.weightedPositionSum += record.position * record.impressions
      group.dates.push(record.date)

      const normReported = this.normalizePath(record.pageUrl)
      const isHistorical = normReported !== groupKey || mapping.isRedirect

      const existingSource = group.sources.get(normReported) || {
        reportedUrl: record.pageUrl,
        clicks: 0,
        impressions: 0,
        isHistorical,
      }
      existingSource.clicks += record.clicks
      existingSource.impressions += record.impressions
      group.sources.set(normReported, existingSource)
    }

    const results: ReconciledPagePerformance[] = []

    for (const group of pageGroups.values()) {
      const sortedDates = [...group.dates].sort()
      const minDate = sortedDates[0] || new Date().toISOString().split('T')[0]!
      const maxDate = sortedDates[sortedDates.length - 1] || minDate

      const avgPosition =
        group.totalImpressions > 0
          ? Number((group.weightedPositionSum / group.totalImpressions).toFixed(1))
          : 0

      const overallCtr =
        group.totalImpressions > 0
          ? Number((group.totalClicks / group.totalImpressions).toFixed(4))
          : 0

      const sourcesList = Array.from(group.sources.values())
      const trendContinuityPreserved =
        sourcesList.length > 1 && sourcesList.some((s) => s.isHistorical)

      results.push({
        canonicalContentId: group.canonicalContentId,
        canonicalPath: group.canonicalPath,
        title: group.title,
        aggregatedMetrics: {
          clicks: group.totalClicks,
          impressions: group.totalImpressions,
          ctr: overallCtr,
          position: avgPosition,
        },
        sourceUrls: sourcesList,
        trendContinuityPreserved,
        timeRange: { start: minDate, end: maxDate },
        freshness: maxDate,
      })
    }

    return results.sort((a, b) => b.aggregatedMetrics.clicks - a.aggregatedMetrics.clicks)
  }
}
