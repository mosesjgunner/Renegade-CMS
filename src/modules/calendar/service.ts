/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload } from 'payload'
import {
  assertIanaTimeZone,
  isInScope,
  type CalendarProjection,
  type CalendarScope,
} from './contracts'
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

// ---------------------------------------------------------------------------
// RC3-17 (#24): the unified calendar readback.
//
// Before this, the only multi-source calendar assembly lived inline in
// the command-center route and covered just editorial jobs + content
// releases — social and newsletter schedules were invisible to it, so
// "one calendar spanning editorial, social, campaign and newsletter"
// was an unproven claim. This service is that single readback: it
// projects the four canonical schedule sources for one site into
// CalendarProjections. Projections reference their source and never
// copy schedule state — rescheduling writes the source (see
// rescheduleCalendarSource) and the next readback reflects it.
// ---------------------------------------------------------------------------

export async function listUnifiedCalendar(
  payload: Payload,
  scope: CalendarScope & { from?: string; to?: string; limit?: number },
): Promise<CalendarProjection[]> {
  const limit = scope.limit ?? 200
  const find = async (args: Doc) =>
    (
      (await payload.find({
        overrideAccess: true,
        ...args,
      } as never)) as unknown as { docs: Doc[] }
    ).docs

  const [jobs, releases, queueItems, messages] = await Promise.all([
    find({
      collection: 'scheduled-publish-jobs',
      where: { 'article.content.site': { equals: scope.siteId } },
      depth: 2,
      limit,
      sort: 'scheduledFor',
    }),
    find({
      collection: 'content-releases',
      where: { site: { equals: scope.siteId } },
      depth: 0,
      limit,
      sort: 'scheduledFor',
    }),
    find({
      collection: 'social-queue-items',
      where: { 'account.site': { equals: scope.siteId } },
      depth: 1,
      limit,
      sort: 'scheduledFor',
    }),
    find({
      collection: 'email-messages',
      where: {
        and: [{ site: { equals: scope.siteId } }, { scheduledFor: { exists: true } }],
      },
      depth: 0,
      limit,
      sort: 'scheduledFor',
    }),
  ])

  const entries: CalendarProjection[] = [
    ...jobs.map((job): CalendarProjection => {
      const content = (job.article as Doc | undefined)?.content as Doc | undefined
      return {
        id: `scheduled-publish-job:${job.id}`,
        sourceType: 'content',
        sourceId: String(job.id),
        siteId: scope.siteId,
        publicationId: content?.publication ? id(content.publication) : null,
        spaceId: content?.space ? id(content.space) : null,
        ownerId: null,
        title: content?.title ? String(content.title) : 'Scheduled article',
        startsAt: job.scheduledFor ? String(job.scheduledFor) : null,
        timeZone: String(job.timeZone ?? 'UTC'),
        status: String(job.status),
        editHref: `/admin/collections/scheduled-publish-jobs/${job.id}`,
      }
    }),
    ...releases.map((release) => projectRelease(release)),
    ...queueItems.map((item): CalendarProjection => {
      const variant = item.variant as Doc | undefined
      const account = item.account as Doc | undefined
      const text = variant?.text ? String(variant.text) : ''
      return {
        id: `social-queue-item:${item.id}`,
        sourceType: 'social-queue-item',
        sourceId: String(item.id),
        siteId: scope.siteId,
        publicationId: null,
        spaceId: null,
        ownerId: account?.id ? String(account.id) : null,
        title: text ? `Social: ${text.slice(0, 80)}` : 'Social post',
        startsAt: item.scheduledFor ? String(item.scheduledFor) : null,
        timeZone: String(item.timeZone ?? 'UTC'),
        status: String(item.status),
        editHref: `/admin/collections/social-queue-items/${item.id}`,
      }
    }),
    ...messages.map(
      (message): CalendarProjection => ({
        id: `newsletter:${message.id}`,
        sourceType: 'newsletter',
        sourceId: String(message.id),
        siteId: scope.siteId,
        publicationId: message.publication ? id(message.publication) : null,
        spaceId: message.space ? id(message.space) : null,
        ownerId: null,
        title: String(message.subject ?? 'Newsletter'),
        startsAt: message.scheduledFor ? String(message.scheduledFor) : null,
        timeZone: 'UTC',
        status: String(message.status ?? 'draft'),
        editHref: `/admin/collections/email-messages/${message.id}`,
      }),
    ),
  ]

  const ranged = entries.filter((entry) => {
    if (!scope.from && !scope.to) return true
    if (!entry.startsAt) return false
    if (scope.from && entry.startsAt < scope.from) return false
    if (scope.to && entry.startsAt > scope.to) return false
    return true
  })
  return ranged
    .filter((entry) => isInScope(entry, scope))
    .sort((a, b) => {
      if (a.startsAt && b.startsAt) return a.startsAt.localeCompare(b.startsAt)
      if (a.startsAt) return -1
      if (b.startsAt) return 1
      return 0
    })
}
