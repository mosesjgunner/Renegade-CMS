import config from '@payload-config'
import { getPayload } from 'payload'
import {
  resolveCommunityActor,
  getMemberNotifications,
  CommunityError,
} from '@/modules/community/service'
import { listInbox, markInboxRead } from '@/modules/community/inbox-notifications'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    // Check inbox_notifications first
    let inboxResult: { notifications: any[]; unreadCount: number } = {
      notifications: [],
      unreadCount: 0,
    }
    try {
      inboxResult = await listInbox(payload, { siteId, memberId: actor.memberId })
    } catch {
      // Fallback if table not queried
    }

    // Also fetch canonical notifications
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
      notifications: inboxResult.notifications.length > 0 ? inboxResult.notifications : projected,
      inboxNotifications: inboxResult.notifications,
      canonicalNotifications,
      unreadCount:
        inboxResult.notifications.length > 0
          ? inboxResult.unreadCount
          : projected.filter((item) => !item.read).length,
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

  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (actor.kind === 'anonymous' || !actor.memberId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const notificationId = body.notificationId ? String(body.notificationId) : undefined

  try {
    let unreadCount = 0
    try {
      const res = await markInboxRead(payload, {
        siteId,
        memberId: actor.memberId,
        notificationId,
      })
      unreadCount = res.unreadCount
    } catch {
      // Ignored if table not matching
    }

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
      unreadCount: unreadCount + remaining.filter((item) => item.status !== 'read').length,
    })
  } catch (err: unknown) {
    if (err instanceof CommunityError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: 'Failed to mark notifications read' }, { status: 500 })
  }
}
