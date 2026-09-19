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

export interface FacebookPlatformSettings {
  pageId?: string
  linkPreviewTitle?: string
  linkPreviewDescription?: string
  linkPreviewImageUrl?: string
  scheduledPublishTime?: number // UNIX timestamp for native scheduling
  published?: boolean
}

export class FacebookAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-facebook'
  readonly name = 'Facebook Pages Graph API Adapter'
  readonly version = '2026.1.0'
  readonly network = 'facebook' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['text', 'link', 'image', 'video'] as const,
    textLimit: 63206,
    media: { images: true, video: true, audio: false, maxAttachments: 10 },
    threads: true,
    linkCards: 'native' as const,
    edit: true,
    delete: true,
    nativeScheduling: true,
    authentication: { required: true, modes: ['oauth2-page-token'] },
    rateLimit: { requestsPerMinute: 200, retryAfterHeader: 'retry-after' },
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsText: true,
      supportsImages: true,
      supportsVideo: true,
      supportsCarousels: true,
      supportsPolls: false,
      supportsThreads: true,
      supportsAltText: true,
      supportsNativeScheduling: true,
      supportsPostEditing: true,
      supportsPostDeletion: true,
      supportsAnalytics: true,
      supportsComments: true,
      supportsDrafts: true,
      requiresMedia: false,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: true,
      limits: {
        maxCharacters: 63206,
        maxImages: 10,
        maxVideoDurationSeconds: 14400,
        maxVideoFileSizeBytes: 10 * 1024 * 1024 * 1024,
        maxImageFileSizeBytes: 10 * 1024 * 1024,
        carouselLimits: {
          minItems: 2,
          maxItems: 10,
          allowMixedMedia: false,
        },
      },
      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        allowedVideoMimes: ['video/mp4', 'video/quicktime'],
        allowedVideoCodecs: ['h264'],
        aspectRatios: { minRatio: 0.5, maxRatio: 2.0, preferred: 'LANDSCAPE_16_9' },
      },
    }
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []

    if (!variant.text.trim() && !variant.attachments.length && !variant.linkUrl) {
      errors.push({ field: 'text', message: 'Facebook post must contain text, media, or a link.', code: 'EMPTY_POST' })
    }

    if (variant.text.length > 63206) {
      errors.push({
        field: 'text',
        message: `Facebook post exceeds character limit (${variant.text.length} > 63206).`,
        code: 'TEXT_TOO_LONG',
      })
    }

    if (variant.attachments.length > 10) {
      errors.push({
        field: 'attachments',
        message: 'Facebook Page posts support a maximum of 10 images in an album.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  async uploadPhoto(
    pageId: string,
    pageToken: string,
    buffer: Buffer,
    caption?: string,
    published = false,
  ): Promise<string> {
    const endpoint = `https://graph.facebook.com/v20.0/${pageId}/photos`
    const ssrf = validateOutboundUrl(endpoint)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const formData = new FormData()
    formData.append('source', new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), 'photo.jpg')
    formData.append('published', String(published))
    if (caption) formData.append('caption', caption)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pageToken}` },
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(`Facebook photo upload failed (${res.status}): ${err?.error?.message || res.statusText}`)
    }

    const data = (await res.json()) as { id: string }
    return data.id
  }

  async publish(
    variant: SocialVariant,
    context?: AuthContext | Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
    mediaResolver?: MediaResolver,
  ): Promise<AdapterResult> {
    const auth = context as AuthContext | undefined
    const pageToken = auth?.credentials?.pageToken || auth?.credentials?.accessToken || auth?.tokens?.accessToken
    const settings = variant.platformSettings as FacebookPlatformSettings | undefined
    const pageId = settings?.pageId || auth?.credentials?.pageId || auth?.accountId

    if (!pageToken || !pageId) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'authentication',
          message: 'Facebook Pages publishing requires a Page ID and Page Access Token.',
        }),
      }
    }

    try {
      // 1. Multi-photo album or single photo post
      if (variant.attachments.length > 0 && mediaResolver) {
        if (variant.attachments.length === 1) {
          // Single direct photo post
          const att = variant.attachments[0]
          const { buffer } = await mediaResolver.resolveBuffer(att.mediaAssetId)
          const photoId = await this.uploadPhoto(pageId, pageToken, buffer, variant.text, true)

          const remoteUrl = `https://www.facebook.com/${pageId}/posts/${photoId}`
          return {
            status: 'published',
            remoteId: photoId,
            remoteUrl,
            receipt: {
              remotePostId: photoId,
              remoteUrl,
              publishedAt: new Date(),
              rawResponse: { id: photoId },
            },
          }
        }

        // Multi-image album: upload unpublished photos first, then create feed post with attached_media
        const photoIds: string[] = []
        for (const att of variant.attachments) {
          const { buffer } = await mediaResolver.resolveBuffer(att.mediaAssetId)
          const unpublishedId = await this.uploadPhoto(pageId, pageToken, buffer, undefined, false)
          photoIds.push(unpublishedId)
        }

        const albumPayload: Record<string, unknown> = {
          message: variant.text,
          attached_media: photoIds.map((mediaId) => ({ media_fbid: mediaId })),
        }

        const endpoint = `https://graph.facebook.com/v20.0/${pageId}/feed`
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pageToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(albumPayload),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => null)
          return {
            status: 'failed',
            error: normalizeProviderError({
              kind: res.status >= 500 ? 'transient' : 'validation',
              message: err?.error?.message || `Facebook returned HTTP ${res.status}`,
            }),
          }
        }

        const albumData = (await res.json()) as { id: string }
        const remoteUrl = `https://www.facebook.com/${albumData.id}`
        return {
          status: 'published',
          remoteId: albumData.id,
          remoteUrl,
          receipt: {
            remotePostId: albumData.id,
            remoteUrl,
            publishedAt: new Date(),
            rawResponse: albumData as Record<string, unknown>,
          },
        }
      }

      // 2. Standard text / link post
      const feedPayload: Record<string, unknown> = {
        message: variant.text,
      }

      const targetLink = variant.linkUrl || (variant as unknown as { linkPreview?: { url?: string } })?.linkPreview?.url
      if (targetLink) {
        feedPayload.link = targetLink
      }

      if (settings?.published !== undefined) {
        feedPayload.published = settings.published
      }

      if (settings?.scheduledPublishTime) {
        feedPayload.published = false
        feedPayload.scheduled_publish_time = settings.scheduledPublishTime
      }

      const endpoint = `https://graph.facebook.com/v20.0/${pageId}/feed`
      const ssrf = validateOutboundUrl(endpoint)
      if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pageToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedPayload),
      })

      // Rate limit check
      if (res.status === 429 || (res.headers.get('x-business-use-case-usage') && res.status >= 400)) {
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'rate-limit',
            message: 'Meta Business Use Case (BUC) rate limit exceeded.',
            retryAfter: new Date(Date.now() + 60000).toISOString(),
          }),
        }
      }

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'reconnect-required',
            message: 'Page access token invalidated or insufficient permissions.',
          }),
        }
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: res.status >= 500 ? 'transient' : 'validation',
            message: err?.error?.message || `Facebook returned HTTP ${res.status}`,
          }),
        }
      }

      const postData = (await res.json()) as { id: string }
      const remoteUrl = `https://www.facebook.com/${postData.id}`

      return {
        status: 'published',
        remoteId: postData.id,
        remoteUrl,
        receipt: {
          remotePostId: postData.id,
          remoteUrl,
          publishedAt: new Date(),
          rawResponse: postData as Record<string, unknown>,
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

  async editPost(
    remotePostId: string,
    variant: SocialVariant,
    authContext: AuthContext,
  ): Promise<DeliveryReceipt> {
    const pageToken = authContext.credentials?.pageToken || authContext.credentials?.accessToken
    if (!pageToken) throw new Error('Missing page token for Facebook post edit')

    const endpoint = `https://graph.facebook.com/v20.0/${remotePostId}`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: variant.text }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(`Facebook post edit failed (${res.status}): ${err?.error?.message || res.statusText}`)
    }

    return {
      remotePostId,
      remoteUrl: `https://www.facebook.com/${remotePostId}`,
      publishedAt: new Date(),
      rawResponse: { id: remotePostId, success: true },
    }
  }

  async deletePost(remotePostId: string, authContext: AuthContext): Promise<void> {
    const pageToken = authContext.credentials?.pageToken || authContext.credentials?.accessToken
    if (!pageToken) throw new Error('Missing page token for Facebook post delete')

    const endpoint = `https://graph.facebook.com/v20.0/${remotePostId}`
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pageToken}` },
    })

    if (!res.ok && res.status !== 404) {
      throw new Error(`Facebook delete failed with HTTP ${res.status}`)
    }
  }

  async fetchPost(remotePostId: string, authContext: AuthContext): Promise<NormalizedRemotePost> {
    const pageToken = authContext.credentials?.pageToken || authContext.credentials?.accessToken
    const endpoint = `https://graph.facebook.com/v20.0/${remotePostId}?fields=id,message,created_time,permalink_url`

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${pageToken}` },
    })

    if (!res.ok) throw new Error(`Failed to fetch Facebook post: HTTP ${res.status}`)
    const data = (await res.json()) as { id: string; message: string; created_time: string; permalink_url?: string }

    return {
      remoteId: data.id,
      remoteUrl: data.permalink_url || `https://www.facebook.com/${data.id}`,
      text: data.message || '',
      publishedAt: new Date(data.created_time),
    }
  }

  async fetchAnalytics(remotePostId: string, authContext: AuthContext): Promise<NormalizedAnalytics> {
    const pageToken = authContext.credentials?.pageToken || authContext.credentials?.accessToken
    const endpoint = `https://graph.facebook.com/v20.0/${remotePostId}/insights?metric=post_impressions,post_impressions_unique,post_clicks,post_reactions_by_type_total`

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${pageToken}` },
    })

    if (!res.ok) throw new Error(`Facebook analytics failed: HTTP ${res.status}`)
    const data = (await res.json()) as {
      data?: Array<{ name: string; values: Array<{ value: number | Record<string, number> }> }>
    }

    const metricMap = new Map<string, number>()
    for (const item of data.data || []) {
      const val = item.values?.[0]?.value
      if (typeof val === 'number') {
        metricMap.set(item.name, val)
      } else if (typeof val === 'object' && val !== null) {
        // e.g. post_reactions_by_type_total
        const totalReactions = Object.values(val).reduce((sum, n) => sum + (typeof n === 'number' ? n : 0), 0)
        metricMap.set(item.name, totalReactions)
      }
    }

    const impressions = metricMap.get('post_impressions') || 0
    const reach = metricMap.get('post_impressions_unique') || 0
    const clicks = metricMap.get('post_clicks') || 0
    const likes = metricMap.get('post_reactions_by_type_total') || 0

    return {
      deliveryId: `del-facebook-${remotePostId}`,
      remotePostId,
      retrievedAt: new Date(),
      metrics: {
        impressions,
        reach,
        views: 0,
        clicks,
        likes,
        comments: 0,
        shares: 0,
        saves: 0,
        engagementRate: impressions > 0 ? ((likes + clicks) / impressions) * 100 : 0,
      },
      rawPlatformMetrics: data as Record<string, unknown>,
    }
  }
}

export const facebookAdapter = new FacebookAdapter()
