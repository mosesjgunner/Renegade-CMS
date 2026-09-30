import type { Payload } from 'payload'
import { canDiscoverPublic, canRenderPublic, type PublicState } from './contracts'
import { registeredOnly } from './registered-collections'
import {
  readRouteTemplates,
  readRouteTemplatesBySite,
  resolvePublicUrl,
  routeTemplatesForSite,
  type SemanticKind,
} from './semantic-url'

type Row = Record<string, unknown> & { id: string }
type BackfillChange = {
  collection: string
  id: string
  siteId: string
  fromPath: string
  toPath: string
  title: string
}
export type SemanticUrlBackfillReport = {
  mode: 'dry-run' | 'apply'
  scanned: number
  unchanged: number
  skipped: number
  changed: BackfillChange[]
  conflicts: Array<{ collection: string; id: string; path: string; reason: string }>
  applied: number
}

const idOf = (value: unknown) =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id)
      : ''

const candidates: Record<
  string,
  (record: Row) => { kind: SemanticKind; values: Record<string, string> } | null
> = {
  content: (record) => ({
    kind: record.contentType === 'page' ? 'page' : 'article',
    values: { slug: String(record.slug ?? '') },
  }),
  topics: (record) => ({ kind: 'topic', values: { slug: String(record.slug ?? '') } }),
  events: (record) => ({ kind: 'event', values: { slug: String(record.slug ?? '') } }),
  timelines: (record) => ({ kind: 'timeline', values: { slug: String(record.slug ?? '') } }),
  albums: (record) => ({ kind: 'album', values: { slug: String(record.slug ?? '') } }),
  forums: (record) => ({ kind: 'forum', values: { slug: String(record.slug ?? '') } }),
  books: (record) => ({ kind: 'book', values: { slug: String(record.slug ?? '') } }),
  products: (record) => ({ kind: 'product', values: { slug: String(record.slug ?? '') } }),
  discussions: (record) => ({
    kind: 'discussion',
    values: {
      slug:
        String(record.canonicalPath ?? '')
          .split('/')
          .filter(Boolean)
          .at(-1) ?? '',
    },
  }),
  'podcast-shows': (record) => ({ kind: 'podcast', values: { slug: String(record.slug ?? '') } }),
  'podcast-episodes': (record) => ({
    kind: 'podcast-episode',
    values: { slug: String(record.slug ?? '') },
  }),
  videos: (record) => ({ kind: 'video', values: { slug: String(record.slug ?? '') } }),
}

async function findAll(payload: Payload, collection: string): Promise<Row[]> {
  const rows: Row[] = []
  let page = 1
  for (;;) {
    let result
    try {
      result = await payload.find({
        collection,
        page,
        limit: 500,
        depth: 0,
        overrideAccess: true,
      } as never)
    } catch (error) {
      throw new Error(
        `Could not scan ${collection} during semantic URL backfill; aborting before writes.`,
        { cause: error },
      )
    }
    rows.push(...(result.docs as unknown as Row[]))
    if (!result.hasNextPage) return rows
    page += 1
  }
}

