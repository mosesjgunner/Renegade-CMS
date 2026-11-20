/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import { canRenderPodcast } from '@/modules/media/publishing'
import { renderPodcastFeed } from '@/modules/podcast-studio/feed-build'
import {
  memberEnclosurePath,
  memberHasPodcastEntitlement,
  resolveToken,
} from '@/modules/podcast-studio/member-feeds'
import { podcastFeedOrigin } from '@/modules/podcast-studio/feed-origin'
import { loadConfig } from '@/modules/core/config'
import { resolveSiteSettings } from '@/modules/core/site-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-03 (POD-REQ-08): per-member token feed. The path token is the
 * industry pattern for private podcast feeds (clients subscribe to a
 * URL, no cookie/header auth). Every request re-resolves the token
 * AND re-checks the member's entitlement at serve time: a revoked or
 * rotated token, or a revoked entitlement, fails immediately with the
 * same 404 shape. Enclosure URLs in this feed are token-scoped, never
 * public `/media/` URLs. Responses are never cached.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  const denied = () =>
    new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  const payload = await getPayload({ config })
  const { slug, token } = await params

  const shows = await payload.find({
    collection: 'podcast-shows',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  } as never)
  const show = shows.docs[0] as any
  if (!show || !show.rssEnabled || !canRenderPodcast(show)) return denied()

  // POD-RC-01: feed URLs are built from the show's own site's canonical
  // origin, matching the public feed's domain authority (a local/dev
  // configured origin is not a creator domain and falls back to the
  // install's APP_URL — see feed-origin.ts).
  const settings = await resolveSiteSettings(payload, { includeTheme: false })
  const showSiteId =
    typeof show.site === 'string' ? show.site : show.site?.id ? String(show.site.id) : undefined
  const origin = podcastFeedOrigin(settings, showSiteId, loadConfig().appUrl)

  const resolved = await resolveToken(payload as never, token, { showId: String(show.id) })
  if (!resolved) return denied()

  const entitled = await memberHasPodcastEntitlement(payload as never, show, resolved.memberId)
  // A members show is all-or-nothing: no entitlement, no feed. On a
  // public show the token feed still serves public episodes, and the
  // members-only episodes join only for entitled members.
  if (show.feedVisibility === 'members' && !entitled) return denied()

  const episodes = await payload.find({
    collection: 'podcast-episodes',
    where: {
      and: [{ show: { equals: show.id } }, { status: { in: ['published', 'updated'] } }],
    },
    limit: 1000,
    depth: 2,
    overrideAccess: true,
  } as never)

  const body = renderPodcastFeed(show, episodes.docs as any[], {
    origin,
    feedPath: `/podcasts/${slug}/member-feed/${token}`,
    showPath: `/podcasts/${slug}`,
    includeMembersOnly: entitled,
    memberFeed: true,
    enclosureUrl: (episode) =>
      new URL(memberEnclosurePath(slug, token, String(episode.id)), origin).toString(),
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'private, no-store',
      Vary: 'Accept-Encoding',
    },
  })
}
