import { assertMoney } from './contracts'

export type CampaignLifecycle =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived'
export type DonationLifecycle =
  | 'created'
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'disputed'
  | 'unknown'
  | 'partially-refunded'
  | 'exception'
export type DonationPrivacy = 'public' | 'anonymous' | 'private'
export type DonationRecurrence = 'one-time' | 'recurring'

export type DonationDisclosureConfig = Readonly<{
  legalEntityName?: string
  verifiedNonprofitStatus?: boolean
  verified501c3Status?: boolean
  verifiedTaxDeductibility?: boolean
  taxDisclaimer?: string
}>

/** Fails closed: legal/tax claims appear only when the matching verification flag is explicit. */
export function donationDisclosures(
  config: DonationDisclosureConfig,
  campaignText: readonly string[] = [],
): string[] {
  const makesTaxClaim = /501\s*\(?c\s*\)?\s*\(?3\)?|non.?profit|tax.?deductib|deductib|tax exempt/i
  const result: string[] = campaignText.filter(
    (text) =>
      !makesTaxClaim.test(text) ||
      (config.verified501c3Status === true && /501\s*\(?c\s*\)?\s*\(?3\)?/i.test(text)) ||
      (config.verifiedNonprofitStatus === true && /non.?profit/i.test(text)) ||
      (config.verifiedTaxDeductibility === true && /tax.?deductib|deductib|tax exempt/i.test(text)),
  )
  if (config.verifiedNonprofitStatus === true) result.push('This organization is a nonprofit.')
  if (config.verified501c3Status === true)
    result.push('This organization is recognized as a 501(c)(3).')
  if (config.verifiedTaxDeductibility === true)
    result.push('Your contribution may be tax deductible; consult your tax adviser.')
  else
    result.push(
      config.taxDisclaimer?.trim() ||
        'No representation is made that this contribution is tax deductible.',
    )
  return result
}

export type DonationProgress = Readonly<{
  currency: string
  settledAmountMinor: string
  settledGiftCount: number
  goalAmountMinor?: string
  percent?: number
  math: string
}>

