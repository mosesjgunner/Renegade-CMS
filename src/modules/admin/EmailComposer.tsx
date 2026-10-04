'use client'
import Link from 'next/link'
import { useState } from 'react'
export default function EmailComposer() {
  const [status, setStatus] = useState('')
  async function retry(form: FormData) {
    const response = await fetch('/api/admin/audience/retry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deliveryId: form.get('deliveryId') }),
    })
    const body = await response.json()
    setStatus(
      response.ok
        ? 'Retry queued. Inspect the delivery for the resulting provider outcome.'
        : body.error,
    )
  }
  return (
    <main style={{ maxWidth: 900, padding: 24 }}>
      <h1>Email composer</h1>
      <p>
        Author a versioned email design using governed media and pinned content projections. Website
        themes, arbitrary HTML, JavaScript, and CSS are not available here.
      </p>
      <p>
        Create templates and messages in the Audience collections, then use the renderer snapshot
        before requesting review.
      </p>
      <ul>
        <li>Personalization uses a typed allowlist and preview fallbacks.</li>
        <li>
          Recipient and mailbox views are labeled approximations; authorized test sends use the real
          provider boundary.
        </li>
        <li>Any design, template, or source-rebase edit requires review again.</li>
      </ul>
      <Link href="/admin/collections/email-messages">Open messages</Link>
      <p>
        Save a draft, change its status to review, then schedule it with a valid time. Scheduling
        validates the saved design; later design edits require review again.
      </p>
      <p>
        <Link href="/admin/collections/email-deliveries">
          Inspect queue, failures and provider outcomes
        </Link>{' '}
        · <Link href="/admin/collections/suppressions">Inspect suppressed recipients</Link>
      </p>
      <p>
        Accepted means transport acceptance. It does not prove arrival in an inbox. External email
        and SMS community notifications are deferred.
      </p>
      <form action={retry}>
        <label>
          Delivery ID <input name="deliveryId" required />
        </label>
        <button type="submit">Retry delivery</button>
      </form>
      <p role="status">{status}</p>
    </main>
  )
}
