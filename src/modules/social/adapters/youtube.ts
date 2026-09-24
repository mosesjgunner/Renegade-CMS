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

export interface YouTubePlatformSettings {
  channelId?: string
  videoTitle?: string
  privacyStatus?: 'public' | 'private' | 'unlisted'
  tags?: string[]
  categoryId?: string
  madeForKids?: boolean
  notifySubscribers?: boolean
  customThumbnailAssetId?: string
  isShort?: boolean
}

export class YouTubeAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-youtube'
  readonly name = 'YouTube Data API v3 Adapter'
  readonly version = '2026.1.0'
  readonly network = 'youtube' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['video'] as const,
    textLimit: 5000, // Description limit
    media: { images: false, video: true, audio: false, maxAttachments: 1 },
    threads: false,
    linkCards: 'none' as const,
    edit: true, // Title, description, privacy, tags
    delete: true,
    nativeScheduling: true,
    authentication: { required: true, modes: ['oauth2-google'] },
    rateLimit: { requestsPerMinute: 600, retryAfterHeader: 'retry-after' },
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsText: false,
      supportsImages: false,
      supportsVideo: true,
      supportsCarousels: false,
      supportsPolls: false,
      supportsThreads: false,
      supportsAltText: false,
      supportsNativeScheduling: true,
      supportsPostEditing: true,
      supportsPostDeletion: true,
      supportsAnalytics: true,
      supportsComments: true,
      supportsDrafts: true,
      requiresMedia: true,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: true,

      limits: {
        maxCharacters: 5000,
        maxImages: 0,
        maxVideoDurationSeconds: 43200, // 12 hours
        maxVideoFileSizeBytes: 256 * 1024 * 1024 * 1024, // 256 GB
        maxImageFileSizeBytes: 2 * 1024 * 1024, // Thumbnail 2MB
      },

      mediaConstraints: {
        allowedImageMimes: ['image/jpeg', 'image/png'],
        allowedVideoMimes: ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'],
        allowedVideoCodecs: ['h264', 'h265', 'vp9', 'av1'],
        aspectRatios: {
          minRatio: 0.56,
          maxRatio: 1.78,
          strictStandard: 'LANDSCAPE_16_9',
        },
      },
    }
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []
    const settings = variant.platformSettings as YouTubePlatformSettings | undefined

    if (!variant.attachments.length) {
      errors.push({
        field: 'attachments',
        message: 'YouTube requires exactly one video attachment.',
        code: 'VIDEO_REQUIRED',
      })
    } else {
      const att = variant.attachments[0]
      if (att.role !== 'video') {
        errors.push({
          field: 'attachments',
          message: 'YouTube attachments must be video assets.',
          code: 'INVALID_MEDIA_TYPE',
        })
      }
    }

    if (variant.attachments.length > 1) {
      errors.push({
        field: 'attachments',
        message: 'YouTube does not support multiple video attachments.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    const title = settings?.videoTitle || variant.text.slice(0, 100)
    if (!title.trim()) {
      errors.push({
        field: 'videoTitle',
        message: 'YouTube video requires a non-empty title.',
        code: 'TITLE_REQUIRED',
      })
    } else if (title.length > 100) {
      errors.push({
        field: 'videoTitle',
        message: `YouTube title exceeds 100 character limit (${title.length}).`,
        code: 'TITLE_TOO_LONG',
      })
    }

    if (variant.text.length > 5000) {
      errors.push({
        field: 'text',
        message: `YouTube description exceeds 5,000 character limit (${variant.text.length}).`,
        code: 'DESCRIPTION_TOO_LONG',
      })
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  /**
   * Resumable upload session initiator according to Google Resumable Protocol.
   */
  async initiateResumableUpload(
    accessToken: string,
    metadata: {
      title: string
      description: string
      privacyStatus: string
      tags?: string[]
      madeForKids?: boolean
      categoryId?: string
    },
    totalByteSize: number,
    mimeType: string,
  ): Promise<string> {
    const endpoint =
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'
    const ssrf = validateOutboundUrl(endpoint)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const body = {
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags || [],
        categoryId: metadata.categoryId || '22', // Default: People & Blogs
      },
      status: {
        privacyStatus: metadata.privacyStatus || 'public',
        selfDeclaredMadeForKids: metadata.madeForKids ?? false,
      },
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(totalByteSize),
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      throw new Error(
        `Failed to initiate YouTube resumable upload: ${err?.error?.message || res.statusText}`,
      )
    }

    const sessionUri = res.headers.get('location')
    if (!sessionUri) {
      throw new Error('Google resumable upload did not return a Location session header')
    }

    return sessionUri
  }

  /**
   * Uploads binary buffer chunk to resumable upload URI.
   */
  async uploadVideoBuffer(
    sessionUri: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ id: string }> {
    const ssrf = validateOutboundUrl(sessionUri)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(sessionUri, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(buffer.length),
        'Content-Range': `bytes 0-${buffer.length - 1}/${buffer.length}`,
      },
      body: new Uint8Array(buffer),
    })

    if (!res.ok && res.status !== 200 && res.status !== 201) {
      throw new Error(`YouTube video chunk upload failed with HTTP ${res.status}`)
    }

    const data = (await res.json()) as { id: string }
    return data
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
    const settings = variant.platformSettings as YouTubePlatformSettings | undefined

    if (!accessToken) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'authentication',
          message: 'YouTube publishing requires a valid Google OAuth 2.0 access token.',
        }),
      }
    }

    if (!variant.attachments.length || !mediaResolver) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: 'YouTube publishing requires a video attachment and MediaResolver.',
        }),
      }
    }

    const att = variant.attachments[0]
    const title = settings?.videoTitle || variant.text.slice(0, 100) || 'Untitled Video'
    const description = variant.text

    try {
      const { buffer, mimeType } = await mediaResolver.resolveBuffer(att.mediaAssetId)

      // Step 1: Initiate Resumable Session
      const sessionUri = await this.initiateResumableUpload(
        accessToken,
        {
          title,
          description,
          privacyStatus: settings?.privacyStatus || 'public',
          tags: settings?.tags,
          madeForKids: settings?.madeForKids,
          categoryId: settings?.categoryId,
        },
        buffer.length,
        mimeType || 'video/mp4',
      )

      // Step 2: Upload Video Binary
      const videoResult = await this.uploadVideoBuffer(sessionUri, buffer, mimeType || 'video/mp4')
      const videoId = videoResult.id
      const remoteUrl = `https://www.youtube.com/watch?v=${videoId}`

      // Step 3: Optional Custom Thumbnail
      if (settings?.customThumbnailAssetId) {
        try {
          const thumb = await mediaResolver.resolveBuffer(settings.customThumbnailAssetId)
          const thumbEndpoint = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`
          await fetch(thumbEndpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': thumb.mimeType || 'image/jpeg',
            },
            body: new Uint8Array(thumb.buffer),
          })
        } catch {
          // Thumbnail failure is non-fatal to video publication
        }
      }

      return {
        status: 'published',
        remoteId: videoId,
        remoteUrl,
        receipt: {
          remotePostId: videoId,
          remoteUrl,
          publishedAt: new Date(),
          rawResponse: videoResult as unknown as Record<string, unknown>,
        },
      }
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number }
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'transient',
          message: err.message || 'YouTube upload pipeline encountered an unexpected error.',
        }),
      }
    }
  }

  async deletePost(remotePostId: string, authContext: AuthContext): Promise<void> {
    const accessToken = authContext.credentials?.accessToken || authContext.tokens?.accessToken
    if (!accessToken) throw new Error('Missing token for YouTube delete')

    const endpoint = `https://www.googleapis.com/youtube/v3/videos?id=${remotePostId}`
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok && res.status !== 204) {
      throw new Error(`YouTube video deletion failed with HTTP ${res.status}`)
    }
  }
}
