/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { resolveOperatorGrantContext } from '../operations/operator-grants'

/**
 * Shared authorization for the /api/admin/earn routes: the caller
 * must hold an operator grant, and a site id is only usable when the
 * grant covers it (global owners excepted). Mirrors the
 * /api/admin/commerce pattern exactly.
 */
export async function earnAuth(
  payload: any,
  request: Request,
): Promise<{ ok: true; grant: any; user: any } | { ok: false; response: NextResponse }> {
  const auth = await payload.auth({ headers: request.headers })
  const grant = await resolveOperatorGrantContext(payload, auth?.user)
  if (!grant.authorized)
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized.' }, { status: 403 }) }
  return { ok: true, grant, user: auth?.user }
}

export function requireSite(grant: any, siteId: string | null): NextResponse | null {
  if (!siteId) return NextResponse.json({ error: 'siteId is required.' }, { status: 400 })
  if (!grant.isGlobalOwner && !grant.authorizedSiteIds.includes(siteId))
    return NextResponse.json(
      { error: 'Forbidden. You do not have operator access to this site.' },
      { status: 403 },
    )
  return null
}

export function errorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : 'Unexpected error.'
  const status = /not found|No .* found/i.test(message)
    ? 404
    : /conflict|already|capacity/i.test(message)
      ? 409
      : 400
  return NextResponse.json({ error: message }, { status })
}
