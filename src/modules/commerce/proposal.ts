import { createHash, randomUUID } from 'node:crypto'
import type { VersionedCart } from './cart'
import type { PricingSnapshot } from './pricing'
import type { ValidatedAddress, ShippingRate } from './shipping'
import type { TaxCalculationResult } from './tax'

export const PROPOSAL_TTL_MS = 20 * 60 * 1000 // 20 minutes

export type ProposalCustomerInfo = Readonly<{
  email: string
  name?: string
  memberId?: string
  isGuest: boolean
}>

export type ProposalConsent = Readonly<{
  termsAccepted: boolean
  privacyAccepted: boolean
  marketingAccepted?: boolean
  timestamp: string
}>

export type FulfillmentGroup = Readonly<{
  fulfillmentKind: 'physical' | 'digital' | 'pod'
  items: readonly Readonly<{
    productId: string
    variantSku: string
    title: string
    quantity: number
    unitPriceMinor: string
    lineAmountMinor: string
    entitlement?: string
    podProviderKey?: string
  }>[]
  shippingRate?: ShippingRate
}>

export type CheckoutProposal = Readonly<{
  id: string
  cartId: string
  cartVersion: number
  siteId: string
  spaceId?: string
  merchantConnectionId: string
  currency: string
  customer: ProposalCustomerInfo
  shippingAddress?: ValidatedAddress
  billingAddress?: ValidatedAddress
  selectedShippingRate?: ShippingRate
  pricingSnapshot: PricingSnapshot
  taxSnapshot?: TaxCalculationResult
  consents: ProposalConsent
  fulfillmentSplit: readonly FulfillmentGroup[]
  integrityHash: string
  state: 'active' | 'consumed' | 'expired' | 'cancelled'
  expiresAt: string
  createdAt: string
}>

export function computeProposalIntegrityHash(proposal: {
  id: string
  cartId: string
  cartVersion: number
  siteId: string
  currency: string
  grandTotalMinor: string
  taxTotalMinor: string
  netShippingMinor: string
  customerEmail: string
  shippingPostalCode?: string
  items: readonly {
    productId: string
    variantSku: string
    quantity: number
    unitPriceMinor: string
  }[]
}): string {
  const itemsDigest = proposal.items
    .map((i) => `${i.productId}:${i.variantSku}:${i.quantity}:${i.unitPriceMinor}`)
    .sort()
    .join('|')

  const raw = [
    proposal.id,
    proposal.cartId,
    proposal.cartVersion,
    proposal.siteId,
    proposal.currency,
    proposal.grandTotalMinor,
    proposal.taxTotalMinor,
    proposal.netShippingMinor,
    proposal.customerEmail.toLowerCase().trim(),
    proposal.shippingPostalCode ?? '',
    itemsDigest,
  ].join(';')

  return `sha256:${createHash('sha256').update(raw).digest('hex')}`
}

/**
 * Creates an immutable checkout proposal from a cart and verified pricing snapshot.
 */
