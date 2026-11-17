import config from '@payload-config'
import { getPayload } from 'payload'
import {
  resolveCommunityActor,
  getMemberNotifications,
  CommunityError,
} from '@/modules/community/service'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
import { verifyCsrf } from '@/modules/identity/member-identity'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'

  if (siteId !== (await publicSiteForHost(payload, request.headers.get('host'))))
    return Response.json({ error: 'Site access denied.' }, { status: 404 })

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    // RC2-DEBT-21: the canonical notifications collection is the only
    // store — the inbox projection and its projector are retired.
    const canonicalNotifications = await getMemberNotifications(payload, actor.memberId, {
      siteId,
      actor,
    })

    const projected = canonicalNotifications.map((item) => {
      const event = item.activityEvent as { type?: string; payload?: Record<string, unknown> }
      return {
        id: item.id,
        kind: event?.type,
        snapshot: event?.payload,
        createdAt: item.createdAt,
        read: item.status === 'read',
      }
    })
    return Response.json({
      notifications: projected,
      canonicalNotifications,
      unreadCount: projected.filter((item) => !item.read).length,
    })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const payload = await getPayload({ config })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? request.headers.get('x-site-id') ?? 'default')

  if (siteId !== (await publicSiteForHost(payload, request.headers.get('host'))))
    return Response.json({ error: 'Site access denied.' }, { status: 404 })
  if (!verifyCsrf(request.headers) || !(await samePublicOrigin(payload, request)))
    return Response.json({ error: 'CSRF verification required.' }, { status: 403 })

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const notificationId = body.notificationId ? String(body.notificationId) : undefined

  try {
    const owned = await getMemberNotifications(payload, actor.memberId, { siteId, actor })
    for (const item of owned) {
      if (!notificationId || String(item.id) === notificationId) {
        await payload.update({
          collection: 'notifications' as any,
          id: String(item.id),
          data: { status: 'read' },
          overrideAccess: true,
        })
      }
    }

    const remaining = await getMemberNotifications(payload, actor.memberId, { siteId, actor })
    return Response.json({
      success: true,
      unreadCount: remaining.filter((item) => item.status !== 'read').length,
    })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to mark notifications read' }, { status: 500 })
  }
}
