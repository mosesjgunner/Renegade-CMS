/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  isWithinQuietHours,
  calculateNextSendWindow,
  normalizeE164Phone,
  parseInboundKeyword,
  telecomDigest,
  type QuietHoursPolicy,
  type RcsContent,
} from './contracts'

type Store = any
type Doc = Record<string, any>
const now = () => new Date().toISOString()

export const telecomDeliveryIdempotencyKey = (messageId: string, recipientId: string) =>
  `telecom:${messageId}:${recipientId}`

// ============================================================================
// 1. Phone Verification and Reassignment
// ============================================================================

export async function recordPhoneReassignment(
  payload: Store,
  input: {
    siteId: string
    phoneE164: string
    reason?: string
    actor?: string
  },
) {
  const normalized = normalizeE164Phone(input.phoneE164)
  const phoneHash = telecomDigest(normalized.e164)

  // 1. Record withdrawal consent event
  await payload.create({
    collection: 'consent-events',
    data: {
      site: input.siteId,
      event: 'preference-withdrawn',
      basis: 'number-reassigned',
      channel: 'sms',
      purpose: 'all',
      occurredAt: now(),
      actor: input.actor,
      evidence: {
        reason: input.reason ?? 'Carrier or subscriber reported number reassignment.',
        phoneHash,
      },
    },
    overrideAccess: true,
  })

  // 2. Add suppression for phoneHash
  const existing = await payload.find({
    collection: 'suppressions',
    where: { site: { equals: input.siteId }, emailHash: { equals: phoneHash } },
    limit: 1,
    overrideAccess: true,
  })

  if (!existing.docs.length) {
    await payload.create({
      collection: 'suppressions',
      data: {
        site: input.siteId,
        emailHash: phoneHash,
        reason: 'invalid',
        source: 'number-reassigned',
        global: true,
        scope: 'site',
        occurredAt: now(),
        details: { phoneE164: normalized.e164, reassignmentNotified: true },
      },
      overrideAccess: true,
    })
  }

  // 3. Cancel any queued telecom deliveries for this number
  const queuedDeliveries = await payload.find({
    collection: 'telecom-deliveries',
    where: {
      recipientPhoneHash: { equals: phoneHash },
      status: { equals: 'queued' },
    },
    limit: 1000,
    overrideAccess: true,
  })

  for (const delivery of queuedDeliveries.docs) {
    await payload.update({
      collection: 'telecom-deliveries',
      id: delivery.id,
      data: {
        status: 'cancelled',
        outcome: {
          code: 'number_reassigned',
          message: 'Delivery cancelled due to number reassignment evidence.',
        },
      },
      overrideAccess: true,
    })
  }

  return { phoneHash, cancelledDeliveries: queuedDeliveries.docs.length }
}

// ============================================================================
// 2. Telecom Consent Verification (Email consent never implies SMS/RCS)
// ============================================================================

export async function hasTelecomConsent(
  payload: Store,
  input: {
    siteId: string
    subscriberId?: string
    phoneHash: string
    purpose: string
  },
): Promise<boolean> {
  // Check if phoneHash is suppressed
  const suppressed = await payload.find({
    collection: 'suppressions',
    where: {
      site: { equals: input.siteId },
      emailHash: { equals: input.phoneHash },
    },
    limit: 1,
    overrideAccess: true,
  })
  if (suppressed.docs.length > 0) {
    return false
  }

  // Find consent events specifically for sms or rcs channel
  const consentEvents = await payload.find({
    collection: 'consent-events',
    where: {
      site: { equals: input.siteId },
      channel: { in: ['sms', 'rcs'] },
      ...(input.subscriberId ? { subscriber: { equals: input.subscriberId } } : {}),
    },
    sort: '-occurredAt',
    limit: 20,
    overrideAccess: true,
  })

  // Check if most recent event for this purpose (or 'all') is granted
  for (const event of consentEvents.docs) {
    const p = String(event.purpose || 'marketing')
    if (p === input.purpose || p === 'all' || p === 'general') {
      if (event.event === 'preference-withdrawn' || event.event === 'unsubscribe') {
        return false
      }
      if (
        event.event === 'preference-granted' ||
        event.event === 'double-opt-in-confirmed' ||
        event.event === 'requested'
      ) {
        return true
      }
    }
  }

  return false
}

// ============================================================================
// 3. Inbound Ingestion and Opt-Out (STOP / START / HELP)
// ============================================================================

export type InboundTelecomProcessResult = {
  action: 'opt-out' | 'opt-in' | 'help' | 'staff-routed' | 'acknowledged'
  autoResponse?: string
  suppressionRecorded?: boolean
  deliveriesCancelled?: number
}

