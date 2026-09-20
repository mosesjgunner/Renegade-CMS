import { describe, it, expect, afterEach, vi } from 'vitest'
import { YouTubeAdapter } from '@/modules/social/adapters/youtube'
import { TikTokAdapter } from '@/modules/social/adapters/tiktok'
import { XAdapter } from '@/modules/social/adapters/x'
import { aggregateAnalytics, SocialAnalyticsCollector } from '@/modules/social/analytics'
import type {
  SocialVariant,
  MediaResolver,
  AuthContext,
  NormalizedAnalytics,
} from '@/modules/social/contracts'

function createTestVariant(overrides: Partial<SocialVariant> = {}): SocialVariant {
  return {
    id: 'var-test-dist04',
    accountId: 'acc-test-dist04',
    network: 'youtube',
    text: 'Standard test text description',
    attachments: [],
    status: 'draft',
    idempotencyKey: 'idem-dist04-1',
    ...overrides,
  }
}

describe('Pass DIST-04: Video Pipelines, Monetized APIs & Unified Analytics', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  const mockMediaResolver: MediaResolver = {
    resolveUrl: async (assetId: string) => `https://cdn.renegade.media/${assetId}.mp4`,
    resolveBuffer: async (assetId: string) => ({
      buffer: Buffer.from(`mock-binary-video-stream-${assetId}`),
      mimeType: 'video/mp4',
      fileName: `${assetId}.mp4`,
    }),
  }

  describe('YouTubeAdapter (Data API v3 Resumable Uploads)', () => {
    const adapter = new YouTubeAdapter()
    const context: AuthContext = {
      accountId: 'yt-channel-1',
      accountHandle: 'RenegadeBroadcasting',
      network: 'youtube',
      credentials: {
        channelId: 'UC1234567890',
        accessToken: 'ya29.google_oauth_test_token',
      },
    }

    it('validates video requirement, title length and single attachment constraint', () => {
      const noVideoVariant = createTestVariant({
        network: 'youtube',
        text: 'Description without video',
        attachments: [],
      })
      const val1 = adapter.validatePost(noVideoVariant)
      expect(val1.isValid).toBe(false)
      expect(val1.errors.some((e) => e.code === 'VIDEO_REQUIRED')).toBe(true)

      const imageVariant = createTestVariant({
        network: 'youtube',
        text: 'Image instead of video',
        attachments: [{ mediaAssetId: 'photo1', role: 'image' }],
      })
      const val2 = adapter.validatePost(imageVariant)
      expect(val2.isValid).toBe(false)
      expect(val2.errors.some((e) => e.code === 'INVALID_MEDIA_TYPE')).toBe(true)

      const tooLongTitleVariant = createTestVariant({
        network: 'youtube',
        text: 'Valid description',
        attachments: [{ mediaAssetId: 'vid1', role: 'video' }],
        platformSettings: { videoTitle: 'T'.repeat(101) },
      })
      const val3 = adapter.validatePost(tooLongTitleVariant)
      expect(val3.isValid).toBe(false)
      expect(val3.errors.some((e) => e.code === 'TITLE_TOO_LONG')).toBe(true)
    })

    it('executes Google resumable upload protocol flow (INIT session -> PUT binary chunk)', async () => {
      const calls: string[] = []
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${url}`)
        if (url.includes('uploadType=resumable')) {
          return new Response(null, {
            status: 200,
            headers: {
              Location:
                'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=session_abc123',
            },
          })
        }
        if (url.includes('upload_id=session_abc123')) {
          expect(init?.method).toBe('PUT')
          return new Response(JSON.stringify({ id: 'yt_video_99999' }), { status: 200 })
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'youtube',
        text: 'Episode 42: The Future of Sovereign Media',
        attachments: [{ mediaAssetId: 'vid-ep42', role: 'video' }],
        platformSettings: {
          videoTitle: 'Future of Sovereign Media',
          privacyStatus: 'public',
        },
      })

      const result = await adapter.publish(variant, context, mockMediaResolver)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('yt_video_99999')
        expect(result.remoteUrl).toBe('https://www.youtube.com/watch?v=yt_video_99999')
      }
      expect(calls).toHaveLength(2)
    })

    it('deletes a video via deletePost', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(init?.method).toBe('DELETE')
        expect(url).toContain('id=yt_video_99999')
        return new Response(null, { status: 204 })
      })

      await expect(adapter.deletePost('yt_video_99999', context)).resolves.toBeUndefined()
    })
  })

  describe('TikTokAdapter (Content Posting API v2)', () => {
    const adapter = new TikTokAdapter()
    const context: AuthContext = {
      accountId: 'tt-acc-1',
      accountHandle: 'renegade_shorts',
      network: 'tiktok',
      credentials: {
        accessToken: 'act.tiktok_bearer_token_test',
      },
    }

    it('enforces video attachment and 2200 character caption limit', () => {
      const tooLongVariant = createTestVariant({
        network: 'tiktok',
        text: 'C'.repeat(2201),
        attachments: [{ mediaAssetId: 'vid1', role: 'video' }],
      })
      const val = adapter.validatePost(tooLongVariant)
      expect(val.isValid).toBe(false)
      expect(val.errors.some((e) => e.code === 'CAPTION_TOO_LONG')).toBe(true)
    })

    it('queries creator info for permissions and max video duration', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('creator_info/query')) {
          return new Response(
            JSON.stringify({
              data: {
                creator_avatar_url: 'https://p16.tiktokcdn.com/avatar.jpg',
                creator_nickname: 'Renegade Creator',
                creator_username: 'renegade_creator',
                privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
                comment_disabled: false,
                duet_disabled: false,
                stitch_disabled: false,
                max_video_post_duration_sec: 600,
              },
            }),
            { status: 200 },
          )
        }
        return new Response('Not Found', { status: 404 })
      })

      const info = await adapter.queryCreatorInfo('test_token')
      expect(info.creator_username).toBe('renegade_creator')
      expect(info.max_video_post_duration_sec).toBe(600)
    })

    it('publishes video through init and binary chunk upload', async () => {
      const calls: string[] = []
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${url}`)
        if (url.includes('/video/init/')) {
          return new Response(
            JSON.stringify({
              data: {
                publish_id: 'v_pub_tiktok_777',
                upload_url: 'https://storage.tiktok.com/upload/chunk_777',
              },
            }),
            { status: 200 },
          )
        }
        if (url.includes('/upload/chunk_777')) {
          expect(init?.method).toBe('PUT')
          return new Response(null, { status: 200 })
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'tiktok',
        text: 'Behind the scenes at Renegade CMoS! #freedom #tech',
        attachments: [{ mediaAssetId: 'vid-bts', role: 'video' }],
      })

      const result = await adapter.publish(variant, context, mockMediaResolver)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('v_pub_tiktok_777')
        expect(result.remoteUrl).toContain('tiktok.com/@creator/video/v_pub_tiktok_777')
      }
      expect(calls).toHaveLength(2)
    })
  })

  describe('XAdapter (Twitter API v2 & Chunked Media Upload)', () => {
    const adapter = new XAdapter()
    const context: AuthContext = {
      accountId: 'x-acc-1',
      accountHandle: 'renegade_hq',
      network: 'x',
      credentials: {
        accessToken: 'AAAA_x_bearer_token',
      },
    }

    it('applies 23-character t.co weighting for URLs and validates character ceilings', () => {
      // "Check this out: " (16 chars) + long URL (23 chars on X) = 39 chars
      const textWithUrl =
        'Check this out: https://very-long-subdomain.renegade.media/articles/2026/09/special-report-volume-1'
      const weight = adapter.calculateEffectiveCharacters(textWithUrl)
      expect(weight).toBe(16 + 23)

      const variant = createTestVariant({
        network: 'x',
        text: 'Z'.repeat(281),
        attachments: [],
      })
      const val = adapter.validatePost(variant)
      expect(val.isValid).toBe(false)
      expect(val.errors.some((e) => e.code === 'TEXT_TOO_LONG')).toBe(true)
    })

    it('publishes tweet with chunked media upload (INIT, APPEND, FINALIZE) and creates post', async () => {
      const calls: string[] = []
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${url}`)
        if (url.includes('upload.twitter.com/1.1/media/upload.json')) {
          if (url.includes('command=INIT')) {
            return new Response(JSON.stringify({ media_id_string: 'x_media_4444' }), {
              status: 200,
            })
          }
          if (init?.method === 'POST' && !url.includes('command=FINALIZE')) {
            return new Response(null, { status: 204 }) // APPEND
          }
          if (url.includes('command=FINALIZE')) {
            return new Response(
              JSON.stringify({
                media_id_string: 'x_media_4444',
                processing_info: { state: 'succeeded' },
              }),
              { status: 200 },
            )
          }
        }
        if (url.includes('api.twitter.com/2/tweets')) {
          const body = JSON.parse(init?.body as string)
          expect(body.media.media_ids).toEqual(['x_media_4444'])
          expect(body.text).toBe('Breaking dispatch with visual attachment')
          return new Response(
            JSON.stringify({
              data: { id: 'tweet_1234567890', text: body.text },
            }),
            { status: 201 },
          )
        }
        return new Response('Not Found', { status: 404 })
      })

      const variant = createTestVariant({
        network: 'x',
        text: 'Breaking dispatch with visual attachment',
        attachments: [{ mediaAssetId: 'breaking-banner', role: 'image' }],
      })

      const result = await adapter.publish(variant, context, mockMediaResolver)
      expect(result.status).toBe('published')
      if (result.status === 'published') {
        expect(result.remoteId).toBe('tweet_1234567890')
        expect(result.remoteUrl).toBe('https://x.com/i/web/status/tweet_1234567890')
      }
    })

    it('deletes a tweet via deletePost', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(init?.method).toBe('DELETE')
        expect(url).toContain('/tweets/tweet_1234567890')
        return new Response(JSON.stringify({ data: { deleted: true } }), { status: 200 })
      })

      await expect(adapter.deletePost('tweet_1234567890', context)).resolves.toBeUndefined()
    })
  })

  describe('Unified Social Analytics Ingestion', () => {
    it('aggregates metrics and computes engagement rate accurately across networks', () => {
      const reports: Array<{
        network: 'mastodon' | 'linkedin' | 'x'
        analytics: NormalizedAnalytics
      }> = [
        {
          network: 'mastodon',
          analytics: {
            deliveryId: 'del-masto',
            remotePostId: 'masto-1',
            retrievedAt: new Date(),
            metrics: {
              impressions: 1000,
              reach: 800,
              views: 950,
              clicks: 50,
              likes: 40,
              comments: 10,
              shares: 15,
              saves: 5,
              engagementRate: 11.5,
            },
            rawPlatformMetrics: {},
          },
        },
        {
          network: 'linkedin',
          analytics: {
            deliveryId: 'del-li',
            remotePostId: 'li-1',
            retrievedAt: new Date(),
            metrics: {
              impressions: 2000,
              reach: 1500,
              views: 1800,
              clicks: 120,
              likes: 80,
              comments: 20,
              shares: 10,
              saves: 15,
              engagementRate: 11.5,
            },
            rawPlatformMetrics: {},
          },
        },
      ]

      const aggregate = aggregateAnalytics(reports)
      expect(aggregate.totalImpressions).toBe(3000)
      expect(aggregate.totalReach).toBe(2300)
      expect(aggregate.totalClicks).toBe(170)
      expect(aggregate.totalLikes).toBe(120)
      expect(aggregate.totalComments).toBe(30)
      expect(aggregate.totalShares).toBe(25)

      // (120 likes + 30 comments + 25 shares + 170 clicks) = 345 / 3000 * 100 = 11.5%
      expect(aggregate.overallEngagementRate).toBe(11.5)
      expect(aggregate.networkBreakdown.mastodon.postsTracked).toBe(1)
      expect(aggregate.networkBreakdown.linkedin.postsTracked).toBe(1)
    })

    it('creates persistent cross-network telemetry snapshots', () => {
      const collector = new SocialAnalyticsCollector()
      const snapshot = collector.createSnapshot('canon-post-1', [
        {
          network: 'x',
          analytics: {
            deliveryId: 'del-x',
            remotePostId: 'x-99',
            retrievedAt: new Date(),
            metrics: {
              impressions: 500,
              reach: 400,
              views: 450,
              clicks: 25,
              likes: 15,
              comments: 5,
              shares: 5,
              saves: 2,
              engagementRate: 10,
            },
            rawPlatformMetrics: {},
          },
        },
      ])

      expect(snapshot.canonicalPostId).toBe('canon-post-1')
      expect(snapshot.aggregate.totalImpressions).toBe(500)
      expect(snapshot.aggregate.totalLikes).toBe(15)
      expect(snapshot.id).toMatch(/^snap_/)
    })
  })
})
