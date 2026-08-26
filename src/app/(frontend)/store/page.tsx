/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import Link from 'next/link'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'
export default async function StorePage() {
  const payload = await getPayload({ config })
  const products = await (payload as any).find({
    collection: 'products',
    where: { state: { equals: 'published' } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return (
    <main className="max-w-5xl mx-auto p-8">
      <h1 className="text-3xl font-black mb-8">Store</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {products.docs.map((product: any) => (
          <article key={product.id} className="surface-card p-5">
            <h2 className="text-xl font-bold">{product.name}</h2>
            <p>{product.description}</p>
            <Link href={product.canonicalPath}>View product</Link>
          </article>
        ))}
      </div>
    </main>
  )
}
