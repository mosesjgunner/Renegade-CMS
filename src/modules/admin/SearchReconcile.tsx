'use client'
import { useEffect, useState } from 'react'
export default function SearchReconcile() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  return (
    <div>
      <button
        disabled={busy || !ready}
        onClick={async () => {
          setBusy(true)
          try {
            const response = await fetch('/api/admin/indexing/search/reconcile', { method: 'POST' })
            const data = await response.json()
            setMessage(
              response.ok
                ? `Search rebuilt: ${data.result.processed} records processed.`
                : data.error || 'Rebuild failed.',
            )
          } catch {
            setMessage('Search rebuild unavailable. Retry when the connection is restored.')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Rebuilding search?' : 'Reconcile search projection'}
      </button>
      <p role="status">{message}</p>
    </div>
  )
}
