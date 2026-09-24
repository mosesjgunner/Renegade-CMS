import type {
  NormalizedPodEvent,
  PodLineFulfillment,
  PodProviderState,
  PodProviderAdapter,
} from './pod-contract'
import type { PODJob, PodJobAuditRecord } from './fulfillment-plan'

export const ALLOWED_CARRIER_HOSTNAMES: readonly string[] = [
  'tools.usps.com',
  'www.ups.com',
  'ups.com',
  'www.fedex.com',
  'fedex.com',
  'www.dhl.com',
  'dhl.com',
  'tracking.printful.com',
  'www.printful.com',
  'parcelsapp.com',
  'www.parcelsapp.com',
  '17track.net',
  'www.17track.net',
]

/**
 * Validates and sanitizes carrier tracking URLs against injection attacks.
 * Rejects javascript:, data:, cleartext http:, and unapproved hosts.
 */
export function sanitizeTrackingUrl(
  rawUrl?: string,
  carrier?: string,
  trackingNumber?: string,
): string | undefined {
  if (!rawUrl && !trackingNumber) return undefined

  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) {
        const hostname = parsed.hostname.toLowerCase()
        if (ALLOWED_CARRIER_HOSTNAMES.includes(hostname)) {
          return parsed.toString()
        }
      }
    } catch {
      // Invalid URL syntax, fall through to safe carrier URL builder
    }
  }

  // Construct safe standard URL if trackingNumber is present
  if (trackingNumber && /^[A-Za-z0-9_-]{5,50}$/.test(trackingNumber.trim())) {
    const cleanNum = trackingNumber.trim()
    const cleanCarrier = (carrier ?? '').toLowerCase().trim()
    if (cleanCarrier.includes('usps')) {
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(cleanNum)}`
    }
    if (cleanCarrier.includes('ups')) {
      return `https://www.ups.com/track?tracknum=${encodeURIComponent(cleanNum)}`
    }
    if (cleanCarrier.includes('fedex')) {
      return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(cleanNum)}`
    }
    if (cleanCarrier.includes('dhl')) {
      return `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(cleanNum)}`
    }
    return `https://parcelsapp.com/en/tracking/${encodeURIComponent(cleanNum)}`
  }

  return undefined
}

const STATE_FORWARD_ORDER: Record<PodProviderState, number> = {
  created: 0,
  on_hold: 0,
  submitting: 1,
  submitted: 2,
  in_production: 3,
  partially_shipped: 4,
  shipped: 5,
  delivered: 6,
  cancelled: 10,
  failed: 10,
  exception: 10,
  returned: 10,
}

/**
 * Pure reducer applying normalized POD events to a PODJob.
 * Enforces forward state monotonicity, absorbs out-of-order events,
 * tracks partial shipments, and sanitizes tracking URLs.
 */
