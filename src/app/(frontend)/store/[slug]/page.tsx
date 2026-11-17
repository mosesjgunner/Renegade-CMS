/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { isRegisteredCollection } from '@/modules/public/registered-collections'
import {
  discoveryToMetadata,
  resolveDiscoveryDocument,
  serializeJsonLd,
} from '@/modules/public/discovery'
import { ProductDetail } from '@/modules/commerce/ProductView'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const payload = await getPayload({ config })
  const { slug } = await params
  const siteId = await catalogSiteForHost(payload, (await headers()).get('host')).catch(() => null)
  const discovery = await resolveDiscoveryDocument(payload, {
    collection: 'products',
    slug,
    path: `/store/${slug}`,
    ...(siteId ? { siteId } : {}),
  })
  if (discovery.canonicalPath !== `/store/${slug}`) permanentRedirect(discovery.canonicalPath)
  return discoveryToMetadata(discovery)
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, (await headers()).get('host')).catch(() => null)
  if (!siteId || !isRegisteredCollection(payload, 'products')) notFound()
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
  const discovery = await resolveDiscoveryDocument(payload, {
    collection: 'products',
    slug,
    path: `/store/${slug}`,
    siteId,
    record: product,
  })
  if (discovery.canonicalPath !== `/store/${slug}`) permanentRedirect(discovery.canonicalPath)
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(discovery.schema.jsonLd),
        }}
      />
      <ProductDetail product={product} />
    </main>
  )
}
