/**
 * Search Console Performance Ingestion Service
 *
 * Coordinates paginated query ingestion, backfills, retries,
 * rate limit tracking, and sync progress reporting.
 */

import { GoogleSearchConsoleClient } from './client'
import { SearchConsoleConnectionService } from './connection-service'
import type {
  SearchConsoleIngestOptions,
  SearchConsolePerformanceRecord,
  SearchConsoleSyncProgress,
} from './contracts'

export class SearchConsoleIngestionService {
  /**
   * Executes an ingestion run for a connected site.
   */
  static async ingestSitePerformance(
    siteId: string,
    options?: Partial<SearchConsoleIngestOptions>,
    customFetchHandler?: (requestBody: Record<string, unknown>, startRow: number) => Promise<any>,
  ): Promise<{
    success: boolean
    progress: SearchConsoleSyncProgress
    records: SearchConsolePerformanceRecord[]
  }> {
    const connection = SearchConsoleConnectionService.getConnection(siteId)
    if (!connection || connection.status === 'disconnected') {
      throw new Error(
        `Search Console is not connected for site '${siteId}'. Please connect credentials first.`,
      )
    }

    const now = new Date()
    const defaultEnd = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) // Search console ~2 days delay
    const defaultStart = new Date(
      defaultEnd.getTime() - (connection.syncWindowDays || 28) * 24 * 60 * 60 * 1000,
    )

    const startDate = options?.startDate || defaultStart.toISOString().split('T')[0]!
    const endDate = options?.endDate || defaultEnd.toISOString().split('T')[0]!

    const progress: SearchConsoleSyncProgress = {
      siteId,
      status: 'syncing',
      startedAt: now.toISOString(),
      totalRowsIngested: 0,
      pagesProcessed: 0,
      rateLimitDelaysMs: 0,
    }

    SearchConsoleConnectionService.updateSyncProgress(progress)

    try {
      const client = new GoogleSearchConsoleClient({
        siteUrl: connection.propertyUrl,
        authType: connection.authType,
        credentials: {}, // Token/key passed or mocked in fetch handler
      })

      const result = await client.querySearchAnalytics(
        {
          startDate,
          endDate,
          rowLimit: options?.rowLimit,
          startRow: options?.startRow,
          dimensions: options?.dimensions || ['date', 'page', 'query'],
        },
        customFetchHandler,
      )

      progress.totalRowsIngested = result.totalRows
      progress.pagesProcessed = result.batchesCount
      progress.rateLimitDelaysMs = result.rateLimitDelaysMs
      progress.completedAt = new Date().toISOString()
      progress.status = 'connected'

      // Save records into persistence
      SearchConsoleConnectionService.savePerformanceRecords(siteId, result.records)
      SearchConsoleConnectionService.updateSyncProgress(progress)

      return {
        success: true,
        progress,
        records: result.records,
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const isRateLimited =
        errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')

      progress.status = isRateLimited ? 'rate_limited' : 'error'
      progress.error = errorMsg
      progress.completedAt = new Date().toISOString()

      SearchConsoleConnectionService.updateSyncProgress(progress)
      throw err
    }
  }

  /**
   * Generates mock/sample Search Console data for staging, prototyping, or tests.
   */
  static generateSampleSearchAnalytics(
    propertyUrl: string,
    dateRange: { start: string; end: string },
  ): SearchConsolePerformanceRecord[] {
    const records: SearchConsolePerformanceRecord[] = [
      {
        id: 'rec-1',
        siteId: propertyUrl,
        date: dateRange.end,
        pageUrl: `${propertyUrl}/posts/decentralized-governance`,
        query: 'decentralized governance cms',
        clicks: 142,
        impressions: 2150,
        ctr: 0.066,
        position: 3.2,
      },
      {
        id: 'rec-2',
        siteId: propertyUrl,
        date: dateRange.end,
        pageUrl: `${propertyUrl}/posts/decentralized-governance`,
        query: 'cryptographic audit trails editorial',
        clicks: 84,
        impressions: 1420,
        ctr: 0.059,
        position: 4.1,
      },
      {
        id: 'rec-3',
        siteId: propertyUrl,
        date: dateRange.end,
        pageUrl: `${propertyUrl}/posts/editorial-workflow-automation`,
        query: 'editorial review workflow automation',
        clicks: 28,
        impressions: 3400, // High impression, low CTR! (28 / 3400 = 0.82% CTR)
        ctr: 0.0082,
        position: 7.4,
      },
      {
        id: 'rec-4',
        siteId: propertyUrl,
        date: dateRange.end,
        pageUrl: `${propertyUrl}/legacy-slug-2024`, // Historical slug that redirects to /posts/legacy-modernized
        query: 'legacy cms migration architecture',
        clicks: 52,
        impressions: 980,
        ctr: 0.053,
        position: 5.8,
      },
      {
        id: 'rec-5',
        siteId: propertyUrl,
        date: dateRange.end,
        pageUrl: `${propertyUrl}/posts/legacy-modernized`,
        query: 'legacy cms migration architecture',
        clicks: 64,
        impressions: 1120,
        ctr: 0.057,
        position: 5.1,
      },
      {
        id: 'rec-6',
        siteId: propertyUrl,
        date: dateRange.end,
        pageUrl: `${propertyUrl}/topics/web3-publishing`,
        query: 'web3 content publishing platform',
        clicks: 12,
        impressions: 1850, // Weak coverage query
        ctr: 0.0065,
        position: 14.2,
      },
    ]

    return records
  }
}
