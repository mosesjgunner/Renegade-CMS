/**
 * PUB-02's single editorial URL contract. `content` owns the public identity
 * and editorial body; article-family-content is the workflow/revision index.
 * Page layouts are a separate presentation projection and must never own prose.
 */
const RESERVED_PATHS = new Set([
  'admin',
  'api',
  'preview',
  'search',
  'setup',
  'login',
  'logout',
  'media',
  'articles',
])

const idOf = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id)
      : ''

export function editorialSlug(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function assertEditorialPath(path: string): void {
  if (!/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path))
    throw new Error('Canonical paths use lowercase URL segments separated by single hyphens.')
  const first = path.split('/')[1]
  if (RESERVED_PATHS.has(first))
    throw new Error(`/${first} is reserved and cannot be used for content.`)
}

export async function deriveEditorialPath(input: {
  data: Record<string, unknown>
  originalDoc?: Record<string, unknown> | null
  payload: { findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown>> }
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
  if (!pathInputsChanged && original?.canonicalPath) return data
  const contentType = String(data.contentType ?? input.originalDoc?.contentType ?? 'article')
  const title = String(data.title ?? input.originalDoc?.title ?? '')
  const slug = editorialSlug(data.slug ?? input.originalDoc?.slug ?? title)
  if (!slug) throw new Error('A title or URL slug is required.')
  data.slug = slug

  // Older canonical records supplied a deliberate path before PUB-02 had an
  // explicit checkbox. Preserve that intent during upserts/migration.
  if (data.canonicalPath && !original) data.pathOverride = true
  const isOverride =
    data.pathOverride === true || (data.pathOverride === undefined && Boolean(original?.pathOverride))
  const targetPath = data.canonicalPath ?? original?.canonicalPath
  if (isOverride && targetPath) {
    assertEditorialPath(String(targetPath))
    data.canonicalPath = targetPath
    return data
  }

  let path = contentType === 'page' ? `/${slug}` : `/articles/${slug}`
  const parentId = idOf(data.parentPage ?? input.originalDoc?.parentPage)
  if (contentType === 'page' && parentId) {
    const parent = await input.payload.findByID({ collection: 'content', id: parentId, depth: 0 })
    if (parent.contentType !== 'page') throw new Error('A page parent must be a Page.')
    const site = idOf(data.site ?? input.originalDoc?.site)
    if (site && idOf(parent.site) !== site)
      throw new Error('A page parent must belong to the same site.')
    path = `${String(parent.canonicalPath).replace(/\/$/, '')}/${slug}`
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
