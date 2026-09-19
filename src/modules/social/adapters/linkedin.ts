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

export interface LinkedInPlatformSettings {
  authorUrn?: string // e.g. urn:li:organization:123456 or urn:li:person:789012
  visibility?: 'PUBLIC' | 'CONNECTIONS'
  articleTitle?: string
  articleDescription?: string
}

export class LinkedInAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-linkedin'
  readonly name = 'LinkedIn Community Management Adapter'
  readonly version = '2026.1.0'
  readonly network = 'linkedin' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['text', 'link', 'image', 'video'] as const,
    textLimit: 3000,
    media: { images: true, video: true, audio: false, maxAttachments: 20 },
    threads: false,
    linkCards: 'native' as const,
    edit: false,
    delete: true,
    nativeScheduling: false,
    authentication: { required: true, modes: ['oauth2-3legged'] },
    rateLimit: { requestsPerMinute: 100, retryAfterHeader: 'retry-after' },
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsText: true,
      supportsImages: true,
      supportsVideo: true,
      supportsCarousels: true,
      supportsPolls: false,
      supportsThreads: false,
      supportsAltText: true,
      supportsNativeScheduling: false,
      supportsPostEditing: false,
      supportsPostDeletion: true,
      supportsAnalytics: true,
      supportsComments: true,
      supportsDrafts: false,
      requiresMedia: false,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: true,
      limits: {
        maxCharacters: 3000,
        maxImages: 20,
        maxVideoDurationSeconds: 1800,
        maxVideoFileSizeBytes: 500 * 1024 * 1024,
        maxImageFileSizeBytes: 10 * 1024 * 1024,
        carouselLimits: {
          minItems: 2,
          maxItems: 20,
          allowMixedMedia: false,
        },
      },
      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif'],
        allowedVideoMimes: ['video/mp4'],
        allowedVideoCodecs: ['h264'],
        aspectRatios: { minRatio: 0.5, maxRatio: 2.0 },
      },
    }
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []

    const limit = constraints?.characterCeilingOverride || 3000
    if (!variant.text.trim() && !variant.attachments.length) {
      errors.push({ field: 'text', message: 'Post commentary or media is required.', code: 'EMPTY_POST' })
    }

    if (variant.text.length > limit) {
      errors.push({
        field: 'text',
        message: `Commentary exceeds LinkedIn 3,000 character limit (${variant.text.length}).`,
        code: 'TEXT_TOO_LONG',
      })
    }

    if (variant.attachments.length > 20) {
      errors.push({
        field: 'attachments',
        message: 'LinkedIn supports a maximum of 20 images per post.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  async initializeImageUpload(
    token: string,
    authorUrn: string,
  ): Promise<{ uploadUrl: string; imageUrn: string }> {
    const endpoint = 'https://api.linkedin.com/rest/images?action=initializeUpload'
    const ssrf = validateOutboundUrl(endpoint)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'LinkedIn-Version': '202603',
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: authorUrn,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(`LinkedIn image init failed (${res.status}): ${err?.message || res.statusText}`)
    }

    const data = (await res.json()) as { value: { uploadUrl: string; image: string } }
    return { uploadUrl: data.value.uploadUrl, imageUrn: data.value.image }
  }

  async uploadBinaryImage(uploadUrl: string, buffer: Buffer, mimeType: string): Promise<void> {
    const ssrf = validateOutboundUrl(uploadUrl)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: new Uint8Array(buffer),
    })

    if (!res.ok) {
      throw new Error(`LinkedIn binary PUT upload failed with HTTP ${res.status}`)
    }
  }

  async publish(
    variant: SocialVariant,
    context?: AuthContext | Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
    mediaResolver?: MediaResolver,
  ): Promise<AdapterResult> {
    const auth = context as AuthContext | undefined
    const token = auth?.credentials?.accessToken || auth?.credentials?.token || auth?.tokens?.accessToken
    const settings = variant.platformSettings as LinkedInPlatformSettings | undefined
    const authorUrn = settings?.authorUrn || auth?.credentials?.authorUrn || auth?.credentials?.orgUrn

    if (!token) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'authentication',
          message: 'LinkedIn requires an OAuth 2.0 access token.',
        }),
      }
    }

    if (!authorUrn) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: 'LinkedIn requires an author URN (e.g. urn:li:organization:123 or urn:li:person:456).',
        }),
      }
    }

    try {
      // 1. Handle media attachments
      let contentObj: Record<string, unknown> | undefined

      if (variant.attachments.length === 1 && mediaResolver) {
        const att = variant.attachments[0]
        const { buffer, mimeType } = await mediaResolver.resolveBuffer(att.mediaAssetId)
        const { uploadUrl, imageUrn } = await this.initializeImageUpload(token, authorUrn)
        await this.uploadBinaryImage(uploadUrl, buffer, mimeType)

        contentObj = {
          media: {
            title: att.altText || variant.text.slice(0, 50),
            id: imageUrn,
          },
        }
      } else if (variant.attachments.length > 1 && mediaResolver) {
        const images: Array<{ id: string; altText?: string }> = []
        for (const att of variant.attachments) {
          const { buffer, mimeType } = await mediaResolver.resolveBuffer(att.mediaAssetId)
          const { uploadUrl, imageUrn } = await this.initializeImageUpload(token, authorUrn)
          await this.uploadBinaryImage(uploadUrl, buffer, mimeType)
          images.push({ id: imageUrn, altText: att.altText })
        }

        contentObj = {
          multiImage: {
            images,
          },
        }
      } else if (variant.linkUrl) {
        contentObj = {
          article: {
            source: variant.linkUrl,
            title: settings?.articleTitle || variant.text.slice(0, 100),
            description: settings?.articleDescription || '',
          },
        }
      }

      // 2. Build Posts API payload
      const payload: Record<string, unknown> = {
        author: authorUrn,
        commentary: variant.text,
        visibility: settings?.visibility || 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }

      if (contentObj) {
        payload.content = contentObj
      }

      const endpoint = 'https://api.linkedin.com/rest/posts'
      const ssrf = validateOutboundUrl(endpoint)
      if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'LinkedIn-Version': '202603',
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after')
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'rate-limit',
            message: 'LinkedIn API rate limit reached.',
            retryAfter: retryAfter ? new Date(Date.now() + Number(retryAfter) * 1000).toISOString() : undefined,
          }),
        }
      }

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'reconnect-required',
            message: 'LinkedIn access token expired or lacking w_member_social/w_organization_social scope.',
          }),
        }
      }

      if (!res.ok && res.status !== 201) {
        const err = await res.json().catch(() => null)
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: res.status >= 500 ? 'transient' : 'validation',
            message: err?.message || `LinkedIn returned HTTP ${res.status}`,
          }),
        }
      }

      // Successful creation returns HTTP 201 Created with x-restli-id or x-linkedin-id header
      const postUrn = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || ''
      const remoteUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}`

      return {
        status: 'published',
        remoteId: postUrn,
        remoteUrl,
        receipt: {
          remotePostId: postUrn,
          remoteUrl,
          publishedAt: new Date(),
          rawResponse: { postUrn },
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
    const token = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    if (!token) throw new Error('Missing token for LinkedIn delete')

    const endpoint = `https://api.linkedin.com/rest/posts/${encodeURIComponent(remotePostId)}`
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'LinkedIn-Version': '202603',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    })

    if (!res.ok && res.status !== 404) {
      throw new Error(`LinkedIn delete failed with HTTP ${res.status}`)
    }
  }

  async fetchPost(remotePostId: string, authContext: AuthContext): Promise<NormalizedRemotePost> {
    const token = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    if (!token) throw new Error('Missing token for LinkedIn fetchPost')

    const endpoint = `https://api.linkedin.com/rest/posts/${encodeURIComponent(remotePostId)}`
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        'LinkedIn-Version': '202603',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    })

    if (!res.ok) throw new Error(`Failed to fetch LinkedIn post: HTTP ${res.status}`)
    const data = (await res.json()) as { id: string; commentary: string; createdAt: number; author: string }

    return {
      remoteId: data.id,
      remoteUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(data.id)}`,
      text: data.commentary,
      publishedAt: new Date(data.createdAt || Date.now()),
      authorHandle: data.author,
    }
  }

  async fetchAnalytics(remotePostId: string, authContext: AuthContext): Promise<NormalizedAnalytics> {
    const token = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    const authorUrn = authContext.credentials?.authorUrn || authContext.credentials?.orgUrn
    if (!token || !authorUrn) throw new Error('Missing token or author URN for analytics')

    const endpoint = `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(
      authorUrn,
    )}&shares=List(${encodeURIComponent(remotePostId)})`

    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        'LinkedIn-Version': '202603',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    })

    if (!res.ok) throw new Error(`LinkedIn analytics query failed: HTTP ${res.status}`)
    const data = (await res.json()) as {
      elements?: Array<{
        totalShareStatistics: {
          uniqueImpressionsCount?: number
          clickCount?: number
          likeCount?: number
          commentCount?: number
          shareCount?: number
          engagement?: number
        }
      }>
    }

    const stats = data.elements?.[0]?.totalShareStatistics || {}
    const impressions = stats.uniqueImpressionsCount || 0
    const likes = stats.likeCount || 0
    const comments = stats.commentCount || 0
    const shares = stats.shareCount || 0
    const totalEngagement = likes + comments + shares

    return {
      deliveryId: `del-linkedin-${remotePostId}`,
      remotePostId,
      retrievedAt: new Date(),
      metrics: {
        impressions,
        reach: impressions,
        views: 0,
        clicks: stats.clickCount || 0,
        likes,
        comments,
        shares,
        saves: 0,
        engagementRate: impressions > 0 ? (totalEngagement / impressions) * 100 : 0,
      },
      rawPlatformMetrics: stats as Record<string, unknown>,
    }
  }
}

export const linkedinAdapter = new LinkedInAdapter()
