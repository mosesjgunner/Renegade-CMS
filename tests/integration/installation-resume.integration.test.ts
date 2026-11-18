import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { loadConfig } from '../../src/modules/core/config'
import {
  authenticateWithRecoveryCode,
  beginPasskeyRegistration,
  ensureBootstrap,
  rotateOwnRecoveryCodes,
} from '../../src/modules/operations/installation'
import { createPasskeySession } from '../../src/modules/operations/passkey-auth'

// UXI-05 regression coverage: a cancelled passkey prompt (or a refresh
// mid-enrollment) must never strand setup behind local operator recovery,
// and an owner who loses the setup-completion response must be able to
// rotate a fresh recovery kit in-product. Before this pass, any second
// beginPasskeyRegistration call rejected with INSTALLATION_IN_PROGRESS and
// recovery-code rotation existed only as a local CLI operation.

let payload: Payload
let token = ''

beforeEach(async () => {
  payload = await getPayload({ config })
  await payload.db.pool.query('DELETE FROM installation_state')
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const status = await ensureBootstrap(payload, loadConfig())
  expect(status.state).toBe('incomplete')
  token = consoleWarn.mock.calls[0]?.[0].match(/: ([A-Za-z0-9_-]+)$/)?.[1] ?? ''
  expect(token).toHaveLength(43)
  consoleWarn.mockRestore()
})

afterEach(async () => {
  await payload.db.pool.query('DELETE FROM installation_state')
})

afterAll(async () => {
  await payload?.db.destroy?.()
})

describe('enrollment resume after a cancelled passkey prompt', () => {
  it('resumes with the enrollment session, rotating challenge and session token', async () => {
    const first = await beginPasskeyRegistration(payload, loadConfig(), {
      email: 'owner@example.test',
      token,
    })
    expect(first.enrollmentToken).toBeTruthy()

    // The consumed bootstrap token alone must still not reopen enrollment.
    await expect(
      beginPasskeyRegistration(payload, loadConfig(), { email: 'owner@example.test', token }),
    ).rejects.toMatchObject({ code: 'INSTALLATION_IN_PROGRESS' })

    // The same browser (enrollment cookie) resumes: fresh challenge + session.
    const resumed = await beginPasskeyRegistration(payload, loadConfig(), {
      email: 'owner@example.test',
      token: '',
      enrollmentToken: first.enrollmentToken,
    })
    expect(resumed.enrollmentToken).toBeTruthy()
    expect(resumed.enrollmentToken).not.toBe(first.enrollmentToken)
    expect(resumed.options.challenge).not.toBe(first.options.challenge)

    // The rotated-out enrollment session is dead.
    await expect(
      beginPasskeyRegistration(payload, loadConfig(), {
        email: 'owner@example.test',
        token: '',
        enrollmentToken: first.enrollmentToken,
      }),
    ).rejects.toMatchObject({ code: 'INSTALLATION_IN_PROGRESS' })

    const status = await ensureBootstrap(payload, loadConfig())
    expect(status).toMatchObject({ state: 'installing', ownerEmail: 'owner@example.test' })
  })

  it('rejects resume with a foreign enrollment session', async () => {
    await beginPasskeyRegistration(payload, loadConfig(), {
      email: 'owner@example.test',
      token,
    })

    await expect(
      beginPasskeyRegistration(payload, loadConfig(), {
        email: 'owner@example.test',
        token: '',
        enrollmentToken: 'forged-enrollment-token',
      }),
    ).rejects.toMatchObject({ code: 'INSTALLATION_IN_PROGRESS' })

    // No enrollment token at all is also not a resume.
    await expect(
      beginPasskeyRegistration(payload, loadConfig(), { email: 'owner@example.test', token: '' }),
    ).rejects.toMatchObject({ code: 'INSTALLATION_IN_PROGRESS' })
  })

  it('rejects resume for a different email and after the enrollment expires', async () => {
    const first = await beginPasskeyRegistration(payload, loadConfig(), {
      email: 'owner@example.test',
      token,
    })

    await expect(
      beginPasskeyRegistration(payload, loadConfig(), {
        email: 'someone-else@example.test',
        token: '',
        enrollmentToken: first.enrollmentToken,
      }),
    ).rejects.toMatchObject({ code: 'INSTALLATION_INVALID' })

    await payload.db.pool.query(
      `UPDATE installation_state SET bootstrap_expires_at = now() - interval '1 second'
       WHERE singleton = true`,
    )
    await expect(
      beginPasskeyRegistration(payload, loadConfig(), {
        email: 'owner@example.test',
        token: '',
        enrollmentToken: first.enrollmentToken,
      }),
    ).rejects.toMatchObject({ code: 'INSTALLATION_EXPIRED' })
  })
})

