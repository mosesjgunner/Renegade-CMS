import type { Payload } from 'payload'
import { executeDbQuery } from './comment-composer'

export type NotificationChannel = 'in_app' | 'email' | 'sms'
export type NotificationFrequency = 'immediate' | 'daily_digest' | 'weekly_digest' | 'off'

export type NotificationPreference = {
  id?: string
  siteId: string
  memberId: string
  channel: NotificationChannel
  kind: string
  frequency: NotificationFrequency
  rules?: Record<string, unknown>
}

export type OutboxEnvelope = {
  to?: string
  subject: string
  preheader?: string
  bodyHtml: string
  bodyText: string
  templateId?: string
  kind: string
  metadata?: Record<string, unknown>
  windowRange?: { startAt: string; endAt: string }
}

export type AudienceDeliveryRecord = {
  id: string
  site_id: string
  recipient_id: string
  channel: string
  envelope: OutboxEnvelope
  status: string
  scheduled_for: string
  created_at: string
}

const MANDATORY_NOTICE_KINDS = new Set([
  'moderation_warning',
  'sanction_issued',
  'moderation.action.v1',
  'moderation.warning',
  'moderation.sanction',
])

export function isMandatoryNotice(kind: string): boolean {
  if (MANDATORY_NOTICE_KINDS.has(kind)) return true
  const lower = kind.toLowerCase()
  return lower.includes('warning') || lower.includes('sanction')
}

export function isPrivateMessageKind(kind: string, isPrivate?: boolean): boolean {
  if (isPrivate) return true
  const lower = kind.toLowerCase()
  return (
    lower.startsWith('message.') ||
    lower.startsWith('conversation.') ||
    lower.includes('private_message') ||
    lower.includes('direct_message')
  )
}

export function formatNotificationSubject(
  kind: string,
  isPrivate?: boolean,
  siteName = 'Renegade',
): string {
  if (isPrivateMessageKind(kind, isPrivate)) {
    return `New private message on ${siteName}`
  }
  if (isMandatoryNotice(kind)) {
    return `Important notice regarding your account on ${siteName}`
  }
  if (kind.startsWith('comment.')) {
    return `New reply to your comment on ${siteName}`
  }
  return `New community notification on ${siteName}`
}

export async function getMemberNotificationPreference(
  payload: Payload,
  siteId: string,
  memberId: string,
  channel: NotificationChannel,
  kind = 'all',
): Promise<NotificationFrequency> {
  const rows = await executeDbQuery<{ frequency: string; rules?: Record<string, unknown> }>(
    payload,
    `SELECT frequency, rules FROM notification_preferences 
     WHERE site_id=$1 AND member_id=$2 AND channel=$3 AND (kind=$4 OR kind='all')
     ORDER BY (kind=$4) DESC LIMIT 1`,
    [siteId, memberId, channel, kind],
  )
  if (rows.length && rows[0]?.frequency) {
    if (channel !== 'in_app' && rows[0].rules?.deliveryConsentRevision !== 'rc08b-email-v1')
      return 'off'
    return rows[0].frequency as NotificationFrequency
  }
  // Default preferences
  if (channel === 'in_app') return 'immediate'
  if (channel === 'email') return 'off'
  return 'off'
}

export async function setMemberNotificationPreference(
  payload: Payload,
  input: {
    siteId: string
    memberId: string
    channel: NotificationChannel
    kind?: string
    frequency: NotificationFrequency
    rules?: Record<string, unknown>
  },
): Promise<void> {
  const kind = input.kind ?? 'all'
  await executeDbQuery(
    payload,
    `INSERT INTO notification_preferences (site_id, member_id, channel, kind, frequency, rules, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
     ON CONFLICT (site_id, member_id, channel, kind)
     DO UPDATE SET frequency=EXCLUDED.frequency, rules=EXCLUDED.rules, updated_at=now()`,
    [
      input.siteId,
      input.memberId,
      input.channel,
      kind,
      input.frequency,
      JSON.stringify(input.rules ?? {}),
    ],
  )
}

