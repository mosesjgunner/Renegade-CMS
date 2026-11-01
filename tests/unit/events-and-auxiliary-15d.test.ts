import { describe, expect, it } from 'vitest'

import {
  assertEvent,
  eventIcs,
  eventsIcs,
  expandEvent,
  foldIcsLine,
  publicEventOccurrences,
  type EventRecord,
} from '../../src/modules/events/contracts'
import { eventSchemaNodes } from '../../src/modules/events/schema'
import {
  canIgnore,
  canWaive,
  qualityDedupeKey,
  scanLocal,
  documentInternalLinks,
} from '../../src/modules/quality/contracts'
import { canDiscoverPublic, canRenderPublic } from '../../src/modules/public/contracts'

const makeEvent = (overrides: Partial<EventRecord> = {}): EventRecord => ({
  id: 'event-15d',
  site: 'site-alpha-15d',
  title: 'Annual Open Summit',
  slug: 'annual-open-summit',
  canonicalPath: '/events/annual-open-summit',
  startsAt: '2027-04-15T18:00:00.000Z',
  endsAt: '2027-04-15T21:00:00.000Z',
  timeZone: 'America/New_York',
  status: 'published',
  visibility: 'public',
  summary: 'Annual open community summit featuring core milestones.',
  venueName: 'Metropolitan Hall',
  venueAddress: '123 Main St, New York, NY',
  attendanceMode: 'hybrid',
  onlineUrl: 'https://stream.example.test/live',
  organizerName: 'Renegade Foundation',
  organizerUrl: 'https://foundation.example.test',
  ...overrides,
})

describe('15D Events, Calendars & ICS Contracts', () => {
  it('validates event structure, rejects malformed dates and invalid IANA timezones', () => {
    expect(() => assertEvent(makeEvent())).not.toThrow()
    expect(() => assertEvent(makeEvent({ startsAt: 'invalid-date' }))).toThrow('valid instant')
    expect(() => assertEvent(makeEvent({ timeZone: 'Fantasy/Atlantis' }))).toThrow('IANA timezone')
    expect(() =>
      assertEvent(makeEvent({ startsAt: '2027-04-15T20:00:00Z', endsAt: '2027-04-15T19:00:00Z' })),
    ).toThrow('must follow the start')
    expect(() => assertEvent(makeEvent({ attendanceMode: 'virtual', onlineUrl: null }))).toThrow(
      'meeting URL',
    )
  })

  it('preserves wall clock time across Daylight Saving Time transitions', () => {
    // 2027 US Spring Forward is March 14, 2027
    const weeklyEvent = makeEvent({
      startsAt: '2027-03-07T15:00:00.000Z', // 10:00 AM EST (UTC-5)
      endsAt: '2027-03-07T16:00:00.000Z',
      timeZone: 'America/New_York',
      recurrence: { frequency: 'weekly', count: 3 },
    })
    const occurrences = expandEvent(
      weeklyEvent,
      new Date('2027-03-01T00:00:00Z'),
      new Date('2027-03-31T00:00:00Z'),
    )
    expect(occurrences).toHaveLength(3)
    // First: 15:00 UTC (10:00 AM EST)
    expect(occurrences[0]?.occurrenceStartsAt).toBe('2027-03-07T15:00:00.000Z')
    // Second: 14:00 UTC (10:00 AM EDT - shifted UTC by 1 hour to preserve 10:00 AM local wall time)
    expect(occurrences[1]?.occurrenceStartsAt).toBe('2027-03-14T14:00:00.000Z')
    // Third: 14:00 UTC (10:00 AM EDT)
    expect(occurrences[2]?.occurrenceStartsAt).toBe('2027-03-21T14:00:00.000Z')
  })

  it('generates standard RFC 5545 ICS calendar feeds with 75-octet line folding', () => {
    const single = makeEvent()
    const occurrences = expandEvent(
      single,
      new Date('2027-04-01T00:00:00Z'),
      new Date('2027-04-30T00:00:00Z'),
    )
    const ics = eventIcs(occurrences[0]!, 'https://example.test/events/annual-open-summit')

    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('PRODID:-//Renegade CMS//Events//EN')
    expect(ics).toContain('SUMMARY:Annual Open Summit')
    expect(ics).toContain('DESCRIPTION:Annual open community summit featuring core milestones.')
    expect(ics).toContain('LOCATION:Metropolitan Hall\\, 123 Main St\\, New York\\, NY')
    expect(ics).toContain('ORGANIZER;CN="Renegade Foundation":https://foundation.example.test')
    expect(ics).toContain('DTSTART:20270415T180000Z')
    expect(ics).toContain('DTEND:20270415T210000Z')
    expect(ics).toContain('STATUS:CONFIRMED')
    expect(ics).toContain('END:VCALENDAR')

    // Test multi-event feed serialization
    const multiIcs = eventsIcs(occurrences, 'https://example.test')
    expect(multiIcs).toContain('PRODID:-//Renegade CMS//Events Feed//EN')
    expect(multiIcs).toContain('BEGIN:VEVENT')
    expect(multiIcs).toContain('END:VEVENT')

    // Test RFC 5545 line folding
    const longLine = 'DESCRIPTION:' + 'A'.repeat(120)
    const folded = foldIcsLine(longLine)
    const lines = folded.split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(Buffer.byteLength(lines[0]!, 'utf8')).toBeLessThanOrEqual(75)
    expect(lines[1]!.startsWith(' ')).toBe(true)
  })

  it('excludes drafts, cancelled, and future scheduled events from public discoverability', () => {
    const published = makeEvent({ status: 'published' })
    const draft = makeEvent({ id: 'draft-ev', status: 'draft' })
    const cancelled = makeEvent({ id: 'canc-ev', status: 'cancelled' })
    const scheduledFuture = makeEvent({
      id: 'sched-ev',
      status: 'scheduled',
      publishedAt: '2099-01-01T00:00:00.000Z',
    })
    const unlisted = makeEvent({ id: 'unlist-ev', visibility: 'unlisted' })

    expect(canRenderPublic(published)).toBe(true)
    expect(canDiscoverPublic(published)).toBe(true)

    expect(canRenderPublic(draft)).toBe(false)
    expect(canDiscoverPublic(draft)).toBe(false)

    expect(canRenderPublic(cancelled)).toBe(false)
    expect(canDiscoverPublic(cancelled)).toBe(false)

    expect(canRenderPublic(scheduledFuture)).toBe(false)
    expect(canDiscoverPublic(scheduledFuture)).toBe(false)

    // Unlisted visibility restricts general public discovery lists
    expect(canDiscoverPublic(unlisted)).toBe(false)

    const occurrences = publicEventOccurrences(
      [published, draft, cancelled, scheduledFuture, unlisted],
      new Date('2027-04-01T00:00:00Z'),
      new Date('2027-04-30T00:00:00Z'),
    )
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]?.id).toBe('event-15d')
  })

  it('emits Schema.org Event JSON-LD nodes for search crawlers', () => {
    const canonical = 'https://example.test/events/annual-open-summit'
    const nodes = eventSchemaNodes(canonical, makeEvent())
    expect(nodes).toHaveLength(1)
    const node = nodes[0] as any
    expect(node['@type']).toBe('Event')
    expect(node['@id']).toBe(`${canonical}#event`)
    expect(node.name).toBe('Annual Open Summit')
    expect(node.startDate).toBe('2027-04-15T18:00:00.000Z')
    expect(node.endDate).toBe('2027-04-15T21:00:00.000Z')
    expect(node.eventAttendanceMode).toBe('https://schema.org/MixedEventAttendanceMode')
    expect(node.eventStatus).toBe('https://schema.org/EventScheduled')
    expect(node.location).toEqual({
      '@type': 'Place',
      name: 'Metropolitan Hall',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '123 Main St, New York, NY',
        addressLocality: undefined,
      },
    })
    expect(node.organizer).toEqual({
      '@type': 'Organization',
      name: 'Renegade Foundation',
      url: 'https://foundation.example.test',
    })
  })
})

