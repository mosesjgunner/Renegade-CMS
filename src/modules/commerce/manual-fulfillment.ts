import { createHash } from 'node:crypto'
import type { PodRecipientAddress, PrintAreaType, PlacementBounds } from './pod-contract'
import type { PODJob } from './fulfillment-plan'
import { sanitizeTrackingUrl } from './pod-reconciliation'
import { signPrivatePrintAssetUrl } from './print-renditions'

export const MANUAL_FULFILLMENT_DISCLAIMER =
  'MANUAL FULFILLMENT QUEUE: This package requires explicit human physical fulfillment. NEVER IMPLY AUTOMATION: No third-party provider submission has been performed or implied.' as const

export type ManualFulfillmentStatus =
  | 'pending_acknowledgement'
  | 'acknowledged'
  | 'in_production'
  | 'shipped'
  | 'cancelled'

export type ManualArtworkSpec = Readonly<{
  area: PrintAreaType
  artworkId: string
  artworkHash: string
  placement: PlacementBounds
  downloadUrl: string
}>

export type ManualApprovedLine = Readonly<{
  lineId: string
  productId: string
  variantSku: string
  title: string
  quantity: number
  artworkSpecs: readonly ManualArtworkSpec[]
}>

export type ManualFulfillmentPackage = Readonly<{
  id: string
  orderId: string
  siteId: string
  packageIndex: number
  source:
    | 'explicit-manual-product'
    | 'pod-provider-fallback'
    | 'pod-submission-exhausted'
    | 'address-unsupported'
  status: ManualFulfillmentStatus
  approvedLines: readonly ManualApprovedLine[]
  permissionedAddressManifest: PodRecipientAddress
  instructions: string
  disclaimer: typeof MANUAL_FULFILLMENT_DISCLAIMER
  acknowledgement?: Readonly<{
    acknowledgedBy: string
    acknowledgedAt: string
    notes?: string
  }>
  externalFulfillment?: Readonly<{
    carrier: string
    trackingNumber: string
    trackingUrl?: string
    shippedAt: string
  }>
  auditTrail: readonly Readonly<{
    timestamp: string
    action: string
    actor: string
    details?: Readonly<Record<string, unknown>>
  }>[]
  createdAt: string
  updatedAt: string
}>