/** Counts only successful gifts and keeps currencies in separate totals. */
export function calculateDonationProgress(
  rows: readonly Readonly<{
    lifecycle: string
    currency: string
    baseAmountMinor: string
    reversedAmountMinor?: string
  }>[],
  currency: string,
  goalAmountMinor?: string,
): DonationProgress {
  const settled = rows.filter(
    (row) =>
      ['succeeded', 'partially-refunded'].includes(row.lifecycle) && row.currency === currency,
  )
  const total = settled.reduce((sum, row) => {
    const base = BigInt(row.baseAmountMinor)
    const reversed = BigInt(row.reversedAmountMinor ?? '0')
    return sum + (reversed >= base ? 0n : base - reversed)
  }, 0n)
  const goal =
    goalAmountMinor && /^[1-9][0-9]*$/.test(goalAmountMinor) ? BigInt(goalAmountMinor) : undefined
  return {
    currency,
    settledAmountMinor: total.toString(),
    settledGiftCount: settled.length,
    ...(goal
      ? { goalAmountMinor: goal.toString(), percent: Number((total * 10000n) / goal) / 100 }
      : {}),
    math: `Sum of succeeded gift amounts in ${currency}, less recorded partial refunds; excludes fees, pending gifts, fully refunded or disputed gifts, and other currencies.`,
  }
}
const campaignTransitions: Readonly<Record<CampaignLifecycle, readonly CampaignLifecycle[]>> = {
  draft: ['scheduled', 'active', 'archived'],
  scheduled: ['active', 'paused', 'archived'],
  active: ['paused', 'completed', 'archived'],
  paused: ['active', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
}
const donationTransitions: Readonly<Record<DonationLifecycle, readonly DonationLifecycle[]>> = {
  created: ['pending', 'succeeded', 'failed', 'cancelled', 'unknown'],
  pending: ['succeeded', 'failed', 'cancelled', 'unknown'],
  unknown: ['pending', 'succeeded', 'failed', 'cancelled', 'disputed', 'refunded'],
  succeeded: ['partially-refunded', 'refunded', 'disputed', 'exception'],
  'partially-refunded': ['refunded', 'disputed', 'exception'],
  disputed: ['succeeded', 'refunded', 'exception'],
  failed: [],
  cancelled: [],
  refunded: [],
  exception: [],
}
export function assertCampaignTransition(from: CampaignLifecycle, to: CampaignLifecycle): void {
  if (from !== to && !campaignTransitions[from].includes(to))
    throw new Error(`Campaign cannot transition from ${from} to ${to}.`)
}
export function assertDonationTransition(from: DonationLifecycle, to: DonationLifecycle): void {
  if (from !== to && !donationTransitions[from].includes(to))
    throw new Error(`Donation cannot transition from ${from} to ${to}.`)
}
export type FeeCoverRule = Readonly<{
  mode: 'percentage-plus-fixed'
  basisPoints: number
  fixedAmountMinor: string
  maximumFeeMinor?: string
}>
export type Campaign = Readonly<{
  id: string
  campaignKey: string
  version: number
  tenantId: string
  siteId: string
  brandId?: string | null
  organizationId?: string
  title: string
  story?: unknown
  media: readonly string[]
  purpose: string
  designations: readonly Readonly<{ key: string; label: string }>[]
  startsAt?: string
  endsAt?: string
  goalAmountMinor?: string
  goalRules: Readonly<Record<string, unknown>>
  allowedAmounts: readonly string[]
  currency: string
  recurrence: readonly DonationRecurrence[]
  feeCover?: FeeCoverRule
  privacyDefault: DonationPrivacy
  disclosures: readonly string[]
  lifecycle: CampaignLifecycle
}>
export type DonationIntent = Readonly<{
  id: string
  siteId: string
  campaignId: string
  campaignVersion: number
  designation?: string
  donorSnapshot: Readonly<{ memberId?: string; guestName?: string; email?: string }>
  money: Readonly<{ baseAmountMinor: string; feeCoveredAmountMinor: string; currency: string }>
  recognition: DonationPrivacy
  publicDisplayName?: string
  donorMessage?: string
  trackingSource: Readonly<Record<string, string>>
  paymentIntentId?: string
  subscriptionId?: string
  recurrence: DonationRecurrence
  lifecycle: DonationLifecycle
}>
export type Donation = Readonly<
  Omit<DonationIntent, 'id' | 'paymentIntentId' | 'subscriptionId' | 'lifecycle'> & {
    id: string
    donationIntentId: string
    paymentIntentId: string
    subscriptionId?: string
    lifecycle: Exclude<
      DonationLifecycle,
      'created' | 'pending' | 'failed' | 'cancelled' | 'unknown'
    >
    campaignSnapshot: Readonly<{
      campaignId: string
      version: number
      title: string
      purpose: string
      organizationId?: string
    }>
  }
>
export type DonationAuditEvent = Readonly<{
  id: string
  donationId?: string
  donationIntentId?: string
  eventKey: string
  kind: string
  occurredAt: string
  actor?: string
  evidence: Readonly<Record<string, unknown>>
}>

export function assertDonationAuditEvent(event: DonationAuditEvent): DonationAuditEvent {
  if (Boolean(event.donationId) === Boolean(event.donationIntentId))
    throw new Error('A donation audit event must reference exactly one donation or intent.')
  if (!event.eventKey || !event.kind || Number.isNaN(Date.parse(event.occurredAt)))
    throw new Error('Donation audit event requires a unique key, kind, and valid timestamp.')
  return Object.freeze({ ...event })
}

export function assertCampaign(input: Campaign): Campaign {
  if (
    !input.id ||
    !input.campaignKey ||
    !input.tenantId ||
    !input.siteId ||
    !Number.isInteger(input.version) ||
    input.version < 1
  )
    throw new Error('Campaign identity and scope are required.')
  if (!/^[A-Z]{3}$/.test(input.currency))
    throw new Error('Campaign currency must be an uppercase ISO currency code.')
  if (
    (input.startsAt && Number.isNaN(Date.parse(input.startsAt))) ||
    (input.endsAt && Number.isNaN(Date.parse(input.endsAt)))
  )
    throw new Error('Campaign dates must be valid timestamps.')
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt))
    throw new Error('Campaign end must follow its start.')
  if (
    input.allowedAmounts.some((amount) => assertMoney(amount, input.currency).amountMinor === '0')
  )
    throw new Error('Allowed donation amounts must be positive.')
  if (
    input.goalAmountMinor !== undefined &&
    assertMoney(input.goalAmountMinor, input.currency).amountMinor === '0'
  )
    throw new Error('Campaign goal must be positive.')
  if (
    !input.recurrence.length ||
    input.recurrence.some((value) => !['one-time', 'recurring'].includes(value))
  )
    throw new Error('Campaign recurrence must be explicitly supported.')
  if (
    input.feeCover &&
    (!Number.isInteger(input.feeCover.basisPoints) ||
      input.feeCover.basisPoints < 0 ||
      input.feeCover.basisPoints > 10000)
  )
    throw new Error('Fee-cover basis points must be between 0 and 10000.')
  if (input.lifecycle === 'active' && (!input.disclosures.length || !input.purpose.trim()))
    throw new Error('An active campaign requires purpose and explicit disclosures.')
  if (
    input.designations.some((item) => !item.key.trim() || !item.label.trim()) ||
    new Set(input.designations.map((item) => item.key)).size !== input.designations.length
  )
    throw new Error('Campaign designation keys must be unique and labeled.')
  return Object.freeze({ ...input })
}

