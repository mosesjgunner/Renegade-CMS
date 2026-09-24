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

export interface ThreadsPlatformSettings {
  threadsUserId?: string
  topicTag?: string // 1-50 chars without #
  replyControl?: 'everyone' | 'accounts_you_follow' | 'mentioned_only'
  quotePostId?: string
  replyToId?: string
}

export class ThreadsAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-threads'
  readonly name = 'Threads Graph API Adapter'
  readonly version = '2026.1.0'
  readonly network = 'threads' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['text', 'link', 'image', 'video'] as const,
    textLimit: 500,
    media: { images: true, video: true, audio: false, maxAttachments: 20 },
    threads: true,
    linkCards: 'native' as const,
    edit: false,
    delete: true,
    nativeScheduling: false,
    authentication: { required: true, modes: ['threads-oauth2'] },
    rateLimit: { requestsPerMinute: 250, retryAfterHeader: 'retry-after' },
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
      supportsNativeScheduling: false,
      supportsPostEditing: false,
      supportsPostDeletion: true,
      supportsAnalytics: true,
      supportsComments: true,
      supportsDrafts: false,
      requiresMedia: false,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: false,
      limits: {
        maxCharacters: 500,
        maxImages: 20,
        maxVideoDurationSeconds: 300,
        maxVideoFileSizeBytes: 1024 * 1024 * 1024,
        maxImageFileSizeBytes: 8 * 1024 * 1024,
        carouselLimits: {
          minItems: 2,
          maxItems: 20,
          allowMixedMedia: true,
        },
      },
      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png'],
        allowedVideoMimes: ['video/mp4', 'video/quicktime'],
        allowedVideoCodecs: ['h264', 'hevc'],
        aspectRatios: { minRatio: 0.8, maxRatio: 1.91, strictStandard: 'SQUARE_1_1' },
      },
    }
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []

    const limit = constraints?.characterCeilingOverride || 500
    if (!variant.text.trim() && !variant.attachments.length) {
      errors.push({
        field: 'text',
        message: 'Threads post must contain text or media.',
        code: 'EMPTY_POST',
      })
    }

    if (variant.text.length > limit) {
      errors.push({
        field: 'text',
        message: `Post exceeds Threads 500 character limit (${variant.text.length}).`,
        code: 'TEXT_TOO_LONG',
      })
    }

    if (variant.attachments.length > 20) {
      errors.push({
        field: 'attachments',
        message: 'Threads supports a maximum of 20 attachments in a carousel.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    const settings = variant.platformSettings as ThreadsPlatformSettings | undefined
    if (settings?.topicTag && settings.topicTag.startsWith('#')) {
      warnings.push({
        field: 'topicTag',
        message: 'Threads topic tag should not include the "#" symbol.',
        code: 'TOPIC_TAG_HASH',
      })
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  async pollContainerStatus(creationId: string, accessToken: string, maxPolls = 15): Promise<void> {
    const endpoint = `https://graph.threads.net/v1.0/${creationId}?fields=status`
    let polls = 0

    while (polls < maxPolls) {
      polls++
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!res.ok) throw new Error(`Container poll failed (${res.status})`)
      const data = (await res.json()) as { status: string }

      if (data.status === 'FINISHED') return
      if (data.status === 'ERROR' || data.status === 'EXPIRED') {
        throw new Error(`Threads container failed with status: ${data.status}`)
      }

      await new Promise((r) => setTimeout(r, 1000))
    }

    throw new Error('Timed out waiting for Threads container')
  }

  async publish(
    variant: SocialVariant,
    context?:
      | AuthContext
      | Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
    mediaResolver?: MediaResolver,
  ): Promise<AdapterResult> {
    const auth = context as AuthContext | undefined
    const accessToken = auth?.credentials?.accessToken || auth?.tokens?.accessToken
    const settings = variant.platformSettings as ThreadsPlatformSettings | undefined
    const userId = settings?.threadsUserId || auth?.credentials?.threadsUserId || auth?.accountId

    if (!accessToken || !userId) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'authentication',
          message: 'Threads publishing requires a User ID and Access Token.',
        }),
      }
    }

    try {
      // 1. Create Media Container
      const containerPayload: Record<string, unknown> = {
        text: variant.text,
      }

      if (settings?.topicTag) {
        containerPayload.topic_tag = settings.topicTag.replace(/^#/, '')
      }

      if (settings?.replyControl) {
        containerPayload.reply_control = settings.replyControl
      }

      if (settings?.quotePostId) {
        containerPayload.quote_post_id = settings.quotePostId
      }

      if (settings?.replyToId) {
        containerPayload.reply_to_id = settings.replyToId
      }

      if (variant.attachments.length === 1 && mediaResolver) {
        const att = variant.attachments[0]
        const publicUrl = await mediaResolver.resolveUrl(att.mediaAssetId)
        if (att.role === 'video') {
          containerPayload.media_type = 'VIDEO'
          containerPayload.video_url = publicUrl
        } else {
          containerPayload.media_type = 'IMAGE'
          containerPayload.image_url = publicUrl
        }
      } else if (variant.attachments.length > 1 && mediaResolver) {
        // Multi-item carousel
        const childIds: string[] = []
        for (const att of variant.attachments) {
          const publicUrl = await mediaResolver.resolveUrl(att.mediaAssetId)
          const childPayload: Record<string, unknown> = { is_carousel_item: true }
          if (att.role === 'video') {
            childPayload.media_type = 'VIDEO'
            childPayload.video_url = publicUrl
          } else {
            childPayload.media_type = 'IMAGE'
            childPayload.image_url = publicUrl
          }

          const childEndpoint = `https://graph.threads.net/v1.0/${userId}/threads`
          const cRes = await fetch(childEndpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(childPayload),
          })
          if (!cRes.ok)
            throw new Error(`Threads carousel child creation failed with HTTP ${cRes.status}`)
          const cData = (await cRes.json()) as { id: string }
          await this.pollContainerStatus(cData.id, accessToken)
          childIds.push(cData.id)
        }

        containerPayload.media_type = 'CAROUSEL'
        containerPayload.children = childIds
      } else {
        containerPayload.media_type = 'TEXT'
      }

      const createEndpoint = `https://graph.threads.net/v1.0/${userId}/threads`
      const ssrf = validateOutboundUrl(createEndpoint)
      if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

      const createRes = await fetch(createEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(containerPayload),
      })

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => null)
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: createRes.status >= 500 ? 'transient' : 'validation',
            message: err?.error?.message || `Threads returned HTTP ${createRes.status}`,
          }),
        }
      }

      const containerData = (await createRes.json()) as { id: string }
      await this.pollContainerStatus(containerData.id, accessToken)

      // 2. Publish Container
      const publishEndpoint = `https://graph.threads.net/v1.0/${userId}/threads_publish`
      const pubRes = await fetch(publishEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ creation_id: containerData.id }),
      })

      if (!pubRes.ok) {
        const err = await pubRes.json().catch(() => null)
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: pubRes.status >= 500 ? 'transient' : 'validation',
            message: err?.error?.message || `Threads publish returned HTTP ${pubRes.status}`,
          }),
        }
      }

      const published = (await pubRes.json()) as { id: string }
      const remoteUrl = `https://www.threads.net/t/${published.id}`

      return {
        status: 'published',
        remoteId: published.id,
        remoteUrl,
        receipt: {
          remotePostId: published.id,
          remoteUrl,
          publishedAt: new Date(),
          rawResponse: published as Record<string, unknown>,
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
    if (!accessToken) throw new Error('Missing token for Threads delete')

    const endpoint = `https://graph.threads.net/v1.0/${remotePostId}`
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok && res.status !== 404) {
      throw new Error(`Threads delete failed with HTTP ${res.status}`)
    }
  }

  async fetchPost(remotePostId: string, authContext: AuthContext): Promise<NormalizedRemotePost> {
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    const endpoint = `https://graph.threads.net/v1.0/${remotePostId}?fields=id,text,timestamp,permalink`

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) throw new Error(`Failed to fetch Threads post: HTTP ${res.status}`)
    const data = (await res.json()) as {
      id: string
      text?: string
      timestamp: string
      permalink: string
    }

    return {
      remoteId: data.id,
      remoteUrl: data.permalink,
      text: data.text || '',
      publishedAt: new Date(data.timestamp),
    }
  }

  async fetchAnalytics(
    remotePostId: string,
    authContext: AuthContext,
  ): Promise<NormalizedAnalytics> {
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    const endpoint = `https://graph.threads.net/v1.0/${remotePostId}/insights?metric=views,likes,replies,reposts,quotes`

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) throw new Error(`Threads insights failed: HTTP ${res.status}`)
    const data = (await res.json()) as {
      data?: Array<{ name: string; values: Array<{ value: number }> }>
    }

    const metricMap = new Map<string, number>()
    for (const item of data.data || []) {
      metricMap.set(item.name, item.values?.[0]?.value || 0)
    }

    const views = metricMap.get('views') || 0
    const likes = metricMap.get('likes') || 0
    const replies = metricMap.get('replies') || 0
    const reposts = metricMap.get('reposts') || 0
    const quotes = metricMap.get('quotes') || 0
    const engagements = likes + replies + reposts + quotes

    return {
      deliveryId: `del-threads-${remotePostId}`,
      remotePostId,
      retrievedAt: new Date(),
      metrics: {
        impressions: views,
        reach: views,
        views,
        clicks: 0,
        likes,
        comments: replies,
        shares: reposts + quotes,
        saves: 0,
        engagementRate: views > 0 ? (engagements / views) * 100 : 0,
      },
      rawPlatformMetrics: data as Record<string, unknown>,
    }
  }
}

export const threadsAdapter = new ThreadsAdapter()
