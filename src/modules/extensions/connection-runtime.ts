import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

import type { Iso8601Instant } from '../core/contracts'
import { redact } from '../core/logging'
import type { ConnectionRecord, ProviderAdapter } from './contracts'

export const PROVIDER_CONNECTION_STATES = [
  'unconfigured',
  'authorizing',
  'active',
  'expired',
  'revoked',
  'invalid',
  'degraded',
  'disconnected',
] as const
export type ProviderConnectionState = (typeof PROVIDER_CONNECTION_STATES)[number]
export type CredentialEnvelope = Readonly<{
  version: 1
  keyId: string
  algorithm: 'aes-256-gcm'
  iv: string
  ciphertext: string
  tag: string
}>
export type CredentialKeyring = Readonly<{
  activeKeyId: string
  keys: Readonly<Record<string, string>>
}>
export type ConnectionCredentialStore = {
  put(connectionId: string, envelope: CredentialEnvelope): Promise<string>
  get(ref: string): Promise<CredentialEnvelope | null>
  delete(ref: string): Promise<void>
}
export type ConnectionAuditEvent = Readonly<{
  action: string
  connectionId: string
  at: Iso8601Instant
  detail: Record<string, unknown>
}>
export type ConnectionAuditSink = { record(event: ConnectionAuditEvent): Promise<void> }
export type ProviderConnection = Omit<ConnectionRecord, 'status'> & {
  status: ProviderConnectionState
  credentialRef: string | null
}

/** A dedicated encrypted boundary. Only opaque references cross into normal documents. */
export class EncryptedCredentialBoundary {
  constructor(private readonly keyring: CredentialKeyring) {}
  encrypt(value: Record<string, unknown>): CredentialEnvelope {
    const keyId = this.keyring.activeKeyId,
      iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', keyFor(this.keyring, keyId), iv)
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    return {
      version: 1,
      keyId,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
    }
  }
  decrypt(envelope: CredentialEnvelope): Record<string, unknown> {
    if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm')
      throw new Error('Unsupported credential envelope.')
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        keyFor(this.keyring, envelope.keyId),
        Buffer.from(envelope.iv, 'base64url'),
      )
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
      const value: unknown = JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8'),
      )
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('invalid')
      return value as Record<string, unknown>
    } catch {
      throw new Error('Credential could not be decrypted.')
    }
  }
}
function keyFor(keyring: CredentialKeyring, keyId: string): Buffer {
  const encoded = keyring.keys[keyId]
  if (!encoded) throw new Error(`Credential key ${JSON.stringify(keyId)} is unavailable.`)
  const key = Buffer.from(encoded, 'base64url')
  if (key.length !== 32) throw new Error('Credential encryption keys must be 32 bytes.')
  return key
}
export function connectionProjection(connection: ProviderConnection) {
  const safe = { ...connection } as Record<string, unknown>
  delete safe.credentialRef
  delete safe.encryptedSecretRef
  delete safe.refreshMetadata
  return safe as Omit<
    ProviderConnection,
    'credentialRef' | 'encryptedSecretRef' | 'refreshMetadata'
  >
}
export function connectionState(
  connection: ProviderConnection,
  now: Iso8601Instant,
): ProviderConnectionState {
  return connection.status === 'active' && connection.expiresAt && connection.expiresAt <= now
    ? 'expired'
    : connection.status
}

