import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: { id: 'owner-a', role: 'owner' },
  tokenSite: 'site-b',
  revoke: vi.fn(async () => ({ status: 'revoked' })),
}))

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth: async () => ({ user: mocks.user }),
    find: async () => ({ docs: [{ metadata: { siteId: mocks.tokenSite } }] }),
  }),
}))
vi.mock('@/modules/core/config', () => ({
  loadConfig: () => ({ payloadSecret: 'test-secret' }),
}))
vi.mock('@/modules/operations/operator-grants', () => ({
  resolveOperatorGrantContext: async () => ({
    authorized: true,
    isGlobalOwner: false,
    authorizedSiteIds: ['site-a'],
  }),
}))
vi.mock('@/modules/operations/staff-enrollment', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  revokeStaffInvitation: mocks.revoke,
}))

import { DELETE } from '@/app/(frontend)/api/admin/staff/invite/route'

function request(body: object) {
  return new Request('http://localhost/api/admin/staff/invite', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('staff invitation revocation boundary', () => {
  beforeEach(() => {
    mocks.tokenSite = 'site-b'
    mocks.revoke.mockClear()
  })

  it('denies a foreign-site token without mutating it', async () => {
    const response = await DELETE(request({ token: 'foreign-token' }))
    expect(response.status).toBe(403)
    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('allows revocation of a token in the owner site', async () => {
    mocks.tokenSite = 'site-a'
    const response = await DELETE(request({ token: 'own-token' }))
    expect(response.status).toBe(200)
    expect(mocks.revoke).toHaveBeenCalledOnce()
  })

  it('denies broad user and email revocation for a scoped owner', async () => {
    expect((await DELETE(request({ userId: 'user-b' }))).status).toBe(403)
    expect((await DELETE(request({ email: 'b@example.test' }))).status).toBe(403)
    expect(mocks.revoke).not.toHaveBeenCalled()
  })
})
