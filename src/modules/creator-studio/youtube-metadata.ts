import { createHash, randomBytes } from 'node:crypto'
import { youtubeChannelId, youtubeVideoId, type VideoSnapshot } from './video-providers'

export const youtubeReadonly = 'https://www.googleapis.com/auth/youtube.readonly'
export const youtubeUpload = 'https://www.googleapis.com/auth/youtube.upload'
export const youtubeCallbackPath = '/api/creator-studio/external-video/callback'
const api = 'https://www.googleapis.com/youtube/v3/'

export class YouTubeError extends Error {
  constructor(
    readonly kind: 'revoked' | 'scope' | 'claim' | 'quota' | 'unavailable',
    readonly retryAfter?: string,
    /** The provider's machine-readable error reason (e.g. `uploadLimitExceeded`), when one was returned. */
    readonly reason?: string,
  ) {
    super(
      {
        revoked: 'YouTube authorization was revoked. Reconnect the channel.',
        scope: 'YouTube authorization lacks the required permissions.',
        claim: 'The authorized YouTube channel does not match this claim.',
        quota: 'YouTube quota or rate limit reached. Try again after the provider resets it.',
        unavailable: 'YouTube is temporarily unavailable.',
      }[kind],
    )
  }
}

export function youtubeConfiguration() {
  const {
    CREATOR_YOUTUBE_CLIENT_ID: clientId,
    CREATOR_YOUTUBE_CLIENT_SECRET: clientSecret,
    CREATOR_YOUTUBE_ALLOWED_CHANNELS: channels,
    CREATOR_YOUTUBE_REDIRECT_URI: redirectUri,
    RENEGADE_ENCRYPTION_KEY: key,
  } = process.env
  if (
    process.env.CREATOR_YOUTUBE_AUTHORIZED !== 'true' ||
    !clientId ||
    !clientSecret ||
    !channels ||
    !redirectUri ||
    !key ||
    !/^[a-f0-9]{64}$/i.test(key)
  )
    return null
  const allowedChannels = channels.split(',').map((channel) => channel.trim())
  let uri: URL
  try {
    uri = new URL(redirectUri)
  } catch {
    return null
  }
  if (
    !allowedChannels.every((id) => youtubeChannelId.test(id)) ||
    uri.protocol !== 'https:' ||
    uri.pathname !== youtubeCallbackPath ||
    uri.username ||
    uri.password ||
    uri.search ||
    uri.hash
  )
    return null
  return { clientId, clientSecret, redirectUri, key, allowedChannels }
}

export type YouTubeConfig = NonNullable<ReturnType<typeof youtubeConfiguration>>
export type YouTubeGrant = { token: string; scopes: string[]; refreshToken?: string }
export type YouTubeRecentUpload = {
  id: string
  channelId: string
  title: string
  description: string
  publishedAt: string
  uploadStatus: string
  failureReason: string
  rejectionReason: string
}

export const youtubeVerifier = () => randomBytes(32).toString('base64url')
export function youtubeAuthorizationURL(
  config: YouTubeConfig,
  state: string,
  verifier: string,
  scopes: readonly string[] = [youtubeReadonly],
) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString()
  return url.href
}

export async function youtubeResponseError(response: Response, tokenEndpoint = false) {
  const body = await response.json().catch(() => null)
  const reason = body?.error?.errors?.[0]?.reason
  if (response.status === 401 || (tokenEndpoint && body?.error === 'invalid_grant'))
    return new YouTubeError('revoked', undefined, reason)
  if (reason === 'insufficientPermissions') return new YouTubeError('scope', undefined, reason)
  if (
    response.status === 429 ||
    [
      'quotaExceeded',
      'dailyLimitExceeded',
      'rateLimitExceeded',
      'userRateLimitExceeded',
      'uploadLimitExceeded',
    ].includes(reason)
  )
    return new YouTubeError('quota', response.headers.get('retry-after') ?? undefined, reason)
  return new YouTubeError('unavailable', undefined, reason)
}

export class YouTubeMetadata {
  constructor(
    private config: YouTubeConfig,
    private request: typeof fetch = fetch,
  ) {}