export type OAuthProviderDetails = Readonly<{
  authorizationUrl: string
  clientId: string
  redirectUri: string
  scopes: readonly string[]
  supportsPkce: boolean
}>
export type OAuthTransaction = Readonly<{
  stateHash: string
  verifier?: string
  redirectUri: string
  providerKey: string
  scopes: readonly string[]
  expiresAt: Iso8601Instant
}>
export function createPkcePair() {
  const verifier = randomBytes(48).toString('base64url')
  return { verifier, challenge: sha256(verifier), method: 'S256' as const }
}
export function beginOAuth(
  details: OAuthProviderDetails,
  providerKey: string,
  now = new Date(),
  ttlMs = 600_000,
) {
  const state = randomBytes(32).toString('base64url'),
    pkce = details.supportsPkce ? createPkcePair() : undefined,
    url = new URL(details.authorizationUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', details.clientId)
  url.searchParams.set('redirect_uri', details.redirectUri)
  url.searchParams.set('scope', details.scopes.join(' '))
  url.searchParams.set('state', state)
  if (pkce) {
    url.searchParams.set('code_challenge', pkce.challenge)
    url.searchParams.set('code_challenge_method', pkce.method)
  }
  return {
    authorizationUrl: url.toString(),
    transaction: {
      stateHash: sha256(state),
      verifier: pkce?.verifier,
      redirectUri: details.redirectUri,
      providerKey,
      scopes: details.scopes,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    } satisfies OAuthTransaction,
  }
}
export function validateOAuthCallback(
  transaction: OAuthTransaction,
  receivedState: string | null,
  grantedScopes: readonly string[],
  now: Iso8601Instant,
) {
  if (
    !receivedState ||
    transaction.expiresAt <= now ||
    !safeEqual(transaction.stateHash, sha256(receivedState))
  )
    throw new Error('Invalid or expired OAuth state.')
  if (!transaction.scopes.every((scope) => grantedScopes.includes(scope)))
    throw new Error('OAuth callback did not grant required scopes.')
}
const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url')
const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export type WebhookDefinition = Readonly<{
  providerKey: string
  maxBytes?: number
  timestampHeader?: string
  signatureHeader: string
  toleranceMs?: number
  verify(raw: string, signature: string, headers: Headers): boolean
  eventId(raw: string, headers: Headers): string | null
}>
export type WebhookReceipt = Readonly<{
  providerKey: string
  eventId: string
  receivedAt: Iso8601Instant
  payloadHash: string
}>
export type WebhookStore = {
  seen(providerKey: string, eventId: string): Promise<boolean>
  persist(receipt: WebhookReceipt): Promise<void>
}
export async function receiveWebhook(
  request: Request,
  definition: WebhookDefinition,
  store: WebhookStore,
  process: (receipt: WebhookReceipt, raw: string) => Promise<void>,
  now = new Date(),
): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? 0),
    max = definition.maxBytes ?? 256 * 1024
  if (declared > max) return Response.json({ error: 'Payload too large.' }, { status: 413 })
  const raw = await request.text()
  if (Buffer.byteLength(raw) > max)
    return Response.json({ error: 'Payload too large.' }, { status: 413 })
  const signature = request.headers.get(definition.signatureHeader)
  if (!signature || !definition.verify(raw, signature, request.headers))
    return Response.json({ error: 'Invalid provider signature.' }, { status: 401 })
  if (definition.timestampHeader && definition.toleranceMs) {
    const timestamp = Number(request.headers.get(definition.timestampHeader))
    if (
      !Number.isFinite(timestamp) ||
      Math.abs(now.getTime() - timestamp * 1000) > definition.toleranceMs
    )
      return Response.json({ error: 'Expired provider event.' }, { status: 401 })
  }
  const eventId = definition.eventId(raw, request.headers)
  if (!eventId) return Response.json({ error: 'Invalid provider event.' }, { status: 400 })
  if (await store.seen(definition.providerKey, eventId))
    return Response.json({ accepted: true, duplicate: true })
  const receipt = {
    providerKey: definition.providerKey,
    eventId,
    receivedAt: now.toISOString(),
    payloadHash: sha256(raw),
  }
  await store.persist(receipt)
  await process(receipt, raw)
  return Response.json({ accepted: true })
}
export function hmacWebhookVerifier(secret: string) {
  return (raw: string, signature: string) =>
    safeEqual(createHmac('sha256', secret).update(raw).digest('hex'), signature)
}

