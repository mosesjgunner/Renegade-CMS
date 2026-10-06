import Link from 'next/link'
import { findPublicEvents } from '@/modules/events/public'
import type { EventOccurrence } from '@/modules/events/contracts'

export const dynamic = 'force-dynamic'
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const query = await searchParams
  const month = query.month ?? new Date().toISOString().slice(0, 7)
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
