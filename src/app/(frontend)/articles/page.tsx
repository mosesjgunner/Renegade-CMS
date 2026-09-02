import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import type { Metadata } from 'next'

import { resolveSiteSettings } from '@/modules/core/site-settings'

export const dynamic = 'force-dynamic'

type Args = {
  searchParams?: Promise<{ page?: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  const payload = await getPayload({ config })
  const settings = await resolveSiteSettings(payload)
  return {
    title: `Articles — ${settings.siteName}`,
    description: `Archive of published articles from ${settings.siteName}.`,
    alternates: {
      canonical: `${settings.canonicalOrigin}/articles`,
    },
    robots: {
      index: settings.indexingMode !== 'noindex',
      follow: settings.indexingMode !== 'noindex',
    },
  }
}

export default async function ArticlesArchivePage({ searchParams }: Args) {
  const params = (await searchParams) ?? {}
  const currentPage = Math.max(1, Number(params.page || 1))
  const pageSize = 12

  const payload = await getPayload({ config })
  const settings = await resolveSiteSettings(payload)

  const publications = await payload.find({
    collection: 'publications',
    where: { and: [{ status: { equals: 'active' } }, { visibility: { equals: 'public' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const publication = publications.docs[0] as unknown as Record<string, unknown> | undefined
  const siteId =
    typeof publication?.site === 'string'
      ? publication.site
      : (publication?.site as { id?: string } | undefined)?.id

  const results = await payload.find({
    collection: 'content',
    where: {
      and: [
        ...(siteId ? [{ site: { equals: siteId } }] : []),
        { contentType: { equals: 'article' } },
        { status: { equals: 'published' } },
      ],
    } as never,
    page: currentPage,
    limit: pageSize,
    sort: '-publishedAt',
    depth: 1,
    overrideAccess: true,
  })

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 md:py-16">
      <header className="mb-10 border-b border-stone-200 dark:border-stone-800 pb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-stone-950 dark:text-white">
              Articles Archive
            </h1>
            <p className="mt-2 text-base text-stone-600 dark:text-stone-400">
              Browse published dispatches, reports, and perspectives from {settings.siteName}.
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 self-start rounded-md border border-stone-300 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            <span>🔍</span>
            <span>Search Articles</span>
          </Link>
        </div>
      </header>

      {results.docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-12 text-center dark:border-stone-700">
          <p className="text-base text-stone-600 dark:text-stone-400">
            No published articles found in the archive.
          </p>
        </div>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {results.docs.map((articleDoc) => {
            const article = articleDoc as unknown as Record<string, unknown>
            const publishedDate =
              typeof article.publishedAt === 'string' ? article.publishedAt : null
            const slug = String(article.slug ?? '')
            const title = String(article.title ?? '')
            const summary =
              typeof article.summary === 'string'
                ? article.summary
                : typeof article.excerpt === 'string'
                  ? article.excerpt
                  : null
            return (
              <article
                key={String(article.id)}
                className="flex flex-col justify-between rounded-lg border border-stone-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 mb-2">
                    {publishedDate ? (
                      <time dateTime={publishedDate}>
                        {new Date(publishedDate).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    ) : null}
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-white line-clamp-2">
                    <Link
                      href={`/articles/${slug}`}
                      className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      {title}
                    </Link>
                  </h2>
                  {summary ? (
                    <p className="mt-3 text-sm text-stone-600 dark:text-stone-400 line-clamp-3">
                      {summary}
                    </p>
                  ) : null}
                </div>
                <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                  <Link
                    href={`/articles/${slug}`}
                    className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                  >
                    Read full article →
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {results.totalPages > 1 ? (
        <nav
          aria-label="Archive pagination"
          className="mt-12 flex items-center justify-between border-t border-stone-200 pt-6 dark:border-stone-800"
        >
          {results.hasPrevPage ? (
            <Link
              href={`/articles?page=${currentPage - 1}`}
              className="rounded border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-stone-600 dark:text-stone-400">
            Page {currentPage} of {results.totalPages}
          </span>
          {results.hasNextPage ? (
            <Link
              href={`/articles?page=${currentPage + 1}`}
              className="rounded border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  )
}
