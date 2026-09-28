'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { DonationReconciliationPanel } from './DonationReconciliationPanel'
import { useAdminSiteID } from './site-context'

type Dashboard = {
  summary: {
    counts: Record<string, number>
    totalsMinorByCurrency: Record<string, Record<string, string>>
    oldestAgeMs: Record<string, number>
  }
  summaryScope: { sampled: boolean; rows: number; totalRows: number }
  health: Array<{ providerKey: string; ready: boolean; health: string; reason?: string }>
  pendingActions: Array<{
    id: string
    state: string
    amountMinor: string
    currency: string
    createdAt: string
    safeActions: string[]
  }>
  refunds: Array<{
    id: string
    state: string
    amountMinor: string
    currency: string
    createdAt: string
  }>
  disputes: Array<{
    id: string
    state: string
    amountMinor: string
    currency: string
    deadlineAt: string | null
  }>
  webhookFailures: Array<{
    id: string
    state: string
    providerKey: string
    verifiedAt: string
    error: string | null
  }>
  reconciliationCases: Array<{
    id: string
    reason: string
    createdAt: string
    status: string
  }>
  disclaimer: string
}

export function CommerceOperations() {
  const siteId = useAdminSiteID()
  const siteQuery = siteId ? `?siteId=${encodeURIComponent(siteId)}` : ''
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  const [reconciling, setReconciling] = useState(false)
  const [reconcileFeedback, setReconcileFeedback] = useState<string | null>(null)
  const [retryingWebhookId, setRetryingWebhookId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d' | 'all'>('30d')

  const load = useCallback(async () => {
    setError('')
    try {
      const sep = siteQuery ? '&' : '?'
      const response = await fetch(
        `/api/admin/commerce/dashboard${siteQuery}${sep}dateRange=${dateRange}`,
        {
          cache: 'no-store',
        },
      )
      const body = await response.json()
      if (!response.ok) setError(body.error ?? 'Commerce operations are unavailable.')
      else setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error loading commerce operations.')
    }
  }, [siteQuery, dateRange])

  useEffect(() => {
    void load()
  }, [load])

  const triggerReconciliation = async () => {
    setReconciling(true)
    setReconcileFeedback(null)
    try {
      const res = await fetch(`/api/admin/commerce/reconcile${siteQuery}`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Reconciliation queueing failed.')
      }
      setReconcileFeedback('Reconciliation job successfully queued with background worker.')
      await load()
    } catch (err) {
      setReconcileFeedback(
        err instanceof Error ? `Error: ${err.message}` : 'Failed to queue reconciliation.',
      )
    } finally {
      setReconciling(false)
    }
  }

  const retryWebhook = async (id: string) => {
    setRetryingWebhookId(id)
    try {
      await fetch(`/api/admin/commerce/reconcile${siteQuery}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ webhookEventId: id }),
      })
      await load()
    } catch {
      // Ignored; reloaded truth reflects current status
    } finally {
      setRetryingWebhookId(null)
    }
  }

  if (error) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Commerce operations</h1>
        <div
          role="alert"
          style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #f87171',
            borderRadius: '6px',
            color: '#991b1b',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '4px' }}>
            Unable to load commerce data
          </strong>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#b91c1c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8125rem',
            }}
          >
            Retry Loading
          </button>
        </div>
      </main>
    )
  }

  if (!data) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Commerce operations</h1>
        <p role="status" style={{ padding: '2rem', textAlign: 'center', color: '#a1a1aa' }}>
          Loading payment operations and verifying ledger integrity…
        </p>
      </main>
    )
  }

  const states = Object.keys(data.summary.counts).sort()
  const recordUrl = (collection: string, id: string) =>
    `/admin/collections/${collection}/${encodeURIComponent(id)}`

  // Classify state into one of the 6 canonical lifecycle buckets
  const classifyState = (state: string): { label: string; badge: string; color: string } => {
    const s = state.toLowerCase()
    if (['draft', 'proposal', 'proposed', 'local'].includes(s)) {
      return { label: 'Local / Draft', badge: 'LOCAL', color: '#38bdf8' }
    }
    if (
      ['pending', 'processing', 'action-required', 'action_required', 'requires_action'].includes(s)
    ) {
      return { label: 'Pending / Processing', badge: 'PENDING', color: '#fbbf24' }
    }
    if (['succeeded', 'captured', 'paid', 'provider-confirmed', 'confirmed'].includes(s)) {
      return { label: 'Provider-Confirmed (Operational)', badge: 'CONFIRMED', color: '#34d399' }
    }
    if (['failed', 'cancelled', 'canceled', 'declined', 'expired'].includes(s)) {
      return { label: 'Failed / Cancelled', badge: 'FAILED', color: '#f87171' }
    }
    if (['refunded', 'partial_refund', 'partially_refunded'].includes(s)) {
      return { label: 'Refunded', badge: 'REFUNDED', color: '#a78bfa' }
    }
    if (['reversed', 'disputed', 'chargeback', 'lost'].includes(s)) {
      return { label: 'Reversed / Disputed', badge: 'REVERSED', color: '#f43f5e' }
    }
    return { label: state, badge: state.toUpperCase(), color: '#94a3b8' }
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 1200, margin: '0 auto', fontFamily: 'inherit' }}>
      {/* 1. Header & Navigation */}
      <header
        style={{
          borderBottom: '1px solid var(--theme-elevation-200, #27272a)',
          paddingBottom: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0 }}>Commerce operations</h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#a1a1aa' }}>
              Multi-currency operational ledger, payment exceptions, provider health, and
              reconciliation.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Date Scope:</span>
            {(['24h', '7d', '30d', 'all'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDateRange(r)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: '1px solid var(--theme-elevation-300, #3f3f46)',
                  backgroundColor: dateRange === r ? '#2563eb' : 'transparent',
                  color: dateRange === r ? '#ffffff' : 'inherit',
                  cursor: 'pointer',
                }}
              >
                {r.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void load()}
              style={{
                marginLeft: '0.5rem',
                padding: '5px 12px',
                borderRadius: 4,
                fontSize: '0.75rem',
                fontWeight: 600,
                border: '1px solid #3b82f6',
                backgroundColor: '#1d4ed8',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Refresh Truth
            </button>
          </div>
        </div>

        <nav
          aria-label="Commerce work areas"
          style={{ marginTop: '1rem', fontSize: '0.8125rem', color: '#38bdf8' }}
        >
          <Link href="/admin/catalog">Catalog and readiness</Link>
          {' · '}
          <Link href="/admin/fulfillment">POD and fulfillment</Link>
          {' · '}
          <Link href="/admin/collections/orders">Orders and audit</Link>
          {' · '}
          <Link href="/admin/collections/subscriptions">Subscriptions and dunning</Link>
          {' · '}
          <Link href="/admin/collections/entitlements">Entitlements</Link>
          {' · '}
          <Link href="/admin/collections/donation-campaigns">Fundraising</Link>
          {' · '}
          <Link href="/pos">POS Terminal</Link>
        </nav>
      </header>

      {/* 2. Critical Disclosures Banner */}
      <section
        role="region"
        aria-label="Operational Disclosures & Invariants"
        style={{
          backgroundColor: 'var(--theme-elevation-50, #18181b)',
          border: '1px solid #eab308',
          borderRadius: 8,
          padding: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.25rem', color: '#eab308' }} aria-hidden="true">
            ⚠️
          </span>
          <div style={{ fontSize: '0.8125rem', color: '#e4e4e7', lineHeight: 1.5 }}>
            <strong style={{ color: '#fef08a', display: 'block', marginBottom: '4px' }}>
              Operational Invariants & Provider Disclosures
            </strong>
            <ul
              style={{
                margin: 0,
                paddingLeft: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <li>
                <strong>Safe Sandbox & Non-Settlement Invariant:</strong> {data.disclaimer} External
                payment providers (Stripe, PayPal, Offline) operate under sandbox API contracts.
                Local ledger entries marked provider-confirmed represent operational API captures
                only; <em>never simulate a confirmed settlement as real money or bank deposit.</em>
              </li>
              <li>
                <strong>Tax & Deductibility Constraints:</strong> Direct donations, memberships, and
                digital orders are not tax-deductible unless the operating organization holds
                certified 501(c)(3) or jurisdictional charitable status with formal donor
                receipting. Local sales tax and VAT are estimated where configured and do not
                represent certified tax advice.
              </li>
              <li>
                <strong>Analytics & Telemetry Linkage:</strong> Attribution funnels and conversion
                rollups may reflect up to 5-15 minutes of pipeline batching latency. Traffic lacking
                cryptographic consent (DNT/GPC headers or consent opt-out) is strictly omitted from
                conversion attribution to prevent false certainty.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {data.summaryScope.sampled && (
        <p role="status" style={{ fontSize: '0.8125rem', color: '#a1a1aa', marginBottom: '1rem' }}>
          Showing latest {data.summaryScope.rows} of {data.summaryScope.totalRows} payment attempts
          for current date scope ({dateRange.toUpperCase()}). Use the raw ledger for complete
          historical records.
        </p>
      )}

      {/* 3. Action Toolbar */}
      <div
        style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.5rem' }}
      >
        <button
          type="button"
          disabled={reconciling}
          onClick={() => void triggerReconciliation()}
          style={{
            padding: '6px 14px',
            backgroundColor: reconciling ? '#4b5563' : '#059669',
            color: '#ffffff',
            border: 'none',
            borderRadius: 4,
            fontWeight: 600,
            fontSize: '0.8125rem',
            cursor: reconciling ? 'not-allowed' : 'pointer',
          }}
        >
          {reconciling ? 'Queueing reconciliation…' : 'Queue reconciliation'}
        </button>
        {reconcileFeedback && (
          <span
            role="status"
            style={{
              fontSize: '0.8125rem',
              color: reconcileFeedback.startsWith('Error') ? '#ef4444' : '#10b981',
            }}
          >
            {reconcileFeedback}
          </span>
        )}
      </div>

      {/* 4. Provider Health */}
      <section style={{ marginBottom: '1.5rem' }} aria-labelledby="provider-health-heading">
        <h2
          id="provider-health-heading"
          style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}
        >
          Provider health & mode
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {data.health.map((item) => (
            <div
              key={item.providerKey}
              style={{
                padding: '0.75rem',
                borderRadius: 6,
                border: '1px solid var(--theme-elevation-200, #27272a)',
                backgroundColor: 'var(--theme-elevation-50, #18181b)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.providerKey}</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 3,
                    backgroundColor: item.ready ? '#064e3b' : '#7f1d1d',
                    color: item.ready ? '#a7f3d0' : '#fecaca',
                  }}
                >
                  {item.health.toUpperCase()}
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#a1a1aa' }}>
                {item.reason
                  ? item.reason
                  : item.ready
                    ? 'Configured (Sandbox / Safe mode)'
                    : 'Missing credentials'}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Payment State & Age Matrix */}
      <section style={{ marginBottom: '2rem' }} aria-labelledby="payment-states-heading">
        <h2
          id="payment-states-heading"
          style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}
        >
          Payment states & aging (local vs. pending vs. confirmed)
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <caption
            style={{
              textAlign: 'left',
              marginBottom: '0.5rem',
              color: '#a1a1aa',
              fontSize: '0.75rem',
            }}
          >
            Breakdown of payment attempts across lifecycle stages, currencies, and maximum age.
          </caption>
          <thead>
            <tr
              style={{
                borderBottom: '2px solid var(--theme-elevation-200, #3f3f46)',
                textAlign: 'left',
              }}
            >
              <th scope="col" style={{ padding: '8px' }}>
                Lifecycle Stage
              </th>
              <th scope="col" style={{ padding: '8px' }}>
                State Key
              </th>
              <th scope="col" style={{ padding: '8px' }}>
                Count
              </th>
              <th scope="col" style={{ padding: '8px' }}>
                Totals by Currency (minor units)
              </th>
              <th scope="col" style={{ padding: '8px' }}>
                Oldest Age
              </th>
            </tr>
          </thead>
          <tbody>
            {states.map((state) => {
              const classification = classifyState(state)
              return (
                <tr
                  key={state}
                  style={{ borderBottom: '1px solid var(--theme-elevation-150, #27272a)' }}
                >
                  <th scope="row" style={{ padding: '8px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 3,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor: 'var(--theme-elevation-200, #27272a)',
                        color: classification.color,
                        marginRight: '6px',
                      }}
                    >
                      [{classification.badge}]
                    </span>
                    {classification.label}
                  </th>
                  <td style={{ padding: '8px' }}>
                    <code>{state}</code>
                  </td>
                  <td style={{ padding: '8px', fontWeight: 600 }}>{data.summary.counts[state]}</td>
                  <td style={{ padding: '8px' }}>
                    {Object.entries(data.summary.totalsMinorByCurrency)
                      .filter(([, totals]) => totals[state] !== undefined)
                      .map(([currency, totals]) => `${currency} ${totals[state]}`)
                      .join(', ') || '—'}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {Math.floor((data.summary.oldestAgeMs[state] ?? 0) / 60000)} min
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {/* 6. Needs Attention / Pending Actions */}
      <section style={{ marginBottom: '2rem' }} aria-labelledby="attention-heading">
        <h2
          id="attention-heading"
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            marginBottom: '0.75rem',
            color: data.pendingActions.length ? '#f59e0b' : 'inherit',
          }}
        >
          Needs attention ({data.pendingActions.length})
        </h2>
        {data.pendingActions.length ? (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {data.pendingActions.map((item) => (
              <li
                key={item.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: 6,
                  border: '1px solid #f59e0b',
                  backgroundColor: 'var(--theme-elevation-50, #18181b)',
                  fontSize: '0.8125rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <Link
                      href={recordUrl('payment-attempts', item.id)}
                      style={{ fontWeight: 600, color: '#38bdf8' }}
                    >
                      [{item.state.toUpperCase()}] Attempt {item.id.slice(0, 8)}…
                    </Link>
                    <span style={{ color: '#d1d5db', marginLeft: '0.5rem' }}>
                      {item.amountMinor} {item.currency} · Opened: {item.createdAt}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => void triggerReconciliation()}
                      style={{
                        padding: '3px 8px',
                        fontSize: '0.75rem',
                        borderRadius: 3,
                        border: '1px solid #3b82f6',
                        backgroundColor: '#1d4ed8',
                        color: '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      Reconcile Attempt
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '4px' }}>
                  <strong>Condition:</strong> Payment state is unresolved or requires external
                  verification. Safe Actions: {item.safeActions.join(', ') || 'inspect ledger'}.
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: '0.8125rem', color: '#10b981', margin: 0 }}>
            ✓ No pending payment exceptions. All payment attempts are in terminal or reconciled
            states.
          </p>
        )}
      </section>

      {/* 7. Refunds & Disputes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        <section aria-labelledby="refunds-heading">
          <h2
            id="refunds-heading"
            style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}
          >
            Recorded Refunds ({data.refunds.length})
          </h2>
          {data.refunds.length ? (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {data.refunds.map((item) => (
                <li
                  key={item.id}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 4,
                    border: '1px solid var(--theme-elevation-200, #27272a)',
                    backgroundColor: 'var(--theme-elevation-50, #18181b)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <Link
                    href={recordUrl('commerce-refunds', item.id)}
                    style={{ color: '#a78bfa', fontWeight: 600 }}
                  >
                    {item.state} refund
                  </Link>
                  : {item.amountMinor} {item.currency}; opened {item.createdAt}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: '0.8125rem', color: '#a1a1aa' }}>No recent refunds recorded.</p>
          )}
        </section>

        <section aria-labelledby="disputes-heading">
          <h2
            id="disputes-heading"
            style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}
          >
            Active Disputes & Inquiries ({data.disputes.length})
          </h2>
          {data.disputes.length ? (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {data.disputes.map((item) => (
                <li
                  key={item.id}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 4,
                    border: '1px solid #ef4444',
                    backgroundColor: 'var(--theme-elevation-50, #18181b)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <Link
                    href={recordUrl('commerce-disputes', item.id)}
                    style={{ color: '#f87171', fontWeight: 600 }}
                  >
                    {item.state} dispute
                  </Link>
                  : {item.amountMinor} {item.currency}; deadline:{' '}
                  {item.deadlineAt ?? 'not supplied'}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: '0.8125rem', color: '#a1a1aa' }}>
              No active disputes or reversals.
            </p>
          )}
        </section>
      </div>

      {/* 8. Webhook Gaps & Quarantined Reconciliation Cases */}
      <section style={{ marginBottom: '2rem' }} aria-labelledby="webhooks-heading">
        <h2
          id="webhooks-heading"
          style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}
        >
          Webhook failures & ordering gaps ({data.webhookFailures.length})
        </h2>
        {data.webhookFailures.length ? (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {data.webhookFailures.map((item) => (
              <li
                key={item.id}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 4,
                  border: '1px solid #e11d48',
                  backgroundColor: 'var(--theme-elevation-50, #18181b)',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <Link
                    href={recordUrl('payment-webhook-events', item.id)}
                    style={{ color: '#fb7185', fontWeight: 600 }}
                  >
                    [{item.state.toUpperCase()}] {item.providerKey}
                  </Link>
                  <span style={{ color: '#d1d5db', marginLeft: '0.5rem' }}>
                    Verified: {item.verifiedAt} · {item.error ?? 'Out-of-order gap'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={retryingWebhookId === item.id}
                  onClick={() => void retryWebhook(item.id)}
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.75rem',
                    borderRadius: 3,
                    border: '1px solid #e11d48',
                    backgroundColor: '#be123c',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  {retryingWebhookId === item.id ? 'Replaying…' : 'Retry Replay'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: '0.8125rem', color: '#10b981' }}>
            ✓ No webhook failures or sequence gaps recorded.
          </p>
        )}
      </section>

      {/* 9. Quarantined Reconciliation Cases */}
      <section style={{ marginBottom: '2rem' }} aria-labelledby="quarantine-heading">
        <h2
          id="quarantine-heading"
          style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}
        >
          Quarantined reconciliation cases ({data.reconciliationCases.length})
        </h2>
        {data.reconciliationCases.length ? (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {data.reconciliationCases.map((item) => (
              <li
                key={item.id}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 4,
                  border: '1px solid #f97316',
                  backgroundColor: 'var(--theme-elevation-50, #18181b)',
                  fontSize: '0.8125rem',
                }}
              >
                <Link
                  href={recordUrl('commerce-reconciliation-cases', item.id)}
                  style={{ color: '#fb923c', fontWeight: 600 }}
                >
                  {item.status} case
                </Link>
                : {item.reason}; opened {item.createdAt}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: '0.8125rem', color: '#10b981' }}>
            ✓ No quarantined reconciliation cases. Ledger is fully reconciled.
          </p>
        )}
      </section>

      {/* 10. Donation Reconciliation Panel */}
      <DonationReconciliationPanel siteId={siteId} />
    </main>
  )
}
