import { PresentationSurface } from '@/modules/presentation/Surface'
import Link from 'next/link'
import config from '@payload-config'
import { getPayload } from 'payload'
import type { Metadata } from 'next'

import {
  resolveDiscoveryDocument,
  discoveryToMetadata,
  serializeJsonLd,
} from '@/modules/public/discovery'
import { querySearchProjection } from '@/modules/public/search-projection'
import { resolveSiteSettings } from '@/modules/core/site-settings'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const payload = await getPayload({ config })
  const doc = await resolveDiscoveryDocument(payload, { path: '/search' })
  return discoveryToMetadata(doc)
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    page?: string
    site?: string
    type?: string
    author?: string
    topic?: string
    from?: string
    to?: string
  }>
}) {
  const { q = '', page, site, type, author, topic, from, to } = await searchParams
  const payload = await getPayload({ config })
  const settings = await resolveSiteSettings(payload)

  const publications = await payload.find({
    collection: 'publications',
    where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
    depth: 0,
    limit: 1,
    sort: '-createdAt',
    overrideAccess: true,
  })
  const publication = publications.docs[0] as unknown as
    | { site?: string | { id?: string } }
    | undefined
  const siteId =
    site ??
    (typeof publication?.site === 'string' ? publication.site : String(publication?.site?.id ?? ''))

  const doc = await resolveDiscoveryDocument(payload, { path: '/search', siteId })
  const currentPage = Math.max(1, Number(page) || 1)
  const pageSize = 10
  const search = await querySearchProjection(payload, {
    siteId,
    query: q,
    page: currentPage,
    pageSize,
    type,
    author,
    topic,
    from,
    to,
  })
  const queryHref = (next: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries({
      q,
      site: siteId,
      type,
      author,
      topic,
      from,
      to,
      ...next,
    }))
      if (value) params.set(key, String(value))
    return `/search?${params.toString()}`
  }

  return (
    <PresentationSurface themeId={settings.themeId} surface="search">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(doc.schema.jsonLd) }}
      />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <header className="mb-8 border-b border-stone-200 dark:border-stone-800 pb-6">
          <h1 className="text-3xl font-black tracking-tight text-stone-950 dark:text-white">
            Search {settings.siteName}
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Search published articles, pages, and dispatches across the site.
          </p>

          <form method="GET" action="/search" className="mt-6 flex gap-2">
            <input type="hidden" name="site" value={siteId} />
            <label htmlFor="q" className="sr-only">
              Search {settings.siteName}
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search keywords, topics, or phrases…"
              aria-label="Search keywords, topics, or phrases"
              className="flex-1 rounded-md border border-stone-300 bg-white px-4 py-2.5 text-stone-900 shadow-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            />
            <button
              type="submit"
              className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white transition"
            >
              Search
            </button>
            <details className="mt-3 text-sm text-stone-600 dark:text-stone-300">
              <summary>Filter results</summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  name="type"
                  defaultValue={type}
                  placeholder="Content type"
                  aria-label="Content type filter"
                  className="rounded border p-2"
                />
                <input
                  name="author"
                  defaultValue={author}
                  placeholder="Author"
                  aria-label="Author filter"
                  className="rounded border p-2"
                />
                <input
                  name="topic"
                  defaultValue={topic}
                  placeholder="Topic"
                  aria-label="Topic filter"
                  className="rounded border p-2"
                />
                <input
                  name="from"
                  defaultValue={from}
                  type="date"
                  aria-label="Published after"
                  className="rounded border p-2"
                />
                <input
                  name="to"
                  defaultValue={to}
                  type="date"
                  aria-label="Published before"
                  className="rounded border p-2"
                />
              </div>
            </details>
          </form>
        </header>

        {!q.trim() ? (
          <div className="rounded-lg border border-dashed border-stone-300 p-12 text-center dark:border-stone-700">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Enter a keyword or phrase above to search published bodies and dispatches.
            </p>
          </div>
        ) : search.total === 0 ? (
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-10 text-center dark:border-stone-800 dark:bg-stone-900/50">
            <p className="text-base font-medium text-stone-800 dark:text-stone-200">
              No public results found for &ldquo;{q}&rdquo;.
            </p>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Check your spelling or try broader keywords.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Found {search.total} public result{search.total === 1 ? '' : 's'}
            </p>

            <div className="divide-y divide-stone-200 dark:divide-stone-800">
              {search.hits.map((hit) => (
                <article key={hit.id} className="py-5 first:pt-0 last:pb-0">
                  <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-white">
                    <Link
                      href={hit.path}
                      className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      {hit.title}
                    </Link>
                  </h2>
                  <div className="mt-1 flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500">
                    <span>{hit.path}</span>
                  </div>
                  {hit.excerpt ? (
                    <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                      <HighlightedText text={hit.excerpt} query={q} />
                    </p>
                  ) : null}
                </article>
              ))}
            </div>

            {search.pageCount > 1 ? (
              <nav
                aria-label="Search pagination"
                className="mt-10 flex items-center justify-between border-t border-stone-200 pt-6 dark:border-stone-800"
              >
                {currentPage > 1 ? (
                  <Link
                    href={queryHref({ page: currentPage - 1 })}
                    className="rounded border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-sm text-stone-600 dark:text-stone-400">
                  Page {currentPage} of {search.pageCount}
                </span>
                {currentPage < search.pageCount ? (
                  <Link
                    href={queryHref({ page: currentPage + 1 })}
                    className="rounded border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </div>
        )}
      </main>
    </PresentationSurface>
  )
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const needle = query.trim()
  if (!needle) return text
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
  return (
    <>
      {parts.map((part, index) =>
        part.toLocaleLowerCase() === needle.toLocaleLowerCase() ? (
          <mark key={index}>{part}</mark>
        ) : (
          part
        ),
      )}
    </>
  )
}
