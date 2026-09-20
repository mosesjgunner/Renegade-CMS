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

export interface TikTokPlatformSettings {
  privacyLevel?:
    | 'PUBLIC_TO_EVERYONE'
    | 'MUTUAL_FOLLOW_FRIENDS'
    | 'FOLLOWER_OF_CREATOR'
    | 'SELF_ONLY'
  disableDuet?: boolean
  disableStitch?: boolean
  disableComment?: boolean
  brandOrganicToggle?: boolean
  brandContentToggle?: boolean
  videoCoverTimestampMs?: number
  autoAddMusic?: boolean
}

export interface TikTokCreatorInfo {
  creator_avatar_url: string
  creator_nickname: string
  creator_username: string
  privacy_level_options: string[]
  comment_disabled: boolean
  duet_disabled: boolean
  stitch_disabled: boolean
  max_video_post_duration_sec: number
}

export class TikTokAdapter implements SocialProviderAdapter {
  readonly id = 'adapter-tiktok'
  readonly name = 'TikTok Content Posting API v2 Adapter'
  readonly version = '2026.1.0'
  readonly network = 'tiktok' as const
  readonly mode = 'live' as const

  readonly capabilities = {
    postTypes: ['video'] as const,
    textLimit: 2200,
    media: { images: false, video: true, audio: false, maxAttachments: 1 },
    threads: false,
    linkCards: 'none' as const,
    edit: false, // TikTok does not allow editing captions/video post-publish
    delete: false, // TikTok API v2 does not provide a public delete endpoint
    nativeScheduling: false,
    authentication: { required: true, modes: ['oauth2-pkce'] },
    rateLimit: { requestsPerMinute: 60, retryAfterHeader: 'retry-after' },
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
      supportsNativeScheduling: false,
      supportsPostEditing: false,
      supportsPostDeletion: false,
      supportsAnalytics: true,
      supportsComments: true,
      supportsDrafts: true,
      requiresMedia: true,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: true,

      limits: {
        maxCharacters: 2200,
        maxImages: 0,
        maxVideoDurationSeconds: 600, // 10 minutes
        maxVideoFileSizeBytes: 1024 * 1024 * 1024, // 1 GB
        maxImageFileSizeBytes: 0,
      },

      mediaConstraints: {
        allowedImageMimes: [],
        allowedVideoMimes: ['video/mp4', 'video/webm', 'video/quicktime'],
        allowedVideoCodecs: ['h264', 'h265'],
        aspectRatios: {
          minRatio: 0.56,
          maxRatio: 0.57,
          strictStandard: 'VERTICAL_9_16',
        },
      },
    }
  }

  validatePost(variant: SocialVariant, constraints?: AccountConstraints): ValidationReport {
    const errors: ValidationReport['errors'] = []
    const warnings: ValidationReport['warnings'] = []

    if (!variant.attachments.length) {
      errors.push({
        field: 'attachments',
        message: 'TikTok requires exactly one video attachment.',
        code: 'VIDEO_REQUIRED',
      })
    } else {
      const att = variant.attachments[0]
      if (att.role !== 'video') {
        errors.push({
          field: 'attachments',
          message: 'TikTok attachment must be a video.',
          code: 'INVALID_MEDIA_TYPE',
        })
      }
    }

    if (variant.attachments.length > 1) {
      errors.push({
        field: 'attachments',
        message: 'TikTok does not support multiple video attachments.',
        code: 'TOO_MANY_ATTACHMENTS',
      })
    }

    if (variant.text.length > 2200) {
      errors.push({
        field: 'text',
        message: `Caption exceeds TikTok 2,200 character limit (${variant.text.length}).`,
        code: 'CAPTION_TOO_LONG',
      })
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  /**
   * Query creator profile permissions (privacy options, duet/stitch status, duration).
   */
  async queryCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    const endpoint = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/'
    const ssrf = validateOutboundUrl(endpoint)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    })

    if (!res.ok) {
      throw new Error(`Failed to query TikTok creator info: HTTP ${res.status}`)
    }

    const data = (await res.json()) as { data?: TikTokCreatorInfo; error?: { message?: string } }
    if (!data.data) {
      throw new Error(data.error?.message || 'TikTok creator info query returned empty payload')
    }

    return data.data
  }

  /**
   * Initializes direct video publishing session via TikTok Content Posting API v2.
   */
  async initVideoPublish(
    accessToken: string,
    params: {
      postInfo: {
        title: string
        privacy_level: string
        disable_duet?: boolean
        disable_stitch?: boolean
        disable_comment?: boolean
        brand_organic_toggle?: boolean
        brand_content_toggle?: boolean
        video_cover_timestamp_ms?: number
      }
      sourceInfo: {
        source: 'FILE_UPLOAD' | 'PULL_FROM_URL'
        video_size?: number
        chunk_size?: number
        total_chunk_count?: number
        video_url?: string
      }
    },
  ): Promise<{ publishId: string; uploadUrl?: string }> {
    const endpoint = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
    const ssrf = validateOutboundUrl(endpoint)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: params.postInfo,
        source_info: params.sourceInfo,
      }),
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as {
        error?: { message?: string; code?: string }
      } | null
      throw new Error(
        `TikTok post init failed (HTTP ${res.status}): ${err?.error?.message || res.statusText}`,
      )
    }

    const data = (await res.json()) as {
      data?: { publish_id: string; upload_url?: string }
      error?: { message?: string }
    }

    if (!data.data?.publish_id) {
      throw new Error(data.error?.message || 'TikTok did not return a valid publish_id')
    }

    return {
      publishId: data.data.publish_id,
      uploadUrl: data.data.upload_url,
    }
  }

  /**
   * Uploads binary video data to TikTok's dedicated S3/storage target.
   */
  async uploadBinaryChunk(uploadUrl: string, buffer: Buffer): Promise<void> {
    const ssrf = validateOutboundUrl(uploadUrl)
    if (!ssrf.isValid) throw new Error(`SSRF Blocked: ${ssrf.reason}`)

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes 0-${buffer.length - 1}/${buffer.length}`,
        'Content-Length': String(buffer.length),
      },
      body: new Uint8Array(buffer),
    })

    if (!res.ok && res.status !== 200 && res.status !== 201) {
      throw new Error(`TikTok binary chunk upload failed with HTTP ${res.status}`)
    }
  }

  /**
   * Checks publication status via polling.
   */
  async checkPublishStatus(
    accessToken: string,
    publishId: string,
  ): Promise<{ status: 'PROCESSING_DOWNLOAD' | 'PROCESSING_UPLOAD' | 'SUCCESS' | 'FAILED' }> {
    const endpoint = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/'
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publish_id: publishId }),
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch TikTok publish status (HTTP ${res.status})`)
    }

    const data = (await res.json()) as {
      data?: { status: 'PROCESSING_DOWNLOAD' | 'PROCESSING_UPLOAD' | 'SUCCESS' | 'FAILED' }
    }

    return data.data || { status: 'PROCESSING_UPLOAD' }
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
    const settings = variant.platformSettings as TikTokPlatformSettings | undefined

    if (!accessToken) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'authentication',
          message: 'TikTok publishing requires an OAuth 2.0 user access token.',
        }),
      }
    }

    if (!variant.attachments.length || !mediaResolver) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message: 'TikTok publishing requires a video attachment and MediaResolver.',
        }),
      }
    }

    const att = variant.attachments[0]

    try {
      const { buffer } = await mediaResolver.resolveBuffer(att.mediaAssetId)

      // Step 1: Initialize Publishing Task
      const initResult = await this.initVideoPublish(accessToken, {
        postInfo: {
          title: variant.text,
          privacy_level: settings?.privacyLevel || 'PUBLIC_TO_EVERYONE',
          disable_duet: settings?.disableDuet ?? false,
          disable_stitch: settings?.disableStitch ?? false,
          disable_comment: settings?.disableComment ?? false,
          brand_organic_toggle: settings?.brandOrganicToggle ?? false,
          brand_content_toggle: settings?.brandContentToggle ?? false,
          video_cover_timestamp_ms: settings?.videoCoverTimestampMs,
        },
        sourceInfo: {
          source: 'FILE_UPLOAD',
          video_size: buffer.length,
          chunk_size: buffer.length,
          total_chunk_count: 1,
        },
      })

      // Step 2: Upload Binary Chunk to TikTok S3 destination
      if (initResult.uploadUrl) {
        await this.uploadBinaryChunk(initResult.uploadUrl, buffer)
      }

      const remoteUrl = `https://www.tiktok.com/@creator/video/${initResult.publishId}`

      return {
        status: 'published',
        remoteId: initResult.publishId,
        remoteUrl,
        receipt: {
          remotePostId: initResult.publishId,
          remoteUrl,
          publishedAt: new Date(),
          rawResponse: { publish_id: initResult.publishId },
        },
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'transient',
          message: err.message || 'TikTok video publishing failed.',
        }),
      }
    }
  }
}
