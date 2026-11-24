import { createHash, randomUUID } from 'node:crypto'
import type { VersionedCart } from './cart'
import type { PricingSnapshot } from './pricing'
import type { ValidatedAddress, ShippingRate } from './shipping'
import type { TaxCalculationResult } from './tax'
import { fulfillmentGroupKindForLine, type ProductSourceDescriptor } from './adapters'

export const PROPOSAL_TTL_MS = 20 * 60 * 1000 // 20 minutes

export type ProposalCustomerInfo = Readonly<{
  email: string
  name?: string
  country?: string
  memberId?: string
  isGuest: boolean
}>

export type ProposalConsent = Readonly<{
  termsAccepted: boolean
  privacyAccepted: boolean
  marketingAccepted?: boolean
  timestamp: string
}>

export type FulfillmentGroupKind = 'physical' | 'digital' | 'pod' | 'dropship' | 'referral'

export type FulfillmentGroup = Readonly<{
  fulfillmentKind: FulfillmentGroupKind
  items: readonly Readonly<{
    productId: string
    variantSku: string
    title: string
    quantity: number
    unitPriceMinor: string
    lineAmountMinor: string
    entitlement?: string
    podProviderKey?: string
    /** Adapter provider key serving this line (dropship supplier, referral program). */
    sourceProviderKey?: string
  }>[]
  shippingRate?: ShippingRate
  /**
   * Referral groups are terminal at checkout: the partner is merchant of
   * record, the buyer completes the purchase at the disclosed destination,
   * and the group is never priced, paid, or fulfilled by this shop.
   */
  state?: 'referred'
  referral?: Readonly<{ destinationUrl?: string; disclosure?: string }>
}>

export type ReferralLineInput = Readonly<{
  productId: string
  variantSku: string
  title: string
  quantity: number
  /** Display-only observed price at the seller; never charged by this shop. */
  observedUnitPriceMinor?: string
  destinationUrl?: string
  disclosure?: string
  sourceProviderKey?: string
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
  buyerCountry?: string
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
    ...(proposal.buyerCountry ? [`buyer-country:${proposal.buyerCountry}`] : []),
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
  /** RC3-20: per-group shipping rates. Each shippable group carries its own
   * rate; the pricing snapshot's netShippingMinor is their sum. Falls back to
   * selectedShippingRate per group when a group rate is not supplied. */
  groupShippingRates?: Partial<Record<'physical' | 'pod' | 'dropship', ShippingRate>>
  /** RC3-20: per-line source descriptors, keyed by cart lineId. Lines whose
   * source is a dropship supplier form their own fulfillment group. */
  lineSources?: ReadonlyMap<string, ProductSourceDescriptor>
  /** RC3-20: affiliate lines partitioned out before pricing by the caller.
   * They close as a terminal referral group — never priced or paid here. */
  referralLines?: readonly ReferralLineInput[]
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

  // Split items into fulfillment groups by source: own-physical, digital,
  // POD, and dropship each ship (or settle) separately and carry their own
  // shipping rate. Affiliate lines never reach this loop as priced lines —
  // the caller partitions them into referralLines before pricing.
  const physicalItems: any[] = []
  const digitalItems: any[] = []
  const podItems: any[] = []
  const dropshipItems: any[] = []

  for (const item of input.cart.items) {
    const priced = input.pricingSnapshot.lines.find((l) => l.lineId === item.lineId)
    const unitPriceMinor = priced?.unitPriceMinor ?? item.displaySnapshot.unitPriceMinor
    const lineAmountMinor =
      priced?.grossAmountMinor ?? (BigInt(unitPriceMinor) * BigInt(item.quantity)).toString()

    const source = input.lineSources?.get(item.lineId)
    const groupKind = source
      ? fulfillmentGroupKindForLine({ itemKind: item.kind, source })
      : item.kind === 'digital' || item.kind === 'subscription' || item.kind === 'donation'
        ? 'digital'
        : item.kind === 'pod'
          ? 'pod'
          : 'physical'
    if (groupKind === 'referral') {
      // Defense in depth: an affiliate line must never become a priced line,
      // even if a caller forgot to partition before pricing.
      throw new Error('Affiliate products must be purchased at the disclosed seller destination.')
    }

    const lineInfo = {
      productId: item.productId,
      variantSku: item.variantSku,
      title: item.displaySnapshot.title,
      quantity: item.quantity,
      unitPriceMinor,
      lineAmountMinor,
      entitlement: item.kind === 'digital' ? `entitlement:${item.productId}` : undefined,
      podProviderKey: item.kind === 'pod' ? 'pod-provider' : undefined,
      sourceProviderKey: source && source.type !== 'own' ? source.providerKey : undefined,
    }

    if (groupKind === 'digital') {
      digitalItems.push(lineInfo)
    } else if (groupKind === 'pod') {
      podItems.push(lineInfo)
    } else if (groupKind === 'dropship') {
      dropshipItems.push(lineInfo)
    } else {
      physicalItems.push(lineInfo)
    }
  }

  const groupRate = (kind: 'physical' | 'pod' | 'dropship') =>
    input.groupShippingRates?.[kind] ?? input.selectedShippingRate

  const fulfillmentSplit: FulfillmentGroup[] = []
  if (physicalItems.length > 0) {
    if (!input.shippingAddress || !input.shippingAddress.isValid) {
      throw new Error('Physical items require a valid shipping address.')
    }
    if (!groupRate('physical')) {
      throw new Error('Physical items require a selected shipping rate.')
    }
    fulfillmentSplit.push({
      fulfillmentKind: 'physical',
      items: physicalItems,
      shippingRate: groupRate('physical'),
    })
  }

  if (podItems.length > 0) {
    if (!input.shippingAddress || !input.shippingAddress.isValid) {
      throw new Error('Print-on-demand items require a valid shipping address.')
    }
    fulfillmentSplit.push({
      fulfillmentKind: 'pod',
      items: podItems,
      shippingRate: groupRate('pod'),
    })
  }

  if (dropshipItems.length > 0) {
    if (!input.shippingAddress || !input.shippingAddress.isValid) {
      throw new Error('Dropship items require a valid shipping address.')
    }
    if (!groupRate('dropship')) {
      throw new Error('Dropship items require a shipping rate.')
    }
    fulfillmentSplit.push({
      fulfillmentKind: 'dropship',
      items: dropshipItems,
      shippingRate: groupRate('dropship'),
    })
  }

  if (digitalItems.length > 0) {
    fulfillmentSplit.push({
      fulfillmentKind: 'digital',
      items: digitalItems,
    })
  }

  if (input.referralLines && input.referralLines.length > 0) {
    const first = input.referralLines[0]
    fulfillmentSplit.push({
      fulfillmentKind: 'referral',
      state: 'referred',
      referral: { destinationUrl: first.destinationUrl, disclosure: first.disclosure },
      items: input.referralLines.map((line) => ({
        productId: line.productId,
        variantSku: line.variantSku,
        title: line.title,
        quantity: line.quantity,
        // Observed price at the seller, for display only. The referral group
        // is excluded from the pricing snapshot and is never charged.
        unitPriceMinor: line.observedUnitPriceMinor ?? '0',
        lineAmountMinor: (
          BigInt(line.observedUnitPriceMinor ?? '0') * BigInt(line.quantity)
        ).toString(),
        sourceProviderKey: line.sourceProviderKey ?? 'affiliate-referral',
      })),
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
    buyerCountry: input.customer.country,
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
    buyerCountry: proposal.customer.country,
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
