import config from '@payload-config'
import { getPayload } from 'payload'
import { timingSafeEqual } from 'node:crypto'

import { loadConfig } from '@/modules/core/config'
import { processProviderSuppressionEvent } from '@/modules/audience/service'

export const runtime = 'nodejs'

/**
 * RC3-EMAIL-01 / EMAIL-07: native Postmark webhook.
 *
 * Postmark sends no HMAC signature; its documented protection is HTTP Basic
 * credentials embedded in the webhook URL. The password is the boundary's
 * configured webhook secret, and WHICH boundary's secret matched is the
 * trusted provider-account context: an event authenticated as the audience
 * boundary can never mutate an account-boundary intent, and payload metadata
 * alone can never select another tenant's record. Effects are applied
 * durably before the 200 acknowledgement, and application is idempotent so
 * Postmark retries/replays are safe.
 */

type PostmarkEvent = {
  RecordType?: string
  MessageID?: string
  Recipient?: string
  Email?: string
  Type?: string
  TypeCode?: number
  Inactive?: boolean
  CanActivate?: boolean
  SuppressSending?: boolean
  SuppressionReason?: string
  DeliveredAt?: string
  BouncedAt?: string
  Metadata?: Record<string, string>
}

function secretMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function authenticatedBoundary(request: Request): 'account' | 'audience' | null {
  const header = request.headers.get('authorization') ?? ''
  if (!header.startsWith('Basic ')) return null
  let decoded = ''
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  } catch {
    return null
  }
  const separator = decoded.indexOf(':')
  const credential = separator >= 0 ? decoded.substring(separator + 1) : decoded
  if (!credential) return null
  const boundaries = loadConfig().email.boundaries
  const accountSecret = boundaries.account.postmark?.webhookSecret
  if (accountSecret && secretMatches(credential, accountSecret)) return 'account'
  const audienceSecret = boundaries.audience.postmark?.webhookSecret
  if (audienceSecret && secretMatches(credential, audienceSecret)) return 'audience'
  return null
}

export async function POST(request: Request) {
  const boundary = authenticatedBoundary(request)
  if (!boundary) return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  const raw = await request.text()
  if (raw.length > 256_000) return Response.json({ error: 'Payload too large.' }, { status: 413 })
  let event: PostmarkEvent
  try {
    event = JSON.parse(raw) as PostmarkEvent
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  if (!event.MessageID || !event.RecordType) {
    return Response.json({ error: 'Missing MessageID or RecordType.' }, { status: 400 })
  }
  const payload = await getPayload({ config })
  const providerId = boundary === 'account' ? 'postmark-account' : 'postmark-audience'

  // 1) Account/operational intents on this boundary.
  const intents = await payload.find({
    collection: 'email-intents',
    where: { providerMessageId: { equals: event.MessageID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const intent = intents.docs[0] as unknown as Record<string, unknown> | undefined
  if (intent) {
    if (String(intent.provider) !== providerId) {
      return Response.json({ error: 'Boundary mismatch.' }, { status: 403 })
    }
    await applyIntentEvent(payload, intent, event)
    return Response.json({ received: true })
  }

  // 2) Audience deliveries: reuse the existing durable, idempotent event
  // pipeline, which binds the event to the known delivery and its site.
  const deliveries = await payload.find({
    collection: 'email-deliveries',
    where: { providerMessageId: { equals: event.MessageID } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const delivery = deliveries.docs[0] as unknown as Record<string, unknown> | undefined
  if (delivery) {
    const message = delivery.message as Record<string, unknown> | undefined
    const siteRef = (message?.site ?? delivery.site) as string | { id?: string } | undefined
    const siteId = typeof siteRef === 'object' ? String(siteRef?.id ?? '') : String(siteRef ?? '')
    const mapped = mapDeliveryEvent(event)
    if (mapped && siteId) {
      await processProviderSuppressionEvent(payload as never, {
        siteId,
        email: String(event.Recipient ?? event.Email ?? delivery.recipientEmail ?? ''),
        event: mapped,
        provider: providerId,
        providerMessageId: event.MessageID,
        providerEventId: `${event.RecordType}:${event.MessageID}:${event.BouncedAt ?? event.DeliveredAt ?? ''}`,
        occurredAt: event.BouncedAt ?? event.DeliveredAt ?? new Date().toISOString(),
        evidence: { type: event.Type, typeCode: event.TypeCode, inactive: event.Inactive },
      })
    }
    return Response.json({ received: true })
  }

  // Unmapped provider message: acknowledge so Postmark stops retrying, but
  // record nothing as delivery evidence — absence of a mapping is not proof
  // about any message.
  return Response.json({ received: true, mapped: false })
}

function mapDeliveryEvent(
  event: PostmarkEvent,
): 'delivered' | 'deferred' | 'bounce' | 'complaint' | 'suppression' | null {
  if (event.RecordType === 'Delivery') return 'delivered'
  if (event.RecordType === 'SpamComplaint') return 'complaint'
  if (event.RecordType === 'SubscriptionChange') return event.SuppressSending ? 'suppression' : null
  if (event.RecordType === 'Bounce') {
    if (event.Type === 'SoftBounce' || event.Type === 'Transient') return 'deferred'
    return 'bounce'
  }
  return null
}

async function applyIntentEvent(
  payload: Awaited<ReturnType<typeof getPayload>>,
  intent: Record<string, unknown>,
  event: PostmarkEvent,
) {
  const events = Array.isArray(intent.events) ? [...(intent.events as unknown[])] : []
  const eventKey = `${event.RecordType}:${event.BouncedAt ?? event.DeliveredAt ?? ''}`
  if (
    events.some(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as { providerEventKey?: string }).providerEventKey === eventKey,
    )
  ) {
    return // Replay: already applied.
  }
  const patch: Record<string, unknown> = {
    events: [
      ...events,
      {
        type: `provider-${String(event.RecordType).toLowerCase()}`,
        at: new Date().toISOString(),
        providerEventKey: eventKey,
        detail: { type: event.Type, typeCode: event.TypeCode, inactive: event.Inactive },
      },
    ],
  }
  if (event.RecordType === 'Delivery') patch.receiving = 'remote-accepted'
  if (event.RecordType === 'Bounce') {
    patch.receiving = 'bounced'
    // A hard bounce the provider marks inactive is the confirmed-invalid
    // signal: suppress the address for this site across ALL classes
    // (EMAIL_CONTRACTS §4). Softer bounces are evidence only.
    if (event.Type === 'HardBounce' && event.Inactive) {
      const siteRef = intent.site as string | { id?: string } | undefined
      const siteId = typeof siteRef === 'object' ? siteRef?.id : siteRef
      if (siteId) {
        const prior = await payload.find({
          collection: 'suppressions',
          where: {
            and: [
              { site: { equals: siteId } },
              { emailHash: { equals: String(intent.recipientHash) } },
              { reason: { equals: 'invalid' } },
            ],
          },
          limit: 1,
          overrideAccess: true,
        })
        if (!prior.docs.length) {
          await payload.create({
            collection: 'suppressions',
            data: {
              site: siteId,
              emailHash: String(intent.recipientHash),
              reason: 'invalid',
              provider: String(intent.provider),
              occurredAt: new Date().toISOString(),
              global: true,
              source: 'postmark-webhook',
              details: { type: event.Type, typeCode: event.TypeCode },
            },
            overrideAccess: true,
          })
        }
      }
    }
  }
  if (event.RecordType === 'SpamComplaint') patch.receiving = 'provider-failed'
  await payload.update({
    collection: 'email-intents',
    id: String(intent.id),
    data: patch,
    overrideAccess: true,
  })
}
