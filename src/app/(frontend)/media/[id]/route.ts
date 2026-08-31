import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { mediaStorage } from '@/modules/media/storage'
import { publicMedia } from '@/modules/media/workflow'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const appConfig = loadConfig()
  const payload = await getPayload({ config })
  const media = await publicMedia(payload, (await params).id)
  if (!media) return new NextResponse('Not found', { status: 404 })
  const bytes = await mediaStorage(appConfig).get(String(media.storageLocation))
  if (!bytes) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': String(media.mimeType || 'application/octet-stream'),
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: String(media.checksum || ''),
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
