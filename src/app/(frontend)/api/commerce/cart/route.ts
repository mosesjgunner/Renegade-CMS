/* eslint-disable @typescript-eslint/no-explicit-any */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { catalogSiteForHost } from '@/modules/commerce/site-scope'
import { currentMember, readMemberSession } from '@/modules/identity/member-identity'
import { isRegisteredCollection } from '@/modules/public/registered-collections'
import {
  createEmptyCart,
  reResolveCart,
  guestCartCookieName,
  activeCartLifetimeWhere,
  cartExpiry,
  generateGuestToken,
  hashGuestToken,
  CART_TTL_MS,
  type VersionedCart,
  type CartItem,
} from '@/modules/commerce/cart'
import { randomUUID } from 'node:crypto'
import { withExecutionLock } from '@/modules/operations/execution-lock'
import { validateCartMutation } from '@/modules/commerce/cart-mutation'
import { configuredCheckoutMerchant } from '@/modules/commerce/merchant-selection'

async function resolveCartContext(request: Request, payload: any) {
  if (!isRegisteredCollection(payload, 'carts')) {
    throw new Error('Commerce cart service is unavailable.')
  }
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
    const found = await payload.find({
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
    pagination: false,
    depth: 1,
    overrideAccess: true,
  })

  const promotionsResult = await payload.find({
    collection: 'promotions',
    where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
    pagination: false,
    overrideAccess: true,
  })

  return {
    products: productsResult.docs.map((d: any) => ({
      id: String(d.id),
      name: String(d.name),
      state: String(d.state),
      kind: String(d.kind),
      productCapabilities: Array.isArray(d.productCapabilities) ? d.productCapabilities : [],
      merchantConnectionId: String(d.merchantConnection?.id ?? d.merchantConnection ?? ''),
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
      usageLimitTotal: p.usageLimitTotal != null ? Number(p.usageLimitTotal) : undefined,
      usageCount: Number(p.usageCount ?? 0),
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      usageLimitPerCustomer:
        p.usageLimitPerCustomer != null ? Number(p.usageLimitPerCustomer) : undefined,
      eligibility: p.eligibility ?? {},
    })),
  }
}

async function handleGET(request: Request) {
  const payload = await getPayload({ config })
  if (!isRegisteredCollection(payload, 'carts')) {
    return NextResponse.json({ error: 'Commerce cart service is unavailable.' }, { status: 503 })
  }
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
      customerId: String(cartDoc.member?.id ?? cartDoc.member ?? '') || undefined,
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
      expiresAt: cartExpiry(cartDoc),
      createdAt: String(cartDoc.createdAt),
      updatedAt: String(cartDoc.updatedAt),
    }

    const { cart: initialCart, pricingSnapshot } = reResolveCart({ cart, products, promotions })
    let resolvedCart = initialCart

    // Update if notes or version changed
    if (
      JSON.stringify(resolvedCart.items) !== JSON.stringify(cart.items) ||
      JSON.stringify(resolvedCart.appliedCouponCodes) !== JSON.stringify(cart.appliedCouponCodes)
    ) {
      resolvedCart = { ...resolvedCart, version: cart.version + 1 }
      await (payload as any).update({
        collection: 'carts',
        id: cart.id,
        data: {
          items: resolvedCart.items,
          version: cart.version + 1,
          appliedCouponCodes: resolvedCart.appliedCouponCodes,
          reconciliationNotes: resolvedCart.reconciliationNotes,
        },
        overrideAccess: true,
      })
    }

    return NextResponse.json(
      { cart: resolvedCart, pricing: pricingSnapshot },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve cart.' },
      { status: 500 },
    )
  }
}

