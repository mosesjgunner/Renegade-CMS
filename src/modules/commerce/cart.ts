import { createHash, randomBytes } from 'node:crypto'
import { assertMoney } from './contracts'
import {
  computePricing,
  type PricingSnapshot,
  type PricedInputLine,
  type AdjustmentInput,
} from './pricing'
import { resolvePromotions, normalizePromoCode, type PromotionDefinition } from './promotions'
import { checkLineAvailability, type VariantInventoryRecord } from './inventory'
import { validateAddress, type RawAddressInput } from './shipping'

export const CART_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days
export const GUEST_CART_COOKIE_PREFIX = 'renegade_cart_'

export type CartItemDisplaySnapshot = Readonly<{
  title: string
  subtitle?: string
  imageUrl?: string
  unitPriceMinor: string
  compareAtMinor?: string
  currency: string
}>

export type CartItem = Readonly<{
  lineId: string
  productId: string
  variantSku: string
  quantity: number
  offerId?: string
  offerVersion?: number
  kind: 'physical' | 'digital' | 'pod' | 'subscription' | 'donation' | string
  donationAmountMinor?: string
  customOptions?: Readonly<Record<string, string>>
  displaySnapshot: CartItemDisplaySnapshot
}>

export type ReconciliationNote = Readonly<{
  code:
    | 'price-changed'
    | 'item-unavailable'
    | 'quantity-adjusted'
    | 'promotion-removed'
    | 'conflict-resolved'
  message: string
  lineId?: string
  timestamp: string
}>

export type VersionedCart = Readonly<{
  id: string
  siteId: string
  spaceId?: string
  merchantConnectionId: string
  version: number
  guestTokenHash?: string
  customerId?: string
  customerEmail?: string
  currency: string
  items: readonly CartItem[]
  appliedCouponCodes: readonly string[]
  shippingAddress?: RawAddressInput
  billingAddress?: RawAddressInput
  selectedShippingRateId?: string
  reconciliationNotes: readonly ReconciliationNote[]
  expiresAt: string
  createdAt: string
  updatedAt: string
}>

export function generateGuestToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex')
  const hash = hashGuestToken(token)
  return { token, hash }
}

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex')
}

export function guestCartCookieName(siteId: string): string {
  return `${GUEST_CART_COOKIE_PREFIX}${siteId}`
}

export type CatalogProductLookup = Readonly<{
  id: string
  name: string
  state: string
  kind: string
  productCapabilities?: readonly string[]
  variants?: readonly {
    sku: string
    title?: string
    status?: 'active' | 'unavailable' | 'archived'
    inventoryPolicy?: 'untracked' | 'tracked' | 'affiliate' | 'pod' | 'digital' | 'preorder'
    inventoryQuantity?: number
    weightGrams?: number
    shippable?: boolean
    digitalAvailable?: boolean
    podAvailable?: boolean
    allowBackorder?: boolean
    preorderWindow?: {
      startsAt: string
      endsAt?: string
      expectedReleaseDate?: string
      maxPreorderQuantity?: number
      currentPreorders?: number
    }
  }[]
  offers?: readonly {
    id: string
    version: number
    status: 'draft' | 'active' | 'retired'
    variantSku?: string
    amountMinor: string
    currency: string
    compareAtMinor?: string
    startsAt?: string
    endsAt?: string
    segmentPolicy?: { mode: 'public' | 'allowlist'; segmentIds?: readonly string[] }
    taxDisplay?: 'inclusive' | 'exclusive' | 'not-applicable'
    donation?: { minimumMinor: string; suggestedMinor?: readonly string[] }
  }[]
}>

