'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function ConfirmSubscriptionContent() {
  const query = useSearchParams()
  const [message, setMessage] = useState('')

  async function confirm() {
    const response = await fetch('/api/subscribers/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: query.get('token') }),
    })
    const body = await response.json()
    setMessage(body.error ?? 'Your subscription is confirmed.')
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-20">
      <section className="surface-card p-8">
        <h1 className="text-3xl font-bold">Confirm subscription</h1>
        <button onClick={confirm} className="btn btn-primary mt-6 p-3">
          Confirm
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
    <Suspense fallback={null}>
      <ConfirmSubscriptionContent />
    </Suspense>
  )
}
