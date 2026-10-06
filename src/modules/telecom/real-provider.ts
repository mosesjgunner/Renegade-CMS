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
  channels: ['sms'],
  rcs: {
    basic: false,
    richCards: false,
    carousels: false,
    capabilityLookup: false,
    verifiedSender: false,
  },
  senderTypes: ['shortcode', 'longcode', 'toll-free', 'alphanumeric'],
  supportedDestinations: ['*'],
  rateLimits: {
    messagesPerSecond: 10,
    maxBurst: 50,
  },
  supportsInboundKeywords: false,
  supportsDeliveryReceipts: false,
  supportsReconciliation: false,
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
    channelCapabilities: ['sms'],
    contract: twilioProviderCapabilities,

    async lookupRecipientCapability(recipientPhone: string): Promise<RecipientTelecomCapability> {
      // No carrier capability lookup is implemented; do not advertise RCS readiness.
      return {
        phone: recipientPhone,
        rcsSupported: false,
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
        status: 'degraded',
        reason: 'Sender registration and carrier approval have not been verified by this adapter.',
        sender: sender ?? {
          from: activeFrom,
          type: activeFrom.startsWith('MG') ? 'toll-free' : 'longcode',
        },
        registrationStatus: 'pending',
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

      if (request.channel !== 'sms')
        return {
          ok: false,
          provider: 'twilio-telecom',
          failure: {
            kind: 'permanent',
            code: 'capability_mismatch',
            message: 'This adapter implements SMS only. RCS/MMS dispatch is unavailable.',
          },
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
        if (config.messagingServiceSid)
          params.set('MessagingServiceSid', config.messagingServiceSid)
        else params.set('From', config.fromNumber || request.from || '')
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
            failure: {
              ...normalizeTelecomError(body),
              message: String(redact(normalizeTelecomError(body).message, secrets)),
            },
          }
        }

        const data = (await res.json()) as { sid?: string; status?: string }
        if (!data.sid || !/^SM[a-f0-9]{32}$/i.test(data.sid))
          return {
            ok: false,
            provider: 'twilio-telecom',
            failure: {
              kind: 'unknown',
              code: 'unknown_outcome',
              message:
                'Provider acceptance did not include a usable message identifier. Reconciliation is required.',
            },
          }
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
          failure: {
            ...normalizeTelecomError(err),
            message: String(redact(normalizeTelecomError(err).message, secrets)),
          },
        }
      }
    },
  }
}
