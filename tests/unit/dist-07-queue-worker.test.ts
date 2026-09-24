import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  isDeliveryReady,
  processQueueBatch,
  getSocialAdapter,
  ADAPTER_REGISTRY,
} from '@/modules/social/worker'
import {
  createCanonicalSocialPost,
  createSocialDeliveryRecord,
  type CanonicalSocialPost,
  type SocialDeliveryRecord,
} from '@/modules/social/models'
import { type AuthContext, type SocialNetwork } from '@/modules/social/contracts'

describe('SocialQueueWorker Engine', () => {
  const origFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = origFetch
    vi.restoreAllMocks()
  })

  it('provides configured adapters for all 12 supported networks', () => {
    const supportedNetworks: SocialNetwork[] = [
      'bluesky',
      'mastodon',
      'linkedin',
      'facebook',
      'instagram',
      'threads',
      'pinterest',
      'youtube',
      'tiktok',
      'x',
      'telegram',
      'discord',
    ]

    for (const net of supportedNetworks) {
      const adapter = getSocialAdapter(net)
      expect(adapter).toBeDefined()
      expect(adapter.network).toBe(net)
      expect(adapter.getCapabilities).toBeTypeOf('function')
    }
  })

  describe('isDeliveryReady', () => {
    it('returns false for terminal delivery statuses', () => {
      const post = createCanonicalSocialPost({
        id: 'p1',
        siteId: 's1',
        publicationId: 'pub1',
        title: 'Title',
        baseCopy: 'Copy',
        authorId: 'a1',
        targetAccounts: [{ accountId: 'acc1', network: 'bluesky' }],
      })

      const delPublished: SocialDeliveryRecord = {
        ...createSocialDeliveryRecord(post.variants[0]),
        status: 'published',
      }
      expect(isDeliveryReady(post, delPublished)).toBe(false)

      const delFailed: SocialDeliveryRecord = {
        ...delPublished,
        status: 'failed',
      }
      expect(isDeliveryReady(post, delFailed)).toBe(false)
    })

    it('handles scheduledAt timing correctly for pending deliveries', () => {
      const now = 1000000000000 // Fixed point in time

      const futurePost = createCanonicalSocialPost({
        id: 'p-future',
        siteId: 's1',
        publicationId: 'pub1',
        title: 'Future Release',
        baseCopy: 'Content',
        authorId: 'a1',
        scheduledAt: new Date(now + 60000).toISOString(),
        targetAccounts: [{ accountId: 'acc1', network: 'mastodon' }],
      })
      const delFuture = createSocialDeliveryRecord(futurePost.variants[0])
      expect(isDeliveryReady(futurePost, delFuture, now)).toBe(false)

      const pastPost = createCanonicalSocialPost({
        id: 'p-past',
        siteId: 's1',
        publicationId: 'pub1',
        title: 'Past Release',
        baseCopy: 'Content',
        authorId: 'a1',
        scheduledAt: new Date(now - 60000).toISOString(),
        targetAccounts: [{ accountId: 'acc1', network: 'mastodon' }],
      })
      const delPast = createSocialDeliveryRecord(pastPost.variants[0])
      expect(isDeliveryReady(pastPost, delPast, now)).toBe(true)

      const immediatePost = createCanonicalSocialPost({
        id: 'p-imm',
        siteId: 's1',
        publicationId: 'pub1',
        title: 'Immediate Release',
        baseCopy: 'Content',
        authorId: 'a1',
        targetAccounts: [{ accountId: 'acc1', network: 'mastodon' }],
      })
      const delImmediate = createSocialDeliveryRecord(immediatePost.variants[0])
      expect(isDeliveryReady(immediatePost, delImmediate, now)).toBe(true)
    })

    it('handles nextRetryAt timing for retrying deliveries', () => {
      const now = 2000000000000
      const post = createCanonicalSocialPost({
        id: 'p-retry',
        siteId: 's1',
        publicationId: 'pub1',
        title: 'Retry Test',
        baseCopy: 'Content',
        authorId: 'a1',
        targetAccounts: [{ accountId: 'acc1', network: 'threads' }],
      })

      const delFutureRetry: SocialDeliveryRecord = {
        ...createSocialDeliveryRecord(post.variants[0]),
        status: 'retrying',
        nextRetryAt: new Date(now + 15000).toISOString(),
      }
      expect(isDeliveryReady(post, delFutureRetry, now)).toBe(false)

      const delPastRetry: SocialDeliveryRecord = {
        ...delFutureRetry,
        nextRetryAt: new Date(now - 5000).toISOString(),
      }
      expect(isDeliveryReady(post, delPastRetry, now)).toBe(true)
    })
  })

  describe('processQueueBatch', () => {
    it('executes ready dispatches and isolates partial failures non-destructively', async () => {
      // Mock fetch responses:
      // First call (Telegram) succeeds
      // Second call (Discord) fails with 400 validation error
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 101, chat: { id: -100123, username: 'renegade_feed' } },
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ message: 'Invalid payload structure', code: 50006 }),
        } as unknown as Response)

      const post: CanonicalSocialPost = createCanonicalSocialPost({
        id: 'post-multi-batch',
        siteId: 'site-1',
        publicationId: 'pub-1',
        title: 'Multi Batch Broadcast',
        baseCopy: 'Important transmission',
        authorId: 'user-admin',
        targetAccounts: [
          { accountId: 'acc-tg', network: 'telegram' },
          { accountId: 'acc-dc', network: 'discord' },
        ],
      })

      // Attach deliveries to post
      const postWithDeliveries = {
        ...post,
        deliveries: post.variants.map((v) => createSocialDeliveryRecord(v)),
      }

      const authMap = new Map<string, AuthContext>([
        [
          'acc-tg',
          {
            accountId: 'acc-tg',
            accountHandle: '@renegade_bot',
            network: 'telegram',
            credentials: { botToken: 'tg-token-valid', chatId: '@renegade_feed' },
          },
        ],
        [
          'acc-dc',
          {
            accountId: 'acc-dc',
            accountHandle: 'Discord Guild',
            network: 'discord',
            credentials: { webhookUrl: 'https://discord.com/api/webhooks/111/token_fail' },
          },
        ],
      ])

      const summary = await processQueueBatch([postWithDeliveries], authMap, undefined, {
        workerId: 'test-worker-1',
        enableJitter: false,
      })

      expect(summary.totalConsidered).toBe(2)
      expect(summary.processedCount).toBe(2)
      expect(summary.succeededCount).toBe(1)
      expect(summary.failedCount).toBe(1)

      // Post status should cascade to partially-published!
      expect(postWithDeliveries.status).toBe('partially-published')

      // Check variant and delivery statuses
      const tgDelivery = postWithDeliveries.deliveries.find((d) => d.network === 'telegram')
      expect(tgDelivery?.status).toBe('published')
      expect(tgDelivery?.remotePostId).toBe('@renegade_feed:101')

      const dcDelivery = postWithDeliveries.deliveries.find((d) => d.network === 'discord')
      expect(dcDelivery?.status).toBe('failed')
      expect(dcDelivery?.lastError).toContain('Invalid payload structure')
    })
  })
})
