import type { Payload, Where } from 'payload'
import { reportableAnalyticsRows } from './reporting'
import { isRegisteredCollection } from '../public/registered-collections'

type Row = Record<string, unknown>
const object = (value: unknown): Row => (value && typeof value === 'object' ? (value as Row) : {})

/** Explicit offset timestamps prevent server-local timezone and inclusive-end ambiguity. */
export function reportWindow(params: URLSearchParams, now = new Date()) {
  const parse = (key: string, fallback: Date) => {
    const value = params.get(key)
    if (!value) return fallback.toISOString()
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
      !Number.isFinite(Date.parse(value))
    )
      throw new Error('Dates require ISO timestamps with an explicit timezone offset.')
    return new Date(value).toISOString()
  }
  const end = parse('endDate', now)
  const start = parse('startDate', new Date(Date.parse(end) - 30 * 86400000))
  if (start >= end) throw new Error('startDate must precede endDate.')
  return { start, end, timezone: 'UTC', boundaries: '[start, end)' }
}

export function campaignParameters(path: string) {
  const url = new URL(path, 'https://analytics.invalid')
  const utm: Record<string, string> = {}
  for (const key of ['utm_campaign', 'utm_source', 'utm_medium']) {
    const value = url.searchParams.get(key)
    // Campaign labels only, never retain arbitrary query strings, email addresses or URLs.
    if (value && /^[a-zA-Z0-9_.-]{1,100}$/.test(value)) utm[key] = value
  }
  return utm
}

export async function reportRows(
  payload: Payload,
  collection: string,
  siteId: string,
  where: Where = {},
) {
  if (!isRegisteredCollection(payload, collection)) return []
  const result = await payload.find({
    collection: collection as never,
    where: {
      and: [
        { [collection === 'discussion-posts' ? 'discussion.site' : 'site']: { equals: siteId } },
        where,
      ],
    },
    pagination: false,
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  return result.docs as unknown as Row[]
}

const paidStates = new Set(['paid', 'fulfilling', 'fulfilled'])
export function paidOrder(row: Row) {
  return (
    paidStates.has(String(row.state)) &&
    Boolean(object(row.receipt).receiptNumber) &&
    /^\d+$/.test(String(row.amountMinor)) &&
    /^[A-Z]{3}$/.test(String(row.currency))
  )
}

export function summarizeOperatorEvents(events: Row[], orders: Row[]) {
  const eligibleOrders = orders.filter(paidOrder)
  const byId = new Map(eligibleOrders.map((row) => [String(row.id), row]))
  const currencies = new Map<string, { amount: bigint; count: number }>()
  for (const row of eligibleOrders) {
    const currency = String(row.currency)
    const item = currencies.get(currency) ?? { amount: 0n, count: 0 }
    item.amount += BigInt(String(row.amountMinor))
    item.count++
    currencies.set(currency, item)
  }
  const financialSummary = [...currencies].map(([currency, item]) => ({
    currency,
    grossMinor: String(item.amount),
    grossFormatted: `${item.amount} minor units`,
    feeFormatted: 'Unknown',
    netFormatted: 'Unknown',
    reconciledMinor: String(item.amount),
    unreconciledMinor: '0',
    providerReportedMinor: '0',
    estimatedMinor: '0',
    orderCount: item.count,
    reconciliationRatePct: 100,
  }))
  const subjects = (rows: Row[]) =>
    new Set(rows.map((row) => row.anonymousHash).filter(Boolean)).size
  const campaignOf = (row: Row) => String(object(object(row.context).utm).utm_campaign ?? '')
  const touches = events.filter((row) => row.eventType === 'page_view' && campaignOf(row))
  const conversions = events.filter(
    (row) =>
      row.trusted === true && ['form_submit', 'payment_completed'].includes(String(row.eventType)),
  )
  const attributed = new Map<string, { event: Row; first: Row; last: Row; order?: Row }>()
  for (const event of conversions) {
    const source = String(object(event.context).sourceEventId ?? '')
    const order =
      event.eventType === 'payment_completed'
        ? byId.get(String(object(event.properties).canonicalOutcomeId))
        : undefined
    if (event.eventType === 'payment_completed' && (!order || source !== `orders:${order.id}`))
      continue
    if (!source) continue
    const journey = touches
      .filter(
        (touch) =>
          touch.anonymousHash === event.anonymousHash &&
          String(touch.occurredAt) <= String(event.occurredAt),
      )
      .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)))
    if (journey.length && !attributed.has(source))
      attributed.set(source, { event, first: journey[0], last: journey[journey.length - 1], order })
  }
  const campaignFunnels = [...new Set(touches.map(campaignOf))].map((campaign) => {
    const landings = touches.filter((row) => campaignOf(row) === campaign)
    const credited = [...attributed.values()].filter((row) => campaignOf(row.last) === campaign)
    const amounts: Record<string, string> = {}
    for (const row of credited)
      if (row.order) {
        const currency = String(row.order.currency)
        amounts[currency] = String(
          BigInt(amounts[currency] ?? '0') + BigInt(String(row.order.amountMinor)),
        )
      }
    const convertedSubjects = subjects(credited.map((row) => row.event))
    const uniqueLandings = subjects(landings)
    return {
      campaign,
      impressions: landings.length,
      landings: landings.length,
      uniqueVisitors: uniqueLandings,
      engagements: events.filter(
        (row) =>
          ['read_depth', 'click_internal'].includes(String(row.eventType)) &&
          landings.some(
            (touch) =>
              touch.anonymousHash === row.anonymousHash &&
              String(touch.occurredAt) <= String(row.occurredAt),
          ),
      ).length,
      conversions: credited.length,
      convertedSubjects,
      conversionRate: uniqueLandings
        ? ((100 * convertedSubjects) / uniqueLandings).toFixed(1)
        : null,
      disclosedLinksCount: landings.length,
      conversionAmounts: amounts,
      channelsBreakdown: Object.fromEntries(
        [
          ...new Set(
            landings.map((row) => String(object(object(row.context).utm).utm_medium ?? 'unknown')),
          ),
        ].map((channel) => [
          channel,
          landings.filter(
            (row) => String(object(object(row.context).utm).utm_medium ?? 'unknown') === channel,
          ).length,
        ]),
      ),
      attributionSample: null,
      attribution: credited.map((row) => ({
        source: object(row.event.context).sourceEventId,
        firstTouch: campaignOf(row.first),
        lastNonDirect: campaignOf(row.last),
      })),
    }
  })
  return {
    financialSummary,
    campaignFunnels,
    unattributedConversions: conversions.length - attributed.size,
  }
}

