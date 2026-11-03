import { describe, expect, it, vi } from 'vitest'

import { resolveOperatorGrantContext } from '@/modules/operations/operator-grants'
import { createPasskeyAuthStrategy, createPasskeySession } from '@/modules/operations/passkey-auth'

const secret = 'rc117a-isolated-unit-secret-with-more-than-48-characters'

describe('RC1 17A grant revocation is effective on re-resolution', () => {
  it('loses authorization on the next resolve after the last site grant row is removed', async () => {
    let grantRows: Array<Record<string, unknown>> = [
      { id: 'grant-1', member: 'member-1', site: 'site-a', role: 'contributor' },
    ]
    const payload = {
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'member-site-roles') return { docs: grantRows }
        if (collection === 'sites') return { docs: [{ id: 'site-a' }, { id: 'site-b' }] }
        return { docs: [] }
      }),
    } as never
    const user = { id: 'user-1', email: 'staff@17a.test', role: 'staff', member: 'member-1' }

    const before = await resolveOperatorGrantContext(payload, user)
    expect(before.authorized).toBe(true)
    expect(before.authorizedSiteIds).toEqual(['site-a'])

    grantRows = []
    const after = await resolveOperatorGrantContext(payload, user)
    expect(after.authorized).toBe(false)
    expect(after.authorizedSiteIds).toEqual([])
  })

  it('never authorizes a community-only member role as an operator grant', async () => {
    const payload = {
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'member-site-roles')
          return {
            docs: [{ id: 'grant-1', member: 'member-1', site: 'site-a', role: 'member' }],
          }
        if (collection === 'sites') return { docs: [{ id: 'site-a' }] }
        return { docs: [] }
      }),
    } as never
    const user = { id: 'user-1', email: 'staff@17a.test', role: 'staff', member: 'member-1' }
    const context = await resolveOperatorGrantContext(payload, user)
    expect(context.authorized).toBe(false)
  })
})

describe('RC1 17A passkey strategy hostile tokens', () => {
  const headersFor = (token: string) => new Headers({ cookie: `renegade-passkey=${token}` })

  it('rejects a live session whose account has been deleted', async () => {
    const { token } = await createPasskeySession(
      { id: 'user-gone', email: 'gone@17a.test' },
      secret,
    )
    const payload = {
      db: { pool: { query: vi.fn(async () => ({ rows: [{ id: 'session-1' }] })) } },
      findByID: vi.fn(async () => null),
    }
    const strategy = createPasskeyAuthStrategy(secret)
    expect(await strategy.authenticate({ headers: headersFor(token), payload } as never)).toEqual({
      user: null,
    })
  })

  it('rejects a token signed with an attacker secret even when a session row exists', async () => {
    const { token } = await createPasskeySession(
      { id: 'user-1', email: 'owner@17a.test' },
      'attacker-controlled-secret-that-is-long-enough-0123456789',
    )
    const findByID = vi.fn(async () => ({ id: 'user-1', email: 'owner@17a.test', role: 'owner' }))
    const payload = {
      db: { pool: { query: vi.fn(async () => ({ rows: [{ id: 'session-1' }] })) } },
      findByID,
    }
    const strategy = createPasskeyAuthStrategy(secret)
    expect(await strategy.authenticate({ headers: headersFor(token), payload } as never)).toEqual({
      user: null,
    })
    expect(findByID).not.toHaveBeenCalled()
  })
})
