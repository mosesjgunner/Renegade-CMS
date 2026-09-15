import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { mediaStorage } from '@/modules/media/storage'
import { mediaStorageKey, publicMedia } from '@/modules/media/workflow'
import { loadConfig } from '@/modules/core/config'
import {
  formatMimeTypes,
  standardRecipes,
  type VariantFormat,
} from '@/modules/media/variants'

export const runtime = 'nodejs'

const byteRange = (header: string | null, length: number) => {
  if (!header?.startsWith('bytes=')) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match) return null
  const start = match[1] ? Number(match[1]) : undefined
  const end = match[2] ? Number(match[2]) : undefined
  const from = start ?? (end === undefined ? 0 : Math.max(0, length - end))
  const to = Math.min(end ?? length - 1, length - 1)
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > to || from >= length)
    return null
  return { from, to }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const appConfig = loadConfig()
  const payload = await getPayload({ config })
  const { id } = await params
  const url = new URL(request.url)
  const variantKey = url.searchParams.get('variant') || url.searchParams.get('v')
  const formatParam = url.searchParams.get('format') || url.searchParams.get('fmt')
  const recipeVersion = url.searchParams.get('v')
  const isDownload = url.searchParams.get('download') === 'true'

  let media = await publicMedia(payload, id)
  const auth = await payload.auth({ headers: request.headers }).catch(() => ({ user: null }))
  const isStaff = Boolean(
    auth.user && ['owner', 'administrator', 'staff'].includes(String(auth.user.role)),
  )

  if (!media && isStaff) {
    media = (await payload
      .findByID({ collection: 'media-assets', id, depth: 0, overrideAccess: true } as never)
      .catch(() => undefined)) as unknown as Record<string, unknown> | undefined
  }

  if (!media) return new NextResponse('Not found', { status: 404 })

  const storage = mediaStorage(appConfig)

  // 1. Variant resolution and serving
  if (variantKey) {
    // Prevent DoS: only registered approved recipes can be requested
    if (!standardRecipes[variantKey]) {
      return new NextResponse('Invalid variant requested', { status: 400 })
    }
    if (recipeVersion && Number(recipeVersion) !== standardRecipes[variantKey].version) {
      return new NextResponse('Variant recipe version is no longer active', { status: 404 })
    }

    const variantDocs = (
      await payload.find({
        collection: 'media-variants',
        where: {
          and: [
            { asset: { equals: id } },
            { recipeKey: { equals: variantKey } },
            { processingState: { equals: 'ready' } },
          ],
        },
        limit: 10,
        depth: 1,
        overrideAccess: true,
      } as never)
    ).docs as unknown as Record<string, unknown>[]

    // Pick variant: requested format first, then modern formats (AVIF -> WebP -> JPEG)
    let chosenVariant: Record<string, unknown> | undefined
    if (formatParam) {
      chosenVariant = variantDocs.find((v) => v.format === formatParam)
    }
    if (!chosenVariant) {
      chosenVariant =
        variantDocs.find((v) => v.format === 'avif') ||
        variantDocs.find((v) => v.format === 'webp') ||
        variantDocs.find((v) => v.format === 'jpeg') ||
        variantDocs[0]
    }

    if (chosenVariant) {
      const blob = chosenVariant.blob as Record<string, unknown> | string | undefined
      let blobKey = typeof blob === 'object' && blob !== null ? String(blob.storageKey || '') : ''
      let checksum = typeof blob === 'object' && blob !== null ? String(blob.checksum || '') : ''
      let mimeType =
        typeof blob === 'object' && blob !== null ? String(blob.mimeType || '') : ''

      if (!blobKey) {
        const blobId =
          typeof blob === 'string'
            ? blob
            : typeof blob === 'object' && blob !== null
              ? String((blob as { id?: string }).id || '')
              : ''
        if (blobId) {
          const blobDoc = (await payload
            .findByID({
              collection: 'media-blobs',
              id: blobId,
              depth: 0,
              overrideAccess: true,
            } as never)
            .catch(() => null)) as Record<string, unknown> | null
          if (blobDoc) {
            blobKey = String(blobDoc.storageKey || '')
            checksum = String(blobDoc.checksum || '')
            mimeType = String(blobDoc.mimeType || '')
          }
        }
      }

      mimeType =
        mimeType ||
        formatMimeTypes[chosenVariant.format as VariantFormat] ||
        'image/webp'

      if (blobKey) {
        const bytes = await storage.get(blobKey)
        if (bytes) {
        const ifNoneMatch = request.headers.get('if-none-match')
          if (ifNoneMatch && ifNoneMatch === checksum) {
            return new NextResponse(null, { status: 304 })
          }

          const headers: Record<string, string> = {
            'Content-Type': mimeType,
            'Content-Length': String(bytes.byteLength),
            'Cache-Control': 'public, max-age=31536000, immutable',
            ETag: checksum,
            'Content-Location': `/media/${id}?variant=${encodeURIComponent(variantKey)}&format=${chosenVariant.format}&v=${chosenVariant.recipeVersion || standardRecipes[variantKey].version}`,
            'X-Content-Type-Options': 'nosniff',
          }

          if (isDownload) {
            const baseName = String(media.originalFilename || media.title || id).replace(
              /\.[^/.]+$/,
              '',
            )
            headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(
              `${baseName}-${variantKey}.${chosenVariant.format}`,
            )}"`
          }

          // Asynchronously update last accessed timestamp for LRU / GC tracking
          void payload
            .update({
              collection: 'media-variants',
              id: String(chosenVariant.id),
              overrideAccess: true,
              data: { lastAccessedAt: new Date().toISOString() },
            } as never)
            .catch(() => undefined)

          return new NextResponse(Buffer.from(bytes), { headers })
        }
      }
    }

    // Requests are never allowed to invoke Sharp.  The upload/manual-retry
    // queue owns work and public clients receive an explicit retry signal.
    return new NextResponse('Variant is processing or unavailable', {
      status: 503,
      headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' },
    })
  }

  // 2. Deliver original bytes (default / fallback)
  const key = await mediaStorageKey(payload, media)
  if (!key) return new NextResponse('Not found', { status: 404 })
  const bytes = await storage.get(key)
  if (!bytes) return new NextResponse('Not found', { status: 404 })

  const checksum = String(media.checksum || '')
  const ifNoneMatch = request.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch === checksum) {
    return new NextResponse(null, { status: 304 })
  }

  const mimeType = String(media.mimeType || 'application/octet-stream')
  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'Content-Length': String(bytes.byteLength),
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: checksum,
    'X-Content-Type-Options': 'nosniff',
  }
  const range = byteRange(request.headers.get('range'), bytes.byteLength)
  if (range === null)
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${bytes.byteLength}`, 'Accept-Ranges': 'bytes' },
    })
  if (range) {
    const body = bytes.slice(range.from, range.to + 1)
    return new NextResponse(Buffer.from(body), {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(body.byteLength),
        'Content-Range': `bytes ${range.from}-${range.to}/${bytes.byteLength}`,
        'Accept-Ranges': 'bytes',
      },
    })
  }
  headers['Accept-Ranges'] = 'bytes'
  if (mimeType.includes('svg')) {
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'"
  }
  if (isDownload) {
    const ext = mimeType.split('/')[1] || 'bin'
    const filename = String(media.originalFilename || `${id}.${ext}`)
    headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`
  }

  return new NextResponse(Buffer.from(bytes), { headers })
}

export async function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await GET(request, context)
  return new NextResponse(null, { status: response.status, headers: response.headers })
}
