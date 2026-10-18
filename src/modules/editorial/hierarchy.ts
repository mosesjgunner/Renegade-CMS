import { sql } from '@payloadcms/db-postgres'
import { APIError } from 'payload'
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  Payload,
  PayloadRequest,
} from 'payload'
import { validatePublicPath } from '../public/semantic-url'
import { assertRecordSemanticPath } from '../public/semantic-url-service'
import { transactionPayload } from '../core/transaction-payload'

export class HierarchyError extends APIError {
  constructor(message: string) {
    super(message, 400, undefined, true)
  }
}

export const hierarchyId = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'id' in value
    ? String(value.id)
    : typeof value === 'string'
      ? value
      : ''
export const hierarchyIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(hierarchyId).filter(Boolean)
    : hierarchyId(value)
      ? [hierarchyId(value)]
      : []
type Node = Record<string, unknown>
type Reference = { collection: string; field: string; many?: boolean }
const references: Record<string, Reference[]> = {
  sections: [
    { collection: 'categories', field: 'section' },
    { collection: 'content', field: 'sections', many: true },
  ],
  categories: [
    { collection: 'categories', field: 'parent' },
    { collection: 'albums', field: 'category' },
    { collection: 'content', field: 'categories', many: true },
  ],
  albums: [
    { collection: 'content', field: 'collections', many: true },
    { collection: 'media-assets', field: 'collections', many: true },
  ],
  content: [
    { collection: 'content', field: 'parentPage' },
    { collection: 'article-family-content', field: 'content' },
  ],
}

/** Parent writes and deletes serialize with child writes in the same Payload transaction. */
async function lock(req: PayloadRequest, collection: string, id: string) {
  if (!id || !req.payload.db) return
  const transactionID = await req.transactionID
  const session = req.payload.db.sessions?.[String(transactionID)]?.db as
    | { execute: (statement: unknown) => Promise<unknown> }
    | undefined
  if (!session) throw new HierarchyError('Hierarchy changes require a database transaction.')
  await session.execute(
    sql`SELECT id FROM ${sql.identifier(collection.replaceAll('-', '_'))} WHERE id = ${id} FOR NO KEY UPDATE`,
  )
}
async function get(req: PayloadRequest, collection: string, id: string): Promise<Node> {
  await lock(req, collection, id)
  return (await req.payload.findByID({
    collection: collection as never,
    id,
    depth: 0,
    overrideAccess: true,
    req,
  })) as unknown as Node
}
async function hasReferences(req: PayloadRequest, collection: string, id: string) {
  for (const ref of references[collection] ?? []) {
    if (!req.payload.collections[ref.collection as keyof Payload['collections']]) continue
    const result = await req.payload.count({
      collection: ref.collection as never,
      where: { [ref.field]: ref.many ? { in: [id] } : { equals: id } },
      overrideAccess: true,
      req,
    })
    if (result.totalDocs) return true
  }
  return false
}
export const protectHierarchyDelete =
  (collection: string): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    await lock(req, collection, String(id))
    if (await hasReferences(req, collection, String(id)))
      throw new HierarchyError(
        collection === 'content'
          ? 'Content with child pages or editorial revision history cannot be deleted. Move child pages first; archive content with revision history instead.'
          : 'Move or detach dependent hierarchy records before deleting this record.',
      )
  }

