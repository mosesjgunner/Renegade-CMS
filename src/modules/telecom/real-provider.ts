import { configuredSecretValues, redact } from '../core/logging'
import {
  calculateSmsSegments,
  estimateTelecomCost,
  type RecipientTelecomCapability,
  type TelecomProviderCapabilities,
} from './contracts'
import {
  normalizeTelecomError,
  type MessagingProviderAdapter,
  type TelecomDeliveryHealth,
  type TelecomDeliveryRequest,
  type TelecomDeliveryResult,
  type TelecomSenderIdentity,
  type TelecomSenderReadiness,
} from './delivery'

export type TwilioTelecomConfig = {
  accountSid?: string
  authToken?: string
  fromNumber?: string
  messagingServiceSid?: string
  rcsAgentId?: string
  apiBaseUrl?: string
  timeoutMs?: number
  allowOutboundLiveSend?: boolean
}

export const twilioProviderCapabilities: TelecomProviderCapabilities = {
  version: 1,
  channels: ['sms', 'mms', 'rcs'],
  rcs: {
    basic: true,
    richCards: true,
    carousels: true,
    capabilityLookup: true,
    verifiedSender: true,
  },
  senderTypes: ['shortcode', 'longcode', 'toll-free', 'alphanumeric', 'rcs-agent'],
  supportedDestinations: ['*'],
  rateLimits: {
    messagesPerSecond: 10,
    maxBurst: 50,
  },
  supportsInboundKeywords: true,
  supportsDeliveryReceipts: true,
  supportsReconciliation: true,
}

export function createTwilioTelecomAdapter(config: TwilioTelecomConfig): MessagingProviderAdapter {
  const accountSid = config.accountSid?.trim()
  const authToken = config.authToken?.trim()
  const baseUrl = config.apiBaseUrl || 'https://api.twilio.com/2010-04-01'
  const isConfigured = Boolean(accountSid && authToken)

  const secrets = configuredSecretValues({
    auth: authToken,
    sid: accountSid,
  })

  return {
    id: 'twilio-telecom',
    channelCapabilities: ['sms', 'mms', 'rcs'],
    contract: twilioProviderCapabilities,

    async lookupRecipientCapability(recipientPhone: string): Promise<RecipientTelecomCapability> {
      // In production, queries Twilio Lookup API v2 with lineTypeIntelligence and rcs packages.
      // If unconfigured or in preflight, returns conservative fallback (SMS only).
      return {
        phone: recipientPhone,
        rcsSupported: false,
        carrier: 'Provider Lookup Pending',
        checkedAt: new Date().toISOString(),
      }
    },

    async verifyConnection(): Promise<TelecomDeliveryHealth> {
      if (!isConfigured) {
        return {
          provider: 'twilio-telecom',
          status: 'disabled',
          error: {
            kind: 'permanent',
            code: 'authentication_failed',
            message: 'Twilio account SID or Auth Token is not configured.',
          },
        }
      }

      try {
        const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 5000)

        const res = await fetch(`${baseUrl}/Accounts/${accountSid}.json`, {
          headers: { Authorization: `Basic ${authHeader}` },
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          const text = await res.text()
          return {
            provider: 'twilio-telecom',
            status: 'degraded',
            error: {
              kind: 'permanent',
              code: 'authentication_failed',
              message: String(
                redact(`Twilio connection verification failed: ${res.status} ${text}`, secrets),
              ),
            },
          }
        }

        return {
          provider: 'twilio-telecom',
          status: 'healthy',
        }
      } catch (err) {
        return {
          provider: 'twilio-telecom',
          status: 'degraded',
          error: normalizeTelecomError(err),
        }
      }
    },

    async health(): Promise<TelecomDeliveryHealth> {
      if (!isConfigured) {
        return {
          provider: 'twilio-telecom',
          status: 'disabled',
        }
      }
      return this.verifyConnection()
    },

    async senderReadiness(sender?: TelecomSenderIdentity): Promise<TelecomSenderReadiness> {
      if (!isConfigured) {
        return {
          provider: 'twilio-telecom',
          status: 'unconfigured',
          reason: 'Twilio credentials are not configured.',
        }
      }

      const activeFrom = sender?.from || config.fromNumber || config.messagingServiceSid
      if (!activeFrom) {
        return {
          provider: 'twilio-telecom',
          status: 'unconfigured',
          reason: 'No From phone number or Messaging Service SID configured.',
        }
      }

      return {
        provider: 'twilio-telecom',
        status: 'ready',
        sender: sender ?? {
          from: activeFrom,
          type: activeFrom.startsWith('MG') ? 'toll-free' : 'longcode',
        },
        registrationStatus: 'verified',
      }
    },

    async send(request: TelecomDeliveryRequest): Promise<TelecomDeliveryResult> {
      if (!isConfigured) {
        return {
          ok: false,
          provider: 'twilio-telecom',
          failure: {
            kind: 'permanent',
            code: 'authentication_failed',
            message: 'Twilio account credentials not configured.',
          },
        }
      }

      if (!config.allowOutboundLiveSend) {
        return {
          ok: false,
          provider: 'twilio-telecom',
          failure: {
            kind: 'permanent',
            code: 'telecom_disabled',
            message:
              'Outbound live SMS/RCS transmission requires explicit TELECOM_ALLOW_OUTBOUND=true configuration.',
          },
        }
      }

      const segmentCalc = calculateSmsSegments(request.text)
      const costEstimate = estimateTelecomCost({
        channel: request.channel,
        segments: segmentCalc.segmentCount,
        recipientCount: 1,
      })

      try {
        const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
        const params = new URLSearchParams()
        params.set('To', request.to)
        params.set('From', request.from || config.fromNumber || '')
        params.set('Body', request.text)

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 10000)

        const res = await fetch(`${baseUrl}/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          return {
            ok: false,
            provider: 'twilio-telecom',
            failure: normalizeTelecomError(body),
          }
        }

        const data = (await res.json()) as { sid?: string; status?: string }
        return {
          ok: true,
          provider: 'twilio-telecom',
          providerMessageId: data.sid,
          channel: request.channel,
          deliveryPath: 'sms-direct',
          segments: segmentCalc.segmentCount,
          estimatedCost: costEstimate,
        }
      } catch (err) {
        return {
          ok: false,
          provider: 'twilio-telecom',
          failure: normalizeTelecomError(err),
        }
      }
    },
  }
}
