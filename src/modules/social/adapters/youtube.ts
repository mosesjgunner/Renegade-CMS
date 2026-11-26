import {
  normalizeProviderError,
  type AdapterResult,
  type AuthContext,
  type MediaResolver,
  type ProviderCapabilities,
  type ValidationReport,
  type SocialProviderAdapter,
  type SocialVariant,
  type StreamedSocialVideo,
} from '../contracts'
import {
  YouTubeError,
  YouTubeMetadata,
  youtubeConfiguration,
  youtubeReadonly,
  youtubeResponseError,
  youtubeUpload,
  type YouTubeGrant,
} from '../../creator-studio/youtube-metadata'
import { youtubeChannelId, youtubeVideoId } from '../../creator-studio/video-providers'

const origin = 'https://www.googleapis.com'
const uploadPath = '/upload/youtube/v3/videos'
const chunkSize = 8 * 1024 * 1024
const maxBytes = 256 * 1024 ** 3
const videoMimes = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm']

export function youtubePublishingEnabled() {
  return process.env.CREATOR_YOUTUBE_UPLOAD_AUTHORIZED === 'true' && Boolean(youtubeConfiguration())
}

export function youtubeUploadSettings(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { title, privacy, complianceConfirmed, madeForKids, channelId } = value as Record<
    string,
    unknown
  >
  if (
    typeof channelId !== 'string' ||
    !youtubeChannelId.test(channelId) ||
    typeof title !== 'string' ||
    !title.trim() ||
    title.length > 100 ||
    (privacy !== 'private' && privacy !== 'unlisted' && privacy !== 'public') ||
    complianceConfirmed !== true ||
    (madeForKids !== 'yes' && madeForKids !== 'no')
  )
    return null
  return { channelId, title: title.trim(), privacy, complianceConfirmed, madeForKids }
}

export function youtubeApprovedSettings(network: string, value: unknown) {
  const settings = network === 'youtube' && youtubeUploadSettings(value)
  return settings ? { platformSettings: settings } : {}
}

function uploadSession(value: string | null) {
  if (!value) throw new Error('Missing YouTube upload session.')
  const url = new URL(value)
  if (
    url.origin !== origin ||
    url.pathname !== uploadPath ||
    url.hash ||
    url.username ||
    url.password ||
    !url.searchParams.has('upload_id')
  )
    throw new Error('Invalid YouTube upload session.')
  return url
}

const unknown = (remoteId?: string): AdapterResult => ({
  status: 'unknown',
  ...(remoteId ? { remoteId } : {}),
  error: normalizeProviderError({
    kind: 'remote-unknown',
    remoteOutcome: 'unknown',
    message: remoteId
      ? `YouTube accepted the upload (video ${remoteId}) but has not confirmed it finished processing. Reconciliation will confirm it from YouTube — do not upload it again.`
      : 'YouTube upload outcome is uncertain. Check YouTube Studio before retrying.',
  }),
})

/**
 * Quota honesty: YouTube's daily buckets (the 100-uploads/day insert
 * bucket and the shared daily unit quota) reset at midnight UTC, while
 * rate limits are hourly. The two must never be conflated — a daily
 * exhaustion retried in an hour just fails again and hides the real
 * limit from the operator.
 */
const dailyQuotaReasons = ['quotaExceeded', 'dailyLimitExceeded', 'uploadLimitExceeded']

export function nextUtcMidnight(from = Date.now()): string {
  const date = new Date(from)
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0),
  ).toISOString()
}

function failure(error: unknown): AdapterResult {
  if (error instanceof YouTubeError && error.kind === 'quota') {
    if (error.reason && dailyQuotaReasons.includes(error.reason)) {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'rate-limit',
          message:
            error.reason === 'uploadLimitExceeded'
              ? 'YouTube allows 100 uploads per day on this authorization, and today’s upload limit has been reached. Uploads can resume after the daily reset at midnight UTC.'
              : 'YouTube’s daily API quota for this authorization has been reached. It resets at midnight UTC.',
          retryAfter: nextUtcMidnight(),
          providerCode: error.reason,
        }),
      }
    }
    const header = error.retryAfter
    const seconds = Number(header)
    const retryAt = !header
      ? Date.now() + 60 * 60_000
      : /^\d+$/.test(header)
        ? Date.now() + seconds * 1000
        : Date.parse(header)
    return {
      status: 'failed',
      error: normalizeProviderError({
        kind: 'rate-limit',
        message: error.message,
        retryAfter:
          Number.isFinite(retryAt) && retryAt <= 8.64e15
            ? new Date(retryAt).toISOString()
            : undefined,
      }),
    }
  }
  if (error instanceof YouTubeError && ['revoked', 'scope', 'claim'].includes(error.kind))
    return {
      status: 'failed',
      error: normalizeProviderError({ kind: 'reconnect-required', message: error.message }),
    }
  return {
    status: 'failed',
    error: normalizeProviderError({
      kind: 'transient',
      message: 'YouTube could not start the upload.',
    }),
  }
}

