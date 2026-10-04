import { NextResponse } from 'next/server'
/**
 * Generates an iCalendar (RFC 5545 .ics) feed string from a list of scheduled entries.
 */
export function generateICalendarFeed(
  entries: Array<{
    id: string
    title: string
    startsAt: string
    endsAt?: string | null
    timeZone: string
    description?: string | null
    url?: string | null
  }>,
): string {
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

    const formatDateUtc = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '')
    const dtStart = formatDateUtc(startDate)
    const endDate = entry.endsAt
      ? new Date(entry.endsAt)
      : new Date(startDate.getTime() + 3600 * 1000)
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

export async function GET() {
  return NextResponse.json(
    { error: 'Interactive calendar feeds are deferred for RC.' },
    { status: 410 },
  )
}
