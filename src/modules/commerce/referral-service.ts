import { randomUUID } from 'node:crypto'
import {
  calculateReferralCommission,
  type CommissionLedger,
  type ReferralAttributionSnapshot,
  type ReferralProgram,
} from './affiliate-referral-contracts'

export function validateReferralProgram(program: ReferralProgram): string[] {
  const issues: string[] = []
  if (!program.id || !program.siteId) issues.push('Referral program requires an id and siteId.')
  if (!Number.isSafeInteger(program.version) || program.version < 1) {
    issues.push('Referral program requires a positive integer version.')
  }
  if (!program.name?.trim()) issues.push('Referral program requires a name.')

  if (!program.eligibility?.allowedMemberRoles?.length) {
    issues.push('Referral program requires at least one allowed member role.')
  }

  if (program.codes) {
    if (program.codes.minLength < 3 || program.codes.maxLength > 32) {
      issues.push('Referral code length bounds must be between 3 and 32 characters.')
    }
  }

  if (program.benefit) {
    if (
      program.benefit.referrerRewardType === 'basis_points' &&
      (Number(program.benefit.referrerRewardValue) <= 0 ||
        Number(program.benefit.referrerRewardValue) > 10000)
    ) {
      issues.push('Referrer reward basis points must be between 1 and 10000.')
    }
    if (
      program.benefit.referrerRewardType === 'fixed_minor' &&
      !/^[1-9][0-9]*$/.test(program.benefit.referrerRewardValue)
    ) {
      issues.push('Referrer reward fixed minor must be a positive integer.')
    }
  }

  if (program.holdPeriodDays < 0) {
    issues.push('holdPeriodDays cannot be negative.')
  }

  if (!program.terms?.version || !program.terms.text?.trim()) {
    issues.push('Referral program requires published terms with version and text.')
  }

  return issues
}

export type CodeOwnerRecord = Readonly<{
  memberId: string
  email?: string
  role?: string
  accountCreatedAt?: string
  emailVerified?: boolean
  suspended?: boolean
}>

export type ReferralCustomerContext = Readonly<{
  memberId?: string
  email?: string
  paymentFingerprint?: string
  ipHash?: string
}>

export type EvaluateAttributionInput = Readonly<{
  program: ReferralProgram
  referralCode: string
  codeOwner: CodeOwnerRecord
  customer: ReferralCustomerContext
  orderAmountMinor: string
  currency: string
  consented?: boolean
  attributedAt?: Date
  now?: Date
  priorAttribution?: { code: string; attributedAt: string }
}>

export type AttributionEvaluationResult = Readonly<{
  eligible: boolean
  snapshot: ReferralAttributionSnapshot
}>

/**
 * Consented first-party referral attribution evaluator.
 * - Enforces program active status, member eligibility, and terms.
 * - Strictly blocks self-referrals (same member, same email, same payment method, same IP hash).
 * - Applies attribution model (first-touch or last-touch) and window limit.
 * - Computes integer commission and caps.
 * - Produces frozen, explainable attribution snapshot.
 */
