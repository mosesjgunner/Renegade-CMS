'use client'

import { useState } from 'react'

export default function SubscribePage() {
  const [message, setMessage] = useState('')
  async function submit(form: FormData) {
    const response = await fetch('/api/subscribers/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form)),
    })
    const body = await response.json()
    setMessage(
      body.error ??
        (body.status === 'pending'
          ? 'Check your inbox to confirm your subscription.'
          : 'You are subscribed.'),
    )
  }
  return (
    <main className="max-w-xl mx-auto px-6 py-20">
      <section className="surface-card p-8">
        <h1 className="text-3xl font-bold">Subscribe</h1>
        <p className="mt-2 text-stone-600">
          Choose to receive this publication’s newsletter. Your email is used only for the lists you
          join.
        </p>
        <form action={submit} className="mt-6 grid gap-4">
          <input name="siteId" required placeholder="Site ID" className="border rounded p-3" />
          <input
            name="listId"
            required
            placeholder="Newsletter list ID"
            className="border rounded p-3"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="border rounded p-3"
          />
          <input name="locale" value="en" type="hidden" />
          <input name="source" value="public" type="hidden" />
          <textarea
            name="consentWording"
            required
            placeholder="Consent wording shown for this subscription"
            className="border rounded p-3"
          />
          <button className="btn btn-primary p-3">Subscribe</button>
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