  private async grant(params: Record<string, string>, required: readonly string[]) {
    const response = await this.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...params,
      }),
    })
    if (!response.ok) throw await youtubeResponseError(response, true)
    const data = await response.json()
    const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/) : []
    if (typeof data.access_token !== 'string' || !required.every((scope) => scopes.includes(scope)))
      throw new YouTubeError('scope')
    return {
      token: data.access_token as string,
      scopes,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    }
  }

  exchange(code: string, verifier: string, required: readonly string[] = [youtubeReadonly]) {
    return this.grant(
      {
        code,
        code_verifier: verifier,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      },
      required,
    )
  }

  refresh(refreshToken: string, required = [youtubeReadonly]) {
    return this.grant({ refresh_token: refreshToken, grant_type: 'refresh_token' }, required)
  }

  async revoke(refreshToken: string) {
    const response = await this.request('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({ token: refreshToken }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      if (data?.error !== 'invalid_token') throw new YouTubeError('unavailable')
    }
  }

  private async get(token: string, path: string, params: Record<string, string>) {
    const url = new URL(path, api)
    url.search = new URLSearchParams(params).toString()
    const response = await this.request(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw await youtubeResponseError(response)
    return response.json()
  }

  async channel(grant: YouTubeGrant, expected?: string) {
    const data = await this.get(grant.token, 'channels', {
      mine: 'true',
      part: 'contentDetails',
      maxResults: '2',
    })
    const channel = data.items?.[0]
    const id = channel?.id
    const uploads = channel?.contentDetails?.relatedPlaylists?.uploads
    if (
      data.items?.length !== 1 ||
      typeof id !== 'string' ||
      !youtubeChannelId.test(id) ||
      !this.config.allowedChannels.includes(id) ||
      (expected && expected !== id) ||
      typeof uploads !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(uploads)
    )
      throw new YouTubeError('claim')
    return { id, uploads }
  }

  async catalog(grant: YouTubeGrant, channel: { id: string; uploads: string }, pageToken?: string) {
    const data = await this.get(grant.token, 'playlistItems', {
      playlistId: channel.uploads,
      part: 'contentDetails',
      maxResults: '25',
      ...(pageToken ? { pageToken } : {}),
    })
    if (!Array.isArray(data.items)) throw new YouTubeError('unavailable')
    const ids = data.items.flatMap((entry: { contentDetails?: { videoId?: string } }) => {
      const id = entry.contentDetails?.videoId
      return id && youtubeVideoId.test(id) ? [id] : []
    })
    return {
      items: (await this.videos(grant, channel.id, ids)).filter(
        (item) => item.availability !== 'removed',
      ),
      nextPage: typeof data.nextPageToken === 'string' ? data.nextPageToken : null,
    }
  }

  async videos(grant: YouTubeGrant, channelId: string, ids: string[]): Promise<VideoSnapshot[]> {
    if (!ids.length) return []
    if (ids.length > 50 || ids.some((id) => !youtubeVideoId.test(id)))
      throw new YouTubeError('claim')
    const data = await this.get(grant.token, 'videos', {
      part: 'snippet,status',
      id: ids.join(','),
    })
    if (!Array.isArray(data.items)) throw new YouTubeError('unavailable')
    return ids.map((externalId) => {
      const item = data.items.find((entry: { id?: string }) => entry.id === externalId)
      const base = { externalId, scopeId: channelId }
      if (!item) return { ...base, availability: 'removed', privacy: 'unknown' }
      if (item.snippet?.channelId !== channelId) throw new YouTubeError('claim')
      const privacy = item.status?.privacyStatus
      if (privacy === 'private') return { ...base, privacy, availability: 'private' }
      if (
        (privacy !== 'public' && privacy !== 'unlisted') ||
        item.status?.embeddable !== true ||
        item.status?.uploadStatus !== 'processed'
      )
        return { ...base, privacy: 'unknown', availability: 'unavailable' }
      const thumbnail =
        item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url
      return {
        ...base,
        privacy,
        availability: 'available',
        title: typeof item.snippet?.title === 'string' ? item.snippet.title.slice(0, 200) : '',
        description:
          typeof item.snippet?.description === 'string'
            ? item.snippet.description.slice(0, 5000)
            : '',
        thumbnail:
          typeof thumbnail === 'string' &&
          /^https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/[\w-]+\/[\w.-]+$/.test(thumbnail)
            ? thumbnail
            : undefined,
        url: `https://www.youtube-nocookie.com/embed/${externalId}`,
      }
    })
  }

  /**
   * Processing truth for one uploaded video, straight from `videos.list`.
   * `processed` is the only state that confirms publication; `failed` and
   * `rejected` carry the provider's reason; anything else means YouTube
   * has not finished — the outcome is not yet known, never a success.
   */
  async videoStatus(grant: YouTubeGrant, videoId: string) {
    if (!youtubeVideoId.test(videoId)) throw new YouTubeError('claim')
    const data = await this.get(grant.token, 'videos', {
      part: 'status,snippet',
      id: videoId,
    })
    if (!Array.isArray(data.items)) throw new YouTubeError('unavailable')
    const item = data.items[0]
    if (!item) return { state: 'missing' as const }
    const uploadStatus = item.status?.uploadStatus
    const base = {
      privacyStatus:
        typeof item.status?.privacyStatus === 'string' ? item.status.privacyStatus : undefined,
      channelId: typeof item.snippet?.channelId === 'string' ? item.snippet.channelId : undefined,
    }
    if (uploadStatus === 'processed') return { state: 'processed' as const, ...base }
    if (uploadStatus === 'failed')
      return {
        state: 'failed' as const,
        ...base,
        reason:
          typeof item.status?.failureReason === 'string' ? item.status.failureReason : 'unknown',
      }
    if (uploadStatus === 'rejected')
      return {
        state: 'rejected' as const,
        ...base,
        reason:
          typeof item.status?.rejectionReason === 'string'
            ? item.status.rejectionReason
            : 'unknown',
      }
    if (uploadStatus === 'deleted') return { state: 'failed' as const, ...base, reason: 'deleted' }
    return { state: 'processing' as const, ...base }
  }

  /**
   * The channel's most recent uploads with their processing state, for
   * read-only reconciliation of an upload whose response was lost. Raw
   * provider fields only — matching policy lives with the caller.
   */
  async recentUploads(
    grant: YouTubeGrant,
    channel: { id: string; uploads: string },
  ): Promise<YouTubeRecentUpload[]> {
    const data = await this.get(grant.token, 'playlistItems', {
      playlistId: channel.uploads,
      part: 'contentDetails',
      maxResults: '25',
    })
    if (!Array.isArray(data.items)) throw new YouTubeError('unavailable')
    const ids = data.items.flatMap((entry: { contentDetails?: { videoId?: string } }) => {
      const id = entry.contentDetails?.videoId
      return id && youtubeVideoId.test(id) ? [id] : []
    })
    if (!ids.length) return []
    const videos = await this.get(grant.token, 'videos', {
      part: 'snippet,status',
      id: ids.join(','),
    })
    if (!Array.isArray(videos.items)) throw new YouTubeError('unavailable')
    return videos.items.flatMap(
      (item: {
        id?: string
        snippet?: {
          channelId?: string
          title?: string
          description?: string
          publishedAt?: string
        }
        status?: { uploadStatus?: string; failureReason?: string; rejectionReason?: string }
      }) => {
        if (typeof item.id !== 'string' || !youtubeVideoId.test(item.id)) return []
        return [
          {
            id: item.id,
            channelId: typeof item.snippet?.channelId === 'string' ? item.snippet.channelId : '',
            title: typeof item.snippet?.title === 'string' ? item.snippet.title : '',
            description:
              typeof item.snippet?.description === 'string' ? item.snippet.description : '',
            publishedAt:
              typeof item.snippet?.publishedAt === 'string' ? item.snippet.publishedAt : '',
            uploadStatus:
              typeof item.status?.uploadStatus === 'string' ? item.status.uploadStatus : '',
            failureReason:
              typeof item.status?.failureReason === 'string' ? item.status.failureReason : '',
            rejectionReason:
              typeof item.status?.rejectionReason === 'string' ? item.status.rejectionReason : '',
          },
        ]
      },
    )
  }
}
