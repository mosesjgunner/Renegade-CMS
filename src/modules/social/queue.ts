import {
  type AuthContext,
  type DeliveryReceipt,
  type MediaResolver,
  type SocialProviderAdapter,
  type SocialVariant,
} from './contracts'
import {
  evaluateCanonicalPostStatus,
  type CanonicalSocialPost,
  type SocialDeliveryRecord,
  type SocialPostVariant,
  type VariantDeliveryStatus,
} from './models'
import { sanitizeSocialLog } from './security'

export interface WorkerLease {
  leaseOwner: string
  leaseExpiresAt: string
}

export interface RateLimitInfo {
  isRateLimited: boolean
  retryAfterMs?: number
  resetAt?: string
  rawHeader?: string
}

export interface QueueProcessingOptions {
  workerId: string
  leaseDurationMs?: number
  baseBackoffMs?: number
  maxBackoffMs?: number
  enableJitter?: boolean
}

const activeLeases = new Map<string, WorkerLease>()

/**
 * Attempts to acquire an atomic worker lease on a delivery job.
 * Prevents race conditions and duplicate dispatches in multi-instance or restarted environments.
 */
export function acquireWorkerLease(
  jobId: string,
  workerId: string,
  durationMs = 60000,
): { acquired: boolean; leaseExpiresAt?: string; existingOwner?: string } {
  const now = Date.now()
  const existing = activeLeases.get(jobId)

  if (existing) {
    const expiresAt = new Date(existing.leaseExpiresAt).getTime()
    if (expiresAt > now && existing.leaseOwner !== workerId) {
      return { acquired: false, existingOwner: existing.leaseOwner, leaseExpiresAt: existing.leaseExpiresAt }
    }
  }

  const leaseExpiresAt = new Date(now + durationMs).toISOString()
  activeLeases.set(jobId, { leaseOwner: workerId, leaseExpiresAt })
  return { acquired: true, leaseExpiresAt }
}

/**
 * Releases a previously acquired worker lease.
 */
export function releaseWorkerLease(jobId: string, workerId: string): boolean {
  const existing = activeLeases.get(jobId)
  if (existing && existing.leaseOwner === workerId) {
    activeLeases.delete(jobId)
    return true
  }
  return false
}

/**
 * Checks if an active lease exists and is held by another worker.
 */
export function isLeaseHeldByOther(jobId: string, workerId: string): boolean {
  const existing = activeLeases.get(jobId)
  if (!existing) return false
  const expiresAt = new Date(existing.leaseExpiresAt).getTime()
  return expiresAt > Date.now() && existing.leaseOwner !== workerId
}

/**
 * Calculates exponential backoff with bounded upper limit and optional jitter.
 * Formula: min(maxMs, baseMs * 2^attempt + jitter)
 */
export function calculateExponentialBackoff(
  attempt: number,
  baseMs = 5000,
  maxMs = 7200000, // 2 hours
  enableJitter = true,
): number {
  const exponential = baseMs * Math.pow(2, Math.max(0, attempt))
  const capped = Math.min(maxMs, exponential)
  const jitter = enableJitter ? Math.floor(Math.random() * (capped * 0.1)) : 0
  return Math.min(maxMs, capped + jitter)
}

/**
 * Parses HTTP headers for rate limit backoff timing.
 * Handles standard Retry-After (seconds or HTTP date), x-rate-limit-reset (UNIX epoch seconds).
 */
export function parseRateLimitHeaders(
  headers: Record<string, string | null | undefined>,
): RateLimitInfo {
  const retryAfterHeader = headers['retry-after'] || headers['Retry-After']
  const xResetHeader = headers['x-rate-limit-reset'] || headers['X-Rate-Limit-Reset']

  if (retryAfterHeader) {
    const numericSeconds = Number(retryAfterHeader)
    if (!Number.isNaN(numericSeconds) && numericSeconds >= 0) {
      const ms = numericSeconds * 1000
      return {
        isRateLimited: true,
        retryAfterMs: ms,
        resetAt: new Date(Date.now() + ms).toISOString(),
        rawHeader: retryAfterHeader,
      }
    }

    // Try parsing as HTTP Date
    const parsedDate = Date.parse(retryAfterHeader)
    if (!Number.isNaN(parsedDate) && parsedDate > Date.now()) {
      return {
        isRateLimited: true,
        retryAfterMs: parsedDate - Date.now(),
        resetAt: new Date(parsedDate).toISOString(),
        rawHeader: retryAfterHeader,
      }
    }
  }

  if (xResetHeader) {
    const epochSeconds = Number(xResetHeader)
    if (!Number.isNaN(epochSeconds)) {
      const resetTimeMs = epochSeconds * 1000
      const diffMs = Math.max(0, resetTimeMs - Date.now())
      return {
        isRateLimited: true,
        retryAfterMs: diffMs,
        resetAt: new Date(resetTimeMs).toISOString(),
        rawHeader: xResetHeader,
      }
    }
  }

  return { isRateLimited: false }
}

