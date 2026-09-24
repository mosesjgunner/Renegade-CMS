import type { AppConfig } from '../core/config'
import type {
  RecipientTelecomCapability,
  RcsContent,
  TelecomCostEstimate,
  TelecomDeliveryFailure,
  TelecomProviderCapabilities,
} from './contracts'

export type TelecomDeliveryRequest = {
  from: string
  to: string
  text: string
  channel: 'sms' | 'mms' | 'rcs'
  idempotencyKey: string
  purpose: 'marketing' | 'transactional' | 'alerts'
  rcs?: RcsContent
  fallbackPolicy?: 'prohibit' | 'allow-with-configured-text' | 'manual-review'
  fallbackSmsBody?: string
  scheduledFor?: string
  mediaUrls?: string[]
}

export type TelecomDeliveryResult =
  | {
      ok: true
      provider: string
      providerMessageId?: string
      channel: 'sms' | 'mms' | 'rcs'
      deliveryPath: 'sms-direct' | 'rcs-direct' | 'rcs-fallback-to-sms'
      segments?: number
      estimatedCost?: TelecomCostEstimate
    }
  | {
      ok: false
      provider: string
      failure: TelecomDeliveryFailure
    }

export type TelecomDeliveryHealth = {
  provider: string
  status: 'healthy' | 'disabled' | 'degraded'
  error?: TelecomDeliveryFailure
}

export type TelecomSenderIdentity = {
  from: string
  type: 'shortcode' | 'longcode' | 'toll-free' | 'alphanumeric' | 'rcs-agent'
  countryCode?: string
  rcsAgentId?: string
  brandName?: string
}

export type TelecomSenderReadiness = {
  provider: string
  status: 'ready' | 'unconfigured' | 'degraded' | 'carrier-blocked'
  sender?: TelecomSenderIdentity
  registrationStatus?: 'verified' | 'pending' | 'unregistered'
  reason?: string
}

export interface MessagingProviderAdapter {
  readonly id: string
  readonly channelCapabilities: readonly ('sms' | 'mms' | 'rcs')[]
  readonly contract: TelecomProviderCapabilities

  send(request: TelecomDeliveryRequest): Promise<TelecomDeliveryResult>
  health(): Promise<TelecomDeliveryHealth>
  verifyConnection(): Promise<TelecomDeliveryHealth>
  senderReadiness(sender?: TelecomSenderIdentity): Promise<TelecomSenderReadiness>
  lookupRecipientCapability?(recipientPhone: string): Promise<RecipientTelecomCapability>
  reconcile?(input: {
    idempotencyKey: string
    providerMessageId?: string
  }): Promise<TelecomDeliveryResult | null>
}

/** Disabled adapter used when telecom is not configured or explicitly disabled. */
export const disabledTelecomAdapter: MessagingProviderAdapter = {
  id: 'disabled-telecom',
  channelCapabilities: [],
  contract: {
    version: 1,
    channels: [],
    senderTypes: [],
    supportedDestinations: [],
    rateLimits: { messagesPerSecond: 0 },
    supportsInboundKeywords: false,
    supportsDeliveryReceipts: false,
    supportsReconciliation: false,
  },
  async send() {
    return {
      ok: false,
      provider: 'disabled-telecom',
      failure: {
        kind: 'permanent',
        code: 'telecom_disabled',
        message: 'Telecom transport is disabled or unconfigured in this environment.',
      },
    }
  },
  async health() {
    return {
      provider: 'disabled-telecom',
      status: 'disabled',
    }
  },
  async verifyConnection() {
    return {
      provider: 'disabled-telecom',
      status: 'disabled',
    }
  },
  async senderReadiness() {
    return {
      provider: 'disabled-telecom',
      status: 'unconfigured',
      reason: 'Telecom transport is disabled.',
    }
  },
}

export function normalizeTelecomError(error: unknown): TelecomDeliveryFailure {
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>
    const code = String(err.code || err.status || '')
    const message = String(err.message || 'Telecom delivery error')

    if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
      return { kind: 'unknown', code: 'timeout', message }
    }
    if (code === '429' || code === 'rate_limit_exceeded') {
      return { kind: 'retryable', code: 'rate_limited', message, retryAfterSeconds: 5 }
    }
    if (code === '30001' || code === 'carrier_congestion') {
      return { kind: 'retryable', code: 'carrier_congestion', message }
    }
    if (code === '21211' || code === 'invalid_number') {
      return { kind: 'permanent', code: 'invalid_destination', message }
    }
    if (code === '21610' || code === 'stop_unsubscribed') {
      return { kind: 'permanent', code: 'unsubscribed_recipient', message }
    }
    if (code === '21408' || code === 'region_permission_denied') {
      return { kind: 'permanent', code: 'forbidden_route', message }
    }
    if (code === '401' || code === '20003') {
      return { kind: 'permanent', code: 'authentication_failed', message }
    }
    return { kind: 'permanent', code: 'provider_error', message, rawError: error }
  }
  return {
    kind: 'permanent',
    code: 'provider_error',
    message: String(error ?? 'Unknown telecom provider error'),
  }
}
