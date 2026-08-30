'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

function PreferencesContent() {
  const query = useSearchParams()
  const [message, setMessage] = useState('')

  async function save(form: FormData) {
    const response = await fetch('/api/subscribers/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: query.get('token'),
        audienceList: form.get('audienceList') || undefined,
        preferences: { digest: form.get('digest') === 'on' },
      }),
    })
    const body = await response.json()
    setMessage(body.error ?? 'Preferences saved.')
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-20">
      <section className="surface-card p-8">
        <h1 className="text-3xl font-bold">Email preferences</h1>
        <form action={save} className="mt-6 grid gap-4">
          <input
            name="audienceList"
            placeholder="Optional list ID"
            className="border rounded p-3"
          />
          <label>
            <input name="digest" type="checkbox" /> Receive digest emails
          </label>
          <button className="btn btn-primary p-3">Save preferences</button>
        </form>
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
      <PreferencesContent />
    </Suspense>
  )
}
