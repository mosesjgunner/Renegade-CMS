import type { SchemaNode } from '../public/schema'

/** Schema facts come exclusively from the saved event, never sample defaults. */
export function eventSchemaNodes(
  canonicalUrl: string,
  record: Record<string, unknown>,
): SchemaNode[] {
  if (typeof record.startsAt !== 'string' || Number.isNaN(Date.parse(record.startsAt))) return []
  const location =
    record.attendanceMode === 'virtual'
      ? typeof record.onlineUrl === 'string' && /^https?:\/\//.test(record.onlineUrl)
        ? { '@type': 'VirtualLocation', url: record.onlineUrl }
        : null
      : typeof record.venueName === 'string' && record.venueName
        ? {
            '@type': 'Place',
            name: record.venueName,
            address: {
              '@type': 'PostalAddress',
              streetAddress: record.venueAddress || undefined,
              addressLocality: record.venueRegion || undefined,
            },
          }
        : null
  if (!location) return []
  return [
    {
      '@type': 'Event',
      '@id': `${canonicalUrl}#event`,
      name: record.title,
      description: record.summary || undefined,
      url: canonicalUrl,
      startDate: record.startsAt,
      endDate: record.endsAt || undefined,
      location,
      eventAttendanceMode: `https://schema.org/${record.attendanceMode === 'virtual' ? 'OnlineEventAttendanceMode' : record.attendanceMode === 'hybrid' ? 'MixedEventAttendanceMode' : 'OfflineEventAttendanceMode'}`,
      eventStatus: 'https://schema.org/EventScheduled',
      ...(record.organizerName
        ? {
            organizer: {
              '@type': 'Organization',
              name: record.organizerName,
              url: record.organizerUrl || undefined,
            },
          }
        : {}),
    },
  ]
}
