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

export interface XPlatformSettings {
  replySettings?: 'everyone' | 'mentionedUsers' | 'following'
  quoteTweetId?: string
  inReplyToTweetId?: string
  isPremiumLongForm?: boolean
}

export class XAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-x'
  readonly name = 'X (Twitter) API v2 Adapter'
  readonly version = '2026.1.0'
  readonly network = 'x' as const
  readonly mode = 'live' as const

  // Default monthly cost guardrail ceiling in posts
  private static readonly DEFAULT_MONTHLY_BUDGET_POSTS = 500
  private monthlyPostCount = 0

  readonly capabilities = {
    postTypes: ['text', 'link', 'image', 'video', 'thread'] as const,
    textLimit: 280, // 280 chars standard, 25k premium
    media: { images: true, video: true, audio: false, maxAttachments: 4 },
    threads: true,
    linkCards: 'native' as const,
    edit: true, // X allows edit within 1-hour window for verified
    delete: true,
    nativeScheduling: false,
    authentication: { required: true, modes: ['oauth2-pkce', 'oauth1a'] },
    rateLimit: { requestsPerMinute: 50, retryAfterHeader: 'x-rate-limit-reset' },
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
      supportsNativeScheduling: false,
      supportsPostEditing: true,
      supportsPostDeletion: true,
      supportsAnalytics: true,
      supportsComments: true,
      supportsDrafts: true,
      requiresMedia: false,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: false,

      limits: {
        maxCharacters: 280,
        maxImages: 4,
        maxVideoDurationSeconds: 140, // 2m 20s standard
        maxVideoFileSizeBytes: 512 * 1024 * 1024, // 512 MB
        maxImageFileSizeBytes: 5 * 1024 * 1024, // 5 MB
      },

      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        allowedVideoMimes: ['video/mp4', 'video/quicktime'],
        allowedVideoCodecs: ['h264'],
        aspectRatios: {
          minRatio: 0.56,
          maxRatio: 1.78,
          strictStandard: 'LANDSCAPE_16_9',
        },
      },
    }
  }

  /**
   * Calculates effective character weight taking into account that any URL
   * consumes exactly 23 characters on X due to t.co wrapper.
   */
  calculateEffectiveCharacters(text: string): number {
    const urlPattern = /https?:\/\/[^\s]+/g
    const urls = text.match(urlPattern) || []
    const textWithoutUrls = text.replace(urlPattern, '')
    return textWithoutUrls.length + urls.length * 23
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []
    const settings = variant.platformSettings as XPlatformSettings | undefined

    const effectiveChars = this.calculateEffectiveCharacters(variant.text)
    const charLimit = settings?.isPremiumLongForm ? 25000 : 280

    if (!variant.text.trim() && !variant.attachments.length) {
      errors.push({
        field: 'text',
        message: 'Post on X must contain text or at least one media attachment.',
        code: 'EMPTY_POST',
      })
    }

    if (effectiveChars > charLimit) {
      errors.push({
        field: 'text',
        message: `Post text (${effectiveChars} chars) exceeds X limit (${charLimit} chars).`,
        code: 'TEXT_TOO_LONG',
      })
    }

    if (variant.attachments.length > 4) {
      errors.push({
        field: 'attachments',
        message: 'X allows a maximum of 4 images per post.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    // Check mixed media
    const hasVideo = variant.attachments.some((a) => a.role === 'video')
    if (hasVideo && variant.attachments.length > 1) {
      errors.push({
        field: 'attachments',
        message: 'X does not allow mixing videos with other media attachments.',
        code: 'MIXED_MEDIA_NOT_ALLOWED',
      })
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  /**
   * Guardrail against unexpected API billing surges on metered tier.
   */
  checkBudgetGuardrail(): void {
    if (this.monthlyPostCount >= XAdapter.DEFAULT_MONTHLY_BUDGET_POSTS) {
      throw new Error(
        `X API monthly budget guardrail reached (${this.monthlyPostCount}/${XAdapter.DEFAULT_MONTHLY_BUDGET_POSTS} posts). Manual override required.`,
      )
    }
  }

  /**
   * Upload media via Twitter chunked upload protocol (INIT -> APPEND -> FINALIZE).
   */
  async uploadMedia(
    accessToken: string,
    buffer: Buffer,
    mimeType: string,
    mediaCategory: 'tweet_image' | 'tweet_video' | 'tweet_gif',
  ): Promise<string> {
    const uploadBase = 'https://upload.twitter.com/1.1/media/upload.json'
    const ssrf = validateOutboundUrl(uploadBase)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    // 1. INIT
    const initParams = new URLSearchParams({
      command: 'INIT',
      total_bytes: String(buffer.length),
      media_type: mimeType,
      media_category: mediaCategory,
    })

    const initRes = await fetch(`${uploadBase}?${initParams.toString()}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!initRes.ok) {
      throw new Error(`X media upload INIT failed (HTTP ${initRes.status})`)
    }

    const initData = (await initRes.json()) as { media_id_string: string }
    const mediaId = initData.media_id_string

    // 2. APPEND
    const formData = new FormData()
    formData.append('command', 'APPEND')
    formData.append('media_id', mediaId)
    formData.append('segment_index', '0')
    formData.append('media', new Blob([new Uint8Array(buffer)], { type: mimeType }), 'upload.bin')

    const appendRes = await fetch(uploadBase, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    })

    if (!appendRes.ok && appendRes.status !== 204) {
      throw new Error(`X media upload APPEND failed (HTTP ${appendRes.status})`)
    }

    // 3. FINALIZE
    const finParams = new URLSearchParams({
      command: 'FINALIZE',
      media_id: mediaId,
    })

    const finRes = await fetch(`${uploadBase}?${finParams.toString()}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!finRes.ok) {
      throw new Error(`X media upload FINALIZE failed (HTTP ${finRes.status})`)
    }

    const finData = (await finRes.json()) as {
      processing_info?: {
        state: 'pending' | 'in_progress' | 'succeeded' | 'failed'
        check_after_secs?: number
      }
    }

    // 4. STATUS polling if async processing
    if (finData.processing_info && finData.processing_info.state !== 'succeeded') {
      let state: 'pending' | 'in_progress' | 'succeeded' | 'failed' = finData.processing_info.state
      let polls = 0
      while (state !== 'succeeded' && polls < 10) {
        polls++
        const waitSecs = finData.processing_info.check_after_secs || 1
        await new Promise((r) => setTimeout(r, waitSecs * 1000))

        const statusRes = await fetch(`${uploadBase}?command=STATUS&media_id=${mediaId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (!statusRes.ok) break
        const statusData = (await statusRes.json()) as {
          processing_info?: { state: 'pending' | 'in_progress' | 'succeeded' | 'failed' }
        }

        state = statusData.processing_info?.state || 'succeeded'
        if (state === 'failed') throw new Error('X media async processing failed')
      }
    }

    return mediaId
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
    const settings = variant.platformSettings as XPlatformSettings | undefined

    if (!accessToken) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'authentication',
          message: 'X publishing requires a valid OAuth 2.0 Bearer access token.',
        }),
      }
    }

    try {
      this.checkBudgetGuardrail()

      // Upload media if present
      const mediaIds: string[] = []
      if (variant.attachments.length > 0 && mediaResolver) {
        for (const att of variant.attachments) {
          const { buffer, mimeType } = await mediaResolver.resolveBuffer(att.mediaAssetId)
          const category = att.role === 'video' ? 'tweet_video' : 'tweet_image'
          const mId = await this.uploadMedia(
            accessToken,
            buffer,
            mimeType || 'image/jpeg',
            category,
          )
          mediaIds.push(mId)
        }
      }

      // Compose Tweet Payload
      const tweetPayload: Record<string, unknown> = {
        text: variant.text,
      }

      if (mediaIds.length > 0) {
        tweetPayload.media = { media_ids: mediaIds }
      }

      if (settings?.replySettings) {
        tweetPayload.reply_settings = settings.replySettings
      }

      if (settings?.quoteTweetId) {
        tweetPayload.quote_tweet_id = settings.quoteTweetId
      }

      if (settings?.inReplyToTweetId) {
        tweetPayload.reply = { in_reply_to_tweet_id: settings.inReplyToTweetId }
      }

      const endpoint = 'https://api.twitter.com/2/tweets'
      const ssrf = validateOutboundUrl(endpoint)
      if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tweetPayload),
      })

      if (res.status === 429) {
        const resetHeader = res.headers.get('x-rate-limit-reset')
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'rate-limit',
            message: 'X API rate limit exceeded.',
            retryAfter: resetHeader
              ? new Date(parseInt(resetHeader, 10) * 1000).toISOString()
              : undefined,
          }),
        }
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          title?: string
          detail?: string
          errors?: Array<{ message: string }>
        } | null
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: res.status >= 500 ? 'transient' : 'validation',
            message: err?.detail || err?.errors?.[0]?.message || `X returned HTTP ${res.status}`,
          }),
        }
      }

      const data = (await res.json()) as { data: { id: string; text: string } }
      const tweetId = data.data.id
      const remoteUrl = `https://x.com/i/web/status/${tweetId}`

      this.monthlyPostCount++

      return {
        status: 'published',
        remoteId: tweetId,
        remoteUrl,
        receipt: {
          remotePostId: tweetId,
          remoteUrl,
          publishedAt: new Date(),
          rawResponse: data as unknown as Record<string, unknown>,
        },
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'transient',
          message: err.message || 'X post dispatch failed.',
        }),
      }
    }
  }

  async deletePost(remotePostId: string, authContext: AuthContext): Promise<void> {
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    if (!accessToken) throw new Error('Missing token for X tweet delete')

    const endpoint = `https://api.twitter.com/2/tweets/${remotePostId}`
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok && res.status !== 200) {
      throw new Error(`X tweet delete failed with HTTP ${res.status}`)
    }
  }
}
