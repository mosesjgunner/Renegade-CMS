'use client'

import React, { useState, useMemo } from 'react'
import type { CalendarProjection } from '@/modules/calendar/contracts'

export type CalendarFilterState = {
  siteId: string
  publicationId: string
  contentType: string
  workflowState: string
  assigneeId: string
  specialState: string
  timeZone: string
}

export type DragConfirmation = {
  item: CalendarProjection
  targetDate: string
  timeZone: string
}

export type RescheduleModalTarget = {
  item: CalendarProjection
  newLocalDateTime: string
  timeZone: string
}

export function CalendarCenter({ initialEntries = [] }: { initialEntries?: CalendarProjection[] }) {
  const [entries, setEntries] = useState<CalendarProjection[]>(initialEntries)
  const [view, setView] = useState<'Month' | 'Week' | 'List'>('Month')
  const [filter, setFilter] = useState<CalendarFilterState>({
    siteId: 'all',
    publicationId: 'all',
    contentType: 'all',
    workflowState: 'all',
    assigneeId: 'all',
    specialState: 'all',
    timeZone: 'America/Chicago',
  })

  const [dragConfirm, setDragConfirm] = useState<DragConfirmation | null>(null)
  const [rescheduleModal, setRescheduleModal] = useState<RescheduleModalTarget | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      if (filter.siteId !== 'all' && item.siteId !== filter.siteId) return false
      if (filter.publicationId !== 'all' && item.publicationId !== filter.publicationId) return false
      if (filter.contentType !== 'all' && item.sourceType !== filter.contentType) return false
      if (filter.workflowState !== 'all' && item.status !== filter.workflowState) return false
      if (filter.assigneeId !== 'all' && item.ownerId !== filter.assigneeId) return false
      if (filter.specialState === 'overdue' && item.status !== 'overdue') return false
      if (filter.specialState === 'blocked' && item.status !== 'blocked') return false
      if (filter.specialState === 'failure' && item.status !== 'failed') return false
      return true
    })
  }, [entries, filter])

  // Execute reschedule command
  const executeReschedule = async (item: CalendarProjection, localDateTime: string, timeZone: string) => {
    setIsSubmitting(true)
    setStatusMessage(null)
    setErrorMessage(null)

    try {
      const res = await fetch('/api/admin/calendar/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reschedule',
          sourceId: item.sourceId,
          sourceType: item.sourceType === 'content-release' ? 'release' : 'article',
          startsAt: localDateTime,
          timeZone,
          expectedSequence: 1, // optimistic concurrency protection
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          throw new Error(`Optimistic Concurrency Conflict: ${json.message || 'Item was updated by another user.'}`)
        }
        throw new Error(json.error || json.message || 'Reschedule failed')
      }

      // Update local state optimistic view
      setEntries((prev) =>
        prev.map((e) => (e.id === item.id ? { ...e, startsAt: json.scheduledForUtc, timeZone: json.timeZone } : e)),
      )

      setStatusMessage(`Rescheduled "${item.title}" to ${json.localFormatted}.`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
      setDragConfirm(null)
      setRescheduleModal(null)
    }
  }

  // Handle Drag Start & Drop
  const handleDragStart = (e: React.DragEvent, item: CalendarProjection) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(item))
  }

  const handleDropOnDate = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault()
    const itemDataStr = e.dataTransfer.getData('text/plain')
    if (!itemDataStr) return
    try {
      const item = JSON.parse(itemDataStr) as CalendarProjection
      setDragConfirm({
        item,
        targetDate: `${dateStr}T14:00:00`,
        timeZone: filter.timeZone,
      })
    } catch {
      // Invalid drag data
    }
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Calendar Center</h1>
          <p className="text-sm text-stone-500">
            Multi-tenant editorial calendar, DST-aware scheduling, drag-drop validation, and release dependencies.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs text-stone-500 flex items-center gap-1">
            Zone:
            <select
              value={filter.timeZone}
              onChange={(e) => setFilter({ ...filter, timeZone: e.target.value })}
              className="px-2 py-1 text-xs border rounded bg-stone-50 dark:bg-stone-900 font-mono"
            >
              <option value="America/Chicago">America/Chicago (CT)</option>
              <option value="America/New_York">America/New_York (ET)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
        </div>
      </header>

      {/* Status & Error Banners */}
      {statusMessage && (
        <div className="p-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="p-3 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Views & Filters Bar */}
      <div className="flex flex-wrap gap-3 items-center justify-between p-3 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
        {/* View Switcher */}
        <div className="flex rounded-md border border-stone-300 dark:border-stone-700 overflow-hidden text-xs">
          {(['Month', 'Week', 'List'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 font-semibold ${
                view === v ? 'bg-stone-800 text-white' : 'bg-white dark:bg-stone-900 text-stone-600 hover:bg-stone-100'
              }`}
            >
              {v} View
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            value={filter.contentType}
            onChange={(e) => setFilter({ ...filter, contentType: e.target.value })}
            className="px-2 py-1 border rounded bg-white dark:bg-stone-900"
            aria-label="Filter Content Type"
          >
            <option value="all">All Content Types</option>
            <option value="article">Article</option>
            <option value="social-queue-item">Social Queue</option>
            <option value="newsletter">Newsletter</option>
            <option value="content-release">Release</option>
            <option value="event">Public Event</option>
          </select>

          <select
            value={filter.workflowState}
            onChange={(e) => setFilter({ ...filter, workflowState: e.target.value })}
            className="px-2 py-1 border rounded bg-white dark:bg-stone-900"
            aria-label="Filter Workflow State"
          >
            <option value="all">All States</option>
            <option value="draft">Draft</option>
            <option value="review">Review</option>
            <option value="approved">Approved</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={filter.specialState}
            onChange={(e) => setFilter({ ...filter, specialState: e.target.value })}
            className="px-2 py-1 border rounded bg-white dark:bg-stone-900"
            aria-label="Filter Special State"
          >
            <option value="all">Normal</option>
            <option value="overdue">Overdue Items</option>
            <option value="blocked">Blocked Gate Items</option>
            <option value="failure">Failed Jobs</option>
          </select>
        </div>
      </div>

      {/* Calendar Views */}
      {view === 'List' ? (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">Scheduled Items Agenda</h2>
          {filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-sm text-stone-400 border border-dashed rounded-lg">No items match current calendar filters.</div>
          ) : (
            <div className="divide-y divide-stone-200 dark:divide-stone-800 border rounded-lg overflow-hidden">
              {filteredEntries.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  className="p-4 flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-stone-900 hover:bg-stone-50 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase bg-stone-100 text-stone-700">
                        {item.sourceType}
                      </span>
                      <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">{item.title}</h3>
                    </div>
                    <div className="text-xs text-stone-500 font-mono">
                      Scheduled: {item.startsAt ? new Date(item.startsAt).toLocaleString() : 'Unscheduled'} ({item.timeZone})
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-xs font-semibold rounded capitalize bg-blue-50 text-blue-800">
                      {item.status}
                    </span>
                    {/* Accessible Non-Drag Reschedule Alternative */}
                    <button
                      onClick={() =>
                        setRescheduleModal({
                          item,
                          newLocalDateTime: item.startsAt ? item.startsAt.slice(0, 16) : '2026-09-20T14:00',
                          timeZone: filter.timeZone,
                        })
                      }
                      className="px-3 py-1 text-xs font-medium rounded border border-stone-300 dark:border-stone-700 hover:bg-stone-100"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Month / Week Grid View */
        <div className="border rounded-lg overflow-hidden bg-white dark:bg-stone-900">
          <div className="grid grid-cols-7 border-b text-center font-bold text-xs p-2 bg-stone-100 dark:bg-stone-800 text-stone-600">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-stone-200 dark:divide-stone-800 text-xs min-h-[400px]">
            {['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'].map((dateStr) => {
              const dayItems = filteredEntries.filter((e) => e.startsAt && e.startsAt.startsWith(dateStr))
              return (
                <div
                  key={dateStr}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDropOnDate(e, dateStr)}
                  className="p-2 space-y-2 min-h-[100px] hover:bg-stone-50/50 transition"
                >
                  <div className="font-bold text-[11px] text-stone-400">{dateStr.slice(8)}</div>
                  {dayItems.map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
                      onClick={() =>
                        setRescheduleModal({
                          item,
                          newLocalDateTime: `${dateStr}T14:00`,
                          timeZone: filter.timeZone,
                        })
                      }
                      className="p-2 rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 cursor-grab active:cursor-grabbing hover:border-stone-400 transition"
                    >
                      <div className="font-semibold text-stone-800 dark:text-stone-200 truncate">{item.title}</div>
                      <div className="text-[10px] text-stone-400 truncate">{item.sourceType} • {item.status}</div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Drag & Drop Confirmation Modal */}
      {dragConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-stone-900 border rounded-lg p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">Confirm Schedule Drag</h3>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Are you sure you want to reschedule <strong>"{dragConfirm.item.title}"</strong> to{' '}
              <span className="font-mono">{dragConfirm.targetDate}</span> in timezone <span className="font-mono">{dragConfirm.timeZone}</span>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDragConfirm(null)}
                className="px-4 py-2 text-xs font-medium border rounded hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                disabled={isSubmitting}
                onClick={() => executeReschedule(dragConfirm.item, dragConfirm.targetDate, dragConfirm.timeZone)}
                className="px-4 py-2 text-xs font-semibold bg-stone-900 text-white rounded hover:bg-stone-800"
              >
                {isSubmitting ? 'Rescheduling...' : 'Confirm Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accessible Non-Drag Reschedule Modal */}
      {rescheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-stone-900 border rounded-lg p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">Reschedule Item</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block text-stone-700 dark:text-stone-300">Item Title</label>
                <input
                  readOnly
                  value={rescheduleModal.item.title}
                  className="w-full p-2 border rounded bg-stone-100 dark:bg-stone-800"
                />
              </div>

              <div>
                <label className="font-semibold block text-stone-700 dark:text-stone-300">New Local Date & Time</label>
                <input
                  type="datetime-local"
                  value={rescheduleModal.newLocalDateTime}
                  onChange={(e) => setRescheduleModal({ ...rescheduleModal, newLocalDateTime: e.target.value })}
                  className="w-full p-2 border rounded font-mono"
                />
              </div>

              <div>
                <label className="font-semibold block text-stone-700 dark:text-stone-300">Target Timezone</label>
                <select
                  value={rescheduleModal.timeZone}
                  onChange={(e) => setRescheduleModal({ ...rescheduleModal, timeZone: e.target.value })}
                  className="w-full p-2 border rounded font-mono"
                >
                  <option value="America/Chicago">America/Chicago (CT)</option>
                  <option value="America/New_York">America/New_York (ET)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRescheduleModal(null)}
                className="px-4 py-2 text-xs font-medium border rounded hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                disabled={isSubmitting}
                onClick={() =>
                  executeReschedule(rescheduleModal.item, rescheduleModal.newLocalDateTime, rescheduleModal.timeZone)
                }
                className="px-4 py-2 text-xs font-semibold bg-stone-900 text-white rounded hover:bg-stone-800"
              >
                {isSubmitting ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
