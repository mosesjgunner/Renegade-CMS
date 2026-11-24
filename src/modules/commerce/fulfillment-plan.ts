import { createHash } from 'node:crypto'
import type { PodRecipientAddress, PodProviderState } from './pod-contract'
import type { DetailedPodMapping } from './pod-mapping'
import type { SoldPrintRenditionSnapshot } from './print-renditions'
import type { PodConnectionRecord } from './pod-connection'

export type FulfillmentLineItem = Readonly<{
  lineId: string
  productId: string
  variantSku: string
  title: string
  quantity: number
  unitPriceMinor: string
  lineAmountMinor: string
  kind: 'physical' | 'pod' | 'digital' | 'dropship'
  podMapping?: DetailedPodMapping
  soldRenditions?: readonly SoldPrintRenditionSnapshot[]
  /** RC3-20: dropship sourcing facts for a supplier-fulfilled line. The cost
   * snapshot is margin evidence observed from the supplier, POD-style. */
  dropship?: Readonly<{
    providerKey: string
    externalSku: string
    costMinor?: string
    currency?: string
    available?: boolean
  }>
}>

export type PlannedSupplierPackage = Readonly<{
  packageIndex: number
  providerKey: string
  items: readonly FulfillmentLineItem[]
  estimatedCostMinor: string
}>

export type PlannedPodPackage = Readonly<{
  packageIndex: number
  providerKey: string
  connectionId: string
  items: readonly FulfillmentLineItem[]
  estimatedCostMinor: string
}>

export type PlannedManualPackage = Readonly<{
  packageIndex: number
  reason: 'explicit-manual' | 'unmapped-variant' | 'provider-disabled' | 'provider-unsupported'
  items: readonly FulfillmentLineItem[]
}>

export type PlannedDigitalGrant = Readonly<{
  lineId: string
  productId: string
  variantSku: string
  entitlement?: string
}>

export type FulfillmentPlan = Readonly<{
  id: string
  orderId: string
  siteId: string
  currency: string
  recipientAddress?: PodRecipientAddress
  providerJobs: readonly PlannedPodPackage[]
  supplierPackages: readonly PlannedSupplierPackage[]
  manualPackages: readonly PlannedManualPackage[]
  digitalGrants: readonly PlannedDigitalGrant[]
  createdAt: string
}>

export type PodJobAuditRecord = Readonly<{
  timestamp: string
  action: string
  actor: string
  previousState?: PodProviderState
  newState: PodProviderState
  details?: Readonly<Record<string, unknown>>
}>

export type PODJob = Readonly<{
  id: string
  orderId: string
  siteId: string
  connectionId: string
  providerKey: string
  packageIndex: number
  idempotencyKey: string
  payloadHash: string
  state: PodProviderState
  addressPolicy: 'domestic' | 'international' | 'po-box-rejected'
  recipientSnapshot: PodRecipientAddress
  itemsSnapshot: readonly FulfillmentLineItem[]
  costSnapshot: Readonly<{
    estimatedCostMinor: string
    currency: string
  }>
  attemptCount: number
  externalOrderId?: string
  holdExpiresAt?: string
  releasedAt?: string
  auditTrail: readonly PodJobAuditRecord[]
  lastError?: string
  lastReconciledAt?: string
  createdAt: string
  updatedAt: string
}>

export const DEFAULT_HOLD_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours hold window

