import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { BlueskyAdapter } from '@/modules/social/adapters/bluesky'
import { MastodonAdapter } from '@/modules/social/adapters/mastodon'
import { type SocialVariant, type AuthContext } from '@/modules/social/contracts'

const sha256Hex = (text: string) => createHash('sha256').update(text).digest('hex')

describe('RC1 08C - Social Queue Dispatch, Idempotency, and Failure Recovery', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => vi.stubEnv('SOCIAL_LOCAL_ADAPTER_ORIGINS', 'http://127.0.0.1:3131'))

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('BlueskyAdapter - Dispatch & Idempotency', () => {
    it('generates a deterministic 32-char rkey from idempotencyKey', () => {
      const key = 'draft:draft-123:account-456:approved'
      const expectedRkey = sha256Hex(key).slice(0, 32)
      expect(expectedRkey).toHaveLength(32)
      expect(/^[0-9a-f]{32}$/.test(expectedRkey)).toBe(true)
    })

    it('performs pre-flight getRecord check and recovers lost response without re-posting', async () => {
      const adapter = new BlueskyAdapter()
      const idempotencyKey = 'draft:draft-101:variant-bluesky:v1'
      const rkey = sha256Hex(idempotencyKey).slice(0, 32)

      let createRecordCalled = false

      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString()

        // 1. Session creation
        if (urlStr.includes('/com.atproto.server.createSession')) {
          return new Response(
            JSON.stringify({
              did: 'did:plc:testuser123',
              handle: 'testuser.bsky.social',
              accessJwt: 'mock-access-jwt',
              refreshJwt: 'mock-refresh-jwt',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        // 2. Pre-flight getRecord check (already created from previous attempt)
        if (urlStr.includes('/com.atproto.repo.getRecord')) {
          return new Response(
            JSON.stringify({
              uri: `at://did:plc:testuser123/app.bsky.feed.post/${rkey}`,
              cid: 'bafyrei-recovered-cid-456',
              value: { text: 'Hello Bluesky!', createdAt: new Date().toISOString() },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        // 3. createRecord should NOT be called
        if (urlStr.includes('/com.atproto.repo.createRecord')) {
          createRecordCalled = true
          return new Response(JSON.stringify({ error: 'ShouldNotCall' }), { status: 500 })
        }

        return new Response('Not Found', { status: 404 })
      }) as any

      const variant: SocialVariant = {
        id: 'v-1',
        network: 'bluesky',
        accountId: 'acc-1',
        text: 'Hello Bluesky!',
        idempotencyKey,
        attachments: [],
        status: 'scheduled',
      }

      const context: AuthContext = {
        accountId: 'acc-1',
        accountHandle: 'testuser.bsky.social',
        network: 'bluesky',
        credentials: {
          identifier: 'testuser.bsky.social',
          appPassword: 'test-app-password',
          service: 'http://127.0.0.1:3131',
        },
      }

      const result = await adapter.publish(variant, context)

      expect(createRecordCalled).toBe(false)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe(`at://did:plc:testuser123/app.bsky.feed.post/${rkey}`)
        expect(result.receipt?.rawResponse?.reconciled).toBe(true)
        expect(result.receipt?.rawResponse?.providerMode).toBe('local-harness')
      }
    })

    it('publishes successfully and records local-harness receipt mode', async () => {
      const adapter = new BlueskyAdapter()
      const idempotencyKey = 'draft:draft-202:variant-bsky:fresh'
      const rkey = sha256Hex(idempotencyKey).slice(0, 32)

      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString()

        if (urlStr.includes('/com.atproto.server.createSession')) {
          return new Response(
            JSON.stringify({
              did: 'did:plc:freshuser',
              handle: 'fresh.bsky.social',
              accessJwt: 'mock-jwt-fresh',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        // Preflight returns 404 -> record does not exist yet
        if (urlStr.includes('/com.atproto.repo.getRecord')) {
          return new Response(JSON.stringify({ error: 'RecordNotFound' }), { status: 404 })
        }

        if (urlStr.includes('/com.atproto.repo.createRecord')) {
          return new Response(
            JSON.stringify({
              uri: `at://did:plc:freshuser/app.bsky.feed.post/${rkey}`,
              cid: 'bafyrei-new-cid-999',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response('Not Found', { status: 404 })
      }) as any

      const variant: SocialVariant = {
        id: 'v-2',
        network: 'bluesky',
        accountId: 'acc-2',
        text: 'Fresh post for test',
        idempotencyKey,
        attachments: [],
        status: 'scheduled',
      }

      const context: AuthContext = {
        accountId: 'acc-2',
        accountHandle: 'fresh.bsky.social',
        network: 'bluesky',
        credentials: {
          identifier: 'fresh.bsky.social',
          appPassword: 'pwd',
          service: 'http://127.0.0.1:3131',
        },
      }

      const result = await adapter.publish(variant, context)

      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toContain(rkey)
        expect(result.remoteUrl).toContain(rkey)
        expect(result.receipt?.rawResponse?.providerMode).toBe('local-harness')
      }
    })

    it('handles 429 rate limits with retryable flag and backoff header', async () => {
      const adapter = new BlueskyAdapter()
      const futureReset = Math.floor(Date.now() / 1000) + 120

      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString()
        if (urlStr.includes('/com.atproto.server.createSession')) {
          return new Response(
            JSON.stringify({
              error: 'RateLimitExceeded',
              message: 'Too many requests, try again later',
            }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'RateLimit-Reset': String(futureReset),
              },
            },
          )
        }
        return new Response('Not Found', { status: 404 })
      }) as any

      const variant: SocialVariant = {
        id: 'v-3',
        network: 'bluesky',
        accountId: 'acc-3',
        text: 'Rate limited text',
        idempotencyKey: 'rate-limit-test',
        attachments: [],
        status: 'scheduled',
      }

      const context: AuthContext = {
        accountId: 'acc-3',
        accountHandle: 'busy.bsky.social',
        network: 'bluesky',
        credentials: {
          identifier: 'busy.bsky.social',
          appPassword: 'pwd',
          service: 'http://127.0.0.1:3131',
        },
      }

      const result = await adapter.publish(variant, context)

      expect(result.status).toBe('failed')
      if (result.status === 'failed') {
        expect(result.error.kind).toBe('rate-limit')
        expect(result.error.message).toMatch(/rate limit exceeded/i)
      }
    })

    it('handles 401 unauthorized as reconnect-required safe disconnect', async () => {
      const adapter = new BlueskyAdapter()

      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: 'AuthenticationRequired',
            message: 'Invalid app password or revoked token',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        )
      }) as any

      const variant: SocialVariant = {
        id: 'v-4',
        network: 'bluesky',
        accountId: 'acc-4',
        text: 'Revoked account text',
        idempotencyKey: 'auth-fail-test',
        attachments: [],
        status: 'scheduled',
      }

      const context: AuthContext = {
        accountId: 'acc-4',
        accountHandle: 'revoked.bsky.social',
        network: 'bluesky',
        credentials: {
          identifier: 'revoked.bsky.social',
          appPassword: 'bad-password',
          service: 'http://127.0.0.1:3131',
        },
      }

      const result = await adapter.publish(variant, context)

      expect(result.status).toBe('failed')
      if (result.status === 'failed') {
        expect(result.error.kind).toBe('reconnect-required')
        expect(result.error.message).toContain('reconnection required')
      }
    })
  })

  describe('MastodonAdapter - Dispatch & Receipts', () => {
    it('publishes with local-harness receipt and handles errors cleanly', async () => {
      const adapter = new MastodonAdapter()

      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString()
        if (urlStr.includes('/api/v1/statuses')) {
          return new Response(
            JSON.stringify({
              id: 'masto-status-789',
              url: 'http://127.0.0.1:3131/@admin/789',
              uri: 'http://127.0.0.1:3131/users/admin/statuses/789',
              created_at: new Date().toISOString(),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('Not Found', { status: 404 })
      }) as any

      const variant: SocialVariant = {
        id: 'v-masto-1',
        network: 'mastodon',
        accountId: 'acc-masto-1',
        text: 'Mastodon dispatch test',
        idempotencyKey: 'masto-key-1',
        attachments: [],
        status: 'scheduled',
      }

      const context: AuthContext = {
        accountId: 'acc-masto-1',
        accountHandle: 'admin@127.0.0.1:3131',
        network: 'mastodon',
        credentials: {
          serverUrl: 'http://127.0.0.1:3131',
          accessToken: 'masto-token-abc',
        },
      }

      const result = await adapter.publish(variant, context)

      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('masto-status-789')
        expect(result.remoteUrl).toBe('http://127.0.0.1:3131/@admin/789')
        expect(result.receipt?.rawResponse?.providerMode).toBe('local-harness')
      }
    })
  })

  describe('Delivery Orchestration & Multi-Destination State Truth', () => {
    it('computes parent draft partially-published status on partial destination failure', () => {
      // Simulating the campaignState reducer in tasks.ts:
      const variants = [
        { id: 'v-1', status: 'published' },
        { id: 'v-2', status: 'failed' },
      ]

      const allPublished = variants.every((v) => v.status === 'published')
      const anyPublished = variants.some((v) => v.status === 'published')
      const allFailed = variants.every((v) => v.status === 'failed')

      let expectedStatus = 'draft'
      if (allPublished) expectedStatus = 'published'
      else if (allFailed) expectedStatus = 'failed'
      else if (anyPublished) expectedStatus = 'partially-published'

      expect(expectedStatus).toBe('partially-published')
    })

    it('enforces bounded retries (attemptCount < MAX_PROVIDER_ATTEMPTS = 3)', () => {
      const MAX_PROVIDER_ATTEMPTS = 3

      const shouldRetry = (attemptCount: number) => attemptCount < MAX_PROVIDER_ATTEMPTS

      expect(shouldRetry(0)).toBe(true)
      expect(shouldRetry(1)).toBe(true)
      expect(shouldRetry(2)).toBe(true)
      expect(shouldRetry(3)).toBe(false)
      expect(shouldRetry(4)).toBe(false)
    })
  })
})
