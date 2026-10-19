import Link from 'next/link'
import { notFound } from 'next/navigation'
import { archivePageNumber, paginateArchive, ArchivePagination } from './archive-pagination'
import type { HierarchyGraph, HierarchyNode } from './hierarchy'
import { hierarchyTrail } from './hierarchy'

export function HierarchyBreadcrumbs({ trail }: { trail: Array<{ name: string; path: string }> }) {
  if (!trail.length) return null
  return (
    <nav aria-label="Hierarchy breadcrumb" className="mx-auto max-w-6xl px-6 pt-6 text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {trail.map((item, index) => (
          <li key={item.path} className="flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {index === trail.length - 1 ? (
              <span aria-current="page">{item.name}</span>
            ) : (
              <Link className="underline underline-offset-4" href={item.path}>
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
export function HierarchyView({
  graph,
  kind,
  node,
  page: rawPage,
}: {
  graph: HierarchyGraph
  page?: string | null
  kind?: 'section' | 'category' | 'collection'
  node?: HierarchyNode
}) {
  const children = !kind
    ? graph.sections
    : kind === 'section'
      ? graph.categories.filter((item) => item.section === node?.id && !item.parent)
      : kind === 'category'
        ? graph.categories.filter((item) => item.parent === node?.id)
        : []
  const collections =
    kind === 'category' ? graph.collections.filter((item) => item.category === node?.id) : []
  const content = graph.content.filter((item) =>
    kind === 'collection'
      ? item.collections.includes(node!.id)
      : kind === 'category'
        ? item.categories.includes(node!.id)
        : kind === 'section'
          ? item.sections.includes(node!.id)
          : false,
  )
  const page = archivePageNumber(rawPage)
  if (page === null) notFound()
  const result = paginateArchive([...children, ...collections, ...content], page)
  if (!result.valid) notFound()
  const items = result.docs
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 space-y-6">
      <HierarchyBreadcrumbs
        trail={
          node && kind
            ? hierarchyTrail(graph, kind, node)
            : [{ name: graph.site.name, path: '/browse' }]
        }
      />
      <h1 className="text-3xl font-semibold">{node?.name ?? graph.site.name}</h1>
      <p>
        {kind === 'collection'
          ? 'Published content in this collection.'
          : 'Browse sections, categories and collections.'}
      </p>
      {items.length ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                className="block rounded border border-current/15 px-4 py-3 hover:underline"
                href={item.path}
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>No {kind === 'collection' ? 'published content' : 'hierarchy entries'} yet.</p>
      )}
      <ArchivePagination
        path={node?.path || '/browse'}
        page={page}
        totalPages={result.totalPages}
      />
    </main>
  )
}