export function validateShippingAddressForPod(
  address: PodRecipientAddress | undefined,
  supportsPoBox = false,
): { valid: boolean; issues: readonly string[]; policy: PODJob['addressPolicy'] } {
  const issues: string[] = []
  if (!address) {
    return { valid: false, issues: ['Shipping address is missing.'], policy: 'domestic' }
  }
  if (!address.name?.trim()) issues.push('Recipient name is required.')
  if (!address.address1?.trim()) issues.push('Street address is required.')
  if (!address.city?.trim()) issues.push('City is required.')
  if (!address.postalCode?.trim()) issues.push('Postal code is required.')
  if (!address.country || !/^[A-Za-z]{2}$/.test(address.country.trim())) {
    issues.push('Country must be a valid 2-letter ISO 3166-1 alpha-2 code.')
  }

  const combinedStreet = `${address.address1} ${address.address2 ?? ''}`.toLowerCase()
  const isPoBox = /\bp\.?\s*o\.?\s*box\b/i.test(combinedStreet)
  if (isPoBox && !supportsPoBox) {
    issues.push('Provider does not accept PO Box addresses.')
    return { valid: false, issues, policy: 'po-box-rejected' }
  }

  const isDomestic = address.country?.toUpperCase() === 'US'
  return {
    valid: issues.length === 0,
    issues,
    policy: isDomestic ? 'domestic' : 'international',
  }
}

/**
 * Builds a deterministic fulfillment plan splitting items into:
 * 1. Provider POD packages (if mapping is approved and provider connection is active)
 * 2. Manual fulfillment packages (if item is manual, unmapped, or provider is disabled)
 * 3. Digital grants
 */
export function buildFulfillmentPlan(input: {
  orderId: string
  siteId: string
  currency: string
  recipientAddress?: PodRecipientAddress
  items: readonly FulfillmentLineItem[]
  connectionsByProviderKey: Readonly<Map<string, PodConnectionRecord>>
}): FulfillmentPlan {
  const providerPackages: PlannedPodPackage[] = []
  const supplierPackages: PlannedSupplierPackage[] = []
  const manualPackages: PlannedManualPackage[] = []
  const digitalGrants: PlannedDigitalGrant[] = []

  let nextPackageIndex = 0

  // RC3-20: dropship lines group per supplier provider. Like POD, a package
  // is only planned on observed available cost evidence — never on stale or
  // missing supplier facts.
  const dropshipItemsByProvider = new Map<string, FulfillmentLineItem[]>()
  for (const item of input.items) {
    if (item.kind !== 'dropship') continue
    if (!item.dropship?.providerKey || !item.dropship.externalSku)
      throw new Error('Dropship item requires a supplier provider key and external SKU.')
    const existing = dropshipItemsByProvider.get(item.dropship.providerKey)
    if (existing) existing.push(item)
    else dropshipItemsByProvider.set(item.dropship.providerKey, [item])
  }
  for (const [providerKey, items] of dropshipItemsByProvider) {
    let estimatedCost = 0n
    for (const item of items) {
      if (
        item.dropship?.available === false ||
        !item.dropship?.costMinor ||
        !/^(0|[1-9][0-9]*)$/.test(item.dropship.costMinor)
      )
        throw new Error('Dropship item requires observed available cost evidence.')
      estimatedCost += BigInt(item.dropship.costMinor) * BigInt(item.quantity)
    }
    supplierPackages.push({
      packageIndex: nextPackageIndex++,
      providerKey,
      items,
      estimatedCostMinor: estimatedCost.toString(),
    })
  }

  // Group items
  const podItemsByProvider = new Map<
    string,
    { connection: PodConnectionRecord; items: FulfillmentLineItem[] }
  >()
  const manualItemsFallback: {
    reason: PlannedManualPackage['reason']
    items: FulfillmentLineItem[]
  }[] = []

  for (const item of input.items) {
    if (item.kind === 'digital') {
      digitalGrants.push({
        lineId: item.lineId,
        productId: item.productId,
        variantSku: item.variantSku,
      })
      continue
    }

    if (item.kind === 'physical' && !item.podMapping) {
      manualItemsFallback.push({
        reason: 'explicit-manual',
        items: [item],
      })
      continue
    }

    if (item.kind === 'pod' || item.podMapping) {
      const mapping = item.podMapping
      if (!mapping || mapping.reviewStatus !== 'approved') {
        manualItemsFallback.push({
          reason: 'unmapped-variant',
          items: [item],
        })
        continue
      }

      if (
        mapping.siteId !== input.siteId ||
        mapping.productId !== item.productId ||
        mapping.variantSku !== item.variantSku
      )
        throw new Error('POD mapping does not match the plan site/product/variant.')
      const connection = input.connectionsByProviderKey.get(
        mapping.connectionId ?? mapping.providerKey,
      )
      if (!connection || connection.status !== 'active') {
        // Honest fallback: if connection is disabled or missing, route to manual package!
        manualItemsFallback.push({
          reason: 'provider-disabled',
          items: [item],
        })
        continue
      }

      if (
        connection.siteId !== input.siteId ||
        connection.providerKey !== mapping.providerKey ||
        mapping.snapshot.currency !== input.currency
      )
        throw new Error('POD connection/site/provider/currency mismatch.')
      const existing = podItemsByProvider.get(connection.id)
      if (existing) {
        existing.items.push(item)
      } else {
        podItemsByProvider.set(connection.id, { connection, items: [item] })
      }
    }
  }

  // Build POD packages
  for (const group of podItemsByProvider.values()) {
    let estimatedCost = 0n
    for (const item of group.items) {
      if (
        !item.podMapping?.snapshot?.available ||
        !/^(0|[1-9][0-9]*)$/.test(item.podMapping.snapshot.costMinor)
      )
        throw new Error('POD item requires observed available cost evidence.')
      const unitCost = BigInt(item.podMapping.snapshot.costMinor)
      estimatedCost += unitCost * BigInt(item.quantity)
    }

    providerPackages.push({
      packageIndex: nextPackageIndex++,
      providerKey: group.connection.providerKey,
      connectionId: group.connection.id,
      items: group.items,
      estimatedCostMinor: estimatedCost.toString(),
    })
  }

  // Build Manual packages
  for (const manual of manualItemsFallback) {
    manualPackages.push({
      packageIndex: nextPackageIndex++,
      reason: manual.reason,
      items: manual.items,
    })
  }

  return {
    id: `plan_${createHash('sha256').update(`${input.orderId}:${nextPackageIndex}`).digest('hex').slice(0, 16)}`,
    orderId: input.orderId,
    siteId: input.siteId,
    currency: input.currency,
    recipientAddress: input.recipientAddress,
    providerJobs: providerPackages,
    supplierPackages,
    manualPackages,
    digitalGrants,
    createdAt: new Date().toISOString(),
  }
}