export function applyNormalizedPodEvent(
  job: PODJob,
  event: NormalizedPodEvent,
  now = new Date().toISOString(),
): PODJob {
  // Check if this event was already processed
  const alreadyProcessed = job.auditTrail.some(
    (audit) => audit.details?.providerEventId === event.providerEventId,
  )
  if (alreadyProcessed) {
    return job
  }

  // Map incoming kind to PodProviderState
  let targetState: PodProviderState
  switch (event.kind) {
    case 'order_created':
      targetState = 'submitted'
      break
    case 'in_production':
      targetState = 'in_production'
      break
    case 'partially_shipped':
      targetState = 'partially_shipped'
      break
    case 'shipped':
      targetState = 'shipped'
      break
    case 'delivered':
      targetState = 'delivered'
      break
    case 'cancelled':
      targetState = 'cancelled'
      break
    case 'failed':
      targetState = 'failed'
      break
    case 'returned':
      targetState = 'returned'
      break
    default:
      targetState = job.state
  }

  // Enforce monotonicity: Do not regress if event arrived out-of-order
  const currentRank = STATE_FORWARD_ORDER[job.state] ?? 0
  const targetRank = STATE_FORWARD_ORDER[targetState] ?? 0

  let finalState: PodProviderState = job.state
  if (['cancelled', 'failed', 'returned', 'exception'].includes(job.state)) {
    // Terminal state cannot be overwritten by earlier lifecycle events
    finalState = job.state
  } else if (['cancelled', 'failed', 'returned'].includes(targetState)) {
    finalState = targetState
  } else if (targetRank > currentRank) {
    finalState = targetState
  }

  // Merge fulfillments
  const existingFulfillments: PodLineFulfillment[] = (job as any).fulfillments ?? []
  const newFulfillments = [...existingFulfillments]

  if (event.fulfillments && event.fulfillments.length > 0) {
    for (const incoming of event.fulfillments) {
      const idx = newFulfillments.findIndex((f) => f.fulfillmentId === incoming.fulfillmentId)
      const sanitizedFulfillment: PodLineFulfillment = {
        ...incoming,
        trackingUrl: sanitizeTrackingUrl(
          incoming.trackingUrl,
          incoming.carrier,
          incoming.trackingNumber,
        ),
      }
      if (idx >= 0) {
        newFulfillments[idx] = sanitizedFulfillment
      } else {
        newFulfillments.push(sanitizedFulfillment)
      }
    }
  } else if (event.tracking) {
    // Single tracking without explicit fulfillment ID
    const sanitizedUrl = sanitizeTrackingUrl(
      event.tracking.trackingUrl,
      event.tracking.carrier,
      event.tracking.trackingNumber,
    )
    newFulfillments.push({
      fulfillmentId: `ful_${event.providerEventId}`,
      status: finalState === 'delivered' ? 'delivered' : 'shipped',
      lineIndices: job.itemsSnapshot.map((_, i) => i),
      carrier: event.tracking.carrier,
      trackingNumber: event.tracking.trackingNumber,
      trackingUrl: sanitizedUrl,
      shippedAt: event.occurredAt,
    })
  }

  // Determine if all lines are shipped
  if (finalState === 'partially_shipped' && newFulfillments.length > 0) {
    const allLines = new Set(job.itemsSnapshot.map((_, i) => i))
    const shippedLines = new Set<number>()
    for (const f of newFulfillments) {
      if (f.status === 'shipped' || f.status === 'delivered') {
        for (const lineIdx of f.lineIndices) shippedLines.add(lineIdx)
      }
    }
    if (shippedLines.size >= allLines.size) {
      finalState = 'shipped'
    }
  }

  const newAudit: PodJobAuditRecord = {
    timestamp: now,
    action: `event_${event.kind}`,
    actor: `provider:${event.providerKey}`,
    previousState: job.state,
    newState: finalState,
    details: {
      providerEventId: event.providerEventId,
      externalOrderId: event.externalOrderId,
      kind: event.kind,
      reason: event.reason,
      fulfillmentsCount: newFulfillments.length,
    },
  }

  return {
    ...job,
    state: finalState,
    externalOrderId: job.externalOrderId || event.externalOrderId,
    auditTrail: [...job.auditTrail, newAudit],
    updatedAt: now,
    ...(newFulfillments.length ? { fulfillments: newFulfillments } : {}),
  } as PODJob
}

/**
 * Actively reconciles a PODJob by polling the provider adapter.
 */
export async function reconcilePodJobWithProvider(
  job: PODJob,
  adapter: PodProviderAdapter,
  now = new Date().toISOString(),
): Promise<PODJob> {
  if (!job.externalOrderId) {
    return { ...job, lastReconciledAt: now }
  }

  const orderResult = await adapter.getOrder(job.externalOrderId)

  let eventKind: NormalizedPodEvent['kind'] = 'order_created'
  if (orderResult.state === 'in_production') eventKind = 'in_production'
  else if (orderResult.state === 'partially_shipped') eventKind = 'partially_shipped'
  else if (orderResult.state === 'shipped') eventKind = 'shipped'
  else if (orderResult.state === 'delivered') eventKind = 'delivered'
  else if (orderResult.state === 'cancelled') eventKind = 'cancelled'
  else if (orderResult.state === 'failed') eventKind = 'failed'
  else if (orderResult.state === 'returned') eventKind = 'returned'

  const normalizedEvent: NormalizedPodEvent = {
    providerEventId: `poll_${job.externalOrderId}_${Date.now()}`,
    providerKey: adapter.key,
    externalOrderId: job.externalOrderId,
    kind: eventKind,
    occurredAt: orderResult.updatedAt ?? now,
    fulfillments: orderResult.fulfillments,
    rawEvidence: orderResult as unknown as Record<string, unknown>,
  }

  const reconciled = applyNormalizedPodEvent(job, normalizedEvent, now)
  return { ...reconciled, lastReconciledAt: now }
}
