import { createHash } from 'node:crypto'

export type PosState =
  | 'awaiting_payment'
  | 'detected'
  | 'confirming'
  | 'confirmed'
  | 'underpaid'
  | 'overpaid'
  | 'expired'
  | 'cancelled'
  | 'failed'
  | 'reconciliation_required'
export type CryptoQuote = Readonly<{
  provider: string
  fiatCurrency: string
  fiatAmountMinor: string
  network: string
  asset: string
  assetAmount: string
  rate: string
  quotedAt: string
  expiresAt: string
  manual: boolean
}>
export type CryptoInvoice = Readonly<{
  paymentIntentId: string
  merchantConnectionId: string
  network: string
  asset: string
  destination: string
  exactAmount: string
  reference: string
  expiresAt: string
  quote: CryptoQuote
  uri: string
  privateKeyBoundary: 'never-received'
}>
export type BlockchainObservation = Readonly<{
  id: string
  transactionHash: string
  paymentIntentId: string
  network: string
  asset: string
  destination: string
  amount: string
  confirmations: number
  observedAt: string
  reorged?: boolean
}>
export type PosPayment = Readonly<{
  state: PosState
  requiredConfirmations: number
  observations: readonly BlockchainObservation[]
  inventoryApplied: boolean
  receiptIssued: boolean
}>

const safe = (value: string, label: string) => {
  if (!value || /private|seed|secret|xprv/i.test(value))
    throw new Error(`${label} is invalid for a payment request.`)
  return value
}
const decimal = (value: string) => {
  if (!/^\d+(?:\.\d+)?$/.test(value) || Number(value) <= 0)
    throw new Error('Crypto amount must be a positive decimal.')
  return value
}
const compare = (left: string, right: string) => {
  const scale = Math.max((left.split('.')[1] ?? '').length, (right.split('.')[1] ?? '').length)
  return (
    BigInt(
      left
        .replace('.', '')
        .padEnd(left.replace('.', '').length + scale - (left.split('.')[1] ?? '').length, '0'),
    ) -
    BigInt(
      right
        .replace('.', '')
        .padEnd(right.replace('.', '').length + scale - (right.split('.')[1] ?? '').length, '0'),
    )
  )
}

export function quoteIsUsable(quote: CryptoQuote, now = new Date().toISOString()) {
  return !quote.manual && quote.expiresAt > now
}
export function createCryptoInvoice(
  input: Omit<CryptoInvoice, 'uri' | 'privateKeyBoundary'>,
): CryptoInvoice {
  if (!quoteIsUsable(input.quote) && !input.quote.manual)
    throw new Error('The crypto quote has expired; regenerate the invoice.')
  if (
    input.quote.network !== input.network ||
    input.quote.asset !== input.asset ||
    input.quote.assetAmount !== input.exactAmount
  )
    throw new Error('Invoice must be bound to its exact quote.')
  const destination = safe(input.destination, 'Destination')
  const scheme = input.network.toLowerCase().replace(/[^a-z0-9]/g, '')
  const query = new URLSearchParams({
    amount: decimal(input.exactAmount),
    reference: safe(input.reference, 'Reference'),
    intent: input.paymentIntentId,
    expires: input.expiresAt,
    asset: input.asset,
  })
  return {
    ...input,
    destination,
    uri: `${scheme}:${destination}?${query.toString()}`,
    privateKeyBoundary: 'never-received',
  }
}
export function invoiceFingerprint(invoice: CryptoInvoice) {
  return `sha256:${createHash('sha256').update(`${invoice.paymentIntentId}|${invoice.network}|${invoice.asset}|${invoice.destination}|${invoice.exactAmount}|${invoice.reference}|${invoice.expiresAt}`).digest('hex')}`
}
export function observeCryptoPayment(
  payment: PosPayment,
  invoice: CryptoInvoice,
  observation: BlockchainObservation,
  now = new Date().toISOString(),
): PosPayment {
  if (payment.state === 'confirmed') return payment
  if (invoice.expiresAt <= now) return { ...payment, state: 'expired' }
  if (
    observation.paymentIntentId !== invoice.paymentIntentId ||
    observation.destination !== invoice.destination
  )
    throw new Error('Observation does not belong to this invoice destination.')
  if (observation.network !== invoice.network) throw new Error('Wrong payment network.')
  if (observation.asset !== invoice.asset) throw new Error('Wrong payment asset.')
  if (
    payment.observations.some(
      (item) => item.id === observation.id || item.transactionHash === observation.transactionHash,
    )
  )
    return payment
  const observations = [...payment.observations, observation]
  if (observation.reorged) return { ...payment, observations, state: 'reconciliation_required' }
  const amountComparison = compare(observation.amount, invoice.exactAmount)
  if (amountComparison < 0) return { ...payment, observations, state: 'underpaid' }
  if (amountComparison > 0) return { ...payment, observations, state: 'overpaid' }
  return {
    ...payment,
    observations,
    state:
      observation.confirmations >= payment.requiredConfirmations
        ? 'confirmed'
        : observation.confirmations > 0
          ? 'confirming'
          : 'detected',
  }
}
export function applyPosCompletion(payment: PosPayment): PosPayment {
  return payment.state === 'confirmed'
    ? { ...payment, inventoryApplied: true, receiptIssued: true }
    : payment
}
export function posCanOperate(input: {
  actorRole?: string
  merchantConnectionId: string
  spaceMerchantConnectionId: string
  enabled: boolean
}) {
  return (
    input.enabled &&
    ['owner', 'staff'].includes(input.actorRole ?? '') &&
    input.merchantConnectionId === input.spaceMerchantConnectionId
  )
}
export const posExtensionCapabilities = [
  'nfc-handoff',
  'customer-secondary-display',
  'barcode-scan',
  'cash-tender',
  'stablecoin-checkout',
  'crypto-fiat-settlement',
] as const

/** Remote node/indexer adapters return observations; browser assertions are never accepted as evidence. */
export type BlockchainPaymentAdapter = {
  key: string
  observe(invoice: CryptoInvoice): Promise<readonly BlockchainObservation[]>
}
export async function verifyInvoiceServerSide(
  adapter: BlockchainPaymentAdapter,
  payment: PosPayment,
  invoice: CryptoInvoice,
  now?: string,
) {
  let next = payment
  for (const observation of await adapter.observe(invoice))
    next = observeCryptoPayment(next, invoice, observation, now)
  return next
}
export const posInventoryIdempotencyKey = (orderId: string, sku: string) =>
  `pos.inventory:${orderId}:${sku}`
export function clientCryptoSuccessCannotConfirmPayment(): false {
  return false
}
