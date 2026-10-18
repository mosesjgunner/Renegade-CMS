/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ProductDetail } from '@/modules/commerce/ProductView'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'

export const dynamic = 'force-dynamic'

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, (await headers()).get('host')).catch(() => null)
  if (!siteId) notFound()
  const { slug } = await params
  const products = await (payload as any).find({
    collection: 'products',
    where: {
      and: [
        { site: { equals: siteId } },
        { state: { equals: 'published' } },
        { slug: { equals: slug } },
      ],
    },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const product = products.docs[0]
  if (!product) notFound()
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 space-y-8">
      <ProductDetail product={product} />
    </main>
  )
}
