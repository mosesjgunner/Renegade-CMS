/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
/**
 * POD-03: shared podcast feed rendering. The episode→feed-item mapping
 * and the `podcastRss()` call that used to live inline in the public
 * feed route live here so the public feed and the per-member token
 * feed render through the exact same POD-01 builder — they differ
 * only in which episodes are included and where enclosures point.
 */
import { canRenderPodcast, podcastGuid, podcastRss } from '../media/publishing'
import type { PodcastFunding, PodcastPerson, PodcastValue } from '../media/publishing'

const value = (item: unknown) =>
  typeof item === 'string' ? item : String((item as { id?: unknown } | null)?.id ?? '')

/**
 * Persons sourcing (POD-01): authors records carry displayName/website/avatar
 * but no role/group, so the canonical channel list is the show's `persons`
 * JSON config. The hosts/authors relationships are the fallback: hosts (or
 * authors) become role "host", episode guests become role "guest", with
 * href from the author website and img from the author avatar.
 */
const personFromAuthor = (
  author: any,
  role: string,
  group: string,
  origin: string,
): PodcastPerson | undefined => {
  if (!author || typeof author !== 'object') return undefined
  const name = author.displayName || author.name || author.title
  if (!name) return undefined
  const avatarId = author.avatar ? value(author.avatar) : ''
  return {
    name: String(name),
    role,
    group,
    href: author.website ? String(author.website) : undefined,
    img: avatarId ? new URL(`/media/${avatarId}`, origin).toString() : undefined,
  }
}
const personsFromAuthors = (list: unknown, role: string, group: string, origin: string) =>
  (Array.isArray(list)
    ? list
        .map((author) => personFromAuthor(author, role, group, origin))
        .filter((person): person is PodcastPerson => Boolean(person))
    : []) as PodcastPerson[]
const asPersons = (raw: unknown): PodcastPerson[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  const persons = raw
    .filter((person: any) => person && typeof person === 'object' && person.name)
    .map((person: any) => ({
      name: String(person.name),
      role: person.role ? String(person.role) : undefined,
      group: person.group ? String(person.group) : undefined,
      href: person.href ? String(person.href) : undefined,
      img: person.img ? String(person.img) : undefined,
    }))
  return persons.length ? persons : undefined
}
const asFunding = (raw: any): PodcastFunding | undefined =>
  raw && typeof raw === 'object' && raw.url
    ? { url: String(raw.url), label: raw.label ? String(raw.label) : undefined }
    : undefined
const asValue = (raw: any): PodcastValue | undefined =>
  raw && typeof raw === 'object' && Array.isArray(raw.recipients)
    ? (raw as PodcastValue)
    : undefined
