/** Unified calendar projections reference their source; they never copy source schedule state. */
export type CalendarScope = {
  siteId: string
  publicationId?: string | null
  spaceId?: string | null
}
export type CalendarSourceType =
  | 'content-release'
  | 'content'
  | 'social-queue-item'
  | 'newsletter'
  | 'campaign'
  | 'event'
  | 'workflow-item'
  | 'podcast'
  | 'video'
  | 'livestream'
  | 'book-chapter'
  | 'product'
  | 'crowdfunding'
  | 'calendar-entry'

export type CalendarProjection = CalendarScope & {
  id: string
  sourceType: CalendarSourceType
  sourceId: string
  title: string
  startsAt: string | null
  endsAt?: string | null
  timeZone: string
  status: string
  ownerId?: string | null
  editHref: string
}

export const assertIanaTimeZone = (timeZone: string) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone })
  } catch {
    throw new Error('Calendar scheduling requires a valid IANA timezone.')
  }
}

export const isInScope = (entry: CalendarProjection, scope: CalendarScope, myId?: string) =>
  entry.siteId === scope.siteId &&
  (!scope.publicationId || entry.publicationId === scope.publicationId) &&
  (!scope.spaceId || entry.spaceId === scope.spaceId) &&
  (!myId || entry.ownerId === myId)

export const calendarConflicts = (entries: readonly CalendarProjection[]) =>
  entries
    .filter((entry) => entry.startsAt)
    .reduce<Record<string, CalendarProjection[]>>((groups, entry) => {
      const key = `${entry.startsAt}:${entry.timeZone}`
      ;(groups[key] ??= []).push(entry)
      return groups
    }, {})

export const unscheduled = (entries: readonly CalendarProjection[]) =>
  entries.filter((entry) => !entry.startsAt)
