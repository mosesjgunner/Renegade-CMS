/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * RC3-20 SHOP-UX Pass 01 — storefront listing queries.
 *
 * One query builder backs the /store page and the /api/catalog route so the
 * buyer-facing filters behave identically everywhere. Price and
 * availability filters run on the denormalized listing projection
 * (`minPriceMinor` / `priceCurrency` / `anyAvailable`, maintained by the
 * products collection hook from the offers JSON — offers remain the only
 * price truth). Variant-attribute filtering cannot be expressed in Payload
 * queries over the variants JSON, so it runs in memory over the
 * natively-filtered, site-scoped result set and is capped; the cap is
 * reported to the caller instead of silently truncating.
 */
import { parseMoneyToMinor } from './catalog'

export const STOREFRONT_PAGE_SIZE = 24
export const ATTRIBUTE_FILTER_SCAN_CAP = 1000

export type StorefrontSort = 'newest' | 'price-asc' | 'price-desc' | 'name' | 'featured'

export type StorefrontParams = {
  q: string
  category: string
  collection: string
  minInput: string
  maxInput: string
  minMinor: string | null
  maxMinor: string | null
  currency: string
  availableOnly: boolean
  featuredOnly: boolean
  sort: StorefrontSort
  page: number
  limit: number
  attrDimension: string
  attrValue: string
}

const SORTS: readonly StorefrontSort[] = ['newest', 'price-asc', 'price-desc', 'name', 'featured']

export function parseStorefrontParams(
  input: Record<string, string | undefined>,
  currency = 'USD',
): StorefrontParams {
  const page = Math.max(1, Number.parseInt(input.page ?? '1', 10) || 1)
  const limit = Math.min(
    48,
    Math.max(
      1,
      Number.parseInt(input.limit ?? String(STOREFRONT_PAGE_SIZE), 10) || STOREFRONT_PAGE_SIZE,
    ),
  )
  const toMinor = (value: string | undefined): string | null => {
    if (!value?.trim()) return null
    try {
      return parseMoneyToMinor(value.trim(), currency)
    } catch {
      return null
    }
  }
  return {
    q: (input.q ?? '').trim(),
    category: (input.category ?? '').trim(),
    collection: (input.collection ?? '').trim(),
    minInput: (input.min ?? '').trim(),
    maxInput: (input.max ?? '').trim(),
    minMinor: toMinor(input.min),
    maxMinor: toMinor(input.max),
    currency,
    availableOnly: input.availability === 'available',
    featuredOnly: input.featured === '1',
    sort: SORTS.includes(input.sort as StorefrontSort) ? (input.sort as StorefrontSort) : 'newest',
    page,
    limit,
    attrDimension: (input.attr ?? '').trim(),
    attrValue: (input.attrValue ?? '').trim(),
  }
}

export function storefrontHref(
  params: Partial<StorefrontParams> & { min?: string; max?: string },
  overrides: Record<string, string | number | undefined> = {},
): string {
  const search = new URLSearchParams()
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '' && value !== null) search.set(key, String(value))
  }
  set('q', overrides.q ?? params.q)
  set('category', overrides.category ?? params.category)
  set('collection', overrides.collection ?? params.collection)
  set('min', overrides.min ?? params.minInput)
  set('max', overrides.max ?? params.maxInput)
  if (overrides.availability !== undefined) set('availability', overrides.availability || undefined)
  else if (params.availableOnly) set('availability', 'available')
  if (overrides.featured !== undefined) set('featured', overrides.featured || undefined)
  else if (params.featuredOnly) set('featured', '1')
  if (overrides.sort !== undefined) set('sort', overrides.sort || undefined)
  else if (params.sort && params.sort !== 'newest') set('sort', params.sort)
  if (overrides.attr !== undefined) set('attr', overrides.attr || undefined)
  else set('attr', params.attrDimension)
  if (overrides.attrValue !== undefined) set('attrValue', overrides.attrValue || undefined)
  else set('attrValue', params.attrValue)
  const page = overrides.page !== undefined ? Number(overrides.page) : params.page
  if (page && page > 1) set('page', page)
  const suffix = search.toString()
  return suffix ? `/store?${suffix}` : '/store'
}