export function computePodJobPayloadHash(input: {
  orderId: string
  packageIndex: number
  recipient: PodRecipientAddress
  items: readonly FulfillmentLineItem[]
}): string {
  const itemsDigest = input.items
    .map((item) => {
      const artHashes = (item.soldRenditions ?? [])
        .map((r) => `${r.printArea}:${r.hash}:${r.placement.widthMm}x${r.placement.heightMm}`)
        .sort()
        .join(',')
      return `${item.productId}:${item.variantSku}:${item.quantity}:${artHashes}`
    })
    .sort()
    .join('|')

  const raw = [
    input.orderId,
    input.packageIndex,
    input.recipient.name.trim(),
    input.recipient.address1.trim(),
    input.recipient.city.trim(),
    input.recipient.country.trim().toUpperCase(),
    input.recipient.postalCode.trim(),
    itemsDigest,
  ].join(';')

  return createHash('sha256').update(raw).digest('hex')
}

export function derivePodJobIdempotencyKey(
  siteId: string,
  orderId: string,
  packageIndex: number,
  payloadHash: string,
): string {
  return `pod_job:${siteId}:${orderId}:${packageIndex}:${payloadHash.slice(0, 16)}`
}

/**
 * Creates exactly one PODJob after authoritative payment acceptance (SHOP-04 state === 'paid').
 * Initializes the hold window to allow customer/operator address adjustments before submission.
 */
