'use client'

import { useEffect, useState } from 'react'

export type PickableMedia = {
  id: string
  title: string
  originalFilename?: string
  kind?: string
  altText: string
  caption: string
  mimeType: string
  sizeBytes: number
  processingState: string
  retentionMode?: string
  tombstoneLabel?: string | null
  replaceGloballyWith?: string | null
  usageCount?: number
  referenced?: boolean
  usages?: Array<{
    id: string
    targetType: string
    targetId: string
    field: string
    purpose: string
    lifecycle: string
  }>
  versionCount?: number
  versions?: Array<{
    id: string
    assetId: string
    replacesAssetId: string
    versionLabel: string
    mode: string
    reason: string | null
    impactCount: number
    createdAt: string | null
  }>
  url: string
}

type Props = {
  siteId: string
  onSelect: (media: PickableMedia) => void
  selectedId?: string
  refreshKey?: number
}

/** Reusable canonical-media picker for hero, inline, logo, and social fields. */
export function MediaPicker({ siteId, onSelect, selectedId, refreshKey = 0 }: Props) {
  const [media, setMedia] = useState<PickableMedia[]>([])
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [usageFilter, setUsageFilter] = useState('all')
  const [retentionFilter, setRetentionFilter] = useState('active')
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ siteId })
    if (query.trim()) params.set('q', query.trim())
    if (kind !== 'all') params.set('kind', kind)
    if (usageFilter !== 'all') params.set('usage', usageFilter)
    if (retentionFilter) params.set('retentionMode', retentionFilter)
    void fetch(`/api/media?${params.toString()}`)
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Could not load media.')
        if (active) setMedia(body.media)
      })
      .catch(
        (reason: unknown) =>
          active && setError(reason instanceof Error ? reason.message : 'Could not load media.'),
      )
    return () => {
      active = false
    }
  }, [siteId, refreshKey, query, kind, usageFilter, retentionFilter])
  if (error) return <p role="alert">{error}</p>
  return (
    <div data-testid="media-picker">
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <input
          type="search"
          data-testid="media-search-input"
          aria-label="Search media picker"
          placeholder="Search title, filename, caption..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          data-testid="media-filter-kind"
          aria-label="Filter media picker by kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="all">All types</option>
          <option value="image">Image</option>
          <option value="document">Document</option>
          <option value="audio">Audio</option>
          <option value="video">Video</option>
        </select>
        <select
          data-testid="media-filter-usage"
          aria-label="Filter media picker by reference state"
          value={usageFilter}
          onChange={(event) => setUsageFilter(event.target.value)}
        >
          <option value="all">All reference states</option>
          <option value="referenced">Referenced only</option>
          <option value="orphan">Unreferenced (orphan)</option>
        </select>
        <select
          data-testid="media-filter-retention"
          aria-label="Filter media picker by retention"
          value={retentionFilter}
          onChange={(event) => setRetentionFilter(event.target.value)}
        >
          <option value="active">Active assets</option>
          <option value="tombstone">Tombstoned assets</option>
          <option value="all">All retention states</option>
        </select>
      </div>
      <ul aria-label="Media library assets">
        {media.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              data-testid={`media-card-${item.id}`}
              aria-pressed={selectedId === item.id}
              onClick={() => onSelect(item)}
            >
              {item.title} ({item.mimeType || 'unknown type'})
              {item.originalFilename ? ` — ${item.originalFilename}` : ''}
              {typeof item.usageCount === 'number' ? ` · ${item.usageCount} use(s)` : ''}
              {typeof item.versionCount === 'number' && item.versionCount > 0
                ? ` · ${item.versionCount} ver`
                : ''}
              {item.retentionMode === 'tombstone' ? ' [TOMBSTONE]' : ''}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
