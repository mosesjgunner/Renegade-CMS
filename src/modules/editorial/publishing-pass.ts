/**
 * PUB-02's single editorial URL contract. `content` owns the public identity
 * and editorial body; article-family-content is the workflow/revision index.
 * Page layouts are a separate presentation projection and must never own prose.
 */
import {
  normalizeSemanticSlug,
  readRouteTemplates,
  readRouteTemplatesBySite,
  resolvePublicUrl,
  routeTemplatesForSite,
  validatePublicPath,
} from '../public/semantic-url'

const idOf = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id)
      : ''

export function editorialSlug(value: unknown): string {
  return normalizeSemanticSlug(String(value ?? ''))
}

export function assertEditorialPath(path: string): void {
  validatePublicPath(path)
}

export async function deriveEditorialPath(input: {
  data: Record<string, unknown>
  originalDoc?: Record<string, unknown> | null
  semanticRouteChange?: boolean
  payload: {
    findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
    findGlobal?: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}): Promise<Record<string, unknown>> {
  const data = input.data
  const original = input.originalDoc
  const pathInputsChanged =
    !original ||
    ['title', 'slug', 'contentType', 'parentPage', 'pathOverride'].some((key) => {
      if (!(key in data)) return false
      const next = key === 'parentPage' ? idOf(data[key]) : data[key]
      const previous = key === 'parentPage' ? idOf(original[key]) : original[key]
      return next !== previous
    })
  if (!pathInputsChanged && !input.semanticRouteChange && original?.canonicalPath) return data
  const contentType = String(data.contentType ?? input.originalDoc?.contentType ?? 'article')
  const title = String(data.title ?? input.originalDoc?.title ?? '')
  const slug = editorialSlug(data.slug ?? input.originalDoc?.slug ?? title)
  if (!slug) throw new Error('A title or URL slug is required.')
  data.slug = slug

  // Older canonical records supplied a deliberate path before PUB-02 had an
  // explicit checkbox. Preserve that intent during upserts/migration.
  if (data.canonicalPath && !original) data.pathOverride = true
  const isOverride =
    data.pathOverride === true ||
    (data.pathOverride === undefined && Boolean(original?.pathOverride))
  const targetPath = data.canonicalPath ?? original?.canonicalPath
  if (isOverride && targetPath) {
    assertEditorialPath(String(targetPath))
    data.canonicalPath = targetPath
    return data
  }

  let routeTemplates: Record<string, string> = {}
  if (input.payload.findGlobal) {
    const settings = await input.payload.findGlobal({
      slug: 'site-settings',
      depth: 0,
      overrideAccess: true,
    })
    const siteId = idOf(data.site ?? original?.site)
    routeTemplates = routeTemplatesForSite(
      siteId,
      readRouteTemplates(settings.semanticRouteTemplates),
      readRouteTemplatesBySite(
        settings.semanticRouteTemplatesBySite,
        readRouteTemplates(settings.semanticRouteTemplates),
      ),
    )
  }
  const path = resolvePublicUrl(
    { kind: contentType === 'page' ? 'page' : 'article', slug },
    routeTemplates,
  )
  const parentId = idOf(data.parentPage ?? input.originalDoc?.parentPage)
  if (contentType === 'page' && parentId) {
    const parent = await input.payload.findByID({ collection: 'content', id: parentId, depth: 0 })
    if (parent.contentType !== 'page') throw new Error('A page parent must be a Page.')
    const site = idOf(data.site ?? input.originalDoc?.site)
    if (site && idOf(parent.site) !== site)
      throw new Error('A page parent must belong to the same site.')
  }
  data.canonicalPath = path
  return data
}

export async function assertEditorialPathAvailable(input: {
  data: Record<string, unknown>
  originalDoc?: Record<string, unknown> | null
  payload: { find: (args: Record<string, unknown>) => Promise<{ docs: Array<{ id: unknown }> }> }
}): Promise<void> {
  const path = String(input.data.canonicalPath ?? input.originalDoc?.canonicalPath ?? '')
  const site = idOf(input.data.site ?? input.originalDoc?.site)
  if (!path || !site) return
  const currentId = String(input.originalDoc?.id ?? '')
  const matches = await input.payload.find({
    collection: 'content',
    where: {
      and: [
        { site: { equals: site } },
        { canonicalPath: { equals: path } },
        ...(currentId ? [{ id: { not_equals: currentId } }] : []),
      ],
    },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  if (matches.docs.length) throw new Error(`Another record in this site already uses ${path}.`)

  const sharedPayload = input.payload as typeof input.payload & {
    collections?: Record<string, unknown>
  }
  const otherCollections = [
    'events',
    'timelines',
    'albums',
    'books',
    'products',
    'discussions',
    'forums',
    'categories',
    'sections',
    'podcast-shows',
    'podcast-episodes',
    'videos',
    'topics',
  ].filter((collection) => !sharedPayload.collections || collection in sharedPayload.collections)
  const [otherCollision, redirectCollision, layoutCollision, formCollision] = await Promise.all([
    Promise.all(
      otherCollections.map(async (collection) => {
        try {
          const result = await input.payload.find({
            collection,
            where: { and: [{ site: { equals: site } }, { canonicalPath: { equals: path } }] },
            depth: 0,
            limit: 1,
            overrideAccess: true,
          })
          return result.docs.length ? collection : null
        } catch {
          return null
        }
      }),
    ).then((collections) => collections.find(Boolean)),
    input.payload
      .find({
        collection: 'public-redirects',
        where: {
          and: [
            { site: { equals: site } },
            { fromPath: { equals: path } },
            { enabled: { equals: true } },
          ],
        },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      .then((result) => Boolean(result.docs.length))
      .catch(() => false),
    input.payload
      .find({
        collection: 'page-layouts',
        where: { and: [{ site: { equals: site } }, { path: { equals: path } }] },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      .then((result) => Boolean(result.docs.length))
      .catch(() => false),
    input.payload
      .find({
        collection: 'form-definitions',
        where: { and: [{ site: { equals: site } }, { publicPath: { equals: path } }] },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      .then((result) => Boolean(result.docs.length))
      .catch(() => false),
  ])
  if (otherCollision) throw new Error(`The path ${path} is already used by ${otherCollision}.`)
  if (redirectCollision) throw new Error(`The path ${path} is reserved by an existing redirect.`)
  if (layoutCollision) throw new Error(`The path ${path} is already used by a page layout.`)
  if (formCollision) throw new Error(`The path ${path} is already used by a public form.`)
}

export const archiveQueryContract = {
  posts: { collection: 'content', where: { contentType: { equals: 'article' } } },
  pages: { collection: 'content', where: { contentType: { equals: 'page' } } },
} as const

export const PUBLISHING_PASS_OWNERSHIP = {
  content: 'canonical identity, metadata, taxonomy, and Lexical body',
  articleFamilyContent: 'workflow and immutable revision index; never an editor entry point',
  pageLayouts: 'optional visual presentation projection; never canonical prose',
} as const
