import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'
import {
  appendFinancialEvent,
  assertSingleMerchant,
  eligiblePaymentMethods,
  type ChainPaymentObservation,
  type CheckoutContext,
  type CryptoInvoice,
  type PaymentIntent,
  type PaymentMethodCapability,
  type OrderLineSnapshot,
  quoteOrderLines,
  verifyCryptoObservation,
} from './contracts'

export type CartLine = {
  productId: string
  variantSku: string
  quantity: number
  merchantConnectionId: string
  kind: 'physical' | 'digital' | 'pod-reference' | 'subscription' | 'membership' | 'donation'
  donationAmountMinor?: string
}
export type CheckoutState =
  | 'open'
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'abandoned'
  | 'expired'
export type ProviderEvent = {
  id: string
  intentId: string
  kind:
    | 'confirmed'
    | 'failed'
    | 'cancelled'
    | 'refunded'
    | 'disputed'
    | 'subscription-renewed'
    | 'fulfillment-failed'
  occurredAt: string
}
export function sameCommerceScope(
  expected: { siteId: string; spaceId: string; merchantConnectionId: string },
  actual: { siteId: string; spaceId: string; merchantConnectionId: string },
) {
  return (
    expected.siteId === actual.siteId &&
    expected.spaceId === actual.spaceId &&
    expected.merchantConnectionId === actual.merchantConnectionId
  )
}
export function validWebhookEvent(
  event: ProviderEvent | null,
  expectedIntentId: string,
  now = new Date(),
  maxAgeMs = 10 * 60 * 1000,
) {
  if (!event || !/^[A-Za-z0-9_.:-]{1,200}$/.test(event.id) || event.intentId !== expectedIntentId)
    return false
  if (
    ![
      'confirmed',
      'failed',
      'cancelled',
      'refunded',
      'disputed',
      'subscription-renewed',
      'fulfillment-failed',
    ].includes(event.kind)
  )
    return false
  const occurredAt = Date.parse(event.occurredAt)
  return (
    Number.isFinite(occurredAt) &&
    occurredAt <= now.getTime() + 60_000 &&
    now.getTime() - occurredAt <= maxAgeMs
  )
}
export type PaymentAdapter = {
  key: string
  initiate(input: {
    intentId: string
    amountMinor: string
    currency: string
    returnUrl: string
  }): Promise<{
    providerReference: string
    flow: 'hosted' | 'redirect' | 'asynchronous' | 'manual'
    actionUrl?: string
  }>
  verifyWebhook(raw: string, signature: string): ProviderEvent | null
}

export class PaymentAdapterRegistry {
  private adapters = new Map<string, PaymentAdapter>()
  register(adapter: PaymentAdapter) {
    this.adapters.set(adapter.key, adapter)
  }
  get(key: string) {
    const adapter = this.adapters.get(key)
    if (!adapter) throw new Error(`Payment adapter ${key} is not configured.`)
    return adapter
  }
}
export const createDevelopmentAdapter = (
  key: string,
  secret: string,
  flow: 'hosted' | 'asynchronous' = 'hosted',
): PaymentAdapter => ({
  key,
  async initiate({ intentId }) {
    return {
      providerReference: `${key}:${intentId}`,
      flow,
      ...(flow === 'hosted' ? { actionUrl: `/checkout/test/${intentId}` } : {}),
    }
  },
  verifyWebhook(raw, signature) {
    const expected = createHmac('sha256', secret).update(raw).digest('hex')
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return null
    try {
      return JSON.parse(raw) as ProviderEvent
    } catch {
      return null
    }
  },
})
export const representativeDevelopmentAdapters = (secret: string) =>
  ['stripe', 'paypal', 'mollie']
    .map((key) => createDevelopmentAdapter(`development-${key}`, secret))
    .concat(createDevelopmentAdapter('development-bank-transfer', secret, 'asynchronous'))

