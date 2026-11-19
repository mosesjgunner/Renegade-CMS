/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import {
  createProjectFromRecording,
  listEditProjectRecords,
  listRecordingsForShow,
} from '@/modules/podcast-studio/edit/projects-service'
import { editProjectErrorResponse, privateJson, projectView, readJson, showContext } from './shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-12 edit projects for a show.
 *
 * GET  ?showId=                — the show's saved edit projects.
 * GET  ?showId=&view=recordings — the show's POD-09 recordings an edit
 *      project can be created from.
 * POST { showId, recordingId, title? } — create a project from a
 *      finalized recording (lanes from the track manifest, markers +
 *      played-clip log imported, chapters/transcript seeded from the
 *      bound episode when present).
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const showId = url.searchParams.get('showId') ?? ''
  const context = await showContext(payload, request, showId)
  if ('error' in context) return context.error
  if (url.searchParams.get('view') === 'recordings') {
    const recordings = await listRecordingsForShow(payload as never, showId)
    return privateJson({ recordings })
  }
  const records = await listEditProjectRecords(payload as never, showId)
  return privateJson({ projects: records.map(projectView) })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const showId = typeof body.showId === 'string' ? body.showId : ''
  const context = await showContext(payload, request, showId)
  if ('error' in context) return context.error
  try {
    const recordingId = typeof body.recordingId === 'string' ? body.recordingId : ''
    if (!recordingId) return privateJson({ error: 'recordingId is required.' }, 400)
    const record = await createProjectFromRecording(payload as never, {
      siteId: context.siteId,
      showId,
      recordingId,
      title: typeof body.title === 'string' && body.title ? body.title : undefined,
    })
    return privateJson(projectView(record), 201)
  } catch (error) {
    return editProjectErrorResponse(error)
  }
}
