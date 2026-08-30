import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { redact } from '../core/logging'

export const INTEGRATION_API_VERSION = 'v1'
export const MAX_WEBHOOK_PAYLOAD_BYTES = 256 * 1024
export const WEBHOOK_FAILURE_LIMIT = 5
export const INTEGRATION_SCOPES = [
  'site.read',
  'content.read',
  'content.draft.read',
  'content.draft.write',
  'content.schedule.read',
  'media.read',
  'capabilities.read',
  'commerce.catalog.read',
  'commerce.orders.read',
  'audience.read',
  'integrations.read',
  'webhooks.manage',
  'agent.invoke',
] as const
export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number]
export type IntegrationScopeTarget = {
  siteId: string
  publicationId?: string | null
  spaceId?: string | null
}

export type MachineCredential = IntegrationScopeTarget & {
  id: string
  name: string
  tokenPrefix: string
  tokenHash: string
  scopes: readonly IntegrationScope[]
  expiresAt: string | null
  revokedAt: string | null
}

export function issueMachineCredential(
  input: Omit<MachineCredential, 'tokenPrefix' | 'tokenHash'>,
) {
  const secret = randomBytes(32).toString('base64url')
  const tokenPrefix = `rgn_${input.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}_${randomBytes(5).toString('hex')}`
  const token = `${tokenPrefix}.${secret}`
  return { credential: { ...input, tokenPrefix, tokenHash: hashToken(token) }, token }
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export function authenticateMachineCredential(
  token: string | null | undefined,
  candidates: readonly MachineCredential[],
  now = new Date(),
): MachineCredential | null {
  if (!token?.startsWith('rgn_')) return null
  const prefix = token.split('.')[0]
  const client = candidates.find((candidate) => candidate.tokenPrefix === prefix)
  if (!client || client.revokedAt || (client.expiresAt && new Date(client.expiresAt) <= now))
    return null
  const expected = Buffer.from(client.tokenHash, 'hex')
  const actual = Buffer.from(hashToken(token), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? client : null
}
export function canAccess(
  credential: MachineCredential | null,
  scope: IntegrationScope,
  target: IntegrationScopeTarget,
) {
  return Boolean(
    credential &&
      credential.scopes.includes(scope) &&
      credential.siteId === target.siteId &&
      (!credential.publicationId || credential.publicationId === target.publicationId) &&
      (!credential.spaceId || credential.spaceId === target.spaceId),
  )
}

export type WebhookEnvelope = {
  id: string
  type: string
  occurredAt: string
  data: Record<string, unknown>
}
export function webhookPayload(event: WebhookEnvelope) {
  const raw = JSON.stringify({
    id: event.id,
    type: event.type,
    occurred_at: event.occurredAt,
    data: event.data,
  })
  if (Buffer.byteLength(raw) > MAX_WEBHOOK_PAYLOAD_BYTES)
    throw new Error('Webhook payload exceeds the size limit.')
  return raw
}
export const signWebhook = (raw: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
export function verifyWebhookSignature(raw: string, signature: string, secret: string) {
  const expected = signWebhook(raw, secret)
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
}
export function webhookRetry(input: {
  attempts: number
  responseStatus: number
  failureCount: number
}) {
  if (input.responseStatus >= 200 && input.responseStatus < 300)
    return { state: 'delivered' as const, nextAttemptAt: null, disable: false }
  const failures = input.failureCount + 1
  if (failures >= WEBHOOK_FAILURE_LIMIT)
    return { state: 'dead-letter' as const, nextAttemptAt: null, disable: true }
  const delaySeconds = Math.min(3600, 2 ** Math.max(0, input.attempts) * 30)
  return {
    state: 'retrying' as const,
    nextAttemptAt: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    disable: false,
  }
}
export function webhookAuditResponse(value: unknown) {
  return String(redact(value)).slice(0, 1024)
}
