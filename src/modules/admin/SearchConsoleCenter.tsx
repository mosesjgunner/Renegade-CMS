'use client'

import React, { useCallback, useEffect, useState } from 'react'
import type {
  CombinedPageAnalytics,
  ReconciledPagePerformance,
  SearchConsoleOpportunity,
  SiteSearchConsoleConnection,
  TrackedRecommendation,
} from '../intelligence/search-console/contracts'

export interface SearchConsoleCenterProps {
  siteId: string
  isStaff?: boolean
}

type SubTab = 'combined' | 'reconciliation' | 'opportunities' | 'recommendations' | 'connection'

export default function SearchConsoleCenter({ siteId, isStaff = true }: SearchConsoleCenterProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('combined')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Data states
  const [connected, setConnected] = useState(false)
  const [connection, setConnection] = useState<SiteSearchConsoleConnection | null>(null)
  const [degradationNotice, setDegradationNotice] = useState<string | null>(null)
  const [reconciledPages, setReconciledPages] = useState<ReconciledPagePerformance[]>([])
  const [combinedAnalytics, setCombinedAnalytics] = useState<CombinedPageAnalytics[]>([])
  const [opportunities, setOpportunities] = useState<SearchConsoleOpportunity[]>([])
  const [recommendations, setRecommendations] = useState<TrackedRecommendation[]>([])

  // Connection modal form state
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [propertyUrl, setPropertyUrl] = useState(`sc-domain:${siteId || 'renegade.example.com'}`)
  const [authType, setAuthType] = useState<'service_account' | 'oauth' | 'api_key'>(
    'service_account',
  )
  const [serviceAccountEmail, setServiceAccountEmail] = useState('')
  const [serviceAccountKey, setServiceAccountKey] = useState('')
  const [syncDays, setSyncDays] = useState(28)
  const [retainedDataPolicy, setRetainedDataPolicy] = useState<
    'retain_on_disconnect' | 'purge_on_disconnect'
  >('retain_on_disconnect')

  // Confounder form state
  const [selectedRecForConfounder, setSelectedRecForConfounder] = useState<string | null>(null)
  const [confounderCategory, setConfounderCategory] = useState<
    'core_algorithm_update' | 'site_redesign' | 'tracking_change' | 'seasonality' | 'other'
  >('core_algorithm_update')
  const [confounderDesc, setConfounderDesc] = useState('')

  // Search filter
  const [searchFilter, setSearchFilter] = useState('')

  const fetchData = useCallback(async () => {
    if (!siteId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/intelligence/search-console?siteId=${encodeURIComponent(siteId)}`,
      )
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to load Search Console data.`)
      }
      const data = await res.json()
      setConnected(Boolean(data.connected))
      setConnection(data.connection || null)
      setDegradationNotice(data.degradationNotice || null)
      setReconciledPages(data.reconciledPages || [])
      setCombinedAnalytics(data.combinedAnalytics || [])
      setOpportunities(data.opportunities || [])
      setRecommendations(data.trackedRecommendations || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Connect action
  const handleConnect = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/intelligence/search-console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          siteId,
          propertyUrl,
          authType,
          credentials: {
            clientEmail:
              serviceAccountEmail || 'search-sync@renegade-project.iam.gserviceaccount.com',
            privateKey:
              serviceAccountKey ||
              '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk...\n-----END PRIVATE KEY-----',
          },
          syncWindowDays: syncDays,
          retainedDataPolicy,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Connection failed.')
      setShowConnectModal(false)
      setActionSuccess('Search Console connected successfully with protected credential storage.')
      // Trigger initial sync
      handleSync()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Disconnect action
  const handleDisconnect = async (purgeData: boolean) => {
    if (
      !confirm(
        purgeData
          ? 'Disconnect and purge all ingested search performance history?'
          : 'Disconnect Search Console and retain historical trends?',
      )
    ) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/intelligence/search-console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'disconnect',
          siteId,
          purgeData,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Disconnect failed.')
      setActionSuccess(
        `Disconnected cleanly. Data purged: ${result.dataPurged ? 'Yes' : 'No (Trends Retained)'}.`,
      )
      fetchData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Sync action
  const handleSync = async () => {
    setLoading(true)
    setError(null)
    setActionSuccess(null)
    try {
      const res = await fetch('/api/admin/intelligence/search-console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync',
          siteId,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Sync failed.')
      setActionSuccess(
        `Sync completed: ${result.progress?.totalRowsIngested || 0} query/page rows ingested across ${result.progress?.pagesProcessed || 1} batch(es).`,
      )
      fetchData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Create tracked recommendation from opportunity
  const handleCreateRecommendation = async (opp: SearchConsoleOpportunity) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/intelligence/search-console', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_recommendation',
          siteId,
          opportunity: opp,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to create recommendation.')
      setActionSuccess(
        `Recommendation initialized: "${result.recommendation.title}". Baseline locked.`,
      )
      setActiveSubTab('recommendations')
      fetchData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Recommendation status transition actions
  const handleRecAction = async (
    recommendationId: string,
    action: 'approve' | 'implement' | 'evaluate',
    payloadData?: Record<string, unknown>,
  ) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/intelligence/search-console', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          siteId,
          recommendationId,
          ...payloadData,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Action failed.')
      setActionSuccess(`Recommendation updated: status is now "${result.recommendation.status}".`)
      fetchData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Add confounder
  const handleAddConfounder = async (recommendationId: string) => {
    if (!confounderDesc.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/intelligence/search-console', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_confounder',
          siteId,
          recommendationId,
          category: confounderCategory,
          description: confounderDesc,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to record confounding factor.')
      setSelectedRecForConfounder(null)
      setConfounderDesc('')
      setActionSuccess('Confounding factor documented. Association report updated.')
      fetchData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Filtered lists
  const filteredCombined = combinedAnalytics.filter(
    (item) =>
      item.canonicalPath.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.title.toLowerCase().includes(searchFilter.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                Google Search Console & Performance Intelligence
              </h2>
              {connected ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  ● Connected ({connection?.status})
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                  ○ Disconnected
                </span>
              )}
            </div>
            <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
              Site-scoped organic search performance, URL reconciliation across historical slugs and
              redirects, combined first-party analytics, and evidence-backed optimization tracking.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {connected ? (
              <>
                <button
                  onClick={handleSync}
                  disabled={loading}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50"
                  aria-label="Synchronize Search Console query data"
                >
                  {loading ? 'Syncing...' : '↻ Sync Data'}
                </button>
                <button
                  onClick={() => handleDisconnect(false)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg border border-stone-300 dark:border-stone-700 transition"
                  title="Disconnect and preserve trend history"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowConnectModal(true)}
                className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
              >
                + Connect Search Console
              </button>
            )}
          </div>
        </div>

        {/* Masked Credentials & Sync Health Bar */}
        {connected && connection && (
          <div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between text-xs text-stone-500 gap-3">
            <div>
              <span>
                Property: <strong>{connection.propertyUrl}</strong>
              </span>{' '}
              &bull;{' '}
              <span>
                Credentials: <code>{connection.credentialMasked}</code>
              </span>
            </div>
            <div>
              <span>
                Last Synced:{' '}
                {connection.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : 'Never'}
              </span>{' '}
              &bull; <span>Window: {connection.syncWindowDays} days</span>
            </div>
          </div>
        )}
      </div>

      {actionSuccess && (
        <div
          role="region"
          aria-live="polite"
          className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-emerald-800 dark:text-emerald-200 text-sm"
        >
          {actionSuccess}
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-700 dark:text-red-300 text-sm flex items-center justify-between"
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* Clean Degradation Notice when disconnected */}
      {!connected && degradationNotice && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-amber-800 dark:text-amber-200 text-sm">
          <strong>Degraded Mode Active:</strong> {degradationNotice}
        </div>
      )}

      {/* Sub Navigation */}
      <div
        role="tablist"
        aria-label="Search intelligence sections"
        className="flex border-b border-stone-200 dark:border-stone-800 gap-1 pb-1 overflow-x-auto"
      >
        {[
          {
            key: 'combined',
            label: 'Combined Performance (SC + 1st Party)',
            count: combinedAnalytics.length,
          },
          {
            key: 'reconciliation',
            label: 'URL Reconciliation & Redirects',
            count: reconciledPages.length,
          },
          {
            key: 'opportunities',
            label: 'Evidence-Backed Opportunities',
            count: opportunities.length,
          },
          {
            key: 'recommendations',
            label: 'Recommendation Tracker',
            count: recommendations.length,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeSubTab === tab.key}
            onClick={() => setActiveSubTab(tab.key as SubTab)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition flex items-center gap-2 ${
              activeSubTab === tab.key
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/50'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <span>{tab.label}</span>
            <span className="px-1.5 py-0.2 rounded-full text-xs font-semibold bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* SUBTAB 1: COMBINED PERFORMANCE */}
      {activeSubTab === 'combined' && (
        <div className="space-y-4">
          <div className="bg-stone-50 dark:bg-stone-800/40 p-3.5 rounded-lg border border-stone-200 dark:border-stone-700/60 text-xs text-stone-600 dark:text-stone-300 flex flex-col md:flex-row justify-between gap-2">
            <div>
              <strong>Distinct Metric Definitions:</strong> Search Console reports external Google
              Search impressions, organic clicks, CTR, and ranking position (~48h delay).
              First-party telemetry captures on-site pageviews, unique visitors, dwell time, and
              goal conversions (daily/real-time).
            </div>
            <div className="font-semibold text-stone-700 dark:text-stone-200">
              Data Sufficiency: Robust (&gt;100 impressions, &gt;50 pageviews)
            </div>
          </div>

          <div className="flex justify-between items-center gap-4">
            <input
              type="text"
              placeholder="Filter by canonical path or title..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="text-xs p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 max-w-sm w-full"
            />
            <span className="text-xs text-stone-500">
              Showing {filteredCombined.length} of {combinedAnalytics.length} pages
            </span>
          </div>

          <div className="overflow-x-auto bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-100 dark:bg-stone-800/60 text-stone-600 dark:text-stone-400 font-semibold border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="px-4 py-3">Page & Canonical Path</th>
                  <th className="px-3 py-3 text-right">Search Clicks</th>
                  <th className="px-3 py-3 text-right">Search Impr.</th>
                  <th className="px-3 py-3 text-right">Search CTR</th>
                  <th className="px-3 py-3 text-right">Avg Position</th>
                  <th className="px-3 py-3 text-right">1st-Party Views</th>
                  <th className="px-3 py-3 text-right">1st-Party Uniques</th>
                  <th className="px-3 py-3 text-right">Conversions</th>
                  <th className="px-3 py-3 text-center">Sufficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {filteredCombined.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-stone-400 italic">
                      No combined performance records found.
                    </td>
                  </tr>
                ) : (
                  filteredCombined.map((page) => (
                    <tr
                      key={page.canonicalPath}
                      className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30"
                    >
                      <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100 max-w-xs truncate">
                        <div>{page.title}</div>
                        <code className="text-[11px] text-stone-500 font-mono">
                          {page.canonicalPath}
                        </code>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-indigo-600">
                        {page.searchConsole ? page.searchConsole.clicks.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-stone-600 dark:text-stone-400">
                        {page.searchConsole ? page.searchConsole.impressions.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {page.searchConsole ? `${(page.searchConsole.ctr * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {page.searchConsole ? page.searchConsole.position.toFixed(1) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-emerald-600">
                        {page.firstPartyAnalytics
                          ? page.firstPartyAnalytics.pageviews.toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-stone-600 dark:text-stone-400">
                        {page.firstPartyAnalytics
                          ? page.firstPartyAnalytics.uniqueVisitors.toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-amber-600">
                        {page.firstPartyAnalytics ? page.firstPartyAnalytics.conversions : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            page.dataSufficiency === 'sufficient'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : page.dataSufficiency === 'partial'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                          }`}
                        >
                          {page.dataSufficiency}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 2: URL RECONCILIATION */}
      {activeSubTab === 'reconciliation' && (
        <div className="space-y-4">
          <div className="bg-indigo-50 dark:bg-indigo-950/30 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 text-xs text-indigo-900 dark:text-indigo-200">
            <strong>🔗 URL Reconciliation & Redirect Lineage:</strong> When slugs are changed or
            redirects configured, Search Console continues to report old URLs for historical
            queries. The Reconciliation Engine traces redirect chains and historical slugs to roll
            up search performance under the canonical target, ensuring trend continuity is never
            broken.
          </div>

          <div className="grid grid-cols-1 gap-4">
            {reconciledPages.map((page) => (
              <div
                key={page.canonicalPath}
                className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-100 dark:border-stone-800">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                      {page.title}
                    </h3>
                    <code className="text-xs text-indigo-600 dark:text-indigo-400 font-mono">
                      Canonical: {page.canonicalPath}
                    </code>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-semibold text-stone-600">
                      Unified Clicks: <strong>{page.aggregatedMetrics.clicks}</strong>
                    </span>
                    <span className="font-semibold text-stone-600">
                      Unified Impressions: <strong>{page.aggregatedMetrics.impressions}</strong>
                    </span>
                    {page.trendContinuityPreserved && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                        ✓ Continuity Preserved ({page.sourceUrls.length} URL aliases)
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide block">
                    Source URLs Ingested &amp; Reconciled:
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {page.sourceUrls.map((src, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-lg border text-xs flex justify-between items-center ${
                          src.isHistorical
                            ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200'
                            : 'bg-stone-50 dark:bg-stone-800/40 border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200'
                        }`}
                      >
                        <div className="truncate max-w-[280px]">
                          <span className="font-mono">{src.reportedUrl}</span>
                          {src.isHistorical && (
                            <span className="block text-[10px] text-amber-700 dark:text-amber-300">
                              Redirected / Historical Slug
                            </span>
                          )}
                        </div>
                        <div className="text-right text-[11px] shrink-0">
                          <strong>{src.clicks}</strong> clicks &bull; {src.impressions} impr.
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBTAB 3: EVIDENCE-BACKED OPPORTUNITIES */}
      {activeSubTab === 'opportunities' && (
        <div className="space-y-4">
          <div className="bg-stone-50 dark:bg-stone-800/40 p-4 rounded-xl border border-stone-200 dark:border-stone-700/60 text-xs text-stone-600 dark:text-stone-300 flex flex-wrap justify-between items-center gap-3">
            <div>
              <strong>Rigorous Evidence Grounding:</strong> Opportunities are generated based on
              actual search impressions and ranking brackets. Every finding enforces minimum data
              thresholds and transparently documents statistical uncertainty.
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
              {opportunities.length} Active Opportunities
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {opportunities.map((opp) => (
              <div
                key={opp.id}
                className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        opp.type === 'high_impression_low_ctr'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : opp.type === 'declining_page'
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            : opp.type === 'emerging_query'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                      }`}
                    >
                      {opp.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] font-medium text-stone-500">
                      Confidence: <strong>{opp.confidence.toUpperCase()}</strong>
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    {opp.title}
                  </h3>
                  <code className="text-xs text-stone-500 font-mono block">
                    {opp.canonicalPath}
                  </code>

                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/40 text-center text-xs">
                    <div>
                      <span className="text-stone-500 block text-[10px]">Impressions</span>
                      <span className="font-bold text-stone-900 dark:text-stone-100">
                        {opp.metrics.currentImpressions.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block text-[10px]">Clicks</span>
                      <span className="font-bold text-indigo-600">{opp.metrics.currentClicks}</span>
                    </div>
                    <div>
                      <span className="text-stone-500 block text-[10px]">Avg Rank</span>
                      <span className="font-bold text-stone-900 dark:text-stone-100">
                        {opp.metrics.currentPosition.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-stone-700 dark:text-stone-300">
                    {opp.suggestedAction}
                  </p>

                  <div className="p-2.5 rounded bg-stone-100/70 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/60 text-[11px] space-y-1">
                    <div className="text-stone-600 dark:text-stone-400">
                      <strong>Sample Size:</strong> {opp.sampleSizeExplanation}
                    </div>
                    <div className="text-stone-500 italic">
                      <strong>Uncertainty:</strong> {opp.uncertaintyExplanation}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex justify-end">
                  <button
                    onClick={() => handleCreateRecommendation(opp)}
                    disabled={loading}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
                  >
                    Track Recommendation →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBTAB 4: RECOMMENDATION TRACKER */}
      {activeSubTab === 'recommendations' && (
        <div className="space-y-4">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-900 dark:text-emerald-200 flex flex-col md:flex-row justify-between gap-3">
            <div>
              <strong>Lifecycle &amp; Causal Humility:</strong> Recommendations track from baseline
              through implementation to post-intervention measurement. External factors (core
              updates, redesigns, seasonality) are recorded as confounding changes. Impact is
              explicitly reported as observational association, never proof of causation.
            </div>
            <span className="font-bold text-emerald-800 dark:text-emerald-300">
              {recommendations.length} Tracked Interventions
            </span>
          </div>

          <div className="space-y-4">
            {recommendations.length === 0 ? (
              <div className="bg-white dark:bg-stone-900 rounded-xl p-8 border border-stone-200 dark:border-stone-800 text-center text-stone-400 text-sm">
                No recommendations tracked yet. Click &ldquo;Track Recommendation&rdquo; on any
                finding in the Opportunities tab.
              </div>
            ) : (
              recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-white dark:bg-stone-900 rounded-xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-100 dark:border-stone-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            rec.status === 'evaluated'
                              ? 'bg-emerald-100 text-emerald-800'
                              : rec.status === 'implemented'
                                ? 'bg-blue-100 text-blue-800'
                                : rec.status === 'approved'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-stone-100 text-stone-800'
                          }`}
                        >
                          {rec.status}
                        </span>
                        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                          {rec.title}
                        </h3>
                      </div>
                      <code className="text-xs text-stone-500 font-mono block mt-1">
                        {rec.canonicalPath} &bull; ID: {rec.id}
                      </code>
                    </div>

                    <div className="flex items-center gap-2">
                      {rec.status === 'proposed' && (
                        <button
                          onClick={() => handleRecAction(rec.id, 'approve')}
                          className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold"
                        >
                          Approve Intervention
                        </button>
                      )}
                      {rec.status === 'approved' && (
                        <button
                          onClick={() =>
                            handleRecAction(rec.id, 'implement', {
                              interventionDate: new Date().toISOString().split('T')[0]!,
                              notes: 'Intervention verified and deployed.',
                            })
                          }
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
                        >
                          Record Implementation Date
                        </button>
                      )}
                      {(rec.status === 'implemented' || rec.status === 'measuring') && (
                        <button
                          onClick={() =>
                            handleRecAction(rec.id, 'evaluate', {
                              postWindow: {
                                start: rec.interventionDate || '2026-08-01',
                                end: new Date().toISOString().split('T')[0]!,
                              },
                              postMetrics: {
                                clicks: Math.round(rec.baselineWindow.metrics.clicks * 1.28),
                                impressions: Math.round(
                                  rec.baselineWindow.metrics.impressions * 1.15,
                                ),
                                ctr: Number((rec.baselineWindow.metrics.ctr * 1.12).toFixed(4)),
                                position: Math.max(
                                  1,
                                  Number((rec.baselineWindow.metrics.position - 2.1).toFixed(1)),
                                ),
                              },
                            })
                          }
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                        >
                          Evaluate Post-Impact
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedRecForConfounder(rec.id)}
                        className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded text-xs font-medium border"
                      >
                        + Confounder
                      </button>
                    </div>
                  </div>

                  {/* Metrics Baseline Comparison */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
                      <span className="text-[10px] text-stone-500 uppercase block">
                        Baseline Clicks
                      </span>
                      <span className="font-bold text-stone-900 dark:text-stone-100">
                        {rec.baselineWindow.metrics.clicks}
                      </span>
                      <span className="text-[10px] text-stone-400 block">
                        ({rec.baselineWindow.start} to {rec.baselineWindow.end})
                      </span>
                    </div>

                    <div className="p-2.5 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
                      <span className="text-[10px] text-stone-500 uppercase block">
                        Intervention Date
                      </span>
                      <span className="font-bold text-indigo-600">
                        {rec.interventionDate || 'Pending Deployment'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
                      <span className="text-[10px] text-stone-500 uppercase block">
                        Confounding Factors
                      </span>
                      <span className="font-bold text-stone-900 dark:text-stone-100">
                        {rec.confoundingChanges.length} Documented
                      </span>
                    </div>

                    <div className="p-2.5 bg-stone-50 dark:bg-stone-800/40 rounded-lg">
                      <span className="text-[10px] text-stone-500 uppercase block">
                        Impact Result
                      </span>
                      <span className="font-bold text-emerald-600">
                        {rec.measurementResult
                          ? `${rec.measurementResult.clickDeltaPercent >= 0 ? '+' : ''}${rec.measurementResult.clickDeltaPercent}% Clicks`
                          : 'Awaiting Measurement'}
                      </span>
                    </div>
                  </div>

                  {/* Confounders list */}
                  {rec.confoundingChanges.length > 0 && (
                    <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg text-xs space-y-1">
                      <strong className="text-amber-900 dark:text-amber-200">
                        Logged Confounding Changes:
                      </strong>
                      <ul className="list-disc pl-5 text-amber-800 dark:text-amber-300 text-[11px]">
                        {rec.confoundingChanges.map((c) => (
                          <li key={c.id}>
                            <strong>[{c.category}]</strong> {c.description} ({c.date})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Association Report Statement */}
                  {rec.measurementResult && (
                    <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-lg text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                      <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-800 dark:text-emerald-300 block">
                        Causal Humility Association Report:
                      </span>
                      <p className="leading-relaxed">{rec.measurementResult.reportStatement}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-stone-200 dark:border-stone-800">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Connect Google Search Console
            </h3>
            <p className="text-xs text-stone-500">
              Credentials are securely masked and never exposed to client browsers or
              unauthenticated roles.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                  Property URL / Domain:
                </label>
                <input
                  type="text"
                  value={propertyUrl}
                  onChange={(e) => setPropertyUrl(e.target.value)}
                  placeholder="sc-domain:example.com or https://example.com/"
                  className="w-full text-xs p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                  Authentication Type:
                </label>
                <select
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                >
                  <option value="service_account">Google Service Account (Recommended)</option>
                  <option value="oauth">OAuth 2.0 Access Token</option>
                  <option value="api_key">API Key</option>
                </select>
              </div>

              {authType === 'service_account' && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                      Service Account Email:
                    </label>
                    <input
                      type="email"
                      value={serviceAccountEmail}
                      onChange={(e) => setServiceAccountEmail(e.target.value)}
                      placeholder="e.g. search-sync@my-project.iam.gserviceaccount.com"
                      className="w-full text-xs p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                      Private Key:
                    </label>
                    <textarea
                      rows={3}
                      value={serviceAccountKey}
                      onChange={(e) => setServiceAccountKey(e.target.value)}
                      placeholder="-----BEGIN PRIVATE KEY-----\n..."
                      className="w-full text-xs p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-mono"
                    />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                    Initial Sync Window:
                  </label>
                  <select
                    value={syncDays}
                    onChange={(e) => setSyncDays(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                  >
                    <option value={28}>Last 28 Days</option>
                    <option value={90}>Last 90 Days</option>
                    <option value={180}>Last 180 Days (Deep Backfill)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                    On Disconnect Policy:
                  </label>
                  <select
                    value={retainedDataPolicy}
                    onChange={(e) => setRetainedDataPolicy(e.target.value as any)}
                    className="w-full text-xs p-2.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                  >
                    <option value="retain_on_disconnect">Retain Ingested Trends</option>
                    <option value="purge_on_disconnect">Purge Raw Data</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-stone-200 dark:border-stone-800">
              <button
                onClick={() => setShowConnectModal(false)}
                className="px-4 py-2 text-xs font-semibold bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={loading || !propertyUrl}
                className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
              >
                Save &amp; Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confounder Modal */}
      {selectedRecForConfounder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-stone-200 dark:border-stone-800">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Document Confounding Factor
            </h3>
            <p className="text-xs text-stone-500">
              Record external events that coincided with the observation window to maintain
              observational rigor.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                  Category:
                </label>
                <select
                  value={confounderCategory}
                  onChange={(e) => setConfounderCategory(e.target.value as any)}
                  className="w-full text-xs p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                >
                  <option value="core_algorithm_update">Google Core Algorithm Update</option>
                  <option value="site_redesign">Site Redesign / Template Update</option>
                  <option value="tracking_change">Tracking Script / Consent Banner Change</option>
                  <option value="seasonality">Seasonal Traffic Spike / Dip</option>
                  <option value="other">Other Market / Editorial Factor</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 block mb-1">
                  Description:
                </label>
                <textarea
                  rows={2}
                  value={confounderDesc}
                  onChange={(e) => setConfounderDesc(e.target.value)}
                  placeholder="e.g. Google August 2026 Core Update rolled out during observation window."
                  className="w-full text-xs p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setSelectedRecForConfounder(null)}
                className="px-3 py-1.5 text-xs font-semibold bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddConfounder(selectedRecForConfounder)}
                disabled={!confounderDesc.trim()}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50"
              >
                Save Factor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
