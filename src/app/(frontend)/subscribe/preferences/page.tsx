'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function Preferences() {
  const query = useSearchParams()
  const [status, setStatus] = useState('')
  async function save(form: FormData) {
    const response = await fetch('/api/subscribers/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: query?.get('token'),
        choices: [
          { channel: 'email', purpose: 'marketing', granted: form.get('marketing') === 'on' },
        ],
      }),
    })
    setStatus(response.ok ? 'Preferences saved.' : 'This preference link is unavailable.')
  }
  return (
    <main className="max-w-xl mx-auto px-6 py-20">
      <h1>Newsletter preferences</h1>
      <form action={save}>
        <label>
          <input type="checkbox" name="marketing" /> Receive newsletter email
        </label>
        <p>
          Clearing this choice stops newsletter email. A new confirmed subscription is required to
          subscribe again.
        </p>
        <button type="submit">Save preferences</button>
      </form>
      <p role="status">{status}</p>
    </main>
  )
}
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Preferences />
    </Suspense>
  )
}
