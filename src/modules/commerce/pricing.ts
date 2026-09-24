import { createHash } from 'node:crypto'
import { assertMoney } from './contracts'

export const PRICING_RULE_VERSION = '2026-09-23.1'

export type PricedInputLine = Readonly<{
  lineId: string
  productId: string
  variantSku: string
  quantity: number
  unitPriceMinor: string
  currency: string
  taxable?: boolean
  taxDisplay?: 'inclusive' | 'exclusive' | 'not-applicable'
  kind?: string
}>

export type AdjustmentInput = Readonly<{
  code?: string
  description: string
  scope: 'order' | 'line' | 'shipping'
  targetLineId?: string
  amountMinor: string
}>

export type PricedLineSnapshot = Readonly<{
  lineId: string
  productId: string
  variantSku: string
  quantity: number
  unitPriceMinor: string
  grossAmountMinor: string
  allocatedAdjustmentMinor: string
  netAmountMinor: string
  taxAmountMinor: string
  totalAmountMinor: string
  currency: string
}>

export type PricingSnapshot = Readonly<{
  subtotalMinor: string
  adjustmentsTotalMinor: string
  shippingAmountMinor: string
  shippingAdjustmentMinor: string
  netShippingMinor: string
  taxTotalMinor: string
  grandTotalMinor: string
  currency: string
  lines: readonly PricedLineSnapshot[]
  adjustments: readonly AdjustmentInput[]
  ruleVersion: string
  calculatedAt: string
  pricingHash: string
}>

/**
 * Distributes an integer discount across lines proportionally based on line gross amounts.
 * Remainder/residue is assigned to the line with largest gross to ensure exact integer summation with zero residue loss.
 */
export function allocateDiscountsToLines(
  lines: readonly { lineId: string; gross: bigint }[],
  totalDiscount: bigint,
): Map<string, bigint> {
  const result = new Map<string, bigint>()
  if (lines.length === 0 || totalDiscount <= 0n) {
    for (const l of lines) result.set(l.lineId, 0n)
    return result
  }

  const totalGross = lines.reduce((sum, l) => sum + l.gross, 0n)
  if (totalGross <= 0n) {
    for (const l of lines) result.set(l.lineId, 0n)
    return result
  }

  const effectiveDiscount = totalDiscount > totalGross ? totalGross : totalDiscount
  let allocatedSum = 0n
  const rawAllocations: { lineId: string; gross: bigint; allocated: bigint; remainder: bigint }[] =
    []

  for (const line of lines) {
    if (line.gross <= 0n) {
      rawAllocations.push({ lineId: line.lineId, gross: line.gross, allocated: 0n, remainder: 0n })
      continue
    }
    const unrounded = line.gross * effectiveDiscount
    const share = unrounded / totalGross
    const remainder = unrounded % totalGross
    rawAllocations.push({ lineId: line.lineId, gross: line.gross, allocated: share, remainder })
    allocatedSum += share
  }

  let residue = effectiveDiscount - allocatedSum
  // Sort by remainder descending, then gross descending
  const sorted = [...rawAllocations].sort((a, b) => {
    if (b.remainder > a.remainder) return 1
    if (b.remainder < a.remainder) return -1
    return b.gross > a.gross ? 1 : b.gross < a.gross ? -1 : 0
  })

  let i = 0
  while (residue > 0n && sorted.length > 0) {
    const target = sorted[i % sorted.length]
    if (target.allocated < target.gross) {
      target.allocated += 1n
      residue -= 1n
    }
    i++
    if (i > sorted.length * 2 && residue > 0n) {
      // Safety break
      break
    }
  }

  for (const alloc of rawAllocations) {
    result.set(alloc.lineId, alloc.allocated)
  }

  return result
}

/**
 * Distributes total tax across taxable lines proportionally to net amounts, with zero residue loss.
 */
export function allocateTaxToLines(
  lines: readonly { lineId: string; net: bigint; taxable: boolean }[],
  totalTax: bigint,
): Map<string, bigint> {
  const result = new Map<string, bigint>()
  const taxableLines = lines.filter((l) => l.taxable && l.net > 0n)
  if (taxableLines.length === 0 || totalTax <= 0n) {
    for (const l of lines) result.set(l.lineId, 0n)
    return result
  }

  const totalTaxableNet = taxableLines.reduce((sum, l) => sum + l.net, 0n)
  if (totalTaxableNet <= 0n) {
    for (const l of lines) result.set(l.lineId, 0n)
    return result
  }

  let allocatedSum = 0n
  const rawAllocations: { lineId: string; net: bigint; allocated: bigint; remainder: bigint }[] = []

  for (const line of taxableLines) {
    const unrounded = line.net * totalTax
    const share = unrounded / totalTaxableNet
    const remainder = unrounded % totalTaxableNet
    rawAllocations.push({ lineId: line.lineId, net: line.net, allocated: share, remainder })
    allocatedSum += share
  }

  let residue = totalTax - allocatedSum
  const sorted = [...rawAllocations].sort((a, b) => {
    if (b.remainder > a.remainder) return 1
    if (b.remainder < a.remainder) return -1
    return b.net > a.net ? 1 : b.net < a.net ? -1 : 0
  })

  let i = 0
  while (residue > 0n && sorted.length > 0) {
    sorted[i % sorted.length].allocated += 1n
    residue -= 1n
    i++
  }

  for (const l of lines) {
    const match = rawAllocations.find((a) => a.lineId === l.lineId)
    result.set(l.lineId, match ? match.allocated : 0n)
  }

  return result
}

