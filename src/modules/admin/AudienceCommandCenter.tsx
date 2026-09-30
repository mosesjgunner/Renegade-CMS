'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  AUDIENCE_METRIC_DICTIONARY,
  type AudienceCommandCenterHealth,
  type AudienceExperiment,
  type CampaignFunnelProjection,
  type MetricDictionaryEntry,
  type UnifiedCampaignCalendarItem,
  PRIVACY_MASKED_VALUE,
  PRIVACY_MIN_COHORT_SIZE,
} from '../audience/command-center-contracts'
import {
  assignRecipientToVariant,
  buildCampaignTrackingUrl,
  classifyClickAgent,
  evaluateAudienceHealth,
  evaluateExperimentGuardrails,
  exportAudienceSummaryReport,
  projectCampaignFunnel,
  projectUnifiedAudienceCalendar,
  recordExperimentWinnerDecision,
} from '../audience/command-center-service'

// ============================================================================
// Seed / Mock Operational Data for Demonstration and Verification
// ============================================================================

const SEED_HEALTH_DATA = evaluateAudienceHealth({
  siteId: 'site-renegade-1',
  emailProviderStatus: 'healthy',
  emailProviderName: 'SMTP (Direct-to-MX TLS)',
  spfVerified: true,
  dkimVerified: true,
  dmarcVerified: true,
  tlsVerified: true,
  telecomProviderStatus: 'healthy',
  telecomProviderName: 'Twilio Telecom / Jibe RCS Gateway',
  telecomOutboundAllowed: true,
  totalSentRecently: 14250,
  hardBouncesRecently: 142, // 0.99% (healthy < 2.0%)
  complaintsRecently: 7, // 0.049% (healthy < 0.10%)
  queueAgeMinutesMax: 14,
  webhookLagSecondsMax: 42,
  staleSegmentCount: 1,
  invalidFormCount: 0,
  failingAutomationsCount: 1,
})

const SEED_CALENDAR_ITEMS: UnifiedCampaignCalendarItem[] = projectUnifiedAudienceCalendar([
  {
    id: 'camp-email-101',
    siteId: 'site-renegade-1',
    title: 'September Sovereign Dispatch #42: Freedom in the Protocol',
    channel: 'email',
    itemType: 'campaign',
    status: 'completed',
    scheduledFor: '2026-09-18T14:00:00Z',
    completedAt: '2026-09-18T14:15:30Z',
    timeZone: 'America/Chicago',
    targetAudienceLabel: 'All Active Newsletter Subscribers',
    estimatedRecipients: 8420,
    targetSegmentId: 'seg-active-subscribers',
    releaseReferenceId: 'rel-autumn-2026',
    releaseTitle: 'Autumn Sovereign Release v2.4',
  },
  {
    id: 'camp-telecom-202',
    siteId: 'site-renegade-1',
    title: 'Urgent Action: Town Hall Livestream Commences in 15 Minutes',
    channel: 'sms',
    itemType: 'campaign',
    status: 'scheduled',
    scheduledFor: '2026-09-21T18:45:00Z',
    completedAt: null,
    timeZone: 'America/Chicago',
    targetAudienceLabel: 'SMS Action Network (Verified Opt-In)',
    estimatedRecipients: 1240,
    targetSegmentId: 'seg-sms-action',
    releaseReferenceId: 'rel-townhall-live',
    releaseTitle: 'Sovereignty Town Hall 2026',
  },
  {
    id: 'camp-rcs-303',
    siteId: 'site-renegade-1',
    title: 'Rich Interactive Member Card: Annual Gathering Passes',
    channel: 'rcs',
    itemType: 'campaign',
    status: 'review',
    scheduledFor: '2026-09-23T16:00:00Z',
    completedAt: null,
    timeZone: 'America/Chicago',
    targetAudienceLabel: 'Members Club (RCS-Enabled Devices)',
    estimatedRecipients: 680,
    targetSegmentId: 'seg-members-club',
    releaseReferenceId: 'rel-passes-2026',
    releaseTitle: 'Annual Gathering 2026',
  },
  {
    id: 'auto-welcome-404',
    siteId: 'site-renegade-1',
    title: 'Automation: Double-Opt-In Confirmation & Welcome Journey',
    channel: 'email',
    itemType: 'automation',
    status: 'running',
    scheduledFor: null,
    completedAt: null,
    timeZone: 'UTC',
    targetAudienceLabel: 'New Form Submissions (Real-time trigger)',
    estimatedRecipients: 350,
  },
  {
    id: 'camp-conflict-test',
    siteId: 'site-renegade-1',
    title: 'Flash Reminder: Freedom in the Protocol (Overlap Check)',
    channel: 'email',
    itemType: 'campaign',
    status: 'scheduled',
    scheduledFor: '2026-09-18T16:00:00Z',
    completedAt: null,
    timeZone: 'America/Chicago',
    targetAudienceLabel: 'All Active Newsletter Subscribers',
    estimatedRecipients: 8420,
    targetSegmentId: 'seg-active-subscribers', // Same date & segment triggers frequency conflict
  },
  {
    id: 'camp-quiet-hours-test',
    siteId: 'site-renegade-1',
    title: 'Late Night SMS Alert (Quiet Hours Violation Check)',
    channel: 'sms',
    itemType: 'campaign',
    status: 'draft',
    scheduledFor: '2026-09-22T23:30:00Z', // 11:30 PM (Violates 9 PM TCPA limit)
    completedAt: null,
    timeZone: 'America/Chicago',
    targetAudienceLabel: 'SMS Action Network',
    estimatedRecipients: 1240,
  },
])

const SEED_FUNNEL_DATA: CampaignFunnelProjection = projectCampaignFunnel({
  campaignId: 'camp-email-101',
  campaignTitle: 'September Sovereign Dispatch #42: Freedom in the Protocol',
  channel: 'email',
  provider: 'Direct-to-MX TLS',
  windowStart: '2026-09-18T14:00:00Z',
  windowEnd: '2026-09-20T14:00:00Z',
  counts: {
    eligible: 8420,
    attempted: 8420,
    accepted: 8395,
    delivered: 8352,
    observedOpensConfirmed: 2410,
    observedOpensProxyCached: 1850,
    observedClicksHuman: 914,
    observedClicksBot: 312,
    conversions: 186,
  },
  cohorts: [
    {
      dimension: 'source',
      key: 'organic-forms',
      label: 'Main Website Forms',
      eligible: 5200,
      delivered: 5170,
      observedOpens: 2750,
      observedClicks: 620,
      conversions: 142,
    },
    {
      dimension: 'source',
      key: 'podcast-rsvp',
      label: 'Podcast Live RSVP',
      eligible: 2100,
      delivered: 2090,
      observedOpens: 1120,
      observedClicks: 240,
      conversions: 38,
    },
    {
      dimension: 'source',
      key: 'niche-partner',
      label: 'Partner Referral (Small Cohort)',
      eligible: 4, // Below privacy threshold (< 5)
      delivered: 4,
      observedOpens: 2,
      observedClicks: 1,
      conversions: 1,
    },
    {
      dimension: 'language',
      key: 'lang-en',
      label: 'English (US/UK)',
      eligible: 7300,
      delivered: 7250,
      observedOpens: 3720,
      observedClicks: 810,
      conversions: 165,
    },
    {
      dimension: 'language',
      key: 'lang-es',
      label: 'Spanish (Reviewed Legal Translation)',
      eligible: 1116,
      delivered: 1098,
      observedOpens: 540,
      observedClicks: 103,
      conversions: 20,
    },
    {
      dimension: 'language',
      key: 'lang-eo',
      label: 'Esperanto (Micro Cohort)',
      eligible: 4, // Below privacy threshold (< 5)
      delivered: 4,
      observedOpens: 2,
      observedClicks: 1,
      conversions: 1,
    },
  ],
})

