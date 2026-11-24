/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata } from 'next'
import config from '@payload-config'

export const metadata: Metadata = { title: 'Store' }
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isRegisteredCollection } from '@/modules/public/registered-collections'
import { ProductCard } from '@/modules/commerce/ProductView'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 24

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, (await headers()).get('host')).catch(() => null)
  if (!siteId || !isRegisteredCollection(payload, 'products')) notFound()
  const { q: rawQuery = '', page: rawPage = '1' } = await searchParams
  const query = rawQuery.trim()
  const page = Math.max(1, Number.parseInt(rawPage, 10) || 1)
  const conditions: Array<Record<string, unknown>> = [
    { state: { equals: 'published' } },
    { site: { equals: siteId } },
  ]
  if (query) conditions.push({ name: { like: query } })
  const products = await (payload as any).find({
    collection: 'products',
    where: { and: conditions },
    limit: PAGE_SIZE,
    page,
    depth: 1,
    overrideAccess: true,
  })
  const pageHref = (target: number) => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (target > 1) params.set('page', String(target))
    const suffix = params.toString()
    return suffix ? `/store?${suffix}` : '/store'
  }
  return (
    <main className="max-w-5xl mx-auto p-8">
      <h1 className="text-3xl font-black mb-8">Store</h1>
      <form method="get" action="/store" className="mb-8 flex gap-2" role="search">
        <label className="sr-only" htmlFor="store-search">
          Search products
        </label>
        <input
          id="store-search"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search products"
          className="rounded border p-2 text-sm bg-transparent flex-1"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded text-sm"
        >
          Search
        </button>
        {query ? (
          <Link href="/store" className="px-4 py-2 text-sm underline font-semibold">
            Clear
          </Link>
        ) : null}
      </form>
      {products.totalDocs > 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          {products.totalDocs} {products.totalDocs === 1 ? 'product' : 'products'}
          {query ? <> matching “{query}”</> : null}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {products.docs.map((product: any) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {!products.docs.length ? (
        <p>{query ? `No products match “${query}”.` : 'No products are published yet.'}</p>
      ) : null}
      {products.totalPages > 1 ? (
        <nav aria-label="Store pages" className="mt-8 flex items-center gap-4 text-sm">
          {products.hasPrevPage ? (
            <Link href={pageHref(page - 1)} className="underline font-semibold">
              ← Previous
            </Link>
          ) : null}
          <span>
            Page {products.page} of {products.totalPages}
          </span>
          {products.hasNextPage ? (
            <Link href={pageHref(page + 1)} className="underline font-semibold">
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  )
}