export function assertDonationMoney(money: DonationIntent['money']): DonationIntent['money'] {
  if (!/^[A-Z]{3}$/.test(money.currency))
    throw new Error('Donation currency must be an uppercase ISO currency code.')
  assertMoney(money.baseAmountMinor, money.currency)
  assertMoney(money.feeCoveredAmountMinor, money.currency)
  return Object.freeze({ ...money })
}

export function assertDonationIntent(input: DonationIntent, campaign: Campaign): DonationIntent {
  if (
    input.siteId !== campaign.siteId ||
    input.campaignId !== campaign.id ||
    input.campaignVersion !== campaign.version
  )
    throw new Error('Donation intent must reference the exact campaign revision and site.')
  if (!campaign.recurrence.includes(input.recurrence) || input.money.currency !== campaign.currency)
    throw new Error('Donation intent currency or recurrence is not supported by the campaign.')
  // Campaign amounts are suggested choices; the public form also accepts a custom
  // positive amount within the server's campaign ceiling.
  if (
    campaign.allowedAmounts.length &&
    BigInt(input.money.baseAmountMinor) >
      BigInt(
        campaign.allowedAmounts.reduce((maximum, amount) =>
          BigInt(amount) > BigInt(maximum) ? amount : maximum,
        ),
      )
  )
    throw new Error('Donation amount exceeds the campaign maximum.')
  if (input.designation && !campaign.designations.some((item) => item.key === input.designation))
    throw new Error('Donation designation is not available on the campaign.')
  if (!['public', 'anonymous', 'private'].includes(input.recognition))
    throw new Error('Invalid donation recognition choice.')
  assertDonationMoney(input.money)
  return Object.freeze({ ...input })
}

/** Confirms the SHOP-04 payment primitive covers the exact frozen donation amount. */
export function assertDonationPaymentBinding(
  intent: DonationIntent,
  payment: Readonly<{ id: string; amountMinor: string; currency: string; state: string }>,
): void {
  assertDonationMoney(intent.money)
  const expected = BigInt(intent.money.baseAmountMinor) + BigInt(intent.money.feeCoveredAmountMinor)
  if (!intent.paymentIntentId || intent.paymentIntentId !== payment.id)
    throw new Error('Payment intent does not match the immutable donation linkage.')
  if (
    payment.currency !== intent.money.currency ||
    !/^(0|[1-9][0-9]*)$/.test(payment.amountMinor) ||
    BigInt(payment.amountMinor) !== expected
  )
    throw new Error('Payment money does not match the frozen donation amounts.')
  if (!['paid', 'succeeded'].includes(payment.state))
    throw new Error('A donation record requires successful payment evidence.')
}

export function feeCoverAmount(baseAmountMinor: string, rule: FeeCoverRule): string {
  if (
    !/^(0|[1-9][0-9]*)$/.test(baseAmountMinor) ||
    !Number.isInteger(rule.basisPoints) ||
    rule.basisPoints < 0 ||
    rule.basisPoints > 10000 ||
    !/^(0|[1-9][0-9]*)$/.test(rule.fixedAmountMinor)
  )
    throw new Error('Invalid fee-cover inputs.')
  let fee =
    (BigInt(baseAmountMinor) * BigInt(rule.basisPoints)) / 10000n + BigInt(rule.fixedAmountMinor)
  if (rule.maximumFeeMinor !== undefined) {
    if (!/^(0|[1-9][0-9]*)$/.test(rule.maximumFeeMinor)) throw new Error('Invalid maximum fee.')
    fee = fee < BigInt(rule.maximumFeeMinor) ? fee : BigInt(rule.maximumFeeMinor)
  }
  return fee.toString()
}
