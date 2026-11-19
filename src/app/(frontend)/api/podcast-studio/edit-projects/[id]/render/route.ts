/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import { edlHash, editDurationSec } from '@/modules/podcast-studio/edit/edl-engine'
import { PodcastRenderError } from '@/modules/podcast-studio/render/render'
import {
  queuePodcastRenderTask,
  renderProject,
} from '@/modules/podcast-studio/render/render-service'
import { PodcastEditProjectError } from '@/modules/podcast-studio/edit/projects-service'
import { editProjectErrorResponse, privateJson, projectContext, readJson } from '../../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POD-13 render surface for one edit project.
 *
 * GET  — the project's render records (newest first) with their
 *        reports and registered outputs.
 * POST — `{ profile: 'preview', range? }` renders an excerpt INLINE
 *        through the same ffmpeg graph as the master (selection or
 *        the first 15 s) and returns the render record + report +
 *        the excerpt's media asset id. `{ profile: 'master' | 'clip'
 *        | 'audiogram', range? }` queues the `podcast-render` task
 *        (deduplicated by the render idempotency key) and returns
 *        the job id. Staff auth + operator site grant come from the
 *        POD-12 project context, exactly like the other project
 *        routes.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { id } = await params
  const context = await projectContext(payload, request, id)
  if ('error' in context) return context.error
  const renders = await payload.find({
    collection: 'podcast-renders' as never,
    where: { project: { equals: id } },
    sort: '-createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  } as never)
  return privateJson({ renders: (renders as any).docs })
}

export async function POST(request: Request, { params }: RouteContext) {
  const payload = await getPayload({ config })
  const { id } = await params
  const context = await projectContext(payload, request, id)
  if ('error' in context) return context.error
  const body = await readJson(request)
  const profile = typeof body.profile === 'string' ? body.profile : 'master'
  const range =
    body.range && typeof body.range === 'object'
      ? {
          startSec: Number((body.range as any).startSec ?? 0),
          durationSec: Number((body.range as any).durationSec ?? 0),
        }
      : undefined
  if (range && !(range.durationSec > 0))
    return privateJson({ error: 'range.durationSec must be positive.' }, 400)
  try {
    if (profile === 'preview') {
      const duration = editDurationSec(context.record.project.edl)
      const excerptRange = range ?? { startSec: 0, durationSec: Math.min(15, duration) }
      const result = await renderProject(payload as never, undefined, {
        projectId: id,
        profile: 'preview',
        range: excerptRange,
        attachToEpisode: false,
      })
      return privateJson({
        renderId: result.renderId,
        state: result.state,
        deduplicated: result.deduplicated,
        outputs: result.outputs,
        report: result.report,
      })
    }
    if (profile !== 'master' && profile !== 'clip' && profile !== 'audiogram')
      return privateJson({ error: `Unknown render profile "${profile}".` }, 400)
    const queued = await queuePodcastRenderTask(payload as never, {
      projectId: id,
      edlHash: edlHash(context.record.project.edl),
      profile,
      range,
    })
    return privateJson({
      jobId: queued.id,
      queued: queued.queued,
      idempotencyKey: queued.idempotencyKey,
    })
  } catch (error) {
    if (error instanceof PodcastRenderError)
      return privateJson({ error: error.message, code: error.code }, 409)
    if (error instanceof PodcastEditProjectError) return editProjectErrorResponse(error)
    return privateJson(
      { error: error instanceof Error ? error.message : 'Render request failed.' },
      500,
    )
  }
}