export async function runSemanticUrlBackfill(
  payload: Payload,
  apply = false,
): Promise<SemanticUrlBackfillReport> {
  const report: SemanticUrlBackfillReport = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: 0,
    unchanged: 0,
    skipped: 0,
    changed: [],
    conflicts: [],
    applied: 0,
  }
  const settings = await payload.findGlobal({
    slug: 'site-settings',
    depth: 0,
    overrideAccess: true,
  } as never)
  const defaultTemplates = readRouteTemplates(
    (settings as unknown as Record<string, unknown>)?.semanticRouteTemplates,
  )
  const templatesBySite = readRouteTemplatesBySite(
    (settings as unknown as Record<string, unknown>)?.semanticRouteTemplatesBySite,
    defaultTemplates,
  )
  const all = await Promise.all(
    registeredOnly(payload, Object.keys(candidates)).map(
      async (collection) => [collection, await findAll(payload, collection)] as const,
    ),
  )
  const records = all.flatMap(([collection, docs]) =>
    docs.map((record) => ({ collection, record })),
  )
  const eventSlugById = new Map(
    records
      .filter(
        ({ collection, record }) =>
          collection === 'events' && canDiscoverPublic(record as PublicState),
      )
      .map(({ record }) => [record.id, String(record.slug ?? '')]),
  )
  const forumSlugById = new Map(
    records
      .filter(({ collection }) => collection === 'forums')
      .map(({ record }) => [record.id, String(record.slug ?? '')]),
  )
  const timelineEventSlugs = new Map<string, Set<string>>()
  for (const membership of registeredOnly(payload, ['timeline-memberships'] as const).length
    ? await findAll(payload, 'timeline-memberships')
    : []) {
    const timelineId = idOf(membership.timeline)
    const eventSlug = eventSlugById.get(idOf(membership.event))
    if (!timelineId || !eventSlug) continue
    const values = timelineEventSlugs.get(timelineId) ?? new Set<string>()
    values.add(eventSlug)
    timelineEventSlugs.set(timelineId, values)
  }
  const pathOwners = new Map<string, { collection: string; id: string; siteId: string }>()
  for (const { collection, record } of records) {
    const path = typeof record.canonicalPath === 'string' ? record.canonicalPath : ''
    const siteId = idOf(record.site)
    if (!path || !siteId) continue
    const key = `${siteId}:${path}`
    const existing = pathOwners.get(key)
    if (existing && (existing.collection !== collection || existing.id !== record.id)) {
      report.conflicts.push({
        collection,
        id: record.id,
        path,
        reason: `Existing path collision with ${existing.collection} record ${existing.id}.`,
      })
    } else {
      pathOwners.set(key, { collection, id: record.id, siteId })
    }
  }
  // Fixed public routes are path owners too, even though they do not use semantic
  // canonicalPath fields. Include them in preflight so --apply cannot shadow them.
  for (const layout of registeredOnly(payload, ['page-layouts'] as const).length
    ? await findAll(payload, 'page-layouts')
    : []) {
    const siteId = idOf(layout.site)
    const path = String(layout.path ?? '')
    if (siteId && path)
      pathOwners.set(`${siteId}:${path}`, { collection: 'page-layouts', id: layout.id, siteId })
  }
  for (const form of registeredOnly(payload, ['form-definitions'] as const).length
    ? await findAll(payload, 'form-definitions')
    : []) {
    const siteId = idOf(form.site)
    const path = String(form.publicPath ?? '')
    if (siteId && path)
      pathOwners.set(`${siteId}:${path}`, { collection: 'form-definitions', id: form.id, siteId })
  }
  const redirectsByFrom = new Map<string, Row>()
  for (const rule of registeredOnly(payload, ['public-redirects'] as const).length
    ? await findAll(payload, 'public-redirects')
    : []) {
    const siteId = idOf(rule.site)
    const fromPath = String(rule.fromPath ?? '')
    if (siteId && fromPath) redirectsByFrom.set(`${siteId}:${fromPath}`, rule)
  }

  const changes: Array<{ change: BackfillChange; record: Row }> = []
  const proposedTargets = new Map<string, BackfillChange>()
  for (const { collection, record } of records) {
    report.scanned++
    if (collection === 'discussions' && record.kind === 'attached') {
      report.skipped++
      continue
    }
    if (!canRenderPublic(record as PublicState) || record.pathOverride === true) {
      report.skipped++
      continue
    }
    const siteId = idOf(record.site)
    const fromPath = String(record.canonicalPath ?? '')
    const candidate = candidates[collection]!(record)
    if (!candidate) {
      report.skipped++
      continue
    }
    if (!siteId || !candidate.values.slug) {
      report.conflicts.push({
        collection,
        id: record.id,
        path: fromPath,
        reason: 'Missing site or stable slug.',
      })
      continue
    }
    const templates = routeTemplatesForSite(siteId, defaultTemplates, templatesBySite)
    if (collection === 'timelines') {
      const template = templates.timeline ?? '/timelines/{slug}'
      if (template.includes('{eventSlug}')) {
        const eventSlugs = timelineEventSlugs.get(record.id)
        if (!eventSlugs || eventSlugs.size !== 1) {
          report.conflicts.push({
            collection,
            id: record.id,
            path: fromPath,
            reason: 'The event scoped route needs exactly one visible related event slug.',
          })
          continue
        }
        candidate.values.eventSlug = [...eventSlugs][0]!
      }
    }
    if (collection === 'discussions') {
      const forumSlug = forumSlugById.get(idOf(record.forum))
      if (!forumSlug) {
        report.conflicts.push({
          collection,
          id: record.id,
          path: fromPath,
          reason: 'The discussion has no resolvable forum slug.',
        })
        continue
      }
      candidate.values.forumSlug = forumSlug
    }
    let toPath: string
    try {
      toPath = resolvePublicUrl({ kind: candidate.kind, ...candidate.values } as never, templates)
    } catch (error) {
      report.conflicts.push({
        collection,
        id: record.id,
        path: fromPath,
        reason: error instanceof Error ? error.message : 'Route cannot be resolved.',
      })
      continue
    }
    if (toPath === fromPath) {
      report.unchanged++
      continue
    }
    const owner = pathOwners.get(`${siteId}:${toPath}`)
    if (owner && (owner.collection !== collection || owner.id !== record.id)) {
      report.conflicts.push({
        collection,
        id: record.id,
        path: toPath,
        reason: `Already used by ${owner.collection} record ${owner.id}.`,
      })
      continue
    }
    const targetRedirect = redirectsByFrom.get(`${siteId}:${toPath}`)
    if (targetRedirect && targetRedirect.enabled !== false) {
      report.conflicts.push({
        collection,
        id: record.id,
        path: toPath,
        reason: 'The proposed canonical path is already a redirect source.',
      })
      continue
    }
    const proposedOwner = proposedTargets.get(`${siteId}:${toPath}`)
    if (proposedOwner) {
      report.conflicts.push({
        collection,
        id: record.id,
        path: toPath,
        reason: `Also proposed by ${proposedOwner.collection} record ${proposedOwner.id}.`,
      })
      continue
    }
    const existingRedirect = redirectsByFrom.get(`${siteId}:${fromPath}`)
    if (existingRedirect && String(existingRedirect.toPath) !== toPath) {
      report.conflicts.push({
        collection,
        id: record.id,
        path: fromPath,
        reason: `Existing redirect points to ${String(existingRedirect.toPath)}.`,
      })
      continue
    }
    const change = {
      collection,
      id: record.id,
      siteId,
      fromPath,
      toPath,
      title: String(record.title ?? record.name ?? record.slug),
    }
    changes.push({ change, record })
    report.changed.push(change)
    proposedTargets.set(`${siteId}:${toPath}`, change)
  }

  if (!apply || report.conflicts.length) return report
  for (const { change, record } of changes) {
    const prior = redirectsByFrom.get(`${change.siteId}:${change.fromPath}`)
    if (!prior && change.fromPath) {
      const current = await payload.find({
        collection: 'public-redirects',
        where: {
          and: [{ site: { equals: change.siteId } }, { fromPath: { equals: change.fromPath } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      if (!current.docs.length)
        await payload.create({
          collection: 'public-redirects',
          data: {
            site: change.siteId,
            fromPath: change.fromPath,
            toPath: change.toPath,
            match: 'exact',
            statusCode: '308',
            preserveQuery: true,
            enabled: true,
          } as never,
          overrideAccess: true,
        } as never)
    }
    const data =
      change.collection === 'content'
        ? { slug: record.slug, pathOverride: false }
        : { canonicalPath: change.toPath }
    await payload.update({
      collection: change.collection,
      id: change.id,
      data: data as never,
      context: { semanticRouteChange: true },
      overrideAccess: true,
    } as never)
    report.applied++
  }
  return report
}
