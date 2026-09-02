import config from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import type { Metadata } from 'next'

import { canRenderPublic, type PublicState } from '@/modules/public/contracts'
import { PublicLayout } from '@/modules/public/PublicLayout'
import { resolveSiteSettings } from '@/modules/core/site-settings'
import { loadPublishedArticleByPath } from '@/modules/editorial/persistence'
import { EditorialArticleView } from '@/modules/editorial/ArticleView'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const payload = await getPayload({ config })
  const settings = await resolveSiteSettings(payload)

  const isIndexable = settings.indexingMode !== 'noindex'

  return {
    title: settings.siteName,
    description: settings.siteDescription || undefined,
    alternates: {
      canonical: `${settings.canonicalOrigin}/`,
    },
    openGraph: {
      title: settings.siteName,
      description: settings.siteDescription || undefined,
      url: `${settings.canonicalOrigin}/`,
      siteName: settings.siteName,
      images: settings.defaultSocialImageUrl
        ? [{ url: `${settings.canonicalOrigin}${settings.defaultSocialImageUrl}` }]
        : [],
    },
    twitter: {
      card: settings.defaultSocialImageUrl ? 'summary_large_image' : 'summary',
      title: settings.siteName,
      description: settings.siteDescription || undefined,
      images: settings.defaultSocialImageUrl
        ? [`${settings.canonicalOrigin}${settings.defaultSocialImageUrl}`]
        : [],
    },
    robots: {
      index: isIndexable,
      follow: isIndexable,
    },
  }
}

export default async function HomePage() {
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

  // 1. Check configured homepageSelection mode
  const { mode, pageId, layoutId } = settings.homepageSelection

  if (mode === 'page' && pageId) {
    let editorial
    try {
      const pageDoc = (await payload.findByID({
        collection: 'content',
        id: pageId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Record<string, unknown>
      if (pageDoc?.canonicalPath) {
        editorial = await loadPublishedArticleByPath(payload, {
          siteId: siteId ?? '',
          path: String(pageDoc.canonicalPath),
        })
      }
    } catch {
      // Fall through if selected page is unpublished or not found
    }
    if (editorial) {
      return <EditorialArticleView article={editorial} />
    }
  }

  if (mode === 'layout' && layoutId) {
    let layoutToRender: (PublicState & Record<string, unknown>) | undefined
    try {
      const layoutDoc = (await payload.findByID({
        collection: 'page-layouts',
        id: layoutId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as (PublicState & Record<string, unknown>) | undefined
      if (layoutDoc && canRenderPublic(layoutDoc)) {
        layoutToRender = layoutDoc
      }
    } catch {
      // Fall through if layout not found
    }
    if (layoutToRender) {
      return <PublicLayout record={layoutToRender} path="/" />
    }
  }

  // 2. Default: check if canonical content or layout exists for '/'
  if (siteId) {
    let rootPage
    try {
      rootPage = await loadPublishedArticleByPath(payload, { siteId, path: '/' })
    } catch {
      // No root content article
    }
    if (rootPage) {
      return <EditorialArticleView article={rootPage} />
    }

    const layouts = await payload.find({
      collection: 'page-layouts',
      where: { and: [{ site: { equals: siteId } }, { path: { equals: '/' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const layout = layouts.docs[0] as unknown as (PublicState & Record<string, unknown>) | undefined
    if (layout && canRenderPublic(layout)) {
      return <PublicLayout record={layout} path="/" />
    }
  }

  // 3. First-party starter presentation: Hero + Recent Posts + Discovery
  const recentArticles = await payload.find({
    collection: 'content',
    where: {
      and: [
        ...(siteId ? [{ site: { equals: siteId } }] : []),
        { contentType: { equals: 'article' } },
        { status: { equals: 'published' } },
      ],
    } as never,
    limit: 6,
    sort: '-publishedAt',
    depth: 1,
    overrideAccess: true,
  })

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings.siteName,
    description: settings.siteDescription,
    url: `${settings.canonicalOrigin}/`,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${settings.canonicalOrigin}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        {/* Starter Hero */}
        <section className="text-center py-12 md:py-16 border-b border-stone-200 dark:border-stone-800">
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-stone-950 dark:text-white font-display">
            {settings.siteName}
          </h1>
          {settings.siteDescription ? (
            <p className="mt-4 max-w-2xl mx-auto text-lg sm:text-xl text-stone-600 dark:text-stone-300">
              {settings.siteDescription}
            </p>
          ) : null}
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/articles"
              className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white transition"
            >
              Browse Articles
            </Link>
            <Link
              href="/search"
              className="rounded-md border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800 transition"
            >
              Search
            </Link>
          </div>
        </section>

        {/* Recent Articles */}
        <section className="py-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
              Recent Dispatches
            </h2>
            <Link
              href="/articles"
              className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400"
            >
              View all →
            </Link>
          </div>

          {recentArticles.docs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-300 p-12 text-center dark:border-stone-700">
              <p className="text-sm text-stone-500 dark:text-stone-400">
                No articles published yet. Publish your first post in the admin center.
              </p>
            </div>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {recentArticles.docs.map((articleDoc) => {
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
                      {publishedDate ? (
                        <time
                          dateTime={publishedDate}
                          className="text-xs text-stone-500 dark:text-stone-400"
                        >
                          {new Date(publishedDate).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </time>
                      ) : null}
                      <h3 className="mt-2 text-xl font-bold tracking-tight text-stone-900 dark:text-white line-clamp-2">
                        <Link
                          href={`/articles/${slug}`}
                          className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          {title}
                        </Link>
                      </h3>
                      {summary ? (
                        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400 line-clamp-3">
                          {summary}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800">
                      <Link
                        href={`/articles/${slug}`}
                        className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                      >
                        Read story →
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
