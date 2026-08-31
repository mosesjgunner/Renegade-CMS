import { createHash } from 'node:crypto'

export const ANALYTICS_SCHEMA_VERSION = 1 as const
export const EVENT_TYPES = [
  'page_view',
  'session_started',
  'returning_visitor',
  'read_depth',
  'click_internal',
  'click_outbound',
  'site_search',
  'media_engagement',
  'event_view',
  'timeline_view',
  'timeline_filter',
  'event_source_click',
  'forum_view',
  'thread_view',
  'post_view',
  'forum_contribution',
  'signup',
  'form_submit',
  'follow',
  'social_outbound',
  'affiliate_click',
  'product_click',
  'support_click',
  'payment_completed',
  'download',
  'event_registration',
  'goal_completed',
  'editorial_promotion',
  'experiment_exposure',
  'experiment_conversion',
] as const
export type EventType = (typeof EVENT_TYPES)[number]
export type ConsentBasis = 'necessary' | 'analytics-consent' | 'server-trusted' | 'denied'
export type Identity = Readonly<{ anonymousId?: string; sessionId?: string; memberId?: string }>
export type EventContext = Readonly<{
  siteId: string
  brandId?: string
  contentId?: string
  campaignId?: string
  channel?: string
  referrer?: string
  utm?: Record<string, string>
  deviceClass?: 'desktop' | 'mobile' | 'tablet' | 'other'
  region?: string
  path?: string
  sourceEventId?: string
  provider?: string
  goal?: string
}>
export type FirstPartyEvent = Readonly<{
  id: string
  eventType: EventType
  occurredAt: string
  receivedAt: string
  identity: Identity
  context: EventContext
  consentBasis: ConsentBasis
  schemaVersion: number
  trusted: boolean
  dedupeKey: string
  properties?: Record<string, string | number | boolean | null>
}>
export type MetricSnapshot = Readonly<{
  id: string
  metric: string
  value: string
  definition: string
  provider?: string
  grain: 'event' | 'daily' | 'campaign' | 'order' | 'delivery'
  windowStart: string
  windowEnd: string
  processor?: string
  paymentRail?: string
  merchantRegion?: string
  buyerRegion?: string
  grossMinor?: string
  feeMinor?: string
  netMinor?: string
  presentmentCurrency?: string
  settlementCurrency?: string
  exchangeRateProvenance?: string
  reconciliationStatus: 'unreconciled' | 'reconciled' | 'provider-reported' | 'estimated'
}>
export const metricIsCompatible = (left: MetricSnapshot, right: MetricSnapshot) =>
  left.metric === right.metric &&
  left.definition === right.definition &&
  left.grain === right.grain &&
  left.presentmentCurrency === right.presentmentCurrency &&
  left.settlementCurrency === right.settlementCurrency &&
  left.processor === right.processor &&
  left.reconciliationStatus === right.reconciliationStatus
export const sumCompatibleMetricValues = (items: readonly MetricSnapshot[]) => {
  if (!items.length) return '0'
  if (!items.every((item) => metricIsCompatible(items[0], item)))
    throw new Error('Incompatible metric snapshots cannot be summed.')
  return items.reduce((sum, item) => sum + BigInt(item.value), 0n).toString()
}
export const eventDedupeKey = (event: Pick<FirstPartyEvent, 'id' | 'context' | 'eventType'>) =>
  event.context.sourceEventId
    ? `source:${event.context.sourceEventId}`
    : `event:${event.id}:${event.eventType}`
export const eventFingerprint = (
  event: Pick<FirstPartyEvent, 'eventType' | 'occurredAt' | 'identity' | 'context'>,
) => `sha256:${createHash('sha256').update(JSON.stringify(event)).digest('hex')}`
export const shouldCollect = (input: { consent: boolean; doNotTrack: boolean; trusted: boolean }) =>
  input.trusted || (input.consent && !input.doNotTrack)
export const isBotOrInternal = (input: { userAgent?: string; internal?: boolean }) =>
  Boolean(input.internal) || /bot|crawler|spider|headless|uptime/i.test(input.userAgent ?? '')
