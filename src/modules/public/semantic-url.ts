/** Public paths are derived from domain records, never database identifiers. */
export type SemanticKind =
  | 'article'
  | 'page'
  | 'politician'
  | 'organization'
  | 'legislation'
  | 'event'
  | 'timeline'
  | 'topic'
  | 'media'
  | 'collection'
  | 'book'
  | 'product'
  | 'forum'
  | 'discussion'
  | 'album'
  | 'podcast'
  | 'podcast-episode'
  | 'video'

export type SemanticRecord = {
  kind: SemanticKind
  slug: string
  canonicalPath?: string | null
  jurisdiction?: string | null
  eventSlug?: string | null
  parentTopic?: string | null
  mediaType?: string | null
  forumSlug?: string | null
}
export type SemanticRouteTemplates = Partial<Record<SemanticKind, string>>

export const SEMANTIC_ROUTE_DEFAULTS: Record<SemanticKind, string> = {
  article: '/articles/{slug}',
  page: '/{slug}',
  politician: '/politicians/{jurisdiction}/{slug}',
  organization: '/organizations/{jurisdiction}/{slug}',
  legislation: '/legislation/{jurisdiction}/{slug}',
  event: '/events/{slug}',
  timeline: '/timelines/{slug}',
  topic: '/topics/{slug}',
  media: '/media/{mediaType}/{slug}',
  collection: '/collections/{slug}',
  book: '/books/{slug}',
  product: '/store/{slug}',
  forum: '/forums/{slug}',
  discussion: '/forums/{forumSlug}/{slug}',
  album: '/albums/{slug}',
  podcast: '/podcasts/{slug}',
  'podcast-episode': '/podcasts/episodes/{slug}',
  video: '/videos/{slug}',
}

const variables = new Set([
  'slug',
  'jurisdiction',
  'eventSlug',
  'parentTopic',
  'mediaType',
  'forumSlug',
])
const variablesByKind: Record<SemanticKind, Set<string>> = {
  article: new Set(['slug']),
  page: new Set(['slug']),
  politician: new Set(['jurisdiction', 'slug']),
  organization: new Set(['jurisdiction', 'slug']),
  legislation: new Set(['jurisdiction', 'slug']),
  event: new Set(['slug']),
  timeline: new Set(['eventSlug', 'slug']),
  topic: new Set(['parentTopic', 'slug']),
  media: new Set(['mediaType', 'slug']),
  collection: new Set(['slug']),
  book: new Set(['slug']),
  product: new Set(['slug']),
  forum: new Set(['slug']),
  discussion: new Set(['forumSlug', 'slug']),
  album: new Set(['slug']),
  podcast: new Set(['slug']),
  'podcast-episode': new Set(['slug']),
  video: new Set(['slug']),
}
// These routes are owned by fixed Next.js segments today. Their canonical
// defaults remain available, but accepting a different template would send
// visitors to a path that the corresponding rich renderer cannot serve.
const configurableKinds = new Set<SemanticKind>([
  'article',
  'page',
  'event',
  'timeline',
  'topic',
  'book',
  'product',
  'discussion',
  'album',
])
const reserved = new Set([
  'admin',
  'api',
  'ap',
  'preview',
  'search',
  'setup',
  'login',
  'logout',
  'health',
  'sitemap.xml',
  'sitemaps',
  'robots.txt',
])
const reservedPatterns = new Set([
  '/articles',
  '/articles/page',
  '/events',
  '/events/page',
  '/videos',
  '/videos/page',
  '/podcasts',
  '/podcasts/episodes',
  '/media',
  '/search',
  '/feed.xml',
  '/feed.json',
  '/sitemap.xml',
  '/robots.txt',
])
const reservedStaticPaths = new Set([
  '/articles',
  '/events',
  '/videos',
  '/forums',
  '/podcasts',
  '/books',
  '/store',
  '/topics',
  '/collections',
  '/login',
  '/logout',
  '/setup',
  '/search',
  '/events/page',
  '/videos/page',
  '/podcasts/page',
  '/articles/page',
  '/admin',
  '/api',
  '/health/ready',
  '/health/live',
  '/sitemap.xml',
  '/robots.txt',
  '/feed.xml',
  '/feed.json',
])
const routeTemplatesOverlap = (left: string, right: string) => {
  const a = left.split('/').filter(Boolean)
  const b = right.split('/').filter(Boolean)
  return (
    a.length === b.length &&
    a.every((part, index) => {
      const other = b[index]!
      return /^\{[A-Za-z]+\}$/.test(part) || /^\{[A-Za-z]+\}$/.test(other) || part === other
    })
  )
}

export function normalizeSemanticSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function validateRouteTemplate(template: string): string | null {
  if (
    !template.startsWith('/') ||
    template.startsWith('//') ||
    template.includes('?') ||
    template.includes('#')
  )
    return 'A route template must be an absolute local path.'
  const parts = template.slice(1).split('/')
  if (parts.some((part) => !part)) return 'Empty route segments are not allowed.'
  if (reserved.has(parts[0])) return `/${parts[0]} is reserved.`
  if (!template.includes('{slug}')) return 'A route template must include {slug}.'
  for (const part of parts) {
    if (/^\{[A-Za-z]+\}$/.test(part)) {
      if (!variables.has(part.slice(1, -1))) return `Unsupported route variable ${part}.`
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part)) return `Invalid route segment ${part}.`
  }
  const shape = template.replace(/\{[A-Za-z]+\}/g, ':value')
  if (reservedPatterns.has(shape))
    return `The route pattern ${template} conflicts with an application route.`
  return null
}

