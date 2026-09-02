import { findPublicEvents } from '@/modules/events/public'
import { eventIcs } from '@/modules/events/contracts'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const now = new Date()
  const result = await findPublicEvents({
    from: now,
    to: new Date(now.getTime() + 366 * 86_400_000),
    pageSize: 100,
  })
  const origin = new URL(request.url).origin
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Renegade CMS//Events Feed//EN',
    ...result.occurrences.flatMap((event) =>
      eventIcs(event, `${origin}${event.canonicalPath}`).split('\r\n').slice(4, -2),
    ),
    'END:VCALENDAR',
    '',
  ].join('\r\n')
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="events.ics"',
    },
  })
}
