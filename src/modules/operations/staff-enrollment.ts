import { createHmac, randomBytes } from 'node:crypto'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import type { Payload } from 'payload'

import type { AppConfig } from '../core/config'

export class StaffEnrollmentError extends Error {
  constructor(
    readonly code:
      | 'INVALID_TOKEN'
      | 'TOKEN_EXPIRED'
      | 'TOKEN_ALREADY_USED'
      | 'WRONG_SITE'
      | 'WRONG_USER'
      | 'USER_NOT_FOUND'
      | 'ALREADY_ENROLLED'
      | 'CHALLENGE_EXPIRED'
      | 'VERIFICATION_FAILED'
      | 'UNAUTHORIZED'
      | 'INVALID_EMAIL'
      | 'INVALID_ROLE',
    message: string,
  ) {
    super(message)
    this.name = 'StaffEnrollmentError'
  }
}

type SqlPool = {
  query: <R = unknown>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: R[]; rowCount?: number | null }>
}

export function hashValue(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

function getPool(payload: Payload): SqlPool {
  const database = payload.db as typeof payload.db & { pool?: SqlPool }
  if (!database.pool) {
    throw new StaffEnrollmentError('UNAUTHORIZED', 'Database connection is unavailable.')
  }
  return database.pool
}

/**
 * Creates a bounded enrollment token for a staff user.
 * Bounded to the user's canonical identity, optional siteId, and expiration time.
 */
export async function createStaffEnrollmentToken(
  payload: Payload,
  config: AppConfig,
  input: {
    email: string
    role?: 'staff' | 'administrator'
    siteId?: string
    invitedByUserId?: string
    validHours?: number
    userId?: string
    memberId?: string
    req?: unknown
  },
): Promise<{
  enrollmentToken: string
  enrollmentUrl: string
  expiresAt: string
  user: { id: string; email: string; role: string }
  siteId: string | null
}> {
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new StaffEnrollmentError('INVALID_EMAIL', 'Enter a valid email address.')
  }

  const role = input.role ?? 'staff'
  if (!['staff', 'administrator'].includes(role)) {
    throw new StaffEnrollmentError('INVALID_ROLE', 'Role must be staff or administrator.')
  }

  const req = input.req as Parameters<Payload['find']>[0]['req']

  // 1. Locate or create users doc
  let user: { id: string; email: string; role: string; member?: unknown } | undefined

  if (input.userId) {
    user = { id: input.userId, email, role, member: input.memberId }
  } else {
    const existingUsers = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })

    user = existingUsers.docs[0] as
      | { id: string; email: string; role: string; member?: unknown }
      | undefined

    if (user) {
      if (user.role === 'owner') {
        throw new StaffEnrollmentError(
          'UNAUTHORIZED',
          'Owner accounts cannot be enrolled as staff.',
        )
      }
    } else {
      const created = await payload.create({
        collection: 'users',
        data: { email, role },
        overrideAccess: true,
        req,
        context: { skipEnrollmentToken: true, pendingStaffInvitation: true },
      })
      user = created as { id: string; email: string; role: string; member?: unknown }
    }
  }

  // 2. Ensure canonical Member record exists
  let memberId =
    input.memberId ||
    (typeof user.member === 'string'
      ? user.member
      : (user.member as { id?: string } | undefined)?.id)

  if (!memberId) {
    const existingMembers = await payload.find({
      collection: 'members',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (existingMembers.docs[0]) {
      memberId = existingMembers.docs[0].id
    } else {
      const createdMember = await payload.create({
        collection: 'members',
        data: {
          email,
          displayName: email.split('@')[0],
          status: 'active',
        },
        overrideAccess: true,
        req,
      })
      memberId = createdMember.id
    }

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { member: memberId },
      overrideAccess: true,
      req,
    })
  }

  // 3. Resolve the target site. A pending invitation must not grant access.
  let targetSiteId = input.siteId
  if (!targetSiteId) {
    const sites = await payload.find({
      collection: 'sites',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    targetSiteId = sites.docs[0]?.id
  }

  // 4. Invalidate prior unconsumed tokens for this email to avoid ambiguous pending invitations
  const pool = getPool(payload)
  await pool.query(
    `UPDATE identity_tokens
     SET consumed_at = now(), updated_at = now()
     WHERE purpose = 'passkey-registration' AND email_hash = $1 AND consumed_at IS NULL`,
    [hashValue(email, config.payloadSecret)],
  )

  // 5. Generate secure random single-use token and store in identity-tokens
  const enrollmentToken = randomBytes(32).toString('base64url')
  const tokenHash = hashValue(enrollmentToken, config.payloadSecret)
  const emailHash = hashValue(email, config.payloadSecret)
  const validHours = input.validHours ?? 168
  if (!Number.isFinite(validHours) || validHours <= 0 || validHours > 168) {
    throw new StaffEnrollmentError('INVALID_TOKEN', 'Invitation lifetime must be between 1 hour and 7 days.')
  }
  const expiresAt = new Date(Date.now() + validHours * 3600 * 1000).toISOString()

  await payload.create({
    collection: 'identity-tokens',
    data: {
      purpose: 'passkey-registration',
      tokenHash,
      emailHash,
      member: memberId,
      expiresAt,
      metadata: {
        userId: user.id,
        email,
        role,
        siteId: targetSiteId ?? null,
        invitedByUserId: input.invitedByUserId ?? null,
      },
    },
    overrideAccess: true,
    req,
  })

  const enrollmentUrl = `${config.appUrl}/enroll?token=${enrollmentToken}`
  return {
    enrollmentToken,
    enrollmentUrl,
    expiresAt,
    user: { id: user.id, email: user.email, role: user.role },
    siteId: targetSiteId ?? null,
  }
}

/**
 * Validates an enrollment token and returns invitation details.
 */
export async function getStaffEnrollmentDetails(
  payload: Payload,
  config: AppConfig,
  token: string,
  siteId?: string,
): Promise<{
  valid: true
  tokenId: string
  userId: string
  email: string
  role: string
  siteId: string | null
  expiresAt: string
}> {
  if (!token || !token.trim()) {
    throw new StaffEnrollmentError('INVALID_TOKEN', 'Enrollment token is missing.')
  }

  const tokenHash = hashValue(token.trim(), config.payloadSecret)
  const res = await payload.find({
    collection: 'identity-tokens',
    where: {
      and: [{ purpose: { equals: 'passkey-registration' } }, { tokenHash: { equals: tokenHash } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (!res.docs.length) {
    throw new StaffEnrollmentError(
      'INVALID_TOKEN',
      'Enrollment invitation is invalid or does not exist.',
    )
  }

  const record = res.docs[0] as unknown as {
    id: string
    expiresAt: string
    consumedAt?: string | null
    metadata?: {
      userId?: string
      email?: string
      role?: string
      siteId?: string
      revoked?: boolean
    }
  }

  if (record.consumedAt || record.metadata?.revoked) {
    throw new StaffEnrollmentError(
      'TOKEN_ALREADY_USED',
      'This enrollment invitation has already been used or revoked.',
    )
  }

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new StaffEnrollmentError('TOKEN_EXPIRED', 'This enrollment invitation has expired.')
  }

  if (siteId && record.metadata?.siteId && record.metadata.siteId !== siteId) {
    throw new StaffEnrollmentError(
      'WRONG_SITE',
      'This enrollment invitation is not valid for the requested site.',
    )
  }

  const userId = record.metadata?.userId
  if (!userId) {
    throw new StaffEnrollmentError(
      'USER_NOT_FOUND',
      'Staff account associated with this invitation was not found.',
    )
  }

  const userDoc = (await payload
    .findByID({
      collection: 'users',
      id: userId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)) as { id: string; email: string; role: string } | null

  if (!userDoc) {
    throw new StaffEnrollmentError('USER_NOT_FOUND', 'Staff account was not found.')
  }
  if (userDoc.email.toLowerCase() !== record.metadata?.email?.toLowerCase()) {
    throw new StaffEnrollmentError('WRONG_USER', 'Invitation identity no longer matches the account.')
  }
  if (!['staff', 'administrator'].includes(String(record.metadata?.role))) {
    throw new StaffEnrollmentError('INVALID_ROLE', 'Invitation role is invalid.')
  }

  const pool = getPool(payload)
  const existingPasskeys = await pool.query<{ id: string }>(
    `SELECT id FROM passkeys WHERE user_id = $1`,
    [userId],
  )
  if (existingPasskeys.rows.length > 0) {
    throw new StaffEnrollmentError(
      'ALREADY_ENROLLED',
      'A passkey has already been registered for this account.',
    )
  }

  return {
    valid: true,
    tokenId: record.id,
    userId: userDoc.id,
    email: userDoc.email,
    role: record.metadata?.role ?? userDoc.role,
    siteId: record.metadata?.siteId ?? null,
    expiresAt: record.expiresAt,
  }
}

/**
 * Initiates the passkey enrollment challenge for a staff member.
 */
export async function beginStaffPasskeyEnrollment(
  payload: Payload,
  config: AppConfig,
  input: { enrollmentToken: string; siteId?: string },
) {
  const details = await getStaffEnrollmentDetails(
    payload,
    config,
    input.enrollmentToken,
    input.siteId,
  )
  const origin = new URL(config.appUrl)
  const options = await generateRegistrationOptions({
    rpID: origin.hostname,
    rpName: 'Renegade CMS',
    userID: Buffer.from(details.userId),
    userName: details.email,
    userDisplayName: details.email,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })

  const pool = getPool(payload)
  await pool.query(
    `UPDATE identity_tokens
     SET metadata = metadata || $1::jsonb, updated_at = now()
     WHERE id = $2`,
    [
      JSON.stringify({
        challenge: options.challenge,
        challengeExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }),
      details.tokenId,
    ],
  )

  await pool.query(`INSERT INTO admin_auth_audit_events (user_id, event) VALUES ($1, $2)`, [
    details.userId,
    'staff.passkey.registration.started',
  ])

  return {
    options,
    email: details.email,
    role: details.role,
  }
}

/**
 * Completes passkey registration using the bounded enrollment authority.
 * Atomically marks the token as consumed to prevent replay.
 */
export async function completeStaffPasskeyEnrollment(
  payload: Payload,
  config: AppConfig,
  input: {
    enrollmentToken: string
    credential: RegistrationResponseJSON
    siteId?: string
  },
): Promise<{
  status: string
  email: string
  role: string
  redirectUrl: string
  recoveryCodes: string[]
}> {
  const details = await getStaffEnrollmentDetails(
    payload,
    config,
    input.enrollmentToken,
    input.siteId,
  )
  const pool = getPool(payload)

  const tokenRow = await pool.query<{
    metadata: Record<string, unknown>
    consumed_at: Date | null
  }>(`SELECT metadata, consumed_at FROM identity_tokens WHERE id = $1`, [details.tokenId])
  const row = tokenRow.rows[0]
  if (!row || row.consumed_at) {
    throw new StaffEnrollmentError(
      'TOKEN_ALREADY_USED',
      'This enrollment invitation has already been used.',
    )
  }

  const challenge = row.metadata?.challenge as string | undefined
  const challengeExpiresAt = row.metadata?.challengeExpiresAt as string | undefined
  if (!challenge || !challengeExpiresAt || new Date(challengeExpiresAt).getTime() <= Date.now()) {
    throw new StaffEnrollmentError(
      'CHALLENGE_EXPIRED',
      'Passkey registration challenge has expired. Please restart enrollment.',
    )
  }

  const origin = new URL(config.appUrl)
  const verification = await verifyRegistrationResponse({
    response: input.credential,
    expectedChallenge: challenge,
    expectedOrigin: config.appUrl,
    expectedRPID: origin.hostname,
    requireUserVerification: true,
  }).catch(() => {
    throw new StaffEnrollmentError(
      'VERIFICATION_FAILED',
      'Passkey enrollment could not be verified.',
    )
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new StaffEnrollmentError(
      'VERIFICATION_FAILED',
      'Passkey enrollment could not be verified.',
    )
  }

  const recoveryCodes = Array.from({ length: 10 }, () =>
    randomBytes(10).toString('hex').toUpperCase(),
  )
  // Consume the invitation, persist the credential and issue recovery authority
  // in one statement. A database error must leave the invitation retryable.
  const consumed = await pool.query(
    `WITH consumed AS (
       UPDATE identity_tokens SET consumed_at = now(), updated_at = now()
       WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()
         AND metadata->>'challenge' = $2
         AND (metadata->>'challengeExpiresAt')::timestamptz > now()
       RETURNING id
     ), registered AS (
       INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up, name, transports)
       SELECT $3, $4, $5, $6, $7, $8, 'Staff Passkey', $9 FROM consumed
       RETURNING user_id, credential_id
     ), codes AS (
       INSERT INTO recovery_codes (user_id, code_hash)
       SELECT user_id, unnest($10::text[]) FROM registered
       RETURNING id
     ) SELECT credential_id, (SELECT count(*) FROM codes) AS recovery_count FROM registered`,
    [
      details.tokenId,
      challenge,
      details.userId,
      verification.registrationInfo.credential.id,
      Buffer.from(verification.registrationInfo.credential.publicKey).toString('base64url'),
      verification.registrationInfo.credential.counter,
      verification.registrationInfo.credentialDeviceType,
      verification.registrationInfo.credentialBackedUp,
      JSON.stringify(input.credential.response?.transports ?? []),
      recoveryCodes.map((code) => hashValue(code, config.payloadSecret)),
    ],
  )
  if (!consumed.rowCount) {
    throw new StaffEnrollmentError(
      'TOKEN_ALREADY_USED',
      'This enrollment invitation has already been used.',
    )
  }

  // Ensure canonical Member linkage and site roles
  const userDoc = (await payload.findByID({
    collection: 'users',
    id: details.userId,
    depth: 0,
    overrideAccess: true,
  })) as { id: string; email: string; role: string; member?: unknown }

  if (userDoc.role !== details.role) {
    await payload.update({
      collection: 'users',
      id: details.userId,
      data: { role: details.role as 'staff' | 'administrator' },
      overrideAccess: true,
    })
  }

  let memberId =
    typeof userDoc?.member === 'string'
      ? userDoc.member
      : (userDoc?.member as { id?: string } | undefined)?.id

  if (!memberId) {
    const memberRes = await payload.find({
      collection: 'members',
      where: { email: { equals: details.email } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    if (memberRes.docs.length > 0) {
      memberId = memberRes.docs[0].id
    } else {
      const created = await payload.create({
        collection: 'members',
        data: {
          email: details.email,
          displayName: details.email.split('@')[0],
          status: 'active',
        },
        overrideAccess: true,
      })
      memberId = created.id
    }
    await payload.update({
      collection: 'users',
      id: details.userId,
      data: { member: memberId },
      overrideAccess: true,
    })
  }

  if (details.siteId && memberId) {
    const roleCheck = await payload.find({
      collection: 'member-site-roles',
      where: {
        and: [{ site: { equals: details.siteId } }, { member: { equals: memberId } }],
      },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    const targetRole = details.role === 'administrator' ? 'community-manager' : 'contributor'
    if (!roleCheck.docs.length) {
      await payload.create({
        collection: 'member-site-roles',
        data: {
          site: details.siteId,
          member: memberId,
          role: targetRole,
        },
        overrideAccess: true,
      })
    } else if (roleCheck.docs[0].role !== targetRole) {
      await payload.update({
        collection: 'member-site-roles',
        id: roleCheck.docs[0].id,
        data: {
          role: targetRole,
        },
        overrideAccess: true,
      })
    }
    if (payload.collections?.['team-memberships']) {
      const teamCheck = await payload.find({
        collection: 'team-memberships',
        where: {
          and: [
            { scopeKey: { equals: 'site:' + details.siteId } },
            { member: { equals: memberId } },
          ],
        },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      if (!teamCheck.docs.length) {
        await payload.create({
          collection: 'team-memberships' as never,
          data: {
            scopeKey: 'site:' + details.siteId,
            scopeKind: 'site',
            site: details.siteId,
            member: memberId,
            role: details.role === 'administrator' ? 'administrator' : 'editor',
            status: 'active',
            grants: ['content.read', 'content.edit'],
          } as never,
          overrideAccess: true,
        })
      }
    }
  }

  // Audit completion
  await pool.query(
    `INSERT INTO admin_auth_audit_events (user_id, event, credential_id) VALUES ($1, $2, $3)`,
    [
      details.userId,
      'staff.passkey.enrollment.completed',
      verification.registrationInfo.credential.id,
    ],
  )

  return {
    status: 'enrolled',
    email: details.email,
    role: details.role,
    redirectUrl: '/login',
    recoveryCodes,
  }
}

/**
 * Revokes a pending staff invitation or removes a staff member.
 */
export async function revokeStaffInvitation(
  payload: Payload,
  config: AppConfig,
  input: {
    token?: string
    userId?: string
    email?: string
    requestedByUserId: string
  },
): Promise<{ status: string }> {
  const pool = getPool(payload)

  const caller = (await payload
    .findByID({
      collection: 'users',
      id: input.requestedByUserId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)) as { role?: string } | null

  if (caller?.role !== 'owner') {
    throw new StaffEnrollmentError('UNAUTHORIZED', 'Only owners can revoke staff invitations.')
  }

  if (input.token) {
    const tokenHash = hashValue(input.token.trim(), config.payloadSecret)
    await pool.query(
      `UPDATE identity_tokens
       SET consumed_at = now(), metadata = metadata || '{"revoked": true}'::jsonb, updated_at = now()
       WHERE token_hash = $1 AND consumed_at IS NULL`,
      [tokenHash],
    )
  }

  if (input.userId) {
    await pool.query(
      `UPDATE identity_tokens
       SET consumed_at = now(), metadata = metadata || '{"revoked": true}'::jsonb, updated_at = now()
       WHERE purpose = 'passkey-registration' AND (metadata->>'userId') = $1 AND consumed_at IS NULL`,
      [input.userId],
    )
    await pool.query(
      `UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [input.userId],
    )
  }

  if (input.email) {
    const emailHash = hashValue(input.email.trim().toLowerCase(), config.payloadSecret)
    await pool.query(
      `UPDATE identity_tokens
       SET consumed_at = now(), metadata = metadata || '{"revoked": true}'::jsonb, updated_at = now()
       WHERE purpose = 'passkey-registration' AND email_hash = $1 AND consumed_at IS NULL`,
      [emailHash],
    )
  }

  return { status: 'revoked' }
}
