/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import {
  guestCartCookieName,
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
} from '@/modules/commerce/proposal'

export async function POST(request: Request) {
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
          ],
        },
        limit: 1,
        overrideAccess: true,
      })
      if (found.docs.length) cartDoc = found.docs[0]
    }
    if (!cartDoc && guestTokenMatch) {
      const guestHash = hashGuestToken(guestTokenMatch)
      const found = await (payload as any).find({
        collection: 'carts',
        where: {
          and: [
            { site: { equals: siteId } },
            { guestTokenHash: { equals: guestHash } },
            { state: { equals: 'active' } },
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
    const { customer, shippingAddress, billingAddress, selectedShippingRateId, consents } = body

    if (!customer?.email) {
      return NextResponse.json({ error: 'Customer email is required.' }, { status: 400 })
    }
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
      limit: 100,
      depth: 1,
      overrideAccess: true,
    })

    const promotionsResult = await (payload as any).find({
      collection: 'promotions',
      where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
      limit: 50,
      overrideAccess: true,
    })

    const products = productsResult.docs.map((d: any) => ({
      id: String(d.id),
      name: String(d.name),
      state: String(d.state),
      kind: String(d.kind),
      productCapabilities: Array.isArray(d.productCapabilities) ? d.productCapabilities : [],
      variants: Array.isArray(d.variants) ? d.variants : [],
      offers: Array.isArray(d.offers) ? d.offers : [],
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
      usageLimitTotal: p.usageLimitTotal ? Number(p.usageLimitTotal) : undefined,
      usageCount: Number(p.usageCount ?? 0),
      usageLimitPerCustomer: p.usageLimitPerCustomer ? Number(p.usageLimitPerCustomer) : undefined,
      eligibility: p.eligibility ?? {},
    }))

    const rawCart: VersionedCart = {
      id: String(cartDoc.id),
      siteId: String(cartDoc.site?.id ?? cartDoc.site),
      merchantConnectionId: String(
        cartDoc.merchantConnection?.id ?? cartDoc.merchantConnection ?? '',
      ),
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
      expiresAt: String(cartDoc.expiresAt ?? new Date().toISOString()),
      createdAt: String(cartDoc.createdAt),
      updatedAt: String(cartDoc.updatedAt),
    }

    // Shipping & Tax setup
    let validatedShippingAddress = undefined
    let selectedRate = undefined
    let shippingAmountMinor = '0'
    let taxSnapshot = undefined

    const hasShippable = rawCart.items.some((i) => i.kind === 'physical' || i.kind === 'pod')
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

      // Shipping rate calculation
      const shippingAdapter = new LocalFallbackShippingAdapter({
        standardRateMinor: '500', // $5.00 default flat
        currency: rawCart.currency,
        freeShippingThresholdMinor: '5000', // $50 free shipping
        enableLocalPickup: true,
      })

      const availableRates = await shippingAdapter.getRates({
        siteId,
        currency: rawCart.currency,
        itemsSubtotalMinor: '0',
        destination: validatedShippingAddress,
        items: rawCart.items.map((i) => ({
          productId: i.productId,
          variantSku: i.variantSku,
          quantity: i.quantity,
          shippable: i.kind === 'physical' || i.kind === 'pod',
        })),
      })

      selectedRate =
        availableRates.find((r) => r.id === selectedShippingRateId) ?? availableRates[0]
      if (selectedRate) {
        shippingAmountMinor = selectedRate.amountMinor
      }

      // Tax calculation
      const taxAdapter = new BoundedJurisdictionTaxAdapter()
      try {
        taxSnapshot = await taxAdapter.calculateTax({
          siteId,
          currency: rawCart.currency,
          destination: validatedShippingAddress,
          lines: rawCart.items.map((i) => ({
            lineId: i.lineId,
            productId: i.productId,
            variantSku: i.variantSku,
            quantity: i.quantity,
            unitPriceMinor: i.displaySnapshot.unitPriceMinor,
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
    })

    const proposal = createCheckoutProposal({
      cart: resolvedCart,
      pricingSnapshot,
      customer: {
        email: customer.email,
        name: customer.name,
        memberId: memberId || undefined,
        isGuest: !memberId,
      },
      shippingAddress: validatedShippingAddress,
      billingAddress: billingAddress ? validateAddress(billingAddress) : undefined,
      selectedShippingRate: selectedRate,
      taxSnapshot,
      consents: {
        termsAccepted: true,
        privacyAccepted: true,
        marketingAccepted: Boolean(consents.marketingAccepted),
        timestamp: new Date().toISOString(),
      },
    })

    // Store proposal in DB
    const storedProposal = await (payload as any).create({
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
        fulfillmentSplit: proposal.fulfillmentSplit,
        integrityHash: 'pending',
        state: 'cancelled',
        expiresAt: proposal.expiresAt,
      },
      overrideAccess: true,
    })
    const integrityHash = computeProposalIntegrityHash({
      id: String(storedProposal.id),
      cartId: String(cartDoc.id),
      cartVersion: proposal.cartVersion,
      siteId,
      currency: proposal.currency,
      grandTotalMinor: proposal.pricingSnapshot.grandTotalMinor,
      taxTotalMinor: proposal.pricingSnapshot.taxTotalMinor,
      netShippingMinor: proposal.pricingSnapshot.netShippingMinor,
      customerEmail: proposal.customer.email,
      shippingPostalCode: proposal.shippingAddress?.normalized.postalCode,
      items: resolvedCart.items.map((item) => ({
        productId: item.productId,
        variantSku: item.variantSku,
        quantity: item.quantity,
        unitPriceMinor: item.displaySnapshot.unitPriceMinor,
      })),
    })
    await (payload as any).update({
      collection: 'checkout-proposals',
      id: storedProposal.id,
      data: { integrityHash, state: 'active' },
      overrideAccess: true,
    })

    // Create bounded inventory reservations
    const now = new Date()
    const resExpiry = new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString()
    for (const item of resolvedCart.items) {
      await (payload as any).create({
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

    return NextResponse.json({
      proposal: { ...proposal, id: String(storedProposal.id), integrityHash },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout proposal.' },
      { status: 500 },
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

    return NextResponse.json({ proposal: found })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve proposal.' },
      { status: 500 },
    )
  }
}
