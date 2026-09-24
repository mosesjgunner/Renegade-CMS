import { createHash } from 'node:crypto'

export type BillingInterval = 'week' | 'month' | 'year'
export type SubscriptionState =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'grace'
  | 'paused'
  | 'cancel_at_period_end'
  | 'canceled'
  | 'expired'
  | 'incomplete_expired'
export type PlanRevision = Readonly<{
  id: string
  planKey: string
  revision: number
  publishedAt: string
  lifecycle: 'published' | 'retired'
  interval: BillingInterval
  intervalCount: number
  amountMinor: string
  currency: string
  trialDays: number
  trialEligibility: 'once_per_customer' | 'unrestricted' | 'none'
  entitlements: readonly EntitlementSpec[]
  cancelPolicy: 'immediate' | 'period_end'
  changePolicy: 'immediate' | 'period_end'
  taxPolicy: 'provider' | 'inclusive' | 'exclusive'
  providerMappings: Readonly<Record<string, string>>
}>
export type EntitlementSpec = Readonly<{
  resource: string
  capability: string
  siteId: string
  scope?: string
  term: 'subscription' | 'fixed'
  durationSeconds?: number
  limit?: number
}>
export type Subscription = Readonly<{
  id: string
  customerId: string
  siteId: string
  plan: PlanRevision
  provider: Readonly<{
    key: string
    customerRef?: string
    subscriptionRef?: string
    status?: string
  }>
  state: SubscriptionState
  source: 'provider' | 'complimentary' | 'migration'
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd?: string
  graceEnd?: string
  createdAt: string
  updatedAt: string
  version: number
  lastEventSequence?: number
  lastEventOccurredAt?: string
}>
export type SubscriptionEvent = Readonly<{
  id: string
  subscriptionId: string
  providerEventId?: string
  kind:
    | 'trial_started'
    | 'activated'
    | 'invoice_paid'
    | 'invoice_failed'
    | 'cancel_scheduled'
    | 'canceled'
    | 'resumed'
    | 'changed'
    | 'payment_review'
    | 'payment_refunded'
    | 'refund_recorded'
    | 'grace_expired'
    | 'reconciled'
  occurredAt: string
  sequence?: number
  evidence?: Readonly<Record<string, unknown>>
}>
export type EntitlementGrant = Readonly<{
  id: string
  subjectId: string
  sourceId: string
  resource: string
  capability: string
  siteId: string
  scope?: string
  startsAt: string
  endsAt?: string
  limit?: number
  evidence: Readonly<Record<string, unknown>>
  revokedAt?: string
}>

export function publishPlan(
  input: Omit<PlanRevision, 'id' | 'revision' | 'publishedAt' | 'lifecycle'> & {
    publishedAt: string
  },
  prior: readonly PlanRevision[] = [],
): PlanRevision {
  if (!/^[A-Z]{3}$/.test(input.currency) || !/^(0|[1-9][0-9]*)$/.test(input.amountMinor))
    throw new Error('Plan money must use ISO currency and integer minor units.')
  if (
    !Number.isInteger(input.intervalCount) ||
    input.intervalCount < 1 ||
    !Number.isInteger(input.trialDays) ||
    input.trialDays < 0
  )
    throw new Error('Invalid interval or trial.')
  for (const entitlement of input.entitlements) {
    if (!entitlement.resource || !entitlement.capability || !entitlement.siteId)
      throw new Error('Entitlements require resource, capability, and site scope.')
    if (
      entitlement.limit !== undefined &&
      (!Number.isInteger(entitlement.limit) || entitlement.limit < 0)
    )
      throw new Error('Entitlement limits must be non-negative integers.')
    if (
      entitlement.term === 'fixed' &&
      (!Number.isInteger(entitlement.durationSeconds) || Number(entitlement.durationSeconds) < 1)
    )
      throw new Error('Fixed-term entitlements require a positive durationSeconds.')
  }
  const revision =
    Math.max(0, ...prior.filter((p) => p.planKey === input.planKey).map((p) => p.revision)) + 1
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16)
  return Object.freeze({
    ...input,
    entitlements: Object.freeze(input.entitlements.map((e) => Object.freeze({ ...e }))),
    providerMappings: Object.freeze({ ...input.providerMappings }),
    id: `${input.planKey}:r${revision}:${fingerprint}`,
    revision,
    lifecycle: 'published',
  })
}

