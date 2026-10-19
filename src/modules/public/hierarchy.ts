import type { Payload } from 'payload'
import { hierarchyId, hierarchyIds } from '../editorial/hierarchy'
import { canDiscoverPublic } from './contracts'

export type HierarchyNode = {
  id: string
  name: string
  path: string
  parent: string
  section: string
  category: string
  collections: string[]
  categories: string[]
  sections: string[]
}
export type HierarchyGraph = {
  site: { id: string; name: string }
  sections: HierarchyNode[]
  categories: HierarchyNode[]
  collections: HierarchyNode[]
  content: HierarchyNode[]
}
const project = (record: Record<string, unknown>): HierarchyNode => ({
  id: String(record.id),
  name: String(record.name ?? record.title ?? ''),
  path: String(record.canonicalPath ?? ''),
  parent: hierarchyId(record.parent),
  section: hierarchyId(record.section),
  category: hierarchyId(record.category),
  collections: hierarchyIds(record.collections),
  categories: hierarchyIds(record.categories),
  sections: hierarchyIds(record.sections),
})

export async function loadPublicHierarchy(payload: Payload, site: string): Promise<HierarchyGraph> {
  const [siteRecord, ...lists] = await Promise.all([
    payload.findByID({ collection: 'sites', id: site, depth: 0, overrideAccess: true }),
    ...(['sections', 'categories', 'albums', 'content'] as const).map((collection) =>
      payload.find({
        collection,
        where: {
          and: [
            { site: { equals: site } },
            ...(collection === 'content' ? [{ status: { in: ['published', 'updated'] } }] : []),
          ],
        },
        sort: ['sortOrder', 'id'],
        pagination: false,
        limit: 0,
        depth: 0,
        overrideAccess: true,
      }),
    ),
  ])
  const [sections, categories, albums, content] = lists.map(
    (list) => (list as { docs: unknown[] }).docs as Record<string, unknown>[],
  )
  return {
    site: { id: site, name: String((siteRecord as { name?: string }).name ?? '') },
    sections: sections.map(project),
    categories: categories.map(project),
    collections: albums.filter((record) => canDiscoverPublic(record)).map(project),
    content: content
      .filter(
        (record) => canDiscoverPublic(record) && !record.requiredEntitlement && !record.seoNoIndex,
      )
      .map(project),
  }
}

/** Only same-site nodes from this graph can appear in a public breadcrumb. */
export function hierarchyTrail(
  graph: HierarchyGraph,
  kind: 'section' | 'category' | 'collection' | 'content',
  node: HierarchyNode,
): Array<{ name: string; path: string }> {
  const trail: Array<{ name: string; path: string }> = [{ name: graph.site.name, path: '/browse' }]
  let category: HierarchyNode | undefined
  let collection: HierarchyNode | undefined
  if (kind === 'content')
    collection = node.collections
      .map((id) => graph.collections.find((item) => item.id === id))
      .find(Boolean)
  if (kind === 'collection') collection = node
  if (collection?.category)
    category = graph.categories.find((item) => item.id === collection.category)
  if (kind === 'category') category = node
  const ancestors: HierarchyNode[] = []
  const seen = new Set<string>()
  while (category) {
    if (seen.has(category.id)) return trail
    seen.add(category.id)
    ancestors.unshift(category)
    category = category.parent
      ? graph.categories.find((item) => item.id === category!.parent)
      : undefined
  }
  const section =
    kind === 'section' ? node : graph.sections.find((item) => item.id === ancestors[0]?.section)
  if (section?.path) trail.push({ name: section.name, path: section.path })
  for (const item of ancestors) if (item.path) trail.push({ name: item.name, path: item.path })
  if (collection?.path) trail.push({ name: collection.name, path: collection.path })
  if (kind === 'content' && node.path) trail.push({ name: node.name, path: node.path })
  return trail
}

export async function publicContentHierarchyTrail(
  payload: Payload,
  site: string,
  contentId: string,
) {
  const record = (await payload.findByID({
    collection: 'content',
    id: contentId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>
  if (
    hierarchyId(record.site) !== site ||
    !canDiscoverPublic(record) ||
    !hierarchyIds(record.collections).length
  )
    return []
  const graph = await loadPublicHierarchy(payload, site)
  const node = graph.content.find((item) => item.id === contentId)
  return node &&
    node.collections.some((id) => graph.collections.some((item) => item.id === id && item.category))
    ? hierarchyTrail(graph, 'content', node)
    : []
}
