'use client'

import { useState } from 'react'

type AuditIssue = {
  ruleId: string
  severity: 'informational' | 'warning' | 'publication_blocking'
  evidence: string
  url: string
  repairTarget: string
}

type CrossCheckResult = {
  issues: AuditIssue[]
  checkedSitemapUrls: number
  checkedFeedUrls: number
  hasRobotsSitemapLink: boolean
}

type CannibalizationReview = {
  urlA: string
  titleA: string
  urlB: string
  titleB: string
  similarityScore: number
  sharedTerms: string[]
  issue: AuditIssue
}

type SeoAiSuggestion = {
  id: string
  url: string
  provider: string
  originalTitle: string | null
  suggestedTitle: string | null
  originalDescription: string | null
  suggestedDescription: string | null
  rationale: string
  accepted: boolean
}

type FullAuditResponse = {
  pages?: Array<{ url: string; status: number; title: string | null; description: string | null }>
  issues?: AuditIssue[]
  crossChecks?: CrossCheckResult
  cannibalization?: { reviews: CannibalizationReview[]; issues: AuditIssue[] }
  aiSuggestions?: { suggestions: SeoAiSuggestion[] }
  lifecycle?: { scanId: string; created: number; updated: number; resolved: number; active: number }
  error?: string
}

export default function RenderedQualityCenter() {
  const [running, setRunning] = useState(false)
  const [data, setData] = useState<FullAuditResponse | null>(null)
  const [activeTab, setActiveTab] = useState<
    'lifecycle' | 'crosschecks' | 'cannibalization' | 'ai'
  >('lifecycle')
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [acceptedSet, setAcceptedSet] = useState<Set<string>>(new Set())

  const handleRunAudit = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/admin/discovery/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concurrency: 4 }),
      })
      const result = await res.json()
      setData(result)
    } catch (err) {
      setData({ error: err instanceof Error ? err.message : 'Audit failed.' })
    } finally {
      setRunning(false)
    }
  }

  const handleAcceptAiSuggestion = async (sug: SeoAiSuggestion) => {
    setAcceptingId(sug.id)
    try {
      // Find content id or pass target
      const res = await fetch('/api/admin/discovery/ai-suggestion/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: sug.id,
          suggestedTitle: sug.suggestedTitle,
          suggestedDescription: sug.suggestedDescription,
        }),
      })
      if (res.ok) {
        setAcceptedSet((prev) => new Set(prev).add(sug.id))
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to accept proposal.')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Accept proposal failed.')
    } finally {
      setAcceptingId(null)
    }
  }

  const issues = data?.issues || []
  const crossCheckIssues = data?.crossChecks?.issues || []
  const cannibalizationReviews = data?.cannibalization?.reviews || []
  const aiSuggestions = data?.aiSuggestions?.suggestions || []
  const lifecycle = data?.lifecycle

  return (
    <div
      style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}
    >
      <header
        style={{
          marginBottom: '24px',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#0f172a' }}>
            Rendered Quality & Discovery Command Center — DISC-05
          </h1>
          <p style={{ color: '#64748b', margin: '4px 0 0 0' }}>
            HTTP-rendered audit, sitemap/feed/robots cross-checks, cannibalization analysis, and AI
            boundary proposals.
          </p>
        </div>
        <button
          onClick={() => void handleRunAudit()}
          disabled={running}
          style={{
            padding: '10px 20px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {running ? 'Crawling Public Origin...' : 'Run Rendered Audit'}
        </button>
      </header>

      {/* Summary Cards */}
      {lifecycle && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              background: '#f8fafc',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
              ACTIVE FINDINGS
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a' }}>
              {lifecycle.active}
            </div>
          </div>
          <div
            style={{
              background: '#f0fdf4',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #bbf7d0',
            }}
          >
            <div style={{ fontSize: '12px', color: '#166534', fontWeight: '600' }}>
              RESOLVED ISSUES
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#15803d' }}>
              {lifecycle.resolved}
            </div>
          </div>
          <div
            style={{
              background: '#eff6ff',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #bfdbfe',
            }}
          >
            <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600' }}>
              CROSS-CHECK ISSUES
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1d4ed8' }}>
              {crossCheckIssues.length}
            </div>
          </div>
          <div
            style={{
              background: '#faf5ff',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e9d5ff',
            }}
          >
            <div style={{ fontSize: '12px', color: '#6b21a8', fontWeight: '600' }}>
              CANNIBALIZATION REVIEWS
            </div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#7e22ce' }}>
              {cannibalizationReviews.length}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid #cbd5e1',
          marginBottom: '20px',
        }}
      >
        <button
          onClick={() => setActiveTab('lifecycle')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'lifecycle' ? '2px solid #2563eb' : 'none',
            fontWeight: activeTab === 'lifecycle' ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          Audit Findings ({issues.length})
        </button>
        <button
          onClick={() => setActiveTab('crosschecks')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'crosschecks' ? '2px solid #2563eb' : 'none',
            fontWeight: activeTab === 'crosschecks' ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          Sitemap / Feed / Robots ({crossCheckIssues.length})
        </button>
        <button
          onClick={() => setActiveTab('cannibalization')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'cannibalization' ? '2px solid #2563eb' : 'none',
            fontWeight: activeTab === 'cannibalization' ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          Cannibalization Review ({cannibalizationReviews.length})
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'ai' ? '2px solid #2563eb' : 'none',
            fontWeight: activeTab === 'ai' ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          AI Proposals ({aiSuggestions.length})
        </button>
      </div>

      {/* Tab Contents */}
      {data?.error ? (
        <div
          style={{ padding: '16px', background: '#fef2f2', color: '#991b1b', borderRadius: '6px' }}
        >
          {data.error}
        </div>
      ) : !data ? (
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            color: '#64748b',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px border #e2e8f0',
          }}
        >
          Click &quot;Run Rendered Audit&quot; above to execute public origin crawl, cross-checks,
          cannibalization review, and AI proposal generation.
        </div>
      ) : activeTab === 'lifecycle' ? (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
            Rendered Audit Findings
          </h2>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              background: '#fff',
              border: '1px solid #e2e8f0',
            }}
          >
            <thead>
              <tr style={{ background: '#f1f5f9', fontSize: '13px', color: '#475569' }}>
                <th style={{ padding: '10px' }}>Rule ID</th>
                <th style={{ padding: '10px' }}>Severity</th>
                <th style={{ padding: '10px' }}>Target URL</th>
                <th style={{ padding: '10px' }}>Evidence</th>
                <th style={{ padding: '10px' }}>Repair Field</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                  <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '600' }}>
                    {item.ruleId}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        background:
                          item.severity === 'publication_blocking'
                            ? '#fee2e2'
                            : item.severity === 'warning'
                              ? '#fef3c7'
                              : '#e0f2fe',
                        color:
                          item.severity === 'publication_blocking'
                            ? '#991b1b'
                            : item.severity === 'warning'
                              ? '#92400e'
                              : '#0369a1',
                      }}
                    >
                      {item.severity}
                    </span>
                  </td>
                  <td style={{ padding: '10px', fontFamily: 'monospace' }}>{item.url}</td>
                  <td style={{ padding: '10px', color: '#334155' }}>{item.evidence}</td>
                  <td style={{ padding: '10px', color: '#64748b' }}>{item.repairTarget}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'crosschecks' ? (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
            Sitemap, Feed & Robots Cross-Checks
          </h2>
          <div style={{ marginBottom: '16px', fontSize: '13px', color: '#475569' }}>
            Checked {data.crossChecks?.checkedSitemapUrls || 0} Sitemap URLs &amp;{' '}
            {data.crossChecks?.checkedFeedUrls || 0} RSS Feed URLs. Robots Sitemap Directive:{' '}
            {data.crossChecks?.hasRobotsSitemapLink ? '✅ Present' : '❌ Missing'}
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              background: '#fff',
              border: '1px solid #e2e8f0',
            }}
          >
            <thead>
              <tr style={{ background: '#f1f5f9', fontSize: '13px', color: '#475569' }}>
                <th style={{ padding: '10px' }}>Rule ID</th>
                <th style={{ padding: '10px' }}>Severity</th>
                <th style={{ padding: '10px' }}>URL / File</th>
                <th style={{ padding: '10px' }}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {crossCheckIssues.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                  <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '600' }}>
                    {item.ruleId}
                  </td>
                  <td style={{ padding: '10px' }}>{item.severity}</td>
                  <td style={{ padding: '10px', fontFamily: 'monospace' }}>{item.url}</td>
                  <td style={{ padding: '10px' }}>{item.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'cannibalization' ? (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
            Lexical Similarity &amp; Cannibalization Review Suggestions
          </h2>
          {cannibalizationReviews.length === 0 ? (
            <p style={{ color: '#64748b' }}>
              No lexical cannibalization review suggestions found across analyzed pages.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cannibalizationReviews.map((rev, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '16px',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#0f172a' }}>
                      Pairwise Similarity: {Math.round(rev.similarityScore * 100)}%
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        background: '#f3e8ff',
                        color: '#6b21a8',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: '600',
                      }}
                    >
                      Shared Terms: [{rev.sharedTerms.join(', ')}]
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#334155', marginBottom: '6px' }}>
                    <strong>Page A:</strong> {rev.titleA} ({rev.urlA})
                  </div>
                  <div style={{ fontSize: '13px', color: '#334155', marginBottom: '8px' }}>
                    <strong>Page B:</strong> {rev.titleB} ({rev.urlB})
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#64748b',
                      fontStyle: 'italic',
                      background: '#f8fafc',
                      padding: '8px',
                      borderRadius: '4px',
                    }}
                  >
                    {rev.issue.evidence}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
            AI SEO Title &amp; Description Proposals (Provider: renegade-ai-boundary)
          </h2>
          {aiSuggestions.length === 0 ? (
            <p style={{ color: '#64748b' }}>
              No AI proposals required. All audited titles and descriptions satisfy length bounds.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {aiSuggestions.map((sug) => {
                const isAccepted = acceptedSet.has(sug.id)
                return (
                  <div
                    key={sug.id}
                    style={{
                      padding: '16px',
                      background: isAccepted ? '#f0fdf4' : '#fff',
                      border: isAccepted ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                      }}
                    >
                      <span
                        style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '13px' }}
                      >
                        {sug.url}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          background: '#e0e7ff',
                          color: '#3730a3',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: '600',
                        }}
                      >
                        {sug.provider}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                        fontSize: '13px',
                        marginBottom: '12px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                          Original State
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Title:</strong> {sug.originalTitle || 'None'}
                        </div>
                        <div>
                          <strong>Desc:</strong> {sug.originalDescription || 'None'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', color: '#16a34a', marginBottom: '4px' }}>
                          Proposed AI Suggestion
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Title:</strong> {sug.suggestedTitle}
                        </div>
                        <div>
                          <strong>Desc:</strong> {sug.suggestedDescription}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        color: '#475569',
                        fontStyle: 'italic',
                        marginBottom: '12px',
                      }}
                    >
                      <strong>Rationale:</strong> {sug.rationale}
                    </div>

                    <button
                      onClick={() => void handleAcceptAiSuggestion(sug)}
                      disabled={isAccepted || acceptingId === sug.id}
                      style={{
                        padding: '6px 14px',
                        background: isAccepted ? '#15803d' : '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      {isAccepted
                        ? '✓ Suggestion Accepted & Applied'
                        : acceptingId === sug.id
                          ? 'Applying...'
                          : 'Accept & Apply Suggestion'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