describe('15D Quality Scanning & Citations Contracts', () => {
  it('extracts internal links from document ASTs for broken link analysis', () => {
    const doc = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'link', fields: { url: '/articles/architecture' } },
              { type: 'link', fields: { url: 'https://external.example.test' } },
              { type: 'link', fields: { url: '/events/annual-open-summit' } },
            ],
          },
        ],
      },
    }
    const links = documentInternalLinks(doc)
    expect(links).toEqual(['/articles/architecture', '/events/annual-open-summit'])
  })

  it('scans local content for quality violations and generates site-scoped deduplication keys', () => {
    const findings = scanLocal({
      targetId: 'doc-alpha',
      title: 'Valid Document Title',
      description: '', // Missing meta description -> trigger warning
      canonicalUrl: 'https://example.test/articles/valid-title',
      headings: [1, 3], // Skips h2 -> heading hierarchy violation
      images: [{ id: 'img-1', altText: '' }], // Missing alt text
      internalLinks: [{ href: '/missing-target', exists: false, visible: false }],
      translationStatus: 'current',
    })

    const ruleKeys = findings.map((f) => f.rule)
    expect(ruleKeys).toContain('metadata-description')
    expect(ruleKeys).toContain('heading-hierarchy')
    expect(ruleKeys).toContain('media-alt-text')
    expect(ruleKeys).toContain('internal-link')

    const keyAlpha = qualityDedupeKey({
      siteId: 'site-alpha-15d',
      rule: 'heading-hierarchy',
      targetId: 'doc-alpha',
    })
    const keyBeta = qualityDedupeKey({
      siteId: 'site-beta-15d',
      rule: 'heading-hierarchy',
      targetId: 'doc-alpha',
    })
    expect(keyAlpha).not.toBe(keyBeta)
  })

  it('enforces waiver policies: non-blocking warnings can be waived by authorized roles', () => {
    expect(canIgnore({ actorRole: 'owner', severity: 'warning' })).toBe(true)
    expect(canIgnore({ actorRole: 'staff', severity: 'warning' })).toBe(false)
    expect(canIgnore({ actorRole: 'owner', severity: 'publication_blocking' })).toBe(false)

    expect(canWaive({ actorRole: 'owner', severity: 'warning', category: 'editorial' })).toBe(true)
    expect(
      canWaive({ actorRole: 'owner', severity: 'publication_blocking', category: 'editorial' }),
    ).toBe(false)
    expect(canWaive({ actorRole: 'owner', severity: 'warning', category: 'security' })).toBe(false)
    expect(canWaive({ actorRole: 'staff', severity: 'warning', category: 'editorial' })).toBe(false)
  })
})

