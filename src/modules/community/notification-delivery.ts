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
  const rows = await executeDbQuery<{ frequency: string }>(
    payload,
    `SELECT frequency FROM notification_preferences 
     WHERE site_id=$1 AND member_id=$2 AND channel=$3 AND (kind=$4 OR kind='all')
     ORDER BY (kind=$4) DESC LIMIT 1`,
    [siteId, memberId, channel, kind],
  )
  if (rows.length && rows[0]?.frequency) {
    return rows[0].frequency as NotificationFrequency
  }
  // Default preferences
  if (channel === 'in_app') return 'immediate'
  if (channel === 'email') return 'daily_digest'
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
  },
): Promise<string> {
  const rows = await executeDbQuery<{ id: string }>(
    payload,
    `INSERT INTO audience_delivery_outbox (site_id, recipient_id, channel, envelope, scheduled_for)
     VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, now()))
     RETURNING id`,
    [
      input.siteId,
      input.recipientId,
      input.channel,
      JSON.stringify(input.envelope),
      input.scheduledFor ?? null,
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
  const channels: Array<'email' | 'sms'> = ['email', 'sms']
  const enqueued: Array<{ channel: string; outboxId: string; frequency: string }> = []

  for (const channel of channels) {
    let frequency = await getMemberNotificationPreference(
      payload,
      input.siteId,
      input.recipientId,
      channel,
      input.kind,
    )

    // Mandatory notices bypass voluntary frequency toggles
    if (mandatory) {
      frequency = 'immediate'
    }

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

  // Look up notifications for recipient in the window
  const rows = await executeDbQuery<{
    id: string
    kind: string
    target_type: string
    target_id: string
    created_at: string
  }>(
    payload,
    `SELECT id, kind, target_type, target_id, created_at
     FROM inbox_notifications
     WHERE site_id=$1 AND recipient_member_id=$2
       AND created_at >= $3::timestamptz AND created_at < $4::timestamptz
     ORDER BY created_at ASC`,
    [input.siteId, input.recipientId, input.windowRange.startAt, input.windowRange.endAt],
  )

  if (!rows.length) {
    return null
  }

  const siteName = input.siteName ?? 'Renegade'
  const privateCount = rows.filter((r) => isPrivateMessageKind(r.kind)).length
  const publicCount = rows.length - privateCount

  const itemsSummary: string[] = []
  if (publicCount > 0) {
    itemsSummary.push(`${publicCount} community notification${publicCount > 1 ? 's' : ''}`)
  }
  if (privateCount > 0) {
    itemsSummary.push(`${privateCount} private message${privateCount > 1 ? 's' : ''}`)
  }

  const subject = `Your ${siteName} digest: ${rows.length} new update${rows.length > 1 ? 's' : ''}`
  const bodyText =
    `Here is your summary of activity on ${siteName} between ${input.windowRange.startAt} and ${input.windowRange.endAt}:\n` +
    itemsSummary.map((item) => `- ${item}`).join('\n') +
    '\n\nSign in to view your inbox.'
  const bodyHtml =
    `<h2>${subject}</h2><p>Here is your activity summary:</p><ul>` +
    itemsSummary.map((item) => `<li>${item}</li>`).join('') +
    '</ul><p><a href="/notifications">View your notifications</a></p>'

  const envelope: OutboxEnvelope = {
    subject,
    bodyHtml,
    bodyText,
    kind: 'community_digest',
    windowRange: input.windowRange,
    metadata: {
      totalItems: rows.length,
      privateItems: privateCount,
      publicItems: publicCount,
    },
  }

  const outboxId = await writeAudienceDeliveryOutbox(payload, {
    siteId: input.siteId,
    recipientId: input.recipientId,
    channel,
    envelope,
  })

  return {
    id: outboxId,
    site_id: input.siteId,
    recipient_id: input.recipientId,
    channel,
    envelope,
    status: 'pending',
    scheduled_for: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}
