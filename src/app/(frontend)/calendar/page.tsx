'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { calendarConflicts, type CalendarProjection } from '@/modules/calendar/contracts'

const entries: CalendarProjection[] = [
  {
    id: 'release:example',
    sourceType: 'content-release',
    sourceId: 'example',
    siteId: 'demo',
    publicationId: 'daily',
    title: 'Article release: Owning your audience',
    startsAt: '2026-08-26T15:00:00Z',
    timeZone: 'America/Chicago',
    status: 'scheduled',
    editHref: '/admin/collections/content-releases/example',
  },
  {
    id: 'social:example',
    sourceType: 'social-queue-item',
    sourceId: 'example',
    siteId: 'demo',
    publicationId: 'daily',
    title: 'Social: launch thread',
    startsAt: '2026-08-26T16:00:00Z',
    timeZone: 'America/Chicago',
    status: 'scheduled',
    editHref: '/social-studio',
  },
  {
    id: 'newsletter:example',
    sourceType: 'newsletter',
    sourceId: 'example',
    siteId: 'demo',
    publicationId: 'daily',
    title: 'Newsletter: Tuesday dispatch',
    startsAt: '2026-08-27T14:00:00Z',
    timeZone: 'America/Chicago',
    status: 'scheduled',
    editHref: '/admin',
  },
  {
    id: 'event:example',
    sourceType: 'event',
    sourceId: 'example',
    siteId: 'demo',
    title: 'Community open house',
    startsAt: '2026-08-28T23:00:00Z',
    timeZone: 'America/Chicago',
    status: 'scheduled',
    editHref: '/admin/collections/events',
  },
]
export default function CalendarPage() {
  const [view, setView] = useState<'Month' | 'Week' | 'Agenda'>('Month')
  const [mine, setMine] = useState(false)
  const [message, setMessage] = useState(
    'Drag a scheduled item to reschedule its canonical source.',
  )
  const conflicts = useMemo(() => calendarConflicts(entries), [])
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <header className="flex flex-wrap gap-4 justify-between border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold font-display">Calendar Center</h1>
          <p className="text-sm text-stone-600">
            A scoped orchestration view of canonical schedules.
          </p>
        </div>
        <Link className="btn btn-secondary" href="/social-studio">
          Social Studio
        </Link>
      </header>
      <section className="surface-card p-4 flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-stone-200 overflow-hidden">
          {(['Month', 'Week', 'Agenda'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setView(item)}
              className={`px-4 py-2 text-sm ${view === item ? 'bg-red-700 text-white' : ''}`}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="text-sm">
          <input
            type="checkbox"
            checked={mine}
            onChange={(event) => setMine(event.target.checked)}
          />{' '}
          My calendar
        </label>
        <select className="form-select max-w-48 text-sm" aria-label="Timezone">
          <option>America/Chicago</option>
          <option>UTC</option>
        </select>
        <span className="text-xs text-stone-500">
          Site / Publication / Space filters respect access permissions.
        </span>
      </section>
      <p role="status" className="text-sm bg-blue-50 border border-blue-200 rounded-lg p-3">
        {message}
      </p>
      <section className="grid md:grid-cols-2 xl:grid-cols-4 gap-4" aria-label={`${view} calendar`}>
        {entries
          .filter((entry) => !mine || entry.ownerId === 'me')
          .map((entry) => (
            <article
              key={entry.id}
              draggable
              onDragEnd={() =>
                setMessage(
                  `Optimistic move queued for ${entry.title}; server confirmation will restore this card on error.`,
                )
              }
              className="surface-card p-4 space-y-2 cursor-grab"
            >
              <div className="flex justify-between gap-2">
                <span className="badge badge-brand">{entry.sourceType}</span>
                <span className="text-xs">{entry.status}</span>
              </div>
              <h2 className="font-bold">{entry.title}</h2>
              <p className="text-xs font-mono">
                {entry.startsAt
                  ? new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: entry.timeZone,
                    }).format(new Date(entry.startsAt))
                  : 'Unscheduled'}{' '}
                · {entry.timeZone}
              </p>
              <Link href={entry.editHref} className="text-sm text-red-700 underline">
                Edit canonical source
              </Link>
            </article>
          ))}
      </section>
      <section className="surface-card p-4">
        <h2 className="font-bold">Unscheduled queue & conflicts</h2>
        <p className="text-sm text-stone-600">
          Unscheduled source records appear here; conflicts are calculated per instant and timezone
          ({Object.values(conflicts).filter((group) => group.length > 1).length} current conflicts).
        </p>
      </section>
    </main>
  )
}
