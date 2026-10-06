import { describe, expect, it } from 'vitest'
import {
  assertEvent,
  eventIcs,
  expandEvent,
  publicEventOccurrences,
  type EventRecord,
  eventsIcs,
} from '../../src/modules/events/contracts'

const event = (overrides: Partial<EventRecord> = {}): EventRecord => ({
  id: 'event-a',
  site: 'site-a',
  title: 'DST class',
  slug: 'dst-class',
  canonicalPath: '/events/dst-class',
  startsAt: '2026-03-01T15:00:00.000Z',
  endsAt: '2026-03-01T16:00:00.000Z',
  timeZone: 'America/Chicago',
  status: 'published',
  visibility: 'public',
  removeFromDiscovery: false,
  recurrence: { frequency: 'weekly', count: 3 },
  ...overrides,
})

describe('event workflow contracts', () => {
  it('preserves local wall time over the DST boundary and produces portable ICS', () => {
    const occurrences = expandEvent(
      event(),
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-31T00:00:00Z'),
    )
    expect(occurrences.map((item) => item.occurrenceStartsAt)).toEqual([
      '2026-03-01T15:00:00.000Z',
      '2026-03-08T14:00:00.000Z',
      '2026-03-15T14:00:00.000Z',
    ])
    expect(eventIcs(occurrences[1]!, 'https://example.test/events/dst-class')).toContain(
      'DTSTART:20260308T140000Z',
    )
  })
  it('bounds recurrence, supports edit-one cancellation, and excludes drafts and other tenants', () => {
    const recurring = event({
      recurrence: { frequency: 'daily', count: 250 },
      recurrenceOverrides: { '2026-03-02T15:00:00.000Z': { status: 'cancelled' } },
    })
    expect(() => expandEvent(recurring, new Date('2026-01-01'), new Date('2028-01-01'))).toThrow(
      '366',
    )
    const occurrences = publicEventOccurrences(
      [recurring, event({ id: 'draft', status: 'draft' })],
      new Date('2026-03-01'),
      new Date('2026-03-10'),
    )
    expect(occurrences).toHaveLength(8)
    expect(occurrences.every((item) => item.id === 'event-a')).toBe(true)
  })
  it('rejects malformed dates, invalid zones, and incomplete online events', () => {
    expect(() => assertEvent(event({ startsAt: 'never' }))).toThrow('valid instant')
    expect(() => assertEvent(event({ timeZone: 'Mars/Olympus' }))).toThrow('IANA')
    expect(() => assertEvent(event({ attendanceMode: 'virtual', onlineUrl: null }))).toThrow(
      'meeting URL',
    )
  })
  it('resolves nonexistent spring time and chooses the earlier fall overlap', () => {
    const spring = expandEvent(
      event({ startsAt: '2026-03-01T08:30:00Z', recurrence: { frequency: 'weekly', count: 2 } }),
      new Date('2026-03-01'),
      new Date('2026-03-10'),
    )
    expect(spring[1].occurrenceStartsAt).toBe('2026-03-08T08:00:00.000Z')
    const fall = expandEvent(
      event({
        startsAt: '2026-10-25T06:30:00Z',
        endsAt: null,
        recurrence: { frequency: 'weekly', count: 2 },
      }),
      new Date('2026-10-25'),
      new Date('2026-11-03'),
    )
    expect(fall[1].occurrenceStartsAt).toBe('2026-11-01T06:30:00.000Z')
  })
  it('folds multibyte text and prevents newline injection while composing multiple events', () => {
    const occurrence = expandEvent(
      event({ title: 'Ã©'.repeat(100) + '\rBEGIN:VALARM\nInjected', recurrence: null }),
      new Date('2026-03-01'),
      new Date('2026-03-02'),
    )[0]
    const feed = eventsIcs([occurrence, { ...occurrence, id: 'second' }], 'https://example.test')
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(feed.match(/BEGIN:VCALENDAR/g)).toHaveLength(1)
    expect(feed).not.toContain('\rBEGIN:VALARM')
    expect(feed.split('\r\n').every((line) => Buffer.byteLength(line) <= 75)).toBe(true)
    expect(feed.replace(/\r\n /g, '')).toContain(
      'SUMMARY:' + 'Ã©'.repeat(100) + '\\nBEGIN:VALARM\\nInjected',
    )
  })
  it('excludes private overrides from public occurrence projections', () => {
    expect(
      publicEventOccurrences(
        [
          event({
            recurrence: null,
            recurrenceOverrides: { '2026-03-01T15:00:00.000Z': { visibility: 'private' } },
          }),
        ],
        new Date('2026-03-01'),
        new Date('2026-03-02'),
      ),
    ).toEqual([])
  })
  it('preserves series ownership and uses edited occurrence times inside the requested range', () => {
    const rows = expandEvent(
      event({
        recurrence: null,
        recurrenceOverrides: {
          '2026-03-01T15:00:00.000Z': {
            site: 'foreign',
            id: 'foreign',
            startsAt: '2026-03-03T16:00:00Z',
            endsAt: '2026-03-03T17:00:00Z',
          },
        },
      }),
      new Date('2026-03-03'),
      new Date('2026-03-04'),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('event-a')
    expect(rows[0].site).not.toBe('foreign')
    expect(rows[0].occurrenceStartsAt).toBe('2026-03-03T16:00:00.000Z')
  })
  it('skips nonexistent month days without consuming recurrence count and emits all-day local DATE values', () => {
    const rows = expandEvent(
      event({
        startsAt: '2026-01-31T15:00:00.000Z',
        endsAt: null,
        recurrence: { frequency: 'monthly', count: 3 },
      }),
      new Date('2026-01-01'),
      new Date('2026-06-01'),
    )
    expect(rows.map((row) => row.occurrenceStartsAt.slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ])
    const allDay = expandEvent(
      event({
        allDay: true,
        startsAt: '2026-03-01T06:00:00.000Z',
        endsAt: '2026-03-02T06:00:00.000Z',
        recurrence: null,
      }),
      new Date('2026-03-01'),
      new Date('2026-03-03'),
    )[0]!
    expect(eventIcs(allDay, 'https://example.test')).toContain('DTSTART;VALUE=DATE:20260301')
    expect(eventIcs(allDay, 'https://example.test')).toContain('DTEND;VALUE=DATE:20260302')
  })
})
