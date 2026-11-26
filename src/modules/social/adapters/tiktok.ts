import {
  normalizeProviderError,
  type AccountConstraints,
  type AdapterResult,
  type AuthContext,
  type MediaResolver,
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

export interface TikTokPublishStatus {
  status: 'PROCESSING_DOWNLOAD' | 'PROCESSING_UPLOAD' | 'SUCCESS' | 'FAILED'
  /** TikTok's own failure reason when the publish task FAILED. */
  failReason?: string
  /**
   * Real, publicly available post ID once TikTok has actually posted the
   * video. TikTok's status response carries it as
   * `publicaly_available_post_id` (the provider's own spelling).
   */
  postId?: string
}

export type TikTokAdapterTiming = {
  /** Delay between publish-status polls after the upload finishes. */
  pollIntervalMs?: number
  /** Bounded number of publish-status polls before the outcome stays unknown. */
  maxPolls?: number
  sleep?: (ms: number) => Promise<void>
}

export class TikTokAdapter implements SocialProviderAdapter {
  constructor(private readonly timing: TikTokAdapterTiming = {}) {}
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
   * Checks publication status via polling. Surfaces TikTok's failure
   * reason and the real post ID alongside the status so callers never
   * have to invent either one.
   */
  async checkPublishStatus(accessToken: string, publishId: string): Promise<TikTokPublishStatus> {
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
      data?: {
        status: 'PROCESSING_DOWNLOAD' | 'PROCESSING_UPLOAD' | 'SUCCESS' | 'FAILED'
        fail_reason?: string
        publicaly_available_post_id?: Array<number | string>
      }
    }

    if (!data.data) return { status: 'PROCESSING_UPLOAD' }

    // A post ID is only trustworthy as an exact identifier: JSON numbers
    // past the safe-integer range have already lost precision in parsing,
    // so only safe integers and digit strings are accepted.
    const rawPostId = data.data.publicaly_available_post_id?.find(
      (value) =>
        (typeof value === 'number' && Number.isSafeInteger(value)) ||
        (typeof value === 'string' && /^\d+$/.test(value)),
    )

    return {
      status: data.data.status,
      failReason:
        typeof data.data.fail_reason === 'string' && data.data.fail_reason
          ? data.data.fail_reason
          : undefined,
      postId: rawPostId !== undefined ? String(rawPostId) : undefined,
    }
  }

  /**
   * The receipt gate: an upload counts as published only when TikTok's
   * publish-status endpoint confirms SUCCESS. Bounded polls; a task
   * still processing when the bound runs out stays `unknown` — never
   * fake-published — and a FAILED task surfaces TikTok's own reason.
   * The remote URL is built only from the real post ID TikTok returns
   * plus the account's real handle; without a real post ID there is no
   * URL, never a constructed one.
   */
  private async confirmPublish(
    accessToken: string,
    publishId: string,
    auth?: AuthContext,
  ): Promise<AdapterResult> {
    const maxPolls = this.timing.maxPolls ?? 5
    const interval = this.timing.pollIntervalMs ?? 2000
    const sleep =
      this.timing.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))

    for (let poll = 0; poll < maxPolls; poll += 1) {
      if (poll > 0) await sleep(interval)
      let outcome: TikTokPublishStatus
      try {
        outcome = await this.checkPublishStatus(accessToken, publishId)
      } catch {
        // A transient status-check failure does not condemn the upload —
        // TikTok already has the bytes. Keep polling within the bound;
        // if the bound runs out the outcome stays unknown.
        continue
      }

      if (outcome.status === 'FAILED') {
        return {
          status: 'failed',
          error: normalizeProviderError({
            kind: 'validation',
            providerCode: outcome.failReason,
            message: outcome.failReason
              ? `TikTok could not publish this video (${outcome.failReason}). It will not be posted; fix the video and create a new post instead of retrying this upload.`
              : 'TikTok could not publish this video. It will not be posted; fix the video and create a new post instead of retrying this upload.',
          }),
        }
      }

      if (outcome.status === 'SUCCESS') {
        const handle = auth?.accountHandle?.replace(/^@/, '').trim()
        const remoteUrl =
          outcome.postId && handle
            ? `https://www.tiktok.com/@${handle}/video/${outcome.postId}`
            : undefined
        return {
          status: 'published',
          remoteId: outcome.postId ?? publishId,
          ...(remoteUrl ? { remoteUrl } : {}),
          rawResponse: {
            publish_id: publishId,
            ...(outcome.postId ? { post_id: outcome.postId } : {}),
            publish_status: 'SUCCESS',
          },
          ...(remoteUrl && outcome.postId
            ? {
                receipt: {
                  remotePostId: outcome.postId,
                  remoteUrl,
                  publishedAt: new Date(),
                  rawResponse: {
                    publish_id: publishId,
                    post_id: outcome.postId,
                    publish_status: 'SUCCESS',
                  },
                },
              }
            : {}),
        }
      }
      // PROCESSING_DOWNLOAD / PROCESSING_UPLOAD: keep polling.
    }

    return {
      status: 'unknown',
      error: normalizeProviderError({
        kind: 'remote-unknown',
        remoteOutcome: 'unknown',
        message: `TikTok accepted the upload (publish task ${publishId}) but has not confirmed it was posted. Check TikTok before retrying — do not upload it again blindly.`,
      }),
    }
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

      // Step 3: Confirm publication with TikTok before claiming success.
      // The upload finishing only means TikTok received the bytes; the
      // publish task still has to process and post the video.
      return await this.confirmPublish(accessToken, initResult.publishId, auth)
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
