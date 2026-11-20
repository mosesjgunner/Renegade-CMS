'use client'

import { useEffect, useState } from 'react'

import type { TaskReadiness } from '../operations/task-readiness'

type TasksResponse = {
  tasks: TaskReadiness[]
  source: string
  snapshotCheckedAt: string | null
  checkedAt: string
  error?: string
}

const STATE_STYLES: Record<TaskReadiness['state'], string> = {
  verified: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  ready: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'in-progress': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  blocked: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  'not-started': 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
}

/**
 * Minimal operator view over the shared task-readiness service (UXI-02):
 * the same task states the setup flow computes, served by
 * /api/operations/tasks. Rendered on /admin/operations and on the
 * releases page.
 */
export default function TaskReadinessPanel() {
  const [data, setData] = useState<TasksResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/operations/tasks', { credentials: 'same-origin' })
      .then(async (response) => {
        const body = (await response.json()) as TasksResponse
        if (!response.ok) throw new Error(body.error ?? 'Task readiness is unavailable.')
        return body
      })
      .then((body) => {
        if (!cancelled) setData(body)
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Task readiness is unavailable.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="surface-card p-5 space-y-3" aria-label="Task readiness">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base">Task readiness</h2>
        {data ? (
          <span className="text-[11px] text-stone-500">
            {data.source === 'snapshot+live'
              ? `Provider tasks last checked ${data.snapshotCheckedAt ? new Date(data.snapshotCheckedAt).toLocaleString() : '—'}; core tasks checked just now.`
              : 'Checked just now.'}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {!data && !error ? (
        <p className="text-xs text-stone-500" role="status">
          Checking task readiness…
        </p>
      ) : null}
      {data ? (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800 text-sm">
          {data.tasks.map((task) => (
            <li key={task.taskId} className="py-2.5 flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="font-medium">{task.label}</p>
                <p className="text-xs text-stone-500">
                  {task.skipped ? 'Skipped — ' : ''}
                  {task.reason}
                </p>
                {task.state !== 'verified' && task.nextAction.label !== 'Done' ? (
                  <p className="text-xs text-stone-500">
                    Next: {task.nextAction.label}
                    {task.lastCheckedAt
                      ? ` · Last checked ${new Date(task.lastCheckedAt).toLocaleString()}`
                      : ''}
                  </p>
                ) : null}
              </div>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded whitespace-nowrap ${STATE_STYLES[task.state]}`}
              >
                {task.skipped ? 'skipped' : task.state}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