export async function writeAudienceDeliveryOutbox(
  payload: Payload,
  input: {
    siteId: string
    recipientId: string
    channel: 'email' | 'sms'
    envelope: OutboxEnvelope
    scheduledFor?: string
    idempotencyKey?: string
  },
): Promise<string> {
  const rows = await executeDbQuery<{ id: string }>(
    payload,
    `INSERT INTO audience_delivery_outbox (site_id, recipient_id, channel, envelope, scheduled_for, idempotency_key)
     VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, now()), $6)
     ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
     RETURNING id`,
    [
      input.siteId,
      input.recipientId,
      input.channel,
      JSON.stringify(input.envelope),
      input.scheduledFor ?? null,
      input.idempotencyKey ?? null,
    ],
  )
  return rows[0]?.id ?? ''
}

export async function routeNotificationToOutbox(
  payload: Payload,
  input: {
    siteId: string
    recipientId: string
    kind: string
    targetType: string
    targetId: string
    actorName?: string
    isPrivate?: boolean
    siteName?: string
  },
): Promise<{ enqueued: Array<{ channel: string; outboxId: string; frequency: string }> }> {
  const mandatory = isMandatoryNotice(input.kind)
  const channels: Array<'email' | 'sms'> = ['email']
  const enqueued: Array<{ channel: string; outboxId: string; frequency: string }> = []

  for (const channel of channels) {
    const frequency = await getMemberNotificationPreference(
      payload,
      input.siteId,
      input.recipientId,
      channel,
      input.kind,
    )

    // Mandatory notices bypass voluntary frequency toggles
    // Moderation notices remain in-app; voluntary external email requires explicit consent.
    if (mandatory && frequency === 'off') continue

    if (frequency === 'off') {
      continue
    }

    if (frequency === 'immediate') {
      const subject = formatNotificationSubject(input.kind, input.isPrivate, input.siteName)
      const isPrivate = isPrivateMessageKind(input.kind, input.isPrivate)
      const bodyText = isPrivate
        ? 'You have received a new private message. Sign in to view and respond.'
        : `You have a new update (${input.kind}) on ${input.siteName ?? 'Renegade'}.`
      const bodyHtml = `<p>${bodyText}</p>`

      const outboxId = await writeAudienceDeliveryOutbox(payload, {
        siteId: input.siteId,
        recipientId: input.recipientId,
        channel,
        envelope: {
          subject,
          preheader: isPrivate ? 'You have a new private message.' : undefined,
          bodyHtml,
          bodyText,
          kind: input.kind,
          metadata: {
            targetType: input.targetType,
            targetId: input.targetId,
            mandatory,
          },
        },
      })
      enqueued.push({ channel, outboxId, frequency })
    }
  }

  return { enqueued }
}

export async function compileNotificationDigest(
  payload: Payload,
  input: {
    siteId: string
    recipientId: string
    windowRange: { startAt: string; endAt: string }
    channel?: 'email' | 'sms'
    siteName?: string
  },
): Promise<AudienceDeliveryRecord | null> {
  const channel = input.channel ?? 'email'
  if (channel !== 'email') return null
  const frequency = await getMemberNotificationPreference(
    payload,
    input.siteId,
    input.recipientId,
    'email',
  )
  if (!['daily_digest', 'weekly_digest'].includes(frequency)) return null
  const { queueCommunityWindow } = await import('./external-notifications')
  const ids = await queueCommunityWindow(
    payload,
    input.siteId,
    input.recipientId,
    frequency,
    input.windowRange.startAt,
    input.windowRange.endAt,
  )
  if (!ids?.[0]) return null
  const rows = await executeDbQuery<AudienceDeliveryRecord>(
    payload,
    'SELECT * FROM audience_delivery_outbox WHERE id=$1 AND site_id=$2 AND recipient_id=$3',
    [ids[0], input.siteId, input.recipientId],
  )
  return rows[0] ?? null
}
