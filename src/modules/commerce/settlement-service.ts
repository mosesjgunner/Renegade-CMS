import { createHash, randomUUID } from 'node:crypto'
import {
  assertMoney,
  type CommissionLedger,
  type SettlementBatch,
} from './affiliate-referral-contracts'

export type ReferrerHoldRecord = Readonly<{
  referrerMemberId: string
  reason: string
  placedBy: string
  placedAt: string
  active: boolean
}>

export type SettlementLiabilitySummary = Readonly<{
  siteId: string
  currency: string
  pendingAmountMinor: string
  eligibleAmountMinor: string
  onHoldAmountMinor: string
  settledAmountMinor: string
  reversedAmountMinor: string
  eligibleCount: number
}>

/**
 * Summarizes commission liability by currency.
 * Guarantees strict currency separation: never sums or mixes multiple currencies.
 */
export function summarizeCommissionLiabilities(
  ledgers: readonly CommissionLedger[],
  siteId: string,
): readonly SettlementLiabilitySummary[] {
  const byCurrency = new Map<
    string,
    {
      pending: bigint
      eligible: bigint
      onHold: bigint
      settled: bigint
      reversed: bigint
      eligibleCount: number
    }
  >()

  for (const entry of ledgers) {
    if (entry.siteId !== siteId) continue
    const curr = entry.currency
    if (!byCurrency.has(curr)) {
      byCurrency.set(curr, {
        pending: 0n,
        eligible: 0n,
        onHold: 0n,
        settled: 0n,
        reversed: 0n,
        eligibleCount: 0,
      })
    }
    const acc = byCurrency.get(curr)!
    const amount = BigInt(entry.amountMinor)

    switch (entry.status) {
      case 'pending':
        acc.pending += amount
        break
      case 'eligible':
        acc.eligible += amount
        acc.eligibleCount++
        break
      case 'on_hold':
        acc.onHold += amount
        break
      case 'approved':
      case 'settled':
        acc.settled += amount
        break
      case 'reversed':
        acc.reversed += amount
        break
    }
  }

  const result: SettlementLiabilitySummary[] = []
  for (const [currency, data] of byCurrency.entries()) {
    result.push({
      siteId,
      currency,
      pendingAmountMinor: data.pending.toString(),
      eligibleAmountMinor: data.eligible.toString(),
      onHoldAmountMinor: data.onHold.toString(),
      settledAmountMinor: data.settled.toString(),
      reversedAmountMinor: data.reversed.toString(),
      eligibleCount: data.eligibleCount,
    })
  }

  return result
}

export type CreateSettlementBatchInput = Readonly<{
  siteId: string
  currency: string
  ledgers: readonly CommissionLedger[]
  holds?: readonly ReferrerHoldRecord[]
  now?: Date
}>

/**
 * Creates a reviewed draft SettlementBatch for a specific single currency:
 * - Selects only 'eligible' entries in the given currency and site.
 * - Filters out referrers on hold or with fraud flags.
 * - Never executes money transfers automatically; enters 'pending_approval' for human operator review.
 */
export function createSettlementBatch(input: CreateSettlementBatchInput): {
  batch: SettlementBatch
  includedLedgerIds: readonly string[]
  excludedDueToHold: readonly string[]
} {
  const { siteId, currency, ledgers, holds = [] } = input
  const now = input.now ?? new Date()

  const activeHoldMemberIds = new Set(holds.filter((h) => h.active).map((h) => h.referrerMemberId))

  const includedIds: string[] = []
  const excludedIds: string[] = []
  let totalAmount = 0n

  for (const entry of ledgers) {
    if (entry.siteId !== siteId || entry.currency !== currency) continue
    if (entry.status !== 'eligible') continue

    if (entry.fraudFlag || activeHoldMemberIds.has(entry.referrerMemberId)) {
      excludedIds.push(entry.id)
      continue
    }

    includedIds.push(entry.id)
    totalAmount += BigInt(entry.amountMinor)
  }

  assertMoney(totalAmount.toString(), currency)

  const batchNumber = `BAT-${currency}-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`

  const batch: SettlementBatch = {
    id: `sb_${randomUUID()}`,
    siteId,
    batchNumber,
    currency,
    totalAmountMinor: totalAmount.toString(),
    entriesCount: includedIds.length,
    status: 'pending_approval',
    createdAt: now.toISOString(),
  }

  return {
    batch,
    includedLedgerIds: includedIds,
    excludedDueToHold: excludedIds,
  }
}

/**
 * Human operator approval of a settlement batch.
 * Payout credentials are NEVER stored; money is never moved from DB status alone.
 */
