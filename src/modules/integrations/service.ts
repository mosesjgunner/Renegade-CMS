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
  if (value instanceof Error) {
    return String(redact(value.message)).slice(0, 1024)
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(redact(value)).slice(0, 1024)
  }
  return String(redact(value)).slice(0, 1024)
}

export function rotateMachineCredential(client: MachineCredential) {
  const secret = randomBytes(32).toString('base64url')
  const tokenPrefix = `rgn_${client.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}_${randomBytes(5).toString('hex')}`
  const token = `${tokenPrefix}.${secret}`
  return {
    credential: {
      ...client,
      tokenPrefix,
      tokenHash: hashToken(token),
      revokedAt: null,
    },
    token,
  }
}

export type WebhookDiagnosisCategory =
  | 'delivered'
  | 'transient_network'
  | 'auth_failure'
  | 'rate_limited'
  | 'payload_rejected'
  | 'endpoint_error'
  | 'dead_letter'
  | 'unknown'

export type WebhookDeliveryDiagnosis = {
  category: WebhookDiagnosisCategory
  statusCode: number | null
  explanation: string
  nextSafeRepairAction: string
  canRedeliver: boolean
  backoffDelaySeconds: number | null
  isDeadLetter: boolean
}

export function diagnoseWebhookDelivery(input: {
  state: string
  attempts: number
  redactedResponse?: string | null
  lastError?: string | null
}): WebhookDeliveryDiagnosis {
  const isDelivered = input.state === 'delivered'
  const isDeadLetter = input.state === 'dead-letter'
  const text = (input.lastError || input.redactedResponse || '').trim()

  const statusMatch = text.match(/\b(?:HTTP\s+|status\s*:?\s*)?([1-5]\d{2})\b/i)
  const statusCode = statusMatch ? Number(statusMatch[1]) : null

  if (isDelivered) {
    return {
      category: 'delivered',
      statusCode: statusCode ?? 200,
      explanation: 'Delivery succeeded and was acknowledged by receiver.',
      nextSafeRepairAction: 'No repair needed; delivery succeeded.',
      canRedeliver: false,
      backoffDelaySeconds: null,
      isDeadLetter: false,
    }
  }

  const delaySeconds = Math.min(3600, 2 ** Math.max(0, input.attempts) * 30)

  if (statusCode === 401 || statusCode === 403 || /unauthorized|forbidden|signature|secret/i.test(text)) {
    return {
      category: 'auth_failure',
      statusCode: statusCode ?? 401,
      explanation: 'Receiver rejected authorization. Webhook secret mismatch or invalid signature.',
      nextSafeRepairAction: 'Verify shared secret on receiver. Use "Rotate Secret" to sync a fresh secret.',
      canRedeliver: true,
      backoffDelaySeconds: isDeadLetter ? null : delaySeconds,
      isDeadLetter,
    }
  }

  if (statusCode === 429 || /rate.?limit|too many requests/i.test(text)) {
    return {
      category: 'rate_limited',
      statusCode: statusCode ?? 429,
      explanation: 'Receiver rate limit exceeded. Exponential backoff is pacing delivery attempts.',
      nextSafeRepairAction: 'Wait for receiver capacity to recover or increase receiver rate limit.',
      canRedeliver: true,
      backoffDelaySeconds: isDeadLetter ? null : delaySeconds,
      isDeadLetter,
    }
  }

  if (statusCode === 413 || /payload too large|entity too large/i.test(text)) {
    return {
      category: 'payload_rejected',
      statusCode: statusCode ?? 413,
      explanation: 'Payload rejected because it exceeds size limits (maximum 256 KB).',
      nextSafeRepairAction: 'Review event payload size. Check receiver body parsing limits.',
      canRedeliver: false,
      backoffDelaySeconds: null,
      isDeadLetter,
    }
  }

  if (statusCode === 404) {
    return {
      category: 'endpoint_error',
      statusCode: 404,
      explanation: 'Webhook receiver target URL was not found (HTTP 404).',
      nextSafeRepairAction: 'Check receiver path in subscription configuration and update target URL.',
      canRedeliver: true,
      backoffDelaySeconds: isDeadLetter ? null : delaySeconds,
      isDeadLetter,
    }
  }

  if (statusCode && statusCode >= 500) {
    return {
      category: 'endpoint_error',
      statusCode,
      explanation: `Receiver responded with server error HTTP ${statusCode}.`,
      nextSafeRepairAction: isDeadLetter
        ? 'Receiver failed repeatedly. Resolve server errors and trigger manual redelivery.'
        : 'Inspect receiver server logs. Delivery will retry automatically with backoff.',
      canRedeliver: true,
      backoffDelaySeconds: isDeadLetter ? null : delaySeconds,
      isDeadLetter,
    }
  }

  if (/timeout|abort|econnrefused|fetch failed|network|599/i.test(text)) {
    return {
      category: 'transient_network',
      statusCode: statusCode ?? 599,
      explanation: 'Network connectivity timeout or connection refused (10s threshold).',
      nextSafeRepairAction: 'Check firewall and ensure target endpoint is publicly accessible.',
      canRedeliver: true,
      backoffDelaySeconds: isDeadLetter ? null : delaySeconds,
      isDeadLetter,
    }
  }

  if (isDeadLetter) {
    return {
      category: 'dead_letter',
      statusCode,
      explanation: `Exceeded maximum bounded retries (${WEBHOOK_FAILURE_LIMIT}). Subscription disabled.`,
      nextSafeRepairAction: 'Verify receiver endpoint health, re-enable subscription, and click Redeliver.',
      canRedeliver: true,
      backoffDelaySeconds: null,
      isDeadLetter: true,
    }
  }

  return {
    category: 'unknown',
    statusCode,
    explanation: text || 'Delivery failed or is queued for processing.',
    nextSafeRepairAction: 'Review endpoint logs and trigger manual redelivery if issue is fixed.',
    canRedeliver: true,
    backoffDelaySeconds: isDeadLetter ? null : delaySeconds,
    isDeadLetter,
  }
}

