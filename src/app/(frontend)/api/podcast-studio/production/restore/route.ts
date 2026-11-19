/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import { restoreEpisode } from '@/modules/podcast-studio/production'
import { episodeContext, privateJson, productionErrorResponse, readJson } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-04 (POD-REQ-37): POST { episodeId } restores a withdrawn
 * episode to published with its original GUID and publishedAt, so
 * subscribers see continuity rather than a new item.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId : ''
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  try {
    const episode = await restoreEpisode(payload as never, episodeId, {
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
