'use client'

import React, { useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'
import { ImageEditorModal, type ImageEditorAsset } from '../media/image-editor'

export function MediaEditActionField() {
  const { id } = useDocumentInfo()
  const [asset, setAsset] = useState<ImageEditorAsset | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true

    void fetch(`/api/media-assets/${id}?depth=0`)
      .then(async (res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((doc) => {
        if (!active || !doc) return
        const mimeType = String(doc.mimeType || '')
        const kind = String(doc.kind || '')
        if (kind === 'image' || mimeType.startsWith('image/')) {
          setAsset({
            id: String(doc.id),
            title: String(doc.title || 'Untitled Image'),
            altText: typeof doc.altText === 'string' ? doc.altText : '',
            caption: typeof doc.caption === 'string' ? doc.caption : '',
            mimeType,
            url: `/media/${doc.id}`,
            siteId:
              typeof doc.site === 'object' && doc.site !== null
                ? String(doc.site.id)
                : String(doc.site || ''),
            width: typeof doc.width === 'number' ? doc.width : null,
            height: typeof doc.height === 'number' ? doc.height : null,
          })
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id])

  if (!asset) return null

  return (
    <div
      style={{
        padding: '1rem',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        backgroundColor: '#f9fafb',
        margin: '1rem 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Image Editor</h4>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
            Launch miniPaint to adjust, filter, crop, or layer this image with native versioning.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsEditorOpen(true)}
          disabled={loading}
          style={{
            padding: '0.4rem 0.9rem',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Edit in miniPaint
        </button>
      </div>

      <ImageEditorModal
        asset={asset}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSaved={() => {
          window.location.reload()
        }}
      />
    </div>
  )
}
