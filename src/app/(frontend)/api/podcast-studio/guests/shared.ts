/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import { NextResponse } from 'next/server'
import type { Payload } from 'payload'

import { PodcastGuestConsentError } from '@/modules/podcast-studio/production'
import { PodcastGuestError } from '@/modules/podcast-studio/guests/service'
import { loadStudioSessionRecord } from '@/modules/podcast-studio/sessions'
import { privateJson, requireSiteAccess, resolveStaff } from '../production/shared'

export { privateJson, requireSiteAccess, resolveStaff }

/** Guest credential transport: `Authorization: Bearer <token>` or `x-guest-token`. */
export function guestCredential(request: Request): string {
  const auth = request.headers.get('authorization') ?? ''
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return request.headers.get('x-guest-token') ?? ''
}

export function guestErrorResponse(error: unknown): NextResponse {
  if (error instanceof PodcastGuestConsentError) {
    return privateJson({ error: error.message, code: error.code }, 403)
  }
  if (error instanceof PodcastGuestError) {
    const status =
      error.code === 'invite-not-found' || error.code === 'session-not-found'
        ? 404
        : error.code.startsWith('invite-')
          ? 401
          : error.code === 'signal-pre-admission' ||
              error.code === 'clip-not-admitted' ||
              error.code === 'chunk-not-admitted'
            ? 403
            : 409
    return privateJson({ error: error.message, code: error.code }, status)
  }
  return privateJson(
    { error: error instanceof Error ? error.message : 'Guest request failed.' },
    500,
  )
}

/**
 * Staff preamble for invite-scoped actions: authenticate staff, load
 * the invite's session record, and check the operator grant on its
 * site. A guest token is NOT staff auth — presenting one here yields
 * 401 (proven in the POD-10 integration tests).
 */
export async function staffInviteContext(
  payload: Payload,
  request: Request,
  inviteId: string,
): Promise<{ error: NextResponse } | { user: any; invite: any }> {
  const user = await resolveStaff(payload, request)
  if (!user)
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  const invite = await payload
    .findByID({
      collection: 'podcast-guest-invites',
      id: inviteId,
      depth: 0,
      overrideAccess: true,
    } as never)
    .catch(() => null)
  if (!invite)
    return { error: NextResponse.json({ error: 'Guest invite not found.' }, { status: 404 }) }
  const sessionId =
    typeof (invite as any).session === 'string'
      ? (invite as any).session
      : String((invite as any).session?.id ?? '')
  const record = await loadStudioSessionRecord(payload as never, sessionId)
  if (!record)
    return { error: NextResponse.json({ error: 'Studio session not found.' }, { status: 404 }) }
  const denied = await requireSiteAccess(payload, user, record.siteId)
  if (denied) return { error: denied }
  return { user, invite }
}

/** Staff preamble for session-scoped actions (issue/list). */
export async function staffSessionContext(
  payload: Payload,
  request: Request,
  sessionRecordId: string,
): Promise<{ error: NextResponse } | { user: any }> {
  const user = await resolveStaff(payload, request)
  if (!user)
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  const record = await loadStudioSessionRecord(payload as never, sessionRecordId)
  if (!record)
    return { error: NextResponse.json({ error: 'Studio session not found.' }, { status: 404 }) }
  const denied = await requireSiteAccess(payload, user, record.siteId)
  if (denied) return { error: denied }
  return { user }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>
}
