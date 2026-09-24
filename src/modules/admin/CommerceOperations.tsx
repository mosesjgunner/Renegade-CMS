'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DonationReconciliationPanel } from './DonationReconciliationPanel'

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
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  const load = async () => {
    const response = await fetch('/api/admin/commerce/dashboard', { cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) setError(body.error ?? 'Commerce operations are unavailable.')
    else setData(body)
  }
  useEffect(() => {
    void load()
  }, [])
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p role="status">Loading payment operations…</p>
  const states = Object.keys(data.summary.counts).sort()
  const recordUrl = (collection: string, id: string) =>
    `/admin/collections/${collection}/${encodeURIComponent(id)}`
  return (
    <main>
      <h1>Commerce operations</h1>
      <p>{data.disclaimer}</p>
      {data.summaryScope.sampled && (
        <p role="status">
          Payment summary covers the latest {data.summaryScope.rows} of{' '}
          {data.summaryScope.totalRows} attempts. Use the payment ledger for complete history.
        </p>
      )}
      <nav aria-label="Commerce work areas">
        <Link href="/admin/catalog">Catalog and readiness</Link>
        {' | '}
        <Link href="/admin/fulfillment">POD and fulfillment</Link>
        {' | '}
        <Link href="/admin">Orders and audit</Link>
        {' | '}
        <Link href="/admin/collections/subscriptions">Subscriptions and dunning</Link>
        {' | '}
        <Link href="/admin/collections/entitlements">Entitlements</Link>
        {' | '}
        <Link href="/admin/collections/donation-campaigns">Fundraising</Link>
      </nav>
      <button type="button" onClick={() => void load()}>
        Refresh server truth
      </button>
      <button
        type="button"
        onClick={async () => {
          await fetch('/api/admin/commerce/reconcile', { method: 'POST' })
          await load()
        }}
      >
        Queue reconciliation
      </button>
      <h2>Provider health</h2>
      <ul>
        {data.health.map((item) => (
          <li key={item.providerKey}>
            {item.providerKey}: {item.health}
            {item.reason ? ` — ${item.reason}` : ''}
          </li>
        ))}
      </ul>
      <h2>Payment state and age</h2>
      <table>
        <thead>
          <tr>
            <th>State</th>
            <th>Count</th>
            <th>Totals by currency (minor units)</th>
            <th>Oldest age</th>
          </tr>
        </thead>
        <tbody>
          {states.map((state) => (
            <tr key={state}>
              <th>{state}</th>
              <td>{data.summary.counts[state]}</td>
              <td>
                {Object.entries(data.summary.totalsMinorByCurrency)
                  .filter(([, totals]) => totals[state] !== undefined)
                  .map(([currency, totals]) => `${currency} ${totals[state]}`)
                  .join(', ')}
              </td>
              <td>{Math.floor((data.summary.oldestAgeMs[state] ?? 0) / 60000)} min</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Needs attention</h2>
      {data.pendingActions.length ? (
        <ul>
          {data.pendingActions.map((item) => (
            <li key={item.id}>
              <Link href={recordUrl('payment-attempts', item.id)}>{item.state} payment</Link>:{' '}
              {item.amountMinor} {item.currency}; opened {item.createdAt}; actions:{' '}
              {item.safeActions.join(', ') || 'inspect'}
            </li>
          ))}
        </ul>
      ) : (
        <p>No pending payment exceptions.</p>
      )}
      <h2>Refunds</h2>
      <ul>
        {data.refunds.map((item) => (
          <li key={item.id}>
            <Link href={recordUrl('commerce-refunds', item.id)}>{item.state} refund</Link>:{' '}
            {item.amountMinor} {item.currency}; opened {item.createdAt}
          </li>
        ))}
      </ul>
      {!data.refunds.length && <p>No recent refunds.</p>}
      <h2>Disputes</h2>
      <ul>
        {data.disputes.map((item) => (
          <li key={item.id}>
            <Link href={recordUrl('commerce-disputes', item.id)}>{item.state} dispute</Link>:{' '}
            {item.amountMinor} {item.currency}; deadline {item.deadlineAt ?? 'not supplied'}
          </li>
        ))}
      </ul>
      {!data.disputes.length && <p>No recent disputes.</p>}
      <h2>Webhook and ordering gaps</h2>
      <ul>
        {data.webhookFailures.map((item) => (
          <li key={item.id}>
            <Link href={recordUrl('payment-webhook-events', item.id)}>{item.state} event</Link>:{' '}
            {item.providerKey}; verified {item.verifiedAt}; {item.error ?? 'inspect event'}
          </li>
        ))}
      </ul>
      {!data.webhookFailures.length && <p>No recent webhook failures or ordering gaps.</p>}
      <h2>Quarantined reconciliation cases</h2>
      <ul>
        {data.reconciliationCases.map((item) => (
          <li key={item.id}>
            <Link href={recordUrl('commerce-reconciliation-cases', item.id)}>
              {item.status} case
            </Link>
            : {item.reason}; opened {item.createdAt}
          </li>
        ))}
      </ul>
      {!data.reconciliationCases.length && <p>No quarantined cases.</p>}
      <DonationReconciliationPanel />
    </main>
  )
}