const INITIAL_EXPERIMENTS: AudienceExperiment[] = [
  {
    id: 'exp-autumn-subject',
    siteId: 'site-renegade-1',
    title: 'Subject Line Curiosity vs Direct Clarity',
    hypothesis:
      'Direct factual subject lines will yield higher conversion to townhall RSVP than metaphorical curiosity headlines.',
    channel: 'email',
    metric: 'conversion_rate',
    windowHours: 24,
    status: 'running',
    variants: [
      {
        id: 'var-control',
        label: 'Variant A (Control): Direct Clarity',
        subject: 'Join Us: Sovereign Media Town Hall on September 24',
        fromName: 'Renegade CMS Dispatch',
        contentPreview: 'Full agenda and RSVP link for annual town hall...',
        allocationPercent: 50,
        sampleSize: 1000,
        observedOpens: 380,
        observedClicks: 120,
        conversions: 45,
        bounces: 6,
        complaints: 0,
      },
      {
        id: 'var-challenger',
        label: 'Variant B: Curiosity Hook',
        subject: 'The Protocol Has Shifted — Will You Be in the Room?',
        fromName: 'Renegade Editorial',
        contentPreview: 'Full agenda and RSVP link for annual town hall...',
        allocationPercent: 50,
        sampleSize: 1000,
        observedOpens: 425,
        observedClicks: 112,
        conversions: 32,
        bounces: 7,
        complaints: 1,
      },
    ],
    guardrails: {
      maxBounceRatePercent: 4.0,
      maxComplaintRatePercent: 0.15,
      minSampleSize: 200,
    },
    totalAllocated: 2000,
    startedAt: '2026-09-19T10:00:00Z',
    concludedAt: null,
    allocationsHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    winnerDecision: {
      winningVariantId: null,
      decidedBy: null,
      decidedAt: null,
      decisionRationale: null,
      manualConfirmation: false,
      autoDeployed: false,
    },
    warnings: [],
  },
]

// ============================================================================
// Main Audience Command Center Component
// ============================================================================

