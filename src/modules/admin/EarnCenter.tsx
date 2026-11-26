'use client'

import { useCallback, useEffect, useState } from 'react'

type StatementBucket = {
  currency: string
  grossCapturedMinor?: string
  netBeforeUnknownFeesMinor?: string
  netIsComplete?: boolean
  unknownFeeCount?: number
  estimatedMinor?: string
  payoutConfirmedMinor?: string
  providerId?: string
}
type EarnData = {
  profile: { status?: string; sellerOfRecordMode?: string } | null
  connections: Array<{
    id: string
    providerId: string
    status: string
    accountRef?: string | null
    lastError?: string | null
  }>
  statement: {
    native: StatementBucket[]
    affiliate: Array<{ currency: string; settledAmountMinor: string; eligibleAmountMinor: string }>
    external: StatementBucket[]
    notes: string[]
  }
}

const RAILS: Array<{ id: string; label: string; note: string }> = [
  {
    id: 'memberships',
    label: 'Memberships & subscriptions',
    note: 'Runs on the canonical subscription engine.',
  },
  {
    id: 'digital',
    label: 'Digital products',
    note: 'Private-asset delivery through canonical checkout.',
  },
  {
    id: 'tips',
    label: 'Tips & support',
    note: 'The donations engine, with fail-closed tax wording.',
  },
  {
    id: 'services',
    label: 'Services & events',
    note: 'Slots with real capacity, booked through checkout.',
  },
  {
    id: 'shop',
    label: 'Shop & print-on-demand',
    note: 'The commerce engine owns orders and fulfillment.',
  },
  {
    id: 'affiliate',
    label: 'Affiliate & referrals',
    note: 'Your own network accounts only — never a shared master account.',
  },
  {
    id: 'sponsorships',
    label: 'Sponsorships',
    note: 'Direct deals by default; marketplaces stay external until you connect one.',
  },
  {
    id: 'advertising',
    label: 'Advertising',
    note: 'First-party placements render only where your site puts them. Nothing is auto-inserted.',
  },
  {
    id: 'licensing',
    label: 'Licensing & rights',
    note: 'Rights must validate before an offer can sell. AI/TDM is opt-in, off by default.',
  },
]

/**
 * Earn Center (CE-02). One honest view of creator earnings: native
 * collected money, affiliate liability and external reported revenue
 * stay in separate sections because they are different kinds of
 * truth. Blocked providers show their gate instead of a fake
 * "connect" success.
 */
export function EarnCenter() {
  const [siteId, setSiteId] = useState('')
  const [data, setData] = useState<EarnData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (id: string) => {
    if (!id) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/earn?siteId=${encodeURIComponent(id)}`)
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Failed to load Earn Center.')
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Earn Center.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('siteId')
    if (fromUrl) {
      setSiteId(fromUrl)
      void load(fromUrl)
    }
  }, [load])

  const saveProfileStatus = async (status: string) => {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/earn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'upsert-profile', siteId, status }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Save failed.')
      await load(siteId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1>Earn Center</h1>
      <p>
        Every way this site earns, in one place. Money is shown as it actually is: collected through
        your own checkout, owed through affiliate ledgers, or merely reported by an outside
        provider. Those are never added together.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void load(siteId)
        }}
      >
        <label>
          Site ID <input value={siteId} onChange={(e) => setSiteId(e.target.value)} size={40} />
        </label>{' '}
        <button type="submit" disabled={busy || !siteId}>
          Load
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <>
          <section>
            <h2>Profile</h2>
            <p>
              Status: {data.profile?.status ?? 'not-started'} · Seller of record:{' '}
              {data.profile?.sellerOfRecordMode ?? 'self-hosted-direct'} (no platform cut is taken
              from self-hosted sales; representation fees exist only under an agreement you sign.)
            </p>
            <button disabled={busy} onClick={() => void saveProfileStatus('active')}>
              Mark profile active
            </button>{' '}
            <button disabled={busy} onClick={() => void saveProfileStatus('paused')}>
              Pause
            </button>
          </section>
          <section>
            <h2>Earnings rails</h2>
            <ul>
              {RAILS.map((rail) => (
                <li key={rail.id}>
                  <strong>{rail.label}</strong> — {rail.note}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Collected through this site</h2>
            {data.statement.native.length === 0 ? <p>No payments yet.</p> : null}
            {data.statement.native.map((bucket) => (
              <p key={bucket.currency}>
                {bucket.currency}: gross captured {bucket.grossCapturedMinor} minor units;{' '}
                {bucket.netIsComplete
                  ? `net ${bucket.netBeforeUnknownFeesMinor}`
                  : `net before unknown fees ${bucket.netBeforeUnknownFeesMinor} (${bucket.unknownFeeCount} payment(s) have no provider-reported fee)`}
              </p>
            ))}
          </section>
          <section>
            <h2>Affiliate commissions owed</h2>
            {data.statement.affiliate.length === 0 ? <p>No commission liability.</p> : null}
            {data.statement.affiliate.map((row) => (
              <p key={row.currency}>
                {row.currency}: eligible {row.eligibleAmountMinor}, settled {row.settledAmountMinor}{' '}
                minor units.
              </p>
            ))}
          </section>
          <section>
            <h2>Reported by outside providers (not collected here)</h2>
            {data.statement.external.length === 0 ? (
              <p>No external revenue evidence imported yet.</p>
            ) : null}
            {data.statement.external.map((bucket) => (
              <p key={`${bucket.providerId}-${bucket.currency}`}>
                {bucket.providerId} · {bucket.currency}: estimated {bucket.estimatedMinor}, payout
                confirmed {bucket.payoutConfirmedMinor} minor units.
              </p>
            ))}
            {data.statement.notes.map((note) => (
              <p key={note}>
                <em>{note}</em>
              </p>
            ))}
          </section>
          <section>
            <h2>Provider connections</h2>
            {data.connections.length === 0 ? (
              <p>
                No providers connected. Manual links, CSV import and direct deals all work without
                any connection.
              </p>
            ) : null}
            <ul>
              {data.connections.map((connection) => (
                <li key={connection.id}>
                  {connection.providerId}: <strong>{connection.status}</strong>
                  {connection.lastError ? ` — ${connection.lastError}` : ''}
                </li>
              ))}
            </ul>
            <p>
              <a href={`/api/admin/earn/statement?siteId=${encodeURIComponent(siteId)}&format=csv`}>
                Download statement (CSV)
              </a>{' '}
              ·{' '}
              <a href={`/api/admin/earn/ads?siteId=${encodeURIComponent(siteId)}&view=ads-txt`}>
                View ads.txt
              </a>
            </p>
          </section>
        </>
      ) : null}
    </main>
  )
}