describe('in-product recovery code rotation', () => {
  async function ownerSession(email: string) {
    const pool = payload.db.pool
    const userRes = await pool.query(
      `INSERT INTO users (email, role) VALUES ($1, 'owner') RETURNING id`,
      [email],
    )
    const userId = userRes.rows[0].id as string
    const session = await createPasskeySession(
      { email, id: userId },
      loadConfig().payloadSecret,
      async (id, expiresAt) => {
        await pool.query(
          `INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
          [id, userId, expiresAt],
        )
      },
    )
    const headers = new Headers({ cookie: `renegade-passkey=${session.token}` })
    return { userId, headers, sessionId: session.sessionId }
  }

  it('rotates codes for the signed-in owner: old codes die, new codes sign in, other sessions revoke', async () => {
    const pool = payload.db.pool
    const runtime = loadConfig()
    const email = `rotate-${randomUUID().slice(0, 8)}@owner.test`
    const { userId, headers, sessionId } = await ownerSession(email)

    const oldCode = 'A'.repeat(20)
    const oldHash = createHmac('sha256', runtime.payloadSecret).update(oldCode).digest('hex')
    await pool.query(`INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)`, [
      userId,
      oldHash,
    ])

    // A second live session for the same owner (e.g. another device).
    const other = await createPasskeySession({ email, id: userId }, runtime.payloadSecret, async (id, expiresAt) => {
      await pool.query(`INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`, [
        id,
        userId,
        expiresAt,
      ])
    })

    const result = await rotateOwnRecoveryCodes(payload, runtime, headers)
    expect(result.recoveryCodes).toHaveLength(10)

    // The pre-rotation code no longer authenticates.
    await expect(
      authenticateWithRecoveryCode(payload, runtime, { email, recoveryCode: oldCode }),
    ).rejects.toThrow('Invalid or already used recovery code.')

    // A rotated code does authenticate (and burns single-use).
    const fresh = await authenticateWithRecoveryCode(payload, runtime, {
      email,
      recoveryCode: result.recoveryCodes[0],
    })
    expect(fresh.token).toBeTruthy()

    // Other sessions revoked; the rotating session survives.
    const sessions = await pool.query<{ id: string; revoked_at: Date | null }>(
      `SELECT id, revoked_at FROM admin_sessions WHERE user_id = $1`,
      [userId],
    )
    const byId = new Map(sessions.rows.map((row) => [row.id, row.revoked_at]))
    expect(byId.get(other.sessionId)).not.toBeNull()
    expect(byId.get(sessionId)).toBeNull()
  })

  it('refuses rotation for a non-owner admin', async () => {
    const pool = payload.db.pool
    const email = `admin-${randomUUID().slice(0, 8)}@owner.test`
    const userRes = await pool.query(
      `INSERT INTO users (email, role) VALUES ($1, 'administrator') RETURNING id`,
      [email],
    )
    const userId = userRes.rows[0].id as string
    const session = await createPasskeySession(
      { email, id: userId },
      loadConfig().payloadSecret,
      async (id, expiresAt) => {
        await pool.query(
          `INSERT INTO admin_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
          [id, userId, expiresAt],
        )
      },
    )
    const headers = new Headers({ cookie: `renegade-passkey=${session.token}` })
    await expect(rotateOwnRecoveryCodes(payload, loadConfig(), headers)).rejects.toMatchObject({
      code: 'INSTALLATION_INVALID',
    })
  })
})
