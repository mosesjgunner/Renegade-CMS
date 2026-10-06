import { createHash } from 'node:crypto'
import type { Payload, TaskConfig } from 'payload'
import { executeDbQuery } from './comment-composer'
import { checkBlockBetween, checkMuteFrom } from './service'
import { eventNotificationEnabled } from './event-notification-preferences'
import {
  getMemberNotificationPreference,
  writeAudienceDeliveryOutbox,
} from './notification-delivery'
import { targetIsDeliverable, recipientCanRead } from './inbox-notifications'
import { loadConfig } from '../core/config'
import { selectEmailDeliveryAdapter } from '../email/delivery'
import {
  audienceDigest,
  normalizeEmailAddress,
  signedAudienceToken,
  verifyAudienceToken,
} from '../audience/contracts'
import { digest } from '../identity/member-identity'
import { subscriberSuppressionReason } from '../audience/service'
import { resolveSiteSettings } from '../core/site-settings'
import { withExecutionLock } from '../operations/execution-lock'

type Doc = Record<string, unknown>
const query = <T = Doc>(payload: Payload, statement: string, values: unknown[] = []) =>
  executeDbQuery<T>(payload, statement, values)
const relationId = (value: unknown) =>
  typeof value === 'object' && value ? String((value as Doc).id ?? '') : String(value ?? '')
