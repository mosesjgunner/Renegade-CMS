import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MastodonAdapter,
  mastodonAdapter,
} from '../../src/modules/social/adapters/mastodon'
import {
  BlueskyAdapter,
  blueskyAdapter,
  parseRichTextFacets,
} from '../../src/modules/social/adapters/bluesky'
import {
  LinkedInAdapter,
  linkedinAdapter,
} from '../../src/modules/social/adapters/linkedin'
import {
  adaptImageBuffer,
  planMediaAdaptation,
  validateMediaForNetwork,
} from '../../src/modules/social/media-pipeline'
import {
  type AuthContext,
  type MediaResolver,
  type SocialVariant,
} from '../../src/modules/social/contracts'
import { executeDatabaseStep } from '../../src/modules/releases/saga'
import { type Payload } from 'payload'

describe('Pass DIST-02: Open Protocols, Core 5 Adapters & Media Adaptation Pipeline', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  // Mock Media Resolver
  const mockMediaResolver: MediaResolver = {
    resolveUrl: async (id: string) => `https://renegadeparty.org/media/${id}.jpg`,
    resolveBuffer: async (id: string) => ({
      buffer: Buffer.from(`mock-image-data-for-${id}`),
      mimeType: 'image/jpeg',
      fileName: `${id}.jpg`,
    }),
  }

  // =========================================================================
  // 1. Mastodon ActivityPub Adapter
  // =========================================================================
  describe('Mastodon ActivityPub Adapter', () => {
    const authContext: AuthContext = {
      accountId: 'acc-mastodon-1',
      accountHandle: '@renegade@mastodon.social',
      network: 'mastodon',
      credentials: {
        token: 'mastodon-bearer-token-12345',
        instanceUrl: 'https://mastodon.social',
      },
    }

    it('validates character ceiling, attachment limits, and poll restrictions', () => {
      const adapter = new MastodonAdapter()

      // Empty status
      const emptyRep = adapter.validatePost({
        id: 'v1',
        accountId: 'a1',
        network: 'mastodon',
        text: '   ',
        attachments: [],
        status: 'draft',
        idempotencyKey: 'idemp-1',
      })
      expect(emptyRep.isValid).toBe(false)
      expect(emptyRep.errors.some((e) => e.code === 'EMPTY_STATUS')).toBe(true)

      // Exceeds 500 characters
      const longRep = adapter.validatePost({
        id: 'v1',
        accountId: 'a1',
        network: 'mastodon',
        text: 'A'.repeat(501),
        attachments: [],
        status: 'draft',
        idempotencyKey: 'idemp-1',
      })
      expect(longRep.isValid).toBe(false)
      expect(longRep.errors.some((e) => e.code === 'TEXT_TOO_LONG')).toBe(true)

      // Poll combined with media attachments is rejected
      const pollMediaRep = adapter.validatePost({
        id: 'v1',
        accountId: 'a1',
        network: 'mastodon',
        text: 'Which feature do you prefer?',
        attachments: [{ mediaAssetId: 'm1', role: 'image' }],
        status: 'draft',
        idempotencyKey: 'idemp-1',
        platformSettings: {
          poll: { options: ['Option 1', 'Option 2'] },
        },
      })
      expect(pollMediaRep.isValid).toBe(false)
      expect(pollMediaRep.errors.some((e) => e.code === 'POLL_WITH_MEDIA')).toBe(true)
    })

    it('publishes status with polls, content warnings, and sensitive flags', async () => {
      let requestedUrl = ''
      let requestedBody: any = null
      let requestedHeaders: Record<string, string> = {}

      globalThis.fetch = vi.fn(async (url: any, init: any) => {
        requestedUrl = String(url)
        requestedHeaders = init?.headers || {}
        requestedBody = init?.body ? JSON.parse(init.body) : null
        return new Response(
          JSON.stringify({
            id: 'mastodon-status-999',
            url: 'https://mastodon.social/@renegade/999',
            created_at: '2026-09-18T22:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as any

      const variant: SocialVariant = {
        id: 'var-mastodon-poll',
        accountId: 'acc-mastodon-1',
        network: 'mastodon',
        text: 'Check out the new Renegade release!',
        attachments: [],
        status: 'publishing',
        idempotencyKey: 'idemp-poll-1',
        platformSettings: {
          spoilerText: 'Content Warning: Release News',
          sensitive: true,
          visibility: 'public',
          poll: {
            options: ['Alpha', 'Beta', 'Gamma'],
            expiresInSeconds: 3600,
          },
        },
      }

      const result = await mastodonAdapter.publish(variant, authContext)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('mastodon-status-999')
        expect(result.remoteUrl).toBe('https://mastodon.social/@renegade/999')
      }

      expect(requestedUrl).toBe('https://mastodon.social/api/v1/statuses')
      expect(requestedHeaders['Authorization']).toBe('Bearer mastodon-bearer-token-12345')
      expect(requestedBody.status).toBe('Check out the new Renegade release!')
      expect(requestedBody.spoiler_text).toBe('Content Warning: Release News')
      expect(requestedBody.sensitive).toBe(true)
      expect(requestedBody.poll.options).toEqual(['Alpha', 'Beta', 'Gamma'])
    })

    it('handles media upload and status editing', async () => {
      let editPayload: any = null
      globalThis.fetch = vi.fn(async (url: any, init: any) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/v2/media')) {
          return new Response(JSON.stringify({ id: 'mastodon-media-555' }), { status: 200 })
        }
        if (urlStr.includes('/api/v1/statuses/status-to-edit') && init?.method === 'PUT') {
          editPayload = JSON.parse(init.body)
          return new Response(
            JSON.stringify({
              id: 'status-to-edit',
              url: 'https://mastodon.social/@renegade/status-to-edit',
              edited_at: '2026-09-18T22:30:00.000Z',
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ id: 'status-new', url: 'https://mastodon.social/@renegade/status-new' }), {
          status: 200,
        })
      }) as any

      // Edit post
      const editReceipt = await mastodonAdapter.editPost?.(
        'status-to-edit',
        {
          id: 'var-edit',
          accountId: 'acc-1',
          network: 'mastodon',
          text: 'Corrected status text',
          attachments: [],
          status: 'published',
          idempotencyKey: 'idemp-edit',
          platformSettings: { spoilerText: 'Updated CW' },
        },
        authContext,
      )

      expect(editReceipt?.remotePostId).toBe('status-to-edit')
      expect(editPayload.status).toBe('Corrected status text')
      expect(editPayload.spoiler_text).toBe('Updated CW')
    })
  })

  // =========================================================================
  // 2. Bluesky AT Protocol Adapter
  // =========================================================================
  describe('Bluesky AT Protocol Adapter', () => {
    it('correctly calculates UTF-8 byte offsets for rich text facets (emojis, URLs, mentions)', () => {
      // "✨ Party at https://renegadeparty.org with @alice.bsky.social #release 🎉"
      // '✨' is 3 bytes, '🎉' is 4 bytes in UTF-8!
      const text = '✨ Party at https://renegadeparty.org with @alice.bsky.social #release 🎉'
      const facets = parseRichTextFacets(text)

      expect(facets).toHaveLength(3)

      // URL facet
      const urlFacet = facets.find((f) => f.features[0].$type === 'app.bsky.richtext.facet#link')
      expect(urlFacet).toBeDefined()
      expect((urlFacet!.features[0] as any).uri).toBe('https://renegadeparty.org')

      // Verify that byte slice matches the exact string
      const textBytes = new TextEncoder().encode(text)
      const extractedUrl = new TextDecoder().decode(textBytes.slice(urlFacet!.index.byteStart, urlFacet!.index.byteEnd))
      expect(extractedUrl).toBe('https://renegadeparty.org')

      // Mention facet
      const mentionFacet = facets.find((f) => f.features[0].$type === 'app.bsky.richtext.facet#mention')
      expect(mentionFacet).toBeDefined()
      const extractedMention = new TextDecoder().decode(
        textBytes.slice(mentionFacet!.index.byteStart, mentionFacet!.index.byteEnd),
      )
      expect(extractedMention).toBe('@alice.bsky.social')

      // Tag facet
      const tagFacet = facets.find((f) => f.features[0].$type === 'app.bsky.richtext.facet#tag')
      expect(tagFacet).toBeDefined()
      expect((tagFacet!.features[0] as any).tag).toBe('release')
    })

    it('rejects image blobs exceeding 1,000,000 bytes', async () => {
      const adapter = new BlueskyAdapter()
      const oversizedBuffer = Buffer.alloc(1000001) // 1MB + 1 byte

      await expect(
        adapter.uploadBlob('https://bsky.social', 'access-jwt', oversizedBuffer, 'image/jpeg'),
      ).rejects.toThrow(/exceeds 1,000,000 byte limit/)
    })

    it('establishes session, attaches link card, and creates record on app.bsky.feed.post', async () => {
      let sessionCreated = false
      let recordCreatedPayload: any = null

      globalThis.fetch = vi.fn(async (url: any, init: any) => {
        const urlStr = String(url)
        if (urlStr.includes('/xrpc/com.atproto.server.createSession')) {
          sessionCreated = true
          return new Response(
            JSON.stringify({
              accessJwt: 'jwt-access-token',
              refreshJwt: 'jwt-refresh-token',
              did: 'did:plc:renegade123',
              handle: 'renegade.bsky.social',
            }),
            { status: 200 },
          )
        }
        if (urlStr.includes('/xrpc/com.atproto.repo.createRecord')) {
          recordCreatedPayload = JSON.parse(init.body)
          return new Response(
            JSON.stringify({
              uri: 'at://did:plc:renegade123/app.bsky.feed.post/3k6abc123xyz',
              cid: 'bafyreicidxyz',
            }),
            { status: 200 },
          )
        }
        return new Response('{}', { status: 200 })
      }) as any

      const variant: SocialVariant = {
        id: 'var-bsky-1',
        accountId: 'acc-bsky-1',
        network: 'bluesky',
        text: 'New decentralized article: https://renegadeparty.org/post/1',
        linkUrl: 'https://renegadeparty.org/post/1',
        attachments: [],
        status: 'publishing',
        idempotencyKey: 'idemp-bsky-1',
      }

      const authContext: AuthContext = {
        accountId: 'acc-bsky-1',
        accountHandle: 'renegade.bsky.social',
        network: 'bluesky',
        credentials: {
          identifier: 'renegade.bsky.social',
          appPassword: 'mock-app-password',
        },
      }

      const result = await blueskyAdapter.publish(variant, authContext)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('at://did:plc:renegade123/app.bsky.feed.post/3k6abc123xyz')
        expect(result.remoteUrl).toBe('https://bsky.app/profile/renegade.bsky.social/post/3k6abc123xyz')
      }

      expect(sessionCreated).toBe(true)
      expect(recordCreatedPayload.collection).toBe('app.bsky.feed.post')
      expect(recordCreatedPayload.record.embed.$type).toBe('app.bsky.embed.external')
      expect(recordCreatedPayload.record.embed.external.uri).toBe('https://renegadeparty.org/post/1')
    })
  })

  // =========================================================================
  // 3. LinkedIn Posts Adapter
  // =========================================================================
  describe('LinkedIn Posts Adapter', () => {
    it('enforces version headers and handles multi-image post initialization', async () => {
      let initUploadCalled = false
      let postHeaders: Record<string, string> = {}
      let postPayload: any = null

      globalThis.fetch = vi.fn(async (url: any, init: any) => {
        const urlStr = String(url)
        if (urlStr.includes('/rest/images?action=initializeUpload')) {
          initUploadCalled = true
          return new Response(
            JSON.stringify({
              value: {
                uploadUrl: 'https://media.licdn.com/upload-signed-url-123',
                image: 'urn:li:image:img-asset-123',
              },
            }),
            { status: 200 },
          )
        }
        if (urlStr.includes('upload-signed-url-123')) {
          return new Response('', { status: 201 })
        }
        if (urlStr.includes('/rest/posts')) {
          postHeaders = init?.headers || {}
          postPayload = JSON.parse(init.body)
          return new Response(
            JSON.stringify({ id: 'urn:li:share:share-789' }),
            {
              status: 201,
              headers: { 'x-restli-id': 'urn:li:share:share-789' },
            },
          )
        }
        return new Response('{}', { status: 200 })
      }) as any

      const variant: SocialVariant = {
        id: 'var-li-1',
        accountId: 'acc-li-1',
        network: 'linkedin',
        text: 'Executive thought leadership post on sovereign systems.',
        attachments: [{ mediaAssetId: 'asset-hero-1', role: 'image', altText: 'Hero chart' }],
        status: 'publishing',
        idempotencyKey: 'idemp-li-1',
        platformSettings: {
          authorUrn: 'urn:li:organization:998877',
        },
      }

      const authContext: AuthContext = {
        accountId: 'acc-li-1',
        accountHandle: 'Renegade Organization',
        network: 'linkedin',
        credentials: {
          accessToken: 'linkedin-oauth-access-token',
        },
      }

      const result = await linkedinAdapter.publish(variant, authContext, mockMediaResolver)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('urn:li:share:share-789')
        expect(result.remoteUrl).toContain('urn%3Ali%3Ashare%3Ashare-789')
      }

      expect(initUploadCalled).toBe(true)
      expect(postHeaders['LinkedIn-Version']).toBe('202603')
      expect(postHeaders['X-Restli-Protocol-Version']).toBe('2.0.0')
      expect(postPayload.author).toBe('urn:li:organization:998877')
      expect(postPayload.content.media.id).toBe('urn:li:image:img-asset-123')
    })
  })

  // =========================================================================
  // 4. Media Adaptation Pipeline
  // =========================================================================
  describe('Media Adaptation Pipeline', () => {
    it('plans format conversion and compression based on target network rules', () => {
      // WebP image for Instagram (which requires JPEG)
      const webpAsset = {
        id: 'asset-webp-1',
        fileName: 'cover.webp',
        mimeType: 'image/webp',
        fileSizeBytes: 2 * 1024 * 1024,
        aspectRatio: 1.0,
      }

      const igPlan = planMediaAdaptation(webpAsset, 'instagram')
      expect(igPlan.needsFormatConversion).toBe(true)
      expect(igPlan.targetMimeType).toBe('image/jpeg')
      expect(igPlan.needsCompression).toBe(false)

      // Oversized 2MB image for Bluesky (which caps at 1MB)
      const bskyPlan = planMediaAdaptation(webpAsset, 'bluesky')
      expect(bskyPlan.needsCompression).toBe(true)
      expect(bskyPlan.maxFileSizeBytes).toBe(1000000)

      // Wide image (16:9 = 1.77) for Pinterest (which expects 2:3 = 0.67)
      const wideAsset = {
        id: 'asset-wide',
        fileName: 'banner.png',
        mimeType: 'image/png',
        fileSizeBytes: 500000,
        aspectRatio: 1.77,
      }

      const pinPlan = planMediaAdaptation(wideAsset, 'pinterest')
      expect(pinPlan.needsResize).toBe(true)
      expect(pinPlan.actionSummary.some((a) => a.includes('Adjust aspect ratio'))).toBe(true)
    })

    it('validates compliance and transforms buffer accordingly', () => {
      const asset = {
        id: 'asset-sim',
        fileName: 'sample.png',
        mimeType: 'image/png',
        fileSizeBytes: 1500000,
        aspectRatio: 1.0,
      }

      const validation = validateMediaForNetwork(asset, 'bluesky')
      expect(validation.isValid).toBe(false) // exceeds 1MB
      expect(validation.blockers.some((b) => b.includes('1,000,000 byte limit'))).toBe(true)

      const plan = planMediaAdaptation(asset, 'bluesky')
      const originalBuffer = Buffer.alloc(1500000)
      const adapted = adaptImageBuffer(originalBuffer, 'image/png', plan)

      expect(adapted.wasTransformed).toBe(true)
      expect(adapted.buffer.length).toBeLessThanOrEqual(1000000)
    })
  })

  // =========================================================================
  // 5. Coordinated Release Distribution Saga Step
  // =========================================================================
  describe('FLOW-04/FLOW-06 Coordinated Release Distribution Integration', () => {
    it('executes distribution artifact step in release saga', async () => {
      const mockPayload: Partial<Payload> = {
        findByID: vi.fn(),
        update: vi.fn(),
      }

      const release = {
        id: 'rel-campaign-launch',
        siteId: 'site-alpha',
        name: 'Autumn Launch',
      }

      const distributionItem = {
        id: 'dist-art-1',
        title: 'Campaign Distribution Release',
        targetType: 'distribution' as const,
        targetId: 'social-post-campaign-1',
        distributionDraftId: 'draft-dist-autumn',
        canonicalUrl: 'https://renegadeparty.org/campaigns/autumn',
        pinnedRevisionSequence: 1,
        pinnedHash: 'sha256-dist-hash',
        status: 'pending' as const,
        attempts: 0,
        updatedAt: new Date().toISOString(),
      }

      const result = await executeDatabaseStep(mockPayload as Payload, release, distributionItem, 'user-publisher')
      expect(result.output.distributed).toBe(true)
      expect(result.output.distributionDraftId).toBe('draft-dist-autumn')
      expect(result.url).toBe('https://renegadeparty.org/campaigns/autumn')
    })
  })
})
