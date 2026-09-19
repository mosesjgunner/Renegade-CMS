import {
  normalizeProviderError,
  type AccountConstraints,
  type AdapterResult,
  type AuthContext,
  type DeliveryReceipt,
  type MediaResolver,
  type NormalizedAnalytics,
  type NormalizedRemotePost,
  type ProviderCapabilities,
  type SocialProviderAdapter,
  type SocialVariant,
  type ValidationReport,
} from '../contracts'
import { validateOutboundUrl } from '../security'

export interface InstagramPlatformSettings {
  igUserId?: string
  mediaType?: 'IMAGE' | 'VIDEO' | 'REELS' | 'STORIES'
  userTags?: Array<{ username: string; x: number; y: number }>
  altText?: string
}

export class InstagramAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-instagram'
  readonly name = 'Instagram Graph API Adapter'
  readonly version = '2026.1.0'
  readonly network = 'instagram' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['image', 'video'] as const,
    textLimit: 2200,
    media: { images: true, video: true, audio: false, maxAttachments: 10 },
    threads: false,
    linkCards: 'none' as const,
    edit: false, // Instagram does NOT support caption editing via API
    delete: true,
    nativeScheduling: true,
    authentication: { required: true, modes: ['meta-oauth2'] },
    rateLimit: { requestsPerMinute: 200, retryAfterHeader: 'retry-after' },
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsText: false, // Plain text unsupported
      supportsImages: true,
      supportsVideo: true,
      supportsCarousels: true,
      supportsPolls: false,
      supportsThreads: false,
      supportsAltText: true,
      supportsNativeScheduling: true,
      supportsPostEditing: false, // Strict: captions cannot be edited
      supportsPostDeletion: true,
      supportsAnalytics: true,
      supportsComments: true,
      supportsDrafts: false,
      requiresMedia: true, // Mandatory media
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: true,
      limits: {
        maxCharacters: 2200,
        maxImages: 10,
        maxVideoDurationSeconds: 90, // Reels limit
        maxVideoFileSizeBytes: 1024 * 1024 * 1024,
        maxImageFileSizeBytes: 8 * 1024 * 1024,
        carouselLimits: {
          minItems: 2,
          maxItems: 10,
          allowMixedMedia: true,
        },
      },
      mediaConstraints: {
        allowedImageMimes: ['image/jpeg'],
        allowedVideoMimes: ['video/mp4', 'video/quicktime'],
        allowedVideoCodecs: ['h264', 'hevc'],
        aspectRatios: { minRatio: 0.8, maxRatio: 1.91, strictStandard: 'PORTRAIT_4_5' },
      },
    }
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []

    if (!variant.attachments.length) {
      errors.push({
        field: 'attachments',
        message: 'Instagram publishing requires at least one image or video attachment.',
        code: 'MEDIA_REQUIRED',
      })
    }

    if (variant.attachments.length > 10) {
      errors.push({
        field: 'attachments',
        message: 'Instagram carousels support a maximum of 10 items.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    if (variant.text.length > 2200) {
      errors.push({
        field: 'text',
        message: `Caption exceeds Instagram 2,200 character limit (${variant.text.length}).`,
        code: 'CAPTION_TOO_LONG',
      })
    }

    // Hashtag check
    const hashtags = (variant.text.match(/#[a-zA-Z0-9_]+/g) || []).length
    if (hashtags > 30) {
      errors.push({
        field: 'text',
        message: `Instagram allows a maximum of 30 hashtags per post (found ${hashtags}).`,
        code: 'TOO_MANY_HASHTAGS',
      })
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  async pollContainerStatus(creationId: string, accessToken: string, maxPolls = 15): Promise<void> {
    const endpoint = `https://graph.facebook.com/v20.0/${creationId}?fields=status_code`
    let polls = 0

    while (polls < maxPolls) {
      polls++
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!res.ok) {
        throw new Error(`Failed to check container status (${res.status})`)
      }

      const data = (await res.json()) as { status_code: string }
      if (data.status_code === 'FINISHED') {
        return
      }

      if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
        throw new Error(`Instagram container processing failed with status: ${data.status_code}`)
      }

      // Wait between polls
      await new Promise((r) => setTimeout(r, 1200))
    }

    throw new Error('Timed out waiting for Instagram media container to finish processing')
  }

  async createMediaContainer(
    igUserId: string,
    accessToken: string,
    params: Record<string, unknown>,
  ): Promise<string> {
    const endpoint = `https://graph.facebook.com/v20.0/${igUserId}/media`
    const ssrf = validateOutboundUrl(endpoint)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })

    if (res.status === 429) {
      throw new Error('Rate limit reached on Instagram container creation')
    }

    const data = (await res.json()) as { id?: string; error?: { code?: number; message?: string } }
    if (!res.ok || !data.id) {
      if (data.error?.code === 9007) {
        throw new Error('Instagram daily publishing limit reached (25 posts per 24 hours)')
      }
      throw new Error(data.error?.message || `Failed to create container (HTTP ${res.status})`)
    }

    return data.id
  }

  async publish(
    variant: SocialVariant,
    context?: AuthContext | Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
    mediaResolver?: MediaResolver,
  ): Promise<AdapterResult> {
    const auth = context as AuthContext | undefined
    const accessToken = auth?.credentials?.accessToken || auth?.tokens?.accessToken
    const settings = variant.platformSettings as InstagramPlatformSettings | undefined
    const igUserId = settings?.igUserId || auth?.credentials?.igUserId || auth?.accountId

    if (!accessToken || !igUserId) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'authentication',
          message: 'Instagram publishing requires an Instagram User ID and Access Token.',
        }),
      }
    }

    if (!variant.attachments.length || !mediaResolver) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: 'Instagram publishing requires media attachments and a MediaResolver.',
        }),
      }
    }

    try {
      let finalContainerId: string

      // 1. Carousel Container (2 to 10 items)
      if (variant.attachments.length > 1) {
        const childContainerIds: string[] = []

        for (const att of variant.attachments) {
          const publicUrl = await mediaResolver.resolveUrl(att.mediaAssetId)
          const isVideo = att.role === 'video'

          const childParams: Record<string, unknown> = {
            is_carousel_item: true,
          }
          if (isVideo) {
            childParams.media_type = 'VIDEO'
            childParams.video_url = publicUrl
          } else {
            childParams.image_url = publicUrl
          }

          const childId = await this.createMediaContainer(igUserId, accessToken, childParams)
          await this.pollContainerStatus(childId, accessToken)
          childContainerIds.push(childId)
        }

        // Create parent carousel container
        finalContainerId = await this.createMediaContainer(igUserId, accessToken, {
          media_type: 'CAROUSEL',
          children: childContainerIds,
          caption: variant.text,
        })
      } else {
        // 2. Single item container
        const att = variant.attachments[0]
        const publicUrl = await mediaResolver.resolveUrl(att.mediaAssetId)
        const isVideo = att.role === 'video'

        const params: Record<string, unknown> = {
          caption: variant.text,
        }

        if (isVideo) {
          params.media_type = 'REELS'
          params.video_url = publicUrl
        } else {
          params.image_url = publicUrl
        }

        finalContainerId = await this.createMediaContainer(igUserId, accessToken, params)
      }

      // Poll final container
      await this.pollContainerStatus(finalContainerId, accessToken)

      // 3. Publish container
      const publishEndpoint = `https://graph.facebook.com/v20.0/${igUserId}/media_publish`
      const ssrf = validateOutboundUrl(publishEndpoint)
      if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

      const pubRes = await fetch(publishEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ creation_id: finalContainerId }),
      })

      if (!pubRes.ok) {
        const err = await pubRes.json().catch(() => null)
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: pubRes.status >= 500 ? 'transient' : 'validation',
            message: err?.error?.message || `Instagram publish returned HTTP ${pubRes.status}`,
          }),
        }
      }

      const publishedData = (await pubRes.json()) as { id: string }
      const remoteUrl = `https://www.instagram.com/p/${publishedData.id}/`

      return {
        status: 'published',
        remoteId: publishedData.id,
        remoteUrl,
        receipt: {
          remotePostId: publishedData.id,
          remoteUrl,
          publishedAt: new Date(),
          rawResponse: publishedData as Record<string, unknown>,
        },
      }
    } catch (err: unknown) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'transient',
          message: err instanceof Error ? err.message : String(err),
        }),
      }
    }
  }

  async deletePost(remotePostId: string, authContext: AuthContext): Promise<void> {
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    if (!accessToken) throw new Error('Missing access token for Instagram delete')

    const endpoint = `https://graph.facebook.com/v20.0/${remotePostId}`
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok && res.status !== 404) {
      throw new Error(`Instagram post delete failed with HTTP ${res.status}`)
    }
  }

  async fetchPost(remotePostId: string, authContext: AuthContext): Promise<NormalizedRemotePost> {
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    const endpoint = `https://graph.facebook.com/v20.0/${remotePostId}?fields=id,caption,timestamp,permalink`

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) throw new Error(`Failed to fetch Instagram media: HTTP ${res.status}`)
    const data = (await res.json()) as { id: string; caption?: string; timestamp: string; permalink: string }

    return {
      remoteId: data.id,
      remoteUrl: data.permalink,
      text: data.caption || '',
      publishedAt: new Date(data.timestamp),
    }
  }

  async fetchAnalytics(remotePostId: string, authContext: AuthContext): Promise<NormalizedAnalytics> {
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    const endpoint = `https://graph.facebook.com/v20.0/${remotePostId}/insights?metric=impressions,reach,likes,comments,shares,saved`

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) throw new Error(`Failed to fetch Instagram insights: HTTP ${res.status}`)
    const data = (await res.json()) as {
      data?: Array<{ name: string; values: Array<{ value: number }> }>
    }

    const metricMap = new Map<string, number>()
    for (const item of data.data || []) {
      metricMap.set(item.name, item.values?.[0]?.value || 0)
    }

    const impressions = metricMap.get('impressions') || 0
    const reach = metricMap.get('reach') || 0
    const likes = metricMap.get('likes') || 0
    const comments = metricMap.get('comments') || 0
    const shares = metricMap.get('shares') || 0
    const saves = metricMap.get('saved') || 0

    return {
      deliveryId: `del-instagram-${remotePostId}`,
      remotePostId,
      retrievedAt: new Date(),
      metrics: {
        impressions,
        reach,
        views: 0,
        clicks: 0,
        likes,
        comments,
        shares,
        saves,
        engagementRate: impressions > 0 ? ((likes + comments + shares + saves) / impressions) * 100 : 0,
      },
      rawPlatformMetrics: data as Record<string, unknown>,
    }
  }
}

export const instagramAdapter = new InstagramAdapter()
