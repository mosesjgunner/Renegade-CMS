import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { loadConfig } from '@/modules/core/config'
import { createUploadSession } from '@/modules/media/upload-sessions'
import { MediaWorkflowError } from '@/modules/media/workflow'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const session = await createUploadSession(payload, loadConfig(), {
      user: auth.user as never,
      scope: {
        kind: String(body.scopeKind ?? 'site') as 'site',
        siteId: String(body.siteId ?? ''),
        publicationId: String(body.publicationId ?? '') || null,
        spaceId: String(body.spaceId ?? '') || null,
      },
      filename: String(body.filename ?? ''),
      title: typeof body.title === 'string' ? body.title : undefined,
      altText: typeof body.altText === 'string' ? body.altText : undefined,
      caption: typeof body.caption === 'string' ? body.caption : undefined,
      size: Number(body.size),
      checksum: typeof body.checksum === 'string' ? body.checksum : undefined,
    })
    return NextResponse.json(
      {
        session: {
          id: session.id,
          chunkSize: session.chunkSize,
          expiresAt: session.expiresAt,
          state: session.state,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to start upload.' },
      { status },
    )
  }
}