export default function AudienceCommandCenter() {
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'campaigns'
    | 'calendar'
    | 'deliverability'
    | 'suppression'
    | 'funnels'
    | 'experiments'
    | 'policies'
    | 'audit'
    | 'attribution'
    | 'dictionary'
    | 'reports'
  >('campaigns')

  const [siteId, setSiteId] = useState('site-renegade-1')
  const [timeWindow, setTimeWindow] = useState<'24h' | '7d' | '30d' | 'qtd'>('7d')
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'sms' | 'rcs'>('all')

  // State management
  const [healthData, setHealthData] = useState<AudienceCommandCenterHealth>(SEED_HEALTH_DATA)
  const [calendarItems, setCalendarItems] =
    useState<UnifiedCampaignCalendarItem[]>(SEED_CALENDAR_ITEMS)
  const [funnelData] = useState<CampaignFunnelProjection>(SEED_FUNNEL_DATA)
  const [experiments, setExperiments] = useState<AudienceExperiment[]>(INITIAL_EXPERIMENTS)
  const [operatorNotice, setOperatorNotice] = useState<string | null>(null)
  const [operatorError, setOperatorError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/admin/audience/command-center')
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        if (data.deliverabilityHealth) {
          setHealthData(data.deliverabilityHealth)
        }
        if (Array.isArray(data.recentCampaigns) && data.recentCampaigns.length > 0) {
          setCalendarItems(data.recentCampaigns)
        }
      })
      .catch(() => {
        // Fall back gracefully to local projection
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Attribution test state
  const [testUrlBase, setTestUrlBase] = useState('https://renegade.media/townhall-2026')
  const [testCampaignId, setTestCampaignId] = useState('camp-autumn-dispatch')
  const [testDirectOnly, setTestDirectOnly] = useState(false)
  const [testUserAgent, setTestUserAgent] = useState(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  )
  const [testHeaderPurpose, setTestHeaderPurpose] = useState('')

  // Experiment modal / form state
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>('exp-autumn-subject')
  const [winnerChoice, setWinnerChoice] = useState<string>('var-control')
  const [winnerRationale, setWinnerRationale] = useState<string>('')
  const [winnerManualConfirmed, setWinnerManualConfirmed] = useState<boolean>(false)

  // Filtered Calendar Items
  const filteredCalendarItems = useMemo(() => {
    return calendarItems.filter((item) => {
      if (channelFilter !== 'all' && item.channel !== channelFilter) return false
      return true
    })
  }, [calendarItems, channelFilter])

  // Dictionary Search State
  const [dictionarySearch, setDictionarySearch] = useState('')
  const [dictionaryCategory, setDictionaryCategory] = useState<string>('all')

  const filteredDictionary = useMemo(() => {
    return AUDIENCE_METRIC_DICTIONARY.filter((entry) => {
      if (dictionaryCategory !== 'all' && entry.category !== dictionaryCategory) return false
      if (dictionarySearch.trim()) {
        const query = dictionarySearch.toLowerCase()
        return (
          entry.label.toLowerCase().includes(query) ||
          entry.key.toLowerCase().includes(query) ||
          entry.definition.toLowerCase().includes(query)
        )
      }
      return true
    })
  }, [dictionarySearch, dictionaryCategory])

  // Handlers for Direct Remediation
  const handleRemediation = (actionKey: string, title: string) => {
    setOperatorError(null)
    if (actionKey === 'review_bounce_suppressions') {
      setOperatorNotice(
        `Remediation executed: Stale addresses quarantined and suppression list refreshed.`,
      )
    } else if (actionKey === 'pause_marketing_campaigns') {
      setCalendarItems((prev) =>
        prev.map((c) =>
          c.status === 'scheduled' || c.status === 'running' ? { ...c, status: 'paused' } : c,
        ),
      )
      setOperatorNotice(
        `Remediation executed: Running and scheduled campaigns paused pending consent audit.`,
      )
    } else if (actionKey === 'quarantine_invalid_forms') {
      setHealthData((prev) => ({
        ...prev,
        metrics: {
          ...prev.metrics,
          invalidFormCount: {
            ...prev.metrics.invalidFormCount,
            currentValue: 0,
            formattedValue: '0',
          },
        },
        remediationsAvailable: prev.remediationsAvailable.filter((r) => r.actionKey !== actionKey),
      }))
      setOperatorNotice(`Remediation executed: Invalid forms quarantined from public rendering.`)
    } else if (actionKey === 'refresh_stale_segments') {
      setHealthData((prev) => ({
        ...prev,
        metrics: {
          ...prev.metrics,
          staleSegmentCount: {
            ...prev.metrics.staleSegmentCount,
            currentValue: 0,
            formattedValue: '0',
          },
        },
        remediationsAvailable: prev.remediationsAvailable.filter((r) => r.actionKey !== actionKey),
      }))
      setOperatorNotice(
        `Remediation executed: Background re-evaluation queued for all audience segments.`,
      )
    } else {
      setOperatorNotice(`Action "${title}" executed successfully via domain service.`)
    }
  }

  // Handle Winner Declaration
  const handleDeclareWinner = (expId: string) => {
    setOperatorError(null)
    const exp = experiments.find((e) => e.id === expId)
    if (!exp) return

    try {
      const updated = recordExperimentWinnerDecision(exp, {
        winningVariantId: winnerChoice,
        decidedBy: 'Operator Moses (Admin)',
        rationale: winnerRationale,
        manualConfirmation: winnerManualConfirmed,
      })
      setExperiments((prev) => prev.map((e) => (e.id === expId ? updated : e)))
      setOperatorNotice(
        `Experiment "${exp.title}" concluded with winner ${winnerChoice}. Note: Manual deployment policy enforced.`,
      )
      setWinnerRationale('')
      setWinnerManualConfirmed(false)
    } catch (err) {
      setOperatorError((err as Error).message)
    }
  }

  // Handle CSV Export
  const handleExportCsv = () => {
    try {
      const exportResult = exportAudienceSummaryReport({
        siteId,
        userRole: 'administrator',
        windowLabel: timeWindow.toUpperCase(),
        metrics: AUDIENCE_METRIC_DICTIONARY.map((m) => ({
          key: m.key,
          label: m.label,
          channel: m.channel,
          count: 4200, // sample aggregate
          definition: m.definition,
          caveats: m.caveats.join('; '),
        })),
        cohorts: funnelData.cohortBreakdown.map((c) => ({
          dimension: c.dimension,
          label: c.label,
          eligible: typeof c.eligible === 'number' ? c.eligible : 4,
          delivered: typeof c.delivered === 'number' ? c.delivered : 4,
          observedClicks: typeof c.observedClicks === 'number' ? c.observedClicks : 1,
          conversions: typeof c.conversions === 'number' ? c.conversions : 1,
        })),
      })

      // Browser download simulation
      const blob = new Blob([exportResult.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', exportResult.filename)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setOperatorNotice(
        `Report exported successfully: ${exportResult.filename}. ${exportResult.privacyStatement}`,
      )
    } catch (err) {
      setOperatorError((err as Error).message)
    }
  }

  // Active Experiment & Guardrail Evaluation
  const activeExp = experiments.find((e) => e.id === selectedExperimentId) ?? experiments[0]
  const guardrailCheck = useMemo(() => {
    return activeExp ? evaluateExperimentGuardrails(activeExp) : null
  }, [activeExp])

  // Attribution Link Result
  const computedTrackingUrl = useMemo(() => {
    return buildCampaignTrackingUrl(testUrlBase, {
      campaignId: testCampaignId,
      channel: 'email',
      variantId: 'control',
      directLinkOnly: testDirectOnly,
    })
  }, [testUrlBase, testCampaignId, testDirectOnly])

  // Bot Detection Result
  const botClassification = useMemo(() => {
    return classifyClickAgent(testUserAgent, {
      purpose: testHeaderPurpose || undefined,
    })
  }, [testUserAgent, testHeaderPurpose])

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#090d16',
        color: '#e2e8f0',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '28px 36px',
      }}
    >
      {/* Header Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '20px',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 10px #10b981',
              }}
            />
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 700,
                margin: 0,
                color: '#f8fafc',
                letterSpacing: '-0.02em',
              }}
            >
              Audience Command Center
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: '#1e293b',
                color: '#94a3b8',
              }}
            >
              Renegade CMoS AUD-07
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', maxWidth: '720px' }}>
            Calm, privacy-safe operations across contacts, consent health, forms, unified campaigns
            (Email/SMS/RCS), deliverability evidence, and bounded experiments without fabricated
            universal marketing scores.
          </p>
        </div>

        {/* Global Controls */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#cbd5e1',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '13px',
            }}
          >
            <option value="site-renegade-1">Site: Renegade Sovereign Media (Primary)</option>
            <option value="site-journal-2">Site: Renegade Journal (Secondary)</option>
          </select>

          <select
            value={timeWindow}
            onChange={(e) => setTimeWindow(e.target.value as any)}
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#cbd5e1',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '13px',
            }}
          >
            <option value="24h">Window: Last 24 Hours</option>
            <option value="7d">Window: Last 7 Days</option>
            <option value="30d">Window: Last 30 Days</option>
            <option value="qtd">Window: Quarter to Date</option>
          </select>

          <button
            onClick={handleExportCsv}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📥 Export CSV</span>
          </button>
        </div>
      </header>

      {/* Operator Notification Banners */}
      {operatorNotice && (
        <div
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid #10b981',
            color: '#6ee7b7',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px',
          }}
        >
          <span>{operatorNotice}</span>
          <button
            onClick={() => setOperatorNotice(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6ee7b7',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {operatorError && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            color: '#fca5a5',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '14px',
          }}
        >
          <span>{operatorError}</span>
          <button
            onClick={() => setOperatorError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav
        style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '1px solid #1e293b',
          marginBottom: '24px',
        }}
      >
        {[
          { id: 'campaigns', label: 'Campaigns' },
          { id: 'calendar', label: 'Calendar' },
          { id: 'deliverability', label: 'Deliverability' },
          { id: 'suppression', label: 'Suppression' },
          { id: 'experiments', label: 'Experiments' },
          { id: 'policies', label: 'Policies' },
          { id: 'audit', label: 'Audit' },
          { id: 'funnels', label: 'Funnels & Cohorts' },
          { id: 'attribution', label: 'Attribution & Links' },
          { id: 'dictionary', label: 'Metric Dictionary' },
          { id: 'reports', label: 'Reports & Exports' },
        ].map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                backgroundColor: isActive ? '#1e293b' : 'transparent',
                color: isActive ? '#38bdf8' : '#94a3b8',
                border: 'none',
                borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      {/* TAB 1: CAMPAIGNS & OVERVIEW */}
      {(activeTab === 'overview' || activeTab === 'campaigns') && (
        <section>
          <div style={{ marginBottom: '16px' }}>
            <h2
              style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: '0 0 4px 0' }}
            >
              Campaign Dispatch & Lifecycle
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Real-time multi-channel overview across subscriber acquisition, dispatch operations,
              and deliverability floor.
            </p>
          </div>
          {/* Top KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '18px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Total Active Audience
              </div>
              <div
                style={{ fontSize: '28px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}
              >
                12,480
              </div>
              <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
                +312 (+2.5%) net confirmed this window
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '18px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Consent & Confirmation Rate
              </div>
              <div
                style={{ fontSize: '28px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}
              >
                87.4%
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                Double opt-in tokens confirmed within 24h
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '18px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Hard Bounce Rate
              </div>
              <div
                style={{ fontSize: '28px', fontWeight: 700, color: '#10b981', marginTop: '6px' }}
              >
                {healthData.metrics.hardBounceRate.formattedValue}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                Warning threshold: 2.0% (Current: Safe)
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '18px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Spam Complaint Rate
              </div>
              <div
                style={{ fontSize: '28px', fontWeight: 700, color: '#10b981', marginTop: '6px' }}
              >
                {healthData.metrics.complaintRate.formattedValue}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                Google/Yahoo limit: 0.10% (Current: Safe)
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '18px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Oldest Queued Job
              </div>
              <div
                style={{ fontSize: '28px', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}
              >
                {healthData.metrics.queueAgeMinutes.formattedValue}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                Worker heartbeats healthy
              </div>
            </div>
          </div>

          {/* Breakdown Grids */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
              gap: '20px',
            }}
          >
            {/* Growth & Loss by Source */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  margin: '0 0 16px 0',
                  color: '#f1f5f9',
                }}
              >
                Audience Growth & Loss by Source
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #334155',
                      color: '#94a3b8',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '8px 0' }}>Capture Source</th>
                    <th>Gross New</th>
                    <th>Confirmed</th>
                    <th>Unsubscribed</th>
                    <th>Net Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      source: 'Website Forms (Organic)',
                      gross: 420,
                      conf: 385,
                      unsub: 18,
                      net: '+367',
                    },
                    { source: 'Podcast Live RSVP', gross: 185, conf: 160, unsub: 9, net: '+151' },
                    {
                      source: 'Member Account Checkout',
                      gross: 64,
                      conf: 64,
                      unsub: 1,
                      net: '+63',
                    },
                    { source: 'Reviewed CSV Import', gross: 45, conf: 45, unsub: 4, net: '+41' },
                    {
                      source: 'Inbound Telecom STOP Keywords',
                      gross: 0,
                      conf: 0,
                      unsub: 28,
                      net: '-28',
                    },
                  ].map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '10px 0', fontWeight: 500, color: '#f8fafc' }}>
                        {row.source}
                      </td>
                      <td>{row.gross}</td>
                      <td>{row.conf}</td>
                      <td style={{ color: '#f87171' }}>{row.unsub}</td>
                      <td
                        style={{
                          fontWeight: 600,
                          color: row.net.startsWith('+') ? '#10b981' : '#f87171',
                        }}
                      >
                        {row.net}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Suppression Reasons */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  margin: '0 0 16px 0',
                  color: '#f1f5f9',
                }}
              >
                Suppression Reason Breakdown (Evidence Ledger)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  {
                    reason: 'User-Initiated Unsubscribe Link',
                    count: 342,
                    pct: '48%',
                    color: '#38bdf8',
                  },
                  {
                    reason: 'Permanent Hard Bounce (5xx / Invalid)',
                    count: 184,
                    pct: '26%',
                    color: '#f59e0b',
                  },
                  {
                    reason: 'Inbound STOP Keyword (Telecom SMS/RCS)',
                    count: 128,
                    pct: '18%',
                    color: '#ec4899',
                  },
                  {
                    reason: 'ISP Feedback Loop Spam Complaint',
                    count: 32,
                    pct: '4.5%',
                    color: '#ef4444',
                  },
                  {
                    reason: 'Operator Correction / Legal Erasure',
                    count: 24,
                    pct: '3.5%',
                    color: '#a855f7',
                  },
                ].map((item, idx) => (
                  <div key={idx}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ color: '#cbd5e1' }}>{item.reason}</span>
                      <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                        {item.count} ({item.pct})
                      </span>
                    </div>
                    <div
                      style={{
                        height: '6px',
                        backgroundColor: '#1e293b',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: item.pct,
                          backgroundColor: item.color,
                          borderRadius: '3px',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Segment Freshness & Operator Audit Trail */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
              gap: '20px',
              marginTop: '20px',
            }}
          >
            {/* Segment Estimates */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#f1f5f9' }}>
                  Audience Segment Estimates & Freshness
                </h3>
                <button
                  onClick={() =>
                    handleRemediation('refresh_stale_segments', 'Refresh Stale Segments')
                  }
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#38bdf8',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    fontSize: '12px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Recalculate All
                </button>
              </div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}
              >
                {[
                  {
                    name: 'All Active Double-Opted Subscribers',
                    size: 10840,
                    stale: false,
                    lastEval: '12 min ago',
                  },
                  {
                    name: 'SMS / RCS Action Volunteers',
                    size: 1240,
                    stale: false,
                    lastEval: '45 min ago',
                  },
                  {
                    name: 'Paid Members (Active Entitlement)',
                    size: 890,
                    stale: false,
                    lastEval: '2 hours ago',
                  },
                  {
                    name: 'Engaged Past 60 Days (Bot-Filtered)',
                    size: 4210,
                    stale: true,
                    lastEval: '28 hours ago',
                  },
                ].map((seg, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: '#131d31',
                      borderRadius: '6px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, color: '#f1f5f9' }}>{seg.name}</div>
                      <div style={{ fontSize: '11px', color: seg.stale ? '#f59e0b' : '#94a3b8' }}>
                        Evaluated {seg.lastEval} {seg.stale && '• Stale (>24h)'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, color: '#38bdf8' }}>
                        {seg.size.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>recipients</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Operator Actions */}
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  margin: '0 0 14px 0',
                  color: '#f1f5f9',
                }}
              >
                Recent Operator Actions (Audit Evidence)
              </h3>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}
              >
                {[
                  {
                    action: 'Experiment Winner Confirmed',
                    target: 'Subject Curiosity vs Clarity',
                    actor: 'Moses (Owner)',
                    time: '10 min ago',
                  },
                  {
                    action: 'Manual Contact Suppression',
                    target: 'quarantine-bounce-404@invalid.domain',
                    actor: 'Staff Reviewer',
                    time: '1 hour ago',
                  },
                  {
                    action: 'Campaign Approved & Scheduled',
                    target: 'September Sovereign Dispatch #42',
                    actor: 'Lead Editor',
                    time: '3 hours ago',
                  },
                  {
                    action: 'Reviewed CSV Import Committed',
                    target: '45 attendees with verified proof',
                    actor: 'Moses (Owner)',
                    time: 'Yesterday',
                  },
                  {
                    action: 'Subject Erasure Completed',
                    target: 'Anonymized + suppression digest retained',
                    actor: 'Compliance Officer',
                    time: '2 days ago',
                  },
                ].map((act, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 10px',
                      backgroundColor: '#131d31',
                      borderRadius: '6px',
                      borderLeft: '3px solid #38bdf8',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 600,
                        color: '#e2e8f0',
                      }}
                    >
                      <span>{act.action}</span>
                      <span style={{ color: '#94a3b8', fontWeight: 400 }}>{act.time}</span>
                    </div>
                    <div style={{ color: '#94a3b8', marginTop: '2px' }}>
                      {act.target} • <span style={{ color: '#cbd5e1' }}>{act.actor}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: UNIFIED CALENDAR & SCHEDULE */}
      {activeTab === 'calendar' && (
        <section>
          <div style={{ marginBottom: '16px' }}>
            <h2
              style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: '0 0 4px 0' }}
            >
              Multi-Channel Dispatch Schedule
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Chronological queue and scheduled releases across Email, SMS, and RCS.
            </p>
          </div>
          {/* Calendar Toolbar & Accessible Controls */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '14px 20px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>
                Channel Filter:
              </span>
              {(['all', 'email', 'sms', 'rcs'] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  style={{
                    backgroundColor: channelFilter === ch ? '#38bdf8' : '#1e293b',
                    color: channelFilter === ch ? '#0f172a' : '#cbd5e1',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {ch}
                </button>
              ))}
            </div>

            <div style={{ fontSize: '13px', color: '#94a3b8' }}>
              Showing {filteredCalendarItems.length} campaign & automation entries
            </div>
          </div>

          {/* Conflict Warnings Banner */}
          {filteredCalendarItems.some((i) => i.hasFrequencyConflict || i.isWithinQuietHours) && (
            <div
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid #f59e0b',
                color: '#fde68a',
                padding: '14px 18px',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '13px',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                ⚠️ Schedule & Frequency Invariants Requiring Attention:
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {filteredCalendarItems
                  .flatMap((i) => i.warnings)
                  .map((w, idx) => (
                    <li key={idx} style={{ margin: '3px 0' }}>
                      {w}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Unified Schedule List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredCalendarItems.map((item) => {
              const statusColor =
                item.status === 'completed'
                  ? '#10b981'
                  : item.status === 'running'
                    ? '#38bdf8'
                    : item.status === 'scheduled'
                      ? '#a855f7'
                      : item.status === 'review'
                        ? '#f59e0b'
                        : '#94a3b8'

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderLeft: `4px solid ${statusColor}`,
                    borderRadius: '8px',
                    padding: '18px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'center',
                          marginBottom: '6px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#1e293b',
                            color: '#38bdf8',
                          }}
                        >
                          {item.channel}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            color: statusColor,
                          }}
                        >
                          {item.status}
                        </span>
                        {item.releaseTitle && (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(99, 102, 241, 0.15)',
                              color: '#a5b4fc',
                            }}
                          >
                            🔗 Release: {item.releaseTitle}
                          </span>
                        )}
                      </div>
                      <h4
                        style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#f8fafc' }}
                      >
                        {item.title}
                      </h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                        Target Audience:{' '}
                        <strong style={{ color: '#cbd5e1' }}>{item.targetAudienceLabel}</strong> (~
                        {item.estimatedRecipients.toLocaleString()} eligible recipients)
                      </p>
                    </div>

                    {/* Non-Drag Accessible Controls */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {item.status === 'draft' && (
                        <button
                          onClick={() => {
                            setCalendarItems((prev) =>
                              prev.map((c) => (c.id === item.id ? { ...c, status: 'review' } : c)),
                            )
                            setOperatorNotice(
                              `Campaign "${item.title}" submitted for editorial review.`,
                            )
                          }}
                          style={{
                            backgroundColor: '#1e293b',
                            color: '#cbd5e1',
                            border: '1px solid #334155',
                            borderRadius: '4px',
                            fontSize: '12px',
                            padding: '6px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          Submit for Review
                        </button>
                      )}

                      {item.status === 'review' && (
                        <button
                          onClick={() => {
                            setCalendarItems((prev) =>
                              prev.map((c) =>
                                c.id === item.id ? { ...c, status: 'scheduled' } : c,
                              ),
                            )
                            setOperatorNotice(`Campaign "${item.title}" approved and scheduled.`)
                          }}
                          style={{
                            backgroundColor: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '6px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          Approve Send
                        </button>
                      )}

                      {item.status === 'scheduled' && (
                        <button
                          onClick={() => {
                            setCalendarItems((prev) =>
                              prev.map((c) => (c.id === item.id ? { ...c, status: 'paused' } : c)),
                            )
                            setOperatorNotice(`Campaign "${item.title}" paused.`)
                          }}
                          style={{
                            backgroundColor: '#1e293b',
                            color: '#f59e0b',
                            border: '1px solid #f59e0b',
                            borderRadius: '4px',
                            fontSize: '12px',
                            padding: '6px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          Pause
                        </button>
                      )}

                      {item.status === 'paused' && (
                        <button
                          onClick={() => {
                            setCalendarItems((prev) =>
                              prev.map((c) =>
                                c.id === item.id ? { ...c, status: 'scheduled' } : c,
                              ),
                            )
                            setOperatorNotice(`Campaign "${item.title}" resumed.`)
                          }}
                          style={{
                            backgroundColor: '#38bdf8',
                            color: '#0f172a',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '6px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          Resume
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b' }}>
                    <span>
                      Scheduled:{' '}
                      {item.scheduledFor
                        ? new Date(item.scheduledFor).toLocaleString()
                        : 'Triggered Event'}
                    </span>
                    <span>Timezone: {item.timeZone}</span>
                    {item.completedAt && (
                      <span>Completed: {new Date(item.completedAt).toLocaleTimeString()}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* TAB 3: DELIVERABILITY & HEALTH */}
      {activeTab === 'deliverability' && (
        <section>
          <div style={{ marginBottom: '16px' }}>
            <h2
              style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: '0 0 4px 0' }}
            >
              Email & Telecom Delivery Infrastructure
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              DNS authentication status, bounce thresholds, direct SMTP latency, and telecom gateway
              health.
            </p>
          </div>
          {/* Provider Readiness Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '20px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#f1f5f9' }}>
                  Email Provider & Domain Auth
                </h3>
                <span
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {healthData.providers.email.readiness.toUpperCase()}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px 0' }}>
                Active Provider:{' '}
                <strong style={{ color: '#f8fafc' }}>{healthData.providers.email.provider}</strong>
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  fontSize: '13px',
                }}
              >
                <div
                  style={{ color: healthData.providers.email.spfVerified ? '#10b981' : '#f87171' }}
                >
                  {healthData.providers.email.spfVerified ? '✓ SPF Verified' : '✗ SPF Missing'}
                </div>
                <div
                  style={{ color: healthData.providers.email.dkimVerified ? '#10b981' : '#f87171' }}
                >
                  {healthData.providers.email.dkimVerified ? '✓ DKIM Verified' : '✗ DKIM Missing'}
                </div>
                <div
                  style={{
                    color: healthData.providers.email.dmarcVerified ? '#10b981' : '#f87171',
                  }}
                >
                  {healthData.providers.email.dmarcVerified
                    ? '✓ DMARC Policy Active'
                    : '✗ DMARC Missing'}
                </div>
                <div
                  style={{ color: healthData.providers.email.tlsVerified ? '#10b981' : '#f87171' }}
                >
                  {healthData.providers.email.tlsVerified
                    ? '✓ Strict TLS Cipher'
                    : '✗ TLS Insecure'}
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#f1f5f9' }}>
                  Telecom (SMS/MMS/RCS) Readiness
                </h3>
                <span
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                  }}
                >
                  HEALTHY
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px 0' }}>
                Active Provider:{' '}
                <strong style={{ color: '#f8fafc' }}>
                  {healthData.providers.telecom.provider}
                </strong>
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  fontSize: '13px',
                }}
              >
                <div style={{ color: '#10b981' }}>✓ Outbound Transmission Allowed</div>
                <div style={{ color: '#10b981' }}>✓ 10DLC Brand Verified</div>
                <div style={{ color: '#10b981' }}>✓ Inbound STOP Webhook Active</div>
                <div style={{ color: '#10b981' }}>✓ TCPA Quiet Hours Guard Enforced</div>
              </div>
            </div>
          </div>

          {/* Explainable Health Metrics & Thresholds */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px 0', color: '#f1f5f9' }}
            >
              Explainable Deliverability Metrics & Safety Invariants
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px',
              }}
            >
              {Object.values(healthData.metrics).map((m) => {
                const color =
                  m.severity === 'critical'
                    ? '#ef4444'
                    : m.severity === 'warning'
                      ? '#f59e0b'
                      : m.severity === 'advisory'
                        ? '#38bdf8'
                        : '#10b981'

                return (
                  <div
                    key={m.key}
                    style={{
                      backgroundColor: '#131d31',
                      border: `1px solid ${color}`,
                      borderRadius: '6px',
                      padding: '14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        {m.title}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color,
                        }}
                      >
                        {m.severity}
                      </span>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color, marginTop: '6px' }}>
                      {m.formattedValue}
                    </div>
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '6px 0 0 0' }}>
                      {m.explanation}
                    </p>
                    {m.remediationAction && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#cbd5e1',
                          marginTop: '6px',
                          fontStyle: 'italic',
                        }}
                      >
                        Remediation: {m.remediationAction}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actionable Direct Remediations */}
          {healthData.remediationsAvailable.length > 0 && (
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  margin: '0 0 14px 0',
                  color: '#f1f5f9',
                }}
              >
                Direct Remediation Center
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {healthData.remediationsAvailable.map((rem) => (
                  <div
                    key={rem.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#131d31',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '12px 16px',
                    }}
                  >
                    <div>
                      <h5 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#f8fafc' }}>
                        {rem.title}
                      </h5>
                      <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                        {rem.description}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemediation(rem.actionKey, rem.title)}
                      style={{
                        backgroundColor: rem.severity === 'critical' ? '#ef4444' : '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Execute Fix
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB: SUPPRESSION LEDGER */}
      {activeTab === 'suppression' && (
        <section>
          <div style={{ marginBottom: '16px' }}>
            <h2
              style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: '0 0 4px 0' }}
            >
              Global & Channel Suppression Ledger
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Deterministic quarantine ledger enforcing hard bounce, complaint, and inbound STOP
              suppressions across all channels.
            </p>
          </div>
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
              overflowX: 'auto',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
                color: '#cbd5e1',
              }}
            >
              <thead>
                <tr
                  style={{ borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}
                >
                  <th style={{ padding: '8px 12px' }}>Identifier (Masked)</th>
                  <th style={{ padding: '8px 12px' }}>Channel</th>
                  <th style={{ padding: '8px 12px' }}>Reason</th>
                  <th style={{ padding: '8px 12px' }}>Suppression Date</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 12px' }}>user-****@example.org</td>
                  <td style={{ padding: '10px 12px' }}>Email</td>
                  <td style={{ padding: '10px 12px' }}>Hard Bounce (550 Mailbox Unavailable)</td>
                  <td style={{ padding: '10px 12px' }}>2026-09-20 14:22 UTC</td>
                  <td style={{ padding: '10px 12px', color: '#ef4444' }}>Permanently Suppressed</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 12px' }}>+1 (555) ***-9182</td>
                  <td style={{ padding: '10px 12px' }}>SMS / RCS</td>
                  <td style={{ padding: '10px 12px' }}>Inbound STOP Keyword</td>
                  <td style={{ padding: '10px 12px' }}>2026-09-21 09:15 UTC</td>
                  <td style={{ padding: '10px 12px', color: '#f59e0b' }}>Opt-Out Suppressed</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 12px' }}>subscriber-****@privacy.net</td>
                  <td style={{ padding: '10px 12px' }}>Email</td>
                  <td style={{ padding: '10px 12px' }}>Feedback Loop Complaint</td>
                  <td style={{ padding: '10px 12px' }}>2026-09-22 18:04 UTC</td>
                  <td style={{ padding: '10px 12px', color: '#ef4444' }}>Permanently Suppressed</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 4: FUNNELS & COHORTS */}
      {activeTab === 'funnels' && (
        <section>
          {/* Funnel Overview */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '16px',
              }}
            >
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
                  {funnelData.campaignTitle}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                  Channel:{' '}
                  <strong style={{ color: '#38bdf8' }}>{funnelData.channel.toUpperCase()}</strong> •
                  Provider: {funnelData.provider}
                </p>
              </div>

              <div
                style={{
                  backgroundColor: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid #38bdf8',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  color: '#7dd3fc',
                  maxWidth: '380px',
                }}
              >
                🔒 {funnelData.privacyNotice}
              </div>
            </div>

            {/* Funnel Stage Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {funnelData.stages.map((st, idx) => (
                <div
                  key={st.stage}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: '#131d31',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    gap: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#1e293b',
                      color: '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    {idx + 1}
                  </div>

                  <div style={{ width: '220px' }}>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '14px' }}>
                      {st.label}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {st.status.toUpperCase()} EVIDENCE
                    </div>
                  </div>

                  <div style={{ width: '160px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#38bdf8' }}>
                      {typeof st.count === 'number' ? st.count.toLocaleString() : st.count}
                    </div>
                  </div>

                  <div style={{ width: '120px', fontSize: '13px', color: '#cbd5e1' }}>
                    {st.rateFromTop !== null
                      ? `${(st.rateFromTop * 100).toFixed(1)}% of eligible`
                      : '—'}
                  </div>

                  <div style={{ flex: 1, fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                    {st.uncertainty || 'Direct factual log record'}
                  </div>
                </div>
              ))}
            </div>

            {/* Apple MPP Open Uncertainty Note */}
            <div
              style={{
                marginTop: '16px',
                backgroundColor: '#1e293b',
                borderRadius: '6px',
                padding: '12px 16px',
                fontSize: '12px',
                color: '#cbd5e1',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                <strong>Apple MPP & Proxy Open Range:</strong> Minimum Confirmed (Human-Active):{' '}
                <strong style={{ color: '#10b981' }}>
                  {funnelData.openUncertaintyRange.minimumConfirmed}
                </strong>{' '}
                | Maximum Possible (including proxy prefetch):{' '}
                <strong style={{ color: '#f59e0b' }}>
                  {funnelData.openUncertaintyRange.maximumPossible}
                </strong>
              </span>
              <span style={{ color: '#94a3b8' }}>
                Proxy Cached: {funnelData.openUncertaintyRange.proxyCachedCount}
              </span>
            </div>
          </div>

          {/* Cohort Breakdown Table under Privacy Thresholds */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
            }}
          >
            <h3
              style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 14px 0', color: '#f1f5f9' }}
            >
              Cohort & Subgroup Breakdown (Strict k-Anonymity ≥ 5)
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr
                  style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}
                >
                  <th style={{ padding: '8px 0' }}>Dimension</th>
                  <th>Cohort Label</th>
                  <th>Eligible</th>
                  <th>Delivered</th>
                  <th>Observed Opens</th>
                  <th>Observed Clicks</th>
                  <th>Conversions</th>
                  <th>Privacy Status</th>
                </tr>
              </thead>
              <tbody>
                {funnelData.cohortBreakdown.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td
                      style={{ padding: '10px 0', color: '#94a3b8', textTransform: 'capitalize' }}
                    >
                      {row.dimension}
                    </td>
                    <td style={{ fontWeight: 500, color: '#f8fafc' }}>{row.label}</td>
                    <td>{row.eligible}</td>
                    <td>{row.delivered}</td>
                    <td>{row.observedOpens}</td>
                    <td>{row.observedClicks}</td>
                    <td style={{ fontWeight: 600, color: row.isMasked ? '#f59e0b' : '#10b981' }}>
                      {row.conversions}
                    </td>
                    <td>
                      {row.isMasked ? (
                        <span
                          style={{
                            fontSize: '11px',
                            backgroundColor: 'rgba(245, 158, 11, 0.15)',
                            color: '#fde68a',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          Masked (&lt; 5)
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#6ee7b7',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          Clear
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 5: BOUNDED EXPERIMENTS */}
      {activeTab === 'experiments' && (
        <section>
          <div style={{ marginBottom: '16px' }}>
            <h2
              style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: '0 0 4px 0' }}
            >
              Deterministic A/B & Multivariate Experiments
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Deterministic recipient hashing, SRM guardrails, and operator-confirmed promotion
              rules.
            </p>
          </div>
          {/* Active Experiment Header */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <div
                  style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: activeExp.status === 'concluded' ? '#10b981' : '#38bdf8',
                      color: '#0f172a',
                    }}
                  >
                    {activeExp.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Window: {activeExp.windowHours}h • Primary Metric:{' '}
                    <strong>{activeExp.metric}</strong>
                  </span>
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                  {activeExp.title}
                </h3>
                <p
                  style={{
                    margin: '6px 0 0 0',
                    fontSize: '13px',
                    color: '#cbd5e1',
                    maxWidth: '700px',
                  }}
                >
                  <strong>Hypothesis:</strong> &ldquo;{activeExp.hypothesis}&rdquo;
                </p>
              </div>

              <div style={{ textAlign: 'right', fontSize: '12px', color: '#94a3b8' }}>
                <div>
                  Total Allocated: <strong>{activeExp.totalAllocated}</strong>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '11px', marginTop: '4px' }}>
                  Allocation Hash:{' '}
                  {activeExp.allocationsHash
                    ? activeExp.allocationsHash.slice(0, 16) + '...'
                    : 'pending'}
                </div>
              </div>
            </div>

            {/* Guardrail Status */}
            {guardrailCheck && guardrailCheck.warnings.length > 0 && (
              <div
                style={{
                  marginTop: '16px',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid #f59e0b',
                  color: '#fde68a',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                {guardrailCheck.warnings.map((w, idx) => (
                  <div key={idx}>⚠️ {w}</div>
                ))}
              </div>
            )}
          </div>

          {/* Variant Comparison Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '20px',
              marginBottom: '24px',
            }}
          >
            {activeExp.variants.map((variant) => {
              const convRate =
                variant.sampleSize > 0
                  ? ((variant.conversions / variant.sampleSize) * 100).toFixed(1)
                  : '0.0'
              const openRate =
                variant.sampleSize > 0
                  ? ((variant.observedOpens / variant.sampleSize) * 100).toFixed(1)
                  : '0.0'
              const isWinner = activeExp.winnerDecision.winningVariantId === variant.id

              return (
                <div
                  key={variant.id}
                  style={{
                    backgroundColor: '#0f172a',
                    border: isWinner ? '2px solid #10b981' : '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                      {variant.label}
                    </h4>
                    {isWinner && (
                      <span
                        style={{
                          backgroundColor: '#10b981',
                          color: '#0f172a',
                          fontWeight: 700,
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        🏆 WINNER
                      </span>
                    )}
                  </div>

                  {variant.subject && (
                    <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                      <strong>Subject:</strong> {variant.subject}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: '8px',
                      textAlign: 'center',
                      marginTop: '8px',
                    }}
                  >
                    <div
                      style={{ backgroundColor: '#131d31', padding: '10px', borderRadius: '6px' }}
                    >
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Sample Size</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                        {variant.sampleSize}
                      </div>
                    </div>
                    <div
                      style={{ backgroundColor: '#131d31', padding: '10px', borderRadius: '6px' }}
                    >
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Open Rate</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8' }}>
                        {openRate}%
                      </div>
                    </div>
                    <div
                      style={{ backgroundColor: '#131d31', padding: '10px', borderRadius: '6px' }}
                    >
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>Conversions</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981' }}>
                        {convRate}% ({variant.conversions})
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: '12px',
                      color: '#94a3b8',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Bounces: {variant.bounces}</span>
                    <span>Complaints: {variant.complaints}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Manual Winner Decision Station */}
          {activeExp.status !== 'concluded' ? (
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <h4
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 12px 0',
                  color: '#f1f5f9',
                }}
              >
                Manual Winner Decision & Approval Station
              </h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94a3b8' }}>
                Renegade CMS strictly prohibits unapproved automated winner switches. Review the
                statistical facts and record your explicit manual choice and rationale below.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 2fr',
                  gap: '16px',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#cbd5e1',
                      marginBottom: '6px',
                    }}
                  >
                    Winning Variant Selection:
                  </label>
                  <select
                    value={winnerChoice}
                    onChange={(e) => setWinnerChoice(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                    }}
                  >
                    {activeExp.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#cbd5e1',
                      marginBottom: '6px',
                    }}
                  >
                    Operator Decision Rationale (Mandatory Audit):
                  </label>
                  <input
                    type="text"
                    value={winnerRationale}
                    onChange={(e) => setWinnerRationale(e.target.value)}
                    placeholder="e.g. Variant A yielded 40% higher conversion with lower bounce noise..."
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}
              >
                <input
                  type="checkbox"
                  id="confirm-winner-box"
                  checked={winnerManualConfirmed}
                  onChange={(e) => setWinnerManualConfirmed(e.target.checked)}
                />
                <label htmlFor="confirm-winner-box" style={{ fontSize: '13px', color: '#cbd5e1' }}>
                  I confirm that I have reviewed the facts, sample sizes, and deliverability
                  metrics, and authorize this manual decision.
                </label>
              </div>

              <button
                onClick={() => handleDeclareWinner(activeExp.id)}
                disabled={!winnerManualConfirmed || !winnerRationale.trim()}
                style={{
                  backgroundColor:
                    winnerManualConfirmed && winnerRationale.trim() ? '#10b981' : '#334155',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor:
                    winnerManualConfirmed && winnerRationale.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Conclude Experiment & Record Winner
              </button>
            </div>
          ) : (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid #10b981',
                borderRadius: '8px',
                padding: '16px 20px',
                fontSize: '13px',
                color: '#6ee7b7',
              }}
            >
              <strong>Winner Declared:</strong> Variant &ldquo;
              {activeExp.winnerDecision.winningVariantId}&rdquo; confirmed by{' '}
              {activeExp.winnerDecision.decidedBy} at {activeExp.winnerDecision.decidedAt}.
              Rationale: &ldquo;{activeExp.winnerDecision.decisionRationale}&rdquo;
            </div>
          )}
        </section>
      )}

      {/* TAB: POLICIES */}
      {activeTab === 'policies' && (
        <section>
          <div style={{ marginBottom: '16px' }}>
            <h2
              style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: '0 0 4px 0' }}
            >
              TCPA Quiet Hours & Email Frequency Controls
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Automated recipient fatigue mitigation and telecom compliance windows.
            </p>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px',
            }}
          >
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#38bdf8', marginTop: 0 }}>
                TCPA Quiet Hours Window
              </h3>
              <p style={{ fontSize: '13px', color: '#cbd5e1' }}>
                Enforces no promotional SMS/RCS dispatches before 08:00 AM or after 09:00 PM in the
                recipient&apos;s local timezone.
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#10b981',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <span>✓ Active (Automated Reschedule to 08:00 AM Local)</span>
              </div>
            </div>
            <div
              style={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#38bdf8', marginTop: 0 }}>
                Email Frequency Fatigue Cap
              </h3>
              <p style={{ fontSize: '13px', color: '#cbd5e1' }}>
                Limits marketing dispatches to a maximum of 3 messages per rolling 7-day period per
                verified subscriber.
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#10b981',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <span>✓ Active (3 Dispatches / 7-Day Rolling Ceiling)</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB: AUDIT LEDGER */}
      {activeTab === 'audit' && (
        <section>
          <div style={{ marginBottom: '16px' }}>
            <h2
              style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: '0 0 4px 0' }}
            >
              Immutable Consent & Delivery Provenance
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Cryptographically verifiable consent logs, double opt-in proofs, and transactional
              outbox provenance.
            </p>
          </div>
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
              overflowX: 'auto',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
                color: '#cbd5e1',
              }}
            >
              <thead>
                <tr
                  style={{ borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}
                >
                  <th style={{ padding: '8px 12px' }}>Timestamp</th>
                  <th style={{ padding: '8px 12px' }}>Event Type</th>
                  <th style={{ padding: '8px 12px' }}>Subject Hash</th>
                  <th style={{ padding: '8px 12px' }}>Legal Proof / Token Hash</th>
                  <th style={{ padding: '8px 12px' }}>IP / Header Provenance</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 12px' }}>2026-09-23 20:14:02 UTC</td>
                  <td style={{ padding: '10px 12px', color: '#10b981' }}>
                    Double Opt-In Confirmed
                  </td>
                  <td style={{ padding: '10px 12px' }}>sha256:8f2a...c01e</td>
                  <td style={{ padding: '10px 12px' }}>token:e2e-doi-49a...</td>
                  <td style={{ padding: '10px 12px' }}>127.0.0.1 (Direct Form)</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px 12px' }}>2026-09-23 19:40:11 UTC</td>
                  <td style={{ padding: '10px 12px', color: '#38bdf8' }}>Newsletter Dispatched</td>
                  <td style={{ padding: '10px 12px' }}>sha256:d11c...749b</td>
                  <td style={{ padding: '10px 12px' }}>msg:smtp-250-ok-renegade</td>
                  <td style={{ padding: '10px 12px' }}>Direct-to-MX TLS</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 12px' }}>2026-09-23 18:10:55 UTC</td>
                  <td style={{ padding: '10px 12px', color: '#f59e0b' }}>
                    Preference Center Updated
                  </td>
                  <td style={{ padding: '10px 12px' }}>sha256:4a02...bb31</td>
                  <td style={{ padding: '10px 12px' }}>token:pref-access-91b...</td>
                  <td style={{ padding: '10px 12px' }}>Bearer Auth Token</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 6: PRIVACY ATTRIBUTION & LINKS */}
      {activeTab === 'attribution' && (
        <section>
          {/* Privacy-Preserving Link Generator */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 12px 0', color: '#f1f5f9' }}
            >
              First-Party Campaign Link Generator
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94a3b8' }}>
              Generates honest, clean first-party attribution links (`rcid`, `rcch`, `rcvar`).
              Supports immediate &ldquo;Direct-Link / Tracking-Off&rdquo; for visitors who opt out.
              Zero third-party ad networks or fingerprinting.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '16px',
                marginBottom: '14px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#cbd5e1',
                    marginBottom: '6px',
                  }}
                >
                  Destination URL:
                </label>
                <input
                  type="text"
                  value={testUrlBase}
                  onChange={(e) => setTestUrlBase(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#cbd5e1',
                    marginBottom: '6px',
                  }}
                >
                  Campaign Identifier (rcid):
                </label>
                <input
                  type="text"
                  value={testCampaignId}
                  onChange={(e) => setTestCampaignId(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>

            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}
            >
              <input
                type="checkbox"
                id="direct-only-check"
                checked={testDirectOnly}
                onChange={(e) => setTestDirectOnly(e.target.checked)}
              />
              <label htmlFor="direct-only-check" style={{ fontSize: '13px', color: '#cbd5e1' }}>
                <strong>Direct-Link / Tracking-Off:</strong> Strip all campaign and tracking
                parameters for privacy opt-outs.
              </label>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  marginBottom: '6px',
                }}
              >
                Generated Output URL:
              </label>
              <div
                style={{
                  backgroundColor: '#131d31',
                  border: '1px solid #334155',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  color: '#38bdf8',
                  wordBreak: 'break-all',
                }}
              >
                {computedTrackingUrl}
              </div>
            </div>
          </div>

          {/* Bot Scanner Classifier Sandbox */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
            }}
          >
            <h3
              style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 12px 0', color: '#f1f5f9' }}
            >
              Bot Click & Prefetch Inspector
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94a3b8' }}>
              Test how the AUD-07 bot filtering engine identifies corporate email scanners (e.g.
              Barracuda, Mimecast) and HTTP Purpose: prefetch headers to protect engagement counts
              from false inflation.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '16px',
                marginBottom: '14px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#cbd5e1',
                    marginBottom: '6px',
                  }}
                >
                  Test User-Agent String:
                </label>
                <input
                  type="text"
                  value={testUserAgent}
                  onChange={(e) => setTestUserAgent(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    onClick={() =>
                      setTestUserAgent(
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                      )
                    }
                    style={{
                      fontSize: '11px',
                      background: '#1e293b',
                      color: '#38bdf8',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Preset: Chrome Browser
                  </button>
                  <button
                    onClick={() =>
                      setTestUserAgent(
                        'Mozilla/5.0 (compatible; Barracuda-Sentinel/1.0; +http://barracuda.com)',
                      )
                    }
                    style={{
                      fontSize: '11px',
                      background: '#1e293b',
                      color: '#38bdf8',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Preset: Barracuda Scanner
                  </button>
                  <button
                    onClick={() =>
                      setTestUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)')
                    }
                    style={{
                      fontSize: '11px',
                      background: '#1e293b',
                      color: '#38bdf8',
                      border: 'none',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Preset: Googlebot
                  </button>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#cbd5e1',
                    marginBottom: '6px',
                  }}
                >
                  HTTP Header Purpose:
                </label>
                <input
                  type="text"
                  value={testHeaderPurpose}
                  onChange={(e) => setTestHeaderPurpose(e.target.value)}
                  placeholder="e.g. prefetch (or empty)"
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                backgroundColor: botClassification.isBot
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(16, 185, 129, 0.1)',
                border: `1px solid ${botClassification.isBot ? '#f59e0b' : '#10b981'}`,
                borderRadius: '6px',
                padding: '14px 18px',
                fontSize: '13px',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    color: botClassification.isBot ? '#fde68a' : '#6ee7b7',
                  }}
                >
                  Classification:{' '}
                  {botClassification.isBot
                    ? `🤖 BOT DETECTED (${botClassification.botType.toUpperCase()})`
                    : '👤 HUMAN ENGAGEMENT'}
                </span>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8' }}>
                  Confidence: {botClassification.confidence}
                </span>
              </div>
              <p style={{ margin: '6px 0 0 0', color: '#cbd5e1' }}>{botClassification.reason}</p>
            </div>
          </div>
        </section>
      )}

      {/* TAB 7: METRIC DICTIONARY */}
      {activeTab === 'dictionary' && (
        <section>
          {/* Dictionary Filters */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '14px 20px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                value={dictionarySearch}
                onChange={(e) => setDictionarySearch(e.target.value)}
                placeholder="Search metrics, definitions, or formulas..."
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  width: '320px',
                }}
              />

              <select
                value={dictionaryCategory}
                onChange={(e) => setDictionaryCategory(e.target.value)}
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#cbd5e1',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                <option value="all">All Categories</option>
                <option value="acquisition">Acquisition</option>
                <option value="deliverability">Deliverability</option>
                <option value="engagement">Engagement</option>
                <option value="retention">Retention</option>
                <option value="conversion">Conversion</option>
              </select>
            </div>

            <div style={{ fontSize: '13px', color: '#94a3b8' }}>
              Showing {filteredDictionary.length} of {AUDIENCE_METRIC_DICTIONARY.length} formal
              definitions
            </div>
          </div>

          {/* Dictionary Table */}
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '20px',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr
                  style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}
                >
                  <th style={{ padding: '8px 0', width: '220px' }}>Metric Key & Label</th>
                  <th style={{ width: '120px' }}>Category</th>
                  <th style={{ width: '220px' }}>Formula & Denominator</th>
                  <th>Operational Definition & Caveats</th>
                </tr>
              </thead>
              <tbody>
                {filteredDictionary.map((entry) => (
                  <tr key={entry.key} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '12px 0', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{entry.label}</div>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          color: '#38bdf8',
                          marginTop: '2px',
                        }}
                      >
                        {entry.key}
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          backgroundColor: '#1e293b',
                          color: '#94a3b8',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          display: 'inline-block',
                          marginTop: '4px',
                        }}
                      >
                        {entry.channel}
                      </span>
                    </td>

                    <td
                      style={{
                        verticalAlign: 'top',
                        textTransform: 'capitalize',
                        color: '#cbd5e1',
                      }}
                    >
                      {entry.category}
                    </td>

                    <td style={{ verticalAlign: 'top' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#f1f5f9' }}>
                        {entry.formula}
                      </div>
                      {entry.denominator && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                          Denom: {entry.denominator}
                        </div>
                      )}
                      {entry.uncertaintyLabel && (
                        <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px' }}>
                          ⚠️ {entry.uncertaintyLabel}
                        </div>
                      )}
                    </td>

                    <td style={{ verticalAlign: 'top' }}>
                      <div style={{ color: '#e2e8f0', marginBottom: '6px' }}>
                        {entry.definition}
                      </div>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: '16px',
                          fontSize: '11px',
                          color: '#94a3b8',
                        }}
                      >
                        {entry.caveats.map((c, cIdx) => (
                          <li key={cIdx}>{c}</li>
                        ))}
                      </ul>
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                        Source: {entry.source}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 8: REPORTS & PRIVACY EXPORTS */}
      {activeTab === 'reports' && (
        <section>
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '24px',
            }}
          >
            <h3
              style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 12px 0', color: '#f8fafc' }}
            >
              Privacy-Safe CSV & Operational Reports
            </h3>
            <p
              style={{
                margin: '0 0 20px 0',
                fontSize: '13px',
                color: '#94a3b8',
                maxWidth: '720px',
              }}
            >
              Renegade CMS enforces k-anonymity privacy thresholds. Any group or cohort with fewer
              than 5 subjects is strictly masked as &ldquo;{PRIVACY_MASKED_VALUE}&rdquo;. Sensitive
              form answers, individual contact engagement, and tracking cookies are never exported
              in aggregate reports.
            </p>

            <div
              style={{
                backgroundColor: '#131d31',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '16px 20px',
                marginBottom: '20px',
              }}
            >
              <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#f8fafc' }}>
                Export Configuration
              </h5>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px' }}>
                <div>
                  Site: <strong style={{ color: '#38bdf8' }}>{siteId}</strong>
                </div>
                <div>
                  Role: <strong style={{ color: '#10b981' }}>administrator</strong>
                </div>
                <div>
                  Window: <strong style={{ color: '#f8fafc' }}>{timeWindow.toUpperCase()}</strong>
                </div>
                <div>
                  Privacy Threshold: <strong style={{ color: '#f59e0b' }}>≥ 5 subjects</strong>
                </div>
              </div>
            </div>

            <button
              onClick={handleExportCsv}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Download Operational Summary (CSV)
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