export function methodsForCart(
  methods: readonly PaymentMethodCapability[],
  context: CheckoutContext,
  lines: readonly CartLine[],
) {
  assertSingleMerchant(lines)
  if (
    lines.some((line) => ['subscription', 'membership'].includes(line.kind)) !== context.recurring
  )
    throw new Error('Purchase type does not match checkout recurrence.')
  return eligiblePaymentMethods(methods, context)
}
export function transitionOrder(state: string, event: ProviderEvent): string {
  if (['refunded', 'cancelled'].includes(state)) return state
  if (event.kind === 'refunded') return 'refunded'
  if (event.kind === 'disputed') return 'exception'
  if (event.kind === 'fulfillment-failed') return 'exception'
  if (['paid', 'fulfilled'].includes(state)) return state
  if (event.kind === 'confirmed') return 'paid'
  if (event.kind === 'failed') return 'failed'
  return 'cancelled'
}
export function applyVerifiedWebhook(intent: PaymentIntent, event: ProviderEvent): PaymentIntent {
  return appendFinancialEvent(intent, {
    id: `provider:${event.id}`,
    intentId: intent.id,
    kind:
      event.kind === 'confirmed' || event.kind === 'subscription-renewed'
        ? 'confirmed'
        : event.kind === 'refunded'
          ? 'refunded'
          : event.kind === 'disputed'
            ? 'disputed'
            : 'failed',
    money: intent.money,
    providerEventId: event.id,
    occurredAt: event.occurredAt,
  })
}
export function clientCallbackCannotConfirmPayment(): false {
  return false
}

export function deriveDownloadGrantKey(
  input: { orderId: string; productId: string; variantSku: string; mediaId: string },
  secret: string,
): string {
  if (secret.length < 16) throw new Error('Digital delivery secret is not configured.')
  return createHmac('sha256', secret)
    .update(`${input.orderId}\0${input.productId}\0${input.variantSku}\0${input.mediaId}`)
    .digest('base64url')
}

/** A cart is only a selection. This produces the immutable server quote used by checkout and Order. */
export function snapshotQuotedLines(input: {
  cartLines: readonly CartLine[]
  products: readonly {
    id: string
    name: string
    state?: string
    kind: string
    catalogContractVersion?: number
    productCapabilities?: readonly string[]
    variants?: readonly {
      sku?: string
      title?: string
      status?: string
      inventoryPolicy?: string
      inventoryQuantity?: number
    }[]
    prices?: readonly {
      currency?: string
      amountMinor?: string
      variantSku?: string
      recurringInterval?: string
    }[]
    offers?: readonly {
      offerId?: string
      version?: number
      status?: string
      currency?: string
      amountMinor?: string
      variantSku?: string
      startsAt?: string
      endsAt?: string
      segmentPolicy?: { mode?: string }
      donation?: { minimumMinor?: string; suggestedMinor?: readonly string[] }
    }[]
    entitlement?: string | null
    digitalDelivery?: { entitlement?: string } | null
  }[]
  currency: string
  now?: string
}): OrderLineSnapshot[] {
  const now = input.now ?? new Date().toISOString()
  return input.cartLines.map((cartLine) => {
    const product = input.products.find((candidate) => candidate.id === cartLine.productId)
    if (!product || product.state !== 'published') throw new Error('Product is not published.')
    if (product.kind === 'affiliate' || product.productCapabilities?.includes('affiliate'))
      throw new Error('Affiliate products must be purchased at the disclosed seller destination.')
    if (!Number.isInteger(cartLine.quantity) || cartLine.quantity < 1)
      throw new Error('Product quantity must be a positive integer.')
    const variant = product.variants?.find((candidate) => candidate.sku === cartLine.variantSku)
    if (
      variant?.status === 'unavailable' ||
      variant?.status === 'archived' ||
      (variant?.inventoryPolicy === 'tracked' &&
        Number(variant.inventoryQuantity ?? 0) < cartLine.quantity)
    )
      throw new Error('Product variant is unavailable.')
    const offer = product.offers
      ?.filter(
        (candidate) =>
          candidate.status === 'active' &&
          candidate.currency === input.currency &&
          (candidate.variantSku === cartLine.variantSku || !candidate.variantSku) &&
          (!candidate.startsAt || candidate.startsAt <= now) &&
          (!candidate.endsAt || candidate.endsAt > now) &&
          candidate.segmentPolicy?.mode !== 'allowlist',
      )
      .sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0))[0]
    const price =
      offer ??
      (!product.catalogContractVersion
        ? product.prices?.find(
            (candidate) =>
              candidate.currency === input.currency &&
              (candidate.variantSku === cartLine.variantSku || !candidate.variantSku),
          )
        : undefined)
    if (!variant || !price?.amountMinor)
      throw new Error('Product variant has no server price in this currency.')
    let unitAmountMinor = String(price.amountMinor)
    if (!/^(0|[1-9][0-9]*)$/.test(unitAmountMinor))
      throw new Error('Product price must use integer minor units.')
    if (product.kind === 'donation' || product.productCapabilities?.includes('donation')) {
      const selected = String(cartLine.donationAmountMinor ?? '')
      const minimum = offer?.donation?.minimumMinor
      if (
        cartLine.quantity !== 1 ||
        !/^(0|[1-9][0-9]*)$/.test(selected) ||
        !minimum ||
        !/^(0|[1-9][0-9]*)$/.test(minimum) ||
        BigInt(selected) < BigInt(minimum)
      )
        throw new Error('Donation amount does not meet the published minimum.')
      unitAmountMinor = selected
    }
    return {
      productId: product.id,
      variantSku: cartLine.variantSku,
      title: variant.title ?? product.name,
      quantity: cartLine.quantity,
      unitAmountMinor,
      lineAmountMinor: (BigInt(unitAmountMinor) * BigInt(cartLine.quantity)).toString(),
      currency: input.currency,
      kind: product.kind,
      ...((product.digitalDelivery?.entitlement ?? product.entitlement)
        ? { entitlement: product.digitalDelivery?.entitlement ?? product.entitlement ?? undefined }
        : {}),
    }
  })
}

