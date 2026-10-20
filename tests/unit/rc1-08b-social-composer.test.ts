import { describe, it, expect } from 'vitest'
import { socialHash } from '@/modules/social/contracts'
import { getSocialAdapter } from '@/modules/social/worker'
import {
  createCanonicalSocialPost,
  generateVariantIdempotencyKey,
  overrideVariantCopy,
  resetVariantOverride,
  resolveEffectiveCopy,
  updateCanonicalCopy,
} from '@/modules/social/models'

describe('RC1 08B - Social Composer, Approval Gates & Scheduling', () => {
  describe('Cryptographic Approval Hash (socialHash)', () => {
    it('computes stable deterministic SHA-256 hash across variants', () => {
      const payload1 = {
        network: 'bluesky' as const,
        text: 'Announcing Renegade CMS 1.0! https://renegadeparty.org',
        linkUrl: 'https://renegadeparty.org',
        attachments: [{ mediaAssetId: 'asset-img-1', role: 'image' as const }],
      }
      const hash1 = socialHash(payload1)
      const hash2 = socialHash({ ...payload1 })
      expect(hash1).toBe(hash2)
      expect(hash1.startsWith('sha256:')).toBe(true)
      expect(hash1).toHaveLength(71)
    })

    it('detects tampering or content revision by producing distinct hashes', () => {
      const base = {
        network: 'bluesky' as const,
        text: 'Original copy text',
        linkUrl: 'https://renegadeparty.org',
        attachments: [],
      }
      const originalHash = socialHash(base)

      const modifiedTextHash = socialHash({ ...base, text: 'Tampered copy text' })
      expect(modifiedTextHash).not.toBe(originalHash)

      const modifiedLinkHash = socialHash({ ...base, linkUrl: 'https://evil.example.com' })
      expect(modifiedLinkHash).not.toBe(originalHash)

      const modifiedNetworkHash = socialHash({ ...base, network: 'mastodon' as const })
      expect(modifiedNetworkHash).not.toBe(originalHash)
    })
  })

  describe('Destination Adapter Pre-Flight Validation (validatePost)', () => {
    it('validates Bluesky constraints: rejection on empty post and text > 300 chars', () => {
      const adapter = getSocialAdapter('bluesky')
      expect(adapter.validatePost).toBeDefined()

      // Empty post
      const emptyReport = adapter.validatePost!({
        id: 'var-1',
        accountId: 'acc-bsky-1',
        network: 'bluesky',
        text: '   ',
        attachments: [],
        status: 'draft',
        idempotencyKey: 'k1',
      })
      expect(emptyReport.isValid).toBe(false)
      expect(emptyReport.errors.some((e) => e.code === 'EMPTY_POST')).toBe(true)

      // Valid post (under 300 chars)
      const validReport = adapter.validatePost!({
        id: 'var-2',
        accountId: 'acc-bsky-1',
        network: 'bluesky',
        text: 'Renegade CMS release 1.0 is live! Check out the decentralized features.',
        attachments: [],
        status: 'draft',
        idempotencyKey: 'k2',
      })
      expect(validReport.isValid).toBe(true)
      expect(validReport.errors).toHaveLength(0)

      // Over limit (350 chars)
      const longText = 'A'.repeat(350)
      const overLimitReport = adapter.validatePost!({
        id: 'var-3',
        accountId: 'acc-bsky-1',
        network: 'bluesky',
        text: longText,
        attachments: [],
        status: 'draft',
        idempotencyKey: 'k3',
      })
      expect(overLimitReport.isValid).toBe(false)
      expect(overLimitReport.errors.some((e) => e.code === 'TEXT_TOO_LONG')).toBe(true)
      expect(overLimitReport.errors[0].message).toContain('300')
    })

    it('validates Mastodon constraints: rejection on empty post, text > 500 chars, > 4 attachments', () => {
      const adapter = getSocialAdapter('mastodon')
      expect(adapter.validatePost).toBeDefined()

      // Empty status
      const emptyReport = adapter.validatePost!({
        id: 'var-m1',
        accountId: 'acc-masto-1',
        network: 'mastodon',
        text: '',
        attachments: [],
        status: 'draft',
        idempotencyKey: 'km1',
      })
      expect(emptyReport.isValid).toBe(false)
      expect(emptyReport.errors.some((e) => e.code === 'EMPTY_STATUS')).toBe(true)

      // Valid status (450 chars)
      const validReport = adapter.validatePost!({
        id: 'var-m2',
        accountId: 'acc-masto-1',
        network: 'mastodon',
        text: 'M'.repeat(450),
        attachments: [],
        status: 'draft',
        idempotencyKey: 'km2',
      })
      expect(validReport.isValid).toBe(true)

      // Over limit (550 chars)
      const overLimitReport = adapter.validatePost!({
        id: 'var-m3',
        accountId: 'acc-masto-1',
        network: 'mastodon',
        text: 'M'.repeat(550),
        attachments: [],
        status: 'draft',
        idempotencyKey: 'km3',
      })
      expect(overLimitReport.isValid).toBe(false)
      expect(overLimitReport.errors.some((e) => e.code === 'TEXT_TOO_LONG')).toBe(true)

      // Too many attachments
      const tooManyAttachmentsReport = adapter.validatePost!({
        id: 'var-m4',
        accountId: 'acc-masto-1',
        network: 'mastodon',
        text: 'Valid text with 5 images',
        attachments: [
          { mediaAssetId: 'a1', role: 'image' },
          { mediaAssetId: 'a2', role: 'image' },
          { mediaAssetId: 'a3', role: 'image' },
          { mediaAssetId: 'a4', role: 'image' },
          { mediaAssetId: 'a5', role: 'image' },
        ],
        status: 'draft',
        idempotencyKey: 'km4',
      })
      expect(tooManyAttachmentsReport.isValid).toBe(false)
      expect(tooManyAttachmentsReport.errors.some((e) => e.code === 'TOO_MANY_ATTACHMENTS')).toBe(true)
    })
  })

  describe('Canonical Post and Variant Override Model', () => {
    it('initializes canonical post and resolves inherited vs overridden copy', () => {
      const post = createCanonicalSocialPost({
        id: 'post-101',
        siteId: 'site-alpha',
        publicationId: 'pub-alpha',
        title: 'Release Announcement',
        baseCopy: 'Universal release announcement for all platforms.',
        canonicalUrl: 'https://renegadeparty.org/announcement',
        authorId: 'editor-1',
        targetAccounts: [
          { accountId: 'acc-bsky', network: 'bluesky' },
          { accountId: 'acc-masto', network: 'mastodon' },
        ],
      })

      expect(post.variants).toHaveLength(2)
      const bskyVariant = post.variants.find((v) => v.accountId === 'acc-bsky')!
      const mastoVariant = post.variants.find((v) => v.accountId === 'acc-masto')!

      // Before override: both inherit canonical base copy
      expect(resolveEffectiveCopy(post, bskyVariant)).toBe(
        'Universal release announcement for all platforms.',
      )
      expect(resolveEffectiveCopy(post, mastoVariant)).toBe(
        'Universal release announcement for all platforms.',
      )

      // Override Bluesky variant only
      overrideVariantCopy(
        post,
        bskyVariant.id,
        'Bluesky tailored copy with custom handle @renegade.bsky.social',
      )
      expect(bskyVariant.isOverridden).toBe(true)
      expect(resolveEffectiveCopy(post, bskyVariant)).toBe(
        'Bluesky tailored copy with custom handle @renegade.bsky.social',
      )

      // Mastodon remains un-overridden
      expect(mastoVariant.isOverridden).toBe(false)
      expect(resolveEffectiveCopy(post, mastoVariant)).toBe(
        'Universal release announcement for all platforms.',
      )

      // Updating canonical copy propagates to Mastodon but does NOT overwrite Bluesky override
      updateCanonicalCopy(post, 'Updated canonical message for remaining platforms.')
      expect(resolveEffectiveCopy(post, mastoVariant)).toBe(
        'Updated canonical message for remaining platforms.',
      )
      expect(resolveEffectiveCopy(post, bskyVariant)).toBe(
        'Bluesky tailored copy with custom handle @renegade.bsky.social',
      )

      // Resetting override restores canonical inheritance on Bluesky
      resetVariantOverride(post, bskyVariant.id)
      expect(bskyVariant.isOverridden).toBe(false)
      expect(resolveEffectiveCopy(post, bskyVariant)).toBe(
        'Updated canonical message for remaining platforms.',
      )
    })
  })

  describe('Durable Scheduling and Idempotency Keys', () => {
    it('generates deterministic idempotency keys and prevents collision across schedules', () => {
      const key1 = generateVariantIdempotencyKey('var-1', '2026-10-25T14:00:00.000Z', 'acc-1')
      const key2 = generateVariantIdempotencyKey('var-1', '2026-10-25T14:00:00.000Z', 'acc-1')
      expect(key1).toBe(key2)
      expect(key1.startsWith('social:dispatch:')).toBe(true)

      // Different scheduled time yields different key
      const keyDifferentTime = generateVariantIdempotencyKey(
        'var-1',
        '2026-10-25T15:00:00.000Z',
        'acc-1',
      )
      expect(keyDifferentTime).not.toBe(key1)

      // Different account yields different key
      const keyDifferentAccount = generateVariantIdempotencyKey(
        'var-1',
        '2026-10-25T14:00:00.000Z',
        'acc-2',
      )
      expect(keyDifferentAccount).not.toBe(key1)
    })
  })
})
