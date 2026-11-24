import { randomUUID } from 'node:crypto'

import { exportJWK, importPKCS8, jwtVerify, SignJWT, type KeyLike } from 'jose'

import { digest, type IdentityStore } from './member-identity'

/**
 * RC3-21 #63 — Renegade ID, bounded local slice.
 *
 * A member enrolls once (a `linked-identities` row with
 * `providerKey: 'renegade-id'`; `kind: 'oauth'` because the assertion
 * protocol is OAuth/OIDC-shaped and the pg enum for `kind` has no
 * renegade-id value). The install then issues short-lived RS256
 * assertions signed with an env-sourced install key, and any relying
 * party can verify them against the install's published JWKS — provided
 * the enrollment is still active. Revocation sets `revokedAt` on the
 * enrollment row and verification consults the row on every call, so
 * revocation actually revokes. Cross-install federation is out of scope.
 *
 * Configuration mirrors the ActivityPub env pattern
 * (`src/modules/network/tasks.ts`): `RENEGADE_ID_PRIVATE_KEY_PEM`
 * (literal `\n` escapes are unescaped) and `RENEGADE_ID_KEY_ID`.
 * Absent either → the feature is unconfigured and routes return 503.
 *
 * Challenge nonces: `identity-tokens.purpose` is a closed select with no
 * renegade-id value, so nonces are NOT stored there. A nonce is instead
 * a short-lived (5 min) RS256 signed token carrying a `jti`; verified
 * `jti`s are remembered in-process so a nonce is single-use within a
 * process. (Cross-process single-use would need a shared store; the
 * 5-minute expiry bounds the replay window meanwhile.)
 */

export const RENEGADE_ID_PROVIDER_KEY = 'renegade-id'
export const RENEGADE_ID_DEFAULT_SCOPES = ['profile.read'] as const
export const RENEGADE_ID_ASSERTION_TTL_SECONDS = 600
export const RENEGADE_ID_CHALLENGE_TTL_SECONDS = 300

export type RenegadeIdConfig = {
  privateKeyPem: string
  keyId: string
  appUrl: string
}

export type RenegadeIdRefusal = {
  ok: false
  reason:
    | 'not_configured'
    | 'not_enrolled'
    | 'enrollment_revoked'
    | 'enrollment_expired'
    | 'invalid_assertion'
    | 'expired_assertion'
    | 'insufficient_scope'
    | 'nonce_mismatch'
    | 'profile_not_found'
}

export type VerifiedRenegadeId = {
  ok: true
  memberId: string
  subject: string
  handle: string
  scopes: string[]
}

