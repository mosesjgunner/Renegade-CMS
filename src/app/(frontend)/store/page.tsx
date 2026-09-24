/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ProductCard } from '@/modules/commerce/ProductView'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'

export const dynamic = 'force-dynamic'
export default async function StorePage() {
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, (await headers()).get('host')).catch(() => null)
  if (!siteId) notFound()
  const products = await (payload as any).find({
    collection: 'products',
    where: { and: [{ state: { equals: 'published' } }, { site: { equals: siteId } }] },
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })
  return (
    <main className="max-w-5xl mx-auto p-8">
      <h1 className="text-3xl font-black mb-8">Store</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {products.docs.map((product: any) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {!products.docs.length ? <p>No products are published yet.</p> : null}
    </main>
  )
}
