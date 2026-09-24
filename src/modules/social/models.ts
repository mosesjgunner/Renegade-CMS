import { createHash } from 'node:crypto'
import { type SocialAttachment, type SocialNetwork, type SocialState } from './contracts'

export type CanonicalPostStatus =
  | 'draft'
  | 'in-review'
  | 'approved'
  | 'scheduled'
  | 'dispatching'
  | 'completed'
  | 'partially-published'
  | 'failed'
  | 'cancelled'

export type VariantDeliveryStatus =
  | 'pending'
  | 'uploading_media'
  | 'processing_media'
  | 'publishing'
  | 'published'
  | 'retrying'
  | 'failed'
  | 'reconnect_required'
  | 'deleted'

export interface SocialDeliveryAuditEvent {
  action: string
  timestamp: string
  actorId?: string
  details?: Record<string, unknown>
}

export interface SocialDeliveryRecord {
  id: string
  variantId: string
  accountId: string
  network: SocialNetwork
  status: VariantDeliveryStatus
  attemptCount: number
  maxRetries: number
  lastAttemptAt?: string
  nextRetryAt?: string
  remotePostId?: string
  remoteUrl?: string
  rateLimitResetAt?: string
  lastError?: string
  executionAudit: SocialDeliveryAuditEvent[]
}

export interface SocialPostVariant {
  id: string
  canonicalPostId: string
  accountId: string
  network: SocialNetwork
  copy: string | null
  isOverridden: boolean
  attachments: SocialAttachment[]
  linkUrl?: string
  platformSettings?: Record<string, unknown>
  idempotencyKey: string
  status: VariantDeliveryStatus
  deliveryRecord?: SocialDeliveryRecord
}

export interface CanonicalSocialPost {
  id: string
  siteId: string
  publicationId: string
  campaignId?: string
  title: string
  baseCopy: string
  canonicalUrl?: string
  defaultAttachments: SocialAttachment[]
  authorId: string
  status: CanonicalPostStatus
  scheduledAt?: string
  timeZone?: string
  createdAt: string
  updatedAt: string
  variants: SocialPostVariant[]
}

/**
 * Generates an immutable, deterministic idempotency key for a variant dispatch.
 */
export function generateVariantIdempotencyKey(
  variantId: string,
  scheduledAt: string | undefined,
  accountId: string,
): string {
  const seed = `${variantId}:${scheduledAt || 'immediate'}:${accountId}`
  const hash = createHash('sha256').update(seed).digest('hex').substring(0, 16)
  return `social:dispatch:${hash}`
}

/**
 * Creates a new CanonicalSocialPost with initialized default variants.
 */
export function createCanonicalSocialPost(input: {
  id: string
  siteId: string
  publicationId: string
  campaignId?: string
  title: string
  baseCopy: string
  canonicalUrl?: string
  defaultAttachments?: SocialAttachment[]
  authorId: string
  scheduledAt?: string
  timeZone?: string
  targetAccounts?: Array<{ accountId: string; network: SocialNetwork }>
}): CanonicalSocialPost {
  const now = new Date().toISOString()
  const post: CanonicalSocialPost = {
    id: input.id,
    siteId: input.siteId,
    publicationId: input.publicationId,
    campaignId: input.campaignId,
    title: input.title,
    baseCopy: input.baseCopy,
    canonicalUrl: input.canonicalUrl,
    defaultAttachments: input.defaultAttachments ?? [],
    authorId: input.authorId,
    status: 'draft',
    scheduledAt: input.scheduledAt,
    timeZone: input.timeZone,
    createdAt: now,
    updatedAt: now,
    variants: [],
  }

  if (input.targetAccounts?.length) {
    for (const target of input.targetAccounts) {
      const variantId = `var-${post.id}-${target.accountId}`
      const variant: SocialPostVariant = {
        id: variantId,
        canonicalPostId: post.id,
        accountId: target.accountId,
        network: target.network,
        copy: null,
        isOverridden: false,
        attachments: [...post.defaultAttachments],
        linkUrl: post.canonicalUrl,
        idempotencyKey: generateVariantIdempotencyKey(
          variantId,
          post.scheduledAt,
          target.accountId,
        ),
        status: 'pending',
      }
      post.variants.push(variant)
    }
  }

  return post
}

