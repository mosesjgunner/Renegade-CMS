/* eslint-disable @typescript-eslint/no-explicit-any -- Payload collection documents are runtime-shaped. */
import { WEBHOOK_FAILURE_LIMIT } from './service'

/**
 * Delivery reconciliation: an operator-facing view that compares what the
 * subscription record claims with what the persisted delivery records prove.
 *
 * This is deliberately a different function from `reconcileProviderState`
 * (16A), which projects provider-connection health. This one reconciles
 * outbound webhook deliveries only, and every timestamp it reports comes
 * from an actually persisted delivery record — never from the subscription
 * row's own bookkeeping.
 */

export type WebhookReconciliationFindingCode =
  | 'dead-letter-awaiting-action'
  | 'subscription-disabled-with-pending'
  | 'failure-limit-without-disable'
  | 'stalled-deliveries'
  | 'no-deliveries-recorded'

export type WebhookReconciliationFinding = {
  code: WebhookReconciliationFindingCode
  severity: 'critical' | 'warning' | 'info'
  message: string
  deliveryIds: string[]
}

export type WebhookSubscriptionReconciliation = {
  subscriptionId: string
  siteId: string | null
  target: string
  recordedStatus: string
  failureCount: number
  counts: { queued: number; retrying: number; delivered: number; deadLetter: number; total: number }
  totalAttempts: number
  /** Newest persisted delivered record's completion time; null when nothing was ever delivered. */
  lastDeliveredAt: string | null
  /** Newest attempt time across deliveries that were actually attempted. */
  lastAttemptAt: string | null
  pending: number
  duePending: number
  findings: WebhookReconciliationFinding[]
  healthy: boolean
  reconciledAt: string
}

/** The dispatch task runs every 10 seconds; a due delivery untouched for 10 minutes means the worker is not draining the queue. */
export const WEBHOOK_STALL_THRESHOLD_MS = 10 * 60 * 1000

const relationId = (value: unknown) =>
  String(
    typeof value === 'object' && value ? ((value as { id?: unknown }).id ?? '') : (value ?? ''),
  )

const timeOf = (doc: Record<string, any>, field: string) => {
  const raw = doc[field]
  if (!raw) return null
  const ms = Date.parse(String(raw))
  return Number.isFinite(ms) ? ms : null
}

export function reconcileWebhookSubscription(input: {
  subscription: Record<string, any>
  deliveries: readonly Record<string, any>[]
  now?: Date
  stallAfterMs?: number
}): WebhookSubscriptionReconciliation {
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const stallAfterMs = input.stallAfterMs ?? WEBHOOK_STALL_THRESHOLD_MS
  const subscription = input.subscription
  const subscriptionId = String(subscription.id)
  const own = input.deliveries.filter((doc) => relationId(doc.subscription) === subscriptionId)

  const counts = { queued: 0, retrying: 0, delivered: 0, deadLetter: 0, total: own.length }
  let totalAttempts = 0
  let lastDeliveredMs: number | null = null
  let lastAttemptMs: number | null = null
  let duePending = 0
  const deadLetterIds: string[] = []
  const pendingIds: string[] = []
  const stalledIds: string[] = []

  for (const doc of own) {
    const state = String(doc.state)
    const attempts = Number(doc.attempts ?? 0)
    totalAttempts += attempts
    if (state === 'queued') counts.queued++
    else if (state === 'retrying') counts.retrying++
    else if (state === 'delivered') counts.delivered++
    else if (state === 'dead-letter') counts.deadLetter++

    const completedMs = timeOf(doc, 'updatedAt') ?? timeOf(doc, 'createdAt')
    if (state === 'delivered' && completedMs !== null)
      lastDeliveredMs =
        lastDeliveredMs === null ? completedMs : Math.max(lastDeliveredMs, completedMs)
    if (attempts > 0 && completedMs !== null)
      lastAttemptMs = lastAttemptMs === null ? completedMs : Math.max(lastAttemptMs, completedMs)

    if (state === 'dead-letter') deadLetterIds.push(String(doc.id))
    if (state === 'queued' || state === 'retrying') {
      pendingIds.push(String(doc.id))
      const dueMs = timeOf(doc, 'nextAttemptAt') ?? timeOf(doc, 'createdAt')
      if (dueMs === null || dueMs <= nowMs) {
        duePending++
        if (dueMs !== null && nowMs - dueMs > stallAfterMs) stalledIds.push(String(doc.id))
      }
    }
  }

  const recordedStatus = String(subscription.status ?? '')
  const failureCount = Number(subscription.failureCount ?? 0)
  const findings: WebhookReconciliationFinding[] = []

  if (deadLetterIds.length)
    findings.push({
      code: 'dead-letter-awaiting-action',
      severity: 'critical',
      message: `${deadLetterIds.length} ${deadLetterIds.length === 1 ? 'delivery' : 'deliveries'} exhausted bounded retries and reached dead-letter. Resolve the receiver, re-enable the subscription if needed, and redeliver manually.`,
      deliveryIds: deadLetterIds,
    })
  if (recordedStatus !== 'active' && pendingIds.length)
    findings.push({
      code: 'subscription-disabled-with-pending',
      severity: 'warning',
      message: `Subscription is ${recordedStatus || 'not active'} with ${pendingIds.length} pending ${pendingIds.length === 1 ? 'delivery' : 'deliveries'}; pending deliveries are not attempted while the subscription is disabled.`,
      deliveryIds: pendingIds,
    })
  if (recordedStatus === 'active' && failureCount >= WEBHOOK_FAILURE_LIMIT)
    findings.push({
      code: 'failure-limit-without-disable',
      severity: 'warning',
      message: `Recorded failure count ${failureCount} reached the limit (${WEBHOOK_FAILURE_LIMIT}) but the subscription is still active; the recorded counter and the delivery records disagree.`,
      deliveryIds: [],
    })
  if (stalledIds.length)
    findings.push({
      code: 'stalled-deliveries',
      severity: 'warning',
      message: `${stalledIds.length} due ${stalledIds.length === 1 ? 'delivery has' : 'deliveries have'} not been attempted within the stall threshold; the delivery worker may be down.`,
      deliveryIds: stalledIds,
    })
  if (own.length === 0)
    findings.push({
      code: 'no-deliveries-recorded',
      severity: 'info',
      message: 'No deliveries have been recorded for this subscription yet.',
      deliveryIds: [],
    })

  return {
    subscriptionId,
    siteId: subscription.site ? relationId(subscription.site) : null,
    target: String(subscription.target ?? ''),
    recordedStatus,
    failureCount,
    counts,
    totalAttempts,
    lastDeliveredAt: lastDeliveredMs === null ? null : new Date(lastDeliveredMs).toISOString(),
    lastAttemptAt: lastAttemptMs === null ? null : new Date(lastAttemptMs).toISOString(),
    pending: pendingIds.length,
    duePending,
    findings,
    healthy: !findings.some((finding) => finding.severity !== 'info'),
    reconciledAt: now.toISOString(),
  }
}

/** Reconcile many subscriptions against a shared delivery pool in one pass. */
export function reconcileWebhookSubscriptions(input: {
  subscriptions: readonly Record<string, any>[]
  deliveries: readonly Record<string, any>[]
  now?: Date
  stallAfterMs?: number
}): WebhookSubscriptionReconciliation[] {
  return input.subscriptions.map((subscription) =>
    reconcileWebhookSubscription({
      subscription,
      deliveries: input.deliveries,
      now: input.now,
      stallAfterMs: input.stallAfterMs,
    }),
  )
}
