/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload } from 'payload'
import { assertIanaTimeZone, type CalendarProjection } from './contracts'
import { scheduleContentRelease } from '../releases/service'

type Doc = Record<string, any>
const id = (value: unknown) =>
  typeof value === 'string' ? value : String((value as Doc)?.id ?? '')

/** Command router used by drag/drop. It deliberately writes the canonical source, never a view row. */
export async function rescheduleCalendarSource(
  payload: Payload,
  input: {
    entry: CalendarProjection
    startsAt: string
    endsAt?: string | null
    timeZone: string
    actorId: string
    mutationId: string
  },
) {
  assertIanaTimeZone(input.timeZone)
  if (Number.isNaN(new Date(input.startsAt).getTime()))
    throw new Error('Calendar start must be a valid instant.')
  if (input.endsAt && new Date(input.endsAt) < new Date(input.startsAt))
    throw new Error('Calendar end must follow start.')
  if (input.entry.sourceType === 'content-release')
    return scheduleContentRelease(payload, {
      releaseId: input.entry.sourceId,
      scheduledFor: input.startsAt,
      timeZone: input.timeZone,
      actorId: input.actorId,
      idempotencyKey: input.mutationId,
    })
  const collection =
    input.entry.sourceType === 'social-queue-item' ? 'social-queue-items' : 'calendar-entries'
  const before = (await payload.findByID({
    collection: collection as never,
    id: input.entry.sourceId,
    depth: 0,
    overrideAccess: true,
  })) as Doc
  const updated = await payload.update({
    collection: collection as never,
    id: input.entry.sourceId,
    data:
      collection === 'social-queue-items'
        ? { scheduledFor: input.startsAt, timeZone: input.timeZone }
        : { startsAt: input.startsAt, endsAt: input.endsAt ?? null, timeZone: input.timeZone },
    overrideAccess: true,
  } as never)
  if (collection === 'calendar-entries')
    await payload.create({
      collection: 'calendar-entry-audits',
      data: {
        calendarEntry: input.entry.sourceId,
        action: 'calendar.rescheduled',
        actor: input.actorId,
        before: { startsAt: before.startsAt, endsAt: before.endsAt, timeZone: before.timeZone },
        after: { startsAt: input.startsAt, endsAt: input.endsAt ?? null, timeZone: input.timeZone },
        createdAt: new Date().toISOString(),
      },
      overrideAccess: true,
    } as never)
  return updated
}

export const projectRelease = (release: Doc): CalendarProjection => ({
  id: `content-release:${release.id}`,
  sourceType: 'content-release',
  sourceId: String(release.id),
  siteId: id(release.site),
  publicationId: release.publication ? id(release.publication) : null,
  spaceId: release.space ? id(release.space) : null,
  ownerId: release.owner ? id(release.owner) : null,
  title: String(release.title),
  startsAt: release.scheduledFor ? String(release.scheduledFor) : null,
  timeZone: String(release.timeZone ?? 'UTC'),
  status: String(release.status),
  editHref: `/admin/collections/content-releases/${release.id}`,
})
