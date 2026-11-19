/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { createHash } from 'node:crypto'

import { canRenderPodcast } from '@/modules/media/publishing'
import { renderPodcastFeed } from '@/modules/podcast-studio/feed-build'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  // POD-03: the public feed never carries members-only content. A
  // members show's episodes are all private, so the public feed is
  // simply not found; on a public show, members-only episodes are
  // absent from the feed entirely (PT-D rule, applied in the builder).
  if (show.feedVisibility === 'members') {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  const body = renderPodcastFeed(show, episodes.docs as any[], {
    origin,
    feedPath: `/podcasts/${slug}/feed.xml`,
    showPath: `/podcasts/${slug}`,
    includeMembersOnly: false,
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
