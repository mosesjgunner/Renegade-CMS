'use client'

import React, { useState, useEffect, useCallback } from 'react'

export type JobItem = {
  id: string
  articleId: string
  articleTitle: string
  revisionId: string
  revisionSequence: number
  revisionHash: string
  scheduledFor: string
  timeZone: string
  idempotencyKey: string
  status: string
  rawStatus: string
  leaseOwner: string | null
  leaseExpiresAt: string | null
  retryCount: number
  maxRetries: number
  lastError: string | null
}

export type ScheduleHealthData = {
  counts: {
    nextJobs: number
    lateJobs: number
    retryingJobs: number
    failedJobs: number
    completedJobs: number
  }
  workerHealth: {
    status: 'healthy' | 'degraded' | 'down'
    activeWorkerId: string
    lastHeartbeat: string
    clockDriftBufferSeconds: number
    catchUpThresholdMinutes: number
  }
  jobs: JobItem[]
}

export function ScheduleHealthCenter() {
  const [data, setData] = useState<ScheduleHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'queued' | 'late' | 'failed' | 'completed'>('all')
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/schedule-health')
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch schedule health.`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  const handleAction = async (action: 'retry' | 'cancel' | 'reconcile', jobId?: string) => {
    setActionMessage(null)
    try {
      const res = await fetch('/api/admin/schedule-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, jobId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Action failed')
      setActionMessage(json.message || 'Action completed successfully.')
      await fetchHealth()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const filteredJobs = data?.jobs.filter((j) => {
    if (filter === 'all') return true
    if (filter === 'late') return j.status === 'late'
    return j.rawStatus === filter
  }) ?? []

  return (
    <div className="space-y-6 font-sans">
      <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Schedule Health Center</h1>
          <p className="text-sm text-stone-500">Operational queue visibility, worker lease health, retry controls, and revision integrity.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('reconcile')}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-stone-900 text-white hover:bg-stone-800 transition"
          >
            Reconcile Queue
          </button>
          <button
            onClick={fetchHealth}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
          >
            Refresh Status
          </button>
        </div>
      </header>

      {actionMessage && (
        <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
          {actionMessage}
        </div>
      )}

      {error && (
        <div className="p-3 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
          {error}
        </div>
      )}

      {/* Health Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <span className="text-xs text-stone-500 block">Worker Status</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 capitalize">
            {data?.workerHealth.status ?? 'Unknown'}
          </span>
          <span className="text-[10px] text-stone-400 block mt-1">Node: {data?.workerHealth.activeWorkerId}</span>
        </div>

        <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <span className="text-xs text-stone-500 block">Next Scheduled</span>
          <span className="text-xl font-bold text-stone-800 dark:text-stone-200">
            {data?.counts.nextJobs ?? 0}
          </span>
        </div>

        <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <span className="text-xs text-stone-500 block">Late / Overdue</span>
          <span className={`text-xl font-bold ${(data?.counts.lateJobs ?? 0) > 0 ? 'text-amber-600' : 'text-stone-800 dark:text-stone-200'}`}>
            {data?.counts.lateJobs ?? 0}
          </span>
        </div>

        <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <span className="text-xs text-stone-500 block">Retrying / Failed</span>
          <span className={`text-xl font-bold ${(data?.counts.failedJobs ?? 0) > 0 ? 'text-rose-600' : 'text-stone-800 dark:text-stone-200'}`}>
            {(data?.counts.retryingJobs ?? 0) + (data?.counts.failedJobs ?? 0)}
          </span>
        </div>

        <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <span className="text-xs text-stone-500 block">Completed</span>
          <span className="text-xl font-bold text-stone-800 dark:text-stone-200">
            {data?.counts.completedJobs ?? 0}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-stone-200 dark:border-stone-800 pb-2">
        {(['all', 'queued', 'late', 'failed', 'completed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition ${
              filter === tab ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Jobs Table */}
      <div className="overflow-x-auto border border-stone-200 dark:border-stone-800 rounded-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-stone-100 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 font-semibold uppercase tracking-wider">
            <tr>
              <th className="p-3">Artifact & Title</th>
              <th className="p-3">Exact Revision</th>
              <th className="p-3">Scheduled UTC & Zone</th>
              <th className="p-3">Status & Retries</th>
              <th className="p-3">Last Error (Sanitized)</th>
              <th className="p-3 text-right">Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-stone-400">Loading schedule health...</td>
              </tr>
            ) : filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-stone-400">No scheduled publish jobs matching filter.</td>
              </tr>
            ) : (
              filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-900/50">
                  <td className="p-3 font-medium">
                    <div className="text-stone-900 dark:text-stone-100 font-bold">{job.articleTitle}</div>
                    <div className="text-[10px] text-stone-400 font-mono">ID: {job.articleId}</div>
                  </td>

                  <td className="p-3 font-mono text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                      Seq #{job.revisionSequence}
                    </span>
                    <div className="text-[10px] text-stone-400 mt-0.5">{job.revisionHash ? `Hash: ${job.revisionHash.slice(0, 8)}...` : 'Rev: ' + job.revisionId}</div>
                  </td>

                  <td className="p-3">
                    <div className="font-semibold text-stone-800 dark:text-stone-200">{new Date(job.scheduledFor).toLocaleString()}</div>
                    <div className="text-[10px] text-stone-400 font-mono">{job.scheduledFor} ({job.timeZone})</div>
                  </td>

                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                        job.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : job.status === 'late'
                          ? 'bg-amber-100 text-amber-800'
                          : job.status === 'failed'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {job.status}
                    </span>
                    <div className="text-[10px] text-stone-400 mt-1">Retries: {job.retryCount}/{job.maxRetries}</div>
                  </td>

                  <td className="p-3 max-w-xs truncate text-stone-600 dark:text-stone-400 font-mono text-[10px]">
                    {job.lastError ? (
                      <span className="text-rose-600 dark:text-rose-400 font-sans block text-xs" title={job.lastError}>
                        ⚠️ {job.lastError}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>

                  <td className="p-3 text-right space-x-1">
                    {job.rawStatus === 'failed' || job.status === 'late' ? (
                      <button
                        onClick={() => handleAction('retry', job.id)}
                        className="px-2 py-1 text-[11px] font-semibold rounded bg-stone-800 text-white hover:bg-stone-700"
                      >
                        Retry
                      </button>
                    ) : null}
                    {job.rawStatus !== 'completed' && job.rawStatus !== 'cancelled' ? (
                      <button
                        onClick={() => handleAction('cancel', job.id)}
                        className="px-2 py-1 text-[11px] font-medium rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
