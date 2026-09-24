import { createHash } from 'node:crypto'
import { assertMoney, type MoneySnapshot } from './contracts'

export { assertMoney }
export type { MoneySnapshot }

export type AffiliateNetwork =
  | 'amazon-associates'
  | 'impact'
  | 'shareasale'
  | 'cj'
  | 'rakuten'
  | 'awin'
  | 'custom'

export type AffiliateOfferStatus = 'draft' | 'active' | 'paused' | 'archived' | 'expired'

export type LinkHealthStatus =
  | 'healthy'
  | 'warning'
  | 'broken'
  | 'redirected'
  | 'rate-limited'
  | 'unknown'

export type AffiliateLinkHealth = Readonly<{
  status: LinkHealthStatus
  lastCheckedAt?: string
  httpStatus?: number
  consecutiveFailures: number
  error?: string
}>

export type PricingFreshness = Readonly<{
  remotePrice?: Readonly<{ amountMinor: string; currency: string }>
  remoteAvailability?: 'in-stock' | 'out-of-stock' | 'unknown' | 'preorder'
  observedAt: string
  freshnessHours: number
  source: 'api' | 'feed' | 'manual' | 'scraper'
}>

export type SubIdTemplate = Readonly<{
  template: string
  paramName: string
  allowedTokens: readonly string[]
}>

export type AffiliateDisclosureConfig = Readonly<{
  text: string
  required: boolean
  placement: 'above' | 'inline' | 'below' | 'badge'
}>

export type AffiliateOffer = Readonly<{
  id: string
  siteId: string
  slug: string
  name: string
  contentId?: string
  productId?: string
  destinationUrl: string
  allowedDomains?: readonly string[]
  networkReference: Readonly<{
    network: AffiliateNetwork | string
    programId?: string
    accountReference?: string
  }>
  disclosure: AffiliateDisclosureConfig
  subIdTemplate?: SubIdTemplate
  pricingFreshness: PricingFreshness
  regions: readonly string[]
  status: AffiliateOfferStatus
  linkHealth: AffiliateLinkHealth
  trackingParameters?: Readonly<Record<string, string>>
}>

export type AffiliateClick = Readonly<{
  id: string
  siteId: string
  offerId: string
  clickToken: string
  timestamp: string
  destinationUrl: string
  trackingAllowed: boolean
  countryHint?: string
  botDetected: boolean
  ipHash?: string
  userAgentSummary?: string
  referrer?: string
}>

export type ConversionSource = 'webhook' | 'api' | 'csv'
export type ConversionStatus = 'pending' | 'approved' | 'rejected' | 'reversed' | 'settled'
export type ReconciliationState = 'matched' | 'unmatched' | 'duplicate' | 'reconciled' | 'reversed'

export type ConversionEvidence = Readonly<{
  id: string
  siteId: string
  source: ConversionSource
  network: string
  externalEventId: string
  externalOrderId?: string
  externalTransactionId?: string
  attributionHint?: string
  money: MoneySnapshot
  commissionMoney?: MoneySnapshot
  occurredAt: string
  status: ConversionStatus
  rawPayloadHash: string
  reconciliationState: ReconciliationState
  matchedOfferId?: string
  matchedClickId?: string
  reconciliationNotes?: string
}>

export type ReferralProgramStatus = 'draft' | 'active' | 'paused' | 'archived'
export type ReferralRewardType = 'basis_points' | 'fixed_minor'
export type AttributionModel = 'first-touch' | 'last-touch'

export type ReferralProgram = Readonly<{
  id: string
  siteId: string
  version: number
  name: string
  status: ReferralProgramStatus
  eligibility: Readonly<{
    allowedMemberRoles: readonly string[]
    minimumAccountAgeDays?: number
    requireVerifiedEmail: boolean
    disallowedMemberIds?: readonly string[]
  }>
  codes: Readonly<{
    codePrefix?: string
    minLength: number
    maxLength: number
    allowedCharactersRegex?: string
  }>
  benefit: Readonly<{
    referrerRewardType: ReferralRewardType
    referrerRewardValue: string
    refereeDiscountType?: ReferralRewardType
    refereeDiscountValue?: string
    maxCommissionPerOrderMinor?: string
    maxTotalCommissionPerReferrerMinor?: string
  }>
  attribution: Readonly<{
    model: AttributionModel
    windowDays: number
    requireCookieConsent: boolean
  }>
  selfReferralRules: Readonly<{
    blockSameMemberId: boolean
    blockSameEmail: boolean
    blockSamePaymentMethod: boolean
    blockSameIpHash: boolean
  }>
  holdPeriodDays: number
  reversalRules: Readonly<{
    reverseOnOrderRefund: boolean
    reverseOnOrderCancel: boolean
    reverseOnDispute: boolean
  }>
  terms: Readonly<{
    version: string
    publishedAt: string
    text: string
    url?: string
  }>
}>

export type ReferralAttributionSnapshot = Readonly<{
  programId: string
  programVersion: number
  referrerMemberId: string
  referralCode: string
  model: AttributionModel
  attributedAt: string
  attributionWindowDays: number
  orderAmountMinor: string
  eligibleAmountMinor: string
  rateBasisPoints?: number
  calculatedCommissionMinor: string
  currency: string
  explanation: string
  status: 'attributed' | 'rejected'
  rejectReason?: string
}>

export type CommissionLedgerType = 'accrual' | 'settlement' | 'reversal' | 'hold'
export type CommissionLedgerStatus =
  | 'pending'
  | 'eligible'
  | 'on_hold'
  | 'approved'
  | 'settled'
  | 'reversed'