export function loadRenegadeIdConfig(
  env: Record<string, string | undefined> = process.env,
): RenegadeIdConfig | null {
  const privateKeyPem = env.RENEGADE_ID_PRIVATE_KEY_PEM?.replace(/\\n/g, '\n')
  const keyId = env.RENEGADE_ID_KEY_ID
  if (!privateKeyPem || !keyId) return null
  const appUrl = (env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  return { privateKeyPem, keyId, appUrl }
}

const keyCache = new Map<string, Promise<KeyLike>>()
function privateKey(config: RenegadeIdConfig): Promise<KeyLike> {
  const cacheKey = `${config.keyId}:${digest(config.privateKeyPem)}`
  let pending = keyCache.get(cacheKey)
  if (!pending) {
    pending = importPKCS8(config.privateKeyPem, 'RS256')
    keyCache.set(cacheKey, pending)
  }
  return pending
}

async function publicKey(config: RenegadeIdConfig): Promise<KeyLike> {
  const { createPublicKey } = await import('node:crypto')
  const { importSPKI } = await import('jose')
  const spki = createPublicKey(config.privateKeyPem)
    .export({ type: 'spki', format: 'pem' })
    .toString()
  return importSPKI(spki, 'RS256')
}

/** JWKS publication shape derived from the install private key. */
export async function renegadeIdJwks(config: RenegadeIdConfig) {
  const jwk = await exportJWK(await publicKey(config))
  return {
    keys: [
      {
        kty: 'RSA',
        kid: config.keyId,
        n: jwk.n,
        e: jwk.e,
        alg: 'RS256',
        use: 'sig',
      },
    ],
  }
}

export function renegadeIdSubject(config: RenegadeIdConfig, handle: string): string {
  return `${config.appUrl}/id/${handle}`
}

const relId = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : String((value as { id?: string } | null | undefined)?.id ?? '')

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

async function memberHandle(store: IdentityStore, memberId: string): Promise<string | null> {
  const profiles = await store.find({
    collection: 'profiles',
    where: { member: { equals: memberId } },
    limit: 1,
    overrideAccess: true,
  })
  const handle = profiles.docs[0]?.handle
  return typeof handle === 'string' && handle ? handle : null
}

export async function findRenegadeIdEnrollment(store: IdentityStore, memberId: string) {
  const found = await store.find({
    collection: 'linked-identities',
    where: {
      and: [
        { member: { equals: memberId } },
        { providerKey: { equals: RENEGADE_ID_PROVIDER_KEY } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  return found.docs[0] ?? null
}

function enrollmentScopes(enrollment: Record<string, unknown>): string[] {
  const metadata = enrollment.metadata as { scopes?: unknown } | null | undefined
  return Array.isArray(metadata?.scopes)
    ? metadata.scopes.filter((scope): scope is string => typeof scope === 'string')
    : [...RENEGADE_ID_DEFAULT_SCOPES]
}

function enrollmentActive(
  enrollment: Record<string, unknown> | null,
  now: Date,
): RenegadeIdRefusal | null {
  if (!enrollment) return { ok: false, reason: 'not_enrolled' }
  if (enrollment.revokedAt) return { ok: false, reason: 'enrollment_revoked' }
  if (enrollment.expiresAt && new Date(String(enrollment.expiresAt)).getTime() <= now.getTime())
    return { ok: false, reason: 'enrollment_expired' }
  return null
}

export async function enrollRenegadeId(
  store: IdentityStore,
  config: RenegadeIdConfig,
  memberId: string,
  requestedScopes?: readonly string[],
  now = new Date(),
): Promise<
  | { ok: true; subject: string; handle: string; scopes: string[] }
  | { ok: false; reason: 'profile_not_found' }
> {
  const handle = await memberHandle(store, memberId)
  if (!handle) return { ok: false, reason: 'profile_not_found' }
  const subject = renegadeIdSubject(config, handle)
  const scopes = [
    ...new Set(requestedScopes?.length ? requestedScopes : RENEGADE_ID_DEFAULT_SCOPES),
  ]
  const existing = await findRenegadeIdEnrollment(store, memberId)
  if (existing) {
    // (providerKey, externalSubject) is unique: re-enrollment after a
    // revoke reactivates the same row rather than creating a second one.
    await store.update({
      collection: 'linked-identities',
      id: String(existing.id),
      data: {
        verifiedAt: now.toISOString(),
        revokedAt: null,
        metadata: { ...(existing.metadata as Record<string, unknown> | null), scopes },
      },
      overrideAccess: true,
    })
  } else {
    await store.create({
      collection: 'linked-identities',
      overrideAccess: true,
      data: {
        member: memberId,
        kind: 'oauth',
        providerKey: RENEGADE_ID_PROVIDER_KEY,
        externalSubject: subject,
        verifiedAt: now.toISOString(),
        metadata: { scopes },
      },
    })
  }
  await audit(store, memberId, 'renegade-id.enrolled', { subject, scopes })
  return { ok: true, subject, handle, scopes }
}

export async function revokeRenegadeId(
  store: IdentityStore,
  memberId: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; reason: 'not_enrolled' }> {
  const enrollment = await findRenegadeIdEnrollment(store, memberId)
  if (!enrollment) return { ok: false, reason: 'not_enrolled' }
  if (!enrollment.revokedAt) {
    await store.update({
      collection: 'linked-identities',
      id: String(enrollment.id),
      data: { revokedAt: now.toISOString() },
      overrideAccess: true,
    })
  }
  await audit(store, memberId, 'renegade-id.revoked', {
    subject: enrollment.externalSubject,
  })
  return { ok: true }
}

export async function issueAssertion(
  store: IdentityStore,
  config: RenegadeIdConfig,
  memberId: string,
  options: { nonce?: string; scopes?: readonly string[]; now?: Date } = {},
): Promise<{ ok: true; assertion: string; expiresAt: string } | RenegadeIdRefusal> {
  const now = options.now ?? new Date()
  const enrollment = await findRenegadeIdEnrollment(store, memberId)
  const refusal = enrollmentActive(enrollment, now)
  if (refusal) return refusal
  const granted = enrollmentScopes(enrollment!)
  const scopes = options.scopes ? options.scopes.filter((s) => granted.includes(s)) : granted
  const handle = await memberHandle(store, memberId)
  if (!handle) return { ok: false, reason: 'profile_not_found' }
  const expiresAt = new Date(now.getTime() + RENEGADE_ID_ASSERTION_TTL_SECONDS * 1000)
  const assertion = await new SignJWT({
    handle,
    scopes,
    ...(options.nonce ? { nonce: options.nonce } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: config.keyId })
    .setIssuer(config.appUrl)
    .setSubject(String(enrollment!.externalSubject))
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setJti(randomUUID())
    .sign(await privateKey(config))
  await audit(store, memberId, 'renegade-id.assertion_issued', {
    subject: enrollment!.externalSubject,
    scopes,
    nonceBound: Boolean(options.nonce),
  })
  return { ok: true, assertion, expiresAt: expiresAt.toISOString() }
}

// --- Challenge nonces (short-lived signed tokens; see header note) ---

const consumedNonceIds = new Set<string>()

export async function issueChallengeNonce(
  config: RenegadeIdConfig,
  memberId: string,
  now = new Date(),
): Promise<{ nonce: string; expiresAt: string }> {
  const expiresAt = new Date(now.getTime() + RENEGADE_ID_CHALLENGE_TTL_SECONDS * 1000)
  const nonce = await new SignJWT({ purpose: 'renegade-id-challenge', memberId })
    .setProtectedHeader({ alg: 'RS256', kid: config.keyId })
    .setIssuer(config.appUrl)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setJti(randomUUID())
    .sign(await privateKey(config))
  return { nonce, expiresAt: expiresAt.toISOString() }
}

/** Verifies a challenge nonce and burns it (single-use within this process). */
export async function consumeChallengeNonce(
  config: RenegadeIdConfig,
  nonce: string,
  memberId?: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(nonce, await publicKey(config), {
      issuer: config.appUrl,
      algorithms: ['RS256'],
    })
    if (payload.purpose !== 'renegade-id-challenge' || !payload.jti) return false
    if (memberId && payload.memberId !== memberId) return false
    if (consumedNonceIds.has(payload.jti)) return false
    consumedNonceIds.add(payload.jti)
    return true
  } catch {
    return false
  }
}

export async function verifyAssertion(
  store: IdentityStore,
  config: RenegadeIdConfig,
  token: string,
  options: { requiredScope?: string; expectedNonce?: string; now?: Date } = {},
): Promise<VerifiedRenegadeId | RenegadeIdRefusal> {
  const now = options.now ?? new Date()
  let claims: Record<string, unknown>
  try {
    const { payload } = await jwtVerify(token, await publicKey(config), {
      issuer: config.appUrl,
      algorithms: ['RS256'],
      currentDate: now,
    })
    claims = payload as Record<string, unknown>
  } catch (error) {
    const code = (error as { code?: string }).code
    return {
      ok: false,
      reason: code === 'ERR_JWT_EXPIRED' ? 'expired_assertion' : 'invalid_assertion',
    }
  }
  if (options.expectedNonce !== undefined && claims.nonce !== options.expectedNonce)
    return { ok: false, reason: 'nonce_mismatch' }
  const scopes = Array.isArray(claims.scopes)
    ? claims.scopes.filter((s): s is string => typeof s === 'string')
    : []
  if (options.requiredScope && !scopes.includes(options.requiredScope))
    return { ok: false, reason: 'insufficient_scope' }
  // The signature alone is never enough: the enrollment row is consulted
  // on every verification so a revoke takes effect immediately.
  const found = await store.find({
    collection: 'linked-identities',
    where: {
      and: [
        { providerKey: { equals: RENEGADE_ID_PROVIDER_KEY } },
        { externalSubject: { equals: String(claims.sub ?? '') } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  const enrollment = found.docs[0] ?? null
  const refusal = enrollmentActive(enrollment, now)
  if (refusal) return refusal
  const memberId = relId(enrollment!.member)
  await audit(store, memberId, 'renegade-id.assertion_verified', {
    subject: claims.sub,
    scopes,
  })
  return {
    ok: true,
    memberId,
    subject: String(claims.sub),
    handle: String(claims.handle ?? ''),
    scopes,
  }
}
