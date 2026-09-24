import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NormalizedPaymentEvent, ProviderPaymentState } from './payment-provider'

export type PaymentAttemptSnapshot = Readonly<{
  id: string
  checkoutSessionId: string
  proposalId: string
  customerKey: string
  siteId: string
  amountMinor: string
  currency: string
  attempt: number
  state: ProviderPaymentState
  providerReference?: string
  providerPaymentReference?: string
  refundedAmountMinor: string
  lastProviderSequence?: number
  processedEventIds: readonly string[]
}>

export function checkoutBindingKey(input: {
  proposalId: string
  customerKey: string
  siteId: string
  amountMinor: string
  currency: string
  attempt: number
}): string {
  if (!/^[1-9][0-9]*$/.test(input.amountMinor) || !/^[A-Z]{3}$/.test(input.currency))
    throw new Error('Invalid checkout money binding.')
  return createHmac('sha256', 'renegade-checkout-binding-v1')
    .update(
      [
        input.siteId,
        input.proposalId,
        input.customerKey,
        input.currency,
        input.amountMinor,
        input.attempt,
      ].join('\0'),
    )
    .digest('hex')
}

const terminalStates: readonly ProviderPaymentState[] = [
  'failed',
  'cancelled',
  'refunded',
  'disputed',
]

/** Pure replay/out-of-order reducer. Amount or currency disagreement becomes unknown and must reconcile. */
export function applyNormalizedPaymentEvent(
  attempt: PaymentAttemptSnapshot,
  event: NormalizedPaymentEvent,
): PaymentAttemptSnapshot {
  if (attempt.processedEventIds.includes(event.providerEventId)) return attempt
  if (event.providerReference !== attempt.providerReference)
    throw new Error('Provider event does not belong to this payment attempt.')
  const eventIds = [...attempt.processedEventIds, event.providerEventId]
  if (
    (event.kind === 'succeeded' &&
      event.amountMinor &&
      event.amountMinor !== attempt.amountMinor) ||
    (event.currency && event.currency !== attempt.currency)
  )
    return { ...attempt, state: 'unknown', processedEventIds: eventIds }
  if (
    event.sequence !== undefined &&
    attempt.lastProviderSequence !== undefined &&
    event.sequence < attempt.lastProviderSequence
  )
    return { ...attempt, processedEventIds: eventIds }
  if (['failed', 'cancelled'].includes(attempt.state) && event.kind === 'succeeded')
    return { ...attempt, state: 'unknown', processedEventIds: eventIds }
  if (
    terminalStates.includes(attempt.state) &&
    ['succeeded', 'processing', 'action-required'].includes(event.kind)
  )
    return { ...attempt, processedEventIds: eventIds }
  const nextState: ProviderPaymentState = event.kind
  return {
    ...attempt,
    state: nextState,
    ...(event.providerPaymentReference
      ? { providerPaymentReference: event.providerPaymentReference }
      : {}),
    ...(event.sequence !== undefined ? { lastProviderSequence: event.sequence } : {}),
    processedEventIds: eventIds,
  }
}

export function previewRefund(input: {
  capturedAmountMinor: string
  alreadyRefundedAmountMinor: string
  requestedAmountMinor: string
  currency: string
  orderState: string
  dualControlThresholdMinor?: string
}) {
  for (const value of [
    input.capturedAmountMinor,
    input.alreadyRefundedAmountMinor,
    input.requestedAmountMinor,
  ])
    if (!/^(0|[1-9][0-9]*)$/.test(value))
      throw new Error('Refund values must use integer minor units.')
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('Refund currency is invalid.')
  if (!['paid', 'fulfilling', 'fulfilled', 'exception'].includes(input.orderState))
    throw new Error('The order is not refundable in its current state.')
  const captured = BigInt(input.capturedAmountMinor)
  const refunded = BigInt(input.alreadyRefundedAmountMinor)
  const requested = BigInt(input.requestedAmountMinor)
  const remaining = captured - refunded
  if (requested <= 0n || requested > remaining)
    throw new Error('Refund exceeds the refundable balance.')
  const after = refunded + requested
  return {
    requestedAmountMinor: requested.toString(),
    refundableBeforeMinor: remaining.toString(),
    refundedAfterMinor: after.toString(),
    remainingAfterMinor: (captured - after).toString(),
    outcome: after === captured ? ('full' as const) : ('partial' as const),
    requiresSecondApproval:
      input.dualControlThresholdMinor !== undefined &&
      requested >= BigInt(input.dualControlThresholdMinor),
  }
}