export function createManualFulfillmentPackage(input: {
  orderId: string
  siteId: string
  packageIndex: number
  source: ManualFulfillmentPackage['source']
  approvedLines: readonly ManualApprovedLine[]
  permissionedAddressManifest: PodRecipientAddress
  instructions?: string
  actor?: string
  now?: string
}): ManualFulfillmentPackage {
  const now = input.now ?? new Date().toISOString()
  const id = `man_pkg_${createHash('sha256').update(`${input.orderId}:${input.packageIndex}:${now}`).digest('hex').slice(0, 16)}`

  return {
    id,
    orderId: input.orderId,
    siteId: input.siteId,
    packageIndex: input.packageIndex,
    source: input.source,
    status: 'pending_acknowledgement',
    approvedLines: input.approvedLines,
    permissionedAddressManifest: input.permissionedAddressManifest,
    instructions:
      input.instructions ?? 'Produce and dispatch manually according to specifications.',
    disclaimer: MANUAL_FULFILLMENT_DISCLAIMER,
    auditTrail: [
      {
        timestamp: now,
        action: 'package_created',
        actor: input.actor ?? 'commerce_router',
        details: {
          source: input.source,
          linesCount: input.approvedLines.length,
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  }
}

export function acknowledgeManualFulfillmentPackage(
  pkg: ManualFulfillmentPackage,
  operator: string,
  notes?: string,
  now = new Date().toISOString(),
): ManualFulfillmentPackage {
  if (pkg.status !== 'pending_acknowledgement') {
    throw new Error(`Package is already in status "${pkg.status}", cannot re-acknowledge.`)
  }

  return {
    ...pkg,
    status: 'acknowledged',
    acknowledgement: {
      acknowledgedBy: operator,
      acknowledgedAt: now,
      notes,
    },
    auditTrail: [
      ...pkg.auditTrail,
      {
        timestamp: now,
        action: 'package_acknowledged',
        actor: operator,
        details: { notes },
      },
    ],
    updatedAt: now,
  }
}

export function markManualFulfillmentInProduction(
  pkg: ManualFulfillmentPackage,
  operator: string,
  now = new Date().toISOString(),
): ManualFulfillmentPackage {
  if (pkg.status !== 'acknowledged') {
    throw new Error(
      `Cannot enter production from status "${pkg.status}". Must be acknowledged first.`,
    )
  }

  return {
    ...pkg,
    status: 'in_production',
    auditTrail: [
      ...pkg.auditTrail,
      {
        timestamp: now,
        action: 'production_started',
        actor: operator,
      },
    ],
    updatedAt: now,
  }
}

export function shipManualFulfillmentPackage(
  pkg: ManualFulfillmentPackage,
  shipping: {
    carrier: string
    trackingNumber: string
    trackingUrl?: string
  },
  operator: string,
  now = new Date().toISOString(),
): ManualFulfillmentPackage {
  if (!['acknowledged', 'in_production'].includes(pkg.status)) {
    throw new Error(`Cannot ship package from status "${pkg.status}".`)
  }

  const sanitizedUrl = sanitizeTrackingUrl(
    shipping.trackingUrl,
    shipping.carrier,
    shipping.trackingNumber,
  )

  return {
    ...pkg,
    status: 'shipped',
    externalFulfillment: {
      carrier: shipping.carrier,
      trackingNumber: shipping.trackingNumber,
      trackingUrl: sanitizedUrl,
      shippedAt: now,
    },
    auditTrail: [
      ...pkg.auditTrail,
      {
        timestamp: now,
        action: 'package_shipped',
        actor: operator,
        details: {
          carrier: shipping.carrier,
          trackingNumber: shipping.trackingNumber,
          trackingUrl: sanitizedUrl,
        },
      },
    ],
    updatedAt: now,
  }
}

export function cancelManualFulfillmentPackage(
  pkg: ManualFulfillmentPackage,
  reason: string,
  operator: string,
  now = new Date().toISOString(),
): ManualFulfillmentPackage {
  if (pkg.status === 'shipped') {
    throw new Error('Cannot cancel package that has already shipped.')
  }

  return {
    ...pkg,
    status: 'cancelled',
    auditTrail: [
      ...pkg.auditTrail,
      {
        timestamp: now,
        action: 'package_cancelled',
        actor: operator,
        details: { reason },
      },
    ],
    updatedAt: now,
  }
}

/**
 * Converts a failed PODJob into an Explicit Manual Fulfillment Package.
 * Ensures the order does not slip through the cracks and clearly declares manual operator requirement.
 */
export function handoffFailedPodJobToManual(
  job: PODJob,
  failureReason: string,
  privateSigningSecret = 'renegade-manual-print-secret',
  operator = 'pod_supervisor',
  now = new Date().toISOString(),
): ManualFulfillmentPackage {
  const approvedLines: ManualApprovedLine[] = job.itemsSnapshot.map((item) => {
    const artworkSpecs: ManualArtworkSpec[] = (item.soldRenditions ?? []).map((r) => ({
      area: r.printArea,
      artworkId: r.renditionId,
      artworkHash: r.hash,
      placement: r.placement,
      downloadUrl: signPrivatePrintAssetUrl(
        {
          renditionId: r.renditionId,
          hash: r.hash,
          siteId: job.siteId,
          expiresAtEpochMs: Date.now() + 7 * 24 * 60 * 60 * 1000,
        },
        privateSigningSecret,
      ),
    }))

    return {
      lineId: item.lineId,
      productId: item.productId,
      variantSku: item.variantSku,
      title: item.title,
      quantity: item.quantity,
      artworkSpecs,
    }
  })

  return createManualFulfillmentPackage({
    orderId: job.orderId,
    siteId: job.siteId,
    packageIndex: job.packageIndex,
    source: 'pod-submission-exhausted',
    approvedLines,
    permissionedAddressManifest: job.recipientSnapshot,
    instructions: `AUTOMATIC POD HANDOFF: Provider ${job.providerKey} failed submission. Reason: ${failureReason}. Requires manual shop production.`,
    actor: operator,
    now,
  })
}
