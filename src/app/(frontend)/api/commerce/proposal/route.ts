/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { withExecutionLock } from '@/modules/operations/execution-lock'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import {
  commerceTransactionPayload,
  lockCommerceStock,
  reservedCommerceStock,
  InventoryReservationError,
} from '@/modules/commerce/transactions'
import { canAccessCommerceCart, commerceRelationId } from '@/modules/commerce/cart-access'
import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import {
  guestCartCookieName,
  activeCartLifetimeWhere,
  cartExpiry,
  hashGuestToken,
  reResolveCart,
  type VersionedCart,
} from '@/modules/commerce/cart'
import { validateAddress, LocalFallbackShippingAdapter } from '@/modules/commerce/shipping'
import {
  BoundedJurisdictionTaxAdapter,
  TaxCalculationUnavailableError,
} from '@/modules/commerce/tax'
import {
  computeProposalIntegrityHash,
  createCheckoutProposal,
  PROPOSAL_TTL_MS,
  type ReferralLineInput,
} from '@/modules/commerce/proposal'
import {
  fulfillmentGroupKindForLine,
  quoteShippingForGroups,
  resolveProductSource,
  type ProductSourceDescriptor,
} from '@/modules/commerce/adapters'
import type { ShippingRate } from '@/modules/commerce/shipping'

