/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import { publishEpisode } from '@/modules/podcast-studio/production'
import { episodeContext, privateJson, productionErrorResponse, readJson } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-04 (POD-REQ-37) publish path: POST { episodeId } runs the
 * guarded publish — state machine + recorded approval + audio — and
 * returns the published episode. A missing approval answers 409 with
 * code PODCAST_APPROVAL_REQUIRED.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId : ''
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  try {
    const episode = await publishEpisode(payload as never, episodeId, {
      by: String(context.user.id),
    })
    return privateJson({
      id: String(episode.id),
      guid: episode.guid,
      productionState: episode.productionState,
      status: episode.status,
      publishedAt: episode.publishedAt ?? null,
    })
  } catch (error) {
    return productionErrorResponse(error)
  }
}
