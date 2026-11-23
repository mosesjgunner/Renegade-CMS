import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { loadConfig } from '@/modules/core/config'
import { parseByteRange } from '@/modules/media/range-serving'
import { mediaStorage } from '@/modules/media/storage'
import { publicMediaPolicyAllows } from '@/modules/media/workflow'
import { canRenderPublic } from '@/modules/public/contracts'
import { publicSiteForHost } from '@/modules/public/site-scope'

const identifier = (value: unknown) => String((value as { id?: string } | null)?.id ?? value ?? '')

const missing = () =>
  new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const { id, filename } = await params
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ||
    !/^[a-zA-Z0-9._-]+$/.test(filename)
  )
    return missing()
  const payload = await getPayload({ config })
  const siteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!siteId) return missing()
  const videos = await payload.find({
    collection: 'videos' as never,
    where: {
      and: [
        { videoAsset: { equals: id } },
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
    return missing()
  const asset = (await payload.findByID({
    collection: 'video-assets' as never,
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  } as never)) as unknown as {
    processingState?: string
    sourceAsset?: unknown
    site?: unknown
    outputs?: Array<Record<string, unknown>>
    lastGoodOutputs?: Array<Record<string, unknown>>
  } | null
  if (!asset) return missing()
  const source = (await payload
    .findByID({
      collection: 'media-assets',
      id: identifier(asset.sourceAsset),
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)) as unknown as Record<string, unknown> | null
  if (
    !source ||
    !publicMediaPolicyAllows(source) ||
    identifier(source.site) !== identifier(asset.site) ||
    !videos.docs.some(
      (video) =>
        identifier((video as unknown as Record<string, unknown>).site) === identifier(source.site),
    )
  )
    return missing()
  const outputs =
    asset.processingState === 'ready' && Array.isArray(asset.outputs)
      ? asset.outputs
      : asset.lastGoodOutputs
  const output = outputs?.find((item) => item.filename === filename)
  if (!output) return missing()
  const storage = mediaStorage(loadConfig())
  const key = String(output.storageKey)
  const recordedSize = Number(output.sizeBytes)
  // Existing output records can lack a byte count. Keep those readable using
  // the stored bytes, while current renditions use a bounded streaming read.
  const knownSize = Number.isSafeInteger(recordedSize) && recordedSize > 0
  const legacyBytes = knownSize ? undefined : await storage.get(key)
  if (!knownSize && !legacyBytes) return missing()
  const size = knownSize ? recordedSize : legacyBytes!.byteLength
  const headers: Record<string, string> = {
    'Content-Type': String(output.mimeType),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    ETag: String(output.checksum),
    'X-Content-Type-Options': 'nosniff',
  }
  const requestedRange = request.headers.get('range')
  const selection =
    requestedRange && !requestedRange.startsWith('bytes=')
      ? null
      : parseByteRange(requestedRange, size)
  if (selection === null)
    return new NextResponse(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${size}`, 'Cache-Control': 'no-store' },
    })
  const { from, to } = selection ?? { from: 0, to: size - 1 }
  headers['Content-Length'] = String(to - from + 1)
  if (selection) headers['Content-Range'] = `bytes ${from}-${to}/${size}`
  const status = selection ? 206 : 200
  if (request.method === 'HEAD') {
    if (!legacyBytes && !(await storage.exists(key))) return missing()
    return new NextResponse(null, { status, headers })
  }
  const body = legacyBytes
    ? Buffer.from(legacyBytes.subarray(from, to + 1))
    : await storage.open(key, from, to).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
  return body ? new NextResponse(body, { status, headers }) : missing()
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string; filename: string }> },
) {
  const response = await GET(request, context)
  return new NextResponse(null, { status: response.status, headers: response.headers })
}