export function approveSettlementBatch(input: {
  batch: SettlementBatch
  operatorUser: { id: string; role: string }
  now?: Date
}): SettlementBatch {
  const { batch, operatorUser, now = new Date() } = input
  if (!['owner', 'administrator'].includes(operatorUser.role)) {
    throw new Error('Only owners and administrators can approve settlement batches.')
  }
  if (batch.status !== 'pending_approval' && batch.status !== 'draft') {
    throw new Error(`Cannot approve batch in status ${batch.status}.`)
  }
  if (batch.entriesCount <= 0 || BigInt(batch.totalAmountMinor) <= 0n) {
    throw new Error('Cannot approve an empty settlement batch.')
  }

  return {
    ...batch,
    status: 'approved',
    approvedBy: operatorUser.id,
    approvedAt: now.toISOString(),
  }
}

export type ExportLineItem = Readonly<{
  ledgerId: string
  referrerMemberId: string
  orderNumber: string
  amountMinor: string
  currency: string
}>

export type SettlementExportPayload = Readonly<{
  batchId: string
  batchNumber: string
  siteId: string
  currency: string
  totalAmountMinor: string
  exportedAt: string
  lineItems: readonly ExportLineItem[]
  csvContent: string
  payloadHash: string
}>

/**
 * Generates an external payout export (CSV/JSON) for approved settlement batch.
 * The output hash is pinned to prevent export tampering.
 */
export function generateSettlementExport(
  batch: SettlementBatch,
  ledgers: readonly CommissionLedger[],
  now = new Date(),
): SettlementExportPayload {
  if (batch.status !== 'approved' && batch.status !== 'processing') {
    throw new Error(
      `Batch must be approved before generating payout export. Status is ${batch.status}.`,
    )
  }

  const lineItems: ExportLineItem[] = ledgers
    .filter(
      (l) =>
        l.currency === batch.currency &&
        (l.settlementBatchId === batch.id ||
          (['approved', 'eligible'].includes(l.status) &&
            (!l.settlementBatchId || l.settlementBatchId === batch.id))),
    )
    .map((l) => ({
      ledgerId: l.id,
      referrerMemberId: l.referrerMemberId,
      orderNumber: l.orderNumber,
      amountMinor: l.amountMinor,
      currency: l.currency,
    }))

  const csvRows = [
    'LedgerId,ReferrerMemberId,OrderNumber,AmountMinor,Currency',
    ...lineItems.map(
      (l) => `${l.ledgerId},${l.referrerMemberId},${l.orderNumber},${l.amountMinor},${l.currency}`,
    ),
  ]
  const csvContent = csvRows.join('\n')
  const payloadHash = createHash('sha256').update(csvContent).digest('hex')

  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    siteId: batch.siteId,
    currency: batch.currency,
    totalAmountMinor: batch.totalAmountMinor,
    exportedAt: now.toISOString(),
    lineItems,
    csvContent,
    payloadHash,
  }
}

/**
 * Reconciles external payout execution result.
 * If successful, completes batch and marks ledgers as 'settled'.
 * If failed, marks batch as 'failed' and releases ledgers back to 'eligible'.
 */
export function reconcileSettlementExecution(input: {
  batch: SettlementBatch
  ledgers: readonly CommissionLedger[]
  success: boolean
  externalReference?: string
  failureReason?: string
  now?: Date
}): {
  batch: SettlementBatch
  updatedLedgers: readonly CommissionLedger[]
} {
  const { batch, ledgers, success, externalReference, failureReason } = input
  const now = input.now ?? new Date()

  if (success) {
    const updatedBatch: SettlementBatch = {
      ...batch,
      status: 'completed',
      externalReference,
      reconciledAt: now.toISOString(),
    }
    const updatedLedgers = ledgers.map((l) => ({
      ...l,
      status: 'settled' as const,
      settledAt: now.toISOString(),
      explanation: `${l.explanation} [Settled via batch ${batch.batchNumber} ref ${externalReference ?? 'none'} on ${now.toISOString()}]`,
    }))
    return { batch: updatedBatch, updatedLedgers }
  }

  // External payout failed: rollback ledgers so liabilities are not lost
  const updatedBatch: SettlementBatch = {
    ...batch,
    status: 'failed',
    failureReason,
    reconciledAt: now.toISOString(),
  }
  const updatedLedgers = ledgers.map((l) => ({
    ...l,
    status: 'eligible' as const,
    settlementBatchId: undefined,
    explanation: `${l.explanation} [Payout batch ${batch.batchNumber} failed (${failureReason ?? 'unknown error'}). Reverted to eligible.]`,
  }))
  return { batch: updatedBatch, updatedLedgers }
}
