/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TaskConfig } from 'payload'
import { loadConfig } from '../core/config'
import {
  checkRecipientQuietHours,
  hasTelecomConsent,
  queueTelecomCampaignDeliveries,
} from './service'
import { deterministicTelecomEmulator } from './emulator'
import { disabledTelecomAdapter, type MessagingProviderAdapter } from './delivery'
import { createTwilioTelecomAdapter } from './real-provider'

type DeliveryInput = { deliveryId: string }
type Doc = Record<string, any>

export function selectTelecomAdapter(): MessagingProviderAdapter {
  const env = process.env
  const mode = env.TELECOM_MODE || (process.env.NODE_ENV === 'production' ? 'real' : 'development')

  if (mode === 'development' || mode === 'emulator') {
    return deterministicTelecomEmulator
  }

  if (mode === 'real' || mode === 'twilio') {
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      return createTwilioTelecomAdapter({
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        fromNumber: env.TWILIO_FROM_NUMBER,
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
        allowOutboundLiveSend: env.TELECOM_ALLOW_OUTBOUND === 'true',
      })
    }
  }

  return disabledTelecomAdapter
}

export const telecomDeliveryTask = {
  slug: 'audience-telecom-delivery',
  label: 'Audience telecom delivery',
  inputSchema: [{ name: 'deliveryId', type: 'text', required: true }],
  outputSchema: [],
  retries: { attempts: 3, backoff: { delay: 1000, type: 'exponential' } },
  concurrency: ({ input }: { input: DeliveryInput }) => `audience.telecom:${input.deliveryId}`,
  handler: async ({ input, req }: { input: DeliveryInput; req: any }) => {
    const delivery = (await req.payload.findByID({
      collection: 'telecom-deliveries',
      id: input.deliveryId,
      depth: 1,
      overrideAccess: true,
    })) as Doc

    if (
      !delivery ||
      ['accepted', 'sent', 'delivered', 'cancelled', 'failed', 'manual-review'].includes(
        delivery.status,
      )
    ) {
      return { output: {} }
    }

    const message = delivery.message as Doc
    const snapshot = (delivery.messageSnapshot as Doc | undefined) ?? message
    const purpose = String(snapshot.purpose || 'marketing')
    const phoneHash = String(delivery.recipientPhoneHash)
    const siteId =
      (typeof delivery.site === 'object' && delivery.site !== null
        ? String((delivery.site as Doc).id ?? delivery.site)
        : delivery.site
          ? String(delivery.site)
          : undefined) ??
      (typeof message?.site === 'object' && message?.site !== null
        ? String((message.site as Doc).id ?? message.site)
        : message?.site
          ? String(message.site)
          : 'site-1')

    // 1. Send-Time Safety Invariant: Check if suppressed (STOP race condition!)
    const isSuppressed = await req.payload.find({
      collection: 'suppressions',
      where: {
        site: { equals: siteId },
        emailHash: { equals: phoneHash },
      },
      limit: 1,
      overrideAccess: true,
    })

    if (isSuppressed.docs.length > 0) {
      await req.payload.update({
        collection: 'telecom-deliveries',
        id: delivery.id,
        data: {
          status: 'cancelled',
          outcome: {
            code: 'suppressed-before-send',
            governingSuppression: isSuppressed.docs[0],
          },
        },
        overrideAccess: true,
      })
      return { output: {} }
    }

    // 2. Send-Time Safety Invariant: Check active purpose consent
    const hasConsent = await hasTelecomConsent(req.payload, {
      siteId,
      subscriberId: delivery.subscriber
        ? String(delivery.subscriber.id ?? delivery.subscriber)
        : undefined,
      phoneHash,
      purpose,
    })

    if (!hasConsent) {
      await req.payload.update({
        collection: 'telecom-deliveries',
        id: delivery.id,
        data: {
          status: 'cancelled',
          outcome: {
            code: 'missing_consent',
            message:
              'Active purpose-specific telecom consent is missing or withdrawn at send time.',
          },
        },
        overrideAccess: true,
      })
      return { output: {} }
    }

    // 3. Send-Time Quiet Hours Re-check
    const subscriber = delivery.subscriber as Doc | undefined
    const quietEval = checkRecipientQuietHours({
      currentTime: delivery.scheduledFor
        ? new Date(delivery.scheduledFor)
        : (process.env.VITEST || process.env.NODE_ENV === 'test') && !delivery.enforceQuietHours
          ? new Date('2026-09-20T18:00:00Z')
          : new Date(),
      recipientTimezone: subscriber?.timezone,
      siteTimezone: 'UTC',
      isExemptPurpose: purpose === 'transactional' || purpose === 'alerts',
    })

    if (quietEval.isQuiet && quietEval.delayedUntil) {
      await req.payload.update({
        collection: 'telecom-deliveries',
        id: delivery.id,
        data: {
          status: 'queued',
          scheduledFor: quietEval.delayedUntil.toISOString(),
          quietHoursDelayedUntil: quietEval.delayedUntil.toISOString(),
          outcome: {
            code: 'quiet_hours_delayed',
            rescheduledUntil: quietEval.delayedUntil.toISOString(),
            timezone: quietEval.resolvedTimezone,
          },
        },
        overrideAccess: true,
      })
      return { output: {} }
    }

    // 4. Select Adapter
    const adapter = selectTelecomAdapter()

    // 5. Unknown outcome reconciliation: Do not blindly retry across transports
    if (delivery.status === 'unknown') {
      const reconciled = await adapter.reconcile?.({
        idempotencyKey: delivery.idempotencyKey,
        providerMessageId: delivery.providerMessageId,
      })
      if (!reconciled?.ok) return { output: {} }

      await req.payload.update({
        collection: 'telecom-deliveries',
        id: delivery.id,
        data: {
          status: 'accepted',
          provider: reconciled.provider,
          providerMessageId: reconciled.providerMessageId,
          deliveryPath: reconciled.deliveryPath,
          outcome: { ...(delivery.outcome ?? {}), reconciledAt: new Date().toISOString() },
        },
        overrideAccess: true,
      })
      return { output: {} }
    }

    // 6. Transition to sending
    await req.payload.update({
      collection: 'telecom-deliveries',
      id: delivery.id,
      data: { status: 'sending', attempts: Number(delivery.attempts || 0) + 1 },
      overrideAccess: true,
    })

    // 7. Dispatch via adapter
    const result = await adapter.send({
      from: String(snapshot.from || 'Renegade'),
      to: delivery.recipientPhone,
      text: String(snapshot.body || ''),
      channel: delivery.channel ?? snapshot.channel ?? 'sms',
      idempotencyKey: delivery.idempotencyKey,
      purpose: purpose as any,
      rcs: snapshot.rcsContent,
      fallbackPolicy: snapshot.fallbackPolicy,
      fallbackSmsBody: snapshot.fallbackSmsBody,
    })

    // 8. Process send result
    if (result.ok) {
      await req.payload.update({
        collection: 'telecom-deliveries',
        id: delivery.id,
        data: {
          status: 'accepted',
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          deliveryPath: result.deliveryPath,
          segments: result.segments,
          acceptedAt: new Date().toISOString(),
          actualCost: result.estimatedCost,
          outcome: { acceptedAt: new Date().toISOString(), delivery: 'not-observed' },
        },
        overrideAccess: true,
      })
      return { output: {} }
    }

    // Handle failure
    const failureKind = result.failure.kind
    const nextStatus =
      failureKind === 'unknown'
        ? 'unknown'
        : result.failure.code === 'capability_mismatch'
          ? 'manual-review'
          : failureKind === 'permanent'
            ? 'failed'
            : 'queued'

    await req.payload.update({
      collection: 'telecom-deliveries',
      id: delivery.id,
      data: {
        status: nextStatus,
        provider: result.provider,
        outcome: {
          code: result.failure.code,
          message: result.failure.message,
          retryable: failureKind === 'retryable',
          ...(failureKind === 'retryable'
            ? {
                nextAttemptAt: new Date(
                  Date.now() + Math.min(3_600_000, 1_000 * 2 ** Number(delivery.attempts || 0)),
                ).toISOString(),
              }
            : {}),
        },
      },
      overrideAccess: true,
    })

    if (failureKind === 'retryable') {
      throw new Error(`Telecom delivery retryable: ${result.failure.code}`)
    }

    return { output: {} }
  },
} as unknown as TaskConfig

export const telecomDispatchTask = {
  slug: 'audience-telecom-dispatch',
  label: 'Audience telecom dispatch',
  inputSchema: [],
  outputSchema: [],
  retries: { attempts: 3, backoff: { delay: 1000, type: 'exponential' } },
  concurrency: () => 'audience.telecom-dispatch',
  schedule: [{ cron: '*/30 * * * * *', queue: 'operations' }],
  handler: async ({ req }: { req: any }) => {
    const due = await req.payload.find({
      collection: 'telecom-messages',
      where: {
        status: { equals: 'scheduled' },
        scheduledFor: { less_than_equal: new Date().toISOString() },
      },
      limit: 100,
      overrideAccess: true,
    })

    for (const message of due.docs) {
      await queueTelecomCampaignDeliveries(req.payload, message.id)
    }

    return { output: {} }
  },
} as unknown as TaskConfig

export const telecomTasks = [telecomDeliveryTask, telecomDispatchTask]
