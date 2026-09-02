import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { mediaStorage } from '@/modules/media/storage'
import { publicMedia } from '@/modules/media/workflow'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const appConfig = loadConfig()
  const payload = await getPayload({ config })
  const { id } = await params
  let media = await publicMedia(payload, id)
  if (!media) {
    const auth = await payload.auth({ headers: request.headers })
    if (auth.user && ['owner', 'administrator', 'staff'].includes(String(auth.user.role))) {
      media = (await payload
        .findByID({ collection: 'media-assets', id, depth: 0, overrideAccess: true } as never)
        .catch(() => undefined)) as unknown as Record<string, unknown> | undefined
    }
  }
  if (!media) return new NextResponse('Not found', { status: 404 })
  const bytes = await mediaStorage(appConfig).get(String(media.storageLocation))
  if (!bytes) return new NextResponse('Not found', { status: 404 })
  const mimeType = String(media.mimeType || 'application/octet-stream')
  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'Content-Length': String(bytes.byteLength),
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: String(media.checksum || ''),
    'X-Content-Type-Options': 'nosniff',
  }
  if (mimeType.includes('svg')) {
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'"
  }
  return new NextResponse(Buffer.from(bytes), { headers })
}