export interface ExecutionResult {
  status: 'succeeded' | 'failed' | 'retrying' | 'reconnect_required'
  deliveryRecord: SocialDeliveryRecord
  canonicalPostStatus: CanonicalSocialPost['status']
  error?: string
}

/**
 * Executes an atomic dispatch for a single SocialPostVariant.
 * Guarantees:
 * - Lease lock verification
 * - Exponential backoff on transient errors
 * - Rate-limit header compliance and future rescheduling
 * - Independent execution: partial failure never marks canonical post completed, nor rolls back peers
 */
export async function executeVariantDelivery(
  post: CanonicalSocialPost,
  variant: SocialPostVariant,
  delivery: SocialDeliveryRecord,
  adapter: SocialProviderAdapter,
  authContext: AuthContext,
  mediaResolver?: MediaResolver,
  options: QueueProcessingOptions = { workerId: 'worker-primary' },
): Promise<ExecutionResult> {
  const jobId = `job-${delivery.id}`

  // 1. Acquire Lease
  const lease = acquireWorkerLease(jobId, options.workerId, options.leaseDurationMs)
  if (!lease.acquired) {
    return {
      status: 'failed',
      deliveryRecord: delivery,
      canonicalPostStatus: post.status,
      error: `Worker lease lock held by ${lease.existingOwner} until ${lease.leaseExpiresAt}`,
    }
  }

  try {
    delivery.attemptCount += 1
    delivery.lastAttemptAt = new Date().toISOString()
    delivery.status = 'publishing'
    variant.status = 'publishing'

    delivery.executionAudit.push({
      action: 'delivery.attempt_started',
      timestamp: delivery.lastAttemptAt,
      details: { attemptCount: delivery.attemptCount, workerId: options.workerId },
    })

    // Construct social variant payload with resolved copy
    const targetVariantPayload: SocialVariant = {
      id: variant.id,
      accountId: variant.accountId,
      network: variant.network,
      text: variant.isOverridden && variant.copy !== null ? variant.copy : post.baseCopy,
      attachments: variant.attachments.length ? variant.attachments : post.defaultAttachments,
      linkUrl: variant.linkUrl || post.canonicalUrl,
      status: 'publishing',
      idempotencyKey: variant.idempotencyKey,
      platformSettings: variant.platformSettings,
    }

    if (!adapter.publish) {
      throw new Error(`Provider adapter for ${variant.network} does not implement publish()`)
    }

    const publishResult = await adapter.publish(targetVariantPayload, authContext, mediaResolver)

    // Handle published success
    if (publishResult.status === 'published') {
      const receipt: DeliveryReceipt = publishResult.receipt || {
        remotePostId: publishResult.remoteId,
        remoteUrl: publishResult.remoteUrl || '',
        publishedAt: new Date(),
        rawResponse: publishResult.rawResponse || {},
      }

      delivery.status = 'published'
      variant.status = 'published'
      delivery.remotePostId = receipt.remotePostId
      delivery.remoteUrl = receipt.remoteUrl
      delivery.lastError = undefined

      delivery.executionAudit.push({
        action: 'delivery.succeeded',
        timestamp: new Date().toISOString(),
        details: { remotePostId: receipt.remotePostId, remoteUrl: receipt.remoteUrl },
      })

      post.status = evaluateCanonicalPostStatus(post)
      return {
        status: 'succeeded',
        deliveryRecord: delivery,
        canonicalPostStatus: post.status,
      }
    }

    // Handle failure scenarios
    const errorKind = publishResult.error?.kind || 'transient'
    const errorMessage = sanitizeSocialLog(publishResult.error?.message || 'Unknown publishing error')

    delivery.lastError = errorMessage

    // Authentication failure -> Reconnect required
    if (errorKind === 'authentication' || errorKind === 'reconnect-required') {
      delivery.status = 'reconnect_required'
      variant.status = 'reconnect_required'

      delivery.executionAudit.push({
        action: 'delivery.reconnect_required',
        timestamp: new Date().toISOString(),
        details: { error: errorMessage },
      })

      post.status = evaluateCanonicalPostStatus(post)
      return {
        status: 'reconnect_required',
        deliveryRecord: delivery,
        canonicalPostStatus: post.status,
        error: errorMessage,
      }
    }

    // Rate limit -> Reschedule to retry-after
    if (errorKind === 'rate-limit') {
      const retryMs = publishResult.error?.retryAfter
        ? Date.parse(publishResult.error.retryAfter) - Date.now()
        : calculateExponentialBackoff(delivery.attemptCount, options.baseBackoffMs, options.maxBackoffMs, options.enableJitter)

      const nextRetryAt = new Date(Date.now() + Math.max(1000, retryMs)).toISOString()
      delivery.status = 'retrying'
      variant.status = 'retrying'
      delivery.nextRetryAt = nextRetryAt
      delivery.rateLimitResetAt = nextRetryAt

      delivery.executionAudit.push({
        action: 'delivery.rate_limited',
        timestamp: new Date().toISOString(),
        details: { retryAt: nextRetryAt, error: errorMessage },
      })

      post.status = evaluateCanonicalPostStatus(post)
      return {
        status: 'retrying',
        deliveryRecord: delivery,
        canonicalPostStatus: post.status,
        error: errorMessage,
      }
    }

    // Transient or other failure: retry if attempts < maxRetries
    if (delivery.attemptCount < delivery.maxRetries && errorKind === 'transient') {
      const delayMs = calculateExponentialBackoff(
        delivery.attemptCount,
        options.baseBackoffMs,
        options.maxBackoffMs,
        options.enableJitter,
      )
      const nextRetryAt = new Date(Date.now() + delayMs).toISOString()

      delivery.status = 'retrying'
      variant.status = 'retrying'
      delivery.nextRetryAt = nextRetryAt

      delivery.executionAudit.push({
        action: 'delivery.retrying',
        timestamp: new Date().toISOString(),
        details: { nextRetryAt, attempt: delivery.attemptCount, error: errorMessage },
      })

      post.status = evaluateCanonicalPostStatus(post)
      return {
        status: 'retrying',
        deliveryRecord: delivery,
        canonicalPostStatus: post.status,
        error: errorMessage,
      }
    }

    // Exhausted retries or non-retriable validation error -> FAILED
    delivery.status = 'failed'
    variant.status = 'failed'

    delivery.executionAudit.push({
      action: 'delivery.failed',
      timestamp: new Date().toISOString(),
      details: { attemptCount: delivery.attemptCount, error: errorMessage },
    })

    post.status = evaluateCanonicalPostStatus(post)
    return {
      status: 'failed',
      deliveryRecord: delivery,
      canonicalPostStatus: post.status,
      error: errorMessage,
    }
  } catch (err: unknown) {
    const errorMsg = sanitizeSocialLog(err instanceof Error ? err.message : String(err))
    delivery.lastError = errorMsg

    if (delivery.attemptCount < delivery.maxRetries) {
      const delayMs = calculateExponentialBackoff(delivery.attemptCount, options.baseBackoffMs, options.maxBackoffMs)
      delivery.status = 'retrying'
      variant.status = 'retrying'
      delivery.nextRetryAt = new Date(Date.now() + delayMs).toISOString()
    } else {
      delivery.status = 'failed'
      variant.status = 'failed'
    }

    delivery.executionAudit.push({
      action: 'delivery.exception',
      timestamp: new Date().toISOString(),
      details: { error: errorMsg, attempt: delivery.attemptCount },
    })

    post.status = evaluateCanonicalPostStatus(post)
    return {
      status: delivery.status === 'retrying' ? 'retrying' : 'failed',
      deliveryRecord: delivery,
      canonicalPostStatus: post.status,
      error: errorMsg,
    }
  } finally {
    releaseWorkerLease(jobId, options.workerId)
  }
}
