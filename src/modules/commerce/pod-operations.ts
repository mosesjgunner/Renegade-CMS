import { createHash } from 'node:crypto'
import type { PODJob, PodJobAuditRecord } from './fulfillment-plan'
import {
  validateShippingAddressForPod,
  computePodJobPayloadHash,
  derivePodJobIdempotencyKey,
  isPodJobEligibleForSubmission,
} from './fulfillment-plan'
import type {
  PodProviderAdapter,
  PodProviderCapabilityMatrix,
  PodRecipientAddress,
} from './pod-contract'
import { PodProviderError } from './pod-contract'
import { signPrivatePrintAssetUrl } from './print-renditions'

export const MAX_POD_SUBMIT_ATTEMPTS = 3

export type ResponsibilityPolicy =
  | 'provider_defect' // Misprint, ink defect, wrong item sent -> Provider reprint/refund
  | 'transit_lost_damaged' // Carrier lost package or transit damage -> Carrier claim / store replacement
  | 'customer_error' // Customer gave bad address or sizing error -> Customer responsibility / store policy

export function releasePodJobHold(job: PODJob, actor = 'operator'): PODJob {
  if (job.state !== 'on_hold') {
    return job
  }

  const now = new Date().toISOString()
  const audit: PodJobAuditRecord = {
    timestamp: now,
    action: 'hold_released',
    actor,
    previousState: 'on_hold',
    newState: 'created',
    details: { reason: 'Hold released by operator or customer' },
  }

  return {
    ...job,
    state: 'created',
    releasedAt: now,
    auditTrail: [...job.auditTrail, audit],
    updatedAt: now,
  }
}

export function placePodJobOnHold(
  job: PODJob,
  reason: string,
  actor = 'operator',
  holdWindowMs = 2 * 60 * 60 * 1000,
): PODJob {
  if (!['created', 'on_hold'].includes(job.state)) {
    throw new Error(`Cannot place job on hold: job has already reached state "${job.state}".`)
  }

  const now = new Date().toISOString()
  const holdExpiresAt = new Date(Date.now() + holdWindowMs).toISOString()

  const audit: PodJobAuditRecord = {
    timestamp: now,
    action: 'hold_placed',
    actor,
    previousState: job.state,
    newState: 'on_hold',
    details: { reason, holdExpiresAt },
  }

  return {
    ...job,
    state: 'on_hold',
    holdExpiresAt,
    releasedAt: undefined,
    auditTrail: [...job.auditTrail, audit],
    updatedAt: now,
  }
}

/**
 * Address Boundary Rule:
 * Addresses can be modified while on hold or created.
 * Once submitted to the provider, address changes are strictly prohibited.
 */
export function updatePodJobRecipientAddress(
  job: PODJob,
  newAddress: PodRecipientAddress,
  actor = 'customer',
): PODJob {
  if (!['created', 'on_hold'].includes(job.state)) {
    throw new Error(
      `Address boundary violation: Cannot modify address for PODJob in state "${job.state}". Order is already submitted or in production with the provider.`,
    )
  }

  const validation = validateShippingAddressForPod(newAddress)
  if (!validation.valid) {
    throw new Error(`Invalid recipient address: ${validation.issues.join(', ')}`)
  }

  const now = new Date().toISOString()
  const payloadHash = computePodJobPayloadHash({
    orderId: job.orderId,
    packageIndex: job.packageIndex,
    recipient: newAddress,
    items: job.itemsSnapshot,
  })

  const newIdempotencyKey = derivePodJobIdempotencyKey(
    job.siteId,
    job.orderId,
    job.packageIndex,
    payloadHash,
  )

  const audit: PodJobAuditRecord = {
    timestamp: now,
    action: 'address_updated',
    actor,
    previousState: job.state,
    newState: job.state,
    details: {
      previousAddress: job.recipientSnapshot,
      newAddress,
      newPayloadHash: payloadHash,
    },
  }

  return {
    ...job,
    recipientSnapshot: newAddress,
    addressPolicy: validation.policy,
    payloadHash,
    idempotencyKey: newIdempotencyKey,
    auditTrail: [...job.auditTrail, audit],
    updatedAt: now,
  }
}

/**
 * Cancel deadline:
 * Local cancel if not yet submitted.
 * Provider cancel if submitted and not yet in production.
 * Rejected if already in production.
 */
export async function cancelPodJob(
  job: PODJob,
  adapter: PodProviderAdapter,
  reason: string,
  actor = 'operator',
): Promise<PODJob> {
  const now = new Date().toISOString()

  // 1. Cancel before submission
  if (['created', 'on_hold'].includes(job.state)) {
    const audit: PodJobAuditRecord = {
      timestamp: now,
      action: 'job_cancelled_locally',
      actor,
      previousState: job.state,
      newState: 'cancelled',
      details: { reason },
    }
    return {
      ...job,
      state: 'cancelled',
      auditTrail: [...job.auditTrail, audit],
      updatedAt: now,
    }
  }

  // 2. Cancel after submission
  if (job.externalOrderId) {
    const result = await adapter.cancelOrder(job.externalOrderId, reason)
    if (!result.cancelled) {
      throw new Error(
        `Provider rejected cancellation: ${result.reason ?? 'Order is already in production or fulfilled.'}`,
      )
    }

    const audit: PodJobAuditRecord = {
      timestamp: now,
      action: 'job_cancelled_at_provider',
      actor,
      previousState: job.state,
      newState: 'cancelled',
      details: { reason, externalOrderId: job.externalOrderId },
    }
    return {
      ...job,
      state: 'cancelled',
      auditTrail: [...job.auditTrail, audit],
      updatedAt: now,
    }
  }

  throw new Error(`Job cannot be cancelled in state "${job.state}".`)
}

