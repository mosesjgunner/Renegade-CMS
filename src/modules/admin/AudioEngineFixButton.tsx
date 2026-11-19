'use client'

import { useState } from 'react'

export default function AudioEngineFixButton() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setMessage('')
          try {
            const response = await fetch('/api/admin/audio-engine', { method: 'POST' })
            const data = await response.json().catch(() => null)
            if (response.ok && data?.audioEngine?.status === 'ready') {
              setMessage('Audio engine installed. Reloading…')
              window.location.reload()
              return
            }
            setMessage(
              data?.error ||
                'The audio engine could not be installed. Check the server logs and try again.',
            )
          } catch {
            setMessage(
              'The audio engine could not be installed. Check your connection and try again.',
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Installing audio engine…' : 'Fix it — install the audio engine'}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  )
}
