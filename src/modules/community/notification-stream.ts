export type NotificationHint = {
  id: string
  siteId: string
  memberId: string
  unreadCount: number
  timestamp: number
}

type StreamConnection = {
  id: string
  siteId: string
  memberId: string
  send: (chunk: string) => void
  close: () => void
}

export class NotificationStreamManager {
  private activeStreams = new Map<string, Set<StreamConnection>>()
  private recentHints = new Map<string, NotificationHint[]>()
  private static readonly MAX_LEASES_PER_MEMBER = 5
  private static readonly MAX_HINTS_BUFFER = 50
  private hintSequence = 0

  /**
   * Acquire a stream lease for a member.
   * Returns false if the member already has 5 active streams.
   */
  acquireLease(memberId: string, connection: StreamConnection): boolean {
    const existing = this.activeStreams.get(memberId) ?? new Set()
    if (existing.size >= NotificationStreamManager.MAX_LEASES_PER_MEMBER) {
      return false
    }
    existing.add(connection)
    this.activeStreams.set(memberId, existing)
    return true
  }

  releaseLease(memberId: string, connection: StreamConnection): void {
    const existing = this.activeStreams.get(memberId)
    if (existing) {
      existing.delete(connection)
      if (existing.size === 0) {
        this.activeStreams.delete(memberId)
      }
    }
  }

  getActiveLeaseCount(memberId: string): number {
    return this.activeStreams.get(memberId)?.size ?? 0
  }

  /**
   * Generates and emits a lightweight hint. Never sends full payloads.
   */
  emitHint(siteId: string, memberId: string, unreadCount: number): NotificationHint {
    this.hintSequence++
    const hintId = `hint_${Date.now()}_${this.hintSequence}`
    const hint: NotificationHint = {
      id: hintId,
      siteId,
      memberId,
      unreadCount,
      timestamp: Date.now(),
    }

    // Buffer hint for reconnect replay
    const bufferKey = `${siteId}:${memberId}`
    const list = this.recentHints.get(bufferKey) ?? []
    list.push(hint)
    if (list.length > NotificationStreamManager.MAX_HINTS_BUFFER) {
      list.shift()
    }
    this.recentHints.set(bufferKey, list)

    // Broadcast to active connections for this member and site
    const connections = this.activeStreams.get(memberId)
    if (connections) {
      const payloadString = JSON.stringify({
        type: 'notification_received',
        unread_count: unreadCount,
      })
      const sseMessage = `id: ${hint.id}\ndata: ${payloadString}\n\n`
      for (const conn of connections) {
        if (conn.siteId === siteId) {
          try {
            conn.send(sseMessage)
          } catch {
            // Connection will be cleaned up on close
          }
        }
      }
    }

    return hint
  }

  /**
   * Replays missed hints for a reconnecting client with Last-Event-ID.
   */
  getMissedHints(siteId: string, memberId: string, lastEventId: string): NotificationHint[] {
    const bufferKey = `${siteId}:${memberId}`
    const list = this.recentHints.get(bufferKey) ?? []
    const index = list.findIndex((h) => h.id === lastEventId)
    if (index === -1) {
      // If lastEventId is not in buffer, return all buffered hints
      return [...list]
    }
    return list.slice(index + 1)
  }

  clear() {
    this.activeStreams.clear()
    this.recentHints.clear()
    this.hintSequence = 0
  }
}

export const notificationStreamManager = new NotificationStreamManager()
