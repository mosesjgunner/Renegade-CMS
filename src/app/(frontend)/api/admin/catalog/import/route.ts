import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  catalogProductFromDocument,
  planCatalogImport,
  type CatalogProduct,
} from '@/modules/commerce/catalog'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 })
  try {
    const body = (await request.json()) as {
      products: CatalogProduct[]
      mode?: 'dry-run' | 'apply'
      source?: string
    }
    if (!Array.isArray(body.products) || body.products.length > 500)
      throw new Error('Import must contain at most 500 products.')
    const siteIds = [...new Set(body.products.map((item) => item.siteId))]
    if (siteIds.length !== 1 || !siteIds[0])
      throw new Error('One explicit site is required per import.')
    const existingResult = await payload.find({
      collection: 'products',
      where: { site: { equals: siteIds[0] } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    } as never)
    const existing = (existingResult.docs as unknown as Record<string, unknown>[]).map(
      catalogProductFromDocument,
    )
    const plan = planCatalogImport(body.products, existing)
    const mode = body.mode ?? 'dry-run'
    const prior = await payload.find({
      collection: 'catalog-import-runs',
      where: {
        and: [
          { site: { equals: siteIds[0] } },
          { checksum: { equals: plan.checksum } },
          { mode: { equals: mode } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    if (prior.docs.length) return NextResponse.json({ replay: true, plan, run: prior.docs[0] })
    if (mode === 'apply' && plan.errors.length)
      throw new Error('Import has validation errors; apply is blocked.')
    if (mode === 'apply') {
      for (const product of plan.creates)
        await payload.create({
          collection: 'products',
          data: toPayloadProduct(product),
          overrideAccess: true,
        } as never)
      for (const product of plan.updates) {
        const priorProduct = (existingResult.docs as unknown as Record<string, unknown>[]).find(
          (item) => String(item.slug) === product.slug,
        )
        await payload.update({
          collection: 'products',
          id: String(priorProduct?.id),
          data: toPayloadProduct(product),
          overrideAccess: true,
        } as never)
      }
    }
    const run = await payload.create({
      collection: 'catalog-import-runs',
      data: {
        site: siteIds[0],
        checksum: plan.checksum,
        mode,
        status: mode === 'apply' ? 'applied' : 'planned',
        source: body.source || 'admin-api',
        summary: {
          creates: plan.creates.length,
          updates: plan.updates.length,
          unchanged: plan.unchanged.length,
          errors: plan.errors,
        },
        ...(mode === 'apply' ? { appliedAt: new Date().toISOString() } : {}),
      },
      overrideAccess: true,
    } as never)
    return NextResponse.json({ replay: false, plan, run }, { status: mode === 'apply' ? 201 : 200 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Catalog import failed.' },
      { status: 400 },
    )
  }
}

function toPayloadProduct(product: CatalogProduct) {
  return {
    site: product.siteId,
    slug: product.slug,
    canonicalPath: product.canonicalPath,
    name: product.name,
    summary: product.summary,
    description: product.description,
    // Imported provider data is never publication authority. Every applied
    // record re-enters the local review workflow as a draft.
    state: 'draft',
    catalogContractVersion: 1,
    productCapabilities: product.capabilities,
    categories: product.categoryId,
    topics: product.topicIds,
    tags: product.tagIds,
    collections: product.collectionIds,
    media: product.mediaIds,
    relationships: product.relationshipIds,
    disclosures: product.disclosures,
    seoTitle: product.seo?.title,
    seoDescription: product.seo?.description,
    seoCanonicalURL: product.seo?.canonicalUrl,
    seoNoIndex: product.seo?.noIndex,
    seoKeywords: product.seo?.keywords,
    optionDimensions: product.optionDimensions,
    variants: product.variants.map((item) => ({
      ...item,
      attributes: item.optionValues,
      inventoryPolicy: item.inventory?.policy,
      inventoryQuantity: item.inventory?.quantity,
    })),
    offers: product.offers.map((item) => ({ ...item, offerId: item.id })),
    affiliatePolicy: product.affiliate,
    podMappings: product.podMappings,
    digitalDelivery: product.digitalDelivery,
  }
}
