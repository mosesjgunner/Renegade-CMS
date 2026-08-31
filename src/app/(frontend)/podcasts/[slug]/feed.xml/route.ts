/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import { podcastRss } from '@/modules/media/publishing'
import { canRenderPublic } from '@/modules/public/contracts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const value = (item: unknown) =>
  typeof item === 'string' ? item : String((item as { id?: unknown } | null)?.id ?? '')

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const shows = await payload.find({
    collection: 'podcast-shows',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  } as never)
  const show = shows.docs[0] as any
  if (!show || !show.rssEnabled || !canRenderPublic(show))
    return new Response('Not found', { status: 404 })
  const episodes = await payload.find({
    collection: 'podcast-episodes',
    where: {
      and: [
        { show: { equals: show.id } },
        { status: { in: ['published', 'updated', 'scheduled'] } },
      ],
    },
    limit: 1000,
    depth: 1,
    overrideAccess: true,
  } as never)
  const origin = new URL(request.url).origin
  const visible = (episodes.docs as any[])
    .filter((episode) => canRenderPublic(episode))
    .flatMap((episode) => {
      const audio = episode.audio as any
      if (
        !audio ||
        audio.mimeType !== 'audio/mpeg' ||
        !Number.isFinite(Number(audio.sizeBytes)) ||
        Number(audio.sizeBytes) < 1
      )
        return []
      return [
        {
          id: String(episode.id),
          title: String(episode.title),
          slug: String(episode.slug),
          description: episode.description,
          publishedAt: String(episode.publishedAt),
          audioUrl: new URL(`/media/${audio.id}`, origin).toString(),
          bytes: Number(audio.sizeBytes),
          mimeType: String(audio.mimeType),
          durationSeconds: Number(audio.durationSeconds) || undefined,
          episodeNumber: Number(episode.episodeNumber) || undefined,
          transcriptUrl: episode.transcript
            ? new URL(`/podcasts/episodes/${episode.slug}/transcript`, origin).toString()
            : undefined,
          chapters: episode.chapters,
        },
      ]
    })
  const artwork = show.artwork
    ? new URL(`/media/${value(show.artwork)}`, origin).toString()
    : undefined
  return new Response(
    podcastRss({
      title: String(show.title),
      description: show.description,
      siteUrl: origin,
      path: `/podcasts/${slug}/feed.xml`,
      artworkUrl: artwork,
      episodes: visible,
    }),
    {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    },
  )
}
