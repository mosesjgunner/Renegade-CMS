/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'

import { loadConfig } from '@/modules/core/config'
import {
  issueToken,
  memberFeedPath,
  PODCAST_FEED_TOKEN_COLLECTION,
} from '@/modules/podcast-studio/member-feeds'
import {
  authorizeManagement,
  csrfSatisfied,
  entitlementGate,
  privateJson,
  relationId,
  resolveActor,
  resolveShow,
} from './shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POD-03 member-feed token management.
 *
 * GET  — list the caller's token metadata for a show (`?showId=` or
 *        `?showSlug=`; staff may pass `memberId`). Metadata only:
 *        never the token, never its hash.
 * POST — issue a token `{ showId|showSlug, memberId? }`. The raw token
 *        is returned ONCE in this response (with the ready-to-paste
 *        feed URL); only its SHA-256 is stored. Issuing replaces any
 *        active token for the same member+show.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const actor = await resolveActor(payload, request)
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const url = new URL(request.url)
  const show = await resolveShow(payload, {
    showId: url.searchParams.get('showId') ?? undefined,
    showSlug: url.searchParams.get('showSlug') ?? undefined,
  })
  if (!show) return NextResponse.json({ error: 'Podcast show not found.' }, { status: 404 })
  const targetMemberId =
    actor.kind === 'member' ? actor.memberId : (url.searchParams.get('memberId') ?? '')
  if (!targetMemberId) return NextResponse.json({ error: 'memberId is required.' }, { status: 400 })
  const denied = await authorizeManagement(payload, actor, show, targetMemberId)
  if (denied) return denied

  const result = await payload.find({
    collection: PODCAST_FEED_TOKEN_COLLECTION as never,
    where: {
      and: [{ member: { equals: targetMemberId } }, { show: { equals: String(show.id) } }],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  } as never)
  const tokens = (result.docs as any[]).map((doc) => ({
    id: String(doc.id),
    memberId: relationId(doc.member),
    showId: relationId(doc.show),
    active: !doc.revokedAt,
    createdAt: doc.createdAt ?? null,
    revokedAt: doc.revokedAt ?? null,
    lastUsedAt: doc.lastUsedAt ?? null,
  }))
  return privateJson({ tokens })
}

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

  const issued = await issueToken(payload as never, {
    memberId: targetMemberId,
    showId: String(show.id),
  })
  const feedUrl = new URL(
    memberFeedPath(String(show.slug), issued.token),
    loadConfig().appUrl,
  ).toString()
  // The raw token appears exactly here, once. It is never stored or logged.
  return privateJson({
    token: issued.token,
    feedUrl,
    memberId: issued.memberId,
    showId: issued.showId,
    createdAt: issued.createdAt,
  })
}
