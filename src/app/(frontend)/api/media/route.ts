import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { listScopedMediaLibrary, MediaWorkflowError } from '@/modules/media/workflow'

export const runtime = 'nodejs'

/** Scoped library metadata only. Physical object keys remain private. */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const params = new URL(request.url).searchParams
    const siteId = params.get('siteId') ?? ''
    const q = params.get('q') ?? params.get('search') ?? undefined
    const kind = params.get('kind') ?? undefined
    const mimeType = params.get('mimeType') ?? undefined
    const usage = params.get('usage') ?? undefined
    const retentionMode = params.get('retentionMode') ?? undefined
    const media = await listScopedMediaLibrary(payload, auth.user as never, {
      siteId,
      q,
      kind,
      mimeType,
      usage,
      retentionMode,
    })
    return NextResponse.json({ media, docs: media })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Media library unavailable.' },
      { status },
    )
  }
}
