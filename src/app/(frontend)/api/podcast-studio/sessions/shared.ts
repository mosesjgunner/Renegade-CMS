/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import { NextResponse } from 'next/server'
import type { Payload } from 'payload'

import {
  PodcastStudioSessionError,
  loadStudioSessionRecord,
  type StudioSessionRecord,
} from '@/modules/podcast-studio/sessions'
import {
  loadShow,
  privateJson,
  relationId,
  requireSiteAccess,
  resolveStaff,
} from '../production/shared'

export { privateJson, readJson } from '../production/shared'

/** Maps studio-session errors to responses: not-found is 404, other named failures 409. */
export function studioSessionErrorResponse(error: unknown): NextResponse {
  if (error instanceof PodcastStudioSessionError) {
    const status = error.code.endsWith('_NOT_FOUND') ? 404 : 409
    return privateJson({ error: error.message, code: error.code }, status)
  }
  return privateJson(
    { error: error instanceof Error ? error.message : 'Studio session request failed.' },
    500,
  )
}

/**
 * Shared preamble for show-scoped studio calls: authenticate staff,
 * load the show, and check the operator grant on the show's site.
 */
export async function showContext(
  payload: Payload,
  request: Request,
  showId: string,
): Promise<{ error: NextResponse } | { user: any; show: any; siteId: string }> {
  const user = await resolveStaff(payload, request)
  if (!user)
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  const show = await loadShow(payload, showId)
  if (!show)
    return { error: NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 }) }
  const siteId = relationId(show.site)
  const denied = await requireSiteAccess(payload, user, siteId)
  if (denied) return { error: denied }
  return { user, show, siteId }
}

/**
 * Shared preamble for session-record-scoped studio calls:
 * authenticate staff, load the record, and check the operator grant
 * on the owning show's site (site-scope is enforced against the
 * show, never against a caller-supplied site id).
 */
export async function sessionContext(
  payload: Payload,
  request: Request,
  sessionRecordId: string,
): Promise<{ error: NextResponse } | { user: any; record: StudioSessionRecord }> {
  const user = await resolveStaff(payload, request)
  if (!user)
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  const record = await loadStudioSessionRecord(payload as never, sessionRecordId)
  if (!record)
    return { error: NextResponse.json({ error: 'Studio session not found.' }, { status: 404 }) }
  const show = await loadShow(payload, record.showId)
  if (!show)
    return { error: NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 }) }
  const denied = await requireSiteAccess(payload, user, relationId(show.site))
  if (denied) return { error: denied }
  return { user, record }
}

/** The wire shape for a session record: row metadata + the full session document. */
export const recordView = (record: StudioSessionRecord) => ({
  id: record.id,
  siteId: record.siteId,
  showId: record.showId,
  title: record.title,
  state: record.state,
  schemaVersion: record.schemaVersion,
  startedAt: record.startedAt,
  lastSavedAt: record.lastSavedAt,
  session: record.session,
})
