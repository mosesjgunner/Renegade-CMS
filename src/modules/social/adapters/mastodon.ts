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

export interface MastodonPollOptions {
  options: string[]
  expiresInSeconds?: number
  multiple?: boolean
  hideTotals?: boolean
}

export interface MastodonPlatformSettings {
  spoilerText?: string
  sensitive?: boolean
  visibility?: 'public' | 'unlisted' | 'private' | 'direct'
  inReplyToId?: string
  poll?: MastodonPollOptions
  instanceUrl?: string
}

export class MastodonAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-mastodon'
  readonly name = 'Mastodon ActivityPub Adapter'
  readonly version = '2026.1.0'
  readonly network = 'mastodon' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['text', 'link', 'image', 'video', 'thread'] as const,
    textLimit: 500,
    media: { images: true, video: true, audio: true, maxAttachments: 4 },
    threads: true,
    linkCards: 'native' as const,
    edit: true,
    delete: true,
    nativeScheduling: true,
    authentication: { required: true, modes: ['bearer', 'oauth2'] },
    rateLimit: { requestsPerMinute: 60, retryAfterHeader: 'retry-after' },
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsText: true,
      supportsImages: true,
      supportsVideo: true,
      supportsCarousels: false,
      supportsPolls: true,
      supportsThreads: true,
      supportsAltText: true,
      supportsNativeScheduling: true,
      supportsPostEditing: true,
      supportsPostDeletion: true,
      supportsAnalytics: false,
      supportsComments: true,
      supportsDrafts: false,
      requiresMedia: false,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: false,
      limits: {
        maxCharacters: 500,
        maxImages: 4,
        maxVideoDurationSeconds: 180,
        maxVideoFileSizeBytes: 40 * 1024 * 1024,
        maxImageFileSizeBytes: 10 * 1024 * 1024,
      },
      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        allowedVideoMimes: ['video/mp4', 'video/quicktime', 'video/webm'],
        allowedVideoCodecs: ['h264', 'vp8', 'vp9'],
        aspectRatios: { minRatio: 0.5, maxRatio: 2.5 },
      },
    }
  }

  resolveInstanceUrl(authContext?: AuthContext, platformSettings?: MastodonPlatformSettings): string {
    const fromSettings = platformSettings?.instanceUrl
    const fromCreds = authContext?.credentials?.instanceUrl || authContext?.credentials?.instance
    const raw = fromSettings || fromCreds || 'https://mastodon.social'
    return raw.replace(/\/+$/, '')
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []

    const textLimit = constraints?.characterCeilingOverride || 500
    if (!variant.text.trim() && !variant.attachments.length) {
      errors.push({ field: 'text', message: 'Status must contain text or attachments.', code: 'EMPTY_STATUS' })
    }

    if (variant.text.length > textLimit) {
      errors.push({
        field: 'text',
        message: `Status length (${variant.text.length}) exceeds instance limit of ${textLimit} characters.`,
        code: 'TEXT_TOO_LONG',
      })
    }

    if (variant.attachments.length > 4) {
      errors.push({
        field: 'attachments',
        message: 'Mastodon allows a maximum of 4 attachments per status.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    const settings = variant.platformSettings as MastodonPlatformSettings | undefined
    if (settings?.poll) {
      if (!settings.poll.options || settings.poll.options.length < 2) {
        errors.push({ field: 'poll', message: 'Polls require at least 2 options.', code: 'POLL_OPTIONS_MIN' })
      }
      if (settings.poll.options.length > 4) {
        errors.push({ field: 'poll', message: 'Polls allow at most 4 options on standard instances.', code: 'POLL_OPTIONS_MAX' })
      }
      if (variant.attachments.length > 0) {
        errors.push({ field: 'poll', message: 'Mastodon does not allow combining polls with media attachments.', code: 'POLL_WITH_MEDIA' })
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  async uploadMediaAttachment(
    instanceUrl: string,
    token: string,
    mediaAssetId: string,
    altText?: string,
    mediaResolver?: MediaResolver,
  ): Promise<string> {
    if (!mediaResolver) {
      throw new Error('MediaResolver is required to upload media to Mastodon')
    }

    const { buffer, mimeType, fileName } = await mediaResolver.resolveBuffer(mediaAssetId)
    const formData = new FormData()
    formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName)
    if (altText) {
      formData.append('description', altText)
    }

    const endpoint = `${instanceUrl}/api/v2/media`
    const ssrfCheck = validateOutboundUrl(endpoint)
    if (!ssrfCheck.isValid) {
      throw new Error(`SSRF Blocked: ${ssrfCheck.reason}`)
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => null)
      throw new Error(`Media upload failed (${res.status}): ${errBody?.error || res.statusText}`)
    }

    const data = (await res.json()) as { id: string }
    const mediaId = data.id

    // If HTTP 202 Accepted was returned, poll until ready
    if (res.status === 202) {
      let isReady = false
      let attempts = 0
      while (!isReady && attempts < 10) {
        attempts++
        await new Promise((r) => setTimeout(r, 1500))
        const pollRes = await fetch(`${instanceUrl}/api/v1/media/${mediaId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (pollRes.status === 200) {
          isReady = true
        } else if (pollRes.status !== 206 && pollRes.status !== 202) {
          throw new Error(`Media processing failed with HTTP ${pollRes.status}`)
        }
      }
    }

    return mediaId
  }

  async publish(
    variant: SocialVariant,
    context?: AuthContext | Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
    mediaResolver?: MediaResolver,
  ): Promise<AdapterResult> {
    const auth = context as AuthContext | undefined
    const token = auth?.credentials?.token || auth?.credentials?.accessToken || auth?.tokens?.accessToken
    const settings = variant.platformSettings as MastodonPlatformSettings | undefined
    const instanceUrl = this.resolveInstanceUrl(auth, settings)

    if (!token) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'authentication',
          message: 'Mastodon requires an access token or personal token.',
        }),
      }
    }

    // SSRF validation
    const targetEndpoint = `${instanceUrl}/api/v1/statuses`
    const ssrf = validateOutboundUrl(targetEndpoint)
    if (!ssrf.isValid) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: `Blocked by SSRF protection: ${ssrf.reason}`,
        }),
      }
    }

    try {
      // 1. Upload media if present
      const mediaIds: string[] = []
      if (variant.attachments.length > 0 && mediaResolver) {
        for (const att of variant.attachments) {
          const mediaId = await this.uploadMediaAttachment(
            instanceUrl,
            token,
            att.mediaAssetId,
            att.altText,
            mediaResolver,
          )
          mediaIds.push(mediaId)
        }
      }

      // 2. Build Status payload
      const payload: Record<string, unknown> = {
        status: variant.text,
      }

      if (mediaIds.length > 0) {
        payload.media_ids = mediaIds
      }

      if (settings?.spoilerText) {
        payload.spoiler_text = settings.spoilerText
      }

      if (settings?.sensitive !== undefined) {
        payload.sensitive = settings.sensitive
      }

      if (settings?.visibility) {
        payload.visibility = settings.visibility
      }

      if (settings?.inReplyToId) {
        payload.in_reply_to_id = settings.inReplyToId
      }

      if (settings?.poll && !mediaIds.length) {
        payload.poll = {
          options: settings.poll.options,
          expires_in: settings.poll.expiresInSeconds || 86400,
          multiple: settings.poll.multiple || false,
          hide_totals: settings.poll.hideTotals || false,
        }
      }

      // 3. Dispatch POST to /api/v1/statuses
      const response = await fetch(targetEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': variant.idempotencyKey,
        },
        body: JSON.stringify(payload),
      })

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after')
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'rate-limit',
            message: 'Mastodon instance rate limit reached.',
            retryAfter: retryAfter ? new Date(Date.now() + Number(retryAfter) * 1000).toISOString() : undefined,
          }),
        }
      }

      if (response.status === 401 || response.status === 403) {
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'reconnect-required',
            message: 'Mastodon authentication revoked or invalid token.',
          }),
        }
      }

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: string } | null
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: response.status >= 500 ? 'transient' : 'validation',
            message: errBody?.error || `Mastodon returned HTTP ${response.status}`,
          }),
        }
      }

      const postData = (await response.json()) as { id: string; url: string; created_at: string }
      return {
        status: 'published',
        remoteId: postData.id,
        remoteUrl: postData.url,
        receipt: {
          remotePostId: postData.id,
          remoteUrl: postData.url,
          publishedAt: new Date(postData.created_at || Date.now()),
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
    const token = authContext.credentials?.token || authContext.tokens?.accessToken
    const settings = variant.platformSettings as MastodonPlatformSettings | undefined
    const instanceUrl = this.resolveInstanceUrl(authContext, settings)

    if (!token) throw new Error('Missing token for edit')

    const endpoint = `${instanceUrl}/api/v1/statuses/${remotePostId}`
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: variant.text,
        spoiler_text: settings?.spoilerText,
        sensitive: settings?.sensitive,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(`Mastodon status edit failed (${res.status}): ${err?.error || res.statusText}`)
    }

    const data = (await res.json()) as { id: string; url: string; edited_at?: string; created_at: string }
    return {
      remotePostId: data.id,
      remoteUrl: data.url,
      publishedAt: new Date(data.edited_at || data.created_at || Date.now()),
      rawResponse: data as Record<string, unknown>,
    }
  }

  async deletePost(remotePostId: string, authContext: AuthContext): Promise<void> {
    const token = authContext.credentials?.token || authContext.tokens?.accessToken
    const instanceUrl = this.resolveInstanceUrl(authContext)
    if (!token) throw new Error('Missing token for delete')

    const endpoint = `${instanceUrl}/api/v1/statuses/${remotePostId}`
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to delete Mastodon post: HTTP ${res.status}`)
    }
  }

  async fetchPost(remotePostId: string, authContext: AuthContext): Promise<NormalizedRemotePost> {
    const instanceUrl = this.resolveInstanceUrl(authContext)
    const token = authContext.credentials?.token || authContext.tokens?.accessToken

    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(`${instanceUrl}/api/v1/statuses/${remotePostId}`, { headers })
    if (!res.ok) throw new Error(`Failed to fetch status: HTTP ${res.status}`)

    const data = (await res.json()) as {
      id: string
      url: string
      content: string
      created_at: string
      account?: { acct: string }
    }

    return {
      remoteId: data.id,
      remoteUrl: data.url,
      text: data.content.replace(/<[^>]+>/g, ''), // strip basic html
      publishedAt: new Date(data.created_at),
      authorHandle: data.account?.acct,
    }
  }

  async fetchAnalytics(remotePostId: string, authContext: AuthContext): Promise<NormalizedAnalytics> {
    const instanceUrl = this.resolveInstanceUrl(authContext)
    const token = authContext.credentials?.token || authContext.tokens?.accessToken

    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(`${instanceUrl}/api/v1/statuses/${remotePostId}`, { headers })
    if (!res.ok) throw new Error(`Failed to fetch post stats: HTTP ${res.status}`)

    const data = (await res.json()) as {
      id: string
      favourites_count: number
      reblogs_count: number
      replies_count: number
    }

    return {
      deliveryId: `del-mastodon-${remotePostId}`,
      remotePostId,
      retrievedAt: new Date(),
      metrics: {
        impressions: 0, // ActivityPub instances do not track private impressions
        reach: 0,
        views: 0,
        clicks: 0,
        likes: data.favourites_count || 0,
        comments: data.replies_count || 0,
        shares: data.reblogs_count || 0,
        saves: 0,
        engagementRate: 0,
      },
      rawPlatformMetrics: data as Record<string, unknown>,
    }
  }
}

export const mastodonAdapter = new MastodonAdapter()
