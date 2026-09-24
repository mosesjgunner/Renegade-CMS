'use client'

import { useEffect, useState } from 'react'

type Result = {
  metricsByCurrency: Record<
    string,
    { settledAmountMinor: string; settledGiftCount: number; math: string }
  >
  reconciliation: Array<{
    id: string
    supporterId: string
    settledAt: string
    amountMinor: string
    reversedAmountMinor: string
    currency: string
    designation: string
    recurrence: string
    lifecycle: string
    donor: string
  }>
}

export function DonationReconciliationPanel() {
  const [data, setData] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [supporterId, setSupporterId] = useState('')
  const [notice, setNotice] = useState('')
  const load = async () => {
    const response = await fetch('/api/admin/commerce/donations', { cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) setError(body.error ?? 'Donation reconciliation is unavailable.')
    else {
      setError('')
      setData(body)
    }
  }
  useEffect(() => {
    void load()
  }, [])
  async function exportReport(format: 'csv' | 'json') {
    const response = await fetch(`/api/admin/commerce/donations?format=${format}`, {
      cache: 'no-store',
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      setError(body.error ?? 'Donation export is unavailable.')
      return
    }
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `donation-reconciliation.${format}`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  async function maskSupporter() {
    setNotice('')
    const response = await fetch('/api/admin/commerce/donations', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'mask-retention', supporterId }),
    })
    const body = await response.json()
    if (!response.ok) setNotice(body.error ?? 'Privacy masking failed.')
    else {
      setNotice('Supporter profile masked; financial audit records preserved.')
      setSupporterId('')
      await load()
    }
  }
  return (
    <section aria-labelledby="donation-reconciliation-title">
      <h2 id="donation-reconciliation-title">Donation reconciliation</h2>
      {error && <p role="alert">{error}</p>}
      <p>
        Gift totals include settled amounts only, subtract recorded partial refunds, exclude
        processing fees, and remain separated by currency.
      </p>
      <p>
        <button type="button" onClick={() => void exportReport('csv')}>
          Export CSV
        </button>{' '}
        ·{' '}
        <button type="button" onClick={() => void exportReport('json')}>
          Export JSON
        </button>{' '}
        ·{' '}
        <button type="button" onClick={() => void load()}>
          Refresh
        </button>
      </p>
      {data && (
        <>
          <h3>Settled totals by currency</h3>
          <ul>
            {Object.entries(data.metricsByCurrency).map(([currency, metric]) => (
              <li key={currency}>
                {currency}: {metric.settledAmountMinor} minor units across {metric.settledGiftCount}{' '}
                gifts. {metric.math}
              </li>
            ))}
          </ul>
          <h3>Recent donation ledger</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Settlement date</th>
                  <th>Donor</th>
                  <th>Supporter record</th>
                  <th>Amount</th>
                  <th>Reversed</th>
                  <th>Currency</th>
                  <th>Designation</th>
                  <th>Recurrence</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.reconciliation.map((row) => (
                  <tr key={row.id}>
                    <td>{row.settledAt}</td>
                    <td>{row.donor}</td>
                    <td>
                      <code>{row.supporterId || '—'}</code>
                    </td>
                    <td>{row.amountMinor}</td>
                    <td>{row.reversedAmountMinor}</td>
                    <td>{row.currency}</td>
                    <td>{row.designation || 'General'}</td>
                    <td>{row.recurrence}</td>
                    <td>{row.lifecycle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <h3>Retention privacy masking</h3>
      <label htmlFor="donation-supporter-id">Supporter record ID</label>{' '}
      <input
        id="donation-supporter-id"
        value={supporterId}
        onChange={(event) => setSupporterId(event.target.value)}
      />{' '}
      <button type="button" disabled={!supporterId.trim()} onClick={() => void maskSupporter()}>
        Mask supporter profile
      </button>
      {notice && <p role="status">{notice}</p>}
    </section>
  )
}
