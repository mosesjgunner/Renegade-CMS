/**
 * POD-18 (POD-REQ-40): episode embeds + oEmbed — PURE CORE.
 *
 * The embed route renders the POD-14-upgraded public player
 * (PodcastPlayer) in compact mode; this module decides WHAT it may
 * render and builds the oEmbed document. The members-only rule is
 * the POD-03/POD-14 rule, applied at markup level: a members-only
 * episode (flagged, or on a members-visibility show) embeds as the
 * LOCKED state — the iframe HTML and the embed markup contain no
 * audio/enclosure URL at all.
 */

export type EpisodeEmbedState = 'ready' | 'locked' | 'unavailable'

const relationId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String((value as { id: unknown }).id ?? '')
      : ''

export function isEpisodeMembersOnly(episode: any, show?: any): boolean {
  return Boolean(episode?.membersOnly) || show?.feedVisibility === 'members'
}

/**
 * Embed state for an episode document: unpublished episodes are
 * unavailable; members-only episodes are locked for the anonymous
 * embed (embeds carry no member credential — a member listens via
 * their POD-03 token feed / the episode page session, never through
 * a third-party iframe).
 */
export function episodeEmbedState(episode: any, show?: any): EpisodeEmbedState {
  if (!episode) return 'unavailable'
  if (!['published', 'updated'].includes(String(episode.status ?? ''))) return 'unavailable'
  if (isEpisodeMembersOnly(episode, show)) return 'locked'
  if (!relationId(episode.audio) && !episode.externalUrl) return 'unavailable'
  return 'ready'
}

export function episodeEmbedUrl(origin: string, episode: { slug?: unknown }): string {
  return new URL(`/podcasts/episodes/${String(episode.slug ?? '')}/embed`, origin).toString()
}

export function episodeEmbedAudioUrl(origin: string, episode: any): string {
  const audioId = relationId(episode?.audio)
  if (audioId) return new URL(`/media/${audioId}`, origin).toString()
  return episode?.externalUrl ? String(episode.externalUrl) : ''
}

const escapeHtmlAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export function buildEmbedIframeHtml(origin: string, episode: any): string {
  const src = escapeHtmlAttribute(episodeEmbedUrl(origin, episode))
  const title = escapeHtmlAttribute(String(episode?.title ?? 'Podcast episode'))
  return `<iframe src="${src}" width="100%" height="180" frameborder="0" scrolling="no" title="${title}" loading="lazy" allow="autoplay"></iframe>`
}

export type OEmbedResponse = {
  version: '1.0'
  type: 'rich'
  provider_name: string
  provider_url: string
  title: string
  html: string
  width: number
  height: number
  cache_age: number
}

/**
 * The oEmbed JSON document for an episode. For a LOCKED episode the
 * iframe still points at the embed route (which renders the locked
 * player) — no audio URL appears anywhere in the document.
 */
export function buildOEmbedResponse(input: {
  origin: string
  episode: any
  show?: any
  providerName?: string
}): OEmbedResponse {
  const { origin, episode } = input
  return {
    version: '1.0',
    type: 'rich',
    provider_name: input.providerName ?? 'Renegade Podcast Studio',
    provider_url: origin,
    title: String(episode?.title ?? ''),
    html: buildEmbedIframeHtml(origin, episode),
    width: 640,
    height: 180,
    cache_age: 3600,
  }
}

/** Extracts the episode slug from a canonical episode URL (oEmbed `url` param). */
export function episodeSlugFromEmbedRequestUrl(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  const match = parsed.pathname.match(/^\/podcasts\/episodes\/([^/]+)(?:\/embed)?\/?$/)
  return match ? decodeURIComponent(match[1]) : null
}

/** oEmbed discovery link tags for the canonical episode page. */
export function oEmbedDiscoveryLinks(origin: string, episode: any): string {
  const canonical = new URL(`/podcasts/episodes/${String(episode?.slug ?? '')}`, origin).toString()
  const endpoint = new URL(
    `/api/oembed?url=${encodeURIComponent(canonical)}&format=json`,
    origin,
  ).toString()
  return `<link rel="alternate" type="application/json+oembed" href="${escapeHtmlAttribute(endpoint)}" title="${escapeHtmlAttribute(String(episode?.title ?? ''))}" />`
}
