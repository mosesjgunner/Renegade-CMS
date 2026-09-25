'use client'

import React, { useCallback, useEffect, useState } from 'react'
import type {
  CommandCenterOverview,
  HonestMediaState,
  MediaAssetSummary,
} from '../media/command-center'
import { MediaUploader } from '../media/MediaUploader'
import { ImageEditorModal, type ImageEditorAsset } from '../media/image-editor'

type Tab = 'overview' | 'assets' | 'queue' | 'podcasts' | 'videos' | 'governance'

const stateColors: Record<HonestMediaState, { bg: string; text: string }> = {
  uploaded: { bg: '#e0e7ff', text: '#3730a3' },
  verifying: { bg: '#fef3c7', text: '#92400e' },
  processing: { bg: '#e0f2fe', text: '#0369a1' },
  ready: { bg: '#dcfce7', text: '#166534' },
  degraded: { bg: '#fef9c3', text: '#854d0e' },
  blocked: { bg: '#fee2e2', text: '#991b1b' },
  failed: { bg: '#fecaca', text: '#b91c1c' },
  archived: { bg: '#f3f4f6', text: '#4b5563' },
}

export function MediaCommandCenter({ siteId }: { siteId: string }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<CommandCenterOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<MediaAssetSummary | null>(null)
  const [editingAsset, setEditingAsset] = useState<ImageEditorAsset | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [stateFilter, setStateFilter] = useState<string>('all')
  const [usageFilter, setUsageFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showUploader, setShowUploader] = useState(false)
  const [isActionInProgress, setIsActionInProgress] = useState(false)
  const [usagesList, setUsagesList] = useState<Array<Record<string, unknown>>>([])
  const [impactList, setImpactList] = useState<Array<Record<string, unknown>>>([])

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/media/command-center?siteId=${encodeURIComponent(siteId)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load command center.')
      setData(json.overview)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Error loading media command center.')
    }
  }, [siteId])

  useEffect(() => {
    let active = true
    fetch(`/api/media/command-center?siteId=${encodeURIComponent(siteId)}`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load command center.')
        if (active) {
          setData(json.overview)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (active) {
          setMessage(err instanceof Error ? err.message : 'Error loading media command center.')
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [siteId, tab])

  useEffect(() => {
    const onUpload = () => {
      void loadData()
    }
    window.addEventListener('renegade:media-uploaded', onUpload)
    return () => {
      window.removeEventListener('renegade:media-uploaded', onUpload)
    }
  }, [loadData])

  const executeAction = async (action: string, payload: Record<string, unknown> = {}) => {
    setIsActionInProgress(true)
    setMessage(`Executing ${action}...`)
    try {
      const res = await fetch('/api/media/command-center', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId, action, ...payload }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || `${action} failed.`)
      setMessage(`Action ${action} succeeded.`)
      await loadData()
      return result
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `${action} failed.`)
      throw err
    } finally {
      setIsActionInProgress(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  // Filter assets
  const filteredAssets = (data?.assets ?? []).filter((asset) => {
    if (typeFilter !== 'all' && asset.kind !== typeFilter) return false
    if (stateFilter !== 'all' && asset.honestState !== stateFilter) return false
    if (usageFilter === 'public' && asset.usagesCount === 0) return false
    if (usageFilter === 'orphan' && !asset.isOrphan) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        asset.title.toLowerCase().includes(query) ||
        asset.altText.toLowerCase().includes(query) ||
        asset.creatorCredit.toLowerCase().includes(query) ||
        asset.mimeType.toLowerCase().includes(query)
      )
    }
    return true
  })

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem' }}>
      {/* Top Banner & Header */}
      <header
        style={{
          borderBottom: '2px solid #e5e7eb',
          paddingBottom: '1rem',
          marginBottom: '1rem',
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
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>
              Media Command Center
            </h1>
            <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
              Unified operations, storage telemetry, lifecycle governance, and pipelines.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowUploader((prev) => !prev)}
              style={{
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {showUploader ? 'Close Uploader' : '+ Upload Media'}
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading || isActionInProgress}
              style={{
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Global telemetry status pills */}
        {data && (
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              marginTop: '1rem',
              flexWrap: 'wrap',
              fontSize: '0.85rem',
            }}
          >
            <span
              style={{
                padding: '0.25rem 0.6rem',
                backgroundColor: data.storage.status === 'healthy' ? '#dcfce7' : '#fee2e2',
                color: data.storage.status === 'healthy' ? '#166534' : '#991b1b',
                borderRadius: '9999px',
                fontWeight: 600,
              }}
            >
              Storage: {data.storage.driver.toUpperCase()} ({data.storage.status})
            </span>
            <span
              style={{
                padding: '0.25rem 0.6rem',
                backgroundColor: data.worker.status === 'online' ? '#e0f2fe' : '#fef3c7',
                color: data.worker.status === 'online' ? '#0369a1' : '#92400e',
                borderRadius: '9999px',
                fontWeight: 600,
              }}
            >
              Worker: {data.worker.activeProfile} ({data.worker.status})
            </span>
            <span
              style={{
                padding: '0.25rem 0.6rem',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                borderRadius: '9999px',
              }}
            >
              Total Footprint: {formatBytes(data.stats.totalBytes)} (
              {data.stats.variantSavingsBytes > 0
                ? `saved ${formatBytes(data.stats.variantSavingsBytes)}`
                : '0 saved'}
              )
            </span>
            <span
              style={{
                padding: '0.25rem 0.6rem',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                borderRadius: '9999px',
              }}
            >
              Queues: {data.worker.queues.media} media, {data.worker.queues['media-heavy']} heavy
            </span>
          </div>
        )}
      </header>

      {/* Uploader Modal/Section */}
      {showUploader && (
        <section
          style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Durable Resumable Ingest Active</h3>
          <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>
            Use the canonical library uploader below to stage chunks with checksum verification.
          </p>
        </section>
      )}

      {/* Navigation Tabs */}
      <nav
        aria-label="Command Center views"
        role="tablist"
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid #e5e7eb',
          marginBottom: '1.5rem',
          overflowX: 'auto',
        }}
      >
        {(
          [
            ['overview', 'Overview & Health', 'Overview & Health'],
            ['assets', 'Assets & DAM', `Assets (${data?.stats.totalAssets ?? 0})`],
            [
              'queue',
              'Queue & Sessions',
              `Queue & Sessions (${(data?.recentJobs.length ?? 0) + (data?.recentSessions.length ?? 0)})`,
            ],
            ['podcasts', 'Podcast Center', `Podcast Center (${data?.podcasts.shows.length ?? 0})`],
            ['videos', 'Video Center', `Video Center (${data?.videos.length ?? 0})`],
            ['governance', 'Governance & Duplicates', 'Governance & Duplicates'],
          ] as const
        ).map(([key, tabName, buttonLabel]) => (
          <div
            key={key}
            role="tab"
            aria-label={tabName}
            aria-selected={tab === key}
            onClick={() => {
              setTab(key)
              void loadData()
            }}
            style={{ display: 'inline-flex' }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setTab(key)
                void loadData()
              }}
              style={{
                padding: '0.6rem 1rem',
                border: 'none',
                background: 'none',
                fontWeight: tab === key ? 700 : 500,
                color: tab === key ? '#2563eb' : '#4b5563',
                borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {buttonLabel}
            </button>
          </div>
        ))}
      </nav>

      {/* Status / feedback message */}
      {message && (
        <div
          role="status"
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#f3f4f6',
            borderLeft: '4px solid #2563eb',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
          }}
        >
          {message}
        </div>
      )}

      {/* =========================================================================
          TAB 1: OVERVIEW & HEALTH
      ========================================================================= */}
      {tab === 'overview' && data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {/* Storage telemetry */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Storage Telemetry</h3>
            <h4 style={{ margin: '0 0 0.5rem', color: '#1f2937' }}>Storage Adapter</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
              <li>
                <strong>Driver:</strong> {data.storage.driver}
              </li>
              <li>
                <strong>Health:</strong> {data.storage.status}
              </li>
              <li>
                <strong>Target:</strong> <code>{data.storage.target}</code>
              </li>
              <li>
                <strong>Capabilities:</strong> Atomic Write, Private Blobs, Checksum Addressed, Byte
                Range Requests
              </li>
            </ul>
          </div>

          {/* Worker telemetry */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Worker Telemetry</h3>
            <h4 style={{ margin: '0 0 0.5rem', color: '#1f2937' }}>Worker Status</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
              <li>
                <strong>Active Profile:</strong> {data.worker.activeProfile}
              </li>
              <li>
                <strong>Status:</strong> {data.worker.status}
              </li>
              <li>
                <strong>PID:</strong> {data.worker.pid || 'N/A'}
              </li>
              <li>
                <strong>Last Heartbeat:</strong> {data.worker.lastHeartbeat || 'None'}
              </li>
              <li>
                <strong>Operations Queue:</strong> {data.worker.queues.operations}
              </li>
              <li>
                <strong>Media Queue:</strong> {data.worker.queues.media}
              </li>
              <li>
                <strong>Heavy Video Queue:</strong> {data.worker.queues['media-heavy']}
              </li>
            </ul>
          </div>

          {/* Deliverable Footprint */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Deliverable Footprint</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
              <li>
                <strong>Total Footprint:</strong> {formatBytes(data.stats.totalBytes)}
              </li>
              <li>
                <strong>Optimized Savings:</strong> {formatBytes(data.stats.variantSavingsBytes)}
              </li>
              <li>
                <strong>Total Assets:</strong> {data.stats.totalAssets}
              </li>
            </ul>
          </div>

          {/* Honest states summary */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
              gridColumn: '1 / -1',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Honest Media States Distribution</h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {(Object.entries(data.stats.stateCounts) as Array<[HonestMediaState, number]>).map(
                ([st, count]) => (
                  <div
                    key={st}
                    style={{
                      flex: 1,
                      minWidth: '100px',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      backgroundColor: stateColors[st].bg,
                      color: stateColors[st].text,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{count}</div>
                    <div style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>{st}</div>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Recent Failures */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
              gridColumn: '1 / -1',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Recent Failures & Interrupted Work</h3>
            {data.recentFailures.length === 0 ? (
              <p style={{ color: '#166534', margin: 0 }}>
                No active failures or interrupted jobs detected.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Type</th>
                    <th style={{ padding: '0.5rem' }}>Summary</th>
                    <th style={{ padding: '0.5rem' }}>Details</th>
                    <th style={{ padding: '0.5rem' }}>Timestamp</th>
                    <th style={{ padding: '0.5rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentFailures.map((failure) => (
                    <tr
                      key={`${failure.id}-${failure.timestamp}`}
                      style={{ borderBottom: '1px solid #f3f4f6' }}
                    >
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            textTransform: 'uppercase',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          {failure.type}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem' }}>{failure.summary}</td>
                      <td style={{ padding: '0.5rem', color: '#b91c1c' }}>{failure.details}</td>
                      <td style={{ padding: '0.5rem', color: '#6b7280' }}>{failure.timestamp}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {failure.retryable && (
                          <button
                            type="button"
                            onClick={() => void executeAction('retry-job', { jobId: failure.id })}
                            disabled={isActionInProgress}
                            style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: '#2563eb',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: ASSETS & DAM
      ========================================================================= */}
      {tab === 'assets' && (
        <div>
          {/* Controls & Filters */}
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              flexWrap: 'wrap',
              marginBottom: '1rem',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              placeholder="Filter assets by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                minWidth: '220px',
              }}
            />
            <button
              type="button"
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                backgroundColor: '#f3f4f6',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              Batch Actions
            </button>
            <label style={{ fontSize: '0.85rem' }}>
              Type:{' '}
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                <option value="image">Images</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
                <option value="document">Documents</option>
              </select>
            </label>
            <label style={{ fontSize: '0.85rem' }}>
              State:{' '}
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                <option value="all">All States</option>
                <option value="ready">Ready</option>
                <option value="degraded">Degraded</option>
                <option value="blocked">Blocked</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label style={{ fontSize: '0.85rem' }}>
              Usage:{' '}
              <select value={usageFilter} onChange={(e) => setUsageFilter(e.target.value)}>
                <option value="all">All Usages</option>
                <option value="public">Public Usages</option>
                <option value="orphan">Orphans Only</option>
              </select>
            </label>
            <span style={{ fontSize: '0.85rem', color: '#6b7280', marginLeft: 'auto' }}>
              Showing {filteredAssets.length} of {data?.assets.length ?? 0} assets
            </span>
          </div>

          {/* Assets Table */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '0.6rem' }}>Asset</th>
                <th style={{ padding: '0.6rem' }}>Type</th>
                <th style={{ padding: '0.6rem' }}>State</th>
                <th style={{ padding: '0.6rem' }}>Size</th>
                <th style={{ padding: '0.6rem' }}>Usages</th>
                <th style={{ padding: '0.6rem' }}>Rights & Credit</th>
                <th style={{ padding: '0.6rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => (
                <tr
                  key={asset.id}
                  style={{
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: selectedAsset?.id === asset.id ? '#eff6ff' : 'transparent',
                  }}
                >
                  <td style={{ padding: '0.6rem' }}>
                    <strong>{asset.title}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{asset.mimeType}</div>
                  </td>
                  <td style={{ padding: '0.6rem', textTransform: 'capitalize' }}>{asset.kind}</td>
                  <td style={{ padding: '0.6rem' }}>
                    <span
                      style={{
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: stateColors[asset.honestState].bg,
                        color: stateColors[asset.honestState].text,
                      }}
                    >
                      {asset.honestState}
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem' }}>{formatBytes(asset.sizeBytes)}</td>
                  <td style={{ padding: '0.6rem' }}>
                    {asset.usagesCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAsset(asset)
                          void executeAction('inspect-usages', { mediaId: asset.id }).then(
                            (res) => {
                              setUsagesList((res.usages as Array<Record<string, unknown>>) || [])
                            },
                          )
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563eb',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                      >
                        {asset.usagesCount} usage{asset.usagesCount > 1 ? 's' : ''}
                      </button>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>Orphan</span>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem' }}>
                    <div>
                      {asset.creatorCredit || (
                        <span style={{ color: '#d97706' }}>Missing credit</span>
                      )}
                    </div>
                    {asset.licenseType && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {asset.licenseType}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAsset(asset)
                          setUsagesList([])
                          setImpactList([])
                        }}
                        style={{
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.75rem',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        Manage
                      </button>
                      {(asset.kind === 'image' || asset.mimeType.startsWith('image/')) && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingAsset({
                              id: asset.id,
                              title: asset.title,
                              altText: asset.altText,
                              caption: asset.caption,
                              mimeType: asset.mimeType,
                              url: `/media/${asset.id}`,
                              siteId,
                            })
                          }
                          style={{
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.75rem',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            border: '1px solid #1d4ed8',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          Edit Image
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAssets.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}
                  >
                    No media assets match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Selected Asset Management Tray */}
          {selectedAsset && (
            <div
              style={{
                marginTop: '1.5rem',
                border: '1px solid #2563eb',
                borderRadius: '8px',
                padding: '1.5rem',
                backgroundColor: '#fff',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <h3 style={{ margin: 0 }}>Managing Asset: {selectedAsset.title}</h3>
                <button
                  type="button"
                  onClick={() => setSelectedAsset(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    color: '#6b7280',
                  }}
                >
                  ✕ Close
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '1.5rem',
                  marginTop: '1rem',
                }}
              >
                {/* Metadata Repair Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const form = new FormData(e.currentTarget)
                    void executeAction('repair-metadata', {
                      mediaId: selectedAsset.id,
                      title: form.get('title'),
                      altText: form.get('altText'),
                      caption: form.get('caption'),
                      creatorCredit: form.get('creatorCredit'),
                      source: form.get('source'),
                      licenseType: form.get('licenseType'),
                    })
                  }}
                >
                  <h4>Metadata & Rights Repair</h4>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <label>
                      Title{' '}
                      <input
                        name="title"
                        defaultValue={selectedAsset.title}
                        required
                        style={{ width: '100%' }}
                      />
                    </label>
                    <label>
                      Alt text{' '}
                      <input
                        name="altText"
                        defaultValue={selectedAsset.altText}
                        style={{ width: '100%' }}
                      />
                    </label>
                    <label>
                      Caption{' '}
                      <textarea
                        name="caption"
                        defaultValue={selectedAsset.caption}
                        style={{ width: '100%', height: '60px' }}
                      />
                    </label>
                    <label>
                      Credit{' '}
                      <input
                        name="creatorCredit"
                        defaultValue={selectedAsset.creatorCredit}
                        style={{ width: '100%' }}
                      />
                    </label>
                    <label>
                      Source{' '}
                      <input
                        name="source"
                        defaultValue={selectedAsset.source}
                        style={{ width: '100%' }}
                      />
                    </label>
                    <label>
                      License
                      <select
                        name="licenseType"
                        defaultValue={selectedAsset.licenseType}
                        style={{ width: '100%' }}
                      >
                        <option value="">Not specified</option>
                        <option value="owned">Owned</option>
                        <option value="licensed">Licensed</option>
                        <option value="creative-commons">Creative Commons</option>
                        <option value="public-domain">Public domain</option>
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={isActionInProgress}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        alignSelf: 'flex-start',
                      }}
                    >
                      Save Metadata
                    </button>
                  </div>
                </form>

                {/* Direct Actions: Variants, Impact Preview, Deletion */}
                <div>
                  <h4>Direct Actions</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {(selectedAsset.kind === 'image' ||
                      selectedAsset.mimeType.startsWith('image/')) && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingAsset({
                            id: selectedAsset.id,
                            title: selectedAsset.title,
                            altText: selectedAsset.altText,
                            caption: selectedAsset.caption,
                            mimeType: selectedAsset.mimeType,
                            url: `/media/${selectedAsset.id}`,
                            siteId,
                          })
                        }
                        disabled={isActionInProgress}
                        style={{
                          padding: '0.4rem 0.8rem',
                          backgroundColor: '#2563eb',
                          color: '#fff',
                          border: '1px solid #1d4ed8',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Edit in Image Editor
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        void executeAction('regenerate-variants', { mediaId: selectedAsset.id })
                      }
                      disabled={isActionInProgress}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Regenerate Variants & Enclosures
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void executeAction('impact-preview', { mediaId: selectedAsset.id }).then(
                          (res) => {
                            const impact = res.impact as
                              | { usages?: Array<Record<string, unknown>> }
                              | undefined
                            setImpactList(impact?.usages || [])
                          },
                        )
                      }}
                      disabled={isActionInProgress}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Preview Replacement / Deletion Impact
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void executeAction('archive-asset', { mediaId: selectedAsset.id })
                      }
                      disabled={isActionInProgress}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#fef3c7',
                        border: '1px solid #f59e0b',
                        color: '#92400e',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Archive Asset (Tombstone)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Attempt deletion of ${selectedAsset.title}? Referenced media is blocked.`,
                          )
                        ) {
                          void executeAction('delete-orphan', { mediaId: selectedAsset.id }).then(
                            () => {
                              setSelectedAsset(null)
                            },
                          )
                        }
                      }}
                      disabled={isActionInProgress}
                      style={{
                        padding: '0.4rem 0.8rem',
                        backgroundColor: '#fee2e2',
                        border: '1px solid #ef4444',
                        color: '#991b1b',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Delete Orphaned Media
                    </button>
                  </div>

                  {/* Impact preview results */}
                  {impactList.length > 0 && (
                    <div
                      style={{
                        marginTop: '1rem',
                        backgroundColor: '#f9fafb',
                        padding: '0.5rem',
                        borderRadius: '4px',
                      }}
                    >
                      <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>
                        Usage Impact ({impactList.length}):
                      </p>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem' }}>
                        {impactList.map((u, i) => (
                          <li key={i}>
                            {String(u.targetType)} {String(u.targetId)} —{' '}
                            {String(u.field || u.slot)} ({String(u.lifecycle)})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Usage list details */}
                  {usagesList.length > 0 && (
                    <div
                      style={{
                        marginTop: '1rem',
                        backgroundColor: '#f9fafb',
                        padding: '0.5rem',
                        borderRadius: '4px',
                      }}
                    >
                      <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>
                        Connected Usages ({usagesList.length}):
                      </p>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem' }}>
                        {usagesList.map((u, i) => (
                          <li key={i}>
                            {String(u.targetType)} #{String(u.targetId)} ({String(u.purpose)}) —{' '}
                            {String(u.lifecycle)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: QUEUE & SESSIONS
      ========================================================================= */}
      {tab === 'queue' && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Upload Sessions */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Active Upload Sessions</h3>
            {data.recentSessions.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0 }}>No upload sessions registered.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Session ID</th>
                    <th style={{ padding: '0.5rem' }}>Filename</th>
                    <th style={{ padding: '0.5rem' }}>Size</th>
                    <th style={{ padding: '0.5rem' }}>Chunks</th>
                    <th style={{ padding: '0.5rem' }}>State</th>
                    <th style={{ padding: '0.5rem' }}>Expires</th>
                    <th style={{ padding: '0.5rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSessions.map((session) => (
                    <tr key={session.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>
                        {session.id.slice(0, 8)}…
                      </td>
                      <td style={{ padding: '0.5rem' }}>{session.filename}</td>
                      <td style={{ padding: '0.5rem' }}>{formatBytes(session.size)}</td>
                      <td style={{ padding: '0.5rem' }}>{session.chunks} staged</td>
                      <td style={{ padding: '0.5rem' }}>
                        <span style={{ textTransform: 'capitalize' }}>{session.state}</span>
                      </td>
                      <td style={{ padding: '0.5rem', color: '#6b7280' }}>{session.expiresAt}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {['uploading', 'finalizing'].includes(session.state) && (
                          <button
                            type="button"
                            onClick={() =>
                              void executeAction('cancel-job', { sessionId: session.id })
                            }
                            disabled={isActionInProgress}
                            style={{
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.75rem',
                              backgroundColor: '#fee2e2',
                              color: '#991b1b',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Media Jobs */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Media Processing Jobs</h3>
            {data.recentJobs.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0 }}>No media jobs logged.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Job ID</th>
                    <th style={{ padding: '0.5rem' }}>Task</th>
                    <th style={{ padding: '0.5rem' }}>Status</th>
                    <th style={{ padding: '0.5rem' }}>Progress</th>
                    <th style={{ padding: '0.5rem' }}>Attempts</th>
                    <th style={{ padding: '0.5rem' }}>Failure Reason</th>
                    <th style={{ padding: '0.5rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentJobs.map((job) => (
                    <tr key={job.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>
                        {job.id.slice(0, 8)}…
                      </td>
                      <td style={{ padding: '0.5rem' }}>{job.task}</td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            backgroundColor:
                              job.status === 'completed'
                                ? '#dcfce7'
                                : job.status === 'failed'
                                  ? '#fee2e2'
                                  : '#fef3c7',
                            color:
                              job.status === 'completed'
                                ? '#166534'
                                : job.status === 'failed'
                                  ? '#991b1b'
                                  : '#92400e',
                          }}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem' }}>{job.progress}%</td>
                      <td style={{ padding: '0.5rem' }}>{job.attempts}</td>
                      <td style={{ padding: '0.5rem', color: '#b91c1c' }}>{job.failure || '—'}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {['failed', 'retrying'].includes(job.status) && (
                          <button
                            type="button"
                            onClick={() => void executeAction('retry-job', { jobId: job.id })}
                            disabled={isActionInProgress}
                            style={{
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.75rem',
                              backgroundColor: '#2563eb',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              marginRight: '0.25rem',
                            }}
                          >
                            Retry
                          </button>
                        )}
                        {['queued', 'running'].includes(job.status) && (
                          <button
                            type="button"
                            onClick={() => void executeAction('cancel-job', { jobId: job.id })}
                            disabled={isActionInProgress}
                            style={{
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.75rem',
                              backgroundColor: '#fee2e2',
                              color: '#991b1b',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: PODCAST CENTER
      ========================================================================= */}
      {tab === 'podcasts' && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Shows Feed Health */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Podcast Deliverability & Feeds</h3>
            {data.podcasts.shows.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0 }}>No podcast shows registered.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Show</th>
                    <th style={{ padding: '0.5rem' }}>Feed URL</th>
                    <th style={{ padding: '0.5rem' }}>Artwork</th>
                    <th style={{ padding: '0.5rem' }}>Episodes</th>
                    <th style={{ padding: '0.5rem' }}>Feed Health</th>
                    <th style={{ padding: '0.5rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.podcasts.shows.map((show) => (
                    <tr key={show.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.5rem' }}>
                        <strong>{show.title}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          Author: {show.author || 'Not set'}
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {show.feedUrl ? (
                          <a
                            href={show.feedUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#2563eb' }}
                          >
                            {show.feedUrl}
                          </a>
                        ) : (
                          <span>Feed path unavailable until the show has a slug.</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {show.artworkAttached ? (
                          <span style={{ color: '#166534' }}>✓ Attached</span>
                        ) : (
                          <span style={{ color: '#b91c1c' }}>✗ Missing</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {show.publishedEpisodeCount} published / {show.episodeCount} total
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: show.feedValid ? '#dcfce7' : '#fee2e2',
                            color: show.feedValid ? '#166534' : '#991b1b',
                          }}
                        >
                          {show.feedValid ? 'Valid RSS 2.0' : show.feedError || 'Feed Error'}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => void executeAction('validate-feed', { slug: show.slug })}
                          disabled={isActionInProgress}
                          style={{
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.75rem',
                            backgroundColor: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          Validate Live Feed
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Episode Readiness Table */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Episode Readiness Checklist</h3>
            {data.podcasts.episodes.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0 }}>No podcast episodes registered.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Episode</th>
                    <th style={{ padding: '0.5rem' }}>Show</th>
                    <th style={{ padding: '0.5rem' }}>Audio & Enclosure</th>
                    <th style={{ padding: '0.5rem' }}>Transcript</th>
                    <th style={{ padding: '0.5rem' }}>Chapters</th>
                    <th style={{ padding: '0.5rem' }}>Status</th>
                    <th style={{ padding: '0.5rem' }}>Feed Ready</th>
                    <th style={{ padding: '0.5rem' }}>Public Links</th>
                  </tr>
                </thead>
                <tbody>
                  {data.podcasts.episodes.map((ep) => (
                    <tr key={ep.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.5rem' }}>
                        <strong>{ep.title}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          S{ep.season || 1} E{ep.episode || 1}
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem' }}>{ep.showTitle}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {ep.audioAttached ? (
                          <div>
                            <span style={{ color: '#166534' }}>✓ Attached</span> (
                            {formatBytes(ep.audioSizeBytes || 0)})
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              Duration: {ep.audioDuration ? `${ep.audioDuration}s` : 'Unknown'}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#b91c1c' }}>✗ No audio</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {ep.transcriptAttached ? (
                          <span style={{ color: '#166534' }}>✓ Attached</span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>None</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {ep.chaptersCount > 0 ? (
                          <span style={{ color: '#166534' }}>✓ {ep.chaptersCount} markers</span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>None</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem', textTransform: 'capitalize' }}>
                        {ep.status}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: ep.isReadyForFeed ? '#dcfce7' : '#fee2e2',
                            color: ep.isReadyForFeed ? '#166534' : '#991b1b',
                          }}
                        >
                          {ep.isReadyForFeed ? 'Ready' : 'Not Ready'}
                        </span>
                        {ep.issues.length > 0 && (
                          <div
                            style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '0.25rem' }}
                          >
                            {ep.issues.join('; ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <a
                          href={ep.playerUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#2563eb' }}
                        >
                          Player
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: VIDEO CENTER
      ========================================================================= */}
      {tab === 'videos' && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Profile Notice */}
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '8px',
              fontSize: '0.9rem',
              color: '#0369a1',
            }}
          >
            <strong>Small-Video Processing Architecture:</strong> Video transcoding uses the local
            FFmpeg/FFprobe recipe (Fast-start MP4, single-rendition HLS, poster, contact sheet) via
            the optional <code>media-heavy</code> worker profile. Standard workers do not consume
            heavy video queues, preventing saturation of normal editorial tasks.
          </div>

          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Native Video Assets</h3>
            {data.videos.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0 }}>No video assets registered.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Video</th>
                    <th style={{ padding: '0.5rem' }}>Processing State</th>
                    <th style={{ padding: '0.5rem' }}>Outputs Readiness</th>
                    <th style={{ padding: '0.5rem' }}>Captions (VTT)</th>
                    <th style={{ padding: '0.5rem' }}>Player Ready</th>
                    <th style={{ padding: '0.5rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.videos.map((video) => (
                    <tr key={video.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.5rem' }}>
                        <strong>{video.title}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {video.width && video.height
                            ? `${video.width}×${video.height}`
                            : 'Dimensions probing'}
                          , {video.durationSeconds || 0}s
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor:
                              video.processingState === 'ready'
                                ? '#dcfce7'
                                : video.processingState === 'failed'
                                  ? '#fee2e2'
                                  : '#fef3c7',
                            color:
                              video.processingState === 'ready'
                                ? '#166534'
                                : video.processingState === 'failed'
                                  ? '#991b1b'
                                  : '#92400e',
                          }}
                        >
                          {video.processingState} ({video.progress}%)
                        </span>
                        {video.failure && (
                          <div
                            style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '0.25rem' }}
                          >
                            {video.failure}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.75rem' }}>
                          <span style={{ color: video.hasFastStartMp4 ? '#166534' : '#9ca3af' }}>
                            MP4
                          </span>
                          <span style={{ color: video.hasHls ? '#166534' : '#9ca3af' }}>HLS</span>
                          <span style={{ color: video.hasPoster ? '#166534' : '#9ca3af' }}>
                            Poster
                          </span>
                          <span style={{ color: video.hasContactSheet ? '#166534' : '#9ca3af' }}>
                            Sheet
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {video.captionsCount > 0 ? (
                          <span style={{ color: '#166534' }}>✓ {video.captionsCount} track(s)</span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>None</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {video.isPlayerReady ? (
                          <span style={{ color: '#166534', fontWeight: 600 }}>✓ Ready</span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>Pending</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            type="button"
                            onClick={() =>
                              void executeAction('regenerate-variants', {
                                mediaId: video.sourceAssetId,
                              })
                            }
                            disabled={isActionInProgress}
                            style={{
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.75rem',
                              backgroundColor: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            Enqueue
                          </button>
                          {['queued', 'probing', 'processing'].includes(video.processingState) && (
                            <button
                              type="button"
                              onClick={() =>
                                void executeAction('cancel-job', { videoAssetId: video.id })
                              }
                              disabled={isActionInProgress}
                              style={{
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.75rem',
                                backgroundColor: '#fee2e2',
                                color: '#991b1b',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          )}
                          <a
                            href={video.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.75rem',
                              color: '#2563eb',
                              textDecoration: 'none',
                            }}
                          >
                            View
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: GOVERNANCE & DUPLICATES
      ========================================================================= */}
      {tab === 'governance' && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Quick Issue Stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
            }}
          >
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
                backgroundColor: '#fff',
              }}
            >
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: data.stats.issueCounts.missingAlt ? '#d97706' : '#166534',
                }}
              >
                {data.stats.issueCounts.missingAlt}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Missing Alt Text</div>
            </div>
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
                backgroundColor: '#fff',
              }}
            >
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: data.stats.issueCounts.missingCredit ? '#d97706' : '#166534',
                }}
              >
                {data.stats.issueCounts.missingCredit}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Missing Creator Credit</div>
            </div>
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
                backgroundColor: '#fff',
              }}
            >
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: data.stats.issueCounts.expiringRights ? '#b91c1c' : '#166534',
                }}
              >
                {data.stats.issueCounts.expiringRights}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Expiring / Expired Rights</div>
            </div>
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
                backgroundColor: '#fff',
              }}
            >
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: data.stats.issueCounts.duplicateChecksum ? '#d97706' : '#166534',
                }}
              >
                {data.stats.issueCounts.duplicateChecksum}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                Duplicate Checksum Candidates
              </div>
            </div>
          </div>

          {/* Content-Addressed Duplicate Clusters */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Content-Addressed Duplicate Clusters</h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>
              SHA-256 deduplication identified {data.stats.issueCounts.duplicateChecksum} duplicate
              clusters across tenant boundaries.
            </p>
          </div>

          {/* Expiring Rights & Governance Alerts */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Expiring Rights & Governance Alerts</h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>
              Audit scan tracking {data.stats.issueCounts.expiringRights} assets with expiring
              rights, licensing windows, or missing attribution.
            </p>
          </div>

          {/* Usage Reconciliation Trigger */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              backgroundColor: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Usage Graph Reconciliation</h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 1rem' }}>
              Scans all Pages, Posts, Shows, Episodes, and Visual Editor layouts to synchronize the
              bidirectional media usage graph. Removes stale rows and creates governance incidents
              for unresolvable references.
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  setIsActionInProgress(true)
                  const res = await fetch('/api/media/governance', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ siteId, action: 'reconcile' }),
                  })
                  const result = await res.json()
                  if (!res.ok) throw new Error(result.error || 'Reconciliation failed.')
                  const rec = result.reconciliation as {
                    created: number
                    updated: number
                    removed: number
                    failures: unknown[]
                  }
                  setMessage(
                    `Reconciliation complete: ${rec.created} created, ${rec.updated} updated, ${rec.removed} removed.`,
                  )
                  await loadData()
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : 'Reconciliation failed.')
                } finally {
                  setIsActionInProgress(false)
                }
              }}
              disabled={isActionInProgress}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Reconcile Usage Graph Now
            </button>
          </div>
        </div>
      )}

      <ImageEditorModal
        asset={editingAsset}
        isOpen={Boolean(editingAsset)}
        onClose={() => setEditingAsset(null)}
        onSaved={() => {
          void loadData()
          setMessage('Image edited and saved successfully.')
        }}
      />
    </div>
  )
}
