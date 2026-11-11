/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { POST } from '../../src/app/(frontend)/api/admin/social/accounts/route'

/**
 * TA-P0-1 regression: the social accounts `connect` action must not update
 * an account that belongs to a site the operator is not authorized for.
 * The grant check runs against the caller-supplied body.siteId, so an
 * accountId naming another tenant's account must be rejected against the
 * record's own site before any field — above all the stored credential
 * reference — is written.
 */

const foreignAccount = {
  id: 'acct-b',
  site: 'site-b',
  network: 'x',
  displayName: 'Site B X account',
  externalAccountId: 'site-b-x',
  actorType: 'site',
  capabilityState: 'available',
  credentialHealth: 'healthy',
  connectionReference: 'enc:site-b-original-credentials',
  lastVerifiedAt: '2026-09-24T18:00:00.000Z',
  diagnostics: { mode: 'live' },
}

const ownAccount = {
  ...foreignAccount,
  id: 'acct-a',
  site: 'site-a',
  displayName: 'Site A X account',
  externalAccountId: 'site-a-x',
  connectionReference: 'enc:site-a-original-credentials',
}

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(async () => ({ docs: [] })),
  findByID: vi.fn(async (args: any) => {
    if (args.collection !== 'social-accounts') return null
    if (String(args.id) === foreignAccount.id) return { ...foreignAccount }
    if (String(args.id) === ownAccount.id) return { ...ownAccount }
    return null
  }),
  create: vi.fn(async (args: any) => ({ id: 'created-1', ...args.data })),
  update: vi.fn(async (args: any) => ({ id: args.id, ...args.data })),
}

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => mockPayload),
}))

function connectRequest(body: unknown) {
  return new Request('http://localhost/api/admin/social/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const siteAOperator = {
  user: {
    id: 'op-a',
    email: 'a@example.com',
    role: 'administrator',
    authorizedSiteIds: ['site-a'],
  },
}

describe('Social accounts connect — tenant binding (TA-P0-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.auth.mockResolvedValue(siteAOperator)
    mockPayload.find.mockResolvedValue({ docs: [] })
  })

  it('rejects connect against another site’s account and writes nothing', async () => {
    const res = await POST(
      connectRequest({
        action: 'connect',
        accountId: foreignAccount.id,
        siteId: 'site-a',
        network: 'x',
        displayName: 'Hijacked account',
        credentials: { token: 'attacker-controlled-token' },
      }),
    )

    expect(res.status).toBe(403)
    expect(mockPayload.update).not.toHaveBeenCalled()
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it('still allows connect against the operator’s own site account', async () => {
    const res = await POST(
      connectRequest({
        action: 'connect',
        accountId: ownAccount.id,
        siteId: 'site-a',
        network: 'x',
        displayName: 'Site A X account',
        credentials: { token: 'fresh-token' },
      }),
    )

    expect(res.status).toBe(200)
    expect(mockPayload.update).toHaveBeenCalledTimes(1)
    const updateArgs = mockPayload.update.mock.calls[0][0] as any
    expect(String(updateArgs.id)).toBe(ownAccount.id)
    // The stored credential reference is rotated only for the own-site account.
    expect(updateArgs.data.connectionReference).toMatch(/^enc:/)
    expect(updateArgs.data.connectionReference).not.toContain('original')
  })

  it('still allows a global owner to connect a foreign account', async () => {
    mockPayload.auth.mockResolvedValue({
      user: {
        id: 'owner-1',
        email: 'owner@example.com',
        role: 'owner',
        isGlobalOwner: true,
        authorizedSiteIds: ['site-a', 'site-b'],
      },
    })

    const res = await POST(
      connectRequest({
        action: 'connect',
        accountId: foreignAccount.id,
        siteId: 'site-b',
        network: 'x',
        displayName: 'Site B X account',
        credentials: { token: 'owner-token' },
      }),
    )

    expect(res.status).toBe(200)
    expect(mockPayload.update).toHaveBeenCalledTimes(1)
  })
})
