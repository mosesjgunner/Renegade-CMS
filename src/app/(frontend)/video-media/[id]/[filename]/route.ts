import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { loadConfig } from '@/modules/core/config'
import { mediaStorage } from '@/modules/media/storage'

const range = (header: string | null, size: number) => {
  if (!header) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match) return null
  const from = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0))
  const to = Math.min(match[2] ? Number(match[2]) : size - 1, size - 1)
  return Number.isInteger(from) && Number.isInteger(to) && from >= 0 && from <= to && from < size
    ? { from, to }
    : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const { id, filename } = await params
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return new NextResponse('Not found', { status: 404 })
  const payload = await getPayload({ config })
  const videos = await payload.find({
    collection: 'videos' as never,
    where: {
      and: [
        { videoAsset: { equals: id } },
        { status: { equals: 'published' } },
        { visibility: { in: ['public', 'unlisted'] } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if (!videos.docs.length) return new NextResponse('Not found', { status: 404 })
  const asset = (await payload.findByID({
    collection: 'video-assets' as never,
    id,
    depth: 0,
    overrideAccess: true,
  } as never)) as unknown as {
    processingState?: string
    outputs?: Array<Record<string, unknown>>
    lastGoodOutputs?: Array<Record<string, unknown>>
  }
  const outputs =
    asset.processingState === 'ready' && Array.isArray(asset.outputs)
      ? asset.outputs
      : asset.lastGoodOutputs
  const output = outputs?.find((item) => item.filename === filename)
  if (!output) return new NextResponse('Not found', { status: 404 })
  const bytes = await mediaStorage(loadConfig()).get(String(output.storageKey))
  if (!bytes) return new NextResponse('Not found', { status: 404 })
  const headers: Record<string, string> = {
    'Content-Type': String(output.mimeType),
    'Content-Length': String(bytes.byteLength),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: String(output.checksum),
    'X-Content-Type-Options': 'nosniff',
  }
  const selection = range(request.headers.get('range'), bytes.byteLength)
  if (selection === null)
    return new NextResponse(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${bytes.byteLength}` },
    })
  if (selection) {
    const body = bytes.slice(selection.from, selection.to + 1)
    return new NextResponse(Buffer.from(body), {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(body.byteLength),
        'Content-Range': `bytes ${selection.from}-${selection.to}/${bytes.byteLength}`,
      },
    })
  }
  return new NextResponse(Buffer.from(bytes), { headers })
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string; filename: string }> },
) {
  const response = await GET(request, context)
  return new NextResponse(null, { status: response.status, headers: response.headers })
}
