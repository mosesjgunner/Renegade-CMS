import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { loadConfig } from '@/modules/core/config'
import { mediaStorage } from '@/modules/media/storage'
import { publicMediaPolicyAllows } from '@/modules/media/workflow'
import { canRenderPublic } from '@/modules/public/contracts'
import { publicSiteForHost } from '@/modules/public/site-scope'

const identifier = (value: unknown) => String((value as { id?: string } | null)?.id ?? value ?? '')

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const siteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!siteId)
    return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const caption = (await payload
    .findByID({
      collection: 'video-captions' as never,
      id: (await params).id,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (!caption) return new NextResponse('Not found', { status: 404 })
  const videos = await payload.find({
    collection: 'videos' as never,
    where: {
      and: [
        { id: { equals: identifier(caption.video) } },
        { site: { equals: siteId } },
        { status: { equals: 'published' } },
        { visibility: { in: ['public', 'unlisted'] } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (!videos.docs.some((video) => canRenderPublic({ ...video, visibility: 'public' } as never)))
    return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const asset = (await payload.findByID({
    collection: 'media-assets',
    id: identifier(caption.asset),
    depth: 1,
    disableErrors: true,
    overrideAccess: true,
  } as never)) as unknown as Record<string, unknown> | null
  if (!asset || identifier(asset.site) !== siteId || !publicMediaPolicyAllows(asset))
    return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const blob = asset.originalBlob as Record<string, unknown> | undefined
  if (!blob || identifier(blob.site) !== siteId)
    return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const bytes = await mediaStorage(loadConfig()).get(String(blob.storageKey))
  if (!bytes) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=0, must-revalidate',
      ETag: String(asset.checksum),
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
