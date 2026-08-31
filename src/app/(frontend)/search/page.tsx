import Link from 'next/link'
import config from '@payload-config'
import { getPayload } from 'payload'
import { queryLocalSearch, type SearchDocument } from '@/modules/public/discovery'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: true }, title: 'Search' }

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q = '', page } = await searchParams
  const payload = await getPayload({ config })
  const publications = await payload.find({
    collection: 'publications',
    where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  } as never)
  const publication = publications.docs[0] as unknown as
    | { site?: string | { id?: string } }
    | undefined
  const siteId =
    typeof publication?.site === 'string' ? publication.site : String(publication?.site?.id ?? '')
  const result = await payload.find({
    collection: 'content',
    where: { site: { equals: siteId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  } as never)
  const search = queryLocalSearch({
    documents: (result.docs as unknown as Array<Record<string, unknown>>).map((item) => ({
      id: String(item.id),
      siteId,
      path: String(item.canonicalPath ?? ''),
      title: String(item.title ?? ''),
      summary: typeof item.summary === 'string' ? item.summary : null,
      excerpt: typeof item.excerpt === 'string' ? item.excerpt : null,
      status: String(item.status ?? ''),
      visibility: item.visibility as SearchDocument['visibility'],
      removeFromDiscovery: item.removeFromDiscovery === true,
      publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null,
      updatedAt: typeof item.updatedAtEditorial === 'string' ? item.updatedAtEditorial : null,
    })),
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
          <p dangerouslySetInnerHTML={{ __html: hit.excerpt }} />
        </article>
      ))}
    </main>
  )
}
