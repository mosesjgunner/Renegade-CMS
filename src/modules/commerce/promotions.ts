import { assertMoney } from './contracts'
import type { PricedInputLine, AdjustmentInput } from './pricing'

export type PromotionScope = 'order' | 'line' | 'category' | 'shipping'
export type PromotionDiscountType = 'fixed-minor' | 'percentage-basis-points' | 'free-shipping'
export type StackingRule = 'exclusive' | 'stackable' | 'priority'

export type PromotionDefinition = Readonly<{
  id: string
  version: number
  siteId: string
  code: string
  description: string
  scope: PromotionScope
  discountType: PromotionDiscountType
  discountValue: string // Minor units for fixed, or basis points (e.g. 1000 = 10%)
  maxDiscountMinor?: string
  currency: string
  startsAt?: string
  endsAt?: string
  timezone?: string
  status: 'active' | 'paused' | 'archived'
  stackingRule: StackingRule
  stackingPriority: number // Higher number = higher priority
  usageLimitTotal?: number
  usageCount: number
  usageLimitPerCustomer?: number
  eligibility?: Readonly<{
    minimumSubtotalMinor?: string
    eligibleProductIds?: readonly string[]
    eligibleCategoryIds?: readonly string[]
    eligibleCustomerIds?: readonly string[]
    firstTimeCustomerOnly?: boolean
  }>
}>

export type PromotionEvaluationContext = Readonly<{
  siteId: string
  currency: string
  customerId?: string
  isFirstTimeCustomer?: boolean
  customerUsageCounts?: Readonly<Record<string, number>>
  now?: string
}>

export type EvaluatedPromotionResult = Readonly<{
  promotion: PromotionDefinition
  eligible: boolean
  ineligibilityReason?: string
  adjustment?: AdjustmentInput
}>

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase()
}

/**
 * Checks whether a promotion is currently active given its temporal window and status.
 */
export function isPromotionTemporallyActive(
  promo: PromotionDefinition,
  nowIso = new Date().toISOString(),
): boolean {
  if (promo.status !== 'active') return false
  if (promo.startsAt && promo.startsAt > nowIso) return false
  if (promo.endsAt && promo.endsAt <= nowIso) return false
  return true
}

/**
 * Evaluates a single promotion against a set of lines and checkout context.
 */
export function evaluatePromotion(
  promo: PromotionDefinition,
  lines: readonly PricedInputLine[],
  shippingAmountMinor: string,
  context: PromotionEvaluationContext,
): EvaluatedPromotionResult {
  const now = context.now ?? new Date().toISOString()

  // 1. Site boundary check
  if (promo.siteId !== context.siteId) {
    return {
      promotion: promo,
      eligible: false,
      ineligibilityReason: 'Promotion code not valid for this site.',
    }
  }

  // 2. Active status and time window
  if (!isPromotionTemporallyActive(promo, now)) {
    return {
      promotion: promo,
      eligible: false,
      ineligibilityReason: 'Promotion is expired or inactive.',
    }
  }

  // 3. Currency check
  if (promo.currency !== context.currency) {
    return {
      promotion: promo,
      eligible: false,
      ineligibilityReason: `Promotion only valid in ${promo.currency}.`,
    }
  }

  // 4. Total usage limit
  if (promo.usageLimitTotal !== undefined && promo.usageCount >= promo.usageLimitTotal) {
    return {
      promotion: promo,
      eligible: false,
      ineligibilityReason: 'Promotion usage limit reached.',
    }
  }

  // 5. Per-customer usage limit
  if (promo.usageLimitPerCustomer !== undefined && context.customerId) {
    const customerUsage = context.customerUsageCounts?.[promo.id] ?? 0
    if (customerUsage >= promo.usageLimitPerCustomer) {
      return {
        promotion: promo,
        eligible: false,
        ineligibilityReason: 'Customer usage limit reached for this promotion.',
      }
    }
  }

  // 6. First-time customer check
  if (promo.eligibility?.firstTimeCustomerOnly && !context.isFirstTimeCustomer) {
    return {
      promotion: promo,
      eligible: false,
      ineligibilityReason: 'Promotion is for first-time customers only.',
    }
  }

  // 7. Customer allowlist
  if (
    promo.eligibility?.eligibleCustomerIds &&
    promo.eligibility.eligibleCustomerIds.length > 0 &&
    (!context.customerId || !promo.eligibility.eligibleCustomerIds.includes(context.customerId))
  ) {
    return {
      promotion: promo,
      eligible: false,
      ineligibilityReason: 'Customer not eligible for this promotion.',
    }
  }

  // 8. Filter eligible lines
  const eligibleLines = lines.filter((l) => {
    if (
      promo.eligibility?.eligibleProductIds &&
      promo.eligibility.eligibleProductIds.length > 0 &&
      !promo.eligibility.eligibleProductIds.includes(l.productId)
    ) {
      return false
    }
    return true
  })

  if (promo.scope !== 'shipping' && eligibleLines.length === 0) {
    return {
      promotion: promo,
      eligible: false,
      ineligibilityReason: 'Cart contains no qualifying items.',
    }
  }

  const eligibleSubtotal = eligibleLines.reduce(
    (sum, l) => sum + BigInt(l.unitPriceMinor) * BigInt(l.quantity),
    0n,
  )

  // 9. Minimum subtotal check
  if (promo.eligibility?.minimumSubtotalMinor) {
    const minSubtotal = BigInt(
      assertMoney(promo.eligibility.minimumSubtotalMinor, promo.currency).amountMinor,
    )
    if (eligibleSubtotal < minSubtotal) {
      return {
        promotion: promo,
        eligible: false,
        ineligibilityReason: `Requires a minimum purchase of ${(Number(minSubtotal) / 100).toFixed(2)} ${promo.currency}.`,
      }
    }
  }

  // 10. Compute discount amount
  let discountMinor = 0n
  if (promo.scope === 'shipping') {
    const shipping = BigInt(assertMoney(shippingAmountMinor, promo.currency).amountMinor)
    if (promo.discountType === 'free-shipping') {
      discountMinor = shipping
    } else if (promo.discountType === 'fixed-minor') {
      const fixed = BigInt(assertMoney(promo.discountValue, promo.currency).amountMinor)
      discountMinor = fixed > shipping ? shipping : fixed
    }
    return {
      promotion: promo,
      eligible: true,
      adjustment: {
        code: promo.code,
        description: promo.description,
        scope: 'shipping',
        amountMinor: discountMinor.toString(),
      },
    }
  }

  if (promo.discountType === 'percentage-basis-points') {
    const basisPoints = BigInt(promo.discountValue)
    if (basisPoints <= 0n || basisPoints > 10000n) {
      throw new Error('Percentage basis points must be between 1 and 10000.')
    }
    // Round down to avoid discounting more than requested
    discountMinor = (eligibleSubtotal * basisPoints) / 10000n
  } else if (promo.discountType === 'fixed-minor') {
    const fixed = BigInt(assertMoney(promo.discountValue, promo.currency).amountMinor)
    discountMinor = fixed > eligibleSubtotal ? eligibleSubtotal : fixed
  }

  // Apply cap if configured
  if (promo.maxDiscountMinor) {
    const cap = BigInt(assertMoney(promo.maxDiscountMinor, promo.currency).amountMinor)
    if (discountMinor > cap) discountMinor = cap
  }

  if (discountMinor <= 0n) {
    return {
      promotion: promo,
      eligible: false,
      ineligibilityReason: 'Promotion yields zero discount.',
    }
  }

  return {
    promotion: promo,
    eligible: true,
    adjustment: {
      code: promo.code,
      description: promo.description,
      scope: 'order',
      amountMinor: discountMinor.toString(),
    },
  }
}

