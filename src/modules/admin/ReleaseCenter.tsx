'use client'

import React, { useEffect, useState } from 'react'

import type {
  CoordinatedRelease,
  ReleaseArtifactItem,
  ReleaseGateRuleResult,
  ReleaseGateSnapshot,
  ReleaseStatus,
} from '../releases/contracts'

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  'in-review': { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  approved: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  scheduled: { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff' },
  executing: { bg: '#fefce8', text: '#a16207', border: '#fef08a' },
  completed: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  released: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  'partially-failed': { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
  'partial-failure': { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
  failed: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  cancelled: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  'rolled-back': { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
}

export default function ReleaseCenter() {
  const [releases, setReleases] = useState<CoordinatedRelease[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeRelease, setActiveRelease] = useState<CoordinatedRelease | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Workspace Tabs: 'artifacts' | 'gates' | 'approvals' | 'execution' | 'audit'
  const [activeTab, setActiveTab] = useState<
    'artifacts' | 'gates' | 'approvals' | 'execution' | 'audit'
  >('artifacts')

  // Modals State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPinModal, setShowPinModal] = useState(false)
  const [showWaiverModal, setShowWaiverModal] = useState(false)
  const [selectedRuleForWaiver, setSelectedRuleForWaiver] = useState<string | null>(null)
  const [showRollbackModal, setShowRollbackModal] = useState(false)
  const [rollbackReason, setRollbackReason] = useState('')
  const [showInspectSnapshotModal, setShowInspectSnapshotModal] = useState(false)
  const [inspectedArtifact, setInspectedArtifact] = useState<ReleaseArtifactItem | null>(null)

  // Form States
  const [createForm, setCreateForm] = useState({
    name: '',
    purpose: '',
    ownerTeam: 'Marketing & Editorial Ops',
    timeZone: 'America/Chicago',
    plannedInstant: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    campaign: '',
    labels: 'campaign, launch',
  })

  const [pinForm, setPinForm] = useState({
    targetType: 'article',
    targetId: '',
    title: '',
    canonicalUrl: '',
    pinnedRevisionId: '',
    pinnedRevisionSequence: 1,
    pinnedHash: '',
    mediaRightsStatus: 'approved',
    mediaRightsExpiresAt: '',
    redirectFromPath: '',
    redirectToPath: '',
    redirectStatusCode: '301',
  })

  const [waiverForm, setWaiverForm] = useState({
    reason: '',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
  })

  const loadReleases = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/releases')
      const data = await res.json()
      if (res.ok) {
        setReleases(data.releases || [])
      } else {
        setError(data.error || 'Failed to load releases.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network failure.')
    } finally {
      setLoading(false)
    }
  }

  const loadReleaseDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/releases/${id}`)
      const data = await res.json()
      if (res.ok) {
        setActiveRelease(data.release)
      }
    } catch {
      // Ignored
    }
  }

  useEffect(() => {
    loadReleases()
  }, [])

  useEffect(() => {
    if (selectedId) {
      loadReleaseDetail(selectedId)
    } else {
      setActiveRelease(null)
    }
  }, [selectedId])

  const handleAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!selectedId) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/releases/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Action '${action}' failed.`)
      } else {
        await loadReleaseDetail(selectedId)
        await loadReleases()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    }
  }

  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch('/api/admin/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          purpose: createForm.purpose,
          ownerTeam: createForm.ownerTeam,
          timeZone: createForm.timeZone,
          plannedInstant: new Date(createForm.plannedInstant).toISOString(),
          campaign: createForm.campaign,
          labels: createForm.labels
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setShowCreateModal(false)
        await loadReleases()
        setSelectedId(data.release.id)
      } else {
        setError(data.error || 'Failed to create release.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.')
    }
  }

  const handlePinArtifact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId) return

    const artifactPayload: any = {
      targetType: pinForm.targetType,
      targetId: pinForm.targetId,
      title: pinForm.title,
      canonicalUrl: pinForm.canonicalUrl || undefined,
      pinnedRevisionId: pinForm.pinnedRevisionId || undefined,
      pinnedRevisionSequence: pinForm.pinnedRevisionSequence
        ? Number(pinForm.pinnedRevisionSequence)
        : undefined,
      pinnedHash: pinForm.pinnedHash || `hash-${Date.now()}`,
    }

    if (pinForm.targetType === 'media') {
      artifactPayload.mediaRightsStatus = pinForm.mediaRightsStatus
      artifactPayload.mediaRightsExpiresAt = pinForm.mediaRightsExpiresAt
        ? new Date(pinForm.mediaRightsExpiresAt).toISOString()
        : undefined
    }

    if (pinForm.targetType === 'redirect') {
      artifactPayload.redirectRule = {
        fromPath: pinForm.redirectFromPath,
        toPath: pinForm.redirectToPath,
        statusCode: pinForm.redirectStatusCode,
        match: 'exact',
        enabled: true,
      }
    }

    await handleAction('pin-artifact', { artifact: artifactPayload })
    setShowPinModal(false)
  }

  const handleWaiveGate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId || !selectedRuleForWaiver) return
    await handleAction('waive-gate', {
      ruleId: selectedRuleForWaiver,
      reason: waiverForm.reason,
      expiresAt: new Date(waiverForm.expiresAt).toISOString(),
    })
    setShowWaiverModal(false)
    setWaiverForm({ reason: '', expiresAt: '' })
  }

  const handleRollback = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId) return
    await handleAction('rollback', { reason: rollbackReason })
    setShowRollbackModal(false)
    setRollbackReason('')
  }

  const filteredReleases = releases.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const titleMatch = (r.name || r.title || '').toLowerCase().includes(q)
      const campaignMatch = (r.campaign || '').toLowerCase().includes(q)
      const purposeMatch = (r.purpose || '').toLowerCase().includes(q)
      if (!titleMatch && !campaignMatch && !purposeMatch) return false
    }
    return true
  })

  return (
    <div
      style={{
        padding: '24px',
        maxWidth: '1440px',
        margin: '0 auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#0f172a',
      }}
    >
      {/* Top Banner & Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>
              Release Command Center
            </h1>
            <span
              style={{
                fontSize: '12px',
                background: '#dbeafe',
                color: '#1e40af',
                padding: '2px 8px',
                borderRadius: '12px',
                fontWeight: '600',
              }}
            >
              FLOW-04 Coordinated Workflow
            </span>
          </div>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
            Coordinate multi-page, post, presentation, media, and redirect releases with immutable
            revision pinning, preflight gates, saga execution, and full rollback safety.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {selectedId ? (
            <button
              onClick={() => setSelectedId(null)}
              style={{
                padding: '8px 16px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              ← Back to All Releases
            </button>
          ) : (
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '8px 16px',
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              + Create Release
            </button>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #f87171',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            <strong>Error:</strong> {error}
          </span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#991b1b',
              fontWeight: 'bold',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* VIEW 1: RELEASES LIST */}
      {!selectedId && (
        <div>
          {/* Controls Bar */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              marginBottom: '20px',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              placeholder="Search by name, campaign, or purpose..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: '240px',
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                'all',
                'draft',
                'in-review',
                'approved',
                'scheduled',
                'executing',
                'completed',
                'partially-failed',
                'failed',
                'cancelled',
                'rolled-back',
              ].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: '600',
                    border: '1px solid',
                    cursor: 'pointer',
                    background: statusFilter === st ? '#0f172a' : '#f8fafc',
                    color: statusFilter === st ? '#ffffff' : '#64748b',
                    borderColor: statusFilter === st ? '#0f172a' : '#cbd5e1',
                  }}
                >
                  {st.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Releases Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
              Loading coordinated releases...
            </div>
          ) : filteredReleases.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px',
                background: '#f8fafc',
                border: '1px dashed #cbd5e1',
                borderRadius: '8px',
              }}
            >
              <p style={{ margin: 0, fontWeight: '500', color: '#64748b' }}>
                No releases match current filter criteria.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  marginTop: '12px',
                  padding: '6px 14px',
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Create your first release
              </button>
            </div>
          ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '13px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      color: '#475569',
                      textTransform: 'uppercase',
                      fontSize: '11px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    <th style={{ padding: '12px 16px' }}>Release Name & Purpose</th>
                    <th style={{ padding: '12px 16px' }}>Campaign / Team</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Planned Instant & Timezone</th>
                    <th style={{ padding: '12px 16px' }}>Artifacts</th>
                    <th style={{ padding: '12px 16px' }}>Rev</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReleases.map((r) => {
                    const st = STATUS_COLORS[r.status] || STATUS_COLORS.draft
                    const count = (r.artifacts || r.executionItems || []).length
                    return (
                      <tr
                        key={r.id}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onClick={() => setSelectedId(r.id)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '14px' }}>
                            {r.name || r.title}
                          </div>
                          <div
                            style={{
                              color: '#64748b',
                              fontSize: '12px',
                              marginTop: '2px',
                              maxWidth: '360px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {r.purpose}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: '500' }}>{r.campaign || '—'}</div>
                          <div style={{ color: '#64748b', fontSize: '11px' }}>
                            {r.ownerTeam || 'Editorial Ops'}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '700',
                              background: st.bg,
                              color: st.text,
                              border: `1px solid ${st.border}`,
                            }}
                          >
                            {r.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div>
                            {r.plannedInstant || r.scheduledFor
                              ? new Date(r.plannedInstant || r.scheduledFor).toLocaleString()
                              : 'Unscheduled'}
                          </div>
                          <div style={{ color: '#64748b', fontSize: '11px' }}>
                            {r.timeZone || 'UTC'}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              background: '#f1f5f9',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontWeight: '600',
                            }}
                          >
                            {count} item{count === 1 ? '' : 's'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: '600', color: '#64748b' }}>
                          v{r.releaseRevision || 1}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedId(r.id)
                            }}
                            style={{
                              padding: '6px 12px',
                              background: '#0284c7',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: '500',
                            }}
                          >
                            Inspect →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: SELECTED RELEASE DETAIL WORKSPACE */}
      {selectedId && activeRelease && (
        <div>
          {/* Release Overview Header */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>
                    {activeRelease.name || activeRelease.title}
                  </h2>
                  {(() => {
                    const st = STATUS_COLORS[activeRelease.status] || STATUS_COLORS.draft
                    return (
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '14px',
                          fontSize: '12px',
                          fontWeight: '700',
                          background: st.bg,
                          color: st.text,
                          border: `1px solid ${st.border}`,
                        }}
                      >
                        {activeRelease.status.toUpperCase()}
                      </span>
                    )
                  })()}
                  <span
                    style={{
                      background: '#e2e8f0',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: '#334155',
                    }}
                  >
                    Release Rev {activeRelease.releaseRevision || 1}
                  </span>
                </div>
                <p
                  style={{
                    margin: '8px 0 0',
                    color: '#475569',
                    fontSize: '14px',
                    maxWidth: '720px',
                  }}
                >
                  {activeRelease.purpose}
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: '16px',
                    marginTop: '12px',
                    fontSize: '12px',
                    color: '#64748b',
                  }}
                >
                  <span>
                    <strong>Team:</strong> {activeRelease.ownerTeam || 'Editorial Ops'}
                  </span>
                  <span>
                    <strong>Campaign:</strong> {activeRelease.campaign || 'None'}
                  </span>
                  <span>
                    <strong>Scheduled:</strong>{' '}
                    {new Date(
                      activeRelease.plannedInstant || activeRelease.scheduledFor,
                    ).toLocaleString()}{' '}
                    ({activeRelease.timeZone || 'UTC'})
                  </span>
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleAction('evaluate-gates')}
                  style={{
                    padding: '7px 12px',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  🔍 Evaluate Gates
                </button>

                {activeRelease.status === 'draft' && (
                  <button
                    onClick={() => handleAction('submit-review')}
                    style={{
                      padding: '7px 12px',
                      background: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Submit for Review
                  </button>
                )}

                {['draft', 'in-review'].includes(activeRelease.status) && (
                  <button
                    onClick={() =>
                      handleAction('approve', { comment: 'Approved via Command Center' })
                    }
                    style={{
                      padding: '7px 12px',
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    ✓ Approve Release
                  </button>
                )}

                {activeRelease.status === 'approved' && (
                  <button
                    onClick={() =>
                      handleAction('schedule', {
                        scheduledFor: activeRelease.plannedInstant || activeRelease.scheduledFor,
                        timeZone: activeRelease.timeZone,
                      })
                    }
                    style={{
                      padding: '7px 12px',
                      background: '#7e22ce',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    ⏱ Schedule Execution
                  </button>
                )}

                {['approved', 'scheduled'].includes(activeRelease.status) && (
                  <button
                    onClick={() => handleAction('execute')}
                    style={{
                      padding: '7px 12px',
                      background: '#0f172a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    ⚡ Execute Now
                  </button>
                )}

                {['partially-failed', 'failed'].includes(activeRelease.status) && (
                  <button
                    onClick={() => handleAction('retry')}
                    style={{
                      padding: '7px 12px',
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    ↻ Retry Failed Steps
                  </button>
                )}

                {['completed', 'partially-failed'].includes(activeRelease.status) && (
                  <button
                    onClick={() => setShowRollbackModal(true)}
                    style={{
                      padding: '7px 12px',
                      background: '#ea580c',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    ↩ Rollback Release
                  </button>
                )}

                {['draft', 'in-review', 'approved', 'scheduled'].includes(activeRelease.status) && (
                  <button
                    onClick={() => handleAction('cancel', { reason: 'Cancelled by operator' })}
                    style={{
                      padding: '7px 12px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '2px',
              borderBottom: '1px solid #e2e8f0',
              marginBottom: '20px',
            }}
          >
            {[
              {
                id: 'artifacts',
                label: `📦 Pinned Artifacts (${(activeRelease.artifacts || activeRelease.executionItems || []).length})`,
              },
              {
                id: 'gates',
                label: `🛡 Preflight Gates (${activeRelease.gateSnapshot ? (activeRelease.gateSnapshot.blockerCount > 0 ? 'Blocked' : 'Passed') : 'Unchecked'})`,
              },
              { id: 'approvals', label: `✓ Approvals (${(activeRelease.approvals || []).length})` },
              {
                id: 'execution',
                label: `⚡ Execution & Public URLs (${(activeRelease.resultingUrls || []).length})`,
              },
              {
                id: 'audit',
                label: `📜 Audit Trail (${(activeRelease.executionAudit || []).length})`,
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                style={{
                  padding: '10px 16px',
                  background: activeTab === t.id ? '#ffffff' : '#f8fafc',
                  border: '1px solid',
                  borderColor:
                    activeTab === t.id ? '#cbd5e1 #cbd5e1 #ffffff #cbd5e1' : 'transparent',
                  borderTopLeftRadius: '6px',
                  borderTopRightRadius: '6px',
                  fontWeight: activeTab === t.id ? '700' : '500',
                  color: activeTab === t.id ? '#0284c7' : '#64748b',
                  cursor: 'pointer',
                  marginBottom: '-1px',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB 1: PINNED ARTIFACTS */}
          {activeTab === 'artifacts' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                  Explicit Pinned Artifacts
                </h3>
                <button
                  onClick={() => setShowPinModal(true)}
                  style={{
                    padding: '6px 14px',
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  + Pin Artifact
                </button>
              </div>

              {!activeRelease.artifacts || activeRelease.artifacts.length === 0 ? (
                <div
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '8px',
                  }}
                >
                  <p style={{ margin: 0, color: '#64748b' }}>
                    No artifacts have been pinned to this release yet.
                  </p>
                  <button
                    onClick={() => setShowPinModal(true)}
                    style={{
                      marginTop: '8px',
                      padding: '6px 12px',
                      background: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Pin an Article, Page, Presentation, Media, or Redirect
                  </button>
                </div>
              ) : (
                <div
                  style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      textAlign: 'left',
                      fontSize: '13px',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: '#f8fafc',
                          borderBottom: '1px solid #e2e8f0',
                          color: '#475569',
                          fontSize: '11px',
                          textTransform: 'uppercase',
                        }}
                      >
                        <th style={{ padding: '10px 14px' }}>Type</th>
                        <th style={{ padding: '10px 14px' }}>Title & Canonical Path</th>
                        <th style={{ padding: '10px 14px' }}>Pinned Revision / Hash</th>
                        <th style={{ padding: '10px 14px' }}>Step Status</th>
                        <th style={{ padding: '10px 14px' }}>Attempts</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRelease.artifacts.map((a) => (
                        <tr key={a.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <span
                              style={{
                                background: '#f1f5f9',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontWeight: '600',
                                fontSize: '11px',
                              }}
                            >
                              {a.targetType.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: '600' }}>{a.title || a.id}</div>
                            <div style={{ color: '#64748b', fontSize: '11px' }}>
                              {a.canonicalUrl ||
                                (a.redirectRule
                                  ? `${a.redirectRule.fromPath} → ${a.redirectRule.toPath}`
                                  : a.targetId)}
                            </div>
                          </td>
                          <td
                            style={{
                              padding: '10px 14px',
                              fontFamily: 'monospace',
                              fontSize: '12px',
                            }}
                          >
                            {a.pinnedRevisionId ||
                              (a.pinnedRevisionSequence
                                ? `Rev ${a.pinnedRevisionSequence}`
                                : 'Snapshot')}
                            <div style={{ color: '#94a3b8', fontSize: '10px' }}>
                              {a.pinnedHash.slice(0, 12)}...
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '11px',
                                fontWeight: '600',
                                background:
                                  a.status === 'succeeded'
                                    ? '#ecfdf5'
                                    : a.status === 'failed'
                                      ? '#fef2f2'
                                      : a.status === 'compensated'
                                        ? '#fff7ed'
                                        : '#f1f5f9',
                                color:
                                  a.status === 'succeeded'
                                    ? '#047857'
                                    : a.status === 'failed'
                                      ? '#b91c1c'
                                      : a.status === 'compensated'
                                        ? '#c2410c'
                                        : '#475569',
                              }}
                            >
                              {a.status.toUpperCase()}
                            </span>
                            {a.error && (
                              <div style={{ color: '#b91c1c', fontSize: '11px', marginTop: '2px' }}>
                                {a.error}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: '600' }}>
                            {a.attempts || 0}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <button
                              onClick={() => {
                                setInspectedArtifact(a)
                                setShowInspectSnapshotModal(true)
                              }}
                              style={{
                                padding: '4px 8px',
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                marginRight: '6px',
                              }}
                            >
                              Inspect
                            </button>
                            {['draft', 'in-review'].includes(activeRelease.status) && (
                              <button
                                onClick={() => handleAction('unpin-artifact', { artifactId: a.id })}
                                style={{
                                  padding: '4px 8px',
                                  background: '#fee2e2',
                                  color: '#b91c1c',
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                }}
                              >
                                Unpin
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PREFLIGHT GATES & WAIVERS */}
          {activeTab === 'gates' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                    Preflight Gates & Safety Matrix
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '12px' }}>
                    Every preflight gate verifies critical safety, approvals, canonical routes, and
                    Quality Center thresholds before release execution.
                  </p>
                </div>
                <button
                  onClick={() => handleAction('evaluate-gates')}
                  style={{
                    padding: '6px 14px',
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Re-Scan Gates
                </button>
              </div>

              {!activeRelease.gateSnapshot ? (
                <div
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '8px',
                  }}
                >
                  <p style={{ margin: 0, color: '#64748b' }}>
                    No gate evaluation snapshot recorded for this release revision.
                  </p>
                  <button
                    onClick={() => handleAction('evaluate-gates')}
                    style={{
                      marginTop: '8px',
                      padding: '6px 14px',
                      background: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Run Preflight Evaluation
                  </button>
                </div>
              ) : (
                <div>
                  {/* Gate Snapshot Header */}
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '6px',
                      marginBottom: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background:
                        activeRelease.gateSnapshot.blockerCount > 0
                          ? '#fef2f2'
                          : activeRelease.gateSnapshot.warningCount > 0
                            ? '#fffbeb'
                            : '#ecfdf5',
                      border: `1px solid ${activeRelease.gateSnapshot.blockerCount > 0 ? '#fca5a5' : activeRelease.gateSnapshot.warningCount > 0 ? '#fde68a' : '#a7f3d0'}`,
                    }}
                  >
                    <div>
                      <strong>Overall Gate Status:</strong>{' '}
                      {activeRelease.gateSnapshot.overallStatus.toUpperCase()} (
                      {activeRelease.gateSnapshot.blockerCount} Blocker
                      {activeRelease.gateSnapshot.blockerCount === 1 ? '' : 's'},{' '}
                      {activeRelease.gateSnapshot.warningCount} Warning
                      {activeRelease.gateSnapshot.warningCount === 1 ? '' : 's'})
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#64748b',
                          marginTop: '2px',
                          fontFamily: 'monospace',
                        }}
                      >
                        Fingerprint: {activeRelease.gateSnapshot.evaluatedFingerprint.slice(0, 24)}
                        ... (Evaluated at{' '}
                        {new Date(activeRelease.gateSnapshot.evaluatedAt).toLocaleTimeString()})
                      </div>
                    </div>
                  </div>

                  {/* Rules Checklist */}
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {activeRelease.gateSnapshot.rules.map((rule: ReleaseGateRuleResult) => (
                      <div
                        key={rule.ruleId}
                        style={{
                          padding: '12px 16px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background:
                            rule.status === 'passed'
                              ? '#ffffff'
                              : rule.status === 'waived'
                                ? '#faf5ff'
                                : '#fef2f2',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '600', fontSize: '14px' }}>{rule.name}</span>
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '1px 6px',
                                borderRadius: '8px',
                                background: rule.severity === 'blocker' ? '#fee2e2' : '#fef3c7',
                                color: rule.severity === 'blocker' ? '#991b1b' : '#92400e',
                                fontWeight: '700',
                              }}
                            >
                              {rule.severity.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              {rule.ruleVersion}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                            {rule.message}
                          </div>
                          {rule.waiver && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: '#7e22ce',
                                marginTop: '4px',
                                background: '#f3e8ff',
                                padding: '4px 8px',
                                borderRadius: '4px',
                              }}
                            >
                              <strong>Waived by {rule.waiver.waivedByUserRole}:</strong>{' '}
                              {rule.waiver.reason} (Expires:{' '}
                              {new Date(rule.waiver.expiresAt).toLocaleDateString()})
                            </div>
                          )}
                        </div>
                        <div>
                          {rule.status === 'failed' && (
                            <button
                              onClick={() => {
                                setSelectedRuleForWaiver(rule.ruleId)
                                setShowWaiverModal(true)
                              }}
                              style={{
                                padding: '5px 10px',
                                background: '#7e22ce',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                fontWeight: '500',
                              }}
                            >
                              Grant Waiver
                            </button>
                          )}
                          {rule.status === 'passed' && (
                            <span style={{ color: '#16a34a', fontWeight: '700', fontSize: '13px' }}>
                              ✓ Passed
                            </span>
                          )}
                          {rule.status === 'waived' && (
                            <span style={{ color: '#7e22ce', fontWeight: '700', fontSize: '13px' }}>
                              ⚖ Waived
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: APPROVALS */}
          {activeTab === 'approvals' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                  Editorial Approvals & Sign-off History
                </h3>
                {['draft', 'in-review'].includes(activeRelease.status) && (
                  <button
                    onClick={() =>
                      handleAction('approve', { comment: 'Signed off from Command Center' })
                    }
                    style={{
                      padding: '6px 14px',
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    ✓ Add Official Approval
                  </button>
                )}
              </div>

              {!activeRelease.approvals || activeRelease.approvals.length === 0 ? (
                <div
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '8px',
                    color: '#64748b',
                  }}
                >
                  No editorial approval signatures have been registered yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {activeRelease.approvals.map((app) => (
                    <div
                      key={app.id}
                      style={{
                        padding: '12px 16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        background: '#ffffff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '600' }}>
                          Approved by {app.actorRole.toUpperCase()} ({app.actorId})
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          {app.comment || 'No comment provided.'}
                        </div>
                        <div
                          style={{
                            fontSize: '10px',
                            color: '#94a3b8',
                            marginTop: '4px',
                            fontFamily: 'monospace',
                          }}
                        >
                          Fingerprint: {app.gateSnapshotFingerprint.slice(0, 20)}... | Revision: v
                          {app.releaseRevision}
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {new Date(app.decidedAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SAGA EXECUTION & PUBLIC URLS */}
          {activeTab === 'execution' && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>
                Resulting Live Public URLs
              </h3>
              {!activeRelease.resultingUrls || activeRelease.resultingUrls.length === 0 ? (
                <div
                  style={{
                    padding: '16px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    color: '#64748b',
                    fontSize: '13px',
                    marginBottom: '24px',
                  }}
                >
                  No public URLs published yet. Execute or schedule the release to verify published
                  public endpoints.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '8px', marginBottom: '24px' }}>
                  {activeRelease.resultingUrls.map((url) => (
                    <div
                      key={url}
                      style={{
                        padding: '10px 14px',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontWeight: '600', color: '#047857' }}>{url}</span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: '12px',
                          color: '#0284c7',
                          textDecoration: 'none',
                          fontWeight: '500',
                        }}
                      >
                        Open in browser ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}

              <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>
                Saga Outbox Execution Steps
              </h3>
              {!activeRelease.sagaSteps || activeRelease.sagaSteps.length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '8px',
                    color: '#64748b',
                  }}
                >
                  No saga execution steps logged yet.
                </div>
              ) : (
                <div
                  style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      textAlign: 'left',
                      fontSize: '13px',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: '#f8fafc',
                          borderBottom: '1px solid #e2e8f0',
                          color: '#475569',
                          fontSize: '11px',
                          textTransform: 'uppercase',
                        }}
                      >
                        <th style={{ padding: '10px 14px' }}>Step ID</th>
                        <th style={{ padding: '10px 14px' }}>Boundary</th>
                        <th style={{ padding: '10px 14px' }}>Target Artifact</th>
                        <th style={{ padding: '10px 14px' }}>Status</th>
                        <th style={{ padding: '10px 14px' }}>Completed At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRelease.sagaSteps.map((s) => (
                        <tr key={s.stepId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>
                            {s.stepId}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span
                              style={{
                                background:
                                  s.boundary === 'transactional_db' ? '#dbeafe' : '#f3e8ff',
                                color: s.boundary === 'transactional_db' ? '#1e40af' : '#6b21a8',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '600',
                              }}
                            >
                              {s.boundary}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: '600' }}>
                            {s.artifactId}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span
                              style={{
                                color: s.status === 'succeeded' ? '#16a34a' : '#dc2626',
                                fontWeight: '600',
                              }}
                            >
                              {s.status.toUpperCase()}
                            </span>
                            {s.error && (
                              <div style={{ color: '#dc2626', fontSize: '11px' }}>{s.error}</div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#64748b' }}>
                            {s.completedAt ? new Date(s.completedAt).toLocaleTimeString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600' }}>
                Immutable Release Audit Trail
              </h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                {(activeRelease.executionAudit || []).map((ev, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      background: '#ffffff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: '600', color: '#0f172a' }}>{ev.action}</span>
                      <span style={{ color: '#64748b', fontSize: '12px', marginLeft: '8px' }}>
                        by {ev.actorId}
                      </span>
                      {ev.details && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#475569',
                            marginTop: '2px',
                            fontFamily: 'monospace',
                          }}
                        >
                          {JSON.stringify(ev.details)}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {new Date(ev.at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE RELEASE MODAL */}
      {showCreateModal && (
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
              padding: '24px',
              width: '540px',
              maxWidth: '90vw',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: '18px', fontWeight: '700' }}>
              Create Coordinated Release
            </h2>
            <form onSubmit={handleCreateRelease}>
              <div style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    marginBottom: '4px',
                  }}
                >
                  Release Name
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                  }}
                  placeholder="e.g. Fall Brand Refresh & Store Launch"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    marginBottom: '4px',
                  }}
                >
                  Purpose & Rationale
                </label>
                <textarea
                  required
                  rows={3}
                  value={createForm.purpose}
                  onChange={(e) => setCreateForm({ ...createForm, purpose: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                  }}
                  placeholder="Describe the cross-cutting goals of this coordinated release..."
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '12px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '600',
                      marginBottom: '4px',
                    }}
                  >
                    Owner Team
                  </label>
                  <input
                    type="text"
                    value={createForm.ownerTeam}
                    onChange={(e) => setCreateForm({ ...createForm, ownerTeam: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '600',
                      marginBottom: '4px',
                    }}
                  >
                    Campaign Slug
                  </label>
                  <input
                    type="text"
                    value={createForm.campaign}
                    onChange={(e) => setCreateForm({ ...createForm, campaign: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                    }}
                    placeholder="e.g. fall-brand-2026"
                  />
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '600',
                      marginBottom: '4px',
                    }}
                  >
                    Planned Instant
                  </label>
                  <input
                    type="datetime-local"
                    value={createForm.plannedInstant}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, plannedInstant: e.target.value })
                    }
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '600',
                      marginBottom: '4px',
                    }}
                  >
                    IANA Timezone
                  </label>
                  <select
                    value={createForm.timeZone}
                    onChange={(e) => setCreateForm({ ...createForm, timeZone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                    }}
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Chicago">America/Chicago</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                    <option value="Europe/London">Europe/London</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '8px 16px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Create Release
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PIN ARTIFACT MODAL */}
      {showPinModal && (
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
              padding: '24px',
              width: '500px',
              maxWidth: '90vw',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: '18px', fontWeight: '700' }}>
              Pin Artifact to Release
            </h2>
            <form onSubmit={handlePinArtifact}>
              <div style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    marginBottom: '4px',
                  }}
                >
                  Artifact Type
                </label>
                <select
                  value={pinForm.targetType}
                  onChange={(e) => setPinForm({ ...pinForm, targetType: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                  }}
                >
                  <option value="article">Article / Post</option>
                  <option value="page">Page Layout</option>
                  <option value="presentation">Presentation / Global Region</option>
                  <option value="media">Media Asset</option>
                  <option value="redirect">Public Redirect</option>
                  <option value="product">Storefront Product</option>
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    marginBottom: '4px',
                  }}
                >
                  Target ID
                </label>
                <input
                  type="text"
                  required
                  value={pinForm.targetId}
                  onChange={(e) => setPinForm({ ...pinForm, targetId: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                  }}
                  placeholder="e.g. art-101 or layout-header"
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    marginBottom: '4px',
                  }}
                >
                  Title / Label
                </label>
                <input
                  type="text"
                  required
                  value={pinForm.title}
                  onChange={(e) => setPinForm({ ...pinForm, title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                  }}
                />
              </div>

              {pinForm.targetType === 'redirect' ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    marginBottom: '12px',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: '600',
                        marginBottom: '4px',
                      }}
                    >
                      From Path
                    </label>
                    <input
                      type="text"
                      required
                      value={pinForm.redirectFromPath}
                      onChange={(e) => setPinForm({ ...pinForm, redirectFromPath: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                      }}
                      placeholder="/legacy-url"
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: '600',
                        marginBottom: '4px',
                      }}
                    >
                      To Path
                    </label>
                    <input
                      type="text"
                      required
                      value={pinForm.redirectToPath}
                      onChange={(e) => setPinForm({ ...pinForm, redirectToPath: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                      }}
                      placeholder="/new-url"
                    />
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '600',
                      marginBottom: '4px',
                    }}
                  >
                    Canonical URL / Path
                  </label>
                  <input
                    type="text"
                    value={pinForm.canonicalUrl}
                    onChange={(e) => setPinForm({ ...pinForm, canonicalUrl: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                    }}
                    placeholder="/articles/example-post"
                  />
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: '600',
                      marginBottom: '4px',
                    }}
                  >
                    Pinned Revision ID
                  </label>
                  <input
                    type="text"
                    value={pinForm.pinnedRevisionId}
                    onChange={(e) => setPinForm({ ...pinForm, pinnedRevisionId: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                    }}
                    placeholder="e.g. rev-001"
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: '600',
                      marginBottom: '4px',
                    }}
                  >
                    Pinned Hash
                  </label>
                  <input
                    type="text"
                    value={pinForm.pinnedHash}
                    onChange={(e) => setPinForm({ ...pinForm, pinnedHash: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                    }}
                    placeholder="SHA-256 content hash"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  style={{
                    padding: '8px 16px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Pin Artifact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GRANT WAIVER MODAL */}
      {showWaiverModal && (
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
              padding: '24px',
              width: '480px',
              maxWidth: '90vw',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: '18px', fontWeight: '700' }}>
              Grant Authorized Preflight Waiver
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b' }}>
              Waiving rule <strong>{selectedRuleForWaiver}</strong> requires explicit staff
              authorization with an audit reason and expiration date.
            </p>
            <form onSubmit={handleWaiveGate}>
              <div style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    marginBottom: '4px',
                  }}
                >
                  Waiver Justification Reason
                </label>
                <textarea
                  required
                  rows={3}
                  value={waiverForm.reason}
                  onChange={(e) => setWaiverForm({ ...waiverForm, reason: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                  }}
                  placeholder="Explain why this issue is safe to waive for this release..."
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    marginBottom: '4px',
                  }}
                >
                  Waiver Expiry Date
                </label>
                <input
                  type="datetime-local"
                  required
                  value={waiverForm.expiresAt}
                  onChange={(e) => setWaiverForm({ ...waiverForm, expiresAt: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowWaiverModal(false)}
                  style={{
                    padding: '8px 16px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    background: '#7e22ce',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Authorize Waiver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROLLBACK MODAL */}
      {showRollbackModal && (
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
              padding: '24px',
              width: '480px',
              maxWidth: '90vw',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: '18px', fontWeight: '700', color: '#c2410c' }}>
              Confirm Release Rollback
            </h2>
            <p style={{ fontSize: '13px', color: '#475569' }}>
              Rollback will safely restore last-known-good revisions for all published articles,
              pages, presentation templates, and redirects. A deliberate new public revision will be
              recorded; the released audit trail is never deleted.
            </p>
            <form onSubmit={handleRollback}>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    marginBottom: '4px',
                  }}
                >
                  Rollback Justification Reason
                </label>
                <textarea
                  required
                  rows={3}
                  value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                  }}
                  placeholder="e.g. Broken pricing calculations or legal recall..."
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowRollbackModal(false)}
                  style={{
                    padding: '8px 16px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    background: '#c2410c',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Execute Rollback
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECT SNAPSHOT MODAL */}
      {showInspectSnapshotModal && inspectedArtifact && (
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
              padding: '24px',
              width: '640px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
                Artifact Snapshot: {inspectedArtifact.title}
              </h2>
              <button
                onClick={() => setShowInspectSnapshotModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                background: '#f8fafc',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              <pre style={{ margin: 0 }}>{JSON.stringify(inspectedArtifact, null, 2)}</pre>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                onClick={() => setShowInspectSnapshotModal(false)}
                style={{
                  padding: '8px 16px',
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
