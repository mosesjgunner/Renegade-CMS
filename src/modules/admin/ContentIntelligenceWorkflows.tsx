'use client'

import React, { useEffect, useState, useCallback } from 'react'
import type {
  CannibalizationCandidate,
  ContentBrief,
  ContentDecaySignal,
  CoverageGap,
  InformationGainAssessment,
  TopicAuthorityHub,
} from '../intelligence/workflows/contracts'
import EditorialClaimSchemaReview from './EditorialClaimSchemaReview'
import SearchConsoleCenter from './SearchConsoleCenter'
import { useAdminSiteID } from './site-context'

type Tab =
  | 'e2e_example'
  | 'authority'
  | 'briefs'
  | 'information_gain'
  | 'cannibalization'
  | 'decay'
  | 'coverage_gaps'
  | 'claim_review'
  | 'search_console'

export interface EndToEndExampleData {
  targetContent: {
    id: string
    title: string
    canonicalPath: string
    contentType: string
    wordCount: number
    publishedAt: string | null
  }
  topicHub: TopicAuthorityHub | null
  contentBrief: ContentBrief | null
  informationGain: InformationGainAssessment | null
  cannibalization: CannibalizationCandidate | null
  decaySignal: ContentDecaySignal | null
  coverageGaps: CoverageGap[]
}

