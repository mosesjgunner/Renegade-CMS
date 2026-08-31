import Link from 'next/link'
import { findPublicEvents } from '@/modules/events/public'

export const dynamic = 'force-dynamic'
const date = (value: string, timeZone: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; category?: string; page?: string }> }) {
  const query = await searchParams; const from = query.from ? new Date(query.from) : new Date(); const to = query.to ? new Date(query.to) : new Date(from.getTime() + 90 * 86_400_000)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from || to.getTime() - from.getTime() > 366 * 86_400_000) return <main className="mx-auto max-w-4xl p-8"><h1>Events</h1><p role="alert">Use valid dates within a one-year range.</p></main>
  const result = await findPublicEvents({ from, to, category: query.category, page: Number(query.page) || 1 })
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-12"><header><h1>Events</h1><p>Upcoming public events in their local time zones.</p></header><form><label>From <input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} /></label> <label>To <input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} /></label> <button>Filter</button></form><a href="/events/feed.ics">Subscribe with ICS</a><ol>{result.occurrences.map((event) => <li key={`${event.id}-${event.occurrenceStartsAt}`}><article><time dateTime={event.occurrenceStartsAt}>{date(event.occurrenceStartsAt, event.timeZone)} ({event.timeZone})</time><h2><Link href={event.canonicalPath}>{event.title}</Link></h2>{event.summary ? <p>{event.summary}</p> : null}</article></li>)}</ol>{!result.total ? <p>No public events in this range.</p> : null}{result.pageCount > 1 ? <nav aria-label="Event pagination">{Array.from({ length: result.pageCount }, (_, index) => <Link key={index} href={`/events?page=${index + 1}`}>{index + 1}</Link>)}</nav> : null}</main>
}
