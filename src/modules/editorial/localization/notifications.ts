import { randomUUID } from 'node:crypto'

import type {
  InAppNotification,
  NotificationChannel,
  NotificationEventType,
  NotificationOutboxItem,
  NotificationPreferences,
} from './contracts'

export interface EmailDeliveryAdapter {
  readonly id: string
  sendEmail(to: string, subject: string, body: string): Promise<{ success: boolean; error?: string }>
}

export interface WebhookNotificationAdapter {
  readonly id: string
  sendWebhook(url: string, payload: Record<string, unknown>): Promise<{ success: boolean; statusCode?: number; error?: string }>
}

/**
 * In-memory and durable notification manager.
 * In-app notifications work immediately without external providers.
 * Outbox items decouple external delivery from workflow state transitions.
 */
export class NotificationManager {
  private inAppNotifications: InAppNotification[] = []
  private outbox: NotificationOutboxItem[] = []
  private userPreferences: Map<string, NotificationPreferences> = new Map()

  private emailAdapter: EmailDeliveryAdapter | null = null
  private webhookAdapter: WebhookNotificationAdapter | null = null

  setEmailAdapter(adapter: EmailDeliveryAdapter | null) {
    this.emailAdapter = adapter
  }

  setWebhookAdapter(adapter: WebhookNotificationAdapter | null) {
    this.webhookAdapter = adapter
  }

  setUserPreferences(prefs: NotificationPreferences) {
    this.userPreferences.set(prefs.userId, prefs)
  }

  getUserPreferences(userId: string): NotificationPreferences {
    return (
      this.userPreferences.get(userId) ?? {
        userId,
        enabledChannels: { in_app: true, email: false, webhook: false },
        mutedEvents: [],
      }
    )
  }

  /**
   * Enqueues a notification across preferred channels for the recipient.
   * In-app notifications are delivered synchronously; external channels are staged in the outbox.
   */
  dispatchNotification(input: {
    eventType: NotificationEventType
    recipientId: string
    title: string
    message: string
    payload?: Record<string, unknown>
    eventId?: string
  }): { inAppDelivered: boolean; outboxItemsQueued: number } {
    const prefs = this.getUserPreferences(input.recipientId)

    // Check if event is muted by recipient
    if (prefs.mutedEvents.includes(input.eventType)) {
      return { inAppDelivered: false, outboxItemsQueued: 0 }
    }

    const eventId = input.eventId || `evt_${Date.now()}_${randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()
    const payload = input.payload || {}

    let inAppDelivered = false
    let outboxItemsQueued = 0

    // 1. In-App Channel (Works without any external provider)
    if (prefs.enabledChannels.in_app) {
      const inAppItem: InAppNotification = {
        id: `notif_${Date.now()}_${randomUUID().slice(0, 8)}`,
        userId: input.recipientId,
        eventType: input.eventType,
        title: input.title,
        message: input.message,
        metadata: payload,
        read: false,
        createdAt: now,
      }
      this.inAppNotifications.unshift(inAppItem)
      inAppDelivered = true
    }

    // 2. Email Channel (Durable Outbox)
    if (prefs.enabledChannels.email && prefs.emailAddress) {
      this.outbox.push({
        id: `outbox_${Date.now()}_${randomUUID().slice(0, 8)}`,
        eventId,
        eventType: input.eventType,
        recipientId: input.recipientId,
        channel: 'email',
        title: input.title,
        message: input.message,
        payload: { ...payload, to: prefs.emailAddress },
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        createdAt: now,
      })
      outboxItemsQueued++
    }

    // 3. Webhook Channel (Durable Outbox)
    if (prefs.enabledChannels.webhook && prefs.webhookEndpointUrl) {
      this.outbox.push({
        id: `outbox_${Date.now()}_${randomUUID().slice(0, 8)}`,
        eventId,
        eventType: input.eventType,
        recipientId: input.recipientId,
        channel: 'webhook',
        title: input.title,
        message: input.message,
        payload: { ...payload, endpointUrl: prefs.webhookEndpointUrl },
        status: 'pending',
        attempts: 0,
        maxAttempts: 5,
        createdAt: now,
      })
      outboxItemsQueued++
    }

    return { inAppDelivered, outboxItemsQueued }
  }

  /**
   * Retrieves in-app notifications for a user.
   */
  getInAppNotifications(userId: string, options: { unreadOnly?: boolean } = {}): InAppNotification[] {
    return this.inAppNotifications.filter((n) => {
      if (n.userId !== userId) return false
      if (options.unreadOnly && n.read) return false
      return true
    })
  }

  /**
   * Marks in-app notification as read.
   */
  markAsRead(notificationId: string): boolean {
    const item = this.inAppNotifications.find((n) => n.id === notificationId)
    if (item) {
      item.read = true
      return true
    }
    return false
  }

  /**
   * Returns current items in the notification outbox.
   */
  getOutbox(): NotificationOutboxItem[] {
    return [...this.outbox]
  }

  /**
   * Processes pending or retrying items in the notification outbox.
   * External delivery failures are captured and retried, but NEVER roll back workflow state truth.
   */
  async processOutbox(options: { maxItems?: number } = {}): Promise<{
    processed: number
    delivered: number
    failed: number
    retrying: number
  }> {
    const limit = options.maxItems || 50
    const pendingItems = this.outbox
      .filter((item) => item.status === 'pending' || item.status === 'retrying')
      .slice(0, limit)

    let delivered = 0
    let failed = 0
    let retrying = 0

    for (const item of pendingItems) {
      item.attempts++
      const now = new Date().toISOString()

      try {
        if (item.channel === 'email') {
          if (!this.emailAdapter) {
            item.status = 'failed'
            item.lastError = 'No email adapter configured.'
            failed++
            continue
          }
          const to = String(item.payload.to || '')
          const res = await this.emailAdapter.sendEmail(to, item.title, item.message)
          if (res.success) {
            item.status = 'delivered'
            item.deliveredAt = now
            item.lastError = null
            delivered++
          } else {
            throw new Error(res.error || 'Email delivery failed')
          }
        } else if (item.channel === 'webhook') {
          if (!this.webhookAdapter) {
            item.status = 'failed'
            item.lastError = 'No webhook adapter configured.'
            failed++
            continue
          }
          const endpoint = String(item.payload.endpointUrl || '')
          const res = await this.webhookAdapter.sendWebhook(endpoint, item.payload)
          if (res.success) {
            item.status = 'delivered'
            item.deliveredAt = now
            item.lastError = null
            delivered++
          } else {
            throw new Error(res.error || 'Webhook delivery failed')
          }
        }
      } catch (err: any) {
        item.lastError = err?.message || String(err)
        if (item.attempts < item.maxAttempts) {
          item.status = 'retrying'
          const delaySeconds = Math.pow(2, item.attempts) * 5
          item.nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString()
          retrying++
        } else {
          item.status = 'failed'
          failed++
        }
      }
    }

    return {
      processed: pendingItems.length,
      delivered,
      failed,
      retrying,
    }
  }
}
