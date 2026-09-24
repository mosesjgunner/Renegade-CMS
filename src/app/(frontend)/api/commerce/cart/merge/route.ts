/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import {
  mergeGuestAndMemberCarts,
  guestCartCookieName,
  hashGuestToken,
  createEmptyCart,
  type VersionedCart,
} from '@/modules/commerce/cart'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  try {
    const host = request.headers.get('host')
    const siteId = await catalogSiteForHost(payload, host)

    const memberId = await currentMember(payload as never, readMemberSession(request.headers))
    if (!memberId) {
      return NextResponse.json(
        { error: 'Authentication required for cart merge.' },
        { status: 401 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const cookieHeader = request.headers.get('cookie') ?? ''
    const cookieName = guestCartCookieName(siteId)
    const guestToken =
      body.guestToken ||
      cookieHeader
        .split(';')
        .map((c) => c.trim().split('='))
        .find(([name]) => name === cookieName)?.[1]

    if (!guestToken) {
      return NextResponse.json({ error: 'No guest cart token provided.' }, { status: 400 })
    }

    const guestHash = hashGuestToken(guestToken)
    const guestResult = await (payload as any).find({
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

    if (!guestResult.docs.length) {
      return NextResponse.json({ error: 'Guest cart not found.' }, { status: 404 })
    }
    const guestDoc = guestResult.docs[0]

    // Member cart lookup or creation
    let memberDoc: any
    const memberResult = await (payload as any).find({
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

    if (memberResult.docs.length) {
      memberDoc = memberResult.docs[0]
    } else {
      memberDoc = await (payload as any).create({
        collection: 'carts',
        data: {
          site: siteId,
          member: memberId,
          currency: guestDoc.currency ?? 'USD',
          items: [],
          appliedCouponCodes: [],
          state: 'active',
          version: 1,
        },
        overrideAccess: true,
      })
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

    const guestCart: VersionedCart = {
      id: String(guestDoc.id),
      siteId: String(guestDoc.site?.id ?? guestDoc.site),
      merchantConnectionId: String(
        guestDoc.merchantConnection?.id ?? guestDoc.merchantConnection ?? '',
      ),
      version: Number(guestDoc.version ?? 1),
      currency: String(guestDoc.currency ?? 'USD'),
      items: Array.isArray(guestDoc.items) ? guestDoc.items : [],
      appliedCouponCodes: Array.isArray(guestDoc.appliedCouponCodes)
        ? guestDoc.appliedCouponCodes
        : [],
      shippingAddress: guestDoc.shippingAddress,
      billingAddress: guestDoc.billingAddress,
      reconciliationNotes: Array.isArray(guestDoc.reconciliationNotes)
        ? guestDoc.reconciliationNotes
        : [],
      expiresAt: String(guestDoc.expiresAt ?? new Date().toISOString()),
      createdAt: String(guestDoc.createdAt),
      updatedAt: String(guestDoc.updatedAt),
    }

    const memberCart: VersionedCart = {
      id: String(memberDoc.id),
      siteId: String(memberDoc.site?.id ?? memberDoc.site),
      merchantConnectionId: String(
        memberDoc.merchantConnection?.id ?? memberDoc.merchantConnection ?? '',
      ),
      version: Number(memberDoc.version ?? 1),
      currency: String(memberDoc.currency ?? 'USD'),
      items: Array.isArray(memberDoc.items) ? memberDoc.items : [],
      appliedCouponCodes: Array.isArray(memberDoc.appliedCouponCodes)
        ? memberDoc.appliedCouponCodes
        : [],
      shippingAddress: memberDoc.shippingAddress,
      billingAddress: memberDoc.billingAddress,
      reconciliationNotes: Array.isArray(memberDoc.reconciliationNotes)
        ? memberDoc.reconciliationNotes
        : [],
      expiresAt: String(memberDoc.expiresAt ?? new Date().toISOString()),
      createdAt: String(memberDoc.createdAt),
      updatedAt: String(memberDoc.updatedAt),
    }

    const { mergedCart, pricingSnapshot, guestCartToRetire } = mergeGuestAndMemberCarts({
      guestCart,
      memberCart,
      products,
      promotions,
    })

    // Save merged member cart
    await (payload as any).update({
      collection: 'carts',
      id: memberDoc.id,
      data: {
        items: mergedCart.items,
        version: mergedCart.version,
        appliedCouponCodes: mergedCart.appliedCouponCodes,
        shippingAddress: mergedCart.shippingAddress,
        billingAddress: mergedCart.billingAddress,
        reconciliationNotes: mergedCart.reconciliationNotes,
      },
      overrideAccess: true,
    })

    // Retire guest cart
    await (payload as any).update({
      collection: 'carts',
      id: guestDoc.id,
      data: {
        items: [],
        state: 'converted',
        guestTokenHash: null,
      },
      overrideAccess: true,
    })

    const response = NextResponse.json({ cart: mergedCart, pricing: pricingSnapshot })
    // Clear guest cart cookie
    response.cookies.set(cookieName, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })

    return response
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cart merge failed.' },
      { status: 500 },
    )
  }
}
