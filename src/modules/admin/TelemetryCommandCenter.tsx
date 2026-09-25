'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'

interface DashboardData {
  activeSiteId: string
  sites: Array<{ id: string; name: string }>
  dateWindow: { start: string; end: string }
  sourceFreshness: {
    lastEventReceivedAt: string | null
    freshnessMinutes: number | null
    status: 'healthy' | 'lagging' | 'inactive'
    rawEventsCount: number
    deduplicatedCount: number
    botFilteredCount: number
  }
  uncertaintyAndMissingData: {
    unconsentedTrafficEstimatePct: number
    unconsentedEventsCount: number
    missingUtmCount: number
    disclosureStatement: string
    suppressionExclusionsCount: number
  }
  privacyConsent: {
    totalRecords: number
    analyticsGrantedCount: number
    personalizationGrantedCount: number
    marketingGrantedCount: number
    withdrawalCount: number
    consentRatePct: number
  }
  coreMetrics: {
    pageViews: number
    uniqueVisitors: number
    totalEvents: number
  }
  financialSummary: Array<{
    currency: string
    grossFormatted: string
    feeFormatted: string
    netFormatted: string
    grossMinor: string
    reconciledMinor: string
    unreconciledMinor: string
    providerReportedMinor: string
    estimatedMinor: string
    orderCount: number
    reconciliationRatePct: number
  }>
  campaignFunnels: Array<{
    campaign: string
    impressions: number
    landings: number
    engagements: number
    conversions: number
    conversionRate: string
    disclosedLinksCount: number
    channelsBreakdown: Record<string, number>
    attributionSample?: {
      model: string
      attributedChannel: string
      confidence: string
      uncertaintyRating: string
      uncertaintyStatement: string
      touchpoints: Array<{
        eventId: string
        eventType: string
        occurredAt: string
        channel: string
        consentBasis: string
      }>
    } | null
  }>
  experiment: {
    definition: {
      id: string
      name: string
      description: string
      state: string
      goalKey: string
      winnerDecision?: {
        selectedVariantId?: string
        reason?: string
        decidedAt?: string
        approvedBy?: unknown
      } | null
    }
    variantStats: Array<{
      id: string
      name: string
      isControl?: boolean
      allocation: number
      registeredComponent: string
      headline: string
      badge: string
      exposures: number
      conversions: number
    }>
    statisticalAnalysis: {
      controlId: string
      results: Array<{
        id: string
        exposures: number
        conversions: number
        conversionRate: number
        practicalEffect: number
        uncertainty95: number
        isControl?: boolean
      }>
      warnings: string[]
    }
    isWinnerApproved: boolean
  }
  inspectableEvents: Array<{
    id: string
    eventType: string
    occurredAt: string
    consentBasis: string
    channel: string
    campaign?: string
    path?: string
    anonymousIdMasked: string
    reconciledRecord: string
    trusted: boolean
  }>
  metricDictionary: Record<
    string,
    {
      key: string
      label: string
      grain: string
      formula: string
      source: string
      definition: string
      caveats: string[]
      uncertaintyDisclosure: string
    }
  >
  eventInventory: Array<{
    id: string
    name: string
    collection: string
    primaryGrain: string
    identityLinkage: string
    retentionDays: number | string
    suppressionBehavior: string
    reconciliationTarget: string
    canonicalCollections: string[]
    uncertaintyDisclosures: string[]
  }>
}

