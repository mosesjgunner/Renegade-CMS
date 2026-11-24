import { randomBytes } from 'node:crypto'

import { createRemoteJWKSet, jwtVerify } from 'jose'

import { safeFetch } from '../core/external-boundary'
import {
  beginOAuth,
  EncryptedCredentialBoundary,
  validateOAuthCallback,
  type CredentialEnvelope,
  type CredentialKeyring,
  type OAuthTransaction,
} from '../extensions/connection-runtime'
import {
  assertRegistrationAllowed,
  digest,
  MEMBER_SESSION_TTL_MS,
  memberMayAuthenticate,
  opaqueToken,
  resolveCommunityRegistrationPolicy,
  type IdentityStore,
  type RegistrationPolicy,
} from './member-identity'

/**
 * RC3-21 #64 — Enterprise identity, isolated test-IdP slice.
 *
 * HARD BOUNDARY: the only issuers this slice will ever talk to are
 * loopback origins (`http(s)://127.0.0.1:<port>` or `http(s)://[::1]:<port>`,
 * no credentials, no path beyond `/`, no query/fragment). Validation runs
 * at connection save time (a beforeValidate hook on
 * `enterprise-idp-connections`, plus the create/update helpers here) AND
 * again before any network call. External/production IdPs are refused by
 * construction — lifting the boundary is an owner decision, not a config
 * change.
 *
 * The flow is OAuth2 authorization-code + PKCE (S256) via
 * `connection-runtime`, the ID token is verified with `jose` against the
 * JWKS named by the validated loopback discovery document, and the
 * verified `sub` is mapped to a `linked-identities` row
 * (`kind: 'oauth'`, `providerKey: <connection id>`) plus a member session
 * minted with `createdFrom: 'oauth'` — the first writer of both enum
 * values.
 */

export function validateIdpIssuer(issuer: string): string {
  let url: URL
  try {
    url = new URL(issuer)
  } catch {
    throw new Error('IdP issuer is not a valid URL.')
  }
  if (url.username || url.password || url.search || url.hash)
    throw new Error('IdP issuer must not contain credentials, query, or fragment.')
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    !url.port ||
    url.pathname !== '/'
  )
    throw new Error(
      'Enterprise IdP issuers are restricted to loopback origins with an explicit port and no path.',
    )
  return url.origin
}

export type EnterpriseIdpConnectionRecord = {
  id: string
  label: string
  issuer: string
  clientId: string
  redirectUri: string
  scopes: string[]
  status: string
  lastTestedAt?: string | null
}

const relId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : String((value as { id?: string } | null | undefined)?.id ?? '')

export function toIdpConnection(doc: Record<string, unknown>): EnterpriseIdpConnectionRecord {
  return {
    id: String(doc.id),
    label: String(doc.label ?? ''),
    issuer: validateIdpIssuer(String(doc.issuer ?? '')),
    clientId: String(doc.clientId ?? ''),
    redirectUri: String(doc.redirectUri ?? ''),
    scopes: Array.isArray(doc.scopes)
      ? doc.scopes.filter((s): s is string => typeof s === 'string')
      : ['openid'],
    status: String(doc.status ?? 'active'),
    lastTestedAt: (doc.lastTestedAt as string | null | undefined) ?? null,
  }
}

export async function createEnterpriseIdpConnection(
  store: IdentityStore,
  input: Omit<EnterpriseIdpConnectionRecord, 'id' | 'lastTestedAt'> & { status?: string },
): Promise<EnterpriseIdpConnectionRecord> {
  const issuer = validateIdpIssuer(input.issuer) // refuse non-loopback at save time
  const created = await store.create({
    collection: 'enterprise-idp-connections',
    overrideAccess: true,
    data: {
      label: input.label,
      issuer,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      scopes: input.scopes,
      status: input.status ?? 'active',
    },
  })
  const doc = await store.findByID({
    collection: 'enterprise-idp-connections',
    id: created.id,
    overrideAccess: true,
  })
  return toIdpConnection(doc)
}

