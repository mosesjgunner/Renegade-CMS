import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import type { Payload } from 'payload'

import type { AppConfig } from '../core/config'
import { createPasskeySession } from './passkey-auth'
import {
  provisionOnboardingSite,
  validateOnboardingInput,
  type OnboardingInput,
} from './onboarding'

const bootstrapLifetimeMs = 15 * 60 * 1000
const recoveryCodeCount = 10

type SqlClient = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rowCount?: number | null; rows: T[] }>
  release: () => void
}

type SqlPool = {
  connect: () => Promise<SqlClient>
  query: SqlClient['query']
}

type InstallationRow = {
  state: 'incomplete' | 'installing' | 'complete'
  bootstrap_token_hash: string | null
  bootstrap_expires_at: Date | null
  registration_challenge: string | null
  registration_email: string | null
  registration_session_hash: string | null
}

export type InstallationStatus = {
  state: 'incomplete' | 'installing' | 'complete' | 'expired'
  ownerEmail?: string
}

export class InstallationError extends Error {
  constructor(
    readonly code:
      | 'INSTALLATION_COMPLETE'
      | 'INSTALLATION_EXPIRED'
      | 'INSTALLATION_IN_PROGRESS'
      | 'INSTALLATION_INVALID'
      | 'INSTALLATION_TOKEN_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'InstallationError'
  }
}

export async function ensureBootstrap(
  payload: Payload,
  config: AppConfig,
): Promise<InstallationStatus> {
  const pool = getPool(payload)
  const existing = await getState(pool)
  if (existing) return toStatus(existing)

  const token = createBootstrapToken()
  try {
    await pool.query(
      `INSERT INTO installation_state (singleton, state, bootstrap_token_hash, bootstrap_expires_at)
       VALUES (true, 'incomplete', $1, $2)`,
      [hashValue(token, config.payloadSecret), new Date(Date.now() + bootstrapLifetimeMs)],
    )
    announceBootstrapToken(token)
  } catch {
    // Another application process created the singleton row. Its token is the only valid one.
  }

  const state = await getState(pool)
  if (!state)
    throw new InstallationError('INSTALLATION_INVALID', 'Installation state is unavailable.')
  return toStatus(state)
}

export async function beginPasskeyRegistration(
  payload: Payload,
  config: AppConfig,
  input: { email: string; token: string },
) {
  const email = validateOwnerEmail(input.email, config.ownerEmail)
  const pool = getPool(payload)
  const state = await getRequiredOpenState(pool, config, input.token)
  const origin = new URL(config.appUrl)
  const options = await generateRegistrationOptions({
    rpID: origin.hostname,
    rpName: 'Renegade CMS',
    userID: Buffer.from(randomUUID()),
    userName: email,
    userDisplayName: email,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })

  const enrollmentToken = createBootstrapToken()
  const updated = await pool.query(
    `UPDATE installation_state
     SET state = 'installing', bootstrap_token_hash = NULL, registration_challenge = $1,
         registration_email = $2, registration_session_hash = $3, updated_at = now()
   WHERE singleton = true AND state = 'incomplete' AND bootstrap_token_hash = $4`,
    [
      options.challenge,
      email,
      hashValue(enrollmentToken, config.payloadSecret),
      state.bootstrap_token_hash,
    ],
  )
  if (!updated.rowCount) {
    throw new InstallationError(
      'INSTALLATION_IN_PROGRESS',
      'Setup requires local operator recovery.',
    )
  }
  return { enrollmentToken, options }
}

