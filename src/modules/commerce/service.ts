import { createHmac, timingSafeEqual } from 'node:crypto'
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
  verifyCryptoObservation,
} from './contracts'

export type CartLine = {
  productId: string
  variantSku: string
  quantity: number
  merchantConnectionId: string
  kind: 'physical' | 'digital' | 'pod-reference' | 'subscription' | 'membership'
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
  kind: 'confirmed' | 'failed' | 'cancelled'
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
  if (!['confirmed', 'failed', 'cancelled'].includes(event.kind)) return false
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
  if (['paid', 'fulfilled', 'refunded', 'cancelled'].includes(state)) return state
  if (event.kind === 'confirmed') return 'paid'
  if (event.kind === 'failed') return 'failed'
  return 'cancelled'
}
export function applyVerifiedWebhook(intent: PaymentIntent, event: ProviderEvent): PaymentIntent {
  return appendFinancialEvent(intent, {
    id: `provider:${event.id}`,
    intentId: intent.id,
    kind:
      event.kind === 'confirmed' ? 'confirmed' : event.kind === 'failed' ? 'failed' : 'reversed',
    money: intent.money,
    providerEventId: event.id,
    occurredAt: event.occurredAt,
  })
}
export function clientCallbackCannotConfirmPayment(): false {
  return false
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
        items: cart.items,
      },
      overrideAccess: true,
    })
  }
  if (order.receipt?.state === 'issued') return { order, replay: true }
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
  const adjustments = inventoryAdjustmentsForOrder({
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
  return { order, replay: false }
}