export async function verifiedCommunityEmail(payload: Payload, member: string, candidate: unknown) {
  let address: string
  try {
    address = normalizeEmailAddress(String(candidate ?? ''))
  } catch {
    return null
  }
  const identity = await payload.find({
    collection: 'linked-identities',
    where: {
      and: [
        { member: { equals: member } },
        { providerKey: { equals: 'renegade-email' } },
        { externalSubject: { equals: digest(address) } },
        { verifiedAt: { exists: true } },
        { revokedAt: { exists: false } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return identity.docs.length ? address : null
}
export function communityUnsubscribeToken(site: string, member: string) {
  return signedAudienceToken(
    Buffer.from(JSON.stringify({ purpose: 'community-email-off', site, member })).toString(
      'base64url',
    ),
    process.env.PAYLOAD_SECRET!,
  )
}
export function readCommunityUnsubscribeToken(token: string) {
  const value = verifyAudienceToken(token, process.env.PAYLOAD_SECRET!)
  try {
    const claims = JSON.parse(Buffer.from(value ?? '', 'base64url').toString())
    return claims.purpose === 'community-email-off' &&
      typeof claims.site === 'string' &&
      typeof claims.member === 'string'
      ? (claims as { site: string; member: string })
      : null
  } catch {
    return null
  }
}

/** Use current readable inbox sources, never email a stored content snippet. */
export async function deliverableCommunitySources(
  payload: Payload,
  site: string,
  member: string,
  start: string,
  end: string,
) {
  const rows = await query(
    payload,
    `SELECT n.id,n.kind,n.actor_member_id,n.target_type,n.target_id,n.snapshot,n.created_at,e.payload
    FROM inbox_notifications n JOIN outbox_events e ON e.id=n.source_event_id
    WHERE n.site_id=$1 AND n.recipient_member_id=$2 AND n.created_at >= $3::timestamptz AND n.created_at < $4::timestamptz AND e.created_at >= $3::timestamptz ORDER BY n.created_at,n.id`,
    [site, member, start, end],
  )
  const visible: Doc[] = []
  for (const row of rows) {
    const data = row.payload as Doc
    if (String(data.site_id ?? data.siteId ?? '') !== site) continue
    if (
      !(await eventNotificationEnabled(
        payload,
        member,
        String(row.kind),
        String((row.snapshot as Doc)?.reason ?? ''),
      ))
    )
      continue
    if (row.actor_member_id) {
      const actor = String(row.actor_member_id)
      if (
        (await checkBlockBetween(payload, member, actor, site)).isBlocked ||
        (await checkMuteFrom(payload, member, actor, site))
      )
        continue
    }
    if (
      !(await targetIsDeliverable(payload, {
        id: String(row.id),
        eventType: String(row.kind),
        payload: data,
      }))
    )
      continue
    if (
      !(await recipientCanRead(payload, site, String(data.space_id ?? data.spaceId ?? ''), member))
    )
      continue
    visible.push(row)
  }
  // Native direct-message/follow notifications use the same site/recipient boundary.
  for (let page = 1; ; page++) {
    const batch = await payload.find({
      collection: 'notifications',
      where: {
        and: [
          { recipientMember: { equals: member } },
          { createdAt: { greater_than_equal: start } },
          { createdAt: { less_than: end } },
        ],
      },
      limit: 250,
      page,
      depth: 1,
      overrideAccess: true,
    })
    for (const notification of batch.docs) {
      const activity = notification.activityEvent as unknown as Doc
      if (!activity || typeof activity !== 'object' || relationId(activity.site) !== site) continue
      const kind = String(activity.type),
        actor = String((activity.actor as Doc)?.memberId ?? '')
      if (!(await eventNotificationEnabled(payload, member, kind))) continue
      if (
        actor &&
        ((await checkBlockBetween(payload, member, actor, site)).isBlocked ||
          (await checkMuteFrom(payload, member, actor, site)))
      )
        continue
      // Membership governs private conversations at send time.
      if (kind.includes('message')) {
        const object = activity.object as Doc
        const conversation = String(object?.conversationId ?? object?.id ?? '')
        const allowed = await query(
          payload,
          `SELECT cm.member_id FROM conversation_memberships cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.member_id=$1 AND cm.conversation_id::text=$2 AND cm.left_at IS NULL AND c.site_id=$3`,
          [member, conversation, site],
        )
        if (!allowed.length) continue
      } else if (kind !== 'relationship.follow') continue
      visible.push({ id: notification.id, kind, created_at: notification.createdAt })
    }
    if (!batch.hasNextPage) break
  }
  return visible
}

export async function queueCommunityWindow(
  payload: Payload,
  site: string,
  member: string,
  frequency: string,
  start: string,
  end: string,
) {
  if ((await getMemberNotificationPreference(payload, site, member, 'email')) !== frequency)
    return null
  const rows = await deliverableCommunitySources(payload, site, member, start, end)
  if (!rows.length) return null
  const keys = frequency === 'immediate' ? rows.map((row) => String(row.id)) : [`${start}:${end}`]
  const ids: string[] = []
  for (const key of keys)
    ids.push(
      await writeAudienceDeliveryOutbox(payload, {
        siteId: site,
        recipientId: member,
        channel: 'email',
        idempotencyKey: `community:${site}:${member}:${frequency}:${key}`,
        envelope: {
          kind: 'community-notification',
          subject: 'Community updates',
          bodyText: 'Sign in to view your notifications.',
          bodyHtml: '',
          windowRange: { startAt: start, endAt: end },
          metadata: { frequency, sourceId: frequency === 'immediate' ? key : undefined },
        },
      }),
    )
  return ids
}

export async function sendCommunityDelivery(payload: Payload, outboxId: string) {
  return withExecutionLock(payload, `community-email:${outboxId}`, async () => {
    const row = (
      await query(payload, 'SELECT * FROM audience_delivery_outbox WHERE id=$1', [outboxId])
    )[0]
    if (!row || !['pending', 'sending'].includes(String(row.status))) return
    const finish = (
      status: string,
      error: string | null = null,
      provider?: string,
      messageId?: string,
    ) =>
      query(
        payload,
        "UPDATE audience_delivery_outbox SET status=$2::varchar,error=$3,provider=$4,provider_message_id=$5,dispatched_at=CASE WHEN $2::varchar='accepted' THEN now() ELSE dispatched_at END WHERE id=$1",
        [outboxId, status, error, provider ?? null, messageId ?? null],
      )
    if (row.status === 'sending') {
      await finish('unknown', 'Interrupted send; provider acceptance requires reconciliation.')
      return
    }
    const site = String(row.site_id),
      member = String(row.recipient_id),
      envelope = row.envelope as Doc,
      metadata = envelope.metadata as Doc
    if (row.channel !== 'email' || envelope.kind !== 'community-notification') {
      await finish('cancelled', 'Unsupported community delivery envelope.')
      return
    }
    const frequency = String(metadata.frequency)
    if ((await getMemberNotificationPreference(payload, site, member, 'email')) !== frequency) {
      await finish('cancelled', 'Preference changed before send.')
      return
    }
    const account = await payload.findByID({
      collection: 'members',
      id: member,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    const preference = (
      await query(
        payload,
        "SELECT rules FROM notification_preferences WHERE site_id=$1 AND member_id=$2 AND channel='email' AND kind='all'",
        [site, member],
      )
    )[0]
    const address = await verifiedCommunityEmail(
      payload,
      member,
      (preference?.rules as Doc)?.deliveryAddress,
    )
    if (!account || account.status !== 'active' || !address) {
      await finish('cancelled', 'Verified recipient unavailable.')
      return
    }
    if (await subscriberSuppressionReason(payload, site, audienceDigest(address))) {
      await finish('cancelled', 'Address suppressed before send.')
      return
    }
    const range = envelope.windowRange as { startAt: string; endAt: string }
    let sources = await deliverableCommunitySources(
      payload,
      site,
      member,
      range.startAt,
      range.endAt,
    )
    if (metadata.sourceId)
      sources = sources.filter((source) => String(source.id) === metadata.sourceId)
    if (!sources.length) {
      await finish('cancelled', 'No currently readable sources.')
      return
    }
    const settings = await resolveSiteSettings(payload),
      origin = settings.canonicalOriginsBySite?.[site]
    if (!origin) {
      await finish('failed', 'Canonical site origin is required.')
      return
    }
    const link = new URL('/api/community/notification-unsubscribe', origin)
    link.searchParams.set('token', communityUnsubscribeToken(site, member))
    const text = `You have ${sources.length} community update${sources.length === 1 ? '' : 's'}. Sign in to view your inbox.\n${new URL('/notifications', origin)}\nTurn off community email: ${link}`
    const adapter = selectEmailDeliveryAdapter(loadConfig())
    await query(
      payload,
      "UPDATE audience_delivery_outbox SET status='sending',attempts=attempts+1 WHERE id=$1",
      [outboxId],
    )
    let result
    try {
      result = await adapter.send({
        from: loadConfig().email.from ?? '',
        to: address,
        subject: 'Community updates',
        text,
        idempotencyKey: String(row.idempotency_key),
        category: 'transactional',
        messageId: `<${createHash('sha256').update(String(row.idempotency_key)).digest('hex').slice(0, 32)}@renegade.local>`,
      })
    } catch {
      await finish('unknown', 'Provider acceptance is uncertain; reconcile before retry.')
      return
    }
    if (result.ok) await finish('accepted', null, result.provider, result.providerMessageId)
    else {
      const attempts = Number(row.attempts ?? 0) + 1
      const status =
        result.failure.kind === 'unknown'
          ? 'unknown'
          : result.failure.kind === 'retryable' && attempts < 5
            ? 'pending'
            : 'failed'
      await finish(status, `Transport outcome: ${result.failure.code}`, result.provider)
      if (status === 'pending')
        await query(
          payload,
          "UPDATE audience_delivery_outbox SET scheduled_for=now()+($2::int * interval '1 second') WHERE id=$1",
          [outboxId, Math.min(3600, 2 ** attempts)],
        )
    }
  })
}

export async function retryCommunityDelivery(
  payload: Payload,
  site: string,
  deliveryId: string,
  actorUserId: string,
) {
  return withExecutionLock(payload, `community-email:${deliveryId}`, async () => {
    const row = (
      await query(payload, 'SELECT * FROM audience_delivery_outbox WHERE id=$1 AND site_id=$2', [
        deliveryId,
        site,
      ])
    )[0]
    if (!row || (row.envelope as Doc)?.kind !== 'community-notification') return false
    if (
      row.status !== 'failed' ||
      ![
        'Transport outcome: email_disabled',
        'Transport outcome: authentication_failed',
        'Transport outcome: temporary_provider_error',
      ].includes(String(row.error))
    )
      return false
    await payload.create({
      collection: 'identity-audit-events',
      data: {
        member: String(row.recipient_id),
        event: 'community-email.retry-requested',
        details: { siteId: site, deliveryId, actorUserId },
      },
      overrideAccess: true,
    })
    await query(
      payload,
      "UPDATE audience_delivery_outbox SET status='pending',attempts=0,scheduled_for=now(),error=NULL WHERE id=$1",
      [deliveryId],
    )
    return true
  })
}

export const communityEmailTask = {
  slug: 'community-email-dispatch',
  label: 'Community email and digests',
  inputSchema: [],
  outputSchema: [],
  schedule: [{ cron: '*/30 * * * * *', queue: 'operations' }],
  concurrency: () => 'community-email-dispatch',
  handler: async ({ req }: { req: { payload: Payload } }) => {
    await withExecutionLock(req.payload, 'community-email-scan', async () => {
      const preferences = await query(
        req.payload,
        "SELECT site_id,member_id,frequency,rules FROM notification_preferences WHERE channel='email' AND kind='all' AND frequency<>'off' AND rules->>'deliveryConsentRevision'='rc08b-email-v1'",
      )
      const now = new Date(),
        today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      for (const pref of preferences) {
        try {
          const frequency = String(pref.frequency),
            rules = pref.rules as Doc
          const end =
            frequency === 'immediate'
              ? now
              : frequency === 'weekly_digest'
                ? new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86400000)
                : today
          const start =
            frequency === 'immediate'
              ? new Date(String(rules.deliveryEnabledAt))
              : new Date(end.getTime() - (frequency === 'weekly_digest' ? 7 : 1) * 86400000)
          if (start >= end) continue
          // Never include a period predating explicit opt-in.
          const consentAt = Date.parse(String(rules.deliveryEnabledAt))
          if (start.getTime() < consentAt) start.setTime(consentAt)
          await queueCommunityWindow(
            req.payload,
            String(pref.site_id),
            String(pref.member_id),
            frequency,
            start.toISOString(),
            end.toISOString(),
          )
        } catch {
          req.payload.logger.error({
            msg: 'Community email scan failed for a recipient; next worker pass will retry.',
            siteId: String(pref.site_id),
            memberId: String(pref.member_id),
          })
        }
      }
      const due = await query(
        req.payload,
        "SELECT id FROM audience_delivery_outbox WHERE channel='email' AND envelope->>'kind'='community-notification' AND status IN ('pending','sending') AND scheduled_for<=now() ORDER BY created_at LIMIT 100",
      )
      for (const delivery of due) {
        try {
          await sendCommunityDelivery(req.payload, String(delivery.id))
        } catch {
          req.payload.logger.error({
            msg: 'Community delivery processing failed; persisted state retained for recovery.',
            deliveryId: String(delivery.id),
          })
        }
      }
    })
    return { output: {} }
  },
} as unknown as TaskConfig