export function resolveNextSafeRepairAction(connection: {
  status: string
  providerKey: string
  lastError?: { code?: string; message?: string } | string | null
  lastHealthCheckAt?: string | null
  failureCount?: number
  expiresAt?: string | null
}): string {
  if (connection.status === 'expired') {
    return `Credentials expired${connection.expiresAt ? ` on ${new Date(connection.expiresAt).toLocaleDateString()}` : ''}. Rotate secret in Key Vault.`
  }
  if (connection.status === 'revoked' || connection.status === 'disconnected') {
    return 'Connection is disconnected or revoked. Issue a new credential to restore.'
  }
  if (connection.status === 'degraded') {
    const detail = typeof connection.lastError === 'object' && connection.lastError ? connection.lastError.message : connection.lastError
    return `Provider is degraded${detail ? `: ${detail}` : ''}. Run safe reconciliation to check capabilities.`
  }
  if (connection.status === 'unconfigured' || connection.status === 'invalid') {
    return 'Configuration incomplete. Set credential reference or required scopes in Key Vault.'
  }
  if (connection.status === 'disabled') {
    return (connection.failureCount ?? 0) >= WEBHOOK_FAILURE_LIMIT
      ? 'Auto-disabled due to delivery failure limit. Fix receiver endpoint and re-enable.'
      : 'Connection is disabled. Toggle status to resume operations.'
  }
  if (!connection.lastHealthCheckAt) {
    return 'Health check pending. Click Reconcile to verify provider without making external calls.'
  }
  return 'Healthy. No repair action required.'
}

export function reconcileProviderState(input: {
  providerKey: string
  status: string
  credentialRef?: string | null
  scopes?: readonly string[]
  expiresAt?: string | null
  now?: Date
}) {
  const now = input.now ?? new Date()
  const isExpired = input.expiresAt ? new Date(input.expiresAt) <= now : false
  const hasCredential = Boolean(input.credentialRef || input.status === 'active')

  const unconfiguredFeatures: string[] = []
  if (!input.scopes || input.scopes.length === 0) {
    unconfiguredFeatures.push('Explicit Scopes')
  }
  if (!input.credentialRef) {
    unconfiguredFeatures.push('Secret Manager Vault Ref')
  }

  let status = input.status
  let healthState: 'healthy' | 'warning' | 'critical' | 'unknown' = 'healthy'

  if (isExpired) {
    status = 'expired'
    healthState = 'warning'
  } else if (!hasCredential) {
    status = 'unconfigured'
    healthState = 'unknown'
  } else if (input.status === 'degraded') {
    healthState = 'warning'
  } else if (input.status === 'disabled' || input.status === 'revoked') {
    healthState = 'critical'
  }

  return {
    status,
    healthState,
    lastHealthCheckAt: now.toISOString(),
    lastSuccessAt: healthState === 'healthy' ? now.toISOString() : null,
    nextSafeRepairAction: resolveNextSafeRepairAction({
      status,
      providerKey: input.providerKey,
      expiresAt: input.expiresAt,
      lastHealthCheckAt: now.toISOString(),
    }),
    unconfiguredFeatures,
  }
}

export function safeDisconnectProviderState(input: {
  providerKey: string
  label: string
}) {
  return {
    status: 'disconnected' as const,
    revokedAt: new Date().toISOString(),
    auditAction: 'connection.disconnected',
    message: `Provider ${input.label} (${input.providerKey}) was disconnected safely. Canonical data and audit records were preserved.`,
  }
}

