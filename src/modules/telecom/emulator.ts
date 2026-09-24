import { createHash, randomBytes } from 'node:crypto'
import {
  calculateSmsSegments,
  estimateTelecomCost,
  parseInboundKeyword,
  type RcsContent,
  type RecipientTelecomCapability,
  type TelecomCostEstimate,
  type TelecomDeliveryFailure,
  type TelecomProviderCapabilities,
} from './contracts'
import type {
  MessagingProviderAdapter,
  TelecomDeliveryHealth,
  TelecomDeliveryRequest,
  TelecomDeliveryResult,
  TelecomSenderIdentity,
  TelecomSenderReadiness,
} from './delivery'

export type TelecomEmulatorSimulation =
  | 'success'
  | 'rate_limited'
  | 'carrier_congestion'
  | 'carrier_rejected'
  | 'timeout'
  | 'unknown_outcome'
  | 'delay'

export type TelecomEmulatorReceipt = {
  providerMessageId: string
  idempotencyKey: string
  from: string
  to: string
  channel: 'sms' | 'mms' | 'rcs'
  deliveryPath: 'sms-direct' | 'rcs-direct' | 'rcs-fallback-to-sms'
  text: string
  rcs?: RcsContent
  segments: number
  costEstimate: TelecomCostEstimate
  receivedAt: string
}

export type TelecomInboundEvent = {
  providerMessageId: string
  from: string
  to: string
  text: string
  keywordAction: 'opt-out' | 'opt-in' | 'help' | 'unknown'
  occurredAt: string
}

const emulatorReceipts = new Map<string, TelecomEmulatorReceipt>()
const emulatorCapabilities = new Map<string, { rcsSupported: boolean; carrier?: string }>()
const emulatorSimulations = new Map<string, TelecomEmulatorSimulation>()
const emulatorInboundHistory: TelecomInboundEvent[] = []

export function resetTelecomEmulator() {
  emulatorReceipts.clear()
  emulatorCapabilities.clear()
  emulatorSimulations.clear()
  emulatorInboundHistory.length = 0
}

export function getTelecomEmulatorReceipts(): TelecomEmulatorReceipt[] {
  return [...emulatorReceipts.values()]
}

export function setEmulatorRecipientCapability(
  phone: string,
  capability: { rcsSupported: boolean; carrier?: string },
) {
  emulatorCapabilities.set(phone, capability)
}

export function setEmulatorSimulation(keyOrPhone: string, simulation: TelecomEmulatorSimulation) {
  emulatorSimulations.set(keyOrPhone, simulation)
}

export function getEmulatorInboundHistory(): TelecomInboundEvent[] {
  return [...emulatorInboundHistory]
}

export const telecomEmulatorCapabilities: TelecomProviderCapabilities = {
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
    messagesPerSecond: 100,
    maxBurst: 200,
  },
  supportsInboundKeywords: true,
  supportsDeliveryReceipts: true,
  supportsReconciliation: true,
}