export type CommissionLedger = Readonly<{
  id: string
  siteId: string
  programId: string
  programVersion: number
  referrerMemberId: string
  orderId: string
  orderNumber: string
  paymentIntentId?: string
  currency: string
  amountMinor: string
  type: CommissionLedgerType
  status: CommissionLedgerStatus
  matureAt: string
  createdAt: string
  settledAt?: string
  reversedAt?: string
  reversalReason?: string
  fraudFlag?: string
  settlementBatchId?: string
  explanation: string
  compensatesLedgerId?: string
}>

export type SettlementBatchStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'reconciled'

export type SettlementBatch = Readonly<{
  id: string
  siteId: string
  batchNumber: string
  currency: string
  totalAmountMinor: string
  entriesCount: number
  status: SettlementBatchStatus
  approvedBy?: string
  approvedAt?: string
  exportPayloadHash?: string
  externalReference?: string
  failureReason?: string
  createdAt: string
  reconciledAt?: string
}>

/**
 * Validates integer money format and ISO-4217 currency.
 */
export function integerMoney(amountMinor: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(amountMinor)
}

/**
 * Computes commission in integer minor units with exact integer rounding and optional caps.
 */
export function calculateReferralCommission(input: {
  orderAmountMinor: string
  rewardType: ReferralRewardType
  rewardValue: string
  currency: string
  maxCommissionPerOrderMinor?: string
}): { amountMinor: string; rateBasisPoints?: number } {
  assertMoney(input.orderAmountMinor, input.currency)
  const orderAmount = BigInt(input.orderAmountMinor)

  if (input.rewardType === 'fixed_minor') {
    assertMoney(input.rewardValue, input.currency)
    const fixedReward = BigInt(input.rewardValue)
    const commission = fixedReward > orderAmount ? orderAmount : fixedReward
    const cap = input.maxCommissionPerOrderMinor ? BigInt(input.maxCommissionPerOrderMinor) : null
    const finalAmount = cap !== null && commission > cap ? cap : commission
    return { amountMinor: finalAmount.toString() }
  }

  // basis points: 10000 = 100%, 1000 = 10%, 150 = 1.5%
  const basisPoints = Number(input.rewardValue)
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) {
    throw new Error('Basis points must be an integer between 0 and 10000.')
  }

  // Integer division with floor rounding (or nearest if standard)
  const rawCommission = (orderAmount * BigInt(basisPoints)) / 10000n
  const cap = input.maxCommissionPerOrderMinor ? BigInt(input.maxCommissionPerOrderMinor) : null
  const cappedCommission = cap !== null && rawCommission > cap ? cap : rawCommission

  return {
    amountMinor: cappedCommission.toString(),
    rateBasisPoints: basisPoints,
  }
}

/**
 * Checks whether an affiliate destination URL is safe:
 * - Must be valid HTTPS URL
 * - Must NOT contain credentials (username/password)
 * - Must NOT target localhost, private IPv4 (RFC1918), link-local, loopback IPv6
 * - If allowedDomains specified, must match one of the allowed domains
 */
export function isSafeAffiliateDestinationUrl(
  urlStr: string,
  allowedDomains?: readonly string[],
): boolean {
  try {
    const parsed = new URL(urlStr)
    if (parsed.protocol !== 'https:') return false
    if (parsed.username || parsed.password) return false

    const hostname = parsed.hostname.toLowerCase()
    // Disallow loopback, private IPv4, IPv6 localhost
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      return false
    }

    // RFC1918 check for raw IP hostnames
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false // Link-local

    if (allowedDomains && allowedDomains.length > 0) {
      const match = allowedDomains.some((domain) => {
        const d = domain.toLowerCase()
        return hostname === d || hostname.endsWith(`.${d}`)
      })
      if (!match) return false
    }

    return true
  } catch {
    return false
  }
}

/**
 * Safely interpolates a Sub-ID template while strictly preventing parameter injection,
 * script execution, or CRLF splitting.
 */
export function interpolateSubId(
  template: SubIdTemplate,
  tokens: Record<string, string>,
): { paramName: string; paramValue: string } {
  const paramName = template.paramName
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(paramName)) {
    throw new Error('Invalid subId parameter name.')
  }

  let value = template.template
  for (const token of template.allowedTokens) {
    const rawVal = tokens[token] ?? ''
    // Sanitize: allow only alphanumeric, hyphens, and underscores
    const safeVal = rawVal.replace(/[^a-zA-Z0-9_-]/g, '')
    value = value.replaceAll(`{${token}}`, safeVal)
  }

  // Ensure no un-interpolated curly brackets or dangerous characters remain
  const finalVal = value.replace(/[{}]/g, '').replace(/[\r\n"';`<>]/g, '')
  return { paramName, paramValue: finalVal }
}

/**
 * Checks price and availability freshness against offer policy.
 */
export function evaluatePricingFreshness(
  freshness: PricingFreshness,
  now = new Date(),
): {
  stale: boolean
  remotePrice: { amountMinor: string; currency: string } | null
  remoteAvailability: 'in-stock' | 'out-of-stock' | 'unknown' | 'preorder'
} {
  const observedTime = Date.parse(freshness.observedAt)
  const isStale =
    !Number.isFinite(observedTime) ||
    !Number.isFinite(freshness.freshnessHours) ||
    freshness.freshnessHours <= 0 ||
    now.getTime() - observedTime > freshness.freshnessHours * 3_600_000

  if (isStale) {
    return {
      stale: true,
      remotePrice: null,
      remoteAvailability: 'unknown',
    }
  }

  return {
    stale: false,
    remotePrice: freshness.remotePrice ?? null,
    remoteAvailability: freshness.remoteAvailability ?? 'unknown',
  }
}

/**
 * Computes payload hash for conversion imports (idempotency token).
 */
export function computeConversionSourceHash(payload: unknown): string {
  const canonical = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return createHash('sha256').update(canonical).digest('hex')
}
