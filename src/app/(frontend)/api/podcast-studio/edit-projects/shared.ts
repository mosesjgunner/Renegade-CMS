/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import { NextResponse } from 'next/server'
import type { Payload } from 'payload'

import {
  PodcastEditProjectError,
  loadEditProjectRecord,
  type EditProjectRecord,
} from '@/modules/podcast-studio/edit/projects-service'
import {
  loadShow,
  privateJson,
  relationId,
  requireSiteAccess,
  resolveStaff,
} from '../production/shared'

export { privateJson, readJson } from '../production/shared'
export { showContext } from '../sessions/shared'

/** Maps edit-project errors to responses: not-found is 404, other named failures 409. */
export function editProjectErrorResponse(error: unknown): NextResponse {
  if (error instanceof PodcastEditProjectError) {
    const status = error.code.endsWith('_NOT_FOUND') ? 404 : 409
    return privateJson({ error: error.message, code: error.code }, status)
  }
  return privateJson(
    { error: error instanceof Error ? error.message : 'Edit project request failed.' },
    500,
  )
}

/**
 * Shared preamble for project-scoped studio calls: authenticate staff,
 * load the project, and check the operator grant on the owning show's
 * site (site-scope enforced against the show, never a caller-supplied
 * site id — same rule as the POD-05 session context).
 */
export async function projectContext(
  payload: Payload,
  request: Request,
  projectId: string,
): Promise<{ error: NextResponse } | { user: any; record: EditProjectRecord }> {
  const user = await resolveStaff(payload, request)
  if (!user)
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  const record = await loadEditProjectRecord(payload as never, projectId)
  if (!record)
    return { error: NextResponse.json({ error: 'Edit project not found.' }, { status: 404 }) }
  const show = await loadShow(payload, record.showId)
  if (!show)
    return { error: NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 }) }
  const denied = await requireSiteAccess(payload, user, relationId(show.site))
  if (denied) return { error: denied }
  return { user, record }
}

/** The wire shape for a project record: row metadata + the full project document. */
export const projectView = (record: EditProjectRecord) => ({
  id: record.id,
  siteId: record.siteId,
  showId: record.showId,
  title: record.title,
  schemaVersion: record.schemaVersion,
  lastSavedAt: record.lastSavedAt,
  project: record.project,
})
