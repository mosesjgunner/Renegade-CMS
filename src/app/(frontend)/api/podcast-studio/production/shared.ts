/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import { NextResponse } from 'next/server'
import type { Payload } from 'payload'

import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'
import { PodcastProductionError } from '@/modules/podcast-studio/production'

export const relationId = (value: unknown): string =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id ?? '')

export const privateJson = (body: unknown, status = 200) =>
  NextResponse.json(body as any, { status, headers: { 'Cache-Control': 'private, no-store' } })

/** Staff = a Payload user with an owner/administrator/staff role (member sessions do not manage production). */
export async function resolveStaff(payload: Payload, request: Request): Promise<any | null> {
  const auth = await payload.auth({ headers: request.headers }).catch(() => ({ user: null }))
  if (auth.user && ['owner', 'administrator', 'staff'].includes(String((auth.user as any).role))) {
    return auth.user
  }
  return null
}

export async function requireSiteAccess(
  payload: Payload,
  user: any,
  siteId: string,
): Promise<NextResponse | null> {
  if (!siteId) return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
  const allowed = await checkOperatorSiteAccess(payload, user, siteId)
  if (!allowed) return NextResponse.json({ error: 'Insufficient site authority.' }, { status: 403 })
  return null
}

export async function loadEpisode(payload: Payload, episodeId: string): Promise<any | null> {
  if (!episodeId) return null
  return payload
    .findByID({
      collection: 'podcast-episodes',
      id: episodeId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
}

export async function loadShow(payload: Payload, showId: string): Promise<any | null> {
  if (!showId) return null
  return payload
    .findByID({ collection: 'podcast-shows', id: showId, depth: 0, overrideAccess: true } as never)
    .catch(() => null)
}

/** Maps production-module errors to responses: named guard failures are 409s with their code. */
export function productionErrorResponse(error: unknown): NextResponse {
  if (error instanceof PodcastProductionError) {
    const status = error.code.endsWith('_NOT_FOUND') ? 404 : 409
    return privateJson({ error: error.message, code: error.code }, status)
  }
  return privateJson(
    { error: error instanceof Error ? error.message : 'Production request failed.' },
    500,
  )
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>
}

/**
 * Shared preamble for episode-scoped staff actions: authenticate,
 * load the episode, and check the operator grant on its site.
 * Returns either `{ error }` (a response to return) or the context.
 */
export async function episodeContext(
  payload: Payload,
  request: Request,
  episodeId: string,
): Promise<{ error: NextResponse } | { user: any; episode: any }> {
  const user = await resolveStaff(payload, request)
  if (!user)
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  const episode = await loadEpisode(payload, episodeId)
  if (!episode)
    return { error: NextResponse.json({ error: 'Podcast episode not found.' }, { status: 404 }) }
  const denied = await requireSiteAccess(payload, user, relationId(episode.site))
  if (denied) return { error: denied }
  return { user, episode }
}
