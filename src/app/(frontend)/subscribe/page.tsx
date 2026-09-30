'use client'

import { useState } from 'react'

export default function SubscribePage() {
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(form: FormData) {
    setIsSubmitting(true)
    setMessage('')
    try {
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
    } catch {
      setMessage('Failed to submit subscription request. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-20">
      <section className="surface-card p-8 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-stone-950 dark:text-stone-50">
          Subscribe to Newsletter
        </h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Receive thoughtful dispatches, articles, and updates directly in your inbox. No spam,
          ever.
        </p>

        <form action={submit} className="mt-6 grid gap-4">
          <input name="locale" value="en" type="hidden" />
          <input name="source" value="public-subscribe" type="hidden" />
          <input
            name="consentWording"
            value="I consent to receive newsletter updates from this publication."
            type="hidden"
          />

          <label className="grid gap-1">
            <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
              Email Address
            </span>
            <input
              name="email"
              type="email"
              required
              aria-label="Email Address"
              placeholder="you@example.com"
              className="border border-stone-300 dark:border-stone-700 rounded-lg p-3 text-stone-900 dark:text-white bg-transparent focus:outline-none focus:ring-2 focus:ring-red-600"
            />
          </label>

          <label className="flex items-start gap-2 text-xs text-stone-600 dark:text-stone-400 cursor-pointer">
            <input
              type="checkbox"
              required
              defaultChecked
              aria-label="Consent to receive emails"
              className="mt-0.5 rounded border-stone-300 text-red-600 focus:ring-red-600"
            />
            <span>
              I consent to receive newsletter dispatches and updates from this publication.
            </span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold p-3 text-sm hover:opacity-90 transition disabled:opacity-50"
          >
            {isSubmitting ? 'Subscribing...' : 'Subscribe'}
          </button>
        </form>

        {message ? (
          <p
            className={`mt-4 text-sm font-medium ${
              message.includes('Check your inbox') || message.includes('subscribed')
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
            role="status"
          >
            {message}
          </p>
        ) : null}
      </section>
    </main>
  )
}
