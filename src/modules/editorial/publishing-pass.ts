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

export async function assertSeoCanonicalConflictFree(input: {
  collection: string
  data: Record<string, unknown>
  originalDoc?: Record<string, unknown> | null
  payload: {
    collections?: Record<string, unknown>
    find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
    findGlobal?: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}): Promise<void> {
  const data = input.data ?? {}
  const original = input.originalDoc ?? null
  const site = idOf(data.site ?? original?.site)
  const currentPath = String(
    data.canonicalPath ?? data.path ?? original?.canonicalPath ?? original?.path ?? '',
  ).trim()
  if (!site) return

  const overrides = (data.discoveryOverrides ?? original?.discoveryOverrides) as
    | Record<string, unknown>
    | undefined
  const rawCanonical =
    typeof data.seoCanonicalURL === 'string'
      ? data.seoCanonicalURL.trim()
      : typeof overrides?.canonical === 'string'
        ? overrides.canonical.trim()
        : !('seoCanonicalURL' in data) && typeof original?.seoCanonicalURL === 'string'
          ? original.seoCanonicalURL.trim()
          : ''

  let siteOrigin = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  if (input.payload.findGlobal) {
    try {
      const settings = await input.payload.findGlobal({
        slug: 'site-settings',
        depth: 0,
        overrideAccess: true,
      })
      const originsBySite =
        settings?.canonicalOriginsBySite && typeof settings.canonicalOriginsBySite === 'object'
          ? (settings.canonicalOriginsBySite as Record<string, unknown>)
          : {}
      const perSiteOrigin =
        typeof originsBySite[site] === 'string' && originsBySite[site].trim()
          ? String(originsBySite[site]).trim().replace(/\/$/, '')
          : null
      const defaultOrigin =
        typeof settings?.canonicalOrigin === 'string' && settings.canonicalOrigin.trim()
          ? settings.canonicalOrigin.trim().replace(/\/$/, '')
          : null
      siteOrigin = perSiteOrigin || defaultOrigin || siteOrigin
    } catch {
      /* fallback to APP_URL when global not yet seeded */
    }
  }

  let targetPath = currentPath
  if (rawCanonical) {
    let baseParsed: URL
    let parsed: URL
    try {
      baseParsed = new URL(siteOrigin)
      parsed = new URL(rawCanonical, `${siteOrigin}/`)
    } catch {
      throw new Error(`Invalid canonical URL: "${rawCanonical}".`)
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Canonical URL "${rawCanonical}" must use HTTP or HTTPS protocol.`)
    }
    if (parsed.origin !== baseParsed.origin) {
      throw new Error(
        `Canonical URL "${rawCanonical}" cannot cross the site origin boundary (${parsed.origin} !== ${baseParsed.origin}).`,
      )
    }
    if (parsed.search || parsed.hash) {
      throw new Error(
        `Canonical URL "${rawCanonical}" cannot contain query parameters or fragments.`,
      )
    }
    targetPath = parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/+$/, '')
    const normalizedCanonical = new URL(targetPath, `${siteOrigin}/`).toString()
    if (typeof data.seoCanonicalURL === 'string' && data.seoCanonicalURL.trim()) {
      data.seoCanonicalURL = normalizedCanonical
    }

    if (targetPath !== currentPath && targetPath !== '/') {
      const redirectResult = await input.payload
        .find({
          collection: 'public-redirects',
          where: {
            and: [
              { site: { equals: site } },
              { fromPath: { equals: targetPath } },
              { enabled: { equals: true } },
            ],
          },
          depth: 0,
          limit: 1,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] }))
      if (redirectResult.docs.length) {
        throw new Error(
          `Conflicting canonical URL: "${targetPath}" is an active redirect source on this site.`,
        )
      }

      const candidateCollections = [
        'content',
        'categories',
        'sections',
        'topics',
        'page-layouts',
      ].filter((col) => !input.payload.collections || col in input.payload.collections)

      let targetDoc: Record<string, unknown> | null = null
      let targetCollection: string | null = null
      for (const col of candidateCollections) {
        const pathField = col === 'page-layouts' ? 'path' : 'canonicalPath'
        const res = await input.payload
          .find({
            collection: col,
            where: {
              and: [{ site: { equals: site } }, { [pathField]: { equals: targetPath } }],
            },
            depth: 0,
            limit: 1,
            overrideAccess: true,
          })
          .catch(() => ({ docs: [] }))
        if (res.docs[0]) {
          targetDoc = res.docs[0]
          targetCollection = col
          break
        }
      }

      if (!targetDoc) {
        throw new Error(
          `Conflicting canonical URL: canonical target "${targetPath}" does not exist on this site.`,
        )
      }

      const isTaxonomy =
        targetCollection === 'categories' ||
        targetCollection === 'sections' ||
        targetCollection === 'topics'
      const targetStatus = isTaxonomy ? 'published' : String(targetDoc.status ?? 'draft')
      const targetVisibility = isTaxonomy ? 'public' : String(targetDoc.visibility ?? 'public')
      const entitlement = targetDoc.requiredEntitlement as Record<string, unknown> | undefined
      const targetNoIndex =
        targetDoc.seoNoIndex === true ||
        targetDoc.removeFromDiscovery === true ||
        Boolean(
          typeof entitlement?.resource === 'string' &&
            entitlement.resource.trim() &&
            typeof entitlement?.capability === 'string' &&
            entitlement.capability.trim(),
        )
      const targetScheduledFuture =
        Boolean(targetDoc.publishedAt) &&
        new Date(String(targetDoc.publishedAt)).getTime() > Date.now()

      if (
        targetNoIndex ||
        targetScheduledFuture ||
        !['published', 'updated'].includes(targetStatus) ||
        targetVisibility !== 'public'
      ) {
        throw new Error(
          `Conflicting canonical URL: target "${targetPath}" is not an indexable public document (draft, private, scheduled, or noindex).`,
        )
      }

      const targetOverrides = targetDoc.discoveryOverrides as Record<string, unknown> | undefined
      const targetRawCanonical =
        typeof targetDoc.seoCanonicalURL === 'string' && targetDoc.seoCanonicalURL.trim()
          ? targetDoc.seoCanonicalURL.trim()
          : typeof targetOverrides?.canonical === 'string' && targetOverrides.canonical.trim()
            ? targetOverrides.canonical.trim()
            : ''
      if (targetRawCanonical) {
        try {
          const targetCanonicalParsed = new URL(targetRawCanonical, `${siteOrigin}/`)
          const targetOfTargetPath =
            targetCanonicalParsed.pathname === '/'
              ? '/'
              : targetCanonicalParsed.pathname.replace(/\/+$/, '')
          if (targetOfTargetPath !== targetPath) {
            throw new Error(
              `Conflicting canonical URL: target "${targetPath}" already points its canonical URL to "${targetOfTargetPath}" (canonical chains and loops are forbidden).`,
            )
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Conflicting canonical URL:')) {
            throw err
          }
        }
      }
    }
  }

  // Prevent breaking existing inbound canonical references when a target becomes non-self-canonical or non-indexable
  const nextNoIndex =
    typeof data.seoNoIndex === 'boolean' ? data.seoNoIndex : original?.seoNoIndex === true
  const isTaxonomySelf =
    input.collection === 'categories' ||
    input.collection === 'sections' ||
    input.collection === 'topics'
  const nextStatus = isTaxonomySelf
    ? 'published'
    : String(data.status ?? original?.status ?? 'draft')
  const nextVisibility = isTaxonomySelf
    ? 'public'
    : String(data.visibility ?? original?.visibility ?? 'public')
  const nextEntitlement = (
    'requiredEntitlement' in data ? data.requiredEntitlement : original?.requiredEntitlement
  ) as Record<string, unknown> | undefined
  const nextRestricted = Boolean(
    typeof nextEntitlement?.resource === 'string' &&
      nextEntitlement.resource.trim() &&
      typeof nextEntitlement?.capability === 'string' &&
      nextEntitlement.capability.trim(),
  )
  const becomesNonCanonicalTarget =
    (rawCanonical && targetPath !== currentPath) ||
    nextNoIndex ||
    nextRestricted ||
    (data.removeFromDiscovery ?? original?.removeFromDiscovery) === true ||
    (data.retentionMode ?? original?.retentionMode) === 'tombstone' ||
    new Date(String(data.publishedAt ?? original?.publishedAt ?? '')).getTime() > Date.now() ||
    !['published', 'updated'].includes(nextStatus) ||
    nextVisibility !== 'public'

  if (currentPath && becomesNonCanonicalTarget && original?.id) {
    const currentId = String(original.id)
    const fullCurrentUrl = new URL(currentPath, `${siteOrigin}/`).toString()
    const inboundCollections = [
      'content',
      'categories',
      'sections',
      'topics',
      'page-layouts',
    ].filter((col) => !input.payload.collections || col in input.payload.collections)
    let referenced = false
    for (const collection of inboundCollections) {
      // JSON overrides are also editable canonicals. Inspect both representations;
      // a query only on seoCanonicalURL would miss those inbound references.
      const inbound = await input.payload.find({
        collection,
        where: { site: { equals: site } },
        select: { seoCanonicalURL: true, discoveryOverrides: true },
        depth: 0,
        pagination: false,
        limit: 0,
        overrideAccess: true,
      })
      referenced = inbound.docs.some((doc) => {
        if (collection === input.collection && String(doc.id) === currentId) return false
        const overrides = doc.discoveryOverrides as Record<string, unknown> | undefined
        const canonical = doc.seoCanonicalURL || overrides?.canonical
        if (typeof canonical !== 'string' || !canonical.trim()) return false
        try {
          return new URL(canonical, `${siteOrigin}/`).toString() === fullCurrentUrl
        } catch {
          return false
        }
      })
      if (referenced) break
    }
    if (referenced) {
      throw new Error(
        `Conflicting canonical URL: "${currentPath}" is currently referenced as the canonical URL by another record on this site and cannot become non-canonical or non-indexable.`,
      )
    }
  }
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
