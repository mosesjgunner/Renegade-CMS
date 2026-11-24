import config from '@payload-config'
import { getPayload } from 'payload'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import {
  catalogProductFromDocument,
  formatMinorMoney,
  resolveActiveOffer,
} from '@/modules/commerce/catalog'
import {
  parseStorefrontParams,
  queryStorefront,
  storefrontCurrency,
} from '@/modules/commerce/storefront'

export const dynamic = 'force-dynamic'

/* eslint-disable @typescript-eslint/no-explicit-any */
function present(document: any) {
  const product = catalogProductFromDocument(document as unknown as Record<string, unknown>)
  const currency = product.offers.find((offer) => offer.status === 'active')?.currency ?? 'USD'
  const options = product.variants
    .filter((variant) => variant.status !== 'archived')
    .map((variant) => ({
      variant,
      offer: resolveActiveOffer(product, { variantSku: variant.sku, currency }),
    }))
  const offer = options.find((option) => option.offer)?.offer
  const firstPurchasable = options.find(
    ({ variant, offer }) =>
      offer &&
      variant.status !== 'unavailable' &&
      (variant.inventory?.policy !== 'tracked' || Number(variant.inventory.quantity) > 0),
  )
  return {
    id: String(document.id),
    name: product.name,
    path: product.canonicalPath,
    kind: String((document as any).kind ?? ''),
    summary: product.summary ?? null,
    currency: offer?.currency ?? currency,
    featured: Boolean(document.featured),
    price: offer ? formatMinorMoney(offer.amountMinor, offer.currency) : 'Price unavailable',
    priceMinor: offer ? offer.amountMinor : null,
    available: Boolean(firstPurchasable),
    defaultVariantSku: firstPurchasable?.variant.sku ?? null,
    recurring: offer?.recurring
      ? { interval: offer.recurring.interval, intervalCount: offer.recurring.intervalCount }
      : null,
    donationMinimumMinor: offer?.donation?.minimumMinor ?? null,
  }
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const site = await catalogSiteForHost(payload, request.headers.get('host')).catch(() => '')
  if (!site) return Response.json({ error: 'Store not found.' }, { status: 404 })
  const url = new URL(request.url)
  const input: Record<string, string | undefined> = {}
  for (const key of [
    'q',
    'category',
    'collection',
    'min',
    'max',
    'availability',
    'featured',
    'sort',
    'page',
    'limit',
    'attr',
    'attrValue',
  ])
    input[key] = url.searchParams.get(key) ?? undefined
  const singleId = url.searchParams.get('id')
  if (singleId) {
    const document = await payload
      .findByID({ collection: 'products', id: singleId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (
      !document ||
      String((document as any).site?.id ?? (document as any).site) !== site ||
      (document as any).state !== 'published'
    )
      return Response.json({ error: 'Product not found.' }, { status: 404 })
    return Response.json(
      { products: [present(document)], totalDocs: 1, totalPages: 1, page: 1 },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
  const currency = await storefrontCurrency(payload as any, site)
  const params = parseStorefrontParams(input, currency)
  // Preserve the historical default page size of 12 for unparameterized
  // callers (e.g. LiveProductShowcase) while honoring explicit limits.
  if (!input.limit) params.limit = 12
  const result = await queryStorefront(payload as any, site, params, 0)
  return Response.json(
    {
      products: result.docs.map(present),
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      page: result.page,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