export const guardHierarchyNode =
  (collection: 'sections' | 'categories' | 'albums'): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req }) => {
    const next = { ...originalDoc, ...data } as Node
    const site = hierarchyId(next.site)
    if (!site) throw new HierarchyError('A hierarchy record must belong to a site.')
    await get(req, 'sites', site)
    if (originalDoc?.id) await lock(req, collection, String(originalDoc.id))
    if (
      originalDoc?.id &&
      ['site', 'section', 'publication', 'scope'].some(
        (field) =>
          field in (data ?? {}) && hierarchyId(data?.[field]) !== hierarchyId(originalDoc[field]),
      )
    ) {
      if (await hasReferences(req, collection, String(originalDoc.id)))
        throw new HierarchyError(
          'Move or detach dependent records before changing hierarchy scope.',
        )
    }
    const publication = hierarchyId(next.publication)
    if (publication && hierarchyId((await get(req, 'publications', publication)).site) !== site)
      throw new HierarchyError('The publication must belong to the same site.')
    if (next.scope === 'publication' && !publication)
      throw new HierarchyError('A publication is required for publication scope.')
    if (collection === 'categories') {
      const parentId = hierarchyId(next.parent)
      if (parentId) {
        const visited = new Set<string>(originalDoc?.id ? [String(originalDoc.id)] : [])
        let currentId = parentId
        let parent: Node | undefined
        while (currentId) {
          if (visited.has(currentId))
            throw new HierarchyError(
              'A category cannot be its own parent or be moved below a descendant.',
            )
          visited.add(currentId)
          const current = await get(req, 'categories', currentId)
          if (hierarchyId(current.site) !== site)
            throw new HierarchyError('A category parent must belong to the same site.')
          parent ??= current
          currentId = hierarchyId(current.parent)
        }
        if (hierarchyId(next.section) !== hierarchyId(parent?.section))
          throw new HierarchyError('A category and its parent must belong to the same section.')
        if (
          hierarchyId(next.publication) !== hierarchyId(parent?.publication) ||
          next.scope !== parent?.scope
        )
          throw new HierarchyError('A category and its parent must use the same publication scope.')
      }
      const sectionId = hierarchyId(next.section)
      if (sectionId && hierarchyId((await get(req, 'sections', sectionId)).site) !== site)
        throw new HierarchyError('The section must belong to the same site.')
    }
    if (collection === 'albums') {
      const categoryId = hierarchyId(next.category)
      if (categoryId && hierarchyId((await get(req, 'categories', categoryId)).site) !== site)
        throw new HierarchyError('The collection category must belong to the same site.')
    }
    if (collection !== 'albums') {
      const path =
        originalDoc?.canonicalPath || data?.canonicalPath || `/${collection}/${String(next.slug)}`
      data.canonicalPath = validatePublicPath(String(path))
      const collisions = await req.payload.find({
        collection: collection as never,
        where: {
          and: [
            { site: { equals: site } },
            { canonicalPath: { equals: path } },
            ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
          ],
        },
        depth: 0,
        limit: 1,
        overrideAccess: true,
        req,
      })
      if (collisions.docs.length)
        throw new HierarchyError('Another hierarchy record already uses this canonical path.')
      await assertRecordSemanticPath({
        payload: transactionPayload(req.payload, req),
        collection,
        data,
        originalDoc,
      })
    }
    return data
  }

export const guardContentHierarchy: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const next = { ...originalDoc, ...data } as Node
  if (
    ['article', 'page'].includes(String(next.contentType)) &&
    ['published', 'updated'].includes(String(next.status)) &&
    !next.body
  )
    throw new HierarchyError('Add content in the editor before publishing this Post or Page.')
  const site = hierarchyId(next.site)
  await get(req, 'sites', site)
  for (const [field, collection] of [
    ['sections', 'sections'],
    ['categories', 'categories'],
    ['collections', 'albums'],
  ] as const) {
    for (const id of [...new Set(hierarchyIds(next[field]))].sort()) {
      const related = await get(req, collection, id)
      if (hierarchyId(related.site) !== site)
        throw new HierarchyError(`${field} must belong to the same site as this content.`)
    }
  }
  const parent = hierarchyId(next.parentPage)
  const visited = new Set<string>(originalDoc?.id ? [String(originalDoc.id)] : [])
  let current = parent
  while (current) {
    if (visited.has(current)) throw new HierarchyError('A page cannot be its own ancestor.')
    visited.add(current)
    const record = await get(req, 'content', current)
    if (
      record.contentType !== 'page' ||
      next.contentType !== 'page' ||
      hierarchyId(record.site) !== site
    )
      throw new HierarchyError('A page parent must be a Page in the same site.')
    current = hierarchyId(record.parentPage)
  }
  return data
}

export const protectSiteHierarchyDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await lock(req, 'sites', String(id))
  const hasSite = (fields: Payload['config']['collections'][number]['fields']): boolean =>
    fields.some(
      (field) =>
        ('name' in field &&
          field.name === 'site' &&
          field.type === 'relationship' &&
          field.relationTo === 'sites') ||
        ('fields' in field && !('name' in field) && hasSite(field.fields)) ||
        ('tabs' in field && field.tabs.some((tab) => hasSite(tab.fields))),
    )
  for (const collection of req.payload.config.collections) {
    if (!hasSite(collection.fields)) continue
    const result = await req.payload.count({
      collection: collection.slug as never,
      where: { site: { equals: id } },
      overrideAccess: true,
      req,
    })
    if (result.totalDocs)
      throw new HierarchyError(
        `The site still contains ${collection.slug}. Remove or move those records first.`,
      )
  }
}