export type YouTubeAdapterTiming = {
  /** Delay between processing-status polls after the byte transfer. */
  pollIntervalMs?: number
  /** Bounded number of processing-status polls before the outcome stays unknown. */
  maxPolls?: number
  sleep?: (ms: number) => Promise<void>
}

export class YouTubeAdapter implements SocialProviderAdapter {
  constructor(
    private request?: typeof fetch,
    private timing: YouTubeAdapterTiming = {},
  ) {}

  readonly id = 'adapter-youtube'
  readonly network = 'youtube' as const
  readonly mode = 'live' as const
  readonly capabilities = {
    postTypes: ['video'] as const,
    textLimit: 5000,
    media: { images: false, video: true, audio: false, maxAttachments: 1 },
    threads: false,
    linkCards: 'none' as const,
    edit: false,
    delete: false,
    nativeScheduling: false,
    authentication: { required: true, modes: ['oauth2-google'] },
    rateLimit: { retryAfterHeader: 'retry-after' },
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
      supportsAnalytics: false,
      supportsComments: false,
      supportsDrafts: false,
      requiresMedia: true,
      requiresBoardOrCategory: false,
      supportsCustomThumbnails: false,
      limits: {
        maxCharacters: this.capabilities.textLimit,
        maxImages: 0,
        maxVideoDurationSeconds: 12 * 60 * 60,
        maxVideoFileSizeBytes: maxBytes,
        maxImageFileSizeBytes: 0,
      },
      mediaConstraints: {
        allowedImageMimes: [],
        allowedVideoMimes: videoMimes,
        allowedVideoCodecs: [],
        aspectRatios: { minRatio: 0, maxRatio: Number.MAX_SAFE_INTEGER },
      },
    }
  }

  validatePost(variant: SocialVariant): ValidationReport {
    const errors: ValidationReport['errors'] = []
    if (variant.attachments.length !== 1 || variant.attachments[0].role !== 'video')
      errors.push({
        field: 'attachments',
        code: 'VIDEO_REQUIRED',
        message: 'Select one native video.',
      })
    if (!youtubeUploadSettings(variant.platformSettings))
      errors.push({
        field: 'platformSettings',
        code: 'UPLOAD_SETTINGS_REQUIRED',
        message: 'Set the channel, title, privacy, audience and compliance confirmation.',
      })
    if (variant.text.length > this.capabilities.textLimit)
      errors.push({
        field: 'text',
        code: 'DESCRIPTION_TOO_LONG',
        message: 'The YouTube description exceeds 5,000 characters.',
      })
    return { errors, warnings: [], isValid: errors.length === 0 }
  }

  private async begin(
    accessToken: string,
    settings: NonNullable<ReturnType<typeof youtubeUploadSettings>>,
    description: string,
    video: StreamedSocialVideo,
  ) {
    const response = await (this.request ?? fetch)(
      `${origin}${uploadPath}?uploadType=resumable&part=snippet,status`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': video.mimeType,
          'X-Upload-Content-Length': String(video.size),
        },
        body: JSON.stringify({
          snippet: { title: settings.title, description, categoryId: '22' },
          status: {
            privacyStatus: settings.privacy,
            selfDeclaredMadeForKids: settings.madeForKids === 'yes',
          },
        }),
      },
    )
    if (!response.ok) throw await youtubeResponseError(response)
    return uploadSession(response.headers.get('location'))
  }

  /**
   * Moves the bytes. Resolves with the YouTube video ID once the
   * transfer completes — that is NOT yet a publication: YouTube still
   * has to process the video before anyone can watch it, and only
   * `confirmProcessing` may call it published.
   */
  private async transfer(
    session: URL,
    token: string,
    video: StreamedSocialVideo,
  ): Promise<string | AdapterResult> {
    let offset = 0
    let probes = 0
    let probe = false
    while (offset < video.size && probes < 4) {
      const end = Math.min(video.size - 1, offset + chunkSize - 1)
      let response: Response
      try {
        const body = probe ? undefined : await video.open(offset, end)
        const options: RequestInit & { duplex: 'half' } = {
          method: 'PUT',
          redirect: 'manual',
          duplex: 'half',
          signal: AbortSignal.timeout(120000),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': video.mimeType,
            'Content-Length': String(probe ? 0 : end - offset + 1),
            'Content-Range': probe
              ? `bytes */${video.size}`
              : `bytes ${offset}-${end}/${video.size}`,
          },
          body,
        }
        response = await (this.request ?? fetch)(session, options)
      } catch {
        probe = true
        probes += 1
        continue
      }
      if ([200, 201].includes(response.status)) {
        const { id } = await response.json().catch(() => ({}))
        if (typeof id !== 'string' || !youtubeVideoId.test(id)) return unknown()
        return id
      }
      if (response.status === 308) {
        const range = response.headers.get('range')
        await response.body?.cancel()
        const match = range && /^bytes=0-(\d+)$/.exec(range)
        if (range && !match) return unknown()
        const next = match ? Number(match[1]) + 1 : 0
        if (next < offset || next >= video.size || (!probe && next > end + 1)) return unknown()
        if (next === offset) probes += 1
        else probes = 0
        offset = next
        probe = false
        continue
      }
      if (response.status >= 500) {
        await response.body?.cancel()
        probe = true
        probes += 1
        continue
      }
      // The provider may have committed bytes during an earlier request.
      await response.body?.cancel()
      return unknown()
    }
    return unknown()
  }

  private resultFromVideoStatus(
    videoId: string,
    status: Awaited<ReturnType<YouTubeMetadata['videoStatus']>>,
    channelId?: string,
  ): AdapterResult {
    if (
      status.state !== 'missing' &&
      status.channelId &&
      channelId &&
      status.channelId !== channelId
    )
      return failure(new YouTubeError('claim'))
    if (status.state === 'processed') {
      const remoteUrl = `https://www.youtube.com/watch?v=${videoId}`
      return {
        status: 'published',
        remoteId: videoId,
        remoteUrl,
        rawResponse: {
          id: videoId,
          processingStatus: 'processed',
          privacyStatus: status.privacyStatus,
        },
        receipt: {
          remotePostId: videoId,
          remoteUrl,
          publishedAt: new Date(),
          rawResponse: { id: videoId, processingStatus: 'processed', providerMode: 'live' },
        },
      }
    }
    if (status.state === 'failed' || status.state === 'rejected') {
      return {
        status: 'failed',
        error: normalizeProviderError({
          kind: 'validation',
          message:
            status.state === 'failed'
              ? `YouTube could not process this video (${status.reason}). It will not become watchable; fix the video and create a new post instead of retrying this upload.`
              : `YouTube rejected this video during processing (${status.reason}). It will not become watchable; fix the video and create a new post instead of retrying this upload.`,
          providerCode: status.reason,
        }),
      }
    }
    return unknown(videoId)
  }

  /**
   * The receipt gate: an upload counts as published only when YouTube
   * confirms processing finished. Bounded polls; a video still
   * processing when the bound runs out stays `unknown` with its ID
   * attached so reconciliation can settle it — never fake-published.
   */
  private async confirmProcessing(
    client: YouTubeMetadata,
    grant: YouTubeGrant,
    channelId: string,
    videoId: string,
  ): Promise<AdapterResult> {
    const maxPolls = this.timing.maxPolls ?? 5
    const interval = this.timing.pollIntervalMs ?? 2000
    const sleep =
      this.timing.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
    for (let poll = 0; poll < maxPolls; poll += 1) {
      if (poll > 0) await sleep(interval)
      let status: Awaited<ReturnType<YouTubeMetadata['videoStatus']>>
      try {
        status = await client.videoStatus(grant, videoId)
      } catch (error) {
        // A transient poll failure does not condemn the upload — the
        // video exists. Keep polling within the bound; reconciliation
        // settles it later if the bound runs out.
        if (error instanceof YouTubeError && error.kind === 'unavailable') continue
        return failure(error)
      }
      if (status.state === 'processing' || status.state === 'missing') continue
      return this.resultFromVideoStatus(videoId, status, channelId)
    }
    return unknown(videoId)
  }

  /**
   * Read-only reconciliation; never uploads anything. Settles from
   * provider truth: the video ID persisted on the interrupted attempt
   * when there is one, otherwise the channel's recent uploads matched
   * on the exact approved title and description.
   */
  async reconcile(variant: SocialVariant, context?: AuthContext): Promise<AdapterResult> {
    const config = youtubeConfiguration()
    const refreshToken = context?.credentials?.refreshToken
    const channelId = context?.externalAccountId
    if (
      !youtubePublishingEnabled() ||
      !config ||
      !channelId ||
      !config.allowedChannels.includes(channelId) ||
      !refreshToken
    )
      return unknown(context?.recoveryRemoteId)
    const client = new YouTubeMetadata(config, this.request)
    let grant: YouTubeGrant
    let channel: Awaited<ReturnType<YouTubeMetadata['channel']>>
    try {
      grant = await client.refresh(refreshToken, [youtubeReadonly, youtubeUpload])
      channel = await client.channel(grant, channelId)
    } catch {
      return unknown(context?.recoveryRemoteId)
    }
    const storedId = context?.recoveryRemoteId
    if (storedId && youtubeVideoId.test(storedId)) {
      try {
        return this.resultFromVideoStatus(
          storedId,
          await client.videoStatus(grant, storedId),
          channelId,
        )
      } catch {
        return unknown(storedId)
      }
    }
    const settings = youtubeUploadSettings(variant.platformSettings)
    if (!settings || settings.channelId !== channelId) return unknown()
    let uploads: Awaited<ReturnType<YouTubeMetadata['recentUploads']>>
    try {
      uploads = await client.recentUploads(grant, channel)
    } catch {
      return unknown()
    }
    const since = variant.scheduledFor ? Date.parse(variant.scheduledFor) - 24 * 60 * 60_000 : NaN
    const match = uploads.find(
      (entry) =>
        entry.channelId === channelId &&
        entry.title === settings.title &&
        entry.description === variant.text &&
        (!Number.isFinite(since) || (Date.parse(entry.publishedAt) || 0) >= since),
    )
    if (!match) return unknown()
    try {
      return this.resultFromVideoStatus(
        match.id,
        await client.videoStatus(grant, match.id),
        channelId,
      )
    } catch {
      return unknown(match.id)
    }
  }

  async publish(
    variant: SocialVariant,
    context?:
      | AuthContext
      | Readonly<{ accountId: string; credentials: Record<string, string> | null }>,
    resolver?: MediaResolver,
  ): Promise<AdapterResult> {
    const config = youtubeConfiguration()
    const refreshToken = context?.credentials?.refreshToken
    const channelId =
      context && 'externalAccountId' in context ? context.externalAccountId : undefined
    const settings = youtubeUploadSettings(variant.platformSettings)
    const invalid = (message: string): AdapterResult => ({
      status: 'failed',
      error: normalizeProviderError({ kind: 'validation', message }),
    })
    if (
      !youtubePublishingEnabled() ||
      !config ||
      !channelId ||
      !config.allowedChannels.includes(channelId) ||
      !refreshToken
    )
      return failure(new YouTubeError('claim'))
    if (
      !settings ||
      settings.channelId !== channelId ||
      (settings.privacy !== 'private' &&
        process.env.CREATOR_YOUTUBE_PUBLIC_UPLOADS_AUTHORIZED !== 'true') ||
      !this.validatePost(variant).isValid ||
      !resolver?.resolveVideo
    )
      return invalid(
        'YouTube requires approved upload settings, permitted privacy and one native video.',
      )

    let video: StreamedSocialVideo
    try {
      video = await resolver.resolveVideo(variant.attachments[0].mediaAssetId)
      if (
        !Number.isSafeInteger(video.size) ||
        video.size < 1 ||
        video.size > maxBytes ||
        !videoMimes.includes(video.mimeType)
      )
        return invalid('The original video does not meet YouTube upload limits.')
    } catch {
      return invalid('The original video is unavailable for upload.')
    }

    let session: URL
    let client: YouTubeMetadata
    let grant: YouTubeGrant
    try {
      client = new YouTubeMetadata(config, this.request)
      grant = await client.refresh(refreshToken, [youtubeReadonly, youtubeUpload])
      await client.channel(grant, channelId)
      session = await this.begin(grant.token, settings, variant.text, video)
    } catch (error) {
      return failure(error)
    }
    let transferred: string | AdapterResult
    try {
      transferred = await this.transfer(session, grant.token, video)
    } catch {
      return unknown()
    }
    if (typeof transferred !== 'string') return transferred
    try {
      return await this.confirmProcessing(client, grant, channelId, transferred)
    } catch {
      // The video exists on YouTube; an unexpected confirmation error
      // must never be reported as a known failure.
      return unknown(transferred)
    }
  }
}
