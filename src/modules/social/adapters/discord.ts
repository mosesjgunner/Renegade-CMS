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
import { assertSocialEndpoint, socialFetch } from '../dispatch-boundary'
import { sanitizeSocialLog } from '../security'

export interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  timestamp?: string
  footer?: { text: string; icon_url?: string }
  image?: { url: string }
  thumbnail?: { url: string }
  author?: { name: string; url?: string; icon_url?: string }
  fields?: DiscordEmbedField[]
}

export interface DiscordPlatformSettings {
  channelId?: string
  webhookUrl?: string
  username?: string
  avatarUrl?: string
  tts?: boolean
  embeds?: DiscordEmbed[]
  threadId?: string
}

export class DiscordAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-discord'
  readonly name = 'Discord Webhook & Bot Adapter'
  readonly version = '2026.1.0'
  readonly network = 'discord' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['text', 'link', 'image', 'video'] as const,
    textLimit: 2000,
    media: { images: true, video: true, audio: true, maxAttachments: 10 },
    threads: true,
    linkCards: 'native' as const,
    edit: true,
    delete: true,
    nativeScheduling: false,
    authentication: { required: true, modes: ['webhook', 'bot-token'] },
    rateLimit: { requestsPerMinute: 3000, retryAfterHeader: 'retry-after' },
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsText: true,
      supportsImages: true,
      supportsVideo: true,
      supportsCarousels: false,
      supportsPolls: false,
      supportsThreads: true,
      supportsAltText: false,
      supportsNativeScheduling: false,
      supportsPostEditing: true,
      supportsPostDeletion: true,
      supportsAnalytics: false,
      supportsComments: true,
      supportsDrafts: false,
      requiresMedia: false,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: false,
      limits: {
        maxCharacters: 2000,
        maxImages: 10,
        maxVideoDurationSeconds: 600,
        maxVideoFileSizeBytes: 25 * 1024 * 1024,
        maxImageFileSizeBytes: 25 * 1024 * 1024,
      },
      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        allowedVideoMimes: ['video/mp4', 'video/quicktime', 'video/webm'],
        allowedVideoCodecs: ['h264', 'vp8'],
        aspectRatios: { minRatio: 0.5, maxRatio: 2.5 },
      },
    }
  }

  resolveDestination(
    variant: SocialVariant,
    authContext?: AuthContext,
  ): {
    mode: 'webhook' | 'bot'
    url: string
    headers: Record<string, string>
    channelId?: string
  } | null {
    const creds = authContext?.credentials
    const settings = variant.platformSettings as DiscordPlatformSettings | undefined

    const webhookUrl =
      settings?.webhookUrl || (creds?.webhookUrl as string) || (creds?.url as string)

    if (webhookUrl) {
      const parsed = new URL(webhookUrl)
      parsed.searchParams.set('wait', 'true')
      if (settings?.threadId) {
        parsed.searchParams.set('thread_id', settings.threadId)
      }
      return {
        mode: 'webhook',
        url: parsed.toString(),
        headers: {},
      }
    }

    const botToken =
      (creds?.botToken as string) || (creds?.token as string) || (creds?.appPassword as string)

    const channelId =
      settings?.channelId ||
      (creds?.channelId as string) ||
      (creds?.targetChannel as string) ||
      (authContext?.accountHandle as string)

    if (botToken && channelId) {
      const url = `https://discord.com/api/v10/channels/${channelId}/messages`
      return {
        mode: 'bot',
        url,
        headers: { Authorization: `Bot ${botToken}` },
        channelId,
      }
    }

    return null
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []

    const settings = variant.platformSettings as DiscordPlatformSettings | undefined
    const hasEmbeds = Boolean(settings?.embeds && settings.embeds.length > 0)
    const hasMedia = variant.attachments.length > 0

    if (!variant.text.trim() && !hasEmbeds && !hasMedia) {
      errors.push({
        field: 'text',
        message: 'Discord post must contain text content, rich embeds, or media attachments.',
        code: 'EMPTY_POST',
      })
    }

    if (variant.text.length > 2000) {
      errors.push({
        field: 'text',
        message: `Message length (${variant.text.length}) exceeds Discord limit of 2000 characters.`,
        code: 'TEXT_TOO_LONG',
      })
    }

    if (variant.attachments.length > 10) {
      errors.push({
        field: 'attachments',
        message: 'Discord supports a maximum of 10 attachments per message.',
        code: 'TOO_MANY_ATTACHMENTS',
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
    const destination = this.resolveDestination(variant, authContext)
    if (!destination) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'reconnect-required',
          message:
            'Discord requires either a webhookUrl or botToken with destination channelId. Reconnect or configure settings.',
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

    // Route through the shared dispatch boundary like the sibling adapters:
    // it enforces the same outbound policy (HTTPS, or an explicitly
    // allowlisted loopback origin in local-harness mode) and socialFetch
    // applies the shared timeout/redirect policy. Previously this adapter
    // pre-checked with a stricter private rule and fetched directly, so it
    // had no sanctioned local-harness path at all.
    try {
      assertSocialEndpoint(destination.url)
    } catch (error) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: `Outbound URL blocked: ${error instanceof Error ? error.message : 'boundary check failed'}`,
        }),
      }
    }

    const settings = (variant.platformSettings || {}) as DiscordPlatformSettings

    try {
      const attachments = variant.attachments
      let res: Response

      const payloadObj: Record<string, unknown> = {
        content: variant.text || '',
        tts: settings.tts ?? false,
      }

      if (destination.mode === 'webhook') {
        if (settings.username) payloadObj.username = settings.username
        if (settings.avatarUrl) payloadObj.avatar_url = settings.avatarUrl
      }

      if (settings.embeds && settings.embeds.length > 0) {
        payloadObj.embeds = settings.embeds
      } else if (variant.linkUrl && !attachments.length) {
        payloadObj.embeds = [
          {
            url: variant.linkUrl,
            description: variant.linkUrl,
          },
        ]
      }

      if (attachments.length === 0) {
        res = await socialFetch(destination.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...destination.headers,
          },
          body: JSON.stringify(payloadObj),
        })
      } else {
        const formData = new FormData()
        formData.append('payload_json', JSON.stringify(payloadObj))

        for (let i = 0; i < attachments.length; i++) {
          const item = attachments[i]
          if (mediaResolver) {
            const resolved = await mediaResolver.resolveBuffer(item.mediaAssetId)
            const blob = new Blob([new Uint8Array(resolved.buffer)], { type: resolved.mimeType })
            formData.append(`files[${i}]`, blob, resolved.fileName)
          }
        }

        res = await socialFetch(destination.url, {
          method: 'POST',
          headers: { ...destination.headers },
          body: formData,
        })
      }

      const body = (await res.json().catch(() => null)) as {
        id?: string
        channel_id?: string
        guild_id?: string
        message?: string
        code?: number
        retry_after?: number
      } | null

      if (!res.ok) {
        return {
          status: 'failed',
          error: this.mapDiscordError(res.status, res.headers, body),
        }
      }

      // Receipt honesty: Discord confirms creation by returning the created
      // message object (the webhook is called with wait=true; the bot
      // messages endpoint returns the message synchronously). Without a
      // real message ID in that response there is no receipt to record —
      // never invent one from the local clock, and never build a URL from
      // fallback channel/guild segments.
      if (!body?.id) {
        return {
          status: 'unknown',
          error: normalizeProviderError({
            kind: 'remote-unknown',
            remoteOutcome: 'unknown',
            message:
              'Discord accepted the request but its response did not include the created message ID, so the post cannot be confirmed. Reconcile before retrying — do not post it again blindly.',
          }),
        }
      }

      const remotePostId = body.id
      const channelId = body.channel_id || destination.channelId
      // A message object without guild_id lives in a DM channel, which
      // Discord itself addresses with the literal '@me' guild segment.
      const guildId = body.guild_id || '@me'
      const remoteUrl = channelId
        ? `https://discord.com/channels/${guildId}/${channelId}/${remotePostId}`
        : undefined

      const receipt: DeliveryReceipt | undefined = remoteUrl
        ? {
            remotePostId,
            remoteUrl,
            publishedAt: new Date(),
            rawResponse: body as Record<string, unknown>,
          }
        : undefined

      return {
        status: 'published',
        remoteId: remotePostId,
        ...(remoteUrl ? { remoteUrl } : {}),
        ...(receipt ? { receipt } : {}),
      }
    } catch (err: unknown) {
      const msg = sanitizeSocialLog(err instanceof Error ? err.message : String(err))
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'transient',
          message: `Discord dispatch failed: ${msg}`,
        }),
      }
    }
  }

  async editPost(
    remotePostId: string,
    variant: SocialVariant,
    authContext: AuthContext,
  ): Promise<DeliveryReceipt> {
    const destination = this.resolveDestination(variant, authContext)
    if (!destination) {
      throw new Error('Discord destination configuration missing for editPost')
    }

    let editUrl = destination.url
    if (destination.mode === 'webhook') {
      const baseWebhook = destination.url.split('?')[0]
      editUrl = `${baseWebhook}/messages/${remotePostId}`
    } else {
      editUrl = `https://discord.com/api/v10/channels/${destination.channelId}/messages/${remotePostId}`
    }

    const res = await socialFetch(editUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...destination.headers,
      },
      body: JSON.stringify({ content: variant.text }),
    })

    const body = (await res.json().catch(() => ({}))) as {
      id?: string
      channel_id?: string
      guild_id?: string
    }
    if (!res.ok) {
      throw new Error(`Discord edit failed: ${res.statusText}`)
    }

    // The receipt URL is built only from the edited message's real
    // channel/guild IDs as Discord returns them (or the bot destination's
    // configured channel) — never from placeholder '@me'/0 segments. A
    // message object without guild_id is a DM, which Discord itself
    // addresses with the literal '@me' guild segment.
    const channelId = body.channel_id || destination.channelId
    if (!channelId) {
      throw new Error(
        'Discord edit response did not include the message channel ID; no receipt URL can be confirmed.',
      )
    }
    const guildId = body.guild_id || '@me'

    return {
      remotePostId,
      remoteUrl: `https://discord.com/channels/${guildId}/${channelId}/${remotePostId}`,
      publishedAt: new Date(),
      rawResponse: body as Record<string, unknown>,
    }
  }

  async deletePost(remotePostId: string, authContext: AuthContext): Promise<void> {
    const creds = authContext?.credentials
    const webhookUrl = (creds?.webhookUrl as string) || (creds?.url as string)
    const botToken = (creds?.botToken as string) || (creds?.token as string)
    const channelId = creds?.channelId as string

    // Route through the shared dispatch boundary like publish/edit above:
    // the webhook URL comes from connection credentials, so without the
    // boundary this was an unvalidated server-side request to an
    // operator-supplied destination. socialFetch enforces the outbound
    // policy (HTTPS, or an explicitly allowlisted loopback origin in
    // local-harness mode) plus the shared timeout/redirect policy, and a
    // blocked destination now fails loudly instead of silently egressing.
    if (webhookUrl) {
      const baseWebhook = webhookUrl.split('?')[0]
      await socialFetch(`${baseWebhook}/messages/${remotePostId}`, { method: 'DELETE' })
    } else if (botToken && channelId) {
      await socialFetch(
        `https://discord.com/api/v10/channels/${channelId}/messages/${remotePostId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bot ${botToken}` },
        },
      )
    }
  }

  async fetchPost(remotePostId: string, authContext: AuthContext): Promise<NormalizedRemotePost> {
    const creds = authContext?.credentials
    const webhookUrl = (creds?.webhookUrl as string) || (creds?.url as string)
    const botToken =
      (creds?.botToken as string) || (creds?.token as string) || (creds?.appPassword as string)
    const channelId =
      (creds?.channelId as string) ||
      (creds?.targetChannel as string) ||
      (authContext?.accountHandle as string)

    // Read the real message back from Discord — a fabricated URL with an
    // invented timestamp (the previous behaviour) is not a fetch.
    let url: string
    let headers: Record<string, string> = {}
    if (webhookUrl) {
      const baseWebhook = webhookUrl.split('?')[0]
      url = `${baseWebhook}/messages/${remotePostId}`
    } else if (botToken && channelId) {
      url = `https://discord.com/api/v10/channels/${channelId}/messages/${remotePostId}`
      headers = { Authorization: `Bot ${botToken}` }
    } else {
      throw new Error(
        'Discord fetchPost requires either a webhookUrl or botToken with destination channelId.',
      )
    }

    assertSocialEndpoint(url)
    const res = await socialFetch(url, { method: 'GET', headers })
    if (!res.ok) {
      throw new Error(`Failed to fetch Discord message: HTTP ${res.status}`)
    }

    const data = (await res.json().catch(() => null)) as {
      id?: string
      channel_id?: string
      guild_id?: string
      content?: string
      timestamp?: string
    } | null

    if (!data?.id || !(data.channel_id || channelId) || !data.timestamp) {
      throw new Error(
        'Discord fetchPost response did not include the message ID, channel ID and timestamp.',
      )
    }

    // A message object without guild_id is a DM, which Discord itself
    // addresses with the literal '@me' guild segment.
    const guildId = data.guild_id || '@me'
    const resolvedChannelId = data.channel_id || channelId

    return {
      remoteId: data.id,
      remoteUrl: `https://discord.com/channels/${guildId}/${resolvedChannelId}/${data.id}`,
      text: data.content || '',
      publishedAt: new Date(data.timestamp),
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

  private mapDiscordError(
    status: number,
    headers: Headers,
    body: { message?: string; code?: number; retry_after?: number } | null,
  ) {
    const message = body?.message || 'Discord Error'
    const code = body?.code ? String(body.code) : String(status)

    if (status === 429) {
      const headerReset = headers.get('x-ratelimit-reset-after')
      const retrySec = body?.retry_after || (headerReset ? Number(headerReset) : 5)
      return normalizeProviderError({
        kind: 'rate-limit',
        message: `Discord rate limit: ${message}`,
        retryAfter: new Date(Date.now() + Math.ceil(retrySec) * 1000).toISOString(),
        providerCode: code,
      })
    }

    if (status === 401 || status === 403) {
      return normalizeProviderError({
        kind: 'reconnect-required',
        message: `Discord authorization failed: ${message}`,
        providerCode: code,
      })
    }

    if (status === 400) {
      return normalizeProviderError({
        kind: 'validation',
        message: `Discord validation error: ${message}`,
        providerCode: code,
      })
    }

    return normalizeProviderError({
      kind: status >= 500 ? 'transient' : 'validation',
      message: `Discord error: ${message}`,
      providerCode: code,
    })
  }
}
