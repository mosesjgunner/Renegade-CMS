import config from '@payload-config'
import { getPayload } from 'payload'
import { verifyCsrf } from '@/modules/identity/member-identity'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import { resolveCommunityActor } from '@/modules/community/service'
import {
  createModerationAppeal,
  ModerationActionError,
  reviewModerationAppeal,
} from '@/modules/community/moderation-actions'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const publicSiteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!publicSiteId) {
    return Response.json({ error: 'Publication site is unavailable.' }, { status: 404 })
  }

  if (!(await samePublicOrigin(payload, request))) {
    return Response.json({ error: 'Cross-origin request denied.' }, { status: 403 })
  }

  if (!verifyCsrf(request.headers)) {
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (body.siteId && String(body.siteId) !== publicSiteId) {
    return Response.json({ error: 'Site access denied.' }, { status: 404 })
  }
  const siteId = publicSiteId

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.memberId) return Response.json({ error: 'Authentication required' }, { status: 401 })
  if (!body.moderationActionId || !body.reason)
    return Response.json({ error: 'moderationActionId and reason are required' }, { status: 400 })
  try {
    const data = await createModerationAppeal(payload, {
      siteId,
      moderationActionId: String(body.moderationActionId),
      appellantMemberId: actor.memberId,
      reason: String(body.reason),
    })
    return Response.json({ success: true, data }, { status: 201 })
  } catch (error) {
    if (error instanceof ModerationActionError)
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    return Response.json({ error: 'Failed to create appeal' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const payload = await getPayload({ config })
  const publicSiteId = await publicSiteForHost(payload, request.headers.get('host'))
  if (!publicSiteId) {
    return Response.json({ error: 'Publication site is unavailable.' }, { status: 404 })
  }

  if (!(await samePublicOrigin(payload, request))) {
    return Response.json({ error: 'Cross-origin request denied.' }, { status: 403 })
  }

  if (!verifyCsrf(request.headers)) {
    return Response.json({ error: 'Invalid CSRF token' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (body.siteId && String(body.siteId) !== publicSiteId) {
    return Response.json({ error: 'Site access denied.' }, { status: 404 })
  }
  const siteId = publicSiteId

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if ((!actor.isStaff && !actor.isModerator) || !actor.memberId)
    return Response.json({ error: 'Moderation privileges required' }, { status: 403 })
  if (!body.appealId || !body.decision || !body.reason)
    return Response.json({ error: 'appealId, decision, and reason are required' }, { status: 400 })
  try {
    const data = await reviewModerationAppeal(payload, {
      siteId,
      appealId: String(body.appealId),
      reviewerMemberId: actor.memberId,
      decision: String(body.decision) as 'accepted' | 'rejected',
      reason: String(body.reason),
    })
    return Response.json({ success: true, data }, { status: 200 })
  } catch (error) {
    if (error instanceof ModerationActionError)
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    return Response.json({ error: 'Failed to review appeal' }, { status: 500 })
  }
}
