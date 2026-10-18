'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function ConfirmSubscriptionContent() {
  const query = useSearchParams()
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [message, setMessage] = useState('')

  const [busy, setBusy] = useState(false)
  async function confirm() {
    setBusy(true)
    try {
      const response = await fetch('/api/subscribers/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: query?.get('token') }),
      })
      const body = await response.json()
      setMessage(
        body.error ??
          (response.ok
            ? 'Your subscription is confirmed.'
            : 'Confirmation unavailable. Please retry.'),
      )
    } catch {
      setMessage('Confirmation unavailable. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-20">
      <section className="surface-card p-8">
        <h1 className="text-3xl font-bold">Confirm subscription</h1>
        <button disabled={!ready || busy} onClick={confirm} className="btn btn-primary mt-6 p-3">
          {!ready ? 'Loading confirmation...' : busy ? 'Confirming...' : 'Confirm'}
        </button>
        {message ? (
          <p className="mt-4" role="status">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  )
}

export default function ConfirmSubscriptionPage() {
  return (
    <Suspense fallback={<p role="status">Loading confirmation?</p>}>
      <ConfirmSubscriptionContent />
    </Suspense>
  )
}
