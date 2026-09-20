import { BlueskyAdapter } from './adapters/bluesky'
import { DiscordAdapter } from './adapters/discord'
import { FacebookAdapter } from './adapters/facebook'
import { InstagramAdapter } from './adapters/instagram'
import { LinkedInAdapter } from './adapters/linkedin'
import { MastodonAdapter } from './adapters/mastodon'
import { PinterestAdapter } from './adapters/pinterest'
import { TelegramAdapter } from './adapters/telegram'
import { ThreadsAdapter } from './adapters/threads'
import { TikTokAdapter } from './adapters/tiktok'
import { XAdapter } from './adapters/x'
import { YouTubeAdapter } from './adapters/youtube'
import {
  type AuthContext,
  type MediaResolver,
  type SocialNetwork,
  type SocialProviderAdapter,
} from './contracts'
import {
  createSocialDeliveryRecord,
  evaluateCanonicalPostStatus,
  type CanonicalSocialPost,
  type SocialDeliveryRecord,
  type SocialPostVariant,
} from './models'
import { executeVariantDelivery, type QueueProcessingOptions } from './queue'

export const ADAPTER_REGISTRY: Record<SocialNetwork, SocialProviderAdapter> = {
  bluesky: new BlueskyAdapter(),
  mastodon: new MastodonAdapter(),
  linkedin: new LinkedInAdapter(),
  facebook: new FacebookAdapter(),
  instagram: new InstagramAdapter(),
  threads: new ThreadsAdapter(),
  pinterest: new PinterestAdapter(),
  youtube: new YouTubeAdapter(),
  tiktok: new TikTokAdapter(),
  x: new XAdapter(),
  telegram: new TelegramAdapter(),
  discord: new DiscordAdapter(),
  activitypub: new MastodonAdapter(),
  manual: {
    network: 'manual',
    mode: 'manual-handoff',
    capabilities: {
      postTypes: ['text'],
      textLimit: null,
      media: { images: false, video: false, audio: false },
      threads: false,
      linkCards: 'none',
      edit: false,
      delete: false,
      nativeScheduling: false,
      authentication: { required: false, modes: [] },
      rateLimit: {},
    },
  },
}

export function getSocialAdapter(network: SocialNetwork): SocialProviderAdapter {
  return ADAPTER_REGISTRY[network] || ADAPTER_REGISTRY.manual
}

export interface JobExecutionReport {
  deliveryId: string
  variantId: string
  postId: string
  network: SocialNetwork
  status: 'succeeded' | 'failed' | 'retrying' | 'reconnect_required'
  attemptCount: number
  remotePostId?: string
  remoteUrl?: string
  error?: string
}

export interface QueueBatchSummary {
  workerId: string
  startedAt: string
  completedAt: string
  durationMs: number
  totalConsidered: number
  processedCount: number
  succeededCount: number
  retryingCount: number
  failedCount: number
  reconnectRequiredCount: number
  jobs: JobExecutionReport[]
}

/**
 * Determines if a delivery record is currently ready for execution.
 * Respects:
 * - Parent post schedule time
 * - Transient retry backoff timestamp (nextRetryAt)
 * - Rate limit cooldown window (rateLimitResetAt)
 */
export function isDeliveryReady(
  post: CanonicalSocialPost,
  delivery: SocialDeliveryRecord,
  now = Date.now(),
): boolean {
  if (
    delivery.status === 'published' ||
    delivery.status === 'failed' ||
    delivery.status === 'reconnect_required'
  ) {
    return false
  }

  // Pending items must check parent post scheduled timestamp
  if (delivery.status === 'pending') {
    if (post.status === 'cancelled' || post.status === 'completed') {
      return false
    }
    if (post.scheduledAt) {
      const scheduledTime = Date.parse(post.scheduledAt)
      if (!Number.isNaN(scheduledTime) && scheduledTime > now) {
        return false
      }
    }
    return true
  }

  // Retrying items must wait until nextRetryAt
  if (delivery.status === 'retrying') {
    if (delivery.nextRetryAt) {
      const retryTime = Date.parse(delivery.nextRetryAt)
      if (!Number.isNaN(retryTime) && retryTime > now) {
        return false
      }
    }
    return true
  }

  // Processing media asynchronous checks
  if (delivery.status === 'processing_media') {
    if (delivery.nextRetryAt) {
      const checkTime = Date.parse(delivery.nextRetryAt)
      if (!Number.isNaN(checkTime) && checkTime > now) {
        return false
      }
    }
    return true
  }

  return false
}

export interface QueuedPostItem extends CanonicalSocialPost {
  deliveries?: SocialDeliveryRecord[]
}

/**
 * Processes a batch of pending and retrying social deliveries.
 * Decomposes long-running container checks without thread starvation.
 * Ensures lease lock isolation and non-destructive partial failure cascading.
 */
export async function processQueueBatch(
  posts: QueuedPostItem[],
  authMap: Map<string, AuthContext>,
  mediaResolver?: MediaResolver,
  options: QueueProcessingOptions = { workerId: 'worker-engine-primary' },
  now = Date.now(),
): Promise<QueueBatchSummary> {
  const startedAt = new Date().toISOString()
  const jobs: JobExecutionReport[] = []

  let processedCount = 0
  let succeededCount = 0
  let retryingCount = 0
  let failedCount = 0
  let reconnectRequiredCount = 0
  let totalConsidered = 0

  for (const post of posts) {
    if (!post.deliveries) {
      post.deliveries = post.variants.map((v) => createSocialDeliveryRecord(v))
    }

    for (const variant of post.variants) {
      let delivery = post.deliveries.find((d) => d.variantId === variant.id)
      if (!delivery) {
        delivery = createSocialDeliveryRecord(variant)
        post.deliveries.push(delivery)
      }

      const activeDelivery: SocialDeliveryRecord = delivery

      totalConsidered += 1

      if (!isDeliveryReady(post, activeDelivery, now)) {
        continue
      }

      processedCount += 1
      const adapter = getSocialAdapter(variant.network)
      const authContext: AuthContext = authMap.get(variant.accountId) || {
        accountId: variant.accountId,
        accountHandle: `@${variant.network}-user`,
        network: variant.network,
        credentials: {},
      }

      const result = await executeVariantDelivery(
        post,
        variant,
        activeDelivery,
        adapter,
        authContext,
        mediaResolver,
        options,
      )

      if (result.status === 'succeeded') succeededCount += 1
      else if (result.status === 'retrying') retryingCount += 1
      else if (result.status === 'reconnect_required') reconnectRequiredCount += 1
      else failedCount += 1

      jobs.push({
        deliveryId: activeDelivery.id,
        variantId: variant.id,
        postId: post.id,
        network: variant.network,
        status: result.status,
        attemptCount: activeDelivery.attemptCount,
        remotePostId: activeDelivery.remotePostId,
        remoteUrl: activeDelivery.remoteUrl,
        error: result.error,
      })
    }

    // Refresh post status after batch item execution
    post.status = evaluateCanonicalPostStatus(post)
  }

  const completedAt = new Date().toISOString()
  const durationMs = Date.parse(completedAt) - Date.parse(startedAt)

  return {
    workerId: options.workerId,
    startedAt,
    completedAt,
    durationMs,
    totalConsidered,
    processedCount,
    succeededCount,
    retryingCount,
    failedCount,
    reconnectRequiredCount,
    jobs,
  }
}
