import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { revokeToken } from '@/modules/podcast-studio/member-feeds'
import {
  authorizeManagement,
  csrfSatisfied,
  privateJson,
  resolveActor,
  resolveShow,
} from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-03: revoke a member's feed token for a show. Effective
 * immediately: the token feed and every token-scoped enclosure URL
 * for that member+show stop working on the next request.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const actor = await resolveActor(payload, request)
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  if (!csrfSatisfied(actor, request))
    return NextResponse.json({ error: 'CSRF validation failed.' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const show = await resolveShow(payload, body)
  if (!show) return NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 })
  const targetMemberId =
    typeof body.memberId === 'string'
      ? body.memberId
      : actor.kind === 'member'
        ? actor.memberId
        : ''
  if (!targetMemberId) return NextResponse.json({ error: 'memberId is required.' }, { status: 400 })
  const denied = await authorizeManagement(payload, actor, show, targetMemberId)
  if (denied) return denied

  const result = await revokeToken(payload as never, {
    memberId: targetMemberId,
    showId: String(show.id),
  })
  return privateJson({ revoked: result.revoked, memberId: targetMemberId, showId: String(show.id) })
}
