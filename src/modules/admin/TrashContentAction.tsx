'use client'

import { useState } from 'react'

/** Trash retains immutable revision history while removing all public access. */
export default function TrashContentAction({ contentId }: { contentId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const trash = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/content/${encodeURIComponent(contentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'archived',
          retentionMode: 'tombstone',
          removeFromDiscovery: true,
        }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.errors?.[0]?.message || 'Could not move content to trash.')
      window.location.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move content to trash.')
      setBusy(false)
    }
  }
  return (
    <details>
      <summary>Move to trash</summary>
      <p>Remove this content from the site and keep its revision history.</p>
      <button type="button" disabled={busy} onClick={() => void trash()}>
        {busy ? 'Removing…' : 'Confirm move to trash'}
      </button>
      {error && <p role="alert">{error}</p>}
    </details>
  )
}