/**
 * Resolves the effective copy for a post variant.
 * If the variant is not overridden or has null/empty copy, cascades to canonical base copy.
 */
export function resolveEffectiveCopy(
  post: CanonicalSocialPost,
  variant: SocialPostVariant,
): string {
  if (variant.isOverridden && variant.copy !== null && variant.copy !== undefined) {
    return variant.copy
  }
  return post.baseCopy
}

/**
 * Resolves the effective attachments for a variant.
 * If variant attachments are empty, falls back to canonical default attachments.
 */
export function resolveEffectiveAttachments(
  post: CanonicalSocialPost,
  variant: SocialPostVariant,
): SocialAttachment[] {
  if (variant.attachments.length > 0) {
    return variant.attachments
  }
  return post.defaultAttachments
}

/**
 * Updates the canonical post's base copy.
 * Propagates non-destructively to all variants where isOverridden === false.
 * Variants with isOverridden === true retain their custom copy!
 */
export function updateCanonicalCopy(
  post: CanonicalSocialPost,
  newBaseCopy: string,
): { post: CanonicalSocialPost; propagatedVariantCount: number } {
  post.baseCopy = newBaseCopy
  post.updatedAt = new Date().toISOString()

  let propagatedCount = 0
  for (const variant of post.variants) {
    if (!variant.isOverridden) {
      variant.copy = null // remains cascading
      propagatedCount++
    }
  }

  return { post, propagatedVariantCount: propagatedCount }
}

/**
 * Customizes a specific network variant, marking it overridden.
 */
export function overrideVariantCopy(
  post: CanonicalSocialPost,
  variantId: string,
  customCopy: string,
): SocialPostVariant {
  const variant = post.variants.find((v) => v.id === variantId)
  if (!variant) {
    throw new Error(`Variant ${variantId} not found on canonical post ${post.id}`)
  }

  variant.copy = customCopy
  variant.isOverridden = true
  post.updatedAt = new Date().toISOString()
  return variant
}

/**
 * Resets a variant override, re-enabling inheritance from canonical copy.
 */
export function resetVariantOverride(
  post: CanonicalSocialPost,
  variantId: string,
): SocialPostVariant {
  const variant = post.variants.find((v) => v.id === variantId)
  if (!variant) {
    throw new Error(`Variant ${variantId} not found on canonical post ${post.id}`)
  }

  variant.copy = null
  variant.isOverridden = false
  post.updatedAt = new Date().toISOString()
  return variant
}

/**
 * Creates or initializes an atomic delivery record for a variant.
 */
export function createSocialDeliveryRecord(
  variant: SocialPostVariant,
  maxRetries = 5,
): SocialDeliveryRecord {
  return {
    id: `del-${variant.id}`,
    variantId: variant.id,
    accountId: variant.accountId,
    network: variant.network,
    status: 'pending',
    attemptCount: 0,
    maxRetries,
    executionAudit: [
      {
        action: 'delivery.created',
        timestamp: new Date().toISOString(),
        details: { network: variant.network, accountId: variant.accountId },
      },
    ],
  }
}

/**
 * Evaluates the overall CanonicalPostStatus based on the states of its child variants.
 * Guarantees strict partial failure semantics:
 * - If some succeeded and some failed, status is 'partially-published' (NEVER 'completed').
 * - If all succeeded, status is 'completed'.
 * - If all failed, status is 'failed'.
 */
export function evaluateCanonicalPostStatus(post: CanonicalSocialPost): CanonicalPostStatus {
  if (!post.variants.length) return post.status

  const statuses = post.variants.map((v) => v.status)

  const anyPublished = statuses.some((s) => s === 'published')
  const anyFailed = statuses.some((s) => s === 'failed' || s === 'reconnect_required')
  const anyProcessing = statuses.some((s) =>
    ['pending', 'uploading_media', 'processing_media', 'publishing', 'retrying'].includes(s),
  )

  if (anyPublished && anyFailed && !anyProcessing) {
    return 'partially-published'
  }

  if (statuses.every((s) => s === 'published')) {
    return 'completed'
  }

  if (statuses.every((s) => s === 'failed' || s === 'reconnect_required')) {
    return 'failed'
  }

  if (anyProcessing) {
    return 'dispatching'
  }

  return post.status
}
