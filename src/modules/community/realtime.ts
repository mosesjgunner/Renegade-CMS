import { EventEmitter } from 'node:events'
import type { Payload } from 'payload'

export type CommunityRealtimeEvent = {
  type:
    | 'community.comment_created'
    | 'community.comment_edited'
    | 'community.comment_deleted'
    | 'community.reply_created'
    | 'community.reaction_updated'
    | 'community.notification_dispatched'
    | 'community.message_sent'
    | 'community.moderation_applied'
  siteId: string
  recipientMemberId?: string
  actorMemberId?: string
  payload: Record<string, unknown>
  occurredAt: string
}

class CommunityRealtimeBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(100)
  }

  emitCommunityEvent(event: CommunityRealtimeEvent) {
    this.emit('community-event', event)
    if (event.recipientMemberId) {
      this.emit(`member:${event.recipientMemberId}`, event)
    }
  }

  subscribeMember(memberId: string, listener: (event: CommunityRealtimeEvent) => void) {
    this.on(`member:${memberId}`, listener)
    return () => {
      this.off(`member:${memberId}`, listener)
    }
  }

  subscribeSite(siteId: string, listener: (event: CommunityRealtimeEvent) => void) {
    const handler = (event: CommunityRealtimeEvent) => {
      if (event.siteId === siteId) listener(event)
    }
    this.on('community-event', handler)
    return () => {
      this.off('community-event', handler)
    }
  }
}

export const communityRealtime = new CommunityRealtimeBus()

/**
 * Emits both to the in-memory realtime bus and persistently to realtime-events
 */
export async function emitCommunityEvent(
  payload: Payload,
  event: Omit<CommunityRealtimeEvent, 'occurredAt'> & { occurredAt?: string },
): Promise<void> {
  if (
    event.recipientMemberId &&
    event.actorMemberId &&
    event.recipientMemberId !== event.actorMemberId
  ) {
    const recipient = event.recipientMemberId
    const actor = event.actorMemberId
    const keys = [
      `block:${event.siteId}:${recipient}:${actor}`,
      `block:${recipient}:${actor}`,
      `block:${event.siteId}:${actor}:${recipient}`,
      `block:${actor}:${recipient}`,
      `mute:${event.siteId}:${recipient}:${actor}`,
      `mute:${recipient}:${actor}`,
    ]
    const hidden = await payload.find({
      collection: 'relationships',
      where: {
        and: [
          { site: { equals: event.siteId } },
          { status: { equals: 'active' } },
          { pairKey: { in: keys } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    } as never)
    if (hidden.docs.length) return
  }
  const fullEvent: CommunityRealtimeEvent = {
    ...event,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
  }

  // Persist before notifying in-memory subscribers when the optional durable
  // collection is available. Both outputs use the same privacy decision.
  if (!payload.collections || payload.collections['realtime-events'])
    try {
      await payload.create({
        collection: 'realtime-events',
        overrideAccess: true,
        data: {
          scopeKind: 'site',
          site: fullEvent.siteId,
          scopeKey: `site:${fullEvent.siteId}`,
          kind: fullEvent.type,
          recipientMember: fullEvent.recipientMemberId ?? null,
          payload: fullEvent.payload,
          occurredAt: fullEvent.occurredAt,
        },
      })
    } catch (error) {
      // A registered collection failure may already have rolled back the Payload
      // request transaction. Never report business success after that rollback.
      if (payload.collections?.['realtime-events']) throw error
    }
  communityRealtime.emitCommunityEvent(fullEvent)
}