export async function loadOperatorReport(
  payload: Payload,
  siteId: string,
  window: ReturnType<typeof reportWindow>,
) {
  const between = (field: string): Where => ({
    and: [
      { [field]: { greater_than_equal: window.start } },
      { [field]: { less_than: window.end } },
    ],
  })
  const [raw, orders, submissions, subscribers, posts, discussions] = await Promise.all([
    reportRows(payload, 'analytics-events', siteId, {
      and: [
        between('occurredAt'),
        { retentionExpiresAt: { greater_than: new Date().toISOString() } },
      ],
    }),
    reportRows(payload, 'orders', siteId, between('createdAt')),
    reportRows(payload, 'form-submissions', siteId, between('createdAt')),
    reportRows(payload, 'subscribers', siteId, between('createdAt')),
    reportRows(payload, 'discussion-posts', siteId, between('createdAt')),
    reportRows(payload, 'discussions', siteId, between('createdAt')),
  ])
  const events = await reportableAnalyticsRows(payload, siteId, raw)
  const verified: Row[] = []
  for (const row of events) {
    if (row.eventType === 'form_submit') {
      const source = String(object(row.properties).canonicalOutcomeId ?? '')
      if (!submissions.some((submission) => String(submission.id) === source)) continue
    }
    verified.push(row)
  }
  const content = new Map<string, number>()
  for (const event of verified.filter((row) => row.eventType === 'page_view')) {
    const path = String(object(event.context).path ?? '/')
    content.set(path, (content.get(path) ?? 0) + 1)
  }
  return {
    sourceStatus: Object.fromEntries(
      [
        'analytics-events',
        'orders',
        'form-submissions',
        'subscribers',
        'discussion-posts',
        'discussions',
      ].map((collection) => [
        collection,
        isRegisteredCollection(payload, collection) ? 'available' : 'unavailable: module disabled',
      ]),
    ),
    ...summarizeOperatorEvents(verified, orders),
    events: verified,
    sourceFreshnessByCollection: Object.fromEntries(
      [
        ['analytics-events', verified],
        ['orders', orders],
        ['form-submissions', submissions],
        ['subscribers', subscribers],
        ['discussion-posts', posts],
        ['discussions', discussions],
      ].map(([collection, rows]) => {
        const records = rows as Row[]
        return [
          String(collection),
          {
            recordsInWindow: records.length,
            latestTimestamp:
              records
                .map((row) => String(row.receivedAt ?? row.createdAt ?? ''))
                .sort()
                .at(-1) ?? null,
          },
        ]
      }),
    ),
    domainMetrics: {
      acquisition: Object.fromEntries(
        [
          ...new Set(
            verified
              .filter((row) => row.eventType === 'page_view')
              .map((row) =>
                String(object(object(row.context).utm).utm_source ?? 'direct-or-unknown'),
              ),
          ),
        ].map((source) => [
          source,
          verified.filter(
            (row) =>
              row.eventType === 'page_view' &&
              String(object(object(row.context).utm).utm_source ?? 'direct-or-unknown') === source,
          ).length,
        ]),
      ),
      contentViews: [...content].map(([path, views]) => ({ path, views })),
      audience: { newSubscribers: subscribers.length, formSubmissions: submissions.length },
      community: { newPosts: posts.length, newDiscussions: discussions.length },
      commerce: { createdOrders: orders.length, paidOrders: orders.filter(paidOrder).length },
    },
    definitions: {
      window:
        'UTC instants, start inclusive and end exclusive; canonical outcomes by creation time.',
      unique:
        'Distinct current-consent site subject hashes, never people, email or member identities.',
      attribution:
        'Within selected window, same consent subject and earlier observed campaign landing; last non-direct credit, first-touch comparison. Labels are self-reported, not proof of an external dispatch or causation. One canonical outcome counts once.',
      finance:
        'Paid/fulfilling/fulfilled orders with receipt; gross presentment amountMinor by currency. No snapshot addition, FX, provider payout, fees or net claim; refunds excluded.',
      freshness: 'Latest eligible receivedAt in selected window; not a pipeline uptime guarantee.',
      uncertainty:
        'Unconsented, withdrawn, expired, blocked and unlinked traffic is unknown. No identity inference. Empty arrays mean no eligible records in this window.',
    },
  }
}
