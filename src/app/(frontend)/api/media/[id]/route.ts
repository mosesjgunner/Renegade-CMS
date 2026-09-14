import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import {
  MediaWorkflowError,
  deleteOrphanedMedia,
  previewReplacementImpact,
  replaceMedia,
  updateMediaMetadata,
} from '@/modules/media/workflow'
import { loadConfig } from '@/modules/core/config'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const siteId = String(body.siteId ?? '')
    await updateMediaMetadata(payload, auth.user as never, {
      mediaId: (await params).id,
      scope: { kind: 'site', siteId },
    })
    return NextResponse.json({
      impact: await previewReplacementImpact(
        payload,
        siteId,
        (await params).id,
        Array.isArray(body.usageIds) ? body.usageIds.map(String) : undefined,
      ),
    })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Replacement preview failed.' },
      { status },
    )
  }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const media = await updateMediaMetadata(payload, auth.user as never, {
      mediaId: (await params).id,
      scope: { kind: 'site', siteId: String(body.siteId ?? '') },
      ...body,
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
      mode: ['new-asset', 'selected-usages', 'all-usages'].includes(String(form.get('mode')))
        ? (String(form.get('mode')) as 'new-asset' | 'selected-usages' | 'all-usages')
        : 'new-asset',
      usageIds: String(form.get('usageIds') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      reason: String(form.get('reason') ?? '') || undefined,
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
