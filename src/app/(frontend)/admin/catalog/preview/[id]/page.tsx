import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { ProductDetail } from '@/modules/commerce/ProductView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catalog preview', robots: { index: false, follow: false } }

export default async function CatalogPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: await headers() })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
    notFound()
  const product = await payload
    .findByID({
      collection: 'products',
      id: (await params).id,
      depth: 1,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!product) notFound()
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <aside className="rounded border border-amber-500 bg-amber-50 p-4 text-amber-950" role="note">
        Staff preview — {String((product as unknown as Record<string, unknown>).state)} revision.
      </aside>
      <ProductDetail product={product as unknown as Record<string, unknown>} />
    </main>
  )
}
