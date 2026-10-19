import config from '@payload-config'
import { getPayload } from 'payload'
import { isRegisteredCollection } from '@/modules/public/registered-collections'
import { findPublicEvents } from '@/modules/events/public'
import { eventsIcs } from '@/modules/events/contracts'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  if (!isRegisteredCollection(payload, 'events')) return new Response('Not found', { status: 404 })
  const now = new Date()
  const { occurrences } = await findPublicEvents({
    from: now,
    to: new Date(now.getTime() + 366 * 86_400_000),
    publicFeed: true,
    all: true,
  })
  return new Response(eventsIcs(occurrences, new URL(request.url).origin), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="events.ics"',
      'Cache-Control': 'private, no-store',
    },
  })
}