export function createCheckoutProposal(input: {
  cart: VersionedCart
  pricingSnapshot: PricingSnapshot
  customer: ProposalCustomerInfo
  shippingAddress?: ValidatedAddress
  billingAddress?: ValidatedAddress
  selectedShippingRate?: ShippingRate
  taxSnapshot?: TaxCalculationResult
  consents: ProposalConsent
  now?: string
  ttlMs?: number
  id?: string
}): CheckoutProposal {
  if (input.cart.items.length === 0) {
    throw new Error('Cannot create checkout proposal for an empty cart.')
  }
  if (!input.customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customer.email.trim())) {
    throw new Error('A valid customer email is required for checkout proposal.')
  }
  if (!input.consents.termsAccepted || !input.consents.privacyAccepted) {
    throw new Error('Terms and privacy policy consent must be accepted.')
  }

  const now = input.now ?? new Date().toISOString()
  const expiresAt = new Date(Date.parse(now) + (input.ttlMs ?? PROPOSAL_TTL_MS)).toISOString()
  const id = input.id ?? randomUUID()

  // Split items into fulfillment groups (physical vs digital vs POD)
  const physicalItems: any[] = []
  const digitalItems: any[] = []
  const podItems: any[] = []

  for (const item of input.cart.items) {
    const priced = input.pricingSnapshot.lines.find((l) => l.lineId === item.lineId)
    const unitPriceMinor = priced?.unitPriceMinor ?? item.displaySnapshot.unitPriceMinor
    const lineAmountMinor =
      priced?.grossAmountMinor ?? (BigInt(unitPriceMinor) * BigInt(item.quantity)).toString()

    const lineInfo = {
      productId: item.productId,
      variantSku: item.variantSku,
      title: item.displaySnapshot.title,
      quantity: item.quantity,
      unitPriceMinor,
      lineAmountMinor,
      entitlement: item.kind === 'digital' ? `entitlement:${item.productId}` : undefined,
      podProviderKey: item.kind === 'pod' ? 'pod-provider' : undefined,
    }

    if (item.kind === 'digital' || item.kind === 'subscription' || item.kind === 'donation') {
      digitalItems.push(lineInfo)
    } else if (item.kind === 'pod') {
      podItems.push(lineInfo)
    } else {
      physicalItems.push(lineInfo)
    }
  }

  const fulfillmentSplit: FulfillmentGroup[] = []
  if (physicalItems.length > 0) {
    if (!input.shippingAddress || !input.shippingAddress.isValid) {
      throw new Error('Physical items require a valid shipping address.')
    }
    if (!input.selectedShippingRate) {
      throw new Error('Physical items require a selected shipping rate.')
    }
    fulfillmentSplit.push({
      fulfillmentKind: 'physical',
      items: physicalItems,
      shippingRate: input.selectedShippingRate,
    })
  }

  if (podItems.length > 0) {
    if (!input.shippingAddress || !input.shippingAddress.isValid) {
      throw new Error('Print-on-demand items require a valid shipping address.')
    }
    fulfillmentSplit.push({
      fulfillmentKind: 'pod',
      items: podItems,
      shippingRate: input.selectedShippingRate,
    })
  }

  if (digitalItems.length > 0) {
    fulfillmentSplit.push({
      fulfillmentKind: 'digital',
      items: digitalItems,
    })
  }

  const integrityHash = computeProposalIntegrityHash({
    id,
    cartId: input.cart.id,
    cartVersion: input.cart.version,
    siteId: input.cart.siteId,
    currency: input.cart.currency,
    grandTotalMinor: input.pricingSnapshot.grandTotalMinor,
    taxTotalMinor: input.pricingSnapshot.taxTotalMinor,
    netShippingMinor: input.pricingSnapshot.netShippingMinor,
    customerEmail: input.customer.email,
    shippingPostalCode: input.shippingAddress?.normalized.postalCode,
    items: input.cart.items.map((i) => ({
      productId: i.productId,
      variantSku: i.variantSku,
      quantity: i.quantity,
      unitPriceMinor: i.displaySnapshot.unitPriceMinor,
    })),
  })

  return {
    id,
    cartId: input.cart.id,
    cartVersion: input.cart.version,
    siteId: input.cart.siteId,
    spaceId: input.cart.spaceId,
    merchantConnectionId: input.cart.merchantConnectionId,
    currency: input.cart.currency,
    customer: input.customer,
    shippingAddress: input.shippingAddress,
    billingAddress: input.billingAddress,
    selectedShippingRate: input.selectedShippingRate,
    pricingSnapshot: input.pricingSnapshot,
    taxSnapshot: input.taxSnapshot,
    consents: input.consents,
    fulfillmentSplit,
    integrityHash,
    state: 'active',
    expiresAt,
    createdAt: now,
  }
}

/**
 * Validates that a proposal is untouched, active, unexpired, and matches current cart state.
 */
export function assertProposalValidForCheckout(
  proposal: CheckoutProposal,
  cart: VersionedCart,
  nowIso = new Date().toISOString(),
): void {
  if (proposal.state !== 'active') {
    throw new Error(`Checkout proposal is not active (state: ${proposal.state}).`)
  }
  if (proposal.expiresAt <= nowIso) {
    throw new Error(
      'Checkout proposal has expired. Please review your cart and generate a fresh quote.',
    )
  }
  if (proposal.cartId !== cart.id) {
    throw new Error('Proposal does not match the current cart.')
  }
  if (proposal.cartVersion !== cart.version) {
    throw new Error(
      'Cart has been modified since checkout proposal was generated. Please review your updated totals.',
    )
  }

  // Re-verify integrity hash
  const expectedHash = computeProposalIntegrityHash({
    id: proposal.id,
    cartId: proposal.cartId,
    cartVersion: proposal.cartVersion,
    siteId: proposal.siteId,
    currency: proposal.currency,
    grandTotalMinor: proposal.pricingSnapshot.grandTotalMinor,
    taxTotalMinor: proposal.pricingSnapshot.taxTotalMinor,
    netShippingMinor: proposal.pricingSnapshot.netShippingMinor,
    customerEmail: proposal.customer.email,
    shippingPostalCode: proposal.shippingAddress?.normalized.postalCode,
    items: cart.items.map((i) => ({
      productId: i.productId,
      variantSku: i.variantSku,
      quantity: i.quantity,
      unitPriceMinor: i.displaySnapshot.unitPriceMinor,
    })),
  })

  if (proposal.integrityHash !== expectedHash) {
    throw new Error('Proposal integrity check failed: Snapshot data has been altered.')
  }
}