export const deterministicTelecomEmulator: MessagingProviderAdapter = {
  id: 'telecom-emulator',
  channelCapabilities: ['sms', 'mms', 'rcs'],
  contract: telecomEmulatorCapabilities,

  async lookupRecipientCapability(recipientPhone: string): Promise<RecipientTelecomCapability> {
    const found = emulatorCapabilities.get(recipientPhone)
    return {
      phone: recipientPhone,
      rcsSupported: Boolean(found?.rcsSupported),
      carrier: found?.carrier ?? 'Emulator Carrier',
      checkedAt: new Date().toISOString(),
    }
  },

  async send(request: TelecomDeliveryRequest): Promise<TelecomDeliveryResult> {
    // Check if duplicate idempotency key already succeeded
    if (emulatorReceipts.has(request.idempotencyKey)) {
      const existing = emulatorReceipts.get(request.idempotencyKey)!
      return {
        ok: true,
        provider: 'telecom-emulator',
        providerMessageId: existing.providerMessageId,
        channel: existing.channel,
        deliveryPath: existing.deliveryPath,
        segments: existing.segments,
        estimatedCost: existing.costEstimate,
      }
    }

    // Check simulations by idempotencyKey or recipient phone
    const sim =
      emulatorSimulations.get(request.idempotencyKey) || emulatorSimulations.get(request.to)

    if (sim === 'rate_limited') {
      return {
        ok: false,
        provider: 'telecom-emulator',
        failure: {
          kind: 'retryable',
          code: 'rate_limited',
          message: 'Rate limit exceeded on messaging route.',
          retryAfterSeconds: 2,
        },
      }
    }

    if (sim === 'carrier_congestion') {
      return {
        ok: false,
        provider: 'telecom-emulator',
        failure: {
          kind: 'retryable',
          code: 'carrier_congestion',
          message: 'Upstream mobile operator congestion.',
        },
      }
    }

    if (sim === 'carrier_rejected') {
      return {
        ok: false,
        provider: 'telecom-emulator',
        failure: {
          kind: 'permanent',
          code: 'carrier_rejected' as any,
          message: 'Destination number is unreachable or rejected by carrier.',
        },
      }
    }

    if (sim === 'timeout') {
      return {
        ok: false,
        provider: 'telecom-emulator',
        failure: {
          kind: 'unknown',
          code: 'timeout',
          message: 'Gateway socket connection timed out before delivery response.',
        },
      }
    }

    if (sim === 'unknown_outcome') {
      return {
        ok: false,
        provider: 'telecom-emulator',
        failure: {
          kind: 'unknown',
          code: 'unknown_outcome',
          message: 'Provider returned an indeterminate gateway error without message ID.',
        },
      }
    }

    // Channel routing logic
    let effectiveChannel: 'sms' | 'mms' | 'rcs' = request.channel
    let deliveryPath: 'sms-direct' | 'rcs-direct' | 'rcs-fallback-to-sms' = 'sms-direct'
    let effectiveText = request.text

    if (request.channel === 'rcs') {
      const recipientCap = await this.lookupRecipientCapability!(request.to)
      if (recipientCap.rcsSupported) {
        effectiveChannel = 'rcs'
        deliveryPath = 'rcs-direct'
      } else {
        // Recipient is not RCS capable: evaluate explicit fallback policy
        const policy = request.fallbackPolicy ?? 'prohibit'
        if (policy === 'allow-with-configured-text') {
          if (!request.fallbackSmsBody?.trim()) {
            return {
              ok: false,
              provider: 'telecom-emulator',
              failure: {
                kind: 'permanent',
                code: 'rcs_not_supported_no_fallback',
                message:
                  'Recipient does not support RCS and no valid fallback SMS text was configured.',
              },
            }
          }
          effectiveChannel = 'sms'
          deliveryPath = 'rcs-fallback-to-sms'
          effectiveText = request.fallbackSmsBody
        } else if (policy === 'manual-review') {
          return {
            ok: false,
            provider: 'telecom-emulator',
            failure: {
              kind: 'permanent',
              code: 'capability_mismatch',
              message:
                'Recipient does not support RCS; message is held for operator manual review.',
            },
          }
        } else {
          // prohibit fallback
          return {
            ok: false,
            provider: 'telecom-emulator',
            failure: {
              kind: 'permanent',
              code: 'rcs_not_supported_no_fallback',
              message:
                'Recipient does not support RCS and fallback to SMS is prohibited by message policy.',
            },
          }
        }
      }
    }

    // Calculate segments and costs
    const segmentCalc = calculateSmsSegments(effectiveText)
    const costEstimate = estimateTelecomCost({
      channel: effectiveChannel,
      segments: segmentCalc.segmentCount,
      recipientCount: 1,
      isRichCard: Boolean(request.rcs?.cards && request.rcs.cards.length > 0),
    })

    const providerMessageId = `emul-msg-${randomBytes(12).toString('hex')}`
    const receipt: TelecomEmulatorReceipt = {
      providerMessageId,
      idempotencyKey: request.idempotencyKey,
      from: request.from,
      to: request.to,
      channel: effectiveChannel,
      deliveryPath,
      text: effectiveText,
      rcs: request.rcs,
      segments: segmentCalc.segmentCount,
      costEstimate,
      receivedAt: new Date().toISOString(),
    }

    emulatorReceipts.set(request.idempotencyKey, receipt)

    return {
      ok: true,
      provider: 'telecom-emulator',
      providerMessageId,
      channel: effectiveChannel,
      deliveryPath,
      segments: segmentCalc.segmentCount,
      estimatedCost: costEstimate,
    }
  },

  async health(): Promise<TelecomDeliveryHealth> {
    return {
      provider: 'telecom-emulator',
      status: 'healthy',
    }
  },

  async verifyConnection(): Promise<TelecomDeliveryHealth> {
    return {
      provider: 'telecom-emulator',
      status: 'healthy',
    }
  },

  async senderReadiness(sender?: TelecomSenderIdentity): Promise<TelecomSenderReadiness> {
    if (!sender?.from) {
      return {
        provider: 'telecom-emulator',
        status: 'unconfigured',
        reason: 'No sender identity provided.',
      }
    }
    return {
      provider: 'telecom-emulator',
      status: 'ready',
      sender,
      registrationStatus: 'verified',
    }
  },

  async reconcile(input: {
    idempotencyKey: string
    providerMessageId?: string
  }): Promise<TelecomDeliveryResult | null> {
    const existing = emulatorReceipts.get(input.idempotencyKey)
    if (!existing) return null

    return {
      ok: true,
      provider: 'telecom-emulator',
      providerMessageId: existing.providerMessageId,
      channel: existing.channel,
      deliveryPath: existing.deliveryPath,
      segments: existing.segments,
      estimatedCost: existing.costEstimate,
    }
  },
}

/**
 * Simulates receiving an inbound SMS/RCS message to the emulator.
 */
export function simulateInboundTelecomMessage(input: {
  from: string
  to: string
  text: string
}): TelecomInboundEvent {
  const keywordResult = parseInboundKeyword(input.text)
  const event: TelecomInboundEvent = {
    providerMessageId: `emul-inbound-${randomBytes(8).toString('hex')}`,
    from: input.from,
    to: input.to,
    text: input.text,
    keywordAction: keywordResult.action,
    occurredAt: new Date().toISOString(),
  }
  emulatorInboundHistory.push(event)
  return event
}
