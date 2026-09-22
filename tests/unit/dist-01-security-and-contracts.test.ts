import { describe, expect, it, vi } from 'vitest'
import {
  decryptSecret,
  encryptSecret,
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  sanitizeSocialLog,
  validateOutboundUrl,
  verifyOAuthState,
} from '../../src/modules/social/security'
import {
  createCanonicalSocialPost,
  createSocialDeliveryRecord,
  evaluateCanonicalPostStatus,
  overrideVariantCopy,
  resetVariantOverride,
  resolveEffectiveCopy,
  updateCanonicalCopy,
} from '../../src/modules/social/models'
import {
  acquireWorkerLease,
  calculateExponentialBackoff,
  executeVariantDelivery,
  parseRateLimitHeaders,
  releaseWorkerLease,
} from '../../src/modules/social/queue'
import { type SocialProviderAdapter } from '../../src/modules/social/contracts'

describe('Pass DIST-01: Social Security, Canonical Models & Queue State Machine', () => {
  // =========================================================================
  // 1. AES-256-GCM Credential Encryption & Decryption
  // =========================================================================
  describe('AES-256-GCM Credential Security', () => {
    it('encrypts plaintext and decrypts back to exact original string', () => {
      const plaintext = 'oauth-super-secret-token-12345!@#$%^&*()'
      const encrypted = encryptSecret(plaintext)

      expect(encrypted).not.toBe(plaintext)
      expect(encrypted.split(':')).toHaveLength(3) // iv:tag:ciphertext

      const decrypted = decryptSecret(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('works with custom 64-character hexadecimal keys', () => {
      const customKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
      const plaintext = 'sensitive_client_secret_9988'
      const encrypted = encryptSecret(plaintext, customKey)
      const decrypted = decryptSecret(encrypted, customKey)

      expect(decrypted).toBe(plaintext)
    })

    it('fails safely with corrupted ciphertext or authentication tag tampering', () => {
      const encrypted = encryptSecret('token-to-tamper')
      const [iv, tag, ciphertext] = encrypted.split(':')

      // Tamper with tag
      const tamperedTag = tag.substring(0, tag.length - 2) + 'AA'
      const tamperedPackage = `${iv}:${tamperedTag}:${ciphertext}`

      expect(() => decryptSecret(tamperedPackage)).toThrow()
    })

    it('handles empty inputs gracefully', () => {
      expect(encryptSecret('')).toBe('')
      expect(decryptSecret('')).toBe('')
    })

    it('fails closed when no production encryption key is configured', () => {
      const env = process.env as Record<string, string | undefined>
      const previousNodeEnv = env.NODE_ENV
      const previousKey = env.RENEGADE_ENCRYPTION_KEY
      env.NODE_ENV = 'production'
      delete env.RENEGADE_ENCRYPTION_KEY

      try {
        expect(() => encryptSecret('prod-secret')).toThrow(/production.*encryption/i)
      } finally {
        if (previousNodeEnv === undefined) delete env.NODE_ENV
        else env.NODE_ENV = previousNodeEnv
        if (previousKey === undefined) delete env.RENEGADE_ENCRYPTION_KEY
        else env.RENEGADE_ENCRYPTION_KEY = previousKey
      }
    })
  })

  // =========================================================================
  // 2. SSRF Protection Validator
  // =========================================================================
  describe('SSRF Protection Validator', () => {
    it('blocks loopback and localhost destinations', () => {
      expect(validateOutboundUrl('http://localhost:3000/api').isValid).toBe(false)
      expect(validateOutboundUrl('https://127.0.0.1/secret').isValid).toBe(false)
      expect(validateOutboundUrl('https://127.0.0.5/secret').isValid).toBe(false)
      expect(validateOutboundUrl('https://0.0.0.0/').isValid).toBe(false)
    })

    it('blocks cloud instance metadata endpoints', () => {
      expect(validateOutboundUrl('https://169.254.169.254/latest/meta-data/').isValid).toBe(false)
      expect(
        validateOutboundUrl('https://metadata.google.internal/computeMetadata/v1/').isValid,
      ).toBe(false)
    })

    it('blocks private RFC 1918 subnets', () => {
      expect(validateOutboundUrl('https://10.0.1.50/webhook').isValid).toBe(false)
      expect(validateOutboundUrl('https://172.20.0.5/api').isValid).toBe(false)
      expect(validateOutboundUrl('https://192.168.1.100/status').isValid).toBe(false)
      expect(validateOutboundUrl('https://100.65.1.1/').isValid).toBe(false) // CGNAT
    })

    it('blocks disallowed protocols and URLs with embedded credentials', () => {
      expect(validateOutboundUrl('ftp://ftp.example.com/file').isValid).toBe(false)
      expect(validateOutboundUrl('file:///etc/passwd').isValid).toBe(false)
      expect(validateOutboundUrl('https://user:password@example.com/api').isValid).toBe(false)
    })

    it('allows valid public HTTPS endpoints', () => {
      expect(
        validateOutboundUrl('https://api.bsky.app/xrpc/com.atproto.repo.createRecord').isValid,
      ).toBe(true)
      expect(validateOutboundUrl('https://graph.facebook.com/v20.0/me').isValid).toBe(true)
      expect(validateOutboundUrl('https://api.linkedin.com/rest/posts').isValid).toBe(true)
    })
  })

  // =========================================================================
  // 3. Log & Error Message Sanitization
  // =========================================================================
  describe('Social Log Sanitization', () => {
    it('masks Bearer tokens and sensitive key-value pairs', () => {
      const rawLog =
        'Request to https://api.social.test with headers Authorization: Bearer secret_bearer_token_abc and body {"accessToken":"at_12345","clientSecret":"cs_67890"}'
      const sanitized = sanitizeSocialLog(rawLog)

      expect(sanitized).not.toContain('secret_bearer_token_abc')
      expect(sanitized).not.toContain('at_12345')
      expect(sanitized).not.toContain('cs_67890')
      expect(sanitized).toContain('Bearer [REDACTED]')
      expect(sanitized).toContain('[REDACTED]')
    })
  })

  // =========================================================================
  // 4. OAuth 2.0 PKCE & State Token Validation
  // =========================================================================
  describe('OAuth 2.0 PKCE & State Management', () => {
    it('generates high-entropy PKCE verifier and deterministic challenge', () => {
      const verifier1 = generateCodeVerifier()
      const verifier2 = generateCodeVerifier()
      expect(verifier1).not.toBe(verifier2)
      expect(verifier1.length).toBeGreaterThanOrEqual(43)

      const challenge1 = generateCodeChallenge(verifier1)
      const challenge2 = generateCodeChallenge(verifier1)
      expect(challenge1).toBe(challenge2)
      expect(challenge1).not.toBe(verifier1)
    })

    it('generates and verifies tamper-proof time-bounded state parameters', () => {
      const state = generateOAuthState({
        siteId: 'site-renegade',
        accountId: 'acc-bluesky-1',
        network: 'bluesky',
      })

      const verification = verifyOAuthState(state, 'site-renegade')
      expect(verification.isValid).toBe(true)
      expect(verification.payload?.siteId).toBe('site-renegade')
      expect(verification.payload?.network).toBe('bluesky')

      // Site ID mismatch fails
      expect(verifyOAuthState(state, 'site-wrong').isValid).toBe(false)

      // Signature tampering fails
      const tampered = state.substring(0, state.length - 3) + 'XYZ'
      expect(verifyOAuthState(tampered, 'site-renegade').isValid).toBe(false)

      // Expired state fails
      expect(verifyOAuthState(state, 'site-renegade', undefined, -1).isValid).toBe(false)
    })
  })

  // =========================================================================
  // 5. Canonical Post & Provider Variant Hierarchy
  // =========================================================================
  describe('Canonical Post & Provider Variant Hierarchy', () => {
    it('initializes canonical post and child variants with non-destructive cascading copy', () => {
      const post = createCanonicalSocialPost({
        id: 'post-101',
        siteId: 'site-alpha',
        publicationId: 'pub-main',
        title: 'New Article Release',
        baseCopy: 'Check out our new release: https://renegadeparty.org/post/1',
        canonicalUrl: 'https://renegadeparty.org/post/1',
        authorId: 'author-alex',
        targetAccounts: [
          { accountId: 'acc-mastodon', network: 'mastodon' },
          { accountId: 'acc-bluesky', network: 'bluesky' },
          { accountId: 'acc-x', network: 'x' },
        ],
      })

      expect(post.variants).toHaveLength(3)

      // Un-overridden variants inherit baseCopy
      const mastodonVar = post.variants.find((v) => v.network === 'mastodon')!
      const blueskyVar = post.variants.find((v) => v.network === 'bluesky')!
      const xVar = post.variants.find((v) => v.network === 'x')!

      expect(resolveEffectiveCopy(post, mastodonVar)).toBe(post.baseCopy)
      expect(resolveEffectiveCopy(post, xVar)).toBe(post.baseCopy)

      // Override X variant to fit character limit
      overrideVariantCopy(post, xVar.id, 'Short X copy: https://renegadeparty.org/post/1')
      expect(xVar.isOverridden).toBe(true)
      expect(resolveEffectiveCopy(post, xVar)).toBe(
        'Short X copy: https://renegadeparty.org/post/1',
      )

      // Updating canonical copy propagates to Mastodon and Bluesky, but leaves customized X untouched!
      updateCanonicalCopy(post, 'Updated canonical copy for all networks!')
      expect(resolveEffectiveCopy(post, mastodonVar)).toBe(
        'Updated canonical copy for all networks!',
      )
      expect(resolveEffectiveCopy(post, blueskyVar)).toBe(
        'Updated canonical copy for all networks!',
      )
      expect(resolveEffectiveCopy(post, xVar)).toBe(
        'Short X copy: https://renegadeparty.org/post/1',
      )

      // Resetting override re-enables inheritance
      resetVariantOverride(post, xVar.id)
      expect(xVar.isOverridden).toBe(false)
      expect(resolveEffectiveCopy(post, xVar)).toBe('Updated canonical copy for all networks!')
    })
  })

  // =========================================================================
  // 6. Queue State Machine, Lease Locks & Partial Failure Isolation
  // =========================================================================
  describe('Queue State Machine, Lease Locks & Bounded Retries', () => {
    it('manages worker lease locks prevent concurrent worker races', () => {
      const jobId = 'job-test-123'
      const workerA = 'worker-node-1'
      const workerB = 'worker-node-2'

      const leaseA = acquireWorkerLease(jobId, workerA, 30000)
      expect(leaseA.acquired).toBe(true)

      // Worker B tries to acquire lease on same job and is rejected
      const leaseB = acquireWorkerLease(jobId, workerB, 30000)
      expect(leaseB.acquired).toBe(false)
      expect(leaseB.existingOwner).toBe(workerA)

      // Worker A releases lease; worker B can now acquire it
      expect(releaseWorkerLease(jobId, workerA)).toBe(true)
      const leaseBRetry = acquireWorkerLease(jobId, workerB, 30000)
      expect(leaseBRetry.acquired).toBe(true)
      releaseWorkerLease(jobId, workerB)
    })

    it('calculates exponential backoff with bounded upper limit and jitter', () => {
      const backoff0 = calculateExponentialBackoff(0, 1000, 60000, false)
      const backoff1 = calculateExponentialBackoff(1, 1000, 60000, false)
      const backoff2 = calculateExponentialBackoff(2, 1000, 60000, false)
      const backoffCapped = calculateExponentialBackoff(10, 1000, 60000, false)

      expect(backoff0).toBe(1000)
      expect(backoff1).toBe(2000)
      expect(backoff2).toBe(4000)
      expect(backoffCapped).toBe(60000) // Capped at maxMs
    })

    it('reclaims expired worker leases so a new worker can take over safely', () => {
      vi.useFakeTimers()
      const jobId = 'job-expired-lease'

      try {
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
        const firstLease = acquireWorkerLease(jobId, 'worker-a', 1000)
        expect(firstLease.acquired).toBe(true)

        vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'))
        const staleLease = acquireWorkerLease(jobId, 'worker-b', 5000)
        expect(staleLease.acquired).toBe(true)
        expect(staleLease.existingOwner).toBeUndefined()
      } finally {
        vi.useRealTimers()
      }
    })

    it('parses Retry-After and x-rate-limit-reset headers accurately', () => {
      // Seconds delay
      const r1 = parseRateLimitHeaders({ 'retry-after': '45' })
      expect(r1.isRateLimited).toBe(true)
      expect(r1.retryAfterMs).toBe(45000)

      // Epoch reset header
      const futureEpoch = Math.floor(Date.now() / 1000) + 120
      const r2 = parseRateLimitHeaders({ 'x-rate-limit-reset': String(futureEpoch) })
      expect(r2.isRateLimited).toBe(true)
      expect(r2.retryAfterMs).toBeGreaterThan(100000)
    })

    it('enforces strict partial failure isolation across multi-network publishing', async () => {
      const post = createCanonicalSocialPost({
        id: 'post-multi-target',
        siteId: 'site-alpha',
        publicationId: 'pub-main',
        title: 'Multi Target Announcement',
        baseCopy: 'Publishing to multiple networks simultaneously!',
        authorId: 'user-publisher',
        targetAccounts: [
          { accountId: 'acc-mastodon-1', network: 'mastodon' },
          { accountId: 'acc-bluesky-1', network: 'bluesky' },
        ],
      })

      const mastodonVariant = post.variants.find((v) => v.network === 'mastodon')!
      const blueskyVariant = post.variants.find((v) => v.network === 'bluesky')!

      const mastodonDelivery = createSocialDeliveryRecord(mastodonVariant)
      const blueskyDelivery = createSocialDeliveryRecord(blueskyVariant)

      // Mock Adapter 1: Mastodon succeeds
      const successfulAdapter: SocialProviderAdapter = {
        id: 'adapter-mastodon',
        name: 'Mastodon Adapter',
        version: '1.0.0',
        network: 'mastodon',
        mode: 'live',
        capabilities: {
          postTypes: ['text'],
          textLimit: 500,
          media: { images: false, video: false, audio: false },
          threads: true,
          linkCards: 'native',
          edit: true,
          delete: true,
          nativeScheduling: false,
          authentication: { required: true, modes: ['bearer'] },
          rateLimit: {},
        },
        getCapabilities() {
          return {} as any
        },
        publish: async () => ({
          status: 'published' as const,
          remoteId: 'mastodon-post-12345',
          remoteUrl: 'https://mastodon.social/@renegade/12345',
        }),
      }

      // Mock Adapter 2: Bluesky experiences a rate limit
      const rateLimitedAdapter: SocialProviderAdapter = {
        id: 'adapter-bluesky',
        name: 'Bluesky Adapter',
        version: '1.0.0',
        network: 'bluesky',
        mode: 'live',
        capabilities: {
          postTypes: ['text'],
          textLimit: 300,
          media: { images: false, video: false, audio: false },
          threads: true,
          linkCards: 'native',
          edit: false,
          delete: true,
          nativeScheduling: false,
          authentication: { required: true, modes: ['app-password'] },
          rateLimit: {},
        },
        getCapabilities() {
          return {} as any
        },
        publish: async () => ({
          status: 'failed' as const,
          error: {
            kind: 'rate-limit' as const,
            message: 'XRPC 429 Rate limit exceeded',
            retryAfter: new Date(Date.now() + 60000).toISOString(),
          },
        }),
      }

      const authContext = {
        accountId: 'acc-1',
        accountHandle: '@renegade',
        network: 'mastodon' as const,
        credentials: { token: 'mock-token' },
      }

      // Execute Mastodon delivery (Succeeds)
      const res1 = await executeVariantDelivery(
        post,
        mastodonVariant,
        mastodonDelivery,
        successfulAdapter,
        authContext,
      )
      expect(res1.status).toBe('succeeded')
      expect(mastodonDelivery.status).toBe('published')
      expect(mastodonDelivery.remotePostId).toBe('mastodon-post-12345')

      // Execute Bluesky delivery (Rate limited -> retrying)
      const res2 = await executeVariantDelivery(
        post,
        blueskyVariant,
        blueskyDelivery,
        rateLimitedAdapter,
        authContext,
      )
      expect(res2.status).toBe('retrying')
      expect(blueskyDelivery.status).toBe('retrying')
      expect(blueskyDelivery.nextRetryAt).toBeDefined()

      // Post is currently dispatching
      expect(post.status).toBe('dispatching')

      // Simulate Bluesky exhausting max retries to test final failure
      blueskyDelivery.attemptCount = blueskyDelivery.maxRetries
      const failingAdapter: SocialProviderAdapter = {
        ...rateLimitedAdapter,
        publish: async () => ({
          status: 'failed' as const,
          error: { kind: 'transient' as const, message: 'Server down' },
        }),
      }

      const res3 = await executeVariantDelivery(
        post,
        blueskyVariant,
        blueskyDelivery,
        failingAdapter,
        authContext,
      )
      expect(res3.status).toBe('failed')
      expect(blueskyDelivery.status).toBe('failed')

      // CRITICAL EVALUATION:
      // Mastodon is published, Bluesky is failed.
      // Canonical post MUST be 'partially-published', NEVER 'completed', and Mastodon must NOT be rolled back!
      expect(evaluateCanonicalPostStatus(post)).toBe('partially-published')
      expect(mastodonDelivery.status).toBe('published')
    })
  })
})
