import config from '@payload-config'
import { getPayload } from 'payload'
import { headers as requestHeaders } from 'next/headers'
import { hasEntitlement } from '../commerce/subscription-service'
import { currentMember, readMemberSession } from '../identity/member-identity'
import { publicEventOccurrences, type EventRecord } from './contracts'
import { canDiscoverPublic } from '../public/contracts'
import { isRegisteredCollection } from '../public/registered-collections'
import { publicSiteForHost } from '../public/site-scope'

type Raw = Record<string, unknown>

export async function canReadEvent(
  payload: Awaited<ReturnType<typeof getPayload>>,
  event: Raw,
  siteId: string,
): Promise<boolean> {
  const required = event.requiredEntitlement as
    | { resource?: unknown; capability?: unknown; scope?: unknown }
    | null
    | undefined
  if (!required || typeof required.resource !== 'string' || typeof required.capability !== 'string')
    return true
  const memberId = await currentMember(payload as never, readMemberSession(await requestHeaders()))
  return Boolean(
    memberId &&
      (await hasEntitlement(payload as never, {
        subjectId: memberId,
        siteId,
        resource: required.resource,
        capability: required.capability,
        ...(typeof required.scope === 'string' ? { scope: required.scope } : {}),
      })),
  )
}
const relationId = (value: unknown) =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id ?? '')

export async function currentPublicSiteId() {
  const payload = await getPayload({ config })
  return publicSiteForHost(payload, (await requestHeaders()).get('host'))
}

export function asEvent(raw: Raw): EventRecord {
  return {
    ...raw,
    id: String(raw.id),
    site: relationId(raw.site),
    title: String(raw.title),
    slug: String(raw.slug),
    canonicalPath: String(raw.canonicalPath),
    startsAt: String(raw.startsAt),
    endsAt: typeof raw.endsAt === 'string' ? raw.endsAt : null,
    timeZone: String(raw.timeZone ?? 'UTC'),
    status: String(raw.status),
    visibility: raw.visibility as EventRecord['visibility'],
    recurrence: raw.recurrence as EventRecord['recurrence'],
    recurrenceOverrides: raw.recurrenceOverrides as EventRecord['recurrenceOverrides'],
  }
}

export async function findPublicEvents(input: {
  from: Date
  to: Date
  category?: string
  page?: number
  pageSize?: number
  /** Public feeds never serialize entitlement-protected records, even for a signed-in subscriber. */
  publicFeed?: boolean
  all?: boolean
}) {
  const payload = await getPayload({ config })
  const siteId = await currentPublicSiteId()
  const records: Raw[] = []
  if (siteId && isRegisteredCollection(payload, 'events')) {
    for (let page = 1; ; page++) {
      const batch = await payload.find({
        collection: 'events',
        where: { site: { equals: siteId } },
        page,
        limit: 250,
        sort: 'id',
        depth: 0,
        overrideAccess: true,
      } as never)
      records.push(...(batch.docs as unknown as Raw[]))
      if (!batch.hasNextPage) break
    }
  }
  const visible = (
    await Promise.all(
      records.map(async (event) =>
        relationId(event.site) === siteId &&
        canDiscoverPublic(event) &&
        (!input.publicFeed || !event.requiredEntitlement) &&
        (await canReadEvent(payload, event, siteId))
          ? event
          : null,
      ),
    )
  ).filter((event): event is Raw => event !== null)
  let occurrences = publicEventOccurrences(visible.map(asEvent), input.from, input.to)
  if (input.category)
    occurrences = occurrences.filter(
      (event) =>
        Array.isArray((event as Raw).categories) &&
        ((event as Raw).categories as unknown[]).some(
          (category) => relationId(category) === input.category,
        ),
    )
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 20, 100))
  const page = Math.max(1, input.page ?? 1)
  return {
    occurrences: input.all
      ? occurrences
      : occurrences.slice((page - 1) * pageSize, page * pageSize),
    total: occurrences.length,
    page,
    pageCount: Math.ceil(occurrences.length / pageSize),
    siteId,
  }
}

export async function findPublicEvent(slug: string, publicFeed = false) {
  const payload = await getPayload({ config })
  const siteId = await currentPublicSiteId()
  if (!siteId || !isRegisteredCollection(payload, 'events')) return null
  const result = await payload.find({
    collection: 'events',
    where: { and: [{ site: { equals: siteId } }, { slug: { equals: slug } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const record = result.docs[0] as unknown as Raw | undefined
  return record &&
    relationId(record.site) === siteId &&
    canDiscoverPublic(record) &&
    (!publicFeed || !record.requiredEntitlement) &&
    (await canReadEvent(payload, record, siteId))
    ? asEvent(record)
    : null
}