export type SubmitPodJobOutcome =
  | { success: true; job: PODJob }
  | { success: false; job: PODJob; retryable: boolean; handoffRequired: boolean; error: string }

/**
 * Submits a PODJob to the provider with retry tracking and automatic manual handoff.
 */
export async function submitPodJobWithRetry(input: {
  job: PODJob
  adapter: PodProviderAdapter
  privateAssetSigningSecret?: string
  now?: string
  actor?: string
}): Promise<SubmitPodJobOutcome> {
  const job = input.job
  const now = input.now ?? new Date().toISOString()
  const actor = input.actor ?? 'pod_worker'
  const secret = input.privateAssetSigningSecret ?? 'default-private-print-secret'

  if (!isPodJobEligibleForSubmission(job)) {
    return {
      success: false,
      job,
      retryable: false,
      handoffRequired: false,
      error: `Job is currently on hold until ${job.holdExpiresAt}`,
    }
  }

  const attempt = job.attemptCount + 1

  // Format Items with signed private artwork URLs
  const items = job.itemsSnapshot.map((item) => {
    const printAreas = (item.soldRenditions ?? []).map((rendition) => {
      const signedUrl = signPrivatePrintAssetUrl(
        {
          renditionId: rendition.renditionId,
          hash: rendition.hash,
          siteId: job.siteId,
          expiresAtEpochMs: Date.now() + 24 * 60 * 60 * 1000,
        },
        secret,
      )
      return {
        area: rendition.printArea,
        artworkId: rendition.renditionId,
        artworkHash: rendition.hash,
        artworkUrl: signedUrl,
        placement: rendition.placement,
      }
    })

    return {
      variantId: item.podMapping?.remoteVariantId ?? item.variantSku,
      externalVariantSku: item.variantSku,
      quantity: item.quantity,
      printAreas,
    }
  })

  try {
    const result = await input.adapter.createOrder({
      orderId: job.orderId,
      idempotencyKey: job.idempotencyKey,
      recipient: job.recipientSnapshot,
      items,
      metadata: {
        siteId: job.siteId,
        jobId: job.id,
        attempt: String(attempt),
      },
    })

    const audit: PodJobAuditRecord = {
      timestamp: now,
      action: 'job_submitted_success',
      actor,
      previousState: job.state,
      newState: result.state,
      details: {
        attempt,
        externalOrderId: result.externalOrderId,
        costMinor: result.costMinor,
      },
    }

    const updatedJob: PODJob = {
      ...job,
      state: result.state,
      externalOrderId: result.externalOrderId,
      attemptCount: attempt,
      auditTrail: [...job.auditTrail, audit],
      updatedAt: now,
    }

    return { success: true, job: updatedJob }
  } catch (err: unknown) {
    const isProviderErr = err instanceof PodProviderError
    const retryable = isProviderErr ? err.retryable : false
    const errMsg = (err as Error).message ?? 'Unknown provider submission error'

    const maxExhausted = attempt >= MAX_POD_SUBMIT_ATTEMPTS
    const handoffRequired = !retryable || maxExhausted

    const targetState = handoffRequired ? 'failed' : 'submitting'

    const audit: PodJobAuditRecord = {
      timestamp: now,
      action: handoffRequired
        ? 'job_submission_failed_terminal'
        : 'job_submission_retryable_failure',
      actor,
      previousState: job.state,
      newState: targetState,
      details: {
        attempt,
        error: errMsg,
        retryable,
        handoffRequired,
      },
    }

    const updatedJob: PODJob = {
      ...job,
      state: targetState,
      attemptCount: attempt,
      lastError: errMsg,
      auditTrail: [...job.auditTrail, audit],
      updatedAt: now,
    }

    return {
      success: false,
      job: updatedJob,
      retryable,
      handoffRequired,
      error: errMsg,
    }
  }
}

/**
 * Creates a replacement reprint PODJob linked to an original order.
 */
export function createReprintPodJob(input: {
  originalJob: PODJob
  reason: string
  responsibility: ResponsibilityPolicy
  actor: string
  automated?: boolean
  adapterCapabilities?: PodProviderCapabilityMatrix
  now?: string
}): PODJob {
  if (
    input.automated &&
    input.adapterCapabilities &&
    !input.adapterCapabilities.supportsAutomaticReprint
  ) {
    throw new Error(
      'Provider does not support automatic reprints (supportsAutomaticReprint: false). Manual operator review and approval is required.',
    )
  }

  const now = input.now ?? new Date().toISOString()
  const reprintCounter = (input.originalJob as any).reprintCount ?? 1

  const reprintIdempotencyKey = `${input.originalJob.idempotencyKey}:reprint:${reprintCounter}`
  const newJobId = `pod_reprint_${createHash('sha256').update(reprintIdempotencyKey).digest('hex').slice(0, 16)}`

  const audit: PodJobAuditRecord = {
    timestamp: now,
    action: 'reprint_job_created',
    actor: input.actor,
    previousState: 'created',
    newState: 'created',
    details: {
      originalJobId: input.originalJob.id,
      originalExternalOrderId: input.originalJob.externalOrderId,
      reason: input.reason,
      responsibility: input.responsibility,
    },
  }

  return {
    ...input.originalJob,
    id: newJobId,
    idempotencyKey: reprintIdempotencyKey,
    state: 'created',
    attemptCount: 0,
    externalOrderId: undefined,
    holdExpiresAt: undefined,
    releasedAt: now,
    auditTrail: [audit],
    createdAt: now,
    updatedAt: now,
    ...({ parentJobId: input.originalJob.id, responsibility: input.responsibility } as any),
  }
}
