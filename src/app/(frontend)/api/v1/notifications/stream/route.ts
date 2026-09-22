import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor } from '@/modules/community/service'
import { notificationStreamManager } from '@/modules/community/notification-stream'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const siteId =
    url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? 'default'
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)

  if (!actor.memberId) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
      { status: 401 },
    )
  }

  const memberId = actor.memberId
  const connectionId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  let connectionLease: {
    id: string
    siteId: string
    memberId: string
    send: (chunk: string) => void
    close: () => void
  } | null = null

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      let heartbeatTimer: NodeJS.Timeout | null = null

      connectionLease = {
        id: connectionId,
        siteId,
        memberId,
        send: (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk))
          } catch {
            // Stream closed
          }
        },
        close: () => {
          if (heartbeatTimer) clearInterval(heartbeatTimer)
          try {
            controller.close()
          } catch {}
        },
      }

      // Check lease limit (max 5)
      const acquired = notificationStreamManager.acquireLease(memberId, connectionLease)
      if (!acquired) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              code: 'LEASE_LIMIT_EXCEEDED',
              message: 'Maximum 5 concurrent notification streams allowed per member.',
            })}\n\n`,
          ),
        )
        controller.close()
        return
      }

      // Handle Last-Event-ID replay
      const lastEventId =
        request.headers.get('last-event-id') ??
        url.searchParams.get('lastEventId') ??
        null

      if (lastEventId) {
        const missed = notificationStreamManager.getMissedHints(siteId, memberId, lastEventId)
        for (const hint of missed) {
          const payloadString = JSON.stringify({
            type: 'notification_received',
            unread_count: hint.unreadCount,
          })
          controller.enqueue(encoder.encode(`id: ${hint.id}\ndata: ${payloadString}\n\n`))
        }
      }

      // Heartbeat every 15 seconds
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          if (heartbeatTimer) clearInterval(heartbeatTimer)
        }
      }, 15000)
    },
    cancel() {
      if (connectionLease) {
        notificationStreamManager.releaseLease(memberId, connectionLease)
      }
    },
  })

  // Check if lease was rejected before returning SSE response
  if (notificationStreamManager.getActiveLeaseCount(memberId) > 5) {
    return Response.json(
      {
        error: {
          code: 'LEASE_LIMIT_EXCEEDED',
          message: 'Maximum 5 concurrent notification streams allowed per member.',
        },
      },
      { status: 429 },
    )
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'x-renegade-api-version': 'v1',
    },
  })
}
