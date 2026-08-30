'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function UnsubscribeContent() {
  const query = useSearchParams()
  const [message, setMessage] = useState('')

  async function unsubscribe() {
    const response = await fetch('/api/subscribers/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: query.get('token') }),
    })
    const body = await response.json()
    setMessage(body.error ?? 'You have been unsubscribed.')
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-20">
      <section className="surface-card p-8">
        <h1 className="text-3xl font-bold">Unsubscribe</h1>
        <p className="mt-2 text-stone-600">
          This stops marketing and newsletter messages for this address.
        </p>
        <button onClick={unsubscribe} className="btn btn-primary mt-6 p-3">
          Unsubscribe
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

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeContent />
    </Suspense>
  )
}
