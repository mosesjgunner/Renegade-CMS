/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import { createSession } from '@/modules/podcast-studio/session-engine'
import {
  buildExampleSession,
  createStudioSessionRecord,
  listStudioSessionRecords,
} from '@/modules/podcast-studio/sessions'
import {
  privateJson,
  readJson,
  recordView,
  showContext,
  studioSessionErrorResponse,
} from './shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-05 studio sessions for a show.
 *
 * GET  ?showId= — the show's saved studio sessions (staff + operator
 *      site grant on the show's site).
 * POST { showId, title?, starter?: 'blank' | 'example' } — create a
 *      session: a blank desk, or the Example Show starter session
 *      (rundown + cart deck + export-profile placeholder).
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const showId = new URL(request.url).searchParams.get('showId') ?? ''
  const context = await showContext(payload, request, showId)
  if ('error' in context) return context.error
  const records = await listStudioSessionRecords(payload as never, showId)
  return privateJson({ sessions: records.map(recordView) })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const showId = typeof body.showId === 'string' ? body.showId : ''
  const context = await showContext(payload, request, showId)
  if ('error' in context) return context.error
  try {
    const showTitle = String(context.show.title ?? 'Untitled show')
    const session =
      body.starter === 'example'
        ? buildExampleSession(showId, showTitle)
        : createSession({ showId, showTitle })
    const record = await createStudioSessionRecord(payload as never, {
      siteId: context.siteId,
      showId,
      title: typeof body.title === 'string' && body.title ? body.title : showTitle,
      session,
    })
    return privateJson(recordView(record), 201)
  } catch (error) {
    return studioSessionErrorResponse(error)
  }
}
