/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { PodcastPlayer } from '@/modules/media/PodcastPlayer'
import {
  episodeEmbedAudioUrl,
  episodeEmbedState,
  oEmbedDiscoveryLinks,
} from '@/modules/podcast-studio/embed'
import { loadConfig } from '@/modules/core/config'

export const dynamic = 'force-dynamic'

/**
 * POD-18 (POD-REQ-40): the iframe-embeddable episode route. Renders
 * ONLY the POD-14-upgraded public player in compact mode — the
 * `(embed)` root layout carries no site chrome. Members-only
 * episodes render the locked player: no audio element, no enclosure
 * URL anywhere in the markup (asserted at markup level in tests via
 * `episodeEmbedState` + the player's locked branch).
 */
export default async function PodcastEpisodeEmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const origin = loadConfig().appUrl

  const result = await payload.find({
    collection: 'podcast-episodes',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  } as never)
  const episode = result.docs[0] as any
  if (!episode) notFound()

  const show = typeof episode.show === 'object' && episode.show !== null ? episode.show : null
  const state = episodeEmbedState(episode, show)
  if (state === 'unavailable') notFound()

  const chapters = Array.isArray(episode.chapters) ? episode.chapters : []
  const transcriptSegments = Array.isArray(episode.transcript?.segments)
    ? episode.transcript.segments
    : Array.isArray(episode.transcript)
      ? episode.transcript
      : []

  return (
    <main data-podcast-embed={state} style={{ padding: 8 }}>
      {/* oEmbed discovery for embed consumers */}
      <span dangerouslySetInnerHTML={{ __html: oEmbedDiscoveryLinks(origin, episode) }} hidden />
      {state === 'locked' ? (
        <PodcastPlayer locked compact title={episode.title} />
      ) : (
        <PodcastPlayer
          compact
          src={episodeEmbedAudioUrl(origin, episode)}
          type={episode.audio?.mimeType || episode.enclosureMimeType || 'audio/mpeg'}
          title={episode.title}
          chapters={chapters}
          transcript={transcriptSegments}
        />
      )}
    </main>
  )
}
