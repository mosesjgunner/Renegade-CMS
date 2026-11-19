/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { loadConfig } from '@/modules/core/config'
import { memberFeedPath, rotateToken } from '@/modules/podcast-studio/member-feeds'
import {
  authorizeManagement,
  csrfSatisfied,
  entitlementGate,
  privateJson,
  resolveActor,
  resolveShow,
} from '../shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-03: rotate a member's feed token for a show. The old token is
 * revoked in the same operation — every old feed/enclosure URL stops
 * working immediately — and the new raw token is returned once here.
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
  const gate = await entitlementGate(payload, show, targetMemberId)
  if (gate) return gate

  const issued = await rotateToken(payload as never, {
    memberId: targetMemberId,
    showId: String(show.id),
  })
  const feedUrl = new URL(
    memberFeedPath(String(show.slug), issued.token),
    loadConfig().appUrl,
  ).toString()
  return privateJson({
    token: issued.token,
    feedUrl,
    memberId: issued.memberId,
    showId: issued.showId,
    createdAt: issued.createdAt,
  })
}
