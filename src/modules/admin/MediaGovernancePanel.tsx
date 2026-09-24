'use client'

import { useEffect, useState } from 'react'

type Dashboard = Record<
  string,
  string[] | Array<{ id: string; assetId: string; summary: string; status: string }>
>
type Candidate = { checksum: string; assets: Array<{ id: string; title: string }> }

export function MediaGovernancePanel({
  siteId,
  selectedId,
}: {
  siteId: string
  selectedId?: string
}) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [ids, setIds] = useState(selectedId ?? '')
  const [message, setMessage] = useState('')
  const [undo, setUndo] = useState<Array<{ id: string; undo: Record<string, unknown> }>>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])

  const request = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/media/governance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, ...body }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Governance operation failed.')
    return result as Record<string, unknown>
  }
  const refresh = async () => {
    try {
      const response = await fetch(`/api/media/governance?siteId=${encodeURIComponent(siteId)}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load governance queue.')
      setDashboard(result.dashboard)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load governance queue.')
    }
  }
  useEffect(() => {
    let active = true
    void fetch(`/api/media/governance?siteId=${encodeURIComponent(siteId)}`)
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not load governance queue.')
        if (active) setDashboard(result.dashboard)
      })
      .catch(
        (error: unknown) =>
          active &&
          setMessage(error instanceof Error ? error.message : 'Could not load governance queue.'),
      )
    return () => {
      active = false
    }
  }, [siteId])
  const assetIds = () =>
    ids
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  const bulk = async (operation: string) => {
    try {
      const result = await request({ action: 'bulk', operation, assetIds: assetIds() })
      const report = result.report as {
        successes: Array<{ id: string; undo: Record<string, unknown> }>
        failures: unknown[]
      }
      setUndo(report.successes.filter((item) => Object.keys(item.undo).length))
      setMessage(
        `${operation}: ${report.successes.length} completed; ${report.failures.length} failed.`,
      )
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bulk operation failed.')
    }
  }
  const reconcile = async () => {
    try {
      const result = await request({ action: 'reconcile' })
      const report = result.reconciliation as {
        created: number
        updated: number
        removed: number
        failures: unknown[]
      }
      setMessage(
        `Usage reconciliation: ${report.created} added, ${report.updated} refreshed, ${report.removed} stale rows removed, ${report.failures.length} failures.`,
      )
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reconciliation failed.')
    }
  }
  const loadDuplicates = async () => {
    try {
      const result = await request({ action: 'duplicates' })
      setCandidates(result.candidates as Candidate[])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load duplicate candidates.')
    }
  }
  return (
    <section
      aria-label="Media governance"
      style={{ marginTop: '2rem', borderTop: '1px solid #ccc', paddingTop: '1rem' }}
    >
      <h2>Media governance</h2>
      <p>
        Use explicit selections for recovery-safe bulk changes. Duplicate candidates never merge
        automatically.
      </p>
      <label>
        Selected asset IDs (comma separated)
        <input value={ids} onChange={(event) => setIds(event.target.value)} />
      </label>
      <p>
        <button type="button" onClick={() => void bulk('archive')}>
          Archive selected
        </button>{' '}
        <button type="button" onClick={() => void bulk('export')}>
          Export selected metadata
        </button>{' '}
        <button type="button" onClick={() => void reconcile()}>
          Reconcile usage graph
        </button>{' '}
        <button type="button" onClick={() => void loadDuplicates()}>
          Review checksum duplicates
        </button>{' '}
        {undo.length > 0 && (
          <button
            type="button"
            onClick={() =>
              void request({ action: 'undo', operations: undo })
                .then(() => {
                  setUndo([])
                  setMessage('Bulk changes restored.')
                  return refresh()
                })
                .catch((error) => setMessage(error.message))
            }
          >
            Undo last bulk change
          </button>
        )}
      </p>
      {dashboard && (
        <ul aria-label="Governance issue counts">
          {Object.entries(dashboard).map(([kind, values]) => (
            <li key={kind}>
              {kind}: {values.length}
            </li>
          ))}
        </ul>
      )}
      {candidates.map((candidate) => (
        <div key={candidate.checksum} style={{ marginBlock: '0.75rem' }}>
          <strong>Duplicate checksum {candidate.checksum.slice(0, 12)}…</strong>
          <ul>
            {candidate.assets.map((asset) => (
              <li key={asset.id}>
                {asset.title}{' '}
                <button
                  type="button"
                  onClick={() =>
                    void request({
                      action: 'review-duplicate',
                      checksum: candidate.checksum,
                      keepId: asset.id,
                      discardIds: candidate.assets
                        .filter((item) => item.id !== asset.id)
                        .map((item) => item.id),
                      reviewAction: 'keep',
                    })
                      .then(() => setMessage('Duplicates marked reviewed; no media was merged.'))
                      .catch((error) => setMessage(error.message))
                  }
                >
                  Keep
                </button>{' '}
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Merge only these reviewed duplicates into this chosen keeper?',
                      )
                    )
                      void request({
                        action: 'review-duplicate',
                        checksum: candidate.checksum,
                        keepId: asset.id,
                        discardIds: candidate.assets
                          .filter((item) => item.id !== asset.id)
                          .map((item) => item.id),
                        reviewAction: 'merge',
                      })
                        .then(() => setMessage('Explicit duplicate merge recorded.'))
                        .catch((error) => setMessage(error.message))
                  }}
                >
                  Merge reviewed
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
