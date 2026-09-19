import { NextResponse, type NextRequest } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

type Doc = Record<string, any>

const idOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String(value.id)
  return String(value ?? '')
}

/**
 * Generates an iCalendar (RFC 5545 .ics) feed string from a list of scheduled entries.
 */
export function generateICalendarFeed(entries: Array<{
  id: string
  title: string
  startsAt: string
  endsAt?: string | null
  timeZone: string
  description?: string | null
  url?: string | null
}>): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Renegade CMoS//Calendar Center//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const entry of entries) {
    const startDate = new Date(entry.startsAt)
    if (Number.isNaN(startDate.getTime())) continue

    const formatDateUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const dtStart = formatDateUtc(startDate)
    const endDate = entry.endsAt ? new Date(entry.endsAt) : new Date(startDate.getTime() + 3600 * 1000)
    const dtEnd = formatDateUtc(endDate)

    lines.push(
      'BEGIN:VEVENT',
      `UID:${entry.id}@renegade-cmos`,
      `DTSTAMP:${formatDateUtc(new Date())}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${(entry.title || 'Untitled Event').replace(/\n/g, ' ')}`,
    )
    if (entry.description) {
      lines.push(`DESCRIPTION:${entry.description.replace(/\n/g, '\\n')}`)
    }
    if (entry.url) {
      lines.push(`URL:${entry.url}`)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config: configPromise })
    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') ?? 'ics'
    const siteId = searchParams.get('siteId')
    const authHeader = req.headers.get('authorization')
    const isStaff = Boolean(authHeader && authHeader.includes('Bearer'))

    // Query events / scheduled content
    const eventsResult = (await payload.find({
      collection: 'events',
      where: isStaff ? undefined : { status: { equals: 'published' } },
      limit: 100,
      overrideAccess: true,
    } as never)) as { docs: Doc[] }

    const releasesResult = (await payload.find({
      collection: 'content-releases',
      limit: 50,
      overrideAccess: true,
    } as never)) as { docs: Doc[] }

    const calendarItems = [
      ...eventsResult.docs.map((e) => ({
        id: `event-${e.id}`,
        title: String(e.title ?? 'Event'),
        startsAt: String(e.startsAt ?? new Date().toISOString()),
        endsAt: e.endsAt ? String(e.endsAt) : null,
        timeZone: String(e.timeZone ?? 'UTC'),
        description: e.summary ? String(e.summary) : null,
        url: e.canonicalPath ? String(e.canonicalPath) : null,
        type: 'event',
        status: String(e.status ?? 'published'),
      })),
      ...releasesResult.docs
        .filter((r) => r.scheduledFor)
        .map((r) => ({
          id: `release-${r.id}`,
          title: String(r.title ?? 'Release'),
          startsAt: String(r.scheduledFor),
          endsAt: null,
          timeZone: String(r.timeZone ?? 'UTC'),
          description: `Scheduled Content Release (${r.status})`,
          url: `/admin/collections/content-releases/${r.id}`,
          type: 'release',
          status: String(r.status ?? 'scheduled'),
        })),
    ]

    if (format === 'json') {
      return NextResponse.json({
        siteId,
        isStaff,
        itemCount: calendarItems.length,
        items: calendarItems,
      })
    }

    const icsContent = generateICalendarFeed(calendarItems)

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="renegade-calendar.ics"',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
