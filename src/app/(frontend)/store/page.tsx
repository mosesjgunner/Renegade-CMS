/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Metadata } from 'next'
import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isRegisteredCollection } from '@/modules/public/registered-collections'
import { ProductCard } from '@/modules/commerce/ProductView'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { serializeJsonLd } from '@/modules/public/discovery'
import {
  ATTRIBUTE_FILTER_SCAN_CAP,
  countPublishedProducts,
  listFeaturedProducts,
  listStorefrontCategories,
  parseStorefrontParams,
  queryStorefront,
  storefrontCurrency,
  storefrontHref,
  STOREFRONT_PAGE_SIZE,
} from '@/modules/commerce/storefront'

export const dynamic = 'force-dynamic'

/**
 * Filtered, sorted and paginated variants all canonicalize to the base
 * /store URL so faceted navigation never creates duplicate index targets.
 */
export const metadata: Metadata = {
  title: 'Store',
  description: 'Browse published products, filter by category, price and availability.',
  alternates: { canonical: '/store' },
  robots: { index: true, follow: true },
}

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const payload = await getPayload({ config })
  const siteId = await catalogSiteForHost(payload, (await headers()).get('host')).catch(() => null)
  if (!siteId || !isRegisteredCollection(payload, 'products')) notFound()
  const rawParams = await searchParams
  const currency = await storefrontCurrency(payload as any, siteId)
  const params = parseStorefrontParams(rawParams, currency)
  const [result, categories, publishedCount] = await Promise.all([
    queryStorefront(payload as any, siteId, params, 1),
    listStorefrontCategories(payload as any, siteId),
    countPublishedProducts(payload as any, siteId),
  ])
  const filtersActive = Boolean(
    params.q ||
      params.category ||
      params.collection ||
      params.minInput ||
      params.maxInput ||
      params.availableOnly ||
      params.featuredOnly ||
      params.attrDimension,
  )
  // Small-catalog behavior: with a single page of products and nothing
  // filtered, filter/sort controls are noise — show search only.
  const showFilterControls = publishedCount > STOREFRONT_PAGE_SIZE || filtersActive
  const showFeaturedRail = !filtersActive && params.page === 1
  const featured = showFeaturedRail ? await listFeaturedProducts(payload as any, siteId) : []
  const currencySymbol = new Intl.NumberFormat('en-US', { style: 'currency', currency })
    .formatToParts(1)
    .find((part) => part.type === 'currency')?.value
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: result.docs.map((product: any, index: number) => ({
      '@type': 'ListItem',
      position: (params.page - 1) * params.limit + index + 1,
      url: product.canonicalPath,
      name: product.name,
    })),
  }
  return (
    <main className="max-w-5xl mx-auto p-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListJsonLd) }}
      />
      <h1 className="text-3xl font-black mb-8">Store</h1>
      {categories.length ? (
        <nav aria-label="Product categories" className="mb-6">
          <ul className="flex flex-wrap gap-2 text-sm">
            <li>
              <Link
                href={storefrontHref(params, { category: '', page: 1 })}
                aria-current={!params.category ? 'page' : undefined}
                className="rounded border px-3 py-1.5 font-semibold underline-offset-2 hover:underline"
              >
                All products
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={storefrontHref(params, { category: category.slug, page: 1 })}
                  aria-current={params.category === category.slug ? 'page' : undefined}
                  className="rounded border px-3 py-1.5 font-semibold underline-offset-2 hover:underline"
                >
                  {category.name} ({category.count})
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <form method="get" action="/store" className="mb-8 space-y-3" role="search">
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="store-search">
            Search products
          </label>
          <input
            id="store-search"
            type="search"
            name="q"
            defaultValue={params.q}
            placeholder="Search products"
            className="rounded border p-2 text-sm bg-transparent flex-1"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded text-sm"
          >
            Search
          </button>
          {filtersActive ? (
            <Link href="/store" className="px-4 py-2 text-sm underline font-semibold">
              Clear all
            </Link>
          ) : null}
        </div>
        {params.category ? <input type="hidden" name="category" value={params.category} /> : null}
        {params.collection ? (
          <input type="hidden" name="collection" value={params.collection} />
        ) : null}
        {showFilterControls ? (
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <span>
              <label htmlFor="store-min" className="block font-semibold mb-1">
                Min price{currencySymbol ? ` (${currencySymbol})` : ''}
              </label>
              <input
                id="store-min"
                type="number"
                name="min"
                min="0"
                step="0.01"
                defaultValue={params.minInput}
                className="rounded border p-2 bg-transparent w-28"
              />
            </span>
            <span>
              <label htmlFor="store-max" className="block font-semibold mb-1">
                Max price{currencySymbol ? ` (${currencySymbol})` : ''}
              </label>
              <input
                id="store-max"
                type="number"
                name="max"
                min="0"
                step="0.01"
                defaultValue={params.maxInput}
                className="rounded border p-2 bg-transparent w-28"
              />
            </span>
            <label className="flex items-center gap-2 pb-2 font-semibold">
              <input
                type="checkbox"
                name="availability"
                value="available"
                defaultChecked={params.availableOnly}
              />
              Available now
            </label>
            <label className="flex items-center gap-2 pb-2 font-semibold">
              <input
                type="checkbox"
                name="featured"
                value="1"
                defaultChecked={params.featuredOnly}
              />
              Featured only
            </label>
            <span>
              <label htmlFor="store-sort" className="block font-semibold mb-1">
                Sort by
              </label>
              <select
                id="store-sort"
                name="sort"
                defaultValue={params.sort}
                className="rounded border p-2 bg-transparent"
              >
                <option value="newest">Newest</option>
                <option value="featured">Featured first</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="name">Name</option>
              </select>
            </span>
            <button type="submit" className="px-4 py-2 border font-semibold rounded">
              Apply filters
            </button>
          </div>
        ) : null}
      </form>
      {featured.length ? (
        <section aria-labelledby="featured-heading" className="mb-10">
          <h2 id="featured-heading" className="text-xl font-bold mb-4">
            Featured
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {featured.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}
      {result.totalDocs > 0 ? (
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          {result.totalDocs} {result.totalDocs === 1 ? 'product' : 'products'}
          {params.q ? <> matching “{params.q}”</> : null}
          {params.attrDimension && params.attrValue ? (
            <>
              {' '}
              with {params.attrDimension} “{params.attrValue}”
            </>
          ) : null}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {result.docs.map((product: any) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {!result.docs.length ? (
        <p>
          {filtersActive
            ? 'No products match those filters. Try clearing a filter or two.'
            : 'No products are published yet.'}
        </p>
      ) : null}
      {result.attributeScanCapped ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Showing matches from the first {ATTRIBUTE_FILTER_SCAN_CAP} products; narrow the other
          filters to search the full catalog by this option.
        </p>
      ) : null}
      {result.totalPages > 1 ? (
        <nav aria-label="Store pages" className="mt-8 flex items-center gap-4 text-sm">
          {result.hasPrevPage ? (
            <Link
              href={storefrontHref(params, { page: params.page - 1 })}
              className="underline font-semibold"
            >
              ← Previous
            </Link>
          ) : null}
          <span>
            Page {params.page} of {result.totalPages}
          </span>
          {result.hasNextPage ? (
            <Link
              href={storefrontHref(params, { page: params.page + 1 })}
              className="underline font-semibold"
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  )
}