async function createProposal(request: Request) {
  const payload = await getPayload({ config })
  try {
    const host = request.headers.get('host')
    const siteId = await catalogSiteForHost(payload, host)
    const memberId = await currentMember(payload as never, readMemberSession(request.headers))

    const cookieHeader = request.headers.get('cookie') ?? ''
    const cookieName = guestCartCookieName(siteId)
    const guestTokenMatch = cookieHeader
      .split(';')
      .map((c) => c.trim().split('='))
      .find(([name]) => name === cookieName)?.[1]

    let cartDoc: any = null
    if (memberId) {
      const found = await (payload as any).find({
        collection: 'carts',
        where: {
          and: [
            { site: { equals: siteId } },
            { member: { equals: memberId } },
            { state: { equals: 'active' } },
            activeCartLifetimeWhere(),
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs.length) cartDoc = found.docs[0]
    }
    if (!cartDoc && !memberId && guestTokenMatch) {
      const guestHash = hashGuestToken(guestTokenMatch)
      const found = await (payload as any).find({
        collection: 'carts',
        where: {
          and: [
            { site: { equals: siteId } },
            { guestTokenHash: { equals: guestHash } },
            { member: { exists: false } },
            { state: { equals: 'active' } },
            activeCartLifetimeWhere(),
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs.length) cartDoc = found.docs[0]
    }

    if (!cartDoc || !cartDoc.items?.length) {
      return NextResponse.json({ error: 'Cart is empty or not found.' }, { status: 400 })
    }

    const body = await request.json()
    if (
      !body ||
      typeof body !== 'object' ||
      Object.keys(body).some(
        (key) =>
          ![
            'customer',
            'shippingAddress',
            'billingAddress',
            'selectedShippingRateId',
            'consents',
          ].includes(key),
      )
    )
      return NextResponse.json({ error: 'Unsupported quote field.' }, { status: 400 })
    const { customer, shippingAddress, billingAddress, selectedShippingRateId, consents } = body

    if (!customer?.email) {
      return NextResponse.json({ error: 'Customer email is required.' }, { status: 400 })
    }
    if (customer.country !== undefined && !/^[A-Z]{2}$/.test(String(customer.country)))
      return NextResponse.json(
        { error: 'Choose a valid two-letter billing country.' },
        { status: 400 },
      )
    if (!consents?.termsAccepted || !consents?.privacyAccepted) {
      return NextResponse.json(
        { error: 'Terms and Privacy Policy must be accepted.' },
        { status: 400 },
      )
    }

    // Load products and promotions
    const productsResult = await (payload as any).find({
      collection: 'products',
      where: { and: [{ site: { equals: siteId } }, { state: { equals: 'published' } }] },
      pagination: false,
      depth: 1,
      overrideAccess: true,
    })

    const promotionsResult = await (payload as any).find({
      collection: 'promotions',
      where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
      pagination: false,
      overrideAccess: true,
    })

    const products = productsResult.docs.map((d: any) => ({
      id: String(d.id),
      name: String(d.name),
      state: String(d.state),
      kind: String(d.kind),
      productCapabilities: Array.isArray(d.productCapabilities) ? d.productCapabilities : [],
      merchantConnectionId: String(d.merchantConnection?.id ?? d.merchantConnection ?? ''),
      variants: Array.isArray(d.variants) ? d.variants : [],
      offers: Array.isArray(d.offers) ? d.offers : [],
      affiliatePolicy: d.affiliatePolicy ?? undefined,
      sourcePolicy: d.sourcePolicy ?? undefined,
    }))

    const promotions = promotionsResult.docs.map((p: any) => ({
      id: String(p.id),
      version: Number(p.version ?? 1),
      siteId: String(p.site?.id ?? p.site),
      code: String(p.code),
      description: String(p.description),
      scope: p.scope,
      discountType: p.discountType,
      discountValue: String(p.discountValue),
      maxDiscountMinor: p.maxDiscountMinor ? String(p.maxDiscountMinor) : undefined,
      currency: String(p.currency),
      status: p.status,
      stackingRule: p.stackingRule,
      stackingPriority: Number(p.stackingPriority ?? 0),
      usageLimitTotal: p.usageLimitTotal != null ? Number(p.usageLimitTotal) : undefined,
      usageCount: Number(p.usageCount ?? 0),
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      usageLimitPerCustomer:
        p.usageLimitPerCustomer != null ? Number(p.usageLimitPerCustomer) : undefined,
      eligibility: p.eligibility ?? {},
    }))

    let rawCart: VersionedCart = {
      id: String(cartDoc.id),
      siteId: String(cartDoc.site?.id ?? cartDoc.site),
      merchantConnectionId: String(
        cartDoc.merchantConnection?.id ?? cartDoc.merchantConnection ?? '',
      ),
      customerId: String(cartDoc.member?.id ?? cartDoc.member ?? '') || undefined,
      version: Number(cartDoc.version ?? 1),
      currency: String(cartDoc.currency ?? 'USD'),
      items: Array.isArray(cartDoc.items) ? cartDoc.items : [],
      appliedCouponCodes: Array.isArray(cartDoc.appliedCouponCodes)
        ? cartDoc.appliedCouponCodes
        : [],
      shippingAddress: shippingAddress ?? cartDoc.shippingAddress,
      billingAddress: billingAddress ?? cartDoc.billingAddress,
      selectedShippingRateId: selectedShippingRateId ?? cartDoc.selectedShippingRateId,
      reconciliationNotes: Array.isArray(cartDoc.reconciliationNotes)
        ? cartDoc.reconciliationNotes
        : [],
      expiresAt: cartExpiry(cartDoc),
      createdAt: String(cartDoc.createdAt),
      updatedAt: String(cartDoc.updatedAt),
    }

    // RC3-20: partition affiliate lines out BEFORE pricing. An affiliate line
    // is never a payable line — the partner is merchant of record — so it is
    // excluded from pricing, tax, and inventory reservation, and closes on
    // the proposal as a terminal referral group. Payable lines (own, POD,
    // dropship) flow through the existing pipeline unchanged.
    const lineSources = new Map<string, ProductSourceDescriptor>()
    const referralLines: ReferralLineInput[] = []
    const payableItems: (typeof rawCart.items)[number][] = []
    for (const item of rawCart.items) {
      const product = products.find((candidate: any) => candidate.id === item.productId)
      const source = product
        ? resolveProductSource(product as any, item.variantSku)
        : ({ type: 'own', providerKey: 'own-inventory' } as const)
      lineSources.set(item.lineId, source)
      if (source.type === 'affiliate') {
        referralLines.push({
          productId: item.productId,
          variantSku: item.variantSku,
          title: item.displaySnapshot.title,
          quantity: item.quantity,
          observedUnitPriceMinor:
            (product as any)?.affiliatePolicy?.remotePrice?.amountMinor ??
            item.displaySnapshot.unitPriceMinor,
          destinationUrl: (product as any)?.affiliatePolicy?.destinationUrl,
          disclosure: (product as any)?.affiliatePolicy?.disclosure,
          sourceProviderKey: source.providerKey,
        })
      } else {
        payableItems.push(item)
      }
    }
    if (payableItems.length === 0 && referralLines.length > 0) {
      return NextResponse.json(
        {
          error:
            'Affiliate items are purchased at the disclosed seller destination. This cart has no payable items.',
          referralLines,
        },
        { status: 400 },
      )
    }
    rawCart = { ...rawCart, items: payableItems }

    const preliminary = reResolveCart({ cart: rawCart, products, promotions })
    rawCart = preliminary.cart

    // Shipping & Tax setup
    let validatedShippingAddress = undefined
    let selectedRate = undefined
    const groupShippingRates: Partial<Record<'physical' | 'pod' | 'dropship', ShippingRate>> = {}
    let shippingAmountMinor = '0'
    let taxSnapshot = undefined

    const groupKindOf = (item: (typeof rawCart.items)[number]) => {
      const source = lineSources.get(item.lineId)
      return source ? fulfillmentGroupKindForLine({ itemKind: item.kind, source }) : 'physical'
    }
    const hasShippable = rawCart.items.some((i) =>
      ['physical', 'pod', 'dropship'].includes(groupKindOf(i)),
    )
    if (hasShippable) {
      if (!shippingAddress) {
        return NextResponse.json(
          { error: 'Shipping address is required for physical items.' },
          { status: 400 },
        )
      }
      validatedShippingAddress = validateAddress(shippingAddress)
      if (!validatedShippingAddress.isValid) {
        return NextResponse.json(
          {
            error: `Invalid shipping address: ${validatedShippingAddress.validationErrors.join(', ')}`,
          },
          { status: 400 },
        )
      }

      // Shipping rate calculation — RC3-20: quoted per fulfillment group.
      // Each group ships separately, so each is quoted on its own items and
      // subtotal; the proposal total is the sum of the group rates.
      const shippingAdapter = new LocalFallbackShippingAdapter({
        standardRateMinor: '500', // $5.00 default flat
        currency: rawCart.currency,
        freeShippingThresholdMinor: '5000', // $50 free shipping
        enableLocalPickup: true,
      })

      const shippableKinds = ['physical', 'pod', 'dropship'] as const
      const groups = shippableKinds
        .map((kind) => {
          const groupItems = rawCart.items.filter((i) => groupKindOf(i) === kind)
          const subtotal = groupItems.reduce((sum, i) => {
            const line = preliminary.pricingSnapshot.lines.find((l) => l.lineId === i.lineId)
            return sum + BigInt(line?.grossAmountMinor ?? '0')
          }, 0n)
          return {
            groupKey: kind,
            itemsSubtotalMinor: subtotal.toString(),
            items: groupItems.map((i) => ({
              productId: i.productId,
              variantSku: i.variantSku,
              quantity: i.quantity,
              shippable: true,
            })),
          }
        })
        .filter((group) => group.items.length > 0)

      const { quotes, totalMinor } = await quoteShippingForGroups({
        adapter: shippingAdapter,
        base: { siteId, currency: rawCart.currency, destination: validatedShippingAddress },
        groups,
        selectedRateId: selectedShippingRateId,
      })

      if (
        selectedShippingRateId &&
        !quotes.some((quote) => quote.rate?.id === selectedShippingRateId)
      )
        return NextResponse.json({ error: 'Unknown shipping rate.' }, { status: 400 })
      for (const quote of quotes) {
        if (quote.rate)
          groupShippingRates[quote.groupKey as 'physical' | 'pod' | 'dropship'] = quote.rate
      }
      selectedRate = groupShippingRates.physical ?? quotes.find((q) => q.rate)?.rate
      shippingAmountMinor = totalMinor

      // Tax calculation
      const taxAdapter = new BoundedJurisdictionTaxAdapter()
      try {
        taxSnapshot = await taxAdapter.calculateTax({
          siteId,
          currency: rawCart.currency,
          destination: validatedShippingAddress,
          lines: preliminary.pricingSnapshot.lines.map((line) => ({
            lineId: line.lineId,
            productId: line.productId,
            variantSku: line.variantSku,
            quantity: 1,
            taxDisplay: rawCart.items.find((item) => item.lineId === line.lineId)?.displaySnapshot
              .taxDisplay,
            unitPriceMinor: line.netAmountMinor,
            currency: rawCart.currency,
          })),
          shippingAmountMinor,
        })
      } catch (err) {
        if (err instanceof TaxCalculationUnavailableError) {
          return NextResponse.json(
            { error: err.message, code: 'tax_calculation_unavailable' },
            { status: 422 },
          )
        }
        throw err
      }
    }

    // Re-resolve cart totals with authoritative catalog pricing and tax
    const { cart: resolvedCart, pricingSnapshot } = reResolveCart({
      cart: rawCart,
      products,
      promotions,
      shippingAmountMinor,
      taxTotalMinor: taxSnapshot?.taxAmountMinor,
      lineTaxAmountsMinor: taxSnapshot?.lineTaxAmountsMinor,
    })

    if (resolvedCart.items.length === 0) {
      return NextResponse.json(
        {
          error: 'Cart is empty or all items are unavailable.',
          reconciliationNotes: resolvedCart.reconciliationNotes,
        },
        { status: 400 },
      )
    }

    const proposal = createCheckoutProposal({
      cart: resolvedCart,
      pricingSnapshot,
      customer: {
        email: customer.email,
        name: customer.name,
        country: customer.country,
        memberId: memberId || undefined,
        isGuest: !memberId,
      },
      shippingAddress: validatedShippingAddress,
      billingAddress: billingAddress ? validateAddress(billingAddress) : undefined,
      selectedShippingRate: selectedRate,
      groupShippingRates,
      lineSources,
      referralLines,
      taxSnapshot,
      consents: {
        // Record the customer's actual submitted selections (validated above:
        // terms and privacy must both be true or the request was rejected).
        // Never synthesize acceptance the customer did not submit.
        termsAccepted: consents.termsAccepted === true,
        privacyAccepted: consents.privacyAccepted === true,
        marketingAccepted: Boolean(consents.marketingAccepted),
        timestamp: new Date().toISOString(),
      },
    })

    const transactionID = await payload.db.beginTransaction()
    if (!transactionID) throw new Error('Transactional inventory storage is unavailable.')
    let storedProposal: any
    let integrityHash: string
    try {
      await lockCommerceStock(
        payload,
        transactionID,
        resolvedCart.items.map((item) => item.productId),
        String(cartDoc.id),
      )
      const transactionalPayload = commerceTransactionPayload(payload, transactionID)
      const freshCart = await transactionalPayload.findByID({
        collection: 'carts',
        id: String(cartDoc.id),
        depth: 0,
        overrideAccess: true,
      })
      if (freshCart.state !== 'active' || Number(freshCart.version) !== proposal.cartVersion)
        throw new InventoryReservationError('Your cart changed. Reload it before creating a quote.')
      const openCheckouts = await transactionalPayload.find({
        collection: 'checkout-sessions',
        where: {
          and: [{ cart: { equals: String(cartDoc.id) } }, { state: { in: ['open', 'pending'] } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (openCheckouts.docs.length)
        throw new InventoryReservationError(
          'This cart already has a payment in progress. Return to that checkout.',
        )
      await transactionalPayload.update({
        collection: 'inventory-reservations',
        where: {
          and: [{ cart: { equals: String(cartDoc.id) } }, { status: { equals: 'active' } }],
        },
        data: { status: 'released' },
        overrideAccess: true,
      })
      await transactionalPayload.update({
        collection: 'checkout-proposals',
        where: { and: [{ cart: { equals: String(cartDoc.id) } }, { state: { equals: 'active' } }] },
        data: { state: 'cancelled' },
        overrideAccess: true,
      })
      for (const item of resolvedCart.items) {
        const freshProduct = await transactionalPayload.findByID({
          collection: 'products',
          id: item.productId,
          depth: 0,
          overrideAccess: true,
        })
        const variant = freshProduct.variants?.find((variant) => variant.sku === item.variantSku)
        if (!variant || commerceRelationId(freshProduct.site) !== siteId)
          throw new InventoryReservationError('A quoted item is no longer available.')
        if (variant.inventoryPolicy === 'tracked') {
          const reserved = await reservedCommerceStock(
            payload,
            transactionID,
            item.productId,
            item.variantSku,
          )
          if (Number(variant.inventoryQuantity ?? 0) - reserved < item.quantity)
            throw new InventoryReservationError(
              'Stock is reserved by another checkout. Reduce the quantity or try again after its quote expires.',
            )
        }
      }
      // Store proposal in DB
      storedProposal = await transactionalPayload.create({
        collection: 'checkout-proposals',
        data: {
          id: proposal.id,
          site: siteId,
          cart: cartDoc.id,
          merchantConnection: cartDoc.merchantConnection,
          cartVersion: proposal.cartVersion,
          currency: proposal.currency,
          customer: proposal.customer,
          shippingAddress: proposal.shippingAddress,
          billingAddress: proposal.billingAddress,
          selectedShippingRate: proposal.selectedShippingRate,
          pricingSnapshot: proposal.pricingSnapshot,
          taxSnapshot: proposal.taxSnapshot,
          consents: proposal.consents,
          fulfillmentSplit: [...proposal.fulfillmentSplit],
          integrityHash: 'pending',
          state: 'cancelled',
          expiresAt: proposal.expiresAt,
        },
        overrideAccess: true,
      })
      integrityHash = computeProposalIntegrityHash({
        id: String(storedProposal.id),
        cartId: String(cartDoc.id),
        cartVersion: proposal.cartVersion,
        siteId,
        currency: proposal.currency,
        grandTotalMinor: proposal.pricingSnapshot.grandTotalMinor,
        taxTotalMinor: proposal.pricingSnapshot.taxTotalMinor,
        netShippingMinor: proposal.pricingSnapshot.netShippingMinor,
        customerEmail: proposal.customer.email,
        buyerCountry: proposal.customer.country,
        shippingPostalCode: proposal.shippingAddress?.normalized.postalCode,
        items: resolvedCart.items.map((item) => ({
          productId: item.productId,
          variantSku: item.variantSku,
          quantity: item.quantity,
          unitPriceMinor: item.displaySnapshot.unitPriceMinor,
        })),
      })
      await transactionalPayload.update({
        collection: 'checkout-proposals',
        id: storedProposal.id,
        data: { integrityHash, state: 'active' },
        overrideAccess: true,
      })

      // Create bounded inventory reservations
      const now = new Date()
      const resExpiry = new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString()
      for (const item of resolvedCart.items) {
        await transactionalPayload.create({
          collection: 'inventory-reservations',
          data: {
            site: siteId,
            cart: cartDoc.id,
            proposal: storedProposal.id,
            product: item.productId,
            variantSku: item.variantSku,
            quantity: item.quantity,
            status: 'active',
            expiresAt: resExpiry,
          },
          overrideAccess: true,
        })
      }

      await payload.db.commitTransaction(transactionID)
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID)
      throw error
    }

    return NextResponse.json({
      proposal: { ...proposal, id: String(storedProposal.id), integrityHash },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout proposal.' },
      { status: error instanceof InventoryReservationError ? error.status : 500 },
    )
  }
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Proposal ID is required.' }, { status: 400 })
    }

    const found = await (payload as any).findByID({
      collection: 'checkout-proposals',
      id,
      depth: 1,
      overrideAccess: true,
    })
    if (!found) {
      return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 })
    }

    if (found.state !== 'active' || Date.parse(found.expiresAt) <= Date.now())
      return NextResponse.json({ error: 'Proposal is expired or inactive.' }, { status: 409 })
    const cart =
      typeof found.cart === 'object'
        ? found.cart
        : await payload.findByID({
            collection: 'carts',
            id: commerceRelationId(found.cart),
            depth: 0,
            overrideAccess: true,
          })
    if (!cart || !(await canAccessCommerceCart(payload, request, cart)))
      return NextResponse.json({ error: 'Proposal access denied.' }, { status: 403 })
    return NextResponse.json(
      { proposal: found },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve proposal.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin &&
    request.headers.get('origin') !==
      `${new URL(request.url).protocol}//${request.headers.get('host') ?? ''}`
  )
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  const payload = await getPayload({ config })
  try {
    const siteId = await catalogSiteForHost(payload, request.headers.get('host'))
    return await withExecutionLock(payload, `commerce.cart.site:${siteId}`, () =>
      createProposal(request),
    )
  } catch {
    return NextResponse.json({ error: 'Quote service unavailable.' }, { status: 503 })
  }
}
