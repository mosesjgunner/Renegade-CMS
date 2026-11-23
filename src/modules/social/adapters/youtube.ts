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

const unknown = (): AdapterResult => ({
  status: 'unknown',
  error: normalizeProviderError({
    kind: 'remote-unknown',
    remoteOutcome: 'unknown',
    message: 'YouTube upload outcome is uncertain. Check YouTube Studio before retrying.',
  }),
})

function failure(error: unknown): AdapterResult {
  if (error instanceof YouTubeError && error.kind === 'quota') {
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

export class YouTubeAdapter implements SocialProviderAdapter {
  constructor(private request?: typeof fetch) {}

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

  private async transfer(
    session: URL,
    token: string,
    video: StreamedSocialVideo,
  ): Promise<AdapterResult> {
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
        return {
          status: 'published',
          remoteId: id,
          remoteUrl: `https://www.youtube.com/watch?v=${id}`,
          rawResponse: { id },
        }
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
    let token: string
    try {
      const client = new YouTubeMetadata(config, this.request)
      const grant = await client.refresh(refreshToken, [youtubeReadonly, youtubeUpload])
      await client.channel(grant, channelId)
      token = grant.token
      session = await this.begin(token, settings, variant.text, video)
    } catch (error) {
      return failure(error)
    }
    try {
      return await this.transfer(session, token, video)
    } catch {
      return unknown()
    }
  }
}
