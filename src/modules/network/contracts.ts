import { createHash } from 'node:crypto'
export type NetworkInfo = {
  canonicalOrigin: string
  software: { name: string; version: string }
  enabledProtocols: readonly string[]
  registrationPolicy: 'closed' | 'invite' | 'open'
  networkPolicy: Record<string, unknown>
  publicContact?: Record<string, unknown>
}
export function normalizeRemoteIdentity(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Remote identity must be an HTTPS URL without credentials.')
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if (url.port === '443') url.port = ''
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
  return url
}
export const remoteIdentityKey = (value: string) => normalizeRemoteIdentity(value).toString()
export const deliveryIdempotencyKey = (protocol: string, target: string, payload: unknown) =>
  `network:${createHash('sha256')
    .update(`${protocol}|${remoteIdentityKey(target)}|${JSON.stringify(payload)}`)
    .digest('base64url')}`
export function isBlocked(
  subject: string,
  decisions: readonly { subject: string; decision: 'allow' | 'block'; expiresAt?: string | null }[],
  now = new Date(),
) {
  const decision = decisions.find(
    (item) => item.subject === subject && (!item.expiresAt || new Date(item.expiresAt) > now),
  )
  return decision?.decision === 'block'
}