export async function updateEnterpriseIdpConnection(
  store: IdentityStore,
  connectionId: string,
  patch: Partial<Omit<EnterpriseIdpConnectionRecord, 'id'>>,
): Promise<void> {
  const data: Record<string, unknown> = { ...patch }
  if (typeof patch.issuer === 'string') data.issuer = validateIdpIssuer(patch.issuer)
  await store.update({
    collection: 'enterprise-idp-connections',
    id: connectionId,
    data,
    overrideAccess: true,
  })
}

// --- Client-secret envelope (config/secret split, mirroring Ai.ts) ---

export function enterpriseIdpKeyring(
  env: Record<string, string | undefined> = process.env,
): CredentialKeyring | null {
  const key = env.ENTERPRISE_IDP_CREDENTIAL_KEY_BASE64URL
  if (!key) return null
  return { activeKeyId: 'v1', keys: { v1: key } }
}

export async function storeEnterpriseIdpSecret(
  store: IdentityStore,
  connectionId: string,
  clientSecret: string,
  keyring: CredentialKeyring | null = enterpriseIdpKeyring(),
): Promise<void> {
  if (!keyring) throw new Error('Enterprise IdP credential encryption is not configured.')
  const envelope = new EncryptedCredentialBoundary(keyring).encrypt({ clientSecret })
  const existing = await store.find({
    collection: 'enterprise-idp-credentials',
    where: { connection: { equals: connectionId } },
    limit: 1,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    await store.update({
      collection: 'enterprise-idp-credentials',
      id: String(existing.docs[0].id),
      data: { envelope },
      overrideAccess: true,
    })
  } else {
    await store.create({
      collection: 'enterprise-idp-credentials',
      overrideAccess: true,
      data: { connection: connectionId, envelope },
    })
  }
}

export async function resolveEnterpriseIdpSecret(
  store: IdentityStore,
  connectionId: string,
  keyring: CredentialKeyring | null = enterpriseIdpKeyring(),
): Promise<string | undefined> {
  if (!keyring) return undefined
  const found = await store.find({
    collection: 'enterprise-idp-credentials',
    where: { connection: { equals: connectionId } },
    limit: 1,
    overrideAccess: true,
  })
  const envelope = found.docs[0]?.envelope as CredentialEnvelope | undefined
  if (!envelope) return undefined
  const decrypted = new EncryptedCredentialBoundary(keyring).decrypt(envelope)
  return typeof decrypted.clientSecret === 'string' ? decrypted.clientSecret : undefined
}

// --- Discovery + flow ---

export type IdpDiscovery = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
}

const loopbackFetch = (url: string, init: RequestInit = {}) =>
  safeFetch(url, init, { allowHttp: true, allowPrivate: true, maxRedirects: 0 })

export async function fetchIdpDiscovery(
  connection: EnterpriseIdpConnectionRecord,
): Promise<IdpDiscovery> {
  const issuer = validateIdpIssuer(connection.issuer)
  const response = await loopbackFetch(`${issuer}/.well-known/openid-configuration`)
  if (!response.ok) throw new Error(`IdP discovery failed (${response.status}).`)
  const doc = (await response.json()) as Partial<IdpDiscovery>
  // The discovery document must describe the very issuer we validated;
  // its endpoints (JWKS included) are only trusted under that check.
  if (doc.issuer !== issuer) throw new Error('IdP discovery issuer mismatch.')
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
    const value = doc[field]
    if (typeof value !== 'string' || !value.startsWith(`${issuer}/`))
      throw new Error(`IdP discovery document has an invalid ${field}.`)
  }
  return doc as IdpDiscovery
}

export async function beginSsoSignIn(
  connection: EnterpriseIdpConnectionRecord,
  discovery?: IdpDiscovery,
): Promise<{ authorizationUrl: string; transaction: OAuthTransaction }> {
  const doc = discovery ?? (await fetchIdpDiscovery(connection))
  return beginOAuth(
    {
      authorizationUrl: doc.authorization_endpoint,
      clientId: connection.clientId,
      redirectUri: connection.redirectUri,
      scopes: connection.scopes,
      supportsPkce: true,
    },
    connection.id,
  )
}

