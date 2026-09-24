/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import {
  createEmptyCart,
  reResolveCart,
  guestCartCookieName,
  generateGuestToken,
  hashGuestToken,
  CART_TTL_MS,
  type VersionedCart,
  type CartItem,
} from '@/modules/commerce/cart'
import { randomUUID } from 'node:crypto'

async function resolveCartContext(request: Request, payload: any) {
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
  let isGuest = false

  if (memberId) {
    const found = await payload.find({
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
    const found = await payload.find({
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
    if (found.docs.length) {
      cartDoc = found.docs[0]
      isGuest = true
    }
  }

  return { siteId, memberId, guestTokenMatch, cartDoc, isGuest }
}

async function loadSiteCatalogAndPromos(payload: any, siteId: string) {
  const productsResult = await payload.find({
    collection: 'products',
    where: { and: [{ site: { equals: siteId } }, { state: { equals: 'published' } }] },
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })

  const promotionsResult = await payload.find({
    collection: 'promotions',
    where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
    limit: 50,
    overrideAccess: true,
  })

  return {
    products: productsResult.docs.map((d: any) => ({
      id: String(d.id),
      name: String(d.name),
      state: String(d.state),
      kind: String(d.kind),
      productCapabilities: Array.isArray(d.productCapabilities) ? d.productCapabilities : [],
      variants: Array.isArray(d.variants) ? d.variants : [],
      offers: Array.isArray(d.offers) ? d.offers : [],
    })),
    promotions: promotionsResult.docs.map((p: any) => ({
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
    })),
  }
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  try {
    const { siteId, cartDoc } = await resolveCartContext(request, payload)
    if (!cartDoc) {
      return NextResponse.json({ cart: null, pricing: null })
    }

    const { products, promotions } = await loadSiteCatalogAndPromos(payload, siteId)
    const cart: VersionedCart = {
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
      shippingAddress: cartDoc.shippingAddress,
      billingAddress: cartDoc.billingAddress,
      selectedShippingRateId: cartDoc.selectedShippingRateId,
      reconciliationNotes: Array.isArray(cartDoc.reconciliationNotes)
        ? cartDoc.reconciliationNotes
        : [],
      expiresAt: String(cartDoc.expiresAt ?? new Date().toISOString()),
      createdAt: String(cartDoc.createdAt),
      updatedAt: String(cartDoc.updatedAt),
    }

    const { cart: resolvedCart, pricingSnapshot } = reResolveCart({
      cart,
      products,
      promotions,
    })

    // Update if notes or version changed
    if (resolvedCart.reconciliationNotes.length !== cart.reconciliationNotes.length) {
      await (payload as any).update({
        collection: 'carts',
        id: cart.id,
        data: {
          items: resolvedCart.items,
          appliedCouponCodes: resolvedCart.appliedCouponCodes,
          reconciliationNotes: resolvedCart.reconciliationNotes,
        },
        overrideAccess: true,
      })
    }

    return NextResponse.json({ cart: resolvedCart, pricing: pricingSnapshot })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve cart.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  try {
    const body = await request.json()
    const { productId, variantSku, quantity = 1, donationAmountMinor, customOptions } = body

    if (!productId || !variantSku) {
      return NextResponse.json({ error: 'productId and variantSku are required.' }, { status: 400 })
    }
    const parsedQty = Number(quantity)
    if (!Number.isSafeInteger(parsedQty) || parsedQty <= 0 || parsedQty > 9999) {
      return NextResponse.json(
        { error: 'Quantity must be a positive integer between 1 and 9999.' },
        { status: 400 },
      )
    }

    const { siteId, memberId, cartDoc } = await resolveCartContext(request, payload)
    const { products, promotions } = await loadSiteCatalogAndPromos(payload, siteId)

    const product = products.find((p: any) => p.id === productId)
    if (!product || product.state !== 'published') {
      return NextResponse.json({ error: 'Product is not available.' }, { status: 404 })
    }
    const variant = product.variants?.find((v: any) => v.sku === variantSku)
    if (!variant || variant.status === 'unavailable' || variant.status === 'archived') {
      return NextResponse.json({ error: 'Variant is not available.' }, { status: 404 })
    }

    let cart: VersionedCart
    let newGuestToken: string | undefined
    let isNewCart = false

    if (cartDoc) {
      cart = {
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
        shippingAddress: cartDoc.shippingAddress,
        billingAddress: cartDoc.billingAddress,
        selectedShippingRateId: cartDoc.selectedShippingRateId,
        reconciliationNotes: Array.isArray(cartDoc.reconciliationNotes)
          ? cartDoc.reconciliationNotes
          : [],
        expiresAt: String(cartDoc.expiresAt ?? new Date().toISOString()),
        createdAt: String(cartDoc.createdAt),
        updatedAt: String(cartDoc.updatedAt),
      }
    } else {
      isNewCart = true
      let guestHash: string | undefined
      if (!memberId) {
        const generated = generateGuestToken()
        newGuestToken = generated.token
        guestHash = generated.hash
      }

      // Default active currency from published offer or USD
      const offer = product.offers?.find((o: any) => o.status === 'active')
      const currency = offer ? offer.currency : 'USD'

      const created = await (payload as any).create({
        collection: 'carts',
        data: {
          site: siteId,
          member: memberId || undefined,
          guestTokenHash: guestHash,
          currency,
          items: [],
          appliedCouponCodes: [],
          state: 'active',
          version: 1,
        },
        overrideAccess: true,
      })

      cart = createEmptyCart({
        id: String(created.id),
        siteId,
        merchantConnectionId: '',
        currency,
        guestTokenHash: guestHash,
        customerId: memberId || undefined,
      })
    }

    // Add or increment item
    const existingIndex = cart.items.findIndex(
      (i) => i.productId === productId && i.variantSku === variantSku,
    )
    const items: CartItem[] = [...cart.items]

    if (existingIndex >= 0) {
      items[existingIndex] = {
        ...items[existingIndex],
        quantity: items[existingIndex].quantity + parsedQty,
      }
    } else {
      const lineId = `line_${randomUUID().slice(0, 8)}`
      items.push({
        lineId,
        productId,
        variantSku,
        quantity: parsedQty,
        kind: product.kind,
        donationAmountMinor,
        customOptions,
        displaySnapshot: {
          title: variant.title ?? product.name,
          unitPriceMinor: '0', // Will be re-resolved authoritatively below
          currency: cart.currency,
        },
      })
    }

    const { cart: resolvedCart, pricingSnapshot } = reResolveCart({
      cart: { ...cart, items, version: cart.version + 1 },
      products,
      promotions,
    })

    await (payload as any).update({
      collection: 'carts',
      id: resolvedCart.id,
      data: {
        items: resolvedCart.items,
        version: resolvedCart.version,
        appliedCouponCodes: resolvedCart.appliedCouponCodes,
        reconciliationNotes: resolvedCart.reconciliationNotes,
      },
      overrideAccess: true,
    })

    const response = NextResponse.json({ cart: resolvedCart, pricing: pricingSnapshot })
    if (newGuestToken) {
      response.cookies.set(guestCartCookieName(siteId), newGuestToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: CART_TTL_MS / 1000,
      })
    }
    return response
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add item to cart.' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  const payload = await getPayload({ config })
  try {
    const body = await request.json()
    const {
      expectedVersion,
      lineId,
      quantity,
      appliedCouponCodes,
      shippingAddress,
      billingAddress,
      selectedShippingRateId,
    } = body

    const { siteId, cartDoc } = await resolveCartContext(request, payload)
    if (!cartDoc) {
      return NextResponse.json({ error: 'Cart not found.' }, { status: 404 })
    }

    const currentVersion = Number(cartDoc.version ?? 1)
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      return NextResponse.json(
        { error: 'Cart was modified in another tab or window. Please refresh.' },
        { status: 409 },
      )
    }

    let items: CartItem[] = Array.isArray(cartDoc.items) ? [...cartDoc.items] : []

    if (lineId !== undefined && quantity !== undefined) {
      const parsedQty = Number(quantity)
      if (parsedQty <= 0) {
        items = items.filter((i) => i.lineId !== lineId)
      } else {
        const index = items.findIndex((i) => i.lineId === lineId)
        if (index >= 0) {
          items[index] = { ...items[index], quantity: parsedQty }
        }
      }
    }

    const { products, promotions } = await loadSiteCatalogAndPromos(payload, siteId)
    const cartToResolve: VersionedCart = {
      id: String(cartDoc.id),
      siteId,
      merchantConnectionId: String(
        cartDoc.merchantConnection?.id ?? cartDoc.merchantConnection ?? '',
      ),
      version: currentVersion + 1,
      currency: String(cartDoc.currency ?? 'USD'),
      items,
      appliedCouponCodes:
        appliedCouponCodes !== undefined ? appliedCouponCodes : (cartDoc.appliedCouponCodes ?? []),
      shippingAddress: shippingAddress !== undefined ? shippingAddress : cartDoc.shippingAddress,
      billingAddress: billingAddress !== undefined ? billingAddress : cartDoc.billingAddress,
      selectedShippingRateId:
        selectedShippingRateId !== undefined
          ? selectedShippingRateId
          : cartDoc.selectedShippingRateId,
      reconciliationNotes: Array.isArray(cartDoc.reconciliationNotes)
        ? cartDoc.reconciliationNotes
        : [],
      expiresAt: String(cartDoc.expiresAt ?? new Date().toISOString()),
      createdAt: String(cartDoc.createdAt),
      updatedAt: new Date().toISOString(),
    }

    const { cart: resolvedCart, pricingSnapshot } = reResolveCart({
      cart: cartToResolve,
      products,
      promotions,
    })

    await (payload as any).update({
      collection: 'carts',
      id: resolvedCart.id,
      data: {
        items: resolvedCart.items,
        version: resolvedCart.version,
        appliedCouponCodes: resolvedCart.appliedCouponCodes,
        shippingAddress: resolvedCart.shippingAddress,
        billingAddress: resolvedCart.billingAddress,
        selectedShippingRateId: resolvedCart.selectedShippingRateId,
        reconciliationNotes: resolvedCart.reconciliationNotes,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ cart: resolvedCart, pricing: pricingSnapshot })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update cart.' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  const payload = await getPayload({ config })
  try {
    const { siteId, cartDoc } = await resolveCartContext(request, payload)
    if (!cartDoc) {
      return NextResponse.json({ error: 'Cart not found.' }, { status: 404 })
    }

    await (payload as any).update({
      collection: 'carts',
      id: cartDoc.id,
      data: {
        items: [],
        appliedCouponCodes: [],
        version: Number(cartDoc.version ?? 1) + 1,
      },
      overrideAccess: true,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear cart.' },
      { status: 500 },
    )
  }
}
