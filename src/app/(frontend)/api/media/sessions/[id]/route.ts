import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { loadConfig } from '@/modules/core/config'
import {
  cancelUploadSession,
  finalizeUploadSession,
  readUploadSession,
  writeUploadChunk,
} from '@/modules/media/upload-sessions'
import { MediaWorkflowError } from '@/modules/media/workflow'

export const runtime = 'nodejs'
const respond = (error: unknown) =>
  NextResponse.json(
    { error: error instanceof Error ? error.message : 'Upload request failed.' },
    { status: error instanceof MediaWorkflowError ? error.status : 400 },
  )

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    return NextResponse.json({
      session: await readUploadSession(payload, auth.user as never, (await params).id),
    })
  } catch (error) {
    return respond(error)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const range = request.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
    const index = Number(request.headers.get('x-upload-chunk-index'))
    if (!range)
      throw new MediaWorkflowError('Content-Range is required for a resumable upload chunk.')
    const bytes = new Uint8Array(await request.arrayBuffer())
    if (bytes.byteLength !== Number(range[2]) - Number(range[1]) + 1)
      throw new MediaWorkflowError('Chunk body does not match Content-Range.')
    const result = await writeUploadChunk(
      payload,
      loadConfig(),
      auth.user as never,
      (await params).id,
      index,
      Number(range[1]),
      Number(range[3]),
      bytes,
    )
    return NextResponse.json(result)
  } catch (error) {
    return respond(error)
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const asset = await finalizeUploadSession(
      payload,
      loadConfig(),
      auth.user as never,
      (await params).id,
    )
    return NextResponse.json({ asset, url: `/media/${asset.id}` })
  } catch (error) {
    return respond(error)
  }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    await cancelUploadSession(payload, loadConfig(), auth.user as never, (await params).id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return respond(error)
  }
}