async function handlePOST(request: Request) {
  const payload = await getPayload({ config })
  if (!isRegisteredCollection(payload, 'carts')) {
    return NextResponse.json({ error: 'Commerce cart service is unavailable.' }, { status: 503 })
  }
  try {
    const body = await request.json()
    const invalid = validateCartMutation(body, request.method)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
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

    if (
      cartDoc &&
      product.merchantConnectionId &&
      product.merchantConnectionId !==
        String(cartDoc.merchantConnection?.id ?? cartDoc.merchantConnection ?? '')
    )
      return NextResponse.json({ error: 'Merchant connection mismatch.' }, { status: 409 })

    let cart: VersionedCart
    let newGuestToken: string | undefined

    if (cartDoc) {
      cart = {
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
        shippingAddress: cartDoc.shippingAddress,
        billingAddress: cartDoc.billingAddress,
        selectedShippingRateId: cartDoc.selectedShippingRateId,
        reconciliationNotes: Array.isArray(cartDoc.reconciliationNotes)
          ? cartDoc.reconciliationNotes
          : [],
        expiresAt: cartExpiry(cartDoc),
        createdAt: String(cartDoc.createdAt),
        updatedAt: String(cartDoc.updatedAt),
      }
    } else {
      let guestHash: string | undefined
      if (!memberId) {
        const generated = generateGuestToken()
        newGuestToken = generated.token
        guestHash = generated.hash
      }

      // Default active currency from published offer or USD
      const offer = product.offers?.find((o: any) => o.status === 'active')
      const currency = offer ? offer.currency : 'USD'

      const merchants = await (payload as any).find({
        collection: 'merchant-connections',
        where: { and: [{ site: { equals: siteId } }, { status: { equals: 'active' } }] },
        pagination: false,
        overrideAccess: true,
      })
      const methods = await payload.find({
        collection: 'payment-method-capabilities',
        where: { site: { equals: siteId } },
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      const merchantId = configuredCheckoutMerchant(merchants.docs, methods.docs, {
        siteId,
        currency,
        preferredMerchantId: product.merchantConnectionId || undefined,
      })?.id

      const created = await (payload as any).create({
        collection: 'carts',
        data: {
          site: siteId,
          merchantConnection: merchantId || undefined,
          member: memberId || undefined,
          guestTokenHash: guestHash,
          currency,
          items: [],
          appliedCouponCodes: [],
          state: 'active',
          version: 1,
          expiresAt: new Date(Date.now() + CART_TTL_MS).toISOString(),
        },
        overrideAccess: true,
      })

      cart = createEmptyCart({
        id: String(created.id),
        siteId,
        merchantConnectionId: String(
          created.merchantConnection?.id ?? created.merchantConnection ?? '',
        ),
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

async function handlePATCH(request: Request) {
  const payload = await getPayload({ config })
  try {
    const body = await request.json()
    const invalid = validateCartMutation(body, request.method)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
    const {
      expectedVersion,
      lineId,
      variantSku,
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
    if (variantSku !== undefined) {
      const item = items.find((line) => line.lineId === lineId)
      const product = products.find((product: any) => product.id === item?.productId)
      if (
        !item ||
        !product?.variants.some(
          (variant: any) =>
            variant.sku === variantSku && !['archived', 'unavailable'].includes(variant.status),
        )
      )
        return NextResponse.json({ error: 'Variant is not available.' }, { status: 404 })
      const duplicate = items.find(
        (line) =>
          line.lineId !== lineId &&
          line.productId === item.productId &&
          line.variantSku === variantSku,
      )
      if (duplicate)
        items = items
          .filter((line) => line.lineId !== lineId)
          .map((line) =>
            line.lineId === duplicate.lineId
              ? { ...line, quantity: line.quantity + item.quantity }
              : line,
          )
      else items = items.map((line) => (line.lineId === lineId ? { ...line, variantSku } : line))
    }
    const cartToResolve: VersionedCart = {
      id: String(cartDoc.id),
      siteId,
      merchantConnectionId: String(
        cartDoc.merchantConnection?.id ?? cartDoc.merchantConnection ?? '',
      ),
      customerId: String(cartDoc.member?.id ?? cartDoc.member ?? '') || undefined,
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
      expiresAt: cartExpiry(cartDoc),
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

    return NextResponse.json(
      { cart: resolvedCart, pricing: pricingSnapshot },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update cart.' },
      { status: 500 },
    )
  }
}

async function handleDELETE(request: Request) {
  const payload = await getPayload({ config })
  if (!isRegisteredCollection(payload, 'carts')) {
    return NextResponse.json({ error: 'Commerce cart service is unavailable.' }, { status: 503 })
  }
  try {
    const { cartDoc } = await resolveCartContext(request, payload)
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

// Share the same database lock with merge, including anonymous first-cart creation.
async function locked(request: Request, handler: (request: Request) => Promise<NextResponse>) {
  const payload = await getPayload({ config })
  if (!isRegisteredCollection(payload, 'carts'))
    return NextResponse.json({ error: 'Commerce cart service is unavailable.' }, { status: 503 })
  if (
    request.method !== 'GET' &&
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin &&
    request.headers.get('origin') !==
      `${new URL(request.url).protocol}//${request.headers.get('host') ?? ''}`
  )
    return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 })
  try {
    const siteId = await catalogSiteForHost(payload, request.headers.get('host'))
    return await withExecutionLock(payload, `commerce.cart.site:${siteId}`, () => handler(request))
  } catch {
    return NextResponse.json({ error: 'Cart service unavailable.' }, { status: 503 })
  }
}
export const GET = (request: Request) => locked(request, handleGET)
export const POST = (request: Request) => locked(request, handlePOST)
export const PATCH = (request: Request) => locked(request, handlePATCH)
export const DELETE = (request: Request) => locked(request, handleDELETE)
