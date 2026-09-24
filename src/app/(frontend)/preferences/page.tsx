'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function PreferenceCenter() {
  const query = useSearchParams()
  const [marketing, setMarketing] = useState(true)
  const [message, setMessage] = useState('')
  async function save() {
    const response = await fetch('/api/subscribers/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: query.get('token'),
        choices: [{ channel: 'email', purpose: 'marketing', granted: marketing }],
      }),
    })
    const body = await response.json()
    setMessage(body.error ?? 'Your preferences have been saved.')
  }
  return (
    <main className="max-w-xl mx-auto px-6 py-20">
      <section className="surface-card p-8">
        <h1 className="text-3xl font-bold">Email preferences</h1>
        <p className="mt-2 text-stone-600">
          Choose the messages you want. You can withdraw marketing permission at any time.
        </p>
        <label className="mt-6 flex gap-3">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(event) => setMarketing(event.target.checked)}
          />{' '}
          Receive marketing and newsletter email
        </label>
        <button onClick={save} className="btn btn-primary mt-6 p-3">
          Save preferences
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
export default function PreferencesPage() {
  return (
    <Suspense fallback={null}>
      <PreferenceCenter />
    </Suspense>
  )
}
