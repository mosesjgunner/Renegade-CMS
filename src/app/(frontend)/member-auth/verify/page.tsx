'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function VerifyMemberLink() {
  const token = useSearchParams().get('token')
  const [message, setMessage] = useState('Signing you in…')
  useEffect(() => {
    void fetch('/api/member-auth/magic-link/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(async (response) =>
      setMessage(
        response.ok
          ? 'Signed in.'
          : ((await response.json()).error ?? 'This sign-in link is invalid or expired.'),
      ),
    )
  }, [token])
  return (
    <main className="max-w-xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold">Member sign-in</h1>
      <p role="status" className="mt-4">
        {message}
      </p>
      <Link className="btn btn-primary mt-6 inline-block" href="/members/settings">
        Member settings
      </Link>
    </main>
  )
}
