import { findPublicEvent } from '@/modules/events/public'
import { eventIcs, expandEvent } from '@/modules/events/contracts'
export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const event = await findPublicEvent((await params).slug)
  if (!event || event.status === 'cancelled') return new Response('Not found', { status: 404 })
  const occurrence = expandEvent(
    event,
    new Date(event.startsAt),
    new Date(new Date(event.startsAt).getTime() + 366 * 86_400_000),
  )[0]
  if (!occurrence) return new Response('Not found', { status: 404 })
  return new Response(
    eventIcs(occurrence, `${new URL(request.url).origin}${event.canonicalPath}`),
    { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } },
  )
}