export function normalizeEvent(event: FirstPartyEvent): FirstPartyEvent | null {
  if (
    !shouldCollect({
      consent: event.consentBasis === 'analytics-consent',
      doNotTrack: event.consentBasis === 'denied',
      trusted: event.trusted,
    })
  )
    return null
  if (!EVENT_TYPES.includes(event.eventType)) throw new Error('Unknown event type.')
  if (event.schemaVersion !== ANALYTICS_SCHEMA_VERSION)
    throw new Error('Unsupported analytics event schema.')
  if (!event.context.siteId || !event.id || !event.occurredAt || !event.receivedAt)
    throw new Error('Event identity, site and timestamps are required.')
  return {
    ...event,
    // The database unique index is global, so make an otherwise identical browser retry
    // tenant-safe before persistence.
    dedupeKey: `${event.context.siteId}:${eventDedupeKey(event)}`,
    identity: { ...event.identity },
    context: { ...event.context, utm: event.context.utm ? { ...event.context.utm } : undefined },
  }
}
export type Attribution = Readonly<{
  model: 'first-touch' | 'last-non-direct'
  eventId: string
  channel: string
  path: readonly string[]
  uncertainty: string
}>
const direct = (channel?: string) => !channel || channel === 'direct'
export function attributePath(
  events: readonly FirstPartyEvent[],
  conversionEventId: string,
): Attribution[] {
  const conversion = events.find((event) => event.id === conversionEventId)
  if (!conversion) throw new Error('Conversion event is required for attribution.')
  const path = events
    .filter((event) => event.occurredAt <= conversion.occurredAt)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const channels = path.map((event) => event.context.channel ?? 'direct')
  const first = channels.find((channel) => !direct(channel)) ?? 'direct'
  const last = [...channels].reverse().find((channel) => !direct(channel)) ?? 'direct'
  const uncertainty =
    'First-party path only; provider-side conversions are credited only when a trusted provider event is present.'
  return [
    { model: 'first-touch', eventId: conversion.id, channel: first, path: channels, uncertainty },
    {
      model: 'last-non-direct',
      eventId: conversion.id,
      channel: last,
      path: channels,
      uncertainty,
    },
  ]
}
const goalMap: Partial<Record<EventType, string>> = {
  signup: 'newsletter-member-signup',
  payment_completed: 'one-time-contribution',
  affiliate_click: 'affiliate-click',
  product_click: 'product-purchase-known',
  download: 'download',
  event_registration: 'event-registration',
  form_submit: 'lead-contact-volunteer',
  support_click: 'recurring-support-start',
}
export const goalForEvent = (event: FirstPartyEvent): string | undefined =>
  goalMap[event.eventType] ?? event.context.goal
export const analyticsRetention = {
  rawDays: 90,
  rollupDays: 730,
  lateEventDays: 7,
  timezone: 'UTC',
  uniqueCount: 'daily salted anonymous/session hash; approximate across rollups',
} as const

export const CONSENT_CATEGORIES = ['necessary', 'analytics', 'personalization', 'marketing'] as const
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number]
export type ConsentChoices = Record<ConsentCategory, boolean>
export type PrivacyPolicy = Readonly<{
  analyticsEnabled: boolean
  consentVersion: string
  respectGlobalPrivacyControl: boolean
  respectDoNotTrack: boolean
  rawEventRetentionDays: number
  rollupRetentionDays: number
}>
export const defaultPrivacyPolicy: PrivacyPolicy = {
  analyticsEnabled: false,
  consentVersion: '2026-08-31',
  respectGlobalPrivacyControl: true,
  respectDoNotTrack: true,
  rawEventRetentionDays: 90,
  rollupRetentionDays: 730,
}
export const necessaryOnlyChoices = (): ConsentChoices => ({
  necessary: true, analytics: false, personalization: false, marketing: false,
})
export const normalizeConsentChoices = (value: Partial<ConsentChoices> | undefined): ConsentChoices => ({
  necessary: true,
  analytics: value?.analytics === true,
  personalization: value?.personalization === true,
  marketing: value?.marketing === true,
})
export const analyticsAllowed = (input: {
  choices: ConsentChoices
  policy: PrivacyPolicy
  globalPrivacyControl?: boolean
  doNotTrack?: boolean
}) =>
  input.policy.analyticsEnabled &&
  input.choices.analytics &&
  !(input.policy.respectGlobalPrivacyControl && input.globalPrivacyControl) &&
  !(input.policy.respectDoNotTrack && input.doNotTrack)

/** Retention works on received time and never removes a legal/audit consent record. */
export const expiredAnalyticsRecordIds = <T extends { id: string; receivedAt?: string; occurredAt: string }>(
  records: readonly T[], now: Date, retentionDays: number,
) => records.filter((record) => now.getTime() - new Date(record.receivedAt ?? record.occurredAt).getTime() >= retentionDays * 86_400_000).map(({ id }) => id)

/** Rollup workers process a bounded window of deduplicated events, never a historical raw-event scan. */
export function rollupEvents(
  events: readonly FirstPartyEvent[],
  windowStart: string,
  windowEnd: string,
) {
  const unique = new Map(
    events
      .filter((event) => event.occurredAt >= windowStart && event.occurredAt < windowEnd)
      .map((event) => [event.dedupeKey, event]),
  )
  const byMetric = new Map<string, number>()
  for (const event of unique.values()) {
    const metric = goalForEvent(event) ? `goal:${goalForEvent(event)}` : event.eventType
    byMetric.set(metric, (byMetric.get(metric) ?? 0) + 1)
  }
  return [...byMetric].map(([metric, value]) => ({
    metric,
    value: String(value),
    windowStart,
    windowEnd,
    sourceEventCount: unique.size,
  }))
}
