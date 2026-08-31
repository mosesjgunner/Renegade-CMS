'use client'

import { useEffect } from 'react'

export default function PublicError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {}, [])
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold">We could not load this page.</h1>
      <p className="mt-4 text-stone-600 dark:text-stone-300">
        No unpublished content has been shown. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded bg-red-700 px-4 py-2 font-semibold text-white"
      >
        Try again
      </button>
    </main>
  )
}
