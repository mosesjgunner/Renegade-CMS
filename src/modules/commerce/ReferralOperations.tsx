'use client'
/* eslint-disable @typescript-eslint/no-explicit-any -- SQL operator response */
import { useEffect, useState } from 'react'

export function ReferralOperations() {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [siteId, setSiteId] = useState('')
  const [report, setReport] = useState<any>()
  const [message, setMessage] = useState('')
  async function load() {
    const response = await fetch(
      `/api/admin/commerce/affiliate?siteId=${encodeURIComponent(siteId)}`,
    )
    const result = await response.json()
    if (!response.ok) {
      setReport(undefined)
      setMessage(result.error)
      return
    }
    setReport(result)
    setMessage('Stored financial evidence loaded.')
  }
  return (
    <section>
      <label>
        Site ID{' '}
        <input
          disabled={!ready}
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
        />
      </label>
      <button disabled={!ready} onClick={load}>
        Load referral ledger
      </button>
      <button
        disabled={!ready}
        onClick={async () => {
          const response = await fetch('/api/admin/commerce/affiliate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ siteId, action: 'reconcile-referrals' }),
          })
          const result = await response.json()
          setMessage(
            response.ok
              ? 'Reconciliation queued. Reload after the commerce worker runs.'
              : result.error,
          )
        }}
      >
        Reconcile recorded transactions
      </button>
      <p role="status">{message}</p>
      {report && (
        <>
          <p>{report.accountingNote}</p>
          <p>Payout: {report.payoutState}</p>
          <h2>Currency totals</h2>
          <table>
            <thead>
              <tr>
                <th>Currency</th>
                <th>Unpaid minor units</th>
                <th>Reversed minor units</th>
                <th>Paid minor units</th>
              </tr>
            </thead>
            <tbody>
              {report.totals.map((row: any) => (
                <tr key={row.currency}>
                  <td>{row.currency}</td>
                  <td>{row.unpaid_minor}</td>
                  <td>{row.reversed_minor}</td>
                  <td>{row.paid_minor}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Referral links</h2>
          <ul>
            {report.codes.map((row: any) => (
              <li key={row.id}>
                <a href={`/referrals/${encodeURIComponent(row.code)}`}>{row.code}</a>
              </li>
            ))}
          </ul>
          <h2>Disclosed affiliate offers</h2>
          <ul>
            {report.offers.map((row: any) => (
              <li key={row.id}>
                <a href={`/affiliate/${row.id}`}>{row.name}</a> — {row.status}
                <p>{row.disclosure.text}</p>
              </li>
            ))}
          </ul>
          <h2>Order drilldown</h2>
          <h3>Captured and pending attribution</h3>
          <ul>
            {report.claims.map((row: any) => (
              <li key={row.id}>
                Claim {row.id}: {row.payment_state ?? row.checkout_state ?? 'awaiting-checkout'} —{' '}
                {row.amount_minor ?? '0'} {row.currency ?? ''}
              </li>
            ))}
          </ul>
          {report.orders.map((row: any) => (
            <details key={row.id}>
              <summary>
                {row.order_number} — {row.state} — {row.amount_minor} {row.currency}
              </summary>
              <p>Order ID: {row.id}</p>
              <pre>
                {JSON.stringify(
                  {
                    attribution: row.referral_attribution,
                    source: row.source_snapshot,
                    refunds: row.refund_extension,
                    commissions: report.ledgers.filter((entry: any) => entry.order_id === row.id),
                    callbacks: report.callbacks.filter(
                      (entry: any) => entry.external_order_id === row.id,
                    ),
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          ))}
        </>
      )}
    </section>
  )
}
