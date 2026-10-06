import type { Access, CollectionBeforeChangeHook, Payload, Where } from 'payload'
import { APIError } from 'payload'
import { publicSiteForHost } from '../public/site-scope'
import { canDiscoverPublic } from '../public/contracts'

type Doc = Record<string, unknown>
const id = (value: unknown) =>
  typeof value === 'object' && value ? String((value as Doc).id ?? '') : String(value ?? '')
const staff = (role: unknown) => ['owner', 'administrator', 'staff'].includes(String(role))
export const timelineAccess =
  (membership = false): Access =>
  async ({ req }) => {
    if (!staff(req.user?.role)) return false
    const site = await publicSiteForHost(req.payload, req.headers.get('host'))
    if (!site) return false
    if (!membership) return { site: { equals: site } } as Where
    const parents = await req.payload.find({
      collection: 'timelines',
      where: { site: { equals: site } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    return { timeline: { in: parents.docs.map((parent) => parent.id) } } as Where
  }

export const guardTimelineWrite =
  (membership = false): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req }) => {
    const next = { ...originalDoc, ...data }
    let site = id(next.site)
    if (membership) {
      const timeline = await req.payload.findByID({
        collection: 'timelines',
        id: id(next.timeline),
        depth: 0,
        overrideAccess: true,
      })
      const event = await req.payload.findByID({
        collection: 'events',
        id: id(next.event),
        depth: 0,
        overrideAccess: true,
      })
      site = id(timeline.site)
      if (site !== id(event.site))
        throw new APIError('Timeline and event must belong to the same site.', 403)
    }
    if (
      req.user &&
      (!staff(req.user.role) ||
        site !== (await publicSiteForHost(req.payload, req.headers.get('host'))) ||
        (!membership && originalDoc?.site && id(originalDoc.site) !== site))
    )
      throw new APIError('Timeline site access denied.', 403)
    return data
  }

/** Re-read events at depth zero: membership display overrides never authorize an event. */
export async function publicTimelineEntries(payload: Payload, timeline: Doc, site: string) {
  if (id(timeline.site) !== site || !canDiscoverPublic(timeline)) return []
  const entries: Doc[] = []
  for (let page = 1; ; page++) {
    const batch = await payload.find({
      collection: 'timeline-memberships',
      where: { timeline: { equals: id(timeline.id) } },
      depth: 0,
      page,
      limit: 250,
      sort: 'id',
      overrideAccess: true,
    })
    for (const raw of batch.docs) {
      const event = await payload.findByID({
        collection: 'events',
        id: id(raw.event),
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
      })
      if (
        !event ||
        id(event.site) !== site ||
        !canDiscoverPublic(event as unknown as Doc) ||
        event.requiredEntitlement
      )
        continue
      entries.push({
        id: raw.id,
        title: raw.displayTitle || event.title,
        summary: raw.displaySummary || event.summary,
        startsAt: raw.displayStartsAt || event.startsAt,
        timeZone: event.timeZone,
        canonicalPath: event.canonicalPath,
        position: raw.position ?? 0,
      })
    }
    if (!batch.hasNextPage) break
  }
  return entries.sort((a, b) =>
    timeline.orderingMode === 'manual'
      ? Number(a.position) - Number(b.position) || id(a.id).localeCompare(id(b.id))
      : Date.parse(String(a.startsAt)) - Date.parse(String(b.startsAt)) ||
        id(a.id).localeCompare(id(b.id)),
  )
}