const dedupePersons = (persons: PodcastPerson[]) => {
  const seen = new Set<string>()
  return persons.filter((person) => {
    const key = `${person.name}:${person.role ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * POD-17 feed honesty gate: an episode's video fields reach the feed
 * ONLY when a probe-verified video render backs them. All of these
 * must hold — any failure and the episode renders exactly as an
 * audio-only episode (byte-identical item):
 * - `episode.video` resolves to an MP4 media asset with real bytes;
 * - `episode.videoProvenance.probe.passed` is true (the provenance is
 *   written only by the POD-17 attach, from the core's ffprobe
 *   verification of the rendered file);
 * - when both sides carry a checksum, the probed checksum equals the
 *   attached asset's checksum (the probe ran against THESE bytes);
 * - when the provenance names an asset id, it is this asset.
 * Member feeds (an `enclosureUrl` override) never carry video in v1:
 * the token enclosure route serves the episode's audio bytes, so a
 * video URL there would point at the wrong payload — see
 * docs/podcast-studio/VIDEO.md.
 */
export function episodeVideoFeedFields(
  episode: any,
  origin: string,
): Record<string, unknown> | undefined {
  const video = episode?.video
  if (!video || typeof video !== 'object') return undefined
  if (String(video.mimeType) !== 'video/mp4') return undefined
  const sizeBytes = Number(video.sizeBytes)
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1) return undefined
  const provenance = episode.videoProvenance
  const probe = provenance?.probe
  if (!probe || probe.passed !== true) return undefined
  const assetChecksum = String(video.checksum ?? video.checksumSha256 ?? '').replace(/^sha256:/, '')
  const probeChecksum = String(probe.checksumSha256 ?? '')
  if (assetChecksum && probeChecksum && assetChecksum !== probeChecksum) return undefined
  if (provenance.assetId && String(provenance.assetId) !== String(video.id)) return undefined
  return {
    videoUrl: new URL(`/media/${video.id}`, origin).toString(),
    videoBytes: sizeBytes,
    videoMimeType: 'video/mp4',
    videoWidth: Number(probe.width) || undefined,
    videoHeight: Number(probe.height) || undefined,
    videoTitle: 'Video version',
  }
}

export type PodcastFeedRenderOptions = {
  origin: string
  /** Feed path used for the atom self link, e.g. `/podcasts/<slug>/feed.xml`. */
  feedPath: string
  showPath: string
  /** Include episodes flagged `membersOnly` (member feeds only). */
  includeMembersOnly: boolean
  /**
   * Enclosure URL for an episode with audio. Defaults to the public
   * `/media/<id>` URL; member feeds pass a token-scoped URL builder.
   */
  enclosureUrl?: (episode: any, audio: any) => string
}

/** Renders a show's RSS body from depth-2 episode documents. */
export function renderPodcastFeed(
  show: any,
  episodeDocs: any[],
  options: PodcastFeedRenderOptions,
): string {
  const { origin } = options
  const hostPersons = personsFromAuthors(
    Array.isArray(show.hosts) && show.hosts.length ? show.hosts : show.authors,
    'host',
    'Hosts',
    origin,
  )

  const visible = episodeDocs
    .filter((episode) => canRenderPodcast(episode))
    // PT-D privacy rule: a members-only episode is ABSENT from any feed
    // that is not entitled to it — never listed without an enclosure.
    .filter((episode) => options.includeMembersOnly || !episode.membersOnly)
    .flatMap((episode) => {
      const audio = episode.audio as any
      const hasAudio =
        audio &&
        ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'].includes(String(audio.mimeType)) &&
        Number.isFinite(Number(audio.sizeBytes)) &&
        Number(audio.sizeBytes) >= 1
      const liveState: 'none' | 'scheduled' | 'live' | 'ended' = [
        'scheduled',
        'live',
        'ended',
      ].includes(String(episode.liveState))
        ? (String(episode.liveState) as 'scheduled' | 'live' | 'ended')
        : 'none'
      // Live episodes carry their stream in the liveItem enclosure, not an
      // audio enclosure: scheduled/live episodes (and ended ones with no
      // recording yet) must not be dropped by the audio filter.
      const isLiveCarried =
        liveState === 'scheduled' || liveState === 'live' || (liveState === 'ended' && !hasAudio)
      if (!hasAudio && !isLiveCarried) return []

      const authorName =
        Array.isArray(episode.authors) && episode.authors[0]
          ? episode.authors[0].displayName || episode.authors[0].name || episode.authors[0].title
          : Array.isArray(show.hosts) && show.hosts[0]
            ? show.hosts[0].displayName || show.hosts[0].name || show.hosts[0].title
            : Array.isArray(show.authors) && show.authors[0]
              ? show.authors[0].displayName || show.authors[0].name || show.authors[0].title
              : undefined

      const episodePersons =
        asPersons(episode.persons) ??
        dedupePersons([
          ...personsFromAuthors(
            Array.isArray(episode.authors) && episode.authors.length ? episode.authors : show.hosts,
            'host',
            'Hosts',
            origin,
          ),
          ...personsFromAuthors(episode.guests, 'guest', 'Guests', origin),
        ])

      return [
        {
          id: String(episode.id),
          guid: String(episode.guid || podcastGuid(String(show.id), String(episode.id))),
          title: String(episode.title),
          slug: String(episode.slug),
          description: episode.description,
          publishedAt: String(
            episode.publishedAt || episode.liveStartAt || new Date(0).toISOString(),
          ),
          audioUrl: hasAudio
            ? options.enclosureUrl
              ? options.enclosureUrl(episode, audio)
              : new URL(`/media/${audio.id}`, origin).toString()
            : '',
          bytes: hasAudio ? Number(audio.sizeBytes) : 0,
          mimeType: hasAudio ? String(audio.mimeType) : 'audio/mpeg',
          durationSeconds: hasAudio ? Number(audio.durationSeconds) || undefined : undefined,
          episodeNumber: Number(episode.episodeNumber) || undefined,
          seasonNumber: Number(episode.seasonNumber) || undefined,
          transcriptUrl: episode.transcript
            ? new URL(`/podcasts/episodes/${episode.slug}/transcript`, origin).toString()
            : undefined,
          transcriptJsonUrl: episode.transcript
            ? new URL(`/podcasts/episodes/${episode.slug}/transcript.json`, origin).toString()
            : undefined,
          transcriptSrtUrl: episode.transcript
            ? new URL(`/podcasts/episodes/${episode.slug}/transcript.srt`, origin).toString()
            : undefined,
          transcriptLanguage: episode.language || show.language || undefined,
          chapters: episode.chapters,
          explicit: Boolean(episode.explicit ?? show.explicit),
          artworkUrl: episode.artwork
            ? new URL(`/media/${value(episode.artwork)}`, origin).toString()
            : undefined,
          author: authorName,
          persons: episodePersons.length ? episodePersons : undefined,
          liveState,
          liveStartAt: episode.liveStartAt ? String(episode.liveStartAt) : undefined,
          liveEndAt: episode.liveEndAt ? String(episode.liveEndAt) : undefined,
          liveStreamUrl: episode.liveStreamUrl ? String(episode.liveStreamUrl) : undefined,
          // POD-17: video fields only from the probe gate, and only on
          // the public feed (member token enclosures serve audio).
          ...(options.enclosureUrl ? {} : episodeVideoFeedFields(episode, origin)),
        },
      ]
    })

  const artwork = show.artwork
    ? new URL(`/media/${value(show.artwork)}`, origin).toString()
    : undefined

  const showAuthor =
    Array.isArray(show.hosts) && show.hosts[0]
      ? show.hosts[0].displayName || show.hosts[0].name || show.hosts[0].title
      : Array.isArray(show.authors) && show.authors[0]
        ? show.authors[0].displayName || show.authors[0].name || show.authors[0].title
        : undefined

  const categories = Array.isArray(show.categories)
    ? show.categories.map((cat: any) => String(cat.name || cat.title || cat))
    : undefined

  const showPersons = asPersons(show.persons) ?? (hostPersons.length ? hostPersons : undefined)

  return podcastRss({
    title: String(show.title),
    description: show.description,
    siteUrl: origin,
    path: options.feedPath,
    showPath: options.showPath,
    artworkUrl: artwork,
    language: show.language,
    explicit: Boolean(show.explicit),
    author: showAuthor,
    categories,
    podcastGuidValue: show.podcastGuidValue ? String(show.podcastGuidValue) : undefined,
    lockedOwnerEmail: show.lockedOwnerEmail ? String(show.lockedOwnerEmail) : undefined,
    medium: show.medium ? String(show.medium) : undefined,
    funding: asFunding(show.funding),
    value: asValue(show.value),
    persons: showPersons,
    episodes: visible,
  })
}