export function assertCheckoutQuote(input: {
  lines: readonly OrderLineSnapshot[]
  currency: string
  amountMinor: string
}) {
  const quote = quoteOrderLines(input.lines)
  if (quote.currency !== input.currency || quote.amountMinor !== input.amountMinor)
    throw new Error('Checkout total differs from the server quote.')
  return quote
}

export type ReconciliationDecision =
  | { status: 'matched'; reason: 'verified-payment-evidence' }
  | {
      status: 'quarantined'
      reason:
        | 'missing-provider-evidence'
        | 'ambiguous-legacy-record'
        | 'amount-or-currency-mismatch'
    }

/** Conservative legacy/backfill rule: absence or ambiguity is reviewable quarantine, never a paid inference. */
export function reconcileLegacyCommerceRecord(input: {
  hasSingleScope: boolean
  amountMinor?: string
  currency?: string
  providerEventId?: string
  verified: boolean
  matchesCanonicalQuote: boolean
}): ReconciliationDecision {
  if (!input.hasSingleScope) return { status: 'quarantined', reason: 'ambiguous-legacy-record' }
  if (!input.amountMinor || !input.currency || !input.matchesCanonicalQuote)
    return { status: 'quarantined', reason: 'amount-or-currency-mismatch' }
  if (!input.providerEventId || !input.verified)
    return { status: 'quarantined', reason: 'missing-provider-evidence' }
  return { status: 'matched', reason: 'verified-payment-evidence' }
}