const SORT_FIELDS: Record<StorefrontSort, string | string[]> = {
  newest: '-createdAt',
  'price-asc': 'minPriceMinor',
  'price-desc': '-minPriceMinor',
  name: 'name',
  featured: ['-featured', '-createdAt'],
}

export type StorefrontResult = {
  docs: any[]
  totalDocs: number
  totalPages: number
  page: number
  hasNextPage: boolean
  hasPrevPage: boolean
  attributeFiltered: boolean
  attributeScanCapped: boolean
}

export async function queryStorefront(
  payload: any,
  siteId: string,
  params: StorefrontParams,
  depth = 1,
): Promise<StorefrontResult> {
  const conditions: Array<Record<string, unknown>> = [
    { state: { equals: 'published' } },
    { site: { equals: siteId } },
  ]
  if (params.q) conditions.push({ name: { like: params.q } })
  if (params.category) {
    const categories = await payload.find({
      collection: 'categories',
      where: { slug: { equals: params.category } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const categoryId = categories.docs[0]?.id
    // An unknown slug matches nothing rather than falling back to the
    // unfiltered catalog.
    conditions.push({ categories: { equals: categoryId ?? '__no_such_category__' } })
  }
  if (params.collection) conditions.push({ collections: { contains: params.collection } })
  if (params.minMinor !== null)
    conditions.push({ minPriceMinor: { greater_than_equal: Number(params.minMinor) } })
  if (params.maxMinor !== null)
    conditions.push({ minPriceMinor: { less_than_equal: Number(params.maxMinor) } })
  if (params.availableOnly) conditions.push({ anyAvailable: { equals: true } })
  if (params.featuredOnly) conditions.push({ featured: { equals: true } })
  const where = { and: conditions }
  const sort = SORT_FIELDS[params.sort]

  if (!params.attrDimension || !params.attrValue) {
    const result = await payload.find({
      collection: 'products',
      where,
      sort,
      limit: params.limit,
      page: params.page,
      depth,
      overrideAccess: true,
    })
    return {
      docs: result.docs,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      page: result.page ?? params.page,
      hasNextPage: Boolean(result.hasNextPage),
      hasPrevPage: Boolean(result.hasPrevPage),
      attributeFiltered: false,
      attributeScanCapped: false,
    }
  }

  // Variant-attribute filter: scan the natively-filtered set (bounded) and
  // match variant optionValues in memory.
  const scanned: any[] = []
  let scanPage = 1
  let capped = false
  for (;;) {
    const batch = await payload.find({
      collection: 'products',
      where,
      sort,
      limit: 100,
      page: scanPage,
      depth,
      overrideAccess: true,
    })
    scanned.push(...batch.docs)
    if (scanned.length >= ATTRIBUTE_FILTER_SCAN_CAP) {
      capped = batch.hasNextPage === true
      break
    }
    if (!batch.hasNextPage) break
    scanPage += 1
  }
  const matched = scanned.filter((doc) =>
    (Array.isArray(doc.variants) ? doc.variants : []).some(
      (variant: any) => variant?.optionValues?.[params.attrDimension] === params.attrValue,
    ),
  )
  const totalDocs = matched.length
  const totalPages = Math.max(1, Math.ceil(totalDocs / params.limit))
  const start = (params.page - 1) * params.limit
  return {
    docs: matched.slice(start, start + params.limit),
    totalDocs,
    totalPages,
    page: params.page,
    hasNextPage: params.page < totalPages,
    hasPrevPage: params.page > 1,
    attributeFiltered: true,
    attributeScanCapped: capped,
  }
}

export async function countPublishedProducts(payload: any, siteId: string): Promise<number> {
  const result = await payload.find({
    collection: 'products',
    where: { and: [{ state: { equals: 'published' } }, { site: { equals: siteId } }] },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  return result.totalDocs
}

export type StorefrontCategory = { id: string; name: string; slug: string; count: number }

export async function listStorefrontCategories(
  payload: any,
  siteId: string,
): Promise<StorefrontCategory[]> {
  const products = await payload.find({
    collection: 'products',
    where: { and: [{ state: { equals: 'published' } }, { site: { equals: siteId } }] },
    limit: ATTRIBUTE_FILTER_SCAN_CAP,
    depth: 0,
    overrideAccess: true,
  })
  const counts = new Map<string, number>()
  for (const doc of products.docs) {
    const id =
      typeof doc.categories === 'object' && doc.categories !== null
        ? String(doc.categories.id ?? '')
        : String(doc.categories ?? '')
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  if (!counts.size) return []
  const categories = await payload.find({
    collection: 'categories',
    where: { id: { in: [...counts.keys()] } },
    limit: counts.size,
    depth: 0,
    overrideAccess: true,
  })
  return categories.docs
    .map((doc: any) => ({
      id: String(doc.id),
      name: String(doc.name ?? doc.title ?? 'Category'),
      slug: String(doc.slug ?? ''),
      count: counts.get(String(doc.id)) ?? 0,
    }))
    .filter((category: StorefrontCategory) => category.slug)
    .sort((a: StorefrontCategory, b: StorefrontCategory) => a.name.localeCompare(b.name))
}

export async function listFeaturedProducts(
  payload: any,
  siteId: string,
  limit = 4,
): Promise<any[]> {
  const result = await payload.find({
    collection: 'products',
    where: {
      and: [
        { state: { equals: 'published' } },
        { site: { equals: siteId } },
        { featured: { equals: true } },
      ],
    },
    sort: 'name',
    limit,
    depth: 1,
    overrideAccess: true,
  })
  return result.docs
}

/**
 * Related products for the product page (Pass 02): the product's explicit
 * catalog relationships first (published + same site only), topped up with
 * published products from the same category. Never cross-site, never
 * drafts, never the product itself.
 */
export async function relatedProductsFor(
  payload: any,
  product: any,
  siteId: string,
  limit = 4,
): Promise<any[]> {
  const seen = new Set<string>([String(product.id)])
  const related: any[] = []
  const relationshipIds = (Array.isArray(product.relationships) ? product.relationships : [])
    .map((entry: any) =>
      typeof entry === 'object' && entry !== null ? String(entry.id ?? '') : String(entry ?? ''),
    )
    .filter(Boolean)
  if (relationshipIds.length) {
    const found = await payload.find({
      collection: 'products',
      where: {
        and: [
          { id: { in: relationshipIds } },
          { site: { equals: siteId } },
          { state: { equals: 'published' } },
        ],
      },
      limit,
      depth: 1,
      overrideAccess: true,
    })
    for (const doc of found.docs) {
      if (!seen.has(String(doc.id))) {
        seen.add(String(doc.id))
        related.push(doc)
      }
    }
  }
  if (related.length < limit) {
    const categoryId =
      typeof product.categories === 'object' && product.categories !== null
        ? String(product.categories.id ?? '')
        : String(product.categories ?? '')
    if (categoryId) {
      const siblings = await payload.find({
        collection: 'products',
        where: {
          and: [
            { categories: { equals: categoryId } },
            { site: { equals: siteId } },
            { state: { equals: 'published' } },
            { id: { not_in: [...seen] } },
          ],
        },
        sort: '-createdAt',
        limit: limit - related.length,
        depth: 1,
        overrideAccess: true,
      })
      related.push(...siblings.docs)
    }
  }
  return related.slice(0, limit)
}

/** The currency price filters are expressed in: the mode priceCurrency of
 * the site's published catalog (stores are single-currency in practice). */
export async function storefrontCurrency(payload: any, siteId: string): Promise<string> {
  const result = await payload.find({
    collection: 'products',
    where: {
      and: [
        { state: { equals: 'published' } },
        { site: { equals: siteId } },
        { priceCurrency: { exists: true } },
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const counts = new Map<string, number>()
  for (const doc of result.docs) {
    const currency = String(doc.priceCurrency ?? '')
    if (/^[A-Z]{3}$/.test(currency)) counts.set(currency, (counts.get(currency) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD'
}
