/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { createHash } from 'node:crypto'

import { canRenderPodcast, podcastGuid, podcastRss } from '@/modules/media/publishing'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const value = (item: unknown) =>
  typeof item === 'string' ? item : String((item as { id?: unknown } | null)?.id ?? '')

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const { slug } = await params
  const origin = loadConfig().appUrl

  const shows = await payload.find({
    collection: 'podcast-shows',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  } as never)
  const show = shows.docs[0] as any

  if (!show || !show.rssEnabled || !canRenderPodcast(show)) {
    // 1. External legacy feed redirect
    if (show && show.externalFeedUrl && !show.rssEnabled) {
      return Response.redirect(show.externalFeedUrl, 308)
    }

    // 2. Public redirect table lookup for renamed shows or legacy paths
    const currentFeedPath = `/podcasts/${slug}/feed.xml`
    const currentShowPath = `/podcasts/${slug}`
    const redirects = await payload
      .find({
        collection: 'public-redirects',
        where: { fromPath: { in: [currentFeedPath, currentShowPath] } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => ({ docs: [] }))
    const redirectDoc = redirects.docs[0] as any
    if (redirectDoc && redirectDoc.enabled !== false && redirectDoc.toPath) {
      const dest = redirectDoc.toPath.endsWith('/feed.xml')
        ? redirectDoc.toPath
        : `${redirectDoc.toPath.replace(/\/$/, '')}/feed.xml`
      const targetUrl = dest.startsWith('http') ? dest : new URL(dest, origin).toString()
      const statusCode =
        Number(redirectDoc.statusCode) === 301 || Number(redirectDoc.statusCode) === 308 ? 308 : 307
      return Response.redirect(targetUrl, statusCode)
    }

    return new Response('Not found', { status: 404 })
  }

  const episodes = await payload.find({
    collection: 'podcast-episodes',
    where: {
      and: [{ show: { equals: show.id } }, { status: { in: ['published', 'updated'] } }],
    },
    limit: 1000,
    depth: 2,
    overrideAccess: true,
  } as never)

  const visible = (episodes.docs as any[])
    .filter((episode) => canRenderPodcast(episode))
    .flatMap((episode) => {
      const audio = episode.audio as any
      if (
        !audio ||
        !['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'].includes(String(audio.mimeType)) ||
        !Number.isFinite(Number(audio.sizeBytes)) ||
        Number(audio.sizeBytes) < 1
      )
        return []

      const authorName =
        Array.isArray(episode.authors) && episode.authors[0]
          ? episode.authors[0].displayName || episode.authors[0].name || episode.authors[0].title
          : Array.isArray(show.hosts) && show.hosts[0]
            ? show.hosts[0].displayName || show.hosts[0].name || show.hosts[0].title
            : Array.isArray(show.authors) && show.authors[0]
              ? show.authors[0].displayName || show.authors[0].name || show.authors[0].title
              : undefined

      return [
        {
          id: String(episode.id),
          guid: String(episode.guid || podcastGuid(String(show.id), String(episode.id))),
          title: String(episode.title),
          slug: String(episode.slug),
          description: episode.description,
          publishedAt: String(episode.publishedAt),
          audioUrl: new URL(`/media/${audio.id}`, origin).toString(),
          bytes: Number(audio.sizeBytes),
          mimeType: String(audio.mimeType),
          durationSeconds: Number(audio.durationSeconds) || undefined,
          episodeNumber: Number(episode.episodeNumber) || undefined,
          seasonNumber: Number(episode.seasonNumber) || undefined,
          transcriptUrl: episode.transcript
            ? new URL(`/podcasts/episodes/${episode.slug}/transcript`, origin).toString()
            : undefined,
          chapters: episode.chapters,
          explicit: Boolean(episode.explicit ?? show.explicit),
          artworkUrl: episode.artwork
            ? new URL(`/media/${value(episode.artwork)}`, origin).toString()
            : undefined,
          author: authorName,
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

  const body = podcastRss({
    title: String(show.title),
    description: show.description,
    siteUrl: origin,
    path: `/podcasts/${slug}/feed.xml`,
    showPath: `/podcasts/${slug}`,
    artworkUrl: artwork,
    language: show.language,
    explicit: Boolean(show.explicit),
    author: showAuthor,
    categories,
    episodes: visible,
  })

  const etag = `\"${createHash('sha256').update(body).digest('hex')}\"`
  if (request.headers.get('if-none-match') === etag)
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      ETag: etag,
      Vary: 'Accept-Encoding',
    },
  })
}