export type InventoryLine = Readonly<{
  productId: string
  variantSku: string
  quantity: number
}>
export type InventoryProduct = Readonly<{
  id: string
  variants?: readonly {
    sku?: string
    inventoryPolicy?: 'untracked' | 'tracked' | 'external-hook' | 'pod-provider'
    inventoryQuantity?: number | null
  }[]
}>
/** The receipt stores these keys, preventing webhook/indexer replays from decrementing twice. */
export function inventoryAdjustmentsForOrder(input: {
  orderId: string
  appliedKeys: readonly string[]
  lines: readonly InventoryLine[]
  products: readonly InventoryProduct[]
}) {
  const adjustments: { key: string; productId: string; variantSku: string; quantity: number }[] = []
  for (const line of input.lines) {
    const key = `commerce.inventory:${input.orderId}:${line.productId}:${line.variantSku}`
    if (input.appliedKeys.includes(key)) continue
    const product = input.products.find((candidate) => candidate.id === line.productId)
    const variant = product?.variants?.find((candidate) => candidate.sku === line.variantSku)
    if (!variant || variant.inventoryPolicy !== 'tracked') continue
    if (!Number.isInteger(line.quantity) || line.quantity <= 0)
      throw new Error(`Invalid quantity for ${line.variantSku}.`)
    if ((variant.inventoryQuantity ?? 0) < line.quantity)
      throw new Error(`Insufficient inventory for ${line.variantSku}.`)
    adjustments.push({
      key,
      productId: line.productId,
      variantSku: line.variantSku,
      quantity: line.quantity,
    })
  }
  return adjustments
}
export function receiptForVerifiedPayment(input: {
  orderId: string
  intentId: string
  providerKey: string
  amountMinor: string
  currency: string
  verifiedAt: string
}) {
  return {
    state: 'issued' as const,
    receiptNumber: `receipt_${input.orderId}`,
    paymentIntentId: input.intentId,
    providerKey: input.providerKey,
    amountMinor: input.amountMinor,
    currency: input.currency,
    verifiedAt: input.verifiedAt,
  }
}

/** Product publication can reference only DAM-approved assets; private/restricted files stay unavailable. */
export function assertGovernedProductMedia(
  media: readonly { id: string; rightsStatus?: string; originalExportAllowed?: boolean }[],
) {
  for (const asset of media) {
    if (asset.rightsStatus !== 'approved')
      throw new Error(`Product media ${asset.id} is not approved for publication.`)
  }
}
export function assertReleaseDoesNotCharge(input: {
  releaseAction: 'publish' | 'checkout'
  chargeRequested?: boolean
}) {
  if (input.releaseAction === 'publish' && input.chargeRequested)
    throw new Error('Publishing a product release cannot initiate payment.')
  return true
}

export type CryptoPaymentAdapter = {
  key: string
  createInvoice(input: {
    intentId: string
    network: string
    asset: string
    exactAmountAtomic: string
    destination: string
    expiresAt: string
    requiredConfirmations: number
  }): Promise<CryptoInvoice>
  getObservation(transactionId: string): Promise<ChainPaymentObservation | null>
}
/** Fixture-backed EVM/Dogecoin adapters are verification sources, never signing wallets. */
export const createFixtureCryptoAdapter = (
  key: string,
  observations: readonly ChainPaymentObservation[] = [],
): CryptoPaymentAdapter => ({
  key,
  async createInvoice(input) {
    const query = `amount=${input.exactAmountAtomic}${input.network.startsWith('evm:') ? `&chain_id=${input.network.slice(4)}` : ''}`
    const uri =
      input.asset === 'DOGE'
        ? `dogecoin:${input.destination}?${query}`
        : `ethereum:${input.destination}?${query}`
    return {
      network: input.network,
      asset: input.asset,
      exactAmountAtomic: input.exactAmountAtomic,
      destination: input.destination,
      reference: input.intentId,
      uri,
      qrPayload: uri,
      expiresAt: input.expiresAt,
      requiredConfirmations: input.requiredConfirmations,
      state: 'created',
      confirmations: 0,
      transactionIds: [],
    }
  },
  async getObservation(transactionId) {
    return observations.find((observation) => observation.transactionId === transactionId) ?? null
  },
})
/** Ignores client-provided details other than a lookup hint and verifies observation through the configured adapter. */
export async function verifySubmittedCryptoTransaction(input: {
  adapter: CryptoPaymentAdapter
  invoice: CryptoInvoice
  transactionId: string
  now: string
}) {
  const observation = await input.adapter.getObservation(input.transactionId)
  if (!observation) throw new Error('Transaction was not found by the configured chain adapter.')
  return verifyCryptoObservation(input.invoice, observation, input.now)
}