export function evaluateReferralAttribution(
  input: EvaluateAttributionInput,
): AttributionEvaluationResult {
  const { program, referralCode, codeOwner, customer, orderAmountMinor, currency } = input
  const now = input.now ?? new Date()
  const attributedAt = input.attributedAt ?? now

  // Consent check
  if (program.attribution.requireCookieConsent && input.consented === false) {
    return {
      eligible: false,
      snapshot: {
        programId: program.id,
        programVersion: program.version,
        referrerMemberId: codeOwner.memberId,
        referralCode,
        model: program.attribution.model,
        attributedAt: attributedAt.toISOString(),
        attributionWindowDays: program.attribution.windowDays,
        orderAmountMinor,
        eligibleAmountMinor: '0',
        calculatedCommissionMinor: '0',
        currency,
        explanation:
          'Attribution declined: visitor has not granted required cookie/referral consent.',
        status: 'rejected',
        rejectReason: 'CONSENT_REQUIRED',
      },
    }
  }

  // Program status check
  if (program.status !== 'active') {
    return {
      eligible: false,
      snapshot: {
        programId: program.id,
        programVersion: program.version,
        referrerMemberId: codeOwner.memberId,
        referralCode,
        model: program.attribution.model,
        attributedAt: attributedAt.toISOString(),
        attributionWindowDays: program.attribution.windowDays,
        orderAmountMinor,
        eligibleAmountMinor: '0',
        calculatedCommissionMinor: '0',
        currency,
        explanation: `Referral program ${program.name} is ${program.status}, not active.`,
        status: 'rejected',
        rejectReason: 'PROGRAM_INACTIVE',
      },
    }
  }

  // Referrer eligibility checks
  if (codeOwner.suspended) {
    return {
      eligible: false,
      snapshot: {
        programId: program.id,
        programVersion: program.version,
        referrerMemberId: codeOwner.memberId,
        referralCode,
        model: program.attribution.model,
        attributedAt: attributedAt.toISOString(),
        attributionWindowDays: program.attribution.windowDays,
        orderAmountMinor,
        eligibleAmountMinor: '0',
        calculatedCommissionMinor: '0',
        currency,
        explanation: 'Referrer account is suspended.',
        status: 'rejected',
        rejectReason: 'REFERRER_SUSPENDED',
      },
    }
  }

  if (
    program.eligibility.allowedMemberRoles.length > 0 &&
    codeOwner.role &&
    !program.eligibility.allowedMemberRoles.includes(codeOwner.role)
  ) {
    return {
      eligible: false,
      snapshot: {
        programId: program.id,
        programVersion: program.version,
        referrerMemberId: codeOwner.memberId,
        referralCode,
        model: program.attribution.model,
        attributedAt: attributedAt.toISOString(),
        attributionWindowDays: program.attribution.windowDays,
        orderAmountMinor,
        eligibleAmountMinor: '0',
        calculatedCommissionMinor: '0',
        currency,
        explanation: `Referrer role ${codeOwner.role} is not eligible for referral rewards.`,
        status: 'rejected',
        rejectReason: 'ROLE_INELIGIBLE',
      },
    }
  }

  if (program.eligibility.requireVerifiedEmail && codeOwner.emailVerified === false) {
    return {
      eligible: false,
      snapshot: {
        programId: program.id,
        programVersion: program.version,
        referrerMemberId: codeOwner.memberId,
        referralCode,
        model: program.attribution.model,
        attributedAt: attributedAt.toISOString(),
        attributionWindowDays: program.attribution.windowDays,
        orderAmountMinor,
        eligibleAmountMinor: '0',
        calculatedCommissionMinor: '0',
        currency,
        explanation: 'Referrer email must be verified to earn commissions.',
        status: 'rejected',
        rejectReason: 'EMAIL_UNVERIFIED',
      },
    }
  }

  // Self-referral rules
  if (
    program.selfReferralRules.blockSameMemberId &&
    customer.memberId &&
    customer.memberId === codeOwner.memberId
  ) {
    return {
      eligible: false,
      snapshot: {
        programId: program.id,
        programVersion: program.version,
        referrerMemberId: codeOwner.memberId,
        referralCode,
        model: program.attribution.model,
        attributedAt: attributedAt.toISOString(),
        attributionWindowDays: program.attribution.windowDays,
        orderAmountMinor,
        eligibleAmountMinor: '0',
        calculatedCommissionMinor: '0',
        currency,
        explanation: 'Self-referral prohibited: customer and referrer are the same member.',
        status: 'rejected',
        rejectReason: 'SELF_REFERRAL_SAME_MEMBER',
      },
    }
  }

  if (
    program.selfReferralRules.blockSameEmail &&
    customer.email &&
    codeOwner.email &&
    customer.email.trim().toLowerCase() === codeOwner.email.trim().toLowerCase()
  ) {
    return {
      eligible: false,
      snapshot: {
        programId: program.id,
        programVersion: program.version,
        referrerMemberId: codeOwner.memberId,
        referralCode,
        model: program.attribution.model,
        attributedAt: attributedAt.toISOString(),
        attributionWindowDays: program.attribution.windowDays,
        orderAmountMinor,
        eligibleAmountMinor: '0',
        calculatedCommissionMinor: '0',
        currency,
        explanation:
          'Self-referral prohibited: customer and referrer share the same email address.',
        status: 'rejected',
        rejectReason: 'SELF_REFERRAL_SAME_EMAIL',
      },
    }
  }

  // Attribution window check
  const attributionAgeMs = now.getTime() - attributedAt.getTime()
  const maxAgeMs = program.attribution.windowDays * 24 * 3600 * 1000
  if (attributionAgeMs > maxAgeMs) {
    return {
      eligible: false,
      snapshot: {
        programId: program.id,
        programVersion: program.version,
        referrerMemberId: codeOwner.memberId,
        referralCode,
        model: program.attribution.model,
        attributedAt: attributedAt.toISOString(),
        attributionWindowDays: program.attribution.windowDays,
        orderAmountMinor,
        eligibleAmountMinor: '0',
        calculatedCommissionMinor: '0',
        currency,
        explanation: `Referral attribution expired: click was ${Math.round(attributionAgeMs / (24 * 3600 * 1000))} days ago, exceeding window of ${program.attribution.windowDays} days.`,
        status: 'rejected',
        rejectReason: 'ATTRIBUTION_WINDOW_EXPIRED',
      },
    }
  }

  // First-touch vs Last-touch logic
  if (program.attribution.model === 'first-touch' && input.priorAttribution) {
    // If prior attribution exists and differs, first-touch honors the prior code
    if (input.priorAttribution.code !== referralCode) {
      return {
        eligible: false,
        snapshot: {
          programId: program.id,
          programVersion: program.version,
          referrerMemberId: codeOwner.memberId,
          referralCode,
          model: 'first-touch',
          attributedAt: attributedAt.toISOString(),
          attributionWindowDays: program.attribution.windowDays,
          orderAmountMinor,
          eligibleAmountMinor: '0',
          calculatedCommissionMinor: '0',
          currency,
          explanation: `First-touch attribution preserved earlier code ${input.priorAttribution.code}.`,
          status: 'rejected',
          rejectReason: 'FIRST_TOUCH_SUPERSEDED',
        },
      }
    }
  }

  // Calculate commission
  const math = calculateReferralCommission({
    orderAmountMinor,
    rewardType: program.benefit.referrerRewardType,
    rewardValue: program.benefit.referrerRewardValue,
    currency,
    maxCommissionPerOrderMinor: program.benefit.maxCommissionPerOrderMinor,
  })

  const rateDesc =
    program.benefit.referrerRewardType === 'basis_points'
      ? `${(Number(program.benefit.referrerRewardValue) / 100).toFixed(2)}%`
      : `${program.benefit.referrerRewardValue} ${currency} fixed`

  const explanation = `Attributed to referrer ${codeOwner.memberId} via code ${referralCode} under ${program.name} v${program.version} (${rateDesc} on ${orderAmountMinor} ${currency}). Matures after ${program.holdPeriodDays} days holding period.`

  return {
    eligible: true,
    snapshot: {
      programId: program.id,
      programVersion: program.version,
      referrerMemberId: codeOwner.memberId,
      referralCode,
      model: program.attribution.model,
      attributedAt: attributedAt.toISOString(),
      attributionWindowDays: program.attribution.windowDays,
      orderAmountMinor,
      eligibleAmountMinor: orderAmountMinor,
      rateBasisPoints: math.rateBasisPoints,
      calculatedCommissionMinor: math.amountMinor,
      currency,
      explanation,
      status: 'attributed',
    },
  }
}

