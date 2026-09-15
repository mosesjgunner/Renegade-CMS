import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { assertMediaPermission, MediaWorkflowError } from '@/modules/media/workflow'
import {
  mediaVariantUrl,
  queueAssetVariantGeneration,
  type CropRectangle,
  type FocalPoint,
} from '@/modules/media/variants'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const payload = await getPayload({ config })
    const auth = await payload.auth({ headers: request.headers })

    const url = new URL(request.url)
    const siteId = url.searchParams.get('siteId')

    const asset = (await payload
      .findByID({
        collection: 'media-assets',
        id,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => null)) as Record<string, unknown> | null

    if (!asset) throw new MediaWorkflowError('Media asset not found.', 404)

    const effectiveSiteId = String(
      siteId || (asset.site as { id?: string })?.id || asset.site || '',
    )
    await assertMediaPermission(
      payload,
      auth.user as never,
      { kind: 'site', siteId: effectiveSiteId },
      'content.read',
    )

    // Find all variants for this asset
    const variantsResult = await payload.find({
      collection: 'media-variants',
      where: { asset: { equals: id } },
      limit: 100,
      depth: 1,
      overrideAccess: true,
    } as never)

    const originalSize = Number(asset.sizeBytes || 0)
    let totalVariantBytes = 0

    const variants = (variantsResult.docs as unknown as Record<string, unknown>[]).map((v) => {
      const vSize = Number(v.sizeBytes || (v.blob as { sizeBytes?: number })?.sizeBytes || 0)
      totalVariantBytes += vSize

      const bytesSaved = Math.max(0, originalSize - vSize)
      const percentSaved = originalSize > 0 ? Math.round((bytesSaved / originalSize) * 100) : 0

      return {
        id: String(v.id),
        recipeKey: String(v.recipeKey || 'custom'),
        label: String(v.label || ''),
        format: String(v.format || 'webp'),
        width: v.width ? Number(v.width) : null,
        height: v.height ? Number(v.height) : null,
        sizeBytes: vSize,
        bytesSaved,
        percentSaved,
        processingState: String(v.processingState || 'ready'),
        errorMessage: v.errorMessage ? String(v.errorMessage) : null,
        url: mediaVariantUrl(
          id,
          String(v.recipeKey || 'thumbnail'),
          String(v.format || 'webp') as 'webp' | 'avif' | 'jpeg' | 'png',
        ),
      }
    })

    const readyVariants = variants.filter((v) => v.processingState === 'ready')
    const totalSavingsBytes = Math.max(0, originalSize * readyVariants.length - totalVariantBytes)
    const averagePercentSaved =
      readyVariants.length > 0
        ? Math.round(
            readyVariants.reduce((acc, v) => acc + v.percentSaved, 0) / readyVariants.length,
          )
        : 0

    return NextResponse.json({
      original: {
        id: String(asset.id),
        title: String(asset.title || ''),
        originalFilename: asset.originalFilename ? String(asset.originalFilename) : null,
        mimeType: String(asset.mimeType || ''),
        sizeBytes: originalSize,
        width: asset.width ? Number(asset.width) : null,
        height: asset.height ? Number(asset.height) : null,
        aspectRatio: asset.aspectRatio ? Number(asset.aspectRatio) : null,
        dominantColor: asset.dominantColor ? String(asset.dominantColor) : null,
        colorPalette: asset.colorPalette || null,
        focalPoint: asset.focalPoint || { x: 0.5, y: 0.5 },
        cropSettings: asset.cropSettings || null,
        url: `/media/${id}`,
        canDownload: Boolean(
          auth.user && ['owner', 'administrator', 'staff'].includes(String(auth.user.role)),
        ),
      },
      variants,
      summary: {
        totalVariants: variants.length,
        readyVariants: readyVariants.length,
        totalVariantBytes,
        totalSavingsBytes,
        averagePercentSaved,
      },
    })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch variants' },
      { status },
    )
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const payload = await getPayload({ config })
    const auth = await payload.auth({ headers: request.headers })

    const body = (await request.json().catch(() => ({}))) as {
      siteId?: string
      focalPoint?: FocalPoint
      cropSettings?: CropRectangle
      recipeKeys?: string[]
      force?: boolean
    }

    const asset = (await payload
      .findByID({
        collection: 'media-assets',
        id,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => null)) as Record<string, unknown> | null

    if (!asset) throw new MediaWorkflowError('Media asset not found.', 404)

    const effectiveSiteId = String(
      body.siteId || (asset.site as { id?: string })?.id || asset.site || '',
    )
    await assertMediaPermission(
      payload,
      auth.user as never,
      { kind: 'site', siteId: effectiveSiteId },
      'content.edit',
    )

    const updateData: Record<string, unknown> = {}
    if (body.focalPoint) {
      if (
        body.focalPoint.x < 0 ||
        body.focalPoint.x > 1 ||
        body.focalPoint.y < 0 ||
        body.focalPoint.y > 1
      ) {
        throw new MediaWorkflowError('Focal point coordinates must be between 0 and 1.')
      }
      updateData.focalPoint = body.focalPoint
    }
    if (body.cropSettings) {
      updateData.cropSettings = body.cropSettings
    }

    if (Object.keys(updateData).length > 0) {
      await payload.update({
        collection: 'media-assets',
        id,
        overrideAccess: true,
        data: updateData,
      } as never)
    }

    if (!payload.jobs?.queue)
      throw new MediaWorkflowError('The media worker queue is unavailable.', 503)
    const queued = await queueAssetVariantGeneration(payload, {
      assetId: id,
      recipeKeys: body.recipeKeys,
      force: body.force ?? true,
    })

    return NextResponse.json(
      { message: 'Variant processing queued.', job: queued },
      { status: 202 },
    )
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Variant regeneration failed' },
      { status },
    )
  }
}
