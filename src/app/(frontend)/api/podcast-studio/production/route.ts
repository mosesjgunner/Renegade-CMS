/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import {
  isProductionState,
  productionBoard,
  transitionProductionState,
} from '@/modules/podcast-studio/production'
import {
  episodeContext,
  loadShow,
  privateJson,
  productionErrorResponse,
  readJson,
  relationId,
  requireSiteAccess,
  resolveStaff,
} from './shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-04 production board + state transitions.
 *
 * GET  ?showId= — the board: the show's episodes grouped by
 *      productionState with per-state counts.
 * POST { episodeId, to } — one guarded state-machine transition
 *      (publish targets run the full POD-REQ-37 guards; the dedicated
 *      /publish route is the named publish path).
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const user = await resolveStaff(payload, request)
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const url = new URL(request.url)
  const show = await loadShow(payload, url.searchParams.get('showId') ?? '')
  if (!show) return NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 })
  const denied = await requireSiteAccess(payload, user, relationId(show.site))
  if (denied) return denied
  const board = await productionBoard(payload as never, String(show.id))
  return privateJson({
    showId: board.showId,
    counts: board.counts,
    byState: Object.fromEntries(
      Object.entries(board.byState).map(([state, episodes]) => [
        state,
        episodes.map((episode: any) => ({
          id: String(episode.id),
          title: episode.title,
          slug: episode.slug,
          status: episode.status,
          productionState: episode.productionState,
          publishedAt: episode.publishedAt ?? null,
        })),
      ]),
    ),
  })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const body = await readJson(request)
  const episodeId = typeof body.episodeId === 'string' ? body.episodeId : ''
  const to = typeof body.to === 'string' ? body.to : ''
  if (!isProductionState(to)) {
    return privateJson({ error: `Unknown production state "${to}".` }, 400)
  }
  const context = await episodeContext(payload, request, episodeId)
  if ('error' in context) return context.error
  try {
    const episode = await transitionProductionState(payload as never, episodeId, to, {
      by: String(context.user.id),
    })
    return privateJson({
      id: String(episode.id),
      productionState: episode.productionState,
      status: episode.status,
      publishedAt: episode.publishedAt ?? null,
    })
  } catch (error) {
    return productionErrorResponse(error)
  }
}