async function audit(
  store: IdentityStore,
  memberId: string | undefined,
  event: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await store.create({
    collection: 'identity-audit-events',
    overrideAccess: true,
    data: { ...(memberId ? { member: memberId } : {}), event, details },
  })
}

export async function completeSsoSignIn(
  store: IdentityStore,
  connection: EnterpriseIdpConnectionRecord,
  input: {
    code: string
    state: string | null
    grantedScopes?: readonly string[]
    transaction: OAuthTransaction
    clientSecret?: string
    discovery?: IdpDiscovery
    registrationPolicy?: RegistrationPolicy
    now?: Date
  },
): Promise<
  | { ok: true; memberId: string; sessionToken: string; linkedIdentityId: string }
  | { ok: false; reason: string }
> {
  const now = input.now ?? new Date()
  validateOAuthCallback(
    input.transaction,
    input.state,
    input.grantedScopes ?? input.transaction.scopes,
    now.toISOString(),
  )
  const discovery = input.discovery ?? (await fetchIdpDiscovery(connection))
  const tokenResponse = await loopbackFetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: connection.redirectUri,
      client_id: connection.clientId,
      ...(input.transaction.verifier ? { code_verifier: input.transaction.verifier } : {}),
      ...(input.clientSecret ? { client_secret: input.clientSecret } : {}),
    }).toString(),
  })
  if (!tokenResponse.ok) return { ok: false, reason: 'token_exchange_failed' }
  const tokens = (await tokenResponse.json()) as { id_token?: string }
  if (!tokens.id_token) return { ok: false, reason: 'missing_id_token' }

  let claims: Record<string, unknown>
  try {
    const verified = await jwtVerify(
      tokens.id_token,
      createRemoteJWKSet(new URL(discovery.jwks_uri)),
      { issuer: connection.issuer, algorithms: ['RS256'] },
    )
    claims = verified.payload as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'id_token_invalid' }
  }
  const sub = typeof claims.sub === 'string' ? claims.sub : ''
  if (!sub) return { ok: false, reason: 'id_token_missing_sub' }
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null

  // Identity mapping: an existing link for (connection, sub) wins; else
  // find-or-link the member by the verified email claim.
  const existingLink = await store.find({
    collection: 'linked-identities',
    where: {
      and: [
        { providerKey: { equals: connection.id } },
        { externalSubject: { equals: sub } },
        { revokedAt: { exists: false } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  let memberId = existingLink.docs[0] ? relId(existingLink.docs[0].member) : ''
  let linkedIdentityId = existingLink.docs[0] ? String(existingLink.docs[0].id) : ''
  if (!memberId) {
    if (email) {
      const byEmail = await store.find({
        collection: 'members',
        where: { email: { equals: email } },
        limit: 1,
        overrideAccess: true,
      })
      if (byEmail.docs[0]) memberId = String(byEmail.docs[0].id)
    }
    if (!memberId) {
      const policy =
        input.registrationPolicy ?? (await resolveCommunityRegistrationPolicy(store as never))
      const decision = assertRegistrationAllowed(policy, false)
      if (!decision.allowed) {
        await audit(store, undefined, 'member.sso_registration_denied', {
          connectionId: connection.id,
          reason: decision.reason,
        })
        return { ok: false, reason: `registration_${decision.reason ?? 'denied'}` }
      }
      const member = await store.create({
        collection: 'members',
        overrideAccess: true,
        data: {
          displayName: typeof claims.name === 'string' && claims.name ? claims.name : 'New member',
          ...(email ? { email } : {}),
          status: decision.pendingApproval ? 'pending' : 'active',
          ...(email ? { verifiedEmailAt: now.toISOString() } : {}),
        },
      })
      memberId = member.id
      const profiles = await store.find({
        collection: 'profiles',
        where: { member: { equals: memberId } },
        limit: 1,
        overrideAccess: true,
      })
      if (!profiles.docs.length)
        await store.create({
          collection: 'profiles',
          overrideAccess: true,
          data: {
            member: memberId,
            displayName:
              typeof claims.name === 'string' && claims.name ? claims.name : 'New member',
            handle: `member-${memberId
              .replace(/[^a-z0-9]/gi, '')
              .toLowerCase()
              .slice(-12)}`,
            visibility: 'private',
            preferences: {},
          },
        })
    }
    const link = await store.create({
      collection: 'linked-identities',
      overrideAccess: true,
      data: {
        member: memberId,
        kind: 'oauth',
        providerKey: connection.id,
        externalSubject: sub,
        verifiedAt: now.toISOString(),
        metadata: { issuer: connection.issuer, ...(email ? { email } : {}) },
      },
    })
    linkedIdentityId = link.id
  }

  const member = await store.findByID({
    collection: 'members',
    id: memberId,
    overrideAccess: true,
  })
  if (!memberMayAuthenticate(member)) {
    await audit(store, memberId, 'member.sso_rejected', {
      connectionId: connection.id,
      reason: member.status === 'pending' ? 'pending_approval' : 'member_not_active',
    })
    return {
      ok: false,
      reason: member.status === 'pending' ? 'pending_approval' : 'member_not_active',
    }
  }
  const sessionToken = opaqueToken()
  await store.create({
    collection: 'member-sessions',
    overrideAccess: true,
    data: {
      member: memberId,
      tokenHash: digest(sessionToken),
      expiresAt: new Date(now.getTime() + MEMBER_SESSION_TTL_MS).toISOString(),
      createdFrom: 'oauth',
      lastSeenAt: now.toISOString(),
    },
  })
  await audit(store, memberId, 'member.sso_sign_in', {
    connectionId: connection.id,
    issuer: connection.issuer,
    linkedIdentityId,
  })
  return { ok: true, memberId, sessionToken, linkedIdentityId }
}

/** Revokes the SSO link for (connection, sub); later sign-ins re-link from scratch. */
export async function revokeSsoLink(
  store: IdentityStore,
  connectionId: string,
  externalSubject: string,
  now = new Date(),
): Promise<boolean> {
  const found = await store.find({
    collection: 'linked-identities',
    where: {
      and: [
        { providerKey: { equals: connectionId } },
        { externalSubject: { equals: externalSubject } },
        { revokedAt: { exists: false } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  if (!found.docs[0]) return false
  await store.update({
    collection: 'linked-identities',
    id: String(found.docs[0].id),
    data: { revokedAt: now.toISOString() },
    overrideAccess: true,
  })
  return true
}

export const ssoTransactionCookieName = 'renegade-sso-txn'
export const SSO_TRANSACTION_TTL_MS = 10 * 60 * 1000

/** Signs the OAuth transaction (state hash + PKCE verifier) into a short-lived cookie value. */
export async function encodeSsoTransaction(
  secret: string,
  transaction: OAuthTransaction,
  connectionId: string,
): Promise<string> {
  const { SignJWT } = await import('jose')
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ transaction, connectionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SSO_TRANSACTION_TTL_MS) / 1000))
    .setJti(randomBytes(16).toString('base64url'))
    .sign(key)
}

export async function decodeSsoTransaction(
  secret: string,
  value: string | undefined,
): Promise<{ transaction: OAuthTransaction; connectionId: string } | null> {
  if (!value) return null
  try {
    const { payload } = await jwtVerify(value, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    })
    const transaction = payload.transaction as OAuthTransaction | undefined
    if (!transaction || typeof payload.connectionId !== 'string') return null
    return { transaction, connectionId: payload.connectionId }
  } catch {
    return null
  }
}

export function ssoTransactionCookie(value: string, secure: boolean): string {
  return `${ssoTransactionCookieName}=${value}; Max-Age=${SSO_TRANSACTION_TTL_MS / 1000}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

export function readSsoTransactionCookie(headers: Headers): string | undefined {
  return headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === ssoTransactionCookieName)?.[1]
}
