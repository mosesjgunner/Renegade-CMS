'use client'

import { useEffect, useState } from 'react'

export type PickableMedia = {
  id: string
  title: string
  altText: string
  caption: string
  mimeType: string
  sizeBytes: number
  processingState: string
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
  useEffect(() => {
    let active = true
    void fetch(`/api/media?siteId=${encodeURIComponent(siteId)}`)
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
  }, [siteId, refreshKey])
  if (error) return <p role="alert">{error}</p>
  return (
    <ul aria-label="Media library assets">
      {media.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-pressed={selectedId === item.id}
            onClick={() => onSelect(item)}
          >
            {item.title} ({item.mimeType || 'unknown type'})
          </button>
        </li>
      ))}
    </ul>
  )
}
