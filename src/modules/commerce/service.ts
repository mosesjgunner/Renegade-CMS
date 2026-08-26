import { createHmac, timingSafeEqual } from 'node:crypto'
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
    return JSON.parse(raw) as ProviderEvent
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
  if (['paid', 'fulfilled', 'refunded'].includes(state)) return state
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