export async function processInboundTelecomMessage(
  payload: Store,
  input: {
    siteId: string
    fromE164: string
    toE164: string
    text: string
    providerMessageId?: string
    provider?: string
    brandName?: string
    staffRoutingEnabled?: boolean
  },
): Promise<InboundTelecomProcessResult> {
  const normalizedFrom = normalizeE164Phone(input.fromE164)
  const phoneHash = telecomDigest(normalizedFrom.e164)
  const keywordResult = parseInboundKeyword(input.text)
  const brand = input.brandName ?? 'Renegade'

  // STOP / Opt-Out handling
  if (keywordResult.action === 'opt-out') {
    // 1. Record ConsentEvent (withdrawal)
    await payload.create({
      collection: 'consent-events',
      data: {
        site: input.siteId,
        event: 'preference-withdrawn',
        basis: 'inbound-keyword',
        channel: 'sms',
        purpose: 'all',
        occurredAt: now(),
        evidence: {
          keyword: keywordResult.normalizedKeyword,
          rawText: input.text,
          from: normalizedFrom.e164,
          providerMessageId: input.providerMessageId,
        },
      },
      overrideAccess: true,
    })

    // 2. Persist suppression for phoneHash
    const existing = await payload.find({
      collection: 'suppressions',
      where: { site: { equals: input.siteId }, emailHash: { equals: phoneHash } },
      limit: 1,
      overrideAccess: true,
    })
    if (!existing.docs.length) {
      await payload.create({
        collection: 'suppressions',
        data: {
          site: input.siteId,
          emailHash: phoneHash,
          reason: 'unsubscribe',
          source: 'inbound-stop',
          global: true,
          scope: 'site',
          occurredAt: now(),
          details: { keyword: keywordResult.normalizedKeyword },
        },
        overrideAccess: true,
      })
    }

    // 3. Process inbound opt-out BEFORE anything else: Cancel any currently queued sends!
    const queuedSends = await payload.find({
      collection: 'telecom-deliveries',
      where: {
        recipientPhoneHash: { equals: phoneHash },
        status: { in: ['queued', 'sending'] },
      },
      limit: 500,
      overrideAccess: true,
    })

    for (const send of queuedSends.docs) {
      await payload.update({
        collection: 'telecom-deliveries',
        id: send.id,
        data: {
          status: 'cancelled',
          outcome: {
            code: 'suppressed-before-send',
            reason: 'inbound-stop',
            keyword: keywordResult.normalizedKeyword,
          },
        },
        overrideAccess: true,
      })
    }

    const autoResponse = `You have unsubscribed from ${brand} messages. No further messages will be sent. Reply HELP for help or START to resubscribe.`
    return {
      action: 'opt-out',
      autoResponse,
      suppressionRecorded: true,
      deliveriesCancelled: queuedSends.docs.length,
    }
  }

  // HELP handling
  if (keywordResult.action === 'help') {
    const autoResponse = `${brand} Alerts: Approx 2-4 msgs/mo. Msg&data rates may apply. Reply STOP to cancel. Support: help@${brand.toLowerCase().replace(/[^a-z0-9]/g, '')}.test.`
    return {
      action: 'help',
      autoResponse,
    }
  }

  // START / Opt-In handling
  if (keywordResult.action === 'opt-in') {
    // Remove suppression if present
    const existing = await payload.find({
      collection: 'suppressions',
      where: { site: { equals: input.siteId }, emailHash: { equals: phoneHash } },
      limit: 10,
      overrideAccess: true,
    })
    for (const row of existing.docs) {
      await payload.delete({
        collection: 'suppressions',
        id: row.id,
        overrideAccess: true,
      })
    }

    // Record opt-in consent event
    await payload.create({
      collection: 'consent-events',
      data: {
        site: input.siteId,
        event: 'preference-granted',
        basis: 'inbound-keyword',
        channel: 'sms',
        purpose: 'marketing',
        occurredAt: now(),
        evidence: {
          keyword: keywordResult.normalizedKeyword,
          rawText: input.text,
          from: normalizedFrom.e164,
        },
      },
      overrideAccess: true,
    })

    const autoResponse = `You have resubscribed to ${brand} updates. Msg&data rates may apply. Reply STOP to cancel at any time.`
    return {
      action: 'opt-in',
      autoResponse,
    }
  }

  // Free-form message: Not a marketing reply bot! Route to staff if configured.
  if (input.staffRoutingEnabled) {
    await payload.create({
      collection: 'workflow-items',
      data: {
        site: input.siteId,
        title: `Inbound message from ${normalizedFrom.display}`,
        type: 'form-intake',
        status: 'open',
        priority: 'normal',
        comments: [
          {
            text: `Inbound telecom text: "${input.text}"`,
            from: normalizedFrom.e164,
            receivedAt: now(),
          },
        ],
        sourceReferences: {
          from: normalizedFrom.e164,
          to: input.toE164,
          providerMessageId: input.providerMessageId,
        },
      },
      overrideAccess: true,
    })
    return {
      action: 'staff-routed',
      autoResponse: `Thank you for your message. A team member from ${brand} has received your inquiry.`,
    }
  }

  return {
    action: 'acknowledged',
  }
}

// ============================================================================
// 4. Quiet Hours Evaluation
// ============================================================================

