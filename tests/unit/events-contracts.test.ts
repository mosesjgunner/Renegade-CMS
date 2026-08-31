import { describe, expect, it } from 'vitest'
import { assertEvent, eventIcs, expandEvent, publicEventOccurrences, type EventRecord } from '../../src/modules/events/contracts'

const event = (overrides: Partial<EventRecord> = {}): EventRecord => ({
  id: 'event-a', site: 'site-a', title: 'DST class', slug: 'dst-class', canonicalPath: '/events/dst-class', startsAt: '2026-03-01T15:00:00.000Z', endsAt: '2026-03-01T16:00:00.000Z', timeZone: 'America/Chicago', status: 'published', visibility: 'public', removeFromDiscovery: false,
  recurrence: { frequency: 'weekly', count: 3 }, ...overrides,
})

describe('event workflow contracts', () => {
  it('preserves local wall time over the DST boundary and produces portable ICS', () => {
    const occurrences = expandEvent(event(), new Date('2026-03-01T00:00:00Z'), new Date('2026-03-31T00:00:00Z'))
    expect(occurrences.map((item) => item.occurrenceStartsAt)).toEqual(['2026-03-01T15:00:00.000Z', '2026-03-08T14:00:00.000Z', '2026-03-15T14:00:00.000Z'])
    expect(eventIcs(occurrences[1]!, 'https://example.test/events/dst-class')).toContain('DTSTART:20260308T140000Z')
  })
  it('bounds recurrence, supports edit-one cancellation, and excludes drafts and other tenants', () => {
    const recurring = event({ recurrence: { frequency: 'daily', count: 250 }, recurrenceOverrides: { '2026-03-02T15:00:00.000Z': { status: 'cancelled' } } })
    expect(() => expandEvent(recurring, new Date('2026-01-01'), new Date('2028-01-01'))).toThrow('366')
    const occurrences = publicEventOccurrences([recurring, event({ id: 'draft', status: 'draft' })], new Date('2026-03-01'), new Date('2026-03-10'))
    expect(occurrences).toHaveLength(8)
    expect(occurrences.every((item) => item.id === 'event-a')).toBe(true)
  })
  it('rejects malformed dates, invalid zones, and incomplete online events', () => {
    expect(() => assertEvent(event({ startsAt: 'never' }))).toThrow('valid instant')
    expect(() => assertEvent(event({ timeZone: 'Mars/Olympus' }))).toThrow('IANA')
    expect(() => assertEvent(event({ attendanceMode: 'virtual', onlineUrl: null }))).toThrow('meeting URL')
  })
})