export function createEmptyCart(input: {
  id: string
  siteId: string
  spaceId?: string
  merchantConnectionId: string
  currency: string
  guestTokenHash?: string
  customerId?: string
  customerEmail?: string
  now?: string
}): VersionedCart {
  const now = input.now ?? new Date().toISOString()
  const expiresAt = new Date(Date.parse(now) + CART_TTL_MS).toISOString()
  return {
    id: input.id,
    siteId: input.siteId,
    spaceId: input.spaceId,
    merchantConnectionId: input.merchantConnectionId,
    version: 1,
    guestTokenHash: input.guestTokenHash,
    customerId: input.customerId,
    customerEmail: input.customerEmail,
    currency: input.currency.toUpperCase(),
    items: [],
    appliedCouponCodes: [],
    reconciliationNotes: [],
    expiresAt,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Re-resolves a cart server-side against catalog data, checking purchasability,
 * detecting price changes, adjusting stock, and evaluating promotions.
 */
export function reResolveCart(input: {
  cart: VersionedCart
  products: readonly CatalogProductLookup[]
  promotions?: readonly PromotionDefinition[]
  shippingAmountMinor?: string
  taxTotalMinor?: string
  now?: string
}): { cart: VersionedCart; pricingSnapshot: PricingSnapshot } {
  const now = input.now ?? new Date().toISOString()
  const notes: ReconciliationNote[] = [...input.cart.reconciliationNotes]
  const validItems: CartItem[] = []
  const pricedInputLines: PricedInputLine[] = []

  for (const item of input.cart.items) {
    const product = input.products.find((p) => p.id === item.productId)
    if (!product || product.state !== 'published') {
      notes.push({
        code: 'item-unavailable',
        message: `Item "${item.displaySnapshot.title}" is no longer available.`,
        lineId: item.lineId,
        timestamp: now,
      })
      continue
    }

    const variant = product.variants?.find((v) => v.sku === item.variantSku)
    if (!variant || variant.status === 'unavailable' || variant.status === 'archived') {
      notes.push({
        code: 'item-unavailable',
        message: `Variant "${variant?.title ?? item.variantSku}" is currently unavailable.`,
        lineId: item.lineId,
        timestamp: now,
      })
      continue
    }

    // Availability / Inventory check
    const inventoryRecord: VariantInventoryRecord = {
      productId: product.id,
      variantSku: variant.sku,
      policy: (variant.inventoryPolicy as any) ?? 'untracked',
      quantityAvailable: variant.inventoryQuantity,
      allowBackorder: variant.allowBackorder,
      preorderWindow: variant.preorderWindow,
      podAvailable: variant.podAvailable !== false,
      digitalAvailable: variant.digitalAvailable !== false,
      status: variant.status,
    }

    const availCheck = checkLineAvailability(inventoryRecord, item.quantity, now)
    let quantityToUse = item.quantity
    if (!availCheck.available) {
      if (availCheck.availableQuantity !== undefined && availCheck.availableQuantity > 0) {
        quantityToUse = availCheck.availableQuantity
        notes.push({
          code: 'quantity-adjusted',
          message: `Quantity for "${item.displaySnapshot.title}" reduced to ${quantityToUse} due to limited stock.`,
          lineId: item.lineId,
          timestamp: now,
        })
      } else {
        notes.push({
          code: 'item-unavailable',
          message: `Item "${item.displaySnapshot.title}" is out of stock.`,
          lineId: item.lineId,
          timestamp: now,
        })
        continue
      }
    }

    // Resolve current active offer
    const matchingOffer = product.offers
      ?.filter(
        (o) =>
          o.status === 'active' &&
          o.currency === input.cart.currency &&
          (o.variantSku === variant.sku || !o.variantSku) &&
          (!o.startsAt || o.startsAt <= now) &&
          (!o.endsAt || o.endsAt > now) &&
          o.segmentPolicy?.mode !== 'allowlist',
      )
      .sort((a, b) => b.version - a.version)[0]

    if (!matchingOffer) {
      notes.push({
        code: 'item-unavailable',
        message: `No active price for "${item.displaySnapshot.title}" in ${input.cart.currency}.`,
        lineId: item.lineId,
        timestamp: now,
      })
      continue
    }

    let unitPriceMinor = matchingOffer.amountMinor
    if (product.kind === 'donation' || product.productCapabilities?.includes('donation')) {
      const selected = item.donationAmountMinor ?? matchingOffer.donation?.minimumMinor ?? '100'
      const min = matchingOffer.donation?.minimumMinor ?? '100'
      unitPriceMinor = BigInt(selected) >= BigInt(min) ? selected : min
    }

    // Check if price changed from snapshot
    if (unitPriceMinor !== item.displaySnapshot.unitPriceMinor) {
      notes.push({
        code: 'price-changed',
        message: `Price for "${item.displaySnapshot.title}" updated from ${(Number(item.displaySnapshot.unitPriceMinor) / 100).toFixed(2)} to ${(Number(unitPriceMinor) / 100).toFixed(2)} ${input.cart.currency}.`,
        lineId: item.lineId,
        timestamp: now,
      })
    }

    const updatedItem: CartItem = {
      ...item,
      quantity: quantityToUse,
      offerId: matchingOffer.id,
      offerVersion: matchingOffer.version,
      displaySnapshot: {
        ...item.displaySnapshot,
        unitPriceMinor,
        compareAtMinor: matchingOffer.compareAtMinor,
        currency: input.cart.currency,
      },
    }

    validItems.push(updatedItem)
    pricedInputLines.push({
      lineId: updatedItem.lineId,
      productId: updatedItem.productId,
      variantSku: updatedItem.variantSku,
      quantity: updatedItem.quantity,
      unitPriceMinor,
      currency: input.cart.currency,
      taxDisplay: matchingOffer.taxDisplay,
      kind: product.kind,
    })
  }

  // Evaluate promotions
  const activePromos = (input.promotions ?? []).filter((p) =>
    input.cart.appliedCouponCodes.includes(p.code),
  )

  const promoResolution = resolvePromotions(
    activePromos,
    pricedInputLines,
    input.shippingAmountMinor ?? '0',
    {
      siteId: input.cart.siteId,
      currency: input.cart.currency,
      customerId: input.cart.customerId,
      now,
    },
  )

  for (const rejected of promoResolution.rejected) {
    notes.push({
      code: 'promotion-removed',
      message: `Coupon "${rejected.code}" removed: ${rejected.reason}`,
      timestamp: now,
    })
  }

  const validCouponCodes = promoResolution.appliedPromotions.map((p) => p.code)

  // Compute central deterministic pricing
  const pricingSnapshot =
    pricedInputLines.length > 0
      ? computePricing({
          currency: input.cart.currency,
          lines: pricedInputLines,
          orderAdjustments: promoResolution.adjustments,
          shippingAmountMinor: input.shippingAmountMinor,
          taxTotalMinor: input.taxTotalMinor,
          now,
        })
      : {
          subtotalMinor: '0',
          adjustmentsTotalMinor: '0',
          shippingAmountMinor: '0',
          shippingAdjustmentMinor: '0',
          netShippingMinor: '0',
          taxTotalMinor: '0',
          grandTotalMinor: '0',
          currency: input.cart.currency,
          lines: [],
          adjustments: [],
          ruleVersion: '2026-09-23.1',
          calculatedAt: now,
          pricingHash: 'sha256:empty',
        }

  const updatedCart: VersionedCart = {
    ...input.cart,
    items: validItems,
    appliedCouponCodes: validCouponCodes,
    reconciliationNotes: notes.slice(-10), // keep latest 10 notes
    updatedAt: now,
  }

  return { cart: updatedCart, pricingSnapshot }
}

/**
 * Merges a guest cart into a member's cart on sign-in.
 * Strictly verifies site boundary to prevent cross-site token access.
 * Handled idempotently with explicit reconciliation notes for price/stock changes.
 */
export function mergeGuestAndMemberCarts(input: {
  guestCart: VersionedCart
  memberCart: VersionedCart
  products: readonly CatalogProductLookup[]
  promotions?: readonly PromotionDefinition[]
  now?: string
}): {
  mergedCart: VersionedCart
  pricingSnapshot: PricingSnapshot
  guestCartToRetire: VersionedCart
} {
  const now = input.now ?? new Date().toISOString()

  // 1. Cross-site security check: site IDs MUST match
  if (input.guestCart.siteId !== input.memberCart.siteId) {
    throw new Error('Cross-site cart access denied: Cart does not belong to this site.')
  }

  // 2. Merchant connection check
  if (input.guestCart.merchantConnectionId !== input.memberCart.merchantConnectionId) {
    throw new Error('Merchant connection mismatch during cart merge.')
  }

  // 3. Currency check: if guest cart has different currency, member cart currency takes precedence
  // and guest items will be re-priced in member currency during re-resolution.
  const targetCurrency = input.memberCart.currency

  const mergedItems: CartItem[] = [...input.memberCart.items]
  const notes: ReconciliationNote[] = [...input.memberCart.reconciliationNotes]

  for (const guestItem of input.guestCart.items) {
    const existingIndex = mergedItems.findIndex(
      (m) => m.productId === guestItem.productId && m.variantSku === guestItem.variantSku,
    )

    if (existingIndex >= 0) {
      // Combine quantities
      const existing = mergedItems[existingIndex]
      const combinedQuantity = existing.quantity + guestItem.quantity
      mergedItems[existingIndex] = {
        ...existing,
        quantity: combinedQuantity,
      }
      notes.push({
        code: 'conflict-resolved',
        message: `Combined quantities for "${guestItem.displaySnapshot.title}" to ${combinedQuantity}.`,
        lineId: existing.lineId,
        timestamp: now,
      })
    } else {
      // Add as new line in member cart
      mergedItems.push({
        ...guestItem,
        lineId: `line_${randomBytes(8).toString('hex')}`,
      })
    }
  }

  // Merge coupons (deduplicated)
  const combinedCoupons = Array.from(
    new Set([...input.memberCart.appliedCouponCodes, ...input.guestCart.appliedCouponCodes]),
  )

  // Preserve member addresses if already present, otherwise take guest's
  const shippingAddress = input.memberCart.shippingAddress ?? input.guestCart.shippingAddress
  const billingAddress = input.memberCart.billingAddress ?? input.guestCart.billingAddress

  const candidateCart: VersionedCart = {
    ...input.memberCart,
    version: input.memberCart.version + 1,
    currency: targetCurrency,
    items: mergedItems,
    appliedCouponCodes: combinedCoupons,
    shippingAddress,
    billingAddress,
    reconciliationNotes: notes,
    updatedAt: now,
  }

  // Re-resolve totals and purchasability
  const { cart: finalizedMemberCart, pricingSnapshot } = reResolveCart({
    cart: candidateCart,
    products: input.products,
    promotions: input.promotions,
    now,
  })

  // Mark guest cart as retired
  const guestCartToRetire: VersionedCart = {
    ...input.guestCart,
    items: [],
    guestTokenHash: undefined,
    expiresAt: now,
    updatedAt: now,
  }

  return {
    mergedCart: finalizedMemberCart,
    pricingSnapshot,
    guestCartToRetire,
  }
}
