import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { EditorialArticleView } from '@/modules/editorial/ArticleView'
import { loadPublishedArticleBySlug } from '@/modules/editorial/persistence'
import {
  resolveDiscoveryDocument,
  discoveryToMetadata,
  serializeJsonLd,
} from '@/modules/public/discovery'
import { resolveSiteSettings } from '@/modules/core/site-settings'

type Args = {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  try {
    const payload = await getPayload({ config })
    const doc = await resolveDiscoveryDocument(payload, { collection: 'content', slug })
    if (!doc.indexability.indexable && (doc.indexability.reason === 'not_found' || doc.indexability.reason === 'draft')) {
      return { robots: { index: false, follow: false } }
    }
    return discoveryToMetadata(doc)
  } catch {
    return { robots: { index: false, follow: false } }
  }
}

export default async function ArticlePage({ params }: Args) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const doc = await resolveDiscoveryDocument(payload, { collection: 'content', slug })

  if (doc.redirect.isRedirect && doc.redirect.targetUrl) {
    if (doc.redirect.statusCode === 301 || doc.redirect.statusCode === 308) {
      permanentRedirect(doc.redirect.targetUrl)
    }
    redirect(doc.redirect.targetUrl)
  }

  let article
  try {
    article = await loadPublishedArticleBySlug(payload, slug)
  } catch {
    notFound()
  }

  const settings = await resolveSiteSettings(payload)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(doc.schema.jsonLd) }}
      />
      <EditorialArticleView themeId={settings.themeId} article={article} />
    </>
  )
}
