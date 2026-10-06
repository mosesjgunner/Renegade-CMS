import { SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'

import { createUsersCollection } from '../../src/collections/Users'
import {
  createPasskeyAuthStrategy,
  createPasskeySession,
  requireAdminUser,
} from '../../src/modules/operations/passkey-auth'

const secret = 'rc06-isolated-unit-secret-with-more-than-48-characters'
const headersFor = (token: string) => new Headers({ cookie: `renegade-passkey=${token}` })

describe('RC06 admin session attacks', () => {
  it.each(['owner', 'administrator', 'staff'])(
    'reads current %s authority from the account',
    async (role) => {
      const { token } = await createPasskeySession(
        { id: 'owner-1', email: 'owner@example.test' },
        secret,
      )
      const findByID = vi.fn(async () => ({ id: 'owner-1', email: 'owner@example.test', role }))
      const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
        rows: [{ id: 'session-1' }],
      }))
      const result = await requireAdminUser(
        { db: { pool: { query } }, findByID },
        secret,
        headersFor(token),
      )
      expect(result.role).toBe(role)
      expect(query.mock.calls[0][0]).toContain('revoked_at IS NULL AND expires_at > now()')
    },
  )

  it('denies a correctly signed cookie when the persisted session has been revoked or expired', async () => {
    const { token } = await createPasskeySession(
      { id: 'owner-1', email: 'owner@example.test' },
      secret,
    )
    const findByID = vi.fn()
    const payload = { db: { pool: { query: vi.fn(async () => ({ rows: [] })) } }, findByID }
    await expect(requireAdminUser(payload, secret, headersFor(token))).rejects.toThrow('expired')
    expect(findByID).not.toHaveBeenCalled()
    const strategy = createPasskeyAuthStrategy(secret)
    expect(await strategy.authenticate({ headers: headersFor(token), payload } as never)).toEqual({
      user: null,
    })
  })

  it('denies forged, expired, wrong-collection and missing-session cookies before database access', async () => {
    const query = vi.fn()
    const payload = { db: { pool: { query } }, findByID: vi.fn() }
    for (const claims of [
      { id: 'owner-1', sid: 'session-1', collection: 'members' },
      { id: 'owner-1', collection: 'users' },
      { id: 'owner-1', sid: 'session-1', collection: 'users', exp: 1 },
    ]) {
      const token = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode(secret))
      await expect(requireAdminUser(payload, secret, headersFor(token))).rejects.toThrow()
    }
    const forged = await new SignJWT({ id: 'owner-1', sid: 'session-1', collection: 'users' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('attacker-secret'))
    await expect(requireAdminUser(payload, secret, headersFor(forged))).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })

  it('executes the installed Payload unlock guard before any database mutation', async () => {
    // Exercise the vulnerable upstream operation itself, rather than just checking config.
    const { unlockOperation } = await import(
      '../../node_modules/payload/dist/auth/operations/unlock.js'
    )
    const users = createUsersCollection({ payloadSecret: secret, secureCookies: true })
    await expect(
      unlockOperation({
        collection: {
          config: { ...users, auth: { ...(users.auth as object), loginWithUsername: false } },
        },
        data: { email: 'another-owner@example.test' },
        req: { user: { role: 'staff' }, t: (key: string) => key },
      } as never),
    ).rejects.toMatchObject({ status: 403 })
  })
})
