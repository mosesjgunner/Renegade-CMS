import config from '@payload-config'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { EditorialArticleView } from '@/modules/editorial/ArticleView'
import { resolveEditorialPreviewToken } from '@/modules/editorial/persistence'

type Args = {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function ArticlePreviewPage({ params, searchParams }: Args) {
  const { token } = await params
  const query = await searchParams
  const previewMode = query.viewport === 'mobile' ? 'mobile' : 'desktop'
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })

  const article = await resolveEditorialPreviewToken(
    payload,
    token,
    previewMode,
    String(auth.user?.id ?? ''),
  ).catch(() => notFound())
  return <EditorialArticleView article={article} />
}