export type PodFulfillmentAdapter = {
  key: 'printful' | 'printify' | string
  submit(input: {
    orderId: string
    idempotencyKey: string
    items: readonly { sku: string; artwork: { id: string; rightsStatus?: string } }[]
  }): Promise<{ externalOrderId: string; state: 'submitted' | 'failed'; error?: string }>
  verifyWebhook(
    raw: string,
    signature: string,
  ): {
    id: string
    externalOrderId: string
    state: 'production' | 'shipped' | 'delivered' | 'failed'
    tracking?: string
  } | null
}
export function assertPodArtworkApproved(
  items: readonly { sku: string; artwork: { id: string; rightsStatus?: string } }[],
) {
  assertGovernedProductMedia(items.map((item) => item.artwork))
}
export function submitPodOrderOnce(input: {
  orderId: string
  idempotencyKey: string
  previous?: { idempotencyKey: string; externalOrderId?: string }
  adapter: PodFulfillmentAdapter
  items: readonly { sku: string; artwork: { id: string; rightsStatus?: string } }[]
}) {
  if (input.previous?.idempotencyKey === input.idempotencyKey)
    return Promise.resolve({
      externalOrderId: input.previous.externalOrderId ?? '',
      state: 'submitted' as const,
      replay: true,
    })
  assertPodArtworkApproved(input.items)
  return input.adapter
    .submit({ orderId: input.orderId, idempotencyKey: input.idempotencyKey, items: input.items })
    .then((result) => ({ ...result, replay: false }))
}
export const createFixturePodAdapter = (
  key: 'printful' | 'printify',
  secret: string,
  failure = false,
): PodFulfillmentAdapter => ({
  key,
  async submit({ orderId }) {
    return failure
      ? { externalOrderId: '', state: 'failed', error: 'fixture provider failure' }
      : { externalOrderId: `${key}:${orderId}`, state: 'submitted' }
  },
  verifyWebhook(raw, signature) {
    const expected = createHmac('sha256', secret).update(raw).digest('hex')
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return null
    return JSON.parse(raw)
  },
})

export type ProductMediaAsset = {
  id?: string | number
  rightsStatus?: string
  originalExportAllowed?: boolean
}

export type ProductPublicationDoc = {
  id: string | number
  state?: string
  releaseRevision?: string | null
  media?: readonly (ProductMediaAsset | string | number)[] | null
}

