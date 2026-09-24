import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import type { PodProviderCapabilityMatrix, PodProviderAdapter } from './pod-contract'

export type PodConnectionStatus = 'active' | 'degraded' | 'disabled'

export type PodConnectionRecord = Readonly<{
  id: string
  siteId: string
  spaceId?: string
  providerKey: string
  label: string
  remoteStoreId?: string
  remoteStoreName?: string
  encryptedApiKey: string
  encryptedWebhookSecret?: string
  status: PodConnectionStatus
  capabilities: PodProviderCapabilityMatrix
  lastHealthCheckedAt?: string
  lastHealthStatus?: 'healthy' | 'degraded' | 'unavailable'
  lastHealthReason?: string
  disabledReason?: string
  createdAt: string
  updatedAt: string
}>

export type PublicPodConnectionProjection = Readonly<{
  id: string
  siteId: string
  spaceId?: string
  providerKey: string
  label: string
  remoteStoreId?: string
  remoteStoreName?: string
  redactedApiKey: string
  hasWebhookSecret: boolean
  status: PodConnectionStatus
  capabilities: PodProviderCapabilityMatrix
  lastHealthCheckedAt?: string
  lastHealthStatus?: 'healthy' | 'degraded' | 'unavailable'
  lastHealthReason?: string
  disabledReason?: string
  createdAt: string
  updatedAt: string
}>

/** Redacts sensitive credentials: shows prefix and last 4 characters only. */
export function redactSecret(secret: string): string {
  if (!secret) return ''
  const trimmed = secret.trim()
  if (trimmed.length <= 8) return '********'
  const prefix = trimmed.slice(0, 4)
  const suffix = trimmed.slice(-4)
  return `${prefix}***${suffix}`
}

function resolveKey(explicitKey?: string): Buffer {
  const raw =
    explicitKey ||
    process.env.RENEGADE_POD_ENCRYPTION_KEY ||
    process.env.RENEGADE_ENCRYPTION_KEY ||
    'renegade-default-32-byte-secret-dev-key!!'
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(raw).digest()
}

export function encryptCredential(plaintext: string, explicitKey?: string): string {
  const key = resolveKey(explicitKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`
}

export function decryptCredential(envelope: string, explicitKey?: string): string {
  const parts = envelope.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format: expected iv:tag:ciphertext')
  }
  const [ivB64, tagB64, cipherB64] = parts
  const key = resolveKey(explicitKey)
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')
  const ciphertext = Buffer.from(cipherB64, 'base64url')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export function createPodConnection(
  input: {
    id: string
    siteId: string
    spaceId?: string
    providerKey: string
    label: string
    apiKey: string
    webhookSecret?: string
    remoteStoreId?: string
    remoteStoreName?: string
    capabilities: PodProviderCapabilityMatrix
  },
  encryptionKey?: string,
): PodConnectionRecord {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    throw new Error('Cannot create POD connection without API credentials.')
  }
  const now = new Date().toISOString()
  return {
    id: input.id,
    siteId: input.siteId,
    spaceId: input.spaceId,
    providerKey: input.providerKey,
    label: input.label,
    remoteStoreId: input.remoteStoreId,
    remoteStoreName: input.remoteStoreName,
    encryptedApiKey: encryptCredential(input.apiKey, encryptionKey),
    encryptedWebhookSecret: input.webhookSecret
      ? encryptCredential(input.webhookSecret, encryptionKey)
      : undefined,
    status: 'active',
    capabilities: input.capabilities,
    createdAt: now,
    updatedAt: now,
  }
}

export function rotatePodConnectionCredentials(
  connection: PodConnectionRecord,
  newCredentials: { apiKey: string; webhookSecret?: string },
  encryptionKey?: string,
): PodConnectionRecord {
  if (!newCredentials.apiKey || newCredentials.apiKey.trim().length === 0) {
    throw new Error('New API credentials must be non-empty.')
  }
  return {
    ...connection,
    encryptedApiKey: encryptCredential(newCredentials.apiKey, encryptionKey),
    encryptedWebhookSecret: newCredentials.webhookSecret
      ? encryptCredential(newCredentials.webhookSecret, encryptionKey)
      : connection.encryptedWebhookSecret,
    updatedAt: new Date().toISOString(),
  }
}

export function disablePodConnection(
  connection: PodConnectionRecord,
  reason: string,
): PodConnectionRecord {
  return {
    ...connection,
    status: 'disabled',
    disabledReason: reason,
    updatedAt: new Date().toISOString(),
  }
}

export async function revalidatePodConnection(
  connection: PodConnectionRecord,
  adapter: PodProviderAdapter,
): Promise<PodConnectionRecord> {
  const health = await adapter.health()
  const status: PodConnectionStatus =
    connection.status === 'disabled'
      ? 'disabled'
      : health.health === 'healthy'
        ? 'active'
        : 'degraded'

  return {
    ...connection,
    status,
    lastHealthCheckedAt: new Date().toISOString(),
    lastHealthStatus: health.health,
    lastHealthReason: health.reason,
    updatedAt: new Date().toISOString(),
  }
}

export function decryptPodConnectionCredentials(
  connection: PodConnectionRecord,
  encryptionKey?: string,
): { apiKey: string; webhookSecret?: string } {
  return {
    apiKey: decryptCredential(connection.encryptedApiKey, encryptionKey),
    webhookSecret: connection.encryptedWebhookSecret
      ? decryptCredential(connection.encryptedWebhookSecret, encryptionKey)
      : undefined,
  }
}

export function getPublicPodConnectionProjection(
  connection: PodConnectionRecord,
  encryptionKey?: string,
): PublicPodConnectionProjection {
  let redactedKey = '********'
  try {
    const raw = decryptCredential(connection.encryptedApiKey, encryptionKey)
    redactedKey = redactSecret(raw)
  } catch {
    // If decryption fails, keep redacted mask
  }

  return {
    id: connection.id,
    siteId: connection.siteId,
    spaceId: connection.spaceId,
    providerKey: connection.providerKey,
    label: connection.label,
    remoteStoreId: connection.remoteStoreId,
    remoteStoreName: connection.remoteStoreName,
    redactedApiKey: redactedKey,
    hasWebhookSecret: Boolean(connection.encryptedWebhookSecret),
    status: connection.status,
    capabilities: connection.capabilities,
    lastHealthCheckedAt: connection.lastHealthCheckedAt,
    lastHealthStatus: connection.lastHealthStatus,
    lastHealthReason: connection.lastHealthReason,
    disabledReason: connection.disabledReason,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  }
}
