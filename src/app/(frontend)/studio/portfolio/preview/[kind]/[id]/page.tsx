import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { previewPortfolio } from '@/modules/creator-studio/portfolio-public'
import { PortfolioView } from '@/modules/creator-studio/PortfolioView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Portfolio preview', robots: { index: false, follow: false } }

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>
}) {
  const [{ kind, id }, requestHeaders, payload] = await Promise.all([
    params,
    headers(),
    getPayload({ config }),
  ])
  const page = await previewPortfolio(payload, requestHeaders, kind, id)
  if (!page) notFound()
  return <PortfolioView payload={payload} page={page} />
}