export function checkRecipientQuietHours(input: {
  currentTime: Date
  recipientTimezone?: string
  siteTimezone?: string
  policy?: QuietHoursPolicy
  isExemptPurpose?: boolean // Transactional / Security / Emergency
}): {
  isQuiet: boolean
  delayedUntil?: Date
  resolvedTimezone: string
} {
  if (input.isExemptPurpose) {
    return { isQuiet: false, resolvedTimezone: 'exempt' }
  }

  const effectivePolicy = input.policy ?? {
    startHour: 21,
    endHour: 8,
    siteTimezone: input.siteTimezone ?? 'UTC',
    unknownTimezonePolicy: 'conservative-intersection',
  }

  const quietCheck = isWithinQuietHours(input.currentTime, input.recipientTimezone, effectivePolicy)

  if (!quietCheck.isQuiet) {
    return { isQuiet: false, resolvedTimezone: quietCheck.resolvedTimezone }
  }

  const delayedUntil = calculateNextSendWindow(
    input.currentTime,
    input.recipientTimezone,
    effectivePolicy,
  )

  return {
    isQuiet: true,
    delayedUntil,
    resolvedTimezone: quietCheck.resolvedTimezone,
  }
}

// ============================================================================
// 5. Campaign Queueing and Durable Delivery
// ============================================================================

export async function queueTelecomCampaignDeliveries(
  payload: Store,
  messageId: string,
): Promise<{ queuedCount: number; skippedCount: number }> {
  const message = (await payload.findByID({
    collection: 'telecom-messages',
    id: messageId,
    depth: 0,
    overrideAccess: true,
  })) as Doc

  if (!message || !['scheduled', 'queued'].includes(message.status)) {
    return { queuedCount: 0, skippedCount: 0 }
  }

  const lists = Array.isArray(message.audience?.lists) ? message.audience.lists : []
  let queuedCount = 0
  let skippedCount = 0

  for (const listId of lists) {
    for (let page = 1; ; page++) {
      const memberships = await payload.find({
        collection: 'audience-memberships',
        where: { audienceList: { equals: listId }, status: { equals: 'active' } },
        limit: 100,
        page,
        depth: 1,
        overrideAccess: true,
      })

      for (const membership of memberships.docs as Doc[]) {
        const subscriber = membership.subscriber as Doc
        if (!subscriber || subscriber.status !== 'active') {
          skippedCount++
          continue
        }

        // Must have phone number
        const phoneRaw = subscriber.phoneE164 || subscriber.phone
        if (!phoneRaw) {
          skippedCount++
          continue
        }

        let normalized
        try {
          normalized = normalizeE164Phone(String(phoneRaw))
        } catch {
          skippedCount++
          continue
        }

        const phoneHash = telecomDigest(normalized.e164)

        // Consent check: Must have explicit SMS/RCS consent for this purpose
        const purpose = String(message.purpose || 'marketing')
        const hasConsent = await hasTelecomConsent(payload, {
          siteId: String(message.site),
          subscriberId: String(subscriber.id),
          phoneHash,
          purpose,
        })
        if (!hasConsent) {
          skippedCount++
          continue
        }

        // Stable idempotency key
        const key = telecomDeliveryIdempotencyKey(messageId, String(subscriber.id))
        const existing = await payload.find({
          collection: 'telecom-deliveries',
          where: { idempotencyKey: { equals: key } },
          limit: 1,
          overrideAccess: true,
        })

        if (existing.docs.length > 0) {
          continue
        }

        // Quiet hours check
        const quietEvaluation = checkRecipientQuietHours({
          currentTime: new Date(),
          recipientTimezone: subscriber.timezone,
          siteTimezone: 'UTC',
          isExemptPurpose: purpose === 'transactional' || purpose === 'alerts',
        })

        const delivery = await payload.create({
          collection: 'telecom-deliveries',
          data: {
            site: message.site,
            message: message.id,
            subscriber: subscriber.id,
            recipientPhone: normalized.e164,
            recipientPhoneHash: phoneHash,
            channel: message.channel ?? 'sms',
            idempotencyKey: key,
            status: 'queued',
            scheduledFor: quietEvaluation.delayedUntil?.toISOString() ?? message.scheduledFor,
            quietHoursDelayedUntil: quietEvaluation.delayedUntil?.toISOString(),
            messageSnapshot: {
              title: message.title,
              body: message.body,
              channel: message.channel,
              purpose: message.purpose,
              rcsContent: message.rcsContent,
              fallbackPolicy: message.fallbackPolicy,
              fallbackSmsBody: message.fallbackSmsBody,
            },
          },
          overrideAccess: true,
        })

        await payload.jobs.queue({
          task: 'audience-telecom-delivery',
          input: { deliveryId: delivery.id },
          queue: 'operations',
        })

        queuedCount++
      }

      if (!memberships.hasNextPage) break
    }
  }

  await payload.update({
    collection: 'telecom-messages',
    id: messageId,
    data: { status: 'queued' },
    overrideAccess: true,
  })

  return { queuedCount, skippedCount }
}
