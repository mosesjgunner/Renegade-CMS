import config from '@payload-config'
import { getPayload } from 'payload'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import {
  catalogProductFromDocument,
  formatMinorMoney,
  resolveActiveOffer,
} from '@/modules/commerce/catalog'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const site = await catalogSiteForHost(payload, request.headers.get('host')).catch(() => '')
  if (!site) return Response.json({ error: 'Store not found.' }, { status: 404 })
  const result = await payload.find({
    collection: 'products',
    depth: 0,
    limit: 12,
    overrideAccess: true,
    where: { and: [{ site: { equals: site } }, { state: { equals: 'published' } }] },
  })
  const products = result.docs.map((document) => {
    const product = catalogProductFromDocument(document as unknown as Record<string, unknown>)
    const currency = product.offers.find((offer) => offer.status === 'active')?.currency ?? 'USD'
    const options = product.variants
      .filter((variant) => variant.status !== 'archived')
      .map((variant) => ({
        variant,
        offer: resolveActiveOffer(product, { variantSku: variant.sku, currency }),
      }))
    const offer = options.find((option) => option.offer)?.offer
    return {
      id: String(document.id),
      name: product.name,
      path: product.canonicalPath,
      price: offer ? formatMinorMoney(offer.amountMinor, offer.currency) : 'Price unavailable',
      available: options.some(
        ({ variant, offer }) =>
          offer &&
          variant.status !== 'unavailable' &&
          (variant.inventory?.policy !== 'tracked' || Number(variant.inventory.quantity) > 0),
      ),
    }
  })
  return Response.json({ products }, { headers: { 'Cache-Control': 'no-store' } })
}
