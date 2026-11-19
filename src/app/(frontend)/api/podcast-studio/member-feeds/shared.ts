/* eslint-disable @typescript-eslint/no-explicit-any -- Payload documents are runtime-shaped at this read boundary. */
import { NextResponse } from 'next/server'
import type { Payload } from 'payload'

import { currentMember, readMemberSession, verifyCsrf } from '@/modules/identity/member-identity'
import { checkOperatorSiteAccess } from '@/modules/operations/operator-grants'
import { memberHasPodcastEntitlement } from '@/modules/podcast-studio/member-feeds'

export const relationId = (value: unknown): string =>
  typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id ?? '')

export type MemberFeedActor = { kind: 'member'; memberId: string } | { kind: 'staff'; user: any }

/**
 * Two authenticated principals may manage feed tokens:
 * - a member (member-session cookie) managing ONLY their own token;
 * - staff (Payload user with an operator grant on the show's site)
 *   managing tokens for members of shows on their sites.
 */
export async function resolveActor(
  payload: Payload,
  request: Request,
): Promise<MemberFeedActor | null> {
  const memberId = await currentMember(payload as never, readMemberSession(request.headers)).catch(
    () => null,
  )
  if (memberId) return { kind: 'member', memberId }
  const auth = await payload.auth({ headers: request.headers }).catch(() => ({ user: null }))
  if (auth.user && ['owner', 'administrator', 'staff'].includes(String((auth.user as any).role))) {
    return { kind: 'staff', user: auth.user }
  }
  return null
}

/** Member-session mutations use the member CSRF double-submit; staff use Payload's own session. */
export function csrfSatisfied(actor: MemberFeedActor, request: Request): boolean {
  return actor.kind === 'staff' || verifyCsrf(request.headers)
}

export async function resolveShow(payload: Payload, body: Record<string, unknown>): Promise<any> {
  const showId = typeof body.showId === 'string' ? body.showId : ''
  const showSlug = typeof body.showSlug === 'string' ? body.showSlug : ''
  if (!showId && !showSlug) return null
  if (showId) {
    return payload
      .findByID({
        collection: 'podcast-shows',
        id: showId,
        depth: 0,
        overrideAccess: true,
      } as never)
      .catch(() => null)
  }
  const found = await payload.find({
    collection: 'podcast-shows',
    where: { slug: { equals: showSlug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  return (found.docs[0] as any) ?? null
}

/**
 * Authorizes `actor` to manage tokens for `targetMemberId` on `show`.
 * Returns an error response, or null when authorized.
 */
export async function authorizeManagement(
  payload: Payload,
  actor: MemberFeedActor,
  show: any,
  targetMemberId: string,
): Promise<NextResponse | null> {
  if (actor.kind === 'member') {
    if (actor.memberId !== targetMemberId)
      return NextResponse.json(
        { error: 'Members can only manage their own feed token.' },
        { status: 403 },
      )
    return null
  }
  const siteId = relationId(show.site)
  const allowed = await checkOperatorSiteAccess(payload, actor.user, siteId)
  if (!allowed) return NextResponse.json({ error: 'Insufficient site authority.' }, { status: 403 })
  return null
}

/** A members show's token is only issued to a member who currently holds its entitlement. */
export async function entitlementGate(
  payload: Payload,
  show: any,
  targetMemberId: string,
): Promise<NextResponse | null> {
  if (show.feedVisibility !== 'members') return null
  const entitled = await memberHasPodcastEntitlement(payload as never, show, targetMemberId)
  if (!entitled)
    return NextResponse.json(
      { error: 'No active entitlement for this show.' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
    )
  return null
}

export const privateJson = (body: unknown, status = 200) =>
  NextResponse.json(body as any, { status, headers: { 'Cache-Control': 'private, no-store' } })
