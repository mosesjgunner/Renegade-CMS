import type { ConnectionScope, ToolManifest } from './contracts'

export type ApiClient = ConnectionScope & {
  id: string
  name: string
  status: 'active' | 'revoked'
  capabilityGrants: readonly string[]
  tokenHash: string
  expiresAt: string | null
}
export type WebhookSubscription = ConnectionScope & {
  id: string
  event: string
  eventVersion: number
  target: string
  secretRef: string
  capabilityGrants: readonly string[]
  status: 'active' | 'disabled'
}
export type WebhookDelivery = {
  id: string
  subscriptionId: string
  eventId: string
  idempotencyKey: string
  state: 'queued' | 'delivered' | 'retrying' | 'dead-letter'
  attempts: number
  redactedResponse: string | null
}
export const PUBLIC_MANIFESTS: readonly ToolManifest[] = [
  {
    name: 'content.read',
    version: 1,
    input: { cursor: 'string?', filter: 'object?' },
    output: { items: 'content[]', nextCursor: 'string?' },
    permission: 'content.read',
    dataSensitivity: 'public',
    rateLimit: '120/min',
    idempotency: 'none',
    approval: 'never',
    timeoutMs: 5000,
    audit: 'required',
    rollback: 'none',
  },
  {
    name: 'forms.submission.read',
    version: 1,
    input: { cursor: 'string?' },
    output: { items: 'submission[]', nextCursor: 'string?' },
    permission: 'forms.submission.read',
    dataSensitivity: 'restricted',
    rateLimit: '60/min',
    idempotency: 'none',
    approval: 'never',
    timeoutMs: 5000,
    audit: 'required',
    rollback: 'none',
  },
]
