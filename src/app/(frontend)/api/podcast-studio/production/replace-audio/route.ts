/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'

import { replaceEpisodeAudio } from '@/modules/podcast-studio/production'
import { episodeContext, privateJson, productionErrorResponse, readJson } from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-04 (POD-REQ-37): POST { episodeId, mediaAssetId } swaps the
 * episode's audio. The GUID never changes; the enclosure byte count
 * and MIME type are refreshed from the new asset.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId : ''
  const mediaAssetId = typeof body.mediaAssetId === 'string' ? body.mediaAssetId : ''
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  try {
    const episode = await replaceEpisodeAudio(payload as never, episodeId, mediaAssetId)
    return privateJson({
      id: String(episode.id),
      guid: episode.guid,
      enclosureBytes: episode.enclosureBytes ?? null,
      enclosureMimeType: episode.enclosureMimeType ?? null,
    })
  } catch (error) {
    return productionErrorResponse(error)
  }
}
