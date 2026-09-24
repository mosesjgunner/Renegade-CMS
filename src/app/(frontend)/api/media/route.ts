import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { assertMediaPermission, MediaWorkflowError } from '@/modules/media/workflow'

export const runtime = 'nodejs'

/** Scoped library metadata only. Physical object keys remain private. */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const siteId = new URL(request.url).searchParams.get('siteId') ?? ''
    await assertMediaPermission(
      payload,
      auth.user as never,
      { kind: 'site', siteId },
      'content.read',
    )
    const result = await payload.find({
      collection: 'media-assets',
      where: { site: { equals: siteId } },
      depth: 0,
      limit: 100,
      sort: '-updatedAt',
      overrideAccess: true,
    } as never)
    const media = result.docs.map((rawAsset) => {
      const asset = rawAsset as unknown as Record<string, unknown>
      return {
        id: String(asset.id),
        title: String(asset.title ?? ''),
        altText: typeof asset.altText === 'string' ? asset.altText : '',
        caption: typeof asset.caption === 'string' ? asset.caption : '',
        mimeType: String(asset.mimeType ?? ''),
        sizeBytes: Number(asset.sizeBytes ?? 0),
        processingState: String(asset.processingState ?? ''),
        url: `/media/${asset.id}`,
      }
    })
    return NextResponse.json({ media })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Media library unavailable.' },
      { status },
    )
  }
}
