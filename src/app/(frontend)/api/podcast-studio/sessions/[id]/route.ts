/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import { validateSessionDoc, type StudioSessionDoc } from '@/modules/podcast-studio/session-engine'
import {
  applySessionOperationToRecord,
  deleteStudioSessionRecord,
  saveStudioSessionRecord,
  type SessionOperation,
} from '@/modules/podcast-studio/sessions'
import {
  privateJson,
  readJson,
  recordView,
  sessionContext,
  studioSessionErrorResponse,
} from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POD-05 one studio session.
 *
 * GET    — the saved session document (reload: deep-equal to what was
 *          saved; reopening in the UI applies the engine's restore,
 *          which never auto-plays).
 * PATCH  — either a state operation `{ op: 'start-segment', itemId }`
 *          (see session-engine / sessions.ts for the op set — POD-21
 *          added `drop-marker`, `recording-start` and `recording-stop`,
 *          the POD-09 recording-state ops the POD-15 workspace handlers
 *          dispatch; engine
 *          rejections such as an unarmed fire return 200 with
 *          `ok: false` and the rejection in the session log), a
 *          `{ op: 'export-opml', targetText?, force? }` export
 *          (409 with `conflict` when the OPML guard refuses), or a
 *          full-document save `{ session: <StudioSession doc> }`
 *          validated through the POD-00 parser.
 * DELETE — removes the session record.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { id } = await params
  const context = await sessionContext(payload, request, id)
  if ('error' in context) return context.error
  return privateJson(recordView(context.record))
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { id } = await params
  const context = await sessionContext(payload, request, id)
  if ('error' in context) return context.error
  const body = await readJson(request)
  try {
    if (body.session && typeof body.session === 'object') {
      const doc = validateSessionDoc(body.session as StudioSessionDoc)
      if (doc.showId !== context.record.showId) {
        return privateJson(
          {
            error: 'Session document belongs to a different show.',
            code: 'PODCAST_STUDIO_SHOW_MISMATCH',
          },
          409,
        )
      }
      const saved = await saveStudioSessionRecord(payload as never, id, doc)
      return privateJson({ ok: true, ...recordView(saved) })
    }
    if (typeof body.op !== 'string') {
      return privateJson({ error: 'PATCH requires an `op` or a `session` document.' }, 400)
    }
    const { record, applied } = await applySessionOperationToRecord(
      payload as never,
      id,
      body as unknown as SessionOperation,
    )
    if (applied.conflict) {
      return privateJson(
        { ok: false, error: 'opml-conflict', conflict: applied.conflict, ...recordView(record) },
        409,
      )
    }
    return privateJson({
      ok: applied.ok,
      ...(applied.error ? { error: applied.error } : {}),
      ...(applied.opml ? { opml: applied.opml } : {}),
      ...(applied.marker ? { marker: applied.marker } : {}),
      ...(applied.recordingState !== undefined ? { recordingState: applied.recordingState } : {}),
      ...recordView(record),
    })
  } catch (error) {
    return studioSessionErrorResponse(error)
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { id } = await params
  const context = await sessionContext(payload, request, id)
  if ('error' in context) return context.error
  try {
    await deleteStudioSessionRecord(payload as never, id)
    return privateJson({ ok: true, id })
  } catch (error) {
    return studioSessionErrorResponse(error)
  }
}
