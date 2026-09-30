import type { Payload } from 'payload'
import { canDiscoverPublic, type PublicState } from './contracts'
import { resolveDiscoveryDocument, type DiscoveryDocument } from './discovery'
import {
  readRouteTemplates,
  readRouteTemplatesBySite,
  resolvePublicUrl,
  routeTemplatesForSite,
  validatePublicPath,
  validateRouteTemplates,
  type SemanticKind,
  type SemanticRouteTemplates,
} from './semantic-url'
import { revalidateDiscoveryOutputs } from './revalidation'

const normalizeIncomingPath = (rawPath: string): string | null => {
  if (
    !rawPath.startsWith('/') ||
    rawPath.startsWith('//') ||
    rawPath.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(rawPath)
  )
    return null
  const path = rawPath.split(/[?#]/, 1)[0] || '/'
  try {
    const parts = path.split('/')
    for (const part of parts) {
      const decoded = decodeURIComponent(part)
      if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\'))
        return null
    }
    return path.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
  } catch {
    return null
  }
}

export function validateSemanticRoute(templates: unknown): string | null {
  return validateRouteTemplates(templates)
}

export async function routeTemplatesForPayloadSite(
  payload: Payload,
  siteId: string | null | undefined,
): Promise<SemanticRouteTemplates> {
  try {
    const settings = (await payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as Record<string, unknown>
    return routeTemplatesForSite(
      siteId,
      readRouteTemplates(settings.semanticRouteTemplates),
      readRouteTemplatesBySite(
        settings.semanticRouteTemplatesBySite,
        readRouteTemplates(settings.semanticRouteTemplates),
      ),
    )
  } catch {
    return {}
  }
}

export async function assertSemanticPathAvailable(input: {
  payload: Payload
  collection: string
  id?: string
  siteId: string
  path: string
}): Promise<void> {
  const path = validatePublicPath(input.path)
  if (!input.siteId) throw new Error('A site is required before assigning a public path.')
  const collections = [
    'content',
    'events',
    'timelines',
    'albums',
    'books',
    'products',
    'discussions',
    'forums',
    'podcast-shows',
    'podcast-episodes',
    'videos',
    'topics',
    'categories',
    'sections',
  ]
  const collision = await Promise.all(
    collections.map(async (collection) => {
      try {
        const result = await input.payload.find({
          collection,
          where: { and: [{ site: { equals: input.siteId } }, { canonicalPath: { equals: path } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        } as never)
        const row = result.docs[0] as unknown as { id?: unknown } | undefined
        return row && !(collection === input.collection && String(row.id) === input.id)
          ? collection
          : null
      } catch {
        return null
      }
    }),
  ).then((values) => values.find(Boolean))
  if (collision) throw new Error(`The path ${path} is already used by ${collision}.`)
  const [layout, redirect, form] = await Promise.all([
    input.payload
      .find({
        collection: 'page-layouts',
        where: { and: [{ site: { equals: input.siteId } }, { path: { equals: path } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      .then((result) => result.docs.length > 0)
      .catch(() => false),
    input.payload
      .find({
        collection: 'public-redirects',
        where: {
          and: [
            { site: { equals: input.siteId } },
            { fromPath: { equals: path } },
            { enabled: { equals: true } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      .then((result) => result.docs.length > 0)
      .catch(() => false),
    input.payload
      .find({
        collection: 'form-definitions',
        where: { and: [{ site: { equals: input.siteId } }, { publicPath: { equals: path } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      .then((result) => result.docs.length > 0)
      .catch(() => false),
  ])
  if (layout) throw new Error(`The path ${path} is already used by a page layout.`)
  if (redirect) throw new Error(`The path ${path} is reserved by an existing redirect.`)
  if (form) throw new Error(`The path ${path} is already used by a public form.`)
}

export async function assertRecordSemanticPath(input: {
  payload: Payload
  collection: string
  data?: Record<string, unknown> | null
  originalDoc?: Record<string, unknown> | null
}): Promise<void> {
  const relationId = (value: unknown) =>
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && 'id' in value
        ? String((value as { id: unknown }).id)
        : ''
  const siteId = relationId(input.data?.site ?? input.originalDoc?.site)
  const path = String(input.data?.canonicalPath ?? input.originalDoc?.canonicalPath ?? '')
  if (!siteId || !path) return
  await assertSemanticPathAvailable({
    payload: input.payload,
    collection: input.collection,
    id: String(input.originalDoc?.id ?? ''),
    siteId,
    path,
  })
}

const kindByCollection: Record<string, SemanticKind> = {
  events: 'event',
  timelines: 'timeline',
  albums: 'album',
  books: 'book',
  products: 'product',
  discussions: 'discussion',
  'podcast-shows': 'podcast',
  'podcast-episodes': 'podcast-episode',
  videos: 'video',
  topics: 'topic',
  categories: 'topic',
}

/** Derive a collection's canonical path when its URL-defining fields change. */
export async function assignRecordSemanticPath(input: {
  payload: Payload
  collection: string
  data?: Record<string, unknown> | null
  originalDoc?: Record<string, unknown> | null
  allowCanonicalPathChange?: boolean
}): Promise<Record<string, unknown> | null | undefined> {
  const data = input.data
  if (!data) return data
  const original = input.originalDoc
  const kind = kindByCollection[input.collection]
  if (!kind) return data
  const slug = String(data.slug ?? original?.slug ?? '')
  if (!slug) return data
  const relationId = (value: unknown) =>
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && 'id' in value
        ? String((value as { id: unknown }).id)
        : ''
  const routeFields = ['slug', 'forum', 'parent']
  const routeChanged =
    !original ||
    routeFields.some((field) => {
      if (!(field in data)) return false
      const current = ['forum', 'parent'].includes(field)
        ? relationId(data[field])
        : String(data[field] ?? '')
      const before = ['forum', 'parent'].includes(field)
        ? relationId(original[field])
        : String(original[field] ?? '')
      return current !== before
    })
  if (!routeChanged && original?.canonicalPath) {
    if (
      input.allowCanonicalPathChange &&
      typeof data.canonicalPath === 'string' &&
      data.canonicalPath !== original.canonicalPath
    ) {
      data.canonicalPath = validatePublicPath(data.canonicalPath)
      return data
    }
    data.canonicalPath = original.canonicalPath
    return data
  }
  if (data.canonicalPath && !original) {
    data.canonicalPath = validatePublicPath(String(data.canonicalPath))
    return data
  }

  const siteId = relationId(data.site ?? original?.site)
  const templates = await routeTemplatesForPayloadSite(input.payload, siteId)
  const values: Record<string, string> = { slug }
  if (kind === 'timeline' && (templates.timeline ?? '/timelines/{slug}').includes('{eventSlug}')) {
    const timelineId = relationId(data.id ?? original?.id)
    if (!timelineId) {
      if (data.status === 'published')
        throw new Error('Attach exactly one event before publishing this timeline.')
      delete data.canonicalPath
      return data
    }
    const memberships = await input.payload.find({
      collection: 'timeline-memberships',
      where: { timeline: { equals: timelineId } },
      limit: 3,
      depth: 1,
      overrideAccess: true,
    } as never)
    const eventSlugs = (memberships.docs as unknown as Array<Record<string, unknown>>)
      .map((membership) => {
        const event = membership.event as Record<string, unknown> | string | undefined
        return typeof event === 'object' && event && canDiscoverPublic(event as PublicState)
          ? String(event.slug ?? '')
          : ''
      })
      .filter(Boolean)
    if (eventSlugs.length !== 1 && data.status !== 'published') {
      delete data.canonicalPath
      return data
    }
    if (eventSlugs.length !== 1)
      throw new Error('The event-scoped timeline route requires exactly one related event.')
    values.eventSlug = eventSlugs[0]!
  }
  if (kind === 'discussion') {
    const forumId = relationId(data.forum ?? original?.forum)
    if (!forumId) throw new Error('A discussion URL requires a forum.')
    const forum = (await input.payload.findByID({
      collection: 'forums',
      id: forumId,
      depth: 0,
      overrideAccess: true,
    } as never)) as unknown as Record<string, unknown>
    if (siteId && relationId(forum.site) !== siteId)
      throw new Error('A discussion and its forum must belong to the same site.')
    values.forumSlug = String(forum.slug ?? '')
  }
  if (
    kind === 'topic' &&
    input.collection === 'categories' &&
    (templates.topic ?? '').includes('{parentTopic}')
  ) {
    const parentId = relationId(data.parent ?? original?.parent)
    if (parentId) {
      const parent = (await input.payload.findByID({
        collection: 'categories',
        id: parentId,
        depth: 0,
        overrideAccess: true,
      } as never)) as unknown as Record<string, unknown>
      values.parentTopic = String(parent.slug ?? '')
    }
  }
  data.canonicalPath = resolvePublicUrl({ kind, ...values } as never, templates)
  return data
}

/** Resolve a same-site public path through the canonical discovery boundary. */
export async function resolveRouteByPath(
  payload: Payload,
  path: string,
  siteId: string,
): Promise<DiscoveryDocument | null> {
  const normalized = normalizeIncomingPath(path)
  if (!normalized || !siteId) return null
  const document = await resolveDiscoveryDocument(payload, { path: normalized, siteId })
  if (
    document.indexability.reason === 'not_found' ||
    document.indexability.reason === 'private' ||
    document.indexability.reason === 'draft' ||
    document.indexability.reason === 'scheduled' ||
    document.indexability.reason === 'archived'
  )
    return null
  return document
}

/** Return exact historical paths that now lead to the supplied canonical path. */
export async function getUrlHistory(
  payload: Payload,
  siteId: string,
  canonicalPath: string,
): Promise<
  Array<{ fromPath: string; toPath: string; statusCode: string; preserveQuery: boolean }>
> {
  const canonical = normalizeIncomingPath(canonicalPath)
  if (!canonical || !siteId) return []
  const result = await payload.find({
    collection: 'public-redirects',
    where: { and: [{ site: { equals: siteId } }, { enabled: { equals: true } }] },
    limit: 2000,
    depth: 0,
    overrideAccess: true,
  } as never)
  const rules = result.docs as unknown as Array<Record<string, unknown>>
  const included = new Map<string, Record<string, unknown>>()
  let destinations = new Set([canonical])
  for (let hop = 0; hop < 8 && destinations.size; hop++) {
    const next = new Set<string>()
    for (const rule of rules) {
      if (rule.match !== 'exact' || rule.enabled === false) continue
      const fromPath = normalizeIncomingPath(String(rule.fromPath ?? ''))
      const toPath = normalizeIncomingPath(String(rule.toPath ?? ''))
      if (!fromPath || !toPath || !destinations.has(toPath) || included.has(fromPath)) continue
      included.set(fromPath, rule)
      next.add(fromPath)
    }
    destinations = next
  }
  return [...included.entries()].map(([fromPath, rule]) => ({
    fromPath,
    toPath: String(rule.toPath),
    statusCode: String(rule.statusCode ?? '308'),
    preserveQuery: rule.preserveQuery !== false,
  }))
}

export type { SemanticRouteTemplates }

export async function recordPublishedPathHistory(input: {
  collection: string
  doc: Record<string, unknown>
  previousDoc?: Record<string, unknown>
  operation: 'create' | 'update'
  payload: Payload
}): Promise<void> {
  const previous = input.previousDoc
  const fromPath = typeof previous?.canonicalPath === 'string' ? previous.canonicalPath : ''
  const toPath = typeof input.doc.canonicalPath === 'string' ? input.doc.canonicalPath : ''
  const siteId =
    typeof input.doc.site === 'string'
      ? input.doc.site
      : input.doc.site && typeof input.doc.site === 'object' && 'id' in input.doc.site
        ? String((input.doc.site as { id: unknown }).id)
        : ''
  if (
    input.operation !== 'update' ||
    !previous ||
    !siteId ||
    !fromPath ||
    !toPath ||
    fromPath === toPath
  )
    return
  const wasPublic =
    input.collection === 'products' ? previous.state === 'published' : canDiscoverPublic(previous)
  if (!wasPublic) return
  validatePublicPath(fromPath)
  validatePublicPath(toPath)
  const existing = await input.payload.find({
    collection: 'public-redirects',
    where: { and: [{ site: { equals: siteId } }, { fromPath: { equals: fromPath } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (existing.docs.length) {
    const currentTarget = String(
      (existing.docs[0] as unknown as Record<string, unknown>).toPath ?? '',
    )
    if (currentTarget !== toPath)
      throw new Error(`Cannot change ${fromPath}: an unrelated redirect already owns that path.`)
  } else {
    await input.payload.create({
      collection: 'public-redirects',
      data: {
        site: siteId,
        fromPath,
        toPath,
        match: 'exact',
        statusCode: '308',
        preserveQuery: true,
        enabled: true,
      } as never,
      overrideAccess: true,
    } as never)
  }
  const incoming = await input.payload.find({
    collection: 'public-redirects',
    where: {
      and: [
        { site: { equals: siteId } },
        { toPath: { equals: fromPath } },
        { match: { equals: 'exact' } },
        { enabled: { equals: true } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  } as never)
  await Promise.all(
    (incoming.docs as unknown as Array<Record<string, unknown>>).map((rule) =>
      input.payload.update({
        collection: 'public-redirects',
        id: String(rule.id),
        data: { toPath },
        overrideAccess: true,
      } as never),
    ),
  )
  await revalidateDiscoveryOutputs([fromPath, toPath])
}