const activeStates: SubscriptionState[] = [
  'trialing',
  'active',
  'past_due',
  'grace',
  'cancel_at_period_end',
]
export function subscriptionGrantsAccess(s: Subscription, now: string): boolean {
  const effectiveEnd = s.state === 'grace' ? s.graceEnd : s.currentPeriodEnd
  return (
    activeStates.includes(s.state) &&
    s.currentPeriodStart <= now &&
    Boolean(effectiveEnd && effectiveEnd > now)
  )
}
export function grantsFromSubscription(s: Subscription): EntitlementGrant[] {
  if (!activeStates.includes(s.state)) return []
  return s.plan.entitlements.map((e) => {
    const startsAt = e.term === 'fixed' ? s.createdAt : s.currentPeriodStart
    const endsAt =
      e.term === 'fixed'
        ? new Date(Date.parse(startsAt) + Number(e.durationSeconds) * 1000).toISOString()
        : s.state === 'grace'
          ? s.graceEnd
          : s.currentPeriodEnd
    return {
      id: `subscription:${s.id}:${e.siteId}:${e.scope ?? ''}:${e.resource}:${e.capability}`,
      subjectId: s.customerId,
      sourceId: s.id,
      resource: e.resource,
      capability: e.capability,
      siteId: e.siteId,
      ...(e.scope ? { scope: e.scope } : {}),
      startsAt,
      endsAt,
      ...(e.limit !== undefined ? { limit: e.limit } : {}),
      evidence: {
        planRevisionId: s.plan.id,
        currency: s.plan.currency,
        subscriptionVersion: s.version,
        provider: s.provider.key,
      },
    }
  })
}
export function applySubscriptionEvent(s: Subscription, event: SubscriptionEvent): Subscription {
  if (event.subscriptionId !== s.id) throw new Error('Event belongs to another subscription.')
  if (
    (event.sequence !== undefined &&
      s.lastEventSequence !== undefined &&
      event.sequence < s.lastEventSequence) ||
    (s.lastEventOccurredAt && event.occurredAt < s.lastEventOccurredAt)
  )
    return s
  const state: SubscriptionState =
    event.kind === 'trial_started'
      ? 'trialing'
      : event.kind === 'activated' || event.kind === 'invoice_paid' || event.kind === 'resumed'
        ? 'active'
        : event.kind === 'invoice_failed'
          ? 'past_due'
          : event.kind === 'cancel_scheduled'
            ? 'cancel_at_period_end'
            : event.kind === 'payment_review' || event.kind === 'payment_refunded'
              ? 'paused'
              : event.kind === 'canceled' || event.kind === 'grace_expired'
                ? 'canceled'
                : s.state
  return Object.freeze({
    ...s,
    state,
    cancelAtPeriodEnd: state === 'cancel_at_period_end',
    updatedAt: event.occurredAt,
    version: s.version + 1,
    lastEventOccurredAt: event.occurredAt,
    ...(event.sequence !== undefined ? { lastEventSequence: event.sequence } : {}),
  })
}
export function acceptSubscriptionEvent(
  seen: readonly string[],
  event: SubscriptionEvent,
): readonly string[] {
  const key = event.providerEventId ?? event.id
  return seen.includes(key) ? seen : [...seen, key]
}
export function visibleProration(
  providerPreview: { amountMinor: string; currency: string; expiresAt: string } | null,
): { amountMinor: string; currency: string; expiresAt: string } | null {
  return providerPreview
}

/** Currency-separated operational metrics. No total is ever formed across currencies. */
export function subscriptionMetrics(
  subscriptions: readonly Subscription[],
  entitlements: readonly EntitlementGrant[],
  now: string,
) {
  const currencies = new Set(subscriptions.map((s) => s.plan.currency))
  return [...currencies].sort().map((currency) => {
    const matching = subscriptions.filter((s) => s.plan.currency === currency)
    let mrrMinor = 0n
    for (const s of matching)
      if (['trialing', 'active', 'past_due', 'grace', 'cancel_at_period_end'].includes(s.state)) {
        const amount = BigInt(s.plan.amountMinor)
        const periodsPerYear =
          s.plan.interval === 'week' ? 52n : s.plan.interval === 'year' ? 1n : 12n
        mrrMinor += (amount * periodsPerYear) / BigInt(s.plan.intervalCount) / 12n
      }
    return {
      currency,
      subscriptions: matching.length,
      active: matching.filter(
        (s) =>
          ['trialing', 'active', 'cancel_at_period_end'].includes(s.state) &&
          subscriptionGrantsAccess(s, now),
      ).length,
      dunning: matching.filter((s) => ['past_due', 'grace'].includes(s.state)).length,
      recurringRevenueMonthlyMinor: mrrMinor.toString(),
      activeEntitlements: entitlements.filter(
        (g) =>
          g.evidence.planRevisionId &&
          g.evidence.currency === currency &&
          !g.revokedAt &&
          g.startsAt <= now &&
          (!g.endsAt || g.endsAt > now),
      ).length,
    }
  })
}
