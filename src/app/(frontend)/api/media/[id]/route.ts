import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  MediaWorkflowError,
  deleteOrphanedMedia,
  replaceMedia,
  updateMediaMetadata,
} from '@/modules/media/workflow'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const body = (await request.json()) as Record<string, string | undefined>
    const media = await updateMediaMetadata(payload, auth.user as never, {
      mediaId: (await params).id,
      scope: { kind: 'site', siteId: String(body.siteId ?? '') },
      title: body.title,
      altText: body.altText,
      caption: body.caption,
    })
    return NextResponse.json({ media })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Metadata update failed.' },
      { status },
    )
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const appConfig = loadConfig()
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const { id } = await params
    const siteId = new URL(request.url).searchParams.get('siteId') ?? ''
    await deleteOrphanedMedia(payload, appConfig, auth.user as never, {
      mediaId: id,
      scope: { kind: 'site', siteId },
    })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Deletion failed.' },
      { status },
    )
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const appConfig = loadConfig()
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File))
      throw new MediaWorkflowError('A replacement media file is required.')
    const siteId = String(form.get('siteId') ?? '')
    const { id } = await params
    const replacement = await replaceMedia(payload, appConfig, {
      replacedMediaId: id,
      user: auth.user as never,
      scope: { kind: 'site', siteId },
      title: String(form.get('title') ?? file.name),
      altText: String(form.get('altText') ?? '') || undefined,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })
    return NextResponse.json({ replacement }, { status: 201 })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Replacement failed.' },
      { status },
    )
  }
}
