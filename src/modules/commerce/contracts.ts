import { createHash } from 'node:crypto'
export type MoneySnapshot = Readonly<{
  amountMinor: string
  currency: string
  quotedAt: string
  quoteSource: string | null
  buyerConfirmedConversion: boolean
}>
export type MerchantScope = Readonly<{
  siteId: string
  publicationId?: string
  spaceId?: string
  merchantConnectionId: string
}>
export type PaymentMethodFamily =
  | 'card'
  | 'wallet'
  | 'bank-debit'
  | 'bank-transfer'
  | 'open-banking'
  | 'mobile-money'
  | 'cash-voucher'
  | 'buy-now-pay-later'
  | 'crypto'
  | 'external-link'
export type PaymentFlow = 'hosted' | 'redirect' | 'qr' | 'asynchronous' | 'manual'
export type PaymentMethodCapability = MerchantScope &
  Readonly<{
    id: string
    providerKey: string
    railKey: string
    family: PaymentMethodFamily
    flow: PaymentFlow
    merchantCountries: readonly string[]
    buyerCountries: readonly string[]
    presentmentCurrencies: readonly string[]
    settlementCurrencies: readonly string[]
    minimumAmountMinor?: string
    maximumAmountMinor?: string
    recurring: boolean
    refunds: boolean
    enabled: boolean
    health: 'healthy' | 'degraded' | 'unavailable'
    requiredCustomerFields: readonly string[]
    instructions: string
  }>
export type CheckoutContext = Readonly<{
  merchant: MerchantScope
  merchantCountry: string
  buyerCountry?: string
  selectedCountry?: string
  ipCountryHint?: string
  currency: string
  amountMinor: string
  recurring: boolean
}>
export type EligibleMethod = Readonly<{
  capability: PaymentMethodCapability
  unavailableReason?: string
}>
export type FinancialEvent = Readonly<{
  id: string
  intentId: string
  kind: 'authorized' | 'confirmed' | 'failed' | 'refunded' | 'disputed' | 'reversed' | 'reconciled'
  money: MoneySnapshot
  providerEventId?: string
  occurredAt: string
  compensatesEventId?: string
}>
export type PaymentIntentState =
  | 'created'
  | 'requires-action'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'disputed'
export type PaymentIntent = Readonly<{
  id: string
  scope: MerchantScope
  money: MoneySnapshot
  state: PaymentIntentState
  capabilityId: string
  providerReference?: string
  settlementReference?: string
  expiresAt: string
  financialEvents: readonly FinancialEvent[]
}>
export type RecurringAgreement = Readonly<{
  id: string
  supporterId: string
  planId: string
  state: 'active' | 'past-due' | 'grace' | 'cancelled' | 'ended'
  graceEndsAt?: string
  processorMandatePortability: 'portable' | 'nonportable' | 'unknown'
}>
export type EntitlementGrant = Readonly<{
  id: string
  supporterId: string
  entitlement: string
  source: string
  startsAt: string
  endsAt?: string
  overrideExpiresAt?: string
  revokedAt?: string
}>
export type Supporter = Readonly<{
  id: string
  scope: MerchantScope
  memberId?: string
  emailHash?: string
  providerReferences: readonly { providerKey: string; externalId: string }[]
}>
export type CryptoPaymentRequest = Readonly<{
  intentId: string
  network: string
  asset: string
  address: string
  money: MoneySnapshot
  uri?: string
  expiresAt: string
  confirmationPolicy: number
  privateKeyBoundary: 'never-received'
}>
const amount = (value: string) => BigInt(value)
const contains = (values: readonly string[], value: string) =>
  values.length === 0 || values.includes(value)
export function eligiblePaymentMethods(
  methods: readonly PaymentMethodCapability[],
  context: CheckoutContext,
): EligibleMethod[] {
  const buyerCountry = context.selectedCountry ?? context.buyerCountry
  return methods
    .filter((method) => {
      if (
        method.merchantConnectionId !== context.merchant.merchantConnectionId ||
        !method.enabled ||
        method.health !== 'healthy'
      )
        return false
      if (
        !contains(method.merchantCountries, context.merchantCountry) ||
        !contains(method.presentmentCurrencies, context.currency)
      )
        return false
      if (buyerCountry && !contains(method.buyerCountries, buyerCountry)) return false
      if (context.recurring && !method.recurring) return false
      if (
        method.minimumAmountMinor &&
        amount(context.amountMinor) < amount(method.minimumAmountMinor)
      )
        return false
      return !(
        method.maximumAmountMinor && amount(context.amountMinor) > amount(method.maximumAmountMinor)
      )
    })
    .map((capability) => ({ capability }))
}
export function assertSingleMerchant(items: readonly { merchantConnectionId: string }[]): void {
  if (new Set(items.map((item) => item.merchantConnectionId)).size > 1)
    throw new Error('A cart cannot combine independent merchants; create direct checkouts instead.')
}
export function appendFinancialEvent(intent: PaymentIntent, event: FinancialEvent): PaymentIntent {
  if (event.intentId !== intent.id)
    throw new Error('Financial event does not belong to PaymentIntent.')
  if (
    intent.financialEvents.some(
      (existing) =>
        existing.id === event.id ||
        (event.providerEventId && existing.providerEventId === event.providerEventId),
    )
  )
    return intent
  const state: PaymentIntentState =
    event.kind === 'confirmed'
      ? 'paid'
      : event.kind === 'failed'
        ? 'failed'
        : event.kind === 'refunded' || event.kind === 'reversed'
          ? 'refunded'
          : event.kind === 'disputed'
            ? 'disputed'
            : intent.state
  return { ...intent, state, financialEvents: [...intent.financialEvents, event] }
}
export function entitlementActive(grant: EntitlementGrant, now: string): boolean {
  return (
    !grant.revokedAt &&
    grant.startsAt <= now &&
    (!grant.endsAt || grant.endsAt > now) &&
    (!grant.overrideExpiresAt || grant.overrideExpiresAt > now)
  )
}
export function reconcileSupporter(
  supporters: readonly Supporter[],
  reference: { providerKey: string; externalId: string },
  memberId?: string,
): Supporter | undefined {
  return supporters.find(
    (supporter) =>
      (memberId && supporter.memberId === memberId) ||
      supporter.providerReferences.some(
        (item) =>
          item.providerKey === reference.providerKey && item.externalId === reference.externalId,
      ),
  )
}
export function cryptoRequestFingerprint(request: CryptoPaymentRequest): string {
  return `sha256:${createHash('sha256').update(`${request.intentId}|${request.network}|${request.asset}|${request.address}|${request.money.amountMinor}|${request.expiresAt}`).digest('hex')}`
}
export function canWalletLoginAlterPaymentIntent(): false {
  return false
}
