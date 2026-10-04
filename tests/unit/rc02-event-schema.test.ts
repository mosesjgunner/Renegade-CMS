import { describe, expect, it } from 'vitest'
import { eventSchemaNodes } from '@/modules/events/schema'
describe('RC-02 event schema facts', () => {
  const record = {
    title: 'Civic assembly',
    startsAt: '2026-11-07T18:00:00Z',
    venueName: 'Community Hall',
    venueAddress: '123 Civic Avenue',
    organizerName: 'Dispatch',
  }
  it('uses actual dates, venue and organizer', () => {
    expect(eventSchemaNodes('https://dispatch.test/events/assembly', record)[0]).toMatchObject({
      '@type': 'Event',
      startDate: record.startsAt,
      location: { name: 'Community Hall' },
      organizer: { name: 'Dispatch' },
    })
  })
  it('requires saved dates and an actual physical or virtual location', () => {
    expect(eventSchemaNodes('https://dispatch.test/e', { ...record, startsAt: 'invalid' })).toEqual(
      [],
    )
    expect(eventSchemaNodes('https://dispatch.test/e', { ...record, venueName: null })).toEqual([])
    expect(
      eventSchemaNodes('https://dispatch.test/e', {
        ...record,
        attendanceMode: 'virtual',
        onlineUrl: 'https://meeting.test/assembly',
      })[0].location,
    ).toEqual({ '@type': 'VirtualLocation', url: 'https://meeting.test/assembly' })
  })
})
