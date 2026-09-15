/* eslint-disable @typescript-eslint/no-explicit-any -- media persistence spans polymorphic Payload collections. */
import { createHash } from 'node:crypto'

import { safeFetch } from '../core/external-boundary'
import type { Lookup } from '../core/external-boundary'
import { canRenderPublic } from '../public/contracts'
import {
  assertTranscriptSegments,
  externalIdentityKey,
  transcriptChecksum,
  type TranscriptSegment,
} from './contracts'
import type { ProviderAdapter } from '../execution/providers'

type Doc = Record<string, any>
const id = (value: unknown) =>
  typeof value === 'string' ? value : String((value as Doc)?.id ?? '')
const xml = (value: unknown) =>
  String(value ?? '').replace(
    /[<>&'\"]/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]!,
  )
const cdata = (value: unknown) =>
  `<![CDATA[${String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`

export type MediaPublishingStore = {
  find(args: any): Promise<{ docs: Doc[] }>
  findByID(args: any): Promise<Doc>
  create(args: any): Promise<Doc>
  update(args: any): Promise<Doc>
}
export type PodcastFeedEpisode = {
  id: string
  guid: string
  title: string
  slug: string
  description?: string
  publishedAt: string
  audioUrl: string
  bytes: number
  mimeType: string
  durationSeconds?: number
  episodeNumber?: number
  seasonNumber?: number
  transcriptUrl?: string
  chapters?: unknown
  explicit?: boolean
  artworkUrl?: string
  author?: string
}

export function assertSafeEmbedUrl(value: string, provider: string, externalId: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Video embed URL is invalid.')
  }
  const allowed =
    provider === 'youtube' &&
    ['www.youtube-nocookie.com', 'www.youtube.com'].includes(url.hostname) &&
    url.pathname === `/embed/${externalId}`
  if (
    !allowed ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Video embed URL is not an approved provider embed URL.')
  return url.toString()
}

export function podcastRss(input: {
  title: string
  description?: string
  siteUrl: string
  path: string
  showPath?: string
  artworkUrl?: string
  language?: string
  explicit?: boolean
  author?: string
  categories?: readonly string[]
  episodes: readonly PodcastFeedEpisode[]
}): string {
  const self = new URL(input.path, input.siteUrl).toString()
  const showUrl = new URL(
    input.showPath || input.path.replace(/\/feed\.xml$/, '') || '/',
    input.siteUrl,
  ).toString()
  const image = input.artworkUrl ? `<itunes:image href="${xml(input.artworkUrl)}"/>` : ''
  const author = input.author ? `<itunes:author>${xml(input.author)}</itunes:author>` : ''
  const categories = Array.isArray(input.categories)
    ? input.categories.map((c) => `<itunes:category text="${xml(c)}"/>`).join('')
    : ''
  const items = [...input.episodes]
    .sort((a, b) => {
      const diff = +new Date(b.publishedAt) - +new Date(a.publishedAt)
      return diff !== 0 ? diff : b.id.localeCompare(a.id)
    })
    .map((episode) => {
      const chapters =
        Array.isArray(episode.chapters) && episode.chapters.length
          ? `<podcast:chapters url="${xml(`${new URL(`/podcasts/episodes/${episode.slug}/chapters.json`, input.siteUrl)}`)}" type="application/json+chapters"/>`
          : ''
      const transcript = episode.transcriptUrl
        ? `<podcast:transcript url="${xml(episode.transcriptUrl)}" type="text/html"/>`
        : ''
      const epAuthor = episode.author ? `<itunes:author>${xml(episode.author)}</itunes:author>` : ''
      const season = episode.seasonNumber
        ? `<itunes:season>${episode.seasonNumber}</itunes:season>`
        : ''
      return `<item><title>${xml(episode.title)}</title><guid isPermaLink="false">${xml(episode.guid)}</guid><link>${xml(new URL(`/podcasts/episodes/${episode.slug}`, input.siteUrl).toString())}</link><description>${cdata(episode.description)}</description><pubDate>${new Date(episode.publishedAt).toUTCString()}</pubDate><enclosure url="${xml(episode.audioUrl)}" length="${episode.bytes}" type="${xml(episode.mimeType)}"/>${episode.artworkUrl ? `<itunes:image href="${xml(episode.artworkUrl)}"/>` : ''}${episode.explicit ? '<itunes:explicit>yes</itunes:explicit>' : '<itunes:explicit>no</itunes:explicit>'}${episode.durationSeconds ? `<itunes:duration>${Math.round(episode.durationSeconds)}</itunes:duration>` : ''}${episode.episodeNumber ? `<itunes:episode>${episode.episodeNumber}</itunes:episode>` : ''}${season}${epAuthor}${transcript}${chapters}</item>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(input.title)}</title><link>${xml(showUrl)}</link><description>${cdata(input.description)}</description><language>${xml(input.language || 'en')}</language>${input.explicit ? '<itunes:explicit>yes</itunes:explicit>' : '<itunes:explicit>no</itunes:explicit>'}${author}${categories}<atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>${image}${items}</channel></rss>`
}

/** Stable across a human URL/slug change; never derive a GUID from routing. */
export const podcastGuid = (showId: string, episodeId: string) =>
  `urn:renegade:podcast:${showId}:${episodeId}`

/** Export podcast feed as valid RSS 2.0 / iTunes / Podcasting 2.0 XML. */
export const exportPodcastFeed = (input: Parameters<typeof podcastRss>[0]): string =>
  podcastRss(input)

/** Podcast records integrate with canonical workflow; if linked to shared Content, both must be public. */
export const canRenderPodcast = (record: Doc) =>
  canRenderPublic(record) &&
  (!record.content ||
    canRenderPublic(typeof record.content === 'object' ? record.content : { status: 'draft' }))

export function validatePodcastFeed(xmlText: string) {
  const errors: string[] = []
  if (!xmlText.startsWith('<?xml')) errors.push('Missing XML declaration.')
  if (!/<rss\b/.test(xmlText)) errors.push('Missing <rss> root.')
  if (!/<channel>/.test(xmlText)) errors.push('Missing <channel> element.')
  const enclosure = /<enclosure\s+([^>]+)>/.exec(xmlText)?.[1] ?? ''
  const length = /\blength="(\d+)"/.exec(enclosure)?.[1]
  const type = /\btype="(audio\/(?:mpeg|mp4|wav|ogg)|audio\/ogg)"/.exec(enclosure)?.[1]
  if (!length || Number(length) < 1) errors.push('Missing or invalid enclosure length.')
  if (!type) errors.push('Missing or invalid enclosure audio type.')

  if (errors.length > 0) {
    throw new Error(`Podcast feed validation failed: ${errors.join(', ')}`)
  }
  return {
    valid: true as const,
    enclosureLength: Number(length),
    enclosureType: type!,
  }
}

const text = (source: string, tag: string) =>
  new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i')
    .exec(source)?.[1]
    ?.replace(/<!\[CDATA\[([\s\S]*?)]]>/, '$1')
    .trim()
const attrs = (source: string) =>
  Object.fromEntries(
    [...source.matchAll(/([\w:-]+)=["']([^"']*)["']/g)].map((match) => [match[1], match[2]]),
  )
export function parseRssEpisodes(source: string) {
  return [...source.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => {
    const item = match[0]
    const enclosure = /<enclosure\s+([^>]+)>/i.exec(item)?.[1]
    const a = attrs(enclosure ?? '')
    const guid = text(item, 'guid') ?? a.url
    if (!guid || !a.url || !a.length || !a.type)
      throw new Error('Imported episode is missing a valid enclosure.')
    return {
      externalId: guid,
      title: text(item, 'title') ?? 'Untitled episode',
      description: text(item, 'description') ?? '',
      publishedAt: text(item, 'pubDate') ?? new Date(0).toUTCString(),
      enclosureUrl: a.url,
      enclosureBytes: Number(a.length),
      enclosureMimeType: a.type,
      checksum: createHash('sha256').update(item).digest('hex'),
    }
  })
}

/** Imported values only update while the show remains explicitly claimed. Local edits take ownership. */
export async function importPodcastFeed(
  store: MediaPublishingStore,
  input: {
    siteId: string
    showId: string
    feedUrl: string
    fetcher?: typeof fetch
    resolve?: Lookup
    allowPrivate?: boolean
    /** Explicit opt-in only. Remote bytes are not fetched by this conservative importer yet. */
    migrateRemoteMedia?: boolean
  },
) {
  const show = await store.findByID({
    collection: 'podcast-shows',
    id: input.showId,
    depth: 0,
    overrideAccess: true,
  })
  if (id(show.site) !== input.siteId)
    throw new Error('Podcast show scope does not match import scope.')
  if (show.importOwnership !== 'claimed-import')
    throw new Error('Podcast feed import has not been claimed for this show.')
  const response = await safeFetch(
    input.feedUrl,
    { headers: { accept: 'application/rss+xml, application/xml, text/xml' } },
    {
      fetcher: input.fetcher,
      resolve: input.resolve,
      allowPrivate: input.allowPrivate,
      allowHttp: input.allowPrivate,
      allowedContentTypes: [
        'application/rss+xml',
        'application/xml',
        'text/xml',
        'application/octet-stream',
      ],
    },
  )
  if (!response.ok) throw new Error(`Podcast provider returned ${response.status}.`)
  const source = await response.text()
  const episodes = parseRssEpisodes(source)
  let created = 0
  let updated = 0
  for (const item of episodes) {
    const key = externalIdentityKey({
      provider: 'rss',
      scopeId: input.showId,
      externalId: item.externalId,
    })
    const found = await store.find({
      collection: 'podcast-episodes',
      where: { providerIdentity: { equals: key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const data = {
      site: input.siteId,
      publication: show.publication ?? null,
      space: show.space ?? null,
      owner: show.owner ?? null,
      show: input.showId,
      title: item.title,
      slug: `imported-${createHash('sha256').update(key).digest('hex').slice(0, 16)}`,
      description: item.description,
      externalUrl: item.enclosureUrl,
      enclosureBytes: item.enclosureBytes,
      enclosureMimeType: item.enclosureMimeType,
      importSourceChecksum: item.checksum,
      status: 'draft',
      publishedAt: new Date(item.publishedAt).toISOString(),
    }
    if (found.docs[0]) {
      if (found.docs[0].importSourceChecksum !== item.checksum) {
        await store.update({
          collection: 'podcast-episodes',
          id: found.docs[0].id,
          data,
          overrideAccess: true,
        })
        updated++
      }
    } else {
      await store.create({
        collection: 'podcast-episodes',
        data: { ...data, providerIdentity: key },
        overrideAccess: true,
      })
      created++
    }
  }
  return {
    created,
    updated,
    unchanged: episodes.length - created - updated,
    remoteMedia: {
      requested: Boolean(input.migrateRemoteMedia),
      migrated: 0,
      skipped: input.migrateRemoteMedia ? episodes.length : 0,
    },
    unsupportedFields: [
      'remote media byte migration',
      'provider-specific analytics, advertisements, and dynamic insertion markers',
    ],
  }
}

export type YouTubeVideo = {
  id: string
  title: string
  description?: string
  thumbnailUrl?: string
  captions?: readonly string[]
  chapters?: unknown
}
export type YouTubeConfig = { channelId: string; apiKey: string }
export const youtubeAdapter: ProviderAdapter<YouTubeConfig, 'video.import' | 'video.embed'> = {
  id: 'youtube',
  validate: (config) =>
    config.channelId && config.apiKey
      ? { ok: true }
      : {
          ok: false,
          error: {
            code: 'misconfigured',
            retryable: false,
            message: 'YouTube channel ID and API key are required.',
          },
        },
  capabilities: () => ['video.import', 'video.embed'],
  health: async (config) =>
    youtubeAdapter.validate(config).ok
      ? { status: 'healthy' }
      : { status: 'disabled', detail: 'YouTube channel ID and API key are required.' },
}
/** Provider clients supply normalized video facts; this boundary owns persistence and update rules. */
export async function syncYouTubeVideo(
  store: MediaPublishingStore,
  input: { siteId: string; channelId: string; video: YouTubeVideo },
) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.video.id))
    throw new Error('YouTube video ID is invalid.')
  const channel = await store.findByID({
    collection: 'video-channels',
    id: input.channelId,
    depth: 0,
    overrideAccess: true,
  })
  if (id(channel.site) !== input.siteId)
    throw new Error('Video channel scope does not match sync scope.')
  if (!channel.syncClaimed)
    throw new Error('Video provider sync has not been claimed for this channel.')
  const key = externalIdentityKey({
    provider: 'youtube',
    scopeId: input.channelId,
    externalId: input.video.id,
  })
  const sourceChecksum = createHash('sha256').update(JSON.stringify(input.video)).digest('hex')
  const slug = `youtube-${input.video.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`
  const found = await store.find({
    collection: 'videos',
    where: { providerIdentity: { equals: key } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const data = {
    site: input.siteId,
    publication: channel.publication ?? null,
    space: channel.space ?? null,
    owner: channel.owner ?? null,
    channel: input.channelId,
    title: input.video.title,
    slug,
    description: input.video.description ?? null,
    provider: 'youtube',
    externalId: input.video.id,
    embedUrl: assertSafeEmbedUrl(
      `https://www.youtube-nocookie.com/embed/${input.video.id}`,
      'youtube',
      input.video.id,
    ),
    chapters: input.video.chapters ?? null,
    providerSourceChecksum: sourceChecksum,
    availability: 'available',
    status: 'draft',
  }
  if (found.docs[0]) {
    if (found.docs[0].providerSourceChecksum === sourceChecksum)
      return { created: false, updated: false, video: found.docs[0] }
    return {
      created: false,
      updated: true,
      video: await store.update({
        collection: 'videos',
        id: found.docs[0].id,
        data,
        overrideAccess: true,
      }),
    }
  }
  return {
    created: true,
    updated: false,
    video: await store.create({
      collection: 'videos',
      data: { ...data, providerIdentity: key },
      overrideAccess: true,
    }),
  }
}
export function publicVideo(record: Doc) {
  if (!canRenderPublic(record) || record.availability !== 'available')
    return {
      available: false as const,
      message:
        record.availability === 'removed'
          ? 'This video has been removed.'
          : 'This video is unavailable.',
    }
  if (record.nativeMedia) return { available: true as const, kind: 'native' as const }
  return {
    available: true as const,
    kind: 'embed' as const,
    embedUrl: assertSafeEmbedUrl(
      String(record.embedUrl),
      String(record.provider),
      String(record.externalId),
    ),
  }
}

export function transcriptFromSegments(segments: readonly TranscriptSegment[]) {
  assertTranscriptSegments(segments)
  return {
    checksum: transcriptChecksum(segments),
    text: segments.map((segment) => segment.text).join('\n\n'),
  }
}
