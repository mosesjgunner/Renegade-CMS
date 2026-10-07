import Link from 'next/link'
import { findPublicEvents } from '@/modules/events/public'
import type { EventOccurrence } from '@/modules/events/contracts'
import { CalendarCenter } from '@/modules/admin/CalendarCenter'
import type { CalendarProjection } from '@/modules/calendar/contracts'

const initialEntries: CalendarProjection[] = [
  {
    id: 'release:example-1',
    sourceType: 'content-release',
    sourceId: 'rel-001',
    siteId: 'site-alpha',
    publicationId: 'pub-daily',
    title: 'Release: Autumn Feature Series',
    startsAt: '2026-09-21T14:00:00.000Z',
    timeZone: 'America/Chicago',
    status: 'scheduled',
    editHref: '/admin/collections/content-releases/rel-001',
  },
  {
    id: 'article:example-2',
    sourceType: 'content',
    sourceId: 'art-002',
    siteId: 'site-alpha',
    publicationId: 'pub-daily',
    title: 'Editorial: The Future of Independent Media',
    startsAt: '2026-09-22T15:30:00.000Z',
    timeZone: 'America/Chicago',
    status: 'approved',
    editHref: '/admin/collections/article-family-content/art-002',
  },
  {
    id: 'social:example-3',
    sourceType: 'social-queue-item',
    sourceId: 'soc-003',
    siteId: 'site-alpha',
    publicationId: 'pub-daily',
    title: 'Social: Community Announcement',
    startsAt: '2026-09-23T16:00:00.000Z',
    timeZone: 'America/Chicago',
    status: 'scheduled',
    editHref: '/social-studio',
  },
  {
    id: 'event:example-4',
    sourceType: 'event',
    sourceId: 'evt-004',
    siteId: 'site-alpha',
    title: 'Public Townhall Livestream',
    startsAt: '2026-09-24T18:00:00.000Z',
    timeZone: 'America/Chicago',
    status: 'published',
    editHref: '/admin/collections/events/evt-004',
  },
]

export const dynamic = 'force-dynamic'
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const query = await searchParams
  if (!query.month) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="flex justify-between items-center pb-2 border-b border-stone-200 dark:border-stone-800">
          <span className="text-xs text-stone-500">Renegade CMoS Workflow Pass FLOW-03</span>
          <div className="flex gap-2">
            <Link
              href="/api/calendar/export?format=ics"
              className="px-3 py-1 text-xs font-medium rounded border border-stone-300 hover:bg-stone-100"
            >
              Export iCal (.ics)
            </Link>
            <Link
              href="/api/calendar/export?format=json"
              className="px-3 py-1 text-xs font-medium rounded border border-stone-300 hover:bg-stone-100"
            >
              JSON Feed
            </Link>
          </div>
        </div>

        <CalendarCenter initialEntries={initialEntries} />
      </main>
    )
  }

  const month = query.month
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return (
      <main>
        <h1>Event calendar</h1>
        <p role="alert">Use a valid year and month.</p>
      </main>
    )
  const from = new Date(`${month}-01T00:00:00Z`)
  const to = new Date(from)
  to.setUTCMonth(to.getUTCMonth() + 1)
  const occurrences: EventOccurrence[] = []
  {
    const result = await findPublicEvents({
      from: new Date(from.getTime() - 86_400_000),
      to: new Date(to.getTime() + 86_400_000),
      all: true,
      pageSize: 100,
      publicFeed: true,
    })
    occurrences.push(...result.occurrences)
  }
  const dayOf = (instant: string, timeZone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(instant))
  const previous = new Date(from)
  previous.setUTCMonth(previous.getUTCMonth() - 1)
  const next = new Date(to)
  const days = new Date(to.getTime() - 1).getUTCDate()
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <h1>Event calendar</h1>
      <p>
        Published public events, placed on their local calendar date. Each time shows the event's
        time zone.
      </p>
      <form>
        <label>
          Month <input type="month" name="month" defaultValue={month} />
        </label>{' '}
        <button>Show month</button>
      </form>
      <nav aria-label="Calendar months">
        <Link href={`/calendar?month=${previous.toISOString().slice(0, 7)}`}>Previous month</Link> ?{' '}
        <Link href={`/calendar?month=${next.toISOString().slice(0, 7)}`}>Next month</Link> ?{' '}
        <Link href="/events">Event list</Link> ? <a href="/events/feed.ics">Subscribe with ICS</a>
      </nav>
      <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7" aria-label={month}>
        {Array.from({ length: days }, (_, index) => {
          const day = `${month}-${String(index + 1).padStart(2, '0')}`
          const events = occurrences.filter(
            (event) => dayOf(event.occurrenceStartsAt, event.timeZone) === day,
          )
          return (
            <li key={day} className="rounded border p-3">
              <h2>
                <time dateTime={day}>{index + 1}</time>
              </h2>
              <ul>
                {events.map((event) => (
                  <li key={`${event.id}-${event.occurrenceStartsAt}`}>
                    <Link href={event.canonicalPath}>{event.title}</Link>
                    <br />
                    <time dateTime={event.occurrenceStartsAt}>
                      {new Intl.DateTimeFormat('en-US', {
                        timeZone: event.timeZone,
                        timeStyle: 'short',
                      }).format(new Date(event.occurrenceStartsAt))}
                    </time>{' '}
                    ({event.timeZone})
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ol>
      {!occurrences.some((event) =>
        dayOf(event.occurrenceStartsAt, event.timeZone).startsWith(month),
      ) ? (
        <p>No public events this month.</p>
      ) : null}
    </main>
  )
}