export function computePricing(input: {
  currency: string
  lines: readonly PricedInputLine[]
  orderAdjustments?: readonly AdjustmentInput[]
  shippingAmountMinor?: string
  shippingAdjustmentMinor?: string
  taxTotalMinor?: string
  now?: string
}): PricingSnapshot {
  if (!input.lines || input.lines.length === 0) {
    throw new Error('Pricing requires at least one line.')
  }
  const currency = input.currency
  assertMoney('0', currency)

  let subtotal = 0n
  const processedLines: {
    line: PricedInputLine
    gross: bigint
    directAdjustment: bigint
  }[] = []

  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`Invalid line quantity: ${line.quantity}`)
    }
    if (line.currency !== currency) {
      throw new Error(`Line currency mismatch: expected ${currency}, got ${line.currency}`)
    }
    const unitPrice = BigInt(assertMoney(line.unitPriceMinor, currency).amountMinor)
    const gross = unitPrice * BigInt(line.quantity)
    subtotal += gross
    processedLines.push({ line, gross, directAdjustment: 0n })
  }

  // Handle line-targeted adjustments
  const orderLevelAdjustments: AdjustmentInput[] = []
  const allAdjustments = input.orderAdjustments ?? []

  for (const adj of allAdjustments) {
    const amount = BigInt(assertMoney(adj.amountMinor, currency).amountMinor)
    if (adj.scope === 'line' && adj.targetLineId) {
      const match = processedLines.find((p) => p.line.lineId === adj.targetLineId)
      if (match) {
        match.directAdjustment += amount
      }
    } else if (adj.scope === 'order') {
      orderLevelAdjustments.push(adj)
    }
  }

  // Remaining gross after direct line adjustments for order-level discount allocation
  const remainingForOrderDiscount = processedLines.map((p) => ({
    lineId: p.line.lineId,
    gross: p.gross > p.directAdjustment ? p.gross - p.directAdjustment : 0n,
  }))

  const totalOrderDiscount = orderLevelAdjustments.reduce(
    (sum, a) => sum + BigInt(a.amountMinor),
    0n,
  )

  const allocatedOrderDiscounts = allocateDiscountsToLines(
    remainingForOrderDiscount,
    totalOrderDiscount,
  )

  // Net amounts per line
  const linesWithNet = processedLines.map((p) => {
    const orderShare = allocatedOrderDiscounts.get(p.line.lineId) ?? 0n
    const totalLineAdjustment = p.directAdjustment + orderShare
    const net = p.gross > totalLineAdjustment ? p.gross - totalLineAdjustment : 0n
    return {
      line: p.line,
      gross: p.gross,
      totalAdjustment: totalLineAdjustment,
      net,
      taxable: p.line.taxable !== false && p.line.taxDisplay !== 'not-applicable',
    }
  })

  // Tax allocation
  const rawTax = input.taxTotalMinor
    ? BigInt(assertMoney(input.taxTotalMinor, currency).amountMinor)
    : 0n
  const taxAllocations = allocateTaxToLines(
    linesWithNet.map((l) => ({ lineId: l.line.lineId, net: l.net, taxable: l.taxable })),
    rawTax,
  )

  const lineSnapshots: PricedLineSnapshot[] = linesWithNet.map((l) => {
    const tax = taxAllocations.get(l.line.lineId) ?? 0n
    const total = l.net + tax
    return {
      lineId: l.line.lineId,
      productId: l.line.productId,
      variantSku: l.line.variantSku,
      quantity: l.line.quantity,
      unitPriceMinor: l.line.unitPriceMinor,
      grossAmountMinor: l.gross.toString(),
      allocatedAdjustmentMinor: l.totalAdjustment.toString(),
      netAmountMinor: l.net.toString(),
      taxAmountMinor: tax.toString(),
      totalAmountMinor: total.toString(),
      currency,
    }
  })

  const totalAdjustments = lineSnapshots.reduce(
    (sum, l) => sum + BigInt(l.allocatedAdjustmentMinor),
    0n,
  )

  // Shipping
  const rawShipping = input.shippingAmountMinor
    ? BigInt(assertMoney(input.shippingAmountMinor, currency).amountMinor)
    : 0n
  const rawShippingAdj = input.shippingAdjustmentMinor
    ? BigInt(assertMoney(input.shippingAdjustmentMinor, currency).amountMinor)
    : 0n
  const netShipping = rawShipping > rawShippingAdj ? rawShipping - rawShippingAdj : 0n

  const actualTaxTotal = lineSnapshots.reduce((sum, l) => sum + BigInt(l.taxAmountMinor), 0n)
  const itemsNetTotal = lineSnapshots.reduce((sum, l) => sum + BigInt(l.netAmountMinor), 0n)

  // Grand Total = Net Items + Net Shipping + Tax
  const grandTotal = itemsNetTotal + netShipping + actualTaxTotal

  const calculatedAt = input.now ?? new Date().toISOString()
  const payloadToHash = `${PRICING_RULE_VERSION}|${currency}|${subtotal}|${totalAdjustments}|${netShipping}|${actualTaxTotal}|${grandTotal}|${lineSnapshots.map((l) => `${l.lineId}:${l.grossAmountMinor}:${l.allocatedAdjustmentMinor}:${l.taxAmountMinor}`).join(';')}`
  const pricingHash = `sha256:${createHash('sha256').update(payloadToHash).digest('hex')}`

  return {
    subtotalMinor: subtotal.toString(),
    adjustmentsTotalMinor: totalAdjustments.toString(),
    shippingAmountMinor: rawShipping.toString(),
    shippingAdjustmentMinor: rawShippingAdj.toString(),
    netShippingMinor: netShipping.toString(),
    taxTotalMinor: actualTaxTotal.toString(),
    grandTotalMinor: grandTotal.toString(),
    currency,
    lines: lineSnapshots,
    adjustments: allAdjustments,
    ruleVersion: PRICING_RULE_VERSION,
    calculatedAt,
    pricingHash,
  }
}
