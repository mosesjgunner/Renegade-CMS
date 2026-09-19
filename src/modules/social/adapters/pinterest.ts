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

export interface PinterestPlatformSettings {
  boardId?: string
  boardSectionId?: string
  pinTitle?: string
  altText?: string
}

export class PinterestAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-pinterest'
  readonly name = 'Pinterest API v5 Adapter'
  readonly version = '2026.1.0'
  readonly network = 'pinterest' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['image', 'video', 'link'] as const,
    textLimit: 500, // Description limit
    media: { images: true, video: true, audio: false, maxAttachments: 5 },
    threads: false,
    linkCards: 'native' as const,
    edit: true, // Title, description, link can be patched
    delete: true,
    nativeScheduling: false,
    authentication: { required: true, modes: ['oauth2-pkce'] },
    rateLimit: { requestsPerMinute: 1000, retryAfterHeader: 'retry-after' },
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
      supportsNativeScheduling: false,
      supportsPostEditing: true,
      supportsPostDeletion: true,
      supportsAnalytics: true,
      supportsComments: false,
      supportsDrafts: false,
      requiresMedia: true,
      requiresBoardOrCategory: true, // Mandatory board_id
      supportsCustomThumbnails: false,
      limits: {
        maxCharacters: 500,
        maxImages: 5,
        maxVideoDurationSeconds: 900,
        maxVideoFileSizeBytes: 2 * 1024 * 1024 * 1024,
        maxImageFileSizeBytes: 20 * 1024 * 1024,
        carouselLimits: {
          minItems: 2,
          maxItems: 5,
          allowMixedMedia: false,
        },
      },
      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png'],
        allowedVideoMimes: ['video/mp4', 'video/quicktime'],
        allowedVideoCodecs: ['h264'],
        aspectRatios: { minRatio: 0.5, maxRatio: 1.0, strictStandard: 'VERTICAL_2_3' },
      },
    }
  }

  async discoverAccountConstraints(authContext: AuthContext): Promise<AccountConstraints> {
    const token = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    if (!token) throw new Error('Missing token for Pinterest board discovery')

    const endpoint = 'https://api.pinterest.com/v5/boards'
    const ssrf = validateOutboundUrl(endpoint)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) throw new Error(`Failed to fetch Pinterest boards (${res.status})`)
    const data = (await res.json()) as { items?: Array<{ id: string; name: string }> }

    return {
      accountId: authContext.accountId,
      accountHandle: authContext.accountHandle,
      availableBoards: (data.items || []).map((b) => ({ id: b.id, name: b.name })),
      requiresCategorySelection: false,
    }
  }

  async getBoards(authContext: AuthContext): Promise<Array<{ id: string; name: string }>> {
    const constraints = await this.discoverAccountConstraints(authContext)
    return constraints.availableBoards || []
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []

    const settings = variant.platformSettings as PinterestPlatformSettings | undefined
    if (!settings?.boardId) {
      errors.push({
        field: 'boardId',
        message: 'A Pinterest board selection (boardId) is required to publish a Pin.',
        code: 'BOARD_REQUIRED',
      })
    }

    if (!variant.attachments.length) {
      errors.push({
        field: 'attachments',
        message: 'Pinterest requires at least one image or video attachment.',
        code: 'MEDIA_REQUIRED',
      })
    }

    if (variant.attachments.length > 5) {
      errors.push({
        field: 'attachments',
        message: 'Pinterest Carousels support a maximum of 5 images.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    if (variant.text.length > 500) {
      errors.push({
        field: 'text',
        message: `Pin description exceeds Pinterest 500 character limit (${variant.text.length}).`,
        code: 'DESCRIPTION_TOO_LONG',
      })
    }

    if (settings?.pinTitle && settings.pinTitle.length > 100) {
      errors.push({
        field: 'pinTitle',
        message: `Pin title exceeds Pinterest 100 character limit (${settings.pinTitle.length}).`,
        code: 'TITLE_TOO_LONG',
      })
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  async publish(
    variant: SocialVariant,
    context?: AuthContext | Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
    mediaResolver?: MediaResolver,
  ): Promise<AdapterResult> {
    const auth = context as AuthContext | undefined
    const accessToken = auth?.credentials?.accessToken || auth?.tokens?.accessToken
    const settings = variant.platformSettings as PinterestPlatformSettings | undefined
    const boardId = settings?.boardId || auth?.credentials?.boardId

    if (!accessToken) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'authentication',
          message: 'Pinterest publishing requires an OAuth 2.0 access token.',
        }),
      }
    }

    if (!boardId) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: 'Pinterest publishing requires a target boardId.',
        }),
      }
    }

    if (!variant.attachments.length || !mediaResolver) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: 'Pinterest publishing requires media attachments and a MediaResolver.',
        }),
      }
    }

    try {
      let mediaSource: Record<string, unknown>

      // 1. Carousel Pin (2 to 5 images)
      if (variant.attachments.length > 1) {
        const items: Array<{ title?: string; description?: string; link?: string }> = []
        for (const att of variant.attachments) {
          const publicUrl = await mediaResolver.resolveUrl(att.mediaAssetId)
          items.push({
            title: settings?.pinTitle,
            description: variant.text,
            link: variant.linkUrl,
          })
        }
        // In Pinterest API v5, multiple images in media_source are passed via items
        mediaSource = {
          source_type: 'multiple_image_urls',
          items: await Promise.all(
            variant.attachments.map(async (att) => ({
              url: await mediaResolver.resolveUrl(att.mediaAssetId),
              title: settings?.pinTitle,
              description: variant.text,
              link: variant.linkUrl,
            })),
          ),
        }
      } else {
        // Standard single image Pin
        const publicUrl = await mediaResolver.resolveUrl(variant.attachments[0].mediaAssetId)
        mediaSource = {
          source_type: 'image_url',
          url: publicUrl,
        }
      }

      const pinPayload: Record<string, unknown> = {
        board_id: boardId,
        media_source: mediaSource,
        title: settings?.pinTitle || variant.text.slice(0, 100),
        description: variant.text,
      }

      if (variant.linkUrl) {
        pinPayload.link = variant.linkUrl
      }

      if (settings?.boardSectionId) {
        pinPayload.board_section_id = settings.boardSectionId
      }

      if (settings?.altText || variant.attachments[0]?.altText) {
        pinPayload.alt_text = settings?.altText || variant.attachments[0]?.altText
      }

      const endpoint = 'https://api.pinterest.com/v5/pins'
      const ssrf = validateOutboundUrl(endpoint)
      if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pinPayload),
      })

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after')
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'rate-limit',
            message: 'Pinterest API rate limit reached.',
            retryAfter: retryAfter ? new Date(Date.now() + Number(retryAfter) * 1000).toISOString() : undefined,
          }),
        }
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: res.status >= 500 ? 'transient' : 'validation',
            message: err?.message || `Pinterest returned HTTP ${res.status}`,
          }),
        }
      }

      const pinData = (await res.json()) as { id: string; title: string; link?: string }
      const remoteUrl = `https://www.pinterest.com/pin/${pinData.id}/`

      return {
        status: 'published',
        remoteId: pinData.id,
        remoteUrl,
        receipt: {
          remotePostId: pinData.id,
          remoteUrl,
          publishedAt: new Date(),
          rawResponse: pinData as Record<string, unknown>,
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
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    const settings = variant.platformSettings as PinterestPlatformSettings | undefined
    if (!accessToken) throw new Error('Missing token for Pinterest pin edit')

    const endpoint = `https://api.pinterest.com/v5/pins/${remotePostId}`
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: settings?.pinTitle,
        description: variant.text,
        link: variant.linkUrl,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(`Pinterest edit failed (${res.status}): ${err?.message || res.statusText}`)
    }

    const data = (await res.json()) as { id: string }
    return {
      remotePostId: data.id,
      remoteUrl: `https://www.pinterest.com/pin/${data.id}/`,
      publishedAt: new Date(),
      rawResponse: data as Record<string, unknown>,
    }
  }

  async deletePost(remotePostId: string, authContext: AuthContext): Promise<void> {
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    if (!accessToken) throw new Error('Missing token for Pinterest pin delete')

    const endpoint = `https://api.pinterest.com/v5/pins/${remotePostId}`
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok && res.status !== 404) {
      throw new Error(`Pinterest delete failed with HTTP ${res.status}`)
    }
  }

  async fetchPost(remotePostId: string, authContext: AuthContext): Promise<NormalizedRemotePost> {
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    const endpoint = `https://api.pinterest.com/v5/pins/${remotePostId}`

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) throw new Error(`Failed to fetch Pin: HTTP ${res.status}`)
    const data = (await res.json()) as { id: string; title: string; description: string; created_at: string }

    return {
      remoteId: data.id,
      remoteUrl: `https://www.pinterest.com/pin/${data.id}/`,
      text: `${data.title} - ${data.description}`,
      publishedAt: new Date(data.created_at || Date.now()),
    }
  }

  async fetchAnalytics(remotePostId: string, authContext: AuthContext): Promise<NormalizedAnalytics> {
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    const endpoint = `https://api.pinterest.com/v5/pins/${remotePostId}/analytics?metric_types=IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE`

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) throw new Error(`Pinterest analytics failed: HTTP ${res.status}`)
    const data = (await res.json()) as {
      all?: {
        summary_metrics?: {
          IMPRESSION?: number
          PIN_CLICK?: number
          OUTBOUND_CLICK?: number
          SAVE?: number
        }
      }
    }

    const summary = data.all?.summary_metrics || {}
    const impressions = summary.IMPRESSION || 0
    const clicks = summary.OUTBOUND_CLICK || 0
    const saves = summary.SAVE || 0
    const pinClicks = summary.PIN_CLICK || 0

    return {
      deliveryId: `del-pinterest-${remotePostId}`,
      remotePostId,
      retrievedAt: new Date(),
      metrics: {
        impressions,
        reach: impressions,
        views: 0,
        clicks,
        likes: pinClicks,
        comments: 0,
        shares: saves,
        saves,
        engagementRate: impressions > 0 ? ((clicks + saves + pinClicks) / impressions) * 100 : 0,
      },
      rawPlatformMetrics: data as Record<string, unknown>,
    }
  }
}

export const pinterestAdapter = new PinterestAdapter()
