import config from '@payload-config'
import { getPayload } from 'payload'
import { canAccessCommerceCart, commerceRelationId as id } from '@/modules/commerce/cart-access'
import { eligiblePaymentMethods, type PaymentMethodCapability } from '@/modules/commerce/contracts'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const proposalId = new URL(request.url).searchParams.get('proposal')
  if (!proposalId)
    return Response.json({ error: 'A checkout proposal is required.' }, { status: 400 })
  const proposal = await payload
    .findByID({ collection: 'checkout-proposals', id: proposalId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!proposal) return Response.json({ error: 'Proposal not found.' }, { status: 404 })
  const cart = await payload
    .findByID({ collection: 'carts', id: id(proposal.cart), depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!cart || !(await canAccessCommerceCart(payload, request, cart)))
    return Response.json({ error: 'Checkout access denied.' }, { status: 403 })
  if (proposal.state !== 'active' || Date.parse(proposal.expiresAt) <= Date.now())
    return Response.json({ error: 'Proposal is expired or inactive.' }, { status: 409 })
  const merchantId = id(proposal.merchantConnection)
  if (!merchantId)
    return Response.json({ error: 'A merchant connection must be configured.' }, { status: 503 })
  const merchant = await payload
    .findByID({
      collection: 'merchant-connections',
      id: merchantId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!merchant || id(merchant.site) !== id(cart.site) || merchant.status !== 'active')
    return Response.json({ error: 'Merchant connection is unavailable.' }, { status: 503 })
  const result = await payload.find({
    collection: 'payment-method-capabilities',
    where: {
      and: [{ site: { equals: id(cart.site) } }, { merchantConnection: { equals: merchantId } }],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  const methods = result.docs
    .filter((method) => id(method.space) === id(cart.space))
    .map((method) => ({
      ...method,
      siteId: id(method.site),
      spaceId: id(method.space),
      merchantConnectionId: merchantId,
    })) as unknown as PaymentMethodCapability[]
  const pricing = proposal.pricingSnapshot as { grandTotalMinor?: string } | null
  const address = proposal.shippingAddress as { normalized?: { country?: string } } | null
  const customer = proposal.customer as { country?: string } | null
  const items = cart.items as Array<{ kind?: string }> | null
  const eligible = eligiblePaymentMethods(methods, {
    merchant: { siteId: id(cart.site), spaceId: id(cart.space), merchantConnectionId: merchantId },
    merchantCountry: merchant.merchantCountry,
    buyerCountry: address?.normalized?.country ?? customer?.country,
    currency: proposal.currency,
    amountMinor: String(pricing?.grandTotalMinor ?? ''),
    recurring: Boolean(
      items?.some((item) => ['subscription', 'membership'].includes(String(item.kind))),
    ),
  })
  return Response.json(
    {
      methods: eligible.map(({ capability }) => ({
        id: capability.id,
        label: capability.railKey,
        family: capability.family,
        providerKey: capability.providerKey,
      })),
    },
    { headers: { 'cache-control': 'private, no-store' } },
  )
}
