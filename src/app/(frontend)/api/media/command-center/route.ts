import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { loadConfig } from '@/modules/core/config'
import {
  executeCommandCenterAction,
  getMediaCommandCenterOverview,
} from '@/modules/media/command-center'
import { assertMediaPermission, MediaWorkflowError } from '@/modules/media/workflow'

export const runtime = 'nodejs'

/** Staff-only unified Media Command Center endpoint. Never leaks secrets or private paths. */
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
    const appConfig = loadConfig()
    const overview = await getMediaCommandCenterOverview(payload, appConfig, siteId)
    return NextResponse.json({ overview })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Media Command Center unavailable.' },
      { status },
    )
  }
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const siteId = String(body.siteId ?? '')
    const action = String(body.action ?? '')
    const appConfig = loadConfig()

    const result = await executeCommandCenterAction(
      payload,
      appConfig,
      auth.user as never,
      siteId,
      action,
      body,
    )
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const status = error instanceof MediaWorkflowError ? error.status : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Command center action failed.' },
      { status },
    )
  }
}