export async function completeInstallation(
  payload: Payload,
  config: AppConfig,
  input: {
    credential: RegistrationResponseJSON
    enrollmentToken: string
    onboarding: OnboardingInput
  },
): Promise<{
  recoveryCodes: string[]
  onboarding: {
    publicUrl: string
    adminUrl: string
    configuredCapabilities: string[]
    needsConfiguration: string[]
    availableLater: string[]
    systemHealth: string
  }
}> {
  const pool = getPool(payload)
  const state = await getRequiredEnrollmentState(pool, config, input.enrollmentToken)
  if (!state.registration_challenge || !state.registration_email) {
    throw new InstallationError(
      'INSTALLATION_INVALID',
      'Start passkey enrollment before completing setup.',
    )
  }

  const origin = new URL(config.appUrl)
  const verification = await verifyRegistrationResponse({
    response: input.credential,
    expectedChallenge: state.registration_challenge,
    expectedOrigin: config.appUrl,
    expectedRPID: origin.hostname,
    requireUserVerification: true,
  })
  if (!verification.verified) {
    throw new InstallationError('INSTALLATION_INVALID', 'Passkey enrollment could not be verified.')
  }

  const onboarding = validateOnboardingInput(input.onboarding)
  const provisioned = await provisionOnboardingSite(payload, state.registration_email, onboarding)
  const recoveryCodes = createRecoveryCodes()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const locked = await client.query<InstallationRow>(
      `SELECT state, bootstrap_token_hash, bootstrap_expires_at, registration_challenge,
              registration_email, registration_session_hash
       FROM installation_state WHERE singleton = true FOR UPDATE`,
    )
    const current = locked.rows[0]
    assertEnrollmentState(current, config, input.enrollmentToken)
    if (
      current.registration_challenge !== state.registration_challenge ||
      current.registration_email !== state.registration_email
    ) {
      throw new InstallationError(
        'INSTALLATION_IN_PROGRESS',
        'A newer enrollment request must be completed.',
      )
    }

    const owner = await client.query<{ id: string }>(
      `INSERT INTO users (email, role) VALUES ($1, 'owner') RETURNING id`,
      [current.registration_email],
    )
    const ownerId = owner.rows[0]?.id
    if (!ownerId)
      throw new InstallationError('INSTALLATION_INVALID', 'Owner creation did not return an ID.')

    await client.query(
      `INSERT INTO passkeys (user_id, credential_id, public_key, counter, device_type, backed_up)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ownerId,
        verification.registrationInfo.credential.id,
        Buffer.from(verification.registrationInfo.credential.publicKey).toString('base64url'),
        verification.registrationInfo.credential.counter,
        verification.registrationInfo.credentialDeviceType,
        verification.registrationInfo.credentialBackedUp,
      ],
    )
    for (const recoveryCode of recoveryCodes) {
      await client.query(`INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)`, [
        ownerId,
        hashValue(recoveryCode, config.payloadSecret),
      ])
    }
    await client.query(
      `UPDATE installation_state
       SET state = 'complete', bootstrap_token_hash = NULL, bootstrap_expires_at = NULL,
           registration_challenge = NULL, registration_email = NULL, registration_session_hash = NULL,
           owner_user_id = $1,
           completed_at = now(), updated_at = now()
       WHERE singleton = true`,
      [ownerId],
    )
    await client.query('COMMIT')
    return {
      recoveryCodes,
      onboarding: {
        publicUrl: onboarding.primaryUrl,
        adminUrl: new URL('/admin', onboarding.primaryUrl).toString(),
        configuredCapabilities: provisioned.configuredCapabilities,
        needsConfiguration: onboarding.optionalConnections,
        availableLater: ['email', 'ai', 'social', 'commerce', 'analytics', 'networking'].filter(
          (key) =>
            !onboarding.optionalConnections.includes(
              key as OnboardingInput['optionalConnections'][number],
            ),
        ),
        systemHealth:
          onboarding.featureProfile === 'Lean'
            ? 'Core publishing is ready. Worker-heavy optional features remain deferred.'
            : 'Core publishing and the standard operations profile are ready.',
      },
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function rotateBootstrapToken(payload: Payload, config: AppConfig): Promise<void> {
  const pool = getPool(payload)
  const existing = await getState(pool)
  if (!existing) {
    await ensureBootstrap(payload, config)
    return
  }
  if (existing.state === 'complete') {
    throw new InstallationError(
      'INSTALLATION_COMPLETE',
      'Completed installations cannot reopen setup.',
    )
  }
  const token = createBootstrapToken()
  await pool.query(
    `UPDATE installation_state
     SET state = 'incomplete', bootstrap_token_hash = $1, bootstrap_expires_at = $2,
       registration_challenge = NULL, registration_email = NULL, registration_session_hash = NULL,
       updated_at = now()
     WHERE singleton = true`,
    [hashValue(token, config.payloadSecret), new Date(Date.now() + bootstrapLifetimeMs)],
  )
  announceBootstrapToken(token)
}

export async function beginPasskeyAuthentication(payload: Payload, email: string) {
  const normalizedEmail = validateOwnerEmail(email)
  const pool = getPool(payload)
  const credentials = await pool.query<{ credential_id: string; user_id: string }>(
    `SELECT passkeys.credential_id, passkeys.user_id
     FROM passkeys INNER JOIN users ON users.id = passkeys.user_id
     WHERE users.email = $1`,
    [normalizedEmail],
  )
  if (!credentials.rows.length) {
    throw new InstallationError('INSTALLATION_INVALID', 'No passkey is registered for this owner.')
  }
  const options = await generateAuthenticationOptions({
    rpID: new URL(payload.config.serverURL ?? '').hostname,
    allowCredentials: credentials.rows.map(({ credential_id }) => ({ id: credential_id })),
    userVerification: 'required',
  })
  await pool.query(`UPDATE passkeys SET login_challenge = $1 WHERE user_id = $2`, [
    options.challenge,
    credentials.rows[0].user_id,
  ])
  return options
}

export async function completePasskeyAuthentication(
  payload: Payload,
  config: AppConfig,
  credential: AuthenticationResponseJSON,
): Promise<{ expirationSeconds: number; token: string }> {
  const pool = getPool(payload)
  const result = await pool.query<{
    backed_up: boolean
    counter: string
    credential_id: string
    email: string
    login_challenge: string | null
    public_key: string
    user_id: string
  }>(
    `SELECT passkeys.backed_up, passkeys.counter, passkeys.credential_id, passkeys.login_challenge,
            passkeys.public_key, passkeys.user_id, users.email
     FROM passkeys INNER JOIN users ON users.id = passkeys.user_id
     WHERE passkeys.credential_id = $1`,
    [credential.id],
  )
  const stored = result.rows[0]
  if (!stored?.login_challenge) {
    throw new InstallationError(
      'INSTALLATION_INVALID',
      'Start passkey sign-in before completing it.',
    )
  }
  const origin = new URL(config.appUrl)
  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge: stored.login_challenge,
    expectedOrigin: config.appUrl,
    expectedRPID: origin.hostname,
    credential: {
      id: stored.credential_id,
      publicKey: Buffer.from(stored.public_key, 'base64url'),
      counter: Number(stored.counter),
      transports: [],
    },
    requireUserVerification: true,
  })
  if (!verification.verified) {
    throw new InstallationError('INSTALLATION_INVALID', 'Passkey sign-in could not be verified.')
  }
  await pool.query(
    `UPDATE passkeys SET counter = $1, login_challenge = NULL WHERE credential_id = $2`,
    [verification.authenticationInfo.newCounter, stored.credential_id],
  )
  return createPasskeySession({ email: stored.email, id: stored.user_id }, config.payloadSecret)
}

function getPool(payload: Payload): SqlPool {
  const database = payload.db as typeof payload.db & { pool?: SqlPool }
  if (!database.pool)
    throw new InstallationError('INSTALLATION_INVALID', 'PostgreSQL is unavailable.')
  return database.pool
}

async function getState(pool: SqlPool): Promise<InstallationRow | undefined> {
  const result = await pool.query<InstallationRow>(
    `SELECT state, bootstrap_token_hash, bootstrap_expires_at, registration_challenge,
            registration_email, registration_session_hash
     FROM installation_state WHERE singleton = true`,
  )
  return result.rows[0]
}

async function getRequiredOpenState(
  pool: SqlPool,
  config: AppConfig,
  token: string,
): Promise<InstallationRow> {
  const state = await getState(pool)
  assertCurrentState(state, config, token)
  return state
}

function assertCurrentState(
  state: InstallationRow | undefined,
  config: AppConfig,
  token: string,
): asserts state is InstallationRow {
  if (!state || state.state === 'complete') {
    throw new InstallationError(
      'INSTALLATION_COMPLETE',
      'Setup is permanently disabled for this installation.',
    )
  }
  if (state.state === 'installing') {
    throw new InstallationError(
      'INSTALLATION_IN_PROGRESS',
      'Setup requires local operator recovery.',
    )
  }
  if (!state.bootstrap_expires_at || state.bootstrap_expires_at.getTime() <= Date.now()) {
    throw new InstallationError(
      'INSTALLATION_EXPIRED',
      'The bootstrap token expired. Run local recovery.',
    )
  }
  if (
    !state.bootstrap_token_hash ||
    !safeEqual(hashValue(token, config.payloadSecret), state.bootstrap_token_hash)
  ) {
    throw new InstallationError('INSTALLATION_TOKEN_INVALID', 'The bootstrap token is invalid.')
  }
}

function toStatus(state: InstallationRow): InstallationStatus {
  if (
    state.state === 'incomplete' &&
    (!state.bootstrap_expires_at || state.bootstrap_expires_at <= new Date())
  ) {
    return { state: 'expired' }
  }
  return { state: state.state, ownerEmail: state.registration_email ?? undefined }
}

function validateOwnerEmail(value: string, configuredOwner?: string): string {
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InstallationError('INSTALLATION_INVALID', 'Enter a valid owner email address.')
  }
  if (configuredOwner && email !== configuredOwner) {
    throw new InstallationError(
      'INSTALLATION_INVALID',
      'The owner email does not match OWNER_EMAIL.',
    )
  }
  return email
}

function createBootstrapToken(): string {
  return randomBytes(32).toString('base64url')
}

function createRecoveryCodes(): string[] {
  return Array.from({ length: recoveryCodeCount }, () =>
    randomBytes(10).toString('hex').toUpperCase(),
  )
}

function hashValue(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function announceBootstrapToken(token: string): void {
  console.warn(`Renegade CMS setup token (expires in 15 minutes; use once): ${token}`)
}

async function getRequiredEnrollmentState(
  pool: SqlPool,
  config: AppConfig,
  enrollmentToken: string,
): Promise<InstallationRow> {
  const state = await getState(pool)
  assertEnrollmentState(state, config, enrollmentToken)
  return state
}

function assertEnrollmentState(
  state: InstallationRow | undefined,
  config: AppConfig,
  enrollmentToken: string,
): asserts state is InstallationRow {
  if (!state || state.state === 'complete') {
    throw new InstallationError(
      'INSTALLATION_COMPLETE',
      'Setup is permanently disabled for this installation.',
    )
  }
  if (state.state !== 'installing') {
    throw new InstallationError(
      'INSTALLATION_INVALID',
      'Start passkey enrollment before completing setup.',
    )
  }
  if (!state.bootstrap_expires_at || state.bootstrap_expires_at.getTime() <= Date.now()) {
    throw new InstallationError(
      'INSTALLATION_EXPIRED',
      'The enrollment session expired. Run local recovery.',
    )
  }
  if (
    !state.registration_session_hash ||
    !safeEqual(hashValue(enrollmentToken, config.payloadSecret), state.registration_session_hash)
  ) {
    throw new InstallationError('INSTALLATION_TOKEN_INVALID', 'The enrollment session is invalid.')
  }
}
