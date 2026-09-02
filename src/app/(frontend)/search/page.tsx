import Link from 'next/link'
import config from '@payload-config'
import { getPayload } from 'payload'
import { queryLocalSearch, type SearchDocument } from '@/modules/public/discovery'
import { loadPublishedArticleByPath } from '@/modules/editorial/persistence'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: true }, title: 'Search' }

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; site?: string }>
}) {
  const { q = '', page, site } = await searchParams
  const payload = await getPayload({ config })
  const publications = await payload.find({
    collection: 'publications',
    where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
    depth: 0,
    limit: 1,
    sort: '-createdAt',
    overrideAccess: true,
  } as never)
  const publication = publications.docs[0] as unknown as
    | { site?: string | { id?: string } }
    | undefined
  const siteId =
    site ??
    (typeof publication?.site === 'string' ? publication.site : String(publication?.site?.id ?? ''))
  const result = await payload.find({
    collection: 'content',
    where: { site: { equals: siteId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  } as never)
  const published = await Promise.all(
    (result.docs as unknown as Array<Record<string, unknown>>).map(async (item) => {
      try {
        const view = await loadPublishedArticleByPath(payload, {
          siteId,
          path: String(item.canonicalPath ?? ''),
        })
        return { item, view }
      } catch {
        return null
      }
    }),
  )
  const search = queryLocalSearch({
    documents: published.flatMap((entry) =>
      entry
        ? [
            {
              id: String(entry.item.id),
              siteId,
              path: entry.view.canonicalPath,
              title: entry.view.title,
              summary: entry.view.excerpt,
              body: entry.view.bodyText,
              status: 'published',
              visibility: entry.item.visibility as SearchDocument['visibility'],
              removeFromDiscovery: entry.item.removeFromDiscovery === true,
              publishedAt: entry.view.firstPublishedAt,
              updatedAt: entry.view.updatedAt,
            },
          ]
        : [],
    ),
    query: q,
    siteId,
    page: Number(page) || 1,
  })
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <h1>Search</h1>
      <form>
        <label htmlFor="q">Search public content</label>
        <input id="q" name="q" defaultValue={q} className="ml-3 border p-2" />
        <button className="ml-2 border p-2">Search</button>
      </form>
      {q && !search.total ? <p>No public results found.</p> : null}
      {search.hits.map((hit) => (
        <article key={hit.id}>
          <h2>
            <Link href={hit.path}>{hit.title}</Link>
          </h2>
          <p>{hit.excerpt}</p>
        </article>
      ))}
    </main>
  )
}