export function validateRouteTemplates(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value))
    return 'Route templates must be an object keyed by supported content type.'
  const templates = value as Record<string, unknown>
  const knownKinds = new Set(Object.keys(SEMANTIC_ROUTE_DEFAULTS))
  for (const [kind, raw] of Object.entries(templates)) {
    if (!knownKinds.has(kind)) return `Unsupported route type ${kind}.`
    if (typeof raw !== 'string') return `The ${kind} route template must be text.`
    if (
      !configurableKinds.has(kind as SemanticKind) &&
      raw !== SEMANTIC_ROUTE_DEFAULTS[kind as SemanticKind]
    )
      return `${kind} uses a fixed renderer path and cannot be customized safely yet.`
    const error = validateRouteTemplate(raw)
    if (error) return `${kind}: ${error}`
    const unsupported = [...raw.matchAll(/\{([A-Za-z]+)\}/g)]
      .map((match) => match[1]!)
      .find((variable) => !variablesByKind[kind as SemanticKind].has(variable))
    if (unsupported) return `${kind}: {${unsupported}} is not supported for this type.`
  }
  const effective = Object.entries(SEMANTIC_ROUTE_DEFAULTS).map(([kind, fallback]) => ({
    kind,
    template: (templates[kind] as string | undefined) ?? fallback,
  }))
  for (let index = 0; index < effective.length; index++) {
    const current = effective[index]!
    const conflict = effective
      .slice(index + 1)
      .find((entry) => routeTemplatesOverlap(current.template, entry.template))
    if (conflict)
      return `${current.kind} and ${conflict.kind} route templates can resolve to the same path.`
  }
  return null
}

export function readRouteTemplates(value: unknown): SemanticRouteTemplates {
  if (validateRouteTemplates(value)) return {}
  return (value ?? {}) as SemanticRouteTemplates
}

export function readRouteTemplatesBySite(
  value: unknown,
  defaults: SemanticRouteTemplates = {},
): Record<string, SemanticRouteTemplates> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([siteId, templates]) => {
      if (!siteId || validateRouteTemplates(templates)) return []
      const merged = { ...defaults, ...(templates as SemanticRouteTemplates) }
      if (validateRouteTemplates(merged)) return []
      return [[siteId, readRouteTemplates(templates)]]
    }),
  )
}

export function validateRouteTemplatesBySite(
  value: unknown,
  defaults: SemanticRouteTemplates = {},
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value))
    return 'Site route templates must be an object keyed by site id.'
  for (const [siteId, templates] of Object.entries(value as Record<string, unknown>)) {
    if (!siteId.trim()) return 'A site id is required for each route-template group.'
    const error = validateRouteTemplates(templates)
    if (error) return `Site ${siteId}: ${error}`
    const mergedError = validateRouteTemplates({
      ...defaults,
      ...(templates as SemanticRouteTemplates),
    })
    if (mergedError) return `Site ${siteId}: ${mergedError}`
  }
  return null
}

export function routeTemplatesForSite(
  siteId: string | null | undefined,
  defaults: SemanticRouteTemplates = {},
  bySite: Record<string, SemanticRouteTemplates> = {},
): SemanticRouteTemplates {
  return { ...defaults, ...(siteId ? bySite[siteId] : {}) }
}

export function resolvePublicUrl(
  record: SemanticRecord,
  templates: SemanticRouteTemplates = {},
): string {
  if (record.canonicalPath) return validatePublicPath(record.canonicalPath)
  const template = templates[record.kind] ?? SEMANTIC_ROUTE_DEFAULTS[record.kind]
  const error = validateRouteTemplate(template)
  if (error) throw new Error(error)
  const values: Record<string, string | null | undefined> = {
    slug: record.slug,
    jurisdiction: record.jurisdiction,
    eventSlug: record.eventSlug,
    parentTopic: record.parentTopic,
    mediaType: record.mediaType,
    forumSlug: record.forumSlug,
  }
  const resolvedPath = template.replace(/\{([A-Za-z]+)\}/g, (_, key: string) => {
    const value = normalizeSemanticSlug(values[key] ?? '')
    if (!value) throw new Error(`A ${key} value is required for ${record.kind}.`)
    return value
  })
  return validatePublicPath(resolvedPath)
}

export function validatePublicPath(path: string): string {
  if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(path))
    throw new Error('Canonical paths use lowercase URL segments separated by single hyphens.')
  if (reserved.has(path.split('/')[1])) throw new Error(`/${path.split('/')[1]} is reserved.`)
  if (reservedStaticPaths.has(path)) throw new Error(`${path} is reserved by an application route.`)
  return path
}

export function isSafeSemanticRequestPath(path: string): boolean {
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(path)
  )
    return false
  try {
    return path
      .split(/[?#]/, 1)[0]!
      .split('/')
      .every((segment) => {
        const decoded = decodeURIComponent(segment)
        return (
          decoded !== '.' && decoded !== '..' && !decoded.includes('/') && !decoded.includes('\\')
        )
      })
  } catch {
    return false
  }
}

export function resolveCanonicalUrl(
  record: SemanticRecord,
  origin: string,
  templates?: SemanticRouteTemplates,
): string {
  return new URL(resolvePublicUrl(record, templates), origin).toString()
}
