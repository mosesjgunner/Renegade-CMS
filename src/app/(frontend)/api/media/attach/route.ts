import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { MediaWorkflowError, attachMediaToContent } from '@/modules/media/workflow'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const body = (await request.json()) as Record<string, string>
    const content = await attachMediaToContent(payload, auth.user as never, {
      mediaId: body.mediaId,
      contentId: body.contentId,
      scope: { kind: 'site', siteId: body.siteId },
    })
    return NextResponse.json({ content })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Attachment failed.' },
      { status },
    )
  }
}