/**
 * Resolves multiple promotions considering stacking rules and priorities.
 * Returns only the eligible, winning adjustments.
 */
export function resolvePromotions(
  promotions: readonly PromotionDefinition[],
  lines: readonly PricedInputLine[],
  shippingAmountMinor: string,
  context: PromotionEvaluationContext,
): {
  adjustments: AdjustmentInput[]
  appliedPromotions: PromotionDefinition[]
  rejected: { code: string; reason: string }[]
} {
  const rejected: { code: string; reason: string }[] = []
  const evaluated: { promo: PromotionDefinition; adjustment: AdjustmentInput }[] = []

  for (const promo of promotions) {
    const res = evaluatePromotion(promo, lines, shippingAmountMinor, context)
    if (res.eligible && res.adjustment) {
      evaluated.push({ promo: res.promotion, adjustment: res.adjustment })
    } else {
      rejected.push({ code: promo.code, reason: res.ineligibilityReason ?? 'Ineligible' })
    }
  }

  if (evaluated.length === 0) {
    return { adjustments: [], appliedPromotions: [], rejected }
  }

  // Check for exclusive promotions
  const exclusive = evaluated.filter((e) => e.promo.stackingRule === 'exclusive')
  if (exclusive.length > 0) {
    // Pick the one with the highest discount amount or highest priority
    exclusive.sort((a, b) => {
      const diff = BigInt(b.adjustment.amountMinor) - BigInt(a.adjustment.amountMinor)
      if (diff > 0n) return 1
      if (diff < 0n) return -1
      return b.promo.stackingPriority - a.promo.stackingPriority
    })
    const winner = exclusive[0]
    for (const other of evaluated) {
      if (other.promo.id !== winner.promo.id) {
        rejected.push({ code: other.promo.code, reason: 'Cannot stack with exclusive promotion.' })
      }
    }
    return {
      adjustments: [winner.adjustment],
      appliedPromotions: [winner.promo],
      rejected,
    }
  }

  // Sort remaining stackable and priority promotions by priority desc, then amount desc
  evaluated.sort((a, b) => {
    if (b.promo.stackingPriority !== a.promo.stackingPriority) {
      return b.promo.stackingPriority - a.promo.stackingPriority
    }
    const diff = BigInt(b.adjustment.amountMinor) - BigInt(a.adjustment.amountMinor)
    return diff > 0n ? 1 : diff < 0n ? -1 : 0
  })

  // Prevent duplicate promotion codes
  const seenCodes = new Set<string>()
  const finalAdjustments: AdjustmentInput[] = []
  const finalPromos: PromotionDefinition[] = []

  for (const item of evaluated) {
    if (seenCodes.has(item.promo.code)) continue
    seenCodes.add(item.promo.code)
    finalAdjustments.push(item.adjustment)
    finalPromos.push(item.promo)
  }

  return { adjustments: finalAdjustments, appliedPromotions: finalPromos, rejected }
}
