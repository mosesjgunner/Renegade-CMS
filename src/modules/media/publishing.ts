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
export type PodcastPerson = {
  name: string
  role?: string
  group?: string
  href?: string
  img?: string
}
export type PodcastFunding = { url: string; label?: string }
export type PodcastValueRecipient = {
  name: string
  type: string
  address: string
  split: number
  fee?: boolean
}
export type PodcastValue = {
  type: string
  method: string
  suggested?: string
  recipients: readonly PodcastValueRecipient[]
}
export type PodcastLiveState = 'none' | 'scheduled' | 'live' | 'ended'

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
  /** Podcast JSON transcript (application/json) built from the current transcript revision. */
  transcriptJsonUrl?: string
  /** SRT transcript (application/x-subrip) built from the same timed segments. */
  transcriptSrtUrl?: string
  transcriptLanguage?: string
  chapters?: unknown
  explicit?: boolean
  artworkUrl?: string
  author?: string
  persons?: readonly PodcastPerson[]
  funding?: PodcastFunding
  value?: PodcastValue
  liveState?: PodcastLiveState
  liveStartAt?: string
  liveEndAt?: string
  liveStreamUrl?: string
  /**
   * POD-17: a probe-verified video render of this episode, published
   * as a Podcasting 2.0 `podcast:alternateEnclosure` alongside the
   * audio enclosure. Callers set these ONLY from a passed render
   * probe (see podcast-studio/feed-build.ts) — an episode without a
   * verified video render leaves them unset and its item bytes are
   * exactly the pre-POD-17 shape.
   */
  videoUrl?: string
  videoBytes?: number
  videoMimeType?: string
  videoWidth?: number
  videoHeight?: number
  videoTitle?: string
}

/** Namespace UUID from the Podcasting 2.0 GUID spec. */
export const PODCAST_GUID_NAMESPACE = 'ead4c236-bf58-58c6-a2c6-a6b28d128cb6'

/** RFC 4122 UUIDv5 (SHA-1 over namespace bytes + UTF-8 name). */
export function uuidv5(namespaceUuid: string, name: string): string {
  const namespace = Buffer.from(namespaceUuid.replace(/-/g, ''), 'hex')
  const digest = createHash('sha1').update(namespace).update(name, 'utf8').digest()
  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Channel-level podcast:guid per the spec: UUIDv5 of the feed's canonical
 * URL with scheme and trailing slashes stripped. Callers that persist the
 * value on the show (podcastGuidValue) pass it to podcastRss, so a later
 * slug rename never changes the GUID.
 */
export function podcastChannelGuid(feedUrl: string): string {
  const name = feedUrl.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '').replace(/\/+$/, '')
  return uuidv5(PODCAST_GUID_NAMESPACE, name)
}

/** Value4Value splits are only meaningful whole: they must sum to exactly 100. */
export function assertPodcastValueSplits(value: PodcastValue): void {
  const recipients = value?.recipients ?? []
  if (!recipients.length) throw new Error('podcast:value requires at least one recipient.')
  const sum = recipients.reduce((total, recipient) => total + Number(recipient.split || 0), 0)
  if (sum !== 100) throw new Error(`podcast:value recipient splits must sum to 100 (got ${sum}).`)
}

const podcastPersonsXml = (persons?: readonly PodcastPerson[]) =>
  (persons ?? [])
    .filter((person) => person?.name)
    .map(
      (person) =>
        `<podcast:person${person.role ? ` role="${xml(person.role)}"` : ''}${person.group ? ` group="${xml(person.group)}"` : ''}${person.href ? ` href="${xml(person.href)}"` : ''}${person.img ? ` img="${xml(person.img)}"` : ''}>${xml(person.name)}</podcast:person>`,
    )
    .join('')
const podcastFundingXml = (funding?: PodcastFunding) =>
  funding?.url
    ? `<podcast:funding url="${xml(funding.url)}">${xml(funding.label ?? '')}</podcast:funding>`
    : ''
