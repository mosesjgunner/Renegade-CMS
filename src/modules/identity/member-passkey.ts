import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'

import {
  digest,
  memberMayAuthenticate,
  opaqueToken,
  MEMBER_SESSION_TTL_MS,
  PASSKEY_CHALLENGE_TTL_MS,
  type IdentityStore,
} from './member-identity'

export class MemberPasskeyError extends Error {
  constructor(
    readonly code: 'ALREADY_USED' | 'EXPIRED' | 'NOT_FOUND' | 'VERIFICATION_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'MemberPasskeyError'
  }
}

type PasskeyMetadata = {
  publicKey: string
  counter: number
  deviceType: string
  backedUp: boolean
  transports?: readonly string[]
  label?: string
}

/**
 * Enrollment requires an already-authenticated member. The RP ID/origin are
 * always derived from the configured app URL, matching the admin passkey
 * strategy, so a credential minted on one origin cannot be replayed on another.
 */
export async function beginMemberPasskeyRegistration(
  store: IdentityStore,
  input: { memberId: string; memberEmail: string; appUrl: string },
  now = new Date(),
) {
  const origin = new URL(input.appUrl)
  const options = await generateRegistrationOptions({
    rpID: origin.hostname,
    rpName: 'Renegade Community',
    userID: Buffer.from(input.memberId),
    userName: input.memberEmail || `member-${input.memberId}`,
    userDisplayName: input.memberEmail || 'Community member',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  })
  const challengeToken = opaqueToken()
  await store.create({
    collection: 'identity-tokens',
    overrideAccess: true,
    data: {
      purpose: 'passkey-registration',
      tokenHash: digest(challengeToken),
      member: input.memberId,
      expiresAt: new Date(now.getTime() + PASSKEY_CHALLENGE_TTL_MS).toISOString(),
      metadata: { challenge: options.challenge },
    },
  })
  return { challengeToken, options }
}

export async function completeMemberPasskeyRegistration(
  store: IdentityStore,
  input: {
    memberId: string
    challengeToken: string
    credential: RegistrationResponseJSON
    appUrl: string
    label?: string
  },
  now = new Date(),
): Promise<void> {
  const found = await store.find({
    collection: 'identity-tokens',
    where: { tokenHash: { equals: digest(input.challengeToken) } },
    limit: 1,
    overrideAccess: true,
  })
  const record = found.docs[0]
  const owner =
    record &&
    (typeof record.member === 'string'
      ? record.member
      : String((record.member as { id?: string } | undefined)?.id))
  if (!record || record.purpose !== 'passkey-registration' || owner !== input.memberId) {
    throw new MemberPasskeyError('NOT_FOUND', 'Start passkey enrollment before completing it.')
  }
  if (record.consumedAt)
    throw new MemberPasskeyError('ALREADY_USED', 'This request already completed.')
  if (new Date(String(record.expiresAt)).getTime() <= now.getTime()) {
    throw new MemberPasskeyError('EXPIRED', 'This passkey enrollment request has expired.')
  }
  await store.update({
    collection: 'identity-tokens',
    id: String(record.id),
    data: { consumedAt: now.toISOString() },
    overrideAccess: true,
  })
  const challenge = String((record.metadata as { challenge?: string } | undefined)?.challenge)
  const origin = new URL(input.appUrl)
  const verification = await verifyRegistrationResponse({
    response: input.credential,
    expectedChallenge: challenge,
    // WebAuthn binds to an origin, never a configured path or a spelling with a
    // trailing slash. Canonicalizing here also makes a wrong-origin assertion
    // fail closed rather than depending on configuration formatting.
    expectedOrigin: origin.origin,
    expectedRPID: origin.hostname,
    requireUserVerification: false,
  })
  if (!verification.verified || !verification.registrationInfo) {
    throw new MemberPasskeyError('VERIFICATION_FAILED', 'This passkey could not be verified.')
  }
  const metadata: PasskeyMetadata = {
    publicKey: Buffer.from(verification.registrationInfo.credential.publicKey).toString(
      'base64url',
    ),
    counter: verification.registrationInfo.credential.counter,
    deviceType: verification.registrationInfo.credentialDeviceType,
    backedUp: verification.registrationInfo.credentialBackedUp,
    transports: input.credential.response.transports,
    label: input.label,
  }
  await store.create({
    collection: 'linked-identities',
    overrideAccess: true,
    data: {
      member: input.memberId,
      kind: 'passkey',
      providerKey: 'renegade-passkey',
      externalSubject: verification.registrationInfo.credential.id,
      verifiedAt: now.toISOString(),
      metadata,
    },
  })
}