/**
 * Creates an append-only initial pending CommissionLedger entry upon eligible settled payment evidence.
 */
export function createPendingCommissionEntry(input: {
  siteId: string
  program: ReferralProgram
  attribution: ReferralAttributionSnapshot
  orderId: string
  orderNumber: string
  paymentIntentId?: string
  now?: Date
}): CommissionLedger {
  const { siteId, program, attribution, orderId, orderNumber, paymentIntentId } = input
  const now = input.now ?? new Date()
  const matureTime = new Date(now.getTime() + program.holdPeriodDays * 24 * 3600 * 1000)

  return {
    id: `com_${randomUUID()}`,
    siteId,
    programId: program.id,
    programVersion: program.version,
    referrerMemberId: attribution.referrerMemberId,
    orderId,
    orderNumber,
    paymentIntentId,
    currency: attribution.currency,
    amountMinor: attribution.calculatedCommissionMinor,
    type: 'accrual',
    status: 'pending',
    matureAt: matureTime.toISOString(),
    createdAt: now.toISOString(),
    explanation: attribution.explanation,
  }
}

/**
 * Matures a pending commission ledger entry when hold window expires.
 */
export function matureCommissionLedger(
  entry: CommissionLedger,
  now = new Date(),
): CommissionLedger {
  if (entry.status !== 'pending') return entry
  if (Date.parse(entry.matureAt) <= now.getTime()) {
    return {
      ...entry,
      status: 'eligible',
      explanation: `${entry.explanation} [Matured to eligible for settlement on ${now.toISOString()}]`,
    }
  }
  return entry
}

/**
 * Processes commission reversal upon order refund, cancellation, or dispute.
 * Returns both the updated original entry and the new compensating reversal entry.
 */
export function reverseCommissionEntry(input: {
  entry: CommissionLedger
  reason: 'order_refunded' | 'order_cancelled' | 'disputed' | 'fraud_detected'
  refundReference?: string
  now?: Date
}): {
  updatedEntry: CommissionLedger
  reversalEntry: CommissionLedger
} {
  const { entry, reason, refundReference } = input
  const now = input.now ?? new Date()

  const updatedEntry: CommissionLedger = {
    ...entry,
    status: 'reversed',
    reversedAt: now.toISOString(),
    reversalReason: reason,
    explanation: `${entry.explanation} [Reversed on ${now.toISOString()} due to ${reason}${refundReference ? ` (${refundReference})` : ''}]`,
  }

  const reversalEntry: CommissionLedger = {
    id: `rev_${randomUUID()}`,
    siteId: entry.siteId,
    programId: entry.programId,
    programVersion: entry.programVersion,
    referrerMemberId: entry.referrerMemberId,
    orderId: entry.orderId,
    orderNumber: entry.orderNumber,
    paymentIntentId: entry.paymentIntentId,
    currency: entry.currency,
    amountMinor: entry.amountMinor,
    type: 'reversal',
    status: 'settled',
    matureAt: now.toISOString(),
    createdAt: now.toISOString(),
    settledAt: now.toISOString(),
    reversedAt: now.toISOString(),
    reversalReason: reason,
    compensatesLedgerId: entry.id,
    explanation: `Compensating reversal for commission ${entry.id} on order ${entry.orderNumber}: ${reason}.`,
  }

  return { updatedEntry, reversalEntry }
}