const podcastValueXml = (value?: PodcastValue) => {
  if (!value) return ''
  assertPodcastValueSplits(value)
  const recipients = value.recipients
    .map(
      (recipient) =>
        `<podcast:valueRecipient name="${xml(recipient.name)}" type="${xml(recipient.type)}" address="${xml(recipient.address)}" split="${Number(recipient.split)}"${recipient.fee ? ' fee="true"' : ''}/>`,
    )
    .join('')
  return `<podcast:value type="${xml(value.type)}" method="${xml(value.method)}"${value.suggested ? ` suggested="${xml(value.suggested)}"` : ''}>${recipients}</podcast:value>`
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
    url.port ||
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
  /** Persisted channel podcast:guid; computed from the canonical feed URL when absent. */
  podcastGuidValue?: string
  locked?: boolean
  lockedOwnerEmail?: string
  /**
   * POD-RC-01: explicit per-show opt-in. When set, the feed carries
   * <itunes:owner><itunes:email> for directory ownership verification.
   * Never derived from an account email or from lockedOwnerEmail — the
   * two settings have different meanings and different exposure.
   */
  directoryOwnerEmail?: string
  medium?: string
  funding?: PodcastFunding
  value?: PodcastValue
  persons?: readonly PodcastPerson[]
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
  const directoryOwner = input.directoryOwnerEmail
    ? `<itunes:owner><itunes:email>${xml(input.directoryOwnerEmail)}</itunes:email></itunes:owner>`
    : ''
  // Always-emitted Podcasting 2.0 channel tags (POD-REQ-01). For a show with
  // no funding/value/persons configured and no live episodes these three tags
  // are the ONLY change to the pre-POD-01 feed bytes.
  const channelNamespace =
    `<podcast:guid>${xml(input.podcastGuidValue || podcastChannelGuid(self))}</podcast:guid>` +
    `<podcast:locked${input.lockedOwnerEmail ? ` owner="${xml(input.lockedOwnerEmail)}"` : ''}>${input.locked === false ? 'no' : 'yes'}</podcast:locked>` +
    `<podcast:medium>${xml(input.medium || 'podcast')}</podcast:medium>` +
    podcastFundingXml(input.funding) +
    podcastValueXml(input.value) +
    podcastPersonsXml(input.persons)
  const items = [...input.episodes]
    .sort((a, b) => {
      const diff = +new Date(b.publishedAt) - +new Date(a.publishedAt)
      return diff !== 0 ? diff : b.id.localeCompare(a.id)
    })
    .map((episode) => {
      const episodeUrl = new URL(`/podcasts/episodes/${episode.slug}`, input.siteUrl).toString()
      const liveState = episode.liveState ?? 'none'
      // POD-REQ-04: scheduled/live episodes are carried as podcast:liveItem
      // instead of a regular item; an ended live episode converts back to a
      // normal item once it has a recording (audio), and stays a liveItem
      // (status "ended") until then. The namespace status for a scheduled
      // episode is "pending" per the Podcasting 2.0 spec.
      if (
        liveState === 'scheduled' ||
        liveState === 'live' ||
        (liveState === 'ended' && !episode.audioUrl)
      ) {
        const status = liveState === 'scheduled' ? 'pending' : liveState
        const start = episode.liveStartAt ? new Date(episode.liveStartAt).toISOString() : ''
        const end = episode.liveEndAt ? new Date(episode.liveEndAt).toISOString() : ''
        const enclosure = episode.liveStreamUrl
          ? `<enclosure url="${xml(episode.liveStreamUrl)}" length="0" type="audio/mpeg"/>`
          : ''
        return `<podcast:liveItem status="${status}"${start ? ` start="${start}"` : ''}${end ? ` end="${end}"` : ''}><title>${xml(episode.title)}</title><guid isPermaLink="false">${xml(episode.guid)}</guid><description>${cdata(episode.description)}</description><podcast:contentLink href="${xml(episodeUrl)}">Listen on the web</podcast:contentLink>${enclosure}${podcastPersonsXml(episode.persons)}</podcast:liveItem>`
      }
      const chapters =
        Array.isArray(episode.chapters) && episode.chapters.length
          ? `<podcast:chapters url="${xml(`${new URL(`/podcasts/episodes/${episode.slug}/chapters.json`, input.siteUrl)}`)}" type="application/json+chapters"/>`
          : ''
      const transcript = episode.transcriptUrl
        ? `<podcast:transcript url="${xml(episode.transcriptUrl)}" type="text/html"/>`
        : ''
      const transcriptLanguage = episode.transcriptLanguage
        ? ` language="${xml(episode.transcriptLanguage)}"`
        : ''
      const transcriptVariants =
        (episode.transcriptJsonUrl
          ? `<podcast:transcript url="${xml(episode.transcriptJsonUrl)}" type="application/json"${transcriptLanguage}/>`
          : '') +
        (episode.transcriptSrtUrl
          ? `<podcast:transcript url="${xml(episode.transcriptSrtUrl)}" type="application/x-subrip"${transcriptLanguage} rel="captions"/>`
          : '')
      const alternateEnclosure = episode.videoUrl
        ? `<podcast:alternateEnclosure type="${xml(episode.videoMimeType ?? 'video/mp4')}" length="${episode.videoBytes ?? 0}" title="${xml(episode.videoTitle ?? 'Video version')}"${episode.videoWidth ? ` width="${episode.videoWidth}"` : ''}${episode.videoHeight ? ` height="${episode.videoHeight}"` : ''}><podcast:source uri="${xml(episode.videoUrl)}"/></podcast:alternateEnclosure>`
        : ''
      const epAuthor = episode.author ? `<itunes:author>${xml(episode.author)}</itunes:author>` : ''
      const season = episode.seasonNumber
        ? `<itunes:season>${episode.seasonNumber}</itunes:season>`
        : ''
      return `<item><title>${xml(episode.title)}</title><guid isPermaLink="false">${xml(episode.guid)}</guid><link>${xml(episodeUrl)}</link><description>${cdata(episode.description)}</description><pubDate>${new Date(episode.publishedAt).toUTCString()}</pubDate><enclosure url="${xml(episode.audioUrl)}" length="${episode.bytes}" type="${xml(episode.mimeType)}"/>${alternateEnclosure}${episode.artworkUrl ? `<itunes:image href="${xml(episode.artworkUrl)}"/>` : ''}${episode.explicit ? '<itunes:explicit>yes</itunes:explicit>' : '<itunes:explicit>no</itunes:explicit>'}${episode.durationSeconds ? `<itunes:duration>${Math.round(episode.durationSeconds)}</itunes:duration>` : ''}${episode.episodeNumber ? `<itunes:episode>${episode.episodeNumber}</itunes:episode>` : ''}${season}${epAuthor}${transcript}${transcriptVariants}${chapters}${podcastPersonsXml(episode.persons)}${podcastFundingXml(episode.funding)}${podcastValueXml(episode.value)}</item>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xml(input.title)}</title><link>${xml(showUrl)}</link><description>${cdata(input.description)}</description><language>${xml(input.language || 'en')}</language>${input.explicit ? '<itunes:explicit>yes</itunes:explicit>' : '<itunes:explicit>no</itunes:explicit>'}${author}${categories}${directoryOwner}<atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>${image}${channelNamespace}${items}</channel></rss>`
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

/**
 * Structural feed validation lives in the podcast-studio module (POD-01);
 * it is re-exported here so existing callers keep their import path and the
 * exact call signature / success shape.
 */
export { inspectPodcastFeed, validatePodcastFeed } from '../podcast-studio/feed-validate'
export type {
  PodcastFeedInspection,
  PodcastFeedInspectionOptions,
} from '../podcast-studio/feed-validate'

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

/**
 * Payload request-context key marking a write as the podcast importer's own.
 * The podcast-episodes ownership hook (POD-REQ-07) checks it so import and
 * media-migration writes never flip a claimed-import show to local ownership
 * — only genuine user edits do.
 */
export const PODCAST_IMPORT_WRITE_CONTEXT = 'podcastImportWrite'

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
    /**
     * Explicit opt-in only. When set, each created/updated episode — and each
     * unchanged episode whose media migration has not completed — is driven
     * through the enclosure migration (POD-02): enqueued via
     * `enqueueMediaMigration` when a queue driver is supplied, run inline via
     * `runMediaMigration` otherwise. With neither driver the bytes are not
     * fetched and the episodes are honestly reported as skipped.
     */
    migrateRemoteMedia?: boolean
    enqueueMediaMigration?: (episodeId: string) => Promise<void>
    runMediaMigration?: (episodeId: string) => Promise<{ completed: boolean; error?: string }>
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
  // Episodes whose enclosure bytes still need migrating (POD-02). An episode
  // whose feed item changed is always re-driven; an unchanged episode is
  // re-driven only when its migration never completed, which is what makes a
  // rerun after a mid-import kill finish the job without duplicating work.
  const migrationTargets: string[] = []
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
          context: { [PODCAST_IMPORT_WRITE_CONTEXT]: true },
        })
        updated++
        if (input.migrateRemoteMedia) migrationTargets.push(id(found.docs[0]))
      } else if (input.migrateRemoteMedia && found.docs[0].mediaMigrationState !== 'done') {
        migrationTargets.push(id(found.docs[0]))
      }
    } else {
      const episode = await store.create({
        collection: 'podcast-episodes',
        data: { ...data, providerIdentity: key },
        overrideAccess: true,
        context: { [PODCAST_IMPORT_WRITE_CONTEXT]: true },
      })
      created++
      if (input.migrateRemoteMedia) migrationTargets.push(id(episode))
    }
  }
  let migrated = 0
  let queued = 0
  let migrationFailed = 0
  let skipped = 0
  if (input.migrateRemoteMedia) {
    for (const episodeId of migrationTargets) {
      if (input.runMediaMigration) {
        const result = await input.runMediaMigration(episodeId).catch((error: unknown) => ({
          completed: false,
          error: error instanceof Error ? error.message : 'Media migration failed.',
        }))
        if (result.completed) migrated++
        else migrationFailed++
      } else if (input.enqueueMediaMigration) {
        if (store.update) {
          await store
            .update({
              collection: 'podcast-episodes',
              id: episodeId,
              data: { mediaMigrationState: 'pending', mediaMigrationError: null },
              overrideAccess: true,
              context: { [PODCAST_IMPORT_WRITE_CONTEXT]: true },
            })
            .catch(() => undefined)
        }
        await input.enqueueMediaMigration(episodeId)
        queued++
      } else {
        skipped++
      }
    }
  }
  const migrationWired = Boolean(input.runMediaMigration || input.enqueueMediaMigration)
  return {
    created,
    updated,
    unchanged: episodes.length - created - updated,
    remoteMedia: {
      requested: Boolean(input.migrateRemoteMedia),
      migrated,
      queued,
      failed: migrationFailed,
      skipped,
    },
    unsupportedFields: [
      ...(migrationWired ? [] : ['remote media byte migration']),
      'provider-specific analytics, advertisements, and dynamic insertion markers',
    ],
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

type TimedSegment = { startSeconds: number; endSeconds: number; text: string; speaker?: string }

/** Podcast JSON transcript (POD-REQ-03): the timed segments of the current transcript revision, serialised once. */
export function podcastTranscriptJson(segments: readonly TimedSegment[]) {
  return {
    version: '1.0.0',
    segments: segments.map((segment) => ({
      startTime: Number(segment.startSeconds || 0),
      endTime: Number(segment.endSeconds || 0),
      body: String(segment.text ?? ''),
      ...(segment.speaker ? { speaker: String(segment.speaker) } : {}),
    })),
  }
}

const srtTimestamp = (seconds: number) => {
  const value = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const secs = Math.floor(value % 60)
  const millis = Math.round((value - Math.floor(value)) * 1000)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`
}

/** SRT (application/x-subrip) serialisation of the same timed segments as podcastTranscriptJson. */
export function podcastTranscriptSrt(segments: readonly TimedSegment[]): string {
  if (!segments.length) return ''
  return (
    segments
      .map(
        (segment, index) =>
          `${index + 1}\n${srtTimestamp(segment.startSeconds)} --> ${srtTimestamp(segment.endSeconds)}\n${String(segment.text ?? '')}`,
      )
      .join('\n\n') + '\n'
  )
}