/**
 * Discoverable (usernameless) login: the browser's authenticator picks the
 * matching resident credential and returns the original member ID as
 * `userHandle`, so no site-wide credential enumeration is required.
 */
export async function beginMemberPasskeyLogin(
  store: IdentityStore,
  appUrl: string,
  now = new Date(),
) {
  const origin = new URL(appUrl)
  const options = await generateAuthenticationOptions({
    rpID: origin.hostname,
    userVerification: 'preferred',
  })
  const challengeToken = opaqueToken()
  await store.create({
    collection: 'identity-tokens',
    overrideAccess: true,
    data: {
      purpose: 'passkey-authentication',
      tokenHash: digest(challengeToken),
      expiresAt: new Date(now.getTime() + PASSKEY_CHALLENGE_TTL_MS).toISOString(),
      metadata: { challenge: options.challenge },
    },
  })
  return { challengeToken, options }
}

export async function completeMemberPasskeyLogin(
  store: IdentityStore,
  input: { challengeToken: string; credential: AuthenticationResponseJSON; appUrl: string },
  now = new Date(),
): Promise<{ memberId: string; sessionToken: string }> {
  const found = await store.find({
    collection: 'identity-tokens',
    where: { tokenHash: { equals: digest(input.challengeToken) } },
    limit: 1,
    overrideAccess: true,
  })
  const record = found.docs[0]
  if (!record || record.purpose !== 'passkey-authentication') {
    throw new MemberPasskeyError('NOT_FOUND', 'Start passkey sign-in before completing it.')
  }
  if (record.consumedAt)
    throw new MemberPasskeyError('ALREADY_USED', 'This sign-in request already completed.')
  if (new Date(String(record.expiresAt)).getTime() <= now.getTime()) {
    throw new MemberPasskeyError('EXPIRED', 'This passkey sign-in request has expired.')
  }
  const identities = await store.find({
    collection: 'linked-identities',
    where: {
      and: [
        { providerKey: { equals: 'renegade-passkey' } },
        { externalSubject: { equals: input.credential.id } },
        { revokedAt: { exists: false } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })
  const identity = identities.docs[0]
  if (!identity) throw new MemberPasskeyError('NOT_FOUND', 'This passkey is not registered.')
  await store.update({
    collection: 'identity-tokens',
    id: String(record.id),
    data: { consumedAt: now.toISOString() },
    overrideAccess: true,
  })
  const challenge = String((record.metadata as { challenge?: string } | undefined)?.challenge)
  const metadata = identity.metadata as PasskeyMetadata
  const origin = new URL(input.appUrl)
  const verification = await verifyAuthenticationResponse({
    response: input.credential,
    expectedChallenge: challenge,
    expectedOrigin: origin.origin,
    expectedRPID: origin.hostname,
    credential: {
      id: input.credential.id,
      publicKey: Buffer.from(metadata.publicKey, 'base64url'),
      counter: metadata.counter,
      transports: (metadata.transports ?? []) as never,
    },
    requireUserVerification: false,
  })
  if (!verification.verified) {
    throw new MemberPasskeyError('VERIFICATION_FAILED', 'This passkey could not be verified.')
  }
  // Clone-detection: a counter that fails to advance indicates a duplicated authenticator.
  await store.update({
    collection: 'linked-identities',
    id: String(identity.id),
    data: { metadata: { ...metadata, counter: verification.authenticationInfo.newCounter } },
    overrideAccess: true,
  })
  const memberId =
    typeof identity.member === 'string'
      ? identity.member
      : String((identity.member as { id?: string }).id)
  const member = await store.findByID({ collection: 'members', id: memberId, overrideAccess: true })
  if (!memberMayAuthenticate(member)) {
    throw new MemberPasskeyError('NOT_FOUND', 'This account cannot sign in.')
  }
  const sessionToken = opaqueToken()
  await store.create({
    collection: 'member-sessions',
    overrideAccess: true,
    data: {
      member: memberId,
      tokenHash: digest(sessionToken),
      expiresAt: new Date(now.getTime() + MEMBER_SESSION_TTL_MS).toISOString(),
      createdFrom: 'passkey',
      lastSeenAt: now.toISOString(),
    },
  })
  return { memberId, sessionToken }
}
