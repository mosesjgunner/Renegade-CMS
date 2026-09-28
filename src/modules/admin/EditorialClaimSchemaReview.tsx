'use client'

import React, { useCallback, useEffect, useState } from 'react'
import type {
  EditorialClaim,
  FactReviewReport,
  SchemaAuditResult,
  SchemaProposal,
} from '../intelligence/editorial-review/contracts'
import { formatReportAsMarkdown } from '../intelligence/editorial-review'

export interface EditorialClaimSchemaReviewProps {
  siteId: string
  initialContentId?: string
  permissions?: {
    canReview?: boolean
    canApprove?: boolean
    role?: string
  }
}

export default function EditorialClaimSchemaReview({
  siteId,
  initialContentId,
  permissions = { canReview: true, canApprove: true, role: 'staff' },
}: EditorialClaimSchemaReviewProps) {
  const canReview = permissions?.canReview ?? true
  const canApprove = permissions?.canApprove ?? true
  const userRole = permissions?.role ?? 'staff'

  const [contentId, setContentId] = useState(initialContentId || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [copiedReport, setCopiedReport] = useState(false)

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'claims' | 'schema' | 'report'>('claims')

  // Data states
  const [contentMeta, setContentMeta] = useState<{
    id: string
    title: string
    revision: string
    canonicalUrl: string
    structuredDataMode: string
    structuredDataVersion: number
  } | null>(null)

  const [claims, setClaims] = useState<EditorialClaim[]>([])
  const [schemaAudit, setSchemaAudit] = useState<SchemaAuditResult | null>(null)
  const [proposals, setProposals] = useState<SchemaProposal[]>([])
  const [report, setReport] = useState<FactReviewReport | null>(null)

  // Filter for claims
  const [claimFilter, setClaimFilter] = useState<
    'all' | 'unreviewed' | 'unsupported' | 'contradicted' | 'outdated' | 'human_verified'
  >('all')

  // Local form states
  const [claimNotes, setClaimNotes] = useState<Record<string, string>>({})
  const [attachingToClaimId, setAttachingToClaimId] = useState<string | null>(null)
  const [newSourceUrl, setNewSourceUrl] = useState('')
  const [newSourceDate, setNewSourceDate] = useState('')
  const [newSourceStance, setNewSourceStance] = useState<'supports' | 'contradicts'>('supports')
  const [newSourceQuote, setNewSourceQuote] = useState('')

  // Ingestion form state
  const [showIngestModal, setShowIngestModal] = useState(false)
  const [customStatement, setCustomStatement] = useState('')
  const [customQuote, setCustomQuote] = useState('')
  const [customSection, setCustomSection] = useState('')

  const fetchEditorialData = useCallback(
    async (targetId: string) => {
      if (!targetId.trim()) return
      setLoading(true)
      setError(null)
      setActionSuccess(null)
      try {
        const res = await fetch(
          `/api/admin/intelligence/editorial-review?siteId=${siteId}&contentId=${encodeURIComponent(targetId)}`,
        )
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}))
          throw new Error(errJson.error || `HTTP ${res.status}: Failed to load review data.`)
        }
        const data = await res.json()
        setContentMeta(data.content)
        setClaims(data.claims || [])
        setSchemaAudit(data.schemaAudit || null)
        setProposals(data.proposals || [])
        setReport(data.report || null)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [siteId],
  )

  useEffect(() => {
    if (initialContentId) {
      setContentId(initialContentId)
      fetchEditorialData(initialContentId)
    }
  }, [initialContentId, fetchEditorialData])

  // Extract claims
  const handleExtractClaims = async () => {
    if (!contentId) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/editorial-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extract_claims',
          siteId,
          contentId,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Claim extraction failed.')
      setClaims(result.claims || [])
      setActionSuccess(`Extracted ${result.count} factual claims from content.`)
      fetchEditorialData(contentId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Ingest custom claim
  const handleIngestCustomClaim = async () => {
    if (!customStatement.trim() || !contentId) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/editorial-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ingest_claim',
          siteId,
          contentId,
          statement: customStatement,
          quote: customQuote || customStatement,
          location: { sectionPath: customSection || 'Body' },
          provenanceSource: 'manual_ingest',
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Claim ingestion failed.')
      setShowIngestModal(false)
      setCustomStatement('')
      setCustomQuote('')
      setCustomSection('')
      setActionSuccess('Claim ingested successfully.')
      fetchEditorialData(contentId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Attach source
  const handleAttachSource = async (claimId: string) => {
    if (!newSourceUrl.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/editorial-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'attach_source',
          siteId,
          contentId,
          claimId,
          sourceUrl: newSourceUrl,
          publishedDate: newSourceDate || undefined,
          stance: newSourceStance,
          quote: newSourceQuote || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to attach source.')
      setAttachingToClaimId(null)
      setNewSourceUrl('')
      setNewSourceDate('')
      setNewSourceQuote('')
      setActionSuccess('Source attached and freshness/conflicts evaluated.')
      fetchEditorialData(contentId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Verify claim (Human fact-checking sign-off)
  const handleHumanVerify = async (claimId: string, decision: 'verified' | 'rejected') => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/editorial-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_claim_human',
          siteId,
          contentId,
          claimId,
          decision,
          notes: claimNotes[claimId] || undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Human verification failed.')
      setActionSuccess(`Claim marked ${decision} by human reviewer.`)
      fetchEditorialData(contentId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Propose schema correction
  const handleProposeSchema = async () => {
    if (!contentId) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/editorial-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'propose_schema',
          siteId,
          contentId,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Schema proposal failed.')
      setActionSuccess('Schema proposal generated with verified grounding.')
      fetchEditorialData(contentId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Apply schema proposal (Revision locked)
  const handleApplySchema = async (proposalId: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/editorial-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply_schema',
          siteId,
          contentId,
          proposalId,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Schema application failed.')
      setActionSuccess(
        `Schema applied safely to Content! (Revision: ${result.result?.appliedRevision})`,
      )
      fetchEditorialData(contentId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const filteredClaims = claims.filter((c) => {
    if (claimFilter === 'all') return true
    return c.reviewStatus === claimFilter
  })

  const getStatusBadge = (status: EditorialClaim['reviewStatus']) => {
    const config: Record<string, { bg: string; color: string; label: string; icon: string }> = {
      unreviewed: { bg: '#f3f4f6', color: '#4b5563', label: 'Unreviewed', icon: '⚪' },
      supported: { bg: '#eff6ff', color: '#1d4ed8', label: 'Supported', icon: 'ℹ️' },
      unsupported: { bg: '#fff7ed', color: '#c2410c', label: 'Unsupported', icon: '❓' },
      contradicted: { bg: '#fef2f2', color: '#b91c1c', label: 'Contradicted ⚠️', icon: '⚠️' },
      outdated: { bg: '#fefce8', color: '#a16207', label: 'Outdated (Stale Source)', icon: '⏳' },
      human_verified: { bg: '#f0fdf4', color: '#15803d', label: 'Human Verified ✓', icon: '✓' },
      rejected: { bg: '#f1f5f9', color: '#334155', label: 'Rejected ✗', icon: '✗' },
    }
    const c = config[status] || config.unreviewed
    return (
      <span
        style={{
          background: c.bg,
          color: c.color,
          padding: '0.2rem 0.55rem',
          borderRadius: '4px',
          fontWeight: 600,
          fontSize: '0.75rem',
          border: `1px solid ${c.color}30`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}
        role="status"
        aria-label={`Claim status: ${c.label}`}
      >
        <span aria-hidden="true">{c.icon}</span>
        <span>{c.label}</span>
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Target Content Selector Bar */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flex: 1,
            minWidth: '320px',
          }}
        >
          <label
            htmlFor="editorial-content-id-input"
            style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}
          >
            Content ID:
          </label>
          <input
            id="editorial-content-id-input"
            type="text"
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
            placeholder="e.g. content-id-1 or post slug"
            aria-label="Target Content Identifier"
            style={{
              flex: 1,
              padding: '0.45rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
            }}
          />
          <button
            type="button"
            onClick={() => fetchEditorialData(contentId)}
            disabled={loading || !contentId}
            aria-label="Load content for claim and schema review"
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: loading || !contentId ? 'not-allowed' : 'pointer',
              opacity: loading || !contentId ? 0.6 : 1,
            }}
          >
            {loading ? 'Inspecting...' : 'Load Content'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            fontSize: '0.825rem',
            color: '#4b5563',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              fontWeight: 600,
              color: '#1f2937',
              fontSize: '0.75rem',
            }}
          >
            Reviewer: <strong>{userRole}</strong> (
            {canReview ? 'Review: Active' : 'Review: Read-Only'})
          </span>
          {contentMeta && (
            <>
              <span>
                <strong>Doc:</strong> {contentMeta.title}
              </span>
              <span>
                <strong>Revision:</strong> <code>{contentMeta.revision}</code>
              </span>
              <span>
                <strong>Schema Mode:</strong> <code>{contentMeta.structuredDataMode}</code> (v
                {contentMeta.structuredDataVersion})
              </span>
            </>
          )}
        </div>
      </div>

      {actionSuccess && (
        <div
          role="region"
          aria-live="polite"
          style={{
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            fontSize: '0.875rem',
          }}
        >
          {actionSuccess}
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            background: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {contentMeta && (
        <>
          {/* Sub Navigation */}
          <div
            role="tablist"
            aria-label="Editorial review sections"
            style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e5e7eb' }}
          >
            {[
              { id: 'claims', label: `Claims & Fact-Checking (${claims.length})` },
              { id: 'schema', label: 'Structured Data (JSON-LD) Audit' },
              { id: 'report', label: 'Integrity & Fact-Review Report' },
            ].map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeSubTab === tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id as any)}
                style={{
                  padding: '0.6rem 1rem',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontWeight: activeSubTab === tab.id ? 600 : 500,
                  color: activeSubTab === tab.id ? '#2563eb' : '#6b7280',
                  borderBottom: activeSubTab === tab.id ? '2px solid #2563eb' : 'none',
                  fontSize: '0.9rem',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: CLAIMS & FACT CHECKING */}
          {activeSubTab === 'claims' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Claims Action Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {[
                    { key: 'all', label: `All (${claims.length})` },
                    {
                      key: 'unreviewed',
                      label: `Unreviewed (${claims.filter((c) => c.reviewStatus === 'unreviewed').length})`,
                    },
                    {
                      key: 'unsupported',
                      label: `Unsupported (${claims.filter((c) => c.reviewStatus === 'unsupported').length})`,
                    },
                    {
                      key: 'contradicted',
                      label: `Contradicted (${claims.filter((c) => c.reviewStatus === 'contradicted').length})`,
                    },
                    {
                      key: 'outdated',
                      label: `Outdated (${claims.filter((c) => c.reviewStatus === 'outdated').length})`,
                    },
                    {
                      key: 'human_verified',
                      label: `Human Verified (${claims.filter((c) => c.reviewStatus === 'human_verified').length})`,
                    },
                  ].map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setClaimFilter(f.key as any)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '20px',
                        border: '1px solid #d1d5db',
                        background: claimFilter === f.key ? '#2563eb' : '#ffffff',
                        color: claimFilter === f.key ? '#ffffff' : '#374151',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleExtractClaims}
                    disabled={loading}
                    style={{
                      padding: '0.4rem 0.85rem',
                      borderRadius: '6px',
                      border: '1px solid #2563eb',
                      background: '#eff6ff',
                      color: '#2563eb',
                      fontWeight: 600,
                      fontSize: '0.825rem',
                      cursor: 'pointer',
                    }}
                  >
                    Extract Claims from Content
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowIngestModal(true)}
                    style={{
                      padding: '0.4rem 0.85rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      background: '#ffffff',
                      color: '#374151',
                      fontWeight: 600,
                      fontSize: '0.825rem',
                      cursor: 'pointer',
                    }}
                  >
                    + Ingest Custom Claim
                  </button>
                </div>
              </div>

              {/* Claims List */}
              {filteredClaims.length === 0 ? (
                <div
                  style={{
                    background: '#f9fafb',
                    padding: '2.5rem',
                    textAlign: 'center',
                    borderRadius: '8px',
                    color: '#6b7280',
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 500 }}>No claims matching filter.</p>
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.825rem' }}>
                    Click &ldquo;Extract Claims from Content&rdquo; to automatically scan for
                    factual assertions.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {filteredClaims.map((claim) => (
                    <div
                      key={claim.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '1rem',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                            flex: 1,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {getStatusBadge(claim.reviewStatus)}
                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              Location:{' '}
                              <strong>
                                {claim.location.sectionPath ||
                                  `Offset ${claim.location.offsetStart}`}
                              </strong>
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              Provenance:{' '}
                              <code>
                                {claim.provenance.source} ({claim.provenance.extractorVersion})
                              </code>
                            </span>
                          </div>
                          <h4
                            style={{
                              margin: '0.25rem 0 0',
                              fontSize: '1rem',
                              color: '#111827',
                              fontWeight: 600,
                            }}
                          >
                            &ldquo;{claim.statement}&rdquo;
                          </h4>
                          {claim.quote !== claim.statement && (
                            <p
                              style={{
                                margin: 0,
                                fontSize: '0.825rem',
                                color: '#4b5563',
                                fontStyle: 'italic',
                              }}
                            >
                              Quote: &ldquo;{claim.quote}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Conflict Alert Banner */}
                      {claim.conflict.hasConflict && (
                        <div
                          style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            padding: '0.65rem 0.85rem',
                            color: '#991b1b',
                            fontSize: '0.825rem',
                          }}
                        >
                          <strong>⚠️ Conflicting Evidence Detected:</strong>
                          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
                            {claim.conflict.conflictingEvidence.map((ev, i) => (
                              <li key={i}>{ev.reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* AI Automated Preliminary Check Disclaimer */}
                      {claim.automatedCheck && (
                        <div
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.8rem',
                            color: '#475569',
                          }}
                        >
                          🤖 <strong>Automated Check (AI):</strong> Proposed status:{' '}
                          <code>{claim.automatedCheck.suggestedStatus}</code> &mdash;{' '}
                          {claim.automatedCheck.rationale}{' '}
                          <em style={{ color: '#64748b' }}>
                            (Non-binding proposal; requires human verification).
                          </em>
                        </div>
                      )}

                      {/* Attached Sources */}
                      <div style={{ marginTop: '0.25rem' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.4rem',
                          }}
                        >
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                            Attached Sources ({claim.sources.length}):
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setAttachingToClaimId(
                                attachingToClaimId === claim.id ? null : claim.id,
                              )
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#2563eb',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                            }}
                          >
                            {attachingToClaimId === claim.id ? 'Cancel' : '+ Attach Citation'}
                          </button>
                        </div>

                        {claim.sources.length === 0 ? (
                          <div
                            style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}
                          >
                            No sources attached. Claim is currently unsupported.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {claim.sources.map((src) => (
                              <div
                                key={src.id}
                                style={{
                                  background: '#f9fafb',
                                  padding: '0.45rem 0.65rem',
                                  borderRadius: '4px',
                                  border: '1px solid #f3f4f6',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.8rem',
                                }}
                              >
                                <div>
                                  <a
                                    href={src.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      color: '#2563eb',
                                      textDecoration: 'none',
                                      fontWeight: 500,
                                    }}
                                  >
                                    {src.title || src.sourceUrl}
                                  </a>
                                  {src.publishedDate && (
                                    <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>
                                      ({src.publishedDate})
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      marginLeft: '0.5rem',
                                      padding: '0.1rem 0.35rem',
                                      borderRadius: '3px',
                                      fontSize: '0.7rem',
                                      background: src.stance === 'supports' ? '#dcfce7' : '#fee2e2',
                                      color: src.stance === 'supports' ? '#166534' : '#991b1b',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {src.stance.toUpperCase()}
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    color: src.freshness.isStale ? '#b45309' : '#059669',
                                    fontWeight: 500,
                                  }}
                                >
                                  {src.freshness.status.toUpperCase()}{' '}
                                  {src.freshness.ageYears !== undefined
                                    ? `(${src.freshness.ageYears}y)`
                                    : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Attach Source Form Accordion */}
                      {attachingToClaimId === claim.id && (
                        <div
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            padding: '0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                          }}
                        >
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              type="url"
                              placeholder="Source URL (https://...)"
                              value={newSourceUrl}
                              onChange={(e) => setNewSourceUrl(e.target.value)}
                              style={{
                                flex: 1,
                                padding: '0.35rem 0.5rem',
                                fontSize: '0.8rem',
                                borderRadius: '4px',
                                border: '1px solid #d1d5db',
                              }}
                            />
                            <input
                              type="date"
                              placeholder="Publish Date"
                              value={newSourceDate}
                              onChange={(e) => setNewSourceDate(e.target.value)}
                              style={{
                                padding: '0.35rem 0.5rem',
                                fontSize: '0.8rem',
                                borderRadius: '4px',
                                border: '1px solid #d1d5db',
                              }}
                            />
                            <select
                              value={newSourceStance}
                              onChange={(e) => setNewSourceStance(e.target.value as any)}
                              style={{
                                padding: '0.35rem 0.5rem',
                                fontSize: '0.8rem',
                                borderRadius: '4px',
                                border: '1px solid #d1d5db',
                              }}
                            >
                              <option value="supports">Supports Claim</option>
                              <option value="contradicts">Contradicts Claim</option>
                            </select>
                          </div>
                          <input
                            type="text"
                            placeholder="Optional quote or locator from source"
                            value={newSourceQuote}
                            onChange={(e) => setNewSourceQuote(e.target.value)}
                            style={{
                              padding: '0.35rem 0.5rem',
                              fontSize: '0.8rem',
                              borderRadius: '4px',
                              border: '1px solid #d1d5db',
                            }}
                          />
                          <div
                            style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}
                          >
                            <button
                              type="button"
                              onClick={() => handleAttachSource(claim.id)}
                              disabled={loading || !newSourceUrl}
                              style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: '4px',
                                border: 'none',
                                background: '#2563eb',
                                color: '#ffffff',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Attach Source
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Reviewer History & Human Verification Sign-off */}
                      <div
                        style={{
                          borderTop: '1px solid #f3f4f6',
                          paddingTop: '0.75rem',
                          display: 'flex',
                          flexWrap: 'wrap',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.2rem',
                            flex: 1,
                            minWidth: '260px',
                          }}
                        >
                          {claim.humanVerification ? (
                            <span
                              style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600 }}
                            >
                              ✓ Human verified by {claim.humanVerification.verifiedBy} (
                              {claim.humanVerification.verifiedRole}) on{' '}
                              {claim.humanVerification.verifiedAt.split('T')[0]}
                              {claim.humanVerification.notes
                                ? ` — "${claim.humanVerification.notes}"`
                                : ''}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                              Awaiting human fact-checking sign-off.
                            </span>
                          )}
                          {claim.reviewerHistory.length > 0 && (
                            <div
                              style={{
                                marginTop: '0.35rem',
                                background: '#f8fafc',
                                padding: '0.4rem 0.6rem',
                                borderRadius: '4px',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  color: '#475569',
                                  fontWeight: 600,
                                  display: 'block',
                                }}
                              >
                                Preserved Reviewer Audit Trail ({claim.reviewerHistory.length}{' '}
                                decision{claim.reviewerHistory.length > 1 ? 's' : ''}):
                              </span>
                              <ul
                                style={{
                                  margin: '0.2rem 0 0',
                                  paddingLeft: '1rem',
                                  fontSize: '0.7rem',
                                  color: '#64748b',
                                }}
                              >
                                {claim.reviewerHistory.map((h, hIdx) => (
                                  <li key={hIdx}>
                                    <strong>{h.newStatus}</strong> by <code>{h.reviewerId}</code> (
                                    {h.reviewerRole}) &bull;{' '}
                                    {new Date(h.decidedAt).toLocaleDateString()} (Rev:{' '}
                                    <code>{h.contentRevision}</code>)
                                    {h.notes ? ` &mdash; "${h.notes}"` : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Human Verification Action Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="text"
                            placeholder="Review notes..."
                            aria-label={`Review notes for claim ${claim.id}`}
                            value={claimNotes[claim.id] || ''}
                            onChange={(e) =>
                              setClaimNotes({ ...claimNotes, [claim.id]: e.target.value })
                            }
                            style={{
                              padding: '0.35rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid #d1d5db',
                              fontSize: '0.78rem',
                              width: '180px',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleHumanVerify(claim.id, 'verified')}
                            disabled={
                              loading ||
                              !canReview ||
                              claim.conflict.hasConflict ||
                              claim.sources.length === 0
                            }
                            aria-label={`Sign off verification for claim: ${claim.statement}`}
                            title={
                              !canReview
                                ? 'Permission required: User role cannot sign off as fact reviewer'
                                : claim.conflict.hasConflict
                                  ? 'Resolve contradictory sources before verifying'
                                  : claim.sources.length === 0
                                    ? 'Attach supporting source citation before verifying'
                                    : 'Sign off as Human Fact Reviewer'
                            }
                            style={{
                              padding: '0.35rem 0.75rem',
                              borderRadius: '4px',
                              border: 'none',
                              background: '#16a34a',
                              color: '#ffffff',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                              cursor:
                                !canReview ||
                                claim.conflict.hasConflict ||
                                claim.sources.length === 0
                                  ? 'not-allowed'
                                  : 'pointer',
                              opacity:
                                !canReview ||
                                claim.conflict.hasConflict ||
                                claim.sources.length === 0
                                  ? 0.6
                                  : 1,
                            }}
                          >
                            Verify (Human Sign-off)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleHumanVerify(claim.id, 'rejected')}
                            disabled={loading || !canReview}
                            aria-label={`Reject claim: ${claim.statement}`}
                            title={
                              !canReview
                                ? 'Permission required: User role cannot reject claims'
                                : 'Reject factual claim'
                            }
                            style={{
                              padding: '0.35rem 0.75rem',
                              borderRadius: '4px',
                              border: '1px solid #d1d5db',
                              background: '#ffffff',
                              color: '#dc2626',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                              cursor: !canReview ? 'not-allowed' : 'pointer',
                              opacity: !canReview ? 0.6 : 1,
                            }}
                          >
                            Reject Claim
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STRUCTURED DATA (JSON-LD) AUDIT */}
          {activeSubTab === 'schema' && schemaAudit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Audit Summary Card */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', color: '#111827' }}>
                    Schema.org Audit: {schemaAudit.pageType}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#4b5563' }}>
                    Canonical URL: <code>{schemaAudit.canonicalUrl}</code> &bull; Revision:{' '}
                    <code>{schemaAudit.contentRevision}</code>
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '20px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: schemaAudit.antiFabrication.passed ? '#ecfdf5' : '#fef2f2',
                      color: schemaAudit.antiFabrication.passed ? '#065f46' : '#991b1b',
                    }}
                  >
                    Anti-Fabrication:{' '}
                    {schemaAudit.antiFabrication.passed ? 'Passed ✓' : 'Fabrications Detected ⚠️'}
                  </span>
                  <button
                    type="button"
                    onClick={handleProposeSchema}
                    disabled={loading}
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    Generate Grounded Proposal
                  </button>
                </div>
              </div>

              {/* Anti-Fabrication Ledger */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#334155' }}>
                  🛡️ Anti-Fabrication Grounding Verification
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '0.5rem',
                    fontSize: '0.8rem',
                  }}
                >
                  <div>
                    Author Grounding:{' '}
                    <strong>
                      {schemaAudit.antiFabrication.verifiedGrounding.authorVerified
                        ? '✅ Verified'
                        : '❌ Unverified'}
                    </strong>
                  </div>
                  <div>
                    Publisher Grounding:{' '}
                    <strong>
                      {schemaAudit.antiFabrication.verifiedGrounding.publisherVerified
                        ? '✅ Verified'
                        : '❌ Unverified'}
                    </strong>
                  </div>
                  <div>
                    Date Grounding:{' '}
                    <strong>
                      {schemaAudit.antiFabrication.verifiedGrounding.datesVerified
                        ? '✅ Verified'
                        : '❌ Unverified'}
                    </strong>
                  </div>
                  <div>
                    Ratings Grounding:{' '}
                    <strong>
                      {schemaAudit.antiFabrication.verifiedGrounding.ratingsVerified
                        ? '✅ Zero Fabrication'
                        : '⚠️ Unverified Ratings'}
                    </strong>
                  </div>
                </div>

                {schemaAudit.antiFabrication.unsupportedFields.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '4px',
                      color: '#991b1b',
                      fontSize: '0.8rem',
                    }}
                  >
                    <strong>Detected Fabricated Fields:</strong>
                    <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
                      {schemaAudit.antiFabrication.unsupportedFields.map((uf, i) => (
                        <li key={i}>{uf.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Missing & Inconsistent Fields List */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#111827' }}>
                    Missing Schema Fields ({schemaAudit.missingFields.length})
                  </h4>
                  {schemaAudit.missingFields.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#166534' }}>
                      All eligible fields present.
                    </p>
                  ) : (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '1.25rem',
                        fontSize: '0.825rem',
                        color: '#dc2626',
                      }}
                    >
                      {schemaAudit.missingFields.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1rem',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#111827' }}>
                    Inconsistencies with Canonical Doc ({schemaAudit.inconsistentFields.length})
                  </h4>
                  {schemaAudit.inconsistentFields.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#166534' }}>
                      Zero factual mismatches detected.
                    </p>
                  ) : (
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: '1.25rem',
                        fontSize: '0.825rem',
                        color: '#d97706',
                      }}
                    >
                      {schemaAudit.inconsistentFields.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Proposals Queue */}
              {proposals.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    marginTop: '0.5rem',
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '1rem', color: '#111827' }}>
                    Schema Correction Proposals ({proposals.length})
                  </h4>
                  {proposals.map((prop) => (
                    <div
                      key={prop.id}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <strong>Proposal ID:</strong> <code>{prop.id}</code> &bull;{' '}
                          <span>
                            Status: <strong>{prop.status.toUpperCase()}</strong>
                          </span>
                        </div>
                        {prop.status === 'pending_review' && (
                          <button
                            type="button"
                            onClick={() => handleApplySchema(prop.id)}
                            disabled={loading || !canApprove || !prop.antiFabricationPassed}
                            aria-label={`Apply schema proposal ${prop.id}`}
                            title={
                              !canApprove
                                ? 'Permission required: User role cannot approve or apply schema modifications'
                                : !prop.antiFabricationPassed
                                  ? 'Cannot apply schema with detected fabrications'
                                  : 'Apply grounded schema to content with revision lock'
                            }
                            style={{
                              padding: '0.4rem 0.85rem',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#16a34a',
                              color: '#ffffff',
                              fontWeight: 600,
                              fontSize: '0.8rem',
                              cursor:
                                !canApprove || !prop.antiFabricationPassed
                                  ? 'not-allowed'
                                  : 'pointer',
                              opacity: !canApprove || !prop.antiFabricationPassed ? 0.6 : 1,
                            }}
                          >
                            Apply Schema (Revision Lock)
                          </button>
                        )}
                      </div>

                      <pre
                        style={{
                          background: '#1e293b',
                          color: '#f8fafc',
                          padding: '1rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          overflowX: 'auto',
                          maxHeight: '260px',
                        }}
                      >
                        {JSON.stringify(prop.proposedJsonLd, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: FACT-REVIEW & VALIDATION REPORT */}
          {activeSubTab === 'report' && report && (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem', color: '#111827' }}>
                    Editorial Fact-Review & Validation Report
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#4b5563' }}>
                    Document: <strong>{report.contentTitle}</strong> &bull; Generated:{' '}
                    {report.generatedAt}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!report) return
                    const md = formatReportAsMarkdown(report)
                    navigator.clipboard.writeText(md)
                    setCopiedReport(true)
                    setTimeout(() => setCopiedReport(false), 2500)
                  }}
                  aria-label="Copy markdown integrity report to clipboard"
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: copiedReport ? '#ecfdf5' : '#ffffff',
                    color: copiedReport ? '#065f46' : '#374151',
                    fontWeight: 600,
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  {copiedReport ? '✓ Copied Markdown' : '📋 Copy Report Markdown'}
                </button>
              </div>

              {/* Summary KPIs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {[
                  { label: 'Total Claims', value: report.summary.totalClaims, color: '#374151' },
                  {
                    label: 'Human Verified',
                    value: report.summary.humanVerifiedCount,
                    color: '#16a34a',
                  },
                  {
                    label: 'Contradicted',
                    value: report.summary.contradictedCount,
                    color: '#dc2626',
                  },
                  {
                    label: 'Outdated (Stale)',
                    value: report.summary.outdatedCount,
                    color: '#d97706',
                  },
                  {
                    label: 'Unsupported',
                    value: report.summary.unsupportedCount,
                    color: '#ca8a04',
                  },
                  { label: 'Unreviewed', value: report.summary.unreviewedCount, color: '#6b7280' },
                ].map((kpi, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: kpi.color }}>
                      {kpi.value}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.2rem' }}>
                      {kpi.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Two Column Split: Automated vs Human */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* SECTION A: AUTOMATED VALIDATION */}
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '1rem', color: '#1e293b' }}>
                    🤖 Section A: Automated Validation
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                    Deterministic syntax rules, preliminary AI checks, and source freshness
                    calculations.
                  </p>

                  <div
                    style={{
                      fontSize: '0.825rem',
                      color: '#334155',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                    }}
                  >
                    <div>
                      Schema Syntax Valid:{' '}
                      <strong>
                        {report.automatedValidation.schemaValid ? '✅ Yes' : '❌ Issues Found'}
                      </strong>
                    </div>
                    <div>
                      Anti-Fabrication Audit:{' '}
                      <strong>
                        {report.automatedValidation.antiFabricationPassed
                          ? '✅ Passed (Zero Invented Fields)'
                          : '❌ Failed'}
                      </strong>
                    </div>
                    <div>
                      Stale Sources Detected:{' '}
                      <strong>{report.automatedValidation.staleSourcesDetected}</strong>
                    </div>
                  </div>

                  {report.automatedValidation.aiFlaggedIssues.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>
                        AI Preliminary Candidate Checks:
                      </span>
                      <ul
                        style={{
                          margin: '0.25rem 0 0',
                          paddingLeft: '1.25rem',
                          fontSize: '0.78rem',
                          color: '#475569',
                        }}
                      >
                        {report.automatedValidation.aiFlaggedIssues.map((issue, idx) => (
                          <li key={idx}>
                            [{issue.claimId}] Proposed: <strong>{issue.suggestedStatus}</strong>{' '}
                            &mdash; {issue.rationale}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* SECTION B: HUMAN FACT REVIEW */}
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '1rem', color: '#14532d' }}>
                    👤 Section B: Human Fact Review
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#166534' }}>
                    Human reviewer certifications, contradiction resolutions, and signed editorial
                    audits.
                  </p>

                  <div style={{ fontSize: '0.825rem', color: '#14532d' }}>
                    Verification Ratio:{' '}
                    <strong>{report.humanFactReview.verifiedClaimsRatio}</strong>
                  </div>

                  {report.humanFactReview.unresolvedContradictions.length > 0 && (
                    <div
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        color: '#991b1b',
                        fontSize: '0.78rem',
                      }}
                    >
                      <strong>
                        Unresolved Contradictions (
                        {report.humanFactReview.unresolvedContradictions.length}):
                      </strong>
                      <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.25rem' }}>
                        {report.humanFactReview.unresolvedContradictions.map((c, i) => (
                          <li key={i}>{c.statement}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div style={{ marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#14532d' }}>
                      Human Sign-Off Ledger:
                    </span>
                    {report.humanFactReview.reviewerSignoffs.length === 0 ? (
                      <p
                        style={{
                          margin: '0.2rem 0 0',
                          fontSize: '0.78rem',
                          color: '#6b7280',
                          fontStyle: 'italic',
                        }}
                      >
                        No human sign-offs recorded yet.
                      </p>
                    ) : (
                      <ul
                        style={{
                          margin: '0.25rem 0 0',
                          paddingLeft: '1.25rem',
                          fontSize: '0.78rem',
                          color: '#14532d',
                        }}
                      >
                        {report.humanFactReview.reviewerSignoffs.map((s, idx) => (
                          <li key={idx}>
                            [{s.claimId}] Certified <strong>{s.decision}</strong> by{' '}
                            <code>{s.verifiedBy}</code> ({s.role}) at {s.verifiedAt.split('T')[0]}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal for Custom Ingestion */}
      {showIngestModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '8px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>
              Ingest Custom Factual Claim
            </h3>
            <textarea
              placeholder="Factual statement assertion..."
              value={customStatement}
              onChange={(e) => setCustomStatement(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                fontSize: '0.85rem',
              }}
            />
            <input
              type="text"
              placeholder="Optional exact quote from article"
              value={customQuote}
              onChange={(e) => setCustomQuote(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                fontSize: '0.85rem',
              }}
            />
            <input
              type="text"
              placeholder="Section or Paragraph location"
              value={customSection}
              onChange={(e) => setCustomSection(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                fontSize: '0.85rem',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowIngestModal(false)}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleIngestCustomClaim}
                disabled={!customStatement.trim()}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Ingest Claim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
