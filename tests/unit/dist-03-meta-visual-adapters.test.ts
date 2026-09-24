import { describe, it, expect, afterEach, vi } from 'vitest'
import { FacebookAdapter } from '@/modules/social/adapters/facebook'
import { InstagramAdapter } from '@/modules/social/adapters/instagram'
import { ThreadsAdapter } from '@/modules/social/adapters/threads'
import { PinterestAdapter } from '@/modules/social/adapters/pinterest'
import type { SocialVariant, MediaResolver, AuthContext } from '@/modules/social/contracts'

function createTestVariant(overrides: Partial<SocialVariant> = {}): SocialVariant {
  return {
    id: 'var-test-1',
    accountId: 'acc-test-1',
    network: 'facebook',
    text: 'Test post',
    attachments: [],
    status: 'draft',
    idempotencyKey: 'idem-12345',
    ...overrides,
  }
}

describe('Pass DIST-03: Meta & Visual Social Adapters', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  const mockMediaResolver: MediaResolver = {
    resolveUrl: async (assetId: string) => `https://cdn.renegade.media/${assetId}.jpg`,
    resolveBuffer: async (assetId: string) => ({
      buffer: Buffer.from(`mock-image-bytes-${assetId}`),
      mimeType: 'image/jpeg',
      fileName: `${assetId}.jpg`,
    }),
  }

  describe('FacebookAdapter (Pages Graph API)', () => {
    const adapter = new FacebookAdapter()
    const context: AuthContext = {
      accountId: 'fb-page-123',
      accountHandle: 'RenegadePage',
      network: 'facebook',
      credentials: {
        pageId: 'page_98765',
        pageToken: 'EAAB_test_page_token_xyz',
      },
    }

    it('validates text limits and max attachment boundaries', () => {
      const validVariant = createTestVariant({
        network: 'facebook',
        text: 'Hello from Renegade Facebook!',
        attachments: [],
      })
      expect(adapter.validatePost(validVariant).isValid).toBe(true)

      const tooLongVariant = createTestVariant({
        network: 'facebook',
        text: 'A'.repeat(63207),
        attachments: [],
      })
      const invalid = adapter.validatePost(tooLongVariant)
      expect(invalid.isValid).toBe(false)
      expect(invalid.errors.some((e) => e.code === 'TEXT_TOO_LONG')).toBe(true)
    })

    it('publishes a single direct photo using multipart upload', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/photos')) {
          return new Response(JSON.stringify({ id: 'fb_photo_1001' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'facebook',
        text: 'Single photo dispatch',
        attachments: [{ mediaAssetId: 'photo-hero', role: 'image' }],
      })

      const result = await adapter.publish(variant, context, mockMediaResolver)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('fb_photo_1001')
        expect(result.remoteUrl).toContain('facebook.com/page_98765/posts/fb_photo_1001')
      }
    })

    it('publishes a multi-image album via unpublished staging and feed creation', async () => {
      const calls: string[] = []
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${url}`)
        if (url.includes('/photos')) {
          return new Response(JSON.stringify({ id: `fb_photo_${calls.length}` }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('/feed')) {
          const body = JSON.parse(init?.body as string)
          expect(body.attached_media).toHaveLength(2)
          return new Response(JSON.stringify({ id: 'page_98765_album_post_42' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'facebook',
        text: 'Multi-image photo album',
        attachments: [
          { mediaAssetId: 'img1', role: 'image' },
          { mediaAssetId: 'img2', role: 'image' },
        ],
      })

      const result = await adapter.publish(variant, context, mockMediaResolver)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('page_98765_album_post_42')
      }
      expect(calls).toHaveLength(3) // 2 photo uploads + 1 feed post
    })

    it('publishes a feed post with link preview metadata', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/feed')) {
          const body = JSON.parse(init?.body as string)
          expect(body.link).toBe('https://renegade.media/post-1')
          expect(body.message).toBe('Check this link out')
          return new Response(JSON.stringify({ id: 'page_98765_feed_link_post' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'facebook',
        text: 'Check this link out',
        linkUrl: 'https://renegade.media/post-1',
        attachments: [],
      })

      const result = await adapter.publish(variant, context)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('page_98765_feed_link_post')
      }
    })

    it('handles rate limits gracefully (429 / Page Request Limit)', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: 'User request limit reached',
              code: 32,
              error_subcode: 2446079,
            },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '300' } },
        )
      })

      const variant = createTestVariant({
        network: 'facebook',
        text: 'Hello rate limited world',
        attachments: [],
      })

      const result = await adapter.publish(variant, context)
      expect(result.status).toBe('failed')
      if (result.status === 'failed') {
        expect(result.error?.kind).toBe('rate-limit')
      }
    })

    it('deletes a published post via deletePost', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(init?.method).toBe('DELETE')
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      })

      await expect(adapter.deletePost('fb_post_999', context)).resolves.toBeUndefined()
    })
  })

  describe('InstagramAdapter (Instagram Graph API)', () => {
    const adapter = new InstagramAdapter()
    const context: AuthContext = {
      accountId: 'ig-account-123',
      accountHandle: 'renegade_media',
      network: 'instagram',
      credentials: {
        igUserId: '17841400000000001',
        accessToken: 'IGAA_test_access_token',
      },
    }

    it('enforces mandatory media and maximum 30 hashtags', () => {
      const textOnlyVariant = createTestVariant({
        network: 'instagram',
        text: 'Just text on IG',
        attachments: [],
      })
      const val1 = adapter.validatePost(textOnlyVariant)
      expect(val1.isValid).toBe(false)
      expect(val1.errors[0].code).toBe('MEDIA_REQUIRED')

      const hashtags31 = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ')
      const tooManyTags = createTestVariant({
        network: 'instagram',
        text: hashtags31,
        attachments: [{ mediaAssetId: 'pic1', role: 'image' }],
      })
      const val2 = adapter.validatePost(tooManyTags)
      expect(val2.isValid).toBe(false)
      expect(val2.errors[0].code).toBe('TOO_MANY_HASHTAGS')
    })

    it('executes 2-step single media container and publish flow', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/media')) {
          const body = JSON.parse(init?.body as string)
          expect(body.image_url).toBe('https://cdn.renegade.media/hero.jpg')
          return new Response(JSON.stringify({ id: 'container_single_101' }), { status: 200 })
        }
        if (url.includes('/container_single_101?fields=status_code')) {
          return new Response(JSON.stringify({ status_code: 'FINISHED' }), { status: 200 })
        }
        if (url.endsWith('/media_publish')) {
          const body = JSON.parse(init?.body as string)
          expect(body.creation_id).toBe('container_single_101')
          return new Response(JSON.stringify({ id: 'ig_media_post_202' }), { status: 200 })
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'instagram',
        text: 'Sunset in the metropolis',
        attachments: [{ mediaAssetId: 'hero', role: 'image' }],
      })

      const result = await adapter.publish(variant, context, mockMediaResolver)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('ig_media_post_202')
      }
    })

    it('coordinates multi-item carousel container synchronization', async () => {
      const createdContainers: string[] = []
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/media')) {
          const body = JSON.parse(init?.body as string)
          if (body.is_carousel_item) {
            const childId = `child_cont_${createdContainers.length + 1}`
            createdContainers.push(childId)
            return new Response(JSON.stringify({ id: childId }), { status: 200 })
          }
          if (body.media_type === 'CAROUSEL') {
            expect(body.children).toEqual(['child_cont_1', 'child_cont_2'])
            return new Response(JSON.stringify({ id: 'carousel_parent_99' }), { status: 200 })
          }
        }
        if (url.includes('status_code')) {
          return new Response(JSON.stringify({ status_code: 'FINISHED' }), { status: 200 })
        }
        if (url.endsWith('/media_publish')) {
          return new Response(JSON.stringify({ id: 'ig_carousel_post_final' }), { status: 200 })
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'instagram',
        text: 'Carousel of 2 photos',
        attachments: [
          { mediaAssetId: 'p1', role: 'image' },
          { mediaAssetId: 'p2', role: 'image' },
        ],
      })

      const result = await adapter.publish(variant, context, mockMediaResolver)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('ig_carousel_post_final')
      }
    })

    it('traps daily 25-post quota exhaustion (error code 9007)', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/media')) {
          return new Response(
            JSON.stringify({
              error: {
                message: 'You have reached the maximum number of posts allowed (25)',
                code: 9007,
              },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'instagram',
        text: 'Post 26 of the day',
        attachments: [{ mediaAssetId: 'p1', role: 'image' }],
      })

      const result = await adapter.publish(variant, context, mockMediaResolver)
      expect(result.status).toBe('failed')
      if (result.status === 'failed') {
        expect(result.error?.message).toContain('Instagram daily publishing limit reached')
      }
    })
  })

  describe('ThreadsAdapter (Threads Graph API)', () => {
    const adapter = new ThreadsAdapter()
    const context: AuthContext = {
      accountId: 'th-account-123',
      accountHandle: 'renegadethreads',
      network: 'threads',
      credentials: {
        threadsUserId: 'th_user_4444',
        accessToken: 'TH_test_token',
      },
    }

    it('enforces 500-character ceiling', () => {
      const okVariant = createTestVariant({
        network: 'threads',
        text: 'Short thread post',
        attachments: [],
      })
      expect(adapter.validatePost(okVariant).isValid).toBe(true)

      const badVariant = createTestVariant({
        network: 'threads',
        text: 'A'.repeat(501),
        attachments: [],
      })
      const val = adapter.validatePost(badVariant)
      expect(val.isValid).toBe(false)
      expect(val.errors[0].code).toBe('TEXT_TOO_LONG')
    })

    it('normalizes topic tag and reply controls', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/threads')) {
          const body = JSON.parse(init?.body as string)
          expect(body.topic_tag).toBe('BuildInPublic') // stripped leading #
          expect(body.reply_control).toBe('mentioned_only')
          return new Response(JSON.stringify({ id: 'th_container_55' }), { status: 200 })
        }
        if (url.includes('/th_container_55?fields=status')) {
          return new Response(JSON.stringify({ status: 'FINISHED' }), { status: 200 })
        }
        if (url.endsWith('/threads_publish')) {
          return new Response(JSON.stringify({ id: 'th_post_7777' }), { status: 200 })
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'threads',
        text: 'Shipping updates today!',
        attachments: [],
        platformSettings: {
          topicTag: '#BuildInPublic',
          replyControl: 'mentioned_only',
        },
      })

      const result = await adapter.publish(variant, context)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('th_post_7777')
      }
    })

    it('deletes a Threads post via deletePost', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(init?.method).toBe('DELETE')
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      })

      await expect(adapter.deletePost('th_post_7777', context)).resolves.toBeUndefined()
    })
  })

  describe('PinterestAdapter (Pinterest API v5)', () => {
    const adapter = new PinterestAdapter()
    const context: AuthContext = {
      accountId: 'pin-account-123',
      accountHandle: 'renegade_pins',
      network: 'pinterest',
      credentials: {
        accessToken: 'pina_test_token_v5',
        boardId: 'board_main_101',
      },
    }

    it('validates mandatory media and description length', () => {
      const noMediaVariant = createTestVariant({
        network: 'pinterest',
        text: 'Just description without pin image',
        attachments: [],
      })
      const val1 = adapter.validatePost(noMediaVariant)
      expect(val1.isValid).toBe(false)
      expect(val1.errors.some((e) => e.code === 'MEDIA_REQUIRED')).toBe(true)

      const longDescVariant = createTestVariant({
        network: 'pinterest',
        text: 'B'.repeat(501),
        attachments: [{ mediaAssetId: 'pin1', role: 'image' }],
        platformSettings: { boardId: 'board_main_101' },
      })
      const val2 = adapter.validatePost(longDescVariant)
      expect(val2.isValid).toBe(false)
      expect(val2.errors.some((e) => e.code === 'DESCRIPTION_TOO_LONG')).toBe(true)
    })

    it('requires boardId for publishing', async () => {
      const variant = createTestVariant({
        network: 'pinterest',
        text: 'Valid description',
        attachments: [{ mediaAssetId: 'pin1', role: 'image' }],
      })
      const emptyContext: AuthContext = {
        accountId: 'pin-acc',
        accountHandle: 'pin_handle',
        network: 'pinterest',
        credentials: { accessToken: 'valid_token' }, // missing boardId
      }

      const result = await adapter.publish(variant, emptyContext, mockMediaResolver)
      expect(result.status).toBe('failed')
      if (result.status === 'failed') {
        expect(result.error?.message).toContain('requires a target boardId')
      }
    })

    it('publishes a pin with 2:3 vertical aspect ratio image source', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/pins')) {
          const body = JSON.parse(init?.body as string)
          expect(body.board_id).toBe('board_main_101')
          expect(body.media_source.source_type).toBe('image_url')
          expect(body.media_source.url).toBe('https://cdn.renegade.media/pin_hero.jpg')
          expect(body.title).toBe('Design Showcase')
          return new Response(
            JSON.stringify({
              id: 'pin_888888',
              board_id: 'board_main_101',
              title: 'Design Showcase',
            }),
            { status: 201 },
          )
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'pinterest',
        text: 'Detailed design showcase description',
        attachments: [{ mediaAssetId: 'pin_hero', role: 'image' }],
        platformSettings: {
          boardId: 'board_main_101',
          pinTitle: 'Design Showcase',
        },
      })

      const result = await adapter.publish(variant, context, mockMediaResolver)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('pin_888888')
        expect(result.remoteUrl).toContain('pinterest.com/pin/pin_888888')
      }
    })

    it('retrieves user boards via v5 API', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/boards')) {
          return new Response(
            JSON.stringify({
              items: [
                { id: 'b1', name: 'Editorial Inspiration' },
                { id: 'b2', name: 'Graphics & Covers' },
              ],
            }),
            { status: 200 },
          )
        }
        return new Response('Not Found', { status: 404 })
      })

      const boards = await adapter.getBoards(context)
      expect(boards).toHaveLength(2)
      expect(boards[0].name).toBe('Editorial Inspiration')
    })

    it('deletes a published pin via deletePost', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(init?.method).toBe('DELETE')
        expect(url).toContain('/pins/pin_888888')
        return new Response(null, { status: 204 })
      })

      await expect(adapter.deletePost('pin_888888', context)).resolves.toBeUndefined()
    })
  })
})
