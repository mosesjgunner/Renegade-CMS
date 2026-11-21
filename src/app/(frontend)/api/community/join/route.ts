import config from '@payload-config'
import { getPayload } from 'payload'
import { verifyCsrf } from '@/modules/identity/member-identity'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import { resolveCommunityActor } from '@/modules/community/service'
import {
  findSiteStanding,
  joinSite,
  postingStandingDecision,
} from '@/modules/community/site-standing'

const headers = { 'cache-control': 'private, no-store' }

/**
 * Member-facing site join (member-standing model C, RC2-DEBT-19).
 * POST provisions the caller's per-site standing row on the host's site;
 * GET reports whether the caller has standing there. Joining is per site
 * and idempotent; it grants the plain 'member' role only.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const publicSiteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!publicSiteId) {
    return Response.json({ error: 'Publication site is unavailable.' }, { status: 404, headers })
  }

  if (!(await samePublicOrigin(payload, request))) {
    return Response.json({ error: 'Cross-origin request denied.' }, { status: 403, headers })
  }

  if (!verifyCsrf(request.headers)) {
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403, headers })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (body.siteId && String(body.siteId) !== publicSiteId) {
    return Response.json({ error: 'Site access denied.' }, { status: 404, headers })
  }
  const siteId = publicSiteId

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401, headers })
  }

  const standing = await joinSite(payload as never, siteId, actor.memberId)
  return Response.json(
    {
      joined: true,
      created: standing.created,
      postingPolicy: postingStandingDecision(true),
      standing: { id: standing.id, siteId: standing.siteId, role: standing.role },
    },
    { status: standing.created ? 201 : 200, headers },
  )
}

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const publicSiteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!publicSiteId) {
    return Response.json({ error: 'Publication site is unavailable.' }, { status: 404, headers })
  }
  const siteId = publicSiteId

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401, headers })
  }

  const standing = await findSiteStanding(payload as never, siteId, actor.memberId)
  return Response.json(
    {
      joined: Boolean(standing),
      postingPolicy: postingStandingDecision(Boolean(standing)),
      standing: standing ? { id: standing.id, siteId: standing.siteId, role: standing.role } : null,
    },
    { headers },
  )
}
