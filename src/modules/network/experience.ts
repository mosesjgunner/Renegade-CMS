import { createHash } from 'node:crypto'

import { normalizeRemoteIdentity } from './contracts'

export const NETWORK_LIMITS = {
  inboxPerMinute: 30,
  discoveryPerMinute: 12,
  fetchPerMinute: 20,
  followsPerHour: 40,
  invalidSignaturesPerHour: 8,
  maxRemoteObjectsPerActor: 250,
} as const

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/** A bounded, process-local circuit breaker. Deployments can replace this with shared rate limiting. */
export function takeNetworkQuota(
  operation: keyof typeof NETWORK_LIMITS,
  subject: string,
  now = Date.now(),
) {
  const period =
    operation === 'followsPerHour' || operation === 'invalidSignaturesPerHour' ? 3_600_000 : 60_000
  const key = createHash('sha256').update(`${operation}|${subject}`).digest('base64url')
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    if (buckets.size >= 10_000) buckets.clear()
    buckets.set(key, { count: 1, resetAt: now + period })
    return true
  }
  if (current.count >= NETWORK_LIMITS[operation]) return false
  current.count += 1
  return true
}

export type RemotePolicy = {
  default?: 'allow' | 'block'
  allowlist?: boolean
  hideBlockedReferences?: boolean
}
export type AccessDecision = {
  subject: string
  decision: 'allow' | 'block'
  expiresAt?: string | null
}

/** Explicit blocks always win; allowlist mode denies sources without an active allow decision. */
export function permitsRemoteSource(
  actorId: string,
  decisions: readonly AccessDecision[],
  policy: RemotePolicy = {},
  now = new Date(),
) {
  const actor = normalizeRemoteIdentity(actorId).toString()
  const origin = new URL(actor).origin
  const active = decisions.filter((item) => !item.expiresAt || new Date(item.expiresAt) > now)
  const decisionFor = (subject: string) => active.find((item) => item.subject === subject)?.decision
  if (decisionFor(actor) === 'block' || decisionFor(origin) === 'block') return false
  if (policy.allowlist || policy.default === 'block')
    return decisionFor(actor) === 'allow' || decisionFor(origin) === 'allow'
  return true
}

export function remoteProfileMetadata(document: Record<string, unknown>) {
  return {
    name: typeof document.name === 'string' ? document.name.slice(0, 500) : '',
    summary: typeof document.summary === 'string' ? document.summary.slice(0, 10_000) : '',
    url: typeof document.url === 'string' ? document.url : undefined,
    icon: document.icon,
    inbox: document.inbox,
    outbox: document.outbox,
    published: document.published,
    updated: document.updated,
  }
}

export function remoteObjectReference(document: Record<string, unknown>) {
  const id = typeof document.id === 'string' ? normalizeRemoteIdentity(document.id).toString() : ''
  if (!id) throw new Error('Remote object must have a canonical HTTPS id.')
  return {
    canonicalId: id,
    objectType: typeof document.type === 'string' ? document.type.slice(0, 120) : 'Object',
    reference: { ...remoteProfileMetadata(document), origin: new URL(id).origin, remoteOnly: true },
  }
}
