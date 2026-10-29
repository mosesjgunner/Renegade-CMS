'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export function ReferralConsent({ code }: { code: string }) {
  const [details, setDetails] = useState<{
    disclosure?: string
    windowDays?: number
    error?: string
  }>()
  const [message, setMessage] = useState('')
  const [consented, setConsented] = useState(false)
  useEffect(() => {
    fetch(`/api/commerce/referrals/claim?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then(setDetails)
      .catch(() => setDetails({ error: 'Referral unavailable.' }))
  }, [code])
  if (!details) return <p>Loading disclosure…</p>
  if (details.error) return <p role="alert">{details.error}</p>
  return (
    <section>
      <p>{details.disclosure}</p>
      <p>
        If you agree, this site stores a referral cookie for up to {details.windowDays} days. Your
        purchase may earn the referrer a commission. Payment and refunds determine the commission;
        no payout is promised.
      </p>
      <label>
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
        />
        I consent to referral attribution
      </label>
      <button
        disabled={!consented}
        onClick={async () => {
          const response = await fetch('/api/commerce/referrals/claim', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code, consented }),
          })
          const result = await response.json()
          setMessage(
            response.ok
              ? 'Referral saved. Commission remains pending until a qualifying payment.'
              : result.error,
          )
        }}
      >
        Save referral
      </button>
      <button
        onClick={async () => {
          await fetch('/api/commerce/referrals/claim', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code, consented: false }),
          })
          setConsented(false)
          setMessage(
            'Referral cookie cleared. No new referral attribution will be captured. Existing transaction records remain for financial reconciliation.',
          )
        }}
      >
        Decline referral tracking
      </button>
      <p role="status">{message}</p>
      <Link href="/store">Continue to store</Link> · <Link href="/donate">Make a donation</Link> ·{' '}
      <Link href="/members/settings?tab=billing">Membership plans</Link>
    </section>
  )
}
