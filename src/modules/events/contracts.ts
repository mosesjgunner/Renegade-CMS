import { canDiscoverPublic, type PublicState } from '../public/contracts'

export type EventRecurrence = {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval?: number
  count?: number
  until?: string
  /** ISO instants intentionally omitted from this series. */
  excludedStartsAt?: string[]
}

export type EventRecord = PublicState & {
  id: string
  site: string
  title: string
  slug: string
  canonicalPath: string
  startsAt: string
  endsAt?: string | null
  timeZone: string
  allDay?: boolean
  status: string
  recurrence?: EventRecurrence | null
  recurrenceOverrides?: Record<string, Partial<EventRecord>> | null
  summary?: string | null
  attendanceMode?: 'in-person' | 'virtual' | 'hybrid'
  venueName?: string | null
  venueAddress?: string | null
  onlineUrl?: string | null
  organizerName?: string | null
  organizerUrl?: string | null
  registrationUrl?: string | null
  capacity?: number | null
}

export type EventOccurrence = EventRecord & {
  occurrenceStartsAt: string
  occurrenceEndsAt?: string | null
}

export const MAX_EVENT_OCCURRENCES = 250
export const MAX_EVENT_EXPANSION_DAYS = 366

export function assertEvent(value: Partial<EventRecord>) {
  if (!value.startsAt || Number.isNaN(new Date(value.startsAt).getTime()))
    throw new Error('Event start must be a valid instant.')
  if (value.endsAt && Number.isNaN(new Date(value.endsAt).getTime()))
    throw new Error('Event end must be a valid instant.')
  if (value.endsAt && new Date(value.endsAt) < new Date(value.startsAt))
    throw new Error('Event end must follow the start.')
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value.timeZone ?? 'UTC' })
  } catch {
    throw new Error('Events require a valid IANA timezone.')
  }
  if (value.attendanceMode === 'virtual' && !value.onlineUrl)
    throw new Error('Virtual events require a meeting URL.')
  if (value.capacity != null && (!Number.isInteger(value.capacity) || value.capacity < 1))
    throw new Error('Capacity must be a positive whole number.')
  const recurrence = value.recurrence
  if (recurrence) {
    if (!['daily', 'weekly', 'monthly'].includes(recurrence.frequency))
      throw new Error('Unsupported recurrence frequency.')
    if (
      recurrence.interval != null &&
      (!Number.isInteger(recurrence.interval) ||
        recurrence.interval < 1 ||
        recurrence.interval > 52)
    )
      throw new Error('Recurrence interval must be between 1 and 52.')
    if (
      recurrence.count != null &&
      (!Number.isInteger(recurrence.count) ||
        recurrence.count < 1 ||
        recurrence.count > MAX_EVENT_OCCURRENCES)
    )
      throw new Error(`Recurrence count must be between 1 and ${MAX_EVENT_OCCURRENCES}.`)
    if (recurrence.until && Number.isNaN(new Date(recurrence.until).getTime()))
      throw new Error('Recurrence end must be a valid instant.')
  }
}

/** Adds calendar units in the named zone and resolves the resulting wall time to an instant.
 * For a DST gap the first valid later instant is selected; for an ambiguous wall time the earlier instant wins. */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>
}
function resolveWallTime(target: Record<string, number>, timeZone: string) {
  const nominal = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  )
  // Derive the likely zone offset first. This avoids formatting thousands of
  // candidates per occurrence while retaining a bounded DST ambiguity search.
  const nominalDate = new Date(nominal)
  const parts = zonedParts(nominalDate, timeZone)
  const offset =
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    nominal
  for (const adjustment of [0, -60, 60, -120, 120, -30, 30]) {
    const candidate = new Date(nominal - offset + adjustment * 60_000)
    const part = zonedParts(candidate, timeZone)
    if (Object.keys(target).every((key) => part[key] === target[key])) return candidate
  }
  throw new Error('Unable to resolve event wall time in timezone.')
}
function addOccurrence(start: Date, timeZone: string, recurrence: EventRecurrence, index: number) {
  const parts = zonedParts(start, timeZone)
  const amount = (recurrence.interval ?? 1) * index
  const wall = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  )
  if (recurrence.frequency === 'daily') wall.setUTCDate(wall.getUTCDate() + amount)
  if (recurrence.frequency === 'weekly') wall.setUTCDate(wall.getUTCDate() + amount * 7)
  if (recurrence.frequency === 'monthly') wall.setUTCMonth(wall.getUTCMonth() + amount)
  return resolveWallTime(
    {
      year: wall.getUTCFullYear(),
      month: wall.getUTCMonth() + 1,
      day: wall.getUTCDate(),
      hour: wall.getUTCHours(),
      minute: wall.getUTCMinutes(),
      second: wall.getUTCSeconds(),
    },
    timeZone,
  )
}

