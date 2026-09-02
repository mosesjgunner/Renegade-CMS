import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { MediaWorkflowError, uploadMedia } from '@/modules/media/workflow'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const appConfig = loadConfig()
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const declaredLength = Number(request.headers.get('content-length') ?? 0)
    if (declaredLength > appConfig.storage.maxUploadBytes + 1_000_000)
      throw new MediaWorkflowError('Media exceeds the configured upload limit.', 413)
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new MediaWorkflowError('A media file is required.')
    const siteId = String(form.get('siteId') ?? '')
    if (!siteId) throw new MediaWorkflowError('A site is required.')
    const asset = await uploadMedia(payload, appConfig, {
      user: auth.user as never,
      scope: {
        kind: String(form.get('scopeKind') ?? 'site') as 'site' | 'publication' | 'space',
        siteId,
        publicationId: String(form.get('publicationId') ?? '') || null,
        spaceId: String(form.get('spaceId') ?? '') || null,
      },
      title: String(form.get('title') ?? file.name),
      altText: String(form.get('altText') ?? '') || undefined,
      caption: String(form.get('caption') ?? '') || undefined,
      focalPoint:
        form.get('focalX') !== null && form.get('focalY') !== null
          ? { x: Number(form.get('focalX')), y: Number(form.get('focalY')) }
          : undefined,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })
    return NextResponse.json({ asset, url: `/media/${asset.id}` }, { status: 201 })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed.' },
      { status },
    )
  }
}
