import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { EditorialArticleView } from '@/modules/editorial/ArticleView'
import { loadPublishedArticleBySlug } from '@/modules/editorial/persistence'

type Args = {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export default async function ArticlePage({ params }: Args) {
  const { slug } = await params
  const payload = await getPayload({ config })

  const article = await loadPublishedArticleBySlug(payload, slug).catch(() => notFound())
  return <EditorialArticleView article={article} />
}