/** Commerce-owned product publication boundary. It only exposes a reviewed product and never starts checkout or payment. */
export async function publishProductRelease(
  payload: Payload,
  input: { productId: string; revisionId?: string; idempotencyKey: string },
): Promise<boolean> {
  const product = (await payload.findByID({
    collection: 'products' as never,
    id: input.productId,
    depth: 1,
    overrideAccess: true,
  } as never)) as ProductPublicationDoc | null
  if (!product) throw new Error('Product not found.')
  if (input.revisionId && product.releaseRevision !== input.revisionId)
    throw new Error('Pinned product revision is stale.')
  if (
    product.state === 'published' &&
    (!input.revisionId || product.releaseRevision === input.revisionId)
  )
    return false
  if (product.state !== 'approved') throw new Error('Only approved products can be released.')
  assertReleaseDoesNotCharge({ releaseAction: 'publish' })
  assertGovernedProductMedia(
    Array.isArray(product.media)
      ? product.media.map((asset) => {
          if (typeof asset === 'object' && asset !== null) {
            return {
              id: String(asset.id ?? ''),
              rightsStatus: asset.rightsStatus,
              originalExportAllowed: asset.originalExportAllowed,
            }
          }
          return {
            id: String(asset),
          }
        })
      : [],
  )
  await payload.update({
    collection: 'products' as never,
    id: input.productId,
    data: { state: 'published' },
    context: { catalogWorkflow: true },
    overrideAccess: true,
  } as never)
  return true
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Applies a server-verified settlement to the canonical Order exactly once. */
export async function finalizeVerifiedOrder(
  db: any,
  input: { intent: any; session: any; merchantId: string; verifiedAt: string },
) {
  const found = await db.find({
    collection: 'orders',
    where: { checkoutSession: { equals: input.session.id } },
    limit: 1,
    overrideAccess: true,
  })
  let order = found.docs[0]
  const cart =
    typeof input.session.cart === 'object'
      ? input.session.cart
      : await db.findByID({
          collection: 'carts',
          id: input.session.cart,
          depth: 0,
          overrideAccess: true,
        })
  const proposal = input.session.proposal
    ? typeof input.session.proposal === 'object'
      ? input.session.proposal
      : await db.findByID({
          collection: 'checkout-proposals',
          id: input.session.proposal,
          depth: 0,
          overrideAccess: true,
        })
    : null
  if (!order) {
    order = await db.create({
      collection: 'orders',
      data: {
        site: input.session.site,
        publication: input.session.publication,
        space: input.session.space,
        checkoutSession: input.session.id,
        merchantConnection: input.merchantId,
        orderNumber: `order_${input.session.id}`,
        state: 'pending-payment',
        currency: input.session.currency,
        amountMinor: input.session.amountMinor,
        items: Array.isArray(input.intent.orderLines) ? input.intent.orderLines : cart.items,
        partySnapshot: proposal?.customer ?? { memberId: cart.member ?? cart.owner ?? null },
        addressSnapshot: proposal
          ? { shipping: proposal.shippingAddress ?? null, billing: proposal.billingAddress ?? null }
          : null,
        totalsSnapshot: proposal?.pricingSnapshot ?? {
          grandTotalMinor: input.session.amountMinor,
          currency: input.session.currency,
        },
        termsSnapshot: proposal?.consents ?? input.session.legalCopy ?? {},
        sourceSnapshot: {
          checkoutSessionId: String(input.session.id),
          proposalId: proposal ? String(proposal.id) : null,
          paymentIntentId: String(input.intent.id),
          providerKey: String(input.intent.providerKey),
        },
        downstreamInstructions: Array.isArray(proposal?.fulfillmentSplit)
          ? proposal.fulfillmentSplit
          : proposal?.fulfillmentSplit
            ? [proposal.fulfillmentSplit]
            : [],
      },
      overrideAccess: true,
    })
  }
  const alreadySettled = order.receipt?.state === 'issued'
  const lines = (Array.isArray(order.items) ? order.items : []) as InventoryLine[]
  const productIds = [...new Set(lines.map((line) => line.productId).filter(Boolean))]
  const products = await Promise.all(
    productIds.map((id) =>
      db.findByID({ collection: 'products', id, depth: 0, overrideAccess: true }),
    ),
  )
  const appliedKeys = Array.isArray(order.transitionLog)
    ? order.transitionLog
        .filter((entry: any) => entry?.kind === 'inventory-applied')
        .map((entry: any) => entry.key)
    : []
  const adjustments = alreadySettled
    ? []
    : inventoryAdjustmentsForOrder({
        orderId: String(order.id),
        appliedKeys,
        lines,
        products: products.map((product: any) => ({
          id: String(product.id),
          variants: product.variants,
        })),
      })
  for (const adjustment of adjustments) {
    const product = products.find((candidate: any) => String(candidate.id) === adjustment.productId)
    await db.update({
      collection: 'products',
      id: product.id,
      data: {
        variants: product.variants.map((variant: any) =>
          variant.sku === adjustment.variantSku
            ? {
                ...variant,
                inventoryQuantity: Number(variant.inventoryQuantity ?? 0) - adjustment.quantity,
              }
            : variant,
        ),
      },
      overrideAccess: true,
    })
  }
  const transitionLog = [
    ...(Array.isArray(order.transitionLog) ? order.transitionLog : []),
    ...adjustments.map((adjustment) => ({
      kind: 'inventory-applied',
      ...adjustment,
      at: input.verifiedAt,
    })),
    { kind: 'payment-confirmed', intentId: input.intent.id, at: input.verifiedAt },
  ]
  if (!alreadySettled)
    order = await db.update({
      collection: 'orders',
      id: order.id,
      data: {
        state: 'paid',
        transitionLog,
        receipt: receiptForVerifiedPayment({
          orderId: String(order.id),
          intentId: String(input.intent.id),
          providerKey: input.intent.providerKey,
          amountMinor: input.intent.amountMinor,
          currency: input.intent.currency,
          verifiedAt: input.verifiedAt,
        }),
      },
      overrideAccess: true,
    })
  // Grants are derived from immutable paid lines, never a redirect or mutable product record.
  const cartMember = cart.member ?? cart.owner
  const memberId =
    typeof cartMember === 'object' ? String(cartMember?.id ?? '') : String(cartMember ?? '')
  let supporter: any
  for (const line of lines as Array<InventoryLine & { entitlement?: string }>) {
    if (!line.entitlement) continue
    const prior = await db.find({
      collection: 'entitlements',
      where: {
        and: [
          { paymentIntent: { equals: input.intent.id } },
          { entitlement: { equals: line.entitlement } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (prior.docs.length) continue
    if (!supporter) {
      const supporterResult = await db.find({
        collection: 'supporters',
        where: memberId
          ? { member: { equals: memberId } }
          : { providerReferences: { contains: String(input.intent.id) } },
        limit: 1,
        overrideAccess: true,
      })
      supporter = supporterResult.docs[0]
      if (!supporter)
        supporter = await db.create({
          collection: 'supporters',
          data: {
            site: input.session.site,
            publication: input.session.publication,
            space: input.session.space,
            ...(memberId ? { member: memberId } : {}),
            displayName: memberId ? undefined : `Order ${order.orderNumber}`,
            providerReferences: [
              { providerKey: input.intent.providerKey, externalId: String(input.intent.id) },
            ],
            visibilityPreference: 'private',
          },
          overrideAccess: true,
        })
    }
    await db.create({
      collection: 'entitlements',
      data: {
        site: input.session.site,
        publication: input.session.publication,
        space: input.session.space,
        supporter: supporter.id,
        paymentIntent: input.intent.id,
        entitlement: line.entitlement,
        source: `order:${order.id}`,
        startsAt: input.verifiedAt,
      },
      overrideAccess: true,
    })
  }
  const deliverySecret =
    process.env.COMMERCE_DELIVERY_SECRET ??
    (process.env.NODE_ENV === 'production' ? '' : 'development-delivery-secret')
  const downloads: Array<{ productId: string; variantSku: string; mediaId: string; path: string }> =
    []
  for (const line of lines as Array<InventoryLine & { entitlement?: string }>) {
    if (!line.entitlement) continue
    const product = products.find((candidate: any) => String(candidate.id) === line.productId)
    const delivery = product?.digitalDelivery as
      | {
          downloadLimit?: number
          expiresAfterDays?: number
          assets?: Array<{ mediaId?: string }>
        }
      | undefined
    if (!delivery?.assets?.length) continue
    const entitlementResult = await db.find({
      collection: 'entitlements',
      where: {
        and: [
          { paymentIntent: { equals: input.intent.id } },
          { entitlement: { equals: line.entitlement } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    const entitlement = entitlementResult.docs[0]
    for (const asset of delivery.assets) {
      const mediaId = String(asset.mediaId ?? '')
      if (!mediaId || !entitlement) continue
      const grantKey = deriveDownloadGrantKey(
        {
          orderId: String(order.id),
          productId: line.productId,
          variantSku: line.variantSku,
          mediaId,
        },
        deliverySecret,
      )
      const grantKeyHash = createHash('sha256').update(grantKey).digest('hex')
      const priorGrant = await db.find({
        collection: 'digital-delivery-grants',
        where: { grantKeyHash: { equals: grantKeyHash } },
        limit: 1,
        overrideAccess: true,
      })
      if (!priorGrant.docs.length)
        await db.create({
          collection: 'digital-delivery-grants',
          data: {
            site: input.session.site,
            publication: input.session.publication,
            space: input.session.space,
            product: line.productId,
            variantSku: line.variantSku,
            entitlement: entitlement.id,
            ...(memberId ? { member: memberId } : {}),
            mediaAsset: mediaId,
            grantKeyHash,
            downloadLimit: delivery.downloadLimit,
            downloadCount: 0,
            ...(delivery.expiresAfterDays
              ? {
                  expiresAt: new Date(
                    Date.parse(input.verifiedAt) + delivery.expiresAfterDays * 86_400_000,
                  ).toISOString(),
                }
              : {}),
          },
          overrideAccess: true,
        })
      downloads.push({
        productId: line.productId,
        variantSku: line.variantSku,
        mediaId,
        path: `/api/commerce/download/${grantKey}`,
      })
    }
  }
  if (downloads.length)
    order = await db.update({
      collection: 'orders',
      id: order.id,
      data: { fulfillmentExtension: { downloads } },
      overrideAccess: true,
    })
  return { order, replay: alreadySettled }
}