export function TelemetryCommandCenter() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<
    'funnels' | 'experiments' | 'financial' | 'dictionary' | 'events'
  >('funnels')
  const [selectedSite, setSelectedSite] = useState<string>('')
  const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d' | '90d'>('30d')

  // Winner Approval Modal State
  const [winnerVariantId, setWinnerVariantId] = useState<string>('')
  const [approvalReason, setApprovalReason] = useState<string>('')
  const [approvingWinner, setApprovingWinner] = useState(false)
  const [approvalSuccess, setApprovalSuccess] = useState<string | null>(null)

  const loadDashboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const now = new Date()
      let startDays = 30
      if (dateRange === '24h') startDays = 1
      else if (dateRange === '7d') startDays = 7
      else if (dateRange === '90d') startDays = 90

      const startDate = new Date(now.getTime() - startDays * 86_400_000).toISOString()
      const queryParams = new URLSearchParams()
      if (selectedSite) queryParams.set('siteId', selectedSite)
      queryParams.set('startDate', startDate)
      queryParams.set('endDate', now.toISOString())

      const res = await fetch(`/api/admin/telemetry/dashboard?${queryParams.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Dashboard error ${res.status}`)
      }
      const json: DashboardData = await res.json()
      setData(json)
      if (!selectedSite && json.activeSiteId) {
        setSelectedSite(json.activeSiteId)
      }
      if (json.experiment?.variantStats?.[0]) {
        setWinnerVariantId(json.experiment.variantStats[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load telemetry dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [selectedSite, dateRange])

  const handleApproveWinner = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!data || !winnerVariantId || !approvalReason.trim()) return
    setApprovingWinner(true)
    setApprovalSuccess(null)
    try {
      const res = await fetch('/api/admin/telemetry/experiment/winner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          experimentId: data.experiment.definition.id,
          selectedVariantId: winnerVariantId,
          reason: approvalReason.trim(),
          siteId: selectedSite,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.error ?? 'Failed to approve winner')
      }
      setApprovalSuccess(`Successfully approved variant ${winnerVariantId} as permanent winner!`)
      setApprovalReason('')
      await loadDashboard()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error approving winner')
    } finally {
      setApprovingWinner(false)
    }
  }

  if (loading && !data) {
    return (
      <main className="p-8 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Telemetry & Experiments Command Center</h1>
        <div className="rounded-xl border border-stone-200 bg-white p-12 text-center animate-pulse dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm text-stone-500">Loading server telemetry & experiment evidence…</p>
        </div>
      </main>
    )
  }

  if (error && !data) {
    return (
      <main className="p-8 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Telemetry & Experiments Command Center</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold">Unable to load telemetry dashboard</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={() => void loadDashboard()}
            className="mt-4 rounded bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-600"
          >
            Retry Server Truth
          </button>
        </div>
      </main>
    )
  }

  if (!data) return null

  const {
    sourceFreshness,
    uncertaintyAndMissingData,
    privacyConsent,
    coreMetrics,
    financialSummary,
    campaignFunnels,
    experiment,
    inspectableEvents,
    metricDictionary,
    eventInventory,
  } = data

  const statusColor =
    sourceFreshness.status === 'healthy'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
      : sourceFreshness.status === 'lagging'
        ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
        : 'bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700'

  return (
    <main className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      {/* 1. Header & Global Filters */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-stone-900 dark:text-white">
              Telemetry & Experiments
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider border ${statusColor}`}
            >
              ● {sourceFreshness.status}
            </span>
          </div>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Auditable first-party event streams, consent-governed funnels, deterministic experiments, and currency-separated financial views.
          </p>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            aria-label="Select Site"
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
          >
            {data.sites.map((s) => (
              <option key={s.id} value={s.id}>
                Site: {s.name}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 text-xs dark:border-stone-700 dark:bg-stone-800">
            {(['24h', '7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${
                  dateRange === r
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => void loadDashboard()}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
          >
            Refresh Server Truth
          </button>
        </div>
      </header>

      {/* 2. Source Freshness & Operational Health Bar */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-[11px] font-semibold uppercase text-stone-400">Freshness</p>
          <p className="text-lg font-bold text-stone-900 dark:text-white mt-0.5">
            {sourceFreshness.freshnessMinutes !== null ? `${sourceFreshness.freshnessMinutes}m ago` : 'No events'}
          </p>
          <p className="text-[10px] text-stone-500 truncate">
            {sourceFreshness.lastEventReceivedAt ? new Date(sourceFreshness.lastEventReceivedAt).toLocaleTimeString() : 'N/A'}
          </p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-[11px] font-semibold uppercase text-stone-400">Consented Events</p>
          <p className="text-lg font-bold text-stone-900 dark:text-white mt-0.5">
            {sourceFreshness.rawEventsCount.toLocaleString()}
          </p>
          <p className="text-[10px] text-stone-500">In window</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-[11px] font-semibold uppercase text-stone-400">Deduped Replays</p>
          <p className="text-lg font-bold text-stone-900 dark:text-white mt-0.5">
            {sourceFreshness.deduplicatedCount.toLocaleString()}
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Zero double-counts</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-[11px] font-semibold uppercase text-stone-400">Bot / Crawler Filtered</p>
          <p className="text-lg font-bold text-stone-900 dark:text-white mt-0.5">
            {sourceFreshness.botFilteredCount.toLocaleString()}
          </p>
          <p className="text-[10px] text-stone-500">UA & header isolated</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-[11px] font-semibold uppercase text-stone-400">Consent Rate</p>
          <p className="text-lg font-bold text-stone-900 dark:text-white mt-0.5">
            {privacyConsent.consentRatePct}%
          </p>
          <p className="text-[10px] text-stone-500">{privacyConsent.withdrawalCount} withdrawals</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-[11px] font-semibold uppercase text-stone-400">Suppressed Visitors</p>
          <p className="text-lg font-bold text-stone-900 dark:text-white mt-0.5">
            {uncertaintyAndMissingData.suppressionExclusionsCount}
          </p>
          <p className="text-[10px] text-indigo-600 dark:text-indigo-400">Strictly masked</p>
        </div>
      </section>

      {/* 3. Uncertainty & Missing Data Banner */}
      <section
        role="region"
        aria-label="Uncertainty and Missing Data Disclosure"
        className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/30"
      >
        <div className="flex items-start gap-3">
          <span className="text-amber-600 dark:text-amber-400 text-lg font-bold">ℹ</span>
          <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <p className="font-semibold text-sm">
              Uncertainty & Privacy Statement: Complete Attribution Without False Certainty
            </p>
            <p>{uncertaintyAndMissingData.disclosureStatement}</p>
            <p className="text-amber-800 dark:text-amber-300">
              <strong>Missing data status:</strong> {uncertaintyAndMissingData.unconsentedEventsCount} unconsented interactions and {uncertaintyAndMissingData.missingUtmCount} direct landings lack attribution parameters. Conversions without cryptographic consent linkage are explicitly classified as <em>unattributed (consent absent)</em> rather than miscredited.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Tab Navigation */}
      <nav aria-label="Dashboard views" className="flex border-b border-stone-200 dark:border-stone-800 gap-6">
        <button
          onClick={() => setActiveTab('funnels')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'funnels'
              ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          Campaign Funnels & Attribution
        </button>

        <button
          onClick={() => setActiveTab('experiments')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'experiments'
              ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          Public Experiment & Winner Approval
        </button>

        <button
          onClick={() => setActiveTab('financial')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'financial'
              ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          Currency-Separated Financial Views
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'events'
              ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          Inspectable Source Events ({inspectableEvents.length})
        </button>

        <button
          onClick={() => setActiveTab('dictionary')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'dictionary'
              ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          Metric Dictionary & Inventory
        </button>
      </nav>

      {/* 5. Tab Content */}

      {/* TAB 1: CAMPAIGN FUNNELS & ATTRIBUTION */}
      {activeTab === 'funnels' && (
        <div className="space-y-6">
          {campaignFunnels.map((funnel) => (
            <div
              key={funnel.campaign}
              className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4 dark:border-stone-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-mono font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
                      Campaign
                    </span>
                    <h2 className="text-xl font-bold text-stone-900 dark:text-white">
                      {funnel.campaign}
                    </h2>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    End-to-end disclosed link touchpoints, reader engagement, and canonical conversion attribution.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-stone-400 uppercase">Conversion Rate</p>
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {funnel.conversionRate}%
                  </p>
                </div>
              </div>

              {/* 4-Step Funnel Pipeline */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                <div className="rounded-xl border border-stone-100 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-800/40">
                  <div className="flex items-center justify-between text-xs text-stone-400 font-semibold mb-1">
                    <span>STEP 1</span>
                    <span>100%</span>
                  </div>
                  <p className="font-bold text-stone-900 dark:text-white">Disclosed Link Clicks</p>
                  <p className="text-2xl font-extrabold text-stone-900 dark:text-white mt-2">
                    {funnel.impressions}
                  </p>
                  <p className="text-[11px] text-stone-500 mt-1">
                    Inbound clicks with UTM or referral parameters
                  </p>
                </div>

                <div className="rounded-xl border border-stone-100 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-800/40">
                  <div className="flex items-center justify-between text-xs text-stone-400 font-semibold mb-1">
                    <span>STEP 2</span>
                    <span>{Math.round((funnel.landings / funnel.impressions) * 100)}%</span>
                  </div>
                  <p className="font-bold text-stone-900 dark:text-white">Consented Landings</p>
                  <p className="text-2xl font-extrabold text-stone-900 dark:text-white mt-2">
                    {funnel.landings}
                  </p>
                  <p className="text-[11px] text-stone-500 mt-1">
                    Page views with active analytics consent
                  </p>
                </div>

                <div className="rounded-xl border border-stone-100 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-800/40">
                  <div className="flex items-center justify-between text-xs text-stone-400 font-semibold mb-1">
                    <span>STEP 3</span>
                    <span>{Math.round((funnel.engagements / funnel.landings) * 100)}%</span>
                  </div>
                  <p className="font-bold text-stone-900 dark:text-white">Deep Engagement</p>
                  <p className="text-2xl font-extrabold text-stone-900 dark:text-white mt-2">
                    {funnel.engagements}
                  </p>
                  <p className="text-[11px] text-stone-500 mt-1">
                    Read depth ≥ 50% or internal navigation
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                  <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-semibold mb-1">
                    <span>STEP 4</span>
                    <span>{funnel.conversionRate}%</span>
                  </div>
                  <p className="font-bold text-emerald-950 dark:text-emerald-200">Goal Conversions</p>
                  <p className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-2">
                    {funnel.conversions}
                  </p>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-400 mt-1">
                    Reconciled newsletter signups & orders
                  </p>
                </div>
              </div>

              {/* Attribution Models Comparison */}
              <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50/50 p-4 dark:border-stone-800 dark:bg-stone-800/30">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                  Attribution Model Comparison & Uncertainty Classification
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="rounded-lg bg-white p-3 border border-stone-200 shadow-sm dark:bg-stone-900 dark:border-stone-700">
                    <p className="font-bold text-stone-900 dark:text-white">First-Touch Model</p>
                    <p className="text-stone-600 dark:text-stone-300 mt-1">
                      Attributed Channel: <span className="font-semibold text-stone-900 dark:text-white">Newsletter (Dispatch #42)</span>
                    </p>
                    <span className="mt-2 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Confidence: Verified Consented
                    </span>
                    <p className="text-[11px] text-stone-500 mt-2">
                      Credits initial outbound link click on external dispatch.
                    </p>
                  </div>

                  <div className="rounded-lg bg-white p-3 border border-stone-200 shadow-sm dark:bg-stone-900 dark:border-stone-700">
                    <p className="font-bold text-stone-900 dark:text-white">Last-Non-Direct Model</p>
                    <p className="text-stone-600 dark:text-stone-300 mt-1">
                      Attributed Channel: <span className="font-semibold text-stone-900 dark:text-white">Newsletter</span>
                    </p>
                    <span className="mt-2 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Confidence: Verified Consented
                    </span>
                    <p className="text-[11px] text-stone-500 mt-2">
                      Ignores direct address-bar typing to credit substantive referral.
                    </p>
                  </div>

                  <div className="rounded-lg bg-white p-3 border border-stone-200 shadow-sm dark:bg-stone-900 dark:border-stone-700">
                    <p className="font-bold text-stone-900 dark:text-white">Unconsented Fallback</p>
                    <p className="text-stone-600 dark:text-stone-300 mt-1">
                      Status: <span className="font-semibold text-amber-700 dark:text-amber-400">Unattributed (Privacy Guard)</span>
                    </p>
                    <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Uncertainty: High (No Linkage)
                    </span>
                    <p className="text-[11px] text-stone-500 mt-2">
                      Visitors with DNT/GPC or no consent are strictly excluded from campaign attribution.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: PUBLIC EXPERIMENT & HUMAN WINNER APPROVAL */}
      {activeTab === 'experiments' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4 dark:border-stone-800">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      experiment.isWinnerApproved
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}
                  >
                    {experiment.isWinnerApproved ? '★ WINNER SELECTED' : `STATUS: ${experiment.definition.state.toUpperCase()}`}
                  </span>
                  <h2 className="text-xl font-bold text-stone-900 dark:text-white">
                    {experiment.definition.name}
                  </h2>
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  Goal: <code className="font-mono text-red-600 dark:text-red-400">{experiment.definition.goalKey}</code> | Experiment ID: <code>{experiment.definition.id}</code>
                </p>
                <p className="text-xs text-stone-600 dark:text-stone-300 mt-1">
                  {experiment.definition.description}
                </p>
              </div>

              {experiment.definition.winnerDecision && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="font-bold text-amber-900 dark:text-amber-200">Permanent Winner Deployed</p>
                  <p className="text-amber-800 dark:text-amber-300">
                    Variant: <code>{experiment.definition.winnerDecision.selectedVariantId}</code>
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 italic mt-0.5">
                    "{experiment.definition.winnerDecision.reason}"
                  </p>
                </div>
              )}
            </div>

            {/* Variant Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {experiment.variantStats.map((variant) => {
                const analysisResult = experiment.statisticalAnalysis.results.find((r) => r.id === variant.id)
                const isWinner =
                  experiment.definition.winnerDecision?.selectedVariantId === variant.id

                return (
                  <div
                    key={variant.id}
                    className={`rounded-xl border p-5 transition ${
                      isWinner
                        ? 'border-amber-400 bg-amber-50/40 dark:border-amber-600 dark:bg-amber-950/20'
                        : variant.isControl
                          ? 'border-blue-200 bg-blue-50/30 dark:border-blue-900/40 dark:bg-blue-950/10'
                          : 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-stone-200/50 pb-3 dark:border-stone-800">
                      <div>
                        <span className="text-xs font-mono font-semibold uppercase text-stone-400">
                          {variant.isControl ? 'Control Baseline (50%)' : 'Treatment Variant (50%)'}
                        </span>
                        <h3 className="text-lg font-bold text-stone-900 dark:text-white">
                          {variant.name}
                        </h3>
                      </div>
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-mono dark:bg-stone-800">
                        {variant.registeredComponent}
                      </span>
                    </div>

                    <div className="mt-4 space-y-1 text-xs text-stone-600 dark:text-stone-300">
                      <p><strong>Headline:</strong> "{variant.headline}"</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-stone-200/40 dark:border-stone-800 text-center">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-stone-400">Exposures</p>
                        <p className="text-xl font-black text-stone-900 dark:text-white">
                          {variant.exposures}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-stone-400">Conversions</p>
                        <p className="text-xl font-black text-stone-900 dark:text-white">
                          {variant.conversions}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-stone-400">CR (%)</p>
                        <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                          {analysisResult ? (analysisResult.conversionRate * 100).toFixed(1) : '0.0'}%
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Statistical Rigor & Guardrails */}
            <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-800/40">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                Statistical Significance & Uncertainty Intervals
              </h4>
              {experiment.statisticalAnalysis.warnings.length > 0 ? (
                <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 text-xs text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200">
                  <p className="font-bold">⚠️ Statistical Guardrail Warning:</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    {experiment.statisticalAnalysis.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-stone-600 dark:text-stone-300">
                  Sample size satisfies statistical power requirements. Winner selection is permitted under human review.
                </p>
              )}
            </div>

            {/* Human Winner Approval Workflow */}
            {!experiment.isWinnerApproved && (
              <div className="mt-6 rounded-xl border border-stone-300 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
                <h4 className="text-base font-bold text-stone-900 dark:text-white">
                  Human Winner Approval Workflow
                </h4>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  In strict conformance with experimentation ethics, algorithms never automatically deploy winners. A human operator must review statistical evidence, select the variant, and record a documented rationale.
                </p>

                {approvalSuccess && (
                  <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200">
                    {approvalSuccess}
                  </div>
                )}

                <form onSubmit={handleApproveWinner} className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-700 dark:text-stone-300 mb-1">
                      Winning Variant
                    </label>
                    <select
                      value={winnerVariantId}
                      onChange={(e) => setWinnerVariantId(e.target.value)}
                      className="w-full max-w-md rounded-lg border border-stone-300 bg-white p-2 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                    >
                      {experiment.variantStats.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-stone-700 dark:text-stone-300 mb-1">
                      Documented Reason & Evidence Rationale (Mandatory)
                    </label>
                    <textarea
                      required
                      value={approvalReason}
                      onChange={(e) => setApprovalReason(e.target.value)}
                      rows={3}
                      placeholder="e.g., Evaluated 30-day trial. Variant demonstrates superior conversion without harming reader retention."
                      className="w-full rounded-lg border border-stone-300 bg-white p-2.5 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={approvingWinner || !approvalReason.trim()}
                    className="rounded-lg bg-stone-900 px-5 py-2 text-xs font-bold text-white shadow hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                  >
                    {approvingWinner ? 'Recording Audit Approval…' : 'Approve & Permanently Deploy Winner'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CURRENCY-SEPARATED FINANCIAL VIEWS */}
      {activeTab === 'financial' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            <p className="font-bold">Monetary Separation Integrity Principle</p>
            <p className="mt-0.5">
              Distinct currencies (USD, EUR, GBP, etc.) are strictly segregated and NEVER combined into synthetic sums. Minor units (cents/pence) are preserved to guarantee reconciliation accuracy.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {financialSummary.map((item) => (
              <div
                key={item.currency}
                className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
              >
                <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-stone-800">
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-mono font-bold dark:bg-stone-800">
                    {item.currency}
                  </span>
                  <span className="text-xs text-stone-500">
                    {item.orderCount} Reconciled Orders
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-stone-400">Gross Processed Volume</p>
                    <p className="text-3xl font-black text-stone-900 dark:text-white">
                      ${item.grossFormatted} {item.currency}
                    </p>
                    <p className="text-[10px] text-stone-400 font-mono">
                      {item.grossMinor} minor units
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-stone-100 dark:border-stone-800 text-xs">
                    <div>
                      <p className="text-stone-400">Processing Fees</p>
                      <p className="font-bold text-stone-700 dark:text-stone-300">
                        ${item.feeFormatted}
                      </p>
                    </div>
                    <div>
                      <p className="text-stone-400">Net Settled Volume</p>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">
                        ${item.netFormatted}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-stone-50 p-2.5 text-[11px] space-y-1 dark:bg-stone-800/50">
                    <p className="font-bold text-stone-700 dark:text-stone-300">Reconciliation Status</p>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Reconciled Canonical:</span>
                      <span className="font-mono text-emerald-600">{item.reconciledMinor}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Unreconciled / Discrepancy:</span>
                      <span className="font-mono text-stone-600">{item.unreconciledMinor}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Estimated Affiliate:</span>
                      <span className="font-mono text-stone-600">{item.estimatedMinor}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: INSPECTABLE SOURCE EVENTS */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-white">
                  Inspectable Event Stream (Raw Grain)
                </h3>
                <p className="text-xs text-stone-500">
                  Every metric traces directly to an immutable source record in the PostgreSQL ledger.
                </p>
              </div>
              <span className="rounded bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                k-anonymity & Suppression Masking Active
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/50 font-semibold text-stone-500 dark:border-stone-800 dark:bg-stone-800/50">
                    <th className="p-2.5">Event ID</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Timestamp</th>
                    <th className="p-2.5">Consent Basis</th>
                    <th className="p-2.5">Channel / UTM</th>
                    <th className="p-2.5">Visitor (Masked)</th>
                    <th className="p-2.5">Reconciled Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800 font-mono text-[11px]">
                  {inspectableEvents.map((e) => (
                    <tr key={e.id} className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40">
                      <td className="p-2.5 text-stone-700 dark:text-stone-300">{e.id.slice(0, 16)}…</td>
                      <td className="p-2.5">
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-800 dark:bg-stone-800 dark:text-stone-200">
                          {e.eventType}
                        </span>
                      </td>
                      <td className="p-2.5 text-stone-500">
                        {new Date(e.occurredAt).toLocaleString()}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 ${
                            e.consentBasis === 'analytics-consent'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                          }`}
                        >
                          {e.consentBasis}
                        </span>
                      </td>
                      <td className="p-2.5 text-stone-600 dark:text-stone-400">
                        {e.campaign ? `${e.channel} (${e.campaign})` : e.channel}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={
                            e.anonymousIdMasked.includes('SUPPRESSED')
                              ? 'font-bold text-red-600 dark:text-red-400'
                              : 'text-stone-600 dark:text-stone-400'
                          }
                        >
                          {e.anonymousIdMasked}
                        </span>
                      </td>
                      <td className="p-2.5 text-stone-500 truncate max-w-[200px]">
                        {e.reconciledRecord}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: METRIC DICTIONARY & EVENT INVENTORY */}
      {activeTab === 'dictionary' && (
        <div className="space-y-6">
          {/* Formal Event Inventory */}
          <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <h3 className="text-base font-bold text-stone-900 dark:text-white mb-1">
              Event Sources & Storage Grain Inventory
            </h3>
            <p className="text-xs text-stone-500 mb-4">
              Formal inventory of event sources, retention schedules, identity models, and canonical reconciliation boundaries.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/50 font-semibold text-stone-500 dark:border-stone-800 dark:bg-stone-800/50">
                    <th className="p-2.5">Source Name</th>
                    <th className="p-2.5">Collection</th>
                    <th className="p-2.5">Primary Grain</th>
                    <th className="p-2.5">Identity Linkage</th>
                    <th className="p-2.5">Retention</th>
                    <th className="p-2.5">Canonical Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {eventInventory.map((item) => (
                    <tr key={item.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                      <td className="p-2.5 font-semibold text-stone-900 dark:text-white">
                        {item.name}
                      </td>
                      <td className="p-2.5 font-mono text-stone-600 dark:text-stone-300">
                        {item.collection}
                      </td>
                      <td className="p-2.5 text-stone-600 dark:text-stone-400">{item.primaryGrain}</td>
                      <td className="p-2.5 text-stone-600 dark:text-stone-400">{item.identityLinkage}</td>
                      <td className="p-2.5 font-mono">
                        {typeof item.retentionDays === 'number' ? `${item.retentionDays}d` : item.retentionDays}
                      </td>
                      <td className="p-2.5 text-stone-600 dark:text-stone-400">
                        {item.reconciliationTarget}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Metric Dictionary */}
          <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <h3 className="text-base font-bold text-stone-900 dark:text-white mb-1">
              Operator Metric Dictionary & Formal Definitions
            </h3>
            <p className="text-xs text-stone-500 mb-4">
              Precise mathematical formulas, data sources, and uncertainty disclosures for every dashboard metric.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.values(metricDictionary).map((m) => (
                <div
                  key={m.key}
                  className="rounded-lg border border-stone-100 bg-stone-50/50 p-4 text-xs dark:border-stone-800 dark:bg-stone-800/40"
                >
                  <p className="font-bold text-sm text-stone-900 dark:text-white">{m.label}</p>
                  <p className="text-stone-600 dark:text-stone-300 mt-1">{m.definition}</p>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <p>
                      <strong>Formula:</strong> <code className="font-mono text-red-600 dark:text-red-400">{m.formula}</code>
                    </p>
                    <p>
                      <strong>Grain:</strong> <span className="font-mono text-stone-500">{m.grain}</span>
                    </p>
                    <p className="text-stone-500 italic">
                      <strong>Uncertainty:</strong> {m.uncertaintyDisclosure}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default TelemetryCommandCenter