type GuestOrderClaims = {
  v: 1
  orderId: string
  checkoutSessionId: string
  siteId: string
  exp: number
}

export function signGuestOrderToken(claims: Omit<GuestOrderClaims, 'v'>, secret: string) {
  if (secret.length < 32)
    throw new Error('Guest order token secret must be at least 32 characters.')
  const encoded = Buffer.from(
    JSON.stringify({ v: 1, ...claims } satisfies GuestOrderClaims),
  ).toString('base64url')
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyGuestOrderToken(
  token: string,
  expected: { orderId: string; siteId: string },
  secret: string,
  now = Date.now(),
): GuestOrderClaims | null {
  const [encoded, signature, extra] = token.split('.')
  if (!encoded || !signature || extra) return null
  const expectedSignature = createHmac('sha256', secret).update(encoded).digest('base64url')
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  )
    return null
  try {
    const claims = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as GuestOrderClaims
    return claims.v === 1 &&
      claims.orderId === expected.orderId &&
      claims.siteId === expected.siteId &&
      claims.exp > now
      ? claims
      : null
  } catch {
    return null
  }
}

/** Audience-compatible transactional snapshot. It intentionally has no marketing consent semantics. */
export function receiptMessageSnapshot(input: {
  orderNumber: string
  receiptNumber: string
  recipientEmail: string
  amountMinor: string
  currency: string
  correctionOf?: string
}) {
  return {
    kind: 'transactional' as const,
    purpose: 'commerce-receipt' as const,
    category: 'transactional' as const,
    subject: input.correctionOf
      ? `Correction for receipt ${input.receiptNumber}`
      : `Receipt ${input.receiptNumber}`,
    recipient: input.recipientEmail,
    blocks: [
      {
        type: 'heading' as const,
        text: input.correctionOf ? 'Receipt correction' : 'Payment receipt',
      },
      {
        type: 'text' as const,
        text: `Order ${input.orderNumber}: ${input.amountMinor} ${input.currency}. Receipt ${input.receiptNumber}.`,
      },
    ],
    variables: {
      orderNumber: input.orderNumber,
      receiptNumber: input.receiptNumber,
      amountMinor: input.amountMinor,
      currency: input.currency,
      ...(input.correctionOf ? { correctionOf: input.correctionOf } : {}),
    },
    marketingConsentRequired: false as const,
  }
}

export function financeDashboardSummary(
  rows: readonly {
    state: ProviderPaymentState
    amountMinor: string
    currency: string
    createdAt: string
    reconciledAt?: string
  }[],
  now = Date.now(),
) {
  const totalsByCurrency: Record<string, Record<string, string>> = {}
  const counts: Record<string, number> = {}
  const oldestAgeMs: Record<string, number> = {}
  for (const row of rows) {
    counts[row.state] = (counts[row.state] ?? 0) + 1
    const currency = row.currency.toUpperCase()
    totalsByCurrency[currency] ??= {}
    totalsByCurrency[currency][row.state] = (
      BigInt(totalsByCurrency[currency][row.state] ?? '0') + BigInt(row.amountMinor)
    ).toString()
    const age = Math.max(0, now - Date.parse(row.createdAt))
    oldestAgeMs[row.state] = Math.max(oldestAgeMs[row.state] ?? 0, age)
  }
  return { counts, totalsMinorByCurrency: totalsByCurrency, oldestAgeMs }
}