export class ProviderConnectionRuntime {
  constructor(
    private readonly adapters: readonly ProviderAdapter[],
    private readonly credentials: ConnectionCredentialStore,
    private readonly cipher: EncryptedCredentialBoundary,
    private readonly audit: ConnectionAuditSink = { async record() {} },
  ) {}
  async configure(
    connection: ProviderConnection,
    credential: Record<string, unknown>,
    now: Iso8601Instant,
  ) {
    const ref = await this.credentials.put(connection.id, this.cipher.encrypt(credential))
    const next = {
      ...connection,
      credentialRef: ref,
      encryptedSecretRef: null,
      status: 'unconfigured' as const,
    }
    await this.event('connection.configured', next, now)
    return next
  }
  async test(connection: ProviderConnection, now: Iso8601Instant): Promise<ProviderConnection> {
    if (connectionState(connection, now) === 'expired')
      return this.failure(connection, 'expired', 'expired_credentials', now)
    try {
      const result = await this.adapter(connection.providerKey).test(this.asRecord(connection))
      const next = {
        ...connection,
        status: 'active' as const,
        capabilities: result.capabilities,
        lastHealthCheckAt: now,
        lastError: null,
      }
      await this.event('connection.tested', next, now, {
        capabilityCount: result.capabilities.length,
      })
      return next
    } catch (error) {
      return this.failure(connection, 'degraded', 'unavailable', now, error)
    }
  }
  async disconnect(connection: ProviderConnection, now: Iso8601Instant) {
    const adapter = this.adapter(connection.providerKey)
    try {
      if (adapter.contract.disconnect.revokeRemote && adapter.revoke)
        await adapter.revoke(this.asRecord(connection))
    } catch (error) {
      return this.failure(connection, 'degraded', 'unavailable', now, error)
    }
    if (connection.credentialRef) await this.credentials.delete(connection.credentialRef)
    const next = {
      ...connection,
      credentialRef: null,
      encryptedSecretRef: null,
      status: 'disconnected' as const,
      capabilities: [],
      expiresAt: null,
      refreshMetadata: null,
    }
    await this.event('connection.disconnected', next, now)
    return next
  }
  async credential(connection: ProviderConnection) {
    if (!connection.credentialRef) return null
    const envelope = await this.credentials.get(connection.credentialRef)
    return envelope ? this.cipher.decrypt(envelope) : null
  }
  private adapter(key: string) {
    const adapter = this.adapters.find((item) => item.contract.key === key)
    if (!adapter) throw new Error('Provider adapter is not registered.')
    return adapter
  }
  private asRecord(connection: ProviderConnection): ConnectionRecord {
    return {
      ...connection,
      status:
        connection.status === 'unconfigured'
          ? 'configured'
          : connection.status === 'authorizing' ||
              connection.status === 'degraded' ||
              connection.status === 'revoked'
            ? 'invalid'
            : connection.status,
      encryptedSecretRef: null,
    }
  }
  private async failure(
    connection: ProviderConnection,
    status: ProviderConnectionState,
    code: 'expired_credentials' | 'unavailable',
    now: Iso8601Instant,
    error?: unknown,
  ): Promise<ProviderConnection> {
    const next = {
      ...connection,
      status,
      lastHealthCheckAt: now,
      lastError: {
        code,
        message: String(
          redact(error instanceof Error ? error.message : 'Provider unavailable.'),
        ).slice(0, 300),
        retryable: code === 'unavailable',
      } as const,
    }
    await this.event('connection.degraded', next, now, { code })
    return next
  }
  private event(
    action: string,
    connection: ProviderConnection,
    at: Iso8601Instant,
    detail: Record<string, unknown> = {},
  ) {
    return this.audit.record({ action, connectionId: connection.id, at, detail })
  }
}

/** Validates only non-secret connection metadata; credentials stay in the encrypted boundary. */
export function validateConnectionConfiguration(
  adapter: ProviderAdapter,
  connection: Pick<ProviderConnection, 'providerKey' | 'scopes' | 'status'>,
): string[] {
  const issues: string[] = []
  if (adapter.contract.key !== connection.providerKey) issues.push('provider_key_mismatch')
  if (
    !adapter.contract.authorization.minimumScopes.every((scope) =>
      connection.scopes.includes(scope),
    )
  )
    issues.push('missing_required_scope')
  if (!PROVIDER_CONNECTION_STATES.includes(connection.status))
    issues.push('invalid_connection_state')
  return issues
}