export default function ContentIntelligenceWorkflows({
  initialSiteId,
}: {
  initialSiteId?: string
} = {}) {
  const searchSiteId = useAdminSiteID()
  const [siteId, setSiteId] = useState<string>(initialSiteId || searchSiteId || '')
  const [activeTab, setActiveTab] = useState<Tab>('e2e_example')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  // Data states
  const [authorityMaps, setAuthorityMaps] = useState<TopicAuthorityHub[]>([])
  const [cannibalizationCandidates, setCannibalizationCandidates] = useState<
    CannibalizationCandidate[]
  >([])
  const [decaySignals, setDecaySignals] = useState<ContentDecaySignal[]>([])
  const [coverageGaps, setCoverageGaps] = useState<CoverageGap[]>([])
  const [e2eExample, setE2eExample] = useState<EndToEndExampleData | null>(null)

  // Brief state
  const [selectedTopicId, setSelectedTopicId] = useState<string>('')
  const [proposedTitle, setProposedTitle] = useState<string>('')
  const [userAngle, setUserAngle] = useState<string>('')
  const [generatedBrief, setGeneratedBrief] = useState<ContentBrief | null>(null)
  const [generatingBrief, setGeneratingBrief] = useState(false)

  // Information Gain state
  const [selectedContentId, setSelectedContentId] = useState<string>('')
  const [gainAssessment, setGainAssessment] = useState<InformationGainAssessment | null>(null)
  const [assessingGain, setAssessingGain] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = siteId
        ? `/api/admin/intelligence/workflows?siteId=${encodeURIComponent(siteId)}`
        : '/api/admin/intelligence/workflows'
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Failed to load workflows: ${res.statusText}`)
      }
      const data = await res.json()
      if (data.siteId && !siteId) {
        setSiteId(data.siteId)
      }
      setAuthorityMaps(data.authorityMaps || [])
      setCannibalizationCandidates(data.cannibalizationCandidates || [])
      setDecaySignals(data.decaySignals || [])
      setCoverageGaps(data.coverageGaps || [])
      if (data.e2eExample) {
        setE2eExample(data.e2eExample)
      }

      if (data.authorityMaps && data.authorityMaps.length > 0) {
        setSelectedTopicId(data.authorityMaps[0].topicId)
        if (data.authorityMaps[0].hubContent) {
          setSelectedContentId(data.authorityMaps[0].hubContent.id)
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => {
    const nextSite = initialSiteId || searchSiteId || ''
    if (nextSite && nextSite !== siteId) {
      setSiteId(nextSite)
    }
  }, [initialSiteId, searchSiteId, siteId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Execute editorial action (dismiss, defer, merge, create_task)
  const handleEditorialAction = async (
    action: 'dismiss' | 'defer' | 'merge' | 'create_task',
    findingType: 'cannibalization' | 'decay' | 'coverage_gap' | 'hub_health',
    findingId: string,
    extraConfig?: Record<string, unknown>,
  ) => {
    try {
      const res = await fetch('/api/admin/intelligence/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'editorial-action',
          workflowAction: action,
          findingType,
          findingId,
          siteId: siteId || 'default-site',
          ...extraConfig,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Action failed')

      setActionMessage(
        result.details?.message ||
          `Action ${action} executed successfully. Published content remains unchanged.`,
      )
      setTimeout(() => setActionMessage(null), 8000)

      // Refresh data
      void loadData()
    } catch (err: unknown) {
      alert(`Action error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Generate Content Brief
  const handleGenerateBrief = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTopicId || !proposedTitle) return
    setGeneratingBrief(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/intelligence/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-brief',
          siteId: siteId || 'default-site',
          topicId: selectedTopicId,
          proposedTitle,
          userAngle: userAngle || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Brief generation failed')
      setGeneratedBrief(result.brief)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGeneratingBrief(false)
    }
  }

  // Assess Information Gain
  const handleAssessGain = async () => {
    if (!selectedContentId) return
    setAssessingGain(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/intelligence/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assess-information-gain',
          siteId: siteId || 'default-site',
          contentId: selectedContentId,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Assessment failed')
      setGainAssessment(result.assessment)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAssessingGain(false)
    }
  }

  return (
    <div
      style={{ padding: '2rem', maxWidth: '1280px', margin: '0 auto', fontFamily: 'sans-serif' }}
    >
      <header
        style={{
          marginBottom: '2rem',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '1.25rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, margin: 0, color: '#111827' }}>
              Content Intelligence Workflows
            </h1>
            <p style={{ color: '#4b5563', marginTop: '0.35rem', fontSize: '0.95rem' }}>
              Topic hubs, briefs, qualitative originality analysis, intent-grounded cannibalization,
              and content decay diagnostics.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span
              style={{
                background: '#f3f4f6',
                color: '#374151',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              Site: {siteId || 'Auto-resolved'}
            </span>
            <button
              type="button"
              onClick={() => void loadData()}
              style={{
                background: '#ffffff',
                border: '1px solid #d1d5db',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
              }}
            >
              Refresh Workflows
            </button>
          </div>
        </div>
      </header>

      {actionMessage && (
        <div
          role="status"
          style={{
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
            padding: '0.85rem 1.25rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>✓</span>
          <span>{actionMessage}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            padding: '0.85rem 1.25rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Content Intelligence Workflows"
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '2px solid #e5e7eb',
          marginBottom: '2rem',
          overflowX: 'auto',
        }}
      >
        {[
          { key: 'e2e_example', label: '🌟 End-to-End Walkthrough' },
          { key: 'authority', label: `Topic Authority (${authorityMaps.length})` },
          { key: 'briefs', label: 'Content Briefs' },
          { key: 'information_gain', label: 'Information Gain' },
          {
            key: 'cannibalization',
            label: `Cannibalization (${cannibalizationCandidates.length})`,
          },
          { key: 'decay', label: `Content Decay (${decaySignals.length})` },
          { key: 'coverage_gaps', label: `Coverage Gaps (${coverageGaps.length})` },
          { key: 'claim_review', label: 'Claim & Schema Review' },
          { key: 'search_console', label: 'Search Console & Performance' },
        ].map((tab) => (
          <button
            key={tab.key}
            id={`tab-${tab.key}`}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`tabpanel-${tab.key}`}
            type="button"
            onClick={() => setActiveTab(tab.key as Tab)}
            style={{
              padding: '0.75rem 1.25rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? '#2563eb' : '#6b7280',
              borderBottom: activeTab === tab.key ? '3px solid #2563eb' : 'none',
              marginBottom: '-2px',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}
        >
          Loading content intelligence diagnostics...
        </div>
      ) : (
        <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
          {/* TAB 0: END-TO-END WALKTHROUGH */}
          {activeTab === 'e2e_example' && (
            <div>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  marginBottom: '2rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <span
                      style={{
                        background: '#e0e7ff',
                        color: '#3730a3',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      End-to-End Workflow Demonstration
                    </span>
                    <h2
                      style={{
                        fontSize: '1.4rem',
                        fontWeight: 700,
                        margin: '0.5rem 0 0.25rem 0',
                        color: '#0f172a',
                      }}
                    >
                      {e2eExample?.targetContent.title || 'Existing Published Article'}
                    </h2>
                    <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>
                      Canonical Path:{' '}
                      <code>
                        {e2eExample?.targetContent.canonicalPath || '/notes/demo-field-report'}
                      </code>{' '}
                      | Word Count: {e2eExample?.targetContent.wordCount || 520} words | Status:
                      Published
                    </p>
                  </div>
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      color: '#334155',
                    }}
                  >
                    <strong>Safety Standard:</strong> Published body content is preserved intact.
                  </div>
                </div>
              </div>

              {/* 1. Hub & Authority Context */}
              <div
                style={{
                  marginBottom: '2rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  background: '#ffffff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
                    1. Topic Hub &amp; Authority Position
                  </h3>
                  <span
                    style={{
                      background: '#dbeafe',
                      color: '#1e40af',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    Tier: {e2eExample?.topicHub?.tier || 'emerging'} (Score:{' '}
                    {e2eExample?.topicHub?.authorityScore || 40}/100)
                  </span>
                </div>
                <p style={{ color: '#475569', fontSize: '0.9rem', margin: '0 0 0.75rem 0' }}>
                  Topic Cluster: <strong>{e2eExample?.topicHub?.topicName || 'General'}</strong> |
                  Spokes: {e2eExample?.topicHub?.spokes.length || 1} articles | Internal Links:{' '}
                  {e2eExample?.topicHub?.evidence.internalLinksTotal || 0}
                </p>
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    color: '#334155',
                  }}
                >
                  <strong>Cluster Health Note:</strong>{' '}
                  {e2eExample?.topicHub?.evidence.notes ||
                    'Cluster anchor page verified with clean internal linking paths.'}
                </div>
              </div>

              {/* 2. Evidence-Grounded Content Brief */}
              <div
                style={{
                  marginBottom: '2rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  background: '#ffffff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
                    2. Content Brief: Evidence vs. Generated Suggestions
                  </h3>
                  <span
                    style={{
                      background: '#dcfce7',
                      color: '#166534',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    ✓ Grounded Evidence
                  </span>
                </div>
                <p style={{ color: '#475569', fontSize: '0.9rem', margin: '0 0 0.75rem 0' }}>
                  <strong>Proposed Title:</strong>{' '}
                  {e2eExample?.contentBrief?.proposedTitle || 'Operational Verification Guide'} |{' '}
                  <strong>Intent:</strong>{' '}
                  {e2eExample?.contentBrief?.searchIntent || 'informational'} |{' '}
                  <strong>Target Audience:</strong> {e2eExample?.contentBrief?.targetAudience}
                </p>
                <div
                  style={{
                    background: '#fefce8',
                    border: '1px solid #fef08a',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                  }}
                >
                  <strong>Specific Gap Filled:</strong>{' '}
                  {e2eExample?.contentBrief?.specificGapFilled}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Verified Evidence */}
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '1rem',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#0f172a', fontSize: '0.95rem' }}>
                      Verified Evidence Base
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 0.5rem 0' }}>
                      {e2eExample?.contentBrief?.evidence.evidenceSummary}
                    </p>
                    <div style={{ fontSize: '0.825rem' }}>
                      <strong>Adjacent Pages:</strong>
                      <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                        {e2eExample?.contentBrief?.evidence.competingPages.map((p) => (
                          <li key={p.id}>
                            {p.title} (<code>{p.canonicalPath}</code>)
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Generated Editorial Suggestions */}
                  <div
                    style={{
                      background: '#f0fdf4',
                      padding: '1rem',
                      borderRadius: '6px',
                      border: '1px solid #bbf7d0',
                    }}
                  >
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#166534', fontSize: '0.95rem' }}>
                      Generated Editorial Suggestions
                    </h4>
                    <div style={{ fontSize: '0.825rem', marginBottom: '0.5rem' }}>
                      <strong>Key Questions to Address:</strong>
                      <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                        {e2eExample?.contentBrief?.generatedSuggestions.questionsToAnswer
                          .slice(0, 3)
                          .map((q, idx) => (
                            <li key={idx}>{q}</li>
                          ))}
                      </ul>
                    </div>
                    <div style={{ fontSize: '0.825rem' }}>
                      <strong>Suggested Internal Links:</strong>
                      <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                        {e2eExample?.contentBrief?.generatedSuggestions.suggestedInternalLinks.map(
                          (l, idx) => (
                            <li key={idx}>
                              Link to &quot;{l.targetTitle}&quot; with anchor{' '}
                              <em>&quot;{l.suggestedAnchor}&quot;</em>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Qualitative Information Gain Assessment */}
              <div
                style={{
                  marginBottom: '2rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  background: '#ffffff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
                    3. Qualitative Information-Gain Assessment
                  </h3>
                  <span
                    style={{
                      background:
                        e2eExample?.informationGain?.qualitativeGainTier === 'high_originality'
                          ? '#dcfce7'
                          : e2eExample?.informationGain?.qualitativeGainTier ===
                              'insufficient_evidence'
                            ? '#fee2e2'
                            : '#fef3c7',
                      color:
                        e2eExample?.informationGain?.qualitativeGainTier === 'high_originality'
                          ? '#166534'
                          : e2eExample?.informationGain?.qualitativeGainTier ===
                              'insufficient_evidence'
                            ? '#991b1b'
                            : '#92400e',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    Tier:{' '}
                    {e2eExample?.informationGain?.qualitativeGainTier.replace('_', ' ') ||
                      'Moderate Gain'}
                  </span>
                </div>
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    color: '#334155',
                    marginBottom: '1rem',
                  }}
                >
                  <p style={{ margin: '0 0 0.5rem 0' }}>
                    {e2eExample?.informationGain?.explanation}
                  </p>
                  <p
                    style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}
                  >
                    * Originality standard: Compared against cluster benchmark material. Unsupported
                    numeric scores are never presented as objective measures of originality.
                  </p>
                </div>

                <div
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}
                >
                  <div
                    style={{
                      background: '#f0fdf4',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #bbf7d0',
                      fontSize: '0.825rem',
                    }}
                  >
                    <strong style={{ color: '#166534' }}>Novel Insights:</strong>
                    <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                      {e2eExample?.informationGain?.novelInsights.map((n, idx) => (
                        <li key={idx}>
                          <strong>{n.concept}:</strong> {n.explanation}
                        </li>
                      )) || <li>None vs reference material.</li>}
                    </ul>
                  </div>
                  <div
                    style={{
                      background: '#fffbeb',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #fde68a',
                      fontSize: '0.825rem',
                    }}
                  >
                    <strong style={{ color: '#92400e' }}>Redundant Points:</strong>
                    <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                      {e2eExample?.informationGain?.redundantPoints.map((r, idx) => (
                        <li key={idx}>
                          <strong>{r.concept}:</strong> Overlaps with {r.overlapWith}
                        </li>
                      )) || <li>No duplicate concepts.</li>}
                    </ul>
                  </div>
                  <div
                    style={{
                      background: '#eff6ff',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #bfdbfe',
                      fontSize: '0.825rem',
                    }}
                  >
                    <strong style={{ color: '#1e40af' }}>Missing Angles:</strong>
                    <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                      {e2eExample?.informationGain?.missingAngles.map((m, idx) => (
                        <li key={idx}>
                          <strong>{m.concept}:</strong> {m.rationale}
                        </li>
                      )) || <li>Complete coverage.</li>}
                    </ul>
                  </div>
                </div>
              </div>

              {/* 4. Cannibalization Candidate & Intent Overlap */}
              <div
                style={{
                  marginBottom: '2rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  background: '#ffffff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
                    4. Cannibalization &amp; Query Collision
                  </h3>
                  <span
                    style={{
                      background: e2eExample?.cannibalization?.hasQueryData ? '#dbeafe' : '#fef3c7',
                      color: e2eExample?.cannibalization?.hasQueryData ? '#1e40af' : '#92400e',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    {e2eExample?.cannibalization?.hasQueryData
                      ? '✓ Verified Query Data'
                      : '⚠️ Insufficient Query Data'}
                  </span>
                </div>
                {e2eExample?.cannibalization ? (
                  <div>
                    <p style={{ fontSize: '0.9rem', color: '#334155', margin: '0 0 0.5rem 0' }}>
                      Comparing &quot;{e2eExample.cannibalization.pageA.title}&quot; vs &quot;
                      {e2eExample.cannibalization.pageB.title}&quot;
                    </p>
                    <div
                      style={{
                        background: '#f8fafc',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        color: '#475569',
                      }}
                    >
                      <p style={{ margin: '0 0 0.25rem 0' }}>
                        {e2eExample.cannibalization.evidence.intentOverlapExplanation}
                      </p>
                      <p style={{ margin: 0, fontStyle: 'italic', color: '#64748b' }}>
                        {e2eExample.cannibalization.evidence.queryOverlapExplanation}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: '#166534', margin: 0 }}>
                    No cannibalization conflicts detected for this content item.
                  </p>
                )}
              </div>

              {/* 5. Content Decay Diagnostics */}
              <div
                style={{
                  marginBottom: '2rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  background: '#ffffff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
                    5. Content Decay Signal Diagnosis
                  </h3>
                  <span
                    style={{
                      background:
                        e2eExample?.decaySignal?.diagnosis === 'genuine_decay'
                          ? '#fee2e2'
                          : e2eExample?.decaySignal?.diagnosis === 'tracking_gap'
                            ? '#ffedd5'
                            : '#f1f5f9',
                      color:
                        e2eExample?.decaySignal?.diagnosis === 'genuine_decay'
                          ? '#991b1b'
                          : e2eExample?.decaySignal?.diagnosis === 'tracking_gap'
                            ? '#9a3412'
                            : '#334155',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    Diagnosis: {e2eExample?.decaySignal?.diagnosis.replace('_', ' ') || 'stable'}
                  </span>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#334155', margin: '0 0 0.5rem 0' }}>
                  {e2eExample?.decaySignal?.evidence.notes ||
                    'Content performance is healthy and stable over historical periods.'}
                </p>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  <strong>Diagnostic Standard:</strong> Traffic trends are explicitly checked
                  against URL migrations, analytics consent gaps, and seasonality before flagging
                  genuine content decay.
                </div>
              </div>

              {/* 6. Safe Editorial Action Console */}
              <div
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  background: '#f8fafc',
                }}
              >
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem', color: '#0f172a' }}>
                  6. Editorial Decision Controls (Safe Execution)
                </h3>
                <p style={{ color: '#475569', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                  Editors can dismiss, defer, merge, or create tasks without mutating or silently
                  modifying published content bodies.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() =>
                      handleEditorialAction(
                        'dismiss',
                        'cannibalization',
                        e2eExample?.cannibalization?.id || 'demo-finding-1',
                      )
                    }
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      background: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Dismiss Finding
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleEditorialAction(
                        'defer',
                        'decay',
                        e2eExample?.targetContent.id || 'demo-content-1',
                      )
                    }
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      background: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Defer (30 Days)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleEditorialAction(
                        'merge',
                        'cannibalization',
                        e2eExample?.cannibalization?.id || 'demo-merge-1',
                        {
                          mergeConfig: {
                            sourceId:
                              e2eExample?.cannibalization?.pageB.id || e2eExample?.targetContent.id,
                            targetId:
                              e2eExample?.cannibalization?.pageA.id || e2eExample?.targetContent.id,
                            redirectType: '308',
                          },
                        },
                      )
                    }
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid #2563eb',
                      background: '#eff6ff',
                      color: '#2563eb',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Merge via 308 Redirect (Preserve Body)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleEditorialAction('create_task', 'coverage_gap', 'demo-task-1', {
                        taskConfig: {
                          title: `Editorial Task: Refresh & Expand ${e2eExample?.targetContent.title}`,
                          notes: 'Deepen entity coverage and answer user intent questions.',
                          priority: 'medium',
                        },
                      })
                    }
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#2563eb',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Create Editorial Task
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: TOPIC AUTHORITY MAPS */}
          {activeTab === 'authority' && (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                  gap: '1.5rem',
                }}
              >
                {authorityMaps.length === 0 ? (
                  <p style={{ color: '#6b7280' }}>No topics found in graph projection.</p>
                ) : (
                  authorityMaps.map((hub) => (
                    <div
                      key={hub.topicId}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1.25rem',
                        background: '#ffffff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
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
                          <h2
                            style={{
                              fontSize: '1.15rem',
                              fontWeight: 600,
                              margin: 0,
                              color: '#111827',
                            }}
                          >
                            {hub.topicName}
                          </h2>
                          <span
                            style={{
                              display: 'inline-block',
                              marginTop: '0.35rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              background:
                                hub.tier === 'pillar'
                                  ? '#dbeafe'
                                  : hub.tier === 'authoritative'
                                    ? '#dcfce7'
                                    : hub.tier === 'emerging'
                                      ? '#fef9c3'
                                      : '#f3f4f6',
                              color:
                                hub.tier === 'pillar'
                                  ? '#1e40af'
                                  : hub.tier === 'authoritative'
                                    ? '#166534'
                                    : hub.tier === 'emerging'
                                      ? '#854d0e'
                                      : '#374151',
                            }}
                          >
                            Tier: {hub.tier} (Score: {hub.authorityScore}/100)
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                            Completeness
                          </span>
                          <div style={{ fontWeight: 600, fontSize: '1rem', color: '#111827' }}>
                            {Math.round(hub.topicalCompleteness * 100)}%
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#4b5563' }}>
                        <div>
                          <strong>Hub:</strong>{' '}
                          {hub.hubContent ? hub.hubContent.title : 'None (Cluster unanchored)'}
                        </div>
                        <div>
                          <strong>Spokes:</strong> {hub.spokes.length} articles (
                          {hub.evidence.internalLinksTotal} internal links)
                        </div>
                        <div>
                          <strong>Entities:</strong>{' '}
                          {hub.evidence.entitiesCovered.join(', ') || 'None tagged'}
                        </div>
                      </div>

                      {hub.recommendations.length > 0 && (
                        <div
                          style={{
                            marginTop: '1rem',
                            background: '#f9fafb',
                            padding: '0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.825rem',
                          }}
                        >
                          <strong>Actionable Growth Steps:</strong>
                          <ul style={{ margin: '0.35rem 0 0 1rem', padding: 0 }}>
                            {hub.recommendations.map((rec, i) => (
                              <li key={i}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CONTENT BRIEFS */}
          {activeTab === 'briefs' && (
            <div>
              <form
                onSubmit={handleGenerateBrief}
                style={{
                  background: '#f9fafb',
                  padding: '1.5rem',
                  borderRadius: '8px',
                  marginBottom: '2rem',
                  border: '1px solid #e5e7eb',
                }}
              >
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
                  Generate Evidence-Grounded Content Brief
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 2fr',
                    gap: '1rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        marginBottom: '0.25rem',
                      }}
                    >
                      Target Topic
                    </label>
                    <select
                      value={selectedTopicId}
                      onChange={(e) => setSelectedTopicId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                      }}
                    >
                      {authorityMaps.map((hub) => (
                        <option key={hub.topicId} value={hub.topicId}>
                          {hub.topicName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        marginBottom: '0.25rem',
                      }}
                    >
                      Proposed Working Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Practical Guide to Resilient Microservice Deployment"
                      value={proposedTitle}
                      onChange={(e) => setProposedTitle(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                      }}
                      required
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      marginBottom: '0.25rem',
                    }}
                  >
                    Specific Editorial Angle / Differentiation (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Focus on zero-downtime database cutovers with rollback proof"
                    value={userAngle}
                    onChange={(e) => setUserAngle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={generatingBrief}
                  style={{
                    padding: '0.6rem 1.25rem',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {generatingBrief ? 'Compiling Brief...' : 'Generate Brief'}
                </button>
              </form>

              {generatedBrief && (
                <div
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    background: '#ffffff',
                  }}
                >
                  <div
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      paddingBottom: '1rem',
                      marginBottom: '1rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <h2 style={{ margin: 0, fontSize: '1.35rem' }}>
                        {generatedBrief.proposedTitle}
                      </h2>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          background: '#e0e7ff',
                          color: '#3730a3',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                        }}
                      >
                        Intent: {generatedBrief.searchIntent}
                      </span>
                    </div>
                    <p style={{ color: '#4b5563', margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
                      <strong>Audience:</strong> {generatedBrief.targetAudience}
                    </p>
                    <p
                      style={{
                        color: '#1f2937',
                        margin: '0.5rem 0 0 0',
                        fontSize: '0.9rem',
                        background: '#fefce8',
                        padding: '0.5rem',
                        borderRadius: '4px',
                      }}
                    >
                      <strong>Specific Gap Filled:</strong> {generatedBrief.specificGapFilled}
                    </p>
                  </div>

                  {/* Distinction: Evidence vs Suggestions */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    {/* Column 1: Factual Evidence */}
                    <div
                      style={{
                        background: '#f9fafb',
                        padding: '1rem',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb',
                      }}
                    >
                      <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: '#111827' }}>
                        Verified Evidence Base
                      </h3>
                      <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.75rem 0' }}>
                        {generatedBrief.evidence.evidenceSummary}
                      </p>

                      <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                        <strong>Adjacent Published Content:</strong>
                        <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                          {generatedBrief.evidence.competingPages.length === 0 ? (
                            <li>No adjacent cluster pages found.</li>
                          ) : (
                            generatedBrief.evidence.competingPages.map((p) => (
                              <li key={p.id}>
                                {p.title} (<code>{p.canonicalPath}</code>)
                              </li>
                            ))
                          )}
                        </ul>
                      </div>

                      <div style={{ fontSize: '0.85rem' }}>
                        <strong>Recognized Domain Entities:</strong>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.25rem',
                            marginTop: '0.25rem',
                          }}
                        >
                          {generatedBrief.evidence.knownEntityReferences.map((e, idx) => (
                            <span
                              key={idx}
                              style={{
                                background: '#e5e7eb',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                              }}
                            >
                              {e}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Generated Suggestions */}
                    <div
                      style={{
                        background: '#f0fdf4',
                        padding: '1rem',
                        borderRadius: '6px',
                        border: '1px solid #bbf7d0',
                      }}
                    >
                      <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: '#166534' }}>
                        Generated Editorial Suggestions
                      </h3>

                      <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                        <strong>Key Questions to Address:</strong>
                        <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                          {generatedBrief.generatedSuggestions.questionsToAnswer.map((q, idx) => (
                            <li key={idx}>{q}</li>
                          ))}
                        </ul>
                      </div>

                      <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                        <strong>Suggested Internal Links:</strong>
                        <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                          {generatedBrief.generatedSuggestions.suggestedInternalLinks.map(
                            (l, idx) => (
                              <li key={idx}>
                                Link to &quot;{l.targetTitle}&quot; using anchor{' '}
                                <em>&quot;{l.suggestedAnchor}&quot;</em>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>

                      <div style={{ fontSize: '0.85rem' }}>
                        <strong>Suggested Article Outline:</strong>
                        <ol style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                          {generatedBrief.generatedSuggestions.outline.map((sec, idx) => (
                            <li key={idx}>
                              <strong>{sec.heading}</strong>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: INFORMATION GAIN */}
          {activeTab === 'information_gain' && (
            <div>
              <div
                style={{
                  background: '#f9fafb',
                  padding: '1.25rem',
                  borderRadius: '8px',
                  marginBottom: '1.5rem',
                  border: '1px solid #e5e7eb',
                }}
              >
                <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.5rem 0' }}>
                  Assess Information Gain vs Benchmark Sources
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '0 0 1rem 0' }}>
                  Compares content against cluster peers to identify original insights,
                  redundancies, and missed angles without fabricating unsupported numbers.
                </p>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <select
                    value={selectedContentId}
                    onChange={(e) => setSelectedContentId(e.target.value)}
                    style={{
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      minWidth: '320px',
                    }}
                  >
                    {authorityMaps
                      .flatMap((h) => (h.hubContent ? [h.hubContent, ...h.spokes] : h.spokes))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAssessGain}
                    disabled={assessingGain}
                    style={{
                      padding: '0.5rem 1.25rem',
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {assessingGain ? 'Evaluating...' : 'Assess Information Gain'}
                  </button>
                </div>
              </div>

              {gainAssessment && (
                <div
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    background: '#ffffff',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1rem',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{gainAssessment.contentTitle}</h3>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background:
                          gainAssessment.qualitativeGainTier === 'high_originality'
                            ? '#dcfce7'
                            : gainAssessment.qualitativeGainTier === 'derivative'
                              ? '#fee2e2'
                              : '#fef3c7',
                        color:
                          gainAssessment.qualitativeGainTier === 'high_originality'
                            ? '#166534'
                            : gainAssessment.qualitativeGainTier === 'derivative'
                              ? '#991b1b'
                              : '#92400e',
                      }}
                    >
                      Originality Tier: {gainAssessment.qualitativeGainTier.replace('_', ' ')}
                    </span>
                  </div>

                  <p
                    style={{
                      background: '#f3f4f6',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      color: '#1f2937',
                    }}
                  >
                    {gainAssessment.explanation}
                  </p>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '1rem',
                      marginTop: '1.5rem',
                    }}
                  >
                    <div
                      style={{
                        background: '#f0fdf4',
                        padding: '1rem',
                        borderRadius: '6px',
                        border: '1px solid #bbf7d0',
                      }}
                    >
                      <h4 style={{ margin: '0 0 0.5rem 0', color: '#166534', fontSize: '0.95rem' }}>
                        Novel Insights
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                        {gainAssessment.novelInsights.length === 0 ? (
                          <li>None detected vs benchmarks.</li>
                        ) : (
                          gainAssessment.novelInsights.map((n, i) => (
                            <li key={i}>
                              <strong>{n.concept}:</strong> {n.explanation}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>

                    <div
                      style={{
                        background: '#fffbeb',
                        padding: '1rem',
                        borderRadius: '6px',
                        border: '1px solid #fde68a',
                      }}
                    >
                      <h4 style={{ margin: '0 0 0.5rem 0', color: '#92400e', fontSize: '0.95rem' }}>
                        Redundant Concepts
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                        {gainAssessment.redundantPoints.length === 0 ? (
                          <li>No redundant points found.</li>
                        ) : (
                          gainAssessment.redundantPoints.map((r, i) => (
                            <li key={i}>
                              <strong>{r.concept}:</strong> Overlaps with &quot;{r.overlapWith}
                              &quot;
                            </li>
                          ))
                        )}
                      </ul>
                    </div>

                    <div
                      style={{
                        background: '#eff6ff',
                        padding: '1rem',
                        borderRadius: '6px',
                        border: '1px solid #bfdbfe',
                      }}
                    >
                      <h4 style={{ margin: '0 0 0.5rem 0', color: '#1e40af', fontSize: '0.95rem' }}>
                        Missing Angles
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                        {gainAssessment.missingAngles.length === 0 ? (
                          <li>Cluster coverage is complete.</li>
                        ) : (
                          gainAssessment.missingAngles.map((m, i) => (
                            <li key={i}>
                              <strong>{m.concept}:</strong> {m.rationale}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CANNIBALIZATION CANDIDATES */}
          {activeTab === 'cannibalization' && (
            <div>
              <p style={{ color: '#4b5563', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Evaluates search intent alignment and query collision. Similar wording alone is
                insufficient to trigger a critical conflict.
              </p>

              {cannibalizationCandidates.length === 0 ? (
                <p
                  style={{
                    color: '#166534',
                    background: '#f0fdf4',
                    padding: '1rem',
                    borderRadius: '6px',
                  }}
                >
                  No competing cannibalization candidates detected.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {cannibalizationCandidates.map((cand) => (
                    <div
                      key={cand.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1.25rem',
                        background: '#ffffff',
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
                          <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#111827' }}>
                            &quot;{cand.pageA.title}&quot; vs &quot;{cand.pageB.title}&quot;
                          </div>
                          <div
                            style={{ fontSize: '0.825rem', color: '#6b7280', marginTop: '0.25rem' }}
                          >
                            <code>{cand.pageA.canonicalPath}</code> ({cand.pageA.primaryIntent}) vs{' '}
                            <code>{cand.pageB.canonicalPath}</code> ({cand.pageB.primaryIntent})
                          </div>
                        </div>
                        <span
                          style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            background:
                              cand.severity === 'critical'
                                ? '#fee2e2'
                                : cand.severity === 'warning'
                                  ? '#fef3c7'
                                  : '#f3f4f6',
                            color:
                              cand.severity === 'critical'
                                ? '#991b1b'
                                : cand.severity === 'warning'
                                  ? '#92400e'
                                  : '#374151',
                          }}
                        >
                          Conflict: {cand.intentConflictLevel} ({cand.severity})
                        </span>
                      </div>

                      <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#374151' }}>
                        <p style={{ margin: '0 0 0.25rem 0' }}>
                          {cand.evidence.intentOverlapExplanation}
                        </p>
                        <p style={{ margin: 0, color: '#6b7280', fontStyle: 'italic' }}>
                          {cand.evidence.queryOverlapExplanation}
                        </p>
                      </div>

                      {/* Action Controls */}
                      <div
                        style={{
                          marginTop: '1rem',
                          display: 'flex',
                          gap: '0.5rem',
                          borderTop: '1px solid #f3f4f6',
                          paddingTop: '0.75rem',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleEditorialAction('dismiss', 'cannibalization', cand.id)
                          }
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            background: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                          }}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditorialAction('defer', 'cannibalization', cand.id)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            background: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                          }}
                        >
                          Defer (30d)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleEditorialAction('merge', 'cannibalization', cand.id, {
                              mergeConfig: {
                                sourceId: cand.pageB.id,
                                targetId: cand.pageA.id,
                                redirectType: '308',
                              },
                            })
                          }
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #2563eb',
                            background: '#eff6ff',
                            color: '#2563eb',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          Merge &amp; Redirect (308)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleEditorialAction('create_task', 'cannibalization', cand.id, {
                              taskConfig: {
                                title: `Differentiate intent: "${cand.pageA.title}" vs "${cand.pageB.title}"`,
                                notes: cand.evidence.intentOverlapExplanation,
                              },
                            })
                          }
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#2563eb',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          Create Editorial Task
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: CONTENT DECAY */}
          {activeTab === 'decay' && (
            <div>
              <p style={{ color: '#4b5563', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Monitors performance dips while distinguishing true decay from seasonality,
                measurement anomalies, and URL changes.
              </p>

              {decaySignals.length === 0 ? (
                <p
                  style={{
                    color: '#166534',
                    background: '#f0fdf4',
                    padding: '1rem',
                    borderRadius: '6px',
                  }}
                >
                  All published content exhibits stable performance.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {decaySignals.map((sig) => (
                    <div
                      key={sig.contentId}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1.25rem',
                        background: '#ffffff',
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
                          <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#111827' }}>
                            {sig.title}
                          </div>
                          <div style={{ fontSize: '0.825rem', color: '#6b7280' }}>
                            <code>{sig.canonicalPath}</code>
                          </div>
                        </div>
                        <span
                          style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            background:
                              sig.diagnosis === 'genuine_decay'
                                ? '#fee2e2'
                                : sig.diagnosis === 'tracking_gap'
                                  ? '#ffedd5'
                                  : '#f3f4f6',
                            color:
                              sig.diagnosis === 'genuine_decay'
                                ? '#991b1b'
                                : sig.diagnosis === 'tracking_gap'
                                  ? '#9a3412'
                                  : '#374151',
                          }}
                        >
                          Diagnosis: {sig.diagnosis.replace('_', ' ')}
                        </span>
                      </div>

                      <p style={{ margin: '0.75rem 0', fontSize: '0.875rem', color: '#374151' }}>
                        {sig.evidence.notes}
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          borderTop: '1px solid #f3f4f6',
                          paddingTop: '0.75rem',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleEditorialAction('dismiss', 'decay', sig.contentId)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            background: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                          }}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditorialAction('defer', 'decay', sig.contentId)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            background: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                          }}
                        >
                          Defer (60d)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleEditorialAction('create_task', 'decay', sig.contentId, {
                              taskConfig: {
                                title: `Refresh decayed content: "${sig.title}"`,
                                notes: sig.evidence.notes,
                              },
                            })
                          }
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#2563eb',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          Create Refresh Task
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: COVERAGE GAPS */}
          {activeTab === 'coverage_gaps' && (
            <div>
              <p style={{ color: '#4b5563', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Uncovered domain entities and sparse topic clusters that represent high-leverage
                content creation opportunities.
              </p>

              {coverageGaps.length === 0 ? (
                <p
                  style={{
                    color: '#166534',
                    background: '#f0fdf4',
                    padding: '1rem',
                    borderRadius: '6px',
                  }}
                >
                  No coverage gaps identified.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {coverageGaps.map((gap) => (
                    <div
                      key={gap.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1.25rem',
                        background: '#ffffff',
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
                          <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#111827' }}>
                            {gap.subject}
                          </div>
                          <div style={{ fontSize: '0.825rem', color: '#6b7280' }}>
                            Topic: {gap.topicName} | Type: {gap.gapType.replace('_', ' ')}
                          </div>
                        </div>
                        <span
                          style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            background: gap.priority === 'high' ? '#fee2e2' : '#fef3c7',
                            color: gap.priority === 'high' ? '#991b1b' : '#92400e',
                          }}
                        >
                          Priority: {gap.priority}
                        </span>
                      </div>

                      <p style={{ margin: '0.75rem 0', fontSize: '0.875rem', color: '#374151' }}>
                        {gap.rationale}
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          borderTop: '1px solid #f3f4f6',
                          paddingTop: '0.75rem',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTopicId(gap.topicId)
                            setProposedTitle(gap.subject.replace(/^[A-Za-z\s]+:\s*/, ''))
                            setActiveTab('briefs')
                          }}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #2563eb',
                            background: '#eff6ff',
                            color: '#2563eb',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          Create Brief from Gap
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleEditorialAction('create_task', 'coverage_gap', gap.id, {
                              taskConfig: {
                                title: `Fill coverage gap: ${gap.subject}`,
                                notes: gap.rationale,
                              },
                            })
                          }
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#2563eb',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          Create Task
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditorialAction('dismiss', 'coverage_gap', gap.id)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            background: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: CLAIM & SCHEMA REVIEW */}
          {activeTab === 'claim_review' && (
            <EditorialClaimSchemaReview
              siteId={siteId || 'default-site'}
              initialContentId={selectedContentId}
            />
          )}

          {/* TAB 8: SEARCH CONSOLE & PERFORMANCE */}
          {activeTab === 'search_console' && (
            <SearchConsoleCenter siteId={siteId || 'default-site'} />
          )}
        </div>
      )}
    </div>
  )
}
