/* eslint-disable @typescript-eslint/no-explicit-any -- Payload collection documents are runtime-shaped. */
import { randomUUID } from 'node:crypto'

import type { ExecutionEvent } from '../execution/contracts'
import {
  MAX_WEBHOOK_PAYLOAD_BYTES,
  signWebhook,
  webhookAuditResponse,
  webhookPayload,
  webhookRetry,
} from './service'

export const WEBHOOK_PAYLOAD_VERSION = '2026-08-31'
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300

type Store = {
  find: (args: any) => Promise<{ docs: Array<Record<string, any>> }>
  findByID: (args: any) => Promise<Record<string, any>>
  create: (args: any) => Promise<Record<string, any>>
  update: (args: any) => Promise<Record<string, any>>
}

export type WebhookSecretResolver = (reference: string) => Promise<string | null>

/** Production references are resolved at delivery time; the value is never persisted or logged. */
export const resolveWebhookSecret: WebhookSecretResolver = async (reference) => {
  const key = `WEBHOOK_SECRET_${reference.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`
  return process.env[key] ?? null
}

const id = (value: unknown) =>
  String(typeof value === 'object' && value ? (value as { id?: unknown }).id : value)
const supportedTarget = (target: string) => {
  const url = new URL(target)
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && url.protocol === 'http:'))
    throw new Error('Webhook targets must use HTTPS.')
  if (url.username || url.password || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Webhook target is not permitted.')
  return url
}

export function webhookDeliverySignature(raw: string, secret: string, timestamp: string) {
  return `t=${timestamp},v1=${signWebhook(`${timestamp}.${raw}`, secret).slice('sha256='.length)}`
}

export function verifyWebhookDeliverySignature(input: {
  raw: string
  signature: string | null
  secret: string
  now?: Date
  toleranceSeconds?: number
}) {
  const match = input.signature?.match(/^t=(\d+),v1=([a-f0-9]{64})$/)
  if (!match) return { valid: false, reason: 'malformed' as const }
  const timestamp = Number(match[1])
  const now = input.now ?? new Date()
  if (
    Math.abs(now.getTime() / 1000 - timestamp) >
    (input.toleranceSeconds ?? WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS)
  )
    return { valid: false, reason: 'stale' as const }
  const expected = webhookDeliverySignature(input.raw, input.secret, String(timestamp))
  return {
    valid: expected === input.signature,
    reason: expected === input.signature ? null : ('invalid' as const),
  }
}

export function externalWebhookEnvelope(event: ExecutionEvent) {
  if (event.privacyClass !== 'public') return null
  return {
    id: event.id,
    type: event.eventType,
    occurred_at: event.occurredAt,
    api_version: WEBHOOK_PAYLOAD_VERSION,
    data: event.payload,
  }
}

