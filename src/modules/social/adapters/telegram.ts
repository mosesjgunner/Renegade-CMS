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
import { sanitizeSocialLog, validateOutboundUrl } from '../security'

export interface TelegramPlatformSettings {
  chatId?: string | number
  messageThreadId?: number
  parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown'
  disableWebPagePreview?: boolean
  protectContent?: boolean
  silentNotification?: boolean
}

export class TelegramAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-telegram'
  readonly name = 'Telegram Bot API Adapter'
  readonly version = '2026.1.0'
  readonly network = 'telegram' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['text', 'link', 'image', 'video'] as const,
    textLimit: 4096,
    media: { images: true, video: true, audio: true, maxAttachments: 10 },
    threads: true,
    linkCards: 'native' as const,
    edit: true,
    delete: true,
    nativeScheduling: false,
    authentication: { required: true, modes: ['bot-token'] },
    rateLimit: { requestsPerMinute: 1800, retryAfterHeader: 'retry-after' },
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsText: true,
      supportsImages: true,
      supportsVideo: true,
      supportsCarousels: true,
      supportsPolls: true,
      supportsThreads: true,
      supportsAltText: false,
      supportsNativeScheduling: false,
      supportsPostEditing: true,
      supportsPostDeletion: true,
      supportsAnalytics: false,
      supportsComments: false,
      supportsDrafts: false,
      requiresMedia: false,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: false,
      limits: {
        maxCharacters: 4096,
        maxImages: 10,
        maxVideoDurationSeconds: 1800,
        maxVideoFileSizeBytes: 50 * 1024 * 1024,
        maxImageFileSizeBytes: 10 * 1024 * 1024,
        carouselLimits: {
          minItems: 2,
          maxItems: 10,
          allowMixedMedia: true,
        },
      },
      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif'],
        allowedVideoMimes: ['video/mp4'],
        allowedVideoCodecs: ['h264'],
        aspectRatios: { minRatio: 0.5, maxRatio: 2.5 },
      },
    }
  }

  resolveToken(authContext?: AuthContext): string | null {
    const creds = authContext?.credentials
    if (!creds) return null
    return (
      (creds.botToken as string) ||
      (creds.token as string) ||
      (creds.appPassword as string) ||
      (creds.identifier as string) ||
      null
    )
  }

  resolveChatId(
    variant: SocialVariant,
    authContext?: AuthContext,
    constraints?: AccountConstraints,
  ): string | number | null {
    const settings = variant.platformSettings as TelegramPlatformSettings | undefined
    if (settings?.chatId) return settings.chatId
    if (authContext?.credentials?.chatId) return authContext.credentials.chatId as string | number
    if (constraints?.accountHandle) return constraints.accountHandle
    const customConstraints = constraints as (Record<string, unknown> | undefined)
    if (customConstraints?.targetChannel) return customConstraints.targetChannel as string | number
    return null
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []

    const hasMedia = variant.attachments.length > 0
    const charLimit = hasMedia ? 1024 : 4096

    if (!variant.text.trim() && !hasMedia) {
      errors.push({
        field: 'text',
        message: 'Telegram message must include text copy or at least one media asset.',
        code: 'EMPTY_MESSAGE',
      })
    }

    if (variant.text.length > charLimit) {
      errors.push({
        field: 'text',
        message: `Message copy length (${variant.text.length}) exceeds Telegram limit of ${charLimit} characters${
          hasMedia ? ' for media captions' : ''
        }.`,
        code: 'TEXT_TOO_LONG',
      })
    }

    if (variant.attachments.length > 10) {
      errors.push({
        field: 'attachments',
        message: 'Telegram supports up to 10 media items per media group album.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    const chatId = this.resolveChatId(variant, undefined, constraints)
    if (!chatId) {
      warnings.push({
        field: 'chatId',
        message: 'No destination chat_id or channel specified in settings or credentials.',
        code: 'MISSING_CHAT_ID',
      })
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  async publish(
    variant: SocialVariant,
    authContext: AuthContext,
    mediaResolver?: MediaResolver,
  ): Promise<AdapterResult> {
    const token = this.resolveToken(authContext)
    if (!token) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'reconnect-required',
          message: 'Telegram Bot token is missing. Configure botToken in credentials.',
        }),
      }
    }

    const chatId = this.resolveChatId(variant, authContext)
    if (!chatId) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: 'Destination Telegram chat_id or channel username is required to publish.',
        }),
      }
    }

    const validation = this.validatePost(variant)
    if (!validation.isValid) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: validation.errors.map((e) => e.message).join('; '),
        }),
      }
    }

    const settings = (variant.platformSettings || {}) as TelegramPlatformSettings
    const parseMode = settings.parseMode || 'HTML'
    const baseUrl = `https://api.telegram.org/bot${token}`

    const ssrfCheck = validateOutboundUrl(baseUrl)
    if (!ssrfCheck.isValid) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: `Outbound URL blocked: ${ssrfCheck.reason}`,
        }),
      }
    }

    try {
      const attachments = variant.attachments
      let res: Response

      if (attachments.length === 0) {
        // Text message
        const payload: Record<string, unknown> = {
          chat_id: chatId,
          text: variant.text,
          parse_mode: parseMode,
          disable_web_page_preview: settings.disableWebPagePreview ?? false,
          protect_content: settings.protectContent ?? false,
          disable_notification: settings.silentNotification ?? false,
        }
        if (settings.messageThreadId) {
          payload.message_thread_id = settings.messageThreadId
        }

        res = await fetch(`${baseUrl}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else if (attachments.length === 1) {
        const item = attachments[0]
        const isVideo = item.role === 'video'
        const endpoint = isVideo ? `${baseUrl}/sendVideo` : `${baseUrl}/sendPhoto`

        if (mediaResolver) {
          const resolved = await mediaResolver.resolveBuffer(item.mediaAssetId)
          const formData = new FormData()
          formData.append('chat_id', String(chatId))
          if (variant.text) {
            formData.append('caption', variant.text.slice(0, 1024))
            formData.append('parse_mode', parseMode)
          }
          if (settings.messageThreadId) {
            formData.append('message_thread_id', String(settings.messageThreadId))
          }

          const blob = new Blob([new Uint8Array(resolved.buffer)], { type: resolved.mimeType })
          formData.append(isVideo ? 'video' : 'photo', blob, resolved.fileName)

          res = await fetch(endpoint, {
            method: 'POST',
            body: formData,
          })
        } else {
          const payload: Record<string, unknown> = {
            chat_id: chatId,
            caption: variant.text ? variant.text.slice(0, 1024) : undefined,
            parse_mode: parseMode,
            [isVideo ? 'video' : 'photo']: item.mediaAssetId,
          }
          if (settings.messageThreadId) {
            payload.message_thread_id = settings.messageThreadId
          }
          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        }
      } else {
        // Multi-media Album (2-10 items) via sendMediaGroup
        if (!mediaResolver) {
          const mediaArray = attachments.map((att, idx) => ({
            type: att.role === 'video' ? 'video' : 'photo',
            media: att.mediaAssetId,
            caption: idx === 0 && variant.text ? variant.text.slice(0, 1024) : undefined,
            parse_mode: idx === 0 ? parseMode : undefined,
          }))

          res = await fetch(`${baseUrl}/sendMediaGroup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, media: mediaArray }),
          })
        } else {
          const formData = new FormData()
          formData.append('chat_id', String(chatId))

          const mediaManifest = []
          for (let i = 0; i < attachments.length; i++) {
            const att = attachments[i]
            const resolved = await mediaResolver.resolveBuffer(att.mediaAssetId)
            const attachName = `file_${i}`
            const blob = new Blob([new Uint8Array(resolved.buffer)], { type: resolved.mimeType })
            formData.append(attachName, blob, resolved.fileName)

            mediaManifest.push({
              type: att.role === 'video' ? 'video' : 'photo',
              media: `attach://${attachName}`,
              caption: i === 0 && variant.text ? variant.text.slice(0, 1024) : undefined,
              parse_mode: i === 0 ? parseMode : undefined,
            })
          }

          formData.append('media', JSON.stringify(mediaManifest))
          res = await fetch(`${baseUrl}/sendMediaGroup`, {
            method: 'POST',
            body: formData,
          })
        }
      }

      const body = (await res.json().catch(() => null)) as {
        ok?: boolean
        result?: {
          message_id?: number
          chat?: { id?: number; username?: string }
        } | Array<{ message_id?: number; chat?: { id?: number; username?: string } }>
        error_code?: number
        description?: string
        parameters?: { retry_after?: number }
      } | null

      if (!res.ok || !body?.ok) {
        return {
          status: 'failed',
          error: this.mapTelegramError(res.status, body),
        }
      }

      const primaryResult = Array.isArray(body.result) ? body.result[0] : body.result
      const messageId = primaryResult?.message_id
      const chatInfo = primaryResult?.chat

      if (!messageId) {
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'remote-unknown',
            message: 'Telegram API returned ok=true but missing message_id.',
          }),
        }
      }

      const remotePostId = `${chatId}:${messageId}`
      let remoteUrl = `https://t.me/c/${String(chatId).replace(/^-100/, '')}/${messageId}`
      if (chatInfo?.username) {
        remoteUrl = `https://t.me/${chatInfo.username}/${messageId}`
      } else if (typeof chatId === 'string' && chatId.startsWith('@')) {
        remoteUrl = `https://t.me/${chatId.replace(/^@/, '')}/${messageId}`
      }

      const receipt: DeliveryReceipt = {
        remotePostId,
        remoteUrl,
        publishedAt: new Date(),
        rawResponse: body as Record<string, unknown>,
      }

      return {
        status: 'published',
        remoteId: remotePostId,
        remoteUrl,
        receipt,
      }
    } catch (err: unknown) {
      const msg = sanitizeSocialLog(err instanceof Error ? err.message : String(err))
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'transient',
          message: `Telegram dispatch failed: ${msg}`,
        }),
      }
    }
  }

  async editPost(
    remotePostId: string,
    variant: SocialVariant,
    authContext: AuthContext,
  ): Promise<DeliveryReceipt> {
    const token = this.resolveToken(authContext)
    if (!token) {
      throw new Error('Telegram token missing for editPost')
    }

    const [chatIdPart, messageIdPart] = remotePostId.split(':')
    const chatId = chatIdPart || this.resolveChatId(variant, authContext)
    const messageId = messageIdPart || remotePostId

    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: Number(messageId),
        text: variant.text,
        parse_mode: 'HTML',
      }),
    })

    const body = (await res.json().catch(() => null)) as {
      ok?: boolean
      description?: string
      error_code?: number
    } | null

    if (!res.ok || !body?.ok) {
      throw new Error(`Telegram editMessageText failed: ${body?.description || res.statusText}`)
    }

    return {
      remotePostId,
      remoteUrl: `https://t.me/c/${String(chatId).replace(/^-100/, '')}/${messageId}`,
      publishedAt: new Date(),
      rawResponse: body as Record<string, unknown>,
    }
  }

  async deletePost(remotePostId: string, authContext: AuthContext): Promise<void> {
    const token = this.resolveToken(authContext)
    if (!token) return

    const [chatIdPart, messageIdPart] = remotePostId.split(':')
    const chatId = chatIdPart
    const messageId = messageIdPart || remotePostId

    if (!chatId || !messageId) return

    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: Number(messageId),
      }),
    })
  }

  async fetchPost(remotePostId: string, _authContext: AuthContext): Promise<NormalizedRemotePost> {
    const [chatId, messageId] = remotePostId.split(':')
    return {
      remoteId: remotePostId,
      remoteUrl: `https://t.me/c/${String(chatId).replace(/^-100/, '')}/${messageId}`,
      publishedAt: new Date(),
      text: '',
    }
  }

  async fetchAnalytics(
    remotePostId: string,
    _authContext: AuthContext,
  ): Promise<NormalizedAnalytics> {
    return {
      deliveryId: `del-${remotePostId}`,
      remotePostId,
      retrievedAt: new Date(),
      metrics: {
        impressions: 0,
        reach: 0,
        views: 0,
        clicks: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        engagementRate: 0,
      },
      rawPlatformMetrics: {},
    }
  }

  private mapTelegramError(
    status: number,
    body: { error_code?: number; description?: string; parameters?: { retry_after?: number } } | null,
  ) {
    const description = body?.description || 'Telegram API Error'
    const errorCode = body?.error_code || status

    if (errorCode === 429 || status === 429) {
      const retryAfterSec = body?.parameters?.retry_after || 30
      return normalizeProviderError({
        kind: 'rate-limit',
        message: `Telegram rate limit: ${description}`,
        retryAfter: new Date(Date.now() + retryAfterSec * 1000).toISOString(),
        providerCode: String(errorCode),
      })
    }

    if (errorCode === 401 || errorCode === 403) {
      return normalizeProviderError({
        kind: 'reconnect-required',
        message: `Telegram authorization failed: ${description}`,
        providerCode: String(errorCode),
      })
    }

    if (errorCode === 400) {
      return normalizeProviderError({
        kind: 'validation',
        message: `Telegram validation error: ${description}`,
        providerCode: String(errorCode),
      })
    }

    return normalizeProviderError({
      kind: status >= 500 ? 'transient' : 'validation',
      message: `Telegram API responded with error: ${description}`,
      providerCode: String(errorCode),
    })
  }
}
