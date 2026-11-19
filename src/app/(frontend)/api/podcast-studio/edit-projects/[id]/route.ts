/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import type { EditEdl } from '@/modules/podcast-studio/edit/edl-engine'
import {
  loadEditProjectView,
  restoreEditProjectVersion,
  saveEditProjectEdl,
} from '@/modules/podcast-studio/edit/projects-service'
import {
  editProjectErrorResponse,
  privateJson,
  projectContext,
  projectView,
  readJson,
} from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POD-12 one edit project.
 *
 * GET   — the project plus the POD-08 server peaks for every source
 *         asset (the editor draws lanes from peaks; it never decodes
 *         full tracks client-side) and the current EDL hash.
 * PATCH — autosave `{ edl, label? }`: the full EDL after the editor's
 *         pure ops; validated through the POD-00 parser on save and
 *         appended to the project's bounded version history.
 * POST  — `{ restoreVersion: n }`: restore a saved version as current
 *         (the restore itself becomes a new version).
 */
export async function GET(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { id } = await params
  const context = await projectContext(payload, request, id)
  if ('error' in context) return context.error
  const view = await loadEditProjectView(payload as never, id)
  if (!view) return privateJson({ error: 'Edit project not found.' }, 404)
  return privateJson({
    ...projectView(view.record),
    peaksByAssetId: view.peaksByAssetId,
    edlHash: view.edlHash,
  })
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { id } = await params
  const context = await projectContext(payload, request, id)
  if ('error' in context) return context.error
  const body = await readJson(request)
  try {
    if (!body.edl || typeof body.edl !== 'object')
      return privateJson({ error: 'An edl document is required.' }, 400)
    const record = await saveEditProjectEdl(
      payload as never,
      id,
      body.edl as EditEdl,
      typeof body.label === 'string' && body.label ? body.label : 'Autosave',
    )
    return privateJson(projectView(record))
  } catch (error) {
    return editProjectErrorResponse(error)
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { id } = await params
  const context = await projectContext(payload, request, id)
  if ('error' in context) return context.error
  const body = await readJson(request)
  try {
    if (typeof body.restoreVersion !== 'number')
      return privateJson({ error: 'restoreVersion (number) is required.' }, 400)
    const record = await restoreEditProjectVersion(payload as never, id, body.restoreVersion)
    return privateJson(projectView(record))
  } catch (error) {
    return editProjectErrorResponse(error)
  }
}
