'use client'

import { useEffect, useState } from 'react'
import { MediaPicker, type PickableMedia } from '../media/MediaPicker'
import { MediaUploader } from '../media/MediaUploader'
import { MediaGovernancePanel } from './MediaGovernancePanel'

type VariantData = {
  id: string
  recipeKey: string
  label: string
  format: string
  width: number | null
  height: number | null
  sizeBytes: number
  bytesSaved: number
  percentSaved: number
  processingState: string
  errorMessage: string | null
  url: string
}

type VariantsInspection = {
  original: {
    id: string
    title: string
    originalFilename: string | null
    mimeType: string
    sizeBytes: number
    width: number | null
    height: number | null
    aspectRatio: number | null
    dominantColor: string | null
    focalPoint: { x: number; y: number }
    cropSettings: { x: number; y: number; width: number; height: number } | null
    url: string
    canDownload: boolean
  }
  variants: VariantData[]
  summary: {
    totalVariants: number
    readyVariants: number
    totalVariantBytes: number
    totalSavingsBytes: number
    averagePercentSaved: number
  }
}

export function MediaLibraryClient({ siteId }: { siteId: string }) {
  const [selected, setSelected] = useState<PickableMedia>()
  const [refreshKey, setRefreshKey] = useState(0)
  const [message, setMessage] = useState('')
  const [inspection, setInspection] = useState<VariantsInspection | null>(null)
  const [focalPoint, setFocalPoint] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 })
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [replacementImpact, setReplacementImpact] = useState<
    Array<{
      id: string
      targetType: string
      targetId: string
      field: string
      slot: string
      lifecycle: string
    }>
  >([])

  const refresh = () => setRefreshKey((value) => value + 1)

  // Load variant inspection whenever selected media changes
  useEffect(() => {
    if (!selected) return

    let active = true
    fetch(`/api/media/${selected.id}/variants?siteId=${encodeURIComponent(siteId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: VariantsInspection | null) => {
        if (active && data) {
          setInspection(data)
          if (data.original.focalPoint) {
            setFocalPoint(data.original.focalPoint)
          }
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [selected, siteId, refreshKey])

  const update = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    const response = await fetch(`/api/media/${selected.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteId,
        title: form.get('title'),
        altText: form.get('altText'),
        caption: form.get('caption'),
        creatorCredit: form.get('creatorCredit'),
        source: form.get('source'),
        licenseType: form.get('licenseType'),
        licenseUrl: form.get('licenseUrl'),
      }),
    })
    const body = await response.json()
    setMessage(response.ok ? 'Metadata saved.' : body.error || 'Metadata update failed.')
    if (response.ok) {
      setSelected(body.media)
      refresh()
    }
  }

  const remove = async () => {
    if (!selected || !window.confirm(`Delete ${selected.title}? Referenced media is protected.`))
      return
    const response = await fetch(`/api/media/${selected.id}?siteId=${encodeURIComponent(siteId)}`, {
      method: 'DELETE',
    })
    const body = response.status === 204 ? {} : await response.json()
    setMessage(response.ok ? 'Media deleted.' : body.error || 'Deletion failed.')
    if (response.ok) {
      setSelected(undefined)
      setInspection(null)
      refresh()
    }
  }

  const previewReplacement = async () => {
    if (!selected) return
    const response = await fetch(`/api/media/${selected.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId }),
    })
    const body = await response.json()
    if (!response.ok) return setMessage(body.error || 'Replacement preview failed.')
    setReplacementImpact(body.impact.usages)
    setMessage(`${body.impact.affected} usages will be affected by a global replacement.`)
  }

  const replace = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    const response = await fetch(`/api/media/${selected.id}`, { method: 'PUT', body: form })
    const body = await response.json()
    setMessage(
      response.ok
        ? 'Replacement created with immutable audit evidence.'
        : body.error || 'Replacement failed.',
    )
    if (response.ok) {
      setReplacementImpact([])
      refresh()
    }
  }

  const regenerate = async () => {
    if (!selected) return
    setIsRegenerating(true)
    setMessage('Regenerating variants...')
    try {
      const response = await fetch(`/api/media/${selected.id}/variants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          siteId,
          focalPoint,
          force: true,
        }),
      })
      const body = await response.json()
      if (response.ok) {
        setMessage(`Regeneration queued (${body.job?.id || 'worker job'}).`)
        refresh()
      } else {
        setMessage(body.error || 'Regeneration failed.')
      }
    } catch {
      setMessage('Failed to trigger variant regeneration.')
    } finally {
      setIsRegenerating(false)
    }
  }

  const saveFocalPoint = async () => {
    if (!selected) return
    try {
      const response = await fetch(`/api/media/${selected.id}/variants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          siteId,
          focalPoint,
        }),
      })
      if (response.ok) {
        setMessage('Focal point updated.')
        refresh()
      } else {
        const body = await response.json().catch(() => ({}))
        setMessage(body.error || 'Failed to update focal point.')
      }
    } catch {
      setMessage('Failed to update focal point.')
    }
  }

  const handleFocalPointClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(
      0,
      Math.min(1, Number(((event.clientX - rect.left) / rect.width).toFixed(2))),
    )
    const y = Math.max(
      0,
      Math.min(1, Number(((event.clientY - rect.top) / rect.height).toFixed(2))),
    )
    setFocalPoint({ x, y })
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <>
      <MediaUploader
        siteId={siteId}
        onComplete={() => {
          setMessage('Upload complete.')
          refresh()
        }}
      />
      <MediaPicker
        siteId={siteId}
        selectedId={selected?.id}
        refreshKey={refreshKey}
        onSelect={setSelected}
      />
      <MediaGovernancePanel
        key={selected?.id ?? 'governance'}
        siteId={siteId}
        selectedId={selected?.id}
      />
      {selected && (
        <section aria-label="Selected media management">
          <h2>{selected.title}</h2>
          <p>{selected.url}</p>

          {/* Metadata form */}
          <form onSubmit={update}>
            <label>
              Title <input name="title" defaultValue={selected.title} required />
            </label>
            <label>
              Alt text <input name="altText" defaultValue={selected.altText} />
            </label>
            <label>
              Caption <textarea name="caption" defaultValue={selected.caption} />
            </label>
            <label>
              Creator / credit <input name="creatorCredit" />
            </label>
            <label>
              Source <input name="source" />
            </label>
            <details>
              <summary>Rights and governance</summary>
              <label>
                License type{' '}
                <select name="licenseType">
                  <option value="">Not specified</option>
                  <option value="owned">Owned</option>
                  <option value="licensed">Licensed</option>
                  <option value="creative-commons">Creative Commons</option>
                  <option value="public-domain">Public domain</option>
                </select>
              </label>
              <label>
                License URL <input name="licenseUrl" type="url" />
              </label>
            </details>
            <button type="submit">Save metadata</button>
          </form>

          <details style={{ marginTop: '1rem' }}>
            <summary>Replace this asset</summary>
            <p>
              Preview shows every known use before you choose a new asset only, selected rewiring,
              or an explicit global replacement. Cross-site targets and loops are refused.
            </p>
            <button type="button" onClick={previewReplacement}>
              Preview impact
            </button>
            {replacementImpact.length > 0 && (
              <ul aria-label="Replacement impact">
                {replacementImpact.map((usage) => (
                  <li key={usage.id}>
                    {usage.targetType} {usage.targetId} — {usage.field || usage.slot} (
                    {usage.lifecycle})
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={replace}>
              <input type="hidden" name="siteId" value={siteId} />
              <label>
                Replacement file <input name="file" type="file" required />
              </label>
              <label>
                Replacement name{' '}
                <input name="title" required defaultValue={`${selected.title} replacement`} />
              </label>
              <label>
                Replacement alt <input name="altText" defaultValue={selected.altText} />
              </label>
              <label>
                Choice{' '}
                <select name="mode">
                  <option value="new-asset">New asset only</option>
                  <option value="selected-usages">Selected usages</option>
                  <option value="all-usages">All usages</option>
                </select>
              </label>
              <label>
                Selected usage IDs (comma separated) <input name="usageIds" />
              </label>
              <label>
                Reason <input name="reason" />
              </label>
              <button type="submit">Create replacement</button>
            </form>
          </details>

          {/* MED-03: Variant Inspection and Controls */}
          {inspection && (
            <div
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                border: '1px solid #ccc',
                borderRadius: '8px',
              }}
            >
              <h3 style={{ marginTop: 0 }}>Generated Variants & Optimization</h3>

              <div
                style={{
                  display: 'flex',
                  gap: '1.5rem',
                  flexWrap: 'wrap',
                  marginBottom: '1rem',
                }}
              >
                {/* Visual focal point picker */}
                <div>
                  <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                    Focal Point & Crop Preview
                  </p>
                  <div
                    aria-label="Focal point preview"
                    onClick={handleFocalPointClick}
                    style={{
                      position: 'relative',
                      width: '240px',
                      height: '160px',
                      backgroundColor: '#1a1a1a',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      cursor: 'crosshair',
                      border: '1px solid #555',
                    }}
                    title="Click to place focal point"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={inspection.original.url}
                      alt={selected.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: 0.85,
                      }}
                    />
                    {/* Target crosshair pin */}
                    <div
                      style={{
                        position: 'absolute',
                        left: `${focalPoint.x * 100}%`,
                        top: `${focalPoint.y * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        border: '2px solid #ffffff',
                        backgroundColor: '#ff3366',
                        boxShadow: '0 0 4px rgba(0,0,0,0.8)',
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                    Focal point: X: {focalPoint.x}, Y: {focalPoint.y}
                  </p>
                  <button
                    type="button"
                    onClick={saveFocalPoint}
                    style={{
                      marginTop: '0.25rem',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    Save Focal Point
                  </button>
                </div>

                {/* Original metadata & savings summary */}
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                    Original Specifications
                  </p>
                  <ul style={{ fontSize: '0.9rem', listStyle: 'none', padding: 0, margin: 0 }}>
                    <li>
                      <strong>Dimensions:</strong> {inspection.original.width || '—'} ×{' '}
                      {inspection.original.height || '—'} px
                    </li>
                    <li>
                      <strong>Size:</strong> {formatBytes(inspection.original.sizeBytes)}
                    </li>
                    <li>
                      <strong>Format:</strong> {inspection.original.mimeType}
                    </li>
                    {inspection.original.dominantColor && (
                      <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>Dominant Color:</strong>
                        <span
                          style={{
                            display: 'inline-block',
                            width: '14px',
                            height: '14px',
                            borderRadius: '3px',
                            backgroundColor: inspection.original.dominantColor,
                            border: '1px solid #777',
                          }}
                        />
                        {inspection.original.dominantColor}
                      </li>
                    )}
                  </ul>

                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.5rem',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                    }}
                  >
                    <strong>File Savings:</strong>{' '}
                    {inspection.summary.totalSavingsBytes > 0
                      ? `Saved ${inspection.summary.averagePercentSaved}% (${formatBytes(inspection.summary.totalSavingsBytes)} reduction)`
                      : 'Variants processing'}
                  </div>

                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={regenerate}
                      disabled={isRegenerating}
                      style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
                    >
                      {isRegenerating ? 'Regenerating...' : 'Regenerate Variants'}
                    </button>
                    {inspection.original.canDownload && (
                      <a
                        href={`${inspection.original.url}?download=true`}
                        download
                        style={{
                          display: 'inline-block',
                          padding: '0.4rem 0.8rem',
                          backgroundColor: '#e0e0e0',
                          color: '#222',
                          textDecoration: 'none',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                        }}
                      >
                        Download original
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Variants table */}
              <p style={{ fontWeight: 600, margin: '0.5rem 0 0.25rem 0' }}>Approved Variants</p>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.85rem',
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid #ccc' }}>
                    <th style={{ padding: '0.4rem' }}>Variant</th>
                    <th style={{ padding: '0.4rem' }}>Format</th>
                    <th style={{ padding: '0.4rem' }}>Dimensions</th>
                    <th style={{ padding: '0.4rem' }}>Size</th>
                    <th style={{ padding: '0.4rem' }}>Savings</th>
                    <th style={{ padding: '0.4rem' }}>Status</th>
                    <th style={{ padding: '0.4rem' }}>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {inspection.variants.map((variant) => (
                    <tr key={variant.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '0.4rem' }}>
                        {variant.label} ({variant.format.toUpperCase()})
                      </td>
                      <td style={{ padding: '0.4rem', textTransform: 'uppercase' }}>
                        {variant.format}
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        {variant.width && variant.height
                          ? `${variant.width} × ${variant.height}`
                          : '—'}
                      </td>
                      <td style={{ padding: '0.4rem' }}>{formatBytes(variant.sizeBytes)}</td>
                      <td style={{ padding: '0.4rem', color: '#16a34a' }}>
                        {variant.percentSaved > 0 ? `-${variant.percentSaved}%` : '—'}
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.4rem',
                            borderRadius: '3px',
                            fontSize: '0.75rem',
                            backgroundColor:
                              variant.processingState === 'ready'
                                ? '#dcfce7'
                                : variant.processingState === 'failed'
                                  ? '#fee2e2'
                                  : '#fef3c7',
                            color:
                              variant.processingState === 'ready'
                                ? '#166534'
                                : variant.processingState === 'failed'
                                  ? '#991b1b'
                                  : '#92400e',
                          }}
                        >
                          {variant.processingState}
                        </span>
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <a href={variant.url} target="_blank" rel="noopener noreferrer">
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                  {inspection.variants.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '0.5rem', color: '#777' }}>
                        No variants generated yet. Click &quot;Regenerate variants&quot; to process.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <button type="button" onClick={remove}>
              Delete orphaned media
            </button>
          </div>
        </section>
      )}
      {message && <p role="status">{message}</p>}
    </>
  )
}
