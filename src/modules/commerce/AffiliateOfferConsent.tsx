'use client'
import { useEffect, useState } from 'react'
export function AffiliateOfferConsent({ offerId }: { offerId: string }) {
  const [offer, setOffer] = useState<{
    name?: string
    disclosure?: string
    destination?: string
    error?: string
  }>()
  const [consented, setConsented] = useState(false)
  const [error, setError] = useState('')
  const route = `/api/commerce/affiliate/redirect?offerId=${encodeURIComponent(offerId)}`
  useEffect(() => {
    fetch(`${route}&details=1`)
      .then((r) => r.json())
      .then(setOffer)
      .catch(() => setError('Offer unavailable.'))
  }, [route])
  if (!offer) return <p>{error || 'Loading disclosure…'}</p>
  if (offer.error) return <p role="alert">{offer.error}</p>
  return (
    <section>
      <h2>{offer.name}</h2>
      <p>{offer.disclosure}</p>
      <p>
        Destination: {offer.destination}. External network results remain unknown until verified
        evidence is received. No payout is promised.
      </p>
      <p>
        <a href={route} rel="sponsored nofollow noopener">
          Continue without referral tracking
        </a>
      </p>
      <label>
        <input
          type="checkbox"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
        />
        I consent to recording this affiliate interaction
      </label>
      <button
        disabled={!consented}
        onClick={async () => {
          const response = await fetch('/api/commerce/affiliate/redirect', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ offerId, consented }),
          })
          const result = await response.json()
          if (response.ok) window.location.assign(result.destinationUrl)
          else setError(result.error)
        }}
      >
        Continue with referral tracking
      </button>
      <p role="alert">{error}</p>
    </section>
  )
}
