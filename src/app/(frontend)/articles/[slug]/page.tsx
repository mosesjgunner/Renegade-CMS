import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { EditorialArticleView } from '@/modules/editorial/ArticleView'
import { loadPublishedArticleBySlug } from '@/modules/editorial/persistence'
import { buildMetadata } from '@/modules/public/seo'

type Args = {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  try {
    const payload = await getPayload({ config })
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
        siteUrl: process.env.APP_URL ?? 'http://localhost:3000',
      })
  } catch {
    /* recovery safe fallback */
  }
  return { robots: { index: false, follow: false } }
}

export default async function ArticlePage({ params }: Args) {
  const { slug } = await params
  const payload = await getPayload({ config })

  const article = await loadPublishedArticleBySlug(payload, slug).catch(() => notFound())
  return <EditorialArticleView article={article} />
}
