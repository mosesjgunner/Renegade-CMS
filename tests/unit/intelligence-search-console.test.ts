import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  GoogleSearchConsoleClient,
  maskCredential,
  SearchConsoleConnectionService,
  SearchConsoleIngestionService,
  UrlReconciliationEngine,
  AnalyticsCombiner,
  SearchOpportunityEngine,
  RecommendationTracker,
  type CanonicalContentTarget,
  type RedirectRule,
  type SearchConsolePerformanceRecord,
  type ReconciledPagePerformance,
  type FirstPartyTelemetryInput,
} from '../../src/modules/intelligence/search-console'

describe('SEO-04 Google Search Console & Performance Intelligence', () => {
  const testSiteId = 'site-test-101'
  const testPropertyUrl = 'https://renegade.example.com'

  beforeEach(() => {
    SearchConsoleConnectionService._resetForTesting()
    RecommendationTracker._resetForTesting()
  })

  describe('1. Credential Protection & Masking', () => {
    it('masks service account email and protects private keys', () => {
      const masked = maskCredential({
        clientEmail: 'seo-crawler-bot@renegade-prod.iam.gserviceaccount.com',
        privateKey:
          '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----',
      })

      expect(masked).toContain('Service Account:')
      expect(masked).toContain('***@renegade-prod.iam.gserviceaccount.com')
      expect(masked).toContain('(Private Key: [SECURED])')
      expect(masked).not.toContain('MIIEvgIBADANBgkqhkiG9w0BAQEFAASC')
    })

    it('masks API keys leaving only first 4 and last 4 characters', () => {
      const rawKey = 'AIzaSyD-unsecret-key-that-must-be-masked-9876'
      const masked = maskCredential({ apiKey: rawKey })

      expect(masked).toContain('API Key: AIza...9876')
      expect(masked).not.toContain('unsecret-key-that-must-be-masked')
    })

    it('returns unconfigured when credentials are empty', () => {
      expect(maskCredential({})).toBe('Unconfigured')
    })
  })

  describe('2. Connection Lifecycle & Data Retention Policies', () => {
    it('connects a site with credentials and records metadata', () => {
      const conn = SearchConsoleConnectionService.connectSite({
        siteId: testSiteId,
        propertyUrl: testPropertyUrl,
        authType: 'service_account',
        credentials: {
          clientEmail: 'bot@renegade.iam.gserviceaccount.com',
          privateKey: 'secret-key-val',
        },
        retainedDataPolicy: 'retain_on_disconnect',
      })

      expect(conn.siteId).toBe(testSiteId)
      expect(conn.propertyUrl).toBe(testPropertyUrl)
      expect(conn.status).toBe('connected')
      expect(conn.credentialMasked).toContain('@renegade.iam.gserviceaccount.com')
      expect(conn.credentialMasked).toContain('[SECURED]')

      const fetched = SearchConsoleConnectionService.getConnection(testSiteId)
      expect(fetched?.status).toBe('connected')
    })

    it('disconnects with retain_on_disconnect policy preserving historical records', () => {
      SearchConsoleConnectionService.connectSite({
        siteId: testSiteId,
        propertyUrl: testPropertyUrl,
        authType: 'api_key',
        credentials: { apiKey: 'key-123456789' },
        retainedDataPolicy: 'retain_on_disconnect',
      })

      SearchConsoleConnectionService.savePerformanceRecords(testSiteId, [
        {
          id: 'rec-1',
          siteId: testPropertyUrl,
          date: '2026-09-10',
          pageUrl: `${testPropertyUrl}/posts/arch`,
          query: 'renegade cms',
          clicks: 40,
          impressions: 800,
          ctr: 0.05,
          position: 3.5,
        },
      ])

      const result = SearchConsoleConnectionService.disconnectSite(testSiteId, { purgeData: false })
      expect(result.success).toBe(true)
      expect(result.dataPurged).toBe(false)
      expect(result.connection?.status).toBe('disconnected')

      const records = SearchConsoleConnectionService.getPerformanceRecords(testSiteId)
      expect(records.length).toBe(1)
    })

    it('disconnects with purgeData: true and removes performance records', () => {
      SearchConsoleConnectionService.connectSite({
        siteId: testSiteId,
        propertyUrl: testPropertyUrl,
        authType: 'api_key',
        credentials: { apiKey: 'key-123456789' },
        retainedDataPolicy: 'purge_on_disconnect',
      })

      SearchConsoleConnectionService.savePerformanceRecords(testSiteId, [
        {
          id: 'rec-1',
          siteId: testPropertyUrl,
          date: '2026-09-10',
          pageUrl: `${testPropertyUrl}/posts/arch`,
          query: 'renegade cms',
          clicks: 40,
          impressions: 800,
          ctr: 0.05,
          position: 3.5,
        },
      ])

      const result = SearchConsoleConnectionService.disconnectSite(testSiteId, { purgeData: true })
      expect(result.success).toBe(true)
      expect(result.dataPurged).toBe(true)

      const records = SearchConsoleConnectionService.getPerformanceRecords(testSiteId)
      expect(records.length).toBe(0)
    })

    it('fully deletes connection and records on deleteConnection', () => {
      SearchConsoleConnectionService.connectSite({
        siteId: 'site-temp',
        propertyUrl: 'https://temp.example.com',
        authType: 'api_key',
        credentials: { apiKey: 'temp' },
      })

      const deleted = SearchConsoleConnectionService.deleteConnection('site-temp')
      expect(deleted).toBe(true)
      expect(SearchConsoleConnectionService.getConnection('site-temp')).toBeNull()
    })
  })

  describe('3. Rate Limiting, Retries & Pagination in Client', () => {
    it('retries with exponential backoff on HTTP 429 rate limit responses', async () => {
      let callCount = 0
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount < 3) {
          return new Response(
            JSON.stringify({ error: { code: 429, message: 'Rate limit exceeded' } }),
            {
              status: 429,
              statusText: 'Too Many Requests',
            },
          )
        }
        return new Response(
          JSON.stringify({
            rows: [
              {
                keys: ['2026-09-01', `${testPropertyUrl}/posts/guide`, 'renegade guide'],
                clicks: 25,
                impressions: 400,
                ctr: 0.0625,
                position: 3.2,
              },
            ],
          }),
          { status: 200 },
        )
      })

      const client = new GoogleSearchConsoleClient({
        siteUrl: testPropertyUrl,
        authType: 'api_key',
        credentials: { apiKey: 'test-key' },
        fetchFn: mockFetch,
        maxRetries: 3,
        initialBackoffMs: 5,
        maxBackoffMs: 20,
      })

      const result = await client.querySearchAnalytics({
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        dimensions: ['date', 'page', 'query'],
      })

      expect(callCount).toBe(3)
      expect(result.records.length).toBe(1)
      expect(result.records[0].clicks).toBe(25)
      expect(result.rateLimitDelaysMs).toBeGreaterThan(0)
    })

    it('paginates across Search Console rowLimit boundaries until exhausted', async () => {
      const mockHandler = vi
        .fn()
        .mockImplementation(async (_body: Record<string, unknown>, startRow: number) => {
          if (startRow >= 6) {
            return { rows: [] }
          }
          return {
            rows: [
              {
                keys: ['2026-09-01', `${testPropertyUrl}/p-${startRow}`, `query-${startRow}`],
                clicks: 10,
                impressions: 100,
                ctr: 0.1,
                position: 2.0,
              },
              {
                keys: [
                  '2026-09-01',
                  `${testPropertyUrl}/p-${startRow + 1}`,
                  `query-${startRow + 1}`,
                ],
                clicks: 5,
                impressions: 50,
                ctr: 0.1,
                position: 4.0,
              },
              {
                keys: [
                  '2026-09-01',
                  `${testPropertyUrl}/p-${startRow + 2}`,
                  `query-${startRow + 2}`,
                ],
                clicks: 2,
                impressions: 20,
                ctr: 0.1,
                position: 6.0,
              },
            ],
          }
        })

      const client = new GoogleSearchConsoleClient({
        siteUrl: testPropertyUrl,
        authType: 'api_key',
        credentials: { apiKey: 'key' },
      })

      const result = await client.querySearchAnalytics(
        {
          startDate: '2026-09-01',
          endDate: '2026-09-02',
          rowLimit: 3,
          startRow: 0,
        },
        mockHandler,
      )

      expect(result.records.length).toBe(6)
      expect(mockHandler).toHaveBeenCalledTimes(3)
    })
  })

  describe('4. Ingestion Service & Visible Sync Status', () => {
    it('runs ingestion workflow, records sync progress, and saves performance records', async () => {
      SearchConsoleConnectionService.connectSite({
        siteId: testSiteId,
        propertyUrl: testPropertyUrl,
        authType: 'api_key',
        credentials: { apiKey: 'test' },
      })

      const mockData = SearchConsoleIngestionService.generateSampleSearchAnalytics(
        testPropertyUrl,
        {
          start: '2026-08-25',
          end: '2026-09-22',
        },
      )

      const customHandler = async () => ({
        rows: mockData.map((d) => ({
          keys: [d.date, d.pageUrl, d.query],
          clicks: d.clicks,
          impressions: d.impressions,
          ctr: d.ctr,
          position: d.position,
        })),
      })

      const result = await SearchConsoleIngestionService.ingestSitePerformance(
        testSiteId,
        { startDate: '2026-08-25', endDate: '2026-09-22' },
        customHandler,
      )

      expect(result.success).toBe(true)
      expect(result.progress.status).toBe('connected')
      expect(result.progress.totalRowsIngested).toBe(mockData.length)
      expect(result.records.length).toBe(mockData.length)

      const stored = SearchConsoleConnectionService.getPerformanceRecords(testSiteId)
      expect(stored.length).toBe(mockData.length)

      const conn = SearchConsoleConnectionService.getConnection(testSiteId)
      expect(conn?.lastSyncAt).toBeDefined()
    })
  })

  describe('5. Canonical URL, Redirects & Historical Slug Reconciliation', () => {
    it('normalizes URLs cleanly without trailing slashes, domains or query strings', () => {
      expect(
        UrlReconciliationEngine.normalizePath('https://renegade.example.com/posts/guide/'),
      ).toBe('/posts/guide')
      expect(UrlReconciliationEngine.normalizePath('/posts/guide?ref=search#section')).toBe(
        '/posts/guide',
      )
      expect(UrlReconciliationEngine.normalizePath('/')).toBe('/')
      expect(UrlReconciliationEngine.normalizePath('')).toBe('/')
    })

    it('resolves multi-hop redirect chains and prevents circular loops', () => {
      const redirects: RedirectRule[] = [
        { fromPath: '/old-blog/v1', toPath: '/blog/v2' },
        { fromPath: '/blog/v2', toPath: '/posts/definitive-guide' },
        { fromPath: '/posts/definitive-guide', toPath: '/posts/definitive-guide' }, // terminal
        { fromPath: '/circular-a', toPath: '/circular-b' },
        { fromPath: '/circular-b', toPath: '/circular-a' },
      ]

      const multiHop = UrlReconciliationEngine.resolveRedirectChain('/old-blog/v1', redirects)
      expect(multiHop.finalPath).toBe('/posts/definitive-guide')
      expect(multiHop.chain.length).toBe(3)
      expect(multiHop.hasLoop).toBe(false)

      const circular = UrlReconciliationEngine.resolveRedirectChain('/circular-a', redirects)
      expect(circular.hasLoop).toBe(true)
    })

    it('maps historical slugs and redirects to canonical entities', () => {
      const canonicalEntities: CanonicalContentTarget[] = [
        {
          id: 'content-arch',
          title: 'Renegade Architecture Deep Dive',
          canonicalPath: '/posts/renegade-architecture',
          slug: 'renegade-architecture',
          historicalSlugs: ['/renegade-v1', 'arch-preview-2024'],
        },
      ]

      const redirects: RedirectRule[] = [
        { fromPath: '/docs/architecture', toPath: '/posts/renegade-architecture' },
        { fromPath: '/old-link', toPath: '/docs/architecture' },
      ]

      // Canonical match
      const direct = UrlReconciliationEngine.buildUrlMapping(
        '/posts/renegade-architecture',
        canonicalEntities,
        redirects,
      )
      expect(direct.canonicalPath).toBe('/posts/renegade-architecture')
      expect(direct.canonicalContentId).toBe('content-arch')
      expect(direct.isRedirect).toBe(false)

      // Multi-hop redirect match
      const redirected = UrlReconciliationEngine.buildUrlMapping(
        '/old-link',
        canonicalEntities,
        redirects,
      )
      expect(redirected.canonicalPath).toBe('/posts/renegade-architecture')
      expect(redirected.canonicalContentId).toBe('content-arch')
      expect(redirected.isRedirect).toBe(true)
      expect(redirected.redirectChain).toEqual([
        '/old-link',
        '/docs/architecture',
        '/posts/renegade-architecture',
      ])

      // Historical slug match
      const historical = UrlReconciliationEngine.buildUrlMapping(
        '/renegade-v1',
        canonicalEntities,
        redirects,
      )
      expect(historical.canonicalPath).toBe('/posts/renegade-architecture')
      expect(historical.canonicalContentId).toBe('content-arch')
    })

    it('aggregates performance across canonical and alias URLs without trend fragmentation', () => {
      const canonicalEntities: CanonicalContentTarget[] = [
        {
          id: 'content-1',
          title: 'Decentralized Publishing Guide',
          canonicalPath: '/posts/decentralized-publishing',
          slug: 'decentralized-publishing',
          historicalSlugs: ['/legacy-publishing-slug'],
        },
      ]

      const redirects: RedirectRule[] = [
        { fromPath: '/old-url-path', toPath: '/posts/decentralized-publishing' },
      ]

      const records: SearchConsolePerformanceRecord[] = [
        // Canonical page records
        {
          id: 'r1',
          siteId: testPropertyUrl,
          date: '2026-09-10',
          pageUrl: `${testPropertyUrl}/posts/decentralized-publishing`,
          query: 'publishing platform',
          clicks: 100,
          impressions: 2000,
          ctr: 0.05,
          position: 3.0,
        },
        // Historical slug records
        {
          id: 'r2',
          siteId: testPropertyUrl,
          date: '2026-09-10',
          pageUrl: `${testPropertyUrl}/legacy-publishing-slug`,
          query: 'publishing platform',
          clicks: 40,
          impressions: 800,
          ctr: 0.05,
          position: 5.0,
        },
        // Redirected path records
        {
          id: 'r3',
          siteId: testPropertyUrl,
          date: '2026-09-10',
          pageUrl: `${testPropertyUrl}/old-url-path`,
          query: 'publishing cms',
          clicks: 20,
          impressions: 400,
          ctr: 0.05,
          position: 6.0,
        },
      ]

      const reconciled = UrlReconciliationEngine.reconcilePerformance({
        records,
        canonicalEntities,
        redirects,
      })

      expect(reconciled.length).toBe(1)
      const page = reconciled[0]
      expect(page.canonicalPath).toBe('/posts/decentralized-publishing')
      expect(page.aggregatedMetrics.clicks).toBe(160) // 100 + 40 + 20
      expect(page.aggregatedMetrics.impressions).toBe(3200) // 2000 + 800 + 400
      expect(page.trendContinuityPreserved).toBe(true)
      expect(page.sourceUrls.length).toBe(3)
      // Weighted position: (2000*3 + 800*5 + 400*6) / 3200 = (6000 + 4000 + 2400) / 3200 = 12400 / 3200 = 3.875 -> 3.9
      expect(page.aggregatedMetrics.position).toBe(3.9)
    })
  })

  describe('6. Analytics Combination (SC + 1st Party) & Freshness Tiers', () => {
    it('combines Search Console SERP metrics with 1st-party on-site telemetry while keeping definitions separate', () => {
      const searchConsolePages: ReconciledPagePerformance[] = [
        {
          canonicalContentId: 'content-arch',
          canonicalPath: '/posts/renegade-architecture',
          title: 'Renegade Architecture',
          aggregatedMetrics: {
            clicks: 500,
            impressions: 10000,
            ctr: 0.05,
            position: 3.2,
          },
          sourceUrls: [
            {
              reportedUrl: '/posts/renegade-architecture',
              clicks: 500,
              impressions: 10000,
              isHistorical: false,
            },
          ],
          trendContinuityPreserved: false,
          timeRange: { start: '2026-08-25', end: '2026-09-22' },
          freshness: '2026-09-22',
        },
      ]

      const firstPartyPages: FirstPartyTelemetryInput[] = [
        {
          canonicalPath: '/posts/renegade-architecture',
          pageviews: 1250,
          uniqueVisitors: 890,
          bounceRate: 0.38,
          avgTimeOnPageSec: 215,
          conversions: 35,
          timeRange: { start: '2026-09-01', end: '2026-09-25' },
          freshness: 'Real-time (Consent-governed)',
        },
      ]

      const combined = AnalyticsCombiner.combineMetrics({
        searchConsolePages,
        firstPartyPages,
      })

      expect(combined.length).toBe(1)
      const item = combined[0]

      // External Google Search metrics
      expect(item.searchConsole?.clicks).toBe(500)
      expect(item.searchConsole?.impressions).toBe(10000)
      expect(item.searchConsole?.definition).toContain('External Google Search metrics')

      // First-party on-site telemetry
      expect(item.firstPartyAnalytics?.pageviews).toBe(1250)
      expect(item.firstPartyAnalytics?.bounceRate).toBe(0.38)
      expect(item.firstPartyAnalytics?.conversions).toBe(35)
      expect(item.firstPartyAnalytics?.definition).toContain(
        'First-party on-site consented telemetry',
      )

      // Data sufficiency
      expect(item.dataSufficiency).toBe('sufficient')
    })

    it('evaluates data sufficiency as partial or sparse when impressions are below minimum threshold', () => {
      const searchConsolePages: ReconciledPagePerformance[] = [
        {
          canonicalPath: '/posts/low-traffic',
          title: 'Low Traffic Post',
          aggregatedMetrics: {
            clicks: 2,
            impressions: 45, // < 100
            ctr: 0.044,
            position: 18.0,
          },
          sourceUrls: [],
          trendContinuityPreserved: false,
          timeRange: { start: '2026-09-01', end: '2026-09-10' },
          freshness: '2026-09-10',
        },
      ]

      const combined = AnalyticsCombiner.combineMetrics({
        searchConsolePages,
        firstPartyPages: [],
      })

      expect(combined[0].dataSufficiency).toBe('partial')
    })
  })

  describe('7. Evidence-Backed Opportunity Engine & Uncertainty Explanations', () => {
    it('detects high-impression low-CTR pages and explains statistical uncertainty', () => {
      const pages: ReconciledPagePerformance[] = [
        {
          canonicalPath: '/posts/high-traffic-bad-title',
          title: 'High Traffic Bad Title',
          aggregatedMetrics: {
            clicks: 30,
            impressions: 4000,
            ctr: 0.0075, // 0.75% CTR at rank 4.0 (benchmark is ~8%)
            position: 4.0,
          },
          sourceUrls: [],
          trendContinuityPreserved: false,
          timeRange: { start: '2026-08-25', end: '2026-09-22' },
          freshness: '2026-09-22',
        },
      ]

      const opportunities = SearchOpportunityEngine.detectHighImpressionLowCtr({
        siteId: testSiteId,
        pages,
        minImpressions: 500,
      })

      expect(opportunities.length).toBe(1)
      const opp = opportunities[0]
      expect(opp.type).toBe('high_impression_low_ctr')
      expect(opp.metrics.currentImpressions).toBe(4000)
      expect(opp.metrics.benchmarkCtr).toBe(0.08)
      expect(opp.minimumThresholdMet).toBe(true)
      expect(opp.confidence).toBe('high')
      expect(opp.uncertaintyExplanation).toContain('statistically significant volume')
    })

    it('detects declining pages comparing current vs previous timeframes without migration false-positives', () => {
      const previousPages: ReconciledPagePerformance[] = [
        {
          canonicalPath: '/posts/decaying-post',
          title: 'Decaying Article',
          aggregatedMetrics: { clicks: 200, impressions: 5000, ctr: 0.04, position: 3.5 },
          sourceUrls: [],
          trendContinuityPreserved: false,
          timeRange: { start: '2026-08-01', end: '2026-08-28' },
          freshness: '2026-08-28',
        },
      ]

      const currentPages: ReconciledPagePerformance[] = [
        {
          canonicalPath: '/posts/decaying-post',
          title: 'Decaying Article',
          aggregatedMetrics: { clicks: 110, impressions: 3200, ctr: 0.034, position: 6.8 }, // -45% clicks
          sourceUrls: [],
          trendContinuityPreserved: false,
          timeRange: { start: '2026-08-29', end: '2026-09-25' },
          freshness: '2026-09-25',
        },
      ]

      const opportunities = SearchOpportunityEngine.detectDecliningPages({
        siteId: testSiteId,
        currentPages,
        previousPages,
        minPreviousClicks: 50,
        declineThresholdPercent: 25,
      })

      expect(opportunities.length).toBe(1)
      const opp = opportunities[0]
      expect(opp.type).toBe('declining_page')
      expect(opp.metrics.changePercent).toBe(-45)
      expect(opp.metrics.previousClicks).toBe(200)
      expect(opp.metrics.currentClicks).toBe(110)
    })

    it('detects emerging queries ranking on Page 2 with strong volume', () => {
      const records: SearchConsolePerformanceRecord[] = [
        {
          id: 'r-emerging',
          siteId: testPropertyUrl,
          date: '2026-09-20',
          pageUrl: `${testPropertyUrl}/posts/agent-frameworks`,
          query: 'autonomous editorial workflows',
          clicks: 18,
          impressions: 650,
          ctr: 0.027,
          position: 12.4, // Page 2 bracket (9.5 to 20.0)
        },
      ]

      const opportunities = SearchOpportunityEngine.detectEmergingQueries({
        siteId: testSiteId,
        records,
        minImpressions: 200,
      })

      expect(opportunities.length).toBe(1)
      const opp = opportunities[0]
      expect(opp.type).toBe('emerging_query')
      expect(opp.query).toBe('autonomous editorial workflows')
      expect(opp.metrics.currentPosition).toBe(12.4)
    })

    it('detects relevant queries ranking with weak on-page coverage', () => {
      const records: SearchConsolePerformanceRecord[] = [
        {
          id: 'r-weak',
          siteId: testPropertyUrl,
          date: '2026-09-20',
          pageUrl: `${testPropertyUrl}/posts/cryptography-guide`,
          query: 'merkle tree verification speed',
          clicks: 22,
          impressions: 480,
          ctr: 0.045,
          position: 8.8,
        },
      ]

      const inspectedPages = [
        {
          contentId: 'content-crypto',
          canonicalPath: '/posts/cryptography-guide',
          title: 'Cryptography Guide',
          bodyText: 'This article discusses symmetric encryption and public key infrastructure.',
          headings: ['Introduction to Ciphers', 'RSA Key Exchange'],
        },
      ]

      const opportunities = SearchOpportunityEngine.detectWeakCoverageQueries({
        siteId: testSiteId,
        records,
        inspectedPages,
        minImpressions: 150,
      })

      expect(opportunities.length).toBe(1)
      const opp = opportunities[0]
      expect(opp.type).toBe('weak_coverage_query')
      expect(opp.query).toBe('merkle tree verification speed')
      expect(opp.suggestedAction).toContain('Add a dedicated sub-section')
    })
  })

  describe('8. Recommendation Lifecycle Tracking with Causal Humility', () => {
    it('tracks recommendations from baseline through approval, implementation, and association measurement', () => {
      // 1. Create from opportunity
      const opportunity = {
        id: 'opp-title-1',
        siteId: testSiteId,
        type: 'high_impression_low_ctr' as const,
        title: 'Optimize Title Tag for /posts/high-traffic',
        canonicalPath: '/posts/high-traffic',
        contentId: 'content-ht',
        metrics: {
          currentImpressions: 5000,
          currentClicks: 40,
          currentCtr: 0.008,
          currentPosition: 4.2,
          benchmarkCtr: 0.08,
        },
        minimumThresholdMet: true,
        sampleSizeExplanation: 'Robust sample size (5,000 impressions).',
        uncertaintyExplanation: 'High statistical confidence.',
        confidence: 'high' as const,
        suggestedAction: 'Update meta title to include action benefit.',
        createdAt: '2026-08-28T00:00:00.000Z',
      }

      const rec = RecommendationTracker.createFromOpportunity({
        siteId: testSiteId,
        opportunity,
        baselineMetrics: {
          clicks: 40,
          impressions: 5000,
          ctr: 0.008,
          position: 4.2,
        },
        baselineWindow: { start: '2026-08-01', end: '2026-08-28' },
        createdBy: 'user-seo-specialist',
      })

      expect(rec.status).toBe('proposed')
      expect(rec.interventionDate).toBeNull()

      // 2. Approve recommendation
      const approved = RecommendationTracker.approveRecommendation(
        rec.id,
        'user-editor-lead',
        'Approved for sprint 4',
      )
      expect(approved.status).toBe('approved')

      // 3. Record implementation (recording exact intervention date)
      const implemented = RecommendationTracker.recordImplementation({
        id: rec.id,
        implementedBy: 'user-writer',
        interventionDate: '2026-08-30',
        notes: 'Updated title to "Renegade Architecture Guide (2026 Benchmark)"',
      })
      expect(implemented.status).toBe('implemented')
      expect(implemented.interventionDate).toBe('2026-08-30')

      // 4. Record external confounding change
      const withConfounder = RecommendationTracker.recordConfoundingChange({
        id: rec.id,
        category: 'core_algorithm_update',
        description: 'Google August 2026 Helpful Content Update fully rolled out',
        date: '2026-09-08',
        recordedBy: 'user-seo-specialist',
      })
      expect(withConfounder.confoundingChanges.length).toBe(1)
      expect(withConfounder.confoundingChanges[0].category).toBe('core_algorithm_update')

      // 5. Evaluate post-intervention measurement results
      const evaluated = RecommendationTracker.evaluateImpact({
        id: rec.id,
        postWindow: { start: '2026-09-01', end: '2026-09-28' },
        postMetrics: {
          clicks: 120, // +200%
          impressions: 5400,
          ctr: 0.0222,
          position: 3.8, // improved by 0.4
        },
        evaluatedBy: 'user-seo-specialist',
      })

      expect(evaluated.status).toBe('evaluated')
      expect(evaluated.measurementResult).toBeDefined()
      expect(evaluated.measurementResult?.clickDeltaPercent).toBe(200)
      expect(evaluated.measurementResult?.positionDelta).toBe(0.4)

      // Causal humility requirement: report statement must explicitly frame as association, NOT proof of causation
      const statement = evaluated.measurementResult?.reportStatement || ''
      expect(statement).toContain('observational association')
      expect(statement).toContain('not proof of causation')
      expect(statement).toContain('confounding factor(s) recorded')
    })
  })

  describe('9. Clean Degradation When Search Console is Not Connected', () => {
    it('returns empty/null gracefully for unconnected sites without throwing', () => {
      const conn = SearchConsoleConnectionService.getConnection('unconnected-site')
      expect(conn).toBeNull()

      const records = SearchConsoleConnectionService.getPerformanceRecords('unconnected-site')
      expect(records).toEqual([])

      const reconciled = UrlReconciliationEngine.reconcilePerformance({
        records: [],
        canonicalEntities: [],
        redirects: [],
      })
      expect(reconciled).toEqual([])

      const combined = AnalyticsCombiner.combineMetrics({
        searchConsolePages: [],
        firstPartyPages: [],
      })
      expect(combined).toEqual([])

      const recommendations = RecommendationTracker.getRecommendations('unconnected-site')
      expect(recommendations).toEqual([])
    })
  })
})
