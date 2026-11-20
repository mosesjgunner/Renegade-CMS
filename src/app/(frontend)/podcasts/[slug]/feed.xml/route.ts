/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { createHash } from 'node:crypto'

import { canRenderPodcast } from '@/modules/media/publishing'
import { renderPodcastFeed } from '@/modules/podcast-studio/feed-build'
import { podcastFeedOrigin } from '@/modules/podcast-studio/feed-origin'
import { loadConfig } from '@/modules/core/config'
import { resolveSiteSettings } from '@/modules/core/site-settings'
import { publicSiteForHost } from '@/modules/public/site-scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public podcast feed (POD-RC-01 Step 03): creator domains are
 * authoritative. The show is bound to the site the request host
 * identifies — a show that belongs to another site is not found here,
 * its external-feed redirect is not followed from here, and the
 * redirect table only answers for the resolved site. Every URL in the
 * feed (self, show, episode, enclosure, artwork, sidecars) is built
 * from the show's site's canonical origin, never the raw request
 * host; a local/dev configured origin is not a creator domain and
 * falls back to the install's APP_URL (see feed-origin.ts). Episode
 * and channel GUIDs are stored values / ID-derived, so a slug or
 * domain move never changes them.
 *
 * Binding rule: a host that POSITIVELY identifies a site — an exact
 * canonicalOriginsBySite host match on a real domain, or the
 * install's canonical domain — speaks only for that site. A host the
 * resolver cannot place (unknown or ambiguous on a multi-site
 * install) fails closed with a 404. Local/dev hosts (localhost,
 * loopback, *.local, *.test) carry no authority: every dev install
 * and test fixture reuses them, so neither the request host nor a
 * map entry pointing at one can bind or block a show — the show is
 * served at its own site's canonical origin (the behaviour local
 * tooling has always relied on).
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const payload = await getPayload({ config })
  const { slug } = await params

  const host = request.headers.get('host') ?? new URL(request.url).host
  const siteId = await publicSiteForHost(payload, host)
  const settings = await resolveSiteSettings(payload, { includeTheme: false })
  const originFor = (id?: string) => podcastFeedOrigin(settings, id, loadConfig().appUrl)

  const shows = await payload.find({
    collection: 'podcast-shows',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  } as never)
  const show = shows.docs[0] as any
  const showSiteId = show
    ? typeof show.site === 'string'
      ? show.site
      : show.site?.id
        ? String(show.site.id)
        : undefined
    : undefined

  const hostname = host.split(':')[0]?.toLowerCase() ?? ''
  const isLocalHost = (name: string) =>
    name === 'localhost' ||
    name === '127.0.0.1' ||
    name === '[::1]' ||
    name.endsWith('.local') ||
    name.endsWith('.test')
  const hostIsLocal = isLocalHost(hostname)
  const exactSiteIds = Object.entries(settings.canonicalOriginsBySite)
    .filter(([, origin]) => {
      try {
        const url = new URL(origin)
        if (isLocalHost(url.hostname.toLowerCase())) return false
        return url.host === host || url.hostname === hostname
      } catch {
        return false
      }
    })
    .map(([id]) => id)
  let canonicalHost = ''
  let canonicalIsLocal = false
  try {
    const canonicalUrl = new URL(settings.canonicalOrigin)
    canonicalHost = canonicalUrl.host
    canonicalIsLocal = isLocalHost(canonicalUrl.hostname.toLowerCase())
  } catch {
    canonicalHost = ''
  }
  let bound: boolean
  if (!showSiteId) {
    bound = true // legacy install-global show: no site to bind to
  } else if (hostIsLocal) {
    bound = true // dev host: no authority to bind or block (see header)
  } else if (exactSiteIds.length > 1) {
    bound = false // two sites claim this host — ambiguous, fail closed
  } else if (exactSiteIds.length === 1) {
    bound = exactSiteIds[0] === showSiteId // positively identified host
  } else if (siteId === '') {
    bound = false // host cannot be placed — fail closed
  } else if (siteId === showSiteId) {
    bound = true
  } else if (host === canonicalHost && !canonicalIsLocal) {
    bound = false // the install's primary domain is not this show's domain
  } else {
    bound = true // resolver primary heuristic (local/dev hosts only)
  }
  const origin = originFor(showSiteId ?? (siteId || undefined))

  if (!show || !bound || !show.rssEnabled || !canRenderPodcast(show)) {
    // 1. External legacy feed redirect — only for a show bound to this
    // host's site; another site's show (and its external feed) is not
    // leaked by redirecting to it from the wrong domain.
    if (show && bound && show.externalFeedUrl && !show.rssEnabled) {
      return Response.redirect(show.externalFeedUrl, 308)
    }

    // 2. Public redirect table lookup for renamed shows or legacy
    // paths, constrained to the resolved site (redirect rules are
    // per-site). No resolved site → no redirect answers.
    if (siteId) {
      const currentFeedPath = `/podcasts/${slug}/feed.xml`
      const currentShowPath = `/podcasts/${slug}`
      const redirects = await payload
        .find({
          collection: 'public-redirects',
          where: {
            and: [
              { fromPath: { in: [currentFeedPath, currentShowPath] } },
              { site: { equals: siteId } },
            ],
          },
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
          Number(redirectDoc.statusCode) === 301 || Number(redirectDoc.statusCode) === 308
            ? 308
            : 307
        return Response.redirect(targetUrl, statusCode)
      }
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
