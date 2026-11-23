export type ExternalProvider = 'youtube' | 'vimeo' | 'direct-video' | 'custom-https'
export type ManualProvider = Exclude<ExternalProvider, 'youtube'>
export type VideoAvailability = 'available' | 'private' | 'unavailable' | 'removed' | 'unverified'
export type VideoPrivacy = 'public' | 'unlisted' | 'private' | 'unknown'

export interface VideoProviderCapabilities {
  embed: 'iframe' | 'video'
  catalogImport: 'owned-oauth' | 'manual-url'
  metadataSync: 'owned-oauth' | 'manual'
  outboundUpload: 'authorized-resumable' | 'manual-handoff'
  availability: 'provider' | 'manual'
  privacy: 'provider' | 'unknown'
  thumbnails: 'provider-read' | 'none'
  analytics: 'none'
  update: 'local-only'
  delete: 'local-only'
}

const manual = (embed: 'iframe' | 'video'): VideoProviderCapabilities => ({
  embed,
  catalogImport: 'manual-url',
  metadataSync: 'manual',
  outboundUpload: 'manual-handoff',
  availability: 'manual',
  privacy: 'unknown',
  thumbnails: 'none',
  analytics: 'none',
  update: 'local-only',
  delete: 'local-only',
})

export const videoProviders = {
  youtube: {
    embed: 'iframe',
    catalogImport: 'owned-oauth',
    metadataSync: 'owned-oauth',
    outboundUpload: 'authorized-resumable',
    availability: 'provider',
    privacy: 'provider',
    thumbnails: 'provider-read',
    analytics: 'none',
    update: 'local-only',
    delete: 'local-only',
  },
  vimeo: manual('iframe'),
  'direct-video': manual('video'),
  'custom-https': manual('iframe'),
} satisfies Record<ExternalProvider, VideoProviderCapabilities>

export const youtubeVideoId = /^[A-Za-z0-9_-]{11}$/
export const youtubeChannelId = /^UC[A-Za-z0-9_-]{22}$/

export interface VideoSnapshot {
  externalId: string
  scopeId: string
  availability: VideoAvailability
  privacy: VideoPrivacy
  title?: string
  description?: string
  thumbnail?: string
  url?: string
}

export function isManualProvider(value: unknown): value is ManualProvider {
  return value === 'vimeo' || value === 'direct-video' || value === 'custom-https'
}

export function manualVideo(provider: ManualProvider, value: string): VideoSnapshot {
  const url = new URL(value)
  if (
    value.length > 1500 ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname) ||
    /\.(localhost|local|test|example|internal|onion|invalid)$/.test(url.hostname) ||
    /(?:^|\.)(youtube(?:-nocookie)?\.com|youtu\.be|googlevideo\.com|ytimg\.com)$/.test(url.hostname)
  )
    throw new Error('Invalid external video URL.')

  if (provider === 'vimeo') {
    const match = /^(?:\/video)?\/(\d{1,15})\/?$/.exec(url.pathname)
    if (!['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname) || !match)
      throw new Error('Enter a public Vimeo video URL.')
    return {
      scopeId: 'vimeo.com',
      externalId: match[1],
      url: `https://player.vimeo.com/video/${match[1]}`,
      privacy: 'unknown',
      availability: 'unverified',
    }
  }
  const configured =
    provider === 'direct-video'
      ? process.env.CREATOR_DIRECT_VIDEO_ORIGINS
      : process.env.CREATOR_CUSTOM_EMBED_ORIGINS
  if (
    !configured
      ?.split(',')
      .map((origin) => origin.trim())
      .includes(url.origin)
  )
    throw new Error('This video origin has not been approved.')
  if (provider === 'direct-video' && !/\.(mp4|webm)(?:$)/i.test(url.pathname))
    throw new Error('Use a direct HTTPS MP4 or WebM URL.')
  return {
    scopeId: url.origin,
    externalId: url.pathname,
    url: url.href,
    privacy: 'unknown',
    availability: 'unverified',
  }
}