/** Expansion is deliberately bounded: at most 250 occurrences and a 366-day requested range. */
export function expandEvent(
  event: EventRecord,
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  assertEvent(event)
  if (
    rangeEnd < rangeStart ||
    rangeEnd.getTime() - rangeStart.getTime() > MAX_EVENT_EXPANSION_DAYS * 86_400_000
  )
    throw new Error(`Event expansion range may not exceed ${MAX_EVENT_EXPANSION_DAYS} days.`)
  const base = new Date(event.startsAt)
  const duration = event.endsAt ? new Date(event.endsAt).getTime() - base.getTime() : undefined
  const recurrence = event.recurrence
  const count = recurrence
    ? Math.min(recurrence.count ?? MAX_EVENT_OCCURRENCES, MAX_EVENT_OCCURRENCES)
    : 1
  const output: EventOccurrence[] = []
  for (let index = 0; index < count; index++) {
    const start = recurrence ? addOccurrence(base, event.timeZone, recurrence, index) : base
    if (recurrence?.until && start > new Date(recurrence.until)) break
    if (start > rangeEnd && !recurrence) break
    if (start > rangeEnd && recurrence) break
    const iso = start.toISOString()
    if (start < rangeStart || recurrence?.excludedStartsAt?.includes(iso)) continue
    const override = event.recurrenceOverrides?.[iso]
    if (override?.status === 'cancelled') continue
    output.push({
      ...event,
      ...override,
      occurrenceStartsAt: iso,
      occurrenceEndsAt:
        duration == null ? null : new Date(start.getTime() + duration).toISOString(),
    })
  }
  return output
}

export function publicEventOccurrences(
  events: readonly EventRecord[],
  rangeStart: Date,
  rangeEnd: Date,
) {
  return events
    .filter((event) => canDiscoverPublic(event) && event.status !== 'cancelled')
    .flatMap((event) => expandEvent(event, rangeStart, rangeEnd))
    .sort((a, b) => a.occurrenceStartsAt.localeCompare(b.occurrenceStartsAt))
}

const escapeIcs = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const icsDate = (value: string) => value.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
export function eventIcs(event: EventOccurrence, url: string) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Renegade CMS//Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(`${event.id}-${event.occurrenceStartsAt}`)}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.occurrenceStartsAt)}`,
  ]
  if (event.occurrenceEndsAt) lines.push(`DTEND:${icsDate(event.occurrenceEndsAt)}`)
  lines.push(
    `SUMMARY:${escapeIcs(event.title)}`,
    `URL:${escapeIcs(url)}`,
    `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
  )
  if (event.summary) lines.push(`DESCRIPTION:${escapeIcs(event.summary)}`)
  if (event.venueName)
    lines.push(
      `LOCATION:${escapeIcs([event.venueName, event.venueAddress].filter(Boolean).join(', '))}`,
    )
  if (event.organizerName)
    lines.push(
      `ORGANIZER;CN=${escapeIcs(event.organizerName)}:${escapeIcs(event.organizerUrl ?? '')}`,
    )
  lines.push('END:VEVENT', 'END:VCALENDAR', '')
  return lines.join('\r\n')
}
