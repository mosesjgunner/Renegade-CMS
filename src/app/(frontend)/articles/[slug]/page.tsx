import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { EditorialArticleView } from '@/modules/editorial/ArticleView'
import { loadPublishedArticleBySlug } from '@/modules/editorial/persistence'
import { buildMetadata } from '@/modules/public/seo'

import { resolveSiteSettings } from '@/modules/core/site-settings'

type Args = {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  try {
    const payload = await getPayload({ config })
    const settings = await resolveSiteSettings(payload)
    const result = await payload.find({
      collection: 'content',
      where: { and: [{ slug: { equals: slug } }, { contentType: { equals: 'article' } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    const item = result.docs[0] as unknown as Record<string, unknown> | undefined
    if (item)
      return buildMetadata({
        ...item,
        title: String(item.title ?? ''),
        description: typeof item.summary === 'string' ? item.summary : null,
        canonicalPath: String(item.canonicalPath ?? `/articles/${slug}`),
        siteUrl: settings.canonicalOrigin,
        siteNoIndex: settings.indexingMode === 'noindex',
      })
  } catch {
    /* recovery safe fallback */
  }
  return { robots: { index: false, follow: false } }
}

export default async function ArticlePage({ params }: Args) {
  const { slug } = await params
  const payload = await getPayload({ config })
  let article
  try {
    article = await loadPublishedArticleBySlug(payload, slug)
  } catch {
    const currentPath = `/articles/${slug}`
    const redirects = await payload
      .find({
        collection: 'public-redirects',
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => ({ docs: [] }))
    const matching = (
      redirects.docs as unknown as Array<{
        enabled?: boolean
        fromPath?: string
        toPath: string
        statusCode?: number | string
      }>
    ).find((r) => r.enabled !== false && r.fromPath === currentPath)
    if (matching) {
      if (Number(matching.statusCode) === 301 || Number(matching.statusCode) === 308) {
        permanentRedirect(matching.toPath)
      }
      redirect(matching.toPath)
    }
    notFound()
  }
  const settings = await resolveSiteSettings(payload)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    name: article.title,
    headline: article.title,
    description: article.excerpt ?? article.subtitle ?? undefined,
    url: `${settings.canonicalOrigin}${article.canonicalPath}`,
    datePublished: article.firstPublishedAt ?? undefined,
    dateModified: article.updatedAt ?? undefined,
    author: article.authors.map((name) => ({ '@type': 'Person', name })),
    publisher: {
      '@type': 'Organization',
      name: settings.siteName,
      logo: settings.logoUrl ? `${settings.canonicalOrigin}${settings.logoUrl}` : undefined,
    },
  }
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <EditorialArticleView article={article} />
    </>
  )
}
