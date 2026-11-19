/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { loadConfig } from '@/modules/core/config'
import { mediaBytesResponse } from '@/modules/media/range-serving'
import { mediaStorage } from '@/modules/media/storage'
import { mediaStorageKey } from '@/modules/media/workflow'
import {
  episodeIsMembersOnly,
  memberHasPodcastEntitlement,
  resolveToken,
} from '@/modules/podcast-studio/member-feeds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const relationId = (value: unknown): string =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id ?? '')

/**
 * POD-03 (POD-REQ-08): token-scoped enclosure serving. The token is
 * resolved and the member's entitlement is checked NOW, on every
 * request — a revoked/rotated token or a revoked entitlement fails
 * immediately, even for enclosure URLs a podcast client cached from
 * an earlier feed fetch. Bytes are served through the shared media
 * range machinery (`mediaBytesResponse` / `mediaStorageKey`, the same
 * helpers the public `/media/[id]` route uses), but the public-media
 * gate is intentionally NOT the authority here: members-only audio
 * may live on a private media asset, and this route's token +
 * entitlement check is what authorizes it. Tombstoned/quarantined
 * assets are refused regardless.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; token: string; episodeId: string }> },
) {
  const denied = () =>
    new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
    })
  const payload = await getPayload({ config })
  const { slug, token, episodeId } = await params

  const shows = await payload.find({
    collection: 'podcast-shows',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const show = shows.docs[0] as any
  if (!show) return denied()

  const resolved = await resolveToken(payload as never, token, { showId: String(show.id) })
  if (!resolved) return denied()

  const episode = (await payload
    .findByID({
      collection: 'podcast-episodes',
      id: episodeId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)) as any
  if (
    !episode ||
    relationId(episode.show) !== String(show.id) ||
    !['published', 'updated'].includes(String(episode.status))
  )
    return denied()

  if (episodeIsMembersOnly(episode, show)) {
    const entitled = await memberHasPodcastEntitlement(payload as never, show, resolved.memberId)
    if (!entitled) return denied()
  }

  const audioId = relationId(episode.audio)
  if (!audioId) return denied()
  const asset = (await payload
    .findByID({ collection: 'media-assets', id: audioId, depth: 0, overrideAccess: true } as never)
    .catch(() => null)) as any
  if (!asset || relationId(asset.site) !== relationId(show.site)) return denied()
  const dam = (asset.dam ?? {}) as Record<string, unknown>
  if (
    asset.retentionMode === 'tombstone' ||
    dam.retentionMode === 'tombstone' ||
    Boolean(asset.removeFromDiscovery) ||
    Boolean(dam.removeFromDiscovery) ||
    asset.processingState === 'quarantined'
  )
    return denied()

  const key = await mediaStorageKey(payload as never, asset)
  if (!key) return denied()
  const bytes = await mediaStorage(loadConfig()).get(key)
  if (!bytes) return denied()

  return mediaBytesResponse({
    bytes,
    mimeType: String(asset.mimeType || episode.enclosureMimeType || 'application/octet-stream'),
    checksum: asset.checksum ? String(asset.checksum) : undefined,
    rangeHeader: request.headers.get('range'),
    ifNoneMatch: request.headers.get('if-none-match'),
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
  })
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ slug: string; token: string; episodeId: string }> },
) {
  const response = await GET(request, context)
  return new NextResponse(null, { status: response.status, headers: response.headers })
}
