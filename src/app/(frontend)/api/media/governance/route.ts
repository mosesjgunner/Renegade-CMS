import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  assertMediaPermission,
  mediaGovernanceDashboard,
  MediaWorkflowError,
} from '@/modules/media/workflow'

export const runtime = 'nodejs'

/** Staff-only issue queue. It returns IDs only, never hidden asset metadata. */
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
    return NextResponse.json({ dashboard: await mediaGovernanceDashboard(payload, siteId) })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Media governance unavailable.' },
      { status },
    )
  }
}
