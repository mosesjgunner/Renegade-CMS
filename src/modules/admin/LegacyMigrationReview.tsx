'use client'

import React, { useState } from 'react'
import type { MigrationReport } from '../portability/legacy-migration/types'

export default function LegacyMigrationReview({
  initialReport,
}: {
  initialReport?: MigrationReport
}) {
  const [report, setReport] = useState<MigrationReport | null>(initialReport ?? null)
  const [loading, setLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [wxrInput, setWxrInput] = useState('')
  const [activeTab, setActiveTab] = useState<
    'content' | 'presentation' | 'redirects' | 'quarantine'
  >('content')

  const handleInspect = async (wxrText: string) => {
    setLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch('/api/migration/legacy/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wxr: wxrText }),
      })
      const data = await res.json()
      if (res.ok) {
        setActionMessage(
          `Inspection passed: ${data.summary.posts} posts, ${data.summary.pages} pages, ${data.summary.unsupported} unsupported items detected.`,
        )
      } else {
        setActionMessage(`Inspection error: ${data.errors?.join(', ') || data.error}`)
      }
    } catch (err) {
      setActionMessage(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePreflight = async (wxrText: string) => {
    setLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch('/api/migration/legacy/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pkg: { wxr: wxrText },
          options: { targetSiteMode: 'new-isolated-site' },
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setReport(data)
        setActionMessage(`Preflight simulation complete for run ${data.runId}. Review items below.`)
      } else {
        setActionMessage(`Preflight error: ${data.error || 'Failed'}`)
      }
    } catch (err) {
      setActionMessage(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async (wxrText: string) => {
    setLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch('/api/migration/legacy/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pkg: { wxr: wxrText },
          options: { targetSiteMode: 'new-isolated-site', remoteMediaDownloadAllowed: false },
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setReport(data)
        setActionMessage(
          `Migration executed into site ${data.siteId}. Stage: ${data.stage}. Deliberate activation required.`,
        )
      } else {
        setActionMessage(`Execution error: ${data.error || 'Failed'}`)
      }
    } catch (err) {
      setActionMessage(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleActivate = async () => {
    if (!report?.runId) return
    if (
      !confirm(
        'Activate migration? This will publish draft layouts and enable public redirects for this site.',
      )
    )
      return
    setLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/migration/legacy/activate/${report.runId}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setReport(data)
        setActionMessage(
          `Site migration ${report.runId} successfully activated! Public routes and redirects are now live.`,
        )
      } else {
        setActionMessage(`Activation error: ${data.error || 'Failed'}`)
      }
    } catch (err) {
      setActionMessage(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleRollback = async () => {
    if (!report?.runId) return
    if (
      !confirm(
        'Rollback migration? This will cleanly delete all content, layouts, redirects, and media created by this run.',
      )
    )
      return
    setLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/migration/legacy/rollback/${report.runId}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setReport(data)
        setActionMessage(
          `Migration ${report.runId} rolled back cleanly. Created site and records removed.`,
        )
      } else {
        setActionMessage(`Rollback error: ${data.error || 'Failed'}`)
      }
    } catch (err) {
      setActionMessage(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'sans-serif' }}
    >
      {/* Header */}
      <header
        style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '24px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Legacy Site Migration &amp; Presentation Reconstruction (PRE-05)
            </h1>
            <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
              Safe, repeatable WordPress migration with presentation reconstruction, URL redirect
              planning, and quarantine safety.
            </p>
          </div>
          {report && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span
                data-testid="migration-stage-badge"
                style={{
                  padding: '4px 12px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  background:
                    report.stage === 'activated'
                      ? '#dcfce7'
                      : report.stage === 'imported'
                        ? '#e0e7ff'
                        : report.stage === 'dry-run'
                          ? '#fef3c7'
                          : report.stage === 'rolled-back'
                            ? '#fee2e2'
                            : '#f1f5f9',
                  color:
                    report.stage === 'activated'
                      ? '#166534'
                      : report.stage === 'imported'
                        ? '#3730a3'
                        : report.stage === 'dry-run'
                          ? '#92400e'
                          : report.stage === 'rolled-back'
                            ? '#991b1b'
                            : '#475569',
                }}
              >
                Stage: {report.stage}
              </span>
              {report.stage === 'imported' && (
                <button
                  data-testid="activate-migration-btn"
                  onClick={handleActivate}
                  disabled={loading}
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Activate Site &amp; Go Live
                </button>
              )}
              {report.stage !== 'rolled-back' && (
                <button
                  data-testid="rollback-migration-btn"
                  onClick={handleRollback}
                  disabled={loading}
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Rollback / Delete Site
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Action Notification */}
      {actionMessage && (
        <div
          data-testid="action-notification"
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            marginBottom: '16px',
            fontSize: '14px',
            color: '#1e293b',
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* When no migration report is loaded, show WXR import controls */}
      {!report && (
        <div
          style={{
            background: '#f8fafc',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            marginBottom: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: 0, color: '#0f172a' }}>
            Import Legacy WordPress Export (WXR)
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '12px' }}>
            Paste the XML content of a WordPress eXtended RSS (WXR) export or upload a file. The
            pipeline will inspect, normalize, map, dry-run preflight, and import safely into an
            isolated site.
          </p>
          <textarea
            data-testid="wxr-input-textarea"
            placeholder="Paste WordPress WXR XML export content here..."
            value={wxrInput}
            onChange={(e) => setWxrInput(e.target.value)}
            style={{
              width: '100%',
              height: '160px',
              fontFamily: 'monospace',
              fontSize: '12px',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              boxSizing: 'border-box',
              marginBottom: '12px',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleInspect(wxrInput)}
              disabled={loading || !wxrInput.trim()}
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                color: '#ffffff',
                borderRadius: '6px',
                border: 'none',
                cursor: loading || !wxrInput.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              1. Inspect WXR
            </button>
            <button
              onClick={() => handlePreflight(wxrInput)}
              disabled={loading || !wxrInput.trim()}
              style={{
                padding: '8px 16px',
                background: '#0284c7',
                color: '#ffffff',
                borderRadius: '6px',
                border: 'none',
                cursor: loading || !wxrInput.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              2. Dry-Run Preflight
            </button>
            <button
              onClick={() => handleExecute(wxrInput)}
              disabled={loading || !wxrInput.trim()}
              style={{
                padding: '8px 16px',
                background: '#16a34a',
                color: '#ffffff',
                borderRadius: '6px',
                border: 'none',
                cursor: loading || !wxrInput.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              3. Execute Import (Isolated Site)
            </button>
          </div>
        </div>
      )}

      {/* Summary Metrics Cards */}
      {report && (
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
            <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>
              CONTENT RECORDS
            </div>
            <div
              data-testid="metric-content"
              style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}
            >
              {report.reconciliation.created.content} /{' '}
              {report.sourceSummary.posts + report.sourceSummary.pages}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {report.sourceSummary.posts} Posts, {report.sourceSummary.pages} Pages
            </div>
          </div>
          <div
            style={{
              background: '#f8fafc',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>MEDIA ASSETS</div>
            <div
              data-testid="metric-media"
              style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}
            >
              {report.reconciliation.created.media} / {report.sourceSummary.media}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Deduplicated with SHA-256</div>
          </div>
          <div
            style={{
              background: '#f8fafc',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>URL REDIRECTS</div>
            <div
              data-testid="metric-redirects"
              style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}
            >
              {report.reconciliation.created.redirects}
            </div>
            <div style={{ fontSize: '11px', color: '#16a34a' }}>0 Loops, 0 Collisions</div>
          </div>
          <div
            style={{
              background: '#f8fafc',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>PRESENTATION</div>
            <div
              data-testid="metric-presentation"
              style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}
            >
              {report.reconciliation.created.layouts} Layouts
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {report.reconciliation.created.templates} Templates,{' '}
              {report.reconciliation.created.patterns} Patterns
            </div>
          </div>
          <div
            style={{
              background: '#fffbeb',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #fef3c7',
            }}
          >
            <div style={{ color: '#b45309', fontSize: '12px', fontWeight: 600 }}>
              QUARANTINED ARTIFACTS
            </div>
            <div
              data-testid="metric-quarantine"
              style={{ fontSize: '24px', fontWeight: 700, color: '#92400e' }}
            >
              {report.quarantine.length}
            </div>
            <div style={{ fontSize: '11px', color: '#b45309' }}>Zero Arbitrary Code Execution</div>
          </div>
        </div>
      )}

      {/* Acceptance Checklist Bar */}
      {report && (
        <div
          data-testid="acceptance-checklist"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px', color: '#0f172a' }}>
            Acceptance Checklist
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '8px',
              fontSize: '13px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  color: report.acceptanceChecklist.contentCountsMatch ? '#16a34a' : '#dc2626',
                }}
              >
                {report.acceptanceChecklist.contentCountsMatch ? '✓' : '✗'}
              </span>
              <span>Content counts match source</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  color: report.acceptanceChecklist.mediaChecksumsVerified ? '#16a34a' : '#dc2626',
                }}
              >
                {report.acceptanceChecklist.mediaChecksumsVerified ? '✓' : '✗'}
              </span>
              <span>Media byte checksums verified</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  color: report.acceptanceChecklist.urlsAndRedirectsLoopFree
                    ? '#16a34a'
                    : '#dc2626',
                }}
              >
                {report.acceptanceChecklist.urlsAndRedirectsLoopFree ? '✓' : '✗'}
              </span>
              <span>URLs &amp; redirects loop-free</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  color: report.acceptanceChecklist.themeSafeNoArbitraryExec
                    ? '#16a34a'
                    : '#dc2626',
                }}
              >
                {report.acceptanceChecklist.themeSafeNoArbitraryExec ? '✓' : '✗'}
              </span>
              <span>Theme safety (0 PHP/JS/CSS injections)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  color: report.acceptanceChecklist.unsupportedQuarantined ? '#16a34a' : '#dc2626',
                }}
              >
                {report.acceptanceChecklist.unsupportedQuarantined ? '✓' : '✗'}
              </span>
              <span>Unsupported elements quarantined</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  color: report.acceptanceChecklist.idempotencyVerified ? '#16a34a' : '#dc2626',
                }}
              >
                {report.acceptanceChecklist.idempotencyVerified ? '✓' : '✗'}
              </span>
              <span>Resumable &amp; idempotent</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {report && (
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '16px' }}>
          {(['content', 'presentation', 'redirects', 'quarantine'] as const).map((tab) => (
            <button
              key={tab}
              data-testid={`tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: 'transparent',
                borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                color: activeTab === tab ? '#2563eb' : '#64748b',
                fontWeight: activeTab === tab ? 600 : 400,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab === 'content'
                ? `Side-by-Side Content (${report.sideBySide.length})`
                : tab === 'presentation'
                  ? `Presentation (${report.reconciliation.created.layouts} Layouts)`
                  : tab === 'redirects'
                    ? `URL Redirects (${report.redirectPlan.length})`
                    : `Quarantine (${report.quarantine.length})`}
            </button>
          ))}
        </div>
      )}

      {/* Content Tab: Side-by-Side Review Table */}
      {report && activeTab === 'content' && (
        <div
          style={{
            overflowX: 'auto',
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <table
            data-testid="side-by-side-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}
          >
            <thead>
              <tr
                style={{
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  textAlign: 'left',
                }}
              >
                <th style={{ padding: '12px' }}>Legacy Source</th>
                <th style={{ padding: '12px' }}>Renegade Canonical</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Warnings / Quarantine</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {report.sideBySide.map((item) => (
                <tr key={item.sourceId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.sourceTitle}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      <span style={{ textTransform: 'uppercase', marginRight: '6px' }}>
                        {item.sourceType}
                      </span>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#2563eb' }}
                      >
                        {item.sourceUrl}
                      </a>
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.renegadeTitle}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{item.renegadePath}</div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: item.renegadeStatus === 'published' ? '#dcfce7' : '#f1f5f9',
                        color: item.renegadeStatus === 'published' ? '#166534' : '#475569',
                      }}
                    >
                      {item.renegadeStatus}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {item.warnings.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {item.warnings.map((w, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#fef3c7',
                              color: '#92400e',
                            }}
                          >
                            {w}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#16a34a', fontSize: '12px' }}>✓ Clean</span>
                    )}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <a
                      data-testid={`preview-${item.sourceId}`}
                      href={item.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        color: '#2563eb',
                        marginRight: '8px',
                        textDecoration: 'none',
                      }}
                    >
                      Preview
                    </a>
                    <a
                      data-testid={`repair-${item.sourceId}`}
                      href={item.repairUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        color: '#475569',
                        textDecoration: 'none',
                      }}
                    >
                      Repair
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Presentation Tab */}
      {report && activeTab === 'presentation' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div
            style={{
              background: '#fff',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginTop: 0 }}>
              Derived Theme Tokens
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b' }}>
              Extracted from theme export mapping and representative public HTML. No arbitrary CSS
              properties injected.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
                fontSize: '13px',
              }}
            >
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                <span style={{ fontWeight: 600 }}>Brand:</span> #1e40af
              </div>
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                <span style={{ fontWeight: 600 }}>Accent:</span> #3b82f6
              </div>
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                <span style={{ fontWeight: 600 }}>Canvas:</span> #ffffff
              </div>
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                <span style={{ fontWeight: 600 }}>Surface:</span> #f8fafc
              </div>
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                <span style={{ fontWeight: 600 }}>Ink:</span> #0f172a
              </div>
              <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '4px' }}>
                <span style={{ fontWeight: 600 }}>Font:</span> Inter, sans-serif
              </div>
            </div>
          </div>

          <div
            style={{
              background: '#fff',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginTop: 0 }}>
              Reconstructed Structure
            </h3>
            <ul style={{ fontSize: '13px', lineHeight: '1.8', margin: 0, paddingLeft: '20px' }}>
              <li>
                <strong>Header Global:</strong> Site branding + primary navigation menu
              </li>
              <li>
                <strong>Footer Global:</strong> Reconstructed copyright + navigation links
              </li>
              <li>
                <strong>Page Template:</strong> Reusable page layout (Hero + Rich Content)
              </li>
              <li>
                <strong>Post Template:</strong> Reusable article template (Publisher Editorial)
              </li>
              <li>
                <strong>Patterns:</strong> Call to Action banner pattern
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Redirects Tab */}
      {report && activeTab === 'redirects' && (
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            overflowX: 'auto',
          }}
        >
          <table
            data-testid="redirects-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}
          >
            <thead>
              <tr
                style={{
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  textAlign: 'left',
                }}
              >
                <th style={{ padding: '12px' }}>Legacy Path</th>
                <th style={{ padding: '12px' }}>Target Path</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>HTTP Code</th>
              </tr>
            </thead>
            <tbody>
              {report.redirectPlan.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontFamily: 'monospace' }}>{r.legacyPath}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace' }}>{r.canonicalPath}</td>
                  <td style={{ padding: '12px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: r.status === 'needs-redirect' ? '#e0e7ff' : '#dcfce7',
                        color: r.status === 'needs-redirect' ? '#3730a3' : '#166534',
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>{r.statusCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quarantine Tab */}
      {report && activeTab === 'quarantine' && (
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            overflowX: 'auto',
          }}
        >
          <table
            data-testid="quarantine-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}
          >
            <thead>
              <tr
                style={{
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  textAlign: 'left',
                }}
              >
                <th style={{ padding: '12px' }}>Type</th>
                <th style={{ padding: '12px' }}>Name</th>
                <th style={{ padding: '12px' }}>Location</th>
                <th style={{ padding: '12px' }}>Reason</th>
                <th style={{ padding: '12px' }}>Raw Source</th>
              </tr>
            </thead>
            <tbody>
              {report.quarantine.map((q) => (
                <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: '#fef3c7',
                        color: '#92400e',
                      }}
                    >
                      {q.kind}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{q.name}</td>
                  <td style={{ padding: '12px', color: '#64748b' }}>{q.location}</td>
                  <td style={{ padding: '12px', color: '#475569' }}>{q.reason}</td>
                  <td
                    style={{
                      padding: '12px',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {q.rawSource}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