export function createPodJobAfterPaidAcceptance(input: {
  plan: FulfillmentPlan
  packageIndex: number
  orderPaymentState: string
  holdWindowMs?: number
  now?: string
  actor?: string
}): PODJob {
  // CRITICAL: Authoritative Paid Acceptance Gate
  if (input.orderPaymentState !== 'paid') {
    throw new Error(
      `Cannot create PODJob for order ${input.plan.orderId}: payment status is "${input.orderPaymentState}", must be "paid".`,
    )
  }

  const podPkg = input.plan.providerJobs.find((p) => p.packageIndex === input.packageIndex)
  if (!podPkg) {
    throw new Error(
      `Package index ${input.packageIndex} is not a valid provider package in this plan.`,
    )
  }

  if (!input.plan.recipientAddress) {
    throw new Error('Cannot create PODJob without a valid recipient address.')
  }

  const addressValidation = validateShippingAddressForPod(input.plan.recipientAddress)
  if (!addressValidation.valid) {
    throw new Error(`Address validation failed for PODJob: ${addressValidation.issues.join(', ')}`)
  }

  const nowEpoch = input.now ? Date.parse(input.now) : Date.now()
  const nowIso = new Date(nowEpoch).toISOString()
  const holdMs = input.holdWindowMs ?? DEFAULT_HOLD_WINDOW_MS
  const holdExpiresAt = holdMs > 0 ? new Date(nowEpoch + holdMs).toISOString() : undefined

  const payloadHash = computePodJobPayloadHash({
    orderId: input.plan.orderId,
    packageIndex: input.packageIndex,
    recipient: input.plan.recipientAddress,
    items: podPkg.items,
  })

  const idempotencyKey = derivePodJobIdempotencyKey(
    input.plan.siteId,
    input.plan.orderId,
    input.packageIndex,
    payloadHash,
  )

  const initialState: PodProviderState = holdExpiresAt ? 'on_hold' : 'created'

  const job: PODJob = {
    id: `pod_job_${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16)}`,
    orderId: input.plan.orderId,
    siteId: input.plan.siteId,
    connectionId: podPkg.connectionId,
    providerKey: podPkg.providerKey,
    packageIndex: input.packageIndex,
    idempotencyKey,
    payloadHash,
    state: initialState,
    addressPolicy: addressValidation.policy,
    recipientSnapshot: input.plan.recipientAddress,
    itemsSnapshot: podPkg.items,
    costSnapshot: {
      estimatedCostMinor: podPkg.estimatedCostMinor,
      currency: input.plan.currency,
    },
    attemptCount: 0,
    holdExpiresAt,
    auditTrail: [
      {
        timestamp: nowIso,
        action: 'job_created',
        actor: input.actor ?? 'commerce_paid_listener',
        newState: initialState,
        details: {
          holdExpiresAt,
          estimatedCostMinor: podPkg.estimatedCostMinor,
          payloadHash,
        },
      },
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
  }

  return job
}

export type SupplierJob = Readonly<{
  id: string
  orderId: string
  siteId: string
  providerKey: string
  packageIndex: number
  idempotencyKey: string
  payloadHash: string
  state: 'created' | 'submitted' | 'shipped' | 'delivered' | 'cancelled' | 'failed'
  recipientSnapshot: PodRecipientAddress
  itemsSnapshot: readonly FulfillmentLineItem[]
  costSnapshot: Readonly<{ estimatedCostMinor: string; currency: string }>
  externalOrderId?: string
  tracking?: Readonly<{ carrier: string; trackingNumber: string; trackingUrl?: string }>
  lastError?: string
  createdAt: string
  updatedAt: string
}>

export function computeSupplierJobPayloadHash(input: {
  orderId: string
  packageIndex: number
  recipient: PodRecipientAddress
  items: readonly FulfillmentLineItem[]
}): string {
  const itemsDigest = input.items
    .map(
      (item) =>
        `${item.productId}:${item.variantSku}:${item.dropship?.externalSku ?? ''}:${item.quantity}`,
    )
    .sort()
    .join('|')
  const raw = [
    input.orderId,
    input.packageIndex,
    input.recipient.name.trim(),
    input.recipient.address1.trim(),
    input.recipient.city.trim(),
    input.recipient.country.trim().toUpperCase(),
    input.recipient.postalCode.trim(),
    itemsDigest,
  ].join(';')
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Creates exactly one supplier job for a dropship package after authoritative
 * payment acceptance — the same paid gate POD jobs use. A supplier the seller
 * does not stock can never be submitted for an unpaid order.
 */
export function createSupplierJobAfterPaidAcceptance(input: {
  plan: FulfillmentPlan
  packageIndex: number
  orderPaymentState: string
  now?: string
}): SupplierJob {
  if (input.orderPaymentState !== 'paid') {
    throw new Error(
      `Cannot create supplier job for order ${input.plan.orderId}: payment status is "${input.orderPaymentState}", must be "paid".`,
    )
  }
  const supplierPkg = input.plan.supplierPackages.find((p) => p.packageIndex === input.packageIndex)
  if (!supplierPkg) {
    throw new Error(
      `Package index ${input.packageIndex} is not a valid supplier package in this plan.`,
    )
  }
  if (!input.plan.recipientAddress) {
    throw new Error('Cannot create supplier job without a valid recipient address.')
  }
  const payloadHash = computeSupplierJobPayloadHash({
    orderId: input.plan.orderId,
    packageIndex: input.packageIndex,
    recipient: input.plan.recipientAddress,
    items: supplierPkg.items,
  })
  const idempotencyKey = `supplier_job:${input.plan.siteId}:${input.plan.orderId}:${input.packageIndex}:${payloadHash.slice(0, 16)}`
  const nowIso = input.now ?? new Date().toISOString()
  return {
    id: `supplier_job_${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16)}`,
    orderId: input.plan.orderId,
    siteId: input.plan.siteId,
    providerKey: supplierPkg.providerKey,
    packageIndex: input.packageIndex,
    idempotencyKey,
    payloadHash,
    state: 'created',
    recipientSnapshot: input.plan.recipientAddress,
    itemsSnapshot: supplierPkg.items,
    costSnapshot: {
      estimatedCostMinor: supplierPkg.estimatedCostMinor,
      currency: input.plan.currency,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

/**
 * Submits a supplier job through its dropship adapter exactly once: a job
 * that already carries a supplier order id replays instead of re-ordering.
 * Tracking reported by the supplier is recorded on the job.
 */
export async function submitSupplierJob(
  adapter: import('./adapters').DropshipSupplierAdapter,
  job: SupplierJob,
): Promise<{ job: SupplierJob; replay: boolean }> {
  if (job.externalOrderId) return { job, replay: true }
  const recipient = job.recipientSnapshot
  const result = await adapter.createOrder({
    orderId: job.orderId,
    idempotencyKey: job.idempotencyKey,
    recipient: {
      name: recipient.name,
      address1: recipient.address1,
      address2: recipient.address2,
      city: recipient.city,
      state: recipient.state,
      postalCode: recipient.postalCode,
      country: recipient.country,
    },
    items: job.itemsSnapshot.map((item) => ({
      externalSku: item.dropship!.externalSku,
      quantity: item.quantity,
    })),
  })
  const nowIso = new Date().toISOString()
  if (result.state === 'failed') {
    return {
      job: { ...job, state: 'failed', lastError: result.error, updatedAt: nowIso },
      replay: false,
    }
  }
  const shipped = result.tracking ? result : await adapter.getOrder(result.externalOrderId)
  return {
    job: {
      ...job,
      state:
        shipped.state === 'shipped' || shipped.state === 'delivered' ? shipped.state : 'submitted',
      externalOrderId: result.externalOrderId,
      tracking: shipped.tracking,
      updatedAt: nowIso,
    },
    replay: Boolean(result.replay),
  }
}

export function isPodJobEligibleForSubmission(job: PODJob, now: number = Date.now()): boolean {
  if (job.externalOrderId) return false
  if (job.state === 'created' || job.state === 'submitting') return true
  if (job.state === 'on_hold') {
    if (job.releasedAt) return true
    if (job.holdExpiresAt && Date.parse(job.holdExpiresAt) <= now) return true
  }
  return false
}