/** Called by the durable outbox consumer, after the business transaction has committed. */
export async function enqueueWebhookDeliveries(store: Store, event: ExecutionEvent) {
  const envelope = externalWebhookEnvelope(event)
  if (!envelope) return 0
  const subscriptions = await store.find({
    collection: 'webhook-subscriptions',
    where: { and: [{ site: { equals: event.siteId } }, { status: { equals: 'active' } }] },
    depth: 0,
    limit: 1000,
    overrideAccess: true,
  })
  let queued = 0
  for (const subscription of subscriptions.docs) {
    if (!Array.isArray(subscription.events) || !subscription.events.includes(event.eventType))
      continue
    const idempotencyKey = `webhook:${id(subscription.id)}:${event.id}`
    const existing = await store.find({
      collection: 'webhook-deliveries',
      where: { idempotencyKey: { equals: idempotencyKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs.length) continue
    await store.create({
      collection: 'webhook-deliveries',
      data: {
        subscription: subscription.id,
        eventId: event.id,
        eventType: event.eventType,
        payload: envelope,
        idempotencyKey,
        state: 'queued',
        attempts: 0,
      },
      overrideAccess: true,
    })
    queued++
  }
  return queued
}

export async function deliverWebhook(
  store: Store,
  deliveryId: string,
  resolveSecret: WebhookSecretResolver = resolveWebhookSecret,
  request: typeof fetch = fetch,
) {
  const delivery = await store.findByID({
    collection: 'webhook-deliveries',
    id: deliveryId,
    depth: 0,
    overrideAccess: true,
  })
  if (['delivered', 'dead-letter'].includes(String(delivery.state))) return delivery
  const subscription = await store.findByID({
    collection: 'webhook-subscriptions',
    id: id(delivery.subscription),
    depth: 0,
    overrideAccess: true,
  })
  if (subscription.status !== 'active') return delivery
  let raw = ''
  try {
    supportedTarget(String(subscription.target))
    raw = JSON.stringify(delivery.payload)
    if (Buffer.byteLength(raw) > MAX_WEBHOOK_PAYLOAD_BYTES)
      throw new Error('Webhook payload exceeds the size limit.')
    const secret = await resolveSecret(String(subscription.secretRef))
    if (!secret) throw new Error('Webhook secret reference could not be resolved.')
    const timestamp = String(Math.floor(Date.now() / 1000))
    const response = await request(String(subscription.target), {
      method: 'POST',
      body: raw,
      signal: AbortSignal.timeout(10_000),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'RenegadeCMS-Webhooks/1',
        'x-renegade-event': String(delivery.eventType),
        'x-renegade-delivery': String(delivery.id),
        'x-renegade-signature': webhookDeliverySignature(raw, secret, timestamp),
        'x-renegade-attempt': String(Number(delivery.attempts ?? 0) + 1),
      },
    })
    return completeDelivery(
      store,
      delivery,
      subscription,
      response.status,
      webhookAuditResponse(await response.text()),
    )
  } catch (error) {
    return completeDelivery(store, delivery, subscription, 599, webhookAuditResponse(error))
  }
}

async function completeDelivery(
  store: Store,
  delivery: Record<string, any>,
  subscription: Record<string, any>,
  status: number,
  response: string,
) {
  const retry = webhookRetry({
    attempts: Number(delivery.attempts ?? 0),
    responseStatus: status,
    failureCount: Number(subscription.failureCount ?? 0),
  })
  const attempts = Number(delivery.attempts ?? 0) + 1
  await store.update({
    collection: 'webhook-deliveries',
    id: delivery.id,
    data: {
      state: retry.state,
      attempts,
      nextAttemptAt: retry.nextAttemptAt,
      redactedResponse: response,
      lastError: retry.state === 'delivered' ? null : response,
    },
    overrideAccess: true,
  })
  await store.update({
    collection: 'webhook-subscriptions',
    id: subscription.id,
    data: {
      failureCount: retry.state === 'delivered' ? 0 : Number(subscription.failureCount ?? 0) + 1,
      status: retry.disable ? 'disabled' : subscription.status,
    },
    overrideAccess: true,
  })
  return { ...delivery, state: retry.state, attempts }
}

export async function redeliverWebhook(store: Store, deliveryId: string) {
  const previous = await store.findByID({
    collection: 'webhook-deliveries',
    id: deliveryId,
    depth: 0,
    overrideAccess: true,
  })
  return store.create({
    collection: 'webhook-deliveries',
    data: {
      subscription: id(previous.subscription),
      eventId: previous.eventId,
      eventType: previous.eventType,
      payload: previous.payload,
      idempotencyKey: `webhook:redelivery:${deliveryId}:${randomUUID()}`,
      state: 'queued',
      attempts: 0,
    },
    overrideAccess: true,
  })
}

export async function verifyWebhookEndpoint(
  target: string,
  secret: string,
  request: typeof fetch = fetch,
) {
  supportedTarget(target)
  const challenge = randomUUID()
  const raw = webhookPayload({
    id: challenge,
    type: 'webhook.endpoint.verify',
    occurredAt: new Date().toISOString(),
    data: { challenge, api_version: WEBHOOK_PAYLOAD_VERSION },
  })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const response = await request(target, {
    method: 'POST',
    body: raw,
    signal: AbortSignal.timeout(10_000),
    headers: {
      'content-type': 'application/json',
      'x-renegade-event': 'webhook.endpoint.verify',
      'x-renegade-signature': webhookDeliverySignature(raw, secret, timestamp),
    },
  })
  if (!response.ok)
    throw new Error(`Webhook endpoint verification failed with HTTP ${response.status}.`)
}
